from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.src.models import AIFeatureSet, User, UserSelection
from app.src.utils.auth import ensure_module_owned, get_current_user
from app.src.utils.time import utcnow_aware
from app.storage import (
    get_latest_selection,
    get_learning_units_for_module,
    get_selection,
    upsert_selection,
)

router = APIRouter(prefix="/selection", tags=["selection"])


class AIFeaturesRequest(BaseModel):
    summaries: bool = True
    subtopic_quiz: bool = True
    topic_quiz: bool = True


class CreateSelectionRequest(BaseModel):
    id: str | None = None
    user_id: str = Field(..., min_length=1)
    module_id: str = Field(..., min_length=1)
    subtopic_ids: list[str] = Field(default_factory=list)
    ai_features: AIFeaturesRequest = Field(default_factory=AIFeaturesRequest)
    low_data_mode: bool = False


@router.post("")
def create_selection(
    body: CreateSelectionRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not body.subtopic_ids:
        raise HTTPException(status_code=400, detail="Select at least one subtopic")

    # The selection's subtopic_ids are the AI gate: ai_service only
    # generates content for ref_ids that appear here. So this is the
    # one place to enforce that a user can't smuggle another tenant's
    # subtopic ids into their own selection and then read/generate AI
    # over them. Require the module to be ours and every subtopic id to
    # actually belong to that module.
    ensure_module_owned(body.module_id, current_user)
    valid_subtopic_ids = {
        s.id
        for lu in get_learning_units_for_module(body.module_id)
        for s in lu.subtopics
    }
    unknown = [sid for sid in body.subtopic_ids if sid not in valid_subtopic_ids]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail="One or more subtopic_ids do not belong to this module",
        )

    selection = UserSelection(
        id=body.id or str(uuid.uuid4()),
        user_id=body.user_id,
        module_id=body.module_id,
        subtopic_ids=list(body.subtopic_ids),
        ai_features=AIFeatureSet(
            summaries=body.ai_features.summaries,
            subtopic_quiz=body.ai_features.subtopic_quiz,
            topic_quiz=body.ai_features.topic_quiz,
        ),
        low_data_mode=body.low_data_mode,
        updated_at=utcnow_aware(),
    )
    upsert_selection(selection)
    return {"selection_id": selection.id, "updated_at": selection.updated_at.isoformat()}


@router.get("/{selection_id}")
def get_selection_endpoint(
    selection_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    sel = get_selection(selection_id)
    if not sel:
        raise HTTPException(status_code=404, detail="Selection not found")
    if sel.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _serialize(sel)


@router.get("/latest/{user_id}/{module_id}")
def latest_selection(
    user_id: str,
    module_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
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
