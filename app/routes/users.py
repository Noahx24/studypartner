from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.models import Pace, User
from app.services.auth_service import create_token, hash_password, verify_password
from app.storage import create_user, get_user_by_email
from app.utils.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
def register_endpoint(payload: dict) -> dict:
    if get_user_by_email(payload["email"]):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=payload.get("id", f"u-{uuid4().hex[:10]}"),
        name=payload["name"],
        email=payload["email"],
        password_hash=hash_password(payload["password"]),
        hours_per_day=payload["hours_per_day"],
        days_per_week=payload["days_per_week"],
        pace_setting=Pace(payload.get("pace_setting", "normal")),
        custom_minutes_per_500_words=payload.get("custom_minutes_per_500_words"),
        max_daily_hours=payload.get("max_daily_hours", 4.0),
        created_at=datetime.utcnow(),
    )
    create_user(user)
    token = create_token(user.id)
    return {"token": token, "user_id": user.id}


@router.post("/login")
def login_endpoint(payload: dict) -> dict:
    user = get_user_by_email(payload["email"])
    if not user or not verify_password(payload["password"], user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token(user.id), "user_id": user.id}


@router.get("/me")
def me_endpoint(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "pace_setting": current_user.pace_setting.value,
        "pace_multiplier": current_user.pace_multiplier,
        "created_at": current_user.created_at.isoformat(),
    }
