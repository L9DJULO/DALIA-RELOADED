# Notes de champions dérivées des données — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner aux 173 champions des notes calculées depuis les notes de style Riot, les sous-classes du wiki et la participation aux combats en pro, calées sur les 71 notes du joueur.

**Architecture:** Des règles pures, une par dimension (`app/services/rating_rules.py`), appliquées par un script qui collecte et met en cache les faits publiés (`scripts/derive_ratings.py`), produit un rapport de contrôle contre les notes du joueur et écrit les overrides. Une mesure séparée (`scripts/pro_teamfight.py`) tire `teamfight` des parties pros, récupérées par un scraper dédié.

**Tech Stack:** Python 3.11, pytest, httpx (déjà dépendance), APIs publiques CommunityDragon, Data Dragon, wiki LoL (MediaWiki), Leaguepedia Cargo.

**Spec:** `docs/superpowers/specs/2026-09-25-notes-derivees-design.md`

## Global Constraints

- Vecteur de notes, ordre fixe : `[cc, engage, poke, splitpush, teamfight, utility, burst, dps, tankiness]`, entiers 1 à 5.
- Ancres de `splitpush` à 5 : Fiora, Trundle, Yorick, Tryndamere, Nasus — seuls noms de champions autorisés dans une règle.
- Les 71 notes du joueur ne sont jamais réécrites, sauf `teamfight`.
- `champion_overrides.json` : CRLF, indentation 2, pas de saut de ligne final.
- Critère d'arrêt des itérations : ≥ 50 % d'accord exact et ≥ 85 % à ±1 par dimension (hors `teamfight`).
- `teamfight` pro : parties LCK, LPL, LEC, LCS 2026, patches antérieurs à 26.16 ; `k` = 20 parties ; repli sous 5 parties.
- Requêtes aux APIs publiques : User-Agent `DALIA-research/1.0`.
- Toutes les commandes Python depuis `server/` avec `.venv/Scripts/python`.

## Review Focus

- Un nom du wiki sans correspondance Data Dragon (« Nunu », « Champion classes/Specialist ») : ignoré et listé, jamais une exception — Task 2.
- Un champion sans `playstyleInfo` ou avec des zéros : règles bornées à [1, 5], pas de crash — Task 1.
- Une partie pro à 0 kill d'équipe : participation nulle, pas de division par zéro — Task 5.
- Un champion joué sur un poste qui n'est pas son poste principal : la note vient du poste principal, pas d'un mélange — Task 5.
- Réécrire les overrides : les 71 notes du joueur et les `roles` intacts — Task 3.

---

### Task 1: Les règles de conversion

**Files:**
- Create: `server/app/services/rating_rules.py`
- Test: `server/tests/unit/test_rating_rules.py`

**Interfaces:**
- Produces: `ChampionFacts` (dataclass figée : `key: str, damage: int, durability: int, crowd_control: int, mobility: int, utility: int, style: int, ranged: bool, subclasses: FrozenSet[str]`), `DIMENSIONS: Tuple[str, ...]`, `derive(facts: ChampionFacts) -> List[int]`, `RULES: Dict[str, Callable[[ChampionFacts], int]]`.

- [ ] **Step 1: Écrire les tests**

