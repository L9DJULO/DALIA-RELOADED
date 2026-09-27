"""Raisons de synergie : la mesure parle d'abord, les gabarits de kit en repli (chantier 3)."""
from app.services.reasons import _synergy_reason


def test_observed_pair_above_the_threshold_is_a_synergy_reason(catalog):
    r = _synergy_reason(catalog.get_by_id(222), catalog.get_by_id(40), "support", "bot", 1.84, source="observed")
    assert r["text"] == "Duo favorable avec Janna (+1,8)" and r["kind"] == "synergy"
    assert r["champions"] == ["Janna", "Jinx"]


def test_observed_negative_pair_is_a_warning(catalog):
    r = _synergy_reason(catalog.get_by_id(222), catalog.get_by_id(40), "support", "bot", -1.2, source="observed")
    assert r["text"] == "Duo défavorable avec Janna (−1,2)" and r["kind"] == "warning"


def test_observed_small_pair_says_nothing_even_when_a_kit_template_matches(catalog):
    from app.models.champion import ChampionRatings
    jinx = catalog.get_by_id(222).model_copy(update={"ratings": ChampionRatings(dps=4)})
    malphite = catalog.get_by_id(54)
    assert _synergy_reason(jinx, malphite, "top", "bot", 0.0) is not None, "le gabarit de kit s'applique"
    assert _synergy_reason(jinx, malphite, "top", "bot", 0.6, source="observed") is None


def test_measured_duo_lines_rank_with_the_measured_lane_lines():
    """Comme « Lane favorable dans les matchs observés » : une ligne de mesure, sous les raisons de kit."""
    from app.services.reasons import _specificity
    for text in ("Duo favorable avec Janna (+1,8)", "Duo défavorable avec Janna (−1,2)"):
        assert _specificity({"text": text, "champions": ["Janna", "Jinx"], "kind": "synergy"}) == 2


def test_verdict_names_the_best_measured_pair_not_the_kit_favourite(catalog):
    """Pas de « Synergie forte avec Malphite » à côté d'un « Duo défavorable avec Malphite »."""
    from app.models.champion import ChampionRatings
    from app.models.draft import DraftState
    from app.services.reasons import generate_verdict
    jinx = catalog.get_by_id(222).model_copy(update={"ratings": ChampionRatings(dps=4)})
    draft = DraftState(my_role="bot", my_pick_order=3,
                       ally_picks=[{"champion_id": 54, "role": "top"}, {"champion_id": 40, "role": "support"}])
    details = [{"ally_name": "Malphite", "ally_role": "top", "delta": -1.2, "games": 9000, "source": "observed"},
               {"ally_name": "Janna", "ally_role": "support", "delta": 2.1, "games": 30000, "source": "observed"}]
    verdict = generate_verdict(cand=jinx, draft=draft, db=catalog, matchup=0.0, synergy=2.0, composition=0.0,
                               future=0.0, synergy_details=details)
    assert verdict.startswith("Synergie forte avec Janna")


def test_verdict_names_no_ally_when_no_measured_pair_is_positive(catalog):
    from app.models.champion import ChampionRatings
    from app.models.draft import DraftState
    from app.services.reasons import generate_verdict
    jinx = catalog.get_by_id(222).model_copy(update={"ratings": ChampionRatings(dps=4)})
    draft = DraftState(my_role="bot", my_pick_order=3, ally_picks=[{"champion_id": 54, "role": "top"}])
    details = [{"ally_name": "Malphite", "ally_role": "top", "delta": -0.4, "games": 9000, "source": "observed"}]
    verdict = generate_verdict(cand=jinx, draft=draft, db=catalog, matchup=0.0, synergy=2.0, composition=0.0,
                               future=0.0, synergy_details=details)
    assert "Malphite" not in verdict
