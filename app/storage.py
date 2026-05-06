from __future__ import annotations

from dataclasses import asdict
from datetime import date, datetime
import json
from pathlib import Path
import sqlite3

from .src.utils.time import utcnow_aware, utcnow_iso

from .src.models import (
    AIArtifact,
    AIFeatureSet,
    Assessment,
    AssessmentStatus,
    LearningUnit,
    Module,
    ModuleType,
    MoodleAccount,
    MoodleResource,
    PackStatus,
    Pace,
    Session,
    StudyPack,
    StudyTopic,
    StudyUnit,
    Subtopic,
    UnitStatus,
    User,
    UserSelection,
)


DB_PATH = Path("data/studypartner.db")
UPLOAD_ROOT = Path("data/uploads")


class _ManagedConnection:
    """sqlite3 context manager that COMMITS and CLOSES on exit.

    The stdlib `sqlite3.Connection.__exit__` only commits/rolls back — it
    never closes. On Windows, lingering handles block file deletion in tests.
    """

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def __enter__(self) -> sqlite3.Connection:
        return self._conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self._conn.close()
        return False


def get_connection() -> _ManagedConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return _ManagedConnection(conn)


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

            CREATE TABLE IF NOT EXISTS learning_units (
                id TEXT PRIMARY KEY,
                module_id TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                topic TEXT NOT NULL,
                source_span TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(module_id, ordinal)
            );

            CREATE TABLE IF NOT EXISTS subtopics (
                id TEXT PRIMARY KEY,
                learning_unit_id TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                word_count INTEGER NOT NULL,
                resource_weight REAL NOT NULL DEFAULT 0,
                effort_score REAL NOT NULL,
                UNIQUE(learning_unit_id, ordinal)
            );

            CREATE TABLE IF NOT EXISTS user_selections (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                subtopic_ids TEXT NOT NULL,
                ai_summaries INTEGER NOT NULL DEFAULT 1,
                ai_subtopic_quiz INTEGER NOT NULL DEFAULT 1,
                ai_topic_quiz INTEGER NOT NULL DEFAULT 1,
                low_data_mode INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_artifacts (
                id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                ref_id TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                prompt_hash TEXT NOT NULL,
                payload TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(scope, ref_id, content_hash, prompt_hash)
            );

            CREATE TABLE IF NOT EXISTS study_packs (
                id TEXT PRIMARY KEY,
                module_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                selection_id TEXT NOT NULL,
                status TEXT NOT NULL,
                payload BLOB,
                byte_size INTEGER,
                version INTEGER NOT NULL DEFAULT 1,
                generated_at TEXT,
                error TEXT
            );

            CREATE TABLE IF NOT EXISTS moodle_accounts (
                user_id TEXT PRIMARY KEY,
                base_url TEXT NOT NULL,
                token_enc BLOB NOT NULL,
                last_sync TEXT
            );

            CREATE TABLE IF NOT EXISTS moodle_resources (
                id TEXT PRIMARY KEY,
                module_id TEXT NOT NULL,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                file_size INTEGER,
                url TEXT,
                downloaded_at TEXT
            );

            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                op_id TEXT NOT NULL UNIQUE,
                entity TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                op TEXT NOT NULL,
                payload TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS moodle_launch_passports (
                passport TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                base_url TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_subtopics_lu       ON subtopics(learning_unit_id, ordinal);
            CREATE INDEX IF NOT EXISTS idx_lu_module          ON learning_units(module_id, ordinal);
            CREATE INDEX IF NOT EXISTS idx_artifacts_ref      ON ai_artifacts(scope, ref_id);
            CREATE INDEX IF NOT EXISTS idx_packs_module_user  ON study_packs(module_id, user_id);
            CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log(user_id, applied_at);
            """
        )
        _ensure_column(conn, "assessments", "status", "TEXT NOT NULL DEFAULT 'open'")
        _ensure_column(conn, "assessments", "moodle_id", "TEXT")
        _ensure_column(conn, "users", "password_hash", "TEXT")
        _ensure_column(conn, "moodle_resources", "included_in_ai", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "moodle_resources", "ingested_at", "TEXT")
        _ensure_column(conn, "moodle_resources", "filename", "TEXT")
        with conn:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_moodle_resources_module ON moodle_resources(module_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_launch_passports_expiry ON moodle_launch_passports(expires_at)")


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, decl: str) -> None:
    cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def create_user(user: User) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO users (id, name, email, hours_per_day, days_per_week, pace, custom_minutes_per_500_words, max_daily_hours, pace_multiplier, feedback_samples, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1.0, 0, ?)
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
                user.password_hash,
            ),
        )


def _row_to_user(row) -> User:
    return User(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        hours_per_day=row["hours_per_day"],
        days_per_week=row["days_per_week"],
        pace=Pace(row["pace"]),
        custom_minutes_per_500_words=row["custom_minutes_per_500_words"],
        max_daily_hours=row["max_daily_hours"],
        password_hash=row["password_hash"] if "password_hash" in row.keys() else None,
    )


def get_user(user_id: str) -> User | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(row) if row else None


def get_user_by_email(email: str) -> User | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return _row_to_user(row) if row else None


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
            (user_id, session_id, study_unit_id, estimated_time_minutes, actual_time_minutes, ratio, utcnow_iso()),
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
    """Idempotent insert. Re-submitting the same assessment id (e.g. a retried
    Moodle sync, or a client-side replay after a network blip) no longer raises
    IntegrityError — it updates the mutable fields instead."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO assessments (id, module_id, title, due_date, weight)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                module_id = excluded.module_id,
                title     = excluded.title,
                due_date  = excluded.due_date,
                weight    = excluded.weight
            """,
            (
                assessment.id,
                assessment.module_id,
                assessment.title,
                assessment.due_date.isoformat(),
                assessment.weight,
            ),
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
    target = UPLOAD_ROOT / f"{utcnow_aware().strftime('%Y%m%d%H%M%S%f')}_{filename}"
    target.write_bytes(content)

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO uploads (user_id, module_id, filename, filepath, raw_text, page_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, module_id, filename, str(target), raw_text, page_count, utcnow_iso()),
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


# ---- Learning units & subtopics ----

def replace_learning_units(module_id: str, units: list[LearningUnit]) -> None:
    now = utcnow_iso()
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM subtopics WHERE learning_unit_id IN (SELECT id FROM learning_units WHERE module_id = ?)",
            (module_id,),
        )
        conn.execute("DELETE FROM learning_units WHERE module_id = ?", (module_id,))
        conn.executemany(
            "INSERT INTO learning_units (id, module_id, ordinal, topic, source_span, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (lu.id, lu.module_id, lu.ordinal, lu.topic, json.dumps(lu.source_span) if lu.source_span else None, now)
                for lu in units
            ],
        )
        subs = [s for lu in units for s in lu.subtopics]
        conn.executemany(
            """
            INSERT INTO subtopics (id, learning_unit_id, ordinal, title, content, word_count, resource_weight, effort_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (s.id, s.learning_unit_id, s.ordinal, s.title, s.content, s.word_count, s.resource_weight, s.effort_score)
                for s in subs
            ],
        )


def get_learning_units_for_module(module_id: str) -> list[LearningUnit]:
    with get_connection() as conn:
        lu_rows = conn.execute(
            "SELECT * FROM learning_units WHERE module_id = ? ORDER BY ordinal",
            (module_id,),
        ).fetchall()
        sub_rows = conn.execute(
            """
            SELECT s.* FROM subtopics s
            JOIN learning_units lu ON lu.id = s.learning_unit_id
            WHERE lu.module_id = ?
            ORDER BY lu.ordinal, s.ordinal
            """,
            (module_id,),
        ).fetchall()

    subs_by_lu: dict[str, list[Subtopic]] = {}
    for r in sub_rows:
        subs_by_lu.setdefault(r["learning_unit_id"], []).append(
            Subtopic(
                id=r["id"],
                learning_unit_id=r["learning_unit_id"],
                ordinal=r["ordinal"],
                title=r["title"],
                content=r["content"],
                word_count=r["word_count"],
                resource_weight=r["resource_weight"],
                effort_score=r["effort_score"],
            )
        )

    return [
        LearningUnit(
            id=r["id"],
            module_id=r["module_id"],
            ordinal=r["ordinal"],
            topic=r["topic"],
            subtopics=subs_by_lu.get(r["id"], []),
            source_span=json.loads(r["source_span"]) if r["source_span"] else None,
        )
        for r in lu_rows
    ]


def get_subtopics_by_ids(subtopic_ids: list[str]) -> list[Subtopic]:
    if not subtopic_ids:
        return []
    placeholders = ",".join("?" for _ in subtopic_ids)
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM subtopics WHERE id IN ({placeholders})",
            tuple(subtopic_ids),
        ).fetchall()
    return [
        Subtopic(
            id=r["id"],
            learning_unit_id=r["learning_unit_id"],
            ordinal=r["ordinal"],
            title=r["title"],
            content=r["content"],
            word_count=r["word_count"],
            resource_weight=r["resource_weight"],
            effort_score=r["effort_score"],
        )
        for r in rows
    ]


