"""Draft engine — orchestre les termes du scoring en points de win rate.

Chaque candidat reçoit une liste de termes (méta, matchup, adversaire futur,
maîtrise, composition, archétype, synergie, mécaniques, modèle), chacun en
points de WR avec un écart-type. Le total est la somme ; l'avantage affiché est
le total moins la moyenne des totaux du pool. Voir
docs/superpowers/specs/2026-09-10-scoring-wr-points-design.md.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.config import config
from app.models.champion import Champion
from app.models.draft import (
    BanImpact,
    BanSuggestion,
    DraftRequest,
    DraftResponse,
    DraftState,
    MatchupDetail,
    MLExplanation,
    PoolEntry,
    Recommendation,
    ScoreBreakdown,
    ScoreTerm,
    SynergyDetail,
)
from app.scoring.aggregate import apply_preferences, confidence_from_sd, reference_mean, top_group
from app.scoring.composition_term import archetype_term, composition_term
from app.scoring.heuristic_terms import mechanics_term, model_term, synergy_term
from app.scoring.mastery_term import MasteryInputs, mastery_term
from app.scoring.matchup_term import matchup_term
from app.scoring.meta_term import meta_term
from app.scoring.opponent_model import future_opponent_term
from app.scoring.rank import lolalytics_tier
from app.scoring.types import Estimate, Term
from app.services.champion_data import ChampionDatabase
from app.services.composition import CompositionAnalyzer
from app.services.composition_archetype import Archetype, ArchetypeResult, detect_archetype
from app.services.data_fetcher import LolalyticsFetcher
from app.services.mechanics import MechanicsAnalyzer
from app.services.matchup import MatchupAnalyzer
from app.services.meta_analyzer import MetaAnalyzer
from app.services.reasons import generate_reasons, generate_verdict
from app.services.role_inference import infer_enemy_roles, most_likely_role
from app.services.synergy import SynergyAnalyzer

# ML predictor — optional, loads silently if model not available
try:
    from app.ml.predictor import MLPredictor
except ImportError:
    MLPredictor = None  # type: ignore

logger = logging.getLogger("dalia.engine")


class DraftEngine:
    """Main recommendation engine."""

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher
        self.meta = MetaAnalyzer(champion_db, fetcher)
        self.matchup = MatchupAnalyzer(champion_db, fetcher)
        self.synergy = SynergyAnalyzer(champion_db, fetcher)
        self.composition = CompositionAnalyzer(champion_db)
        self.mechanics = MechanicsAnalyzer(champion_db)
        self._analysis_slots = asyncio.Semaphore(4)

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
    async def recommend(self, request: DraftRequest, personal_svc=None, candidate_ids=None) -> DraftResponse:
        async with asyncio.timeout(25):
            async with self._analysis_slots:
                return await self._recommend(request.model_copy(deep=True), personal_svc, candidate_ids)

    async def _recommend(self, request: DraftRequest, personal_svc=None, candidate_ids=None) -> DraftResponse:
        """Compute draft recommendations for the given state + user pool."""
        draft = request.draft_state
        pool = request.champion_pool
        role = draft.my_role
        # The patch watcher may swap or drop the model while this request runs:
        # score every candidate of one analysis with the same predictor.
        ml = self.ml

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

        # ── Stats personnelles (rafraîchies en arrière-plan, lues depuis le cache) ──
        personal = None
        if personal_svc and request.puuid:
            personal_svc.refresh_in_background(puuid=request.puuid, region=request.region or "EUW1")
            personal = (personal_svc, request.puuid, request.region or "EUW1")

        # ── DuoQ : injection du champion probable du partenaire ──
        duo_active = request.duo_active and request.duo_partner_role
        duo_partner_role = request.duo_partner_role
        duo_partner_pool = request.duo_partner_pool or {}
        duo_injected = False

        if duo_active:
            logger.info("DuoQ active — partner role: %s", duo_partner_role)
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

        # 1. Rang du joueur → tier Lolalytics, méta du rôle, préférences
        rank = request.rank_bucket
        tier = lolalytics_tier(rank, self.fetcher.TIER)
        await self.meta.load_tierlist(role, tier)
        prefs = request.weight_overrides

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
        actual_pool_ids = {e.champion_id for e in pool_entries}
        if candidate_ids:
            indexed = {e.champion_id: e for e in pool_entries}
            pool_entries = [indexed.get(cid, PoolEntry(champion_id=cid, tier="D")) for cid in candidate_ids]
        if not pool_entries:
            all_for_role = self.db.champions_for_role(role)
            pool_entries = [PoolEntry(champion_id=c.id, champion_key=c.key, tier="D") for c in all_for_role]

        # Filter out banned & already picked
        unavailable = draft.all_unavailable_ids
        candidates = [pe for pe in pool_entries if pe.champion_id not in unavailable]
        if not request.enable_off_meta and not candidate_ids:
            candidates = [pe for pe in candidates if (c := self.db.get_by_id(pe.champion_id)) and role in c.roles]

        # 3. Score each candidate (total absolu en points de WR)
        candidate_slots = asyncio.Semaphore(6)
        async def score_entry(entry, is_pool=True):
            champ = self.db.get_by_id(entry.champion_id)
            if not champ:
                return None
            async with candidate_slots:
                return await self._score_candidate(
                    champ, entry, draft, role, prefs, rank, personal,
                    enemy_archetype=enemy_archetype, is_pool=is_pool, ml=ml,
                    duo_partner_role=duo_partner_role if duo_active else None,
                )
        scored = [r for r in await asyncio.gather(*(score_entry(e, e.champion_id in actual_pool_ids) for e in candidates)) if r]

        # 4. Wild-cards, filtrés sur une référence provisoire (avant le terme modèle)
        provisional_reference = reference_mean([r.total_score for r in scored if r.is_pool_champion])
        wildcards = await self._wild_card_suggestions(
            draft, role, unavailable, pool_entries, score_entry, provisional_reference,
        ) if request.enable_wildcard and not candidate_ids else []
        scored.extend(wildcards)

        # Terme modèle : WPA conditionnel, même référence pour toutes les alternatives évaluées.
        # Une probabilité absolue n'est jamais un bonus indépendant.
        eligible = [r for r in scored if r.breakdown.ml_explanation and
                    r.breakdown.ml_explanation.confidence != "low"]
        if ml is not None and len(eligible) == len(scored) and len(eligible) >= 2:
            baseline = sum(r.breakdown.ml_explanation.win_probability for r in eligible) / len(eligible)
            for rec in eligible:
                delta = (rec.breakdown.ml_explanation.win_probability - baseline) * 100
                term = model_term(delta)
                rec.breakdown.terms.append(ScoreTerm(**term.__dict__, sd=term.sd))
                rec.breakdown.wpa_adjustment = round(term.value, 2)
                rec.total_score = rec.total_score + term.value
                rec.score_sd = math.sqrt(rec.score_sd ** 2 + term.sd ** 2)
                rec.wpa = {"source": "DALIA", "kind": "model_estimate", "delta_pp": round(delta, 2),
                           "baseline_probability": round(baseline * 100, 2),
                           "baseline_champion_ids": [r.champion_id for r in eligible],
                           "model": {k: ml.metadata.get(k) for k in ("schema_version", "patches", "trained_at", "test_metrics", "test_unique_matches", "code_revision")},
                           "definition": "Écart à la moyenne des choix évalués dans cette draft, même rôle et même côté.",
                           "limitation": "Estimation du modèle, sans preuve causale ; ne provient pas de Coachless."}

        # Avantage relatif au pool, intervalle, confiance, groupe de tête.
        reference = reference_mean([r.total_score for r in scored if r.is_pool_champion])
        for rec in scored:
            rec.total_score = round(rec.total_score - reference, 2)
            rec.score_sd = round(rec.score_sd, 2)
            rec.score_range = [round(rec.total_score - rec.score_sd, 2), round(rec.total_score + rec.score_sd, 2)]
            rec.confidence = confidence_from_sd(rec.score_sd)
        scored.sort(key=lambda r: r.total_score, reverse=True)
        group = top_group([(r.total_score, r.breakdown.terms) for r in scored])
        for i in group:
            scored[i].tie_with_leader = True
        top_group_ids = [scored[i].champion_id for i in group]

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
        if ml is not None and scored:
            top_rec = scored[0]
            if top_rec.breakdown.ml_explanation and top_rec.breakdown.ml_explanation.win_probability:
                win_prob = round(top_rec.breakdown.ml_explanation.win_probability * 100, 1)

        # 7. Ban suggestions — 4 parallel strategies, top 3 across all
        ban_suggestions = await self._compute_ban_suggestions(
            draft=draft,
            pool=pool,
            unavailable=unavailable,
        )

        # 8. Ban impact — which bans notably helped the top recommendations
        ban_impact = await self._compute_ban_impact(
            draft=draft,
            role=role,
            top_recs=scored[:5],
        )

        return DraftResponse(
            recommendations=scored[:15],
            team_composition_summary=comp_summary,
            warnings=global_warnings,
            win_probability=win_prob,
            duo_synergy_boost=duo_active,
            ban_suggestions=ban_suggestions,
            ban_impact=ban_impact,
            reference_mean=round(reference, 2),
            top_group_ids=top_group_ids,
            rank_bucket=rank,
            data_status={"patch": await self.fetcher.get_current_patch(), "rank": tier,
                         "rank_requested": rank,
                         "rank_fallback": tier in self.meta.rank_fallback or tier in self.matchup.rank_fallback,
                         "region": self.fetcher.REGION, "queue": self.fetcher.QUEUE,
                         "statistics_source": "Lolalytics", "mechanics_source": "Riot kits + règles DALIA",
                         "score_unit": "wr_points",
                         "meta_available": self.meta.is_loaded(role, tier),
                         "meta_collected_at": getattr(self.fetcher, "last_success", {}).get(f"meta:{role}"),
                         "statistics_policy": "current_if_reliable_else_30d",
                         "source_errors": list(self.fetcher.last_errors),
                         "model_available": ml is not None,
                         "wpa_available": any(r.wpa is not None for r in scored),
                         "coachless_connected": False},
        )

    # ── Scoring : somme de termes en points de WR ─────────────────────────
    async def _score_candidate(self, champ: Champion, entry: PoolEntry, draft: DraftState, role: str, prefs, rank,
                               personal, enemy_archetype: Optional[ArchetypeResult] = None, is_pool: bool = True,
                               ml=None, duo_partner_role: Optional[str] = None) -> Recommendation:
        """total_score et score_sd renvoyés ici sont ABSOLUS ; _recommend les rend relatifs au pool."""
        tier = lolalytics_tier(rank, self.fetcher.TIER)
        has_enemies = any(e.champion_id for e in draft.enemy_picks)
        allies = [c for a in draft.ally_picks if a.champion_id and (c := self.db.get_by_id(a.champion_id))]
        terms: List[Term] = [meta_term(self.meta.stats(champ.id, role, tier))]

        mu = await matchup_term(self.matchup, champ.id, role, draft, tier)
        if mu:
            terms.append(mu)
        future = await future_opponent_term(self.matchup, self.meta, self.db, champ, role, draft, rank)
        if future:
            terms.append(future)
        terms.append(mastery_term(self._mastery_inputs(champ, entry, role, rank, personal)))
        comp = composition_term(champ, allies, self.mechanics, self.composition)
        if comp:
            terms.append(comp)
        arch = archetype_term(champ, enemy_archetype) if has_enemies else None
        if arch:
            terms.append(arch)
        if allies:
            duo_bonus = bool(duo_partner_role) and any(a.role == duo_partner_role and a.champion_id for a in draft.ally_picks)
            terms.append(synergy_term(await self.synergy.score(champ.id, role, draft), duo_bonus))
        mechanics_delta, mechanics = self.mechanics.evaluate(champ, draft)
        terms.append(mechanics_term(mechanics_delta))

        ml_s, ml_expl = None, None
        if ml is not None and ml.supports(champ.id, role, draft):
            try:
                ml_s, ml_expl_raw = ml.score_with_explanation(champ.id, role, draft)
                ml_expl = MLExplanation(**ml_expl_raw)
            except Exception:
                logger.exception("Prediction unavailable; retaining kit analysis")

        est = Estimate(apply_preferences(terms, prefs))
        by_name = {t.name: t for t in est.terms}

        def val(name: str) -> float:
            return round(by_name[name].value, 2) if name in by_name else 0.0

        breakdown = ScoreBreakdown(
            meta=val("meta"), matchup=val("matchup"), synergy=val("synergy"), composition=val("composition"),
            mastery=val("mastery"), draft_risk=val("future_opponent"), mechanics=val("mechanics"),
            ml_prediction=round(ml_s, 1) if ml_s is not None else None, ml_explanation=ml_expl,
            terms=[ScoreTerm(**t.__dict__, sd=t.sd) for t in est.terms],
        )

        mu_details_raw = await self.matchup.details(champ.id, role, draft, tier) if has_enemies else []
        syn_details_raw = await self.synergy.details(champ.id, role, draft) if allies else []
        matchup_details = [MatchupDetail(opponent_name=d["opponent_name"], opponent_role=d["opponent_role"],
                                         win_rate=d["win_rate"] if d.get("games", 0) > 0 else None, delta=d["delta"],
                                         is_lane_opponent=d["is_lane_opponent"], games=d.get("games", 0),
                                         source="Lolalytics" if d.get("games", 0) > 0 else "heuristic",
                                         lane_probability=d.get("lane_probability", 0)) for d in mu_details_raw]
        synergy_details = [SynergyDetail(ally_name=d["ally_name"], ally_role=d["ally_role"], delta=d["delta"]) for d in syn_details_raw]
        comp_warnings = self.composition.warnings(champ, draft)
        tags = self._assign_tags(champ, draft, by_name)

        comp_summary_allies = self.composition.team_summary_from_list(allies, draft) if allies else None
        reasons = generate_reasons(cand=champ, role=role, draft=draft, db=self.db, matchup_details=mu_details_raw,
                                   synergy_details=syn_details_raw, comp_summary=comp_summary_allies, max_reasons=3)
        if mechanics:
            strongest = max(mechanics, key=lambda r: abs(r["score_delta"]))
            edge_reason = {"text": strongest["text"], "kind": strongest["kind"], "champions": strongest["champions"]}
            reasons = ([edge_reason] + [r for r in reasons if r["text"] != edge_reason["text"]])[:3]
        verdict = generate_verdict(cand=champ, draft=draft, db=self.db, matchup=val("matchup"), synergy=val("synergy"),
                                   composition=val("composition"), future=val("future_opponent"), tags=tags, is_pool=is_pool)
        stats = self.meta.stats(champ.id, role, tier)
        return Recommendation(
            champion_id=champ.id, champion_key=champ.key, champion_name=champ.name,
            total_score=est.total, score_sd=est.sd, breakdown=breakdown,
            matchup_details=matchup_details, synergy_details=synergy_details, composition_warnings=comp_warnings,
            is_pool_champion=is_pool, tags=tags, confidence=confidence_from_sd(est.sd),
            meta_games=stats.games if stats else 0, meta_window=stats.patch if stats else None,
            verdict=verdict, reasons=reasons, mechanics=mechanics,
        )

    def _mastery_inputs(self, champ: Champion, entry: PoolEntry, role: str, rank, personal) -> MasteryInputs:
        inputs = MasteryInputs(tier=entry.tier, difficulty=champ.difficulty, rank=rank, now=datetime.now(timezone.utc))
        if personal:
            svc, puuid, region = personal
            stats = svc.get_champion_personal(puuid, champ.id, role, region)
            if stats:
                inputs.personal_games, inputs.personal_wr = stats["games"], stats["win_rate"]
            mastery = svc.get_mastery_entry(puuid, champ.id, region)
            if mastery:
                inputs.mastery_points = int(mastery.get("points", 0))
                if mastery.get("last_played"):
                    inputs.last_played = datetime.fromtimestamp(float(mastery["last_played"]), tz=timezone.utc)
        return inputs

    # ── Archetype counter count (mechanical kit matchups) ────────────────
    async def _compute_ban_impact(
        self,
        draft: DraftState,
        role: str,
        top_recs: List[Recommendation],
    ) -> List[BanImpact]:
        """Identify which bans notably benefit the top recommendations.

        Uses already-cached matchup data (loaded during scoring) — no extra
        API calls. Only reports bans that are meta-relevant (score ≥ 55) or
        that directly counter a top recommended champion (delta ≤ -1.5%).
        """
        if not draft.bans or not top_recs:
            return []

        impact: List[BanImpact] = []
        for ban_id in draft.bans:
            champ = self.db.get_by_id(ban_id)
            if not champ:
                continue

            meta_score = self.meta.score(champ.id, role)
            is_threat = meta_score >= 65

            helped: List[str] = []
            for rec in top_recs:
                counters = self.matchup.get_top_counters(rec.champion_id, role, n=20)
                for opp_id, delta in counters:
                    if opp_id == ban_id and delta <= -1.5:
                        helped.append(rec.champion_name)
                        break

            if is_threat or helped:
                impact.append(BanImpact(
                    champion_id=ban_id,
                    champion_name=champ.name,
                    champion_key=champ.key,
                    meta_score=round(meta_score, 1),
                    is_lane_threat=is_threat,
                    helped_recommendations=helped[:3],
                ))

        return impact

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

    # ── Wild-card / off-meta suggestions ─────────────────────────────────
    async def _wild_card_suggestions(
        self,
        draft: DraftState,
        role: str,
        unavailable: set,
        pool_entries: List[PoolEntry],
        score_entry,
        reference: float,
    ) -> List[Recommendation]:
        """Find champions NOT in the user's pool with a clear advantage over the pool mean.

        Only suggests champions that are:
        1. Meta-viable in the role (meta score >= 45)
        2. Ahead of the pool reference by at least wildcard_min_advantage points

        Candidates are scored in small parallel batches, best meta first, and
        the search stops as soon as enough suggestions clear the threshold.
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
        BATCH = 5
        for start in range(0, len(candidates), BATCH):
            batch = candidates[start:start + BATCH]
            entries = [PoolEntry(champion_id=c.id, champion_key=c.key, tier="D") for c in batch]
            results = await asyncio.gather(*(score_entry(entry, False) for entry in entries))
            for rec in results:
                if rec is None:
                    continue
                rec.tags.append("hors-pool")
                # Track best wildcard regardless of threshold
                if best_wildcard is None or rec.total_score > best_wildcard.total_score:
                    best_wildcard = rec
                if rec.total_score - reference >= config.scoring.wildcard_min_advantage and len(wildcards) < config.wildcard_max_suggestions:
                    wildcards.append(rec)
            if len(wildcards) >= config.wildcard_max_suggestions:
                break

        # Always suggest at least 1 wildcard if pool is under-performing
        if not wildcards and best_wildcard is not None and best_wildcard.total_score - reference >= 0:
            wildcards.append(best_wildcard)

        return wildcards

    # ── Tags (à partir des termes en points de WR) ─────────────────────────
    def _assign_tags(self, champ: Champion, draft: DraftState, terms: Dict[str, Term]) -> List[str]:
        tags: List[str] = []
        games = self.meta.games(champ.id, draft.my_role)
        if 0 < games < config.min_games_reliable:
            tags.append("low-data")
        matchup = terms.get("matchup")
        future = terms.get("future_opponent")
        if future is not None and future.value >= -0.5 and future.sd <= 2.0:
            tags.append("safe-blind")
        if future is not None and future.value <= -2.0:
            tags.append("risky-blind")
        if matchup is not None and matchup.value >= 2.0 and draft.my_lane_opponent_revealed:
            tags.append("counter-pick")
        if len(champ.roles) >= 2 and not draft.is_last_pick:
            tags.append("flex")
        if draft.is_last_pick and matchup is not None and matchup.value >= 1.5:
            tags.append("last-pick-counter")
        meta = terms.get("meta")
        if meta is not None and meta.value >= 1.5:
            tags.append("meta-forte")
        mastery = terms.get("mastery")
        if mastery is not None and mastery.value >= 0.5:
            tags.append("comfort")
        return tags
