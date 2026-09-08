from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class TileRecord:
    image_path: Path
    mask_path: Path
    parent_image: str
    row_offset: int
    col_offset: int
    foreground_class: int


def build_tile_records(
    image_dir: str | Path,
    mask_dir: str | Path,
    *,
    foreground_class: int,
    tile_size: int = 256,
) -> list[TileRecord]:
    """Pair TIFFs by stem and create source-aware tile records."""
    image_dir = Path(image_dir)
    mask_dir = Path(mask_dir)
    masks = {path.stem: path for path in mask_dir.rglob("*.tif")}
    records: list[TileRecord] = []
    for image_path in sorted(image_dir.rglob("*.tif")):
        mask_path = masks.get(image_path.stem)
        if mask_path is None:
            raise FileNotFoundError(f"No mask matched image {image_path.name}")
        import rasterio

        with rasterio.open(image_path) as dataset:
            height, width = dataset.height, dataset.width
        for row_offset in range(0, height, tile_size):
            for col_offset in range(0, width, tile_size):
                records.append(
                    TileRecord(
                        image_path=image_path,
                        mask_path=mask_path,
                        parent_image=image_path.resolve().as_posix(),
                        row_offset=row_offset,
                        col_offset=col_offset,
                        foreground_class=foreground_class,
                    )
                )
    return records


def inspect_raster(path: str | Path) -> dict[str, object]:
    """Inspect actual shape, dtype, ranges, channels, and labels before training."""
    import rasterio

    with rasterio.open(path) as dataset:
        values = dataset.read()
        return {
            "shape": tuple(values.shape),
            "dtype": str(values.dtype),
            "min": float(np.nanmin(values)),
            "max": float(np.nanmax(values)),
            "unique": np.unique(values).tolist()[:32],
            "count": int(dataset.count),
            "transform": dataset.transform,
            "crs": str(dataset.crs),
        }


def load_tile(record: TileRecord, tile_size: int = 256) -> tuple[np.ndarray, np.ndarray]:
    import rasterio

    window = rasterio.windows.Window(
        record.col_offset, record.row_offset, tile_size, tile_size
    )
    with rasterio.open(record.image_path) as image_dataset:
        image = image_dataset.read(window=window, boundless=True, fill_value=0)
    with rasterio.open(record.mask_path) as mask_dataset:
        mask = mask_dataset.read(1, window=window, boundless=True, fill_value=0)
    class_mask = np.zeros(mask.shape, dtype=np.int64)
    if record.foreground_class:
        class_mask[mask > 0] = record.foreground_class
    return image.astype(np.float32), class_mask


class SarTileDataset:
    """Torch Dataset wrapper kept importable even when torch is not installed."""

    def __init__(self, records: list[TileRecord], tile_size: int = 256, augment: bool = False):
        self.records = records
        self.tile_size = tile_size
        self.augment = augment

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int):
        import torch

        image, mask = load_tile(self.records[index], self.tile_size)
        if self.augment:
            if np.random.rand() < 0.5:
                image, mask = image[:, :, ::-1], mask[:, ::-1]
            if np.random.rand() < 0.5:
                image, mask = image[:, ::-1, :], mask[::-1, :]
            rotation = int(np.random.randint(0, 4))
            image = np.rot90(image, rotation, axes=(1, 2)).copy()
            mask = np.rot90(mask, rotation, axes=(0, 1)).copy()
        return torch.from_numpy(image), torch.from_numpy(mask)


def validate_source_level_splits(splits: dict[str, list[TileRecord]]) -> None:
    """Ensure no parent source image leaks across train/validation/test splits."""
    owners: dict[str, str] = {}
    for split, records in splits.items():
        for record in records:
            previous_split = owners.setdefault(record.parent_image, split)
            if previous_split != split:
                raise ValueError(
                    f"Parent image {record.parent_image!r} appears in both "
                    f"{previous_split} and {split} splits"
                )
