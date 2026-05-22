from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
import secrets


SECRET = os.getenv("STUDYPARTNER_SECRET", "dev-secret-change-me")
_ENV = os.getenv("STUDYPARTNER_ENV", "development").lower()
_PBKDF2_ITERATIONS = 260_000  # OWASP 2023 recommendation for SHA-256

# Fail closed in production: the dev default or a too-short secret means
# any attacker who reads the code can forge JWTs. Tests / local dev keep
# working because STUDYPARTNER_ENV is "development" by default.
if _ENV == "production":
    if not SECRET or SECRET == "dev-secret-change-me":
        raise RuntimeError(
            "STUDYPARTNER_SECRET is the dev default in production. Refusing to "
            "boot. Generate a strong value with `python -c \"import secrets; "
            "print(secrets.token_urlsafe(48))\"` and export it."
        )
    if len(SECRET) < 32:
        raise RuntimeError(
            f"STUDYPARTNER_SECRET is too short for production ({len(SECRET)} "
            "chars, need >= 32). Generate one with "
            "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"`."
        )


def hash_password(password: str) -> str:
    """Return a salted PBKDF2-HMAC-SHA256 hash of *password*.

    Format: ``<hex-salt>$<hex-digest>`` — self-contained for verification.
    """
    salt = secrets.token_bytes(32)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return salt.hex() + "$" + digest.hex()


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time comparison to avoid timing attacks."""
    try:
        salt_hex, stored_hex = password_hash.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
        return hmac.compare_digest(digest.hex(), stored_hex)
    except Exception:
        return False


def create_token(user_id: str, expires_hours: int = 24) -> str:
    payload = {
        "user_id": user_id,
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=expires_hours)).timestamp()),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(raw).decode("utf-8") + "." + signature


def verify_token(token: str) -> str | None:
    try:
        encoded, signature = token.split(".", 1)
        raw = base64.urlsafe_b64decode(encoded.encode("utf-8"))
        expected = hmac.new(SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(raw.decode("utf-8"))
        if int(payload["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload["user_id"]
    except Exception:
        return None
