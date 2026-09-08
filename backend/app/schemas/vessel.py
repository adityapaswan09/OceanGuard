from typing import Optional

from pydantic import BaseModel


class VesselResponse(BaseModel):
    id: int
    name: str
    imo_number: Optional[str] = None
    vessel_type: Optional[str] = None
    flag: Optional[str] = None
