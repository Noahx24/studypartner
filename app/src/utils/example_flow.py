from __future__ import annotations

from datetime import date, timedelta
import uuid

from app.src.models import Assessment, ModuleType, Pace, User
from app.src.models.services.ingestion_service import upload_and_ingest
from app.src.models.services.personalization_service import update_multiplier_from_feedback
from app.src.models.services.planning_service import generate_sessions, reschedule
from app.storage import (
    add_assessment,
    create_user,
    get_assessment_due_date,
    get_modules,
    get_sessions,
    get_units_for_user,
    get_user_multiplier,
    init_db,
    mark_session_complete,
    save_sessions,
)


def run_demo() -> dict:
    init_db()
    suffix = uuid.uuid4().hex[:8]
    user = User(id=f"demo_u1_{suffix}", name="Demo", email=f"demo_{suffix}@example.com", hours_per_day=2, days_per_week=5, pace=Pace.normal, max_daily_hours=2)
    create_user(user)

    upload_and_ingest(
        user,
        module_id=f"demo_m1_{suffix}",
        module_name="Physics",
        module_type=ModuleType.semester,
        filename="notes.txt",
        file_content=b"Kinematics forces momentum energy waves optics " * 500,
    )

    module_id = f"demo_m1_{suffix}"
    add_assessment(Assessment(id=f"demo_a1_{suffix}", module_id=module_id, title="Midterm", due_date=date.today() + timedelta(days=12), weight=0.4))

    modules = get_modules(user.id)
    units = get_units_for_user(user.id)
    deadlines = {m.id: get_assessment_due_date(m.id) for m in modules}

    before = generate_sessions(user, modules, units, deadlines, date.today())
    save_sessions(before.sessions)

    first_session = before.sessions[0]
    mark_session_complete(first_session.id)
    feedback = update_multiplier_from_feedback(user.id, first_session.id, actual_time_minutes=first_session.planned_minutes * 2)

    updated_sessions = get_sessions(user.id)
    after = reschedule(user, modules, get_units_for_user(user.id), deadlines, updated_sessions, date.today() + timedelta(days=1))
    multiplier, samples = get_user_multiplier(user.id)

    return {
        "before_first_estimate": first_session.planned_minutes,
        "feedback": feedback,
        "multiplier": multiplier,
        "samples": samples,
        "before": [s.__dict__ | {"session_date": s.session_date.isoformat()} for s in before.sessions],
        "after": [s.__dict__ | {"session_date": s.session_date.isoformat()} for s in after.sessions],
    }


if __name__ == "__main__":
    result = run_demo()
    print({"multiplier": result["multiplier"], "samples": result["samples"]})
