from __future__ import annotations

import numpy as np


def is_lookalike(class_mask: np.ndarray, region: np.ndarray) -> bool:
    class_mask = np.asarray(class_mask)
    region = np.asarray(region, dtype=bool)
    if class_mask.shape != region.shape:
        raise ValueError("class_mask and region must have the same shape")
    return bool(np.any(class_mask[region] == 2))
