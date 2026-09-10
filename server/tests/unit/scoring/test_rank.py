from app.scoring.rank import counter_lambda, lolalytics_tier, mastery_rank_factor, normalize_rank


def test_normalize_rank_accepts_lcu_and_profile_spellings():
    assert normalize_rank("EMERALD") == "emerald"
    assert normalize_rank(" Gold ") == "gold"
    assert normalize_rank("GRANDMASTER") == "master_plus"
    assert normalize_rank("CHALLENGER") == "master_plus"
    assert normalize_rank("master_plus") == "master_plus"
    assert normalize_rank("") is None and normalize_rank(None) is None and normalize_rank("UNRANKED") is None


def test_lolalytics_tier_falls_back_to_config_default():
    assert lolalytics_tier("iron") == "iron"
    assert lolalytics_tier("master_plus") == "master_plus"
    assert lolalytics_tier(None) == "emerald_plus"
    assert lolalytics_tier(None, "master_plus") == "master_plus"
    assert lolalytics_tier("gold", "master_plus") == "gold"


def test_rank_factors():
    assert counter_lambda("silver") == 0.15 and counter_lambda("master_plus") == 0.5 and counter_lambda(None) == 0.30
    assert mastery_rank_factor("bronze") == 1.3 and mastery_rank_factor("emerald") == 1.0 and mastery_rank_factor("diamond") == 0.8
