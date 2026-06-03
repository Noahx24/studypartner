"""Ownership checks on module-read routes.

Regression test for the cross-user data leak where a valid token plus
any guessable module_id returned that module's content. Every read
route under /modules/{id}/ must enforce ownership.
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


def test_module_content_blocks_cross_user_read():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    token_b, uid_b = _register(client, "b@x.test")

    add_module(Module(id="m-a", user_id=uid_a, name="A's module", module_type=ModuleType.semester))

    # A reads own module — OK.
    r_a = client.get("/modules/m-a/content", headers={"Authorization": f"Bearer {token_a}"})
    assert r_a.status_code == 200

    # B tries to read A's module — must 403.
    r_b = client.get("/modules/m-a/content", headers={"Authorization": f"Bearer {token_b}"})
    assert r_b.status_code == 403, r_b.text


def test_module_structure_blocks_cross_user_read():
    _fresh_db()
    client = TestClient(app)
    _, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")
    add_module(Module(id="m-a", user_id=uid_a, name="A's module", module_type=ModuleType.semester))

    r = client.get("/modules/m-a/structure", headers={"Authorization": f"Bearer {token_b}"})
    assert r.status_code == 403


def test_module_study_units_blocks_cross_user_read():
    _fresh_db()
    client = TestClient(app)
    _, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")
    add_module(Module(id="m-a", user_id=uid_a, name="A's module", module_type=ModuleType.semester))

    r = client.get("/modules/m-a/study-units", headers={"Authorization": f"Bearer {token_b}"})
    assert r.status_code == 403


def test_module_unknown_id_returns_404():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client, "a@x.test")
    r = client.get(
        "/modules/does-not-exist/content",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404


def test_upload_blocks_cross_user_module_overwrite():
    """Uploading to another user's module id must 403 — ingestion calls
    replace_learning_units(), which would otherwise delete the owner's
    parsed content. Moodle module ids (`moodle-<courseid>`) are guessable,
    so this is the destructive cross-tenant path that matters most."""
    import io

    _fresh_db()
    client = TestClient(app)
    _, uid_a = _register(client, "a@x.test")
    token_b, uid_b = _register(client, "b@x.test")
    add_module(Module(id="m-a", user_id=uid_a, name="A's module", module_type=ModuleType.semester))

    r = client.post(
        "/upload",
        headers={"Authorization": f"Bearer {token_b}"},
        data={
            "user_id": uid_b,
            "module_id": "m-a",  # A's module
            "module_name": "hijack",
            "module_type": "semester",
        },
        files={"file": ("notes.txt", io.BytesIO(b"hello world"), "text/plain")},
    )
    assert r.status_code == 403, r.text


def test_assessment_blocks_cross_user_module_write():
    """Adding an assessment to another user's module must be refused —
    add_assessment upserts on conflict, so it's a cross-tenant write."""
    _fresh_db()
    client = TestClient(app)
    _, uid_a = _register(client, "a@x.test")
    token_b, _ = _register(client, "b@x.test")
    add_module(Module(id="m-a", user_id=uid_a, name="A's module", module_type=ModuleType.semester))

    r = client.post(
        "/assessments",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"id": "a-x", "module_id": "m-a", "title": "T", "due_date": "2030-01-01"},
    )
    assert r.status_code == 403, r.text


def test_duplicate_email_registration_returns_409():
    _fresh_db()
    client = TestClient(app)
    _register(client, "dup@x.test")
    r = client.post(
        "/users/register",
        json={"name": "x", "email": "dup@x.test", "password": "longenoughpw1!"},
    )
    assert r.status_code == 409, r.text
