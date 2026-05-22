from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import logging
import os
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.src.models import Pace, User
from app.src.models.services.auth_service import create_token, hash_password, verify_password
from app.src.utils.auth import get_current_user
from app.src.utils.mailer import send_email
from app.src.utils.ratelimit import limiter
from app.src.utils.time import utcnow_iso
from app.storage import (
    consume_password_reset_token,
    create_user,
    get_user,
    get_user_by_email,
    save_password_reset_token,
    update_password_hash,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    # 12 chars minimum (OWASP 2023 recommendation; aligns with the
    # JWT secret floor). Complexity is checked separately in
    # _validate_password — Pydantic's pattern would force a regex
    # we'd struggle to reason about for edge cases.
    password: str = Field(..., min_length=12, max_length=128)
    hours_per_day: float = Field(default=2.0, gt=0, le=24)
    days_per_week: int = Field(default=5, ge=1, le=7)
    pace: str = "normal"
    custom_minutes_per_500_words: int | None = Field(default=None, gt=0, le=600)
    max_daily_hours: float = Field(default=4.0, gt=0, le=24)


# Top obvious-bad passwords. Not exhaustive (rockyou.txt is 14M
# entries); enough to block the laziest attacks at signup and force
# users off "password123!" without a network round-trip to HIBP.
_COMMON_PASSWORDS = frozenset({
    "password", "password1", "password123", "passw0rd", "passw0rd!",
    "qwerty", "qwerty123", "iloveyou", "letmein", "welcome",
    "12345678", "123456789", "1234567890", "qwertyuiop", "abc123",
    "monkey123", "dragon", "football", "baseball", "trustno1",
    "studypartner", "studypartner1", "student", "student123",
    "unisa", "unisa123", "moodle", "moodle123",
})


def _validate_password(password: str) -> None:
    """Reject common / low-entropy passwords beyond length.

    Required: at least one letter and one digit (rules out '12345...'
    or 'aaaaaaaaa...'); not in the obvious-bad list; not a substring
    of the user's own email (covered by callers when relevant).
    """
    if password.lower() in _COMMON_PASSWORDS:
        raise HTTPException(
            status_code=400,
            detail="That password is on every common-password list. Pick something else.",
        )
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_letter and has_digit):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least one letter and one digit.",
        )


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=32, max_length=128)
    new_password: str = Field(..., min_length=12, max_length=128)


_PASSWORD_RESET_TTL = timedelta(minutes=30)


def _hash_reset_token(token: str) -> str:
    """Token stored at-rest is SHA-256 of the user-facing token. The
    plain token only exists in the email; a DB leak doesn't grant
    password resets."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.post("/register")
@limiter.limit("5/hour")
def register_endpoint(request: Request, body: RegisterRequest) -> dict:
    """Create a new account. Returns a JWT on success."""
    _validate_password(body.password)
    # Reject passwords that contain the user's email local-part —
    # alice@x.test with password "alice2024!!" is trivial to guess.
    local = body.email.split("@", 1)[0].lower()
    if local and len(local) >= 3 and local in body.password.lower():
        raise HTTPException(
            status_code=400,
            detail="Password must not contain your email address.",
        )
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


@router.post("/password/forgot")
@limiter.limit("3/hour")
def forgot_password_endpoint(request: Request, body: ForgotPasswordRequest) -> dict:
    """Start the password-reset flow.

    Returns 200 regardless of whether the email exists, to prevent
    email enumeration. If the email does exist, a short-lived reset
    token is emailed to the user (via the configured mailer).
    """
    user = get_user_by_email(body.email)
    if user:
        token = secrets.token_urlsafe(32)
        token_hash = _hash_reset_token(token)
        now = datetime.now(timezone.utc)
        save_password_reset_token(
            token_hash=token_hash,
            user_id=user.id,
            created_at_iso=now.isoformat(),
            expires_at_iso=(now + _PASSWORD_RESET_TTL).isoformat(),
        )
        reset_url_template = os.environ.get(
            "STUDYPARTNER_PASSWORD_RESET_URL",
            "studypartner://reset-password?token={token}",
        )
        send_email(
            to=user.email,
            subject="StudyPartner: reset your password",
            body=(
                f"Hi {user.name},\n\n"
                "Someone asked to reset your StudyPartner password. If that was you, "
                f"open this link within the next 30 minutes:\n\n"
                f"{reset_url_template.format(token=token)}\n\n"
                "If it wasn't you, ignore this email; your password stays the same."
            ),
        )
    return {"status": "if the email exists, a reset link was sent"}


@router.post("/password/reset")
@limiter.limit("10/hour")
def reset_password_endpoint(request: Request, body: ResetPasswordRequest) -> dict:
    """Complete a password reset using the token emailed in /forgot.

    Single-use, 30-minute TTL. Token format: 32+ url-safe base64 chars
    (256 bits of entropy). Stored under SHA-256 in the DB.
    """
    _validate_password(body.new_password)
    token_hash = _hash_reset_token(body.token)
    user_id = consume_password_reset_token(token_hash, utcnow_iso())
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Reset token is invalid, expired, or already used.",
        )
    update_password_hash(user_id, hash_password(body.new_password))
    logger.info("Password reset for user %s", user_id)
    return {"status": "password updated", "user_id": user_id}


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
