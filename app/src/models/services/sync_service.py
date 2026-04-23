"""Manual-first delta sync.

Server side:
  POST /sync with {ops:[...], last_pulled_at}
    → applies idempotent ops (deduped by op_id)
    → returns {applied, conflicts, changes_since, now}

Conflict policy:
  - session.complete: client always wins (user was offline actually doing it).
  - user_selection / plan edits: last-writer-wins by updated_at.
  - moodle-sourced data: server wins (rejected on client write).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from app.storage import (
    mark_session_complete,
    record_sync_op,
    sync_changes_since,
    sync_log_has,
    upsert_selection,
)
from app.src.models import AIFeatureSet, UserSelection


MOODLE_ENTITIES = {"assessment", "module"}


def apply(user_id: str, ops: list[dict[str, Any]], last_pulled_at: str | None) -> dict:
    applied: list[str] = []
    conflicts: list[dict] = []

    for op in ops:
        op_id = op.get("op_id")
        if not op_id:
            conflicts.append({"op_id": None, "reason": "missing_op_id"})
            continue

        if sync_log_has(op_id):
            applied.append(op_id)  # idempotent replay
            continue

        entity = op.get("entity")
        entity_id = op.get("entity_id")
        action = op.get("op")
        payload = op.get("payload", {}) or {}

        # Moodle-sourced data: server wins → reject
        if entity in MOODLE_ENTITIES and payload.get("source") == "moodle":
            conflicts.append({"op_id": op_id, "reason": "moodle_server_wins"})
            continue

        try:
            _dispatch(entity, entity_id, action, payload, user_id)
        except Exception as exc:
            conflicts.append({"op_id": op_id, "reason": f"apply_failed:{exc}"})
            continue

        record_sync_op(user_id, op_id, entity or "", entity_id or "", action or "", payload)
        applied.append(op_id)

    changes = sync_changes_since(user_id, last_pulled_at)
    return {
        "applied": applied,
        "conflicts": conflicts,
        "changes_since": changes,
        "now": datetime.utcnow().isoformat(),
    }


def _dispatch(entity: str | None, entity_id: str | None, action: str | None, payload: dict, user_id: str) -> None:
    if entity == "session" and action == "complete" and entity_id:
        mark_session_complete(entity_id)
        return

    if entity == "user_selection" and action == "upsert" and entity_id:
        features = payload.get("ai_features") or {}
        selection = UserSelection(
            id=entity_id,
            user_id=user_id,
            module_id=payload["module_id"],
            subtopic_ids=payload.get("subtopic_ids", []),
            ai_features=AIFeatureSet(
                summaries=bool(features.get("summaries", True)),
                subtopic_quiz=bool(features.get("subtopic_quiz", True)),
                topic_quiz=bool(features.get("topic_quiz", True)),
            ),
            low_data_mode=bool(payload.get("low_data_mode", False)),
            updated_at=datetime.utcnow(),
        )
        upsert_selection(selection)
        return

    raise ValueError(f"unsupported op: entity={entity} action={action}")
