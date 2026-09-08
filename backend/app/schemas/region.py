from typing import Any

from pydantic import BaseModel


class RegionResponse(BaseModel):
    id: int
    name: str
    geometry: dict[str, Any]