```python
"""Règles de conversion faits publiés → notes (spec 2026-09-25, §4.2)."""
from app.services.rating_rules import DIMENSIONS, ChampionFacts, derive, RULES


def facts(**kw):
    base = dict(key="X", damage=2, durability=1, crowd_control=2, mobility=1, utility=1,
                style=5, ranged=True, subclasses=frozenset())
    base.update(kw)
    return ChampionFacts(**base)


def rate(dim, **kw):
    return RULES[dim](facts(**kw))


def test_vector_follows_the_override_order():
    assert DIMENSIONS == ("cc", "engage", "poke", "splitpush", "teamfight", "utility", "burst", "dps", "tankiness")
    assert len(derive(facts())) == 9


def test_cc_follows_riot_control_and_tops_out_on_durable_controllers():
    assert [rate("cc", crowd_control=c) for c in (0, 1, 2, 3)] == [1, 2, 3, 4]
    assert rate("cc", crowd_control=3, durability=3) == 5, "Leona, Nautilus, Alistar"


def test_tankiness_counts_mobility_as_survival():
    """Arbitrage du joueur : survivabilité effective, pas résistance brute."""
    assert rate("tankiness", durability=1, mobility=1) == 1
    assert rate("tankiness", durability=1, mobility=3) == 3
    assert rate("tankiness", durability=3, mobility=3) == 5


def test_style_splits_damage_between_dps_and_burst():
    auto = dict(damage=3, style=2)
    spells = dict(damage=3, style=9)
    assert rate("dps", **auto) == 5 and rate("burst", **auto) == 4
    assert rate("burst", **spells) == 5 and rate("dps", **spells) == 2


def test_poke_needs_range_and_peaks_on_artillery():
    assert rate("poke", ranged=False) == 1
    assert rate("poke", subclasses=frozenset({"Artillery"})) == 5
    assert rate("poke", style=8) == 4
    assert rate("poke", style=2, subclasses=frozenset({"Marksman"})) == 3


def test_engage_reads_subclasses_before_riot_numbers():
    assert rate("engage", subclasses=frozenset({"Vanguard"})) == 5
    assert rate("engage", subclasses=frozenset({"Catcher"})) == 4
    assert rate("engage", crowd_control=2, mobility=2) == 3
    assert rate("engage", crowd_control=0, mobility=1) == 1


def test_splitpush_anchors_are_the_only_named_champions():
    assert rate("splitpush", key="Fiora") == 5
    assert rate("splitpush", subclasses=frozenset({"Juggernaut"})) == 4
    assert rate("splitpush", subclasses=frozenset({"Marksman"})) == 2
    assert rate("splitpush") == 1


def test_utility_rewards_enchanters():
    assert rate("utility", utility=3) == 5
    assert rate("utility", utility=1, subclasses=frozenset({"Enchanter"})) == 3


def test_teamfight_fallback_before_pro_data():
    assert rate("teamfight", subclasses=frozenset({"Warden"})) == 4
    assert rate("teamfight") == 3


def test_every_rule_stays_in_range_on_degenerate_facts():
    """Revue : un champion sans playstyle (zéros) ne doit ni planter ni sortir de [1, 5]."""
    zero = facts(damage=0, durability=0, crowd_control=0, mobility=0, utility=0, style=0, ranged=False)
    maxed = facts(damage=3, durability=3, crowd_control=3, mobility=3, utility=3, style=10,
                  subclasses=frozenset({"Enchanter", "Vanguard", "Artillery", "Juggernaut"}))
    for f in (zero, maxed):
        assert all(1 <= v <= 5 for v in derive(f))
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `.venv/Scripts/python -m pytest tests/unit/test_rating_rules.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.rating_rules'`.

- [ ] **Step 3: Implémenter**

