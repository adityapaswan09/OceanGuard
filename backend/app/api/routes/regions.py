import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.region import Region
from app.schemas.region import RegionResponse

router = APIRouter(tags=["regions"])


@router.get("/", response_model=list[RegionResponse])
def list_regions(db: Session = Depends(get_db)) -> list[RegionResponse]:
    rows = db.execute(
        select(
            Region.id,
            Region.name,
            func.ST_AsGeoJSON(Region.geometry).label("geometry"),
        )
    ).all()

    return [
        RegionResponse(
            id=region.id,
            name=region.name,
            geometry=json.loads(region.geometry),
        )
        for region in rows
    ]
