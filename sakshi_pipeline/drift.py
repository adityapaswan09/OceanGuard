"""
drift.py -- Sakshi drift physics, adapted from the team's notebook
(SyntheticField / rk4_step / forward_forecast / DriftSurrogate), with two
changes for the end-to-end Kerala demo:

  1. Recentered + calibrated so that a real observed displacement --
     sinking point (9.3125N, 76.136E) -> detection point (9.5000N,
     75.7667E) over ~72h -- is reproducible by the synthetic field. This
     field is still SYNTHETIC (no real CMEMS current data), calibrated to
     match the one real displacement we have ground truth for. That
     calibration is stated here, not hidden.
  2. Land-mask beaching: particles that would cross onto land are frozen
     at their last sea position instead of continuing to drift over Kerala.

Everything else (RK4 integration, particle diffusion, surrogate grid) is
structurally the same as the notebook.
"""

import numpy as np
from land_mask import is_sea_array

# ---------------------------------------------------------------------
# Real ground truth (from Kerala's disaster management authority / ISRO
# EOS-4 & Sentinel-1 detections). Used only to calibrate the SYNTHETIC
# field below -- not a real current product.
# ---------------------------------------------------------------------
REAL_SINKING = (9.3125, 76.136)     # (lat, lon)
REAL_DETECTION = (9.5000, 75.7667)  # (lat, lon), Sentinel-1, 28 May
REAL_ELAPSED_HOURS = 72.0           # per script: "elapsed time here is about 72 hours"


class SyntheticField:
    """Same structural form as the notebook's SyntheticField (uniform
    drift + a weak rotational/gyre term), recentered on the Kerala
    incident and calibrated so that REAL_SINKING -> REAL_DETECTION over
    REAL_ELAPSED_HOURS under this module's RK4 integrator.
    """

    def __init__(self, base_u, base_v, gyre_strength, center_lon, center_lat):
        self.base_u = base_u
        self.base_v = base_v
        self.gyre_strength = gyre_strength
        self.center_lon = center_lon
        self.center_lat = center_lat

    def __call__(self, lon, lat, t):
        dx = lon - self.center_lon
        dy = lat - self.center_lat
        u = self.base_u - self.gyre_strength * dy
        v = self.base_v + self.gyre_strength * dx
        return np.array([u, v], dtype=float)


# Calibrated constants -- see calibrate_field.py for the fit. Committed
# here as the frozen values so results are reproducible without re-fitting
# every run.
KERALA_CURRENT = SyntheticField(
    base_u=-0.1430, base_v=0.0680, gyre_strength=0.01,
    center_lon=75.95, center_lat=9.4,
)
KERALA_WIND = SyntheticField(
    base_u=-0.01, base_v=0.005, gyre_strength=0.003,
    center_lon=75.95, center_lat=9.4,
)


def rk4_step(pos, t, dt_seconds, current_field, wind_field, leeway=0.03):
    def velocity(p, tt):
        v = np.zeros(2, dtype=float)
        if current_field is not None:
            v += current_field(p[0], p[1], tt)
        if wind_field is not None:
            v += leeway * wind_field(p[0], p[1], tt)
        return v

    deg_per_ms = 1e-5  # same synthetic unit conversion as the original notebook

    k1 = velocity(pos, t) * deg_per_ms
    k2 = velocity(pos + 0.5 * dt_seconds * k1, t + 0.5 * dt_seconds) * deg_per_ms
    k3 = velocity(pos + 0.5 * dt_seconds * k2, t + 0.5 * dt_seconds) * deg_per_ms
    k4 = velocity(pos + dt_seconds * k3, t + dt_seconds) * deg_per_ms

    return pos + (dt_seconds / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)


