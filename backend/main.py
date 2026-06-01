from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import attendance, auth, cameras, personnel, recognition, unknown, websocket
from backend.core.config import settings
from backend.core.logging import configure_logging
from backend.database.session import Base, engine
from backend.services.vector_index import vector_index


configure_logging()

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(personnel.router)
app.include_router(attendance.router)
app.include_router(unknown.router)
app.include_router(cameras.router)
app.include_router(recognition.router)
app.include_router(websocket.router)
app.mount("/storage", StaticFiles(directory=str(settings.storage_path)), name="storage")


@app.on_event("startup")
def startup() -> None:
    settings.validate_runtime()
    if settings.create_tables_on_startup:
        Base.metadata.create_all(bind=engine)
    vector_index.rebuild()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
