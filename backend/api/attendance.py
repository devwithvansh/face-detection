from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from backend.core.security import get_current_user, require_admin
from backend.database.session import get_db
from backend.models.attendance import AttendanceLog
from backend.services.attendance import override_log_status

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("")
def list_attendance(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(get_current_user)],
    status: str | None = None,
    camera_id: str | None = None,
    personnel_id: int | None = None,
    limit: int = 500,
) -> list[dict]:
    query = db.query(AttendanceLog).options(joinedload(AttendanceLog.personnel))

    if status:
        query = query.filter(AttendanceLog.status == status.upper())
    if camera_id:
        query = query.filter(AttendanceLog.camera_id == camera_id)
    if personnel_id:
        query = query.filter(AttendanceLog.personnel_id == personnel_id)

    logs = query.order_by(AttendanceLog.id.desc()).limit(limit).all()

    results = []
    for log in logs:
        results.append({
            "id":               log.id,
            "personnel_id":     log.personnel_id,
            "army_id":          log.personnel.army_id if log.personnel else None,
            "full_name":        log.personnel.full_name if log.personnel else None,
            "rank":             log.personnel.rank if log.personnel else None,
            "camera_id":        log.camera_id,
            "timestamp":        log.timestamp.isoformat() if log.timestamp else None,
            "entry_time":       log.entry_time.isoformat() if log.entry_time else None,
            "exit_time":        log.exit_time.isoformat() if log.exit_time else None,
            "status":           log.status,
            "confidence_score": log.confidence_score,
        })
    return results


@router.patch("/{log_id}/override")
def override_attendance(
    log_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[dict, Depends(require_admin)],
) -> dict:
    """
    Admin-only: flip a single attendance log between ENTRY and EXIT.
    """
    log = override_log_status(db, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log entry not found")
    db.commit()
    return {
        "id":         log.id,
        "status":     log.status,
        "entry_time": log.entry_time.isoformat() if log.entry_time else None,
        "exit_time":  log.exit_time.isoformat() if log.exit_time else None,
        "timestamp":  log.timestamp.isoformat() if log.timestamp else None,
    }