"""Moodle Web Services integration via the mobile-launch flow.

- Connection happens via Moodle's `tool_mobile/launch.php` endpoint.
  StudyPartner sends the user there with a passport + return URL; the
  user signs in via the school's existing SSO (Microsoft/SAML/OIDC);
  Moodle redirects back with a base64 token blob; we decode + store it.
- Sync fetches courses → modules, assignments → assessments, and
  resource METADATA only — file bytes are pulled later, only for
  resources the user has flagged for AI processing.
- Stored tokens are encrypted at rest with Fernet (AES-128-CBC + HMAC,
  via the `cryptography` package). The key is read from
  STUDYPARTNER_FERNET_KEY at first use; missing key raises immediately.
  Generate one with: `python -m app.src.utils.crypto generate-key`.
"""
from __future__ import annotations

import base64
import binascii
from datetime import date, datetime, timedelta
import hashlib
import json
import logging
import os
import re
import secrets
from typing import Any
import urllib.parse
import urllib.request

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

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
    consume_launch_passport,
    get_moodle_account_raw,
    list_resources_pending_ingest,
    mark_resource_ingested,
    purge_expired_launch_passports,
    save_launch_passport,
    save_moodle_account,
    update_moodle_sync_time,
    upsert_moodle_resources,
)


LAUNCH_PASSPORT_TTL = timedelta(minutes=10)
LAUNCH_SERVICE = "moodle_mobile_app"

# RFC 3986 URI-scheme grammar: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ).
# Moodle's tool_mobile/launch.php enforces exactly this on the `urlscheme`
# parameter and rejects anything else (including `https://...` URLs) with
# "Invalid parameter: the value of urlscheme isn't valid". We validate
# here so the caller gets a clean error before we round-trip through Moodle.
URLSCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9.+\-]*$")


# ---- Token encryption (Fernet at rest) ----

_FERNET: Fernet | None = None


def _fernet() -> Fernet:
    """Lazy-init the Fernet cipher. Fails clearly if the key is missing."""
    global _FERNET
    if _FERNET is None:
        key = os.environ.get("STUDYPARTNER_FERNET_KEY")
        if not key:
            raise RuntimeError(
                "STUDYPARTNER_FERNET_KEY is not set. Generate one with "
                "`python -m app.src.utils.crypto generate-key` and export it "
                "before storing or reading Moodle WS tokens."
            )
        try:
            _FERNET = Fernet(key.encode("utf-8") if isinstance(key, str) else key)
        except (ValueError, TypeError) as exc:
            raise RuntimeError(
                "STUDYPARTNER_FERNET_KEY is malformed. It must be a 32-byte "
                "url-safe base64 string (44 chars, ending with '=')."
            ) from exc
    return _FERNET


def encrypt_token(token: str) -> bytes:
    return _fernet().encrypt(token.encode("utf-8"))


def decrypt_token(blob: bytes) -> str:
    try:
        return _fernet().decrypt(blob).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError(
            "Stored Moodle WS token could not be decrypted. Either the key "
            "rotated, or this row predates the Fernet migration. Affected "
            "user must reconnect their Moodle account."
        ) from exc


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


# ---- Mobile-launch connection flow ----

def build_launch_url(user_id: str, base_url: str, urlscheme: str) -> dict:
    """Begin the Moodle mobile-launch handshake.

    Returns the URL the browser should navigate to plus the passport we'll
    expect back. The passport is stored server-side keyed by user_id and
    expires in 10 minutes; that is our CSRF guard.

    `urlscheme` must be a bare URI-scheme name like ``studypartner``. Moodle
    builds the redirect target as ``<urlscheme>://token=<blob>``, so the
    caller's job is to ship a native app (Capacitor, etc.) that registers
    the same scheme at the OS level so the redirect lands back in-app. A
    full ``https://...`` URL is rejected by Moodle's tool_mobile (RFC 3986
    scheme grammar); we validate here to fail fast with a clear error.
    """
    if not URLSCHEME_RE.match(urlscheme):
        raise MoodleError(
            "urlscheme must be a bare URI-scheme name (letters, digits, '.', '+', '-'; "
            "first char a letter). Moodle rejects full URLs here."
        )
    purge_expired_launch_passports(utcnow_aware())
    passport = secrets.token_urlsafe(16)
    now = utcnow_aware()
    save_launch_passport(passport, user_id, base_url.rstrip("/"), now, now + LAUNCH_PASSPORT_TTL)
    params = {
        "service": LAUNCH_SERVICE,
        "passport": passport,
        "urlscheme": urlscheme,
    }
    launch_url = f"{base_url.rstrip('/')}/admin/tool/mobile/launch.php?{urllib.parse.urlencode(params)}"
    return {"launch_url": launch_url, "passport": passport}


