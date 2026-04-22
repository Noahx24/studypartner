from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Literal


class Pace(str, Enum):
    slow = "slow"
    normal = "normal"
    fast = "fast"
    custom = "custom"


class UnitStatus(str, Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"


class ModuleType(str, Enum):
    year = "year"
    semester = "semester"


@dataclass
class User:
    id: str
    name: str
    email: str
    hours_per_day: float
    days_per_week: int
    pace: Pace = Pace.normal
    custom_minutes_per_500_words: int | None = None
    max_daily_hours: float = 4.0


@dataclass
class Module:
    id: str
    user_id: str
    name: str
    module_type: ModuleType


@dataclass
class Assessment:
    id: str
    module_id: str
    title: str
    due_date: date
    weight: float = 1.0


@dataclass
class StudyTopic:
    id: str
    module_id: str
    title: str
    content: str
    word_count: int
    page_span: int | None = None


@dataclass
class StudyUnit:
    id: str
    module_id: str
    topic_id: str
    title: str
    estimated_minutes: int
    source_word_count: int
    complexity_score: float
    status: UnitStatus = UnitStatus.not_started


@dataclass
class Session:
    id: str
    user_id: str
    module_id: str
    unit_id: str
    session_date: date
    planned_minutes: int
    status: Literal["planned", "completed", "missed"] = "planned"


@dataclass
class WeeklyModuleSummary:
    module_id: str
    recommended_min_minutes: int
    recommended_max_minutes: int
    planned_minutes: int


@dataclass
class WeeklyPlan:
    user_id: str
    week_start: date
    week_end: date
    sessions: list[Session]
    summaries: list[WeeklyModuleSummary]
    generated_at: datetime
