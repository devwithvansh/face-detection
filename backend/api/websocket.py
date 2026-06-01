from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.events import event_hub

router = APIRouter(tags=["live"])


@router.websocket("/live")
async def live(websocket: WebSocket) -> None:
    await event_hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        event_hub.disconnect(websocket)
