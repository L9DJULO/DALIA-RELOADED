#!/usr/bin/env python
"""Dérive les notes des 173 champions depuis les données publiées (chantiers 4 et 14).

Sources : notes de style Riot (CommunityDragon), portée (Data Dragon),
sous-classes (wiki LoL). Les faits sont mis en cache dans
app/data/champion_facts.json pour que les règles se rejouent sans réseau.

Usage (depuis server/) :
  python scripts/derive_ratings.py --fetch     # (re)collecte les faits
  python scripts/derive_ratings.py             # rapport de contrôle, n'écrit rien
  python scripts/derive_ratings.py --write     # écrit les notes calculées des 102
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.rating_rules import DIMENSIONS, ChampionFacts, derive  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "app" / "data"
FACTS_PATH = DATA / "champion_facts.json"
OVERRIDES = DATA / "champion_overrides.json"
REPORT_PATH = DATA / "ratings_report.md"
UA = {"User-Agent": "DALIA-research/1.0"}
CDRAGON = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/{}.json"
WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php"
SUBCLASSES = ("Enchanter", "Catcher", "Juggernaut", "Diver", "Burst", "Battlemage", "Artillery",
              "Marksman", "Assassin", "Skirmisher", "Vanguard", "Warden", "Specialist")


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def match_champion(name: str, ddragon: Dict[str, dict]) -> Optional[str]:
    """Clé Data Dragon d'un nom affiché : par clé, puis par nom, puis par préfixe de nom
    (« Nunu » → « Nunu & Willump »)."""
    n = normalize_name(name)
    for key, info in ddragon.items():
        if n in (normalize_name(key), normalize_name(info.get("name", ""))):
            return key
    for key, info in ddragon.items():
        if n and normalize_name(info.get("name", "")).startswith(n):
            return key
    return None


def map_subclasses(members: Dict[str, List[str]], ddragon: Dict[str, dict]) -> Tuple[Dict[str, List[str]], List[str]]:
    mapped: Dict[str, List[str]] = {}
    unmatched: List[str] = []
    for subclass, names in members.items():
        for name in names:
            key = match_champion(name, ddragon)
            if key is None:
                unmatched.append(name)
                continue
            mapped.setdefault(key, []).append(subclass)
    return {k: sorted(v) for k, v in mapped.items()}, sorted(set(unmatched))


def facts_from_record(key: str, rec: dict) -> ChampionFacts:
    return ChampionFacts(key=key, damage=rec["damage"], durability=rec["durability"],
                         crowd_control=rec["crowd_control"], mobility=rec["mobility"],
                         utility=rec["utility"], style=rec["style"], ranged=rec["ranged"],
                         subclasses=frozenset(rec.get("subclasses", [])))


def _get_json(client: httpx.Client, url: str, **params) -> dict:
    for attempt in range(4):
        try:
            r = client.get(url, params=params or None, headers=UA, timeout=30.0)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError):
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Échec après 4 tentatives : {url}")


def fetch_facts() -> Tuple[Dict[str, dict], List[str]]:
    with httpx.Client() as client:
        version = _get_json(client, "https://ddragon.leagueoflegends.com/api/versions.json")[0]
        ddragon = _get_json(client, f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json")["data"]
        members = {}
        for sub in SUBCLASSES:
            data = _get_json(client, WIKI_API, action="query", list="categorymembers",
                             cmtitle=f"Category:{sub} champion", cmlimit="500", format="json")
            members[sub] = [m["title"] for m in data["query"]["categorymembers"]]
        subclasses, unmatched = map_subclasses(members, ddragon)
        facts: Dict[str, dict] = {}
        for key, info in sorted(ddragon.items()):
            cd = _get_json(client, CDRAGON.format(info["key"]))
            p, t = cd.get("playstyleInfo") or {}, cd.get("tacticalInfo") or {}
            facts[key] = {"damage": p.get("damage", 0), "durability": p.get("durability", 0),
                          "crowd_control": p.get("crowdControl", 0), "mobility": p.get("mobility", 0),
                          "utility": p.get("utility", 0), "style": t.get("style", 5),
                          "ranged": t.get("attackType") == "ranged", "subclasses": subclasses.get(key, [])}
    return {"_meta": {"ddragon": version, "fetched": time.strftime("%Y-%m-%d"), "unmatched_wiki": unmatched},
            **facts}, unmatched


def load_facts() -> Dict[str, ChampionFacts]:
    raw = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
    return {k: facts_from_record(k, v) for k, v in raw.items() if not k.startswith("_")}


def control_report(derived: Dict[str, List[int]], player: Dict[str, List[int]]) -> Dict[str, dict]:
    """Accord du calcul avec les notes du joueur, dimension par dimension (spec §4.3)."""
    keys = sorted(k for k in player if k in derived)
    report = {}
    for i, dim in enumerate(DIMENSIONS):
        if dim == "teamfight":
            continue
        diffs = [(k, derived[k][i], player[k][i]) for k in keys]
        n = max(1, len(diffs))
        report[dim] = {
            "exact": round(100.0 * sum(d == p for _, d, p in diffs) / n, 1),
            "within1": round(100.0 * sum(abs(d - p) <= 1 for _, d, p in diffs) / n, 1),
            "gaps": [(k, d, p) for k, d, p in diffs if abs(d - p) >= 2],
        }
    return report


def format_report(report: Dict[str, dict]) -> str:
    lines = ["# Rapport de contrôle des notes calculées", "",
             "Accord du calcul avec les notes du joueur (critère : ≥ 50 % exact, ≥ 85 % à ±1).", "",
             "| Dimension | Exact | ±1 | Écarts ≥ 2 |", "|---|---|---|---|"]
    for dim, r in report.items():
        ok = "" if r["exact"] >= 50 and r["within1"] >= 85 else " ✗"
        lines.append(f"| `{dim}`{ok} | {r['exact']} % | {r['within1']} % | {len(r['gaps'])} |")
    for dim, r in report.items():
        if r["gaps"]:
            lines += ["", f"## `{dim}`", ""] + [f"- {k} : calculé {d}, joueur {p}" for k, d, p in r["gaps"]]
    return "\n".join(lines) + "\n"


def merge_ratings(overrides: dict, derived: Dict[str, List[int]]) -> dict:
    """Les notes du joueur restent ; les autres entrées reçoivent le calcul (spec §4.4).
    Clés appariées sans casse, comme le chargeur (« BelVeth » / « Belveth »)."""
    derived = {k.lower(): v for k, v in derived.items()}
    out = {}
    for key, entry in overrides.items():
        if key.startswith("_") or not isinstance(entry, dict):
            out[key] = entry
            continue
        entry = dict(entry)
        if "ratings" in entry and entry.get("ratings_source", "joueur") == "joueur":
            entry["ratings_source"] = "joueur"
        elif key.lower() in derived:
            entry["ratings"] = list(derived[key.lower()])
            entry["ratings_source"] = "calcul"
        out[key] = entry
    return out


def apply_teamfight(overrides: dict, teamfight: Dict[str, int]) -> dict:
    """La mesure pro remplace teamfight partout, notes du joueur comprises (spec §2)."""
    teamfight = {k.lower(): v for k, v in teamfight.items()}
    out = {}
    for key, entry in overrides.items():
        if isinstance(entry, dict) and "ratings" in entry and key.lower() in teamfight:
            entry = dict(entry)
            ratings = list(entry["ratings"])
            ratings[DIMENSIONS.index("teamfight")] = int(teamfight[key.lower()])
            entry["ratings"] = ratings
        out[key] = entry
    return out


def dump_overrides(data: dict) -> str:
    """Même format que le fichier versionné : indentation 2, CRLF, sans saut de ligne final."""
    return json.dumps(data, indent=2).replace("\n", "\r\n")


def player_ratings(overrides: dict) -> Dict[str, List[int]]:
    return {k: v["ratings"] for k, v in overrides.items()
            if isinstance(v, dict) and "ratings" in v and v.get("ratings_source", "joueur") == "joueur"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true", help="recollecter les faits publiés")
    ap.add_argument("--write", action="store_true", help="écrire les notes calculées dans les overrides")
    args = ap.parse_args()
    if args.fetch or not FACTS_PATH.exists():
        facts, unmatched = fetch_facts()
        FACTS_PATH.write_text(json.dumps(facts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        print(f"{len(facts) - 1} champions collectés ; noms du wiki sans correspondance : {unmatched}")
    facts = load_facts()
    derived = {k: derive(f) for k, f in facts.items()}
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    report = control_report(derived, player_ratings(overrides))
    REPORT_PATH.write_text(format_report(report), encoding="utf-8", newline="\n")
    for dim, r in report.items():
        print(f"{dim:10} exact {r['exact']:5.1f} %  ±1 {r['within1']:5.1f} %  écarts>=2 {len(r['gaps'])}")
    if args.write:
        merged = merge_ratings(overrides, derived)
        OVERRIDES.write_bytes(dump_overrides(merged).encode("utf-8"))
        print(f"Écrit : {OVERRIDES}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
