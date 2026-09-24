import math
import pytest
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


def test_teamfight_term_is_neutral_until_its_scale_is_set():
    """Neutre par defaut : le cablage se commite sans changer le comportement."""
    from app.models.champion import ChampionRatings
    from app.scoring.heuristic_terms import teamfight_term
    assert teamfight_term(ChampionRatings(teamfight=5)).value == 0.0
    assert teamfight_term(ChampionRatings(teamfight=1)).value == 0.0


def test_teamfight_term_separates_a_teamfighter_from_an_assassin(monkeypatch):
    """Orianna (4) doit passer devant Zed (2) sur ce terme, une fois l'echelle posee."""
    from app.config import config
    from app.models.champion import ChampionRatings
    from app.scoring.heuristic_terms import teamfight_term
    monkeypatch.setattr(config.scoring, "teamfight_scale", 0.5)
    orianna = teamfight_term(ChampionRatings(teamfight=4))
    zed = teamfight_term(ChampionRatings(teamfight=2))
    assert orianna.value == pytest.approx(0.5)
    assert zed.value == pytest.approx(-0.5)
    assert orianna.value - zed.value == pytest.approx(1.0), "amplitude visee : ~1 point"


def test_teamfight_term_carries_its_uncertainty_as_rel_sd(monkeypatch):
    """abs_sd elargirait le groupe de tete sans raison et diluerait le departage v2."""
    from app.config import config
    from app.models.champion import ChampionRatings
    from app.scoring.heuristic_terms import teamfight_term
    monkeypatch.setattr(config.scoring, "teamfight_scale", 0.5)
    term = teamfight_term(ChampionRatings(teamfight=5))
    assert term.abs_sd == 0.0 and term.rel_sd > 0.0
    assert term.outcome_sd == 0.0, "ce n'est pas un risque subi : rien n'est ignore ici"


def test_the_engine_actually_appends_the_teamfight_term():
    """Piege deja rencontre deux fois : une fonction juste, appelee nulle part."""
    import inspect
    from app.services.draft_engine import DraftEngine
    source = inspect.getsource(DraftEngine)
    assert "teamfight_term(" in source
