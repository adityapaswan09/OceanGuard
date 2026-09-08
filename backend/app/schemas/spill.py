from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class SpillResponse(BaseModel):
    id: int
    region_id: int
    detection_time: datetime
    area_km2: float
    perimeter_km: float
    confidence: float
    estimated_age_hours: Optional[float] = None
    polygon: Dict[str, Any]
    centroid: Dict[str, Any]

class SpillListResponse(BaseModel):
    items: list[SpillResponse]
    total: int
