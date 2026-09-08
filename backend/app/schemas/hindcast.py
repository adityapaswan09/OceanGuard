from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class HindcastResponse(BaseModel):
    spill_id: int
    estimated_origin_time: datetime
    origin_time_uncertainty_hours: float
    origin_region: Dict[str, Any]
    backward_trajectory: Optional[Dict[str, Any]] = None
    uncertainty_cloud: Optional[Dict[str, Any]] = None
    confidence: float
