"""
ais_synthetic.py -- generates a synthetic AIS traffic dataframe shaped like
real MarineCadastre-schema AIS, for the Kerala corridor. This is explicitly
SYNTHETIC (checklist: "Real AIS near Kerala: not pulled"), schema-matched so
it can be swapped for real AIS later without touching engine.py or
behavioral.py.

One vessel (MMSI 200000000, standing in for MSC ELSA III) follows the real
corridor normally and then, near the real sinking coordinates/time, shows a
sharp, physically anomalous course/speed change (capsizing event). All other
vessels follow smooth, unremarkable coastal traffic patterns.
"""

import numpy as np
import pandas as pd

from drift import REAL_SINKING

N_NORMAL_VESSELS = 19
ANOMALOUS_MMSI = 200000000
TRACK_LENGTH = 150         # rows per vessel -- must exceed the largest
                           # candidate t0 (120h) with margin on both sides
STEP_MINUTES = 60          # 1 row per hour -> 150h of track history
# Anomaly must land at REAL_ELAPSED_HOURS (72h) before t_obs, matching the
# drift/texture calibration elsewhere -- NOT an arbitrary row index.
from drift import REAL_ELAPSED_HOURS
ANOMALY_STEP = TRACK_LENGTH - int(REAL_ELAPSED_HOURS)


def _normal_vessel_track(rng, mmsi, t_end, start_lat, start_lon, heading_deg, speed_knots):
    rows = []
    lat, lon = start_lat, start_lon
    cog = heading_deg
    sog = speed_knots
    for step in range(TRACK_LENGTH):
        ts = t_end - pd.Timedelta(minutes=STEP_MINUTES * (TRACK_LENGTH - step))
        # gentle random walk in course/speed -- normal traffic noise
        cog = (cog + rng.normal(0, 3)) % 360
        sog = max(2.0, sog + rng.normal(0, 0.5))
        # advance position along heading (rough deg-per-step, small & consistent scale)
        rad = np.radians(cog)
        dlat = np.cos(rad) * 0.01 * (sog / 12.0)
        dlon = np.sin(rad) * 0.01 * (sog / 12.0)
        lat += dlat
        lon += dlon
        rows.append((mmsi, ts, lat, lon, sog, cog))
    return rows


def _anomalous_vessel_track(rng, t_end):
    """MSC ELSA III stand-in: normal coastal transit, then at ANOMALY_STEP
    undergoes a sharp course reversal and speed collapse (loss of steerage
    leading to capsize), positioned at the REAL_SINKING coordinates at that
    moment."""
    rows = []
    sink_lat, sink_lon = REAL_SINKING
    # back-solve a plausible pre-anomaly track that arrives at REAL_SINKING
    # at ANOMALY_STEP, on a steady course, then diverges sharply after.
    cog = 195.0   # steady southerly transit before the incident
    sog = 13.0
    # rows[i] is stored AFTER (i+1) steps of travel from the backsolved
    # start (each iteration advances lat/lon *then* appends). engine.py's
    # get_vessel_positions_at_t0 looks up the row whose timestamp equals
    # t_end - t0_hours, which for t0=REAL_ELAPSED_HOURS is row index
    # ANOMALY_STEP itself (not ANOMALY_STEP-1). So the steady (pre-anomaly)
    # walk needs (ANOMALY_STEP + 1) constant-course steps to land row
    # ANOMALY_STEP exactly on REAL_SINKING -- back-solve accordingly.
    lat, lon = sink_lat, sink_lon
    rad = np.radians(cog)
    lat -= np.cos(rad) * 0.01 * (sog / 12.0) * (ANOMALY_STEP + 1)
    lon -= np.sin(rad) * 0.01 * (sog / 12.0) * (ANOMALY_STEP + 1)

    for step in range(TRACK_LENGTH):
        ts = t_end - pd.Timedelta(minutes=STEP_MINUTES * (TRACK_LENGTH - step))
        if step <= ANOMALY_STEP:
            # Pre-anomaly leg: SAME steady course/speed used by the backward
            # solve above (cog=195, sog=13.0, no noise). Adding random-walk
            # noise here (the original bug) made the forward-simulated
            # position diverge from the sink-point anchor by ~16km. Keeping
            # it constant through and including step==ANOMALY_STEP guarantees
            # row ANOMALY_STEP -- the exact row engine.py queries for
            # t0=REAL_ELAPSED_HOURS -- lands on REAL_SINKING.
            pass
        else:
            # sharp, physically abnormal behavior: course whips around and
            # speed collapses toward zero as the vessel loses way and capsizes
            progress = step - ANOMALY_STEP - 1
            cog = (cog + 40 * np.sign(rng.normal()) + rng.normal(0, 25)) % 360
            sog = max(0.2, sog * np.exp(-0.35 * progress) + rng.normal(0, 0.4))

        rad = np.radians(cog)
        dlat = np.cos(rad) * 0.01 * (sog / 12.0)
        dlon = np.sin(rad) * 0.01 * (sog / 12.0)
        lat += dlat
        lon += dlon
        rows.append((ANOMALOUS_MMSI, ts, lat, lon, sog, cog))

    return rows


def generate_ais(t_obs, seed=0):
    """t_obs: pandas.Timestamp for the detection time (end of all tracks)."""
    rng = np.random.default_rng(seed)
    rows = []

    rows += _anomalous_vessel_track(rng, t_obs)

    for v in range(N_NORMAL_VESSELS):
        mmsi = 200000001 + v
        start_lat = 9.0 + rng.uniform(0, 0.9)
        start_lon = 75.5 + rng.uniform(0, 0.9)
        heading = rng.uniform(0, 360)
        speed = rng.uniform(8, 16)
        rows += _normal_vessel_track(rng, mmsi, t_obs, start_lat, start_lon, heading, speed)

    df = pd.DataFrame(rows, columns=["MMSI", "BaseDateTime", "LAT", "LON", "SOG", "COG"])
    return df.sort_values(["MMSI", "BaseDateTime"]).reset_index(drop=True)


if __name__ == "__main__":
    t_obs = pd.Timestamp("2025-05-28 00:00:00")
    df = generate_ais(t_obs)
    print(df.shape)
    print(df[df.MMSI == ANOMALOUS_MMSI].iloc[ANOMALY_STEP - 2: ANOMALY_STEP + 3])
