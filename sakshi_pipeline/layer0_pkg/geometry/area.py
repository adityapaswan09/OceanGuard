from __future__ import annotations

from shapely.geometry.base import BaseGeometry
from pyproj import Geod


def physical_area_km2(polygon: BaseGeometry) -> float:
    geod = Geod(ellps="WGS84")
    area_m2, _ = geod.geometry_area_perimeter(polygon)
    return float(abs(area_m2) / 1e6)
