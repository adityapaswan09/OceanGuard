from __future__ import annotations

from datetime import datetime
from pathlib import Path

import numpy as np

from .geometry.area import physical_area_km2
from .geometry.georeference import resolve_transform
from .geometry.polygonize import mask_to_polygons
from .lookalike.flag import is_lookalike
from .schemas import DetectionOutput, validate_detection_output
from .segmentation.infer import predict_full_image
from .texture.damping_ratio import damping_ratio_db


def detect(sar_image, geolocation_metadata, acquisition_time) -> DetectionOutput:
    """Convert one SAR image into the fixed Layer 0 evidence contract."""
    geolocation_metadata = _merge_raster_metadata(sar_image, geolocation_metadata)
    sar_array = _load_image(sar_image)
    class_mask, pixel_confidence = _segmentation(sar_array, geolocation_metadata)
    if class_mask.shape != sar_array.shape[-2:]:
        raise ValueError("segmentation class_mask must match the SAR image dimensions")
    transform = resolve_transform(geolocation_metadata)
    oil_region = class_mask == 1
    polygons = mask_to_polygons(oil_region, transform, min_component_pixels=1)
    if not polygons:
        raise ValueError("No oil-class detection was produced")
    polygon = max(polygons, key=lambda candidate: candidate.area)
    centroid = polygon.centroid
    confidence_values = pixel_confidence[oil_region]
    texture_image = sar_array[0] if sar_array.ndim == 3 else sar_array
    output: DetectionOutput = {
        "polygon_latlon": [
            (float(lon), float(lat)) for lon, lat in polygon.exterior.coords
        ],
        "centroid_latlon": (float(centroid.x), float(centroid.y)),
        "physical_area_km2": physical_area_km2(polygon),
        "detection_timestamp": _timestamp(acquisition_time),
        "observed_texture_signature_db": damping_ratio_db(texture_image, oil_region),
        "is_lookalike": is_lookalike(class_mask, class_mask != 0),
        "confidence": float(confidence_values.mean()),
    }
    validate_detection_output(output)
    return output


def _load_image(sar_image) -> np.ndarray:
    if isinstance(sar_image, (str, Path)):
        import rasterio

        with rasterio.open(sar_image) as dataset:
            return dataset.read().astype(np.float32)
    image = np.asarray(sar_image, dtype=np.float32)
    if image.ndim not in (2, 3):
        raise ValueError("sar_image must have shape (H, W) or (C, H, W)")
    return image


def _merge_raster_metadata(sar_image, metadata: object) -> object:
    if not isinstance(sar_image, (str, Path)) or not isinstance(metadata, dict):
        return metadata
    if "transform" in metadata:
        return metadata
    import rasterio

    with rasterio.open(sar_image) as dataset:
        return {**metadata, "transform": dataset.transform}


def _segmentation(image: np.ndarray, metadata: object):
    if isinstance(metadata, dict) and "class_mask" in metadata:
        if "pixel_confidence" not in metadata:
            raise ValueError("pixel_confidence is required with a precomputed class_mask")
        return (
            np.asarray(metadata["class_mask"], dtype=np.uint8),
            np.asarray(metadata["pixel_confidence"], dtype=np.float32),
        )
    checkpoint = metadata.get("checkpoint") if isinstance(metadata, dict) else None
    if checkpoint is None:
        checkpoint = "checkpoints/best.pt"
    return predict_full_image(image, checkpoint)


def _timestamp(acquisition_time) -> float:
    if isinstance(acquisition_time, datetime):
        return float(acquisition_time.timestamp())
    if isinstance(acquisition_time, (int, float)):
        return float(acquisition_time)
    if isinstance(acquisition_time, str):
        return float(datetime.fromisoformat(acquisition_time.replace("Z", "+00:00")).timestamp())
    raise TypeError("acquisition_time must be ISO 8601 text, datetime, or numeric epoch seconds")
