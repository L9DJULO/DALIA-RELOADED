"""Participation aux combats en pro → note teamfight (spec §5)."""
import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "pro_teamfight.py"
_spec = importlib.util.spec_from_file_location("pro_teamfight", _PATH)
pro_teamfight = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pro_teamfight)


def row(champ, role, k, a, team, dmg=10000):
    return {"champion": champ, "role": role, "kills": k, "assists": a, "team_kills": team,
            "damage": dmg, "patch": "26.10"}


def test_kill_participation_survives_a_game_without_kills():
    assert pro_teamfight.kill_participation(row("A", "mid", 0, 0, 0)) == 0.0
    assert pro_teamfight.kill_participation(row("A", "mid", 2, 4, 10)) == 0.6


def test_ratings_are_ranked_within_the_role_not_across_roles():
    """Un support a naturellement plus de participation qu'un top."""
    rows = []
    for i, champ in enumerate(["T1", "T2", "T3", "T4", "T5"]):
        rows += [row(champ, "top", 1, i, 10)] * 30
    for i, champ in enumerate(["S1", "S2", "S3", "S4", "S5"]):
        rows += [row(champ, "support", 1, 5 + i, 10)] * 30
    roles = {c: ("top" if c.startswith("T") else "support") for c in ["T1", "T2", "T3", "T4", "T5", "S1", "S2", "S3", "S4", "S5"]}
    r = pro_teamfight.teamfight_ratings(rows, roles)
    assert r["T5"] == 5 and r["S5"] == 5 and r["T1"] == 1 and r["S1"] == 1


def test_a_champion_rated_on_its_main_role_only():
    rows = [row("X", "support", 5, 5, 10)] * 30 + [row("X", "mid", 0, 0, 10)] * 30
    rows += [row(f"M{i}", "mid", 1, i, 10) for i in range(5) for _ in range(30)]
    rows += [row(f"S{i}", "support", 1, i, 10) for i in range(5) for _ in range(30)]
    roles = {"X": "support", **{f"M{i}": "mid" for i in range(5)}, **{f"S{i}": "support" for i in range(5)}}
    assert pro_teamfight.teamfight_ratings(rows, roles)["X"] == 5


def test_too_few_games_fall_back_to_the_rules():
    rows = [row("Rare", "mid", 5, 5, 10)] * 4 + [row(f"M{i}", "mid", 1, i, 10) for i in range(5) for _ in range(30)]
    roles = {"Rare": "mid", **{f"M{i}": "mid" for i in range(5)}}
    assert "Rare" not in pro_teamfight.teamfight_ratings(rows, roles)
