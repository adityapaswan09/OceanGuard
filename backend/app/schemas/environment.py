from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class EnvironmentResponse(BaseModel):
    timestamp: datetime
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    current_speed: Optional[float] = None
    current_direction: Optional[float] = None
    wind_vectors: Optional[Dict[str, Any]] = None
    current_vectors: Optional[Dict[str, Any]] = None
