#!/usr/bin/env python
"""Note teamfight mesurée sur les parties pros (chantier 14, spec §5).

Participation aux kills par champion et par poste, relative à la moyenne du
poste, rétrécie par le nombre de parties, convertie en quintiles À L'INTÉRIEUR
du poste. Mesure la présence dans les combats, pas l'impact (spec §5.3).

Usage (depuis server/) :
  python scripts/pro_teamfight.py            # affiche les notes, n'écrit rien
  python scripts/pro_teamfight.py --write    # remplace teamfight dans les overrides
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.scoring.shrink import shrink  # noqa: E402

STATS_PATH = Path(__file__).resolve().parent.parent / "app" / "data" / "pro_player_stats.json"


def kill_participation(row: dict) -> float:
    team = row.get("team_kills") or 0
    return (row["kills"] + row["assists"]) / team if team > 0 else 0.0


def teamfight_ratings(rows: List[dict], primary_role: Dict[str, str], k: int = 20, min_games: int = 5) -> Dict[str, int]:
    by_role: Dict[str, List[float]] = defaultdict(list)
    by_champ: Dict[tuple, List[float]] = defaultdict(list)
    for r in rows:
        kp = kill_participation(r)
        by_role[r["role"]].append(kp)
        by_champ[(r["champion"], r["role"])].append(kp)
    role_mean = {role: mean(v) for role, v in by_role.items()}
    scores: Dict[str, Dict[str, float]] = defaultdict(dict)
    for (champ, role), kps in by_champ.items():
        if primary_role.get(champ) != role or len(kps) < min_games:
            continue
        scores[role][champ] = shrink(mean(kps) - role_mean[role], len(kps), k)
    ratings: Dict[str, int] = {}
    for role, champs in scores.items():
        ordered = sorted(champs, key=lambda c: champs[c])
        for rank, champ in enumerate(ordered):
            ratings[champ] = 1 + min(4, rank * 5 // len(ordered))
    return ratings


def main() -> int:
    import derive_ratings
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    rows = json.loads(STATS_PATH.read_text(encoding="utf-8"))["rows"]
    overrides = json.loads(derive_ratings.OVERRIDES.read_text(encoding="utf-8"))
    primary = {k: v["roles"][0] for k, v in overrides.items() if isinstance(v, dict) and v.get("roles")}
    ratings = teamfight_ratings(rows, primary)
    print(f"{len(ratings)} champions notés depuis {len(rows)} lignes pros ; "
          f"{len(primary) - len(ratings)} en repli sur les règles")
    for role in ("top", "jungle", "mid", "bot", "support"):
        champs = sorted((c for c in ratings if primary.get(c) == role), key=lambda c: -ratings[c])
        print(f"{role:8} " + ", ".join(f"{c}={ratings[c]}" for c in champs))
    if args.write:
        OV = derive_ratings.OVERRIDES
        OV.write_bytes(derive_ratings.dump_overrides(derive_ratings.apply_teamfight(overrides, ratings)).encode("utf-8"))
        print(f"Écrit : {OV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
