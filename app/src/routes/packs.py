from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.src.models import User
from app.src.models.services.study_pack_service import build_pack, new_pack, regenerate_artifact
from app.src.utils.auth import get_current_user
from app.src.utils.quota import enforce_ai_quota
from app.src.utils.ratelimit import limiter
from app.storage import get_pack, list_packs_for_module

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pack", tags=["packs"])


class GeneratePackRequest(BaseModel):
    selection_id: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)


class RegenerateRequest(BaseModel):
    scope: str
    ref_id: str = Field(..., min_length=1)


@router.post("/generate")
@limiter.limit("5/minute")
def generate_pack(
    request: Request,
    body: GeneratePackRequest,
    tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    enforce_ai_quota(body.user_id)
    try:
        pack = new_pack(user_id=body.user_id, selection_id=body.selection_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    tasks.add_task(build_pack, pack.id)
    return {"pack_id": pack.id, "status": pack.status.value}


@router.get("/{pack_id}")
def pack_status(
    pack_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    pack = get_pack(pack_id)
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not found")
    if pack.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "id": pack.id,
        "module_id": pack.module_id,
        "user_id": pack.user_id,
        "selection_id": pack.selection_id,
        "status": pack.status.value,
        "byte_size": pack.byte_size,
        "version": pack.version,
        "generated_at": pack.generated_at.isoformat() if pack.generated_at else None,
        "error": pack.error,
    }


@router.get("/{pack_id}/download")
def download_pack(
    pack_id: str,
    current_user: User = Depends(get_current_user),
) -> Response:
    pack = get_pack(pack_id)
    if not pack or pack.payload is None:
        raise HTTPException(status_code=404, detail="Pack payload not available")
    if pack.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    etag = f'"{pack.id}-v{pack.version}"'
    return Response(
        content=pack.payload,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "ETag": etag,
            "Cache-Control": "private, max-age=0, must-revalidate",
        },
    )


@router.get("/module/{module_id}/{user_id}")
def list_packs(
    module_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    packs = list_packs_for_module(module_id, user_id)
    return {
        "packs": [
            {
                "id": p.id,
                "status": p.status.value,
                "byte_size": p.byte_size,
                "version": p.version,
                "generated_at": p.generated_at.isoformat() if p.generated_at else None,
            }
            for p in packs
        ]
    }


@router.post("/{pack_id}/regenerate")
def regenerate_endpoint(
    pack_id: str,
    body: RegenerateRequest,
    tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
) -> dict:
    if body.scope not in {"summary", "subtopic_quiz", "topic_quiz"}:
        raise HTTPException(status_code=400, detail="Invalid scope")
    pack = get_pack(pack_id)
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not found")
    if pack.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    enforce_ai_quota(current_user.id)
    tasks.add_task(regenerate_artifact, pack_id, body.scope, body.ref_id)
    return {"pack_id": pack_id, "status": "generating", "regenerate": {"scope": body.scope, "ref_id": body.ref_id}}
