#!/usr/bin/env python
"""Mécaniques de kit de chaque champion, depuis les catégories du wiki LoL.

Le wiki classe les champions par mécanique présente dans leur kit
(`Category:{Mécanique} champion` : Stun, Knockback, Shield, Blocker…). Ces
étiquettes sont des pièces justificatives factuelles ; elles ne tranchent pas
seules une notion de draft (docs/TAXONOMIES_CHAMPIONS.md).

Usage (depuis server/) :
  python scripts/refresh_kit_mechanics.py            # collecte, affiche, n'écrit rien
  python scripts/refresh_kit_mechanics.py --write    # écrit app/data/kit_mechanics.json
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))

from derive_ratings import WIKI_API, _get_json, match_champion  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "kit_mechanics.json"
MECHANICS = (
    "Stun", "Knockup", "Knockback", "Pull", "Root", "Suppress", "Taunt", "Charm", "Flee", "Sleep",
    "Polymorph", "Knockdown", "Knock aside", "Silence", "Ground", "Blind", "Disarm", "Nearsight", "Cripple",
    "Slow", "Shield", "Healer", "Cleanse", "Resurrection", "Stasis", "Invulnerable", "Immune", "Untargetable",
    "Blocker", "Dash", "Blink", "Haste", "Global", "Stealth", "Execution", "Self Heal",
)


def members(client: httpx.Client, mechanic: str) -> List[str]:
    data = _get_json(client, WIKI_API, action="query", list="categorymembers",
                     cmtitle=f"Category:{mechanic} champion", cmlimit="500", format="json")
    return [m["title"].replace("/LoL", "") for m in data["query"]["categorymembers"]]


def by_champion(raw: Dict[str, List[str]], ddragon: Dict[str, dict]) -> Dict[str, List[str]]:
    """{mécanique: [noms du wiki]} → {clé Data Dragon: [mécaniques]}."""
    out: Dict[str, List[str]] = {}
    for mechanic, names in raw.items():
        for name in names:
            key = match_champion(name, ddragon)
            if key:
                out.setdefault(key, []).append(mechanic)
    return {k: sorted(set(v)) for k, v in sorted(out.items())}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    with httpx.Client() as client:
        version = _get_json(client, "https://ddragon.leagueoflegends.com/api/versions.json")[0]
        ddragon = _get_json(client, f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json")["data"]
        raw = {}
        for m in MECHANICS:
            raw[m] = members(client, m)
            time.sleep(0.3)
    champs = by_champion(raw, ddragon)
    print(f"{len(champs)} champions, {len(MECHANICS)} mécaniques")
    if args.write:
        meta = {"source": "wiki LoL, Category:{Mécanique} champion", "fetched": time.strftime("%Y-%m-%d"),
                "ddragon": version, "mechanics": list(MECHANICS)}
        OUT.write_text(json.dumps({"_meta": meta, **champs}, indent=1, ensure_ascii=False) + "\n",
                       encoding="utf-8", newline="\n")
        print(f"Écrit : {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
