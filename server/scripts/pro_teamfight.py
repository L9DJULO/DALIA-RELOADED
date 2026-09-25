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
REPORT = STATS_PATH.parent / "teamfight_report.md"
# Le support n'est pas mesuré : un bouclier ou un soin sur un allié qui tue donne une
# assist, les enchanteurs gonflent leur participation sans être plus présents dans le
# combat (mesure du 25/09 : Nami, Milio, Yuumi à 5 ; Nautilus, Blitzcrank à 1).
MEASURED_ROLES = ("top", "jungle", "mid", "bot")


def load_rows(path: Path) -> List[dict]:
    """Lignes pros d'une collecte complète ; une collecte interrompue fausserait les notes."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not data.get("_meta", {}).get("complete"):
        raise ValueError(f"{path} : collecte incomplète, relancer scrape_player_stats.py")
    return data["rows"]


def pro_roles(rows: List[dict], min_games: int = 5) -> Dict[str, str]:
    """Poste mesuré de chaque champion : celui où les pros le jouent le plus.

    Le premier poste des overrides suit la soloqueue : Pantheon y est support, les pros le
    jouent en jungle. Lu sur les lignes pros, il porte aussi leurs clés Data Dragon, celles
    des faits : plus d'appariement sensible à la casse (overrides « BelVeth »).

    Un champion surtout joué support n'est pas mesuré (voir MEASURED_ROLES), même s'il a
    quelques parties ailleurs : Seraphine sur 5 parties bot pour 338 en support dirait peu
    de ses combats. Il reste sur la règle de repli.
    """
    games: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in rows:
        games[r["champion"]][r["role"]] += 1
    roles = {}
    for champ, by_role in games.items():
        role = max(MEASURED_ROLES + ("support",), key=lambda ro: by_role.get(ro, 0))
        if role in MEASURED_ROLES and by_role[role] >= min_games:
            roles[champ] = role
    return roles


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
        if role not in MEASURED_ROLES or primary_role.get(champ) != role or len(kps) < min_games:
            continue
        scores[role][champ] = shrink(mean(kps) - role_mean[role], len(kps), k)
    ratings: Dict[str, int] = {}
    for role, champs in scores.items():
        ordered = sorted(champs, key=lambda c: champs[c])
        for rank, champ in enumerate(ordered):
            # Centre du rang : sur un poste de moins de cinq champions, rang × 5 // n tassait vers le bas.
            ratings[champ] = 1 + min(4, int((rank + 0.5) * 5 / len(ordered)))
    return ratings


def teamfight_report(rows: List[dict], primary_role: Dict[str, str], measured: Dict[str, int],
                     full: Dict[str, int]) -> str:
    """Spec §5.2 : qui porte les combats, et quelles notes ne sont que la règle de repli.

    Les lignes collectées ne gardent pas l'identifiant de partie : les dégâts sont
    rapportés à la moyenne du poste, pas à l'équipe.
    """
    by_role: Dict[str, List[float]] = defaultdict(list)
    by_champ: Dict[tuple, List[dict]] = defaultdict(list)
    for r in rows:
        by_role[r["role"]].append(r["damage"])
        by_champ[(r["champion"], r["role"])].append(r)
    lines = ["# Teamfight mesuré sur les parties pros", "",
             "Participation aux kills relative au poste, en quintiles (support non mesuré).", ""]
    for role in MEASURED_ROLES:
        champs = sorted((c for c in measured if primary_role.get(c) == role), key=lambda c: -measured[c])
        if not champs:
            continue
        mean_dmg = mean(by_role[role]) or 1.0
        lines += [f"## {role}", "", "| Champion | Note | Parties | Participation | Dégâts / moyenne du poste |",
                  "|---|---|---|---|---|"]
        for c in champs:
            rs = by_champ[(c, role)]
            lines.append(f"| {c} | {measured[c]} | {len(rs)} | {mean(kill_participation(r) for r in rs):.0%} "
                         f"| {mean(r['damage'] for r in rs) / mean_dmg:.0%} |")
        lines.append("")
    fallback = sorted(c for c in full if c not in measured)
    lines += ["## Règle de repli — peu de données", "",
              f"{len(fallback)} champions : moins de 5 parties pros sur leur poste le plus joué, ou joués surtout support.", "",
              ", ".join(f"{c} ({full[c]})" for c in fallback)]
    return "\n".join(lines) + "\n"


def full_teamfight(measured: Dict[str, int], facts: Dict[str, "ChampionFacts"]) -> Dict[str, int]:
    """Note teamfight de chaque champion : mesurée si possible, sinon la règle de repli (spec §5.2)."""
    from app.services.rating_rules import teamfight_fallback
    return {key: measured.get(key, teamfight_fallback(f)) for key, f in facts.items()}


def main() -> int:
    import derive_ratings
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    try:
        rows = load_rows(STATS_PATH)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2
    overrides = json.loads(derive_ratings.OVERRIDES.read_text(encoding="utf-8"))
    primary = pro_roles(rows)
    ratings = teamfight_ratings(rows, primary)
    full = full_teamfight(ratings, derive_ratings.load_facts())
    print(f"{len(ratings)} champions notés depuis {len(rows)} lignes pros ; "
          f"{len(full) - len(ratings)} en repli sur les règles")
    REPORT.write_text(teamfight_report(rows, primary, ratings, full), encoding="utf-8", newline="\n")
    for role in MEASURED_ROLES:
        champs = sorted((c for c in ratings if primary.get(c) == role), key=lambda c: -ratings[c])
        print(f"{role:8} " + ", ".join(f"{c}={ratings[c]}" for c in champs))
    if args.write:
        OV = derive_ratings.OVERRIDES
        OV.write_bytes(derive_ratings.dump_overrides(derive_ratings.apply_teamfight(overrides, full)).encode("utf-8"))
        print(f"Écrit : {OV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
