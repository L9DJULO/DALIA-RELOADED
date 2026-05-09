#!/usr/bin/env python
"""DALIA — Pro concordance runner.

Loads pro_cases.json, calls the DALIA draft engine for each case (in-process,
no HTTP), and measures how often the engine's recommendations align with the
champion the real pro team actually picked.

This is the "ground truth" calibration loop. Higher concordance = engine is
agreeing with elite drafters more often. (Pros pick sub-optimally too, see
the README — interpret absolute numbers carefully.)

Usage:
  python run_pro_concordance.py
  python run_pro_concordance.py --league LEC --role mid
  python run_pro_concordance.py --limit 200 --json-out report.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

# ── Bootstrap: make `app` importable (mirror run_calibration.py) ──────────
SERVER_DIR = Path(__file__).resolve().parent.parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from app.models.draft import DraftPick, DraftRequest, DraftState, PoolEntry  # noqa: E402
from app.services.champion_data import ChampionDatabase  # noqa: E402
from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402
from app.services.draft_engine import DraftEngine  # noqa: E402

logger = logging.getLogger("dalia.pro_concordance")

DEFAULT_CASES = Path(__file__).resolve().parent / "pro_cases.json"

# Sentinel rank used when the pro's pick is not in DALIA's top 15.
# Average rank is reported with this floor; "missed" rate is reported separately
# so readers can disentangle the two.
MISS_SENTINEL_RANK = 16


# ─── ANSI colours ────────────────────────────────────────────────────────
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"


def _colorize(value: float, *, bands=(60.0, 40.0, 25.0)) -> str:
    """Green/yellow/red based on hit-rate-ish percentages."""
    high, mid, low = bands
    if value >= high:
        return C.GREEN
    if value >= mid:
        return C.YELLOW
    if value >= low:
        return C.YELLOW
    return C.RED


# ─── Champion-name resolution ────────────────────────────────────────────
# Leaguepedia uses Riot's display names but a few diverge from DDragon's
# `name`/`key` lookup. We tolerate punctuation/spaces (`resolve_champion`)
# and add a hard alias map for the legendary outliers.
LP_TO_DDRAGON_KEY = {
    "Wukong": "MonkeyKing",
    "Nunu & Willump": "Nunu",
    "Renata Glasc": "Renata",
}


def resolve_champion(db: ChampionDatabase, name: str):
    if not name:
        return None
    if name in LP_TO_DDRAGON_KEY:
        c = db.get_by_key(LP_TO_DDRAGON_KEY[name])
        if c:
            return c
    c = db.get_by_name(name) or db.get_by_key(name)
    if c:
        return c
    cleaned = name.replace("'", "").replace(" ", "").replace(".", "").replace("&", "")
    return db.get_by_key(cleaned) or db.get_by_name(cleaned)


# ─── Build engine request from a case ────────────────────────────────────
def build_request(setup: Dict[str, Any], db: ChampionDatabase) -> Optional[DraftRequest]:
    role = setup["my_role"]
    if not role:
        return None

    def pick_for(role_name: str, champ_name: str) -> Optional[DraftPick]:
        c = resolve_champion(db, champ_name)
        if not c:
            return None
        return DraftPick(champion_id=c.id, champion_key=c.key, role=role_name)

    ally_picks: List[DraftPick] = []
    for r, n in (setup.get("ally_picks") or {}).items():
        p = pick_for(r, n)
        if p is None:
            return None
        ally_picks.append(p)

    enemy_picks: List[DraftPick] = []
    for r, n in (setup.get("enemy_picks") or {}).items():
        p = pick_for(r, n)
        if p is None:
            return None
        enemy_picks.append(p)

    bans: List[int] = []
    for n in setup.get("bans") or []:
        c = resolve_champion(db, n)
        if c:
            bans.append(c.id)
        # Unresolved bans are silently dropped — pros sometimes ban
        # off-meta picks that DDragon under one of the recent renames; the
        # ban set is rarely load-bearing for our metric.

    state = DraftState(
        my_team=setup.get("my_team", "blue"),
        my_role=role,
        my_pick_order=setup.get("my_pick_order", 1),
        bans=bans,
        ally_picks=ally_picks,
        enemy_picks=enemy_picks,
    )
    # Empty pool → engine falls back to "all champions playable in role",
    # which is exactly the open universe pros draft from.
    return DraftRequest(draft_state=state, champion_pool={})


def find_rank(recs: List, expected_id: int, expected_key: str) -> Optional[int]:
    for i, r in enumerate(recs):
        if r.champion_id == expected_id or r.champion_key == expected_key:
            return i
    return None


# ─── Aggregation ─────────────────────────────────────────────────────────
class Aggregator:
    """Accumulates ranks and emits aggregate metrics, with breakdowns."""

    def __init__(self) -> None:
        self.ranks: List[int] = []  # raw ranks, MISS_SENTINEL for misses
        self.hit_top1 = 0
        self.hit_top3 = 0
        self.hit_top5 = 0
        self.hit_top10 = 0
        self.misses = 0
        self.total = 0
        self.dim_buckets: Dict[Tuple[str, str], "Aggregator"] = {}

    def record(self, rank: Optional[int], dims: Dict[str, str]) -> None:
        self.total += 1
        if rank is None:
            self.misses += 1
            self.ranks.append(MISS_SENTINEL_RANK)
        else:
            self.ranks.append(rank + 1)  # store as 1-indexed
            if rank == 0:
                self.hit_top1 += 1
            if rank < 3:
                self.hit_top3 += 1
            if rank < 5:
                self.hit_top5 += 1
            if rank < 10:
                self.hit_top10 += 1

        for dim_name, dim_val in dims.items():
            sub = self.dim_buckets.setdefault((dim_name, dim_val), Aggregator())
            sub.total += 1
            if rank is None:
                sub.misses += 1
                sub.ranks.append(MISS_SENTINEL_RANK)
            else:
                sub.ranks.append(rank + 1)
                if rank == 0:
                    sub.hit_top1 += 1
                if rank < 3:
                    sub.hit_top3 += 1
                if rank < 5:
                    sub.hit_top5 += 1
                if rank < 10:
                    sub.hit_top10 += 1

    def metrics(self) -> Dict[str, float]:
        if self.total == 0:
            return {
                "total": 0, "top_1": 0.0, "top_3": 0.0, "top_5": 0.0,
                "top_10": 0.0, "miss_rate": 0.0, "avg_rank": 0.0,
            }
        return {
            "total": self.total,
            "top_1": 100.0 * self.hit_top1 / self.total,
            "top_3": 100.0 * self.hit_top3 / self.total,
            "top_5": 100.0 * self.hit_top5 / self.total,
            "top_10": 100.0 * self.hit_top10 / self.total,
            "miss_rate": 100.0 * self.misses / self.total,
            "avg_rank": float(mean(self.ranks)) if self.ranks else 0.0,
        }


# ─── Reporting ───────────────────────────────────────────────────────────
def print_global(agg: Aggregator) -> None:
    m = agg.metrics()
    print(f"\n{C.BOLD}{'═' * 70}{C.RESET}")
    print(f"{C.BOLD}Pro concordance — global ({m['total']} cases){C.RESET}")
    print(f"{C.BOLD}{'═' * 70}{C.RESET}")

    rows = [
        ("Top-1 hit rate",  m["top_1"]),
        ("Top-3 hit rate",  m["top_3"]),
        ("Top-5 hit rate",  m["top_5"]),
        ("Top-10 hit rate", m["top_10"]),
    ]
    for label, val in rows:
        col = _colorize(val)
        print(f"  {label:<22} {col}{val:>6.2f}%{C.RESET}")
    print(f"  {'Miss rate (>15)':<22} {C.DIM}{m['miss_rate']:>6.2f}%{C.RESET}")
    print(f"  {'Average rank':<22} {C.DIM}{m['avg_rank']:>6.2f}{C.RESET}  "
          f"{C.DIM}(misses count as {MISS_SENTINEL_RANK}){C.RESET}")


def print_breakdown(agg: Aggregator, dim_name: str, *, sort_by: str = "label") -> None:
    rows = [
        (label, sub.metrics())
        for (dn, label), sub in agg.dim_buckets.items()
        if dn == dim_name
    ]
    if not rows:
        return

    if sort_by == "top_3":
        rows.sort(key=lambda r: -r[1]["top_3"])
    else:
        rows.sort(key=lambda r: str(r[0]))

    print(f"\n{C.BOLD}By {dim_name}:{C.RESET}")
    print(f"  {'Bucket':<14} {'N':>6}  {'Top-1':>7} {'Top-3':>7} {'Top-5':>7} {'Top-10':>7}  {'Miss':>6}  {'AvgR':>6}")
    print(f"  {C.DIM}{'─' * 70}{C.RESET}")
    for label, m in rows:
        col1 = _colorize(m["top_1"], bands=(35.0, 22.0, 12.0))  # top-1 is harder
        col3 = _colorize(m["top_3"])
        print(
            f"  {str(label):<14} {m['total']:>6}  "
            f"{col1}{m['top_1']:>6.1f}%{C.RESET} "
            f"{col3}{m['top_3']:>6.1f}%{C.RESET} "
            f"{m['top_5']:>6.1f}% {m['top_10']:>6.1f}%  "
            f"{C.DIM}{m['miss_rate']:>5.1f}%{C.RESET}  "
            f"{C.DIM}{m['avg_rank']:>6.2f}{C.RESET}"
        )


# ─── CLI ─────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Run DALIA against pro draft cases.")
    ap.add_argument("--cases", default=str(DEFAULT_CASES))
    ap.add_argument("--league", help="Filter cases to a single league (e.g. LEC).")
    ap.add_argument("--patch", help="Filter cases to a single patch (e.g. 26.8).")
    ap.add_argument("--role", help="Filter cases to a single role (top/jungle/mid/bot/support).")
    ap.add_argument("--phase", choices=("blind", "adaptive", "counter"), help="Filter by draft phase.")
    ap.add_argument("--limit", type=int, default=None, help="Max cases to evaluate.")
    ap.add_argument("--json-out", default=None, help="Write a machine-readable report.")
    ap.add_argument("--verbose", "-v", action="store_true", help="Stream per-case progress.")
    return ap.parse_args()


def filter_cases(cases: List[Dict[str, Any]], args: argparse.Namespace) -> List[Dict[str, Any]]:
    out = cases
    if args.league:
        out = [c for c in out if c.get("league") == args.league]
    if args.patch:
        out = [c for c in out if c.get("patch") == args.patch]
    if args.role:
        out = [c for c in out if c.get("role") == args.role]
    if args.phase:
        out = [c for c in out if c.get("phase") == args.phase]
    if args.limit:
        out = out[: args.limit]
    return out


async def main() -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
    args = parse_args()

    cases_path = Path(args.cases)
    if not cases_path.exists():
        print(f"{C.RED}Cases file not found: {cases_path}{C.RESET}")
        print(f"{C.DIM}Run scraper.py and generate_test_cases.py first.{C.RESET}")
        return 1

    cases: List[Dict[str, Any]] = json.loads(cases_path.read_text(encoding="utf-8"))
    cases = filter_cases(cases, args)
    if not cases:
        print(f"{C.YELLOW}No cases match the filters.{C.RESET}")
        return 1

    print(f"{C.CYAN}{C.BOLD}DALIA — Pro Concordance{C.RESET}")
    print(f"{C.DIM}Cases: {len(cases)}  source: {cases_path.name}{C.RESET}\n")

    fetcher = LolalyticsFetcher()
    db = ChampionDatabase(fetcher)
    try:
        await db.initialize()
    except Exception as exc:
        print(f"{C.RED}Failed to init champion DB: {exc}{C.RESET}")
        await fetcher.close()
        return 2
    engine = DraftEngine(db, fetcher)

    agg = Aggregator()
    unresolved_target = 0
    unresolved_setup = 0
    detail: List[Dict[str, Any]] = []
    started = time.monotonic()

    try:
        for idx, case in enumerate(cases, start=1):
            request = build_request(case["setup"], db)
            if request is None:
                unresolved_setup += 1
                continue

            target_champ = resolve_champion(db, case["expected_champion"])
            if target_champ is None:
                unresolved_target += 1
                continue

            try:
                response = await engine.recommend(request)
            except Exception as exc:
                logger.warning("Engine error on %s: %s", case.get("case_id"), exc)
                continue

            rank = find_rank(response.recommendations, target_champ.id, target_champ.key)

            dims = {
                "role":       case.get("role") or "?",
                "league":     case.get("league") or "?",
                "patch":      case.get("patch") or "?",
                "pick_order": str(case.get("global_pick_order") or "?"),
                "phase":      case.get("phase") or "?",
            }
            agg.record(rank, dims)

            if args.json_out:
                detail.append({
                    "case_id": case["case_id"],
                    "expected": case["expected_champion"],
                    "rank": (rank + 1) if rank is not None else None,
                    "top1": response.recommendations[0].champion_name if response.recommendations else None,
                    **dims,
                })

            if args.verbose and idx % 25 == 0:
                m = agg.metrics()
                print(
                    f"{C.DIM}[{idx}/{len(cases)}] top-3={m['top_3']:.1f}% "
                    f"avg_rank={m['avg_rank']:.2f} miss={m['miss_rate']:.1f}%{C.RESET}"
                )
    finally:
        await fetcher.close()

    elapsed = time.monotonic() - started
    print(f"{C.DIM}Evaluated {agg.total} cases in {elapsed:.1f}s "
          f"(unresolved target={unresolved_target}, setup={unresolved_setup}){C.RESET}")

    print_global(agg)
    print_breakdown(agg, "role")
    print_breakdown(agg, "league")
    print_breakdown(agg, "patch")
    print_breakdown(agg, "phase")
    print_breakdown(agg, "pick_order")

    if args.json_out:
        report = {
            "summary": agg.metrics(),
            "by_role":       {label: sub.metrics() for (dn, label), sub in agg.dim_buckets.items() if dn == "role"},
            "by_league":     {label: sub.metrics() for (dn, label), sub in agg.dim_buckets.items() if dn == "league"},
            "by_patch":      {label: sub.metrics() for (dn, label), sub in agg.dim_buckets.items() if dn == "patch"},
            "by_phase":      {label: sub.metrics() for (dn, label), sub in agg.dim_buckets.items() if dn == "phase"},
            "by_pick_order": {label: sub.metrics() for (dn, label), sub in agg.dim_buckets.items() if dn == "pick_order"},
            "unresolved": {"target": unresolved_target, "setup": unresolved_setup},
            "cases": detail,
        }
        Path(args.json_out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n{C.DIM}Wrote machine-readable report → {args.json_out}{C.RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
