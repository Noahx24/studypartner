from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.src.models import User
from app.src.models.services.personalization_service import update_multiplier_from_feedback
from app.src.models.services.planning_service import generate_sessions, reschedule
from app.src.utils.auth import get_current_user
from app.storage import (
    clear_planned_sessions,
    get_assessment_due_date,
    get_module_study_units,
    get_modules,
    get_sessions,
    get_units_for_user,
    get_user,
    get_user_multiplier,
    mark_session_complete,
    save_sessions,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/plans", tags=["plans"])


class GeneratePlanRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    start_date: str


class FeedbackRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)
    actual_time_minutes: int = Field(..., gt=0, le=600)


class RescheduleRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    from_date: str


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field} format (expected YYYY-MM-DD)")


@router.post("/generate")
def generate_plan_endpoint(
    body: GeneratePlanRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    start_date = _parse_date(body.start_date, "start_date")
    user = get_user(body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    modules = get_modules(body.user_id)
    units = get_units_for_user(body.user_id)
    deadlines = {m.id: get_assessment_due_date(m.id) for m in modules}

    plan = generate_sessions(user, modules, units, deadlines, start_date)
    clear_planned_sessions(body.user_id, start_date)
    save_sessions(plan.sessions)

    multiplier, samples = get_user_multiplier(body.user_id)
    return {
        "week_start": plan.week_start.isoformat(),
        "week_end": plan.week_end.isoformat(),
        "sessions": [s.__dict__ | {"session_date": s.session_date.isoformat()} for s in plan.sessions],
        "summaries": [s.__dict__ for s in plan.summaries],
        "pace_feedback": {
            "multiplier": round(multiplier, 3),
            "samples": samples,
            "message": (
                f"You tend to take {multiplier:.2f}x of baseline estimates."
                if samples >= 3
                else "Estimates are learning from your pace."
            ),
        },
    }


def _serialize_sessions(user_id: str, sessions: list) -> list[dict]:
    """Session rows carry only ids; the client renders a human card
    (unit title + module name + minutes), so join the names in here."""
    module_names = {m.id: m.name for m in get_modules(user_id)}
    unit_titles: dict[str, str] = {}
    for mod_id in {s.module_id for s in sessions}:
        for u in get_module_study_units(mod_id)["study_units"]:
            unit_titles[u["id"]] = u["title"]
    return [
        s.__dict__
        | {
            "session_date": s.session_date.isoformat(),
            "title": unit_titles.get(s.unit_id) or module_names.get(s.module_id, "Study session"),
            "subject": module_names.get(s.module_id),
            "duration_minutes": s.planned_minutes,
        }
        for s in sessions
    ]


@router.get("/daily/{user_id}/{for_date}")
def daily_plan_endpoint(
    user_id: str,
    for_date: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    d = _parse_date(for_date, "for_date")
    sessions = [s for s in get_sessions(user_id, d, d) if s.status == "planned"]
    return {"date": for_date, "sessions": _serialize_sessions(user_id, sessions)}


@router.get("/range/{user_id}")
def sessions_range_endpoint(
    user_id: str,
    from_date: str,
    to_date: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """All sessions (any status) in [from_date, to_date] — the calendar
    month view needs completed ones too, to mark progress dots."""
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    d1 = _parse_date(from_date, "from_date")
    d2 = _parse_date(to_date, "to_date")
    sessions = get_sessions(user_id, d1, d2)
    return {"sessions": _serialize_sessions(user_id, sessions)}


@router.post("/sessions/{session_id}/complete")
def complete_session_endpoint(
    session_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    mark_session_complete(session_id)
    return {"status": "completed", "session_id": session_id}


@router.post("/session/feedback")
def session_feedback_endpoint(
    body: FeedbackRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = update_multiplier_from_feedback(
            user_id=body.user_id,
            session_id=body.session_id,
            actual_time_minutes=body.actual_time_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.post("/reschedule")
def reschedule_endpoint(
    body: RescheduleRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    from_date = _parse_date(body.from_date, "from_date")
    user = get_user(body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    modules = get_modules(body.user_id)
    units = get_units_for_user(body.user_id)
    existing_sessions = get_sessions(body.user_id)
    deadlines = {m.id: get_assessment_due_date(m.id) for m in modules}

    plan = reschedule(user, modules, units, deadlines, existing_sessions, from_date)
    clear_planned_sessions(body.user_id, from_date)
    save_sessions([s for s in plan.sessions if s.status == "planned"])

    return {
        "week_start": plan.week_start.isoformat(),
        "week_end": plan.week_end.isoformat(),
        "sessions": [s.__dict__ | {"session_date": s.session_date.isoformat()} for s in plan.sessions],
        "summaries": [s.__dict__ for s in plan.summaries],
    }
