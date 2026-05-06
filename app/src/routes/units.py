"""CRUD endpoints for parsed Learning Units and Subtopics.

After ingestion, the user sees what the AI extracted. Anything wrong —
a unit was split where it shouldn't have been, two subtopics should be
one, a title is misspelled — the user fixes here. Every edit is logged
to `parsing_feedback` so future AI parsing runs (and future fine-tuning)
can use the corrections as ground truth.
"""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.src.models import LearningUnit, Subtopic, User
from app.src.models.services.content_analysis_service import estimate_effort
from app.src.utils.auth import get_current_user
from app.storage import (
    delete_learning_unit,
    delete_subtopic,
    get_learning_unit,
    get_module_owner,
    get_subtopic,
    insert_learning_unit,
    insert_subtopic,
    list_parsing_feedback_for_module,
    next_subtopic_ordinal,
    next_unit_ordinal,
    record_parsing_feedback,
    update_learning_unit,
    update_subtopic,
)

router = APIRouter(tags=["units"])


# ---- Helpers ----

def _word_count(text: str) -> int:
    return len(re.findall(r"\w+", text or ""))


def _ensure_module_owned(module_id: str, current_user: User) -> None:
    owner = get_module_owner(module_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if owner != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")


def _ensure_unit_owned(unit_id: str, current_user: User) -> LearningUnit:
    lu = get_learning_unit(unit_id)
    if not lu:
        raise HTTPException(status_code=404, detail="Learning unit not found")
    _ensure_module_owned(lu.module_id, current_user)
    return lu


def _ensure_subtopic_owned(subtopic_id: str, current_user: User) -> tuple[Subtopic, LearningUnit]:
    s = get_subtopic(subtopic_id)
    if not s:
        raise HTTPException(status_code=404, detail="Subtopic not found")
    lu = get_learning_unit(s.learning_unit_id)
    if not lu:
        raise HTTPException(status_code=404, detail="Parent unit not found")
    _ensure_module_owned(lu.module_id, current_user)
    return s, lu


# ---- Schemas ----

class CreateLearningUnitRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)


class UpdateLearningUnitRequest(BaseModel):
    topic: str | None = Field(default=None, min_length=1, max_length=200)
    ordinal: int | None = Field(default=None, ge=1, le=200)


class CreateSubtopicRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(default="", max_length=200_000)


class UpdateSubtopicRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=200_000)
    ordinal: int | None = Field(default=None, ge=1, le=500)


# ---- Learning unit routes ----

