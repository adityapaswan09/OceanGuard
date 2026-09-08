from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_dilation


def damping_ratio_db(
    sar_db: np.ndarray,
    oil_mask: np.ndarray,
    ring_width_px: int = 15,
) -> float:
    sar_db = np.asarray(sar_db, dtype=float)
    oil_mask = np.asarray(oil_mask, dtype=bool)
    if sar_db.shape != oil_mask.shape:
        raise ValueError("sar_db and oil_mask must have the same shape")
    if not oil_mask.any():
        raise ValueError("oil_mask must contain at least one pixel")
    if ring_width_px < 1:
        raise ValueError("ring_width_px must be positive")
    ring = binary_dilation(oil_mask, iterations=ring_width_px) & ~oil_mask
    if not ring.any():
        raise ValueError("oil mask does not have any surrounding ring pixels")
    return float(sar_db[ring].mean() - sar_db[oil_mask].mean())
