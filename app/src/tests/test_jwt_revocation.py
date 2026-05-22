"""JWT revocation via /users/logout.

The token returned by /users/login is stateless; we cannot delete it
server-side. /users/logout bumps a per-user invalidation timestamp;
verify_token rejects every token issued before that timestamp.
"""
from __future__ import annotations

import time

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
        json={"name": "x", "email": "x@y.test", "password": "longenoughpw!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_logout_invalidates_existing_token():
    _fresh_db()
    client = TestClient(app)
    token = _register(client)
    auth = {"Authorization": f"Bearer {token}"}

    # Tokens were issued with iat=now. Sleep so the post-logout
    # invalidated_at strictly exceeds iat.
    time.sleep(1.5)

    # Token works.
    assert client.get("/users/me", headers=auth).status_code == 200

    # Log out: must succeed with the current token.
    assert client.post("/users/logout", headers=auth).status_code == 200

    # Same token must now be rejected.
    r = client.get("/users/me", headers=auth)
    assert r.status_code == 401, r.text


def test_new_login_after_logout_works():
    _fresh_db()
    client = TestClient(app)
    _register(client)
    # Brief gap so the next iat strictly exceeds the previous one.
    time.sleep(1.5)
    first_login = client.post(
        "/users/login",
        json={"email": "x@y.test", "password": "longenoughpw!"},
    ).json()
    auth = {"Authorization": f"Bearer {first_login['token']}"}
    client.post("/users/logout", headers=auth)

    # New login mints a token with a fresh iat that's strictly newer
    # than the revocation timestamp.
    time.sleep(1.5)
    second_login = client.post(
        "/users/login",
        json={"email": "x@y.test", "password": "longenoughpw!"},
    ).json()
    auth2 = {"Authorization": f"Bearer {second_login['token']}"}
    assert client.get("/users/me", headers=auth2).status_code == 200


def test_logout_requires_auth():
    _fresh_db()
    client = TestClient(app)
    r = client.post("/users/logout")
    assert r.status_code == 401
