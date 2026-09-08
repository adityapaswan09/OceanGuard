"""
engine.py -- the joint scoring engine tying together every module:
Layer 0 detection (real), drift physics (recentered synthetic field),
weathering/age (real), behavioral prior (real, trained on synthetic AIS),
land masking (real, offline).

score(h) = L_shape(h) x L_age(h) x prior(h)   -- ONE joint object per hypothesis
h = (vessel_mmsi, t0)

- backward hindcast = MAP hypothesis (argmax score)
- age estimate = marginal over t0, weighted by score
- forward forecast = push the MAP hypothesis forward from t_obs
- vessel ranking = summarize(): groupby(vessel_id).sum(score(h))  -- no
  separate ranking module, exactly as the architecture diagram states.
"""

import numpy as np
import pandas as pd

from drift import (
    REAL_SINKING, REAL_DETECTION, REAL_ELAPSED_HOURS,
    KERALA_CURRENT, KERALA_WIND, forward_forecast,
)
from footprint import particle_cloud_footprint, iou
from agelikelihood import age_likelihood
from ais_synthetic import generate_ais, ANOMALOUS_MMSI
from behavioral import train_behavioral_prior
from detection_layer0 import run_layer0

# Candidate elapsed times (hours before detection) to hypothesize over.
# Coarse (12h) outside the plausible window, fine (2h) across 48-96h --
# the old uniform 6h grid was too coarse to resolve which of two
# adjacent, near-tied candidates (e.g. 66h vs true 72h) was actually
# best; the score curve's real peak could sit anywhere inside that 6h
# gap. 2h steps cut that quantization error from +/-3h to +/-1h.
CANDIDATE_T0_HOURS = [12, 24, 36] + list(range(48, 97, 2)) + [108, 120]
OIL_TYPE = "arabian_light"


def get_vessel_positions_at_t0(ais_df, t0_hours_before_obs, t_obs):
    """For each vessel, find its AIS position closest to (t_obs - t0_hours_before_obs).
    Returns dict: mmsi -> (lon, lat)."""
    target_time = t_obs - pd.Timedelta(hours=t0_hours_before_obs)
    positions = {}
    for mmsi, g in ais_df.groupby("MMSI"):
        g = g.copy()
        g["diff"] = (g["BaseDateTime"] - target_time).abs()
        row = g.loc[g["diff"].idxmin()]
        positions[mmsi] = (float(row["LON"]), float(row["LAT"]))
    return positions


