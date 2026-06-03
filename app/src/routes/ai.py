from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.src.models import User
from app.src.models.services.ai_service import AIService
from app.src.utils.auth import get_current_user
from app.src.utils.quota import enforce_ai_quota
from app.src.utils.ratelimit import limiter
from app.storage import get_learning_units_for_module, get_selection, get_subtopics_by_ids

router = APIRouter(prefix="/ai", tags=["ai"])

_VALID_SCOPES = {"summary", "subtopic_quiz", "topic_quiz"}


class RegenerateRequest(BaseModel):
    scope: str
    ref_id: str = Field(..., min_length=1)


class PreviewRequest(BaseModel):
    selection_id: str = Field(..., min_length=1)
    scope: str
    ref_id: str = Field(..., min_length=1)


@router.post("/regenerate")
@limiter.limit("10/minute")
def ai_regenerate(
    request: Request,
    body: RegenerateRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if body.scope not in _VALID_SCOPES:
        raise HTTPException(status_code=400, detail="Invalid scope")
    enforce_ai_quota(current_user.id)
    AIService().regenerate(body.scope, body.ref_id)
    return {"status": "cache_cleared", "scope": body.scope, "ref_id": body.ref_id}


@router.post("/preview")
@limiter.limit("30/minute")
def ai_preview(
    request: Request,
    body: PreviewRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if body.scope not in _VALID_SCOPES:
        raise HTTPException(status_code=400, detail="Invalid scope")

    selection = get_selection(body.selection_id)
    if not selection:
        raise HTTPException(status_code=404, detail="Selection not found")
    if selection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    enforce_ai_quota(current_user.id)
    svc = AIService()
    try:
        if body.scope == "topic_quiz":
            lus = get_learning_units_for_module(selection.module_id)
            lu = next((x for x in lus if x.id == body.ref_id), None)
            if not lu:
                raise HTTPException(status_code=404, detail="Learning unit not found")
            return {"scope": body.scope, "ref_id": body.ref_id, "payload": svc.generate_topic_quiz(lu, selection)}

        subs = get_subtopics_by_ids([body.ref_id])
        if not subs:
            raise HTTPException(status_code=404, detail="Subtopic not found")
        if body.scope == "summary":
            return {"scope": body.scope, "ref_id": body.ref_id, "payload": svc.generate_summary(subs[0], selection)}
        if body.scope == "subtopic_quiz":
            return {"scope": body.scope, "ref_id": body.ref_id, "payload": svc.generate_subtopic_quiz(subs[0], selection)}
        raise HTTPException(status_code=400, detail="Invalid scope")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
