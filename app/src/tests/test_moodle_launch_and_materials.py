"""Tests for the Moodle mobile-launch flow and per-file material selection.

The launch flow looks like:
    1. POST /moodle/launch     → returns { launch_url, passport }
    2. (browser visits launch_url, signs in via SSO, Moodle redirects
        back to the urlscheme with `token=<base64>`)
    3. POST /moodle/launch/callback { passport, token }
       → backend decodes blob, verifies signature, stores WS token

We don't have a real Moodle to talk to, so the integration is exercised
by monkey-patching `_ws_call` to return a stubbed site-info response.
"""
from __future__ import annotations

import base64
import hashlib

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import Module, ModuleType, MoodleResource
from app.src.models.services import moodle_service
from app.storage import (
    DB_PATH,
    add_module,
    init_db,
    list_moodle_resources_with_selection,
    upsert_moodle_resources,
)


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client: TestClient, email: str = "10520467@mylife.unisa.ac.za") -> tuple[str, str]:
    r = client.post(
        "/users/register",
        json={
            "name": "Test Student",
            "email": email,
            "password": "correct-horse-battery-staple",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user_id"]


def test_launch_returns_url_and_passport():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "urlscheme": "https://app.example.com/moodle/callback?",
            "base_url": "https://lms.unisa.ac.za",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["passport"]
    assert body["launch_url"].startswith(
        "https://lms.unisa.ac.za/admin/tool/mobile/launch.php?"
    )
    assert body["passport"] in body["launch_url"]
    assert "service=moodle_mobile_app" in body["launch_url"]
    assert "urlscheme=https" in body["launch_url"]


def test_launch_requires_base_url():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={"urlscheme": "https://app.example.com/moodle/callback?"},
    )
    assert r.status_code == 400


def test_launch_unauthenticated():
    _fresh_db()
    client = TestClient(app)
    r = client.post(
        "/moodle/launch",
        json={"urlscheme": "https://app.example.com/moodle/callback?", "base_url": "https://x"},
    )
    assert r.status_code == 401


def _build_moodle_token_blob(passport: str, siteid: str, ws_token: str) -> str:
    """Replicate Moodle's launch return format: base64(<sig>:::<token>:::)
    where sig = md5(siteid + passport)."""
    sig = hashlib.md5(f"{siteid}{passport}".encode("utf-8")).hexdigest()
    raw = f"{sig}:::{ws_token}:::".encode("utf-8")
    return base64.b64encode(raw).decode("utf-8")


def test_launch_callback_full_round_trip(monkeypatch):
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)

    # Stub Moodle's WS so accept_launch_token can validate.
    def fake_ws(base_url, ws_tok, function, params=None):
        assert function == "core_webservice_get_site_info"
        return {"siteid": 42, "userid": 1001, "sitename": "UniSA Moodle"}

    monkeypatch.setattr(moodle_service, "_ws_call", fake_ws)

    start = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "urlscheme": "https://app.example.com/moodle/callback?",
            "base_url": "https://lms.unisa.ac.za",
        },
    ).json()
    passport = start["passport"]

    blob = _build_moodle_token_blob(passport, "42", "ws-token-abc")
    r = client.post(
        "/moodle/launch/callback",
        json={"passport": passport, "token": blob},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sitename"] == "UniSA Moodle"
    assert body["user_id"] == user_id


def test_launch_callback_rejects_bad_passport():
    _fresh_db()
    client = TestClient(app)
    blob = _build_moodle_token_blob("never-issued", "42", "ws-token")
    r = client.post(
        "/moodle/launch/callback",
        json={"passport": "never-issued-by-us", "token": blob},
    )
    assert r.status_code == 400
    assert "passport" in r.json()["detail"].lower()


def test_launch_callback_rejects_replay(monkeypatch):
    """Passport must be single-use."""
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    monkeypatch.setattr(
        moodle_service,
        "_ws_call",
        lambda *a, **k: {"siteid": 7, "userid": 1, "sitename": "S"},
    )
    start = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={"urlscheme": "studypartner://", "base_url": "https://x"},
    ).json()
    blob = _build_moodle_token_blob(start["passport"], "7", "ws-tok")
    payload = {"passport": start["passport"], "token": blob}
    first = client.post("/moodle/launch/callback", json=payload)
    second = client.post("/moodle/launch/callback", json=payload)
    assert first.status_code == 200
    assert second.status_code == 400


