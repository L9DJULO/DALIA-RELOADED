import math
from unittest.mock import AsyncMock
import pytest
from app.models.champion import ChampionStats
from app.scoring.meta_term import meta_term
from app.scoring.shrink import shrink, shrink_sd
from app.services.meta_analyzer import MetaAnalyzer


def test_meta_term_is_shrunk_win_rate_delta(monkeypatch):
    from app.config import config
    monkeypatch.setattr(config.scoring, "meta_wr_weight", 1.0)
    t = meta_term(ChampionStats(champion_id=1, role="mid", win_rate=53.0, games=1500))
    assert t.name == "meta" and t.source == "observed" and t.sample == 1500
    assert math.isclose(t.value, shrink(3.0, 1500, 500))
    assert math.isclose(t.sd, shrink_sd(1500, 500))


def test_meta_term_without_stats_is_neutral_and_uncertain():
    t = meta_term(None)
    assert t.value == 0.0 and t.sd == 3.0 and t.source == "heuristic"


@pytest.mark.asyncio
async def test_meta_stats_are_kept_per_tier_and_default_tier_feeds_catalog(catalog):
    meta = MetaAnalyzer(catalog, catalog.fetcher)
    calls = []
    async def fetch(role="mid", patch="current", tier=None):
        calls.append(tier)
        if tier == "iron":
            return {"cid": {"103": {"wr": 49, "games": 300, "pr": 3, "br": 1}}}
        return {"cid": {"103": {"wr": 52, "games": 8000, "pr": 3, "br": 1}}}
    catalog.fetcher.fetch_tierlist = fetch
    await meta.load_tierlist("mid")
    await meta.load_tierlist("mid", tier="iron")
    assert meta.stats(103, "mid").win_rate == 52
    assert meta.stats(103, "mid", "iron").win_rate == 49
    assert catalog.get_stats(103, "mid").games == 8000, "le catalogue garde le tier par défaut"
    assert "iron" in calls


@pytest.mark.asyncio
async def test_empty_tier_falls_back_to_default_tier(catalog):
    meta = MetaAnalyzer(catalog, catalog.fetcher)
    async def fetch(role="mid", patch="current", tier=None):
        return {} if tier == "iron" else {"cid": {"103": {"wr": 52, "games": 8000, "pr": 3, "br": 1}}}
    catalog.fetcher.fetch_tierlist = fetch
    await meta.load_tierlist("mid", tier="iron")
    assert meta.stats(103, "mid", "iron").win_rate == 52
    assert "iron" in meta.rank_fallback


def test_win_rate_counts_for_a_quarter_after_calibration():
    """Chantier 13, balayage du 24/09 : un quart du win rate, la popularité à 1,0."""
    from app.config import config
    assert config.scoring.meta_wr_weight == 0.25 and config.scoring.popularity_scale == 1.0
    t = meta_term(ChampionStats(champion_id=1, role="mid", win_rate=53.0, games=1500))
    assert math.isclose(t.value, shrink(3.0, 1500, 500) * 0.25)


def test_win_rate_weight_rescales_value_and_uncertainty_together(monkeypatch):
    """Rééchelonner la valeur sans l'incertitude gonflerait l'incertitude relative (spec §6.3)."""
    from app.config import config
    stats = ChampionStats(champion_id=1, role="mid", win_rate=53.0, games=1500)
    monkeypatch.setattr(config.scoring, "meta_wr_weight", 1.0)
    full = meta_term(stats)
    monkeypatch.setattr(config.scoring, "meta_wr_weight", 0.25)
    quarter = meta_term(stats)
    assert quarter.value == pytest.approx(full.value * 0.25)
    assert quarter.abs_sd == pytest.approx(full.abs_sd * 0.25)


def test_popularity_vanishes_at_zero_scale(monkeypatch):
    from app.config import config
    from app.scoring.meta_term import popularity_term
    monkeypatch.setattr(config.scoring, "popularity_scale", 0.0)
    assert popularity_term(ChampionStats(champion_id=1, role="mid", pick_rate=12.0, games=9000)).value == 0.0


def test_popularity_favours_what_master_plus_actually_plays(monkeypatch):
    """Shaco support est bien moins joué que Shaco jungle : le terme le dit par poste."""
    from app.config import config
    from app.scoring.meta_term import popularity_term
    monkeypatch.setattr(config.scoring, "popularity_scale", 1.0)
    jungle = popularity_term(ChampionStats(champion_id=35, role="jungle", pick_rate=3.2, games=6000))
    support = popularity_term(ChampionStats(champion_id=35, role="support", pick_rate=0.9, games=1700))
    assert jungle.value > support.value
    assert jungle.value - support.value == pytest.approx(math.log(3.2 / 0.9))


def test_popularity_carries_a_relative_uncertainty(monkeypatch):
    """Le pick rate est mesuré sans bruit notable ; c'est sa conversion en points qui est incertaine."""
    from app.config import config
    from app.scoring.meta_term import popularity_term
    monkeypatch.setattr(config.scoring, "popularity_scale", 1.0)
    t = popularity_term(ChampionStats(champion_id=1, role="mid", pick_rate=8.0, games=9000))
    assert t.name == "popularity" and t.abs_sd == 0.0 and t.rel_sd > 0.0


def test_popularity_of_an_unplayed_pick_is_bounded(monkeypatch):
    from app.config import config
    from app.scoring.meta_term import popularity_term
    monkeypatch.setattr(config.scoring, "popularity_scale", 1.0)
    zero = popularity_term(ChampionStats(champion_id=1, role="mid", pick_rate=0.0, games=5))
    assert math.isfinite(zero.value)
    assert popularity_term(None) is None


def test_the_engine_actually_appends_the_popularity_term():
    """Piège déjà rencontré : une fonction juste, appelée nulle part."""
    import inspect
    from app.services.draft_engine import DraftEngine
    assert "popularity_term(" in inspect.getsource(DraftEngine)


def test_the_meta_preference_also_weighs_popularity():
    """Pour le joueur, les deux sont « la méta » : un seul curseur les pondère."""
    from app.scoring.aggregate import apply_preferences
    from app.scoring.types import Term
    out = apply_preferences([Term("popularity", 2.0)], {"meta": 0.5})
    assert out[0].value == pytest.approx(1.0)
