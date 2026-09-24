from app.scoring.rank import counter_lambda, lolalytics_tier, mastery_rank_factor, normalize_rank
from app.scoring.types import RANKS


def test_normalize_rank_accepts_lcu_and_profile_spellings():
    assert normalize_rank("EMERALD") == "emerald"
    assert normalize_rank(" Gold ") == "gold"
    assert normalize_rank("GRANDMASTER") == "master_plus"
    assert normalize_rank("CHALLENGER") == "master_plus"
    assert normalize_rank("master_plus") == "master_plus"
    assert normalize_rank("") is None and normalize_rank(None) is None and normalize_rank("UNRANKED") is None


def test_lolalytics_tier_maps_each_rank_to_a_sampled_bucket():
    assert lolalytics_tier("iron") == "iron"
    assert lolalytics_tier("silver") == "silver"
    assert lolalytics_tier("gold") == "gold_plus"
    assert lolalytics_tier("emerald") == "emerald_plus"
    assert lolalytics_tier("diamond") == "diamond_plus"
    assert lolalytics_tier("master_plus") == "d2_plus"


def test_lolalytics_tier_falls_back_when_the_rank_is_unknown():
    assert lolalytics_tier(None) == "emerald_plus"
    assert lolalytics_tier(None, "master_plus") == "master_plus"
    assert lolalytics_tier("unranked", "master_plus") == "master_plus"
    assert lolalytics_tier("", "d2_plus") == "d2_plus"


def test_no_rank_maps_to_a_bucket_lolalytics_does_not_serve():
    """silver_plus, bronze_plus et iron_plus repondent 200 avec zero champion."""
    served = {"iron", "bronze", "silver", "gold_plus", "platinum_plus",
              "emerald_plus", "diamond_plus", "d2_plus"}
    for rank in RANKS:
        assert lolalytics_tier(rank) in served, f"{rank} pointe vers un bucket vide"


def test_rank_factors():
    assert counter_lambda("silver") == 0.15 and counter_lambda("master_plus") == 0.5 and counter_lambda(None) == 0.30
    assert mastery_rank_factor("bronze") == 1.3 and mastery_rank_factor("emerald") == 1.0 and mastery_rank_factor("diamond") == 0.8


def test_matchup_weight_is_neutral_at_every_rank_by_default():
    """Neutre par defaut : le cablage se commite sans changer le comportement."""
    from app.scoring.rank import matchup_weight
    from app.scoring.types import RANKS
    for rank in RANKS:
        assert matchup_weight(rank) == 1.0
    assert matchup_weight(None) == 1.0
    assert matchup_weight("challenger_imaginaire") == 1.0


def test_matchup_weight_covers_every_rank_the_engine_accepts():
    """Un rang absent de la table tomberait en silence sur la valeur inconnue."""
    from app.config import config
    from app.scoring.types import RANKS
    assert set(config.scoring.matchup_weight) == set(RANKS)


def test_matchup_weight_decreases_with_rank_once_set(monkeypatch):
    """A haut elo une lane perdue se rattrape, une compo ratee non."""
    from app.config import config
    from app.scoring.rank import matchup_weight
    monkeypatch.setitem(config.scoring.matchup_weight, "iron", 1.0)
    monkeypatch.setitem(config.scoring.matchup_weight, "master_plus", 0.6)
    assert matchup_weight("master_plus") < matchup_weight("iron")
