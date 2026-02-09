#!/usr/bin/env python3
"""DALIA ML — Training script for the draft prediction model.

Usage:
    cd backend
    python -m app.ml.train [--data app/data/matches/matches.jsonl] [--epochs 50]

Outputs:
    app/data/models/draft_model.pt          — trained model weights
    app/data/models/training_stats.json     — accuracy, loss history
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Dict

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from app.ml.model import DraftDataset, DraftNet

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("dalia.ml.train")


def train_epoch(model, loader, criterion, optimizer, device) -> Dict[str, float]:
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for blue, red, labels in loader:
        blue = blue.to(device)
        red = red.to(device)
        labels = labels.to(device).unsqueeze(1)

        optimizer.zero_grad()
        logits = model(blue, red)
        loss = criterion(logits, labels)
        loss.backward()

        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        total_loss += loss.item() * blue.size(0)
        preds = (torch.sigmoid(logits) >= 0.5).float()
        correct += (preds == labels).sum().item()
        total += blue.size(0)

    return {
        "loss": total_loss / max(total, 1),
        "accuracy": correct / max(total, 1),
    }


def eval_epoch(model, loader, criterion, device) -> Dict[str, float]:
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for blue, red, labels in loader:
            blue = blue.to(device)
            red = red.to(device)
            labels = labels.to(device).unsqueeze(1)

            logits = model(blue, red)
            loss = criterion(logits, labels)

            total_loss += loss.item() * blue.size(0)
            preds = (torch.sigmoid(logits) >= 0.5).float()
            correct += (preds == labels).sum().item()
            total += blue.size(0)

    return {
        "loss": total_loss / max(total, 1),
        "accuracy": correct / max(total, 1),
    }


def main():
    parser = argparse.ArgumentParser(description="Train DALIA draft prediction model")
    parser.add_argument(
        "--data",
        default=str(Path(__file__).resolve().parent.parent / "data" / "matches" / "matches.jsonl"),
        help="Path to matches JSONL file",
    )
    parser.add_argument("--epochs", type=int, default=60, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=256, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--embed-dim", type=int, default=32, help="Champion embedding dimension")
    parser.add_argument("--hidden-dim", type=int, default=256, help="MLP hidden layer size")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent.parent / "data" / "models"),
        help="Output directory for model",
    )
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── Device ──
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Using device: %s", device)

    # ── Load data ──
    logger.info("Loading data from %s", args.data)
    dataset = DraftDataset(args.data, augment=True)
    logger.info("Dataset size: %d samples (with augmentation)", len(dataset))

    if len(dataset) < 200:
        logger.error("Not enough data to train! Need at least 100 matches.")
        sys.exit(1)

    # ── Train / val split (85% / 15%) ──
    val_size = int(len(dataset) * 0.15)
    train_size = len(dataset) - val_size
    train_set, val_set = random_split(
        dataset, [train_size, val_size],
        generator=torch.Generator().manual_seed(42),
    )

    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_set, batch_size=args.batch_size, shuffle=False, num_workers=0)

    logger.info("Train: %d samples | Val: %d samples", train_size, val_size)

    # ── Model ──
    model = DraftNet(
        embed_dim=args.embed_dim,
        hidden_dim=args.hidden_dim,
        dropout=0.3,
    ).to(device)

    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logger.info("Model parameters: %d (%.1fK)", param_count, param_count / 1000)

    # ── Training ──
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    best_val_acc = 0.0
    best_epoch = 0
    history = {"train_loss": [], "val_loss": [], "train_acc": [], "val_acc": []}

    logger.info("=== Training for %d epochs ===", args.epochs)
    start_time = time.time()

    for epoch in range(1, args.epochs + 1):
        train_stats = train_epoch(model, train_loader, criterion, optimizer, device)
        val_stats = eval_epoch(model, val_loader, criterion, device)
        scheduler.step()

        history["train_loss"].append(round(train_stats["loss"], 4))
        history["val_loss"].append(round(val_stats["loss"], 4))
        history["train_acc"].append(round(train_stats["accuracy"], 4))
        history["val_acc"].append(round(val_stats["accuracy"], 4))

        is_best = val_stats["accuracy"] > best_val_acc
        if is_best:
            best_val_acc = val_stats["accuracy"]
            best_epoch = epoch
            torch.save({
                "model_state": model.state_dict(),
                "embed_dim": args.embed_dim,
                "hidden_dim": args.hidden_dim,
                "epoch": epoch,
                "val_accuracy": best_val_acc,
            }, output_dir / "draft_model.pt")

        if epoch % 5 == 0 or epoch == 1 or is_best:
            marker = " ★" if is_best else ""
            logger.info(
                "Epoch %3d/%d  train_loss=%.4f  val_loss=%.4f  "
                "train_acc=%.3f  val_acc=%.3f  lr=%.2e%s",
                epoch, args.epochs,
                train_stats["loss"], val_stats["loss"],
                train_stats["accuracy"], val_stats["accuracy"],
                optimizer.param_groups[0]["lr"],
                marker,
            )

    elapsed = time.time() - start_time
    logger.info("=== Training complete in %.1fs ===", elapsed)
    logger.info("Best val accuracy: %.3f at epoch %d", best_val_acc, best_epoch)

    # ── Save stats ──
    stats = {
        "best_val_accuracy": round(best_val_acc, 4),
        "best_epoch": best_epoch,
        "total_epochs": args.epochs,
        "train_samples": train_size,
        "val_samples": val_size,
        "embed_dim": args.embed_dim,
        "hidden_dim": args.hidden_dim,
        "training_time_seconds": round(elapsed, 1),
        "history": history,
    }
    with open(output_dir / "training_stats.json", "w") as f:
        json.dump(stats, f, indent=2)

    logger.info("Model saved to %s/draft_model.pt", output_dir)

    # ── Quick sanity check ──
    ckpt = torch.load(output_dir / "draft_model.pt", map_location="cpu", weights_only=True)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    logger.info("Sanity check — predicting a random game:")
    sample_blue, sample_red, sample_label = dataset[0]
    with torch.no_grad():
        logit = model(sample_blue.unsqueeze(0), sample_red.unsqueeze(0))
        prob = torch.sigmoid(logit).item()
    logger.info("  Blue team: %s", sample_blue.tolist())
    logger.info("  Red team:  %s", sample_red.tolist())
    logger.info("  P(blue wins): %.3f  |  Actual: %d", prob, int(sample_label.item()))


if __name__ == "__main__":
    main()
