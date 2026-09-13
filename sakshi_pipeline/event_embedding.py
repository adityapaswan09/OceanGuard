"""
event_embedding.py -- turns the Layer 0 detection dict into a small,
normalized, fixed-length vector that can be used as the query token for the
Causal Attention Web (CAW).

Only 4 fields of the detection dict are used:
  - centroid_latlon                 (2 values: lat, lon)
  - physical_area_km2                (1 value)
  - observed_texture_signature_db    (1 value)
  - confidence                       (1 value, already in [0, 1])

No learned encoder -- just simple, fixed normalization constants chosen from
plausible physical ranges, so the same detection always maps to the same
vector without needing a fitted scaler.
"""

import numpy as np

# Fixed normalization ranges (min, max) used for min-max scaling. Chosen
# from plausible physical bounds rather than fit on data, since this is a
# deterministic feature builder, not a learned encoder.
LAT_RANGE = (-90.0, 90.0)
LON_RANGE = (-180.0, 180.0)
AREA_RANGE_KM2 = (0.0, 200.0)          # plausible oil-slick footprint sizes
TEXTURE_RANGE_DB = (0.0, 20.0)         # damping-ratio texture signature
# confidence is already a probability in [0, 1] -- no rescaling needed.


def _min_max(value, value_range):
    lo, hi = value_range
    return float((value - lo) / (hi - lo + 1e-12))


def build_event_embedding(detection_dict):
    """
    detection_dict = run_layer0() ka output (centroid_latlon,
    physical_area_km2, observed_texture_signature_db, confidence)

    Return: normalized fixed-length np.ndarray (query token for CAW)
    """
    # NOTE: despite the key's name, layer0_pkg/pipeline.py actually builds
    # this tuple as (centroid.x, centroid.y) == (lon, lat), not (lat, lon).
    # We match the pipeline's real ordering here rather than the label.
    lon, lat = detection_dict["centroid_latlon"]
    area_km2 = detection_dict["physical_area_km2"]
    texture_db = detection_dict["observed_texture_signature_db"]
    confidence = detection_dict["confidence"]

    lat_norm = _min_max(lat, LAT_RANGE)
    lon_norm = _min_max(lon, LON_RANGE)
    area_norm = _min_max(area_km2, AREA_RANGE_KM2)
    texture_norm = _min_max(texture_db, TEXTURE_RANGE_DB)
    confidence_norm = float(confidence)  # already in [0, 1]

    embedding = np.array(
        [lat_norm, lon_norm, area_norm, texture_norm, confidence_norm],
        dtype=np.float32,
    )
    return embedding


if __name__ == "__main__":
    from detection_layer0 import run_layer0

    detection_dict = run_layer0()
    embedding = build_event_embedding(detection_dict)

    print("Detection dict fields used:")
    print("  centroid_latlon:", detection_dict["centroid_latlon"])
    print("  physical_area_km2:", round(detection_dict["physical_area_km2"], 3))
    print("  observed_texture_signature_db:",
          round(detection_dict["observed_texture_signature_db"], 3))
    print("  confidence:", round(detection_dict["confidence"], 3))
    print("\nEvent embedding (query token for CAW):")
    print(embedding)
    print("shape:", embedding.shape)
