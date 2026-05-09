#!/usr/bin/env python
"""DALIA — Generate pro-concordance test cases from scraped drafts.

For every pick in every game in pro_drafts.json, reconstruct the engine's
view at that exact moment (which picks/bans are locked, who is picking, in
which role) and store the pro's actual choice as the "expected answer".

Output: pro_cases.json — a flat list of cases, each shaped to be replayable
by run_pro_concordance.py.

Usage:
  python generate_test_cases.py
  python generate_test_cases.py --input custom_drafts.json --output custom_cases.json
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("dalia.pro_cases")

DEFAULT_INPUT = Path(__file__).resolve().parent / "pro_drafts.json"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "pro_cases.json"


def _phase(pick_order: int, picks_in_order: List[Dict[str, Any]]) -> str:
    """Classify the strategic context of a pick.

    Mirrors the engine's branching in _score_candidate:
      • blind     — picker has zero enemy info (pick_order 1, sometimes 2)
      • adaptive  — partial enemy info, neither blind nor last
      • counter   — last pick of the entire draft (full info, free counter)
    """
    if pick_order == len(picks_in_order):
        return "counter"
    # First pick of the entire draft is always blind.
    if pick_order == 1:
        return "blind"
    # Inside the draft, "blind for me" depends on whether any enemy is locked.
    # Pick order maps as follows under the standard sequence:
    #   1 → blue blind, 2 → red sees 1 enemy, 3 → red sees 1 enemy, etc.
    # We classify pick 2 as 'blind' because the picker only sees one enemy
    # and historically counter-pick logic doesn't kick in yet.
    if pick_order == 2:
        return "blind"
    return "adaptive"


def _team_pick_order(team: str, pick_order: int, picks: List[Dict[str, Any]]) -> int:
    """1-indexed position of this pick within its own team."""
    count = 0
    for p in picks:
        if p["team"] != team:
            continue
        count += 1
        if p["pick_order"] == pick_order:
            return count
    return count or 1


def _build_case(draft: Dict[str, Any], pick_index: int) -> Optional[Dict[str, Any]]:
    """Reconstruct the engine view just before pick `pick_index` (0-based)."""
    picks = draft.get("picks_in_order") or []
    if pick_index < 0 or pick_index >= len(picks):
        return None

    target = picks[pick_index]
    role = target.get("role")
    if not role:
        # Without a role we can't ask DALIA for a recommendation.
        return None

    locked_before = picks[:pick_index]
    my_team = target["team"]
    enemy_team = "red" if my_team == "blue" else "blue"

    ally_picks: Dict[str, str] = {}
    enemy_picks: Dict[str, str] = {}
    seen_roles: Set[str] = set()
    for p in locked_before:
        # If multiple picks share a role inside one team (shouldn't happen
        # in a well-formed draft, but guards against wiki anomalies), keep
        # the first to avoid the engine's role-based dedup blowing up.
        side_role_key = f"{p['team']}|{p.get('role')}"
        if side_role_key in seen_roles:
            continue
        seen_roles.add(side_role_key)
        if not p.get("role"):
            continue
        if p["team"] == my_team:
            ally_picks[p["role"]] = p["champion"]
        else:
            enemy_picks[p["role"]] = p["champion"]

    setup = {
        "my_team": my_team,
        "my_role": role,
        "my_pick_order": _team_pick_order(my_team, target["pick_order"], picks),
        "ally_picks": ally_picks,
        "enemy_picks": enemy_picks,
        "bans": list(draft.get("bans") or []),
        # No champion_pool — DALIA falls back to the full role pool, which is
        # exactly what we want here (we're measuring "given full availability,
        # which champion would you have picked?").
        "champion_pool": None,
    }

    return {
        "case_id": f"{draft['game_id']}__pick{target['pick_order']}",
        "game_id": draft["game_id"],
        "league": draft.get("league"),
        "patch": draft.get("patch"),
        "tournament": draft.get("tournament"),
        "blue_team": draft.get("blue_team"),
        "red_team": draft.get("red_team"),
        "winner": draft.get("winner"),
        "global_pick_order": target["pick_order"],
        "team_side": my_team,
        "role": role,
        "phase": _phase(target["pick_order"], picks),
        "expected_champion": target["champion"],
        "setup": setup,
    }


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Generate pro-concordance cases.")
    ap.add_argument("--input", default=str(DEFAULT_INPUT))
    ap.add_argument("--output", default=str(DEFAULT_OUTPUT))
    return ap.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()

    in_path = Path(args.input)
    if not in_path.exists():
        logger.error("Input not found: %s — run scraper.py first.", in_path)
        return 1

    drafts: List[Dict[str, Any]] = json.loads(in_path.read_text(encoding="utf-8"))
    logger.info("Loaded %d drafts from %s", len(drafts), in_path)

    cases: List[Dict[str, Any]] = []
    skipped_no_role = 0
    skipped_malformed = 0
    for draft in drafts:
        picks = draft.get("picks_in_order") or []
        if len(picks) != 10:
            skipped_malformed += 1
            continue
        for i in range(len(picks)):
            case = _build_case(draft, i)
            if case is None:
                skipped_no_role += 1
                continue
            cases.append(case)

    out_path = Path(args.output)
    out_path.write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(
        "Wrote %d cases → %s (skipped %d picks for missing role; %d games malformed)",
        len(cases), out_path, skipped_no_role, skipped_malformed,
    )

    # Sanity histogram by role + phase.
    by_role: Dict[str, int] = {}
    by_phase: Dict[str, int] = {}
    for c in cases:
        by_role[c["role"]] = by_role.get(c["role"], 0) + 1
        by_phase[c["phase"]] = by_phase.get(c["phase"], 0) + 1
    logger.info("By role:  %s", by_role)
    logger.info("By phase: %s", by_phase)
    return 0


if __name__ == "__main__":
    sys.exit(main())