def forward_forecast(origin, t0, t_end, current_field, wind_field,
                      n_particles=150, dt_hours=1.0,
                      diffusion_std_deg_per_step=0.003, leeway=0.03,
                      rng=None, apply_land_mask=True):
    """Same as the notebook's forward_forecast, plus per-step land-mask
    beaching. origin/positions are (lon, lat) pairs, consistent with the
    notebook's convention.
    """
    if rng is None:
        rng = np.random.default_rng()

    dt_s = abs(dt_hours) * 3600
    n_steps = max(1, int(abs(t_end - t0) / dt_s))

    particles = np.tile(np.asarray(origin, dtype=float), (n_particles, 1))
    beached = np.zeros(n_particles, dtype=bool)
    t = t0

    for _ in range(n_steps):
        for i in range(n_particles):
            if apply_land_mask and beached[i]:
                continue  # frozen: oil already beached, don't keep integrating
            particles[i] = rk4_step(particles[i], t, dt_s, current_field, wind_field, leeway=leeway)

        particles[~beached] += rng.normal(
            loc=0.0, scale=diffusion_std_deg_per_step, size=(np.count_nonzero(~beached), 2)
        )

        if apply_land_mask:
            # particles array is (lon, lat); is_sea_array wants (lat, lon)
            sea = is_sea_array(particles[:, 1], particles[:, 0])
            newly_beached = (~sea) & (~beached)
            beached = beached | newly_beached

        t += dt_s

    return particles, beached


class DriftSurrogate:
    """Structurally identical to the notebook's DriftSurrogate, ranges
    recentered on the Kerala incident box instead of the open-ocean test
    coordinates."""

    def __init__(self, lon_range, lat_range, t0_range, grid_res_deg=0.05, t0_stride_hours=4.0):
        self.lon_grid = np.arange(lon_range[0], lon_range[1], grid_res_deg)
        self.lat_grid = np.arange(lat_range[0], lat_range[1], grid_res_deg)
        self.t0_grid = np.arange(t0_range[0], t0_range[1], t0_stride_hours * 3600)
        self.cache = {}

    def precompute(self, t_obs, current_field, wind_field, n_particles=100):
        count = 0
        base_seed = 12345
        for i, lon in enumerate(self.lon_grid):
            for j, lat in enumerate(self.lat_grid):
                for k, t0 in enumerate(self.t0_grid):
                    if t0 >= t_obs:
                        continue
                    origin = np.array([lon, lat])
                    rng = np.random.default_rng(base_seed + i * 1_000_000 + j * 1_000 + k)
                    particles, beached = forward_forecast(
                        origin, t0, t_obs, current_field, wind_field,
                        n_particles=n_particles, rng=rng
                    )
                    self.cache[(i, j, k)] = (particles, beached)
                    count += 1
        return count

    def query(self, actual_origin, actual_t0):
        i = int(np.argmin(np.abs(self.lon_grid - actual_origin[0])))
        j = int(np.argmin(np.abs(self.lat_grid - actual_origin[1])))
        k = int(np.argmin(np.abs(self.t0_grid - actual_t0)))
        key = (i, j, k)
        if key not in self.cache:
            return None
        grid_origin = np.array([self.lon_grid[i], self.lat_grid[j]])
        offset = np.asarray(actual_origin) - grid_origin
        particles, beached = self.cache[key]
        return particles + offset, np.linalg.norm(offset), beached


if __name__ == "__main__":
    # Reproduce the one real displacement we have ground truth for.
    origin = np.array([REAL_SINKING[1], REAL_SINKING[0]])  # (lon, lat)
    t_obs = REAL_ELAPSED_HOURS * 3600

    particles, beached = forward_forecast(
        origin, t0=0, t_end=t_obs,
        current_field=KERALA_CURRENT, wind_field=KERALA_WIND,
        n_particles=200, rng=np.random.default_rng(7),
    )
    centroid = particles[~beached].mean(axis=0)
    print(f"Real sinking point (lon,lat): {origin}")
    print(f"Real detection point (lon,lat): ({REAL_DETECTION[1]}, {REAL_DETECTION[0]})")
    print(f"Simulated centroid after {REAL_ELAPSED_HOURS}h (lon,lat): {centroid}")
    print(f"Beached particle fraction: {beached.mean():.2%}")
    err_deg = np.linalg.norm(centroid - np.array([REAL_DETECTION[1], REAL_DETECTION[0]]))
    print(f"Centroid error vs real detection point: {err_deg:.4f} deg (~{err_deg*111:.1f} km)")
