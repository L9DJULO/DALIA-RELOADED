#!/usr/bin/env python
"""DALIA — Popularity baseline for the pro concordance suite.

Answers the question a concordance number cannot answer on its own: is the
engine better than not thinking? For each case, rank the champions playable in
the role by soloqueue pick rate, drop the ones already picked or banned, keep
the top 15 (the same truncation the engine's output gets), and look up where
the pro's actual champion lands.

Same cases, same truncation, same metrics as run_pro_concordance.py — only the
ranking rule changes. Two more rules are reported alongside:

  pick_rate  — "play what everyone plays"
  win_rate   — "play what wins in soloqueue", which is what meta_term consumes
  random     — the floor, computed analytically rather than sampled

Usage:
  python run_pro_concordance.py --json-out engine.json   # the engine
  python run_popularity_baseline.py                      # the controls
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional

SERVER_DIR = Path(__file__).resolve().parent.parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from app.services.champion_data import ChampionDatabase  # noqa: E402
from app.services.data_fetcher import LolalyticsFetcher  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_pro_concordance import (  # noqa: E402
    MISS_SENTINEL_RANK, resolve_champion,
)

# The engine returns `scored[:15]` (draft_engine.py), and the suite counts
# anything past that as a miss. The controls are truncated identically or the
# comparison would be rigged.
TOP_N = MISS_SENTINEL_RANK - 1

ROLES = ("top", "jungle", "mid", "bot", "support")


async def role_rankings(db: ChampionDatabase, fetcher: LolalyticsFetcher) -> Dict[str, Dict[str, List[int]]]:
    """Champion ids per role, ordered by pick rate and by win rate."""
    rankings: Dict[str, Dict[str, List[int]]] = {}
    for role in ROLES:
        raw = await fetcher.fetch_tierlist(role=role)
        rows = fetcher.parse_tierlist(raw)
        playable = {c.id for c in db.champions_for_role(role)}
        rows = [r for r in rows if r["champion_id"] in playable]
        rankings[role] = {
            "pick_rate": [r["champion_id"] for r in sorted(rows, key=lambda r: -r["pick_rate"])],
            "win_rate": [r["champion_id"] for r in sorted(rows, key=lambda r: -r["win_rate"])],
            "universe": [r["champion_id"] for r in rows],
        }
    return rankings


def taken_ids(db: ChampionDatabase, setup: Dict[str, Any]) -> set:
    """Champions the drafter can no longer pick: every lock-in, plus the bans."""
    taken = set()
    for group in ("ally_picks", "enemy_picks"):
        for name in (setup.get(group) or {}).values():
            c = resolve_champion(db, name)
            if c:
                taken.add(c.id)
    for name in setup.get("bans") or []:
        c = resolve_champion(db, name)
        if c:
            taken.add(c.id)
    return taken


def rank_of(order: List[int], taken: set, target_id: int) -> Optional[int]:
    """1-indexed rank in the truncated shortlist, or None when it misses."""
    shortlist = [cid for cid in order if cid not in taken][:TOP_N]
    return shortlist.index(target_id) + 1 if target_id in shortlist else None


class Tally:
    def __init__(self, label: str):
        self.label = label
        self.ranks: List[int] = []
        self.hits = {1: 0, 3: 0, 5: 0, 10: 0}
        self.misses = 0

    def record(self, rank: Optional[int]) -> None:
        if rank is None:
            self.misses += 1
            self.ranks.append(MISS_SENTINEL_RANK)
            return
        self.ranks.append(rank)
        for n in self.hits:
            if rank <= n:
                self.hits[n] += 1

    def row(self) -> Dict[str, float]:
        n = len(self.ranks) or 1
        return {"n": len(self.ranks),
                **{f"top_{k}": 100.0 * v / n for k, v in self.hits.items()},
                "miss_rate": 100.0 * self.misses / n,
                "avg_rank": mean(self.ranks) if self.ranks else 0.0}


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cases", default=str(Path(__file__).resolve().parent / "pro_cases.json"))
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--json-out", default=None)
    args = ap.parse_args()

    cases: List[Dict[str, Any]] = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    if args.limit:
        cases = cases[: args.limit]

    fetcher = LolalyticsFetcher()
    db = ChampionDatabase(fetcher)
    await db.initialize()
    rankings = await role_rankings(db, fetcher)

    tallies = {"pick_rate": Tally("pick rate"), "win_rate": Tally("win rate")}
    universe_sizes: List[int] = []
    skipped = 0

    for case in cases:
        setup = case["setup"]
        role = setup.get("my_role")
        target = resolve_champion(db, case["expected_champion"])
        if not role or role not in rankings or target is None:
            skipped += 1
            continue
        taken = taken_ids(db, setup)
        universe_sizes.append(len([c for c in rankings[role]["universe"] if c not in taken]))
        for rule, tally in tallies.items():
            tally.record(rank_of(rankings[role][rule], taken, target.id))

    await fetcher.close()

    # The floor: with a uniformly random shortlist of TOP_N out of `universe`
    # candidates, the chance the pro's pick lands in the first k is k/universe.
    universe = mean(universe_sizes) if universe_sizes else 0.0
    random_row = {"n": len(universe_sizes),
                  **{f"top_{k}": 100.0 * min(k, universe) / universe if universe else 0.0
                     for k in (1, 3, 5, 10)},
                  "miss_rate": 100.0 * max(0.0, universe - TOP_N) / universe if universe else 0.0,
                  "avg_rank": 0.0}

    report = {"cases": len(cases), "skipped": skipped, "avg_universe": universe,
              "rules": {name: t.row() for name, t in tallies.items()} | {"random": random_row}}

    print(f"DALIA — Concordance controls ({len(cases)} cases, {skipped} skipped)")
    print(f"Average candidate universe per decision: {universe:.1f} champions\n")
    header = f"  {'Rule':<14}{'N':>6}{'Top-1':>8}{'Top-3':>8}{'Top-5':>8}{'Top-10':>8}{'Miss':>8}{'AvgR':>8}"
    print(header)
    print("  " + "-" * (len(header) - 2))
    for name, row in report["rules"].items():
        avg = f"{row['avg_rank']:>8.2f}" if row["avg_rank"] else f"{'—':>8}"
        print(f"  {name:<14}{row['n']:>6}{row['top_1']:>7.1f}%{row['top_3']:>7.1f}%"
              f"{row['top_5']:>7.1f}%{row['top_10']:>7.1f}%{row['miss_rate']:>7.1f}%{avg}")

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nWrote {args.json_out}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
