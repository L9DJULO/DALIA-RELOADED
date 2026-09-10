import math
from app.scoring.heuristic_terms import mechanics_term, model_term, synergy_term


def test_synergy_is_rescaled_capped_and_duo_boosted():
    assert math.isclose(synergy_term(60.0, False).value, 1.2)
    assert synergy_term(100.0, False).value == 3.0
    assert math.isclose(synergy_term(100.0, True).value, 4.5)
    assert synergy_term(50.0, False).sd == 2.0 and synergy_term(50.0, False).source == "heuristic"


def test_mechanics_and_model_terms():
    assert math.isclose(mechanics_term(12.0).value, 3.6) and mechanics_term(0).sd == 1.5
    assert model_term(9.0).value == 4.0 and model_term(-9.0).value == -4.0
    assert model_term(1.5).source == "model" and model_term(1.5).sd == 2.0
