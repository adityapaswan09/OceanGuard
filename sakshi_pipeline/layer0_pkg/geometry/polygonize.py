from __future__ import annotations

import cv2
import numpy as np
from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry
from rasterio.transform import Affine

from .georeference import pixel_to_lonlat


def mask_to_polygons(
    oil_mask: np.ndarray,
    transform: Affine,
    *,
    opening_kernel_size: int = 3,
    min_component_pixels: int = 1,
) -> list[Polygon]:
    if oil_mask.ndim != 2 or oil_mask.dtype != bool:
        raise ValueError("oil_mask must be a 2D boolean array")
    kernel = np.ones((opening_kernel_size, opening_kernel_size), dtype=np.uint8)
    cleaned = cv2.morphologyEx(oil_mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons: list[Polygon] = []
    for contour in contours:
        if cv2.contourArea(contour) <= 0 or cv2.contourArea(contour) < min_component_pixels:
            continue
        points = [
            pixel_to_lonlat(transform, float(row), float(col))
            for col, row in contour[:, 0, :]
        ]
        polygon = Polygon(points)
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if not polygon.is_empty and polygon.geom_type == "Polygon":
            polygons.append(polygon)
    return polygons


def largest_polygon(polygons: list[Polygon]) -> BaseGeometry:
    if not polygons:
        raise ValueError("No oil components were found")
    return max(polygons, key=lambda polygon: polygon.area)
