from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.session import Base


class UnknownFace(Base):
    __tablename__ = "unknown_faces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    image_path: Mapped[str] = mapped_column(Text, nullable=False)
    detected_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    registered_personnel_id: Mapped[int | None] = mapped_column(ForeignKey("personnel.id"), nullable=True)

    registered_personnel = relationship("Personnel")
