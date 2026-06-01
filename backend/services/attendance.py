import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.models.attendance import ActivePresence, AttendanceLog
from backend.models.personnel import Personnel

LOGGER = logging.getLogger(__name__)


def _as_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def mark_seen(db: Session, personnel_id: int, camera_id: str, confidence: float) -> AttendanceLog | None:
    now = datetime.now(timezone.utc)
    presence = db.query(ActivePresence).filter(ActivePresence.personnel_id == personnel_id).one_or_none()
    person = db.get(Personnel, personnel_id)
    name = person.full_name if person else f"personnel_id={personnel_id}"

    if presence is None:
        presence = ActivePresence(personnel_id=personnel_id, currently_inside=True, last_seen=now)
        db.add(presence)
        log = create_attendance_log(db, personnel_id, camera_id, "ENTRY", confidence, now)
        LOGGER.info("ENTRY CREATED: %s", name)
        return log

    presence.last_seen = now
    if not presence.currently_inside:
        presence.currently_inside = True
        log = create_attendance_log(db, personnel_id, camera_id, "ENTRY", confidence, now)
        LOGGER.info("ENTRY CREATED: %s", name)
        return log
    return None


def mark_registered_inside(db: Session, personnel_id: int, camera_id: str = "registration") -> AttendanceLog | None:
    return mark_seen(db, personnel_id, camera_id, 1.0)


def mark_absent_exits(db: Session, camera_id: str) -> list[AttendanceLog]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=settings.exit_absence_seconds)
    logs: list[AttendanceLog] = []
    presences = db.query(ActivePresence).filter(ActivePresence.currently_inside == True).all()  # noqa: E712
    for presence in presences:
        if _as_aware(presence.last_seen) <= cutoff:
            person = db.get(Personnel, presence.personnel_id)
            name = person.full_name if person else f"personnel_id={presence.personnel_id}"
            LOGGER.info("EXIT CREATED: %s", name)
            logs.append(create_attendance_log(db, presence.personnel_id, camera_id, "EXIT", None, now))
            presence.currently_inside = False
            presence.last_seen = now
    return logs


def create_attendance_log(
    db: Session,
    personnel_id: int,
    camera_id: str,
    status: str,
    confidence: float | None = None,
    timestamp: datetime | None = None,
) -> AttendanceLog:
    now = timestamp or datetime.now(timezone.utc)
    log = AttendanceLog(
        personnel_id=personnel_id,
        camera_id=camera_id,
        entry_time=now if status == "ENTRY" else None,
        exit_time=now if status == "EXIT" else None,
        status=status,
        confidence_score=confidence,
    )
    db.add(log)
    return log


def log_seen(db: Session, personnel_id: int, camera_id: str, confidence: float) -> AttendanceLog | None:
    return mark_seen(db, personnel_id, camera_id, confidence)
