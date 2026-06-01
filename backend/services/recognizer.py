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

# Threshold for duplicate unknown detection
UNKNOWN_SIMILARITY_THRESHOLD = 0.35

# Separate lower threshold for grace window (post-registration matching)
GRACE_WINDOW_THRESHOLD = 0.30


@dataclass
class UnknownCacheEntry:
    embedding: np.ndarray
    timestamp: datetime
    unknown_id: int


@dataclass
class RecentlyRegisteredEntry:
    embedding: np.ndarray
    timestamp: datetime
    personnel_id: int


class RecognitionPipeline:
    def __init__(self) -> None:
        self._recent_unknowns: list[UnknownCacheEntry] = []
        self._unknown_lock = RLock()
        self._recently_registered: list[RecentlyRegisteredEntry] = []
        self._registered_lock = RLock()

    def process_frame(
        self, db: Session, frame: np.ndarray, camera_id: str
    ) -> tuple[np.ndarray, list[RecognitionResult], list[dict]]:
        results: list[RecognitionResult] = []
        events: list[dict] = []
        annotated = frame.copy()

        # Strategy A: InsightFace on the full frame (stable embeddings, best accuracy)
        if embedding_service._app is not None:
            insightface_results, insightface_events = self._process_with_insightface(
                db, frame, camera_id, annotated
            )
            results.extend(insightface_results)
            events.extend(insightface_events)
        else:
            # Strategy B: Haar detector + embed crop (fallback only)
            haar_results, haar_events = self._process_with_haar(db, frame, camera_id, annotated)
            results.extend(haar_results)
            events.extend(haar_events)

        mark_absent_exits(db, camera_id)
        db.commit()
        return annotated, results, events

    def _process_with_insightface(
        self, db: Session, frame: np.ndarray, camera_id: str, annotated: np.ndarray
    ) -> tuple[list[RecognitionResult], list[dict]]:
        """
        Use InsightFace to detect faces AND generate embeddings from the full frame.
        InsightFace aligns each face to 112x112 before embedding, so the embedding
        is stable across frames regardless of Haar crop quality.
        """
        results: list[RecognitionResult] = []
        events: list[dict] = []

        try:
            faces = embedding_service._app.get(frame)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("InsightFace full-frame analysis failed: %s", exc)
            return results, events

        if not faces:
            return results, events

        for idx, face in enumerate(faces):
            bbox = face.bbox.astype(int)
            x1, y1, x2, y2 = self._clamp_box(
                (int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])), frame
            )
            box = [x1, y1, x2, y2]
            detection_id = f"if-{idx}-{x1}-{y1}"

            if face.embedding is None:
                continue
            embedding = face.embedding.astype("float32")
            norm = np.linalg.norm(embedding)
            if norm > 1e-12:
                embedding = embedding / norm

            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue

            personnel_id, score = vector_index.search(embedding)
            known = bool(personnel_id and score >= settings.recognition_threshold)

            if not known:
                recent_pid = self._find_recently_registered(embedding)
                if recent_pid is not None:
                    known = True
                    personnel_id = recent_pid
                    score = 1.0

            if known:
                result = self._handle_known(db, personnel_id, score, camera_id, detection_id, box)
            else:
                result, event = self._handle_unknown(
                    db, crop, embedding, score, camera_id, detection_id, box
                )
                if event:
                    events.append(event)

            self._draw(annotated, result)
            results.append(result)

        return results, events

    def _process_with_haar(
        self, db: Session, frame: np.ndarray, camera_id: str, annotated: np.ndarray
    ) -> tuple[list[RecognitionResult], list[dict]]:
        """Fallback: Haar detector + embed the crop."""
        results: list[RecognitionResult] = []
        events: list[dict] = []
        detections = face_detector.detect(frame)

        for detection in detections:
            x1, y1, x2, y2 = self._clamp_box(detection.box, frame)
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            box = [x1, y1, x2, y2]
            embedding = embedding_service.embed_face(crop)

            personnel_id, score = vector_index.search(embedding)
            known = bool(personnel_id and score >= settings.recognition_threshold)

            if not known:
                recent_pid = self._find_recently_registered(embedding)
                if recent_pid is not None:
                    known = True
                    personnel_id = recent_pid
                    score = 1.0

            if known:
                result = self._handle_known(db, personnel_id, score, camera_id, detection.detection_id, box)
            else:
                result, event = self._handle_unknown(
                    db, crop, embedding, score, camera_id, detection.detection_id, box
                )
                if event:
                    events.append(event)

            self._draw(annotated, result)
            results.append(result)

        return results, events

    def _handle_known(
        self, db: Session, personnel_id: int, score: float, camera_id: str,
        detection_id: str, box: list[int]
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
        self, db: Session, crop: np.ndarray, embedding: np.ndarray, score: float,
        camera_id: str, detection_id: str, box: list[int],
    ) -> tuple[RecognitionResult, dict | None]:
        now = datetime.now(timezone.utc)
        duplicate_id = self._find_duplicate_unknown(embedding, now)
        if duplicate_id is not None:
            LOGGER.info("UNKNOWN SKIPPED (duplicate): id=%s", duplicate_id)
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
                    entry.timestamp = now
                    return entry.unknown_id
        return None

    def _remember_unknown(self, embedding: np.ndarray, now: datetime, unknown_id: int) -> None:
        with self._unknown_lock:
            self._recent_unknowns.append(
                UnknownCacheEntry(embedding=embedding.copy(), timestamp=now, unknown_id=unknown_id)
            )

    def clear_unknown_cache(self) -> None:
        with self._unknown_lock:
            self._recent_unknowns.clear()

    def remove_unknown_cache(self, unknown_id: int) -> None:
        with self._unknown_lock:
            self._recent_unknowns = [
                entry for entry in self._recent_unknowns if entry.unknown_id != unknown_id
            ]

    def get_unknown_embedding(self, unknown_id: int) -> np.ndarray | None:
        with self._unknown_lock:
            for entry in self._recent_unknowns:
                if entry.unknown_id == unknown_id:
                    return entry.embedding.copy()
        return None

    def remember_registered(self, personnel_id: int, embedding: np.ndarray) -> None:
        now = datetime.now(timezone.utc)
        with self._registered_lock:
            self._recently_registered.append(
                RecentlyRegisteredEntry(
                    embedding=embedding.copy(), timestamp=now, personnel_id=personnel_id
                )
            )
        LOGGER.info("REGISTERED CACHE: personnel_id=%s added to 60s grace window", personnel_id)

    def _find_recently_registered(self, embedding: np.ndarray) -> int | None:
        now = datetime.now(timezone.utc)
        with self._registered_lock:
            cutoff = timedelta(seconds=60)
            self._recently_registered = [
                e for e in self._recently_registered if now - e.timestamp <= cutoff
            ]
            for entry in self._recently_registered:
                if float(np.dot(entry.embedding, embedding)) > GRACE_WINDOW_THRESHOLD:
                    return entry.personnel_id
        return None

    def _clamp_box(
        self, box: tuple[int, int, int, int], frame: np.ndarray
    ) -> tuple[int, int, int, int]:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = box
        return max(0, x1), max(0, y1), min(w, x2), min(h, y2)

    def _draw(self, frame: np.ndarray, result: RecognitionResult) -> None:
        x1, y1, x2, y2 = result.box
        color = (0, 180, 0) if result.known else (0, 0, 255)
        label = f"{result.full_name or 'Unknown'} {result.confidence:.2f}"
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            frame, label, (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2
        )


recognition_pipeline = RecognitionPipeline()