from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from datetime import date, datetime, timedelta
from itertools import count
import math
import re

from app.src.models import Module, ModuleType, Pace, Session, StudyUnit, UnitStatus, User, WeeklyModuleSummary, WeeklyPlan


PACE_MINUTES_PER_500_WORDS = {Pace.slow: 30, Pace.normal: 22, Pace.fast: 16}
WEEKLY_RECOMMENDATION_MINUTES = {ModuleType.year: (240, 360), ModuleType.semester: (360, 480)}


def content_to_units(module_id: str, raw_text: str, pace: Pace, custom_minutes_per_500_words: int | None = None, user_multiplier: float = 1.0) -> list[StudyUnit]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n+", raw_text) if b.strip()] or [raw_text]
    units: list[StudyUnit] = []
    for i, block in enumerate(blocks, start=1):
        words = re.findall(r"\w+", block)
        for part_idx in range(0, len(words), 550):
            part = words[part_idx : part_idx + 550]
            if not part:
                continue
            long_ratio = sum(1 for w in part if len(w) > 8) / len(part)
            complexity = round(min(2.0, 0.9 + long_ratio + (sum(len(w) for w in part) / len(part) / 12)), 2)
            minutes = estimate_time(len(part), complexity, pace, custom_minutes_per_500_words, user_multiplier)
            units.append(
                StudyUnit(
                    id=f"{module_id}-unit-{len(units)+1}",
                    module_id=module_id,
                    topic_id=f"{module_id}-topic-{len(units)+1}",
                    title=f"Topic {i}{'.'+str(part_idx//550+1) if part_idx else ''}",
                    estimated_minutes=minutes,
                    source_word_count=len(part),
                    complexity_score=complexity,
                    status=UnitStatus.not_started,
                )
            )
    return units


def estimate_time(word_count: int, complexity: float, pace: Pace, custom_minutes_per_500_words: int | None = None, user_multiplier: float = 1.0) -> int:
    base = custom_minutes_per_500_words if (pace == Pace.custom and custom_minutes_per_500_words) else PACE_MINUTES_PER_500_WORDS[pace]
    words_based = (word_count / 275) * 5
    raw = words_based * complexity * (base / PACE_MINUTES_PER_500_WORDS[Pace.normal]) * user_multiplier
    return max(20, int(math.ceil(raw / 5) * 5))


def calculate_priority(deadline: date, current_day: date, remaining_minutes: int, started: bool) -> float:
    days_left = max(1, (deadline - current_day).days)
    base = (remaining_minutes / days_left) + (25 / days_left)
    continuity = 1.15 if started else 1.0
    return base * continuity


def allocate_time(modules: list[Module], units: list[StudyUnit], deadlines: dict[str, date], week_start: date) -> dict[str, int]:
    by_module = defaultdict(int)
    for u in units:
        if u.status != UnitStatus.completed:
            by_module[u.module_id] += u.estimated_minutes

    targets = {}
    for m in modules:
        low, high = WEEKLY_RECOMMENDATION_MINUTES[m.module_type]
        remaining = by_module.get(m.id, 0)
        days_left = max(1, (deadlines[m.id] - week_start).days)
        midpoint = int((low + high) / 2)

        if remaining <= low:
            targets[m.id] = remaining
        elif days_left <= 14:
            boost = int(high * ((14 - days_left) / 14))
            targets[m.id] = min(remaining, high + boost)
        else:
            targets[m.id] = min(remaining, midpoint)
    return targets


def generate_sessions(user: User, modules: list[Module], units: list[StudyUnit], deadlines: dict[str, date], start_date: date) -> WeeklyPlan:
    targets = allocate_time(modules, units, deadlines, start_date)
    unit_pool = [replace(u) for u in units if u.status != UnitStatus.completed]
    units_by_module: dict[str, list[StudyUnit]] = defaultdict(list)
    for u in unit_pool:
        units_by_module[u.module_id].append(u)

    days = []
    cursor = start_date
    while len(days) < 7:
        if cursor.weekday() < user.days_per_week:
            days.append(cursor)
        cursor += timedelta(days=1)

    daily_cap = min(int(user.hours_per_day * 60), int(user.max_daily_hours * 60))
    allocated = defaultdict(int)
    sessions: list[Session] = []
    sid = count(1)

    for d in days:
        remaining_today = daily_cap
        while remaining_today >= 20:
            candidates: list[tuple[str, float]] = []
            for module in modules:
                available = units_by_module.get(module.id, [])
                if not available:
                    continue
                rem = sum(u.estimated_minutes for u in available)
                started = any(u.status == UnitStatus.in_progress for u in available)
                priority = calculate_priority(deadlines[module.id], d, rem, started)

                target = max(20, targets.get(module.id, 0))
                below_target_ratio = max(0.0, (target - allocated[module.id]) / target)
                boost = 1.0 + 0.35 * below_target_ratio
                if allocated[module.id] > target and (deadlines[module.id] - d).days > 10:
                    boost *= 0.8

                candidates.append((module.id, priority * boost))

            if not candidates:
                break
            candidates.sort(key=lambda x: x[1], reverse=True)
            mod_id = candidates[0][0]
            available = sorted(units_by_module[mod_id], key=lambda u: (u.status != UnitStatus.in_progress, -u.estimated_minutes))
            unit = available[0]

            alloc = int(math.floor(min(remaining_today, unit.estimated_minutes, 90) / 5) * 5)
            if alloc < 20:
                break

            sessions.append(
                Session(
                    id=f"s{next(sid)}",
                    user_id=user.id,
                    module_id=mod_id,
                    unit_id=unit.id,
                    session_date=d,
                    planned_minutes=alloc,
                    status="planned",
                )
            )
            allocated[mod_id] += alloc
            remaining_today -= alloc
            unit.estimated_minutes -= alloc
            if unit.estimated_minutes <= 0:
                unit.status = UnitStatus.completed
                units_by_module[mod_id].remove(unit)
            else:
                unit.status = UnitStatus.in_progress

    summaries = [
        WeeklyModuleSummary(
            module_id=m.id,
            recommended_min_minutes=WEEKLY_RECOMMENDATION_MINUTES[m.module_type][0],
            recommended_max_minutes=WEEKLY_RECOMMENDATION_MINUTES[m.module_type][1],
            planned_minutes=allocated[m.id],
        )
        for m in modules
    ]
    return WeeklyPlan(user_id=user.id, week_start=days[0], week_end=days[-1], sessions=sessions, summaries=summaries, generated_at=datetime.utcnow())


def reschedule(user: User, modules: list[Module], units: list[StudyUnit], deadlines: dict[str, date], existing_sessions: list[Session], from_date: date) -> WeeklyPlan:
    locked = [s for s in existing_sessions if s.status == "completed"]
    remaining_units = [replace(u) for u in units if u.status != UnitStatus.completed]
    new_plan = generate_sessions(user, modules, remaining_units, deadlines, from_date)
    new_plan.sessions = locked + new_plan.sessions
    return new_plan
