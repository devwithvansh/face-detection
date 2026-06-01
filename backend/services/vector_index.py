import logging
from threading import RLock

import numpy as np
from sqlalchemy.orm import Session

from backend.database.session import SessionLocal
from backend.models.personnel import FaceEmbedding
from backend.recognition.embeddings import embedding_service

LOGGER = logging.getLogger(__name__)


def serialize_embedding(embedding: np.ndarray) -> bytes:
    return embedding.astype("float32").tobytes()


def deserialize_embedding(raw: bytes) -> np.ndarray:
    return np.frombuffer(raw, dtype="float32")


class VectorIndex:
    def __init__(self) -> None:
        self._lock = RLock()
        self._ids: list[int] = []
        self._personnel_ids: list[int] = []
        self._matrix = np.empty((0, embedding_service.dimension), dtype="float32")
        self._faiss_index = None

    def rebuild(self) -> None:
        with self._lock:
            db = SessionLocal()
            try:
                rows = db.query(FaceEmbedding).all()
                self._ids = [row.id for row in rows]
                self._personnel_ids = [row.personnel_id for row in rows]
                vectors = [deserialize_embedding(row.embedding_vector) for row in rows]
                self._matrix = np.vstack(vectors).astype("float32") if vectors else np.empty((0, embedding_service.dimension), dtype="float32")
                self._build_faiss()
                LOGGER.info("Vector index rebuilt with %s embeddings", len(self._ids))
            finally:
                db.close()

    def _build_faiss(self) -> None:
        try:
            import faiss

            index = faiss.IndexFlatIP(embedding_service.dimension)
            if len(self._matrix):
                index.add(self._matrix)
            self._faiss_index = index
        except Exception as exc:  # noqa: BLE001
            self._faiss_index = None
            LOGGER.warning("FAISS unavailable, using NumPy similarity search: %s", exc)

    def add(self, db: Session, personnel_id: int, embedding: np.ndarray, refresh: bool = True) -> FaceEmbedding:
        row = FaceEmbedding(personnel_id=personnel_id, embedding_vector=serialize_embedding(embedding))
        db.add(row)
        db.flush()
        if refresh:
            self.add_embedding(row.id, personnel_id, embedding)
        return row

    def add_embedding(self, embedding_id: int, personnel_id: int, embedding: np.ndarray) -> None:
        vector = embedding.astype("float32")
        with self._lock:
            self._ids.append(embedding_id)
            self._personnel_ids.append(personnel_id)
            self._matrix = np.vstack([self._matrix, vector.reshape(1, -1)]).astype("float32")
            self._build_faiss()
            LOGGER.info("Vector index refreshed with embedding_id=%s personnel_id=%s", embedding_id, personnel_id)

    def search(self, embedding: np.ndarray) -> tuple[int | None, float]:
        with self._lock:
            if not len(self._personnel_ids):
                return None, 0.0
            query = embedding.astype("float32").reshape(1, -1)
            if self._faiss_index is not None:
                scores, indexes = self._faiss_index.search(query, 1)
                idx = int(indexes[0][0])
                return self._personnel_ids[idx], float(scores[0][0])
            scores = self._matrix @ embedding.astype("float32")
            idx = int(np.argmax(scores))
            return self._personnel_ids[idx], float(scores[idx])


vector_index = VectorIndex()
