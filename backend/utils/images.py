import uuid
from pathlib import Path

import cv2
import numpy as np

from backend.core.config import settings


def save_image(image: np.ndarray, folder: str, prefix: str) -> str:
    target = settings.storage_path / folder
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"{prefix}_{uuid.uuid4().hex}.jpg"
    cv2.imwrite(str(path), image)
    return str(path)


def read_uploaded_image(content: bytes) -> np.ndarray:
    buffer = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image")
    return image


def public_path(path: str | Path) -> str:
    return str(path).replace("\\", "/")
