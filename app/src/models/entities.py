from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import Enum
from typing import Literal


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


class PackStatus(str, Enum):
    not_generated = "not_generated"
    generating = "generating"
    generated = "generated"
    failed = "failed"


class AssessmentStatus(str, Enum):
    open = "open"
    submitted = "submitted"
    graded = "graded"


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
    password_hash: str | None = None


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
    status: AssessmentStatus = AssessmentStatus.open
    moodle_id: str | None = None


# ---- Legacy structuring (retained for backward compatibility) ----

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


# ---- New core learning model ----

@dataclass
class Subtopic:
    id: str
    learning_unit_id: str
    ordinal: int
    title: str
    content: str
    word_count: int
    resource_weight: float = 0.0
    effort_score: float = 0.0


@dataclass
class LearningUnit:
    """Top-level chapter/unit. Example: 'CHAPTER 1: INTRODUCTION'."""
    id: str
    module_id: str
    ordinal: int
    topic: str
    subtopics: list[Subtopic] = field(default_factory=list)
    source_span: dict | None = None


@dataclass
class AIFeatureSet:
    summaries: bool = True
    subtopic_quiz: bool = True
    topic_quiz: bool = True


@dataclass
class UserSelection:
    id: str
    user_id: str
    module_id: str
    subtopic_ids: list[str]
    ai_features: AIFeatureSet
    low_data_mode: bool = False
    updated_at: datetime = field(default_factory=_utcnow)


@dataclass
class AIArtifact:
    id: str
    scope: Literal["summary", "subtopic_quiz", "topic_quiz"]
    ref_id: str
    content_hash: str
    prompt_hash: str
    payload: dict
    model: str
    created_at: datetime = field(default_factory=_utcnow)


@dataclass
class StudyPack:
    id: str
    module_id: str
    user_id: str
    selection_id: str
    status: PackStatus
    payload: dict | None = None
    byte_size: int | None = None
    version: int = 1
    generated_at: datetime | None = None
    error: str | None = None


# ---- Planning ----

@dataclass
class Session:
    id: str
    user_id: str
    module_id: str
    unit_id: str
    session_date: date
    planned_minutes: int
    status: Literal["planned", "completed", "missed"] = "planned"
    learning_unit_id: str | None = None
    subtopic_id: str | None = None


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


# ---- Moodle ----

@dataclass
class MoodleAccount:
    user_id: str
    base_url: str
    token: str
    last_sync: datetime | None = None


@dataclass
class MoodleResource:
    id: str
    module_id: str
    title: str
    type: str
    file_size: int | None = None
    url: str | None = None
    downloaded_at: datetime | None = None
