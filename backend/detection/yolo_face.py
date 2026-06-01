import logging
from dataclasses import dataclass

import cv2
import numpy as np

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class FaceDetection:
    detection_id: str
    box: tuple[int, int, int, int]
    confidence: float


class YoloFaceDetector:
    def __init__(self, model_path: str = "yolov8n-face.pt") -> None:
        self._model = None
        self._cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        try:
            from ultralytics import YOLO

            self._model = YOLO(model_path)
            LOGGER.info("YOLOv8 face detector loaded from %s", model_path)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("YOLOv8 face model unavailable, using OpenCV Haar fallback: %s", exc)

    def detect(self, frame: np.ndarray) -> list[FaceDetection]:
        if self._model is not None:
            return self._detect_yolo(frame)
        return self._detect_haar(frame)

    def _detect_yolo(self, frame: np.ndarray) -> list[FaceDetection]:
        results = self._model.predict(frame, verbose=False, conf=0.35)
        detections: list[FaceDetection] = []
        for result in results:
            for idx, box in enumerate(result.boxes):
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                conf = float(box.conf[0].item())
                detections.append(FaceDetection(f"face-{idx}-{x1}-{y1}", (x1, y1, x2, y2), conf))
        return detections

    def _detect_haar(self, frame: np.ndarray) -> list[FaceDetection]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self._cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        return [
            FaceDetection(f"face-{idx}-{x}-{y}", (int(x), int(y), int(x + w), int(y + h)), 0.5)
            for idx, (x, y, w, h) in enumerate(faces)
        ]


face_detector = YoloFaceDetector()
