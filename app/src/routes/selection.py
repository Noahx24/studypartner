from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from app.src.models import AIFeatureSet, UserSelection
from app.src.utils.time import utcnow_aware
from app.storage import get_selection, get_latest_selection, upsert_selection

router = APIRouter(prefix="/selection", tags=["selection"])


@router.post("")
def create_selection(payload: dict) -> dict:
    try:
        features = payload.get("ai_features") or {}
        selection = UserSelection(
            id=payload.get("id") or str(uuid.uuid4()),
            user_id=payload["user_id"],
            module_id=payload["module_id"],
            subtopic_ids=list(payload.get("subtopic_ids", [])),
            ai_features=AIFeatureSet(
                summaries=bool(features.get("summaries", True)),
                subtopic_quiz=bool(features.get("subtopic_quiz", True)),
                topic_quiz=bool(features.get("topic_quiz", True)),
            ),
            low_data_mode=bool(payload.get("low_data_mode", False)),
            updated_at=utcnow_aware(),
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc

    if not selection.subtopic_ids:
        raise HTTPException(status_code=400, detail="Select at least one subtopic")

    upsert_selection(selection)
    return {"selection_id": selection.id, "updated_at": selection.updated_at.isoformat()}


@router.get("/{selection_id}")
def get_selection_endpoint(selection_id: str) -> dict:
    sel = get_selection(selection_id)
    if not sel:
        raise HTTPException(status_code=404, detail="Selection not found")
    return _serialize(sel)


@router.get("/latest/{user_id}/{module_id}")
def latest_selection(user_id: str, module_id: str) -> dict:
    sel = get_latest_selection(user_id, module_id)
    if not sel:
        raise HTTPException(status_code=404, detail="No selection for module")
    return _serialize(sel)


def _serialize(sel: UserSelection) -> dict:
    return {
        "id": sel.id,
        "user_id": sel.user_id,
        "module_id": sel.module_id,
        "subtopic_ids": sel.subtopic_ids,
        "ai_features": {
            "summaries": sel.ai_features.summaries,
            "subtopic_quiz": sel.ai_features.subtopic_quiz,
            "topic_quiz": sel.ai_features.topic_quiz,
        },
        "low_data_mode": sel.low_data_mode,
        "updated_at": sel.updated_at.isoformat(),
    }
