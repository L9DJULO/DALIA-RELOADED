"""Pages de duo Lolalytics (ep=build-team) : lecture et cache (chantier 3)."""
import pytest
from app.services.data_fetcher import LolalyticsFetcher

H = ["id", "wr", "d1", "d2", "pr", "n"]


def test_parse_team_maps_lanes_to_roles_and_keeps_d2_games_and_duo_wr():
    raw = {"team_h": H, "team": {"support": [[497, 55.38, 2.43, 1.26, 17.32, 47986]],
                                 "middle": [[103, 52.0, 0.1, -0.4, 3.0, 900]]}}
    pairs = LolalyticsFetcher.parse_team(raw)
    assert pairs["support"][497] == (1.26, 47986, 55.38)
    assert pairs["mid"][103] == (-0.4, 900, 52.0)


def test_parse_team_reads_columns_by_name():
    raw = {"team_h": ["n", "d2", "id", "wr"], "team": {"top": [[1200, 0.8, 54, 53.1]]}}
    assert LolalyticsFetcher.parse_team(raw)["top"][54] == (0.8, 1200, 53.1)


@pytest.mark.parametrize("row", [
    [497, 55.0, 0.0, 1.0, 1.0, 0],             # aucune partie
    [497, 55.0, 0.0, float("nan"), 1.0, 10],   # delta non fini
    [0, 55.0, 0.0, 1.0, 1.0, 10],              # id hors plage
    [497, 120.0, 0.0, 1.0, 1.0, 10],           # win rate impossible
    [497, 55.0, 0.0, 80.0, 1.0, 10],           # delta aberrant
    [497, 55.0],                               # ligne tronquée
    None, "x",
    [497, 55.0, 0.0, None, 1.0, 10],
])
def test_parse_team_drops_a_bad_row_but_keeps_the_page(row):
    raw = {"team_h": H, "team": {"support": [row, [412, 56.6, 3.1, 1.44, 7.8, 21669]]}}
    assert LolalyticsFetcher.parse_team(raw)["support"] == {412: (1.44, 21669, 56.6)}


@pytest.mark.parametrize("raw", [{}, None, [], {"team": []}, {"team_h": H, "team": {"support": "x"}},
                                 {"team_h": ["id", "wr"], "team": {"support": [[497, 55.0]]}}])
def test_parse_team_tolerates_empty_or_malformed_pages(raw):
    assert LolalyticsFetcher.parse_team(raw).get("support", {}) == {}


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


@pytest.mark.asyncio
async def test_fetch_team_page_queries_build_team_and_caches_by_tier(tmp_path, monkeypatch):
    fetcher = LolalyticsFetcher(cache_dir=str(tmp_path), cache_ttl_hours=None)
    calls = []

    async def fake_get(url, **kwargs):
        calls.append(kwargs["params"])
        return _Response({"team_h": H, "team": {"support": [[497, 55.0, 0.0, 1.0, 1.0, 100]]},
                          "tier": kwargs["params"]["tier"]})

    monkeypatch.setattr(fetcher, "_get", fake_get)
    first = await fetcher.fetch_team_page("xayah", "bot", tier="emerald_plus")
    other = await fetcher.fetch_team_page("xayah", "bot", tier="master_plus")
    again = await fetcher.fetch_team_page("xayah", "bot", tier="emerald_plus")
    assert (first["tier"], other["tier"], again["tier"]) == ("emerald_plus", "master_plus", "emerald_plus")
    assert len(calls) == 2
    assert calls[0]["ep"] == "build-team" and calls[0]["lane"] == "bottom" and calls[0]["c"] == "xayah"
    await fetcher.close()


@pytest.mark.asyncio
async def test_fetch_team_page_swallows_an_outage(tmp_path, monkeypatch):
    fetcher = LolalyticsFetcher(cache_dir=str(tmp_path), cache_ttl_hours=None)

    async def boom(url, **kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(fetcher, "_get", boom)
    assert await fetcher.fetch_team_page("xayah", "bot") == {}
    await fetcher.close()


@pytest.mark.asyncio
async def test_fetch_team_page_lets_a_frozen_cache_miss_through(tmp_path):
    """Un trou dans le gel doit arrêter la mesure, pas la faire tourner sans synergie."""
    from app.services.data_fetcher import FrozenCacheMiss
    fetcher = LolalyticsFetcher(cache_dir=str(tmp_path), cache_ttl_hours=None, offline=True)
    with pytest.raises(FrozenCacheMiss):
        await fetcher.fetch_team_page("xayah", "bot", tier="emerald_plus")
    await fetcher.close()
