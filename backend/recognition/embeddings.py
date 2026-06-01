import logging

import cv2
import numpy as np

LOGGER = logging.getLogger(__name__)

# InsightFace recognition model expects faces at exactly 112x112
_RECOGNITION_SIZE = (112, 112)


class EmbeddingService:
    def __init__(self) -> None:
        self._app = None          # full FaceAnalysis pipeline (detection + recognition)
        self._rec_model = None    # recognition-only model for pre-cropped faces
        self._dimension = 512
        self._load_model()

    @property
    def dimension(self) -> int:
        return self._dimension

    def _load_model(self) -> None:
        try:
            from insightface.app import FaceAnalysis
            import insightface

            # Full pipeline — used when we pass the whole frame
            app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
            app.prepare(ctx_id=0, det_size=(640, 640))
            self._app = app

            # Recognition-only model — used on pre-cropped faces
            # This is the w600k_r50 model that produces 512-dim embeddings
            self._rec_model = app.models.get("recognition")

            LOGGER.info("InsightFace loaded (full pipeline + recognition model)")
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("InsightFace unavailable: %s", exc)

    def get_faces_from_frame(self, frame_bgr: np.ndarray) -> list:
        """
        Run InsightFace detection+recognition on a full frame.
        Returns list of face objects with .bbox and .embedding attributes.
        Use this instead of the Haar detector when InsightFace is available.
        """
        if self._app is None:
            return []
        try:
            faces = self._app.get(frame_bgr)
            return faces or []
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("InsightFace frame analysis failed: %s", exc)
            return []

    def embed_face(self, face_bgr: np.ndarray) -> np.ndarray:
        """
        Embed a pre-cropped face image.
        Strategy:
          1. Try the recognition-only model on the resized crop (fastest, most reliable)
          2. Try full pipeline on the crop (slower, re-detects inside crop)
          3. Fallback: deterministic embedding based on image content (not random hash)
        """
        if self._rec_model is not None:
            emb = self._embed_with_rec_model(face_bgr)
            if emb is not None:
                return emb

        if self._app is not None:
            try:
                faces = self._app.get(face_bgr)
                if faces:
                    emb = faces[0].embedding.astype("float32")
                    return self._normalize(emb)
            except Exception:  # noqa: BLE001
                pass

        # Stable fallback — NOT hash-based, uses DCT features that are
        # consistent across minor lighting/compression changes
        return self._stable_fallback_embedding(face_bgr)

    def _embed_with_rec_model(self, face_bgr: np.ndarray) -> np.ndarray | None:
        """Use the recognition model directly on a 112x112 face crop."""
        try:
            # InsightFace recognition expects 112x112 BGR
            resized = cv2.resize(face_bgr, _RECOGNITION_SIZE)
            # The model's get_feat method takes a list of face images
            if hasattr(self._rec_model, "get_feat"):
                feat = self._rec_model.get_feat([resized])
                if feat is not None and len(feat) > 0:
                    emb = np.array(feat[0]).astype("float32")
                    return self._normalize(emb)
        except Exception as exc:  # noqa: BLE001
            LOGGER.debug("rec_model.get_feat failed: %s", exc)
        return None

    def _normalize(self, emb: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(emb)
        return emb / max(norm, 1e-12)

    def _stable_fallback_embedding(self, face_bgr: np.ndarray) -> np.ndarray:
        """
        Deterministic embedding based on DCT coefficients.
        Unlike the old SHA256 hash, DCT features are STABLE across minor
        lighting/compression changes, so the same face gives similar embeddings.
        """
        # Resize to 64x64 grayscale
        gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY) if len(face_bgr.shape) == 3 else face_bgr
        resized = cv2.resize(gray, (64, 64)).astype("float32")

        # Apply DCT and take top-left 32x32 coefficients (low frequency = stable features)
        dct = cv2.dct(resized)
        features = dct[:32, :32].flatten()  # 1024 features

        # Repeat/tile to fill 512 dimensions
        emb = np.tile(features, 1)[:self._dimension].astype("float32")
        if len(emb) < self._dimension:
            emb = np.pad(emb, (0, self._dimension - len(emb)))

        return self._normalize(emb)


embedding_service = EmbeddingService()