@router.post("/modules/{module_id}/learning-units", status_code=201)
def create_learning_unit_endpoint(
    module_id: str,
    body: CreateLearningUnitRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    _ensure_module_owned(module_id, current_user)
    ordinal = next_unit_ordinal(module_id)
    lu = LearningUnit(
        id=f"{module_id}-lu-{uuid.uuid4().hex[:8]}",
        module_id=module_id,
        ordinal=ordinal,
        topic=body.topic,
        subtopics=[],
        source_span=None,
    )
    insert_learning_unit(lu)
    record_parsing_feedback(
        current_user.id,
        module_id,
        kind="add_unit",
        target_id=lu.id,
        before=None,
        after={"topic": lu.topic, "ordinal": lu.ordinal},
    )
    return {"id": lu.id, "ordinal": lu.ordinal, "topic": lu.topic}


@router.patch("/learning-units/{unit_id}")
def update_learning_unit_endpoint(
    unit_id: str,
    body: UpdateLearningUnitRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    lu = _ensure_unit_owned(unit_id, current_user)
    if body.topic is None and body.ordinal is None:
        raise HTTPException(status_code=400, detail="At least one of topic/ordinal required")

    before = {"topic": lu.topic, "ordinal": lu.ordinal}
    update_learning_unit(unit_id, topic=body.topic, ordinal=body.ordinal)
    after = {
        "topic": body.topic if body.topic is not None else lu.topic,
        "ordinal": body.ordinal if body.ordinal is not None else lu.ordinal,
    }
    if body.topic is not None and body.topic != lu.topic:
        record_parsing_feedback(
            current_user.id, lu.module_id, kind="rename_unit",
            target_id=unit_id, before=before, after=after,
        )
    return {"id": unit_id, **after}


@router.delete("/learning-units/{unit_id}", status_code=204)
def delete_learning_unit_endpoint(
    unit_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    lu = _ensure_unit_owned(unit_id, current_user)
    record_parsing_feedback(
        current_user.id, lu.module_id, kind="delete_unit",
        target_id=unit_id,
        before={"topic": lu.topic, "ordinal": lu.ordinal},
        after=None,
    )
    delete_learning_unit(unit_id)


# ---- Subtopic routes ----

@router.post("/learning-units/{unit_id}/subtopics", status_code=201)
def create_subtopic_endpoint(
    unit_id: str,
    body: CreateSubtopicRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    lu = _ensure_unit_owned(unit_id, current_user)
    ordinal = next_subtopic_ordinal(unit_id)
    word_count = _word_count(body.content)
    s = Subtopic(
        id=f"{unit_id}-s-{uuid.uuid4().hex[:8]}",
        learning_unit_id=unit_id,
        ordinal=ordinal,
        title=body.title,
        content=body.content,
        word_count=word_count,
        resource_weight=0.0,
        effort_score=0.0,
    )
    s.effort_score = estimate_effort(s)
    insert_subtopic(s)
    record_parsing_feedback(
        current_user.id, lu.module_id, kind="add_subtopic",
        target_id=s.id,
        before=None,
        after={"title": s.title, "word_count": s.word_count, "effort_score": s.effort_score},
    )
    return {
        "id": s.id,
        "learning_unit_id": s.learning_unit_id,
        "ordinal": s.ordinal,
        "title": s.title,
        "word_count": s.word_count,
        "effort_score": s.effort_score,
    }


@router.patch("/subtopics/{subtopic_id}")
def update_subtopic_endpoint(
    subtopic_id: str,
    body: UpdateSubtopicRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    s, lu = _ensure_subtopic_owned(subtopic_id, current_user)
    if body.title is None and body.content is None and body.ordinal is None:
        raise HTTPException(status_code=400, detail="At least one of title/content/ordinal required")

    before = {"title": s.title, "content": s.content, "word_count": s.word_count, "effort_score": s.effort_score}

    new_title = body.title if body.title is not None else s.title
    new_content = body.content if body.content is not None else s.content
    new_word_count = _word_count(new_content) if body.content is not None else s.word_count

    new_effort = s.effort_score
    if body.content is not None:
        # Recompute effort score with the corrected word count so the
        # planner re-estimates time on the next plan generation.
        provisional = Subtopic(
            id=s.id, learning_unit_id=s.learning_unit_id, ordinal=s.ordinal,
            title=new_title, content=new_content, word_count=new_word_count,
            resource_weight=s.resource_weight, effort_score=0.0,
        )
        new_effort = estimate_effort(provisional)

    update_subtopic(
        subtopic_id,
        title=body.title,
        content=body.content,
        word_count=new_word_count if body.content is not None else None,
        effort_score=new_effort if body.content is not None else None,
        ordinal=body.ordinal,
    )

    after = {"title": new_title, "content": new_content, "word_count": new_word_count, "effort_score": new_effort}
    if body.title is not None and body.title != s.title:
        record_parsing_feedback(
            current_user.id, lu.module_id, kind="rename_subtopic",
            target_id=subtopic_id,
            before={"title": s.title}, after={"title": new_title},
        )
    if body.content is not None and body.content != s.content:
        # We log the deltas only — the full content isn't useful as a
        # signal and bloats the table.
        record_parsing_feedback(
            current_user.id, lu.module_id, kind="edit_subtopic_content",
            target_id=subtopic_id,
            before={"word_count": s.word_count, "effort_score": s.effort_score},
            after={"word_count": new_word_count, "effort_score": new_effort},
        )

    return {
        "id": subtopic_id,
        "learning_unit_id": s.learning_unit_id,
        "ordinal": body.ordinal if body.ordinal is not None else s.ordinal,
        "title": new_title,
        "word_count": new_word_count,
        "effort_score": new_effort,
    }


@router.delete("/subtopics/{subtopic_id}", status_code=204)
def delete_subtopic_endpoint(
    subtopic_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    s, lu = _ensure_subtopic_owned(subtopic_id, current_user)
    record_parsing_feedback(
        current_user.id, lu.module_id, kind="delete_subtopic",
        target_id=subtopic_id,
        before={"title": s.title, "word_count": s.word_count},
        after=None,
    )
    delete_subtopic(subtopic_id)


# ---- Feedback ----

@router.get("/modules/{module_id}/parsing-feedback")
def list_parsing_feedback_endpoint(
    module_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Audit log of structural corrections the user has made on this
    module. Useful for debugging "why did the AI suggest X" and for
    seeding fine-tuning data later."""
    _ensure_module_owned(module_id, current_user)
    return {"feedback": list_parsing_feedback_for_module(module_id, limit=min(max(limit, 1), 500))}