```python
"""Règles de conversion : faits publiés sur un champion → notes 1-5.

Chantiers 4 et 14 (spec 2026-09-25). Une fonction pure par dimension, lisible,
pour qu'un écart avec les notes du joueur désigne une règle à corriger. Aucune
règle ne nomme un champion, sauf les ancres de splitpush données par le joueur.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable, Dict, FrozenSet, List, Tuple

DIMENSIONS: Tuple[str, ...] = ("cc", "engage", "poke", "splitpush", "teamfight", "utility", "burst", "dps", "tankiness")
SPLITPUSH_ANCHORS = frozenset({"Fiora", "Trundle", "Yorick", "Tryndamere", "Nasus"})


@dataclass(frozen=True)
class ChampionFacts:
    """Ce que Riot et le wiki publient sur un champion. Notes Riot sur 0-3."""
    key: str
    damage: int
    durability: int
    crowd_control: int
    mobility: int
    utility: int
    style: int            # 1 = attaques de base … 10 = sorts
    ranged: bool
    subclasses: FrozenSet[str] = frozenset()


def _clamp(v: int) -> int:
    return max(1, min(5, int(v)))


def _damage_level(f: ChampionFacts) -> int:
    return {2: 3, 3: 5}.get(f.damage, 1)


def cc(f: ChampionFacts) -> int:
    if f.crowd_control >= 3 and f.durability >= 3:
        return 5
    return _clamp({1: 2, 2: 3, 3: 4}.get(f.crowd_control, 1))


def engage(f: ChampionFacts) -> int:
    if "Vanguard" in f.subclasses:
        return 5
    if f.subclasses & {"Catcher", "Diver"}:
        return 4
    if f.crowd_control >= 2 and f.mobility >= 2:
        return 3
    return 2 if f.crowd_control >= 2 else 1


def poke(f: ChampionFacts) -> int:
    if not f.ranged:
        return 1
    if "Artillery" in f.subclasses:
        return 5
    if f.style >= 6:
        return 4
    return 3 if "Marksman" in f.subclasses else 2


def splitpush(f: ChampionFacts) -> int:
    if f.key in SPLITPUSH_ANCHORS:
        return 5
    if f.subclasses & {"Skirmisher", "Juggernaut"}:
        return 4
    if f.subclasses & {"Diver", "Specialist"}:
        return 3
    return 2 if "Marksman" in f.subclasses else 1


def teamfight_fallback(f: ChampionFacts) -> int:
    """Repli quand la mesure pro manque (spec §5.2)."""
    return 4 if f.subclasses & {"Vanguard", "Warden", "Battlemage", "Enchanter"} else 3


def utility(f: ChampionFacts) -> int:
    base = {2: 4, 3: 5}.get(f.utility, 2)
    return _clamp(base + (1 if "Enchanter" in f.subclasses else 0))


def burst(f: ChampionFacts) -> int:
    level = _damage_level(f)
    return _clamp(level if f.style >= 6 else level - 1)


def dps(f: ChampionFacts) -> int:
    level = _damage_level(f)
    if f.style <= 4:
        return _clamp(level)
    return _clamp(level - 3 if f.style >= 6 else level - 1)


def tankiness(f: ChampionFacts) -> int:
    """Survivabilité effective : la mobilité protège autant que la résistance."""
    base = {2: 3, 3: 5}.get(f.durability, 1)
    return _clamp(base + {2: 1, 3: 2}.get(f.mobility, 0))


RULES: Dict[str, Callable[[ChampionFacts], int]] = {
    "cc": cc, "engage": engage, "poke": poke, "splitpush": splitpush, "teamfight": teamfight_fallback,
    "utility": utility, "burst": burst, "dps": dps, "tankiness": tankiness,
}


def derive(f: ChampionFacts) -> List[int]:
    return [RULES[d](f) for d in DIMENSIONS]
```

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python -m pytest tests/unit/test_rating_rules.py -q`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add server/app/services/rating_rules.py server/tests/unit/test_rating_rules.py
git commit -m "Notes dérivées : règles de conversion lisibles, une par dimension"
```

---

### Task 2: Collecter et mettre en cache les faits publiés

**Files:**
- Create: `server/scripts/derive_ratings.py` (collecte seulement dans cette tâche)
- Test: `server/tests/unit/test_derive_ratings.py`

**Interfaces:**
- Consumes: `ChampionFacts` (Task 1).
- Produces: `normalize_name(name: str) -> str` ; `match_champion(name: str, ddragon: Dict[str, dict]) -> Optional[str]` (clé Data Dragon) ; `map_subclasses(members: Dict[str, List[str]], ddragon) -> Tuple[Dict[str, List[str]], List[str]]` (clé → sous-classes triées, noms sans correspondance) ; `facts_from_record(key: str, record: dict) -> ChampionFacts` ; constante `FACTS_PATH = server/app/data/champion_facts.json`. Format d'un enregistrement : `{"damage", "durability", "crowd_control", "mobility", "utility", "style", "ranged", "subclasses": [...]}`.

- [ ] **Step 1: Écrire les tests**

```python
"""Collecte des faits publiés (scripts/derive_ratings.py)."""
import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "derive_ratings.py"
_spec = importlib.util.spec_from_file_location("derive_ratings", _PATH)
derive_ratings = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(derive_ratings)

DDRAGON = {"Velkoz": {"name": "Vel'Koz"}, "DrMundo": {"name": "Dr. Mundo"},
           "Nunu": {"name": "Nunu & Willump"}, "MonkeyKing": {"name": "Wukong"}}


def test_wiki_names_match_data_dragon_keys():
    assert derive_ratings.match_champion("Vel'Koz", DDRAGON) == "Velkoz"
    assert derive_ratings.match_champion("Dr. Mundo", DDRAGON) == "DrMundo"
    assert derive_ratings.match_champion("Nunu", DDRAGON) == "Nunu"
    assert derive_ratings.match_champion("Wukong", DDRAGON) == "MonkeyKing"


def test_unmatched_wiki_entries_are_reported_not_invented():
    members = {"Specialist": ["Champion classes/Specialist", "Vel'Koz"], "Juggernaut": ["Dr. Mundo"]}
    mapped, unmatched = derive_ratings.map_subclasses(members, DDRAGON)
    assert mapped == {"Velkoz": ["Specialist"], "DrMundo": ["Juggernaut"]}
    assert unmatched == ["Champion classes/Specialist"]


def test_record_becomes_facts():
    rec = {"damage": 3, "durability": 1, "crowd_control": 2, "mobility": 1, "utility": 2,
           "style": 9, "ranged": True, "subclasses": ["Artillery", "Burst"]}
    f = derive_ratings.facts_from_record("Lux", rec)
    assert f.key == "Lux" and f.style == 9 and f.subclasses == frozenset({"Artillery", "Burst"})
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `.venv/Scripts/python -m pytest tests/unit/test_derive_ratings.py -q`
Expected: FAIL — `FileNotFoundError` sur `scripts/derive_ratings.py`.

- [ ] **Step 3: Implémenter la collecte**

`server/scripts/derive_ratings.py` :

```python
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

