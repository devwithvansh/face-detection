from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    personnel_id: int
    camera_id: str
    entry_time: datetime | None
    exit_time: datetime | None
    status: str
    confidence_score: float | None
