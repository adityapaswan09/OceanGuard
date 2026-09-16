"""
export_regional_land_mask.py -- Extracts the regional GSHHG land/sea grid from
sakshi_pipeline/land_mask.py (global-land-mask) and exports an RLE-encoded
regional mask to the frontend for offline, zero-dependency segment clipping.
"""

import json
from pathlib import Path
from global_land_mask import globe
import numpy as np

# Generous bounding box covering Arabian Sea, Indian peninsula, Sri Lanka, Lakshadweep
LAT_MIN = 4.0
LAT_MAX = 18.0
LON_MIN = 68.0
LON_MAX = 85.0

# Slice corresponding to Lat 4.0 to 18.0 and Lon 68.0 to 85.0
# globe._mask resolution is 1/120 degree per pixel (21600 rows x 43200 cols)
# row 8640 corresponds to 18.0 deg N, row 10320 corresponds to 4.0 deg N (1680 rows)
# col 29760 corresponds to 68.0 deg E, col 31800 corresponds to 85.0 deg E (2040 cols)
ROW_MIN = 8640
ROW_MAX = 10320
COL_MIN = 29760
COL_MAX = 31800

# 1 = land, 0 = sea (globe._mask is True for ocean, False for land)
submask = (~globe._mask[ROW_MIN:ROW_MAX, COL_MIN:COL_MAX]).astype(np.uint8)
H, W = submask.shape
flat = submask.flatten()

# Run-Length Encoding
runs = []
curr = int(flat[0])
count = 1
for val in flat[1:]:
    val_int = int(val)
    if val_int == curr:
        count += 1
    else:
        runs.append(count)
        curr = val_int
        count = 1
runs.append(count)

output_data = {
    "source": "GSHHG-derived global-land-mask (offline 30-arc-second / 0.5-arc-minute)",
    "bounds": {
        "latMin": LAT_MIN,
        "latMax": LAT_MAX,
        "lonMin": LON_MIN,
        "lonMax": LON_MAX,
        "stepDeg": 1.0 / 120.0,
    },
    "dimensions": {
        "rows": H,
        "cols": W,
        "totalPixels": len(flat),
    },
    "startValue": int(flat[0]),
    "runs": runs,
}

frontend_data_dir = Path(__file__).resolve().parents[1] / "frontend" / "src" / "data"
frontend_data_dir.mkdir(parents=True, exist_ok=True)
target_path = frontend_data_dir / "regionalLandMask.json"

with open(target_path, "w", encoding="utf-8") as f:
    json.dump(output_data, f, separators=(",", ":"))

print(f"Exported regional GSHHG land mask to {target_path}")
print(f"Grid dimensions: {H}x{W} ({len(flat)} pixels)")
print(f"RLE run count: {len(runs)} (file size: {target_path.stat().st_size / 1024:.1f} KB)")
