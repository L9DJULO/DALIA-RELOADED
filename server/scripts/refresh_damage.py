#!/usr/bin/env python
"""Mesure les dégâts infligés par type (physique, magique, brut) de chaque champion.

Les profils de dégâts venaient des tags Riot : Diana (Fighter/Assassin) sortait à
82 % physique, elle inflige 85 % de dégâts magiques (spec composition mesurée,
28/09/2026). Lolalytics affiche, sur la page build de chaque champion, les dégâts
moyens infligés aux champions par partie, par type — chiffres qu'il tient de
Mobalytics.

On lit le texte rendu (« Physical Damage: 18,969 »), pas l'état Qwik : celui-ci
partage des références, et lu tel quel il donnait Ezreal à 99 % magique.

Master+, fenêtre de 30 jours. Le paramètre de poste de la page est ignoré par
Lolalytics : le type de dégâts dépend du champion, pas du poste.

Usage (depuis server/) :
  python scripts/refresh_damage.py            # collecte, affiche, n'écrit rien
  python scripts/refresh_damage.py --write    # écrit app/data/damage_profiles.json
"""
from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from typing import Dict, List

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "app" / "data"
OVERRIDES = DATA / "champion_overrides.json"
OUT = DATA / "damage_profiles.json"
PAGE = "https://lolalytics.com/lol/{slug}/build/"
TIER, WINDOW = "master_plus", "30"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
DELAY = 1.5
LABELS = {"physical": "Physical Damage", "magic": "Magic Damage", "true": "True Damage"}
SOURCE_MIN = 10_000   # même seuil que la config de scoring : affiché pour relecture


def parse_damage(page: str) -> Dict[str, int]:
    """Dégâts par partie de chaque type, lus dans le bloc « Stats » rendu."""
    text = re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", page)))
    out = {}
    for kind, label in LABELS.items():
        m = re.search(re.escape(label) + r":\s*([\d,]+(?:\.\d+)?)", text)
        if not m:
            raise ValueError(f"« {label} » absent de la page")
        out[kind] = int(round(float(m.group(1).replace(",", ""))))
    return out


def fetch_damage(client: httpx.Client, key: str) -> Dict[str, int]:
    r = client.get(PAGE.format(slug=LolalyticsFetcher.key_to_slug(key)), params={"tier": TIER, "patch": WINDOW})
    r.raise_for_status()
    return parse_damage(r.text)


def sources(profiles: Dict[str, Dict[str, int]], kind: str) -> List[str]:
    return sorted(k for k, v in profiles.items() if v[kind] >= SOURCE_MIN)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    keys = sorted(k for k, v in json.loads(OVERRIDES.read_text(encoding="utf-8")).items() if isinstance(v, dict))
    out: Dict[str, Dict[str, int]] = {}
    failed: List[str] = []
    with httpx.Client(headers=HEADERS, timeout=30, follow_redirects=True) as client:
        for i, key in enumerate(keys, 1):
            try:
                out[key] = fetch_damage(client, key)
            except (httpx.HTTPError, ValueError) as exc:
                failed.append(f"{key} ({exc})")
            else:
                d = out[key]
                total = sum(d.values()) or 1
                print(f"[{i}/{len(keys)}] {key:14} physique {d['physical']:>6} ({100 * d['physical'] / total:3.0f} %)"
                      f"  magique {d['magic']:>6} ({100 * d['magic'] / total:3.0f} %)  brut {d['true']:>5}")
            time.sleep(DELAY)
    print(f"\n{len(keys) - len(failed)}/{len(keys)} mesurés ; échecs : {failed}")
    print(f"Sources AP (≥ {SOURCE_MIN} magiques) : {', '.join(sources(out, 'magic'))}")
    print(f"Sources AD (≥ {SOURCE_MIN} physiques) : {', '.join(sources(out, 'physical'))}")
    if args.write:
        meta = {"source": f"Lolalytics (Mobalytics), dégâts infligés aux champions par partie, {TIER}, {WINDOW} jours",
                "fetched": date.today().isoformat(), "failed": failed}
        OUT.write_text(json.dumps({"_meta": meta, **out}, indent=1, ensure_ascii=False) + "\n",
                       encoding="utf-8", newline="\n")
        print(f"Écrit : {OUT}")
    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
