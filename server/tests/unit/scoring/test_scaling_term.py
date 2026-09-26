"""Terme de scaling : face à une équipe qui scale, valoriser ce qui gagne tôt (joueur, 26/09)."""
import pytest

from app.models.draft import DraftState
from app.scoring.scaling_term import enemy_scaling, scaling_term

DATA = {"Kayle": {"top": {"delta": 14.0, "games": 50000}},
        "Kassadin": {"mid": {"delta": 14.0, "games": 50000}},
        "Vayne": {"bot": {"delta": 9.0, "games": 50000}},
        "LeeSin": {"jungle": {"delta": -6.0, "games": 50000}},
        "Karthus": {"jungle": {"delta": 8.0, "games": 50000}},
        "Rare": {"jungle": {"delta": 20.0, "games": 10}},
        "Draven": {"bot": {"delta": -3.0, "games": 50000}}}


def _draft(enemies):
    d = DraftState(my_role="jungle", enemy_picks=[{"champion_id": i} for i in range(1, len(enemies) + 1)])
    d.role_distributions = {i: {role: 1.0} for i, (_, role) in enumerate(enemies, 1)}
    return d, {i: key for i, (key, _) in enumerate(enemies, 1)}


@pytest.fixture
def on(monkeypatch):
    from app.config import config
    monkeypatch.setattr(config.scoring, "scaling_scale", 1.0)


def test_enemy_scaling_averages_the_revealed_enemies_on_their_roles():
    draft, keys = _draft([("Kayle", "top"), ("Kassadin", "mid"), ("Draven", "bot")])
    assert enemy_scaling(draft, keys, DATA) == pytest.approx((14 + 14 - 3) / 3, abs=0.2)


def test_against_scalers_an_early_jungler_gains_and_a_scaler_loses(on):
    """Jarvan ou Lee Sin gankent et empêchent Kayle, Kassadin, Vayne de scaler."""
    draft, keys = _draft([("Kayle", "top"), ("Kassadin", "mid"), ("Vayne", "bot")])
    lee = scaling_term("LeeSin", "jungle", draft, keys, DATA)
    karthus = scaling_term("Karthus", "jungle", draft, keys, DATA)
    assert lee.value > 0 > karthus.value


def test_against_an_early_team_nothing_is_said(on):
    """Le joueur a décrit un seul sens : face à des scalers, jouer tôt. L'inverse n'est pas acquis."""
    draft, keys = _draft([("LeeSin", "jungle"), ("Draven", "bot")])
    assert scaling_term("Karthus", "jungle", draft, keys, DATA) is None


def test_a_thin_sample_is_shrunk_towards_zero(on):
    draft, keys = _draft([("Kayle", "top"), ("Kassadin", "mid")])
    assert abs(scaling_term("Rare", "jungle", draft, keys, DATA).value) < 0.05


def test_the_lever_is_neutral_by_default():
    draft, keys = _draft([("Kayle", "top"), ("Kassadin", "mid")])
    assert scaling_term("LeeSin", "jungle", draft, keys, DATA) is None


def test_unknown_champions_carry_no_signal(on):
    draft, keys = _draft([("Kayle", "top")])
    assert scaling_term("Inconnu", "jungle", draft, keys, DATA) is None
