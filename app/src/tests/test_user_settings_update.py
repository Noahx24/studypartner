"""PATCH /users/me — partial update of plannable study settings.

Used by the onboarding wizard (availability step) and the Profile page.
Credentials must NOT be updatable through this endpoint.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.storage import DB_PATH, init_db


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client):
    r = client.post(
        "/users/register",
        json={"name": "x", "email": "x@y.test", "password": "longenoughpw1!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_patch_me_updates_availability():
    _fresh_db()
    client = TestClient(app)
    token = _register(client)
    r = client.patch(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"hours_per_day": 5, "days_per_week": 4, "pace": "fast", "max_daily_hours": 6},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hours_per_day"] == 5
    assert body["days_per_week"] == 4
    assert body["pace"] == "fast"
    assert body["max_daily_hours"] == 6

    # Persisted, not just echoed
    me = client.get("/users/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["hours_per_day"] == 5
    assert me["days_per_week"] == 4


def test_patch_me_partial_leaves_other_fields():
    _fresh_db()
    client = TestClient(app)
    token = _register(client)
    before = client.get("/users/me", headers={"Authorization": f"Bearer {token}"}).json()
    r = client.patch(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"days_per_week": 6},
    )
    assert r.status_code == 200
    after = r.json()
    assert after["days_per_week"] == 6
    assert after["hours_per_day"] == before["hours_per_day"]
    assert after["pace"] == before["pace"]
    assert after["name"] == before["name"]


def test_patch_me_rejects_bad_pace_and_requires_auth():
    _fresh_db()
    client = TestClient(app)
    token = _register(client)
    r = client.patch(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"pace": "warp-speed"},
    )
    assert r.status_code == 400
    assert client.patch("/users/me", json={"days_per_week": 3}).status_code in (401, 403)


def test_patch_me_cannot_touch_credentials():
    _fresh_db()
    client = TestClient(app)
    token = _register(client)
    # Unknown fields are ignored by the schema; email/password stay intact.
    client.patch(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "evil@evil.test", "password": "hijacked-password-1!"},
    )
    me = client.get("/users/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "x@y.test"
    r = client.post(
        "/users/login", json={"email": "x@y.test", "password": "longenoughpw1!"}
    )
    assert r.status_code == 200
