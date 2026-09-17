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
import math
import sys
import traceback
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Le rapport utilise des symboles hors cp1252 (OK, KO, ~) : sans cela, un run Windows
# meurt d'UnicodeEncodeError au premier cas qui echoue.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# ── Bootstrap: make the `app` package importable ─────────────────────────
SERVER_DIR = Path(__file__).resolve().parent.parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import frozen_cache  # noqa: E402
import snapshot  # noqa: E402

from app.config import config  # noqa: E402
from app.models.draft import DraftPick, DraftRequest, DraftState, PoolEntry  # noqa: E402
from app.scoring.aggregate import comparison_sd  # noqa: E402
from app.scoring.types import RANKS  # noqa: E402
from app.services.champion_data import ChampionDatabase  # noqa: E402
from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402
from app.services.draft_engine import DraftEngine  # noqa: E402

# Le snapshot gelé vit à côté du cache vivant, et n'est pas versionné.
FROZEN_DIR = SERVER_DIR / "app" / "data" / "cache-frozen"

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
    return DraftRequest(draft_state=state, champion_pool=pool, rank_bucket=setup.get("rank_bucket"))


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

    if t == "must_have_advantage_above":
        _, rec = find_rank(recs, a["champion"])
        if rec is None:
            return False, f"{a['champion']} not in recommendations"
        threshold = a["min_advantage"]
        if rec.total_score >= threshold:
            return True, f"{a['champion']} advantage={rec.total_score:+.2f} >= {threshold:+.2f}"
        return False, f"{a['champion']} advantage={rec.total_score:+.2f} < {threshold:+.2f}"

    if t == "must_be_tied":
        _, ra = find_rank(recs, a["champion_a"])
        _, rb = find_rank(recs, a["champion_b"])
        if ra is None or rb is None:
            return False, "one of the champions is not in recommendations"
        combined = (ra.score_sd ** 2 + rb.score_sd ** 2) ** 0.5
        gap = abs(ra.total_score - rb.total_score)
        if gap < combined:
            return True, f"gap {gap:.2f} < combined sd {combined:.2f}"
        return False, f"gap {gap:.2f} >= combined sd {combined:.2f}"

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


# Boundary slot index tested by each position assertion.
_BOUNDARY_SLOT = {"must_be_top_1": 0, "must_be_in_top_3": 2,
                  "must_be_in_top_5": 4, "must_not_be_top_3": 2}


def assertion_separation(a: Dict[str, Any], recs: List) -> Optional[Tuple[float, float, str]]:
    """Observed gap and combined uncertainty for an ordering assertion.

    Used for triage: an assertion whose gap stays within the combined
    uncertainty poses a question the data cannot decide, regardless of the
    engine. The uncertainty is that of the comparison between the two
    champions' terms (`comparison_sd`), not the sum of their absolute
    uncertainties — shared heuristic error cancels between two champions
    instead of being double-counted. Returns None for assertions that are
    not about ordering (reasons, explicit tie) and when a champion is
    absent from the top 15.
    """
    t = a["type"]

    if t == "must_rank_higher_than":
        _, ra = find_rank(recs, a["champion_a"])
        _, rb = find_rank(recs, a["champion_b"])
        if ra is None or rb is None:
            return None
        gap = abs(ra.total_score - rb.total_score)
        combined = comparison_sd(ra.breakdown.terms, rb.breakdown.terms)
        return gap, combined, f"{a['champion_a']} vs {a['champion_b']}"

    if t in _BOUNDARY_SLOT:
        slot = _BOUNDARY_SLOT[t]
        rank, rec = find_rank(recs, a["champion"])
        if rec is None or len(recs) <= slot:
            return None
        # The champion already occupies the boundary slot: compare it to the next one.
        other = slot if rank != slot else min(slot + 1, len(recs) - 1)
        if other == rank:
            return None
        boundary = recs[other]
        gap = abs(rec.total_score - boundary.total_score)
        combined = comparison_sd(rec.breakdown.terms, boundary.breakdown.terms)
        return gap, combined, f"{a['champion']} vs #{other + 1} {boundary.champion_name}"

    if t == "must_have_advantage_above":
        _, rec = find_rank(recs, a["champion"])
        if rec is None:
            return None
        return (abs(rec.total_score - a["min_advantage"]), rec.score_sd,
                f"{a['champion']} vs threshold {a['min_advantage']:+.2f}")

    return None


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
            print(f"    {i + 1}. {r.champion_name:<18} {r.total_score:>+6.2f} ±{r.score_sd:.2f}{wildcard}")
    print()


def print_case_diagnosis(case: Dict[str, Any], recs: List, results: List[Tuple]) -> List[str]:
    """Prints the decidability of each assertion. Returns one verdict per assertion."""
    verdicts: List[str] = []
    print(f"{C.BOLD}{case['id']}{C.RESET} {C.DIM}[{case.get('category', '?')}]{C.RESET}")
    for (a, passed, message) in results:
        sep = assertion_separation(a, recs)
        if sep is None:
            verdicts.append("hors_ordre")
            print(f"  {C.DIM}·{C.RESET} {a['type']}: out of triage scope")
            continue
        gap, combined, label = sep
        if gap < combined:
            verdicts.append("indecidable")
            print(f"  {C.YELLOW}~{C.RESET} {label}: gap {gap:.2f} < uncertainty {combined:.2f} "
                  f"{C.YELLOW}UNDECIDABLE -> must_be_tied{C.RESET}")
        elif passed:
            verdicts.append("decidable_ok")
            print(f"  {C.GREEN}✓{C.RESET} {label}: gap {gap:.2f} >= {combined:.2f} — kept")
        else:
            verdicts.append("decidable_ko")
            print(f"  {C.RED}✗{C.RESET} {label}: gap {gap:.2f} >= {combined:.2f} "
                  f"{C.RED}ARBITRATION{C.RESET} — {message}")
    return verdicts


