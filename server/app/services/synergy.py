"""Synergy analyzer — how well does champion X play alongside the allied picks?

Mesure (chantier 3, spec 2026-09-28) : la page de duo Lolalytics (ep=build-team)
donne, pour le candidat et chaque allié par poste, d2 = WR du duo − (WR du
candidat + WR de l'allié − WR moyen), la part que la paire gagne au-delà de la
force de chacun. Rétrécie par shrink(d2, parties, k), k par palier et type de paire.

Repli de kit (`score`, `details` sans page) quand la page est indisponible :
note 0-100, 50 = neutre, lue sur les notes des champions.
  1. CC chain potential (multiple CC sources)
  2. Engage + follow-up (engage + burst/dps)
  3. ADC + support
  4. Melee carry + peel
  5. AoE teamfight
Le mélange des dégâts et la frontline sont des avertissements de `composition` ;
les compter ici les compterait deux fois.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from app.config import config
from app.models.draft import DraftPick, DraftState
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.synergy_priors import pair_kind, prior_k
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher

logger = logging.getLogger("dalia.synergy")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


@dataclass(frozen=True)
class PairObservation:
    """L'interaction mesurée entre le candidat et un allié connu."""
    ally_id: int
    ally_name: str
    ally_role: str
    d2: float
    games: int
    value: float   # shrink(d2, games, k)
    sd: float      # shrink_sd(games, k)


