from __future__ import annotations

from pathlib import Path

import numpy as np


def combined_cross_entropy_dice_loss(logits, targets):
    """Return CE + soft Dice loss, preserving the oil minority signal."""
    import torch
    import torch.nn.functional as functional

    cross_entropy = functional.cross_entropy(logits, targets)
    probabilities = torch.softmax(logits, dim=1)
    one_hot = functional.one_hot(targets, num_classes=logits.shape[1]).permute(0, 3, 1, 2)
    intersection = (probabilities * one_hot).sum(dim=(0, 2, 3))
    denominator = probabilities.sum(dim=(0, 2, 3)) + one_hot.sum(dim=(0, 2, 3))
    dice_loss = 1.0 - ((2.0 * intersection + 1e-6) / (denominator + 1e-6)).mean()
    return cross_entropy + dice_loss


def per_class_iou(predictions, targets, classes: int = 3) -> list[float]:
    """Calculate IoU for every class, including absent-class as NaN."""
    values = []
    for class_index in range(classes):
        predicted = predictions == class_index
        target = targets == class_index
        union = np.logical_or(predicted, target).sum()
        values.append(
            float(np.logical_and(predicted, target).sum() / union) if union else float("nan")
        )
    return values


def train(
    train_dataset,
    validation_dataset,
    *,
    in_channels: int = 2,
    epochs: int = 20,
    batch_size: int = 4,
    learning_rate: float = 1e-4,
    checkpoint_path: str | Path = "checkpoints/best.pt",
):
    """Train Unet and save the checkpoint with the best validation oil IoU."""
    import torch
    from torch.utils.data import DataLoader

    from .model import build_model

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(in_channels).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    validation_loader = DataLoader(validation_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    best_oil_iou = -float("inf")
    checkpoint_path = Path(checkpoint_path)
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    history = []
    for epoch in range(epochs):
        model.train()
        for images, targets in train_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = combined_cross_entropy_dice_loss(model(images.to(device)), targets.to(device))
            loss.backward()
            optimizer.step()
        metrics = evaluate(model, validation_loader, device)
        metrics["epoch"] = epoch + 1
        history.append(metrics)
        if metrics["iou"][1] > best_oil_iou:
            best_oil_iou = metrics["iou"][1]
            torch.save({"model": model.state_dict(), "metrics": metrics}, checkpoint_path)
    return history


def evaluate(model, loader, device=None) -> dict[str, object]:
    import torch

    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.eval()
    predicted_batches, target_batches = [], []
    with torch.no_grad():
        for images, targets in loader:
            logits = model(images.to(device))
            predicted_batches.append(logits.argmax(dim=1).cpu().numpy())
            target_batches.append(targets.numpy())
    predictions = np.concatenate(predicted_batches)
    targets = np.concatenate(target_batches)
    iou = per_class_iou(predictions, targets)
    return {"iou": iou, "mean_iou": float(np.nanmean(iou))}
