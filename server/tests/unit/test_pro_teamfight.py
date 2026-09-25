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
    """Un jungler a naturellement plus de participation qu'un top."""
    rows = []
    for i, champ in enumerate(["T1", "T2", "T3", "T4", "T5"]):
        rows += [row(champ, "top", 1, i, 10)] * 30
    for i, champ in enumerate(["S1", "S2", "S3", "S4", "S5"]):
        rows += [row(champ, "jungle", 1, 5 + i, 10)] * 30
    roles = {c: ("top" if c.startswith("T") else "jungle") for c in ["T1", "T2", "T3", "T4", "T5", "S1", "S2", "S3", "S4", "S5"]}
    r = pro_teamfight.teamfight_ratings(rows, roles)
    assert r["T5"] == 5 and r["S5"] == 5 and r["T1"] == 1 and r["S1"] == 1


def test_a_champion_rated_on_its_main_role_only():
    rows = [row("X", "jungle", 5, 5, 10)] * 30 + [row("X", "mid", 0, 0, 10)] * 30
    rows += [row(f"M{i}", "mid", 1, i, 10) for i in range(5) for _ in range(30)]
    rows += [row(f"S{i}", "jungle", 1, i, 10) for i in range(5) for _ in range(30)]
    roles = {"X": "jungle", **{f"M{i}": "mid" for i in range(5)}, **{f"S{i}": "jungle" for i in range(5)}}
    assert pro_teamfight.teamfight_ratings(rows, roles)["X"] == 5


def test_too_few_games_fall_back_to_the_rules():
    rows = [row("Rare", "mid", 5, 5, 10)] * 4 + [row(f"M{i}", "mid", 1, i, 10) for i in range(5) for _ in range(30)]
    roles = {"Rare": "mid", **{f"M{i}": "mid" for i in range(5)}}
    assert "Rare" not in pro_teamfight.teamfight_ratings(rows, roles)


def test_supports_are_not_rated_from_kill_participation():
    """Un bouclier ou un soin sur un allié qui tue donne une assist : les enchanteurs gonflent
    leur participation sans être plus présents dans le combat (mesure du 25/09 : Nami, Milio,
    Yuumi à 5, Nautilus et Blitzcrank à 1)."""
    rows = [row(f"S{i}", "support", 1, i, 10) for i in range(5) for _ in range(30)]
    roles = {f"S{i}": "support" for i in range(5)}
    assert pro_teamfight.teamfight_ratings(rows, roles) == {}


def test_every_champion_gets_a_teamfight_note_measured_or_from_the_rules():
    """Spec §5.2 : sans mesure, la règle de repli ; jamais l'ancienne note à la main."""
    from app.services.rating_rules import ChampionFacts
    facts = {k: ChampionFacts(key=k, damage=2, durability=2, crowd_control=2, mobility=1, utility=1,
                              style=5, ranged=False, subclasses=frozenset(sub))
             for k, sub in (("Measured", ()), ("Tank", ("Vanguard",)), ("Plain", ()))}
    full = pro_teamfight.full_teamfight({"Measured": 1}, facts)
    assert full == {"Measured": 1, "Tank": 4, "Plain": 3}


def test_report_shows_damage_share_and_flags_rule_fallbacks():
    """Spec §5.2 : la part de dégâts pour voir qui porte les combats, et « peu de données »
    pour distinguer une note mesurée d'une note de règle (revue du 25/09)."""
    rows = [row(f"M{i}", "mid", 1, i, 10, dmg=1000 * (i + 1)) for i in range(5) for _ in range(30)]
    primary = {**{f"M{i}": "mid" for i in range(5)}, "Rare": "mid"}
    measured = pro_teamfight.teamfight_ratings(rows, primary)
    text = pro_teamfight.teamfight_report(rows, primary, measured, {**measured, "Rare": 3})
    assert "M4" in text and "%" in text
    assert "Rare" in text and "peu de données" in text
