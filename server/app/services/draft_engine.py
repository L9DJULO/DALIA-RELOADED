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

import logging
from typing import Dict, List, Optional

from app.config import config
from app.models.champion import Champion
from app.models.draft import (
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
from app.services.data_fetcher import LolalyticsFetcher
from app.services.matchup import MatchupAnalyzer
from app.services.meta_analyzer import MetaAnalyzer
from app.services.role_predictor import predict_enemy_roles
from app.services.synergy import SynergyAnalyzer

# ML predictor — optional, loads silently if model not available
try:
    from app.ml.predictor import MLPredictor
except ImportError:
    MLPredictor = None  # type: ignore

logger = logging.getLogger("dalia.engine")

TIER_TO_MASTERY = {"S": 90, "A": 72, "B": 55, "C": 38, "D": 10}


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

        # ── Predict enemy roles if not assigned ──
        # When LCU doesn't reveal enemy positions (ranked),
        # intelligently assign roles based on champion data
        unassigned = [p for p in draft.enemy_picks if p.champion_id and not p.role]
        if unassigned:
            logger.info(
                "Predicting roles for %d enemy champions: %s",
                len(unassigned),
                [p.champion_key or p.champion_id for p in unassigned],
            )
            draft.enemy_picks = predict_enemy_roles(
                draft.enemy_picks, self.db, self.meta
            )

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

            rec = await self._score_candidate(champ, entry, draft, role, weights, personal_boost_fn)
            scored.append(rec)

        # 4. Wild-card suggestions (off-pool)
        wildcards = await self._wild_card_suggestions(draft, role, weights, unavailable, pool_entries)
        scored.extend(wildcards)

        # Sort descending by total score
        scored.sort(key=lambda r: r.total_score, reverse=True)

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

        return DraftResponse(
            recommendations=scored[:15],
            team_composition_summary=comp_summary,
            warnings=global_warnings,
            win_probability=win_prob,
            duo_synergy_boost=duo_active,
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

        # ── 3. Multiplicative bonus when draft fits well ──
        # Rewards good matchups regardless of comp theory
        if match_s >= 55 and has_enemies:
            bonus = 1.0 + (match_s - 50) * 0.008
            # Extra bonus if comp is also clean
            if comp_s >= 70:
                bonus += (comp_s - 70) * 0.003
            base *= min(bonus, 1.20)  # cap at +20%

        total = round(_clamp(base, 5.0, 98.0), 1)

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

        # Details for UI
        mu_details = await self.matchup.details(champ.id, role, draft)
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

        syn_details_raw = await self.synergy.details(champ.id, role, draft)
        synergy_details = [
            SynergyDetail(ally_name=d["ally_name"], ally_role=d["ally_role"], delta=d["delta"])
            for d in syn_details_raw
        ]

        comp_warnings = self.composition.warnings(champ, draft)

        # Tags (context-aware)
        tags = self._assign_tags(champ, draft, match_s, risk_s, comp_s)

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
            is_pool_champion=True,
            tags=tags,
            confidence=confidence,
            meta_games=meta_games,
        )

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
            rec = await self._score_candidate(champ, fake_entry, draft, role, weights)
            rec.is_pool_champion = False
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

        # Last-pick counter
        if draft.is_last_pick and match_s >= 58:
            tags.append("last-pick-counter")

        # Strong meta pick
        if self.meta.score(champ.id, draft.my_role) >= 75:
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
