import math
from datetime import datetime, timedelta, timezone
from app.models.champion import Champion
from app.scoring.mastery_term import MasteryInputs, mastery_term

NOW = datetime(2026, 9, 10, tzinfo=timezone.utc)


def test_declared_tier_scaled_by_difficulty_and_rank():
    t = mastery_term(MasteryInputs(tier="D", difficulty=10, rank="silver", now=NOW))
    assert math.isclose(t.value, -5.0 * (0.6 + 0.8) * 1.3)
    # mastery_rel = 0.4, t.value = -9.1 -> sd = 0.4 * 9.1 = 3.64
    assert math.isclose(t.sd, 3.64) and t.source == "heuristic"
    assert mastery_term(MasteryInputs(tier="A", difficulty=5, rank=None, now=NOW)).value == 0.0
    assert math.isclose(mastery_term(MasteryInputs(tier="S", difficulty=5, rank="diamond", now=NOW)).value, 0.8)


def test_personal_win_rate_replaces_declared_tier_when_enough_games():
    t = mastery_term(MasteryInputs(tier="D", difficulty=5, rank=None, personal_games=30, personal_wr=60.0, now=NOW))
    assert math.isclose(t.value, min(6.0, 10.0 * 30 / 40))
    assert t.sd == 1.0 and t.source == "observed" and t.sample == 30


def test_personal_and_declared_are_blended_between_3_and_9_games():
    t = mastery_term(MasteryInputs(tier="B", difficulty=5, rank=None, personal_games=5, personal_wr=70.0, now=NOW))
    personal = min(6.0, 20.0 * 5 / 15)
    assert math.isclose(t.value, (5 * personal + 10 * -1.5) / 15)
    assert t.source == "heuristic"


def test_recency_penalty_capped_and_halved_by_mastery_points():
    stale = MasteryInputs(tier="A", difficulty=5, rank=None, last_played=NOW - timedelta(days=200), now=NOW)
    assert math.isclose(mastery_term(stale).value, -1.5)
    veteran = MasteryInputs(tier="A", difficulty=5, rank=None, last_played=NOW - timedelta(days=200),
                            mastery_points=150_000, now=NOW)
    assert math.isclose(mastery_term(veteran).value, -0.75)


def test_champion_has_default_difficulty():
    assert Champion(id=1, key="X", name="X").difficulty == 5
