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
