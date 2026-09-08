from __future__ import annotations


def build_model(in_channels: int = 1):
    """Build the required Unet; dependency loading stays lazy for geometry-only use."""
    try:
        import segmentation_models_pytorch as smp
    except ImportError as exc:
        raise RuntimeError(
            "segmentation-models-pytorch is required to build the segmentation model"
        ) from exc
    return smp.Unet(
        encoder_name="resnet34",
        encoder_weights="imagenet",
        in_channels=in_channels,
        classes=3,
    )
