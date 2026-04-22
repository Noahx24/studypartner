from datetime import date, timedelta

from app.models import Module, ModuleType, Pace, UnitStatus, User
from app.services.auth_service import create_token, hash_password, verify_token
from app.services.feedback_service import adjusted_minutes, update_multiplier
from app.services.ingestion_service import clean_text, parse_topics
from app.services.planning_service import (
    allocate_time,
    calculate_priority,
    content_to_units,
    estimate_time,
    generate_sessions,
    reschedule,
)


def test_estimate_time_and_content_to_units_with_multiplier():
    base = estimate_time(2000, complexity=1.2, pace=Pace.normal, pace_multiplier=1.0)
    adjusted = estimate_time(2000, complexity=1.2, pace=Pace.normal, pace_multiplier=1.3)
    assert adjusted > base

    units = content_to_units("m1", "Alpha beta gamma " * 400, pace=Pace.normal, pace_multiplier=1.2)
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


def test_generate_and_reschedule_flow():
    user = User(
        id="u1",
        name="A",
        email="a@x.com",
        password_hash="x",
        hours_per_day=2,
        days_per_week=5,
        pace_setting=Pace.normal,
        max_daily_hours=2,
    )
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


def test_feedback_multiplier_per_user_is_isolated():
    a_mult, a_ok = update_multiplier(old_multiplier=1.0, estimated_minutes=45, actual_minutes=90, feedback_samples=4)
    b_mult, b_ok = update_multiplier(old_multiplier=1.0, estimated_minutes=45, actual_minutes=30, feedback_samples=4)

    assert a_ok and b_ok
    assert a_mult > 1.0
    assert b_mult < 1.0
    assert adjusted_minutes(45, a_mult) > adjusted_minutes(45, b_mult)


def test_topic_parsing_clean_text_and_auth_token():
    assert clean_text("A\n\nB\t\tC\x00") == "A B C"
    topics = parse_topics("m1", "INTRO\nTopic one text.\n\n2. Next\nAnother section")
    assert len(topics) > 0

    token = create_token("u1")
    assert verify_token(token) == "u1"
    assert hash_password("abc") != "abc"
