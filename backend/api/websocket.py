from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt

from backend.core.config import settings
from backend.services.events import event_hub

router = APIRouter(tags=["live"])


def _verify_ws_token(token: str | None) -> bool:
    """
    Validate a JWT passed as ?token= query param.
    WS connections cannot send HTTP headers so auth must come via URL.
    """
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return bool(payload.get("sub"))
    except JWTError:
        return False


@router.websocket("/live")
async def live(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    if not _verify_ws_token(token):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await event_hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        event_hub.disconnect(websocket)