#!/usr/bin/env python
"""DALIA — Draft engine calibration suite.

Loads regression test cases from cases.json, calls the draft engine directly
(no HTTP), and verifies that recommendations meet the expected assertions.

Usage:
    python run_calibration.py
    python run_calibration.py --verbose
    python run_calibration.py --filter blind_pick
    python run_calibration.py --cases custom_cases.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import traceback
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Bootstrap: make the `app` package importable ─────────────────────────
SERVER_DIR = Path(__file__).resolve().parent.parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from app.models.draft import DraftPick, DraftRequest, DraftState, PoolEntry  # noqa: E402
from app.services.champion_data import ChampionDatabase  # noqa: E402
from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402
from app.services.draft_engine import DraftEngine  # noqa: E402

ROLE_ALIASES = {
    "adc": "bot",
    "bottom": "bot",
    "middle": "mid",
    "supp": "support",
    "sup": "support",
    "jg": "jungle",
}


class C:
    """ANSI color codes."""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"


def normalize_role(r: str) -> str:
    return ROLE_ALIASES.get(r.lower(), r.lower())


def resolve_champion(db: ChampionDatabase, name: str):
    """Resolve a champion by display name or DDragon key. Tolerates spaces and apostrophes."""
    c = db.get_by_name(name) or db.get_by_key(name)
    if c:
        return c
    cleaned = name.replace("'", "").replace(" ", "").replace(".", "")
    return db.get_by_key(cleaned) or db.get_by_name(cleaned)


def build_request(setup: Dict[str, Any], db: ChampionDatabase) -> DraftRequest:
    role = normalize_role(setup["my_role"])

    def pick_for(role_name: Optional[str], champ_name: str) -> DraftPick:
        c = resolve_champion(db, champ_name)
        if not c:
            raise ValueError(f"Unknown champion: {champ_name!r}")
        norm_role = normalize_role(role_name) if role_name else None
        return DraftPick(champion_id=c.id, champion_key=c.key, role=norm_role)

    def parse_picks(spec) -> List[DraftPick]:
        # Two accepted forms:
        #   {role: champion_name, ...}                  → role is pinned
        #   [name, ...] | [{name, role?}, ...]           → role optional
        # Mixed dict + special key "_unknown" (list)     → unknown roles in addition
        if not spec:
            return []
        if isinstance(spec, dict):
            picks = []
            for r, n in spec.items():
                if r == "_unknown":
                    for nn in n:
                        picks.append(pick_for(None, nn))
                else:
                    picks.append(pick_for(r, n))
            return picks
        if isinstance(spec, list):
            picks = []
            for entry in spec:
                if isinstance(entry, str):
                    picks.append(pick_for(None, entry))
                elif isinstance(entry, dict):
                    picks.append(pick_for(entry.get("role"), entry["name"]))
                else:
                    raise ValueError(f"Bad pick entry: {entry!r}")
            return picks
        raise ValueError(f"Bad pick spec: {spec!r}")

    ally_picks = parse_picks(setup.get("ally_picks"))
    enemy_picks = parse_picks(setup.get("enemy_picks"))

    bans: List[int] = []
    for n in setup.get("bans") or []:
        c = resolve_champion(db, n)
        if not c:
            raise ValueError(f"Unknown ban champion: {n!r}")
        bans.append(c.id)

    pool: Dict[str, List[PoolEntry]] = {}
    pool_setup = setup.get("champion_pool")
    if pool_setup:
        for r, entries in pool_setup.items():
            r_norm = normalize_role(r)
            pool[r_norm] = []
            for e in entries:
                c = resolve_champion(db, e["champion"])
                if not c:
                    raise ValueError(f"Unknown pool champion: {e['champion']!r}")
                pool[r_norm].append(
                    PoolEntry(champion_id=c.id, champion_key=c.key, tier=e.get("tier", "B"))
                )

    state = DraftState(
        my_team=setup.get("my_team", "blue"),
        my_role=role,
        my_pick_order=setup.get("my_pick_order", 1),
        bans=bans,
        ally_picks=ally_picks,
        enemy_picks=enemy_picks,
    )
    return DraftRequest(draft_state=state, champion_pool=pool)


def find_rank(recs: List, name: str) -> Tuple[Optional[int], Optional[Any]]:
    """Locate a champion in the recommendations by name or key (lenient match)."""
    target = name.lower()
    cleaned = target.replace("'", "").replace(" ", "").replace(".", "")
    for i, r in enumerate(recs):
        if r.champion_name.lower() == target or r.champion_key.lower() == target:
            return i, r
        if r.champion_key.lower() == cleaned:
            return i, r
    return None, None


def evaluate_assertion(a: Dict[str, Any], recs: List) -> Tuple[bool, str]:
    """Return (passed, message)."""
    t = a["type"]

    if t == "must_be_top_1":
        rank, _ = find_rank(recs, a["champion"])
        if rank == 0:
            return True, f"{a['champion']} is #1"
        if rank is None:
            return False, f"{a['champion']} not in recommendations"
        return False, f"{a['champion']} is #{rank + 1}, expected #1"

    if t == "must_be_in_top_3":
        rank, _ = find_rank(recs, a["champion"])
        if rank is not None and rank < 3:
            return True, f"{a['champion']} is #{rank + 1}"
        if rank is None:
            return False, f"{a['champion']} not in top 15"
        return False, f"{a['champion']} is #{rank + 1}, expected ≤ 3"

    if t == "must_be_in_top_5":
        rank, _ = find_rank(recs, a["champion"])
        if rank is not None and rank < 5:
            return True, f"{a['champion']} is #{rank + 1}"
        if rank is None:
            return False, f"{a['champion']} not in top 15"
        return False, f"{a['champion']} is #{rank + 1}, expected ≤ 5"

    if t == "must_not_be_top_3":
        rank, _ = find_rank(recs, a["champion"])
        if rank is None or rank >= 3:
            location = "absent" if rank is None else f"#{rank + 1}"
            return True, f"{a['champion']} is {location}"
        return False, f"{a['champion']} is #{rank + 1}, must not be in top 3"

    if t == "must_rank_higher_than":
        rank_a, _ = find_rank(recs, a["champion_a"])
        rank_b, _ = find_rank(recs, a["champion_b"])
        if rank_a is None:
            return False, f"{a['champion_a']} not in recommendations"
        if rank_b is None:
            return True, f"{a['champion_a']} #{rank_a + 1}, {a['champion_b']} absent"
        if rank_a < rank_b:
            return True, f"{a['champion_a']} #{rank_a + 1} > {a['champion_b']} #{rank_b + 1}"
        return False, f"{a['champion_a']} #{rank_a + 1} <= {a['champion_b']} #{rank_b + 1}"

    if t == "must_have_score_above":
        _, rec = find_rank(recs, a["champion"])
        if rec is None:
            return False, f"{a['champion']} not in recommendations"
        threshold = a["min_score"]
        if rec.total_score >= threshold:
            return True, f"{a['champion']} score={rec.total_score} >= {threshold}"
        return False, f"{a['champion']} score={rec.total_score} < {threshold}"

    if t == "must_not_have_reason_containing":
        # Asserts a specific recommendation has no reason whose text contains
        # the given substring. Used to verify e.g. "Lane favorable contre X"
        # is not emitted when X has an ambiguous role.
        _, rec = find_rank(recs, a["champion"])
        if rec is None:
            return False, f"{a['champion']} not in recommendations"
        needle = a["substring"]
        for r in rec.reasons:
            if needle in r.text:
                return False, f"{a['champion']} reason contains {needle!r}: {r.text!r}"
        return True, f"{a['champion']} no reason contains {needle!r}"

    if t == "must_have_reason_containing":
        _, rec = find_rank(recs, a["champion"])
        if rec is None:
            return False, f"{a['champion']} not in recommendations"
        needle = a["substring"]
        for r in rec.reasons:
            if needle in r.text:
                return True, f"{a['champion']} reason contains {needle!r}"
        return False, f"{a['champion']} no reason contains {needle!r}"

    return False, f"Unknown assertion type: {t}"


def print_case_report(case: Dict[str, Any], recs: List, results: List[Tuple], verbose: bool) -> None:
    n_pass = sum(1 for _, p, _ in results if p)
    n_total = len(results)

    confidence = case.get("confidence", "")
    confidence_tag = f" {C.YELLOW}[confidence:{confidence}]{C.RESET}" if confidence else ""

    sym = f"{C.GREEN}✓{C.RESET}" if n_pass == n_total else f"{C.RED}✗{C.RESET}"
    print(f"{sym} {C.BOLD}{case['id']}{C.RESET}  ({n_pass}/{n_total}){confidence_tag}")
    print(f"  {C.DIM}{case.get('description', '')}{C.RESET}")

    for a, passed, msg in results:
        if not passed:
            print(f"  {C.RED}✗{C.RESET} {a['type']}: {msg}")
        elif verbose:
            print(f"  {C.GREEN}✓{C.RESET} {a['type']}: {msg}")

    if verbose and recs:
        print(f"  {C.DIM}Top 5:{C.RESET}")
        for i, r in enumerate(recs[:5]):
            wildcard = " (wildcard)" if not r.is_pool_champion else ""
            print(f"    {i + 1}. {r.champion_name:<18} {r.total_score:>5.1f}{wildcard}")
    print()


async def run_case(case: Dict[str, Any], engine: DraftEngine, db: ChampionDatabase) -> Tuple[List, List[Tuple]]:
    request = build_request(case["setup"], db)
    response = await engine.recommend(request)
    recs = response.recommendations
    results = [(a, *evaluate_assertion(a, recs)) for a in case["assertions"]]
    return recs, results


async def main() -> int:
    parser = argparse.ArgumentParser(description="DALIA draft engine calibration suite.")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show top 5 of each case + passed assertions")
    parser.add_argument("--filter", "-f", help="Only run cases in this category (e.g. blind_pick)")
    parser.add_argument(
        "--cases",
        default=str(Path(__file__).parent / "cases.json"),
        help="Path to cases JSON file (default: cases.json next to this script)",
    )
    args = parser.parse_args()

    cases_path = Path(args.cases)
    if not cases_path.exists():
        print(f"{C.RED}Cases file not found: {cases_path}{C.RESET}")
        return 1

    cases = json.loads(cases_path.read_text(encoding="utf-8"))
    if args.filter:
        cases = [c for c in cases if c.get("category") == args.filter]
        if not cases:
            print(f"{C.YELLOW}No cases match category '{args.filter}'{C.RESET}")
            return 1

    print(f"{C.CYAN}{C.BOLD}DALIA Calibration Suite{C.RESET}")
    print(f"{C.DIM}Loading champion data (first run hits DDragon, subsequent runs use cache)...{C.RESET}\n")

    fetcher = LolalyticsFetcher()
    db = ChampionDatabase(fetcher)
    try:
        await db.initialize()
    except Exception as exc:
        print(f"{C.RED}Failed to initialize champion database: {exc}{C.RESET}")
        await fetcher.close()
        return 2

    engine = DraftEngine(db, fetcher)

    by_category: Dict[str, Dict[str, int]] = defaultdict(lambda: {"pass": 0, "total": 0})
    total_pass = 0
    total_assertions = 0

    try:
        for case in cases:
            cat = case.get("category", "uncategorized")
            try:
                recs, results = await run_case(case, engine, db)
            except Exception as exc:
                n_assertions = len(case.get("assertions", []))
                by_category[cat]["total"] += n_assertions
                total_assertions += n_assertions
                print(f"{C.RED}✗ {case['id']} — ERROR: {exc}{C.RESET}")
                print(f"{C.DIM}{traceback.format_exc()}{C.RESET}")
                continue

            print_case_report(case, recs, results, args.verbose)

            for _, passed, _ in results:
                by_category[cat]["total"] += 1
                total_assertions += 1
                if passed:
                    by_category[cat]["pass"] += 1
                    total_pass += 1
    finally:
        await fetcher.close()

    pct = (total_pass / total_assertions * 100.0) if total_assertions else 0.0

    print(f"{C.BOLD}{'═' * 60}{C.RESET}")
    print(f"{C.BOLD}By category:{C.RESET}")
    for cat in sorted(by_category):
        stats = by_category[cat]
        cat_pct = (stats["pass"] / stats["total"] * 100.0) if stats["total"] else 0.0
        col = C.GREEN if cat_pct >= 80 else (C.YELLOW if cat_pct >= 60 else C.RED)
        print(f"  {col}{cat:<22s} {stats['pass']:>3}/{stats['total']:<3}  ({cat_pct:5.1f}%){C.RESET}")

    col = C.GREEN if pct >= 80 else (C.YELLOW if pct >= 60 else C.RED)
    print(f"\n{C.BOLD}Global:{C.RESET} {col}{total_pass}/{total_assertions} assertions passed ({pct:.1f}%){C.RESET}")

    return 0 if total_pass == total_assertions else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
