from __future__ import annotations

from fastapi import Header, HTTPException

from app.services.auth_service import verify_token
from app.storage import get_user


def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user
