from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.src.models.services.moodle_service import MoodleError, connect, import_ics, sync

router = APIRouter(prefix="/moodle", tags=["moodle"])


@router.post("/connect")
def connect_endpoint(payload: dict) -> dict:
    try:
        return connect(user_id=payload["user_id"], base_url=payload["base_url"], token=payload["token"])
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sync")
def sync_endpoint(payload: dict) -> dict:
    try:
        return sync(user_id=payload["user_id"])
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/ics/import")
def ics_import_endpoint(payload: dict) -> dict:
    try:
        return import_ics(user_id=payload["user_id"], ics_text=payload["ics_text"])
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc
