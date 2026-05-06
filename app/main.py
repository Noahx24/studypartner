from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

from app.src.routes.ai import router as ai_router
from app.src.routes.modules import router as modules_router
from app.src.routes.moodle import router as moodle_router
from app.src.routes.packs import router as packs_router
from app.src.routes.plans import router as plans_router
from app.src.routes.selection import router as selection_router
from app.src.routes.sync import router as sync_router
from app.src.routes.units import router as units_router
from app.src.routes.users import router as users_router
from app.storage import init_db


def _parse_origins() -> list[str]:
    """Comma-separated origin list from STUDYPARTNER_CORS_ORIGINS.

    Defaults to the Vite dev server for local work. Production deployments
    MUST set an explicit allowlist — never leave this as "*" for a credentialed
    API.
    """
    raw = os.environ.get("STUDYPARTNER_CORS_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="StudyPartner Backend", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(users_router)
app.include_router(modules_router)
app.include_router(units_router)
app.include_router(plans_router)
app.include_router(selection_router)
app.include_router(packs_router)
app.include_router(ai_router)
app.include_router(moodle_router)
app.include_router(sync_router)
