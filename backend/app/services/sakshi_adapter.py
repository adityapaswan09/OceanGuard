"""Adapter service for converting Sakshi ML pipeline output to API responses."""

import json
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone

from app.schemas.analysis import (
    BackwardHindcastAnalysis,
    CoordinatePair,
    DetectionAnalysis,
    SpillAnalysisResponse,
    VesselRankingEntry,
)
from app.schemas.hindcast import HindcastResponse
from app.schemas.forecast import ForecastResponse
from app.schemas.environment import EnvironmentResponse


class SakshiAdapter:
    """Adapter for reading and converting Sakshi pipeline output."""

    def __init__(self, fixture_path: Optional[Path] = None):
        """
        Initialize the adapter.

        Args:
            fixture_path: Path to the output_for_ui.json file.
                         If None, uses default path relative to this module.
        """
        if fixture_path is None:
            # Default path: ../../../sakshi_pipeline/output_for_ui.json
            module_dir = Path(__file__).parent.parent.parent  # backend/app/services -> backend
            fixture_path = module_dir.parent / "sakshi_pipeline" / "output_for_ui.json"

        self.fixture_path = fixture_path
        self._cache: Optional[dict] = None

    def _load_fixture(self) -> dict:
        """Load the fixture file, with caching."""
        if self._cache is not None:
            return self._cache

        if not self.fixture_path.exists():
            raise FileNotFoundError(
                f"Sakshi fixture file not found at {self.fixture_path}. "
                "Run the pipeline to generate output_for_ui.json."
            )

        with open(self.fixture_path, "r") as f:
            self._cache = json.load(f)

        return self._cache

    def get_analysis(self, spill_id: int) -> SpillAnalysisResponse:
        """
        Get analysis for a spill.

        For now, returns the same fixture for any spill_id since we only have
        a demo output file. In production, this would query different results
        based on spill_id.

        Args:
            spill_id: The spill ID (not used yet with fixture data).

        Returns:
            SpillAnalysisResponse with the ML analysis.

        Raises:
            FileNotFoundError: If the fixture file is missing.
        """
        data = self._load_fixture()

        # Parse detection
        detection = DetectionAnalysis(
            polygon_latlon=data["detection"]["polygon_latlon"],
            centroid_latlon=CoordinatePair.from_list(data["detection"]["centroid_latlon"]),
            physical_area_km2=data["detection"]["physical_area_km2"],
            detection_timestamp=data["detection"]["detection_timestamp"],
            observed_texture_signature_db=data["detection"]["observed_texture_signature_db"],
            is_lookalike=data["detection"]["is_lookalike"],
            confidence=data["detection"]["confidence"],
        )

        # Parse backward hindcast
        backward = data["backward_hindcast"]
        hindcast = BackwardHindcastAnalysis(
            vessel_mmsi=backward["vessel_mmsi"],
            hypothesized_t0_hours_before_detection=backward["hypothesized_t0_hours_before_detection"],
            hypothesized_origin_lonlat=CoordinatePair.from_list(backward["hypothesized_origin_lonlat"]),
            L_shape=backward["L_shape"],
            L_age=backward["L_age"],
            prior=backward["prior"],
            score=backward["score"],
        )

        # Parse vessel ranking
        vessel_ranking = [
            VesselRankingEntry(
                mmsi=v["mmsi"],
                score=v["score"],
                is_injected_anomaly=v["is_injected_anomaly"],
            )
            for v in data["vessel_ranking_top5"]
        ]

        # Parse forecast
        forecast_coord = CoordinatePair.from_list(data["forward_forecast_centroid_lonlat"])

        # Construct response
        return SpillAnalysisResponse(
            spill_id=spill_id,
            status="complete",
            detection=detection,
            backward_hindcast=hindcast,
            age_estimate_hours=data["age_estimate_hours"],
            vessel_ranking_top5=vessel_ranking,
            forward_forecast_centroid_lonlat=forecast_coord,
            forward_particle_cloud=data.get("forward_particle_cloud"),
            uncertainty_envelope=data.get("uncertainty_envelope"),
            field_provenance=data["field_provenance"],
        )

    def get_vessel_ranking(self, spill_id: int) -> List[dict]:
        """Return the raw vessel ranking list from the Sakshi fixture.

        The fixture contains a top‑5 ranking under the key "vessel_ranking_top5".
        This method simply loads the JSON file (using the existing caching logic)
        and returns that list unchanged. No re‑ordering, score calculation or
        data augmentation is performed – we preserve exactly the values
        produced by the Sakshi pipeline.
        """
        # ``spill_id`` is unused because the demo fixture contains a single
        # analysis for all spills, matching the behaviour of the other adapter
        # methods.
        data = self._load_fixture()
        return data.get("vessel_ranking_top5", [])

    def get_hindcast(self, spill_id: int) -> HindcastResponse:
        """Return HindcastResponse using Sakshi fixture data.

        - estimated_origin_time is computed from detection timestamp minus hypothesized t0.
        - origin_region is a GeoJSON Point of the hypothesized origin.
        - backward_trajectory and uncertainty_cloud are None (not provided).
        - confidence uses the Sakshi score directly.
        """
        data = self._load_fixture()
        detection_ts = data["detection"]["detection_timestamp"]
        backward = data["backward_hindcast"]
        # Compute origin time (UTC)
        origin_time = datetime.fromtimestamp(
            detection_ts - backward["hypothesized_t0_hours_before_detection"] * 3600,
            tz=timezone.utc,
        )
        origin_region = {"type": "Point", "coordinates": backward["hypothesized_origin_lonlat"]}
        return HindcastResponse(
            spill_id=spill_id,
            estimated_origin_time=origin_time,
            origin_time_uncertainty_hours=backward["L_age"],
            origin_region=origin_region,
            backward_trajectory=None,
            uncertainty_cloud=None,
            confidence=backward["score"],
        )

    def get_forecast(self, spill_id: int) -> ForecastResponse:
        """Return ForecastResponse using Sakshi fixture data.

        Only the centroid point is available; we return it as a GeoJSON Point for the 24‑hour forecast.
        Other forecast horizons and uncertainty envelope are left as None.
        """
        data = self._load_fixture()
        centroid = data["forward_forecast_centroid_lonlat"]
        return ForecastResponse(
            spill_id=spill_id,
            forecast_generated_at=datetime.now(timezone.utc),
            forecast_6h=None,
            forecast_12h=None,
            forecast_24h={"type": "Point", "coordinates": centroid},
            uncertainty_envelope=None,
        )

    def get_environment(self, spill_id: int) -> EnvironmentResponse:
        """Return EnvironmentResponse with null wind/current values.

        The Sakshi fixture does not contain environmental measurements, so we return
        only a timestamp and set all scalar fields to None.
        """
        return EnvironmentResponse(
            timestamp=datetime.now(timezone.utc),
            wind_speed=None,
            wind_direction=None,
            current_speed=None,
            current_direction=None,
            wind_vectors=None,
            current_vectors=None,
        )
