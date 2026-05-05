from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.src.models import User
from app.src.models.services.moodle_service import (
    MoodleError,
    connect,
    import_ics,
    ingest_selected_materials,
    sync,
)
from app.src.routes.auth import get_current_user
from app.storage import (
    list_moodle_resources_with_selection,
    set_moodle_resources_included,
)

router = APIRouter(prefix="/moodle", tags=["moodle"])


@router.post("/connect")
def connect_endpoint(payload: dict, current: User = Depends(get_current_user)) -> dict:
    try:
        return connect(user_id=current.id, base_url=payload["base_url"], token=payload["token"])
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sync")
def sync_endpoint(current: User = Depends(get_current_user)) -> dict:
    try:
        return sync(user_id=current.id)
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/ics/import")
def ics_import_endpoint(payload: dict, current: User = Depends(get_current_user)) -> dict:
    try:
        return import_ics(user_id=current.id, ics_text=payload["ics_text"])
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc


@router.get("/materials")
def list_materials(current: User = Depends(get_current_user)) -> dict:
    """All Moodle resources auto-imported for the user, with their AI
    selection state. Frontend renders this as a checklist grouped by module."""
    return {"resources": list_moodle_resources_with_selection(current.id)}


@router.post("/materials/select")
def select_materials(payload: dict, current: User = Depends(get_current_user)) -> dict:
    """Toggle which materials feed into AI processing.

    Payload:
        { "include": ["res-1", "res-2", ...], "exclude": ["res-3", ...] }
    """
    included_ids = list(payload.get("include") or [])
    excluded_ids = list(payload.get("exclude") or [])
    n_in = set_moodle_resources_included(current.id, included_ids, True)
    n_out = set_moodle_resources_included(current.id, excluded_ids, False)
    return {"included": n_in, "excluded": n_out}


@router.post("/materials/ingest")
def ingest_selected(current: User = Depends(get_current_user)) -> dict:
    """Download and ingest the materials the user has flagged for AI.
    Idempotent — already-ingested resources are skipped."""
    try:
        return ingest_selected_materials(current.id)
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