from app.services.rating_rules import ChampionFacts  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "app" / "data"
FACTS_PATH = DATA / "champion_facts.json"
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true", help="recollecter les faits publiés")
    args = ap.parse_args()
    if args.fetch or not FACTS_PATH.exists():
        facts, unmatched = fetch_facts()
        FACTS_PATH.write_text(json.dumps(facts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        print(f"{len(facts) - 1} champions collectés ; noms du wiki sans correspondance : {unmatched}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python -m pytest tests/unit/test_derive_ratings.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Collecter pour de vrai**

Run: `.venv/Scripts/python scripts/derive_ratings.py --fetch`
Expected: `173 champions collectés` ; la liste des noms sans correspondance ne contient que des pages non-champion (« Champion classes/… »). Tout vrai champion non apparié est un bug de `match_champion` : ajouter son cas au test du Step 1 et corriger.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/derive_ratings.py server/tests/unit/test_derive_ratings.py server/app/data/champion_facts.json
git commit -m "Notes dérivées : collecte des notes de style Riot et des sous-classes du wiki"
```

---

### Task 3: Rapport de contrôle et écriture des overrides

**Files:**
- Modify: `server/scripts/derive_ratings.py`
- Test: `server/tests/unit/test_derive_ratings.py`

**Interfaces:**
- Consumes: `derive`, `DIMENSIONS` (Task 1) ; `load_facts` (Task 2).
- Produces: `control_report(derived: Dict[str, List[int]], player: Dict[str, List[int]]) -> Dict[str, dict]` (par dimension hors `teamfight` : `exact`, `within1` en %, `gaps` = liste `(clé, calculé, joueur)` des écarts ≥ 2) ; `merge_ratings(overrides: dict, derived: Dict[str, List[int]]) -> dict` ; `apply_teamfight(overrides: dict, teamfight: Dict[str, int]) -> dict` ; `dump_overrides(data: dict) -> str`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `server/tests/unit/test_derive_ratings.py` :

```python
def test_control_report_measures_agreement_and_lists_big_gaps():
    derived = {"A": [3, 1, 1, 1, 3, 2, 2, 2, 1], "B": [5, 1, 1, 1, 3, 2, 2, 2, 1]}
    player = {"A": [3, 1, 1, 1, 5, 2, 2, 2, 1], "B": [2, 1, 1, 1, 1, 2, 2, 2, 1]}
    report = derive_ratings.control_report(derived, player)
    assert "teamfight" not in report, "remplacé par la mesure pro (spec §2)"
    assert report["cc"]["exact"] == 50.0 and report["cc"]["within1"] == 50.0
    assert report["cc"]["gaps"] == [("B", 5, 2)]


def test_merge_keeps_every_player_rating_and_role():
    overrides = {"_comment": "c", "Jinx": {"roles": ["bot"], "ratings": [2, 1, 3, 2, 5, 3, 2, 5, 1]},
                 "Zed": {"roles": ["mid", "jungle"]}}
    derived = {"Jinx": [9] * 9, "Zed": [1, 1, 1, 3, 3, 2, 5, 2, 3]}
    out = derive_ratings.merge_ratings(overrides, derived)
    assert out["Jinx"]["ratings"] == [2, 1, 3, 2, 5, 3, 2, 5, 1] and out["Jinx"]["ratings_source"] == "joueur"
    assert out["Zed"] == {"roles": ["mid", "jungle"], "ratings": [1, 1, 1, 3, 3, 2, 5, 2, 3], "ratings_source": "calcul"}
    assert out["_comment"] == "c"


def test_teamfight_replaces_index_four_everywhere_player_notes_included():
    overrides = {"Jinx": {"roles": ["bot"], "ratings": [2, 1, 3, 2, 5, 3, 2, 5, 1], "ratings_source": "joueur"}}
    out = derive_ratings.apply_teamfight(overrides, {"Jinx": 3})
    assert out["Jinx"]["ratings"] == [2, 1, 3, 2, 3, 3, 2, 5, 1]
    assert out["Jinx"]["ratings_source"] == "joueur", "le reste reste au joueur"


def test_dump_keeps_crlf_without_final_newline():
    text = derive_ratings.dump_overrides({"A": {"roles": ["top"]}})
    assert "\r\n" in text and not text.endswith("\n") and '  "A": {' in text
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `.venv/Scripts/python -m pytest tests/unit/test_derive_ratings.py -q`
Expected: FAIL — `AttributeError: module 'derive_ratings' has no attribute 'control_report'`.

- [ ] **Step 3: Implémenter**

Dans `server/scripts/derive_ratings.py`, ajouter l'import `from app.services.rating_rules import DIMENSIONS, derive` (à côté de `ChampionFacts`), la constante `OVERRIDES = DATA / "champion_overrides.json"`, `REPORT_PATH = DATA / "ratings_report.md"`, puis :

```python
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
    """Les notes du joueur restent ; les autres entrées reçoivent le calcul (spec §4.4)."""
    out = {}
    for key, entry in overrides.items():
        if key.startswith("_") or not isinstance(entry, dict):
            out[key] = entry
            continue
        entry = dict(entry)
        if "ratings" in entry and entry.get("ratings_source", "joueur") == "joueur":
            entry["ratings_source"] = "joueur"
        elif key in derived:
            entry["ratings"] = list(derived[key])
            entry["ratings_source"] = "calcul"
        out[key] = entry
    return out


def apply_teamfight(overrides: dict, teamfight: Dict[str, int]) -> dict:
    """La mesure pro remplace teamfight partout, notes du joueur comprises (spec §2)."""
    out = {}
    for key, entry in overrides.items():
        if isinstance(entry, dict) and "ratings" in entry and key in teamfight:
            entry = dict(entry)
            ratings = list(entry["ratings"])
            ratings[DIMENSIONS.index("teamfight")] = int(teamfight[key])
            entry["ratings"] = ratings
        out[key] = entry
    return out


def dump_overrides(data: dict) -> str:
    """Même format que le fichier versionné : indentation 2, CRLF, sans saut de ligne final."""
    return json.dumps(data, indent=2).replace("\n", "\r\n")


def player_ratings(overrides: dict) -> Dict[str, List[int]]:
    return {k: v["ratings"] for k, v in overrides.items()
            if isinstance(v, dict) and "ratings" in v and v.get("ratings_source", "joueur") == "joueur"}
```

Et dans `main()`, après la collecte, ajouter l'argument `--write` au parser et :

```python
    facts = load_facts()
    derived = {k: derive(f) for k, f in facts.items()}
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    report = control_report(derived, player_ratings(overrides))
    REPORT_PATH.write_text(format_report(report), encoding="utf-8", newline="\n")
    for dim, r in report.items():
        print(f"{dim:10} exact {r['exact']:5.1f} %  ±1 {r['within1']:5.1f} %  écarts≥2 {len(r['gaps'])}")
    if args.write:
        merged = merge_ratings(overrides, derived)
        OVERRIDES.write_bytes(dump_overrides(merged).encode("utf-8"))
        print(f"Écrit : {OVERRIDES}")
```

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python -m pytest tests/unit/test_derive_ratings.py -q`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/scripts/derive_ratings.py server/tests/unit/test_derive_ratings.py
git commit -m "Notes dérivées : rapport de contrôle contre le joueur, fusion qui préserve ses notes"
```

---

### Task 4: Caler les règles sur les 71 notes du joueur, puis écrire les 102

**Files:**
- Modify: `server/app/services/rating_rules.py`, `server/tests/unit/test_rating_rules.py`
- Create: `server/app/data/ratings_report.md` (généré)
- Modify: `server/app/data/champion_overrides.json` (généré)

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1: Premier rapport**

Run: `.venv/Scripts/python scripts/derive_ratings.py`
Expected: huit lignes `exact … ±1 …`, et `app/data/ratings_report.md` écrit. Consigner les chiffres de départ.

- [ ] **Step 2: Itérer sur les règles**

Pour chaque dimension sous le critère (≥ 50 % exact, ≥ 85 % à ±1) : lire ses écarts dans le rapport, chercher le **motif commun** (une sous-classe, un palier Riot, la portée), et corriger la règle dans `rating_rules.py`. Chaque correction :
1. ajoute ou modifie un test dans `test_rating_rules.py` qui décrit le motif (des faits construits, jamais un nom de champion) ;
2. le test échoue, puis passe ;
3. le rapport est relancé.

Interdit : une exception nommée (hors ancres de splitpush). Une dimension qui plafonne sous le critère après trois corrections sans gain est laissée telle quelle et signalée.

- [ ] **Step 3: Écrire les notes**

Run: `.venv/Scripts/python scripts/derive_ratings.py --write`
Puis vérifier : `git diff --stat server/app/data/champion_overrides.json` ne touche que les entrées sans `ratings` du joueur, et un script de contrôle confirme que les 71 vecteurs du joueur sont identiques à ceux de `git show HEAD:server/app/data/champion_overrides.json`.

- [ ] **Step 4: Suite, calibration**

Run: `.venv/Scripts/python -m pytest tests/unit -q` → PASS.
Run: `.venv/Scripts/python tests/calibration/run_calibration.py --rank master_plus --compare tests/calibration/snapshots/baseline_v7.json` (gel commun ; en cas de `FrozenCacheMiss`, remplir en `--live-cache` avant et après, regeler, reprendre un snapshot de référence avant l'écriture — protocole de `tests/calibration/README.md`). Consigner bascules, rangs, score global.

- [ ] **Step 5: Commit**

```bash
git add server/app/services/rating_rules.py server/tests/unit/test_rating_rules.py server/app/data/ratings_report.md server/app/data/champion_overrides.json
git commit -m "Notes calculées pour les 102 champions sans note du joueur"
```

---

### Task 5: Mesurer la participation aux combats en pro

**Files:**
- Modify: `server/tests/pro_concordance/scraper.py` (`_cargo_query` accepte `join_on`)
- Create: `server/tests/pro_concordance/scrape_player_stats.py`
- Create: `server/scripts/pro_teamfight.py`
- Test: `server/tests/unit/test_pro_teamfight.py`

**Interfaces:**
- Consumes: `match_champion`, `apply_teamfight`, `dump_overrides` (Tasks 2-3) ; `shrink` (`app.scoring.shrink`).
- Produces: `kill_participation(row: dict) -> float` ; `teamfight_ratings(rows: List[dict], primary_role: Dict[str, str], k: int = 20, min_games: int = 5) -> Dict[str, int]` (clé Data Dragon → note, champions sous `min_games` absents). Une ligne pro : `{"champion": str (clé Data Dragon), "role": str, "kills": int, "assists": int, "team_kills": int, "damage": int, "patch": str}`.

- [ ] **Step 1: Écrire les tests**

```python
"""Participation aux combats en pro → note teamfight (spec §5)."""
import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "pro_teamfight.py"
_spec = importlib.util.spec_from_file_location("pro_teamfight", _PATH)
pro_teamfight = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pro_teamfight)


def row(champ, role, k, a, team, dmg=10000):
    return {"champion": champ, "role": role, "kills": k, "assists": a, "team_kills": team,
            "damage": dmg, "patch": "26.10"}


def test_kill_participation_survives_a_game_without_kills():
    assert pro_teamfight.kill_participation(row("A", "mid", 0, 0, 0)) == 0.0
    assert pro_teamfight.kill_participation(row("A", "mid", 2, 4, 10)) == 0.6


def test_ratings_are_ranked_within_the_role_not_across_roles():
    """Un support a naturellement plus de participation qu'un top."""
    rows = []
    for i, champ in enumerate(["T1", "T2", "T3", "T4", "T5"]):
        rows += [row(champ, "top", 1, i, 10)] * 30
    for i, champ in enumerate(["S1", "S2", "S3", "S4", "S5"]):
        rows += [row(champ, "support", 1, 5 + i, 10)] * 30
    roles = {c: ("top" if c.startswith("T") else "support") for c in ["T1", "T2", "T3", "T4", "T5", "S1", "S2", "S3", "S4", "S5"]}
    r = pro_teamfight.teamfight_ratings(rows, roles)
    assert r["T5"] == 5 and r["S5"] == 5 and r["T1"] == 1 and r["S1"] == 1


def test_a_champion_rated_on_its_main_role_only():
    rows = [row("X", "support", 5, 5, 10)] * 30 + [row("X", "mid", 0, 0, 10)] * 30
    rows += [row(f"M{i}", "mid", 1, i, 10) for i in range(5) for _ in range(30)]
    rows += [row(f"S{i}", "support", 1, i, 10) for i in range(5) for _ in range(30)]
    roles = {"X": "support", **{f"M{i}": "mid" for i in range(5)}, **{f"S{i}": "support" for i in range(5)}}
    assert pro_teamfight.teamfight_ratings(rows, roles)["X"] == 5


def test_too_few_games_fall_back_to_the_rules():
    rows = [row("Rare", "mid", 5, 5, 10)] * 4 + [row(f"M{i}", "mid", 1, i, 10) for i in range(5) for _ in range(30)]
    roles = {"Rare": "mid", **{f"M{i}": "mid" for i in range(5)}}
    assert "Rare" not in pro_teamfight.teamfight_ratings(rows, roles)
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `.venv/Scripts/python -m pytest tests/unit/test_pro_teamfight.py -q`
Expected: FAIL — `FileNotFoundError` sur `scripts/pro_teamfight.py`.

- [ ] **Step 3: Implémenter la mesure**

`server/scripts/pro_teamfight.py` :

```python
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
```

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python -m pytest tests/unit/test_pro_teamfight.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Jointure dans `_cargo_query`**

Dans `server/tests/pro_concordance/scraper.py`, ajouter le paramètre `join_on: str = ""` à `_cargo_query` (après `order_by`), le passer à l'API (`if join_on: params["join_on"] = join_on`) et à la clé de cache sans changer les clés existantes : `cache_name = _cache_key(f"{table}|{join_on}" if join_on else table, where, fields, offset)`.

- [ ] **Step 6: Le scraper des stats joueurs**

`server/tests/pro_concordance/scrape_player_stats.py` :

```python
#!/usr/bin/env python
"""Stats par joueur des parties pros, pour la note teamfight (chantier 14).

LCK, LPL, LEC, LCS 2026, patches antérieurs à 26.16 : la concordance mesure
le moteur sur 26.16-26.18, la note ne doit pas venir des mêmes parties.
Identifiants : $FANDOM_USERNAME / $FANDOM_BOT_PASSWORD, comme scraper.py.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "scripts"))

import scraper  # noqa: E402
from derive_ratings import match_champion, _get_json  # noqa: E402

OUT = HERE.parents[1] / "app" / "data" / "pro_player_stats.json"
LAST_PATCH = (26, 16)


def _patch_tuple(p):
    try:
        major, minor = str(p).split(".")[:2]
        return int(major), int(minor)
    except ValueError:
        return None


def main() -> int:
    user, password = scraper.credentials_from_env()
    if not user or not password:
        print("Identifiants Fandom absents : définir FANDOM_USERNAME et FANDOM_BOT_PASSWORD.", file=sys.stderr)
        return 1
    with httpx.Client(headers={"User-Agent": scraper.USER_AGENT} if hasattr(scraper, "USER_AGENT") else None) as client:
        scraper.login(client, user, password)
        leagues = " OR ".join(f"SG.OverviewPage LIKE '%{lg}%'" for lg in scraper.LEAGUES_TO_SCRAPE)
        rows, complete = scraper._cargo_query(
            client, table="ScoreboardPlayers=SP,ScoreboardGames=SG", join_on="SP.GameId=SG.GameId",
            fields="SP.Champion=Champion,SP.IngameRole=Role,SP.Kills=Kills,SP.Assists=Assists,"
                   "SP.TeamKills=TeamKills,SP.DamageToChampions=Damage,SG.Patch=Patch,SP.GameId=GameId",
            where=f"({leagues}) AND SG.DateTime_UTC >= '2026-01-01 00:00:00'",
            order_by="SG.DateTime_UTC")
        version = _get_json(client, "https://ddragon.leagueoflegends.com/api/versions.json")[0]
        ddragon = _get_json(client, f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json")["data"]
    out, unmatched = [], set()
    for r in rows:
        patch = _patch_tuple(r.get("Patch"))
        role = scraper._normalize_role(r.get("Role"))
        key = match_champion(r.get("Champion") or "", ddragon)
        if patch is None or patch >= LAST_PATCH or role is None:
            continue
        if key is None:
            unmatched.add(r.get("Champion"))
            continue
        out.append({"champion": key, "role": role, "kills": int(r.get("Kills") or 0),
                    "assists": int(r.get("Assists") or 0), "team_kills": int(r.get("TeamKills") or 0),
                    "damage": int(r.get("Damage") or 0), "patch": r.get("Patch")})
    OUT.write_text(json.dumps({"_meta": {"complete": complete, "unmatched": sorted(unmatched), "rows": len(out)},
                               "rows": out}, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(out)} lignes écrites ({'complet' if complete else 'INCOMPLET'}) ; sans correspondance : {sorted(unmatched)}")
    return 0 if complete else 2


if __name__ == "__main__":
    sys.exit(main())
```

Vérifier avant d'écrire la ligne `httpx.Client(...)` si `scraper.py` définit un User-Agent (`grep -n "User-Agent\|USER_AGENT" tests/pro_concordance/scraper.py`) et l'utiliser tel quel ; sinon `headers=None`.

- [ ] **Step 7: Suite**

Run: `.venv/Scripts/python -m pytest tests/unit -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/scripts/pro_teamfight.py server/tests/unit/test_pro_teamfight.py server/tests/pro_concordance/scraper.py server/tests/pro_concordance/scrape_player_stats.py
git commit -m "Teamfight mesuré : participation aux combats en pro, par poste"
```

---

### Task 6: Récolter les parties pros et écrire la note teamfight

**Files:**
- Create: `server/app/data/pro_player_stats.json` (généré)
- Modify: `server/app/data/champion_overrides.json` (généré)

- [ ] **Step 1: Identifiants**

Le joueur définit `FANDOM_USERNAME` et `FANDOM_BOT_PASSWORD` dans l'environnement de la session (bot password créé le 22/09, cf. `tests/pro_concordance/README.md` §0). **Arrêt et question au joueur** s'ils sont absents : c'est un secret, il ne se devine pas.

- [ ] **Step 2: Récolte**

Run (depuis `server/tests/pro_concordance`) : `../../.venv/Scripts/python scrape_player_stats.py`
Expected: `N lignes écrites (complet)`, N de l'ordre de plusieurs milliers ; liste « sans correspondance » vide ou limitée à des noms non-champion.

- [ ] **Step 3: Notes**

Run (depuis `server/`) : `.venv/Scripts/python scripts/pro_teamfight.py`
Lire les notes par poste. Contrôle de bon sens consigné, pas une validation : les supports d'engage et les junglers de combat doivent sortir haut, les champions de split bas. Puis `--write`.

- [ ] **Step 4: Suite, calibration, commit**

Run: `.venv/Scripts/python -m pytest tests/unit -q` → PASS.

```bash
git add server/app/data/pro_player_stats.json server/app/data/champion_overrides.json
git commit -m "Note teamfight mesurée sur les parties pros avant 26.16"
```

---

### Task 7: Re-mesurer le levier teamfight et faire le bilan

**Files:**
- Modify: `server/app/scoring/config.py` (commentaire, et valeur si retenue)
- Modify: `server/tests/calibration/README.md`, `docs/CHANTIERS.md`, `docs/GRILLE_NOTATION.md`, `REPRISE_PROJET.md`

- [ ] **Step 1: Balayage**

`teamfight_scale` ∈ {0 ; 0,25 ; 0,5 ; 1,0}, posé à l'exécution (script de la forme de celui du chantier 5 : `config.scoring.teamfight_scale = v` avant d'importer le runner), sur :
- la calibration, gel commun, avec snapshot par valeur et `--compare` contre la valeur 0 ;
- la concordance pro (5 250 cas, parties 26.16-26.18 — disjointes de la mesure), test apparié top-3 contre la valeur 0.

- [ ] **Step 2: Retenir**

Retenir la valeur la plus forte qui ne fait perdre aucune catégorie de calibration et ne baisse pas significativement la concordance (z > −2). À défaut, 0, et le dire.

- [ ] **Step 3: Documenter**

- `config.py` : le commentaire de `teamfight_scale` reçoit la mesure du jour et le choix.
- `tests/calibration/README.md` : section « Notes dérivées et teamfight mesuré (chantier 14) » — accord du rapport de contrôle par dimension, balayage, valeur retenue.
- `docs/CHANTIERS.md` : chantiers 4 et 14 mis à jour ; ce qui reste.
- `docs/GRILLE_NOTATION.md` : pointer vers `rating_rules.py` comme définition exécutable de la grille.
- `REPRISE_PROJET.md` : section datée.

- [ ] **Step 4: Suite complète et commit**

Run: `.venv/Scripts/python -m pytest tests/unit -q` puis, dans `client/`, `npx vitest run --pool=threads` et `npm.cmd run build`.

```bash
git add server/app/scoring/config.py server/tests/calibration/README.md docs/CHANTIERS.md docs/GRILLE_NOTATION.md REPRISE_PROJET.md
git commit -m "Bilan : notes dérivées des données et teamfight mesuré"
```
