import math
from app.scoring.composition_term import archetype_term, composition_term, team_value
from app.services.composition import CompositionAnalyzer
from app.services.composition_archetype import Archetype, ArchetypeResult, archetype_counter_adjust
from app.services.mechanics import MechanicsAnalyzer


def test_marginal_value_counts_new_tools_only(catalog):
    mech, comp = MechanicsAnalyzer(catalog), CompositionAnalyzer(catalog)
    poppy, malphite, ahri = catalog.get_by_id(78), catalog.get_by_id(54), catalog.get_by_id(103)
    # Malphite apporte frontline+engage ; Poppy ensuite n'ajoute rien de neuf sur ces outils
    with_poppy = composition_term(poppy, [malphite, ahri], mech, comp)
    with_malphite_first = composition_term(malphite, [ahri], mech, comp)
    assert with_malphite_first.value > with_poppy.value
    # comp_rel = 0.5, with_poppy.value = 0.25 -> sd = 0.5 * 0.25 = 0.125
    assert math.isclose(with_poppy.sd, 0.125) and with_poppy.source == "heuristic"


def test_attenuated_by_known_allies_and_absent_without_ally(catalog):
    mech, comp = MechanicsAnalyzer(catalog), CompositionAnalyzer(catalog)
    malphite, ahri, jinx = catalog.get_by_id(54), catalog.get_by_id(103), catalog.get_by_id(222)
    one = composition_term(malphite, [ahri], mech, comp)
    two = composition_term(malphite, [ahri, jinx], mech, comp)
    raw_one = team_value([ahri, malphite], mech, comp) - team_value([ahri], mech, comp)
    assert math.isclose(one.value, max(-4, min(4, raw_one)) * 0.25)
    assert two.value != one.value
    assert composition_term(malphite, [], mech, comp) is None


def test_team_warnings_are_public(catalog):
    comp = CompositionAnalyzer(catalog)
    assert isinstance(comp.team_warnings([catalog.get_by_id(103), catalog.get_by_id(61)]), list)
    assert not hasattr(comp, "score")


def test_archetype_term_scales_with_confidence(catalog):
    poppy = catalog.get_by_id(78)
    result = ArchetypeResult(Archetype.ENGAGE, {}, 0.5, 3)
    term = archetype_term(poppy, result)
    expected = (archetype_counter_adjust(poppy, Archetype.ENGAGE) - 1.0) * 15.0 * 0.5
    # archetype_rel = 0.5, expected ~= 0.6 -> sd = 0.5 * 0.6 = 0.3
    assert term is not None and math.isclose(term.value, expected) and math.isclose(term.sd, 0.5 * abs(expected))
    assert archetype_term(poppy, ArchetypeResult(Archetype.MIXED, {}, 0.9, 5)) is None
    assert archetype_term(poppy, None) is None


def _melee_warnings(comp, team):
    return [w for w in comp.team_warnings(team) if "corps à corps" in w.message]


def test_an_all_ranged_team_is_warned(catalog):
    """« Si on a que des range parfois c'est pas ouf » — le joueur, 15/09."""
    comp = CompositionAnalyzer(catalog)
    ahri, jinx, janna, cassio = (catalog.get_by_id(i) for i in (103, 222, 40, 69))
    assert all(not c.is_melee for c in (ahri, jinx, janna, cassio))
    warns = _melee_warnings(comp, [ahri, jinx, janna, cassio])
    assert len(warns) == 1 and warns[0].severity == "warning"


def test_one_melee_champion_lifts_the_range_warning(catalog):
    comp = CompositionAnalyzer(catalog)
    team = [catalog.get_by_id(i) for i in (103, 222, 40, 54)]  # Malphite au contact
    assert _melee_warnings(comp, team) == []


def test_range_balance_is_not_judged_on_three_champions(catalog):
    """À trois, le quatrième pick peut encore rééquilibrer : trop tôt pour avertir."""
    comp = CompositionAnalyzer(catalog)
    assert _melee_warnings(comp, [catalog.get_by_id(i) for i in (103, 222, 40)]) == []
