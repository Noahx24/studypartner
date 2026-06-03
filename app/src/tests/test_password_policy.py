"""Password policy on POST /users/register.

12+ chars, must contain a letter and a digit, not in the common-bad
list, and not containing the user's email local-part.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.storage import DB_PATH, init_db


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _try_register(client, password, email="alice@x.test"):
    return client.post(
        "/users/register",
        json={"name": "Alice", "email": email, "password": password},
    )


def test_password_too_short_400():
    _fresh_db()
    r = _try_register(TestClient(app), "short1!")
    assert r.status_code == 422  # Pydantic length rule


def test_password_no_digit_400():
    _fresh_db()
    r = _try_register(TestClient(app), "longenoughbutletters")
    assert r.status_code == 400
    assert "letter" in r.json()["detail"].lower() or "digit" in r.json()["detail"].lower()


def test_password_no_letter_400():
    _fresh_db()
    r = _try_register(TestClient(app), "123456789012")
    assert r.status_code == 400


def test_password_common_400():
    _fresh_db()
    # "studypartner1" is in _COMMON_PASSWORDS and 13 chars (passes length).
    r = _try_register(TestClient(app), "studypartner1")
    assert r.status_code == 400
    assert "common" in r.json()["detail"].lower()


def test_password_contains_email_local_400():
    _fresh_db()
    # email local-part is "alice123" — password embedding it is rejected.
    r = _try_register(TestClient(app), "alice123-2024!", email="alice123@x.test")
    assert r.status_code == 400
    assert "email" in r.json()["detail"].lower()


def test_strong_password_succeeds():
    _fresh_db()
    r = _try_register(TestClient(app), "Tr0ub4dor&3-correct-horse")
    assert r.status_code == 200, r.text
