from __future__ import annotations

from fastapi import Header, HTTPException

from app.src.models.services.auth_service import verify_token
from app.storage import get_module_owner, get_user


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


def ensure_module_owned(module_id: str, current_user) -> None:
    """Raise 404 if the module doesn't exist, 403 if it belongs to a
    different user. Use on every route that reads or mutates module
    state — a valid token does not imply access to arbitrary module IDs.
    """
    owner = get_module_owner(module_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if owner != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
