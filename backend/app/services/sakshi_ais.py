"""AIS service backed by the deterministic Sakshi AIS generator.

Serves the synthetic-but-schema-real AIS traffic produced by
sakshi_pipeline/ais_synthetic.py without running the ML pipeline:
``generate_ais`` is pure numpy/pandas, so it is executed once per process
and the dataframe is cached in memory.

The generator (and its ``drift``/``land_mask`` imports) use top-level
sibling imports, so the ``sakshi_pipeline`` directory itself is added to
``sys.path`` here rather than relying on package installation.
"""

from __future__ import annotations

import sys
from datetime import timezone
from pathlib import Path

import pandas as pd

_PIPELINE_DIR = Path(__file__).resolve().parents[3] / "sakshi_pipeline"
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))

# The pipeline's detection/ground-truth epoch for all generated tracks.
_T_OBS = pd.Timestamp("2025-05-28T00:00:00")

from ais_synthetic import ANOMALOUS_MMSI, generate_ais  # noqa: E402

_ais_df_cache: pd.DataFrame | None = None


def _ais_df() -> pd.DataFrame:
    """Deterministic Sakshi AIS output, generated at most once per process."""
    global _ais_df_cache
    if _ais_df_cache is None:
        _ais_df_cache = generate_ais(_T_OBS)
    return _ais_df_cache


def sakshi_mmsis() -> list[int]:
    """All 20 MMSIs present in the generated traffic, ascending."""
    return [int(mmsi) for mmsi in sorted(_ais_df()["MMSI"].unique())]


def vessel_label(mmsi: int) -> str:
    """Display label. Sakshi only names the anomalous vessel (MSC ELSA III
    stand-in); other vessels get a neutral label -- no invented IMO/flags."""
    if mmsi == ANOMALOUS_MMSI:
        return "MSC ELSA III"
    return f"Coastal vessel {mmsi}"


def track_points(mmsi: int) -> list[dict]:
    """Chronological AIS track for one MMSI as schema-ready dicts.

    Returns an empty list when the MMSI is not in the generated traffic.
    """
    vessel_rows = _ais_df()
    vessel_rows = vessel_rows[vessel_rows["MMSI"] == mmsi].sort_values("BaseDateTime")
    return [
        {
            "vessel_id": int(row["MMSI"]),
            "timestamp": row["BaseDateTime"].to_pydatetime().replace(tzinfo=timezone.utc),
            "latitude": float(row["LAT"]),
            "longitude": float(row["LON"]),
            "speed_knots": float(row["SOG"]),
            "course_degrees": float(row["COG"]),
        }
        for _, row in vessel_rows.iterrows()
    ]
