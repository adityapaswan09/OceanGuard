from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class ForecastResponse(BaseModel):
    spill_id: int
    forecast_generated_at: datetime
    forecast_6h: Optional[Dict[str, Any]] = None
    forecast_12h: Optional[Dict[str, Any]] = None
    forecast_24h: Optional[Dict[str, Any]] = None
    uncertainty_envelope: Optional[Dict[str, Any]] = None
