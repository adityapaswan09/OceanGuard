from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import rasterio
from rasterio.control import GroundControlPoint
from rasterio.transform import Affine, from_gcps


def resolve_transform(
    metadata: object,
    *,
    width: int | None = None,
    height: int | None = None,
) -> Affine:
    """Resolve a rasterio Affine from a dataset, path, or metadata mapping."""
    if isinstance(metadata, (str, Path)):
        with rasterio.open(metadata) as dataset:
            return resolve_transform(dataset)
    if hasattr(metadata, "transform"):
        transform = metadata.transform
        if transform and transform != Affine.identity():
            return transform
        gcps, _ = metadata.gcps
        if gcps:
            return from_gcps(gcps)[0]
    if isinstance(metadata, dict):
        transform = metadata.get("transform")
        if isinstance(transform, Affine):
            return transform
        gcps = metadata.get("gcps")
        if gcps:
            return from_gcps(_coerce_gcps(gcps))[0]
    raise ValueError("No affine transform or GCPs were found in geolocation_metadata")


def pixel_to_lonlat(transform: Affine, row: float, col: float) -> tuple[float, float]:
    lon, lat = transform @ (col, row)
    return float(lon), float(lat)


def lonlat_to_pixel(transform: Affine, lon: float, lat: float) -> tuple[float, float]:
    col, row = (~transform) @ (lon, lat)
    return float(row), float(col)


def _coerce_gcps(gcps: Sequence[GroundControlPoint | dict]) -> list[GroundControlPoint]:
    result = []
    for gcp in gcps:
        if isinstance(gcp, GroundControlPoint):
            result.append(gcp)
        else:
            result.append(
                GroundControlPoint(
                    row=float(gcp["row"]),
                    col=float(gcp["col"]),
                    x=float(gcp["x"]),
                    y=float(gcp["y"]),
                    z=float(gcp.get("z", 0.0)),
                )
            )
    return result
