"""Password reset flow: forgot → email → reset.

The mailer is stubbed (logs only) in test mode, so this exercises the
DB + token + endpoint plumbing without a real SMTP server.
"""
from __future__ import annotations

import re

from fastapi.testclient import TestClient

from app.main import app
from app.storage import DB_PATH, init_db


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client, email="alice@x.test", password="Tr0ub4dor&3-correct-horse"):
    r = client.post(
        "/users/register",
        json={"name": "Alice", "email": email, "password": password},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_forgot_password_returns_200_for_unknown_email():
    """Email enumeration defense: same response either way."""
    _fresh_db()
    r = TestClient(app).post(
        "/users/password/forgot", json={"email": "does-not-exist@x.test"}
    )
    assert r.status_code == 200


def test_forgot_password_emits_token_in_log(caplog):
    """The stub mailer logs the body; we extract the token from there to
    drive the reset flow without needing a real mailbox."""
    _fresh_db()
    client = TestClient(app)
    _register(client)

    with caplog.at_level("INFO"):
        r = client.post("/users/password/forgot", json={"email": "alice@x.test"})
    assert r.status_code == 200

    # Token is whatever follows token= in the stub mailer's logged URL.
    log_blob = " ".join(rec.message for rec in caplog.records)
    match = re.search(r"token=([A-Za-z0-9_\-]+)", log_blob)
    assert match, f"reset token not found in log: {log_blob}"
    token = match.group(1)

    new_password = "Brand-New-Password-99!"
    reset = client.post(
        "/users/password/reset", json={"token": token, "new_password": new_password}
    )
    assert reset.status_code == 200, reset.text

    # Old password no longer works.
    bad = client.post(
        "/users/login",
        json={"email": "alice@x.test", "password": "Tr0ub4dor&3-correct-horse"},
    )
    assert bad.status_code == 401

    # New password works.
    good = client.post(
        "/users/login", json={"email": "alice@x.test", "password": new_password}
    )
    assert good.status_code == 200


def test_reset_with_bad_token_400():
    _fresh_db()
    client = TestClient(app)
    _register(client)
    r = client.post(
        "/users/password/reset",
        json={"token": "x" * 40, "new_password": "Brand-New-Password-99!"},
    )
    assert r.status_code == 400


def test_reset_rejects_weak_new_password(caplog):
    """Same policy as registration: 12 chars + letter + digit."""
    _fresh_db()
    client = TestClient(app)
    _register(client)

    with caplog.at_level("INFO"):
        client.post("/users/password/forgot", json={"email": "alice@x.test"})
    token = re.search(
        r"token=([A-Za-z0-9_\-]+)", " ".join(rec.message for rec in caplog.records)
    ).group(1)

    r = client.post(
        "/users/password/reset", json={"token": token, "new_password": "short1"}
    )
    assert r.status_code == 422  # Pydantic min_length

    # The token wasn't consumed (validation failed before consume_token).
    # The same token should still work with a strong password.
    r2 = client.post(
        "/users/password/reset",
        json={"token": token, "new_password": "Strong-NewPassword-1!"},
    )
    assert r2.status_code == 200


def test_reset_token_single_use(caplog):
    _fresh_db()
    client = TestClient(app)
    _register(client)

    with caplog.at_level("INFO"):
        client.post("/users/password/forgot", json={"email": "alice@x.test"})
    token = re.search(
        r"token=([A-Za-z0-9_\-]+)", " ".join(rec.message for rec in caplog.records)
    ).group(1)

    first = client.post(
        "/users/password/reset",
        json={"token": token, "new_password": "First-New-Password-1!"},
    )
    assert first.status_code == 200

    second = client.post(
        "/users/password/reset",
        json={"token": token, "new_password": "Second-New-Password-1!"},
    )
    assert second.status_code == 400
