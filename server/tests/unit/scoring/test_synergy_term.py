"""Synergie mesurée par paire : interaction Lolalytics rétrécie, repli de kit (chantier 3)."""
import math
import pytest
from app.config import config
from app.models.champion import ChampionRatings, DamageProfile
from app.models.draft import DraftState
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.synergy_term import observed_synergy_term
from app.services.synergy import SynergyAnalyzer

H = ["id", "wr", "d1", "d2", "pr", "n"]
PAGE = {"team_h": H, "team": {"support": [[40, 55.0, 0, 2.0, 5, 4000]], "jungle": [[59, 52.0, 0, 1.0, 5, 30000]]}}
K = {"bot_support": 2000, "other": 10000}


@pytest.fixture(autouse=True)
def fixed_priors(monkeypatch):
    monkeypatch.setattr("app.services.synergy.prior_k", lambda tier, kind: K[kind])


def _draft(*allies):
    return DraftState(my_role="bot", ally_picks=[{"champion_id": c, "role": r} for c, r in allies])


def _analyzer(catalog, page):
    async def fetch(slug, role, tier=None, patch="counter_default"):
        return page
    catalog.fetcher.fetch_team_page = fetch
    return SynergyAnalyzer(catalog, catalog.fetcher)


@pytest.mark.asyncio
async def test_sums_shrunk_pairs_with_a_k_per_pair_kind(catalog):
    draft = _draft((40, "support"), (59, "jungle"))
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", draft, "emerald_plus")
    assert term.value == pytest.approx(shrink(2.0, 4000, 2000) + shrink(1.0, 30000, 10000))
    assert term.abs_sd == pytest.approx(math.hypot(shrink_sd(4000, 2000), shrink_sd(30000, 10000)))
    assert term.source == "observed" and term.sample == 34000
    assert term.rel_sd == 0.0 and term.outcome_sd == 0.0


@pytest.mark.asyncio
async def test_ally_missing_from_the_page_adds_only_uncertainty(catalog):
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((25, "support")), "emerald_plus")
    assert term.value == 0.0 and term.abs_sd == pytest.approx(shrink_sd(0, 2000))


@pytest.mark.asyncio
async def test_ally_without_role_is_read_at_its_main_role(catalog):
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((40, None)), "emerald_plus")
    assert term.value == pytest.approx(shrink(2.0, 4000, 2000))


@pytest.mark.asyncio
async def test_duo_factor_only_weights_the_partner_pair(catalog):
    draft = _draft((40, "support"), (59, "jungle"))
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", draft, "emerald_plus",
                                       duo_partner_role="support")
    f = config.scoring.synergy_duo_factor
    assert term.value == pytest.approx(f * shrink(2.0, 4000, 2000) + shrink(1.0, 30000, 10000))
    assert term.abs_sd == pytest.approx(math.hypot(f * shrink_sd(4000, 2000), shrink_sd(30000, 10000)))


@pytest.mark.asyncio
async def test_scale_multiplies_value_and_uncertainty(catalog, monkeypatch):
    monkeypatch.setattr(config.scoring, "synergy_observed_scale", 0.5)
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((40, "support")), "emerald_plus")
    assert term.value == pytest.approx(0.5 * shrink(2.0, 4000, 2000))
    assert term.abs_sd == pytest.approx(0.5 * shrink_sd(4000, 2000))


@pytest.mark.asyncio
async def test_unavailable_page_returns_none_for_the_kit_fallback(catalog):
    assert await observed_synergy_term(_analyzer(catalog, {}), 222, "bot", _draft((40, "support")), "emerald_plus") is None


@pytest.mark.asyncio
async def test_empty_low_tier_page_falls_back_to_the_default_tier(catalog):
    seen = []

    async def fetch(slug, role, tier=None, patch="counter_default"):
        seen.append(tier)
        return PAGE if tier == catalog.fetcher.TIER else {}

    catalog.fetcher.fetch_team_page = fetch
    term = await observed_synergy_term(SynergyAnalyzer(catalog, catalog.fetcher), 222, "bot",
                                       _draft((40, "support")), "iron")
    assert term is not None and term.value > 0 and seen == ["iron", catalog.fetcher.TIER]


@pytest.mark.asyncio
async def test_details_follow_the_filled_allies_in_draft_order(catalog):
    draft = DraftState(my_role="bot", ally_picks=[{"champion_id": 59, "role": "jungle"}, {"champion_id": None},
                                                  {"champion_id": 25, "role": "support"}])
    details = await _analyzer(catalog, PAGE).details(222, "bot", draft, "emerald_plus")
    assert [d["ally_name"] for d in details] == ["JarvanIV", "Morgana"]
    assert details[0]["source"] == "observed" and details[0]["games"] == 30000
    assert details[0]["delta"] == pytest.approx(round(shrink(1.0, 30000, 10000), 2))
    assert details[1] == {"ally_name": "Morgana", "ally_role": "support", "delta": 0.0, "games": 0, "source": "observed"}


@pytest.mark.asyncio
async def test_details_fall_back_to_kit_estimates_without_a_page(catalog):
    details = await _analyzer(catalog, {}).details(222, "bot", _draft((40, "support")), "emerald_plus")
    assert details[0]["source"] == "kit_heuristic" and details[0]["games"] == 0


def _variant(catalog, base_id, new_id, **update):
    champ = catalog.get_by_id(base_id).model_copy(update=update)
    champ = champ.model_copy(update={"id": new_id, "key": f"{champ.key}{new_id}", "name": f"{champ.name}{new_id}"})
    catalog._by_id[new_id] = champ
    catalog._by_key[champ.key] = champ
    return new_id


@pytest.mark.asyncio
async def test_kit_fallback_no_longer_counts_the_damage_mix(catalog):
    """Le mélange AD/AP est l'avertissement de `composition` : la synergie ne le recompte plus."""
    ad = _variant(catalog, 103, 9001, damage=DamageProfile(physical=90, magical=5))
    ap = _variant(catalog, 103, 9002, damage=DamageProfile(physical=5, magical=90))
    analyzer = SynergyAnalyzer(catalog, catalog.fetcher)
    with_ad = await analyzer.score(222, "bot", _draft((ad, "mid")))
    with_ap = await analyzer.score(222, "bot", _draft((ap, "mid")))
    assert with_ad == with_ap


@pytest.mark.asyncio
async def test_kit_fallback_no_longer_counts_the_frontline(catalog):
    """Pas de tank dans l'équipe : l'avertissement de `composition`, pas une synergie de paire."""
    squishy = _variant(catalog, 103, 9003, ratings=ChampionRatings(tankiness=2))
    tank = _variant(catalog, 103, 9004, ratings=ChampionRatings(tankiness=5))
    analyzer = SynergyAnalyzer(catalog, catalog.fetcher)
    assert await analyzer.score(222, "bot", _draft((squishy, "mid"))) == await analyzer.score(222, "bot", _draft((tank, "mid")))
