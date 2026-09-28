"""Sources de dégâts (spec composition mesurée, §5 et §7 ; joueur, 28/09/2026).

« Trop AD, c'est une seule vraie source AP » : on compte les champions qui infligent au
moins 10 000 dégâts d'un type par partie, au lieu de lire un pourcentage de profil.
"""
import pytest

from app.models.champion import Champion, DamageDealt
from app.models.draft import DraftState
from app.services.composition import CompositionAnalyzer
from app.services.draft_engine import DraftEngine
from app.services.mechanics import MechanicsAnalyzer
from app.services.reasons import _composition_reasons
from app.services.synergy import SynergyAnalyzer


def champ(key, cid, physical=0.0, magic=0.0, true=0.0, tags=("Fighter",)):
    return Champion(id=cid, key=key, name=key, tags=list(tags),
                    damage_dealt=DamageDealt(physical=physical, magic=magic, true=true, measured=True))


# Mesures Master+ du 28/09 (arrondies).
SYNDRA = champ("Syndra", 134, physical=928, magic=22401, tags=("Mage",))
KAISA = champ("Kaisa", 145, physical=14263, magic=10013, tags=("Marksman",))
LEONA = champ("Leona", 89, physical=2668, magic=6030, tags=("Tank", "Support"))
JINX = champ("Jinx", 222, physical=23222, magic=736, tags=("Marksman",))
DARIUS = champ("Darius", 122, physical=15920, magic=53)
LEE = champ("LeeSin", 64, physical=14952, magic=2463)
ZED = champ("Zed", 238, physical=24594, magic=945, tags=("Assassin",))
ORIANNA = champ("Orianna", 61, physical=1257, magic=21044, tags=("Mage",))


def test_a_source_deals_at_least_ten_thousand_of_the_type():
    assert SYNDRA.is_source("magic") and not SYNDRA.is_source("physical")
    assert not LEONA.is_source("magic"), "6 030 magiques : un support n'est pas une vraie source"
    assert KAISA.is_source("magic") and KAISA.is_source("physical"), "hybride : les deux"
    assert champ("Seuil", 1, magic=10000).is_source("magic")
    assert not champ("Sous", 2, magic=9999).is_source("magic")


def _damage_warnings(team):
    return [w for w in CompositionAnalyzer(None).team_warnings(team) if " AD" in w.message or " AP" in w.message]


def test_a_full_team_without_ap_source_is_critical():
    warnings = _damage_warnings([DARIUS, LEE, ZED, JINX, LEONA])
    assert [w.severity for w in warnings] == ["critical"]


def test_a_full_team_with_a_single_ap_source_is_warned():
    warnings = _damage_warnings([DARIUS, LEE, SYNDRA, JINX, LEONA])
    assert [w.severity for w in warnings] == ["warning"]


def test_two_ap_sources_are_enough():
    assert _damage_warnings([DARIUS, ORIANNA, SYNDRA, JINX, LEONA]) == []


def test_four_champions_without_source_warn_and_three_do_not():
    assert [w.severity for w in _damage_warnings([DARIUS, LEE, JINX, LEONA])] == ["warning"]
    assert _damage_warnings([DARIUS, LEE, JINX]) == []


def test_the_rule_is_symmetric_for_ad():
    ap_team = [ORIANNA, SYNDRA, champ("Lux", 99, magic=15584), champ("Amumu", 32, magic=12710), LEONA]
    assert [w.severity for w in _damage_warnings(ap_team)] == ["critical"]


def test_damage_coverage_needs_a_real_source(catalog):
    coverage = MechanicsAnalyzer(catalog).coverage
    assert "magic_damage" in coverage(SYNDRA)
    assert "magic_damage" not in coverage(LEONA)
    assert {"magic_damage", "physical_damage"} <= coverage(KAISA)


def test_the_enemy_ap_gap_counts_sources():
    engine = DraftEngine.__new__(DraftEngine)
    assert "no_ap" in engine._detect_comp_gaps([ZED, LEONA])
    assert "no_ap" not in engine._detect_comp_gaps([ZED, SYNDRA])
    assert engine._fills_gap(SYNDRA, "no_ap") and not engine._fills_gap(LEONA, "no_ap")


def test_the_ap_reason_needs_a_source_candidate_and_at_most_one_ally_source():
    texts = lambda cand, team: [r["text"] for r in _composition_reasons(cand, team, None)]
    assert "Apporte de l'AP dans une comp AD-heavy" in texts(SYNDRA, [DARIUS, LEE, JINX, LEONA])
    assert "Apporte de l'AP dans une comp AD-heavy" in texts(SYNDRA, [DARIUS, ORIANNA, JINX])
    assert "Apporte de l'AP dans une comp AD-heavy" not in texts(SYNDRA, [ORIANNA, KAISA, JINX])
    assert "Apporte de l'AP dans une comp AD-heavy" not in texts(LEONA, [DARIUS, LEE, JINX])
    assert "Apporte de l'AP dans une comp AD-heavy" not in texts(SYNDRA, [DARIUS, LEE]), "trois alliés connus"


def test_the_team_summary_weights_each_champion_by_the_damage_it_deals():
    """Leona pèse ce qu'elle inflige, plus le poids fixe « support × 0,4 »."""
    summary = CompositionAnalyzer(None).team_summary_from_list([JINX, LEONA], DraftState(my_role="mid"))
    physical = JINX.damage_dealt.physical + LEONA.damage_dealt.physical
    total = JINX.damage_dealt.total + LEONA.damage_dealt.total
    assert summary["damage_physical"] == pytest.approx(100 * physical / total, abs=0.1)


def test_the_kit_fallback_diversity_bonus_reads_sources(catalog):
    """Repli sans page de duo : +1 quand l'un apporte un type dont l'autre n'est pas source."""
    for c in (SYNDRA, ZED, JINX):
        catalog._by_id[c.id] = c
    analyzer = SynergyAnalyzer(catalog, fetcher=None)

    def delta(cand, ally):
        draft = DraftState(my_role="mid", ally_picks=[{"champion_id": ally.id, "role": "bot"}])
        return analyzer._kit_details(cand.id, "mid", draft)[0]["delta"]

    assert delta(SYNDRA, JINX) - delta(ZED, JINX) == pytest.approx(1.0)
