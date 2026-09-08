from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Region(Base):
    __tablename__ = "regions"
    __table_args__ = (
        Index("idx_regions_geometry", "geometry", postgresql_using="gist"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    geometry: Mapped[object] = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    spills: Mapped[list["Spill"]] = relationship(back_populates="region")