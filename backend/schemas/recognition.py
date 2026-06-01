from pydantic import BaseModel


class RecognitionResult(BaseModel):
    detection_id: str
    known: bool
    personnel_id: int | None = None
    unknown_id: int | None = None
    army_id: str | None = None
    full_name: str | None = None
    confidence: float
    status: str
    box: list[int]


class CameraCommand(BaseModel):
    camera_id: str
    source: str | int | None = None
