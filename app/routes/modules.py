from __future__ import annotations

from datetime import date

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models import Assessment, Module, ModuleType
from app.services.ingestion_service import upload_and_ingest
from app.storage import add_assessment, add_module, get_module_content, get_module_study_units, get_user

router = APIRouter(tags=["modules"])


@router.post("/modules")
def add_module_endpoint(payload: dict) -> dict:
    module = Module(
        id=payload["id"],
        user_id=payload["user_id"],
        name=payload["name"],
        module_type=ModuleType(payload["module_type"]),
    )
    add_module(module)
    return {"status": "created", "module_id": module.id}


@router.post("/assessments")
def add_assessment_endpoint(payload: dict) -> dict:
    assessment = Assessment(
        id=payload["id"],
        module_id=payload["module_id"],
        title=payload["title"],
        due_date=date.fromisoformat(payload["due_date"]),
        weight=float(payload.get("weight", 1.0)),
    )
    add_assessment(assessment)
    return {"status": "created", "assessment_id": assessment.id}


@router.post("/upload")
async def upload_content_endpoint(
    user_id: str = Form(...),
    module_id: str = Form(...),
    module_name: str = Form(...),
    module_type: ModuleType = Form(...),
    pasted_text: str | None = Form(None),
    file: UploadFile | None = File(default=None),
) -> dict:
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if file is None and not pasted_text:
        raise HTTPException(status_code=400, detail="Provide file or pasted_text")

    filename = file.filename if file else "pasted_text.txt"
    file_content = await file.read() if file else b""
    try:
        return upload_and_ingest(user, module_id, module_name, module_type, filename, file_content, pasted_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/modules/{module_id}/content")
def module_content_endpoint(module_id: str) -> dict:
    return get_module_content(module_id)


@router.get("/modules/{module_id}/study-units")
def module_units_endpoint(module_id: str) -> dict:
    return get_module_study_units(module_id)
