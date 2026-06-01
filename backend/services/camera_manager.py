import asyncio
import base64
import logging
import threading
import time
from dataclasses import dataclass

import cv2

from backend.database.session import SessionLocal
from backend.services.events import event_hub
from backend.services.recognizer import recognition_pipeline

LOGGER = logging.getLogger(__name__)


@dataclass
class CameraWorker:
    camera_id: str
    source: str | int
    stop_event: threading.Event
    thread: threading.Thread


class CameraManager:
    def __init__(self) -> None:
        self._workers: dict[str, CameraWorker] = {}

    def start(self, camera_id: str, source: str | int) -> None:
        if camera_id in self._workers:
            return
        stop_event = threading.Event()
        thread = threading.Thread(target=self._run, args=(camera_id, source, stop_event), daemon=True)
        self._workers[camera_id] = CameraWorker(camera_id, source, stop_event, thread)
        thread.start()

    def stop(self, camera_id: str) -> None:
        worker = self._workers.pop(camera_id, None)
        if worker:
            worker.stop_event.set()

    def list_active(self) -> list[str]:
        return list(self._workers)

    def _run(self, camera_id: str, source: str | int, stop_event: threading.Event) -> None:
        capture_source = int(source) if str(source).isdigit() else source
        cap = cv2.VideoCapture(capture_source)
        if not cap.isOpened():
            LOGGER.error("Camera %s failed to open source %s", camera_id, source)
            return
        while not stop_event.is_set():
            ok, frame = cap.read()
            if not ok:
                time.sleep(1)
                continue
            db = SessionLocal()
            try:
                annotated, results, events = recognition_pipeline.process_frame(db, frame, camera_id)
                for event in events:
                    asyncio.run(event_hub.broadcast(event))
                _, buffer = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                payload = {
                    "type": "frame",
                    "camera_id": camera_id,
                    "image": base64.b64encode(buffer).decode("ascii"),
                    "detections": [item.model_dump() for item in results],
                }
                asyncio.run(event_hub.broadcast(payload))
            except Exception:
                LOGGER.exception("Camera %s processing failed", camera_id)
            finally:
                db.close()
            time.sleep(0.15)
        cap.release()


camera_manager = CameraManager()
