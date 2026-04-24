"""Moodle Web Services integration (primary) + ICS calendar import (fallback).

- Uses stdlib urllib (no new deps).
- Fetches courses, assignments, and resource metadata ONLY.
- Does NOT download file contents during sync — lazy fetch on explicit user action.
- Token is stored using a light base64 envelope. For production, replace
  `encrypt_token` / `decrypt_token` with Fernet (cryptography package).
"""
from __future__ import annotations

import base64
from datetime import date, datetime
import json
import re
from typing import Any
import urllib.parse
import urllib.request

from app.src.utils.time import utcnow_aware

from app.src.models import (
    Assessment,
    AssessmentStatus,
    Module,
    ModuleType,
    MoodleAccount,
    MoodleResource,
)
from app.storage import (
    add_assessment,
    add_module,
    get_moodle_account_raw,
    save_moodle_account,
    update_moodle_sync_time,
    upsert_moodle_resources,
)


# ---- Token envelope (swap for Fernet in production) ----

def encrypt_token(token: str) -> bytes:
    return base64.b64encode(token.encode("utf-8"))


def decrypt_token(blob: bytes) -> str:
    return base64.b64decode(blob).decode("utf-8")


def get_account(user_id: str) -> MoodleAccount | None:
    raw = get_moodle_account_raw(user_id)
    if not raw:
        return None
    base_url, token_enc, last_sync = raw
    return MoodleAccount(
        user_id=user_id,
        base_url=base_url,
        token=decrypt_token(token_enc),
        last_sync=datetime.fromisoformat(last_sync) if last_sync else None,
    )


# ---- Moodle WS client ----

class MoodleError(Exception):
    pass