# ---- User selections ----

def upsert_selection(selection: UserSelection) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_selections (id, user_id, module_id, subtopic_ids, ai_summaries, ai_subtopic_quiz, ai_topic_quiz, low_data_mode, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                subtopic_ids=excluded.subtopic_ids,
                ai_summaries=excluded.ai_summaries,
                ai_subtopic_quiz=excluded.ai_subtopic_quiz,
                ai_topic_quiz=excluded.ai_topic_quiz,
                low_data_mode=excluded.low_data_mode,
                updated_at=excluded.updated_at
            """,
            (
                selection.id,
                selection.user_id,
                selection.module_id,
                json.dumps(selection.subtopic_ids),
                int(selection.ai_features.summaries),
                int(selection.ai_features.subtopic_quiz),
                int(selection.ai_features.topic_quiz),
                int(selection.low_data_mode),
                selection.updated_at.isoformat(),
            ),
        )


def get_selection(selection_id: str) -> UserSelection | None:
    with get_connection() as conn:
        r = conn.execute("SELECT * FROM user_selections WHERE id = ?", (selection_id,)).fetchone()
    if not r:
        return None
    return UserSelection(
        id=r["id"],
        user_id=r["user_id"],
        module_id=r["module_id"],
        subtopic_ids=json.loads(r["subtopic_ids"]),
        ai_features=AIFeatureSet(
            summaries=bool(r["ai_summaries"]),
            subtopic_quiz=bool(r["ai_subtopic_quiz"]),
            topic_quiz=bool(r["ai_topic_quiz"]),
        ),
        low_data_mode=bool(r["low_data_mode"]),
        updated_at=datetime.fromisoformat(r["updated_at"]),
    )


def get_latest_selection(user_id: str, module_id: str) -> UserSelection | None:
    with get_connection() as conn:
        r = conn.execute(
            "SELECT id FROM user_selections WHERE user_id = ? AND module_id = ? ORDER BY updated_at DESC LIMIT 1",
            (user_id, module_id),
        ).fetchone()
    return get_selection(r["id"]) if r else None


# ---- AI artifacts ----

def get_ai_artifact(scope: str, ref_id: str, content_hash: str, prompt_hash: str) -> AIArtifact | None:
    with get_connection() as conn:
        r = conn.execute(
            "SELECT * FROM ai_artifacts WHERE scope = ? AND ref_id = ? AND content_hash = ? AND prompt_hash = ?",
            (scope, ref_id, content_hash, prompt_hash),
        ).fetchone()
    if not r:
        return None
    return AIArtifact(
        id=r["id"],
        scope=r["scope"],
        ref_id=r["ref_id"],
        content_hash=r["content_hash"],
        prompt_hash=r["prompt_hash"],
        payload=json.loads(r["payload"]),
        model=r["model"],
        created_at=datetime.fromisoformat(r["created_at"]),
    )


def save_ai_artifact(art: AIArtifact) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO ai_artifacts (id, scope, ref_id, content_hash, prompt_hash, payload, model, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                art.id,
                art.scope,
                art.ref_id,
                art.content_hash,
                art.prompt_hash,
                json.dumps(art.payload),
                art.model,
                art.created_at.isoformat(),
            ),
        )


def delete_ai_artifacts_for(scope: str, ref_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM ai_artifacts WHERE scope = ? AND ref_id = ?", (scope, ref_id))


# ---- Study packs ----

def create_pack(pack: StudyPack) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO study_packs (id, module_id, user_id, selection_id, status, payload, byte_size, version, generated_at, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pack.id,
                pack.module_id,
                pack.user_id,
                pack.selection_id,
                pack.status.value,
                pack.payload,  # already bytes (gzipped) or None
                pack.byte_size,
                pack.version,
                pack.generated_at.isoformat() if pack.generated_at else None,
                pack.error,
            ),
        )


def update_pack(pack_id: str, *, status: PackStatus, payload: bytes | None = None, error: str | None = None) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE study_packs
            SET status = ?,
                payload = COALESCE(?, payload),
                byte_size = COALESCE(?, byte_size),
                generated_at = COALESCE(?, generated_at),
                error = ?,
                version = version + CASE WHEN ? = 'generated' THEN 1 ELSE 0 END
            WHERE id = ?
            """,
            (
                status.value,
                payload,
                len(payload) if payload else None,
                utcnow_iso() if status == PackStatus.generated else None,
                error,
                status.value,
                pack_id,
            ),
        )


