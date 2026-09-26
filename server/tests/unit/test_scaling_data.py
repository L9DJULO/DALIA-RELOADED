"""Scaling mesuré : win rate selon la durée de partie (définition du joueur, 26/09/2026)."""
import importlib.util
import json
from pathlib import Path

import pytest

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "refresh_scaling.py"
_spec = importlib.util.spec_from_file_location("refresh_scaling", _PATH)
refresh_scaling = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(refresh_scaling)


def _page(games, wins):
    """Page Lolalytics minimale : l'état Qwik référence ses valeurs en base 36."""
    objs = []

    def put(v):
        objs.append(v)
        return format(len(objs) - 1, "x") if len(objs) - 1 < 10 else _b36(len(objs) - 1)

    t = {str(i + 1): put(n) for i, n in enumerate(games)}
    w = {str(i + 1): put(n) for i, n in enumerate(wins)}
    objs.append({"time": put(t), "timeWin": put(w)})
    return f'<html><script type="qwik/json">{json.dumps({"objs": objs})}</script></html>'


def _b36(n):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out or "0"


def test_the_game_length_curve_is_read_from_the_page_state():
    page = _page([47, 446, 1010, 1557, 1023, 325, 85], [29, 230, 424, 851, 615, 192, 43])
    assert refresh_scaling.parse_curve(page) == [(47, 29), (446, 230), (1010, 424), (1557, 851),
                                                 (1023, 615), (325, 192), (85, 43)]


def test_a_page_without_the_curve_is_refused():
    with pytest.raises(ValueError):
        refresh_scaling.parse_curve('<script type="qwik/json">{"objs": [1, 2]}</script>')


def test_scaling_is_late_minus_early_win_rate_in_points():
    """Tranches 2-3 = parties courtes, 5-7 = parties longues. La première (remakes, abandons
    précoces) et celle du milieu ne comptent pas. Kassadin : 44,9 % → 59,3 %."""
    curve = [(47, 29), (446, 230), (1010, 424), (1557, 851), (1023, 615), (325, 192), (85, 43)]
    s = refresh_scaling.scaling_of(curve)
    assert s["early_wr"] == pytest.approx(100 * 654 / 1456, abs=0.01)
    assert s["late_wr"] == pytest.approx(100 * 850 / 1433, abs=0.01)
    assert s["delta"] == pytest.approx(s["late_wr"] - s["early_wr"], abs=0.01)
    assert s["games"] == 1456 + 1433


def test_empty_buckets_give_no_scaling_rather_than_a_division_error():
    s = refresh_scaling.scaling_of([(0, 0)] * 7)
    assert s["delta"] == 0.0 and s["games"] == 0
