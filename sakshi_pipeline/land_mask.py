"""
land_mask.py -- Sakshi land-masking module.

WHY THIS EXISTS:
The demo's real ground-truth coordinates (detection ~9.5000N,75.7667E,
sinking ~9.3125N,76.136E) are 13-38nm off the Kerala coast, not open ocean.
Without land masking, a drift-physics particle cloud can be pushed onto land,
which is not just inaccurate but visibly, obviously wrong in a live demo --
worse than any labeled synthetic-data caveat.

WHAT THIS IS:
Wraps the `global-land-mask` package, which ships an embedded ~1 arc-minute
(~1.85km) resolution land/sea boolean grid derived from GSHHG, entirely
offline (no network calls, no coastline file needed from anyone). At the
km-scale distances relevant to this demo (13-38nm offshore), 1.85km
resolution is precise enough to keep the drift cloud out of Kerala; it is
NOT survey-grade and should not be presented as one.

WHAT THIS IS NOT:
A real bathymetry/coastline product for production use. That's still a
"real land masking" checklist item for later -- this is the minimum viable
version to stop the demo from visibly breaking today.
"""

from global_land_mask import globe
import numpy as np


def is_sea(lat: float, lon: float) -> bool:
    """True if (lat, lon) is water per the embedded GSHHG-derived grid."""
    return not bool(globe.is_land(lat, lon))


def is_sea_array(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Vectorized version for particle clouds. Returns boolean array,
    True = sea."""
    land = globe.is_land(lats, lons)
    return ~land


def clip_particles_to_last_sea_position(all_positions_over_time: np.ndarray) -> np.ndarray:
    """
    Given a (n_steps, n_particles, 2) trajectory array [lon, lat per particle
    per timestep], freezes each particle at the last position it was over
    sea. Models oil beaching rather than continuing to "drift" over land --
    a simple, defensible physical assumption for a demo, not real beaching
    physics (no shoreline retention/resuspension modeled).

    Returns an array of the same shape with post-beaching positions replaced
    by the frozen (last-sea) position.
    """
    n_steps, n_particles, _ = all_positions_over_time.shape
    out = all_positions_over_time.copy()
    beached = np.zeros(n_particles, dtype=bool)
    last_sea_pos = out[0].copy()

    for t in range(n_steps):
        lons = out[t, :, 0]
        lats = out[t, :, 1]
        sea = is_sea_array(lats, lons)

        # newly beached this step
        newly_beached = (~sea) & (~beached)
        beached = beached | newly_beached

        # anything already beached (this step or earlier) stays frozen
        out[t, beached, :] = last_sea_pos[beached, :]

        # update last-known-sea position for particles still at sea
        still_sea = ~beached
        last_sea_pos[still_sea, :] = out[t, still_sea, :]

    return out


if __name__ == "__main__":
    # Sanity check against the real incident coordinates.
    pts = {
        "detection (Sentinel-1, 28 May)": (9.5000, 75.7667),
        "sinking (real SDMA)": (9.3125, 76.136),
        "onshore sanity check (Kochi)": (9.9312, 76.2673),
    }
    for name, (lat, lon) in pts.items():
        print(f"{name}: lat={lat} lon={lon} -> is_sea={is_sea(lat, lon)}")
