"""Strategic edge-case evaluator.

Loads `app/data/edge_cases.json` (rules) and `app/data/champion_tags.json`
(curated kit-pattern tags). For each candidate champion the engine asks
us to score, we walk every rule whose `champion` matches and evaluate
its `trigger` against the current draft state. The first matching rule
with the highest `score_bonus` wins — only one edge case fires per
candidate, the most impactful one.

Triggers supported:

  - enemy_comp_has_n_of_tag       {tag, min_count}
  - ally_comp_has_n_of_tag        {tag, min_count}
  - enemy_comp_no_tag             {tag}
  - enemy_comp_damage_ratio       {ad_min_percent? | ap_min_percent?}
  - enemy_comp_all_squishy        {max_tankiness?: int=2}
  - enemy_has_specific_champion   {champion}
  - ally_has_specific_champion    {champion}
  - enemy_comp_immobile_count     {min_count}
  - enemy_comp_no_engage          {}
  - ally_comp_min_size            {min_count}
  - pick_order_is_last            {}
  - pick_order_is_first           {}

Reason templates support the placeholders {n} (count of matched picks),
{champions} (matched champion display names, comma-joined), {ad_pct} /
{ap_pct} (percentages, 0-100 ints), {ally} (single ally name when one
specific ally drove the trigger).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.models.champion import Champion
from app.models.draft import DraftPick, DraftState
from app.services.champion_data import ChampionDatabase

logger = logging.getLogger("dalia.edge_cases")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EDGE_CASES_PATH = DATA_DIR / "edge_cases.json"
CHAMPION_TAGS_PATH = DATA_DIR / "champion_tags.json"


def _norm_key(s: str) -> str:
    return s.replace("'", "").replace(" ", "").replace(".", "").lower()


class EdgeCaseEvaluator:
    """Evaluate strategic edge-case rules against a draft state."""

    def __init__(self, db: ChampionDatabase):
        self.db = db
        self._rules: List[Tuple[str, Dict[str, Any]]] = []  # (rule_id, rule)
        self._rules_by_champ: Dict[str, List[Tuple[str, Dict[str, Any]]]] = {}
        self._tags_by_champ: Dict[str, set] = {}  # normalised key → set of tag names
        self._load()

    # ── Loading ─────────────────────────────────────────────────────────
    def _load(self) -> None:
        # Tags
        if CHAMPION_TAGS_PATH.exists():
            try:
                raw = json.loads(CHAMPION_TAGS_PATH.read_text(encoding="utf-8"))
                for tag, champs in raw.items():
                    if tag.startswith("_") or not isinstance(champs, list):
                        continue
                    for c in champs:
                        nk = _norm_key(c)
                        self._tags_by_champ.setdefault(nk, set()).add(tag)
            except Exception as exc:
                logger.warning("Failed to load champion_tags.json: %s", exc)

        # Rules
        if EDGE_CASES_PATH.exists():
            try:
                raw = json.loads(EDGE_CASES_PATH.read_text(encoding="utf-8"))
                for rid, rule in raw.items():
                    if rid.startswith("_") or not isinstance(rule, dict):
                        continue
                    if "champion" not in rule or "trigger" not in rule:
                        continue
                    self._rules.append((rid, rule))
                    self._rules_by_champ.setdefault(_norm_key(rule["champion"]), []).append((rid, rule))
            except Exception as exc:
                logger.warning("Failed to load edge_cases.json: %s", exc)

        logger.info(
            "Loaded %d edge-case rules, %d tagged champions",
            len(self._rules), len(self._tags_by_champ),
        )

    # ── Helpers ─────────────────────────────────────────────────────────
    def has_tag(self, champ: Champion, tag: str) -> bool:
        nk = _norm_key(champ.key)
        return tag in self._tags_by_champ.get(nk, set())

    def _picks_with_tag(self, picks: List[DraftPick], tag: str) -> List[Champion]:
        out: List[Champion] = []
        for p in picks:
            if p.champion_id is None:
                continue
            c = self.db.get_by_id(p.champion_id)
            if c and self.has_tag(c, tag):
                out.append(c)
        return out

    @staticmethod
    def _enemy_damage_pct(picks: List[DraftPick], db: ChampionDatabase) -> Tuple[float, float]:
        """Return (ad_pct, ap_pct) of the enemy comp, 0-100 each. Ignores true_dmg
        and unknown picks. Returns (0, 0) when no champions are revealed."""
        ad = ap = 0.0
        n = 0
        for p in picks:
            if p.champion_id is None:
                continue
            c = db.get_by_id(p.champion_id)
            if not c:
                continue
            ad += c.damage.physical
            ap += c.damage.magical
            n += 1
        if n == 0:
            return 0.0, 0.0
        return ad / n, ap / n

    def _is_immobile(self, champ: Champion) -> bool:
        # Curated tag wins; otherwise heuristic on dash_blink absence.
        if self.has_tag(champ, "immobile"):
            return True
        if self.has_tag(champ, "dash_blink"):
            return False
        # Fall back to ratings: low engage/burst movement suggests immobile.
        return champ.ratings.engage <= 2 and "Marksman" in champ.tags

    def _has_engage(self, champ: Champion) -> bool:
        if self.has_tag(champ, "engage_primary"):
            return True
        return champ.ratings.engage >= 4

    # ── Evaluation ──────────────────────────────────────────────────────
    def evaluate(
        self, candidate: Champion, draft: DraftState
    ) -> Optional[Dict[str, Any]]:
        """Return the highest-bonus matching edge case for this candidate, or None.

        Returns a dict: {
          "rule_id": str,
          "score_bonus": float,
          "reason_text": str,   # already formatted with placeholders
          "reason_kind": str,
          "champions": List[str],
        }
        """
        rules = self._rules_by_champ.get(_norm_key(candidate.key))
        if not rules:
            return None

        best: Optional[Dict[str, Any]] = None
        for rid, rule in rules:
            outcome = self._eval_rule(rule, draft)
            if outcome is None:
                continue
            bonus = float(rule.get("score_bonus", 0)) * 1.5  # TEST 1: +50% global boost
            if best is None or bonus > best["score_bonus"]:
                kind = rule.get("reason_kind", "info")
                template = rule.get("reason_text", "")
                text = self._format_reason(template, outcome)
                best = {
                    "rule_id": rid,
                    "score_bonus": bonus,
                    "reason_text": text,
                    "reason_kind": kind,
                    "champions": outcome.get("names", []),
                }
        return best

    def _eval_rule(self, rule: Dict[str, Any], draft: DraftState) -> Optional[Dict[str, Any]]:
        """Return the trigger context dict if matched, else None."""
        trig = rule.get("trigger", {})
        t = trig.get("type")

        if t == "enemy_comp_has_n_of_tag":
            tag = trig.get("tag")
            n_min = int(trig.get("min_count", 1))
            matches = self._picks_with_tag(draft.enemy_picks, tag)
            if len(matches) >= n_min:
                return {"n": len(matches), "names": [c.name for c in matches]}
            return None

        if t == "ally_comp_has_n_of_tag":
            tag = trig.get("tag")
            n_min = int(trig.get("min_count", 1))
            matches = self._picks_with_tag(draft.ally_picks, tag)
            if len(matches) >= n_min:
                names = [c.name for c in matches]
                return {"n": len(matches), "names": names, "ally": names[0]}
            return None

        if t == "enemy_comp_no_tag":
            tag = trig.get("tag")
            matches = self._picks_with_tag(draft.enemy_picks, tag)
            # Need at least 3 enemies revealed before claiming "no X" is meaningful
            revealed = sum(1 for p in draft.enemy_picks if p.champion_id is not None)
            if revealed >= 3 and not matches:
                return {"n": 0, "names": []}
            return None

        if t == "enemy_comp_damage_ratio":
            ad_min = trig.get("ad_min_percent")
            ap_min = trig.get("ap_min_percent")
            ad_pct, ap_pct = self._enemy_damage_pct(draft.enemy_picks, self.db)
            revealed = sum(1 for p in draft.enemy_picks if p.champion_id is not None)
            if revealed < 3:
                return None  # not enough info
            if ad_min is not None and ad_pct >= float(ad_min):
                return {"ad_pct": int(round(ad_pct)), "ap_pct": int(round(ap_pct))}
            if ap_min is not None and ap_pct >= float(ap_min):
                return {"ad_pct": int(round(ad_pct)), "ap_pct": int(round(ap_pct))}
            return None

        if t == "enemy_comp_all_squishy":
            max_t = int(trig.get("max_tankiness", 2))
            picks = [p for p in draft.enemy_picks if p.champion_id is not None]
            if len(picks) < 3:
                return None
            squishy_names: List[str] = []
            for p in picks:
                c = self.db.get_by_id(p.champion_id)
                if not c or c.ratings.tankiness > max_t or "Tank" in c.tags:
                    return None
                squishy_names.append(c.name)
            return {"n": len(squishy_names), "names": squishy_names}

        if t == "enemy_has_specific_champion":
            target = _norm_key(trig.get("champion", ""))
            for p in draft.enemy_picks:
                if p.champion_id is None:
                    continue
                c = self.db.get_by_id(p.champion_id)
                if c and _norm_key(c.key) == target:
                    return {"n": 1, "names": [c.name], "ally": c.name}
            return None

        if t == "ally_has_specific_champion":
            target = _norm_key(trig.get("champion", ""))
            for p in draft.ally_picks:
                if p.champion_id is None:
                    continue
                c = self.db.get_by_id(p.champion_id)
                if c and _norm_key(c.key) == target:
                    return {"n": 1, "names": [c.name], "ally": c.name}
            return None

        if t == "enemy_comp_immobile_count":
            n_min = int(trig.get("min_count", 3))
            matches: List[Champion] = []
            for p in draft.enemy_picks:
                if p.champion_id is None:
                    continue
                c = self.db.get_by_id(p.champion_id)
                if c and self._is_immobile(c):
                    matches.append(c)
            if len(matches) >= n_min:
                return {"n": len(matches), "names": [c.name for c in matches]}
            return None

        if t == "enemy_comp_no_engage":
            picks = [p for p in draft.enemy_picks if p.champion_id is not None]
            if len(picks) < 3:
                return None
            for p in picks:
                c = self.db.get_by_id(p.champion_id)
                if c and self._has_engage(c):
                    return None
            return {"n": 0, "names": []}

        if t == "ally_comp_min_size":
            n_min = int(trig.get("min_count", 1))
            picks = [p for p in draft.ally_picks if p.champion_id is not None]
            if len(picks) >= n_min:
                names = []
                for p in picks:
                    c = self.db.get_by_id(p.champion_id)
                    if c:
                        names.append(c.name)
                return {"n": len(names), "names": names, "ally": names[0] if names else ""}
            return None

        if t == "pick_order_is_last":
            return {"n": 0, "names": []} if draft.is_last_pick else None

        if t == "pick_order_is_first":
            no_enemies = not any(p.champion_id is not None for p in draft.enemy_picks)
            no_allies = not any(p.champion_id is not None for p in draft.ally_picks)
            if draft.my_pick_order == 1 and no_enemies and no_allies:
                return {"n": 0, "names": []}
            return None

        return None

    # ── Formatting ──────────────────────────────────────────────────────
    @staticmethod
    def _format_reason(template: str, ctx: Dict[str, Any]) -> str:
        try:
            return template.format(
                n=ctx.get("n", 0),
                champions=", ".join(ctx.get("names", [])) or "—",
                ad_pct=ctx.get("ad_pct", 0),
                ap_pct=ctx.get("ap_pct", 0),
                ally=ctx.get("ally", ""),
            )
        except Exception:
            return template
