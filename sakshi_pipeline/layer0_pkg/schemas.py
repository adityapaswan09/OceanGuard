from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict


class DetectionOutput(TypedDict):
    polygon_latlon: list[tuple[float, float]]
    centroid_latlon: tuple[float, float]
    physical_area_km2: float
    detection_timestamp: float
    observed_texture_signature_db: float
    is_lookalike: bool
    confidence: float


@dataclass(frozen=True)
class SegmentationResult:
    class_mask: object
    pixel_confidence: object


def validate_detection_output(output: dict) -> None:
    required = {
        "polygon_latlon",
        "centroid_latlon",
        "physical_area_km2",
        "detection_timestamp",
        "observed_texture_signature_db",
        "is_lookalike",
        "confidence",
    }
    if set(output) != required:
        raise ValueError(f"Detection output keys must be exactly {sorted(required)}")
    if not isinstance(output["polygon_latlon"], list):
        raise TypeError("polygon_latlon must be a list")
    if not all(
        isinstance(point, tuple)
        and len(point) == 2
        and all(isinstance(value, float) for value in point)
        for point in output["polygon_latlon"]
    ):
        raise TypeError("polygon_latlon must be list[tuple[float, float]]")
    if not (
        isinstance(output["centroid_latlon"], tuple)
        and len(output["centroid_latlon"]) == 2
        and all(isinstance(value, float) for value in output["centroid_latlon"])
    ):
        raise TypeError("centroid_latlon must be tuple[float, float]")
    for key in (
        "physical_area_km2",
        "detection_timestamp",
        "observed_texture_signature_db",
        "confidence",
    ):
        if not isinstance(output[key], float):
            raise TypeError(f"{key} must be float")
    if not isinstance(output["is_lookalike"], bool):
        raise TypeError("is_lookalike must be bool")
    if not 0.0 <= output["confidence"] <= 1.0:
        raise ValueError("confidence must be between 0 and 1")
