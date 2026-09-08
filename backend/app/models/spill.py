from datetime import datetime
from typing import Optional

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.models.region import Region


class Spill(Base):
    __tablename__ = "spills"
    __table_args__ = (
        Index("idx_spills_centroid", "centroid", postgresql_using="gist"),
        Index("idx_spills_polygon", "polygon", postgresql_using="gist"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id"), nullable=False, index=True)
    detection_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    centroid: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=False,
    )
    polygon: Mapped[object] = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False),
        nullable=False,
    )
    area_km2: Mapped[float] = mapped_column(Float, nullable=False)
    perimeter_km: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_age_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    region: Mapped["Region"] = relationship(back_populates="spills")