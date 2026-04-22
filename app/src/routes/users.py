from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.src.models import Pace, User
from app.storage import create_user, get_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("")
def create_user_endpoint(payload: dict) -> dict:
    user = User(
        id=payload["id"],
        name=payload["name"],
        email=payload["email"],
        hours_per_day=payload["hours_per_day"],
        days_per_week=payload["days_per_week"],
        pace=Pace(payload.get("pace", "normal")),
        custom_minutes_per_500_words=payload.get("custom_minutes_per_500_words"),
        max_daily_hours=payload.get("max_daily_hours", 4.0),
    )
    create_user(user)
    return {"status": "created", "user_id": user.id}


@router.get("/{user_id}")
def get_user_endpoint(user_id: str) -> dict:
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user.__dict__
