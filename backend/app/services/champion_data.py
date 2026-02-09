"""Champion database — loads champion data from Data Dragon + applies overrides.

Auto-classification rules based on Riot's tags give a reasonable baseline;
hand-tuned overrides in champion_overrides.json refine the most impactful
champions for composition analysis.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.models.champion import Champion, ChampionRatings, ChampionStats, DamageProfile
from app.services.data_fetcher import LolalyticsFetcher

logger = logging.getLogger("dalia.champion_data")

OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "champion_overrides.json"


def _auto_damage(tags: List[str]) -> DamageProfile:
    """Heuristic damage profile based on Riot tags."""
    t = set(tags)
    if "Marksman" in t:
        return DamageProfile(physical=82, magical=13, true_dmg=5)
    if "Mage" in t and "Assassin" in t:
        return DamageProfile(physical=12, magical=83, true_dmg=5)
    if "Mage" in t and "Fighter" not in t:
        return DamageProfile(physical=8, magical=87, true_dmg=5)
    if "Assassin" in t and "Mage" not in t:
        return DamageProfile(physical=82, magical=13, true_dmg=5)
    if "Fighter" in t and "Tank" in t:
        return DamageProfile(physical=55, magical=35, true_dmg=10)
    if "Fighter" in t and "Mage" in t:
        return DamageProfile(physical=25, magical=65, true_dmg=10)
    if "Fighter" in t:
        return DamageProfile(physical=65, magical=25, true_dmg=10)
    if "Tank" in t and "Mage" in t:
        return DamageProfile(physical=20, magical=70, true_dmg=10)
    if "Tank" in t:
        return DamageProfile(physical=40, magical=50, true_dmg=10)
    if "Support" in t and "Mage" in t:
        return DamageProfile(physical=8, magical=82, true_dmg=10)
    if "Support" in t:
        return DamageProfile(physical=20, magical=60, true_dmg=20)
    return DamageProfile(physical=50, magical=45, true_dmg=5)


def _auto_ratings(tags: List[str]) -> ChampionRatings:
    """Heuristic ratings based on Riot tags — returns reasonable defaults."""
    t = set(tags)

    def _pick(mapping: Dict[str, int], default: int = 3) -> int:
        vals = [mapping[k] for k in t if k in mapping]
        return max(vals) if vals else default

    cc      = _pick({"Tank": 4, "Support": 4, "Mage": 3, "Fighter": 2, "Assassin": 1, "Marksman": 1}, 2)
    engage  = _pick({"Tank": 4, "Fighter": 3, "Support": 3, "Assassin": 2, "Mage": 1, "Marksman": 1}, 2)
    poke    = _pick({"Mage": 4, "Marksman": 3, "Support": 2, "Assassin": 1, "Fighter": 1, "Tank": 1}, 2)
    split   = _pick({"Fighter": 4, "Assassin": 3, "Marksman": 2, "Mage": 1, "Tank": 1, "Support": 1}, 2)
    tf      = _pick({"Mage": 4, "Tank": 4, "Marksman": 4, "Support": 4, "Fighter": 3, "Assassin": 2}, 3)
    utility = _pick({"Support": 5, "Tank": 3, "Mage": 2, "Fighter": 2, "Assassin": 1, "Marksman": 1}, 2)
    burst   = _pick({"Assassin": 5, "Mage": 4, "Fighter": 3, "Marksman": 2, "Tank": 1, "Support": 2}, 3)
    dps_    = _pick({"Marksman": 5, "Fighter": 4, "Mage": 3, "Assassin": 2, "Tank": 2, "Support": 1}, 3)
    tanky   = _pick({"Tank": 5, "Fighter": 3, "Support": 2, "Mage": 1, "Assassin": 1, "Marksman": 1}, 2)

    return ChampionRatings(
        cc=cc, engage=engage, poke=poke, splitpush=split,
        teamfight=tf, utility=utility, burst=burst, dps=dps_, tankiness=tanky,
    )


def _default_roles(tags: List[str], key: str) -> List[str]:
    """Rough role guess — will be overridden by overrides.json or live data."""
    t = set(tags)
    if "Marksman" in t and "Assassin" not in t:
        return ["bot"]
    if "Support" in t:
        return ["support"]
    if "Tank" in t and "Fighter" in t:
        return ["top"]
    if "Tank" in t:
        return ["top", "support"]
    if "Fighter" in t and "Assassin" in t:
        return ["top", "jungle"]
    if "Fighter" in t:
        return ["top"]
    if "Assassin" in t:
        return ["mid", "jungle"]
    if "Mage" in t:
        return ["mid"]
    return ["mid"]


class ChampionDatabase:
    """In-memory champion registry loaded from Data Dragon + manual overrides."""

    def __init__(self, fetcher: LolalyticsFetcher):
        self.fetcher = fetcher
        self._by_id: Dict[int, Champion] = {}
        self._by_key: Dict[str, Champion] = {}
        self._by_name: Dict[str, Champion] = {}
        self._stats_cache: Dict[str, ChampionStats] = {}  # "champId_role" → stats

    # ── Initialization ───────────────────────────────────────────────────
    async def initialize(self):
        """Load champion list from Data Dragon and apply overrides."""
        raw = await self.fetcher.fetch_all_champions_ddragon()
        overrides = self._load_overrides()

        for key, info in raw.items():
            cid = int(info["key"])
            tags = info.get("tags", [])
            name = info.get("name", key)

            # Base classification
            damage = _auto_damage(tags)
            ratings = _auto_ratings(tags)
            roles = _default_roles(tags, key)

            # Apply overrides
            ov = overrides.get(key, {})
            if "damage" in ov:
                d = ov["damage"]
                damage = DamageProfile(physical=d[0], magical=d[1], true_dmg=d[2])
            if "ratings" in ov:
                r = ov["ratings"]
                ratings = ChampionRatings(
                    cc=r[0], engage=r[1], poke=r[2], splitpush=r[3],
                    teamfight=r[4], utility=r[5],
                    burst=r[6] if len(r) > 6 else ratings.burst,
                    dps=r[7] if len(r) > 7 else ratings.dps,
                    tankiness=r[8] if len(r) > 8 else ratings.tankiness,
                )
            if "roles" in ov:
                roles = ov["roles"]

            champ = Champion(
                id=cid,
                key=key,
                name=name,
                title=info.get("title", ""),
                tags=tags,
                roles=roles,
                damage=damage,
                ratings=ratings,
                image_url=self.fetcher.champion_image_url(key),
            )
            self._by_id[cid] = champ
            self._by_key[key] = champ
            self._by_name[name.lower()] = champ

        logger.info("Loaded %d champions", len(self._by_id))

    # ── Lookups ──────────────────────────────────────────────────────────
    def get_by_id(self, cid: int) -> Optional[Champion]:
        return self._by_id.get(cid)

    def get_by_key(self, key: str) -> Optional[Champion]:
        return self._by_key.get(key)

    def get_by_name(self, name: str) -> Optional[Champion]:
        return self._by_name.get(name.lower())

    def all_champions(self) -> List[Champion]:
        return list(self._by_id.values())

    def champions_for_role(self, role: str) -> List[Champion]:
        return [c for c in self._by_id.values() if role in c.roles]

    def id_to_key(self, cid: int) -> str:
        c = self._by_id.get(cid)
        return c.key if c else str(cid)

    def key_to_id(self, key: str) -> int:
        c = self._by_key.get(key)
        return c.id if c else 0

    # ── Stats helpers ────────────────────────────────────────────────────
    def set_stats(self, stats: ChampionStats):
        self._stats_cache[f"{stats.champion_id}_{stats.role}"] = stats

    def get_stats(self, cid: int, role: str) -> Optional[ChampionStats]:
        return self._stats_cache.get(f"{cid}_{role}")

    # ── Private ──────────────────────────────────────────────────────────
    @staticmethod
    def _load_overrides() -> Dict[str, Any]:
        if not OVERRIDES_PATH.exists():
            return {}
        try:
            return json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed to load overrides: %s", exc)
            return {}
