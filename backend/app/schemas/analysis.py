from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CoordinatePair(BaseModel):
    """A [lon, lat] coordinate pair."""

    lon: float
    lat: float

    @staticmethod
    def from_list(coord: List[float]) -> CoordinatePair:
        """Convert from [lon, lat] list."""
        return CoordinatePair(lon=coord[0], lat=coord[1])


class DetectionAnalysis(BaseModel):
    """Detection results from the Sakshi ML pipeline."""

    polygon_latlon: List[List[float]]
    """Polygon coordinates as [[lon, lat], [lon, lat], ...]."""

    centroid_latlon: CoordinatePair
    """Centroid as [lon, lat]."""

    physical_area_km2: float
    """Detected area in square kilometers."""

    detection_timestamp: float
    """Detection timestamp as Unix epoch seconds."""

    observed_texture_signature_db: float
    """Observed texture signature in dB."""

    is_lookalike: bool
    """Whether this is likely a lookalike detection."""

    confidence: float
    """Confidence score (0-1)."""


class BackwardHindcastAnalysis(BaseModel):
    """Backward hindcast analysis results."""

    vessel_mmsi: int
    """MMSI of the hypothesized source vessel."""

    hypothesized_t0_hours_before_detection: float
    """Estimated hours before detection when spill occurred."""

    hypothesized_origin_lonlat: CoordinatePair
    """Hypothesized origin location as [lon, lat]."""

    L_shape: float
    """Shape parameter."""

    L_age: float
    """Age parameter."""

    prior: float
    """Prior probability."""

    score: float
    """Hindcast score."""


class VesselRankingEntry(BaseModel):
    """A vessel in the top-5 ranking."""

    mmsi: int
    """Maritime Mobile Service Identity."""

    score: float
    """Ranking score."""

    is_injected_anomaly: bool
    """Whether this is an injected anomaly for testing."""


class SpillAnalysisResponse(BaseModel):
    """Complete ML analysis for a spill detection."""

    spill_id: int
    """Database spill ID."""

    status: str
    """Status of the analysis (e.g., 'complete')."""

    detection: DetectionAnalysis
    """Detection analysis results."""

    backward_hindcast: BackwardHindcastAnalysis
    """Backward hindcast analysis results."""

    age_estimate_hours: float
    """Age estimate in hours."""

    vessel_ranking_top5: List[VesselRankingEntry]
    """Top 5 vessel rankings."""

    forward_forecast_centroid_lonlat: CoordinatePair
    forward_particle_cloud: Optional[Dict[str, Any]] = None
    uncertainty_envelope: Optional[Dict[str, Any]] = None

    field_provenance: Dict[str, str]
    """Data provenance information for transparency."""
