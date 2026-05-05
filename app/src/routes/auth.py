"""Auth routes — Microsoft Entra ID sign-in.

Flow:
    1. Frontend calls `GET /auth/microsoft/start` to get an authorization URL.
    2. Browser is redirected to Microsoft. After consent, Microsoft sends
       the user back to `GET /auth/microsoft/callback?code=…&state=…`.
    3. We exchange the code, look up or create a User keyed by the
       Microsoft `oid`, mint a session token, and redirect the browser
       back to the frontend with `#auth_token=…` in the URL fragment.
    4. The frontend parses the fragment, stores the token, and uses it
       as a `Authorization: Bearer …` header for subsequent calls.

`GET /auth/me` is the canonical "who am I" endpoint and the dependency
hook for protecting other routes.
"""
from __future__ import annotations

import os
import secrets
import urllib.parse
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import RedirectResponse

from app.src.models import Pace, User
from app.src.models.services import microsoft_auth_service as ms_auth
from app.src.utils.time import utcnow_aware
from app.storage import (
    consume_auth_state,
    create_auth_session,
    create_user,
    delete_auth_session,
    get_session_user_id,
    get_user,
    get_user_by_email,
    get_user_by_microsoft_oid,
    link_microsoft_oid,
    purge_expired_auth,
    save_auth_state,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---- Dependency: current user from Bearer token ----

def get_current_user(authorization: str | None = Header(default=None)) -> User:
    """FastAPI dependency. Raises 401 unless `Authorization: Bearer <tok>`
    matches a live session."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = get_session_user_id(token, utcnow_aware())
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "hours_per_day": user.hours_per_day,
        "days_per_week": user.days_per_week,
        "pace": user.pace.value,
        "custom_minutes_per_500_words": user.custom_minutes_per_500_words,
        "max_daily_hours": user.max_daily_hours,
        "microsoft_oid": user.microsoft_oid,
    }


# ---- Routes ----

@router.get("/microsoft/start")
def microsoft_start() -> dict:
    """Begin the OAuth dance. Returns the URL the browser should navigate to."""
    purge_expired_auth(utcnow_aware())
    state = ms_auth.issue_state()
    created, expires = ms_auth.state_lifetime()
    save_auth_state(state, created, expires)
    return {
        "authorize_url": ms_auth.build_authorize_url(state),
        "state": state,
        "configured": ms_auth.is_configured(),
    }


@router.get("/microsoft/callback")
def microsoft_callback(
    code: str = Query(...),
    state: str = Query(...),
) -> RedirectResponse:
    """Microsoft redirects here after the user signs in. We never expose
    this to the SPA directly — instead we redirect back to the frontend
    with the freshly minted session token in the URL fragment so it
    doesn't end up in server logs."""
    now = utcnow_aware()
    if not consume_auth_state(state, now):
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    try:
        info = ms_auth.exchange_code_for_userinfo(code)
    except ms_auth.MicrosoftAuthError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not ms_auth.email_is_allowed(info["email"]):
        raise HTTPException(
            status_code=403,
            detail="This email domain isn't allowed for StudyPartner.",
        )

    user = _upsert_user_from_microsoft(info)
    token = _mint_session(user.id)

    frontend = os.environ.get("STUDYPARTNER_FRONTEND_URL", "http://localhost:5173")
    fragment = urllib.parse.urlencode({"auth_token": token, "user_id": user.id})
    return RedirectResponse(url=f"{frontend}/#{fragment}", status_code=302)


@router.post("/microsoft/dev")
def microsoft_dev_signin(payload: dict) -> dict:
    """Dev/test shortcut — bypasses Microsoft and creates a session for a
    given email. ONLY available when Microsoft auth is *not* configured.
    Lets us run integration tests and local dev without Azure."""
    if ms_auth.is_configured():
        raise HTTPException(status_code=404, detail="Not available")
    email = (payload.get("email") or "").strip()
    name = payload.get("name") or email.split("@")[0]
    oid = payload.get("oid") or f"dev-{secrets.token_hex(8)}"
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    if not ms_auth.email_is_allowed(email):
        raise HTTPException(status_code=403, detail="Email domain not allowed")
    user = _upsert_user_from_microsoft({"oid": oid, "email": email, "name": name})
    token = _mint_session(user.id)
    return {"auth_token": token, "user": _serialize_user(user)}


@router.get("/me")
def whoami(current: User = Depends(get_current_user)) -> dict:
    return {"user": _serialize_user(current)}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)) -> dict:
    if authorization and authorization.lower().startswith("bearer "):
        delete_auth_session(authorization.split(" ", 1)[1].strip())
    return {"status": "ok"}


# ---- Helpers ----

def _upsert_user_from_microsoft(info: dict) -> User:
    """Find the user by Microsoft `oid`, then by email, otherwise create.
    The email lookup catches the case where someone manually onboarded
    before connecting Microsoft — we link the existing record instead of
    creating a duplicate."""
    existing = get_user_by_microsoft_oid(info["oid"])
    if existing:
        return existing

    by_email = get_user_by_email(info["email"])
    if by_email:
        link_microsoft_oid(by_email.id, info["oid"])
        by_email.microsoft_oid = info["oid"]
        return by_email

    user = User(
        id=str(uuid.uuid4()),
        name=info["name"],
        email=info["email"],
        hours_per_day=2.0,
        days_per_week=5,
        pace=Pace.normal,
        microsoft_oid=info["oid"],
    )
    create_user(user)
    return user


def _mint_session(user_id: str) -> str:
    token = ms_auth.issue_session_token()
    created, expires = ms_auth.session_lifetime()
    create_auth_session(token, user_id, created, expires)
    return token
