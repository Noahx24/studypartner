from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.src.routes.ai import router as ai_router
from app.src.routes.modules import router as modules_router
from app.src.routes.moodle import router as moodle_router
from app.src.routes.packs import router as packs_router
from app.src.routes.plans import router as plans_router
from app.src.routes.selection import router as selection_router
from app.src.routes.sync import router as sync_router
from app.src.routes.users import router as users_router
from app.storage import init_db

app = FastAPI(title="StudyPartner Backend", version="2.0.0")


origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(users_router)
app.include_router(modules_router)
app.include_router(plans_router)
app.include_router(selection_router)
app.include_router(packs_router)
app.include_router(ai_router)
app.include_router(moodle_router)
app.include_router(sync_router)
