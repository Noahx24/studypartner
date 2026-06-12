from __future__ import annotations

import logging
import re
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.src.models import Assessment, Module, ModuleType, User
from app.src.models.services.ingestion_service import upload_and_ingest
from app.src.utils.auth import ensure_module_owned, get_current_user
from app.src.utils.ratelimit import limiter
from app.storage import (
    add_assessment,
    add_module,
    get_assessments_for_module,
    get_learning_units_for_module,
    get_module_content,
    get_module_study_units,
    get_modules,
    get_user,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["modules"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTS = (".pdf", ".docx", ".txt")


class CreateModuleRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    user_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=300)
    module_type: str


class CreateAssessmentRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    module_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=500)
    due_date: str
    weight: float = Field(default=1.0, ge=0, le=100)


def _is_exam(title: str) -> bool:
    return bool(re.search(r"exam|examination", title or "", re.IGNORECASE))


@router.get("/modules")
def list_modules_endpoint(current_user: User = Depends(get_current_user)) -> dict:
    """All modules for the current user, with the next exam and the next
    assignment deadline kept separate so the UI can label them correctly.
    Deliberately tiny — this is the mobile shell's primary list view."""
    today = date.today()
    modules = []
    for m in get_modules(current_user.id):
        upcoming = [a for a in get_assessments_for_module(m.id) if a.due_date >= today]
        exams = sorted(a.due_date for a in upcoming if _is_exam(a.title))
        assignments = sorted(a.due_date for a in upcoming if not _is_exam(a.title))
        modules.append(
            {
                "id": m.id,
                "name": m.name,
                "module_type": m.module_type.value,
                "next_exam_date": exams[0].isoformat() if exams else None,
                "next_assignment_date": assignments[0].isoformat() if assignments else None,
            }
        )
    return {"modules": modules}


@router.post("/modules")
def add_module_endpoint(
    body: CreateModuleRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != body.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    module = Module(
        id=body.id,
        user_id=body.user_id,
        name=body.name,
        module_type=ModuleType(body.module_type),
    )
    add_module(module)
    return {"status": "created", "module_id": module.id}


@router.get("/assessments")
def list_assessments_endpoint(current_user: User = Depends(get_current_user)) -> dict:
    """Every assessment across the user's modules, for the calendar view.
    Moodle-synced and manually added deadlines come back together."""
    assessments = []
    for m in get_modules(current_user.id):
        for a in get_assessments_for_module(m.id):
            assessments.append(
                {
                    "id": a.id,
                    "module_id": m.id,
                    "module_name": m.name,
                    "title": a.title,
                    "due_date": a.due_date.isoformat(),
                    "kind": "exam" if _is_exam(a.title) else "assignment",
                    "status": a.status.value if hasattr(a.status, "value") else a.status,
                }
            )
    return {"assessments": assessments}


@router.post("/assessments")
def add_assessment_endpoint(
    body: CreateAssessmentRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        due = date.fromisoformat(body.due_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid due_date format (expected YYYY-MM-DD)")
    assessment = Assessment(
        id=body.id,
        module_id=body.module_id,
        title=body.title,
        due_date=due,
        weight=body.weight,
    )
    add_assessment(assessment)
    return {"status": "created", "assessment_id": assessment.id}


@router.post("/upload")
@limiter.limit("10/minute")
async def upload_content_endpoint(
    request: Request,
    user_id: str = Form(...),
    module_id: str = Form(...),
    module_name: str = Form(...),
    module_type: ModuleType = Form(...),
    pasted_text: str | None = Form(None),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if file is None and not pasted_text:
        raise HTTPException(status_code=400, detail="Provide file or pasted_text")

    filename = file.filename if file else "pasted_text.txt"
    if file is not None:
        if not filename.lower().endswith(ALLOWED_EXTS):
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTS)}",
            )
        file_content = await file.read()
        if len(file_content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large (>{MAX_UPLOAD_BYTES // (1024 * 1024)}MB)",
            )
    else:
        file_content = b""
        if pasted_text and len(pasted_text) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Pasted text too large")

    try:
        return upload_and_ingest(user, module_id, module_name, module_type, filename, file_content, pasted_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/modules/{module_id}/content")
def module_content_endpoint(
    module_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    ensure_module_owned(module_id, current_user)
    return get_module_content(module_id)


@router.get("/modules/{module_id}/study-units")
def module_units_endpoint(
    module_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    ensure_module_owned(module_id, current_user)
    return get_module_study_units(module_id)


@router.get("/modules/{module_id}/structure")
def module_structure_endpoint(
    module_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    ensure_module_owned(module_id, current_user)
    lus = get_learning_units_for_module(module_id)
    return {
        "module_id": module_id,
        "learning_units": [
            {
                "id": lu.id,
                "ordinal": lu.ordinal,
                "topic": lu.topic,
                "subtopics": [
                    {
                        "id": s.id,
                        "ordinal": s.ordinal,
                        "title": s.title,
                        "word_count": s.word_count,
                        "effort_score": s.effort_score,
                    }
                    for s in lu.subtopics
                ],
            }
            for lu in lus
        ],
    }
