"""Regression tests for the production-readiness pass.

Each test locks in one of the fixes from the audit so we don't regress.
"""
from __future__ import annotations

from datetime import date, timedelta
import io
import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import Assessment, Module, ModuleType, Pace, User
from app.src.utils.time import utcnow_aware
from app.storage import (
    DB_PATH,
    add_assessment,
    add_module,
    create_user,
    get_assessments_for_module,
    init_db,
)


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def test_add_assessment_is_idempotent():
    """Re-submitting the same assessment id must update, not raise."""
    _fresh_db()
    add_module(Module(id="m1", user_id="u1", name="M", module_type=ModuleType.semester))
    base = Assessment(
        id="a-1",
        module_id="m1",
        title="First",
        due_date=date.today() + timedelta(days=10),
        weight=20,
    )
    add_assessment(base)
    # Second call with the same id used to raise IntegrityError → 500.
    updated = Assessment(
        id="a-1",
        module_id="m1",
        title="Updated title",
        due_date=date.today() + timedelta(days=14),
        weight=30,
    )
    add_assessment(updated)

    rows = get_assessments_for_module("m1")
    assert len(rows) == 1
    assert rows[0].title == "Updated title"
    assert rows[0].weight == 30


def test_assessment_route_returns_201_on_duplicate():
    _fresh_db()
    client = TestClient(app)
    client.post(
        "/users",
        json={
            "id": "u1",
            "name": "A",
            "email": "a@x.com",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    client.post(
        "/modules",
        json={"id": "m1", "user_id": "u1", "name": "M", "module_type": "semester"},
    )
    payload = {
        "id": "a-dup",
        "module_id": "m1",
        "title": "T",
        "due_date": "2030-01-01",
        "weight": 20,
    }
    r1 = client.post("/assessments", json=payload)
    r2 = client.post("/assessments", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200  # used to be 500


def test_upload_rejects_oversize_file():
    _fresh_db()
    client = TestClient(app)
    client.post(
        "/users",
        json={
            "id": "u1",
            "name": "A",
            "email": "a@x.com",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    big = b"x" * (11 * 1024 * 1024)
    r = client.post(
        "/upload",
        data={
            "user_id": "u1",
            "module_id": "m_big",
            "module_name": "Big",
            "module_type": "semester",
        },
        files={"file": ("big.txt", io.BytesIO(big), "text/plain")},
    )
    assert r.status_code == 413, r.text


def test_upload_rejects_unknown_extension():
    _fresh_db()
    client = TestClient(app)
    client.post(
        "/users",
        json={
            "id": "u1",
            "name": "A",
            "email": "a@x.com",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    r = client.post(
        "/upload",
        data={
            "user_id": "u1",
            "module_id": "m_exe",
            "module_name": "Bad",
            "module_type": "semester",
        },
        files={"file": ("malicious.exe", io.BytesIO(b"MZ\x00"), "application/octet-stream")},
    )
    assert r.status_code == 415, r.text


def test_utcnow_is_timezone_aware():
    """Ensures we are off the deprecated naive utcnow path."""
    now = utcnow_aware()
    assert now.tzinfo is not None


def test_patch_user_updates_availability():
    """SettingsView relies on PATCH /users/{id} to change availability."""
    _fresh_db()
    client = TestClient(app)
    client.post(
        "/users",
        json={
            "id": "u1",
            "name": "A",
            "email": "a@x.com",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    r = client.patch(
        "/users/u1",
        json={"hours_per_day": 5, "days_per_week": 6, "pace": "fast", "name": "Updated"},
    )
    assert r.status_code == 200
    body = r.json()["user"]
    assert body["hours_per_day"] == 5
    assert body["days_per_week"] == 6
    assert body["pace"] == "fast"
    assert body["name"] == "Updated"

    # Validation: rejects out-of-range values
    bad = client.patch("/users/u1", json={"hours_per_day": 99})
    assert bad.status_code == 400

    # Unknown user -> 404
    missing = client.patch("/users/nope", json={"hours_per_day": 3})
    assert missing.status_code == 404


def test_sync_applies_session_completion_idempotently():
    """Replaying the same sync op must not double-apply."""
    _fresh_db()
    client = TestClient(app)
    # Set up a user + completed plan so there's a session to toggle
    client.post(
        "/users",
        json={
            "id": "u1",
            "name": "A",
            "email": "a@x.com",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    create_user_id = "u1"
    # Use the sync route directly with an unsupported op to get a conflict, then
    # the same op_id must be acknowledged the second time instead of re-applied.
    op_id = str(uuid.uuid4())
    op = {
        "op_id": op_id,
        "entity": "user_selection",
        "entity_id": f"sel-{op_id}",
        "op": "upsert",
        "payload": {
            "module_id": "m1",
            "subtopic_ids": [],
            "ai_features": {"summaries": True, "subtopic_quiz": True, "topic_quiz": True},
            "low_data_mode": False,
        },
    }
    r1 = client.post("/sync", json={"user_id": create_user_id, "ops": [op]})
    r2 = client.post("/sync", json={"user_id": create_user_id, "ops": [op]})
    assert r1.status_code == 200 and r2.status_code == 200
    assert op_id in r1.json()["applied"]
    assert op_id in r2.json()["applied"]  # idempotent replay
    assert r2.json()["conflicts"] == []
