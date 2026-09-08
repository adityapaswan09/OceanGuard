from typing import List, Optional

from pydantic import BaseModel


class SuspectResponse(BaseModel):
    rank: int
    vessel_id: int
    vessel_name: str
    overall_score: float
    spatial_score: Optional[float] = None
    temporal_score: Optional[float] = None
    trajectory_score: Optional[float] = None
    behaviour_score: Optional[float] = None
    historical_risk_score: Optional[float] = None
    reasons: Optional[List[str]] = None
