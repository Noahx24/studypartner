"""Ownership + input validation on POST /selection.

The selection's subtopic_ids are the AI authorization gate (ai_service
only generates for ref_ids present in the selection). So selection
creation must reject (a) a module the caller doesn't own and (b)
subtopic ids that don't belong to that module — otherwise a user could
smuggle another tenant's subtopic ids in and read/generate AI over them.
"""
from __future__ import annotations

import os

from fastapi.testclient import TestClient

os.environ.setdefault("STUDYPARTNER_MOODLE_BASE_URL", "https://lms.example")
os.environ.setdefault("STUDYPARTNER_SECRET", "test-secret-long-enough-for-prod-and-tests")

from app.main import app
from app.src.models import Module, ModuleType
from app.storage import DB_PATH, add_module, init_db


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


def test_selection_rejects_unowned_module():
    _fresh_db()
    client = TestClient(app)
    _, uid_a = _register(client, "a@x.test")
    token_b, uid_b = _register(client, "b@x.test")
    add_module(Module(id="m-a", user_id=uid_a, name="A's module", module_type=ModuleType.semester))

    r = client.post(
        "/selection",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"user_id": uid_b, "module_id": "m-a", "subtopic_ids": ["whatever"]},
    )
    # m-a belongs to A → ensure_module_owned refuses for B.
    assert r.status_code in (403, 404), r.text


def test_selection_rejects_foreign_subtopic_ids():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    add_module(Module(id="m-a", user_id=uid_a, name="A's module", module_type=ModuleType.semester))

    # A owns the module but the subtopic id doesn't exist in it.
    r = client.post(
        "/selection",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"user_id": uid_a, "module_id": "m-a", "subtopic_ids": ["bogus-subtopic"]},
    )
    assert r.status_code == 400, r.text