def get_pack(pack_id: str) -> StudyPack | None:
    with get_connection() as conn:
        r = conn.execute("SELECT * FROM study_packs WHERE id = ?", (pack_id,)).fetchone()
    if not r:
        return None
    return StudyPack(
        id=r["id"],
        module_id=r["module_id"],
        user_id=r["user_id"],
        selection_id=r["selection_id"],
        status=PackStatus(r["status"]),
        payload=r["payload"],
        byte_size=r["byte_size"],
        version=r["version"],
        generated_at=datetime.fromisoformat(r["generated_at"]) if r["generated_at"] else None,
        error=r["error"],
    )


def list_packs_for_module(module_id: str, user_id: str) -> list[StudyPack]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, module_id, user_id, selection_id, status, byte_size, version, generated_at, error FROM study_packs WHERE module_id = ? AND user_id = ? ORDER BY generated_at DESC",
            (module_id, user_id),
        ).fetchall()
    return [
        StudyPack(
            id=r["id"],
            module_id=r["module_id"],
            user_id=r["user_id"],
            selection_id=r["selection_id"],
            status=PackStatus(r["status"]),
            payload=None,
            byte_size=r["byte_size"],
            version=r["version"],
            generated_at=datetime.fromisoformat(r["generated_at"]) if r["generated_at"] else None,
            error=r["error"],
        )
        for r in rows
    ]


