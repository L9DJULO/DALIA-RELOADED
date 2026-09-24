#!/usr/bin/env python
"""Régénère les `roles` de champion_overrides.json depuis Lolalytics.

Règle : un champion est proposé sur un poste si au moins 15 % de ses parties
Master+ s'y jouent (`pctLane` de Lolalytics), postes triés du plus au moins
joué. Son poste principal est toujours retenu — aucun champion sans poste.

Pourquoi la part et non le pick rate : le pick rate mesure la popularité
globale. Un champion peu joué passe sous un seuil de pick rate sur tous ses
postes, et son poste principal bascule au gré du bruit (Zyra en jungle seule,
Vayne en top seule). La part dit où le champion se joue, quelle que soit sa
popularité.

Les clés suivent Data Dragon : une entrée dont la clé ne correspond à aucun
champion n'est jamais lue par le chargeur (c'était le cas de « Wukong », que
Data Dragon appelle « MonkeyKing »). Seuls les `roles` sont réécrits ; les
`ratings` et tout autre champ sont conservés.

Écrit aussi role_distribution.json : la probabilité qu'un adversaire joue chaque
poste, lue par role_inference quand la position ennemie est inconnue. Mêmes
parts Lolalytics, postes sous 3 % retirés. Un flex pick garde ses vraies
proportions (Shaco ~77 % jungle, ~23 % support) au lieu d'une estimation faite
à la main au patch 14.x.

Usage (depuis server/) :
  python scripts/refresh_roles.py            # affiche le diff, n'écrit rien
  python scripts/refresh_roles.py --write    # applique
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402

OVERRIDES = Path(__file__).resolve().parent.parent / "app" / "data" / "champion_overrides.json"
DISTRIBUTION = Path(__file__).resolve().parent.parent / "app" / "data" / "role_distribution.json"
ROLES = ("top", "jungle", "mid", "bot", "support")
TIER = "master_plus"
DIST_FLOOR = 3.0


def roles_from_shares(shares: Dict[str, float], threshold: float) -> List[str]:
    ranked = sorted((r for r in ROLES if shares.get(r, 0.0) > 0.0), key=lambda r: -shares[r])
    return ranked[:1] + [r for r in ranked[1:] if shares[r] >= threshold]


def distribution_from_shares(shares: Dict[str, float], floor: float = DIST_FLOOR) -> Dict[str, float]:
    """Probabilité qu'un adversaire joue chaque poste, pour role_inference.

    Les postes sous `floor` % sont du bruit (Ambessa bot) : retirés avant de
    renormaliser, pour ne pas diluer un flex pick réel comme Shaco jungle/support.
    """
    kept = {r: s for r, s in shares.items() if s >= floor}
    total = sum(kept.values())
    if total <= 0:
        return {}
    ranked = sorted(kept, key=lambda r: -kept[r])
    return {r: round(kept[r] / total, 2) for r in ranked}


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--threshold", type=float, default=15.0,
                    help="part minimale des parties du champion sur le poste, en %% (défaut 15)")
    ap.add_argument("--write", action="store_true", help="écrire le fichier au lieu d'afficher le diff")
    args = ap.parse_args()

    fetcher = LolalyticsFetcher()
    try:
        ddragon = await fetcher.fetch_all_champions_ddragon()
        patch = await fetcher.get_current_patch()
        lists = {r: (await fetcher.fetch_tierlist(r, tier=TIER)).get("cid", {}) for r in ROLES}
    finally:
        await fetcher.close()
    if not ddragon or not all(lists.values()):
        print("Données incomplètes (Data Dragon ou Lolalytics vide) : rien n'est écrit.", file=sys.stderr)
        return 1

    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    by_lower = {k.lower(): k for k in overrides if not k.startswith("_")}
    out: Dict[str, object] = {"_comment": overrides.get("_comment", "")}
    distribution: Dict[str, object] = {}
    changes: List[str] = []

    for key in sorted(ddragon, key=str.lower):
        cid = ddragon[key]["key"]
        shares = {r: float(lists[r].get(cid, {}).get("pctLane", 0.0) or 0.0) for r in ROLES}
        roles = roles_from_shares(shares, args.threshold)
        dist = distribution_from_shares(shares)
        if dist:
            distribution[key] = dist
        old_key = by_lower.pop(key.lower(), None)
        if old_key is None and ddragon[key].get("name", "").lower() in by_lower:
            old_key = by_lower.pop(ddragon[key]["name"].lower())
        entry = dict(overrides.get(old_key, {})) if old_key else {}
        old_roles = entry.get("roles")
        # Garde l'orthographe existante quand elle est lue ; sinon la clé Data Dragon.
        new_key = old_key if old_key and old_key.lower() == key.lower() else key
        entry = {"roles": roles, **{k: v for k, v in entry.items() if k != "roles"}}
        out[new_key] = entry
        detail = " ".join(f"{r}={shares[r]:.0f}%" for r in ROLES if shares[r] >= 5)
        if old_key is None:
            changes.append(f"+ {new_key:14} {roles}  ({detail})")
        elif new_key != old_key:
            changes.append(f"~ {old_key} -> {new_key}: {old_roles} -> {roles}  ({detail})")
        elif old_roles != roles:
            changes.append(f"  {new_key:14} {old_roles} -> {roles}  ({detail})")

    for orphan in by_lower.values():
        changes.append(f"- {orphan:14} aucune correspondance Data Dragon, entrée retirée")

    print(f"Patch {patch}, tier {TIER}, seuil {args.threshold} %, {len(ddragon)} champions, "
          f"{len(changes)} changements")
    print("\n".join(changes))

    if args.write:
        out["_comment"] = _refresh_comment(str(out["_comment"]), patch, args.threshold)
        # Le fichier est versionné en CRLF, sans saut de ligne final.
        OVERRIDES.write_text(_dump(out), encoding="utf-8", newline="\r\n")
        print(f"Écrit : {OVERRIDES}")
        meta = json.loads(DISTRIBUTION.read_text(encoding="utf-8")).get("_meta", {}) if DISTRIBUTION.exists() else {}
        meta["source"] = (f"Lolalytics patch {patch} Master+, part des parties du champion par poste (pctLane), "
                          f"postes sous {DIST_FLOOR:g}% retirés puis renormalisés. Régénéré le "
                          f"{date.today().isoformat()} par scripts/refresh_roles.py.")
        DISTRIBUTION.write_text(json.dumps({"_meta": meta, **distribution}, indent=2, ensure_ascii=False) + "\n",
                                encoding="utf-8", newline="\n")
        print(f"Écrit : {DISTRIBUTION}")
    return 0


def _refresh_comment(comment: str, patch: str, threshold: float) -> str:
    head, sep, tail = comment.partition(". Ratings")
    roles = (f"Role overrides + notes de champions. Roles : Lolalytics patch {patch} Master+ "
             f"part des parties du champion sur le poste >={threshold:g}%, regeneres le {date.today().isoformat()} par scripts/refresh_roles.py")
    return roles + (sep + tail if sep else "")


def _dump(data: Dict[str, object]) -> str:
    """Même mise en forme que le fichier d'origine : le diff ne montre que les rôles changés."""
    return json.dumps(data, indent=2)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