class SynergyAnalyzer:
    """Synergie de paire mesurée ; notes de kit en repli."""

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher
        # (champion, poste, tier) -> {poste de l'allié: {ally_id: (d2, parties, WR du duo)}}
        self._pairs: Dict[Tuple[int, str, str], Dict[str, Dict[int, Tuple[float, int, float]]]] = {}
        self._loaded_at: Dict[Tuple[int, str, str], float] = {}

    async def load_pairs(self, champion_id: int, role: str,
                         tier: Optional[str] = None) -> Dict[str, Dict[int, Tuple[float, int, float]]]:
        """Page de duo du candidat ; un palier sans page sert celle du palier par défaut."""
        tier = tier or self.fetcher.TIER
        key = (champion_id, role, tier)
        if key in self._pairs and time.time() - self._loaded_at.get(key, 0) < config.cache_ttl_hours * 3600:
            return self._pairs[key]
        champ = self.db.get_by_id(champion_id)
        if not champ:
            return {}
        raw = await self.fetcher.fetch_team_page(LolalyticsFetcher.key_to_slug(champ.key), role, tier=tier)
        pairs = {r: rows for r, rows in LolalyticsFetcher.parse_team(raw).items() if rows}
        if not pairs and tier != self.fetcher.TIER:
            pairs = await self.load_pairs(champion_id, role, self.fetcher.TIER)
        if pairs:
            self._pairs[key], self._loaded_at[key] = pairs, time.time()
        return pairs

    async def observations(self, champion_id: int, role: str, draft: DraftState,
                           tier: Optional[str] = None) -> Optional[List[PairObservation]]:
        """Une observation par allié connu, dans l'ordre de la draft. None : page indisponible."""
        pairs = await self.load_pairs(champion_id, role, tier)
        if not pairs:
            return None
        tier = tier or self.fetcher.TIER
        out: List[PairObservation] = []
        for ap in draft.ally_picks:
            ally = self.db.get_by_id(ap.champion_id) if ap.champion_id is not None else None
            if not ally:
                continue
            ally_role = ap.role or (ally.roles[0] if ally.roles else "")
            d2, games, _ = pairs.get(ally_role, {}).get(ally.id, (0.0, 0, 0.0))
            k = prior_k(tier, pair_kind(role, ally_role))
            out.append(PairObservation(ally.id, ally.name, ally_role, d2, games,
                                       shrink(d2, games, k), shrink_sd(games, k)))
        return out

    async def score(self, champion_id: int, role: str, draft: DraftState) -> float:
        """Repli de kit, 0-100, quand la page de duo est indisponible."""
        allies = []
        for ap in draft.ally_picks:
            if ap.champion_id is not None:
                c = self.db.get_by_id(ap.champion_id)
                if c:
                    allies.append((c, ap.role))

        if not allies:
            return 50.0  # no allies → neutral

        candidate = self.db.get_by_id(champion_id)
        if not candidate:
            return 50.0

        team_champs = [a[0] for a in allies] + [candidate]
        score = 50.0  # start neutral

        # 1. CC chain potential
        cc_total = sum(c.ratings.cc for c in team_champs)
        if cc_total >= 15:
            score += 6
        elif cc_total >= 10:
            score += 2
        elif cc_total < 6:
            score -= 4

        # 2. Engage + follow-up synergy
        has_engage = any(c.ratings.engage >= 4 for c, _ in allies)
        candidate_dps = candidate.ratings.dps >= 4 or candidate.ratings.burst >= 4
        if has_engage and candidate_dps:
            score += 5

        # 3. ADC + Support specific synergy (huge impact)
        is_adc = "Marksman" in candidate.tags or (role == "bot" and candidate.ratings.dps >= 4)
        support_ally = next(((c, r) for c, r in allies if r == "support"), None)
        if is_adc and support_ally:
            support_champ = support_ally[0]
            # Engage supports with ADC = great
            if support_champ.ratings.engage >= 4:
                score += 8
            # Enchanters with ADC = great
            if support_champ.ratings.utility >= 4:
                score += 7
            # Tank support = good
            if support_champ.is_tank:
                score += 5
            # Mage supports provide poke
            if "Mage" in support_champ.tags and support_champ.ratings.poke >= 3:
                score += 3

        # 4. Melee carry (Nilah, Yasuo ADC) needs extra peel
        is_melee_carry = is_adc and candidate.is_melee
        if is_melee_carry:
            has_peel = any(c.ratings.utility >= 4 or (c.ratings.cc >= 4 and c.ratings.tankiness >= 3) for c, _ in allies)
            if has_peel:
                score += 6  # melee carry + peel = great
            else:
                score -= 8  # melee carry without peel = terrible

        # 5. AoE combo synergy (Nilah/Yasuo + Rumble/Ori/Seraphine)
        aoe_score = sum(c.ratings.teamfight for c in team_champs) / len(team_champs)
        if aoe_score >= 4.0:
            score += 4

        return round(_clamp(score), 1)

    async def details(self, champion_id: int, role: str, draft: DraftState,
                      tier: Optional[str] = None) -> List[Dict]:
        """Une ligne par allié connu, dans l'ordre de la draft (generate_reasons les apparie).

        Mesurée : l'observation rétrécie, sans facteur duo ni échelle — comme les
        matchup_details, c'est une observation affichée, pas la contribution au score.
        """
        observed = await self.observations(champion_id, role, draft, tier)
        if observed is not None:
            return [{"ally_name": o.ally_name, "ally_role": o.ally_role, "delta": round(o.value, 2),
                     "games": o.games, "source": "observed"} for o in observed]
        return self._kit_details(champion_id, role, draft)

    def _kit_details(self, champion_id: int, role: str, draft: DraftState) -> List[Dict]:
        """Repli : complémentarité estimée des kits, pas un gain de win rate."""
        candidate = self.db.get_by_id(champion_id)
        if not candidate:
            return []

        is_adc = "Marksman" in candidate.tags or (role == "bot" and candidate.ratings.dps >= 4)
        result = []
        for ap in draft.ally_picks:
            if ap.champion_id is None:
                continue
            ally = self.db.get_by_id(ap.champion_id)
            if not ally:
                continue
            ally_name = ally.name

            # Compute a pairwise synergy delta
            delta = 0.0

            # ADC + Support synergy (most important)
            if is_adc and ap.role == "support":
                if ally.ratings.engage >= 4:
                    delta += 5.0  # engage support with ADC
                if ally.ratings.utility >= 4:
                    delta += 4.5  # enchanter with ADC
                if ally.is_tank:
                    delta += 3.0  # tank support
                if ally.ratings.cc >= 4:
                    delta += 2.0  # CC support
                if "Mage" in ally.tags and ally.ratings.poke >= 3:
                    delta += 1.5  # poke mage support

            # Damage diversity
            phys_mix = abs(candidate.damage.physical - ally.damage.physical)
            if phys_mix > 30:
                delta += 1.0

            # CC chain
            if candidate.ratings.cc >= 3 and ally.ratings.cc >= 3:
                delta += 1.5

            # Engage + follow up
            if ally.ratings.engage >= 4 and (candidate.ratings.burst >= 4 or candidate.ratings.dps >= 4):
                delta += 2.5
            elif candidate.ratings.engage >= 4 and (ally.ratings.burst >= 4 or ally.ratings.dps >= 4):
                delta += 2.5

            # Tank + carry
            if ally.is_tank and candidate.ratings.dps >= 4:
                delta += 2.0

            # Both squishy assassins/mages → slight negative
            if candidate.ratings.tankiness <= 2 and ally.ratings.tankiness <= 2:
                delta -= 1.5

            result.append({
                "ally_name": ally_name,
                "ally_role": ap.role or "?",
                "delta": round(delta, 1),
                "games": 0,
                "source": "kit_heuristic",
            })
        return result
