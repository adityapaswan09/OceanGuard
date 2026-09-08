from fastapi import APIRouter, HTTPException

from app.schemas.vessel_track import VesselTrackPoint, VesselTrackResponse
from app.services import sakshi_ais

router = APIRouter(prefix="/vessels/{vessel_id}", tags=["vessel-tracks"])


@router.get("/track", response_model=VesselTrackResponse)
def get_vessel_track(vessel_id: int) -> VesselTrackResponse:
    points = sakshi_ais.track_points(vessel_id)
    if not points:
        raise HTTPException(status_code=404, detail="Vessel not found")

    return VesselTrackResponse(
        vessel_id=vessel_id,
        points=[VesselTrackPoint(**point) for point in points],
    )