def test_launch_callback_rejects_signature_mismatch(monkeypatch):
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    monkeypatch.setattr(
        moodle_service,
        "_ws_call",
        lambda *a, **k: {"siteid": 7, "userid": 1, "sitename": "S"},
    )
    start = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={"urlscheme": "studypartner://", "base_url": "https://x"},
    ).json()
    # Sign with the WRONG siteid — simulates a forged blob.
    bad_blob = _build_moodle_token_blob(start["passport"], "999", "ws-tok")
    r = client.post(
        "/moodle/launch/callback",
        json={"passport": start["passport"], "token": bad_blob},
    )
    assert r.status_code == 400
    assert "signature" in r.json()["detail"].lower()


def test_materials_listing_and_selection_round_trip():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="moodle-101", user_id=user_id, name="Comp Sci 101", module_type=ModuleType.semester))
    upsert_moodle_resources(
        [
            MoodleResource(id="r-1", module_id="moodle-101", title="Study guide.pdf", type="resource", file_size=1024, url="https://x/1"),
            MoodleResource(id="r-2", module_id="moodle-101", title="Tutorial letter.pdf", type="resource", file_size=512, url="https://x/2"),
        ]
    )

    listing = client.get("/moodle/materials", headers=headers)
    assert listing.status_code == 200
    rows = listing.json()["resources"]
    assert {r["id"] for r in rows} == {"r-1", "r-2"}
    assert all(r["included_in_ai"] is False for r in rows)
    assert rows[0]["module_name"] == "Comp Sci 101"

    sel = client.post(
        "/moodle/materials/select",
        headers=headers,
        json={"include": ["r-1"], "exclude": ["r-2"]},
    )
    assert sel.status_code == 200
    assert sel.json() == {"included": 1, "excluded": 1}

    after = {r["id"]: r for r in client.get("/moodle/materials", headers=headers).json()["resources"]}
    assert after["r-1"]["included_in_ai"] is True
    assert after["r-2"]["included_in_ai"] is False


def test_user_cannot_flip_other_users_resources():
    _fresh_db()
    client = TestClient(app)
    token_a, _ = _register(client, "stuA@mylife.unisa.ac.za")
    _, uid_b = _register(client, "stuB@mylife.unisa.ac.za")

    add_module(Module(id="m-b", user_id=uid_b, name="B's module", module_type=ModuleType.semester))
    upsert_moodle_resources([MoodleResource(id="r-b", module_id="m-b", title="x", type="resource")])

    r = client.post(
        "/moodle/materials/select",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"include": ["r-b"]},
    )
    assert r.status_code == 200
    assert r.json()["included"] == 0
    rows = list_moodle_resources_with_selection(uid_b)
    assert all(row["included_in_ai"] is False for row in rows)


def test_resync_preserves_user_material_selection():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="moodle-1", user_id=user_id, name="X", module_type=ModuleType.semester))
    upsert_moodle_resources(
        [MoodleResource(id="r-keep", module_id="moodle-1", title="Old title", type="resource", url="https://x/1")]
    )
    client.post("/moodle/materials/select", headers=headers, json={"include": ["r-keep"]})

    # Re-sync overwrites metadata but must NOT clobber the user's pick.
    upsert_moodle_resources(
        [MoodleResource(id="r-keep", module_id="moodle-1", title="Renamed", type="resource", url="https://x/1")]
    )
    rows = client.get("/moodle/materials", headers=headers).json()["resources"]
    keep = next(r for r in rows if r["id"] == "r-keep")
    assert keep["title"] == "Renamed"
    assert keep["included_in_ai"] is True
