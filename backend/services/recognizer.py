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

# How similar an unknown must be to an existing unknown cache entry to be skipped
UNKNOWN_SIMILARITY_THRESHOLD = 0.35

# Post-registration grace window threshold
GRACE_WINDOW_THRESHOLD = 0.30

# Minimum face size in pixels — smaller detections are skipped (noise reduction)
MIN_FACE_SIZE = 40


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

        if embedding_service._app is not None:
            r, e = self._process_with_insightface(db, frame, camera_id, annotated)
        else:
            r, e = self._process_with_haar(db, frame, camera_id, annotated)

        results.extend(r)
        events.extend(e)

        mark_absent_exits(db, camera_id)
        db.commit()
        return annotated, results, events

    def _process_with_insightface(
        self, db: Session, frame: np.ndarray, camera_id: str, annotated: np.ndarray
    ) -> tuple[list[RecognitionResult], list[dict]]:
        """
        InsightFace path — handles full frame detection + embedding.
        Uses buffalo_l with 512-dim embeddings; robust to tilt and moderate distance.
        """
        results: list[RecognitionResult] = []
        events: list[dict] = []

        try:
            # Try with the frame at its natural resolution first
            faces = embedding_service._app.get(frame)

            # If no faces found, retry with a brightness-normalised copy
            # Helps when lighting is poor (e.g. indoor low light)
            if not faces:
                norm = cv2.normalize(frame, None, 0, 255, cv2.NORM_MINMAX)
                faces = embedding_service._app.get(norm)

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

            # Skip tiny detections — usually noise or background faces
            if (x2 - x1) < MIN_FACE_SIZE or (y2 - y1) < MIN_FACE_SIZE:
                continue

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

            # ── Search the vector index ──────────────────────────────────────
            personnel_id, score = vector_index.search(embedding)
            known = bool(personnel_id and score >= settings.recognition_threshold)

            # ── Grace window (recently registered person) ────────────────────
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

            # Face tilt angle for debug info
            tilt_deg = self._estimate_tilt(face) if hasattr(face, "kps") else None
            self._draw(annotated, result, tilt_deg)
            results.append(result)

        return results, events

    def _process_with_haar(
        self, db: Session, frame: np.ndarray, camera_id: str, annotated: np.ndarray
    ) -> tuple[list[RecognitionResult], list[dict]]:
        """Fallback Haar path."""
        results: list[RecognitionResult] = []
        events: list[dict] = []
        detections = face_detector.detect(frame)

        for detection in detections:
            x1, y1, x2, y2 = self._clamp_box(detection.box, frame)
            if (x2 - x1) < MIN_FACE_SIZE or (y2 - y1) < MIN_FACE_SIZE:
                continue
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
        LOGGER.info("KNOWN: %s score=%.3f", name, score)
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
        LOGGER.info("NEW UNKNOWN: id=%s", unknown.id)
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
                e for e in self._recent_unknowns if now - e.timestamp <= cooldown
            ]
            for entry in self._recent_unknowns:
                if float(np.dot(entry.embedding, embedding)) > UNKNOWN_SIMILARITY_THRESHOLD:
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
                e for e in self._recent_unknowns if e.unknown_id != unknown_id
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
        LOGGER.info("REGISTERED CACHE: personnel_id=%s (60s grace)", personnel_id)

    def _find_recently_registered(self, embedding: np.ndarray) -> int | None:
        now = datetime.now(timezone.utc)
        with self._registered_lock:
            self._recently_registered = [
                e for e in self._recently_registered
                if now - e.timestamp <= timedelta(seconds=60)
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

    def _estimate_tilt(self, face) -> float | None:
        """Estimate face tilt angle from facial keypoints (if available)."""
        try:
            kps = face.kps  # shape (5, 2): left_eye, right_eye, nose, left_mouth, right_mouth
            if kps is None or len(kps) < 2:
                return None
            left_eye, right_eye = kps[0], kps[1]
            dy = right_eye[1] - left_eye[1]
            dx = right_eye[0] - left_eye[0]
            angle = float(np.degrees(np.arctan2(dy, dx)))
            return round(angle, 1)
        except Exception:  # noqa: BLE001
            return None

    def _draw(self, frame: np.ndarray, result: RecognitionResult, tilt: float | None = None) -> None:
        x1, y1, x2, y2 = result.box
        # Green for known, red for unknown
        color = (0, 220, 80) if result.known else (0, 60, 220)

        # Draw box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Corner brackets (tactical look)
        corner_len = max(8, (x2 - x1) // 5)
        for cx, cy, dx, dy in [
            (x1, y1, corner_len, corner_len),
            (x2, y1, -corner_len, corner_len),
            (x1, y2, corner_len, -corner_len),
            (x2, y2, -corner_len, -corner_len),
        ]:
            cv2.line(frame, (cx, cy), (cx + dx, cy), color, 2)
            cv2.line(frame, (cx, cy), (cx, cy + dy), color, 2)

        # Label
        name = result.full_name or f"UNKNOWN #{result.unknown_id or '?'}"
        conf_pct = int(result.confidence * 100)
        status = result.status or ""
        label = f"{name} [{conf_pct}%]"
        if tilt is not None and abs(tilt) > 5:
            label += f" ~{tilt}deg"

        # Background for label
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale, thick = 0.5, 1
        (tw, th), _ = cv2.getTextSize(label, font, scale, thick)
        lx, ly = x1, max(th + 6, y1 - 4)
        cv2.rectangle(frame, (lx, ly - th - 4), (lx + tw + 6, ly + 2), (0, 0, 0), -1)
        cv2.putText(frame, label, (lx + 3, ly - 2), font, scale, color, thick)

        # Status tag
        cv2.putText(frame, status, (x1, y2 + 14), font, 0.42, color, 1)


recognition_pipeline = RecognitionPipeline()