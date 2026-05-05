"""Microsoft Entra ID (Azure AD) OAuth2 authorization-code flow.

Lets a student sign in with their school Microsoft account — the same
account they use for Moodle (e.g. `10520467@mylife.unisa.ac.za`). We use
that identity as the StudyPartner login; once signed in, the student can
optionally connect Moodle by pasting a Moodle Web Services token.

Configuration via environment variables:
    MICROSOFT_CLIENT_ID     — Azure AD app (client) ID
    MICROSOFT_CLIENT_SECRET — Azure AD app secret
    MICROSOFT_TENANT_ID     — tenant ID, or `organizations` for any
                              work/school account, or `common` for any
                              Microsoft account. Defaults to `organizations`
                              so personal `@outlook.com` accounts can't sign in.
    MICROSOFT_REDIRECT_URI  — must match the redirect URI registered in
                              Azure. Defaults to the local backend callback.
    STUDYPARTNER_FRONTEND_URL — where to bounce the browser after we issue
                                a session token. Defaults to the Vite dev server.
    STUDYPARTNER_ALLOWED_EMAIL_DOMAINS — optional comma-separated list of
                                domains the email must end with (e.g.
                                `mylife.unisa.ac.za,unisa.ac.za`). Empty
                                means any domain is accepted.

If `MICROSOFT_CLIENT_ID` is not set, the service runs in *dev fallback*
mode: `/auth/microsoft/start` returns a stub URL and `/auth/microsoft/dev`
lets the test suite mint a session without contacting Microsoft. Production
deployments MUST set the real env vars.
"""
from __future__ import annotations

from datetime import timedelta
import json
import os
import secrets
import urllib.parse
import urllib.request

from app.src.utils.time import utcnow_aware


SCOPES = ["openid", "profile", "email", "User.Read"]
SESSION_TTL = timedelta(days=7)
STATE_TTL = timedelta(minutes=10)


class MicrosoftAuthError(Exception):
    """Anything that goes wrong during the OAuth dance."""


def _config() -> dict[str, str | None]:
    return {
        "client_id": os.environ.get("MICROSOFT_CLIENT_ID"),
        "client_secret": os.environ.get("MICROSOFT_CLIENT_SECRET"),
        "tenant_id": os.environ.get("MICROSOFT_TENANT_ID", "organizations"),
        "redirect_uri": os.environ.get(
            "MICROSOFT_REDIRECT_URI", "http://localhost:8000/auth/microsoft/callback"
        ),
        "frontend_url": os.environ.get(
            "STUDYPARTNER_FRONTEND_URL", "http://localhost:5173"
        ),
    }


def is_configured() -> bool:
    cfg = _config()
    return bool(cfg["client_id"] and cfg["client_secret"])


def allowed_email_domains() -> list[str]:
    raw = os.environ.get("STUDYPARTNER_ALLOWED_EMAIL_DOMAINS", "").strip()
    if not raw:
        return []
    return [d.strip().lower().lstrip("@") for d in raw.split(",") if d.strip()]


def email_is_allowed(email: str) -> bool:
    domains = allowed_email_domains()
    if not domains:
        return True
    return any(email.lower().endswith(f"@{d}") for d in domains)


def build_authorize_url(state: str) -> str:
    cfg = _config()
    if not is_configured():
        # Dev fallback — return a benign URL the frontend can recognize.
        return f"about:blank#microsoft-auth-not-configured&state={state}"
    params = {
        "client_id": cfg["client_id"],
        "response_type": "code",
        "redirect_uri": cfg["redirect_uri"],
        "response_mode": "query",
        "scope": " ".join(SCOPES),
        "state": state,
        "prompt": "select_account",
    }
    base = f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/authorize"
    return f"{base}?{urllib.parse.urlencode(params)}"


def issue_state() -> str:
    return secrets.token_urlsafe(24)


def issue_session_token() -> str:
    return secrets.token_urlsafe(32)


def state_lifetime() -> tuple:
    now = utcnow_aware()
    return now, now + STATE_TTL


def session_lifetime() -> tuple:
    now = utcnow_aware()
    return now, now + SESSION_TTL


def exchange_code_for_userinfo(code: str) -> dict:
    """Exchange the authorization code for a token, then fetch the user's
    profile from Microsoft Graph. Returns:
        {"oid": str, "email": str, "name": str}
    """
    if not is_configured():
        raise MicrosoftAuthError("Microsoft auth not configured")

    cfg = _config()
    token_url = f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/token"
    body = urllib.parse.urlencode(
        {
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "scope": " ".join(SCOPES),
            "code": code,
            "redirect_uri": cfg["redirect_uri"],
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        token_url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            token_payload = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise MicrosoftAuthError(f"Token exchange failed: {exc}") from exc

    access_token = token_payload.get("access_token")
    if not access_token:
        raise MicrosoftAuthError(
            f"No access_token in response: {token_payload.get('error_description', 'unknown')}"
        )

    graph_req = urllib.request.Request(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urllib.request.urlopen(graph_req, timeout=15) as resp:
            me = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise MicrosoftAuthError(f"Graph /me call failed: {exc}") from exc

    # School/work accounts return mail in .mail; some tenants only set
    # .userPrincipalName. Fall back so 10520467@mylife.unisa.ac.za works
    # whichever the tenant exposes.
    email = (me.get("mail") or me.get("userPrincipalName") or "").strip()
    oid = me.get("id")
    name = me.get("displayName") or email.split("@")[0]
    if not oid or not email:
        raise MicrosoftAuthError("Graph response missing id or email")
    return {"oid": oid, "email": email, "name": name}
