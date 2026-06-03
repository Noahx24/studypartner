"""GDPR / POPIA right-to-erasure: DELETE /users/me wipes everything.

Required for compliance (GDPR Article 17, POPIA Section 24) and for
App Store Review guideline 5.1.1(v) — apps that support registration
must also support in-app account deletion.
"""
from __future__ import annotations

import pathlib

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import Module, ModuleType
from app.storage import (
    DB_PATH,
    add_module,
    get_user,
    init_db,
    save_upload,
)


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client, email="a@x.test"):
    r = client.post(
        "/users/register",
        json={"name": "x", "email": email, "password": "longenoughpw!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user_id"]


def test_delete_me_removes_user_row():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)

    r = client.delete("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "deleted"
    assert get_user(user_id) is None


def test_delete_me_cascades_modules_and_assessments():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    auth = {"Authorization": f"Bearer {token}"}

    add_module(Module(
        id="m-1", user_id=user_id, name="A's module", module_type=ModuleType.semester
    ))
    client.post(
        "/assessments",
        headers=auth,
        json={"id": "a-1", "module_id": "m-1", "title": "test", "due_date": "2030-01-01"},
    )

    r = client.delete("/users/me", headers=auth)
    assert r.status_code == 200
    counts = r.json()["rows_removed"]
    assert counts["modules"] == 1
    assert counts["assessments"] == 1
    assert counts["users"] == 1


def test_delete_me_removes_upload_files_from_disk():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)

    add_module(Module(
        id="m-1", user_id=user_id, name="A's module", module_type=ModuleType.semester
    ))
    save_upload(user_id, "m-1", "test.txt", b"data", "raw text", page_count=1)
    # save_upload now uses a random token name (audit-medium #24) +
    # preserves only the extension. Locate the new file via its row.
    from app.storage import get_connection
    with get_connection() as conn:
        row = conn.execute(
            "SELECT filepath FROM uploads WHERE user_id = ?", (user_id,)
        ).fetchone()
    assert row, "fixture upload did not land in DB"
    upload_path = pathlib.Path(row["filepath"])
    assert upload_path.exists(), "fixture upload did not land on disk"

    r = client.delete("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert not upload_path.exists(), "upload file should be removed on user delete"


def test_delete_me_isolates_other_users():
    _fresh_db()
    client = TestClient(app)
    token_a, uid_a = _register(client, "a@x.test")
    _, uid_b = _register(client, "b@x.test")
    add_module(Module(id="m-b", user_id=uid_b, name="B's", module_type=ModuleType.semester))

    r = client.delete("/users/me", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200
    # B is untouched.
    assert get_user(uid_b) is not None


def test_delete_me_token_is_invalid_after():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    auth = {"Authorization": f"Bearer {token}"}
    assert client.delete("/users/me", headers=auth).status_code == 200
    # Subsequent calls 401 because the user row is gone.
    assert client.get("/users/me", headers=auth).status_code == 401


def test_delete_me_requires_auth():
    _fresh_db()
    client = TestClient(app)
    r = client.delete("/users/me")
    assert r.status_code == 401