# ---- Moodle ----

def save_moodle_account(account: MoodleAccount, token_enc: bytes) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO moodle_accounts (user_id, base_url, token_enc, last_sync)
            VALUES (?, ?, ?, ?)
            """,
            (account.user_id, account.base_url, token_enc, account.last_sync.isoformat() if account.last_sync else None),
        )


def get_moodle_account_raw(user_id: str) -> tuple[str, bytes, str | None] | None:
    with get_connection() as conn:
        r = conn.execute(
            "SELECT base_url, token_enc, last_sync FROM moodle_accounts WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    if not r:
        return None
    return r["base_url"], r["token_enc"], r["last_sync"]


def update_moodle_sync_time(user_id: str, when: datetime) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE moodle_accounts SET last_sync = ? WHERE user_id = ?", (when.isoformat(), user_id))


def upsert_moodle_resources(resources: list[MoodleResource]) -> None:
    """Upsert metadata. Preserves the user's `included_in_ai` flag and any
    `ingested_at` timestamp across syncs so a re-sync doesn't reset the
    user's material picks."""
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT INTO moodle_resources (id, module_id, title, type, file_size, url, downloaded_at, filename)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                module_id     = excluded.module_id,
                title         = excluded.title,
                type          = excluded.type,
                file_size     = excluded.file_size,
                url           = excluded.url,
                downloaded_at = excluded.downloaded_at,
                filename      = excluded.filename
            """,
            [
                (r.id, r.module_id, r.title, r.type, r.file_size, r.url, r.downloaded_at.isoformat() if r.downloaded_at else None, r.filename)
                for r in resources
            ],
        )


def list_moodle_resources_with_selection(user_id: str) -> list[dict]:
    """All resources across the user's modules, joined to the module name,
    with each row's AI selection state — feeds the materials picker UI."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT r.id, r.module_id, m.name AS module_name, r.title, r.type,
                   r.file_size, r.url, r.included_in_ai, r.ingested_at
            FROM moodle_resources r
            JOIN modules m ON m.id = r.module_id
            WHERE m.user_id = ?
            ORDER BY m.name, r.title
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "module_id": r["module_id"],
            "module_name": r["module_name"],
            "title": r["title"],
            "type": r["type"],
            "file_size": r["file_size"],
            "url": r["url"],
            "included_in_ai": bool(r["included_in_ai"]),
            "ingested_at": r["ingested_at"],
        }
        for r in rows
    ]


