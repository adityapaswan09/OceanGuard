from datetime import datetime, timedelta, timezone

from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from app.db.database import SessionLocal
from app.models.region import Region
from app.models.spill import Spill
from app.models.vessel import Vessel


REGION_WKT = "POLYGON ((65.0 15.0, 65.1 15.0, 65.1 15.1, 65.0 15.1, 65.0 15.0))"
CENTROID_WKT = "POINT (65.05 15.05)"
SPILL_WKT = (
    "POLYGON ((65.015 15.035, 65.035 15.025, 65.065 15.030, "
    "65.090 15.045, 65.075 15.065, 65.045 15.075, "
    "65.020 15.060, 65.015 15.035))"
)
VESSELS = (
    {"name": "Ocean Pioneer", "imo_number": "9384756", "vessel_type": "Tanker", "flag": "India"},
    {"name": "Arabian Trader", "imo_number": "9123456", "vessel_type": "Cargo", "flag": "Panama"},
)


def seed_data() -> None:
    session = SessionLocal()
    try:
        for vessel_data in VESSELS:
            existing_vessel = session.scalar(
                select(Vessel).where(Vessel.imo_number == vessel_data["imo_number"])
            )
            if existing_vessel is None:
                session.add(Vessel(**vessel_data))

        region = Region(
            name="Arabian Sea",
            geometry=WKTElement(REGION_WKT, srid=4326),
        )
        session.add(region)
        session.flush()

        spill = Spill(
            region=region,
            detection_time=datetime.now(timezone.utc) - timedelta(hours=8),
            centroid=WKTElement(CENTROID_WKT, srid=4326),
            polygon=WKTElement(SPILL_WKT, srid=4326),
            area_km2=12.5,
            perimeter_km=14.2,
            confidence=0.91,
            estimated_age_hours=8.0,
        )
        session.add(spill)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed_data()
    print("Seed data inserted.")
