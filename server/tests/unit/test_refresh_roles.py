"""Règles de scripts/refresh_roles.py : postes proposés et distribution des rôles adverses."""
import importlib.util
from pathlib import Path

import pytest

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "refresh_roles.py"
_spec = importlib.util.spec_from_file_location("refresh_roles", _PATH)
refresh_roles = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(refresh_roles)


def test_a_role_is_proposed_from_its_share_of_the_champion_games():
    """Zyra se joue à 50 % jungle et 39 % support : les deux, jungle en tête."""
    shares = {"top": 0, "jungle": 50, "mid": 3, "bot": 8, "support": 39}
    assert refresh_roles.roles_from_shares(shares, 15.0) == ["jungle", "support"]


def test_the_main_role_is_kept_even_under_the_threshold():
    assert refresh_roles.roles_from_shares({"top": 12, "mid": 9}, 15.0) == ["top"]


def test_distribution_keeps_the_real_proportions_of_a_flex_pick():
    """« Shaco jungle c'est son main role, support possible » — le joueur, 24/09."""
    dist = refresh_roles.distribution_from_shares({"jungle": 75, "support": 22, "top": 2, "mid": 1})
    assert dist == {"jungle": pytest.approx(0.77, abs=0.01), "support": pytest.approx(0.23, abs=0.01)}
    assert sum(dist.values()) == pytest.approx(1.0, abs=0.011)


def test_distribution_drops_marginal_roles_before_normalising():
    dist = refresh_roles.distribution_from_shares({"top": 85, "jungle": 13, "mid": 1.5, "support": 0.5})
    assert set(dist) == {"top", "jungle"}


def test_distribution_of_an_unplayed_champion_is_empty():
    assert refresh_roles.distribution_from_shares({"top": 0, "mid": 0}) == {}


def test_a_champion_absent_from_the_data_keeps_its_roles():
    """Revue du 25/09 : un champion que Lolalytics ne liste pas encore sortait sans poste."""
    assert refresh_roles.roles_or_previous({"top": 0, "mid": 0}, 15.0, ["top", "jungle"]) == ["top", "jungle"]
    assert refresh_roles.roles_or_previous({"top": 0}, 15.0, None) is None
    assert refresh_roles.roles_or_previous({"top": 80, "mid": 20}, 15.0, ["jungle"]) == ["top", "mid"]
