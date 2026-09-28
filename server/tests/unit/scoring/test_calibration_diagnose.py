"""Le triage des assertions de calibration doit être mécanique et reproductible."""
import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace

from app.scoring.types import Term

# run_calibration.py est un script hors package : chargement par chemin.
_PATH = Path(__file__).resolve().parents[2] / "calibration" / "run_calibration.py"
_spec = importlib.util.spec_from_file_location("run_calibration", _PATH)
run_calibration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_calibration)
assertion_separation = run_calibration.assertion_separation
validate_rank = run_calibration.validate_rank


def rec(name, score, sd, terms=None):
    return SimpleNamespace(champion_name=name, champion_key=name, total_score=score,
                           score_sd=sd, breakdown=SimpleNamespace(
                               terms=terms if terms is not None else [Term("meta", score, sd, "observed")]))


RECS = [rec("Caitlyn", 3.0, 1.0), rec("Jinx", 2.5, 1.0),
        rec("Ezreal", 0.0, 1.0), rec("Yasuo", -4.0, 1.0)]


def test_shared_terms_no_longer_inflate_the_separation():
    """Deux champions ne differant que par meta : le seuil ne doit venir que de meta."""
    shared = [Term("composition", 2.0, 0.0, rel_sd=0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    recs = [rec("A", 8.0, 0.0, shared + [Term("meta", 3.0, 0.3, "observed")]),
            rec("B", 6.0, 0.0, shared + [Term("meta", 1.0, 0.3, "observed")])]
    gap, combined, _ = assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "A", "champion_b": "B"}, recs)
    assert math.isclose(gap, 2.0)
    assert math.isclose(combined, math.sqrt(0.3 ** 2 + 0.3 ** 2))
    assert gap > combined, "decidable : les termes partages s'annulent"


def test_pair_assertion_reports_gap_and_combined_uncertainty():
    gap, combined, _ = assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Yasuo"}, RECS)
    assert math.isclose(gap, 7.0)
    assert math.isclose(combined, math.sqrt(2.0))


def test_undecidable_pair_has_gap_below_combined_uncertainty():
    gap, combined, _ = assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Jinx"}, RECS)
    assert gap < combined, "0.5 d'écart pour ±1.41 : la donnée ne porte pas la question"


def test_top_n_assertion_compares_against_the_boundary_slot():
    gap, combined, label = assertion_separation(
        {"type": "must_be_in_top_3", "champion": "Yasuo"}, RECS)
    assert math.isclose(gap, 4.0), "Yasuo (-4.0) contre le 3e, Ezreal (0.0)"
    assert "Ezreal" in label


def test_champion_already_at_the_boundary_compares_against_its_neighbour():
    gap, _, label = assertion_separation(
        {"type": "must_be_in_top_3", "champion": "Ezreal"}, RECS)
    assert math.isclose(gap, 4.0), "Ezreal est lui-meme 3e : on le compare au 4e"
    assert "Yasuo" in label


def test_threshold_assertion_compares_advantage_to_the_threshold():
    gap, combined, _ = assertion_separation(
        {"type": "must_have_advantage_above", "champion": "Caitlyn", "min_advantage": 1.0}, RECS)
    assert math.isclose(gap, 2.0) and math.isclose(combined, 1.0)


def test_non_ordering_assertions_have_no_separation():
    for a in ({"type": "must_be_tied", "champion_a": "Caitlyn", "champion_b": "Jinx"},
              {"type": "must_have_reason_containing", "champion": "Caitlyn", "substring": "x"},
              {"type": "must_not_have_reason_containing", "champion": "Caitlyn", "substring": "x"}):
        assert assertion_separation(a, RECS) is None


def test_absent_champion_has_no_separation():
    assert assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Zeri"}, RECS) is None


def test_unknown_rank_is_rejected_with_accepted_values_listed():
    message = validate_rank("diamnod")
    assert message is not None and "diamnod" in message, "une faute de frappe doit etre signalee, pas absorbee"
    for rank in run_calibration.RANKS:
        assert rank in message, f"{rank} doit figurer parmi les valeurs acceptees"


evaluate_assertion = run_calibration.evaluate_assertion


def test_top_2_accepts_the_second_and_rejects_the_third():
    assert evaluate_assertion({"type": "must_be_in_top_2", "champion": "Jinx"}, RECS)[0]
    assert not evaluate_assertion({"type": "must_be_in_top_2", "champion": "Ezreal"}, RECS)[0]


def test_top_2_separation_compares_against_the_second_slot():
    gap, _, label = assertion_separation({"type": "must_be_in_top_2", "champion": "Ezreal"}, RECS)
    assert math.isclose(gap, 2.5), "Ezreal (0.0) contre le 2e, Jinx (2.5)"
    assert "Jinx" in label


def _tied(recs, n):
    """Les n premiers forment le groupe de tête du moteur."""
    for i, r in enumerate(recs):
        r.tie_with_leader = i < n
    return recs


def test_lead_alone_requires_the_leader_to_be_out_of_any_tie():
    alone = _tied([rec("Jax", 5.0, 1.0), rec("Malphite", 1.0, 1.0)], 1)
    tied = _tied([rec("Jax", 5.0, 1.0), rec("Malphite", 4.5, 1.0)], 2)
    assert evaluate_assertion({"type": "must_lead_alone", "champion": "Jax"}, alone)[0]
    assert not evaluate_assertion({"type": "must_lead_alone", "champion": "Jax"}, tied)[0], \
        "n°1 mais à égalité avec Malphite : il ne se détache pas"


def test_lead_alone_rejects_a_champion_that_is_not_first():
    recs = _tied([rec("Malphite", 5.0, 1.0), rec("Jax", 1.0, 1.0)], 1)
    assert not evaluate_assertion({"type": "must_lead_alone", "champion": "Jax"}, recs)[0]


def test_lead_alone_separation_compares_the_leader_to_the_runner_up():
    recs = _tied([rec("Jax", 5.0, 1.0), rec("Malphite", 1.0, 1.0)], 1)
    gap, _, label = assertion_separation({"type": "must_lead_alone", "champion": "Jax"}, recs)
    assert math.isclose(gap, 4.0) and "Malphite" in label
