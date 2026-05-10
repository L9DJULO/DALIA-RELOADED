"""Draft engine — the brain of DALIA.

Combines all sub-analyzers to produce ranked champion recommendations.

Scoring formula (non-linear):
  1. Compute weighted sum of sub-scores
  2. Apply multiplicative penalties for critically bad sub-scores
     (bad matchups / bad comp / risky blind pick tank the total)

Sub-scores (each 0-100):
  • meta        – current patch strength (WR, PR, BR)
  • matchup     – performance vs revealed enemies (lane opponent weighted ×3)
  • synergy     – performance with revealed allies
  • composition – team balance (AD/AP, tank, CC, engage …)
  • mastery     – user's self-rated comfort / tier
  • draft_risk  – safety of picking now (counter exposure)

Also produces "wild-card" suggestions outside the user's pool.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import config
from app.models.champion import Champion
from app.models.draft import (
    BanSuggestion,
    DraftRequest,
    DraftResponse,
    DraftState,
    MatchupDetail,
    MLExplanation,
    PoolEntry,
    Recommendation,
    ScoreBreakdown,
    SynergyDetail,
)
from app.services.champion_data import ChampionDatabase
from app.services.composition import CompositionAnalyzer
from app.services.composition_archetype import (
    Archetype,
    ArchetypeResult,
    archetype_counter_adjust,
    detect_archetype,
    summarise as summarise_archetype,
)
from app.services.data_fetcher import LolalyticsFetcher
from app.services.edge_cases import EdgeCaseEvaluator
from app.services.matchup import MatchupAnalyzer
from app.services.meta_analyzer import MetaAnalyzer
from app.services.reasons import generate_reasons, generate_verdict
from app.services.role_inference import (
    MONO_ROLE_THRESHOLD,
    infer_enemy_roles,
    most_likely_role,
)
from app.services.synergy import SynergyAnalyzer

# ML predictor — optional, loads silently if model not available
try:
    from app.ml.predictor import MLPredictor
except ImportError:
    MLPredictor = None  # type: ignore

logger = logging.getLogger("dalia.engine")

TIER_TO_MASTERY = {"S": 90, "A": 72, "B": 55, "C": 38, "D": 10}

# Champions that are catastrophic to blind-pick: they lose hard to specific
# counters that the enemy can simply lock in once they see the pick. They
# may still be S-tier in matchup rolls, but in blind they're a coin flip
# at best. Penalised by -20 on total score when <2 enemies are visible.
# Combined with any per-champion blind_pick_penalty from champion_overrides.json
# (we look it up per-candidate inside _score_candidate).
HIGH_RISK_BLIND = {
    "Yasuo", "Yone", "Katarina", "Zed", "Akali",
    "Fizz", "Qiyana", "Nidalee", "Kindred",
}
HIGH_RISK_BLIND_PENALTY = 20.0

# Path to the same overrides file used by ChampionDatabase. Looked up here
# (additionally to roles/damage/ratings consumption in champion_data.py) so
# we can read optional blind_pick_penalty entries without round-tripping
# through the Champion model. Lazy-loaded and cached at module level.
_OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "champion_overrides.json"
_overrides_cache: Optional[Dict[str, Any]] = None


def _load_overrides_lower() -> Dict[str, Any]:
    """Load champion_overrides.json once, keyed by lowercase champion key."""
    global _overrides_cache
    if _overrides_cache is not None:
        return _overrides_cache
    try:
        if _OVERRIDES_PATH.exists():
            raw = json.loads(_OVERRIDES_PATH.read_text(encoding="utf-8"))
            _overrides_cache = {k.lower(): v for k, v in raw.items() if isinstance(v, dict)}
        else:
            _overrides_cache = {}
    except Exception as exc:
        logger.warning("Failed to load champion_overrides.json: %s", exc)
        _overrides_cache = {}
    return _overrides_cache


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


class DraftEngine:
    """Main recommendation engine."""

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher
        self.meta = MetaAnalyzer(champion_db, fetcher)
        self.matchup = MatchupAnalyzer(champion_db, fetcher)
        self.synergy = SynergyAnalyzer(champion_db, fetcher)
        self.composition = CompositionAnalyzer(champion_db)
        self.edge_cases = EdgeCaseEvaluator(champion_db)

        # ML predictor — optional
        self.ml = None
        if MLPredictor is not None:
            try:
                self.ml = MLPredictor(champion_db)
                if not self.ml.is_available():
                    self.ml = None
            except Exception:
                self.ml = None

    # ── Public API ───────────────────────────────────────────────────────
    async def recommend(self, request: DraftRequest, personal_svc=None) -> DraftResponse:
        """Compute draft recommendations for the given state + user pool."""
        draft = request.draft_state
        pool = request.champion_pool
        role = draft.my_role

        # ── Infer enemy role distributions ──
        # The LCU never reveals enemy positions in ranked. We compute a
        # probabilistic distribution per enemy (constraint-propagated when
        # mono-role champions are visible) and store it on the DraftState.
        # The matchup analyzer reads this to compute weighted matchup
        # scores; reasons.py reads it to gate "Lane favorable" wording.
        # We also collapse each distribution to its argmax role for
        # downstream code paths that still expect a single role.
        if any(p.champion_id for p in draft.enemy_picks):
            distributions = infer_enemy_roles(draft.enemy_picks, self.db)
            draft.role_distributions = distributions
            for ep in draft.enemy_picks:
                if ep.champion_id is None:
                    continue
                if ep.role:
                    # Manual slot assignment always takes priority over inference.
                    # Ensure role_distributions reflects the pinned role at 1.0.
                    draft.role_distributions[ep.champion_id] = {ep.role: 1.0}
                    continue
                top_role = most_likely_role(distributions.get(ep.champion_id, {}))
                if top_role:
                    ep.role = top_role
                    logger.info(
                        "Inferred enemy role for %s: %s (dist=%s)",
                        (self.db.get_by_id(ep.champion_id).name
                         if self.db.get_by_id(ep.champion_id) else ep.champion_id),
                        top_role,
                        distributions.get(ep.champion_id, {}),
                    )

            # ── Validate: warn on duplicate inferred roles ──
            # After collapsing distributions, two champions may still share a role
            # (e.g. Mundo + Darius both inferred as top). The first pick's role wins;
            # the second's role is cleared so downstream code doesn't see a conflict.
            _role_seen: Dict[str, int] = {}
            for ep in draft.enemy_picks:
                if ep.champion_id is None or not ep.role:
                    continue
                if ep.role in _role_seen:
                    first = self.db.get_by_id(_role_seen[ep.role])
                    this  = self.db.get_by_id(ep.champion_id)
                    logger.warning(
                        "Duplicate role %s: %s and %s both assigned — clearing inferred role for %s",
                        ep.role,
                        first.name if first else _role_seen[ep.role],
                        this.name  if this  else ep.champion_id,
                        this.name  if this  else ep.champion_id,
                    )
                    ep.role = None
                else:
                    _role_seen[ep.role] = ep.champion_id

        # ── Inject ally pre-picks for synergy/composition ──
        # When allies are hovering champions (pre-pick intent),
        # use those as virtual ally picks so synergy & comp analysis
        # accounts for the likely team composition
        prepick_injected = []
        if draft.ally_prepicks:
            filled_roles = draft.ally_roles_filled
            for pp in draft.ally_prepicks:
                if (
                    pp.champion_id
                    and pp.role
                    and pp.role not in filled_roles
                    and pp.champion_id not in draft.all_unavailable_ids
                ):
                    from app.models.draft import DraftPick
                    draft.ally_picks.append(DraftPick(
                        champion_id=pp.champion_id,
                        champion_key=pp.champion_key,
                        role=pp.role,
                    ))
                    prepick_injected.append(pp)
                    filled_roles.add(pp.role)
                    champ = self.db.get_by_id(pp.champion_id)
                    champ_name = champ.name if champ else str(pp.champion_id)
                    logger.info(
                        "Injected ally pre-pick: %s (%s)",
                        champ_name, pp.role,
                    )

        # ── Pre-load personal stats if puuid available ──
        personal_boost_fn = None
        if personal_svc and request.puuid:
            await personal_svc.get_personal_stats(
                puuid=request.puuid,
                region=request.region or "EUW1",
            )
            personal_boost_fn = lambda cid, r: personal_svc.get_champion_score_boost(
                request.puuid, cid, r
            )

        # Merge weight overrides
        weights = config.weights.model_copy()
        if request.weight_overrides:
            for k, v in request.weight_overrides.items():
                if hasattr(weights, k):
                    setattr(weights, k, v)

        # ── DuoQ synergy boost ──
        # When DuoQ is active, massively increase synergy weight (0.05 → 0.18)
        # and reduce meta slightly to compensate
        duo_active = request.duo_active and request.duo_partner_role
        duo_partner_role = request.duo_partner_role
        duo_partner_pool = request.duo_partner_pool or {}
        duo_injected = False

        if duo_active:
            weights.synergy = max(weights.synergy, 0.18)
            # Slightly reduce meta to keep total near 1.0
            weights.meta = max(weights.meta - 0.05, 0.05)
            logger.info(
                f"DuoQ active — synergy boosted to {weights.synergy}, "
                f"partner role: {duo_partner_role}"
            )

            # If the partner's role slot is empty in ally picks,
            # inject the partner's top champion as a virtual ally pick
            # so synergy is calculated against their likely pick
            try:
                partner_role_filled = any(
                    p.role == duo_partner_role and p.champion_id
                    for p in draft.ally_picks
                )
                if not partner_role_filled and duo_partner_role in duo_partner_pool:
                    partner_entries = duo_partner_pool[duo_partner_role]
                    if partner_entries:
                        # Use the highest-tier champion from partner's pool
                        tier_order = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4}
                        best = min(partner_entries, key=lambda e: tier_order.get(e.tier, 5))
                        # Only inject if not already banned/picked
                        if best.champion_id not in draft.all_unavailable_ids:
                            from app.models.draft import DraftPick
                            draft.ally_picks.append(DraftPick(
                                champion_id=best.champion_id,
                                champion_key=best.champion_key,
                                role=duo_partner_role,
                            ))
                            duo_injected = True
                            logger.info(
                                f"DuoQ: injected partner's {best.champion_key} "
                                f"({duo_partner_role}) as virtual ally"
                            )
            except Exception as exc:
                logger.warning("DuoQ partner injection failed: %s", exc)
                # Continue without injection — don't crash recommendations

        # 1. Pre-load meta for the relevant role
        await self.meta.load_tierlist(role)

        # ── Detect enemy composition archetype (poke / engage / kite / …) ──
        # Done once here, then passed into _score_candidate so every candidate
        # is evaluated against the same enemy read. We skip MIXED cases —
        # archetype_counter_adjust() already returns 1.0 for MIXED, but
        # short-circuiting keeps logs clean.
        enemy_champs: List[Champion] = []
        for ep in draft.enemy_picks:
            if ep.champion_id is not None:
                c = self.db.get_by_id(ep.champion_id)
                if c:
                    enemy_champs.append(c)
        enemy_archetype = detect_archetype(enemy_champs)
        if enemy_archetype.primary != Archetype.MIXED:
            logger.info(
                "Enemy archetype detected: %s (conf %.2f, %d picks)",
                enemy_archetype.primary.value,
                enemy_archetype.confidence,
                enemy_archetype.picks_revealed,
            )

        # 2. Gather candidates from user pool
        pool_entries = pool.get(role, [])
        if not pool_entries:
            all_for_role = self.db.champions_for_role(role)
            pool_entries = [PoolEntry(champion_id=c.id, champion_key=c.key, tier="D") for c in all_for_role]

        # Filter out banned & already picked
        unavailable = draft.all_unavailable_ids
        candidates = [pe for pe in pool_entries if pe.champion_id not in unavailable]

        # 3. Score each candidate
        scored: List[Recommendation] = []
        for entry in candidates:
            champ = self.db.get_by_id(entry.champion_id)
            if not champ:
                continue

            rec = await self._score_candidate(
                champ, entry, draft, role, weights, personal_boost_fn,
                enemy_archetype=enemy_archetype,
            )
            scored.append(rec)

        # 4. Wild-card suggestions (off-pool)
        wildcards = await self._wild_card_suggestions(
            draft, role, weights, unavailable, pool_entries,
            enemy_archetype=enemy_archetype,
        )
        scored.extend(wildcards)

        # Sort descending by total score
        scored.sort(key=lambda r: r.total_score, reverse=True)

        # ── Post-scoring normalization: prevent late-draft score inflation ──
        # When all enemies are visible (≥ 4 picks revealed or is_last_pick),
        # every pool champion benefits from high matchup + synergy scores,
        # and the bonus cap still allows good picks to reach 85-92. But if
        # several picks simultaneously score 90-95, the shortlist looks flat
        # (97/96/95/95/94 — meaningless). Apply a shift-and-compress so the
        # winner sits at ≤ TARGET_CEIL and the spread is readable.
        #
        # The algorithm:
        #   1. Shift the whole distribution down so the best pick = TARGET_CEIL.
        #      (preserves all relative distances — no false precision.)
        #   2. Only fires when the top is genuinely over-inflated (> INFLATE_THRESH)
        #      AND there's enough enemy info to justify the normalization.
        #
        # This is intentionally conservative: we only nudge, never fan out.
        # If champions are genuinely close (72 vs 74 vs 75), they stay close
        # — the shift just moves 75→ TARGET_CEIL, 74→TARGET_CEIL-1, 72→TARGET_CEIL-3.
        if scored:
            n_enemy_visible = sum(1 for e in draft.enemy_picks if e.champion_id)
            # Choose ceiling based on how much info we have
            if draft.is_last_pick or n_enemy_visible >= 4:
                target_ceil   = 92.0
                inflate_thresh = 92.0
            elif n_enemy_visible >= 2:
                target_ceil   = 95.0
                inflate_thresh = 95.0
            else:
                target_ceil   = 98.0   # no normalization when mostly blind
                inflate_thresh = 99.0

            s_top = scored[0].total_score
            if s_top > inflate_thresh:
                shift = s_top - target_ceil
                logger.info(
                    "Score normalization: shifting shortlist down by %.1f "
                    "(top was %.1f → %.1f, %d enemies visible)",
                    shift, s_top, target_ceil, n_enemy_visible,
                )
                for rec in scored:
                    rec.total_score = round(_clamp(rec.total_score - shift, 5.0, 98.0), 1)

        # 5. Team composition summary (from current allies only, without candidate)
        comp_summary: Dict[str, float] = {}
        global_warnings: List[str] = []
        ally_champs = []
        for ap in draft.ally_picks:
            if ap.champion_id is not None:
                c = self.db.get_by_id(ap.champion_id)
                if c:
                    ally_champs.append(c)

        if ally_champs:
            comp_summary = self.composition.team_summary_from_list(
                ally_champs, draft, candidate_role=role
            )
            if scored:
                top = self.db.get_by_id(scored[0].champion_id)
                if top:
                    comp_warns = self.composition.warnings(top, draft)
                    global_warnings = [w.message for w in comp_warns]

        # 6. Win probability from ML model (best recommendation)
        win_prob = None
        if self.ml is not None and scored:
            top_rec = scored[0]
            if top_rec.breakdown.ml_explanation and top_rec.breakdown.ml_explanation.win_probability:
                win_prob = round(top_rec.breakdown.ml_explanation.win_probability * 100, 1)

        # 7. Ban suggestions — 4 parallel strategies, top 3 across all
        ban_suggestions = await self._compute_ban_suggestions(
            draft=draft,
            pool=pool,
            unavailable=unavailable,
        )

        return DraftResponse(
            recommendations=scored[:15],
            team_composition_summary=comp_summary,
            warnings=global_warnings,
            win_probability=win_prob,
            duo_synergy_boost=duo_active,
            ban_suggestions=ban_suggestions,
        )

    # ── Scoring pipeline (non-linear) ────────────────────────────────────
    async def _score_candidate(
        self,
        champ: Champion,
        entry: PoolEntry,
        draft: DraftState,
        role: str,
        weights,
        personal_boost_fn=None,
        enemy_archetype: Optional[ArchetypeResult] = None,
        is_pool: bool = True,
    ) -> Recommendation:
        # Sub-scores
        meta_s   = self.meta.score(champ.id, role)
        match_s  = await self.matchup.score(champ.id, role, draft)
        syn_s    = await self.synergy.score(champ.id, role, draft)
        comp_s   = self.composition.score(champ, draft)
        mast_s   = float(TIER_TO_MASTERY.get(entry.tier, 50))
        risk_s   = await self._draft_risk(champ, role, draft)

        # ML prediction (optional — only if model is trained and loaded)
        ml_s = 50.0
        ml_expl = None
        if self.ml is not None:
            ml_s, ml_expl_raw = self.ml.score_with_explanation(champ.id, role, draft)
            ml_expl = MLExplanation(**ml_expl_raw)

        # ── Determine draft context early (needed for weight adjustment) ──
        has_enemies = len([e for e in draft.enemy_picks if e.champion_id]) > 0
        has_allies  = len([a for a in draft.ally_picks if a.champion_id]) > 0

        # ── Dynamic weight redistribution for blind pick ──
        # When no enemies/allies are visible, matchup/synergy return a
        # flat neutral 50 for ALL champions → zero differentiation.
        # Without redistribution, mastery tier dominates the ranking
        # (Tier S = 90 vs Tier A = 72 → +3.6 pts) and champions like
        # Nilah (S tier, 14 k games) beat Jinx (A tier, Meta S, 100 k games).
        #
        # Fix: redistribute the "dead" matchup/synergy weight toward the
        # sub-scores that actually differentiate in blind-pick scenarios:
        #   • meta   — is the champion strong right now?
        #   • risk   — is the champion safe to blind-pick?
        w_meta    = weights.meta
        w_matchup = weights.matchup
        w_synergy = weights.synergy
        w_comp    = weights.composition
        w_mastery = weights.mastery
        w_risk    = weights.draft_risk

        if not has_enemies:
            # Matchup is uninformative (50 for everyone) — redistribute
            # 60 % → meta (champion strength matters most)
            # 40 % → draft_risk (blind-pick safety)
            w_meta    += w_matchup * 0.60
            w_risk    += w_matchup * 0.40
            w_matchup  = 0.0

        if not has_allies:
            # Synergy is uninformative (50 for everyone) — redistribute
            # 50 % → meta, 50 % → composition
            w_meta    += w_synergy * 0.50
            w_comp    += w_synergy * 0.50
            w_synergy  = 0.0

        # ═════════════════════════════════════════════════════════════════════
        # ── Pick-order weight shaping ──
        # The engine's job changes dramatically depending on WHERE in the
        # draft we are picking. Same champion, same sub-scores — the *right*
        # answer differs. We reshape weights on top of the blind-pick
        # redistribution above.
        #
        # my_pick_order ∈ {1..5} is the 1-indexed position of this pick
        # inside the user's team. Draft phase 1 pick order (20-action
        # sequence) puts:
        #   • pick_order 1      = 1st overall pick (blue side) — hardest blind
        #   • pick_order 2/3    = middle, some info but not all
        #   • pick_order 5      = LAST pick = full info, free counter
        #
        # is_last_pick is the authoritative flag for "I see everything" — it
        # holds when my pick is the final one in the sequence AND my lane
        # opponent is already revealed. my_pick_order alone doesn't catch
        # e.g. a red-side 5th that's still being counter-picked by blue's
        # 5th; `is_last_pick` does.
        # ═════════════════════════════════════════════════════════════════════
        is_first_pick = draft.my_pick_order == 1 and not has_enemies
        is_last_pick  = draft.is_last_pick

        # Track these for the multiplicative bonuses/penalties below
        flex_bonus_active = False
        niche_counter_bonus_active = False
        situational_penalty_active = False

        if is_first_pick:
            # ── FIRST PICK: blind, high counter exposure, high value on flex ──
            # No enemy to counter, no lane opponent revealed. Champions that
            # are counter-proof (flex roles, tanks, high draft_risk safety)
            # are worth a LOT. Champions that only shine in specific matchups
            # are a trap — the enemy will simply pick their counter.
            #
            # Weight changes (documented deltas relative to baseline):
            #   • meta        ×1.15   — meta strength matters more (no matchup signal)
            #   • draft_risk  ×1.40   — safety is the #1 concern blind
            #   • mastery     ×0.85   — a comfort D-tier that gets countered is worse
            #                           than a B-tier flex; de-emphasise tier
            w_meta    *= 1.15
            w_risk    *= 1.40
            w_mastery *= 0.85

            # Flex bonus: a champion playable in ≥ 2 roles is harder to counter
            # because the enemy can't lock a single lane counter. We flag it
            # here; the multiplicative bonus is applied after base is computed.
            if len(champ.roles) >= 2:
                flex_bonus_active = True

            # Situational penalty: single-role + low safety = the champ only
            # works in specific matchups. On 1st pick that's a liability.
            if len(champ.roles) <= 1 and risk_s < 55:
                situational_penalty_active = True

        elif is_last_pick:
            # ── LAST PICK: full info, free counter-pick ──
            # We see every enemy and we know our lane opponent. Meta strength
            # barely matters — a "D-tier" champion that hard-counters their
            # lane opponent can be worth the pick. Flex is useless (no
            # ambiguity to exploit). Safety is also less interesting since
            # there are no more enemy picks coming.
            #
            # Weight changes:
            #   • matchup    ×1.35   — primary signal, we know exactly who we face
            #   • synergy    ×1.10   — full team known, synergy calls are reliable
            #   • meta       ×0.80   — a meta-S champ with bad matchup is worse
            #                          than a B champ with good matchup
            #   • draft_risk ×0.70   — no one left to counter us
            w_matchup *= 1.35
            w_synergy *= 1.10
            w_meta    *= 0.80
            w_risk    *= 0.70

            # Niche counter: match_s very high → reward heavily below
            if match_s >= 62:
                niche_counter_bonus_active = True

        elif draft.my_pick_order >= 4 and has_enemies:
            # ── LATE PICK (4th/5th but not fully last, e.g. red side 3rd) ──
            # We see most of the enemy team. Lean toward matchup, away from
            # pure meta. Lighter than the last-pick shift.
            w_matchup *= 1.15
            w_meta    *= 0.92

        elif draft.my_pick_order <= 2 and has_enemies:
            # ── EARLY-MIDDLE PICK: partial info ──
            # 2nd pick (red P1 / blue P2): see 1 enemy at most. Still a
            # relative blind — keep leaning on meta and risk, but not as
            # hard as a true 1st.
            w_meta *= 1.05
            w_risk *= 1.10

        # ── Role-specific weight multipliers ──
        # Applied last in the weight-shaping pipeline so they compound with
        # (not compete against) blind-pick redistribution and pick-order
        # adjustments. Reflect how the role's strategic context shifts the
        # relative importance of each sub-score:
        #   TOP     — long 1v1 lane, few team interactions → matchup + comp
        #   JUNGLE  — team enabler, global influence → synergy + comp
        #   MID     — short lane + roaming → matchup slightly boosted
        #   BOT     — ADC scales with team; duo-lane is everything → synergy
        #   SUPPORT — pure team role; lane matchup much less relevant
        _rwm = config.role_weight_multipliers.get(role)
        if _rwm:
            w_matchup *= _rwm.matchup
            w_synergy *= _rwm.synergy
            w_comp    *= _rwm.composition
            logger.debug(
                "Role multipliers for %s: matchup×%.2f synergy×%.2f comp×%.2f",
                role, _rwm.matchup, _rwm.synergy, _rwm.composition,
            )

        # ── Bot / Support duo-lane synergy bonus ──
        # When both halves of the duo lane are confirmed allies, the pairwise
        # bot↔support synergy — already computed by the synergy module —
        # deserves extra weight because that duo is the strongest co-ordinated
        # unit in League. Apply an additional ×1.10 on w_synergy so picking
        # the right bot or support given a known partner is meaningfully
        # rewarded over a random pool champion.
        _COMPLEMENTARY: Dict[str, str] = {"bot": "support", "support": "bot"}
        if role in _COMPLEMENTARY and w_synergy > 0:
            _partner_role = _COMPLEMENTARY[role]
            _partner_confirmed = any(
                a.role == _partner_role and a.champion_id
                for a in draft.ally_picks
            )
            if _partner_confirmed:
                w_synergy *= 1.10
                logger.debug(
                    "Duo-lane bonus: w_synergy ×1.10 (%s confirmed as partner)",
                    _partner_role,
                )

        # ── 1. Weighted base ──
        base = (
            w_meta    * meta_s +
            w_matchup * match_s +
            w_synergy * syn_s +
            w_comp    * comp_s +
            w_mastery * mast_s +
            w_risk    * risk_s
        )

        # Blend ML score if available (replaces part of the base)
        # Weight adapts to confidence: high=25%, medium=18%, low=10%
        # Increased weights to give ML more influence on final score
        if self.ml is not None and ml_s != 50.0:
            conf = ml_expl.confidence if ml_expl else "low"
            ml_weight = {"high": 0.25, "medium": 0.18, "low": 0.10}.get(conf, 0.10)
            base = base * (1.0 - ml_weight) + ml_s * ml_weight

        # ── Personal stats boost ──
        # Adjusts score ±15% based on the player's actual ranked
        # performance on this champion (win rate, games played)
        if personal_boost_fn is not None:
            personal_mult = personal_boost_fn(champ.id, role)
            base *= personal_mult

        # ── 2. Multiplicative penalties for critical weaknesses ──

        # Bad matchups tank the score — only penalise genuinely bad matchups
        if match_s < 42 and has_enemies:
            penalty = 0.55 + (match_s / 100.0) * 0.45  # match=40→×0.73, match=30→×0.685
            base *= penalty
            # Catastrophic matchups get a second penalty layer
            if match_s < 28:
                base *= 0.80  # total ×0.55 at match=25

        # Risky blind pick — softer penalty, and exempt when no enemies visible
        # (first pick scenario should not be heavily punished)
        if risk_s < 35 and has_enemies:
            penalty = 0.70 + (risk_s / 100.0) * 0.30  # risk=20 → ×0.76
            base *= penalty

        # ── First pick floor ──
        # When no enemies are visible, scores should stay reasonable.
        # Opponents realistically can't pick 5 counters, so first pick
        # isn't as bad as pure counter analysis suggests.
        if not has_enemies:
            base = max(base, 38.0)  # floor: never below 38 on first pick

        # ── Pre-fetch details once (reused by bonus checks AND the UI output) ──
        # Avoids two separate async round-trips per candidate later.
        mu_details_raw  = await self.matchup.details(champ.id, role, draft) if has_enemies else []
        syn_details_raw = await self.synergy.details(champ.id, role, draft) if has_allies  else []

        # ═══════════════════════════════════════════════════════════════════
        # ── Bonus multiplier pool ──
        # ALL positive multipliers are accumulated in _bonus_mult and capped
        # before being applied to base. This prevents the "bonus cascade"
        # where matchup × multi-counter × synergy × niche-counter × archetype
        # stack to ×1.97+ and push every decent pool champion to 95-98 in
        # last pick. Negative multipliers (situational penalty, archetype
        # counter-penalty) are still applied directly to base so bad picks
        # stay bad regardless of the cap.
        #
        # Per-phase caps (rationale):
        #   is_last_pick  → all sub-scores are informative, so genuine
        #                    differentiation is already in the base; bonuses
        #                    should fine-tune, not inflate. Cap 1.20.
        #   otherwise     → partial info; bonuses fill the information gap.
        #                    Cap 1.28.
        # ═══════════════════════════════════════════════════════════════════
        _bonus_mult = 1.0
        _bonus_cap  = 1.20 if is_last_pick else 1.28

        # ── 3. Good-fit bonus ──
        if match_s >= 55 and has_enemies:
            bonus = 1.0 + (match_s - 50) * 0.007   # was 0.008
            if comp_s >= 70:
                bonus += (comp_s - 70) * 0.002      # was 0.003
            _bonus_mult *= min(bonus, 1.12)          # individual cap 1.12 (was 1.20)

        # ── 3b. MULTI-COUNTER BONUS ──
        # If the candidate has a meaningful edge against 3+ enemies
        # simultaneously, this is the strongest situational signal there is
        # (e.g. Nilah passive vs full auto-attack comp). Boost +8-16 %.
        # We count every enemy where the per-matchup score crosses a
        # threshold derived from API data OR archetype tags (auto-attacker,
        # immobile, engage, etc.), so the bonus fires even when Lolalytics
        # has no direct head-to-head data.
        if has_enemies:
            counter_count = sum(
                1 for d in mu_details_raw
                if d.get("delta", 0.0) >= 2.5
            )
            archetype_counters = self._count_archetype_counters(champ, draft)
            effective_counters = max(counter_count, archetype_counters)

            if effective_counters >= 3:
                # 3 → +8 %, 4 → +12 %, 5 → +16 % (was 0.05/+25%)
                multi_bonus = 1.0 + min(0.04 * effective_counters, 0.16)
                _bonus_mult *= multi_bonus
                logger.debug(
                    "Multi-counter bonus ×%.2f for %s (%d counters)",
                    multi_bonus, champ.name, effective_counters,
                )

        # ── 3c. SYNERGY STACK BONUS ──
        # 2+ strong synergies with allies → meaningful bonus.
        if has_allies:
            strong_syn = sum(
                1 for d in syn_details_raw
                if d.get("delta", 0.0) >= 2.0
            )
            if strong_syn >= 2:
                # 2 → +5 %, 3+ → +8 % cap (was 0.03/+10%)
                syn_bonus = 1.0 + min(0.025 * strong_syn, 0.08)
                _bonus_mult *= syn_bonus

        # ── 4. Enemy-archetype counter adjustment ──
        # archetype_counter_adjust returns ~[0.88, 1.15]. We scale that down
        # by the detection confidence so a shaky read (e.g. 2 picks revealed)
        # doesn't steer the ranking as hard as a locked-in 5-pick read.
        # When no archetype is detected (MIXED) the function returns 1.0 and
        # this is a no-op. Only applied when enemies are actually visible.
        if enemy_archetype is not None and has_enemies and enemy_archetype.primary != Archetype.MIXED:
            raw_adj = archetype_counter_adjust(champ, enemy_archetype.primary)
            adj = 1.0 + (raw_adj - 1.0) * enemy_archetype.confidence
            if adj > 1.0:
                _bonus_mult *= adj   # positive: pooled (subject to cap)
            else:
                base *= adj          # negative: applied directly (bypass cap)

        # ── 5. Pick-order multiplicative bonuses/penalties ──
        if flex_bonus_active:
            _bonus_mult *= 1.05     # was 1.08; flex advantage already in weight shaping

        if situational_penalty_active:
            base *= 0.92            # penalty: not pooled

        if niche_counter_bonus_active:
            # Last pick × strong matchup = archetypal counter-pick use case.
            # Caps at +10 % (was +18 %).
            bonus = 1.0 + min((match_s - 62) * 0.005, 0.10)
            _bonus_mult *= bonus

        # Apply the capped bonus multiplier to base
        base *= min(_bonus_mult, _bonus_cap)

        # ── 6. HIGH-RISK BLIND PENALTY ──
        # Penalise champions known to fold to common counters they can't
        # avoid. Scaling is role-aware: penalty is gated by how much of the
        # threat we can already see in MY role (direct counter risk) and
        # adjacent roles (ganks, lane swaps).
        #   0 enemies in my role        → ×1.0 (full)
        #   1 enemy in my role          → ×0.5
        #   2+ adjacent or full info    → ×0.3
        # Stacks with any per-champion blind_pick_penalty configured in
        # champion_overrides.json.
        ADJACENT_ROLES = {
            "top":     {"jungle"},
            "jungle":  {"top", "mid", "bot", "support"},
            "mid":     {"jungle"},
            "bot":     {"jungle", "support"},
            "support": {"jungle", "bot"},
        }
        my_role = draft.my_role
        in_my_role = sum(
            1 for e in draft.enemy_picks
            if e.champion_id and e.role == my_role
        )
        adj_set = ADJACENT_ROLES.get(my_role, set())
        in_adjacent = sum(
            1 for e in draft.enemy_picks
            if e.champion_id and e.role in adj_set
        )
        total_visible = sum(1 for e in draft.enemy_picks if e.champion_id)

        if in_my_role >= 1:
            blind_scale = 0.5
        elif total_visible >= 4 or in_adjacent >= 2:
            blind_scale = 0.3
        else:
            blind_scale = 1.0

        raw_blind_penalty = 0.0
        if champ.key in HIGH_RISK_BLIND:
            raw_blind_penalty += HIGH_RISK_BLIND_PENALTY
        override_pen = self._get_blind_penalty_override(champ.key)
        if override_pen:
            raw_blind_penalty += override_pen
        if raw_blind_penalty > 0:
            scaled = raw_blind_penalty * blind_scale
            base -= scaled
            logger.debug(
                "Blind-pick penalty -%.1f (raw %.1f × %.2f) on %s "
                "[my_role=%d, adj=%d, total=%d]",
                scaled, raw_blind_penalty, blind_scale, champ.name,
                in_my_role, in_adjacent, total_visible,
            )

        # ── 7. STRATEGIC EDGE-CASE BONUS ──
        # Curated rules from data/edge_cases.json (e.g. Olaf vs 3+ hard CC,
        # Malphite vs 80%+ AD comp, Yasuo with knock-up ally). Only the
        # single highest-bonus matching rule fires per candidate.
        edge_case_match = self.edge_cases.evaluate(champ, draft)
        if edge_case_match:
            base += edge_case_match["score_bonus"]
            logger.debug(
                "Edge case '%s' fired for %s (+%.1f)",
                edge_case_match["rule_id"], champ.name, edge_case_match["score_bonus"],
            )

        total = round(_clamp(base, 5.0, 97.0), 1)

        breakdown = ScoreBreakdown(
            meta=round(meta_s, 1),
            matchup=round(match_s, 1),
            synergy=round(syn_s, 1),
            composition=round(comp_s, 1),
            mastery=round(mast_s, 1),
            draft_risk=round(risk_s, 1),
            ml_prediction=round(ml_s, 1) if self.ml is not None else None,
            ml_explanation=ml_expl,
        )

        # Details for UI (reuse pre-fetched results from bonus section)
        mu_details = mu_details_raw
        matchup_details = [
            MatchupDetail(
                opponent_name=d["opponent_name"],
                opponent_role=d["opponent_role"],
                win_rate=d["win_rate"],
                delta=d["delta"],
                is_lane_opponent=d["is_lane_opponent"],
                games=d.get("games", 0),
            )
            for d in mu_details
        ]

        synergy_details = [
            SynergyDetail(ally_name=d["ally_name"], ally_role=d["ally_role"], delta=d["delta"])
            for d in syn_details_raw
        ]

        comp_warnings = self.composition.warnings(champ, draft)

        # Tags (context-aware)
        tags = self._assign_tags(champ, draft, match_s, risk_s, comp_s, total)

        # Confidence (data-quality aware)
        confidence = self._compute_confidence(draft, mu_details, syn_details_raw)

        # Game count for this champion in this role (sample size info)
        meta_games = self.meta.games(champ.id, role)

        # Confidence interval from ML model (±X range)
        score_range = None
        if self.ml is not None:
            try:
                lo, hi = self.ml.compute_confidence_interval(champ.id, role, draft)
                score_range = [lo, hi]
            except Exception:
                pass

        # Contextual reasons + verdict — mention the concrete ally/enemy
        # champions from the draft. No recomputation — we pass in the
        # matchup / synergy details already built above and an ally-only
        # comp summary so "AD-heavy / missing front" fillers compare
        # against the team as it is, not with the candidate added.
        allies_only = [
            self.db.get_by_id(ap.champion_id)
            for ap in draft.ally_picks
            if ap.champion_id is not None
        ]
        allies_only = [a for a in allies_only if a]
        comp_summary_allies = (
            self.composition.team_summary_from_list(allies_only, draft)
            if allies_only
            else None
        )
        reasons = generate_reasons(
            cand=champ,
            role=role,
            draft=draft,
            db=self.db,
            matchup_details=mu_details,
            synergy_details=syn_details_raw,
            comp_summary=comp_summary_allies,
            max_reasons=3,
        )
        if edge_case_match:
            edge_reason = {
                "text": edge_case_match["reason_text"],
                "kind": edge_case_match["reason_kind"],
                "champions": edge_case_match["champions"],
            }
            reasons = [edge_reason] + [r for r in reasons if r["text"] != edge_reason["text"]]
            reasons = reasons[:3]
        verdict = generate_verdict(
            cand=champ,
            draft=draft,
            db=self.db,
            match_s=match_s,
            syn_s=syn_s,
            comp_s=comp_s,
            risk_s=risk_s,
            tags=tags,
            is_pool=is_pool,
        )

        return Recommendation(
            champion_id=champ.id,
            champion_key=champ.key,
            champion_name=champ.name,
            total_score=total,
            score_range=score_range,
            breakdown=breakdown,
            matchup_details=matchup_details,
            synergy_details=synergy_details,
            composition_warnings=comp_warnings,
            is_pool_champion=is_pool,
            tags=tags,
            confidence=confidence,
            meta_games=meta_games,
            verdict=verdict,
            reasons=reasons,
        )

    # ── Blind-pick penalty override lookup ───────────────────────────────
    def _get_blind_penalty_override(self, champion_key: str) -> float:
        """Return any per-champion `blind_pick_penalty` configured in
        champion_overrides.json. 0.0 when absent. Stacks additively with
        the HIGH_RISK_BLIND list."""
        ov = _load_overrides_lower().get(champion_key.lower(), {})
        try:
            return float(ov.get("blind_pick_penalty", 0.0))
        except (TypeError, ValueError):
            return 0.0

    # ── Archetype counter count (mechanical kit matchups) ────────────────
    def _count_archetype_counters(self, cand: Champion, draft: DraftState) -> int:
        """Count enemies whose archetype is mechanically countered by the
        candidate's kit. Catches signals Lolalytics misses (e.g. Nilah's
        passive vs auto-attackers — there is no per-matchup delta column
        for "dodges autos").

        Returns the number of enemies that fall into a counter pattern.
        """
        c = cand.ratings
        c_tags = set(cand.tags)

        # Candidate's mechanical patterns
        cand_dodges_autos = (
            cand.key in {"Nilah", "Jax", "Pantheon", "Fiora"}  # passive/spell denies AAs
            or (c.utility >= 4 and "Marksman" not in c_tags)
        )
        cand_gap_close = c.engage >= 4
        cand_burst = c.burst >= 4
        cand_kite = c.poke >= 4 or ("Marksman" in c_tags and c.dps >= 4)
        cand_sustained_dps = c.dps >= 4
        cand_cc = c.cc >= 4
        cand_tank = c.tankiness >= 4
        cand_anti_heal = cand.key in {"Morgana", "MissFortune", "Varus", "Soraka"}

        count = 0
        for ep in draft.enemy_picks:
            if ep.champion_id is None:
                continue
            opp = self.db.get_by_id(ep.champion_id)
            if not opp:
                continue
            o = opp.ratings
            o_tags = set(opp.tags)

            # Enemy archetype patterns
            opp_auto_attacker = "Marksman" in o_tags or (
                o.dps >= 4 and o.burst <= 3 and "Mage" not in o_tags
            )
            opp_immobile = o.tankiness <= 2 and "Marksman" in o_tags
            opp_squishy = o.tankiness <= 2 and "Tank" not in o_tags
            opp_engage = o.engage >= 4
            opp_poke = o.poke >= 4 and "Marksman" not in o_tags
            opp_burst = o.burst >= 4 or "Assassin" in o_tags
            opp_tank = o.tankiness >= 4

            # Match counter patterns — each enemy can fire only once
            countered = False

            # Anti auto-attack (Nilah passive, Jax E, Pantheon W, Fiora W)
            if opp_auto_attacker and cand_dodges_autos:
                countered = True
            # Gap-close into immobile carry
            elif opp_immobile and (cand_gap_close or cand_burst):
                countered = True
            # Burst kills squishy
            elif opp_squishy and cand_burst and "Tank" not in c_tags:
                countered = True
            # Tankiness eats burst engage
            elif opp_engage and cand_tank:
                countered = True
            # Range kites engage / fighter
            elif opp_engage and cand_kite and "Marksman" in c_tags:
                countered = True
            # Sustained DPS shreds tank
            elif opp_tank and cand_sustained_dps:
                countered = True
            # CC locks down poke mage
            elif opp_poke and cand_gap_close and cand_cc:
                countered = True
            # Anti-heal vs sustain enemy
            elif cand_anti_heal and (opp.key in {"Soraka", "Yuumi", "Sona", "Aatrox", "Vladimir", "DrMundo", "Zac"}):
                countered = True

            if countered:
                count += 1

        return count

    # ── Ban suggestions (4 strategies merged) ────────────────────────────
    async def _compute_ban_suggestions(
        self,
        draft: DraftState,
        pool: Dict[str, List[PoolEntry]],
        unavailable: set,
    ) -> List[BanSuggestion]:
        """Suggest 3 champions to ban.

        Four strategies run in parallel and each emits weighted candidates;
        the final list is the top-3 *across* strategies (deduped by champion,
        keeping the highest severity wins). Strategies:

          1. counter_my_pool      — disabled when the user's pool is empty
                                    for the current role.
          2. meta_threat          — S-tier picks on the current patch that
                                    haven't been picked or banned yet.
          3. enemy_comp_completion — fill an obvious gap in the enemy comp
                                     (no engage / no AP / no frontline …).
          4. patch_broken         — winrate ≥ 52 % in high elo, large
                                    sample size only.
        """
        role = draft.my_role
        pool_entries = pool.get(role, [])
        pool_active = bool(pool_entries)

        # Each candidate keeps the highest-severity strategy that picked it.
        # {cid: {champ, severity, strategy, reason_text, counters_pool, threatens_allies}}
        candidates: Dict[int, Dict[str, Any]] = {}

        def _consider(
            strategy: str,
            cid: int,
            champ: Champion,
            severity: float,
            reason_text: str,
            counters_pool: Optional[List[str]] = None,
        ) -> None:
            existing = candidates.get(cid)
            if existing is None or severity > existing["severity"]:
                candidates[cid] = {
                    "champ": champ,
                    "severity": severity,
                    "strategy": strategy,
                    "reason_text": reason_text,
                    "counters_pool": list(counters_pool or []),
                    "threatens_allies": [],
                }

        # ── Strategy 1 — counter_my_pool ─────────────────────────────────
        # Skipped entirely when the player has no pool entries for the
        # current role: the signal would be derived from a placeholder
        # filler and produce nonsense bans.
        if pool_active:
            TIER_W = {"S": 1.0, "A": 0.8, "B": 0.6, "C": 0.4, "D": 0.25}
            per_champ: Dict[int, Dict[str, Any]] = {}
            for pe in pool_entries:
                pool_champ = self.db.get_by_id(pe.champion_id)
                if not pool_champ:
                    continue
                tier_w = TIER_W.get(pe.tier, 0.5)
                try:
                    await self.matchup.load_matchups(pe.champion_id, role)
                except Exception:
                    continue
                counters = self.matchup.get_top_counters(pe.champion_id, role, n=10)
                for opp_id, d2 in counters:
                    if opp_id in unavailable or d2 >= -1.5:
                        continue
                    opp = self.db.get_by_id(opp_id)
                    if not opp:
                        continue
                    bucket = per_champ.setdefault(opp_id, {
                        "champ": opp, "score": 0.0, "names": [],
                    })
                    bucket["score"] += (-d2) * tier_w
                    if pool_champ.name not in bucket["names"]:
                        bucket["names"].append(pool_champ.name)
            for cid, bucket in per_champ.items():
                severity = min(100.0, bucket["score"] * 9.0)
                short = ", ".join(bucket["names"][:2])
                _consider(
                    "counter_my_pool", cid, bucket["champ"], severity,
                    f"Counter ton pool — {short}",
                    counters_pool=bucket["names"][:3],
                )

        # ── Strategy 2 — meta_threat ─────────────────────────────────────
        # Top-of-meta picks across roles the enemy could still draft.
        # We scan every role to surface universally strong picks
        # (mid assassins, jungle stompers, etc.).
        threat_roles = ("top", "jungle", "mid", "bot", "support")
        for r in threat_roles:
            try:
                meta_scores = await self.meta.scores_for_role(r)
            except Exception:
                continue
            top_meta = sorted(meta_scores.items(), key=lambda x: -x[1])[:8]
            for cid, m_score in top_meta:
                if cid in unavailable or m_score < 70.0:
                    continue
                champ = self.db.get_by_id(cid)
                if not champ:
                    continue
                severity = min(100.0, (m_score - 50.0) * 1.4)
                _consider(
                    "meta_threat", cid, champ, severity,
                    "Meta S — empêche un pick fort",
                )

        # ── Strategy 3 — enemy_comp_completion ───────────────────────────
        # Identify the single biggest gap in the enemy team and ban the
        # best meta pick that fills it. Only fires once we have ≥ 1 enemy
        # locked AND at least one enemy role still open.
        enemy_champs: List[Champion] = []
        for ep in draft.enemy_picks:
            if ep.champion_id is not None:
                c = self.db.get_by_id(ep.champion_id)
                if c:
                    enemy_champs.append(c)
        enemy_filled_roles = {ep.role for ep in draft.enemy_picks if ep.role}
        enemy_open_roles = [
            r for r in ("top", "jungle", "mid", "bot", "support")
            if r not in enemy_filled_roles
        ]
        if enemy_champs and enemy_open_roles:
            gaps = self._detect_comp_gaps(enemy_champs)
            if gaps:
                primary_gap = gaps[0]
                gap_label = self._gap_label(primary_gap)
                for r in enemy_open_roles:
                    try:
                        meta_scores = await self.meta.scores_for_role(r)
                    except Exception:
                        continue
                    sorted_by_meta = sorted(meta_scores.items(), key=lambda x: -x[1])[:25]
                    for cid, m_score in sorted_by_meta:
                        if cid in unavailable:
                            continue
                        champ = self.db.get_by_id(cid)
                        if not champ or not self._fills_gap(champ, primary_gap):
                            continue
                        severity = min(100.0, m_score * 0.55 + 30.0)
                        _consider(
                            "enemy_comp_completion", cid, champ, severity,
                            f"{gap_label} ennemi — denied",
                        )
                        break  # one nominee per open role is plenty

        # ── Strategy 4 — patch_broken ────────────────────────────────────
        # Anomalously high winrate on the current patch with a real sample.
        BROKEN_WR = 52.0
        for r in threat_roles:
            try:
                await self.meta.load_tierlist(r)
            except Exception:
                continue
            for champ in self.db.all_champions():
                if champ.id in unavailable:
                    continue
                stats = self.db.get_stats(champ.id, r)
                if not stats or stats.games < config.min_games_reliable:
                    continue
                if stats.win_rate >= BROKEN_WR:
                    excess = stats.win_rate - BROKEN_WR
                    severity = min(100.0, 60.0 + excess * 8.0)
                    _consider(
                        "patch_broken", champ.id, champ, severity,
                        f"Broken sur ce patch ({stats.win_rate:.1f}%)",
                    )

        if not candidates:
            return []

        # ── Final ranking — top 3 across all strategies ──────────────────
        ranked = sorted(candidates.values(), key=lambda e: -e["severity"])[:3]
        suggestions: List[BanSuggestion] = []
        for entry in ranked:
            suggestions.append(BanSuggestion(
                champion_id=entry["champ"].id,
                champion_key=entry["champ"].key,
                champion_name=entry["champ"].name,
                severity=round(entry["severity"], 1),
                reason=entry["reason_text"],
                counters_pool=entry["counters_pool"],
                threatens_allies=entry["threatens_allies"],
            ))
        return suggestions

    # ── Comp-gap detection (for enemy_comp_completion strategy) ──────────
    def _detect_comp_gaps(self, enemies: List[Champion]) -> List[str]:
        """Return enemy comp gaps ordered by how badly they should be filled.
        Only emits a gap once at least 2 enemies are revealed (to avoid
        over-fitting on a single pick)."""
        gaps: List[str] = []
        n = len(enemies)
        if n < 2:
            return gaps
        max_engage = max((c.ratings.engage for c in enemies), default=0)
        if max_engage < 4:
            gaps.append("no_engage")
        avg_phys = sum(c.damage.physical for c in enemies) / n
        avg_mag = sum(c.damage.magical for c in enemies) / n
        if avg_mag < 25:
            gaps.append("no_ap")
        if avg_phys < 25:
            gaps.append("no_ad")
        if not any(c.ratings.tankiness >= 4 or "Tank" in c.tags for c in enemies):
            gaps.append("no_frontline")
        if not any("Marksman" in c.tags or c.ratings.dps >= 4 for c in enemies):
            gaps.append("no_dps")
        return gaps

    def _fills_gap(self, champ: Champion, gap: str) -> bool:
        if gap == "no_engage":
            return champ.ratings.engage >= 4
        if gap == "no_ap":
            return champ.damage.magical >= 60
        if gap == "no_ad":
            return champ.damage.physical >= 60
        if gap == "no_frontline":
            return champ.ratings.tankiness >= 4 or "Tank" in champ.tags
        if gap == "no_dps":
            return "Marksman" in champ.tags or champ.ratings.dps >= 4
        return False

    def _gap_label(self, gap: str) -> str:
        return {
            "no_engage":    "Engage manquant",
            "no_ap":        "AP manquant",
            "no_ad":        "AD manquant",
            "no_frontline": "Frontline manquante",
            "no_dps":       "DPS manquant",
        }.get(gap, "Gap composition")

    # ── Draft risk (counter-pick exposure) ───────────────────────────────
    async def _draft_risk(self, champ: Champion, role: str, draft: DraftState) -> float:
        """Higher score = safer to pick now. Lower = risky blind pick.

        Considers champion archetype: immobile carries are inherently risky.
        Also accounts for the practical reality that opponents can't draft
        5 counters without ruining their own team composition.
        """
        # Archetype vulnerability modifier
        vuln = 0
        if "Marksman" in champ.tags and champ.ratings.tankiness <= 2:
            vuln = 28  # ADCs are extremely counter-prone
        elif "Assassin" in champ.tags and champ.ratings.tankiness <= 2:
            vuln = 15  # Assassins somewhat counter-prone
        elif "Mage" in champ.tags and champ.ratings.tankiness <= 2:
            vuln = 10  # Squishy mages
        elif champ.ratings.tankiness >= 4:
            vuln = -12  # Tanks are safe blind picks
        elif "Fighter" in champ.tags and champ.ratings.tankiness >= 3:
            vuln = -5   # Bruisers are fairly safe

        if draft.is_last_pick:
            return _clamp(82.0 - vuln * 0.3, 50.0, 90.0)  # last pick is always safer

        if draft.my_lane_opponent_revealed:
            return _clamp(72.0 - vuln * 0.5, 25.0, 82.0)

        # Check how many counters are still available
        champion_id = champ.id
        await self.matchup.load_matchups(champion_id, role)
        counters = self.matchup.get_top_counters(champion_id, role, n=8)

        if not counters:
            return _clamp(50.0 - vuln, 15.0, 65.0)  # no data → moderate, adjusted by vuln

        unavail = draft.all_unavailable_ids
        available_counters = [(cid, delta) for cid, delta in counters if cid not in unavail]

        if not available_counters:
            return _clamp(78.0 - vuln * 0.3, 40.0, 85.0)  # all counters banned

        # Worst accessible counter
        worst_delta = min(d for _, d in available_counters)
        # Number of dangerous counters still available
        dangerous = sum(1 for _, d in available_counters if d < -2.0)

        picks_left = draft.remaining_enemy_picks

        # Realistic counter exposure: opponents can realistically dedicate
        # at most 1-2 picks to counter you without ruining their own comp.
        # So we cap the picks_left impact and reduce density penalty.
        effective_picks = min(picks_left, 2)  # max 2 realistic counter picks
        base_safety = 60.0 - effective_picks * 6 - vuln * 0.7

        counter_penalty = max(0, -worst_delta) * 2.0
        # Density matters less — they can't pick all counters
        density_penalty = min(dangerous, 3) * 2

        safety = base_safety - counter_penalty - density_penalty
        return round(_clamp(safety, 15.0, 85.0), 1)

    # ── Wild-card / off-meta suggestions ─────────────────────────────────
    async def _wild_card_suggestions(
        self,
        draft: DraftState,
        role: str,
        weights,
        unavailable: set,
        pool_entries: List[PoolEntry],
        enemy_archetype: Optional[ArchetypeResult] = None,
    ) -> List[Recommendation]:
        """Find champions NOT in the user's pool with exceptionally high scores.
        
        Only suggests champions that are:
        1. Meta-viable in the role (meta score >= 45)
        2. High total score (>= wildcard_min_score)
        """
        pool_ids = {pe.champion_id for pe in pool_entries}
        all_for_role = self.db.champions_for_role(role)

        meta_scores = await self.meta.scores_for_role(role)
        
        # Filter: only champions with decent meta score for this role
        # This prevents off-role suggestions like Nunu top
        # Also exclude champions with too few games — stats are unreliable
        MIN_META_FOR_WILDCARD = 45.0
        candidates = [
            c for c in all_for_role
            if c.id not in pool_ids 
            and c.id not in unavailable
            and meta_scores.get(c.id, 0) >= MIN_META_FOR_WILDCARD
            and self.meta.games(c.id, role) >= config.min_games_reliable
        ]
        candidates.sort(key=lambda c: meta_scores.get(c.id, 0), reverse=True)
        candidates = candidates[:15]

        wildcards: List[Recommendation] = []
        best_wildcard: Optional[Recommendation] = None
        for champ in candidates:
            fake_entry = PoolEntry(champion_id=champ.id, champion_key=champ.key, tier="D")
            rec = await self._score_candidate(
                champ, fake_entry, draft, role, weights,
                enemy_archetype=enemy_archetype,
                is_pool=False,
            )
            rec.tags.append("off-meta")
            
            # Track best wildcard regardless of threshold
            if best_wildcard is None or rec.total_score > best_wildcard.total_score:
                best_wildcard = rec

            if rec.total_score >= config.wildcard_min_score:
                wildcards.append(rec)
                if len(wildcards) >= config.wildcard_max_suggestions:
                    break

        # Always suggest at least 1 wildcard if pool is under-performing
        if not wildcards and best_wildcard is not None and best_wildcard.total_score >= 35:
            wildcards.append(best_wildcard)

        return wildcards

    # ── Tag assignment (context-aware) ───────────────────────────────────
    def _assign_tags(
        self, champ: Champion, draft: DraftState,
        match_s: float, risk_s: float, comp_s: float,
        total: float = 0.0,
    ) -> List[str]:
        tags: List[str] = []

        # Low-data warning: champion has very few games → stats unreliable
        games = self.meta.games(champ.id, draft.my_role)
        if 0 < games < config.min_games_reliable:
            tags.append("low-data")

        # Safe blind: high safety + not a vulnerable archetype + decent matchups
        # NOT relevant if lane opponent is already revealed OR majority of enemies visible
        is_vulnerable_carry = ("Marksman" in champ.tags or "Assassin" in champ.tags) and champ.ratings.tankiness <= 2
        enemies_revealed_count = len([e for e in draft.enemy_picks if e.champion_id])
        # "Safe blind" only makes sense when picking blind (few or no enemies visible)
        is_truly_blind = enemies_revealed_count <= 1 and not draft.my_lane_opponent_revealed
        matchup_ok = match_s >= 50 or enemies_revealed_count == 0
        if risk_s >= 72 and not is_vulnerable_carry and comp_s >= 55 and matchup_ok and is_truly_blind:
            tags.append("safe-blind")

        # Counter-pick: only if we have meaningful enemy data and score is high
        enemies_revealed = len([e for e in draft.enemy_picks if e.champion_id]) >= 2
        if match_s >= 62 and enemies_revealed:
            tags.append("counter-pick")

        # Flex: truly flexible (2+ roles) — but useless on last pick (no ambiguity)
        if len(champ.roles) >= 2 and not draft.is_last_pick:
            tags.append("flex")
            # Extra visibility: on 1st pick, flex is the whole point
            if draft.my_pick_order == 1 and risk_s >= 55:
                tags.append("first-pick-safe")

        # Last-pick counter
        if draft.is_last_pick and match_s >= 58:
            tags.append("last-pick-counter")
            # Niche but devastating last-pick counter (low meta, high matchup)
            if match_s >= 68 and self.meta.score(champ.id, draft.my_role) < 55:
                tags.append("niche-counter")

        # Strong meta pick — require derived tier ≥ A (total ≥ 70) AND meta_score ≥ 65
        meta_score = self.meta.score(champ.id, draft.my_role)
        if meta_score >= 65 and total >= 70:
            tags.append("meta-forte")

        return tags

    # ── Confidence (data-quality aware) ──────────────────────────────────
    def _compute_confidence(self, draft: DraftState, mu_details: List[Dict], syn_details: List[Dict]) -> float:
        """How reliable is this recommendation?

        Factors:
        - Number of revealed picks (more info = higher)
        - Quality of matchup data (API data vs heuristic)
        - Sample size of matchup games
        """
        revealed = len(draft.ally_picks) + len(draft.enemy_picks)
        base = 15.0 + revealed * 5.0

        # Data quality: matchups with actual API data (games > 0)
        total_mu = len(mu_details)
        if total_mu > 0:
            with_data = sum(1 for d in mu_details if d.get("games", 0) > 30)
            data_ratio = with_data / total_mu
            base += data_ratio * 25.0  # up to +25 for full data coverage

            # Heavy penalty for mostly heuristic data
            if data_ratio < 0.3:
                base -= 30  # almost no real data
            elif data_ratio < 0.5:
                base -= 20  # most matchups are estimated = very uncertain
        else:
            base -= 10  # no enemies = less confident

        return round(_clamp(base, 8.0, 85.0), 1)
