"""
detection_layer0.py -- wires the REAL Layer 0 pipeline (layer0_pkg/, from
the team's own repo) into the end-to-end run, instead of a hand-rolled
stand-in.

HONESTY NOTE (matches the team's own checklist):
  - The segmentation checkpoint has never been trained (no Zenodo data
    pulled), so we cannot run predict_full_image() on a real SAR image.
  - Instead we pass a precomputed synthetic class_mask + pixel_confidence
    directly into detect() -- which is an explicitly supported path in
    the real pipeline.py (see _segmentation(): "if 'class_mask' in
    metadata: ... skip predict_full_image"). This is not a workaround we
    invented; it's the pipeline's own documented escape hatch for
    exactly this situation.
  - Everything else -- polygonization (mask_to_polygons), physical area
    (physical_area_km2, real WGS84 geodesic area via pyproj), lookalike
    flagging (is_lookalike), and the damping-ratio texture extraction
    (damping_ratio_db) -- is the team's REAL, tested code, run for real,
    not reimplemented or mocked.
  - The one number we reverse-engineer is what SAR pixel values to put
    in the synthetic array so damping_ratio_db() comes out close to the
    weathering model's own predicted signature at ~72h. That's a choice
    of synthetic INPUT, not a fake OUTPUT -- the function that turns
    those pixels into a number is real and unmodified.
"""

import numpy as np
from rasterio.transform import Affine

from layer0_pkg.pipeline import detect
from layer0_pkg.schemas import validate_detection_output

from drift import REAL_DETECTION
from agelikelihood import predicted_texture_signature


def run_layer0(elapsed_hours_for_texture_calibration=72.0, oil_type="arabian_light",
               grid_size=120, mask_radius_px=22, noise_std_db=0.15, seed=0):
    """Returns the real DetectionOutput dict from layer0_pkg.pipeline.detect(),
    built from a synthetic mask centered on the real Sentinel-1 detection
    coordinates (9.5000N, 75.7667E).
    """
    rng = np.random.default_rng(seed)
    lat0, lon0 = REAL_DETECTION  # centroid of the synthetic footprint

    # Affine transform: grid_size x grid_size pixels covering roughly a
    # 0.12deg box (~13km) centered on the real detection point -- plausible
    # scale for a small-tanker slick a few km across.
    box_deg = 0.12
    px_size = box_deg / grid_size
    transform = Affine(px_size, 0, lon0 - box_deg / 2,
                        0, -px_size, lat0 + box_deg / 2)

    yy, xx = np.ogrid[:grid_size, :grid_size]
    cy, cx = grid_size // 2, grid_size // 2
    # slightly elongated blob (not a perfect circle) so polygonization has
    # real geometry to work with
    mask = ((yy - cy) ** 2 / (mask_radius_px * 1.4) ** 2
            + (xx - cx) ** 2 / (mask_radius_px * 0.8) ** 2) <= 1.0
    class_mask = mask.astype(np.uint8)  # 1 = oil, 0 = water, (2 = lookalike, unused here)

    # Calibrate synthetic SAR pixel values so the REAL damping_ratio_db()
    # function returns a value close to the weathering model's own
    # predicted signature at the stated elapsed time -- ties Layer 0's
    # output to Layer B's (age/weathering) physics instead of an arbitrary
    # number.
    target_signature = predicted_texture_signature(
        elapsed_hours_for_texture_calibration, {"oil_type": oil_type}
    )
    background_db = 12.0
    oil_db = background_db - target_signature
    sar_db = np.full((grid_size, grid_size), background_db, dtype=np.float32)
    sar_db[mask] = oil_db
    sar_db += rng.normal(0, noise_std_db, size=sar_db.shape).astype(np.float32)

    confidence = np.full((grid_size, grid_size), 0.3, dtype=np.float32)
    confidence[mask] = 0.82  # plausible but not overstated, since checkpoint is untrained

    output = detect(
        sar_db,
        {"transform": transform, "class_mask": class_mask, "pixel_confidence": confidence},
        "2025-05-28T00:00:00+00:00",  # real Sentinel-1 detection date
    )
    validate_detection_output(output)
    return output


if __name__ == "__main__":
    out = run_layer0()
    print("Detection centroid (lon,lat):", out["centroid_latlon"])
    print("Physical area (km^2):", round(out["physical_area_km2"], 3))
    print("Observed texture signature (dB):", round(out["observed_texture_signature_db"], 3))
    print("Is lookalike:", out["is_lookalike"])
    print("Detection confidence:", round(out["confidence"], 3))
    print("Polygon vertex count:", len(out["polygon_latlon"]))
