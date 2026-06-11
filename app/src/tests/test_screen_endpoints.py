"""Endpoints added/hardened for the production app screens.

Covers:
- GET /modules (list with assessments + progress, per-user scoping)
- DELETE /modules/{id} (cascade delete + ownership)
- POST /assessments ownership (regression: upsert allowed cross-user writes)
- GET /plans/range/{user_id} (validation, ownership, enriched session fields)
- POST /plans/sessions/{id}/complete ownership (404 on foreign session)
- PATCH /users/me (settings persistence)
"""
from __future__ import annotations

import os
from datetime import date, timedelta

from fastapi.testclient import TestClient

os.environ.setdefault("STUDYPARTNER_MOODLE_BASE_URL", "https://lms.example")
os.environ.setdefault("STUDYPARTNER_SECRET", "test-secret-long-enough-for-prod-and-tests")

from app.main import app
from app.src.models import Assessment, Module, ModuleType, Session
from app.storage import (
    DB_PATH,
    add_assessment,
    add_module,
    get_modules,
    init_db,
    save_sessions,
)


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client, email):
    r = client.post(
        "/users/register",
        json={"name": "x", "email": email, "password": "longenoughpw1!"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user_id"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_module(uid, module_id="m-1", name="Algebra"):
    add_module(Module(id=module_id, user_id=uid, name=name, module_type=ModuleType.semester))


# ---- GET /modules ----

def test_list_modules_returns_own_modules_with_assessments():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    _, uid_b = _register(client, "b@x.test")

    _seed_module(uid_a, "m-a", "Calculus")
    _seed_module(uid_b, "m-b", "Biology")
    add_assessment(Assessment(id="as-1", module_id="m-a", title="Final Exam", due_date=date(2026, 11, 1), weight=60))

    r = client.get("/modules", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    modules = r.json()["modules"]
    assert [m["id"] for m in modules] == ["m-a"]
    assert modules[0]["name"] == "Calculus"
    assert modules[0]["assessments"][0]["due_date"] == "2026-11-01"
    assert modules[0]["progress_percent"] == 0


def test_list_modules_requires_auth():
    _fresh_db()
    client = TestClient(app)
    assert client.get("/modules").status_code == 401


# ---- DELETE /modules/{id} ----

def test_delete_module_cascades_and_enforces_ownership():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")
    _seed_module(uid_a, "m-a")
    add_assessment(Assessment(id="as-1", module_id="m-a", title="Quiz", due_date=date(2026, 9, 1), weight=10))

    # Foreign user blocked.
    assert client.delete("/modules/m-a", headers=_auth(token_b)).status_code == 403

    # Owner deletes; module disappears from the list.
    assert client.delete("/modules/m-a", headers=_auth(token_a)).status_code == 204
    assert get_modules(uid_a) == []
    assert client.delete("/modules/m-a", headers=_auth(token_a)).status_code == 404


# ---- POST /assessments ownership ----

def test_add_assessment_blocks_foreign_module():
    _fresh_db()
    client = TestClient(app)
    _, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")
    _seed_module(uid_a, "m-a")

    r = client.post(
        "/assessments",
        headers=_auth(token_b),
        json={"id": "as-x", "module_id": "m-a", "title": "Hijack", "due_date": "2026-10-01"},
    )
    assert r.status_code == 403, r.text


# ---- GET /plans/range ----

def _seed_session(uid, session_id="s-1", on=None, status="planned"):
    save_sessions([
        Session(
            id=session_id,
            user_id=uid,
            module_id="m-1",
            unit_id="u-1",
            session_date=on or date.today(),
            planned_minutes=45,
            status=status,
        )
    ])


def test_plan_range_returns_enriched_sessions():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    _seed_module(uid_a, "m-1", "Physics")
    _seed_session(uid_a, on=date.today() + timedelta(days=2))

    start = date.today().isoformat()
    end = (date.today() + timedelta(days=7)).isoformat()
    r = client.get(f"/plans/range/{uid_a}?start={start}&end={end}", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    sessions = r.json()["sessions"]
    assert len(sessions) == 1
    s = sessions[0]
    # Display fields the session cards render.
    assert s["subject"] == "Physics"
    assert s["duration_minutes"] == 45
    assert s["title"]  # falls back to module name when no unit exists


def test_plan_range_validation_and_ownership():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    far = (date.today() + timedelta(days=400)).isoformat()

    assert client.get(f"/plans/range/{uid_a}?start={today}&end={yesterday}", headers=_auth(token_a)).status_code == 400
    assert client.get(f"/plans/range/{uid_a}?start={today}&end={far}", headers=_auth(token_a)).status_code == 400
    assert client.get(f"/plans/range/{uid_a}?start={today}&end={today}", headers=_auth(token_b)).status_code == 403


# ---- POST /plans/sessions/{id}/complete ownership ----

def test_complete_session_blocks_foreign_user():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")
    _seed_module(uid_a, "m-1")
    _seed_session(uid_a, "s-1")

    # Foreign user gets 404 (not 403 — don't confirm the ID exists).
    assert client.post("/plans/sessions/s-1/complete", headers=_auth(token_b)).status_code == 404

    r = client.post("/plans/sessions/s-1/complete", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"

    # Daily plan now reports the completed session too (dashboard needs it).
    today = date.today().isoformat()
    daily = client.get(f"/plans/daily/{uid_a}/{today}", headers=_auth(token_a))
    assert daily.status_code == 200
    statuses = [s["status"] for s in daily.json()["sessions"]]
    assert "completed" in statuses


def test_miss_session_marks_missed_and_enforces_ownership():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")
    _seed_module(uid_a, "m-1")
    _seed_session(uid_a, "s-1")

    # Foreign user blocked with 404.
    assert client.post("/plans/sessions/s-1/miss", headers=_auth(token_b)).status_code == 404

    r = client.post("/plans/sessions/s-1/miss", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "missed"

    # Missing it twice (or missing a completed session) is rejected.
    assert client.post("/plans/sessions/s-1/miss", headers=_auth(token_a)).status_code == 404

    today = date.today().isoformat()
    daily = client.get(f"/plans/daily/{uid_a}/{today}", headers=_auth(token_a))
    assert [s["status"] for s in daily.json()["sessions"]] == ["missed"]


# ---- PATCH /users/me ----

def test_update_settings_persists():
    _fresh_db()
    client = TestClient(app)
    token, _uid = _register(client, "a@x.test")

    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"hours_per_day": 3.5, "days_per_week": 4, "max_daily_hours": 6},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hours_per_day"] == 3.5
    assert body["days_per_week"] == 4
    assert body["max_daily_hours"] == 6

    me = client.get("/users/me", headers=_auth(token)).json()
    assert me["hours_per_day"] == 3.5
    assert me["days_per_week"] == 4


def test_update_settings_rejects_bad_values():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client, "a@x.test")
    assert client.patch("/users/me", headers=_auth(token), json={"pace": "warp"}).status_code == 400
    assert client.patch("/users/me", headers=_auth(token), json={"days_per_week": 9}).status_code == 422
