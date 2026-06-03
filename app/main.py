from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.src.routes.ai import router as ai_router
from app.src.routes.modules import router as modules_router
from app.src.routes.moodle import router as moodle_router
from app.src.routes.packs import router as packs_router
from app.src.routes.plans import router as plans_router
from app.src.routes.selection import router as selection_router
from app.src.routes.sync import router as sync_router
from app.src.routes.units import router as units_router
from app.src.routes.users import router as users_router
from app.src.utils.logging_config import RequestIdMiddleware, configure_logging
from app.src.utils.metrics import attach_counter_middleware, router as observability_router
from app.src.utils.ratelimit import limiter
from app.storage import init_db

# Must run before any module-level logger.info/error fires so JSON
# mode (production) doesn't lose startup output to the basicConfig
# default. configure_logging picks json vs text from
# STUDYPARTNER_LOG_FORMAT (default text).
configure_logging()


def _parse_origins() -> list[str]:
    """Comma-separated origin list from STUDYPARTNER_CORS_ORIGINS.

    Defaults to the Vite dev server for local work. Production deployments
    MUST set an explicit allowlist — never leave this as "*" for a credentialed
    API.
    """
    raw = os.environ.get("STUDYPARTNER_CORS_ORIGINS", "http://localhost:5173")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if any(o == "*" for o in origins):
        raise RuntimeError(
            "STUDYPARTNER_CORS_ORIGINS contains '*', which is incompatible with "
            "allow_credentials=True. Set an explicit origin allowlist."
        )
    return origins


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


# Static security headers applied to every response. The API never
# renders HTML, so the CSP is very locked-down — `default-src 'none'`
# blocks any inline JS / fetch / iframe / etc. should a misconfigured
# error page ever serve text/html. The frontend's own CSP lives in
# its nginx config (and in Capacitor's Info.plist for native).
SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply HSTS, CSP, X-Frame-Options, etc. to every response.

    Starlette middleware fires for both success and HTTPException paths,
    so error responses are also hardened. The headers are static so
    cost is negligible.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response


app = FastAPI(title="StudyPartner Backend", version="2.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware order (Starlette wraps innermost first):
#   counter (innermost — counts all responses, incl. rate-limited)
#   security headers (always applied, even to error responses)
#   CORS
#   request-id (outermost — ID set before any handler logs)
attach_counter_middleware(app)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Request-ID"],
)
app.add_middleware(RequestIdMiddleware)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "backend": settings.llm_backend,
        "model": settings.ollama_model,
        "moodle": settings.moodle_base_url,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(observability_router)
app.include_router(users_router)
app.include_router(modules_router)
app.include_router(units_router)
app.include_router(plans_router)
app.include_router(selection_router)
app.include_router(packs_router)
app.include_router(ai_router)
app.include_router(moodle_router)
app.include_router(sync_router)
