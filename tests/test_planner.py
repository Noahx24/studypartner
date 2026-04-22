from datetime import date, timedelta

from app.models import Assessment, Module, ModuleType, Pace, UnitStatus, User
from app.services.ingestion_service import clean_text, parse_topics
from app.services.personalization_service import update_multiplier_from_feedback
from app.services.planning_service import (
    allocate_time,
    calculate_priority,
    content_to_units,
    estimate_time,
    generate_sessions,
    reschedule,
)
from app.storage import (
    DB_PATH,
    add_assessment,
    create_user,
    get_assessment_due_date,
    get_modules,
    get_units_for_user,
    get_user_multiplier,
    init_db,
    mark_session_complete,
    replace_topics_and_units,
    save_sessions,
)


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def test_estimate_time_and_content_to_units_with_multiplier():
    base = estimate_time(5000, complexity=1.2, pace=Pace.normal, user_multiplier=1.0)
    adjusted = estimate_time(5000, complexity=1.2, pace=Pace.normal, user_multiplier=1.3)
    assert adjusted > base

    units = content_to_units("m1", "Alpha beta gamma " * 400, pace=Pace.normal, user_multiplier=1.2)
    assert len(units) > 0
    assert all(u.module_id == "m1" for u in units)


def test_allocate_time_uses_guidelines_and_overrides():
    week_start = date.today()
    modules = [
        Module(id="m_year", user_id="u1", name="History", module_type=ModuleType.year),
        Module(id="m_sem", user_id="u1", name="Physics", module_type=ModuleType.semester),
    ]
    units = content_to_units("m_year", "Topic " * 2000, Pace.normal) + content_to_units("m_sem", "Topic " * 20000, Pace.normal)
    deadlines = {"m_year": week_start + timedelta(days=45), "m_sem": week_start + timedelta(days=6)}

    targets = allocate_time(modules, units, deadlines, week_start)
    assert targets["m_year"] <= 300
    assert targets["m_sem"] >= 480


def test_calculate_priority_increases_with_deadline_and_started_state():
    today = date.today()
    far = calculate_priority(today + timedelta(days=30), today, 300, False)
    near = calculate_priority(today + timedelta(days=4), today, 300, False)
    started = calculate_priority(today + timedelta(days=4), today, 300, True)

    assert near > far
    assert started > near


def test_generate_and_reschedule_flow():
    user = User(id="u1", name="A", email="a@x.com", hours_per_day=2, days_per_week=5, pace=Pace.normal, max_daily_hours=2)
    modules = [Module(id="m1", user_id="u1", name="Math", module_type=ModuleType.semester)]
    units = content_to_units("m1", "Calculus limits derivatives integrals " * 800, Pace.normal)
    deadlines = {"m1": date.today() + timedelta(days=14)}

    plan = generate_sessions(user, modules, units, deadlines, date.today())
    assert len(plan.sessions) > 0

    first = plan.sessions[0]
    first.status = "completed"
    for u in units:
        if u.id == first.unit_id:
            u.status = UnitStatus.completed

    new_plan = reschedule(user, modules, units, deadlines, plan.sessions, date.today() + timedelta(days=1))
    assert any(s.id == first.id and s.status == "completed" for s in new_plan.sessions)


def test_feedback_updates_multiplier_with_smoothing_and_outlier_guard():
    _fresh_db()
    user = User(id="u1", name="A", email="a@x.com", hours_per_day=2, days_per_week=5, pace=Pace.normal, max_daily_hours=2)
    create_user(user)

    module = Module(id="m1", user_id="u1", name="Physics", module_type=ModuleType.semester)
    units = content_to_units("m1", "Momentum energy motion " * 500, Pace.normal)
    replace_topics_and_units("m1", parse_topics("m1", "Momentum energy motion " * 500), units)

    from app.storage import add_module

    add_module(module)
    add_assessment(Assessment(id="a1", module_id="m1", title="Exam", due_date=date.today() + timedelta(days=10), weight=1.0))

    deadlines = {"m1": get_assessment_due_date("m1")}
    plan = generate_sessions(user, [module], get_units_for_user("u1"), deadlines, date.today())
    save_sessions(plan.sessions)

    s = plan.sessions[0]
    mark_session_complete(s.id)

    result = update_multiplier_from_feedback("u1", s.id, actual_time_minutes=s.planned_minutes * 2)
    multiplier, samples = get_user_multiplier("u1")

    assert result["ignored"] is False
    assert samples == 1
    assert 1.0 < multiplier < 1.5

    outlier = update_multiplier_from_feedback("u1", s.id, actual_time_minutes=s.planned_minutes * 10)
    assert outlier["ignored"] is True


def test_topic_parsing_and_clean_text():
    assert clean_text("A\n\nB\t\tC\x00") == "A B C"
    topics = parse_topics("m1", "INTRO\nTopic one text.\n\n2. Next\nAnother section")
    assert len(topics) > 0
