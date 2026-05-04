from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.src.models import Pace, User
from app.src.models.services.auth_service import create_token, verify_password
from app.src.utils.auth import get_current_user
from app.storage import create_user, get_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


class CreateUserRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    hours_per_day: float = Field(..., gt=0, le=24)
    days_per_week: int = Field(..., ge=1, le=7)
    pace: str = "normal"
    custom_minutes_per_500_words: int | None = Field(default=None, gt=0, le=600)
    max_daily_hours: float = Field(default=4.0, gt=0, le=24)


class LoginRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    token: str = Field(..., min_length=1)


@router.post("")
def create_user_endpoint(body: CreateUserRequest) -> dict:
    """Register a new user. ID is caller-supplied (platform-managed identities)."""
    user = User(
        id=body.id,
        name=body.name,
        email=body.email,
        hours_per_day=body.hours_per_day,
        days_per_week=body.days_per_week,
        pace=Pace(body.pace),
        custom_minutes_per_500_words=body.custom_minutes_per_500_words,
        max_daily_hours=body.max_daily_hours,
    )
    create_user(user)
    logger.info("User created: %s", user.id)
    return {"status": "created", "user_id": user.id}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)) -> dict:
    """Return the profile of the authenticated user."""
    return {k: v for k, v in current_user.__dict__.items() if not k.startswith("_")}


@router.get("/{user_id}")
def get_user_endpoint(user_id: str, current_user: User = Depends(get_current_user)) -> dict:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {k: v for k, v in user.__dict__.items() if not k.startswith("_")}
