#!/usr/bin/env python
"""Mesure le scaling de chaque champion sur ses postes, depuis Lolalytics.

Définition du joueur (26/09/2026) : un champion scale s'il gagne nettement plus
dans les parties longues que dans les courtes. Lolalytics publie, par champion et
par poste, le graphique « Win Rate vs Game Length » en sept tranches de durée,
dans l'état Qwik de la page (aucune API documentée ne l'expose).

    scaling = WR des parties longues (tranches 5-7) − WR des parties courtes (2-3)

La tranche 1 (remakes, abandons précoces) et la tranche 4 (milieu) sont écartées.
La mesure est relative : dans chaque tranche, le win rate moyen du poste vaut
50 %. Un champion fort partout (Jinx) sort plat même s'il est plus fort en fin
de partie dans l'absolu ; c'est l'avance prise sur les autres qui est mesurée.

Master+, fenêtre de 30 jours (9 fois plus de parties que le patch seul). Le
rétrécissement par le nombre de parties est fait à la lecture, pas ici.

Usage (depuis server/) :
  python scripts/refresh_scaling.py            # collecte, affiche, n'écrit rien
  python scripts/refresh_scaling.py --write    # écrit app/data/scaling.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from typing import Dict, List, Tuple

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "app" / "data"
OVERRIDES = DATA / "champion_overrides.json"
OUT = DATA / "scaling.json"
PAGE = "https://lolalytics.com/lol/{slug}/build/"
LANES = {"top": "top", "jungle": "jungle", "mid": "middle", "bot": "bottom", "support": "support"}
TIER, WINDOW = "master_plus", "30"
EARLY, LATE = (1, 2), (4, 5, 6)      # indices des tranches (0-6)
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
DELAY = 1.5

Curve = List[Tuple[int, int]]


def parse_curve(html: str) -> Curve:
    """(parties, victoires) par tranche de durée, lus dans l'état Qwik de la page."""
    m = re.search(r'<script type="qwik/json">(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("état Qwik absent de la page")
    objs = json.loads(m.group(1)).get("objs", [])

    def get(ref):
        if isinstance(ref, str) and re.fullmatch(r"[0-9a-z]+", ref):
            return objs[int(ref, 36)]
        return ref

    holder = next((o for o in objs if isinstance(o, dict) and set(o) == {"time", "timeWin"}), None)
    if holder is None:
        raise ValueError("courbe « Win Rate vs Game Length » absente de la page")
    games, wins = get(holder["time"]), get(holder["timeWin"])
    return [(int(get(games[k])), int(get(wins[k]))) for k in sorted(games, key=int)]


def scaling_of(curve: Curve) -> Dict[str, float]:
    def wr(idx):
        n = sum(curve[i][0] for i in idx if i < len(curve))
        w = sum(curve[i][1] for i in idx if i < len(curve))
        return (100.0 * w / n if n else 50.0), n

    early, n_early = wr(EARLY)
    late, n_late = wr(LATE)
    games = n_early + n_late
    return {"early_wr": round(early, 2), "late_wr": round(late, 2),
            "delta": round(late - early, 2) if n_early and n_late else 0.0,
            "games": games if n_early and n_late else 0}


def fetch_curve(client: httpx.Client, key: str, role: str) -> Curve:
    r = client.get(PAGE.format(slug=LolalyticsFetcher.key_to_slug(key)),
                   params={"lane": LANES[role], "tier": TIER, "patch": WINDOW})
    r.raise_for_status()
    return parse_curve(r.text)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    pairs = [(k, r) for k, v in overrides.items() if isinstance(v, dict) for r in v.get("roles", []) if r in LANES]
    out: Dict[str, Dict[str, dict]] = {}
    failed: List[str] = []
    with httpx.Client(headers=HEADERS, timeout=30, follow_redirects=True) as client:
        for i, (key, role) in enumerate(pairs, 1):
            try:
                curve = fetch_curve(client, key, role)
            except (httpx.HTTPError, ValueError) as exc:
                failed.append(f"{key}:{role} ({exc})")
            else:
                out.setdefault(key, {})[role] = {**scaling_of(curve), "curve": curve}
                s = out[key][role]
                print(f"[{i}/{len(pairs)}] {key:14} {role:8} {s['delta']:+6.1f}  ({s['games']} parties)")
            time.sleep(DELAY)
    print(f"{len(pairs) - len(failed)}/{len(pairs)} mesurés ; échecs : {failed}")
    if args.write:
        meta = {"source": f"Lolalytics, Win Rate vs Game Length, {TIER}, {WINDOW} jours",
                "fetched": date.today().isoformat(), "early_buckets": [i + 1 for i in EARLY],
                "late_buckets": [i + 1 for i in LATE], "failed": failed}
        OUT.write_text(json.dumps({"_meta": meta, **out}, indent=1, ensure_ascii=False) + "\n",
                       encoding="utf-8", newline="\n")
        print(f"Écrit : {OUT}")
    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
