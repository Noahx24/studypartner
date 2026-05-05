"""Tests for Microsoft sign-in (dev fallback) and material selection."""
from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import Module, ModuleType, MoodleResource
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


def _ensure_dev_mode():
    """Microsoft auth env vars must be unset for the /auth/microsoft/dev
    fallback to be reachable."""
    for k in ("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"):
        os.environ.pop(k, None)


def _signin(client: TestClient, email: str = "10520467@mylife.unisa.ac.za") -> tuple[str, str]:
    _ensure_dev_mode()
    r = client.post("/auth/microsoft/dev", json={"email": email, "name": "Test Student"})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["auth_token"], body["user"]["id"]


def test_microsoft_dev_signin_creates_user_and_returns_token():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _signin(client)
    assert token
    assert user_id

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "10520467@mylife.unisa.ac.za"
    assert me.json()["user"]["microsoft_oid"]


def test_signin_idempotent_on_same_email():
    """Signing in twice must not duplicate the user record."""
    _fresh_db()
    client = TestClient(app)
    _, uid1 = _signin(client)
    _, uid2 = _signin(client)
    assert uid1 == uid2


def test_authorize_url_carries_state_when_unconfigured():
    _fresh_db()
    _ensure_dev_mode()
    client = TestClient(app)
    r = client.get("/auth/microsoft/start")
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is False
    assert body["state"]
    assert body["state"] in body["authorize_url"]


def test_email_domain_allowlist_rejects_outsiders():
    _fresh_db()
    _ensure_dev_mode()
    os.environ["STUDYPARTNER_ALLOWED_EMAIL_DOMAINS"] = "mylife.unisa.ac.za"
    try:
        client = TestClient(app)
        r = client.post(
            "/auth/microsoft/dev",
            json={"email": "someone@gmail.com", "name": "X"},
        )
        assert r.status_code == 403
        # Allowed domain still works
        ok = client.post(
            "/auth/microsoft/dev",
            json={"email": "10520467@mylife.unisa.ac.za", "name": "X"},
        )
        assert ok.status_code == 200
    finally:
        os.environ.pop("STUDYPARTNER_ALLOWED_EMAIL_DOMAINS", None)


def test_me_requires_bearer_token():
    _fresh_db()
    client = TestClient(app)
    r = client.get("/auth/me")
    assert r.status_code == 401
    bad = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert bad.status_code == 401


def test_logout_invalidates_token():
    _fresh_db()
    client = TestClient(app)
    token, _ = _signin(client)
    client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_materials_listing_and_selection_round_trip():
    """The frontend MaterialsView reads /moodle/materials and posts to
    /moodle/materials/select. Lock the round trip in."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _signin(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Seed a module + a couple of moodle resources directly via storage.
    add_module(Module(id="moodle-101", user_id=user_id, name="Comp Sci 101", module_type=ModuleType.semester))
    upsert_moodle_resources(
        [
            MoodleResource(id="r-1", module_id="moodle-101", title="Lecture 1.pdf", type="resource", file_size=1024, url="https://x/1"),
            MoodleResource(id="r-2", module_id="moodle-101", title="Notes.docx", type="resource", file_size=512, url="https://x/2"),
        ]
    )

    listing = client.get("/moodle/materials", headers=headers)
    assert listing.status_code == 200
    rows = listing.json()["resources"]
    assert {r["id"] for r in rows} == {"r-1", "r-2"}
    assert all(r["included_in_ai"] is False for r in rows)
    assert rows[0]["module_name"] == "Comp Sci 101"

    # Pick r-1 for AI processing.
    sel = client.post(
        "/moodle/materials/select",
        headers=headers,
        json={"include": ["r-1"], "exclude": ["r-2"]},
    )
    assert sel.status_code == 200
    assert sel.json() == {"included": 1, "excluded": 1}

    after = client.get("/moodle/materials", headers=headers).json()["resources"]
    by_id = {r["id"]: r for r in after}
    assert by_id["r-1"]["included_in_ai"] is True
    assert by_id["r-2"]["included_in_ai"] is False


def test_user_cannot_flip_other_users_resources():
    """If user A tries to mark user B's resource as included, the update
    must return 0 rows affected — defence in depth against stolen sessions."""
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _signin(client, "stuA@mylife.unisa.ac.za")
    _, uid_b = _signin(client, "stuB@mylife.unisa.ac.za")

    add_module(Module(id="m-b", user_id=uid_b, name="B's module", module_type=ModuleType.semester))
    upsert_moodle_resources([MoodleResource(id="r-b", module_id="m-b", title="x", type="resource")])

    r = client.post(
        "/moodle/materials/select",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"include": ["r-b"]},
    )
    assert r.status_code == 200
    # 0 rows updated — A doesn't own the module.
    assert r.json()["included"] == 0
    # And the resource is still un-flagged for B.
    rows = list_moodle_resources_with_selection(uid_b)
    assert all(row["included_in_ai"] is False for row in rows)


def test_resync_preserves_user_material_selection():
    """A re-sync must not clobber `included_in_ai` — that's the entire
    point of switching to ON CONFLICT DO UPDATE."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _signin(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="moodle-1", user_id=user_id, name="X", module_type=ModuleType.semester))
    upsert_moodle_resources(
        [MoodleResource(id="r-keep", module_id="moodle-1", title="Old title", type="resource", url="https://x/1")]
    )
    client.post(
        "/moodle/materials/select",
        headers=headers,
        json={"include": ["r-keep"]},
    )

    # Simulate a re-sync that updates the title but should keep the flag.
    upsert_moodle_resources(
        [MoodleResource(id="r-keep", module_id="moodle-1", title="Renamed", type="resource", url="https://x/1")]
    )
    rows = client.get("/moodle/materials", headers=headers).json()["resources"]
    keep = next(r for r in rows if r["id"] == "r-keep")
    assert keep["title"] == "Renamed"
    assert keep["included_in_ai"] is True
