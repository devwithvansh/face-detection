from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UnknownFaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_path: str
    detected_time: datetime
    reviewed: bool
    registered_personnel_id: int | None
