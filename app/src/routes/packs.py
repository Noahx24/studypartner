from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Response

from app.src.models.services.study_pack_service import build_pack, new_pack, regenerate_artifact
from app.storage import get_pack, list_packs_for_module

router = APIRouter(prefix="/pack", tags=["packs"])


@router.post("/generate")
def generate_pack(payload: dict, tasks: BackgroundTasks) -> dict:
    try:
        selection_id = payload["selection_id"]
        user_id = payload["user_id"]
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc

    try:
        pack = new_pack(user_id=user_id, selection_id=selection_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    tasks.add_task(build_pack, pack.id)
    return {"pack_id": pack.id, "status": pack.status.value}


@router.get("/{pack_id}")
def pack_status(pack_id: str) -> dict:
    pack = get_pack(pack_id)
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not found")
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
def download_pack(pack_id: str) -> Response:
    pack = get_pack(pack_id)
    if not pack or pack.payload is None:
        raise HTTPException(status_code=404, detail="Pack payload not available")
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
def list_packs(module_id: str, user_id: str) -> dict:
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
def regenerate_endpoint(pack_id: str, payload: dict, tasks: BackgroundTasks) -> dict:
    try:
        scope = payload["scope"]
        ref_id = payload["ref_id"]
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing field: {exc.args[0]}") from exc

    if scope not in {"summary", "subtopic_quiz", "topic_quiz"}:
        raise HTTPException(status_code=400, detail="Invalid scope")

    # Run synchronously as a BackgroundTask so the client returns immediately
    tasks.add_task(regenerate_artifact, pack_id, scope, ref_id)
    return {"pack_id": pack_id, "status": "generating", "regenerate": {"scope": scope, "ref_id": ref_id}}
