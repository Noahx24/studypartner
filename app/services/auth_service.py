from __future__ import annotations

import base64
from datetime import datetime, timedelta
import hashlib
import hmac
import json
import os


SECRET = os.getenv("STUDYPARTNER_SECRET", "dev-secret-change-me")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash


def create_token(user_id: str, expires_hours: int = 24) -> str:
    payload = {
        "user_id": user_id,
        "exp": int((datetime.utcnow() + timedelta(hours=expires_hours)).timestamp()),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    token = base64.urlsafe_b64encode(raw).decode("utf-8") + "." + signature
    return token


def verify_token(token: str) -> str | None:
    try:
        encoded, signature = token.split(".", 1)
        raw = base64.urlsafe_b64decode(encoded.encode("utf-8"))
        expected = hmac.new(SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        payload = json.loads(raw.decode("utf-8"))
        if int(payload["exp"]) < int(datetime.utcnow().timestamp()):
            return None
        return payload["user_id"]
    except Exception:
        return None
