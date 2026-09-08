from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.vessel import Vessel
from app.schemas.vessel import VesselResponse
from app.services import sakshi_ais

router = APIRouter(tags=["vessels"])


def _sakshi_response(mmsi: int) -> VesselResponse:
    return VesselResponse(
        id=mmsi,
        name=sakshi_ais.vessel_label(mmsi),
        imo_number=None,
        vessel_type=None,
        flag=None,
    )


@router.get("/", response_model=List[VesselResponse])
def list_vessels() -> List[VesselResponse]:
    return [_sakshi_response(mmsi) for mmsi in sakshi_ais.sakshi_mmsis()]


@router.get("/{vessel_id}", response_model=VesselResponse)
def get_vessel(vessel_id: int, db: Session = Depends(get_db)) -> VesselResponse:
    if vessel_id in sakshi_ais.sakshi_mmsis():
        return _sakshi_response(vessel_id)

    vessel = db.scalar(select(Vessel).where(Vessel.id == vessel_id))
    if vessel is None:
        raise HTTPException(status_code=404, detail="Vessel not found")

    return VesselResponse(
        id=vessel.id,
        name=vessel.name,
        imo_number=vessel.imo_number,
        vessel_type=vessel.vessel_type,
        flag=vessel.flag,
    )
