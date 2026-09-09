import pytest
from app.models.draft import DraftState, PoolEntry
from app.services.mechanics import MechanicsAnalyzer
from app.services.pool_advisor import advise_pool


def draft(enemies=(), allies=(), role="top"):
    return DraftState(my_role=role, enemy_picks=[{"champion_id": cid} for cid in enemies],
                      ally_picks=[{"champion_id": cid} for cid in allies])


def test_poppy_distinguishes_dashes_blinks_and_unstoppable(catalog):
    analyzer = MechanicsAnalyzer(catalog)
    score, rules = analyzer.evaluate(catalog.get_by_key("Poppy"), draft([59, 81, 54]))
    assert score == 3
    assert rules[0]["champions"] == ["JarvanIV"]
    assert rules[1]["champions"] == ["Ezreal"]
    assert "imparables" in rules[0]["caveat"]


def test_nasus_requires_relevant_target_and_accounts_for_peel(catalog):
    analyzer = MechanicsAnalyzer(catalog)
    nasus = catalog.get_by_key("Nasus")
    assert analyzer.evaluate(nasus, draft([61]))[0] == 0
    carry_score, _ = analyzer.evaluate(nasus, draft([222]))
    denied_score, rules = analyzer.evaluate(nasus, draft([222, 40]))
    assert carry_score > denied_score
    assert any(r["kind"] == "warning" and r["score_delta"] < 0 for r in rules)


def test_nilah_uses_w_not_passive(catalog):
    _, rules = MechanicsAnalyzer(catalog).evaluate(catalog.get_by_key("Nilah"), draft([222]))
    assert rules[0]["text"].startswith("W ")


def test_yasuo_combo_is_ally_only(catalog):
    analyzer = MechanicsAnalyzer(catalog)
    assert analyzer.evaluate(catalog.get_by_key("Yasuo"), draft([54]))[0] == 0
    assert analyzer.evaluate(catalog.get_by_key("Yasuo"), draft(allies=[54]))[0] > 0


def test_pool_advice_suggests_missing_tools_in_same_role(catalog):
    advice = advise_pool(catalog, "top", [PoolEntry(champion_id=75)])
    assert advice["gaps"]
    assert all(s["champion_id"] != 75 for s in advice["suggestions"])
    assert any(s["champion_id"] == 78 for s in advice["suggestions"])
    assert all("top" in catalog.get_by_id(s["champion_id"]).roles for s in advice["suggestions"])
