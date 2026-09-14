import math
from app.config import config
from app.scoring.heuristic_terms import mechanics_term, model_term, synergy_term


def test_synergy_is_rescaled_capped_and_duo_boosted():
    assert math.isclose(synergy_term(60.0, False).value, 1.2)
    assert synergy_term(100.0, False).value == 3.0
    assert math.isclose(synergy_term(100.0, True).value, 4.5)
    assert synergy_term(50.0, False).sd == 0.0 and synergy_term(50.0, False).source == "heuristic"


def test_mechanics_and_model_terms():
    assert math.isclose(mechanics_term(12.0).value, 3.6) and mechanics_term(0).sd == 0.0
    assert model_term(9.0).value == 4.0 and model_term(-9.0).value == -4.0
    assert model_term(1.5).source == "model" and math.isclose(model_term(1.5).sd, 0.75)


def test_mechanics_term_without_any_rule_is_certain():
    t = mechanics_term(0.0)
    assert t.value == 0.0 and t.sd == 0.0


def test_mechanics_uncertainty_grows_with_its_own_effect():
    small, large = mechanics_term(2.0), mechanics_term(10.0)
    assert large.sd > small.sd > 0.0


def test_synergy_uncertainty_is_relative_to_its_value():
    t = synergy_term(50.0, duo_bonus=False)   # score neutre -> valeur 0
    assert t.value == 0.0 and t.sd == 0.0
    strong = synergy_term(100.0, duo_bonus=False)
    assert math.isclose(strong.sd, config.scoring.synergy_rel * abs(strong.value))
