from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.core.security import get_current_user
from backend.database.session import get_db
from backend.models.attendance import AttendanceLog
from backend.schemas.attendance import AttendanceOut

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("", response_model=list[AttendanceOut])
def attendance(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(get_current_user)],
    personnel_id: int | None = None,
    status: str | None = None,
    camera_id: str | None = None,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
) -> list[AttendanceLog]:
    query = db.query(AttendanceLog)
    if personnel_id:
        query = query.filter(AttendanceLog.personnel_id == personnel_id)
    if status:
        query = query.filter(AttendanceLog.status == status.upper())
    if camera_id:
        query = query.filter(AttendanceLog.camera_id == camera_id)
    if start:
        query = query.filter(AttendanceLog.entry_time >= start)
    if end:
        query = query.filter(AttendanceLog.entry_time <= end)
    return query.order_by(AttendanceLog.id.desc()).limit(500).all()
