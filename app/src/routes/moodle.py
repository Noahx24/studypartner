from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.src.models import User
from app.src.models.services.moodle_service import MoodleError, connect, import_ics, sync
from app.src.utils.auth import get_current_user

router = APIRouter(prefix="/moodle", tags=["moodle"])


class ConnectRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    base_url: str = Field(..., min_length=1)
    token: str = Field(..., min_length=1)


class SyncRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


class ICSImportRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    ics_text: str = Field(..., min_length=1)


@router.post("/connect")
def connect_endpoint(
    body: ConnectRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        return connect(user_id=body.user_id, base_url=body.base_url, token=body.token)
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sync")
def sync_endpoint(
    body: SyncRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        return sync(user_id=body.user_id)
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/ics/import")
def ics_import_endpoint(
    body: ICSImportRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return import_ics(user_id=body.user_id, ics_text=body.ics_text)
