from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
import sqlite3

from .src.models import Assessment, Module, ModuleType, Pace, Session, StudyTopic, StudyUnit, UnitStatus, User


DB_PATH = Path("data/studypartner.db")
UPLOAD_ROOT = Path("data/uploads")


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                hours_per_day REAL NOT NULL,
                days_per_week INTEGER NOT NULL,
                pace TEXT NOT NULL,
                custom_minutes_per_500_words INTEGER,
                max_daily_hours REAL NOT NULL,
                pace_multiplier REAL NOT NULL DEFAULT 1.0,
                feedback_samples INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS modules (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                module_type TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assessments (
                id TEXT PRIMARY KEY,
                module_id TEXT NOT NULL,
                title TEXT NOT NULL,
                due_date TEXT NOT NULL,
                weight REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                raw_text TEXT NOT NULL,
                page_count INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS topics (
                id TEXT PRIMARY KEY,
                module_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                word_count INTEGER NOT NULL,
                page_span INTEGER
            );

            CREATE TABLE IF NOT EXISTS study_units (
                id TEXT PRIMARY KEY,
                module_id TEXT NOT NULL,
                topic_id TEXT NOT NULL,
                title TEXT NOT NULL,
                estimated_minutes INTEGER NOT NULL,
                source_word_count INTEGER NOT NULL,
                complexity_score REAL NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                unit_id TEXT NOT NULL,
                session_date TEXT NOT NULL,
                planned_minutes INTEGER NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS session_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                study_unit_id TEXT NOT NULL,
                estimated_time_minutes INTEGER NOT NULL,
                actual_time_minutes INTEGER NOT NULL,
                ratio REAL NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )


def create_user(user: User) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO users (id, name, email, hours_per_day, days_per_week, pace, custom_minutes_per_500_words, max_daily_hours, pace_multiplier, feedback_samples)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1.0, 0)
            """,
            (
                user.id,
                user.name,
                user.email,
                user.hours_per_day,
                user.days_per_week,
                user.pace.value,
                user.custom_minutes_per_500_words,
                user.max_daily_hours,
            ),
        )


def get_user(user_id: str) -> User | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return User(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        hours_per_day=row["hours_per_day"],
        days_per_week=row["days_per_week"],
        pace=Pace(row["pace"]),
        custom_minutes_per_500_words=row["custom_minutes_per_500_words"],
        max_daily_hours=row["max_daily_hours"],
    )


def get_user_multiplier(user_id: str) -> tuple[float, int]:
    with get_connection() as conn:
        row = conn.execute("SELECT pace_multiplier, feedback_samples FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return 1.0, 0
    return float(row["pace_multiplier"]), int(row["feedback_samples"])


def update_user_multiplier(user_id: str, multiplier: float, feedback_samples: int) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET pace_multiplier = ?, feedback_samples = ? WHERE id = ?",
            (multiplier, feedback_samples, user_id),
        )


def add_feedback(user_id: str, session_id: str, study_unit_id: str, estimated_time_minutes: int, actual_time_minutes: int, ratio: float) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO session_feedback (user_id, session_id, study_unit_id, estimated_time_minutes, actual_time_minutes, ratio, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, session_id, study_unit_id, estimated_time_minutes, actual_time_minutes, ratio, datetime.utcnow().isoformat()),
        )


def get_feedback_samples(user_id: str, limit: int = 20) -> list[sqlite3.Row]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM session_feedback WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return rows


def add_module(module: Module) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO modules (id, user_id, name, module_type) VALUES (?, ?, ?, ?)",
            (module.id, module.user_id, module.name, module.module_type.value),
        )


def get_modules(user_id: str) -> list[Module]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM modules WHERE user_id = ? ORDER BY id", (user_id,)).fetchall()
    return [Module(id=r["id"], user_id=r["user_id"], name=r["name"], module_type=ModuleType(r["module_type"])) for r in rows]


def add_assessment(assessment: Assessment) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO assessments (id, module_id, title, due_date, weight) VALUES (?, ?, ?, ?, ?)",
            (assessment.id, assessment.module_id, assessment.title, assessment.due_date.isoformat(), assessment.weight),
        )


def get_assessments_for_module(module_id: str) -> list[Assessment]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM assessments WHERE module_id = ? ORDER BY due_date", (module_id,)).fetchall()
    return [
        Assessment(id=r["id"], module_id=r["module_id"], title=r["title"], due_date=date.fromisoformat(r["due_date"]), weight=r["weight"])
        for r in rows
    ]


def get_assessment_due_date(module_id: str) -> date:
    assessments = get_assessments_for_module(module_id)
    if not assessments:
        return date.today()
    return min(a.due_date for a in assessments)


def save_upload(user_id: str, module_id: str, filename: str, content: bytes, raw_text: str, page_count: int | None) -> str:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_ROOT / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}_{filename}"
    target.write_bytes(content)

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO uploads (user_id, module_id, filename, filepath, raw_text, page_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, module_id, filename, str(target), raw_text, page_count, datetime.utcnow().isoformat()),
        )
    return str(target)


def replace_topics_and_units(module_id: str, topics: list[StudyTopic], units: list[StudyUnit]) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM topics WHERE module_id = ?", (module_id,))
        conn.execute("DELETE FROM study_units WHERE module_id = ?", (module_id,))

        conn.executemany(
            "INSERT INTO topics (id, module_id, title, content, word_count, page_span) VALUES (?, ?, ?, ?, ?, ?)",
            [(t.id, t.module_id, t.title, t.content, t.word_count, t.page_span) for t in topics],
        )

        conn.executemany(
            """
            INSERT INTO study_units (id, module_id, topic_id, title, estimated_minutes, source_word_count, complexity_score, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (u.id, u.module_id, u.topic_id, u.title, u.estimated_minutes, u.source_word_count, u.complexity_score, u.status.value)
                for u in units
            ],
        )


def get_units_for_user(user_id: str) -> list[StudyUnit]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT u.* FROM study_units u
            JOIN modules m ON m.id = u.module_id
            WHERE m.user_id = ?
            ORDER BY u.id
            """,
            (user_id,),
        ).fetchall()
    return [
        StudyUnit(
            id=r["id"],
            module_id=r["module_id"],
            topic_id=r["topic_id"],
            title=r["title"],
            estimated_minutes=r["estimated_minutes"],
            source_word_count=r["source_word_count"],
            complexity_score=r["complexity_score"],
            status=UnitStatus(r["status"]),
        )
        for r in rows
    ]


def get_units_for_module(module_id: str) -> list[StudyUnit]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM study_units WHERE module_id = ? ORDER BY id", (module_id,)).fetchall()
    return [
        StudyUnit(
            id=r["id"],
            module_id=r["module_id"],
            topic_id=r["topic_id"],
            title=r["title"],
            estimated_minutes=r["estimated_minutes"],
            source_word_count=r["source_word_count"],
            complexity_score=r["complexity_score"],
            status=UnitStatus(r["status"]),
        )
        for r in rows
    ]


def clear_planned_sessions(user_id: str, from_date: date) -> None:
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM sessions WHERE user_id = ? AND session_date >= ? AND status = 'planned'",
            (user_id, from_date.isoformat()),
        )


def save_sessions(sessions: list[Session]) -> None:
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO sessions (id, user_id, module_id, unit_id, session_date, planned_minutes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [(s.id, s.user_id, s.module_id, s.unit_id, s.session_date.isoformat(), s.planned_minutes, s.status) for s in sessions],
        )


def get_sessions(user_id: str, start: date | None = None, end: date | None = None) -> list[Session]:
    query = "SELECT * FROM sessions WHERE user_id = ?"
    params: list[object] = [user_id]
    if start:
        query += " AND session_date >= ?"
        params.append(start.isoformat())
    if end:
        query += " AND session_date <= ?"
        params.append(end.isoformat())
    query += " ORDER BY session_date, id"

    with get_connection() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [
        Session(
            id=r["id"],
            user_id=r["user_id"],
            module_id=r["module_id"],
            unit_id=r["unit_id"],
            session_date=date.fromisoformat(r["session_date"]),
            planned_minutes=r["planned_minutes"],
            status=r["status"],
        )
        for r in rows
    ]


def get_session(session_id: str) -> Session | None:
    with get_connection() as conn:
        r = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not r:
        return None
    return Session(
        id=r["id"],
        user_id=r["user_id"],
        module_id=r["module_id"],
        unit_id=r["unit_id"],
        session_date=date.fromisoformat(r["session_date"]),
        planned_minutes=r["planned_minutes"],
        status=r["status"],
    )


def mark_session_complete(session_id: str) -> None:
    with get_connection() as conn:
        row = conn.execute("SELECT unit_id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            return
        conn.execute("UPDATE sessions SET status = 'completed' WHERE id = ?", (session_id,))
        conn.execute("UPDATE study_units SET status = 'completed' WHERE id = ?", (row["unit_id"],))


def get_module_content(module_id: str) -> dict:
    with get_connection() as conn:
        uploads = conn.execute(
            "SELECT filename, filepath, page_count, created_at FROM uploads WHERE module_id = ? ORDER BY id DESC", (module_id,)
        ).fetchall()
        topics = conn.execute(
            "SELECT id, title, word_count, page_span FROM topics WHERE module_id = ? ORDER BY id", (module_id,)
        ).fetchall()
    return {"module_id": module_id, "uploads": [dict(r) for r in uploads], "topics": [dict(r) for r in topics]}


def get_module_study_units(module_id: str) -> dict:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, topic_id, title, estimated_minutes, source_word_count, complexity_score, status FROM study_units WHERE module_id = ? ORDER BY id",
            (module_id,),
        ).fetchall()
    return {"module_id": module_id, "study_units": [dict(r) for r in rows]}
