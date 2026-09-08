"""
footprint.py -- L_shape(h): IoU between a hypothesis's drift-predicted
footprint and the observed (detected) footprint.

IMPORTANT HONESTY NOTE (per the team's own checklist):
The real detection/segmentation checkpoint has never been trained (Zenodo
data not pulled, no real-image accuracy number exists). So "observed
footprint" here is NOT a real SAR-derived polygon -- it's a synthetic
ellipse around the real detection centroid (9.5000N, 75.7667E), sized to a
plausible small-tanker slick and oriented along the real drift bearing.
This lets L_shape(h) be computed and demonstrated end-to-end today, but it
is a stand-in for Layer 0's output, not Layer 0 itself. Swap in a real
polygon the moment the detection checkpoint exists -- nothing else in this
file needs to change to accept one.
"""

import numpy as np
from shapely.geometry import Point
from shapely.affinity import scale, rotate
from shapely.ops import unary_union


def make_observed_footprint(center_lat, center_lon, major_axis_deg=0.09,
                             minor_axis_deg=0.035, bearing_deg=110):
    """Synthetic ellipse standing in for the detection layer's segmented
    polygon. bearing_deg is the compass bearing the slick is elongated
    along (roughly the drift direction)."""
    center = Point(center_lon, center_lat)
    circle = center.buffer(1.0, resolution=64)
    ellipse = scale(circle, xfact=major_axis_deg, yfact=minor_axis_deg)
    # shapely rotate() angle is counter-clockwise from x-axis (east);
    # convert a compass bearing to that convention.
    angle = 90 - bearing_deg
    ellipse = rotate(ellipse, angle, origin=center)
    return ellipse


def particle_cloud_footprint(particles_lonlat, beached_mask=None, buffer_deg=0.01):
    """Builds a polygon from a particle cloud (at-sea particles only) via
    convex hull + small buffer, standing in for a density-based footprint
    extraction. particles_lonlat: (n,2) array of [lon, lat]."""
    if beached_mask is not None:
        pts = particles_lonlat[~beached_mask]
    else:
        pts = particles_lonlat
    if len(pts) < 3:
        return None
    from shapely.geometry import MultiPoint
    hull = MultiPoint(pts).convex_hull
    return hull.buffer(buffer_deg)


def iou(poly_a, poly_b):
    if poly_a is None or poly_b is None or poly_a.is_empty or poly_b.is_empty:
        return 0.0
    inter = poly_a.intersection(poly_b).area
    union = unary_union([poly_a, poly_b]).area
    if union == 0:
        return 0.0
    return inter / union


if __name__ == "__main__":
    from drift import REAL_DETECTION, REAL_SINKING, forward_forecast, KERALA_CURRENT, KERALA_WIND

    observed = make_observed_footprint(REAL_DETECTION[0], REAL_DETECTION[1])
    print("Observed footprint area (deg^2):", observed.area)

    origin = np.array([REAL_SINKING[1], REAL_SINKING[0]])
    particles, beached = forward_forecast(
        origin, t0=0, t_end=72 * 3600, current_field=KERALA_CURRENT,
        wind_field=KERALA_WIND, n_particles=200, rng=np.random.default_rng(7),
    )
    predicted = particle_cloud_footprint(particles, beached)
    print("Predicted footprint area (deg^2):", predicted.area)
    print("IoU (true origin/t0 vs observed):", iou(observed, predicted))
