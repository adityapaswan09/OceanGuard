from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Vessel(Base):
    __tablename__ = "vessels"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    imo_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    vessel_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    flag: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )