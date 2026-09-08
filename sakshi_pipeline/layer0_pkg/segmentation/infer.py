from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from .model import build_model


def predict_full_image(
    image: np.ndarray,
    checkpoint: str | os.PathLike[str],
    *,
    tile_size: int = 256,
) -> tuple[np.ndarray, np.ndarray]:
    """Run the trained 3-class model over an image and stitch tile predictions."""
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for segmentation inference") from exc
    image = np.asarray(image)
    if image.ndim == 2:
        image = image[None, ...]
    if image.ndim != 3:
        raise ValueError("image must have shape (H, W) or (C, H, W)")
    channels, height, width = image.shape
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(channels)
    state = torch.load(Path(checkpoint), map_location=device, weights_only=True)
    model.load_state_dict(state.get("model", state))
    model.to(device).eval()
    class_mask = np.zeros((height, width), dtype=np.uint8)
    pixel_confidence = np.zeros((height, width), dtype=np.float32)
    with torch.no_grad():
        for row in range(0, height, tile_size):
            for col in range(0, width, tile_size):
                tile = image[:, row : row + tile_size, col : col + tile_size]
                tile_height, tile_width = tile.shape[1:]
                tensor = torch.from_numpy(tile.astype(np.float32))[None].to(device)
                probabilities = torch.softmax(model(tensor), dim=1)[0]
                predicted = probabilities.argmax(dim=0)
                confidence = probabilities.max(dim=0).values
                class_mask[row : row + tile_height, col : col + tile_width] = (
                    predicted.cpu().numpy().astype(np.uint8)
                )
                pixel_confidence[row : row + tile_height, col : col + tile_width] = (
                    confidence.cpu().numpy().astype(np.float32)
                )
    return class_mask, pixel_confidence
