"""Split original matches before any masking or augmentation."""
import hashlib
import json
import random
from pathlib import Path
import torch
from torch.utils.data import Dataset
from app.ml.model import NUM_CHAMPIONS

FIELDS = [f"{side}_{role}" for side in ("blue", "red") for role in ("top", "jg", "mid", "bot", "sup")]


def load_splits(path, patch=None):
    originals = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        row = json.loads(line)
        if patch and row.get("patch") != patch: continue
        champions = [row.get(k, 0) for k in FIELDS]
        if any(not isinstance(c, int) or not 0 < c < NUM_CHAMPIONS for c in champions): continue
        if len(set(champions)) != 10 or row.get("blue_win") not in (0, 1, False, True): continue
        canonical = json.dumps([champions, int(row["blue_win"]), row.get("patch")])
        identity = str(row.get("match_id") or hashlib.sha256(canonical.encode()).hexdigest())
        if identity in originals and originals[identity]["canonical"] != canonical:
            raise ValueError(f"Conflicting duplicate match: {identity}")
        originals[identity] = {**row, "identity": identity, "canonical": canonical}
    rows = sorted(originals.values(), key=lambda r: (r.get("game_creation", 0), r["identity"]))
    # Older collectors have no timestamps. State that limitation in model metadata.
    chronological = bool(rows) and all(r.get("game_creation") for r in rows)
    if not chronological:
        random.Random(42).shuffle(rows)
    n = len(rows)
    boundaries = [0, int(n * .7), int(n * .8), int(n * .9), n]
    splits = {name: rows[a:b] for name, a, b in zip(("train", "validation", "calibration", "test"), boundaries, boundaries[1:])}
    fingerprint = hashlib.sha256("\n".join(sorted(r["identity"] + r["canonical"] for r in rows)).encode()).hexdigest()
    return splits, {"unique_matches": n, "dataset_sha256": fingerprint, "chronological": chronological,
                    "patches": sorted({r.get("patch", "unknown") for r in rows}),
                    "split_ids": {name: [r["identity"] for r in part] for name, part in splits.items()}}


class PartialDraftDataset(Dataset):
    def __init__(self, rows, training=False):
        self.rows = rows
        self.training = training

    def __len__(self):
        return len(self.rows) if self.training else len(self.rows) * 4

    def __getitem__(self, index):
        row = self.rows[index if self.training else index // 4]
        champs = torch.tensor([row[k] for k in FIELDS], dtype=torch.long)
        if self.training:
            known = int(torch.randint(4, 11, ()).item())
            order = torch.randperm(10)
        else:
            known = (4, 6, 8, 10)[index % 4]
            seed = int(hashlib.sha256(row["identity"].encode()).hexdigest()[:8], 16)
            order = torch.randperm(10, generator=torch.Generator().manual_seed(seed))
        champs[order[known:]] = 0
        return champs[:5], champs[5:], torch.tensor(float(row["blue_win"]))
