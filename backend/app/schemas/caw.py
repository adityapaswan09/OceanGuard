from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class AlphaSurfaceResponse(BaseModel):
    """CAW vessel × t0 alpha surface response."""

    spill_id: int
    vessel_ids: List[int]
    t0_hours: List[float]
    alpha: List[List[float]]
    null_alpha: Optional[float] = None
    vessel_alpha_all: Optional[List[Dict[str, Any]]] = None


class CustodesStatusResponse(BaseModel):
    """Custodes meta-monitor decision status response."""

    spill_id: int
    decision: str
    top_vessel: Optional[int] = None
    top_vessel_score: Optional[float] = None
    second_vessel: Optional[int] = None
    second_vessel_score: Optional[float] = None
    margin: Optional[float] = None
    same_vessel_top2_rows: Optional[bool] = None
    abstain_flag: Optional[bool] = None
    null_alpha: Optional[float] = None