async def run_case(case: Dict[str, Any], engine: DraftEngine, db: ChampionDatabase) -> Tuple[List, List[Tuple]]:
    request = build_request(case["setup"], db)
    response = await engine.recommend(request)
    recs = response.recommendations
    results = [(a, *evaluate_assertion(a, recs)) for a in case["assertions"]]
    return recs, results


def validate_rank(rank: str) -> Optional[str]:
    """None if rank is a value the engine recognises, else an error message listing the accepted ones."""
    if rank in RANKS:
        return None
    return f"Unknown rank {rank!r}. Accepted values: {', '.join(RANKS)}"


def build_fetcher(frozen_dir: Path, live: bool = False):
    """Le fetcher du run, plus le mode qui l'a produit (pour le bandeau)."""
    mode = frozen_cache.resolve(frozen_dir, live=live)
    return LolalyticsFetcher(**mode.fetcher_kwargs()), mode


async def freeze_live_cache(frozen_dir: Path, tier: Optional[str]) -> int:
    """Prend le snapshot du cache vivant et sort. Le baseline devient rejouable."""
    fetcher = LolalyticsFetcher()
    try:
        version = await fetcher.get_ddragon_version()
    except Exception:
        version = ""
    finally:
        await fetcher.close()
    manifest = frozen_cache.freeze(Path(config.cache_dir), frozen_dir,
                                   ddragon_version=version, tier=tier or fetcher.TIER)
    print(f"{C.GREEN}Cache gelé : {manifest['entries']} entrées copiées vers {frozen_dir}{C.RESET}")
    print(f"{C.DIM}Data Dragon {version or '?'}, tier {manifest['tier']}. "
          f"Les runs suivants l'utiliseront par défaut.{C.RESET}")
    return 0


async def main() -> int:
    parser = argparse.ArgumentParser(description="DALIA draft engine calibration suite.")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show top 5 of each case + passed assertions")
    parser.add_argument("--filter", "-f", help="Only run cases in this category (e.g. blind_pick)")
    parser.add_argument(
        "--cases",
        default=str(Path(__file__).parent / "cases.json"),
        help="Path to cases JSON file (default: cases.json next to this script)",
    )
    parser.add_argument("--rank", help="Player rank applied to all cases without an explicit rank_bucket "
                                       "(iron, bronze, silver, gold, platinum, emerald, diamond, master_plus)")
    parser.add_argument("--diagnose", action="store_true",
                        help="Sort ordering assertions by decidability instead of judging pass/fail")
    parser.add_argument("--freeze-cache", action="store_true",
                        help="Snapshot the live cache into cache-frozen/ and exit")
    parser.add_argument("--live-cache", action="store_true",
                        help="Ignore the frozen snapshot and read the live cache (data may drift)")
    parser.add_argument("--snapshot", metavar="PATH",
                        help="Record every case's full ranking and assertion verdicts to PATH")
    parser.add_argument("--compare", metavar="PATH",
                        help="Replay and report what moved since the snapshot at PATH")
    args = parser.parse_args()

    if args.freeze_cache:
        return await freeze_live_cache(FROZEN_DIR, args.rank)

    if args.rank:
        error = validate_rank(args.rank)
        if error:
            print(f"{C.RED}{error}{C.RESET}")
            return 1

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

    if args.rank:
        for case in cases:
            case.setdefault("setup", {}).setdefault("rank_bucket", args.rank)

    print(f"{C.CYAN}{C.BOLD}DALIA Calibration Suite{C.RESET}")
    fetcher, cache_mode = build_fetcher(FROZEN_DIR, live=args.live_cache)
    colour = C.GREEN if cache_mode.offline else C.YELLOW
    print(f"{colour}{cache_mode.banner()}{C.RESET}")
    print(f"{C.DIM}Loading champion data...{C.RESET}\n")

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
    diagnosis: List[str] = []
    snapshot_cases: Dict[str, Any] = {}

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

            if args.diagnose:
                diagnosis.extend(print_case_diagnosis(case, recs, results))
            else:
                print_case_report(case, recs, results, args.verbose)

            if args.snapshot or args.compare:
                snapshot_cases[case["id"]] = snapshot.case_entry(recs, results)

            for _, passed, _ in results:
                by_category[cat]["total"] += 1
                total_assertions += 1
                if passed:
                    by_category[cat]["pass"] += 1
                    total_pass += 1
    finally:
        await fetcher.close()

    if args.snapshot or args.compare:
        taken = snapshot.build(args.rank, cache_mode.manifest, snapshot_cases)
        if args.snapshot:
            snapshot.write(Path(args.snapshot), taken)
            print()
            print(f"{C.GREEN}Snapshot écrit : {args.snapshot} "
                  f"({len(snapshot_cases)} cas){C.RESET}")
        if args.compare:
            diff = snapshot.compare(snapshot.read(Path(args.compare)), taken)
            colour = C.RED if diff["cache_mismatch"] else C.CYAN
            print()
            print(f"{C.BOLD}Comparaison avec {args.compare}{C.RESET}")
            print(f"{colour}{snapshot.format_report(diff)}{C.RESET}")

    if args.diagnose:
        counts = Counter(diagnosis)
        print(f"\n{C.BOLD}Assertion triage{C.RESET}")
        print(f"  undecidable (-> must_be_tied)   : {counts['indecidable']}")
        print(f"  decidable passing (kept)        : {counts['decidable_ok']}")
        print(f"  {C.RED}decidable failing (arbitration) : {counts['decidable_ko']}{C.RESET}")
        print(f"  out of triage scope             : {counts['hors_ordre']}")
        return 0

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
