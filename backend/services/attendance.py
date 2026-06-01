import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.models.attendance import ActivePresence, AttendanceLog
from backend.models.personnel import Personnel

LOGGER = logging.getLogger(__name__)


def _as_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _today_start(now: datetime) -> datetime:
    """Midnight UTC of the current day."""
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def mark_seen(db: Session, personnel_id: int, camera_id: str, confidence: float) -> AttendanceLog | None:
    """
    Punch-card logic:
      - Appearance after a gap >= min_gap_seconds  → toggle (ENTRY→EXIT or EXIT→ENTRY)
      - Appearance within min_gap_seconds of last log → suppress (too soon)
      - New day always starts fresh → ENTRY
    """
    now = datetime.now(timezone.utc)
    today_start = _today_start(now)
    min_gap = timedelta(seconds=settings.exit_absence_seconds)  # default 300s

    person = db.get(Personnel, personnel_id)
    name = person.full_name if person else f"personnel_id={personnel_id}"

    # Last log for this person TODAY
    last_log = (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.personnel_id == personnel_id,
            AttendanceLog.timestamp >= today_start,
        )
        .order_by(AttendanceLog.id.desc())
        .first()
    )

    # Also update presence tracker (used for live feed overlay status)
    presence = db.query(ActivePresence).filter(ActivePresence.personnel_id == personnel_id).one_or_none()
    if presence is None:
        presence = ActivePresence(personnel_id=personnel_id, currently_inside=True, last_seen=now)
        db.add(presence)
    else:
        presence.last_seen = now

    # ── No log today → always ENTRY ──────────────────────────────────────────
    if last_log is None:
        presence.currently_inside = True
        log = _create_log(db, personnel_id, camera_id, "ENTRY", confidence, now)
        LOGGER.info("ENTRY (first of day): %s", name)
        return log

    last_time = _as_aware(last_log.timestamp)
    gap = now - last_time

    # ── Too soon — suppress ───────────────────────────────────────────────────
    if gap < min_gap:
        return None  # silently ignore, not enough time has passed

    # ── Enough gap — toggle status ────────────────────────────────────────────
    next_status = "EXIT" if last_log.status == "ENTRY" else "ENTRY"
    presence.currently_inside = next_status == "ENTRY"

    log = _create_log(db, personnel_id, camera_id, next_status, confidence, now)
    LOGGER.info("%s: %s (gap=%.0fs)", next_status, name, gap.total_seconds())
    return log


def mark_registered_inside(db: Session, personnel_id: int, camera_id: str = "registration") -> AttendanceLog | None:
    return mark_seen(db, personnel_id, camera_id, 1.0)


def override_log_status(db: Session, log_id: int) -> AttendanceLog | None:
    """
    Admin override: flip a single log between ENTRY and EXIT.
    Also updates the timestamp fields and presence tracker accordingly.
    """
    log = db.get(AttendanceLog, log_id)
    if not log:
        return None

    now = datetime.now(timezone.utc)

    if log.status == "ENTRY":
        log.status = "EXIT"
        log.entry_time = None
        log.exit_time = log.timestamp
    else:
        log.status = "ENTRY"
        log.exit_time = None
        log.entry_time = log.timestamp

    # Re-sync presence to match the latest log for this person
    latest = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.personnel_id == log.personnel_id)
        .order_by(AttendanceLog.id.desc())
        .first()
    )
    presence = db.query(ActivePresence).filter(ActivePresence.personnel_id == log.personnel_id).one_or_none()
    if presence and latest:
        presence.currently_inside = latest.status == "ENTRY"

    LOGGER.info("ADMIN OVERRIDE: log_id=%s flipped to %s", log_id, log.status)
    return log


def _create_log(
    db: Session,
    personnel_id: int,
    camera_id: str,
    status: str,
    confidence: float | None,
    now: datetime,
) -> AttendanceLog:
    log = AttendanceLog(
        personnel_id=personnel_id,
        camera_id=camera_id,
        status=status,
        confidence_score=confidence,
        timestamp=now,
        entry_time=now if status == "ENTRY" else None,
        exit_time=now if status == "EXIT" else None,
    )
    db.add(log)
    return log


# ── Keep old name working (called from recognizer) ───────────────────────────
def mark_absent_exits(db: Session, camera_id: str) -> list:
    """
    No longer used for auto-exit — exits are now triggered by reappearance.
    Kept as a no-op so recognizer.py import doesn't break.
    """
    return []


def create_attendance_log(
    db: Session,
    personnel_id: int,
    camera_id: str,
    status: str,
    confidence: float | None = None,
    timestamp: datetime | None = None,
) -> AttendanceLog:
    now = timestamp or datetime.now(timezone.utc)
    return _create_log(db, personnel_id, camera_id, status, confidence, now)


def log_seen(db: Session, personnel_id: int, camera_id: str, confidence: float) -> AttendanceLog | None:
    return mark_seen(db, personnel_id, camera_id, confidence)