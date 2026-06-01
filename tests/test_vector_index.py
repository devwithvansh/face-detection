import numpy as np

from backend.services.vector_index import deserialize_embedding, serialize_embedding


def test_embedding_round_trip() -> None:
    vector = np.ones(512, dtype="float32")
    restored = deserialize_embedding(serialize_embedding(vector))
    assert restored.dtype == np.float32
    assert restored.shape == (512,)
    assert np.allclose(restored, vector)
