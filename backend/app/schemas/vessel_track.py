from datetime import datetime

from pydantic import BaseModel


class VesselTrackPoint(BaseModel):
    vessel_id: int
    timestamp: datetime
    latitude: float
    longitude: float
    speed_knots: float
    course_degrees: float


class VesselTrackResponse(BaseModel):
    vessel_id: int
    points: list[VesselTrackPoint]
