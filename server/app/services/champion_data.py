"""Champion database — loads champion data from Data Dragon + applies overrides.

Roles come from champion_overrides.json. Ratings are hand-arbitrated there for
the bot-lane champions (ADC and supports); every other champion still falls
back to _auto_ratings, derived from Riot's tags alone (see docs/CHANTIERS.md, 4).
Damage by type is measured (damage_profiles.json, scripts/refresh_damage.py);
_auto_damage only serves champions with neither a measure nor a Riot type.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from statistics import median
from typing import Any, Dict, List, Optional

from app.models.champion import Champion, ChampionRatings, ChampionStats, DamageDealt, DamageProfile
from app.services.data_fetcher import LolalyticsFetcher

logger = logging.getLogger("dalia.champion_data")

OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "champion_overrides.json"
DAMAGE_PATH = Path(__file__).resolve().parent.parent / "data" / "damage_profiles.json"
# Répartition physique / magique d'un champion non mesuré, selon son type Riot
# (mêmes parts que mechanics.physical_share avant la mesure).
_RIOT_TYPE_SPLIT = {"physical": (0.9, 0.1), "magic": (0.1, 0.9), "mixed": (0.5, 0.5)}


def _profile_of(dealt: DamageDealt) -> DamageProfile:
    total = dealt.total or 1.0
    return DamageProfile(physical=round(100 * dealt.physical / total, 1),
                         magical=round(100 * dealt.magic / total, 1),
                         true_dmg=round(100 * dealt.true / total, 1))


def _estimate_damage(champ: Champion, role_medians: Dict[str, float], overall: float) -> DamageDealt:
    """Sans mesure : dégâts médians du poste principal, répartis selon le type Riot,
    à défaut selon le profil des tags."""
    total = role_medians.get(champ.roles[0] if champ.roles else "", overall)
    split = _RIOT_TYPE_SPLIT.get(champ.damage_type or "")
    if split is None:
        d = champ.damage
        return DamageDealt(physical=total * d.physical / 100, magic=total * d.magical / 100,
                           true=total * d.true_dmg / 100)
    return DamageDealt(physical=total * split[0], magic=total * split[1])


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
        if not raw:
            raise RuntimeError("Catalogue de champions vide : nouvelle tentative nécessaire")
        overrides_raw = self._load_overrides()
        measured = {k.lower(): v for k, v in self._load_damage_profiles().items() if not k.startswith("_")}
        # Build case-insensitive lookup so "KhaZix" matches DDragon's "Khazix"
        overrides: Dict[str, Any] = {}
        by_id, by_key, by_name = {}, {}, {}
        for ok, ov in overrides_raw.items():
            overrides[ok.lower()] = ov

        for key, info in raw.items():
            cid = int(info["key"])
            tags = info.get("tags", [])
            name = info.get("name", key)

            # Portée réelle fournie par Data Dragon ; 550 en repli (valeur ADC courante).
            try:
                attack_range = int(info.get("stats", {}).get("attackrange") or 550)
            except (TypeError, ValueError):
                attack_range = 550

            # Base classification
            damage = _auto_damage(tags)
            ratings = _auto_ratings(tags)
            roles = _default_roles(tags, key)

            # Dégâts mesurés (spec composition mesurée) : ils remplacent le profil des tags.
            dealt = None
            m = measured.get(key.lower())
            if isinstance(m, dict) and all(isinstance(m.get(k), (int, float)) for k in ("physical", "magic", "true")):
                dealt = DamageDealt(physical=m["physical"], magic=m["magic"], true=m["true"], measured=True)
                damage = _profile_of(dealt)

            # Apply overrides (case-insensitive)
            ov = overrides.get(key.lower(), {})
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
                difficulty=max(1, min(10, int((info.get("info") or {}).get("difficulty", 5) or 5))),
                tags=tags,
                roles=roles,
                damage=damage,
                ratings=ratings,
                attack_range=attack_range,
                properties=list(ov.get("properties", [])),
                damage_type=ov.get("damage_type"),
                damage_dealt=dealt,
                image_url=self.fetcher.champion_image_url(key),
            )
            by_id[cid] = champ
            by_key[key] = champ
            by_name[name.lower()] = champ

        self._estimate_missing_damage(list(by_id.values()))
        self._by_id, self._by_key, self._by_name = by_id, by_key, by_name

        # Une clé qui ne correspond à aucun champion n'est jamais lue : « Wukong »
        # a ainsi perdu ses rôles en silence, Data Dragon l'appelant « MonkeyKing ».
        ddragon_keys = {r.lower() for r in raw}
        unmatched = sorted(k for k in overrides if not k.startswith("_") and k not in ddragon_keys)
        if unmatched:
            logger.warning("Overrides sans champion Data Dragon, ignorés : %s", ", ".join(unmatched))

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

    def clear_role_stats(self, role: str):
        self._stats_cache = {key: stats for key, stats in self._stats_cache.items() if stats.role != role}

    def get_stats(self, cid: int, role: str) -> Optional[ChampionStats]:
        return self._stats_cache.get(f"{cid}_{role}")

    # ── Private ──────────────────────────────────────────────────────────
    @staticmethod
    def _estimate_missing_damage(champions: List[Champion]) -> None:
        """Estime les dégâts des champions non mesurés, depuis les médianes par poste."""
        by_role: Dict[str, List[float]] = {}
        for c in champions:
            if c.damage_dealt is not None and c.roles:
                by_role.setdefault(c.roles[0], []).append(c.damage_dealt.total)
        role_medians = {r: median(v) for r, v in by_role.items()}
        everyone = [t for v in by_role.values() for t in v]
        overall = median(everyone) if everyone else 20000.0
        for c in champions:
            if c.damage_dealt is None:
                c.damage_dealt = _estimate_damage(c, role_medians, overall)
                if c.damage_type in _RIOT_TYPE_SPLIT:
                    c.damage = _profile_of(c.damage_dealt)

    @staticmethod
    def _load_damage_profiles() -> Dict[str, Any]:
        if not DAMAGE_PATH.exists():
            return {}
        try:
            return json.loads(DAMAGE_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed to load damage profiles: %s", exc)
            return {}

    @staticmethod
    def _load_overrides() -> Dict[str, Any]:
        if not OVERRIDES_PATH.exists():
            return {}
        try:
            return json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed to load overrides: %s", exc)
            return {}
