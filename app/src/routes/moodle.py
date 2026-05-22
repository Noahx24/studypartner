from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.src.models import User
from app.src.models.services.moodle_service import (
    MoodleError,
    accept_launch_token,
    build_launch_url,
    import_ics,
    ingest_selected_materials,
    sync,
)
from app.src.utils.auth import get_current_user
from app.src.utils.ratelimit import limiter
from app.storage import (
    list_moodle_resources_with_selection,
    set_moodle_resources_included,
)

router = APIRouter(prefix="/moodle", tags=["moodle"])


# ---- Schemas ----

class LaunchStartRequest(BaseModel):
    """Body for POST /moodle/launch.

    `urlscheme` must be a bare URI-scheme name (e.g. ``studypartner``).
    Moodle's tool_mobile builds the redirect target as
    ``<urlscheme>://token=<blob>`` and rejects full URLs with "Invalid
    parameter: the value of urlscheme isn't valid". The caller's native
    shell registers the same scheme so the OS routes the token back in.
    """

    urlscheme: str = Field(
        ...,
        min_length=2,
        max_length=64,
        pattern=r"^[a-zA-Z][a-zA-Z0-9.+\-]*$",
    )
    base_url: str | None = Field(default=None, min_length=4, max_length=512)


class LaunchCallbackRequest(BaseModel):
    """Body posted by the frontend after Moodle returns the token blob."""

    passport: str = Field(..., min_length=8, max_length=128)
    token: str = Field(..., min_length=8, max_length=4096)


class ICSImportRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    ics_text: str = Field(..., min_length=1)


class MaterialsSelectRequest(BaseModel):
    include: list[str] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)


# ---- Mobile-launch flow (no manual token paste) ----

@router.post("/launch")
@limiter.limit("30/hour")
def launch_endpoint(
    request: Request,
    body: LaunchStartRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Begin the Moodle mobile-launch handshake.

    Returns a `launch_url` for the frontend to navigate the browser to.
    The user signs into Moodle via their school's SSO; Moodle redirects
    back to the `urlscheme` we provide with a base64 token blob; the
    frontend then POSTs that blob to `/moodle/launch/callback` to
    complete the connection.
    """
    base_url = body.base_url or os.environ.get("STUDYPARTNER_MOODLE_BASE_URL")
    if not base_url:
        raise HTTPException(
            status_code=400,
            detail="No Moodle base URL — set STUDYPARTNER_MOODLE_BASE_URL or pass base_url",
        )
    return build_launch_url(current_user.id, base_url, body.urlscheme)


@router.post("/launch/callback")
def launch_callback_endpoint(body: LaunchCallbackRequest) -> dict:
    """Finish the launch handshake. Verifies the passport (CSRF guard),
    decodes the token, validates with Moodle, and stores the WS token
    against the user the passport was minted for. The bearer token on
    this request is OPTIONAL — the passport is itself the auth artifact
    for this single-shot handoff."""
    try:
        return accept_launch_token(passport=body.passport, encoded_token=body.token)
    except MoodleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/sync")
@limiter.limit("6/minute")
def sync_endpoint(request: Request, current_user: User = Depends(get_current_user)) -> dict:
    """Pull courses → modules, assignments → assessments, and resource
    metadata. Idempotent and metadata-only — no file bytes downloaded."""
    try:
        return sync(user_id=current_user.id)
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


# ---- Material selection (which Moodle files feed the AI) ----

@router.get("/materials")
def list_materials_endpoint(current_user: User = Depends(get_current_user)) -> dict:
    """All Moodle resources auto-imported for the user, with their AI
    selection state. Frontend renders this as a per-module checklist."""
    return {"resources": list_moodle_resources_with_selection(current_user.id)}


@router.post("/materials/select")
def materials_select_endpoint(
    body: MaterialsSelectRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Toggle which materials feed AI processing. Scoped to the current
    user — flips against another user's resources are no-ops."""
    n_in = set_moodle_resources_included(current_user.id, body.include, True)
    n_out = set_moodle_resources_included(current_user.id, body.exclude, False)
    return {"included": n_in, "excluded": n_out}


@router.post("/materials/ingest")
@limiter.limit("2/minute")
def materials_ingest_endpoint(request: Request, current_user: User = Depends(get_current_user)) -> dict:
    """Download bytes + run AI ingestion for everything currently ticked.
    Idempotent — already-ingested resources are skipped."""
    try:
        return ingest_selected_materials(current_user.id)
    except MoodleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
