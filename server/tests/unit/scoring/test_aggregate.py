import math
import pytest
from app.scoring.aggregate import PREF_KEY_BY_TERM, apply_preferences, confidence_from_sd, reference_mean, top_group
from app.scoring.types import Estimate, Term


def test_preferences_scale_values_not_sd_and_map_future_opponent_to_draft_risk():
    terms = [Term("meta", 2.0, 1.0), Term("future_opponent", -2.0, 1.5), Term("mechanics", 1.0, 0.5)]
    out = apply_preferences(terms, {"meta": 1.5, "draft_risk": 0.5, "mechanics": 9})
    assert [round(t.value, 3) for t in out] == [3.0, -1.0, 1.0]
    assert [t.sd for t in out] == [1.0, 1.5, 0.5]
    assert PREF_KEY_BY_TERM["future_opponent"] == "draft_risk"
    assert apply_preferences(terms, None)[0].value == 2.0


def test_reference_mean_is_pool_mean_and_zero_when_empty():
    assert reference_mean([1.0, 3.0]) == 2.0
    assert reference_mean([]) == 0.0


def test_top_group_is_contiguous_and_uses_combined_sd():
    # écart 1.0 < sqrt(1²+1²)=1.41 → lié ; écart 3.0 > sqrt(1²+1²) → hors groupe ; le 4e est proche du 3e mais pas du leader
    items = [(5.0, 1.0), (4.0, 1.0), (2.0, 1.0), (1.9, 1.0)]
    assert top_group(items) == [0, 1]
    assert top_group([(1.0, 0.5)]) == [0]
    assert top_group([]) == []


def test_confidence_is_bounded():
    assert confidence_from_sd(0.0) == 95.0
    assert confidence_from_sd(3.0) == pytest.approx(50.0)
    assert confidence_from_sd(100.0) == 8.0


def test_term_sd_combines_relative_and_absolute_components():
    # sqrt((0.5*4.0)^2 + 1.5^2) = sqrt(4 + 2.25) = 2.5
    t = Term("composition", 4.0, 1.5, rel_sd=0.5)
    assert math.isclose(t.sd, 2.5)


def test_relative_only_term_at_zero_value_carries_no_uncertainty():
    """Le defaut central : mechanics a 0.00 facturait 1.5 de sigma."""
    assert Term("mechanics", 0.0, 0.0, rel_sd=0.5).sd == 0.0


def test_absolute_only_term_keeps_its_sd_whatever_its_value():
    """Ignorance propre au champion : meta sans donnees vaut 0 mais reste incertain."""
    assert math.isclose(Term("meta", 0.0, 3.0).sd, 3.0)


def test_estimate_sd_sums_derived_term_variances():
    est = Estimate(terms=[Term("meta", 0.0, 3.0), Term("composition", 4.0, 0.0, rel_sd=0.5)])
    assert math.isclose(est.sd, math.sqrt(9.0 + 4.0))
