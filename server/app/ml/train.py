"""Train, calibrate and evaluate a candidate without replacing the active model.

python -m app.ml.train --data app/data/matches/matches.jsonl --patch 16.17
"""
import argparse
from collections import Counter
import copy
import json
import logging
import math
import os
from pathlib import Path
import time
import subprocess
from datetime import datetime, timezone
import torch
from torch.utils.data import DataLoader
from app.ml.model import DraftNet
from app.ml.training_data import FIELDS, PartialDraftDataset, load_splits
from app.services.storage import write_json

log = logging.getLogger("dalia.train")


def logits_for(model, loader, device):
    logits, labels = [], []
    model.eval()
    with torch.no_grad():
        for blue, red, y in loader:
            logits.append(model(blue.to(device), red.to(device)).flatten().cpu())
            labels.append(y)
    return torch.cat(logits), torch.cat(labels)


def metrics(logits, labels, temperature=1.):
    probabilities = torch.sigmoid(logits / temperature)
    loss = torch.nn.functional.binary_cross_entropy_with_logits(logits / temperature, labels).item()
    brier = ((probabilities - labels) ** 2).mean().item()
    ece = 0.
    for i in range(10):
        mask = (probabilities >= i / 10) & (probabilities < (i + 1) / 10 if i < 9 else probabilities <= 1)
        if mask.any():
            ece += mask.float().mean().item() * abs(probabilities[mask].mean().item() - labels[mask].mean().item())
    return {"log_loss": loss, "brier": brier, "ece": ece,
            "accuracy": ((probabilities >= .5) == labels.bool()).float().mean().item()}


def calibrate(logits, labels):
    # Calibrate on a separate partition, never the held-out acceptance test.
    temperatures = torch.logspace(math.log10(.5), math.log10(10), 81).tolist()
    return min(temperatures, key=lambda t: metrics(logits, labels, t)["log_loss"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(Path(__file__).resolve().parents[1] / "data/matches/matches.jsonl"))
    parser.add_argument("--output", default=str(Path(__file__).resolve().parents[1] / "data/models"))
    parser.add_argument("--patch")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--embed-dim", type=int, default=32)
    parser.add_argument("--hidden-dim", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()
    if args.epochs < 1: parser.error("epochs must be positive")
    logging.basicConfig(level=logging.INFO)
    torch.manual_seed(42)
    started = time.time()
    splits, metadata = load_splits(args.data, args.patch)
    if metadata["unique_matches"] < 200:
        raise ValueError("At least 200 unique matches for the requested patch are needed to train a candidate.")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    loaders = {name: DataLoader(PartialDraftDataset(rows, name == "train"), batch_size=args.batch_size,
                               shuffle=name == "train") for name, rows in splits.items()}
    model = DraftNet(embed_dim=args.embed_dim, hidden_dim=args.hidden_dim).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    best_loss = math.inf
    best_state = None
    best_epoch = 0
    history = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        for blue, red, labels in loaders["train"]:
            optimizer.zero_grad()
            logits = model(blue.to(device), red.to(device)).flatten()
            loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, labels.to(device))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
        val_logits, val_labels = logits_for(model, loaders["validation"], device)
        val = metrics(val_logits, val_labels)
        history.append({"epoch": epoch, **val})
        if val["log_loss"] < best_loss:
            best_loss, best_epoch = val["log_loss"], epoch
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        log.info("Epoch %d validation log loss %.4f", epoch, val["log_loss"])
    model.load_state_dict(best_state)
    cal_logits, cal_labels = logits_for(model, loaders["calibration"], device)
    temperature = calibrate(cal_logits, cal_labels)
    test_logits, test_labels = logits_for(model, loaders["test"], device)
    test = metrics(test_logits, test_labels, temperature)
    by_completion = {str(known): metrics(test_logits[i::4], test_labels[i::4], temperature)
                     for i, known in enumerate((4, 6, 8, 10))}
    # Baseline side prior learned only from training originals.
    prior = sum(float(r["blue_win"]) for r in splits["train"]) / len(splits["train"])
    baseline_brier = ((test_labels - prior) ** 2).mean().item()
    baseline_log_loss = torch.nn.functional.binary_cross_entropy(torch.full_like(test_labels, prior), test_labels).item()
    accepted = (len(splits["test"]) >= 200 and metadata["chronological"] and
                test["brier"] < baseline_brier and test["log_loss"] < baseline_log_loss and test["ece"] <= .08 and
                all(by_completion[str(n)]["brier"] < baseline_brier and
                    by_completion[str(n)]["log_loss"] < baseline_log_loss for n in (6, 8, 10)))
    counts = Counter(cid for row in splits["train"] for cid in (row[k] for k in FIELDS))
    revision = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=False).stdout.strip() or "unknown"
    report = {"trained_at": datetime.now(timezone.utc).isoformat(), "code_revision": revision, "schema_version": 2, "accepted": accepted, "supports_partial_drafts": True,
              "temperature": temperature, "test_metrics": test, "metrics_by_known_champions": by_completion, "baseline_brier": baseline_brier,
              "baseline_log_loss": baseline_log_loss, "test_unique_matches": len(splits["test"]),
              "best_epoch": best_epoch, "best_val_accuracy": history[best_epoch - 1]["accuracy"],
              "training_time_seconds": round(time.time() - started, 1), "history": history,
              **{k: v for k, v in metadata.items() if k != "split_ids"}}
    out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    checkpoint = {**report, "model_state": best_state, "embed_dim": args.embed_dim,
                  "hidden_dim": args.hidden_dim, "epoch": best_epoch,
                  "champion_game_counts": dict(counts), "training_games": len(splits["train"])}
    temp = out / "draft_model.candidate.tmp"
    torch.save(checkpoint, temp)
    os.replace(temp, out / "draft_model.candidate.pt")
    write_json(out / "training_stats.json", report)
    write_json(out / "split_manifest.json", metadata["split_ids"])
    log.info("Candidate saved. Acceptance gate: %s. Active model unchanged.", accepted)


if __name__ == "__main__":
    main()
