from typing import Annotated

from fastapi import APIRouter, Depends

from backend.core.security import require_admin
from backend.schemas.recognition import CameraCommand
from backend.services.camera_manager import camera_manager

router = APIRouter(prefix="/camera", tags=["camera"])


@router.post("/start")
def start_camera(payload: CameraCommand, _: Annotated[dict, Depends(require_admin)]) -> dict[str, str]:
    camera_manager.start(payload.camera_id, payload.source if payload.source is not None else 0)
    return {"status": "started", "camera_id": payload.camera_id}


@router.post("/stop")
def stop_camera(payload: CameraCommand, _: Annotated[dict, Depends(require_admin)]) -> dict[str, str]:
    camera_manager.stop(payload.camera_id)
    return {"status": "stopped", "camera_id": payload.camera_id}


@router.get("/active")
def active_cameras(_: Annotated[dict, Depends(require_admin)]) -> dict[str, list[str]]:
    return {"cameras": camera_manager.list_active()}
