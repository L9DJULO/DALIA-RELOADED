#!/usr/bin/env python
"""Estime les k de rétrécissement des synergies de paire (chantier 3, spec 2026-09-28 §4).

La colonne d2 des pages de duo Lolalytics (ep=build-team) mesure ce qu'une paire
gagne au-delà de la force de chacun. Sa dispersion brute est surtout du bruit
d'échantillonnage : on retire la variance attendue du bruit (2500 / n) pour garder
celle des vraies interactions, τ², puis k = 2500 / τ². Estimé séparément pour le
duo bot + support et pour les autres paires, qui interagissent beaucoup moins.

Pour chaque palier que le moteur peut demander, pages de duo des 20 champions les
plus joués de chaque poste. Un type sans estimation (trop peu de paires, ou rien
au-dessus du bruit) n'est pas écrit : le moteur retombe sur le palier par défaut.

À rejouer à chaque grosse bascule de méta, comme refresh_roles.py.

Usage (depuis server/) :
  python scripts/refresh_synergy_priors.py            # affiche, n'écrit rien
  python scripts/refresh_synergy_priors.py --write    # écrit app/data/synergy_priors.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import config  # noqa: E402
from app.scoring.synergy_priors import PRIORS_PATH, estimate_k, pairs_by_kind  # noqa: E402
from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402

ROLES = ("top", "jungle", "mid", "bot", "support")
PER_ROLE = 20


def tiers() -> List[str]:
    wanted = set(config.scoring.rank_tier_map.values()) | {config.rank_tier, "master_plus"}
    return sorted(wanted)


async def tier_pages(fetcher: LolalyticsFetcher, tier: str, keys: Dict[str, str]):
    pages: Dict[Tuple[int, str], dict] = {}
    for role in ROLES:
        rows = (await fetcher.fetch_tierlist(role, tier=tier)).get("cid", {})
        ranked = sorted(rows.items(), key=lambda kv: -int((kv[1] or {}).get("games", 0) or 0))[:PER_ROLE]
        wanted = [(int(cid), keys[cid]) for cid, _ in ranked if cid in keys]
        raws = await asyncio.gather(*(fetcher.fetch_team_page(LolalyticsFetcher.key_to_slug(k), role, tier=tier)
                                      for _, k in wanted))
        for (cid, _), raw in zip(wanted, raws):
            team = LolalyticsFetcher.parse_team(raw)
            if team:
                pages[(cid, role)] = team
    return pages


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="écrire le fichier au lieu de l'afficher")
    ap.add_argument("--cache-dir", help="cache séparé, pour ne pas rafraîchir le cache vivant pendant une mesure")
    args = ap.parse_args()

    fetcher = LolalyticsFetcher(cache_dir=args.cache_dir) if args.cache_dir else LolalyticsFetcher()
    out: Dict[str, dict] = {}
    try:
        ddragon = await fetcher.fetch_all_champions_ddragon()
        keys = {v["key"]: k for k, v in ddragon.items()}
        for tier in tiers():
            pages = await tier_pages(fetcher, tier, keys)
            entry: Dict[str, object] = {"tau": {}, "pairs": {}, "pages": len(pages)}
            for kind, pairs in pairs_by_kind(pages).items():
                est = estimate_k(pairs)
                if est is None:
                    print(f"{tier:<14} {kind:<12} pas d'estimation ({len(pairs)} paires)")
                    continue
                k, tau, count = est
                entry[kind] = k
                entry["tau"][kind] = round(tau, 3)
                entry["pairs"][kind] = count
                print(f"{tier:<14} {kind:<12} tau {tau:.2f} pt  k {k:>6}  ({count} paires, {len(pages)} pages)")
            out[tier] = entry
    finally:
        await fetcher.close()

    if not any(k in e for e in out.values() for k in ("bot_support", "other")):
        print("Aucune estimation : rien n'est écrit.", file=sys.stderr)
        return 1
    if args.write:
        doc = {"measured_at": date.today().isoformat(), "window_days": int(config.counter_patch),
               "source": "Lolalytics ep=build-team, d2 ; scripts/refresh_synergy_priors.py", "tiers": out}
        with PRIORS_PATH.open("w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
        print(f"Écrit : {PRIORS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
