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

    scores_df = result["scores_df"]
    alpha_surface = None
    if "alpha" in scores_df.columns:
        piv = scores_df.pivot(index="mmsi", columns="t0_hours", values="alpha")
        alpha_surface = {
            "vessel_ids": [int(x) for x in piv.index],
            "t0_hours": [float(x) for x in piv.columns],
            "alpha": piv.values.tolist(),
            "null_alpha": float(result["custodes_status"]["null_alpha"]) if result.get("custodes_status") and "null_alpha" in result["custodes_status"] else None,
        }

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
        "vessel_alpha_all": (
            [{"mmsi": int(mmsi), "alpha": float(a), "is_injected_anomaly": int(mmsi) == ANOMALOUS_MMSI}
             for mmsi, a in result["vessel_alpha_all"].items()]
            if result.get("vessel_alpha_all") else None
        ),
        "alpha_surface": alpha_surface,
        "custodes_status": (
            {"decision": result["custodes_status"]["decision"],
             "margin": result["custodes_status"]["margin"],
             "top_vessel": result["custodes_status"]["top_vessel"],
             "top_vessel_score": result["custodes_status"]["top_vessel_score"],
             "second_vessel": result["custodes_status"]["second_vessel"],
             "second_vessel_score": result["custodes_status"]["second_vessel_score"],
             "same_vessel_top2_rows": result["custodes_status"]["same_vessel_top2_rows"],
             "null_alpha": result["custodes_status"].get("null_alpha")}
            if result.get("custodes_status") else None
        ),
        "abstain_flag": (result["custodes_status"]["abstain_flag"]
                          if result.get("custodes_status") else None),
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
            "vessel_alpha_all / custodes_status": "trained on synthetic decoy-episodes anchored to this incident's real signature (event embedding from the real Layer0 detection, held fixed across all training episodes), held-out validated on 40 episodes not used for gradient updates (seeds 200-239, disjoint from the 200 training seeds). At the validated margin threshold: COMMIT precision 93.9% (33/40 episodes), 57.1% of flagged (non-COMMIT) episodes were correctly-caught wrong predictions. All observed errors were false-positive vessel attribution on no-anomaly episodes (CAW correctly identified the true vessel in 20/20 positive episodes) -- see custodes.py's module docstring and evaluate_margin_threshold_v2.py for the full validation protocol. Demo-level estimate from 40 held-out episodes, not a statistically tight bound. Not hand-tuned.",
        },
    }

    with open("output_for_ui.json", "w") as f:
        json.dump(to_jsonable(output), f, indent=2)

    print("Wrote output_for_ui.json")
    print(json.dumps(to_jsonable(output), indent=2))


if __name__ == "__main__":
    main()