def accept_launch_token(passport: str, encoded_token: str) -> dict:
    """Process the token blob Moodle hands back at the end of the launch
    redirect chain.

    Moodle returns a base64 string that decodes to
    `<signature>:::<token>:::<privatetoken>` where signature is
    `md5(siteid + passport)`. We:
      1. Look up the passport (CSRF check + bind to a user_id).
      2. Decode the blob.
      3. Use the WS token to call `core_webservice_get_site_info` —
         this gives us the siteid we need to verify the signature, AND
         doubles as a token validity check.
      4. Verify the signature matches.
      5. Persist the token against the user.
    """
    record = consume_launch_passport(passport, utcnow_aware())
    if not record:
        raise MoodleError("Invalid or expired passport")
    user_id, base_url = record

    try:
        raw = base64.b64decode(encoded_token, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise MoodleError("Malformed token blob") from exc

    parts = raw.split(":::")
    if len(parts) < 2:
        raise MoodleError("Unexpected token blob format")
    signature, token = parts[0], parts[1]

    info = _ws_call(base_url, token, "core_webservice_get_site_info")
    if not isinstance(info, dict) or "userid" not in info:
        raise MoodleError("Token rejected by Moodle")

    siteid = str(info.get("siteid") or info.get("userid"))
    expected = hashlib.md5(f"{siteid}{passport}".encode("utf-8")).hexdigest()
    if not secrets.compare_digest(expected, signature):
        raise MoodleError("Token signature mismatch — possible CSRF / replay")

    save_moodle_account(
        MoodleAccount(user_id=user_id, base_url=base_url, token=token, last_sync=None),
        encrypt_token(token),
    )
    return {
        "user_id": user_id,
        "sitename": info.get("sitename"),
        "moodle_user_id": info.get("userid"),
    }


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
        except MoodleError as exc:
            logger.warning("Failed to fetch contents for course %s: %s", c["id"], exc)
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
                            filename=f.get("filename"),
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
            except Exception as exc:
                logger.warning("Skipped assessment moodle-a-%s: %s", a.get("id"), exc)
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


def _filename_for_ingest(r: MoodleResource) -> str | None:
    """Return a filename whose extension reflects the underlying file.

    Order of preference:
      1. The `filename` column populated from Moodle's WS response — this
         is the actual file name (`study-guide.pdf`) and is authoritative.
      2. The last path segment of the resource URL — Moodle file URLs
         follow `…/pluginfile.php/<ctx>/mod_resource/content/<rev>/<file>`
         so the trailing segment is the real filename. Picked apart with
         `urllib.parse.urlsplit` so query params don't pollute it.
      3. None — caller treats this as unsupported and skips with reason.

    Returns only filenames whose extension is supported by the ingestion
    pipeline (.pdf/.docx/.txt). Anything else is rejected here so the
    caller can produce a clean `skipped` reason instead of a low-level
    extraction error.
    """
    candidates: list[str] = []
    if r.filename:
        candidates.append(r.filename)
    if r.url:
        path = urllib.parse.urlsplit(r.url).path
        last = urllib.parse.unquote(path.rsplit("/", 1)[-1]) if path else ""
        if last:
            candidates.append(last)
    for name in candidates:
        if name.lower().endswith((".pdf", ".docx", ".txt")):
            return name
    return None


def ingest_selected_materials(user_id: str) -> dict:
    """Download and ingest every resource the user flagged for AI.

    Idempotent — resources already marked `ingested_at` are skipped on
    re-runs. Failures on individual resources don't abort the batch;
    they're collected in `skipped` so the UI can show what didn't make it.

    Critical: the underlying ingestion pipeline picks its parser by
    file extension. The Moodle activity *title* is the display name
    (e.g. "Study Guide") and frequently lacks an extension, so we must
    use the actual filename — either the one Moodle's WS API returned
    (preferred) or the last path segment of the file URL.
    """
    from app.src.models.services.ingestion_service import ingest_moodle_resource
    from app.storage import get_user

    user = get_user(user_id)
    if not user:
        raise MoodleError("Unknown user")
    pending = list_resources_pending_ingest(user_id)
    ingested: list[str] = []
    skipped: list[dict] = []

    for r in pending:
        if not r.url:
            skipped.append({"id": r.id, "reason": "no url"})
            continue
        filename = _filename_for_ingest(r)
        if not filename:
            skipped.append({"id": r.id, "reason": "unsupported file type"})
            continue
        try:
            content = fetch_resource_bytes(user_id, r.url)
        except MoodleError as exc:
            skipped.append({"id": r.id, "reason": str(exc)})
            continue
        try:
            ingest_moodle_resource(
                user=user,
                module_id=r.module_id,
                module_name=r.module_id,
                module_type=ModuleType.semester,
                resource_title=r.title,
                resource_content=content,
                resource_filename=filename,
            )
            mark_resource_ingested(r.id, utcnow_aware())
            ingested.append(r.id)
        except Exception as exc:
            logger.warning("Failed to ingest resource %s: %s", r.id, exc)
            skipped.append({"id": r.id, "reason": f"ingest failed: {exc}"})

    return {"ingested": ingested, "skipped": skipped, "count": len(ingested)}


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
        except Exception as exc:
            logger.warning("Skipped ICS event %s: %s", uid, exc)
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


