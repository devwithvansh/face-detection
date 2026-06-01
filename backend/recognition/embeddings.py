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

            # det_size 640 — best for faces that are far from camera
            app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
            app.prepare(ctx_id=0, det_size=(640, 640))
            self._app = app
            self._rec_model = app.models.get("recognition")
            LOGGER.info("InsightFace loaded (full pipeline + recognition model)")
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("InsightFace unavailable: %s", exc)

    def get_faces_from_frame(self, frame_bgr: np.ndarray) -> list:
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
        Tries multiple strategies and returns the best quality embedding.
        Enhanced for faces that are partially turned, far from camera, or in variable lighting.
        """
        if face_bgr is None or face_bgr.size == 0:
            return self._zero_embedding()

        # Strategy 1: Recognition model on the crop directly
        if self._rec_model is not None:
            emb = self._embed_with_rec_model(face_bgr)
            if emb is not None:
                return emb

        # Strategy 2: Full pipeline on the crop (re-detects inside crop)
        if self._app is not None:
            emb = self._embed_with_full_pipeline(face_bgr)
            if emb is not None:
                return emb

        # Strategy 3: Stable DCT fallback
        return self._stable_fallback_embedding(face_bgr)

    def embed_face_with_augmentation(self, face_bgr: np.ndarray) -> np.ndarray:
        """
        Generate a robust embedding by averaging over slight augmentations.
        Used at registration time to create a more generalised template.
        This is not used in real-time pipeline (too slow), only for storing embeddings.
        """
        base = self.embed_face(face_bgr)
        augmented = [base]

        # Slight brightness variations (simulates different lighting)
        for alpha in [0.85, 1.15]:
            adjusted = cv2.convertScaleAbs(face_bgr, alpha=alpha, beta=0)
            emb = self.embed_face(adjusted)
            if emb is not None:
                augmented.append(emb)

        # Slight horizontal flip (helps with symmetric faces)
        flipped = cv2.flip(face_bgr, 1)
        emb = self.embed_face(flipped)
        if emb is not None:
            augmented.append(emb)

        # Average all embeddings then re-normalise
        avg = np.mean(augmented, axis=0).astype("float32")
        return self._normalize(avg)

    def _embed_with_rec_model(self, face_bgr: np.ndarray) -> np.ndarray | None:
        """Use the recognition model directly on a 112x112 face crop."""
        try:
            resized = cv2.resize(face_bgr, _RECOGNITION_SIZE)
            if hasattr(self._rec_model, "get_feat"):
                feat = self._rec_model.get_feat([resized])
                if feat is not None and len(feat) > 0:
                    emb = np.array(feat[0]).astype("float32")
                    return self._normalize(emb)
        except Exception as exc:  # noqa: BLE001
            LOGGER.debug("rec_model.get_feat failed: %s", exc)
        return None

    def _embed_with_full_pipeline(self, face_bgr: np.ndarray) -> np.ndarray | None:
        """Full InsightFace pipeline — slower but handles non-frontal faces better."""
        try:
            # Upscale small crops so InsightFace detector works reliably
            h, w = face_bgr.shape[:2]
            if h < 112 or w < 112:
                scale = max(112 / h, 112 / w, 1.0)
                face_bgr = cv2.resize(face_bgr, (int(w * scale), int(h * scale)))

            faces = self._app.get(face_bgr)
            if faces:
                # Pick the face with largest bounding box (most prominent)
                best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                if best.embedding is not None:
                    return self._normalize(best.embedding.astype("float32"))
        except Exception:  # noqa: BLE001
            pass
        return None

    def _normalize(self, emb: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(emb)
        return emb / max(norm, 1e-12)

    def _zero_embedding(self) -> np.ndarray:
        return np.zeros(self._dimension, dtype="float32")

    def _stable_fallback_embedding(self, face_bgr: np.ndarray) -> np.ndarray:
        """
        Deterministic DCT-based embedding.
        More stable than random hash across lighting/compression changes.
        """
        gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY) if len(face_bgr.shape) == 3 else face_bgr
        resized = cv2.resize(gray, (64, 64)).astype("float32")
        # Normalize brightness for lighting invariance
        resized = (resized - resized.mean()) / (resized.std() + 1e-8) * 64 + 128
        dct = cv2.dct(resized)
        features = dct[:32, :32].flatten()  # 1024 low-frequency features
        emb = np.tile(features, 1)[: self._dimension].astype("float32")
        if len(emb) < self._dimension:
            emb = np.pad(emb, (0, self._dimension - len(emb)))
        return self._normalize(emb)


embedding_service = EmbeddingService()