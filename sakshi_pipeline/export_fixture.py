"""
export_fixture.py -- runs the real end-to-end pipeline ONCE and writes its
output as a static JSON fixture (output_for_ui.json), matching the fixed
output contract. Hand this file to whoever is building the UI -- they
build and test against this file, not against a live backend.

Also writes a "field_provenance" block so the UI can render the
real-vs-synthetic honesty badges described in the checklist, without
guessing which numbers are real.
"""

import json
import numpy as np
from shapely.geometry import MultiPoint, mapping
from engine import run_pipeline
from ais_synthetic import ANOMALOUS_MMSI


def to_jsonable(obj):
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.ndarray,)):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    return obj


def main():
    result = run_pipeline(verbose=False)
    m = result["map_hypothesis"]

    top5 = [
        {"mmsi": int(mmsi), "score": float(score),
         "is_injected_anomaly": int(mmsi) == ANOMALOUS_MMSI}
        for mmsi, score in result["vessel_ranking"].head(5).items()
    ]

    output = {
        "detection": {
            "polygon_latlon": result["detection"]["polygon_latlon"],
            "centroid_latlon": result["detection"]["centroid_latlon"],
            "physical_area_km2": result["detection"]["physical_area_km2"],
            "detection_timestamp": result["detection"]["detection_timestamp"],
            "observed_texture_signature_db": result["detection"]["observed_texture_signature_db"],
            "is_lookalike": result["detection"]["is_lookalike"],
            "confidence": result["detection"]["confidence"],
        },
        "backward_hindcast": {
            "vessel_mmsi": int(m["mmsi"]),
            "hypothesized_t0_hours_before_detection": float(m["t0_hours"]),
            "hypothesized_origin_lonlat": [float(m["origin_lon"]), float(m["origin_lat"])],
            "L_shape": float(m["L_shape"]),
            "L_age": float(m["L_age"]),
            "prior": float(m["prior"]),
            "score": float(m["score"]),
        },
        "age_estimate_hours": result["age_estimate_hours"],
        "vessel_ranking_top5": top5,
        "forward_forecast_centroid_lonlat": result["forecast_centroid_lonlat"],
        # Non-beached particle cloud (GeoJSON FeatureCollection)
        "forward_particle_cloud": (lambda particles, beached: {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": pt.tolist()}}
                for pt in particles[~beached]
            ]
        } if particles.size else None)(
            np.array(result.get("forward_particles", [])),
            np.array(result.get("forward_beached", []), dtype=bool)
        ),
        # Uncertainty envelope (convex hull polygon) or null
        "uncertainty_envelope": (lambda pts: (
            mapping(MultiPoint(pts).convex_hull)
            if pts.shape[0] >= 3 and MultiPoint(pts).convex_hull.geom_type == "Polygon"
            else None
        ))(
            np.array(result.get("forward_particles", []))[~np.array(result.get("forward_beached", []), dtype=bool)]
        ),
        "field_provenance": {
            "detection.polygon_latlon": "synthetic mask, real Layer0 polygonize/area/lookalike code",
            "detection.physical_area_km2": "real geodesic calculation (pyproj), synthetic input mask",
            "detection.observed_texture_signature_db": "real damping-ratio extraction, synthetic SAR pixels calibrated to the weathering model's own prediction",
            "backward_hindcast": "real drift physics, SYNTHETIC current/wind field calibrated to the one real known displacement",
            "L_age": "fully real weathering + age-likelihood model",
            "prior / vessel_ranking": "real behavioral model, trained on SYNTHETIC AIS traffic",
            "land_masking": "real offline GSHHG-derived land/sea grid (global-land-mask package)",
        },
    }

    with open("output_for_ui.json", "w") as f:
        json.dump(to_jsonable(output), f, indent=2)

    print("Wrote output_for_ui.json")
    print(json.dumps(to_jsonable(output), indent=2))


if __name__ == "__main__":
    main()
