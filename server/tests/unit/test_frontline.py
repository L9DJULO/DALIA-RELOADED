"""Tank et frontline définis une fois (spec composition mesurée, §6 ; joueur, 28/09/2026).

tank = Vanguard, Warden, Juggernaut : ce qui encaisse. frontline = tank + Divers, sans Elise
ni Rengar : ce qui tient le contact. La note `tankiness` ne définit plus ni l'un ni l'autre.
"""
import json
from pathlib import Path

import pytest

from app.models.champion import Champion, ChampionRatings
from app.models.draft import DraftState
from app.services.composition import CompositionAnalyzer
from app.services.composition_archetype import Archetype, archetype_counter_adjust
from app.services.draft_engine import DraftEngine
from app.services.mechanics import MechanicsAnalyzer
from app.services.reasons import _ally_patterns
from app.services.synergy import SynergyAnalyzer

DATA = Path(__file__).resolve().parents[2] / "app" / "data"


def champ(key, cid, properties=(), tags=("Marksman",), tankiness=2, **ratings):
    return Champion(id=cid, key=key, name=key, tags=list(tags), properties=list(properties),
                    ratings=ChampionRatings(tankiness=tankiness, **ratings))


# Un carry à tankiness 4 (Xayah : R intouchable) n'est ni tank ni frontline.
XAYAH = champ("Xayah", 498, tankiness=4)
# Un Diver tient le contact sans être un tank.
VI = champ("Vi", 254, properties=["frontline"], tags=("Fighter", "Assassin"), tankiness=3)
MALPHITE = champ("Malphite", 54, properties=["tank", "frontline"], tags=("Tank", "Mage"), tankiness=5)


def test_frontline_property_is_tanks_and_divers_without_elise_and_rengar():
    facts = json.loads((DATA / "champion_facts.json").read_text(encoding="utf-8"))
    overrides = json.loads((DATA / "champion_overrides.json").read_text(encoding="utf-8"))
    front_classes = {"Vanguard", "Warden", "Juggernaut", "Diver"}
    expected = {k for k, v in facts.items()
                if k != "_meta" and front_classes & set(v.get("subclasses") or [])} - {"Elise", "Rengar"}
    tagged = {k for k, v in overrides.items() if isinstance(v, dict) and "frontline" in v.get("properties", [])}
    assert tagged == expected
    tanks = {k for k, v in overrides.items() if isinstance(v, dict) and "tank" in v.get("properties", [])}
    assert tanks <= tagged, "tout tank tient le front"


def test_coverage_counts_a_diver_as_frontline_and_not_a_survivable_carry(catalog):
    coverage = MechanicsAnalyzer(catalog).coverage
    assert "frontline" in coverage(VI)
    assert "frontline" not in coverage(XAYAH)


def test_the_no_frontline_warning_reads_the_property(catalog):
    warnings = CompositionAnalyzer(catalog).team_warnings
    squishies = [champ("Jinx", 222), champ("Lux", 99, tags=("Mage",)), XAYAH]
    assert any("frontline" in w.message.lower() for w in warnings(squishies))
    assert not any("frontline" in w.message.lower() for w in warnings(squishies[:2] + [VI]))


def test_the_enemy_frontline_gap_is_filled_by_a_diver():
    engine = DraftEngine.__new__(DraftEngine)
    assert "no_frontline" in engine._detect_comp_gaps([XAYAH, champ("Jinx", 222)])
    assert "no_frontline" not in engine._detect_comp_gaps([XAYAH, VI])
    assert engine._fills_gap(VI, "no_frontline") and not engine._fills_gap(XAYAH, "no_frontline")


def test_the_frontline_reason_pattern_reads_the_property():
    assert "tank" in _ally_patterns(VI)
    assert "tank" not in _ally_patterns(XAYAH)


def test_the_archetype_soaks_with_tanks_only():
    """Contre une composition de picks, un tank encaisse ; un Diver ou un carry survivant non."""
    tank_adj = archetype_counter_adjust(MALPHITE, Archetype.PICK)
    diver_adj = archetype_counter_adjust(champ("Vi2", 999, properties=["frontline"], tags=("Tank",), tankiness=5),
                                         Archetype.PICK)
    assert tank_adj - diver_adj == pytest.approx(0.08)


@pytest.mark.asyncio
async def test_the_kit_synergy_fallback_counts_a_tank_support_by_property(catalog):
    """Repli sans page de duo : « support tank » lit la propriété, pas la tankiness."""
    catalog._by_id[498] = XAYAH
    support_like = champ("Faux", 9001, tags=("Support",), tankiness=5)
    real_tank = champ("Vrai", 9002, properties=["tank", "frontline"], tags=("Support",), tankiness=2)
    catalog._by_id[9001], catalog._by_id[9002] = support_like, real_tank
    analyzer = SynergyAnalyzer(catalog, fetcher=None)

    def draft(sup):
        return DraftState(my_role="bot", ally_picks=[{"champion_id": sup, "role": "support"}])

    # Candidat : Xayah (Marksman) ; la Jinx de la fixture porte le tag Mage.
    assert await analyzer.score(498, "bot", draft(9002)) - await analyzer.score(498, "bot", draft(9001)) == 5
