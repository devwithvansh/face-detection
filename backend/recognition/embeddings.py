import hashlib
import logging

import cv2
import numpy as np

LOGGER = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self) -> None:
        self._model = None
        self._dimension = 512
        self._load_model()

    @property
    def dimension(self) -> int:
        return self._dimension

    def _load_model(self) -> None:
        try:
            from insightface.app import FaceAnalysis

            app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
            app.prepare(ctx_id=0, det_size=(640, 640))
            self._model = app
            LOGGER.info("InsightFace model loaded")
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("InsightFace unavailable, using deterministic fallback embeddings: %s", exc)

    def embed_face(self, face_bgr: np.ndarray) -> np.ndarray:
        if self._model is not None:
            faces = self._model.get(face_bgr)
            if faces:
                emb = faces[0].embedding.astype("float32")
                return emb / max(np.linalg.norm(emb), 1e-12)
        return self._fallback_embedding(face_bgr)

    def _fallback_embedding(self, face_bgr: np.ndarray) -> np.ndarray:
        resized = cv2.resize(face_bgr, (32, 32))
        digest = hashlib.sha256(resized.tobytes()).digest()
        seed = int.from_bytes(digest[:8], "little")
        rng = np.random.default_rng(seed)
        emb = rng.normal(size=self._dimension).astype("float32")
        return emb / max(np.linalg.norm(emb), 1e-12)


embedding_service = EmbeddingService()
