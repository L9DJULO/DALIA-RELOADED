"""Clés de cache du scraper Leaguepedia."""
import importlib.util
import re
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "pro_concordance" / "scraper.py"
_spec = importlib.util.spec_from_file_location("scraper", _PATH)
scraper = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(scraper)


def test_a_joined_query_gets_a_windows_safe_cache_name():
    """« ScoreboardPlayers=SP,ScoreboardGames=SG|… » : « | » est interdit dans un nom
    de fichier Windows, et le premier run du 25/09 a planté dessus."""
    name = scraper._cache_key("ScoreboardPlayers=SP,ScoreboardGames=SG|SP.GameId=SG.GameId", "w", "f", 0)
    assert re.fullmatch(r"[A-Za-z0-9_]+__[0-9a-f]{12}\.json", name), name


def test_existing_cache_names_are_unchanged():
    """Les fichiers déjà versionnés doivent rester lisibles."""
    assert scraper._cache_key("ScoreboardGames", "w", "f", 0).startswith("ScoreboardGames__")
