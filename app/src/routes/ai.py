from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.src.models.services.ai_service import AIService
from app.storage import get_learning_units_for_module, get_selection, get_subtopics_by_ids

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/regenerate")
def ai_regenerate(payload: dict) -> dict:
    """Drop a cached artifact so the next pack build will produce a fresh one.

    Does not trigger a full pack rebuild — use /pack/{id}/regenerate for that.
    """
    try:
        scope = payload["scope"]
        ref_id = payload["ref_id"]
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc

    if scope not in {"summary", "subtopic_quiz", "topic_quiz"}:
        raise HTTPException(status_code=400, detail="Invalid scope")

    AIService().regenerate(scope, ref_id)
    return {"status": "cache_cleared", "scope": scope, "ref_id": ref_id}


@router.post("/preview")
def ai_preview(payload: dict) -> dict:
    """Generate a single artifact without writing a pack. Used for inline regenerate UX."""
    try:
        selection_id = payload["selection_id"]
        scope = payload["scope"]
        ref_id = payload["ref_id"]
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc

    selection = get_selection(selection_id)
    if not selection:
        raise HTTPException(status_code=404, detail="Selection not found")

    svc = AIService()
    try:
        if scope == "topic_quiz":
            lus = get_learning_units_for_module(selection.module_id)
            lu = next((x for x in lus if x.id == ref_id), None)
            if not lu:
                raise HTTPException(status_code=404, detail="Learning unit not found")
            return {"scope": scope, "ref_id": ref_id, "payload": svc.generate_topic_quiz(lu, selection)}

        subs = get_subtopics_by_ids([ref_id])
        if not subs:
            raise HTTPException(status_code=404, detail="Subtopic not found")
        if scope == "summary":
            return {"scope": scope, "ref_id": ref_id, "payload": svc.generate_summary(subs[0], selection)}
        if scope == "subtopic_quiz":
            return {"scope": scope, "ref_id": ref_id, "payload": svc.generate_subtopic_quiz(subs[0], selection)}
        raise HTTPException(status_code=400, detail="Invalid scope")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
