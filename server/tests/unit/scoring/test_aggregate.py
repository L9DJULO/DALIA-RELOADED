import math
import pytest
from app.scoring.aggregate import PREF_KEY_BY_TERM, apply_preferences, comparison_sd, confidence_from_sd, reference_mean, top_group
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
    # Incertitude propre a chaque champion (abs_sd), qui ne s'annule jamais : on retrouve la combinaison quadratique d'origine.
    own_sd = [Term("meta", 0.0, 1.0)]
    items = [(5.0, own_sd), (4.0, own_sd), (2.0, own_sd), (1.9, own_sd)]
    assert top_group(items) == [0, 1]
    assert top_group([(1.0, [Term("meta", 0.0, 0.5)])]) == [0]
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


def test_identical_shared_terms_cost_nothing_in_a_comparison():
    """Le defaut central : composition et synergy identiques gonflaient le seuil."""
    a = [Term("composition", 2.0, 0.0, rel_sd=0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    b = [Term("composition", 2.0, 0.0, rel_sd=0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    assert comparison_sd(a, b) == 0.0


def test_opposite_shared_terms_cost_a_lot():
    a = [Term("composition", 2.0, 0.0, rel_sd=0.5)]
    b = [Term("composition", -2.0, 0.0, rel_sd=0.5)]
    assert math.isclose(comparison_sd(a, b), 0.5 * 4.0)


def test_independent_terms_add_in_quadrature_even_when_equal():
    """L'ignorance ne s'annule pas : deux champions inconnus restent incomparables."""
    a = [Term("meta", 0.0, 3.0)]
    b = [Term("meta", 0.0, 3.0)]
    assert math.isclose(comparison_sd(a, b), math.sqrt(18.0))


def test_term_present_on_one_side_only_still_counts():
    a = [Term("meta", 1.0, 0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    b = [Term("meta", 1.0, 0.5)]
    # synergy: rel 0.5 * (3.0 - 0.0) = 1.5 ; meta: 0.5^2 + 0.5^2
    assert math.isclose(comparison_sd(a, b), math.sqrt(1.5 ** 2 + 0.5))


def test_measured_case_becomes_decidable():
    """Jinx vs Caitlyn, termes reels d2_plus : 5.14 -> 1.29, ecart 3.03."""
    jinx = [Term("meta", 3.59, 0.23, "observed"), Term("matchup", -0.11, 0.77, "observed"),
            Term("mastery", -1.30, 0.0, rel_sd=0.4), Term("composition", 2.00, 0.0, rel_sd=0.5),
            Term("synergy", 3.00, 0.0, rel_sd=0.5), Term("mechanics", 0.0, 0.0, rel_sd=0.5)]
    caitlyn = [Term("meta", 0.41, 0.26, "observed"), Term("matchup", -1.26, 0.83, "observed"),
               Term("mastery", 0.0, 0.0, rel_sd=0.4), Term("composition", 2.00, 0.0, rel_sd=0.5),
               Term("synergy", 3.00, 0.0, rel_sd=0.5), Term("mechanics", 0.0, 0.0, rel_sd=0.5)]
    assert comparison_sd(jinx, caitlyn) < 1.5
    gap = abs(sum(t.value for t in jinx) - sum(t.value for t in caitlyn))
    assert gap > comparison_sd(jinx, caitlyn), "doit devenir decidable"


def test_top_group_uses_pairwise_comparison():
    shared = [Term("composition", 2.0, 0.0, rel_sd=0.5)]
    items = [(3.0, shared + [Term("meta", 3.0, 0.2, "observed")]),
             (2.9, shared + [Term("meta", 2.9, 0.2, "observed")]),
             (-5.0, shared + [Term("meta", -5.0, 0.2, "observed")])]
    assert top_group(items) == [0, 1], "le 3e est nettement derriere"
