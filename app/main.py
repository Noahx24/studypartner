from fastapi import FastAPI

from app.routes.modules import router as modules_router
from app.routes.plans import router as plans_router
from app.routes.users import router as users_router
from app.storage import init_db

app = FastAPI(title="StudyPartner Backend", version="2.0.0")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(users_router)
app.include_router(modules_router)
app.include_router(plans_router)
