from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.src.models.services.sync_service import apply

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("")
def sync_endpoint(payload: dict) -> dict:
    try:
        user_id = payload["user_id"]
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc
    ops = payload.get("ops", []) or []
    last_pulled_at = payload.get("last_pulled_at")
    return apply(user_id=user_id, ops=ops, last_pulled_at=last_pulled_at)