def _ws_call(base_url: str, token: str, function: str, params: dict[str, Any] | None = None) -> Any:
    url = base_url.rstrip("/") + "/webservice/rest/server.php"
    body = {
        "wstoken": token,
        "wsfunction": function,
        "moodlewsrestformat": "json",
        **(_flatten(params) if params else {}),
    }
    data = urllib.parse.urlencode(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as exc:
        raise MoodleError(f"Moodle request failed: {exc}") from exc

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MoodleError("Moodle returned non-JSON") from exc

    if isinstance(result, dict) and result.get("exception"):
        raise MoodleError(f"{result.get('errorcode')}: {result.get('message')}")
    return result


def _flatten(params: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    """Moodle WS expects PHP-style flat params: options[0][name]=foo&options[0][value]=1."""
    out: dict[str, Any] = {}
    for k, v in params.items():
        key = f"{prefix}[{k}]" if prefix else str(k)
        if isinstance(v, dict):
            out.update(_flatten(v, key))
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    out.update(_flatten(item, f"{key}[{i}]"))
                else:
                    out[f"{key}[{i}]"] = item
        else:
            out[key] = v
    return out


# ---- Public operations ----

def connect(user_id: str, base_url: str, token: str) -> dict:
    """Verify the token by calling `core_webservice_get_site_info`, then store."""
    info = _ws_call(base_url, token, "core_webservice_get_site_info")
    if not isinstance(info, dict) or "userid" not in info:
        raise MoodleError("Invalid site-info response")
    save_moodle_account(
        MoodleAccount(user_id=user_id, base_url=base_url, token=token, last_sync=None),
        encrypt_token(token),
    )
    return {"sitename": info.get("sitename"), "moodle_user_id": info.get("userid")}


def sync(user_id: str) -> dict:
    """Pull courses → modules, assignments → assessments, resources metadata.

    Metadata-only; no file downloads.
    """
    account = get_account(user_id)
    if not account:
        raise MoodleError("No Moodle account connected")

    site_info = _ws_call(account.base_url, account.token, "core_webservice_get_site_info")
    moodle_uid = site_info["userid"]

    courses = _ws_call(
        account.base_url, account.token, "core_enrol_get_users_courses", {"userid": moodle_uid}
    )
    modules_added: list[str] = []
    for c in courses:
        mod_id = f"moodle-{c['id']}"
        add_module(
            Module(
                id=mod_id,
                user_id=user_id,
                name=c.get("shortname") or c.get("fullname") or f"Course {c['id']}",
                module_type=ModuleType.semester,
            )
        )
        modules_added.append(mod_id)

        # Resource metadata
        try:
            contents = _ws_call(
                account.base_url, account.token, "core_course_get_contents", {"courseid": c["id"]}
            )
        except MoodleError:
            contents = []

        resources: list[MoodleResource] = []
        for section in contents:
            for mod in section.get("modules", []):
                for f in mod.get("contents", []) or []:
                    if f.get("type") != "file":
                        continue
                    resources.append(
                        MoodleResource(
                            id=f"moodle-{c['id']}-{mod['id']}-{f.get('filename','')}",
                            module_id=mod_id,
                            title=mod.get("name", f.get("filename", "resource")),
                            type=mod.get("modname", "resource"),
                            file_size=f.get("filesize"),
                            url=f.get("fileurl"),
                        )
                    )
        upsert_moodle_resources(resources)

    # Assignments → assessments
    assignments_resp = _ws_call(
        account.base_url,
        account.token,
        "mod_assign_get_assignments",
        {"courseids": [c["id"] for c in courses]},
    )
    assessments_added = 0
    for course in assignments_resp.get("courses", []):
        mod_id = f"moodle-{course['id']}"
        for a in course.get("assignments", []):
            due = a.get("duedate") or 0
            if due <= 0:
                continue
            try:
                add_assessment(
                    Assessment(
                        id=f"moodle-a-{a['id']}",
                        module_id=mod_id,
                        title=a.get("name", f"Assignment {a['id']}"),
                        due_date=date.fromtimestamp(due),
                        weight=1.0,
                        status=AssessmentStatus.open,
                        moodle_id=str(a["id"]),
                    )
                )
                assessments_added += 1
            except Exception:
                # Duplicate inserts / already-present assessments are ignored
                continue

    now = utcnow_aware()
    update_moodle_sync_time(user_id, now)
    return {
        "modules_synced": len(modules_added),
        "assessments_synced": assessments_added,
        "last_sync": now.isoformat(),
    }


def fetch_resource_bytes(user_id: str, url: str) -> bytes:
    """Lazy download of a single resource, only on explicit user action."""
    account = get_account(user_id)
    if not account:
        raise MoodleError("No Moodle account connected")
    sep = "&" if "?" in url else "?"
    full = f"{url}{sep}token={urllib.parse.quote(account.token)}"
    try:
        with urllib.request.urlopen(full, timeout=30) as resp:
            return resp.read()
    except Exception as exc:
        raise MoodleError(f"Resource fetch failed: {exc}") from exc


# ---- ICS fallback ----

def import_ics(user_id: str, ics_text: str) -> dict:
    """Minimal ICS parser for deadlines only. Extracts VEVENT DTSTART + SUMMARY."""
    blocks = re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", ics_text, re.DOTALL)
    added = 0
    for block in blocks:
        summary = _ics_field(block, "SUMMARY")
        dtstart = _ics_field(block, "DTSTART")
        uid = _ics_field(block, "UID") or f"ics-{added}"
        if not summary or not dtstart:
            continue
        due = _parse_ics_date(dtstart)
        if not due:
            continue
        try:
            add_assessment(
                Assessment(
                    id=f"ics-{uid}",
                    module_id="ics-inbox",
                    title=summary,
                    due_date=due,
                    weight=1.0,
                )
            )
            added += 1
        except Exception:
            continue
    return {"events_imported": added}


def _ics_field(block: str, name: str) -> str | None:
    m = re.search(rf"^{name}(?:;[^:]*)?:(.+)$", block, re.MULTILINE)
    return m.group(1).strip() if m else None


def _parse_ics_date(raw: str) -> date | None:
    raw = raw.strip()
    # DATE form: YYYYMMDD
    if len(raw) >= 8 and raw[:8].isdigit():
        try:
            return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
        except ValueError:
            return None
    return None


