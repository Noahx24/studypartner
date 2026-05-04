from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.src.models import User
from app.src.models.services.sync_service import apply
from app.src.utils.auth import get_current_user

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    ops: list[dict] = Field(default_factory=list)
    last_pulled_at: str | None = None


@router.post("")
def sync_endpoint(
    body: SyncRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return apply(user_id=body.user_id, ops=body.ops, last_pulled_at=body.last_pulled_at)
