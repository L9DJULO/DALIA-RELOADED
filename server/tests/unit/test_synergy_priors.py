"""k de rétrécissement des synergies de paire : estimation et choix du palier (chantier 3)."""
import random
import pytest
from app.config import config
from app.scoring import synergy_priors as sp


def test_pair_kind_is_symmetric():
    assert sp.pair_kind("bot", "support") == sp.pair_kind("support", "bot") == "bot_support"
    assert sp.pair_kind("mid", "jungle") == "other" and sp.pair_kind("bot", "mid") == "other"


def test_estimate_k_recovers_a_known_spread():
    """τ = 1 pt de vraie interaction sous un bruit de 50/√n : k attendu 2 500."""
    rng = random.Random(0)
    pairs = []
    for _ in range(4000):
        n = rng.choice([800, 2000, 5000, 20000])
        pairs.append((rng.gauss(0, 1.0) + rng.gauss(0, 50 / n ** 0.5), n))
    k, tau, count = sp.estimate_k(pairs)
    assert count == 4000 and tau == pytest.approx(1.0, abs=0.1) and 2000 < k < 3100


def test_estimate_k_is_none_when_the_spread_is_only_noise():
    assert sp.estimate_k([(0.0, 1000)] * 100) is None


def test_estimate_k_ignores_small_samples_and_needs_enough_pairs():
    assert sp.estimate_k([(9.0, 50)] * 500 + [(1.0, 5000), (-1.0, 5000)] * 10) is None


def test_prior_k_falls_back_to_the_default_tier_then_to_config(monkeypatch):
    monkeypatch.setattr(sp, "load_priors", lambda: {"emerald_plus": {"bot_support": 1300, "other": 7700}})
    monkeypatch.setattr(config, "rank_tier", "emerald_plus")
    assert sp.prior_k("emerald_plus", "bot_support") == 1300
    assert sp.prior_k("iron", "other") == 7700
    assert sp.prior_k(None, "other") == 7700
    monkeypatch.setattr(sp, "load_priors", lambda: {})
    assert sp.prior_k("iron", "other") == config.scoring.synergy_k_default["other"]


def test_load_priors_reads_the_tiers_block(tmp_path, monkeypatch):
    path = tmp_path / "synergy_priors.json"
    path.write_text('{"measured_at": "2026-09-28", "tiers": {"iron": {"bot_support": 900}}}', encoding="utf-8")
    monkeypatch.setattr(sp, "PRIORS_PATH", path)
    sp.load_priors.cache_clear()
    try:
        assert sp.load_priors() == {"iron": {"bot_support": 900}}
    finally:
        sp.load_priors.cache_clear()


def test_load_priors_survives_a_missing_file(tmp_path, monkeypatch):
    monkeypatch.setattr(sp, "PRIORS_PATH", tmp_path / "absent.json")
    sp.load_priors.cache_clear()
    try:
        assert sp.load_priors() == {}
    finally:
        sp.load_priors.cache_clear()


def test_pairs_by_kind_counts_a_pair_seen_from_both_pages_once():
    """Xayah vue de la page de Rakan et Rakan vue de celle de Xayah : une seule paire."""
    pages = {
        (498, "bot"): {"support": {497: (1.26, 47986, 55.4)}, "mid": {103: (0.2, 900, 52.0)}},
        (497, "support"): {"bot": {498: (1.30, 47000, 55.4)}},
    }
    by_kind = sp.pairs_by_kind(pages)
    assert by_kind["bot_support"] == [(1.26, 47986)]
    assert by_kind["other"] == [(0.2, 900)]
