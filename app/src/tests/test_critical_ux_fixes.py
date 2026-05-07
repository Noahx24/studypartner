"""Tests for the GET /modules listing, PATCH /users/me, and the
POST /plans/sessions/{id}/missed → auto-reschedule loop.
Each one fixes a distinct user-visible gap that landed on main without
end-to-end coverage."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import (
    Assessment,
    LearningUnit,
    Module,
    ModuleType,
    Subtopic,
)
from app.storage import (
    DB_PATH,
    add_assessment,
    add_module,
    init_db,
    replace_learning_units,
    save_sessions,
    get_sessions,
)
from app.src.models import Session


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client: TestClient, email: str = "stu@example.com") -> tuple[str, str]:
    r = client.post(
        "/users/register",
        json={
            "name": "Stu",
            "email": email,
            "password": "correct-horse-battery-staple",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user_id"]


# ---- GET /modules ----

def test_list_modules_empty():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.get("/modules", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"modules": []}


def test_list_modules_returns_unit_and_subtopic_counts():
    """The Modules tab needs counts per module so the parsed-units pill
    can show '5 units · 23 subtopics' without N+1 fetches."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)

    add_module(Module(id="m1", user_id=user_id, name="Algorithms", module_type=ModuleType.semester))
    subs = [
        Subtopic(id="s1", learning_unit_id="lu1", ordinal=1, title="Big-O", content="x", word_count=1),
        Subtopic(id="s2", learning_unit_id="lu1", ordinal=2, title="Heaps", content="x", word_count=1),
    ]
    replace_learning_units("m1", [LearningUnit(id="lu1", module_id="m1", ordinal=1, topic="Complexity", subtopics=subs)])

    add_module(Module(id="m2", user_id=user_id, name="Networks", module_type=ModuleType.year))
    add_assessment(Assessment(id="a-1", module_id="m2", title="Midterm", due_date=date.today() + timedelta(days=14)))

    r = client.get("/modules", headers={"Authorization": f"Bearer {token}"})
    body = r.json()["modules"]
    by_id = {m["id"]: m for m in body}

    assert by_id["m1"]["unit_count"] == 1
    assert by_id["m1"]["subtopic_count"] == 2
    assert by_id["m1"]["next_due_date"] is None

    assert by_id["m2"]["unit_count"] == 0
    assert by_id["m2"]["subtopic_count"] == 0
    assert by_id["m2"]["next_due_date"] == (date.today() + timedelta(days=14)).isoformat()


def test_list_modules_does_not_leak_other_users():
    _fresh_db()
    client = TestClient(app)
    token_a, _ = _register(client, "a@example.com")
    _, uid_b = _register(client, "b@example.com")
    add_module(Module(id="b-mod", user_id=uid_b, name="B's", module_type=ModuleType.semester))

    r = client.get("/modules", headers={"Authorization": f"Bearer {token_a}"})
    assert r.json() == {"modules": []}


def test_list_modules_requires_auth():
    _fresh_db()
    client = TestClient(app)
    assert client.get("/modules").status_code == 401


# ---- PATCH /users/me ----

def test_patch_me_updates_profile():
    """Onboarding wizard hits PATCH /users/me to persist the user's
    availability so the planner has real numbers from day one."""
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.patch("/users/me", headers=headers, json={
        "hours_per_day": 4.5,
        "days_per_week": 6,
        "pace": "fast",
    })
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["hours_per_day"] == 4.5
    assert me["days_per_week"] == 6
    assert me["pace"] == "fast"

    # Persists across reads
    me_again = client.get("/users/me", headers=headers).json()
    assert me_again["hours_per_day"] == 4.5


def test_patch_me_rejects_invalid_pace():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.patch(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"pace": "rocket"},
    )
    assert r.status_code == 400


def test_patch_me_requires_auth():
    _fresh_db()
    client = TestClient(app)
    assert client.patch("/users/me", json={"hours_per_day": 3}).status_code == 401


# ---- POST /plans/sessions/{id}/missed ----

def test_missed_marks_status_and_replans():
    """Skip → status=missed, reschedule pulled in. The new endpoint
    means the 'Skip' button in the UI now actually does something
    backend-side, instead of just invalidating a React Query cache."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="m1", user_id=user_id, name="Algorithms", module_type=ModuleType.semester))
    add_assessment(Assessment(id="a-1", module_id="m1", title="Final", due_date=date.today() + timedelta(days=21)))
    save_sessions([
        Session(id="sess-1", user_id=user_id, module_id="m1", unit_id="m1-unit-1",
                session_date=date.today(), planned_minutes=60, status="planned"),
    ])

    r = client.post("/plans/sessions/sess-1/missed", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "missed"
    assert body["rescheduled"] is True

    # Original session row is now status='missed'
    after = get_sessions(user_id)
    sess1 = next(s for s in after if s.id == "sess-1")
    assert sess1.status == "missed"


def test_missed_idempotent_on_already_completed():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    save_sessions([
        Session(id="sess-1", user_id=user_id, module_id="m1", unit_id="u1",
                session_date=date.today(), planned_minutes=30, status="completed"),
    ])
    r = client.post("/plans/sessions/sess-1/missed", headers={"Authorization": f"Bearer {token}"})
    # Already completed → no-op (we don't change status, don't replan)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "no-op"
    assert body["rescheduled"] is False


def test_missed_user_cannot_mark_other_users_session():
    _fresh_db()
    client = TestClient(app)
    token_a, _ = _register(client, "a@example.com")
    _, uid_b = _register(client, "b@example.com")
    save_sessions([
        Session(id="b-sess", user_id=uid_b, module_id="m", unit_id="u",
                session_date=date.today(), planned_minutes=30, status="planned"),
    ])
    r = client.post(
        "/plans/sessions/b-sess/missed",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 403


def test_missed_404_on_unknown_session():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.post(
        "/plans/sessions/does-not-exist/missed",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404


def test_complete_session_now_enforces_ownership():
    """Bonus fix surfaced while wiring missed: complete previously
    let any authenticated user mark anyone's session done. Now scoped."""
    _fresh_db()
    client = TestClient(app)
    token_a, _ = _register(client, "a@example.com")
    _, uid_b = _register(client, "b@example.com")
    save_sessions([
        Session(id="b-sess", user_id=uid_b, module_id="m", unit_id="u",
                session_date=date.today(), planned_minutes=30, status="planned"),
    ])
    r = client.post(
        "/plans/sessions/b-sess/complete",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 403
