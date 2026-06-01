import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import RLock

import cv2
import numpy as np
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.detection.yolo_face import face_detector
from backend.models.personnel import Personnel
from backend.models.unknown import UnknownFace
from backend.recognition.embeddings import embedding_service
from backend.schemas.recognition import RecognitionResult
from backend.services.attendance import mark_absent_exits, mark_seen
from backend.services.vector_index import vector_index
from backend.utils.images import save_image

LOGGER = logging.getLogger(__name__)
UNKNOWN_SIMILARITY_THRESHOLD = 0.45  # CHANGED: was 0.75, lowered so duplicate check is more lenient


@dataclass
class UnknownCacheEntry:
    embedding: np.ndarray
    timestamp: datetime
    unknown_id: int


# NEW: tracks recently registered people so next frame recognises them immediately
@dataclass
class RecentlyRegisteredEntry:
    embedding: np.ndarray
    timestamp: datetime
    personnel_id: int


class RecognitionPipeline:
    def __init__(self) -> None:
        self._recent_unknowns: list[UnknownCacheEntry] = []
        self._unknown_lock = RLock()
        # NEW: cache for people registered in the last 30 seconds
        self._recently_registered: list[RecentlyRegisteredEntry] = []
        self._registered_lock = RLock()

    def process_frame(self, db: Session, frame: np.ndarray, camera_id: str) -> tuple[np.ndarray, list[RecognitionResult], list[dict]]:
        detections = face_detector.detect(frame)
        results: list[RecognitionResult] = []
        events: list[dict] = []
        annotated = frame.copy()

        for detection in detections:
            x1, y1, x2, y2 = self._clamp_box(detection.box, frame)
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            embedding = embedding_service.embed_face(crop)
            personnel_id, score = vector_index.search(embedding)
            known = bool(personnel_id and score >= settings.recognition_threshold)

            # NEW: if vector index didn't recognise them, check if they just registered
            if not known:
                recent_pid = self._find_recently_registered(embedding)
                if recent_pid is not None:
                    known = True
                    personnel_id = recent_pid
                    score = 1.0  # treat as fully confident

            if known:
                result = self._handle_known(db, personnel_id, score, camera_id, detection.detection_id, [x1, y1, x2, y2])
            else:
                result, event = self._handle_unknown(
                    db, crop, embedding, score, camera_id, detection.detection_id, [x1, y1, x2, y2]
                )
                if event:
                    events.append(event)
            self._draw(annotated, result)
            results.append(result)

        mark_absent_exits(db, camera_id)
        db.commit()
        return annotated, results, events

    def _handle_known(
        self, db: Session, personnel_id: int, score: float, camera_id: str, detection_id: str, box: list[int]
    ) -> RecognitionResult:
        person = db.get(Personnel, personnel_id)
        name = person.full_name if person else f"personnel_id={personnel_id}"
        LOGGER.info("KNOWN PERSON: %s confidence=%.2f", name, score)
        log = mark_seen(db, personnel_id, camera_id, score)
        status_text = log.status if log else "SEEN"
        return RecognitionResult(
            detection_id=detection_id,
            known=True,
            personnel_id=personnel_id,
            army_id=person.army_id if person else None,
            full_name=person.full_name if person else None,
            confidence=score,
            status=status_text,
            box=box,
        )

    def _handle_unknown(
        self,
        db: Session,
        crop: np.ndarray,
        embedding: np.ndarray,
        score: float,
        camera_id: str,
        detection_id: str,
        box: list[int],
    ) -> tuple[RecognitionResult, dict | None]:
        now = datetime.now(timezone.utc)
        duplicate_id = self._find_duplicate_unknown(embedding, now)
        if duplicate_id is not None:
            LOGGER.info("UNKNOWN SKIPPED (pending): id=%s", duplicate_id)
            return RecognitionResult(
                detection_id=detection_id,
                known=False,
                unknown_id=duplicate_id,
                confidence=score,
                status="UNKNOWN_DUPLICATE",
                box=box,
            ), None

        image_path = save_image(crop, "unknown", "unknown")
        unknown = UnknownFace(image_path=image_path)
        db.add(unknown)
        db.flush()
        self._remember_unknown(embedding, now, unknown.id)
        LOGGER.info("NEW UNKNOWN CREATED: id=%s", unknown.id)
        event = {
            "type": "unknown_detected",
            "unknown_id": unknown.id,
            "image_path": image_path,
            "timestamp": now.isoformat(),
            "camera_id": camera_id,
        }
        return RecognitionResult(
            detection_id=detection_id,
            known=False,
            unknown_id=unknown.id,
            confidence=score,
            status="UNKNOWN",
            box=box,
        ), event

    def _find_duplicate_unknown(self, embedding: np.ndarray, now: datetime) -> int | None:
        with self._unknown_lock:
            cooldown = timedelta(seconds=settings.duplicate_window_seconds)
            self._recent_unknowns = [
                entry for entry in self._recent_unknowns if now - entry.timestamp <= cooldown
            ]
            for entry in self._recent_unknowns:
                similarity = float(np.dot(entry.embedding, embedding))
                if similarity > UNKNOWN_SIMILARITY_THRESHOLD:
                    entry.timestamp = now  # refresh so cooldown resets each time they're seen
                    return entry.unknown_id
        return None

    def _remember_unknown(self, embedding: np.ndarray, now: datetime, unknown_id: int) -> None:
        with self._unknown_lock:
            self._recent_unknowns.append(UnknownCacheEntry(embedding=embedding.copy(), timestamp=now, unknown_id=unknown_id))

    def clear_unknown_cache(self) -> None:
        with self._unknown_lock:
            self._recent_unknowns.clear()

    def remove_unknown_cache(self, unknown_id: int) -> None:
        with self._unknown_lock:
            self._recent_unknowns = [entry for entry in self._recent_unknowns if entry.unknown_id != unknown_id]

    def get_unknown_embedding(self, unknown_id: int) -> np.ndarray | None:
        with self._unknown_lock:
            for entry in self._recent_unknowns:
                if entry.unknown_id == unknown_id:
                    return entry.embedding.copy()
        return None

    # NEW: called from unknown.py after a successful registration
    def remember_registered(self, personnel_id: int, embedding: np.ndarray) -> None:
        now = datetime.now(timezone.utc)
        with self._registered_lock:
            self._recently_registered.append(
                RecentlyRegisteredEntry(embedding=embedding.copy(), timestamp=now, personnel_id=personnel_id)
            )
        LOGGER.info("REGISTERED CACHE: added personnel_id=%s for 30s grace window", personnel_id)

    # NEW: checks if an embedding matches someone who just registered (30s grace window)
    def _find_recently_registered(self, embedding: np.ndarray) -> int | None:
        now = datetime.now(timezone.utc)
        with self._registered_lock:
            cutoff = timedelta(seconds=30)
            self._recently_registered = [
                e for e in self._recently_registered if now - e.timestamp <= cutoff
            ]
            for entry in self._recently_registered:
                if float(np.dot(entry.embedding, embedding)) > UNKNOWN_SIMILARITY_THRESHOLD:
                    return entry.personnel_id
        return None

    def _clamp_box(self, box: tuple[int, int, int, int], frame: np.ndarray) -> tuple[int, int, int, int]:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = box
        return max(0, x1), max(0, y1), min(w, x2), min(h, y2)

    def _draw(self, frame: np.ndarray, result: RecognitionResult) -> None:
        x1, y1, x2, y2 = result.box
        color = (0, 180, 0) if result.known else (0, 0, 255)
        label = f"{result.full_name or 'Unknown'} {result.confidence:.2f}"
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, label, (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)


recognition_pipeline = RecognitionPipeline()