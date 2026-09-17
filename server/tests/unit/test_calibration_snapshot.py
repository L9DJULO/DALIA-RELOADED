"""Comparaison de deux états du moteur sur le même cache gelé.

46 des 52 assertions de la suite sont ordinales, donc en escalier : elles ne disent
rien tant qu'un seuil n'est pas franchi. La vague 1 a déplacé 28 comparaisons sur 38
sans faire bouger un seul compteur. Ce module rend ces déplacements visibles.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

_PATH = Path(__file__).resolve().parents[1] / "calibration" / "snapshot.py"
_spec = importlib.util.spec_from_file_location("calibration_snapshot", _PATH)
snapshot = importlib.util.module_from_spec(_spec)
sys.modules["calibration_snapshot"] = snapshot
_spec.loader.exec_module(snapshot)

_RUN = Path(__file__).resolve().parents[1] / "calibration" / "run_calibration.py"
_run_spec = importlib.util.spec_from_file_location("run_calibration", _RUN)
run_calibration = importlib.util.module_from_spec(_run_spec)
_run_spec.loader.exec_module(run_calibration)


def _snap(frozen_at, cases):
    return {"meta": {"rank": "master_plus", "cache": {"frozen_at": frozen_at}}, "cases": cases}


def _case(ranking, assertions=()):
    return {"ranking": [list(r) for r in ranking], "assertions": [list(a) for a in assertions]}


BASE = _snap(100.0, {"blind_pick_mid": _case(
    [("Yasuo", 2.62, 2.40, 2.52), ("Lux", 1.13, 1.71, 1.64)],
    [("must_not_be_top_3(champion=Yasuo)", False)])})


def test_comparing_a_snapshot_to_itself_reports_no_movement():
    diff = snapshot.compare(BASE, BASE)
    assert not diff["cache_mismatch"]
    assert diff["score_moves"] == [] and diff["rank_changes"] == [] and diff["assertion_flips"] == []


def test_a_moved_score_is_reported_even_without_a_rank_change():
    """Le coeur du chantier 12 : voir ce qu'aucune assertion ne voit."""
    after = _snap(100.0, {"blind_pick_mid": _case(
        [("Yasuo", 2.20, 2.40, 2.52), ("Lux", 1.13, 1.71, 1.64)],
        [("must_not_be_top_3(champion=Yasuo)", False)])})
    diff = snapshot.compare(BASE, after)
    assert diff["rank_changes"] == [] and diff["assertion_flips"] == []
    assert diff["score_moves"] == [("blind_pick_mid", "Yasuo", 2.62, 2.20)]


def test_a_rank_change_is_reported_apart_from_the_score_move():
    after = _snap(100.0, {"blind_pick_mid": _case(
        [("Lux", 1.13, 1.71, 1.64), ("Yasuo", 2.62, 2.40, 2.52)],
        [("must_not_be_top_3(champion=Yasuo)", False)])})
    diff = snapshot.compare(BASE, after)
    assert diff["score_moves"] == [], "aucun score n'a change, seul l'ordre"
    assert sorted(diff["rank_changes"]) == [("blind_pick_mid", "Lux", 2, 1),
                                            ("blind_pick_mid", "Yasuo", 1, 2)]


def test_an_assertion_flip_is_reported():
    after = _snap(100.0, {"blind_pick_mid": _case(
        [("Yasuo", 2.62, 2.40, 2.52), ("Lux", 1.13, 1.71, 1.64)],
        [("must_not_be_top_3(champion=Yasuo)", True)])})
    diff = snapshot.compare(BASE, after)
    assert diff["assertion_flips"] == [("blind_pick_mid", "must_not_be_top_3(champion=Yasuo)", False, True)]


def test_snapshots_from_different_cache_states_are_refused():
    """Sans ce garde-fou, l'outil attribuerait au code ce qui n'est qu'une derive de donnees."""
    after = _snap(999.0, {"blind_pick_mid": _case([("Yasuo", 2.62, 2.40, 2.52)])})
    diff = snapshot.compare(BASE, after)
    assert diff["cache_mismatch"] is True
    assert "gel" in snapshot.format_report(diff).lower()


def test_a_snapshot_taken_without_a_frozen_cache_is_refused():
    """Deux runs sur cache vivant ne sont pas comparables : les donnees bougent seules."""
    live = {"meta": {"rank": "master_plus", "cache": None}, "cases": BASE["cases"]}
    assert snapshot.compare(live, live)["cache_mismatch"] is True


def test_the_run_actually_captures_and_compares_snapshots():
    """Meme piege que le gel du cache : une fonction juste peut n'etre appelee nulle part."""
    import inspect
    source = inspect.getsource(run_calibration.main)
    assert "snapshot.case_entry(" in source, "les cas doivent etre captures dans la boucle"
    assert "snapshot.compare(" in source, "--compare doit reellement comparer"
    assert "--snapshot" in source and "--compare" in source