def run_pipeline(verbose=True):
    t_obs = pd.Timestamp("2025-05-28T00:00:00")  # real Sentinel-1 detection date

    # ---- Layer 0: real detection pipeline on a synthetic (untrained-checkpoint) mask
    detection = run_layer0(elapsed_hours_for_texture_calibration=REAL_ELAPSED_HOURS,
                            oil_type=OIL_TYPE)
    observed_centroid_lonlat = detection["centroid_latlon"]
    observed_texture_db = detection["observed_texture_signature_db"]
    if verbose:
        print(f"[Layer 0] centroid={observed_centroid_lonlat} "
              f"area={detection['physical_area_km2']:.2f} km^2 "
              f"texture={observed_texture_db:.3f} dB "
              f"lookalike={detection['is_lookalike']} conf={detection['confidence']:.2f}")

    # observed footprint polygon straight from Layer 0's real polygon output
    from shapely.geometry import Polygon
    observed_polygon = Polygon(detection["polygon_latlon"])

    # ---- Synthetic AIS + behavioral prior (real training, synthetic traffic)
    ais_df = generate_ais(t_obs)
    vessel_behavior_scores = train_behavioral_prior(ais_df, verbose=verbose)
    # normalize into (0, 1] priors via simple max-scaling (monotonic, preserves ranking)
    max_err = max(vessel_behavior_scores.values())
    vessel_prior = {m: v / max_err for m, v in vessel_behavior_scores.items()}

    # ---- Build hypotheses: every (vessel, t0) pair
    all_scores = []  # rows: mmsi, t0_hours, L_shape, L_age, prior, score
    for t0_hours in CANDIDATE_T0_HOURS:
        vessel_positions = get_vessel_positions_at_t0(ais_df, t0_hours, t_obs)
        for mmsi, (lon, lat) in vessel_positions.items():
            origin = np.array([lon, lat])
            particles, beached = forward_forecast(
                origin, t0=0, t_end=t0_hours * 3600,
                current_field=KERALA_CURRENT, wind_field=KERALA_WIND,
                n_particles=120, rng=np.random.default_rng(hash((mmsi, t0_hours)) % (2**32)),
            )
            predicted_polygon = particle_cloud_footprint(particles, beached)
            l_shape = iou(observed_polygon, predicted_polygon)
            l_age = age_likelihood(t0_hours, observed_texture_db,
                                    {"oil_type": OIL_TYPE}, sigma=0.5)
            prior = vessel_prior[mmsi]
            score = l_shape * l_age * prior
            all_scores.append({
                "mmsi": mmsi, "t0_hours": t0_hours,
                "origin_lon": lon, "origin_lat": lat,
                "L_shape": l_shape, "L_age": l_age, "prior": prior, "score": score,
            })

    scores_df = pd.DataFrame(all_scores)

    # ---- Backward hindcast: MAP hypothesis
    map_row = scores_df.loc[scores_df["score"].idxmax()]

    # ---- Age estimate: marginal over t0, weighted by score
    t0_marginal = scores_df.groupby("t0_hours")["score"].sum()
    if t0_marginal.sum() > 0:
        t0_values = np.asarray(t0_marginal.index, dtype=float)
        weights = np.asarray(t0_marginal.values, dtype=float)
        age_estimate_hours = float((t0_values * weights).sum() / weights.sum())
    else:
        age_estimate_hours = float(scores_df["t0_hours"].mean())

    # ---- Vessel ranking: summarize() = groupby(vessel).sum(score) -- no separate module
    vessel_ranking = (scores_df.groupby("mmsi")["score"].sum()
                       .sort_values(ascending=False))

    # ---- Forward forecast from the MAP hypothesis
    map_origin = np.array([map_row["origin_lon"], map_row["origin_lat"]])
    forward_particles, forward_beached = forward_forecast(
        map_origin, t0=0, t_end=(map_row["t0_hours"] + 24) * 3600,  # +24h beyond detection
        current_field=KERALA_CURRENT, wind_field=KERALA_WIND,
        n_particles=150, rng=np.random.default_rng(999),
    )
    forecast_centroid = forward_particles[~forward_beached].mean(axis=0) if (~forward_beached).any() else None

    return {
        "detection": detection,
        "scores_df": scores_df,
        "map_hypothesis": map_row,
        "age_estimate_hours": age_estimate_hours,
        "vessel_ranking": vessel_ranking,
        "forecast_centroid_lonlat": forecast_centroid.tolist() if forecast_centroid is not None else None,
        "forward_particles": forward_particles,
        "forward_beached": forward_beached,
    }


if __name__ == "__main__":
    result = run_pipeline(verbose=True)

    print("\n" + "=" * 70)
    print("BACKWARD HINDCAST (MAP hypothesis)")
    print("=" * 70)
    m = result["map_hypothesis"]
    print(f"  Vessel MMSI: {int(m['mmsi'])}"
          f"{'  <-- MSC ELSA III (injected anomaly)' if int(m['mmsi']) == ANOMALOUS_MMSI else ''}")
    print(f"  Hypothesized t0: {m['t0_hours']:.0f}h before detection")
    print(f"  Hypothesized origin (lon,lat): ({m['origin_lon']:.4f}, {m['origin_lat']:.4f})")
    print(f"  Real sinking point (lon,lat):  ({REAL_SINKING[1]:.4f}, {REAL_SINKING[0]:.4f})")
    err_deg = np.hypot(m['origin_lon'] - REAL_SINKING[1], m['origin_lat'] - REAL_SINKING[0])
    print(f"  Origin error vs real sinking point: {err_deg:.4f} deg (~{err_deg*111:.1f} km)")
    print(f"  L_shape={m['L_shape']:.4f}  L_age={m['L_age']:.4f}  prior={m['prior']:.4f}  score={m['score']:.6f}")

    print("\n" + "=" * 70)
    print("AGE ESTIMATE")
    print("=" * 70)
    print(f"  Estimated elapsed time: {result['age_estimate_hours']:.1f}h")
    print(f"  Real elapsed time (per script): {REAL_ELAPSED_HOURS:.0f}h")

    print("\n" + "=" * 70)
    print("VESSEL RANKING (summarize() -- marginal of score(h) over vessel)")
    print("=" * 70)
    for rank, (mmsi, score) in enumerate(result["vessel_ranking"].head(5).items(), start=1):
        flag = "  <-- MSC ELSA III (injected anomaly)" if int(mmsi) == ANOMALOUS_MMSI else ""
        print(f"  {rank}. MMSI {int(mmsi)}: score={score:.6f}{flag}")

    print("\n" + "=" * 70)
    print("FORWARD FORECAST (+24h past detection, from MAP hypothesis)")
    print("=" * 70)
    print(f"  Forecast centroid (lon,lat): {result['forecast_centroid_lonlat']}")
