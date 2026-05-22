from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.src.models import Pace, User
from app.src.models.services.auth_service import create_token, hash_password, verify_password
from app.src.utils.auth import get_current_user
from app.src.utils.ratelimit import limiter
from app.storage import create_user, get_user, get_user_by_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=8, max_length=128)
    hours_per_day: float = Field(default=2.0, gt=0, le=24)
    days_per_week: int = Field(default=5, ge=1, le=7)
    pace: str = "normal"
    custom_minutes_per_500_words: int | None = Field(default=None, gt=0, le=600)
    max_daily_hours: float = Field(default=4.0, gt=0, le=24)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=1, max_length=128)


@router.post("/register")
@limiter.limit("5/hour")
def register_endpoint(request: Request, body: RegisterRequest) -> dict:
    """Create a new account. Returns a JWT on success."""
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        id=str(uuid.uuid4()),
        name=body.name,
        email=body.email,
        hours_per_day=body.hours_per_day,
        days_per_week=body.days_per_week,
        pace=Pace(body.pace),
        custom_minutes_per_500_words=body.custom_minutes_per_500_words,
        max_daily_hours=body.max_daily_hours,
        password_hash=hash_password(body.password),
    )
    create_user(user)
    token = create_token(user.id)
    logger.info("User registered: %s", user.id)
    return {"token": token, "user_id": user.id}


@router.post("/login")
@limiter.limit("10/minute")
def login_endpoint(request: Request, body: LoginRequest) -> dict:
    """Authenticate with email + password. Returns a JWT on success."""
    user = get_user_by_email(body.email)
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.id)
    return {"token": token, "user_id": user.id}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)) -> dict:
    """Return the profile of the authenticated user."""
    return _serialize(current_user)


@router.get("/{user_id}")
def get_user_endpoint(user_id: str, current_user: User = Depends(get_current_user)) -> dict:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize(user)


def _serialize(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "hours_per_day": user.hours_per_day,
        "days_per_week": user.days_per_week,
        "pace": user.pace.value,
        "custom_minutes_per_500_words": user.custom_minutes_per_500_words,
        "max_daily_hours": user.max_daily_hours,
    }