def set_moodle_resources_included(user_id: str, resource_ids: list[str], included: bool) -> int:
    """Toggle `included_in_ai`, scoped to resources whose module belongs to
    `user_id` — defence in depth against a stolen session flipping someone
    else's resources."""
    if not resource_ids:
        return 0
    placeholders = ",".join("?" * len(resource_ids))
    with get_connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE moodle_resources
               SET included_in_ai = ?
             WHERE id IN ({placeholders})
               AND module_id IN (SELECT id FROM modules WHERE user_id = ?)
            """,
            (1 if included else 0, *resource_ids, user_id),
        )
        return cur.rowcount


def list_resources_pending_ingest(user_id: str) -> list[MoodleResource]:
    """Resources the user has flagged for AI but that haven't been
    downloaded + ingested yet."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT r.* FROM moodle_resources r
            JOIN modules m ON m.id = r.module_id
            WHERE m.user_id = ?
              AND r.included_in_ai = 1
              AND r.ingested_at IS NULL
            """,
            (user_id,),
        ).fetchall()
    return [
        MoodleResource(
            id=r["id"],
            module_id=r["module_id"],
            title=r["title"],
            type=r["type"],
            file_size=r["file_size"],
            url=r["url"],
            downloaded_at=datetime.fromisoformat(r["downloaded_at"]) if r["downloaded_at"] else None,
            filename=r["filename"] if "filename" in r.keys() else None,
        )
        for r in rows
    ]


def mark_resource_ingested(resource_id: str, when: datetime) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE moodle_resources SET ingested_at = ? WHERE id = ?",
            (when.isoformat(), resource_id),
        )


# ---- Moodle launch passports (CSRF protection for the mobile-launch flow) ----

def save_launch_passport(passport: str, user_id: str, base_url: str, created: datetime, expires: datetime) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO moodle_launch_passports (passport, user_id, base_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (passport, user_id, base_url, created.isoformat(), expires.isoformat()),
        )


def consume_launch_passport(passport: str, now: datetime) -> tuple[str, str] | None:
    """Atomically claim a passport.

    A single `DELETE … RETURNING` is the only authoritative write. SQLite
    serializes writes per DB file, so two concurrent callers cannot both
    delete the same row — exactly one wins and gets the RETURNING payload;
    the loser gets an empty result. This is what makes the passport a true
    single-use guard against replay / CSRF.

    Returns (user_id, base_url) on success, or None if the passport was
    already consumed, never issued, or expired (we still consume expired
    passports so they can't be retried).
    """
    with get_connection() as conn:
        row = conn.execute(
            """
            DELETE FROM moodle_launch_passports
             WHERE passport = ?
            RETURNING user_id, base_url, expires_at
            """,
            (passport,),
        ).fetchone()
    if not row:
        return None
    if datetime.fromisoformat(row["expires_at"]) < now:
        return None
    return row["user_id"], row["base_url"]


def purge_expired_launch_passports(now: datetime) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM moodle_launch_passports WHERE expires_at < ?", (now.isoformat(),))


def list_moodle_resources_for_module(module_id: str) -> list[MoodleResource]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM moodle_resources WHERE module_id = ?", (module_id,)).fetchall()
    return [
        MoodleResource(
            id=r["id"],
            module_id=r["module_id"],
            title=r["title"],
            type=r["type"],
            file_size=r["file_size"],
            url=r["url"],
            downloaded_at=datetime.fromisoformat(r["downloaded_at"]) if r["downloaded_at"] else None,
            filename=r["filename"] if "filename" in r.keys() else None,
        )
        for r in rows
    ]


# ---- Assessment (extended) ----

def update_assessment(assessment_id: str, *, status: AssessmentStatus | None = None, moodle_id: str | None = None) -> None:
    fields, params = [], []
    if status is not None:
        fields.append("status = ?")
        params.append(status.value)
    if moodle_id is not None:
        fields.append("moodle_id = ?")
        params.append(moodle_id)
    if not fields:
        return
    params.append(assessment_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE assessments SET {', '.join(fields)} WHERE id = ?", tuple(params))


def list_assessments_for_user(user_id: str) -> list[Assessment]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT a.* FROM assessments a
            JOIN modules m ON m.id = a.module_id
            WHERE m.user_id = ?
            ORDER BY a.due_date
            """,
            (user_id,),
        ).fetchall()
    return [
        Assessment(
            id=r["id"],
            module_id=r["module_id"],
            title=r["title"],
            due_date=date.fromisoformat(r["due_date"]),
            weight=r["weight"],
            status=AssessmentStatus(r["status"] if "status" in r.keys() and r["status"] else "open"),
            moodle_id=r["moodle_id"] if "moodle_id" in r.keys() else None,
        )
        for r in rows
    ]


# ---- Sync log ----

def sync_log_has(op_id: str) -> bool:
    with get_connection() as conn:
        r = conn.execute("SELECT 1 FROM sync_log WHERE op_id = ?", (op_id,)).fetchone()
    return bool(r)


def record_sync_op(user_id: str, op_id: str, entity: str, entity_id: str, op: str, payload: dict) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO sync_log (user_id, op_id, entity, entity_id, op, payload, applied_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, op_id, entity, entity_id, op, json.dumps(payload), utcnow_iso()),
        )


def sync_changes_since(user_id: str, since_iso: str | None) -> list[dict]:
    query = "SELECT op_id, entity, entity_id, op, payload, applied_at FROM sync_log WHERE user_id = ?"
    params: list[object] = [user_id]
    if since_iso:
        query += " AND applied_at > ?"
        params.append(since_iso)
    query += " ORDER BY applied_at ASC LIMIT 500"
    with get_connection() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [
        {
            "op_id": r["op_id"],
            "entity": r["entity"],
            "entity_id": r["entity_id"],
            "op": r["op"],
            "payload": json.loads(r["payload"]),
            "applied_at": r["applied_at"],
        }
        for r in rows
    ]
