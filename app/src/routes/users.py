from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.src.models import Pace, User
from app.storage import create_user, get_user, update_user

router = APIRouter(prefix="/users", tags=["users"])


def _serialize(user: User) -> dict:
    data = user.__dict__.copy()
    data["pace"] = user.pace.value
    return data


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
    return _serialize(user)


@router.patch("/{user_id}")
def update_user_endpoint(user_id: str, payload: dict) -> dict:
    if not get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    fields = dict(payload)
    if "pace" in fields and fields["pace"] is not None:
        try:
            fields["pace"] = Pace(fields["pace"]).value
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid pace") from exc
    if "hours_per_day" in fields and fields["hours_per_day"] is not None:
        if not 0.5 <= float(fields["hours_per_day"]) <= 12:
            raise HTTPException(status_code=400, detail="hours_per_day must be 0.5–12")
    if "days_per_week" in fields and fields["days_per_week"] is not None:
        if not 1 <= int(fields["days_per_week"]) <= 7:
            raise HTTPException(status_code=400, detail="days_per_week must be 1–7")
    updated = update_user(user_id, fields)
    return {"status": "updated", "user": _serialize(updated)}
