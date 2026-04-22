from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.models import SessionFeedback, User
from app.services.feedback_service import update_multiplier
from app.services.planning_service import generate_sessions, reschedule
from app.storage import (
    clear_planned_sessions,
    get_assessment_due_date,
    get_modules,
    get_session,
    get_sessions,
    get_unit,
    get_units_for_user,
    mark_session_complete,
    save_feedback,
    save_sessions,
    scale_open_units_for_user,
    update_user_multiplier,
)
from app.utils.auth import get_current_user

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("/generate")
def generate_plan_endpoint(payload: dict, current_user: User = Depends(get_current_user)) -> dict:
    start_date = date.fromisoformat(payload["start_date"])

    modules = get_modules(current_user.id)
    units = get_units_for_user(current_user.id)
    deadlines = {m.id: get_assessment_due_date(m.id, current_user.id) for m in modules}

    plan = generate_sessions(current_user, modules, units, deadlines, start_date)
    clear_planned_sessions(current_user.id, start_date)
    save_sessions(plan.sessions)

    return {
        "week_start": plan.week_start.isoformat(),
        "week_end": plan.week_end.isoformat(),
        "sessions": [s.__dict__ | {"session_date": s.session_date.isoformat()} for s in plan.sessions],
        "summaries": [s.__dict__ for s in plan.summaries],
        "pace_multiplier": current_user.pace_multiplier,
    }


@router.get("/daily/{for_date}")
def daily_plan_endpoint(for_date: str, current_user: User = Depends(get_current_user)) -> dict:
    d = date.fromisoformat(for_date)
    sessions = [s for s in get_sessions(current_user.id, d, d) if s.status == "planned"]
    return {"date": for_date, "sessions": [s.__dict__ | {"session_date": s.session_date.isoformat()} for s in sessions]}


@router.post("/sessions/{session_id}/complete")
def complete_session_endpoint(session_id: str, current_user: User = Depends(get_current_user)) -> dict:
    mark_session_complete(session_id, current_user.id)
    return {"status": "completed", "session_id": session_id}


@router.post("/session/feedback")
def session_feedback_endpoint(payload: dict, current_user: User = Depends(get_current_user)) -> dict:
    session_id = payload["session_id"]
    actual_time_minutes = int(payload["actual_time_minutes"])
    session = get_session(session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "completed":
        raise HTTPException(status_code=400, detail="Session feedback requires completed session")
    if actual_time_minutes <= 0 or actual_time_minutes > 600:
        raise HTTPException(status_code=400, detail="actual_time_minutes must be between 1 and 600")

    unit = get_unit(session.unit_id, current_user.id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    old_multiplier = current_user.pace_multiplier
    new_multiplier, accepted = update_multiplier(
        old_multiplier=old_multiplier,
        estimated_minutes=session.planned_minutes,
        actual_minutes=actual_time_minutes,
        feedback_samples=current_user.feedback_samples,
    )

    ratio = actual_time_minutes / max(1, session.planned_minutes)
    feedback = SessionFeedback(
        id=f"fb-{uuid4().hex[:12]}",
        user_id=current_user.id,
        session_id=session.id,
        study_unit_id=unit.id,
        estimated_time_minutes=session.planned_minutes,
        actual_time_minutes=actual_time_minutes,
        ratio=ratio,
        created_at=datetime.utcnow(),
    )
    save_feedback(feedback)

    if accepted:
        update_user_multiplier(current_user.id, new_multiplier, increment_sample=True)
        scale_open_units_for_user(current_user.id, new_multiplier / max(old_multiplier, 0.0001))
        pace_message = f"Estimates adjusted based on your pace ({new_multiplier:.2f}x)."
    else:
        pace_message = "Feedback logged; no multiplier change (outlier or invalid ratio)."

    return {
        "session_id": session.id,
        "estimated_time_minutes": session.planned_minutes,
        "actual_time_minutes": actual_time_minutes,
        "accepted": accepted,
        "old_multiplier": round(old_multiplier, 4),
        "new_multiplier": round(new_multiplier, 4),
        "pace_message": pace_message,
    }


@router.post("/reschedule")
def reschedule_endpoint(payload: dict, current_user: User = Depends(get_current_user)) -> dict:
    from_date = date.fromisoformat(payload["from_date"])

    modules = get_modules(current_user.id)
    units = get_units_for_user(current_user.id)
    existing_sessions = get_sessions(current_user.id)
    deadlines = {m.id: get_assessment_due_date(m.id, current_user.id) for m in modules}

    plan = reschedule(current_user, modules, units, deadlines, existing_sessions, from_date)
    clear_planned_sessions(current_user.id, from_date)
    save_sessions([s for s in plan.sessions if s.status == "planned"])

    return {
        "week_start": plan.week_start.isoformat(),
        "week_end": plan.week_end.isoformat(),
        "sessions": [s.__dict__ | {"session_date": s.session_date.isoformat()} for s in plan.sessions],
        "summaries": [s.__dict__ for s in plan.summaries],
        "pace_multiplier": current_user.pace_multiplier,
    }
