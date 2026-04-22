from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import uuid4

from app.models import Assessment, ModuleType, Pace, SessionFeedback, User
from app.services.feedback_service import update_multiplier
from app.services.ingestion_service import upload_and_ingest
from app.services.planning_service import generate_sessions, reschedule
from app.storage import (
    add_assessment,
    create_user,
    get_assessment_due_date,
    get_modules,
    get_sessions,
    get_units_for_user,
    get_user,
    init_db,
    mark_session_complete,
    save_feedback,
    save_sessions,
    scale_open_units_for_user,
    update_user_multiplier,
)


def run_demo() -> dict:
    init_db()
    user = User(id="demo_u1", name="Demo", email="demo@example.com", password_hash="demo", hours_per_day=2, days_per_week=5, pace_setting=Pace.normal, max_daily_hours=2)
    if not get_user(user.id):
        create_user(user)

    upload_and_ingest(
        user,
        module_id="demo_m1",
        module_name="Physics",
        module_type=ModuleType.semester,
        filename="notes.txt",
        file_content=b"Kinematics forces momentum energy waves optics " * 500,
    )

    add_assessment(Assessment(id="demo_a1", module_id="demo_m1", title="Midterm", due_date=date.today() + timedelta(days=12), weight=0.4), user.id)

    modules = get_modules(user.id)
    units = get_units_for_user(user.id)
    deadlines = {m.id: get_assessment_due_date(m.id, user.id) for m in modules}

    before = generate_sessions(user, modules, units, deadlines, date.today())
    save_sessions(before.sessions)

    first = before.sessions[0]
    mark_session_complete(first.id)

    # Feedback: actual was longer than planned.
    ratio = 120 / first.planned_minutes
    save_feedback(
        SessionFeedback(
            id=f"fb-{uuid4().hex[:10]}",
            user_id=user.id,
            session_id=first.id,
            study_unit_id=first.unit_id,
            estimated_time_minutes=first.planned_minutes,
            actual_time_minutes=120,
            ratio=ratio,
            created_at=datetime.utcnow(),
        )
    )

    refreshed_user = get_user(user.id)
    new_multiplier, accepted = update_multiplier(refreshed_user.pace_multiplier, first.planned_minutes, 120, refreshed_user.feedback_samples)
    if accepted:
        update_user_multiplier(user.id, new_multiplier, increment_sample=True)
        scale_open_units_for_user(user.id, new_multiplier / max(refreshed_user.pace_multiplier, 0.0001))

    updated_sessions = get_sessions(user.id)
    after = reschedule(get_user(user.id), modules, get_units_for_user(user.id), deadlines, updated_sessions, date.today() + timedelta(days=1))

    return {
        "before_count": len(before.sessions),
        "after_count": len(after.sessions),
        "new_multiplier": get_user(user.id).pace_multiplier,
    }


if __name__ == "__main__":
    print(run_demo())
