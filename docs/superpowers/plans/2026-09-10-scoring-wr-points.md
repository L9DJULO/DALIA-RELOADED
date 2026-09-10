# Scoring en points de win rate — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le score composite 0-100 du moteur de draft par une somme de termes en points de win rate, relative au pool, avec incertitude, groupe de tête, rang du joueur et maîtrise fondée sur les données personnelles.

**Architecture:** Un nouveau package `server/app/scoring/` contient un module par terme (méta, matchup, adversaire futur, maîtrise, composition, heuristiques) et un agrégateur. `DraftEngine` orchestre : il appelle chaque terme, agrège, calcule l'avantage relatif à la moyenne du pool, puis construit la réponse. Les analyseurs existants restent les fournisseurs de données brutes. Le client affiche un chiffre signé avec ±σ et un badge d'égalité.

**Tech Stack:** Python 3.11 / FastAPI / Pydantic v2 / SQLAlchemy async / Alembic / pytest (asyncio_mode=auto) ; React 18 / Zustand / Vitest / Playwright ; Rust (Tauri 2) pour le connecteur LCU.

**Spec:** `docs/superpowers/specs/2026-09-10-scoring-wr-points-design.md`

## Global Constraints

- Toutes les constantes numériques du scoring vivent dans `server/app/scoring/config.py` (`ScoringConstants`), exposées par `app.config.config.scoring`. Aucun nombre magique dans les modules de termes.
- Un terme = `Term(name, value, sd, source, sample, note)` ; `source ∈ {"observed", "heuristic", "model"}`.
- `shrink(x, n, k) = x × n / (n + k)`, `shrink_sd(n, k) = 50 / sqrt(n + k)`.
- `total_score` de l'API est l'**avantage signé** en points de WR (total − moyenne des totaux du pool). Jamais borné à 0-100.
- Les préférences (`weight_overrides`) sont des multiplicateurs dans `[0.5, 1.5]`, clés inchangées : `meta, matchup, synergy, composition, mastery, draft_risk`.
- Rangs acceptés : `iron, bronze, silver, gold, platinum, emerald, diamond, master_plus`. Rang inconnu → tier Lolalytics `config.rank_tier` (`emerald_plus`).
- Tests serveur : `cd server && .venv/Scripts/python.exe -m pytest tests/unit -q`. Tests client : `cd client && npm.cmd test -- --run`. Rust : `cd client/src-tauri && cargo test --locked`.
- Commits fréquents, messages en français, terminés par `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ne pas modifier `SynergyAnalyzer`, `MechanicsAnalyzer` (hors ajout de méthode publique), `ban_recommender.py`, le modèle ML.

---

## Structure des fichiers

**Créés**
- `server/app/scoring/__init__.py` — vide.
- `server/app/scoring/types.py` — `Term`, `Estimate`, `Source`, `RANKS`.
- `server/app/scoring/shrink.py` — `shrink`, `shrink_sd`.
- `server/app/scoring/config.py` — `ScoringConstants`.
- `server/app/scoring/rank.py` — `normalize_rank`, `lolalytics_tier`, `counter_lambda`, `mastery_rank_factor`.
- `server/app/scoring/aggregate.py` — `apply_preferences`, `estimate`, `reference_mean`, `top_group`, `confidence_from_sd`.
- `server/app/scoring/meta_term.py` — `meta_term`.
- `server/app/scoring/matchup_term.py` — `matchup_term`.
- `server/app/scoring/opponent_model.py` — `opponent_distribution`, `expected_delta`, `role_identification_probability`, `future_opponent_term`.
- `server/app/scoring/mastery_term.py` — `MasteryInputs`, `mastery_term`.
- `server/app/scoring/composition_term.py` — `team_value`, `composition_term`, `archetype_term`.
- `server/app/scoring/heuristic_terms.py` — `synergy_term`, `mechanics_term`, `model_term`.
- `server/tests/unit/scoring/__init__.py` et un fichier de test par module.
- `server/alembic/versions/004_rank_and_score_unit.py`.

**Modifiés**
- `server/app/config.py` — suppression de `ScoringWeights`, `RoleWeightMultipliers`, `role_weight_multipliers`, `wildcard_min_score` ; ajout de `scoring: ScoringConstants` ; `rank_tier = "emerald_plus"`.
- `server/app/models/champion.py` — `difficulty`.
- `server/app/models/validation.py` — `RankBucket`, `validate_weights` en multiplicateurs.
- `server/app/models/draft.py` — `ScoreTerm`, champs `score_sd`, `tie_with_leader`, `breakdown.terms`, `reference_mean`, `top_group_ids`, `rank_bucket`.
- `server/app/services/champion_data.py` — lecture de `info.difficulty`.
- `server/app/services/data_fetcher.py` — paramètre `tier`.
- `server/app/services/meta_analyzer.py` — stats par tier.
- `server/app/services/matchup.py` — caches par tier.
- `server/app/services/composition.py` — `team_warnings`, suppression de `score`.
- `server/app/services/personal_stats.py` — `get_champion_personal`, maîtrise Riot, suppression du boost.
- `server/app/services/reasons.py` — `generate_verdict` en points.
- `server/app/services/draft_engine.py` — réécriture du scoring.
- `server/app/api/routes.py`, `auth_routes.py`, `user_routes.py`, `history_routes.py`, `auth/schemas.py`, `db/models.py`.
- `server/tests/unit/test_engine_and_api.py`, `test_review_fixes.py`, `test_caches.py`, `test_validation_and_auth.py`.
- `server/tests/calibration/run_calibration.py`, `cases.json`.
- `client/src-tauri/src/lcu.rs`, `client/src/services/lcu.js`, `client/src/services/api.js`, `client/src/stores/lcuStore.js`, `userStore.js`, `draftStore.js`, `client/src/lib/scores.js`, `client/src/lib/replay.js`, `client/src/data/mock.js`, `client/src/components/Recommendations/RecommendationPanel.jsx`, `HeroPanel.jsx`, `DraftPanel.jsx`, `DraftBoard/DraftBoard.jsx`, `DraftWorkshop.jsx`, `Insights/InsightsPage.jsx`, `Settings/DraftPreferences.jsx`, `client/src/stores/regressions.test.js`, `client/e2e/workflows.spec.js`.
- `docs/WPA_ET_MECANIQUES.md`, `README.md`.

---

### Task 1 : Package `scoring` — types, rétrécissement, constantes, rang

**Files:**
- Create: `server/app/scoring/__init__.py`, `server/app/scoring/types.py`, `server/app/scoring/shrink.py`, `server/app/scoring/config.py`, `server/app/scoring/rank.py`
- Modify: `server/app/config.py`
- Test: `server/tests/unit/scoring/__init__.py`, `server/tests/unit/scoring/test_shrink.py`, `server/tests/unit/scoring/test_rank.py`

**Interfaces:**
- Produces: `Term(name: str, value: float, sd: float, source: str = "heuristic", sample: int = 0, note: str = "")` dataclass ; `Estimate(terms)` avec propriétés `total` et `sd` ; `shrink(value, n, k) -> float` ; `shrink_sd(n, k) -> float` ; `normalize_rank(value) -> Optional[str]` ; `lolalytics_tier(rank, default=None) -> str` ; `counter_lambda(rank) -> float` ; `mastery_rank_factor(rank) -> float` ; `config.scoring: ScoringConstants`.

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/__init__.py` : fichier vide.

`server/tests/unit/scoring/test_shrink.py` :
```python
import math
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Estimate, Term


def test_shrink_pulls_small_samples_to_zero_and_keeps_large_ones():
    assert shrink(4.0, 0, 200) == 0.0
    assert math.isclose(shrink(4.0, 200, 200), 2.0)
    assert shrink(4.0, 10**9, 200) > 3.99


def test_shrink_sd_decreases_with_sample():
    assert math.isclose(shrink_sd(0, 200), 50 / math.sqrt(200))
    assert shrink_sd(1000, 200) < shrink_sd(0, 200)


def test_estimate_sums_values_and_combines_sd_in_quadrature():
    est = Estimate([Term("a", 1.0, 3.0), Term("b", -0.5, 4.0)])
    assert math.isclose(est.total, 0.5)
    assert math.isclose(est.sd, 5.0)
    assert Estimate([]).total == 0.0 and Estimate([]).sd == 0.0
```

`server/tests/unit/scoring/test_rank.py` :
```python
from app.scoring.rank import counter_lambda, lolalytics_tier, mastery_rank_factor, normalize_rank


def test_normalize_rank_accepts_lcu_and_profile_spellings():
    assert normalize_rank("EMERALD") == "emerald"
    assert normalize_rank(" Gold ") == "gold"
    assert normalize_rank("GRANDMASTER") == "master_plus"
    assert normalize_rank("CHALLENGER") == "master_plus"
    assert normalize_rank("master_plus") == "master_plus"
    assert normalize_rank("") is None and normalize_rank(None) is None and normalize_rank("UNRANKED") is None


def test_lolalytics_tier_falls_back_to_config_default():
    assert lolalytics_tier("iron") == "iron"
    assert lolalytics_tier("master_plus") == "master_plus"
    assert lolalytics_tier(None) == "emerald_plus"
    assert lolalytics_tier(None, "master_plus") == "master_plus"
    assert lolalytics_tier("gold", "master_plus") == "gold"


def test_rank_factors():
    assert counter_lambda("silver") == 0.15 and counter_lambda("master_plus") == 0.5 and counter_lambda(None) == 0.30
    assert mastery_rank_factor("bronze") == 1.3 and mastery_rank_factor("emerald") == 1.0 and mastery_rank_factor("diamond") == 0.8
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: `ModuleNotFoundError: No module named 'app.scoring'`

- [ ] **Step 3 : Implémenter**

`server/app/scoring/__init__.py` : vide.

`server/app/scoring/types.py` :
```python
"""Estimation en points de win rate : un terme = valeur + écart-type + source."""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Literal

Source = Literal["observed", "heuristic", "model"]
RANKS = ("iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master_plus")


@dataclass
class Term:
    name: str
    value: float
    sd: float
    source: str = "heuristic"
    sample: int = 0
    note: str = ""


@dataclass
class Estimate:
    terms: List[Term] = field(default_factory=list)

    @property
    def total(self) -> float:
        return sum(t.value for t in self.terms)

    @property
    def sd(self) -> float:
        return math.sqrt(sum(t.sd * t.sd for t in self.terms))

    def get(self, name: str) -> Term | None:
        return next((t for t in self.terms if t.name == name), None)
```

`server/app/scoring/shrink.py` :
```python
"""Rétrécissement bayésien unique pour toutes les statistiques observées."""
import math


def shrink(value: float, n: int, k: int) -> float:
    n = max(0, int(n))
    return value * n / (n + k) if n + k > 0 else 0.0


def shrink_sd(n: int, k: int) -> float:
    return 50.0 / math.sqrt(max(0, int(n)) + k)
```

`server/app/scoring/config.py` :
```python
"""Constantes du scoring en points de win rate (spec 2026-09-10)."""
from typing import Dict
from pydantic import BaseModel


class ScoringConstants(BaseModel):
    # Rétrécissement
    k_meta: int = 500
    k_matchup: int = 200
    no_meta_sd: float = 3.0
    # Matchup
    offlane_weight: float = 0.5
    heuristic_matchup_scale: float = 0.2
    heuristic_matchup_sd: float = 3.0
    # Adversaire futur
    min_opponent_pick_rate: float = 0.5
    counter_lambda: Dict[str, float] = {
        "iron": 0.15, "bronze": 0.15, "silver": 0.15, "gold": 0.25, "platinum": 0.25,
        "emerald": 0.35, "diamond": 0.35, "master_plus": 0.50,
    }
    counter_lambda_unknown: float = 0.30
    future_sd_floor: float = 1.0
    future_no_data_sd: float = 4.0
    # Maîtrise
    mastery_tier_base: Dict[str, float] = {"S": 1.0, "A": 0.0, "B": -1.5, "C": -3.0, "D": -5.0}
    mastery_personal_min_games: int = 10
    mastery_blend_min_games: int = 3
    mastery_personal_k: int = 10
    mastery_personal_cap: float = 6.0
    mastery_recency_per_month: float = 0.5
    mastery_recency_max_months: int = 3
    mastery_points_familiar: int = 100_000
    mastery_sd_observed: float = 1.0
    mastery_sd_declared: float = 1.5
    mastery_rank_factor: Dict[str, float] = {
        "iron": 1.3, "bronze": 1.3, "silver": 1.3, "gold": 1.0, "platinum": 1.0,
        "emerald": 1.0, "diamond": 0.8, "master_plus": 0.8,
    }
    # Composition marginale
    comp_tool_weights: Dict[str, float] = {
        "frontline": 1.5, "engage": 1.5, "magic_damage": 1.0, "physical_damage": 1.0, "range": 1.0,
        "peel": 1.0, "anti_mobility": 0.5, "anti_tank": 0.5, "anti_attacks": 0.5,
    }
    comp_warning_penalty: Dict[str, float] = {"critical": 2.0, "warning": 1.0}
    comp_cap: float = 4.0
    comp_sd: float = 2.0
    archetype_scale: float = 15.0
    archetype_sd: float = 1.5
    # Synergie, mécaniques, modèle
    synergy_scale: float = 0.12
    synergy_cap: float = 3.0
    synergy_duo_factor: float = 1.5
    synergy_sd: float = 2.0
    mechanics_scale: float = 0.3
    mechanics_sd: float = 1.5
    model_cap: float = 4.0
    model_sd: float = 2.0
    # Agrégation
    confidence_sd_scale: float = 6.0
    wildcard_min_advantage: float = 1.5
    pref_min: float = 0.5
    pref_max: float = 1.5
```

`server/app/scoring/rank.py` :
```python
"""Rang du joueur : normalisation et facteurs dépendant du rang."""
from typing import Optional
from app.config import config
from app.scoring.types import RANKS

_ALIASES = {"master": "master_plus", "grandmaster": "master_plus", "challenger": "master_plus"}


def normalize_rank(value) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip().lower()
    cleaned = _ALIASES.get(cleaned, cleaned)
    return cleaned if cleaned in RANKS else None


def lolalytics_tier(rank: Optional[str], default: Optional[str] = None) -> str:
    """Tier Lolalytics pour un rang ; `default` = tier du fetcher (config.rank_tier sinon)."""
    return rank if rank in RANKS else (default or config.rank_tier)


def counter_lambda(rank: Optional[str]) -> float:
    return config.scoring.counter_lambda.get(rank, config.scoring.counter_lambda_unknown)


def mastery_rank_factor(rank: Optional[str]) -> float:
    return config.scoring.mastery_rank_factor.get(rank, 1.0)
```

Dans `server/app/config.py` :
- supprimer les classes `ScoringWeights` et `RoleWeightMultipliers` ;
- ajouter en tête `from app.scoring.config import ScoringConstants` ;
- remplacer `rank_tier: str = "master_plus"` par `rank_tier: str = "emerald_plus"` ;
- supprimer `weights`, `role_weight_multipliers`, `wildcard_min_score` ; ajouter `scoring: ScoringConstants = ScoringConstants()` dans la section `# ── Scoring ──` et conserver `wildcard_max_suggestions`.
- Mettre à jour le docstring de module : `"""DALIA configuration — constantes de scoring, API URLs, DB settings."""`.

Note : `app.scoring.config` n'importe pas `app.config`, ce qui évite l'import circulaire ; `app.scoring.rank` importe `app.config` (autorisé).

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: 6 passed. Lancer aussi `.venv/Scripts/python.exe -c "import app.config"` : aucune erreur (le moteur importe encore `config.weights` : il cassera à l'import de `draft_engine`, ce qui est attendu jusqu'à la Task 11 ; ne pas lancer la suite complète avant).

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring server/app/config.py server/tests/unit/scoring
git commit -m "Scoring : types, rétrécissement, constantes et rang

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2 : Agrégation, préférences, référence, groupe de tête

**Files:**
- Create: `server/app/scoring/aggregate.py`
- Test: `server/tests/unit/scoring/test_aggregate.py`

**Interfaces:**
- Consumes: `Term`, `Estimate`, `config.scoring`.
- Produces: `apply_preferences(terms: list[Term], prefs: dict[str, float] | None) -> list[Term]` ; `reference_mean(totals: list[float]) -> float` ; `top_group(items: list[tuple[float, float]]) -> list[int]` (indices sur une liste triée décroissante par avantage) ; `confidence_from_sd(sd: float) -> float` ; `PREF_KEY_BY_TERM: dict[str, str]`.

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/test_aggregate.py` :
```python
import math
import pytest
from app.scoring.aggregate import PREF_KEY_BY_TERM, apply_preferences, confidence_from_sd, reference_mean, top_group
from app.scoring.types import Term


def test_preferences_scale_values_not_sd_and_map_future_opponent_to_draft_risk():
    terms = [Term("meta", 2.0, 1.0), Term("future_opponent", -2.0, 1.5), Term("mechanics", 1.0, 0.5)]
    out = apply_preferences(terms, {"meta": 1.5, "draft_risk": 0.5, "mechanics": 9})
    assert [round(t.value, 3) for t in out] == [3.0, -1.0, 1.0]
    assert [t.sd for t in out] == [1.0, 1.5, 0.5]
    assert PREF_KEY_BY_TERM["future_opponent"] == "draft_risk"
    assert apply_preferences(terms, None)[0].value == 2.0


def test_reference_mean_is_pool_mean_and_zero_when_empty():
    assert reference_mean([1.0, 3.0]) == 2.0
    assert reference_mean([]) == 0.0


def test_top_group_is_contiguous_and_uses_combined_sd():
    # écart 1.0 < sqrt(1²+1²)=1.41 → lié ; écart 3.0 > sqrt(1²+1²) → hors groupe ; le 4e est proche du 3e mais pas du leader
    items = [(5.0, 1.0), (4.0, 1.0), (2.0, 1.0), (1.9, 1.0)]
    assert top_group(items) == [0, 1]
    assert top_group([(1.0, 0.5)]) == [0]
    assert top_group([]) == []


def test_confidence_is_bounded():
    assert confidence_from_sd(0.0) == 95.0
    assert confidence_from_sd(3.0) == pytest.approx(50.0)
    assert confidence_from_sd(100.0) == 8.0
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring/test_aggregate.py -q`
Expected: `ModuleNotFoundError: No module named 'app.scoring.aggregate'`

- [ ] **Step 3 : Implémenter**

`server/app/scoring/aggregate.py` :
```python
"""Somme des termes, préférences, référence relative au pool et groupe de tête."""
from __future__ import annotations
import math
from dataclasses import replace
from typing import Dict, List, Optional, Sequence, Tuple
from app.config import config
from app.scoring.types import Term

# Clés de préférence (stockées en base) → nom du terme qu'elles multiplient.
PREF_KEY_BY_TERM: Dict[str, str] = {
    "meta": "meta", "matchup": "matchup", "synergy": "synergy",
    "composition": "composition", "mastery": "mastery", "future_opponent": "draft_risk",
}


def apply_preferences(terms: Sequence[Term], prefs: Optional[Dict[str, float]]) -> List[Term]:
    if not prefs:
        return list(terms)
    lo, hi = config.scoring.pref_min, config.scoring.pref_max
    out = []
    for t in terms:
        key = PREF_KEY_BY_TERM.get(t.name)
        if key is None or key not in prefs:
            out.append(t)
            continue
        factor = min(hi, max(lo, float(prefs[key])))
        out.append(replace(t, value=t.value * factor))
    return out


def reference_mean(totals: Sequence[float]) -> float:
    return sum(totals) / len(totals) if totals else 0.0


def top_group(items: Sequence[Tuple[float, float]]) -> List[int]:
    """items = [(avantage, sd)] déjà triés par avantage décroissant.

    Le groupe de tête est contigu : on avance tant que l'écart au leader
    reste inférieur à la racine de la somme des variances.
    """
    if not items:
        return []
    lead_adv, lead_sd = items[0]
    group = [0]
    for i in range(1, len(items)):
        adv, sd = items[i]
        if lead_adv - adv < math.sqrt(lead_sd * lead_sd + sd * sd):
            group.append(i)
        else:
            break
    return group


def confidence_from_sd(sd: float) -> float:
    raw = 100.0 * (1.0 - sd / config.scoring.confidence_sd_scale)
    return round(min(95.0, max(8.0, raw)), 1)
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: 10 passed.

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring/aggregate.py server/tests/unit/scoring/test_aggregate.py
git commit -m "Scoring : agrégation, préférences multiplicatives et groupe de tête

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3 : Terme méta et statistiques par rang

**Files:**
- Create: `server/app/scoring/meta_term.py`
- Modify: `server/app/services/data_fetcher.py:202-235`, `server/app/services/meta_analyzer.py`
- Test: `server/tests/unit/scoring/test_meta_term.py`, `server/tests/unit/test_review_fixes.py` (inchangé mais doit rester vert)

**Interfaces:**
- Consumes: `shrink`, `shrink_sd`, `ChampionStats`.
- Produces: `meta_term(stats: Optional[ChampionStats]) -> Term` ; `LolalyticsFetcher.fetch_tierlist(role, patch="current", tier=None)` ; `MetaAnalyzer.load_tierlist(role, tier=None)` ; `MetaAnalyzer.stats(champion_id, role, tier=None) -> Optional[ChampionStats]` ; `MetaAnalyzer.rank_fallback: set[str]` (tiers qui ont dû se replier sur le défaut).

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/test_meta_term.py` :
```python
import math
from unittest.mock import AsyncMock
import pytest
from app.models.champion import ChampionStats
from app.scoring.meta_term import meta_term
from app.scoring.shrink import shrink, shrink_sd
from app.services.meta_analyzer import MetaAnalyzer


def test_meta_term_is_shrunk_win_rate_delta():
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
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring/test_meta_term.py -q`
Expected: échec à l'import de `app.scoring.meta_term`.

- [ ] **Step 3 : Implémenter**

`server/app/scoring/meta_term.py` :
```python
"""Terme méta : écart du win rate observé à 50 %, rétréci."""
from typing import Optional
from app.config import config
from app.models.champion import ChampionStats
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Term


def meta_term(stats: Optional[ChampionStats]) -> Term:
    c = config.scoring
    if stats is None or stats.games <= 0:
        return Term("meta", 0.0, c.no_meta_sd, "heuristic", 0, "aucune statistique méta")
    return Term("meta", shrink(stats.win_rate - 50.0, stats.games, c.k_meta),
                shrink_sd(stats.games, c.k_meta), "observed", stats.games, stats.patch or "")
```

`server/app/services/data_fetcher.py`, `fetch_tierlist` : signature `async def fetch_tierlist(self, role: str = "mid", patch: str = "current", tier: Optional[str] = None)`. Juste après `lane = role_to_lane(role)` ajouter `tier = tier or self.TIER`. Remplacer `{self.TIER}` par `{tier}` dans `cache_key` et `"tier": self.TIER` par `"tier": tier` dans `params`.

`server/app/services/meta_analyzer.py` : remplacer intégralement le corps de la classe (garder le module docstring, imports et `_clamp`) :
```python
class MetaAnalyzer:
    """Statistiques méta par (champion, rôle, tier) + score 0-100 historique pour bans/wildcards."""

    FAILED_REFRESH_RETRY = 600

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher
        self._loaded_roles: set = set()          # (role, tier)
        self._loaded_at: Dict[tuple, float] = {}
        self._locks: Dict[tuple, asyncio.Lock] = {}
        self._by_tier: Dict[str, Dict[tuple, ChampionStats]] = {}
        self.rank_fallback: set = set()

    def _default_tier(self) -> str:
        return self.fetcher.TIER

    def _is_fresh(self, key: tuple) -> bool:
        return key in self._loaded_roles and time.time() - self._loaded_at.get(key, 0) < config.cache_ttl_hours * 3600

    async def load_tierlist(self, role: str, tier: Optional[str] = None):
        """Une seule fenêtre observée par champion ; jamais de mélange d'échantillons."""
        tier = tier or self._default_tier()
        key = (role, tier)
        if self._is_fresh(key):
            return
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            if self._is_fresh(key):
                return
            await self._load_tierlist(role, tier)

    async def _load_tierlist(self, role: str, tier: str):
        raw_current, raw_30d = await asyncio.gather(
            self.fetcher.fetch_tierlist(role=role, patch="current", tier=tier),
            self.fetcher.fetch_tierlist(role=role, patch="30", tier=tier))
        current = {e["champion_id"]: e for e in LolalyticsFetcher.parse_tierlist(raw_current)}
        recent = {e["champion_id"]: e for e in LolalyticsFetcher.parse_tierlist(raw_30d)}
        all_ids = current.keys() | recent.keys()
        key = (role, tier)
        if not all_ids:
            if tier != self._default_tier():
                # Rang sans échantillon : on sert le tier par défaut et on le signale.
                await self.load_tierlist(role, self._default_tier())
                default_stats = self._by_tier.get(self._default_tier(), {})
                self._by_tier[tier] = {k: v for k, v in default_stats.items() if k[1] == role} | {
                    k: v for k, v in self._by_tier.get(tier, {}).items() if k[1] != role}
                self.rank_fallback.add(tier)
                self._loaded_roles.add(key)
                self._loaded_at[key] = time.time() - config.cache_ttl_hours * 3600 + self.FAILED_REFRESH_RETRY
                return
            if key in self._loaded_roles:
                logger.warning("Meta refresh for %s returned nothing; keeping the previous sample", role)
                self._loaded_at[key] = time.time() - config.cache_ttl_hours * 3600 + self.FAILED_REFRESH_RETRY
            return
        bucket = self._by_tier.setdefault(tier, {})
        for k in [k for k in bucket if k[1] == role]:
            del bucket[k]
        is_default = tier == self._default_tier()
        if is_default:
            self.db.clear_role_stats(role)
        for cid in all_ids:
            cur = current.get(cid)
            use_current = cur and (cur["games"] >= config.min_games_reliable or cid not in recent)
            entry = cur if use_current else recent[cid]
            stats = ChampionStats(champion_id=cid, role=role, win_rate=entry["win_rate"], pick_rate=entry["pick_rate"],
                                  ban_rate=entry["ban_rate"], games=entry["games"],
                                  patch="current" if use_current else "30d")
            bucket[(cid, role)] = stats
            if is_default:
                self.db.set_stats(stats)
        self.rank_fallback.discard(tier)
        self._loaded_roles.add(key)
        self._loaded_at[key] = time.time()
        logger.info("Meta loaded for %s (%s): %d entries", role, tier, len(all_ids))

    def stats(self, champion_id: int, role: str, tier: Optional[str] = None) -> Optional[ChampionStats]:
        tier = tier or self._default_tier()
        return self._by_tier.get(tier, {}).get((champion_id, role))

    def is_loaded(self, role: str, tier: Optional[str] = None) -> bool:
        return (role, tier or self._default_tier()) in self._loaded_roles

    # ── Score 0-100 historique : encore utilisé par les bans, l'impact des bans et le filtre wildcard ──
    def score(self, champion_id: int, role: str) -> float:
        stats = self.db.get_stats(champion_id, role)
        if stats is None:
            return 45.0
        wr_score = _clamp((stats.win_rate - 45.0) / 10.0 * 100.0)
        pr_score = min(stats.pick_rate / 12.0 * 100.0, 100.0)
        br_score = min(stats.ban_rate / 30.0 * 100.0, 100.0)
        raw = wr_score * 0.80 + pr_score * 0.15 + br_score * 0.05
        games = stats.games
        min_rel = config.min_games_reliable
        full_conf = config.min_games_full_confidence
        if games < min_rel:
            confidence = 0.35 + 0.30 * (games / min_rel)
        elif games < full_conf:
            confidence = 0.65 + 0.35 * ((games - min_rel) / (full_conf - min_rel))
        else:
            confidence = 1.0
        return round(_clamp(raw * confidence), 1)

    def games(self, champion_id: int, role: str) -> int:
        stats = self.db.get_stats(champion_id, role)
        return stats.games if stats else 0

    async def scores_for_role(self, role: str) -> Dict[int, float]:
        await self.load_tierlist(role)
        return {champ.id: self.score(champ.id, role) for champ in self.db.all_champions()}
```
Ajouter `Optional` à l'import `typing` du module.

Le test existant `test_failed_meta_refresh_keeps_previous_sample` manipule `meta._loaded_at["mid"] = 0` : le remplacer par `meta._loaded_at[("mid", catalog.fetcher.TIER)] = 0` et `assert ("mid", catalog.fetcher.TIER) in meta._loaded_roles`, `time.time() - meta._loaded_at[("mid", catalog.fetcher.TIER)] < 6 * 3600`. Dans `test_caches.py` ligne ~43-50, tout `_loaded_at["mid"]` ou `_loaded_roles` avec une chaîne devient un tuple de la même façon.

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring tests/unit/test_caches.py -q -k "meta or shrink or rank or aggregate or tier"`
Expected: tout passe (les tests de `test_review_fixes.py` importent `draft_engine`, qui casse jusqu'à la Task 11 : exclu ici).

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring/meta_term.py server/app/services/data_fetcher.py server/app/services/meta_analyzer.py server/tests/unit
git commit -m "Scoring : terme méta et statistiques Lolalytics par rang

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4 : Matchups par rang et terme matchup

**Files:**
- Create: `server/app/scoring/matchup_term.py`
- Modify: `server/app/services/data_fetcher.py:237-290`, `server/app/services/matchup.py`
- Test: `server/tests/unit/scoring/test_matchup_term.py`

**Interfaces:**
- Consumes: `MatchupAnalyzer`, `DraftState`, `shrink`.
- Produces: `LolalyticsFetcher.fetch_counter_page(slug, role, patch="counter_default", vs_lane=None, tier=None)` ; `MatchupAnalyzer.load_matchups(champion_id, role, vs_lane=None, tier=None)` ; `MatchupAnalyzer.matchup_data(champion_id, role, opp_id, opp_role, tier=None) -> Optional[tuple]` (renommage public de `_get_matchup_data`) ; `MatchupAnalyzer.estimate_matchup(candidate_id, opponent_id, is_lane) -> tuple[float, int]` (renommage public) ; `MatchupAnalyzer.prefetch(champion_id, role, draft, tier=None)` ; `MatchupAnalyzer.details(champion_id, role, draft, tier=None)` ; `MatchupAnalyzer.get_top_counters(champion_id, role, n=10, tier=None)` ; `MatchupAnalyzer.counters(champion_id, role, tier=None) -> dict[int, tuple]` ; `matchup_term(analyzer, champion_id, role, draft, tier) -> Optional[Term]` (async).

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/test_matchup_term.py` :
```python
import math
from unittest.mock import AsyncMock
import pytest
from app.models.draft import DraftState
from app.scoring.matchup_term import matchup_term
from app.scoring.shrink import shrink, shrink_sd
from app.services.matchup import MatchupAnalyzer


@pytest.mark.asyncio
async def test_lane_and_offlane_contributions(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    async def fetch(slug, role, patch="counter_default", vs_lane=None, tier=None):
        if vs_lane is None:
            return {"stats": {"wr": 50}, "counters": [{"cid": 75, "vsWr": 54., "n": 800, "d1": 4, "d2": 4}]}
        return {"stats": {"wr": 50}, "counters": [{"cid": 59, "vsWr": 48., "n": 200, "d1": -2, "d2": -2}]}
    catalog.fetcher.fetch_counter_page = fetch
    draft = DraftState(my_role="top", enemy_picks=[{"champion_id": 75, "role": "top"}, {"champion_id": 59, "role": "jungle"}])
    draft.role_distributions = {75: {"top": 1.0}, 59: {"jungle": 1.0}}
    term = await matchup_term(analyzer, 78, "top", draft, "emerald_plus")
    expected = shrink(4, 800, 200) + 0.5 * shrink(-2, 200, 200)
    assert math.isclose(term.value, expected)
    assert math.isclose(term.sd, math.sqrt(shrink_sd(800, 200) ** 2 + (0.5 * shrink_sd(200, 200)) ** 2))
    assert term.source == "observed" and term.sample == 1000


@pytest.mark.asyncio
async def test_missing_data_uses_kit_estimate_with_wide_sd(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    catalog.fetcher.fetch_counter_page = AsyncMock(return_value={})
    draft = DraftState(my_role="top", enemy_picks=[{"champion_id": 75, "role": "top"}])
    draft.role_distributions = {75: {"top": 1.0}}
    term = await matchup_term(analyzer, 78, "top", draft, None)
    est, _ = analyzer.estimate_matchup(78, 75, True)
    assert math.isclose(term.value, (est - 50.0) * 0.2)
    assert term.sd == 3.0 and term.source == "heuristic"


@pytest.mark.asyncio
async def test_no_enemy_gives_no_term(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    assert await matchup_term(analyzer, 78, "top", DraftState(my_role="top"), None) is None


@pytest.mark.asyncio
async def test_counter_cache_is_keyed_by_tier(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    seen = []
    async def fetch(slug, role, patch="counter_default", vs_lane=None, tier=None):
        seen.append(tier)
        return {"stats": {"wr": 50}, "counters": [{"cid": 75, "vsWr": 54., "n": 800, "d1": 4, "d2": 4}]}
    catalog.fetcher.fetch_counter_page = fetch
    await analyzer.load_matchups(78, "top", tier="iron")
    await analyzer.load_matchups(78, "top", tier="gold")
    await analyzer.load_matchups(78, "top", tier="iron")
    assert seen == ["iron", "gold"]
    assert analyzer.counters(78, "top", "iron")[75][3] == 4
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring/test_matchup_term.py -q`
Expected: import error.

- [ ] **Step 3 : Implémenter**

`data_fetcher.py`, `fetch_counter_page` : ajouter le paramètre `tier: Optional[str] = None` en dernier ; après `lane = role_to_lane(role)` : `tier = tier or self.TIER` ; utiliser `{tier}` dans `cache_key` et `"tier": tier` dans `params`.

`server/app/services/matchup.py` : appliquer ces modifications.

1. `load_matchups` :
```python
    async def load_matchups(self, champion_id: int, role: str, vs_lane: Optional[str] = None, tier: Optional[str] = None):
        tier = tier or self.fetcher.TIER
        key = (champion_id, role, vs_lane, tier)
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            if self._retry_after.get(key, 0) > time.monotonic():
                return
            await self._load_matchups(champion_id, role, vs_lane, tier)
```
2. `_load_matchups(self, champion_id, role, vs_lane=None, tier=None)` : `tier = tier or self.fetcher.TIER` ; `cache_key = (champion_id, role, vs_lane, tier)` ; appel `self.fetcher.fetch_counter_page(slug, role, vs_lane=vs_lane, tier=tier)` ; après le calcul de `result`, si `not result and tier != self.fetcher.TIER` : charger le tier par défaut (`await self.load_matchups(champion_id, role, vs_lane, self.fetcher.TIER)`), copier `self._matchup_cache.get((champion_id, role, vs_lane, self.fetcher.TIER), {})` dans `self._matchup_cache[cache_key]`, `self._loaded_at[cache_key] = time.time()`, `self.rank_fallback.add(tier)` et `return`. Ajouter `self.rank_fallback: set = set()` dans `__init__`.
3. Renommer `_get_matchup_data` en `matchup_data(self, champion_id, role, opp_id, opp_role, tier=None)` : `tier = tier or self.fetcher.TIER` ; `await self.load_matchups(champion_id, role, vs_lane=vs_lane, tier=tier)` ; lecture dans `self._matchup_cache.get((champion_id, role, vs_lane, tier), {})`.
4. Renommer `_prefetch` en `prefetch(self, champion_id, role, draft, tier=None)` et propager `tier` aux `load_matchups`.
5. Renommer `_estimate_matchup` en `estimate_matchup` (corps inchangé).
6. `score(self, champion_id, role, draft, tier=None)` : appelle `self.prefetch(..., tier)` et `self.matchup_data(..., tier)`. Conserver cette méthode : le recommandeur de bans et d'anciens tests l'utilisent.
7. `details(self, champion_id, role, draft, tier=None)` : idem.
8. `get_top_counters(self, champion_id, role, n=10, tier=None)` : `data = self.counters(champion_id, role, tier)`.
9. Nouvelle méthode :
```python
    def counters(self, champion_id: int, role: str, tier: Optional[str] = None) -> Dict[int, Tuple[float, int, float, float]]:
        """Page de counters déjà chargée pour (champion, rôle, même lane, tier)."""
        return self._matchup_cache.get((champion_id, role, None, tier or self.fetcher.TIER), {})
```
Mettre à jour l'usage dans `ban_recommender.py` s'il appelle `_get_matchup_data`, `_prefetch` ou `_estimate_matchup` (vérifier avec `grep -n "_get_matchup_data\|_prefetch\|_estimate_matchup" server/app`), en utilisant les nouveaux noms publics.

`server/app/scoring/matchup_term.py` :
```python
"""Terme matchup contre les ennemis visibles, espérance sur leurs distributions de rôles."""
from __future__ import annotations
import math
from typing import Optional
from app.config import config
from app.models.draft import DraftState
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Term
from app.services.matchup import MatchupAnalyzer


async def matchup_term(analyzer: MatchupAnalyzer, champion_id: int, role: str, draft: DraftState,
                       tier: Optional[str]) -> Optional[Term]:
    enemies = [e for e in draft.enemy_picks if e.champion_id is not None]
    if not enemies:
        return None
    c = config.scoring
    await analyzer.prefetch(champion_id, role, draft, tier)
    value, variance, sample, observed = 0.0, 0.0, 0, 0
    for ep in enemies:
        dist = draft.role_distributions.get(ep.champion_id) if draft.role_distributions else None
        if not dist:
            dist = {ep.role: 1.0} if ep.role else {}
        for opp_role, p in dist.items():
            if p <= 0:
                continue
            is_lane = opp_role == role
            weight = p * (1.0 if is_lane else c.offlane_weight)
            data = await analyzer.matchup_data(champion_id, role, ep.champion_id, opp_role, tier)
            if data is not None:
                _, games, _, d2 = data
                value += weight * shrink(d2, games, c.k_matchup)
                variance += (weight * shrink_sd(games, c.k_matchup)) ** 2
                sample += games
                observed += 1
            else:
                est, _ = analyzer.estimate_matchup(champion_id, ep.champion_id, is_lane)
                value += weight * (est - 50.0) * c.heuristic_matchup_scale
                variance += (weight * c.heuristic_matchup_sd) ** 2
    source = "observed" if observed else "heuristic"
    return Term("matchup", value, math.sqrt(variance), source, sample,
                "" if observed else "estimation de kit, aucune donnée de matchup")
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: tout passe.

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring/matchup_term.py server/app/services/data_fetcher.py server/app/services/matchup.py server/app/services/ban_recommender.py server/tests/unit/scoring/test_matchup_term.py
git commit -m "Scoring : terme matchup et caches de counters par rang

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5 : Modèle de l'adversaire futur

**Files:**
- Create: `server/app/scoring/opponent_model.py`
- Test: `server/tests/unit/scoring/test_opponent_model.py`

**Interfaces:**
- Consumes: `MatchupAnalyzer.load_matchups`, `MatchupAnalyzer.counters`, `MetaAnalyzer.stats`, `ChampionDatabase.champions_for_role`, `counter_lambda`, `lolalytics_tier`.
- Produces: `opponent_distribution(candidates: list[tuple[int, float, Optional[float]]], lam_q: float) -> dict[int, float]` ; `expected_delta(dist: dict[int, float], deltas: dict[int, float]) -> tuple[float, float]` ; `role_identification_probability(champion, my_role, unfilled_roles: set[str]) -> float` ; `future_opponent_term(matchup, meta, db, champion, role, draft, rank) -> Optional[Term]` (async).

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/test_opponent_model.py` :
```python
import math
from unittest.mock import AsyncMock
import pytest
from app.models.draft import DraftState
from app.scoring.opponent_model import (expected_delta, future_opponent_term, opponent_distribution,
                                        role_identification_probability)
from app.services.matchup import MatchupAnalyzer
from app.services.meta_analyzer import MetaAnalyzer


def test_distribution_mixes_meta_and_counter_and_sums_to_one():
    cands = [(1, 10.0, -3.0), (2, 10.0, 0.0), (3, 5.0, 1.0)]
    d0 = opponent_distribution(cands, 0.0)
    assert math.isclose(d0[1], 0.4) and math.isclose(sum(d0.values()), 1.0)
    d1 = opponent_distribution(cands, 1.0)
    assert math.isclose(d1[1], 1.0) and d1[2] == 0.0
    half = opponent_distribution(cands, 0.5)
    assert math.isclose(sum(half.values()), 1.0) and half[1] > d0[1]


def test_distribution_without_counter_signal_falls_back_to_meta():
    cands = [(1, 10.0, 2.0), (2, 10.0, None)]
    assert opponent_distribution(cands, 0.5) == opponent_distribution(cands, 0.0)


def test_expected_delta_and_variance():
    value, sd = expected_delta({1: 0.5, 2: 0.5}, {1: -2.0, 2: 2.0})
    assert value == 0.0 and math.isclose(sd, 2.0)
    assert expected_delta({1: 1.0}, {1: 0.7})[1] == 1.0, "plancher d'écart-type"


def test_role_identification_probability(catalog):
    poppy, nasus = catalog.get_by_id(78), catalog.get_by_id(75)
    unfilled = {"top", "jungle", "support", "mid"}
    assert role_identification_probability(nasus, "top", unfilled) == 1.0
    assert math.isclose(role_identification_probability(poppy, "top", unfilled), 1 / 3)
    assert role_identification_probability(poppy, "top", {"top"}) == 1.0


@pytest.mark.asyncio
async def test_future_term_is_absent_when_lane_opponent_known_or_no_picks_left(catalog):
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    known = DraftState(my_role="top", enemy_picks=[{"champion_id": 75, "role": "top"}])
    assert await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", known, None) is None
    full = DraftState(my_role="top", enemy_picks=[{"champion_id": i} for i in (75, 103, 61, 222, 59)])
    assert await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", full, None) is None


@pytest.mark.asyncio
async def test_future_term_expected_over_available_top_laners(catalog):
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={"cid": {
        "75": {"wr": 50, "games": 5000, "pr": 10, "br": 1}, "54": {"wr": 50, "games": 5000, "pr": 10, "br": 1},
        "24": {"wr": 50, "games": 5000, "pr": 0.1, "br": 1}}})
    catalog.fetcher.fetch_counter_page = AsyncMock(return_value={"stats": {"wr": 50}, "counters": [
        {"cid": 75, "vsWr": 46., "n": 2000, "d1": -4, "d2": -4}, {"cid": 54, "vsWr": 52., "n": 2000, "d1": 2, "d2": 2}]})
    draft = DraftState(my_role="top", bans=[54])
    term = await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(69), "top", draft, "iron")
    # Malphite banni, Jax sous le seuil de pick rate → seul Nasus reste : espérance = d2 rétréci de Nasus
    assert term.name == "future_opponent" and term.source == "observed"
    assert math.isclose(term.value, -4 * 2000 / 2200)
    assert term.sd == 1.0


@pytest.mark.asyncio
async def test_future_term_without_counter_page_is_neutral_and_wide(catalog):
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={})
    catalog.fetcher.fetch_counter_page = AsyncMock(return_value={})
    term = await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", DraftState(my_role="top"), None)
    assert term.value == 0.0 and term.sd == 4.0 and term.source == "heuristic"
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring/test_opponent_model.py -q`
Expected: import error.

- [ ] **Step 3 : Implémenter**

`server/app/scoring/opponent_model.py` :
```python
"""Adversaire futur : espérance du matchup sur les picks adverses possibles dans mon rôle.

Remplace le « risque de draft », la liste de champions à risque en blind, le
bonus flex et la pénalité situationnelle : tout émerge de la distribution.
"""
from __future__ import annotations
import math
from typing import Dict, List, Optional, Sequence, Tuple
from app.config import config
from app.models.champion import Champion
from app.models.draft import ROLES, DraftState
from app.scoring.rank import counter_lambda, lolalytics_tier
from app.scoring.shrink import shrink
from app.scoring.types import Term

Candidate = Tuple[int, float, Optional[float]]  # (champion_id, pick_rate, d2 rétréci ou None)


def opponent_distribution(candidates: Sequence[Candidate], lam_q: float) -> Dict[int, float]:
    total_pr = sum(pr for _, pr, _ in candidates)
    if not candidates or total_pr <= 0:
        return {}
    p_meta = {cid: pr / total_pr for cid, pr, _ in candidates}
    threat = {cid: max(0.0, -(d2 or 0.0)) for cid, _, d2 in candidates}
    total_threat = sum(threat.values())
    p_counter = {cid: t / total_threat for cid, t in threat.items()} if total_threat > 0 else p_meta
    return {cid: (1 - lam_q) * p_meta[cid] + lam_q * p_counter[cid] for cid in p_meta}


def expected_delta(dist: Dict[int, float], deltas: Dict[int, float]) -> Tuple[float, float]:
    value = sum(p * deltas.get(cid, 0.0) for cid, p in dist.items())
    variance = sum(p * (deltas.get(cid, 0.0) - value) ** 2 for cid, p in dist.items())
    return value, max(config.scoring.future_sd_floor, math.sqrt(variance))


def role_identification_probability(champion: Champion, my_role: str, unfilled_roles: set) -> float:
    if len(champion.roles) <= 1 or unfilled_roles == {my_role}:
        return 1.0
    plausible = set(champion.roles) & set(unfilled_roles)
    return 1.0 / max(1, len(plausible))


async def future_opponent_term(matchup, meta, db, champion: Champion, role: str, draft: DraftState,
                               rank: Optional[str]) -> Optional[Term]:
    if draft.my_lane_opponent_revealed or draft.remaining_enemy_picks <= 0:
        return None
    c = config.scoring
    tier = lolalytics_tier(rank, matchup.fetcher.TIER)
    await meta.load_tierlist(role, tier)
    await matchup.load_matchups(champion.id, role, tier=tier)
    counters = matchup.counters(champion.id, role, tier)
    unavailable = draft.all_unavailable_ids
    candidates: List[Candidate] = []
    deltas: Dict[int, float] = {}
    for x in db.champions_for_role(role):
        if x.id == champion.id or x.id in unavailable:
            continue
        stats = meta.stats(x.id, role, tier)
        if stats is None or stats.pick_rate < c.min_opponent_pick_rate:
            continue
        data = counters.get(x.id)
        d2 = shrink(data[3], data[1], c.k_matchup) if data else None
        candidates.append((x.id, stats.pick_rate, d2))
        deltas[x.id] = d2 or 0.0
    if not candidates or not counters:
        return Term("future_opponent", 0.0, c.future_no_data_sd, "heuristic", 0,
                    "aucune page de counters ou de pick rates pour ce rôle")
    unfilled = set(ROLES) - draft.ally_roles_filled
    lam_q = counter_lambda(rank) * role_identification_probability(champion, role, unfilled)
    dist = opponent_distribution(candidates, lam_q)
    value, sd = expected_delta(dist, deltas)
    return Term("future_opponent", value, sd, "observed", sum(counters[cid][1] for cid in dist if cid in counters),
                f"{len(dist)} adversaires possibles, λ={lam_q:.2f}")
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: tout passe.

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring/opponent_model.py server/tests/unit/scoring/test_opponent_model.py
git commit -m "Scoring : modèle de l'adversaire futur

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6 : Difficulté des champions et terme maîtrise

**Files:**
- Create: `server/app/scoring/mastery_term.py`
- Modify: `server/app/models/champion.py:27-40`, `server/app/services/champion_data.py:146-158`
- Test: `server/tests/unit/scoring/test_mastery_term.py`

**Interfaces:**
- Produces: `Champion.difficulty: int = 5` ; `MasteryInputs(tier, difficulty, rank, personal_games=0, personal_wr=None, mastery_points=0, last_played=None, now=None)` ; `mastery_term(inputs) -> Term`.

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/test_mastery_term.py` :
```python
import math
from datetime import datetime, timedelta, timezone
from app.models.champion import Champion
from app.scoring.mastery_term import MasteryInputs, mastery_term

NOW = datetime(2026, 9, 10, tzinfo=timezone.utc)


def test_declared_tier_scaled_by_difficulty_and_rank():
    t = mastery_term(MasteryInputs(tier="D", difficulty=10, rank="silver", now=NOW))
    assert math.isclose(t.value, -5.0 * (0.6 + 0.8) * 1.3)
    assert t.sd == 1.5 and t.source == "heuristic"
    assert mastery_term(MasteryInputs(tier="A", difficulty=5, rank=None, now=NOW)).value == 0.0
    assert mastery_term(MasteryInputs(tier="S", difficulty=5, rank="diamond", now=NOW)).value == 0.8


def test_personal_win_rate_replaces_declared_tier_when_enough_games():
    t = mastery_term(MasteryInputs(tier="D", difficulty=5, rank=None, personal_games=30, personal_wr=60.0, now=NOW))
    assert math.isclose(t.value, min(6.0, 10.0 * 30 / 40))
    assert t.sd == 1.0 and t.source == "observed" and t.sample == 30


def test_personal_and_declared_are_blended_between_3_and_9_games():
    t = mastery_term(MasteryInputs(tier="B", difficulty=5, rank=None, personal_games=5, personal_wr=70.0, now=NOW))
    personal = min(6.0, 20.0 * 5 / 15)
    assert math.isclose(t.value, (5 * personal + 10 * -1.5) / 15)
    assert t.source == "heuristic"


def test_recency_penalty_capped_and_halved_by_mastery_points():
    stale = MasteryInputs(tier="A", difficulty=5, rank=None, last_played=NOW - timedelta(days=200), now=NOW)
    assert math.isclose(mastery_term(stale).value, -1.5)
    veteran = MasteryInputs(tier="A", difficulty=5, rank=None, last_played=NOW - timedelta(days=200),
                            mastery_points=150_000, now=NOW)
    assert math.isclose(mastery_term(veteran).value, -0.75)


def test_champion_has_default_difficulty():
    assert Champion(id=1, key="X", name="X").difficulty == 5
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring/test_mastery_term.py -q`
Expected: import error.

- [ ] **Step 3 : Implémenter**

`server/app/models/champion.py`, classe `Champion` : ajouter après `title: str = ""` la ligne `difficulty: int = Field(5, ge=1, le=10)  # Data Dragon info.difficulty` (importer `Field` de pydantic si absent).

`server/app/services/champion_data.py`, construction de `Champion(...)` dans `initialize` : ajouter `difficulty=max(1, min(10, int((info.get("info") or {}).get("difficulty", 5) or 5))),`.

`server/app/scoring/mastery_term.py` :
```python
"""Terme maîtrise : confort réel sur le champion, pondéré par difficulté et rang."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from app.config import config
from app.scoring.rank import mastery_rank_factor
from app.scoring.shrink import shrink
from app.scoring.types import Term


@dataclass
class MasteryInputs:
    tier: str
    difficulty: int
    rank: Optional[str]
    personal_games: int = 0
    personal_wr: Optional[float] = None
    mastery_points: int = 0
    last_played: Optional[datetime] = None
    now: Optional[datetime] = None


def mastery_term(inp: MasteryInputs) -> Term:
    c = config.scoring
    declared = c.mastery_tier_base.get(inp.tier, c.mastery_tier_base["B"])
    g = max(0, inp.personal_games)
    personal = None
    if inp.personal_wr is not None and g >= c.mastery_blend_min_games:
        raw = shrink(inp.personal_wr - 50.0, g, c.mastery_personal_k)
        personal = max(-c.mastery_personal_cap, min(c.mastery_personal_cap, raw))
    if personal is not None and g >= c.mastery_personal_min_games:
        base, sd, source = personal, c.mastery_sd_observed, "observed"
    elif personal is not None:
        base = (g * personal + c.mastery_personal_min_games * declared) / (g + c.mastery_personal_min_games)
        sd, source = c.mastery_sd_declared, "heuristic"
    else:
        base, sd, source = declared, c.mastery_sd_declared, "heuristic"

    penalty = 0.0
    if inp.last_played is not None:
        now = inp.now or datetime.now(timezone.utc)
        months = min(c.mastery_recency_max_months, max(0.0, (now - inp.last_played).days / 30.0))
        penalty = c.mastery_recency_per_month * months
        if inp.mastery_points >= c.mastery_points_familiar:
            penalty /= 2
    f_diff = 0.6 + 0.08 * max(1, min(10, inp.difficulty))
    value = (base - penalty) * f_diff * mastery_rank_factor(inp.rank)
    note = f"palier {inp.tier}, difficulté {inp.difficulty}" + (f", {g} parties" if g else "")
    return Term("mastery", value, sd, source, g, note)
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: tout passe.

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring/mastery_term.py server/app/models/champion.py server/app/services/champion_data.py server/tests/unit/scoring/test_mastery_term.py
git commit -m "Scoring : terme maîtrise et difficulté Data Dragon

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7 : Service personnel — stats par champion et maîtrise Riot

**Files:**
- Modify: `server/app/services/personal_stats.py`
- Test: `server/tests/unit/test_personal_stats.py` (nouveau)

**Interfaces:**
- Produces: `PersonalStatsService.get_champion_personal(puuid, champion_id, role, region="EUW1") -> Optional[dict]` avec `{"games": int, "win_rate": float}` ; `PersonalStatsService.get_mastery(puuid, region="EUW1") -> dict[int, dict]` (async) avec `{champion_id: {"points": int, "last_played": float}}` ; `PersonalStatsService.get_mastery_entry(puuid, champion_id, region="EUW1") -> Optional[dict]` (cache mémoire seulement) ; `refresh_in_background` déclenche aussi la maîtrise. `get_champion_score_boost` supprimée.

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/test_personal_stats.py` :
```python
import time
from unittest.mock import AsyncMock, patch
import pytest
from app.config import config
from app.services.personal_stats import MASTERY_TTL, PersonalStatsService
from app.services.storage import cache_key


def test_champion_personal_reads_fresh_cache_only():
    svc = PersonalStatsService()
    key = cache_key("puuid-1234567890", "EUW1", "ranked", 50)
    svc._cache[key] = {"ts": time.time(), "data": {"champions": {"103_mid": {"games": 12, "win_rate": 58.3}}}}
    assert svc.get_champion_personal("puuid-1234567890", 103, "mid", "euw1") == {"games": 12, "win_rate": 58.3}
    assert svc.get_champion_personal("puuid-1234567890", 61, "mid") is None
    svc._cache[key]["ts"] = 0
    assert svc.get_champion_personal("puuid-1234567890", 103, "mid") is None
    assert not hasattr(svc, "get_champion_score_boost")


@pytest.mark.asyncio
async def test_mastery_is_fetched_once_and_cached(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "riot_api_key", "RGAPI-test")
    monkeypatch.setattr("app.services.personal_stats.CACHE_DIR", tmp_path)
    svc = PersonalStatsService()
    svc._budget.acquire = AsyncMock()
    payload = [{"championId": 103, "championPoints": 250000, "lastPlayTime": 1_757_000_000_000}]
    class Resp:
        status_code = 200
        headers = {}
        def json(self): return payload
    with patch("app.services.personal_stats.httpx.AsyncClient") as client_cls:
        client = client_cls.return_value.__aenter__.return_value
        client.get = AsyncMock(return_value=Resp())
        first = await svc.get_mastery("puuid-1234567890", "EUW1")
        second = await svc.get_mastery("puuid-1234567890", "EUW1")
        assert client.get.await_count == 1
    assert first == second == {103: {"points": 250000, "last_played": 1_757_000_000.0}}
    assert svc.get_mastery_entry("puuid-1234567890", 103, "EUW1")["points"] == 250000
    assert svc.get_mastery_entry("puuid-1234567890", 61, "EUW1") is None
    assert MASTERY_TTL == 86400


@pytest.mark.asyncio
async def test_mastery_without_api_key_is_empty(monkeypatch):
    monkeypatch.setattr(config, "riot_api_key", "")
    assert await PersonalStatsService().get_mastery("puuid-1234567890") == {}
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/test_personal_stats.py -q`
Expected: `ImportError: cannot import name 'MASTERY_TTL'`.

- [ ] **Step 3 : Implémenter**

Dans `personal_stats.py` :

1. Après `FAILURE_TTL = 60` ajouter `MASTERY_TTL = 86400  # la maîtrise bouge lentement : un appel par jour et par joueur`.
2. Dans `__init__`, ajouter `self._mastery: Dict[str, Any] = {}  # clé → {ts, data}`.
3. Supprimer entièrement `get_champion_score_boost`. À sa place :
```python
    def get_champion_personal(self, puuid: str, champion_id: int, role: str, region: str = "EUW1") -> Optional[Dict[str, Any]]:
        """Parties et win rate ranked récents sur (champion, rôle), depuis le cache frais uniquement."""
        cached = self._cache.get(cache_key(puuid, region.upper(), "ranked", 50))
        if not cached or time.time() - cached["ts"] >= CACHE_TTL:
            return None
        stats = cached["data"].get("champions", {}).get(f"{champion_id}_{role}")
        if not stats:
            return None
        return {"games": int(stats.get("games", 0)), "win_rate": float(stats.get("win_rate", 0.0))}

    def get_mastery_entry(self, puuid: str, champion_id: int, region: str = "EUW1") -> Optional[Dict[str, Any]]:
        cached = self._mastery.get(cache_key("mastery", puuid, region.upper()))
        if not cached or time.time() - cached["ts"] >= MASTERY_TTL:
            return None
        return cached["data"].get(champion_id)

    async def get_mastery(self, puuid: str, region: str = "EUW1") -> Dict[int, Dict[str, Any]]:
        """Points et date de dernière partie par champion (champion-mastery-v4)."""
        key = cache_key("mastery", puuid, region.upper())
        cached = self._mastery.get(key)
        if cached and time.time() - cached["ts"] < MASTERY_TTL:
            return cached["data"]
        disk = self._load_disk_cache(key, ttl=MASTERY_TTL)
        if disk:
            data = {int(k): v for k, v in disk.get("mastery", {}).items()}
            self._mastery[key] = {"ts": time.time(), "data": data}
            return data
        api_key = config.riot_api_key
        if not api_key or time.time() - self._failed_at.get(key, 0) < FAILURE_TTL:
            return {}
        platform = region.lower()
        url = f"https://{platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}"
        try:
            async with self._limit, asyncio.timeout(20):
                await self._budget.acquire(api_key)
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(url, headers={"X-Riot-Token": api_key})
            if resp.status_code == 429:
                await asyncio.to_thread(self._budget.penalize, api_key, resp.headers.get("Retry-After", 10))
            if resp.status_code != 200:
                self._failed_at[key] = time.time()
                return {}
            data = {}
            for entry in resp.json():
                try:
                    data[int(entry["championId"])] = {"points": int(entry.get("championPoints", 0)),
                                                      "last_played": float(entry.get("lastPlayTime", 0)) / 1000.0}
                except (KeyError, TypeError, ValueError):
                    continue
            self._mastery[key] = {"ts": time.time(), "data": data}
            self._save_disk_cache(key, {"mastery": {str(k): v for k, v in data.items()}})
            return data
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._failed_at[key] = time.time()
            logger.error("Failed to fetch mastery for %s: %s", puuid[:8], exc)
            return {}
```
4. `_load_disk_cache(self, puuid: str, ttl: float = CACHE_TTL)` : remplacer `> CACHE_TTL` par `> ttl`.
5. `refresh_in_background` : après la garde `if key in self._refresh_tasks ...`, ajouter avant `async def refresh()` :
```python
        mastery_key = cache_key("mastery", puuid, region.upper())
        mastery_cached = self._mastery.get(mastery_key)
        need_mastery = not mastery_cached or time.time() - mastery_cached["ts"] >= MASTERY_TTL
```
et dans `refresh()` : `await self.get_personal_stats(puuid, region)` puis `if need_mastery: await self.get_mastery(puuid, region)`.

Mettre à jour `server/tests/unit/test_engine_and_api.py::test_personal_refresh_does_not_block_draft` : remplacer `personal.get_champion_score_boost.return_value = 0` par `personal.get_champion_personal.return_value = None; personal.get_mastery_entry.return_value = None`.

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/test_personal_stats.py -q`
Expected: 3 passed.

- [ ] **Step 5 : Commit**

```bash
git add server/app/services/personal_stats.py server/tests/unit/test_personal_stats.py server/tests/unit/test_engine_and_api.py
git commit -m "Stats personnelles : parties par champion et maîtrise Riot, fin du multiplicateur

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8 : Composition marginale et archétype

**Files:**
- Create: `server/app/scoring/composition_term.py`
- Modify: `server/app/services/composition.py:44-85` (supprimer `score`, ajouter `team_warnings`)
- Test: `server/tests/unit/scoring/test_composition_term.py`

**Interfaces:**
- Consumes: `MechanicsAnalyzer.coverage(champion) -> set`, `CompositionAnalyzer._warnings(team)`, `archetype_counter_adjust`, `ArchetypeResult`.
- Produces: `CompositionAnalyzer.team_warnings(team: list[Champion]) -> list[CompositionWarning]` ; `team_value(team, mechanics, composition) -> float` ; `composition_term(candidate, allies, mechanics, composition) -> Optional[Term]` ; `archetype_term(candidate, archetype: Optional[ArchetypeResult]) -> Optional[Term]`.

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/test_composition_term.py` :
```python
import math
from app.scoring.composition_term import archetype_term, composition_term, team_value
from app.services.composition import CompositionAnalyzer
from app.services.composition_archetype import Archetype, ArchetypeResult, archetype_counter_adjust
from app.services.mechanics import MechanicsAnalyzer


def test_marginal_value_counts_new_tools_only(catalog):
    mech, comp = MechanicsAnalyzer(catalog), CompositionAnalyzer(catalog)
    poppy, malphite, ahri = catalog.get_by_id(78), catalog.get_by_id(54), catalog.get_by_id(103)
    # Malphite apporte frontline+engage ; Poppy ensuite n'ajoute rien de neuf sur ces outils
    with_poppy = composition_term(poppy, [malphite, ahri], mech, comp)
    with_malphite_first = composition_term(malphite, [ahri], mech, comp)
    assert with_malphite_first.value > with_poppy.value
    assert with_poppy.sd == 2.0 and with_poppy.source == "heuristic"


def test_attenuated_by_known_allies_and_absent_without_ally(catalog):
    mech, comp = MechanicsAnalyzer(catalog), CompositionAnalyzer(catalog)
    malphite, ahri, jinx = catalog.get_by_id(54), catalog.get_by_id(103), catalog.get_by_id(222)
    one = composition_term(malphite, [ahri], mech, comp)
    two = composition_term(malphite, [ahri, jinx], mech, comp)
    raw_one = team_value([ahri, malphite], mech, comp) - team_value([ahri], mech, comp)
    assert math.isclose(one.value, max(-4, min(4, raw_one)) * 0.25)
    assert two.value != one.value
    assert composition_term(malphite, [], mech, comp) is None


def test_team_warnings_are_public(catalog):
    comp = CompositionAnalyzer(catalog)
    assert isinstance(comp.team_warnings([catalog.get_by_id(103), catalog.get_by_id(61)]), list)
    assert not hasattr(comp, "score")


def test_archetype_term_scales_with_confidence(catalog):
    poppy = catalog.get_by_id(78)
    result = ArchetypeResult(Archetype.ENGAGE, {}, 0.5, 3)
    term = archetype_term(poppy, result)
    expected = (archetype_counter_adjust(poppy, Archetype.ENGAGE) - 1.0) * 15.0 * 0.5
    assert term is not None and math.isclose(term.value, expected) and term.sd == 1.5
    assert archetype_term(poppy, ArchetypeResult(Archetype.MIXED, {}, 0.9, 5)) is None
    assert archetype_term(poppy, None) is None
```
Vérifier d'abord le nom exact des membres de `Archetype` avec `grep -n "= \"" server/app/services/composition_archetype.py` ; si `ENGAGE` n'existe pas, utiliser le premier membre non `MIXED`. Le constructeur `ArchetypeResult(primary, scores, confidence, picks_revealed)` : vérifier l'ordre des champs dans la dataclass (ligne 53) et adapter l'appel.

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring/test_composition_term.py -q`
Expected: import error.

- [ ] **Step 3 : Implémenter**

`composition.py` : supprimer la méthode `score` (lignes `def score(self, candidate, draft)` jusqu'au `return round(_clamp(score, 8.0, 95.0), 1)`). Ajouter :
```python
    def team_warnings(self, team: List[Champion]) -> List[CompositionWarning]:
        """Avertissements de composition pour une équipe donnée (sans candidat implicite)."""
        return self._warnings(team)
```

`server/app/scoring/composition_term.py` :
```python
"""Composition marginale : ce que le candidat ajoute que l'équipe n'a pas encore."""
from __future__ import annotations
from typing import List, Optional
from app.config import config
from app.models.champion import Champion
from app.scoring.types import Term
from app.services.composition_archetype import Archetype, ArchetypeResult, archetype_counter_adjust


def team_value(team: List[Champion], mechanics, composition) -> float:
    c = config.scoring
    if not team:
        return 0.0
    covered = set().union(*(mechanics.coverage(ch) for ch in team))
    value = sum(c.comp_tool_weights.get(tool, 0.0) for tool in covered)
    for w in composition.team_warnings(team):
        value -= c.comp_warning_penalty.get(w.severity, 0.0)
    return value


def composition_term(candidate: Champion, allies: List[Champion], mechanics, composition) -> Optional[Term]:
    if not allies:
        return None
    c = config.scoring
    raw = team_value(allies + [candidate], mechanics, composition) - team_value(allies, mechanics, composition)
    bounded = max(-c.comp_cap, min(c.comp_cap, raw))
    value = bounded * min(1.0, len(allies) / 4.0)
    return Term("composition", value, c.comp_sd, "heuristic", 0, f"apport marginal avec {len(allies)} allié(s) connu(s)")


def archetype_term(candidate: Champion, archetype: Optional[ArchetypeResult]) -> Optional[Term]:
    if archetype is None or archetype.primary == Archetype.MIXED:
        return None
    c = config.scoring
    value = (archetype_counter_adjust(candidate, archetype.primary) - 1.0) * c.archetype_scale * archetype.confidence
    return Term("archetype", value, c.archetype_sd, "heuristic", archetype.picks_revealed,
                f"réponse à une composition {archetype.primary.value}")
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: tout passe.

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring/composition_term.py server/app/services/composition.py server/tests/unit/scoring/test_composition_term.py
git commit -m "Scoring : composition marginale et terme archétype

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9 : Termes heuristiques — synergie, mécaniques, modèle

**Files:**
- Create: `server/app/scoring/heuristic_terms.py`
- Test: `server/tests/unit/scoring/test_heuristic_terms.py`

**Interfaces:**
- Produces: `synergy_term(score_0_100: float, duo_bonus: bool) -> Term` ; `mechanics_term(delta: float) -> Term` ; `model_term(delta_pp: float) -> Term`.

- [ ] **Step 1 : Écrire les tests**

`server/tests/unit/scoring/test_heuristic_terms.py` :
```python
import math
from app.scoring.heuristic_terms import mechanics_term, model_term, synergy_term


def test_synergy_is_rescaled_capped_and_duo_boosted():
    assert math.isclose(synergy_term(60.0, False).value, 1.2)
    assert synergy_term(100.0, False).value == 3.0
    assert math.isclose(synergy_term(100.0, True).value, 4.5)
    assert synergy_term(50.0, False).sd == 2.0 and synergy_term(50.0, False).source == "heuristic"


def test_mechanics_and_model_terms():
    assert math.isclose(mechanics_term(12.0).value, 3.6) and mechanics_term(0).sd == 1.5
    assert model_term(9.0).value == 4.0 and model_term(-9.0).value == -4.0
    assert model_term(1.5).source == "model" and model_term(1.5).sd == 2.0
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring/test_heuristic_terms.py -q`
Expected: import error.

- [ ] **Step 3 : Implémenter**

`server/app/scoring/heuristic_terms.py` :
```python
"""Termes heuristiques convertis en points de WR : synergie de kit, mécaniques, modèle."""
from app.config import config
from app.scoring.types import Term


def synergy_term(score_0_100: float, duo_bonus: bool) -> Term:
    c = config.scoring
    value = max(-c.synergy_cap, min(c.synergy_cap, (score_0_100 - 50.0) * c.synergy_scale))
    if duo_bonus:
        value *= c.synergy_duo_factor
    return Term("synergy", value, c.synergy_sd, "heuristic", 0, "synergie de kit" + (", duo" if duo_bonus else ""))


def mechanics_term(delta: float) -> Term:
    c = config.scoring
    return Term("mechanics", delta * c.mechanics_scale, c.mechanics_sd, "heuristic", 0, "règles d'interactions de kits")


def model_term(delta_pp: float) -> Term:
    c = config.scoring
    return Term("model", max(-c.model_cap, min(c.model_cap, delta_pp)), c.model_sd, "model", 0,
                "WPA estimé DALIA, écart à la moyenne des alternatives")
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/scoring -q`
Expected: tout passe.

- [ ] **Step 5 : Commit**

```bash
git add server/app/scoring/heuristic_terms.py server/tests/unit/scoring/test_heuristic_terms.py
git commit -m "Scoring : termes synergie, mécaniques et modèle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10 : Contrat API — modèles, validation des préférences, rang

**Files:**
- Modify: `server/app/models/validation.py`, `server/app/models/draft.py`
- Test: `server/tests/unit/test_validation_and_auth.py` (ajouts)

**Interfaces:**
- Produces: `RankBucket` (type annoté, normalisé) ; `validate_weights` acceptant `[0.5, 1.5]` ; `ScoreTerm(name, value, sd, source, sample, note)` ; `ScoreBreakdown.terms: List[ScoreTerm]` ; `Recommendation.score_sd: float = 0.0`, `Recommendation.tie_with_leader: bool = False` ; `DraftResponse.reference_mean: float = 0.0`, `top_group_ids: List[int]`, `rank_bucket: Optional[str]` ; `DraftRequest.rank_bucket: Optional[RankBucket] = None`.

- [ ] **Step 1 : Écrire les tests**

Ajouter à `server/tests/unit/test_validation_and_auth.py` :
```python
def test_weight_overrides_are_multipliers_between_half_and_one_and_half():
    from app.models.validation import validate_weights
    assert validate_weights({"meta": 0.5, "draft_risk": 1.5}) == {"meta": 0.5, "draft_risk": 1.5}
    for bad in ({"meta": 0.2}, {"meta": 2.0}, {"unknown": 1.0}):
        with pytest.raises(ValueError):
            validate_weights(bad)


def test_rank_bucket_is_normalized_on_the_request():
    from app.models.draft import DraftRequest
    assert DraftRequest(draft_state={}, rank_bucket="EMERALD").rank_bucket == "emerald"
    assert DraftRequest(draft_state={}, rank_bucket="Challenger").rank_bucket == "master_plus"
    assert DraftRequest(draft_state={}, rank_bucket="").rank_bucket is None
    with pytest.raises(ValueError):
        DraftRequest(draft_state={}, rank_bucket="wood")
```
(Vérifier que `pytest` est importé dans ce fichier.)

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/test_validation_and_auth.py -q -k "multipliers or rank_bucket"`
Expected: 2 failed.

- [ ] **Step 3 : Implémenter**

`validation.py` :
```python
RANK_BUCKETS = ("iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master_plus")
_RANK_ALIASES = {"master": "master_plus", "grandmaster": "master_plus", "challenger": "master_plus"}


def normalize_rank_bucket(value):
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if not cleaned:
            return None
        return _RANK_ALIASES.get(cleaned, cleaned)
    return value


RankBucket = Annotated[Literal[RANK_BUCKETS] | None, BeforeValidator(normalize_rank_bucket)]
```
Note : `Literal[RANK_BUCKETS]` n'est pas accepté par Python ; écrire explicitement `Literal["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master_plus"]`. Remplacer `validate_weights` :
```python
def validate_weights(weights):
    import math
    if weights is not None:
        if set(weights) - WEIGHT_NAMES:
            raise ValueError("Préférence inconnue")
        if any(not math.isfinite(v) or not 0.5 <= v <= 1.5 for v in weights.values()):
            raise ValueError("Chaque préférence est un multiplicateur entre 0,5 et 1,5")
    return weights
```

`draft.py` : importer `RankBucket` ; ajouter après `MLExplanation` :
```python
class ScoreTerm(BaseModel):
    """Contribution d'un facteur, en points de win rate, avec son incertitude."""
    name: str
    value: float
    sd: float
    source: str = "heuristic"     # "observed" | "heuristic" | "model"
    sample: int = 0
    note: str = ""
```
Dans `ScoreBreakdown` : docstring `"""Contributions signées (points de WR) par facteur ; draft_risk = adversaire futur."""`, ajouter `terms: List[ScoreTerm] = Field(default_factory=list)`.
Dans `Recommendation` : `total_score: float` commenté `# avantage en points de WR par rapport à la moyenne du pool (signé)` ; ajouter `score_sd: float = 0.0` et `tie_with_leader: bool = False` après `score_range`.
Dans `DraftRequest` : ajouter `rank_bucket: RankBucket = None` après `region`.
Dans `DraftResponse` : ajouter `reference_mean: float = 0.0`, `top_group_ids: List[int] = Field(default_factory=list)`, `rank_bucket: Optional[str] = None`.

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/test_validation_and_auth.py tests/unit/scoring -q`
Expected: tout passe.

- [ ] **Step 5 : Commit**

```bash
git add server/app/models server/tests/unit/test_validation_and_auth.py
git commit -m "API : termes de score, incertitude, rang et préférences multiplicatives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11 : Réécriture du moteur

**Files:**
- Modify: `server/app/services/draft_engine.py` (tout le scoring), `server/app/services/reasons.py:426-540`, `server/app/data/champion_overrides.json` (retirer les clés `blind_pick_penalty` s'il y en a ; le `grep` initial en trouve 0)
- Test: `server/tests/unit/test_engine_and_api.py`, `server/tests/unit/test_review_fixes.py`

**Interfaces:**
- Consumes: tous les termes des Tasks 3 à 9, `apply_preferences`, `reference_mean`, `top_group`, `confidence_from_sd`, `lolalytics_tier`.
- Produces: `DraftEngine.recommend(request, personal_svc=None, candidate_ids=None) -> DraftResponse` inchangé en signature ; `generate_verdict(cand, draft, db, matchup, synergy, composition, future, tags=None, is_pool=True)`.

- [ ] **Step 1 : Réécrire les tests du moteur**

Dans `server/tests/unit/test_engine_and_api.py`, remplacer `test_recommendation_preserves_input_and_disables_unavailable_wpa` par :
```python
@pytest.mark.asyncio
async def test_recommendation_preserves_input_and_disables_unavailable_wpa(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    body = DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": 59}, {"champion_id": 222}]},
        champion_pool={"top": [{"champion_id": 78, "tier": "A"}, {"champion_id": 75, "tier": "A"}]}, enable_wildcard=False)
    before = body.model_dump()
    result = await engine.recommend(body)
    assert body.model_dump() == before
    assert len(result.recommendations) == 2
    assert all(r.is_pool_champion for r in result.recommendations)
    assert all(r.wpa is None for r in result.recommendations)
    assert result.win_probability is None
    assert any(r.mechanics for r in result.recommendations)


@pytest.mark.asyncio
async def test_advantages_are_relative_to_pool_mean_with_uncertainty(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    body = DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": 59, "role": "jungle"}]},
        champion_pool={"top": [{"champion_id": 78, "tier": "S"}, {"champion_id": 75, "tier": "B"}, {"champion_id": 54, "tier": "D"}]},
        enable_wildcard=True)
    result = await engine.recommend(body)
    pool = [r for r in result.recommendations if r.is_pool_champion]
    assert abs(sum(r.total_score for r in pool)) < 0.02  # arrondis à deux décimales
    assert result.recommendations == sorted(result.recommendations, key=lambda r: r.total_score, reverse=True)
    for r in result.recommendations:
        assert r.score_sd > 0
        assert r.score_range == [round(r.total_score - r.score_sd, 2), round(r.total_score + r.score_sd, 2)]
        assert r.breakdown.terms and {t.name for t in r.breakdown.terms} >= {"meta", "mastery", "mechanics"}
        assert 8 <= r.confidence <= 95
    assert result.recommendations[0].tie_with_leader
    assert result.top_group_ids[0] == result.recommendations[0].champion_id
    assert result.rank_bucket is None and result.data_status["rank"] == catalog.fetcher.TIER


@pytest.mark.asyncio
async def test_future_opponent_term_only_when_lane_opponent_unknown(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    blind = await engine.recommend(DraftRequest(draft_state={"my_role": "top"},
        champion_pool={"top": [{"champion_id": 78}, {"champion_id": 75}]}, enable_wildcard=False))
    assert all(r.breakdown.terms and any(t.name == "future_opponent" for t in r.breakdown.terms) for r in blind.recommendations)
    known = await engine.recommend(DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": 24, "role": "top"}]},
        champion_pool={"top": [{"champion_id": 78}, {"champion_id": 75}]}, enable_wildcard=False))
    assert all(r.breakdown.draft_risk == 0 and all(t.name != "future_opponent" for t in r.breakdown.terms) for r in known.recommendations)


@pytest.mark.asyncio
async def test_preferences_scale_terms_and_rank_reaches_the_source(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    seen = []
    async def fetch(role="mid", patch="current", tier=None):
        seen.append(tier); return {}
    catalog.fetcher.fetch_tierlist = fetch
    body = DraftRequest(draft_state={"my_role": "top"}, champion_pool={"top": [{"champion_id": 78, "tier": "S"}, {"champion_id": 75, "tier": "D"}]},
        enable_wildcard=False, weight_overrides={"mastery": 1.5}, rank_bucket="GOLD")
    result = await engine.recommend(body)
    assert "gold" in seen and result.rank_bucket == "gold" and result.data_status["rank"] == "gold"
    mastery = {r.champion_id: r.breakdown.mastery for r in result.recommendations}
    plain = await engine.recommend(DraftRequest(draft_state={"my_role": "top"},
        champion_pool={"top": [{"champion_id": 78, "tier": "S"}, {"champion_id": 75, "tier": "D"}]}, enable_wildcard=False, rank_bucket="gold"))
    plain_mastery = {r.champion_id: r.breakdown.mastery for r in plain.recommendations}
    assert mastery[75] == pytest.approx(plain_mastery[75] * 1.5)
```
Dans le même fichier, `test_wpa_compares_eligible_choices_in_the_same_context` (ligne ~85-98) : remplacer `assert results[78].breakdown.wpa_adjustment == 4` par `assert results[78].breakdown.wpa_adjustment == pytest.approx(2.0)` (le ×2 disparaît : A à 56 %, B à 52 % → +2 / −2) et adapter la seconde assertion symétrique s'il y en a une (`-2.0`). Lire le test avant modification pour conserver ses fixtures.

Dans `test_review_fixes.py::test_wildcards_are_scored_with_the_same_engine_path` : inchangé.

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/test_engine_and_api.py -q`
Expected: erreurs d'import (`config.weights` inexistant) ou échecs.

- [ ] **Step 3 : Réécrire `reasons.generate_verdict`**

Nouvelle signature et seuils (le corps de lecture du contexte et du meilleur allié est conservé tel quel) :
```python
def generate_verdict(cand: Champion, draft: DraftState, db, matchup: float, synergy: float, composition: float,
                     future: float, tags: Optional[List[str]] = None, is_pool: bool = True) -> str:
    """matchup, synergy, composition, future : contributions en points de WR (0 si le terme est absent)."""
```
Table de conversion à appliquer dans le corps existant :
| Ancien | Nouveau |
|---|---|
| `match_s >= 60` | `matchup >= 2.0` |
| `match_s >= 62` | `matchup >= 2.5` |
| `match_s >= 65` | `matchup >= 3.0` |
| `match_s >= 58` | `matchup >= 1.5` |
| `match_s < 42` | `matchup <= -1.5` |
| `risk_s >= 72` | `future >= 0.0` |
| `risk_s < 40` | `future <= -2.0` |
| `syn_s >= 64` | `synergy >= 1.5` |
| `syn_s >= 62` | `synergy >= 1.25` |
| `comp_s >= 72` | `composition >= 1.5` |

Le libellé `"Safe blind — peu counter-prone, flex."` devient `"Safe blind — peu exposé aux counters."`.

- [ ] **Step 4 : Réécrire le scoring du moteur**

Dans `draft_engine.py` :

1. Docstring de module :
```python
"""Draft engine — orchestre les termes du scoring en points de win rate.

Chaque candidat reçoit une liste de termes (méta, matchup, adversaire futur,
maîtrise, composition, archétype, synergie, mécaniques, modèle), chacun en
points de WR avec un écart-type. Le total est la somme ; l'avantage affiché est
le total moins la moyenne des totaux du pool. Voir docs/superpowers/specs/2026-09-10-scoring-wr-points-design.md.
"""
```
2. Imports : supprimer `json`, `Path`, `ScoreBreakdown` reste ; ajouter :
```python
import math
from datetime import datetime, timezone
from app.models.draft import ScoreTerm
from app.scoring.aggregate import apply_preferences, confidence_from_sd, reference_mean, top_group
from app.scoring.composition_term import archetype_term, composition_term
from app.scoring.heuristic_terms import mechanics_term, model_term, synergy_term
from app.scoring.mastery_term import MasteryInputs, mastery_term
from app.scoring.matchup_term import matchup_term
from app.scoring.meta_term import meta_term
from app.scoring.opponent_model import future_opponent_term
from app.scoring.rank import lolalytics_tier
from app.scoring.types import Estimate, Term
```
3. Supprimer : `TIER_TO_MASTERY`, `HIGH_RISK_BLIND`, `HIGH_RISK_BLIND_PENALTY`, `_OVERRIDES_PATH`, `_load_overrides_lower`, `_clamp` si plus utilisé, `_get_blind_penalty_override`, `_draft_risk`, `_compute_confidence`, le bloc « Merge weight overrides » + normalisation des poids, le bloc « DuoQ synergy boost » qui modifie `weights` (conserver uniquement l'injection du champion partenaire), le bloc « Post-scoring normalization », et tout `_score_candidate`.
4. Dans `_recommend`, après la détection d'archétype et la collecte des candidats, remplacer les étapes 3 à 6 par :
```python
        rank = request.rank_bucket
        tier = lolalytics_tier(rank, self.fetcher.TIER)
        await self.meta.load_tierlist(role, tier)
        prefs = request.weight_overrides
        personal = (personal_svc, request.puuid, request.region or "EUW1") if (personal_svc and request.puuid) else None

        candidate_slots = asyncio.Semaphore(6)
        async def score_entry(entry, is_pool=True):
            champ = self.db.get_by_id(entry.champion_id)
            if not champ:
                return None
            async with candidate_slots:
                return await self._score_candidate(
                    champ, entry, draft, role, prefs, rank, personal,
                    enemy_archetype=enemy_archetype, is_pool=is_pool, ml=ml, duo_partner_role=duo_partner_role if duo_active else None,
                )
        scored = [r for r in await asyncio.gather(*(score_entry(e, e.champion_id in actual_pool_ids) for e in candidates)) if r]

        # Référence provisoire (avant le terme modèle) pour filtrer les wildcards.
        provisional_reference = reference_mean([r.total_score for r in scored if r.is_pool_champion])
        wildcards = await self._wild_card_suggestions(
            draft, role, unavailable, pool_entries, score_entry, provisional_reference,
        ) if request.enable_wildcard and not candidate_ids else []
        scored.extend(wildcards)

        # Terme modèle : WPA conditionnel, même référence pour toutes les alternatives évaluées.
        eligible = [r for r in scored if r.breakdown.ml_explanation and r.breakdown.ml_explanation.confidence != "low"]
        if ml is not None and len(eligible) == len(scored) and len(eligible) >= 2:
            baseline = sum(r.breakdown.ml_explanation.win_probability for r in eligible) / len(eligible)
            for rec in eligible:
                delta = (rec.breakdown.ml_explanation.win_probability - baseline) * 100
                term = model_term(delta)
                rec.breakdown.terms.append(ScoreTerm(**term.__dict__))
                rec.breakdown.wpa_adjustment = round(term.value, 2)
                rec.total_score = rec.total_score + term.value
                rec.score_sd = math.sqrt(rec.score_sd ** 2 + term.sd ** 2)
                rec.wpa = {"source": "DALIA", "kind": "model_estimate", "delta_pp": round(delta, 2),
                           "baseline_probability": round(baseline * 100, 2),
                           "baseline_champion_ids": [r.champion_id for r in eligible],
                           "model": {k: ml.metadata.get(k) for k in ("schema_version", "patches", "trained_at", "test_metrics", "test_unique_matches", "code_revision")},
                           "definition": "Écart à la moyenne des choix évalués dans cette draft, même rôle et même côté.",
                           "limitation": "Estimation du modèle, sans preuve causale ; ne provient pas de Coachless."}

        # Avantage relatif au pool, intervalle, confiance, groupe de tête.
        reference = reference_mean([r.total_score for r in scored if r.is_pool_champion])
        for rec in scored:
            rec.total_score = round(rec.total_score - reference, 2)
            rec.score_sd = round(rec.score_sd, 2)
            rec.score_range = [round(rec.total_score - rec.score_sd, 2), round(rec.total_score + rec.score_sd, 2)]
            rec.confidence = confidence_from_sd(rec.score_sd)
        scored.sort(key=lambda r: r.total_score, reverse=True)
        group = top_group([(r.total_score, r.score_sd) for r in scored])
        for i in group:
            scored[i].tie_with_leader = True
        top_group_ids = [scored[i].champion_id for i in group]
```
Puis conserver les étapes « Team composition summary », « Win probability », bans et impact des bans. Dans le `DraftResponse(...)` final ajouter `reference_mean=round(reference, 2), top_group_ids=top_group_ids, rank_bucket=rank,` et dans `data_status` : `"rank": tier`, `"rank_requested": rank`, `"rank_fallback": tier in self.meta.rank_fallback or tier in self.matchup.rank_fallback`, `"meta_available": self.meta.is_loaded(role, tier)`.

5. Nouveau `_score_candidate` :
```python
    async def _score_candidate(self, champ: Champion, entry: PoolEntry, draft: DraftState, role: str, prefs, rank,
                               personal, enemy_archetype: Optional[ArchetypeResult] = None, is_pool: bool = True,
                               ml=None, duo_partner_role: Optional[str] = None) -> Recommendation:
        tier = lolalytics_tier(rank, self.fetcher.TIER)
        has_enemies = any(e.champion_id for e in draft.enemy_picks)
        allies = [c for a in draft.ally_picks if a.champion_id and (c := self.db.get_by_id(a.champion_id))]
        terms: List[Term] = [meta_term(self.meta.stats(champ.id, role, tier))]

        mu = await matchup_term(self.matchup, champ.id, role, draft, tier)
        if mu:
            terms.append(mu)
        future = await future_opponent_term(self.matchup, self.meta, self.db, champ, role, draft, rank)
        if future:
            terms.append(future)
        terms.append(mastery_term(self._mastery_inputs(champ, entry, role, rank, personal)))
        comp = composition_term(champ, allies, self.mechanics, self.composition)
        if comp:
            terms.append(comp)
        arch = archetype_term(champ, enemy_archetype) if has_enemies else None
        if arch:
            terms.append(arch)
        if allies:
            duo_bonus = bool(duo_partner_role) and any(a.role == duo_partner_role and a.champion_id for a in draft.ally_picks)
            terms.append(synergy_term(await self.synergy.score(champ.id, role, draft), duo_bonus))
        mechanics_delta, mechanics = self.mechanics.evaluate(champ, draft)
        terms.append(mechanics_term(mechanics_delta))

        ml_s, ml_expl = None, None
        if ml is not None and ml.supports(champ.id, role, draft):
            try:
                ml_s, ml_expl_raw = ml.score_with_explanation(champ.id, role, draft)
                ml_expl = MLExplanation(**ml_expl_raw)
            except Exception:
                logger.exception("Prediction unavailable; retaining kit analysis")

        est = Estimate(apply_preferences(terms, prefs))
        by_name = {t.name: t for t in est.terms}
        val = lambda name: round(by_name[name].value, 2) if name in by_name else 0.0
        breakdown = ScoreBreakdown(
            meta=val("meta"), matchup=val("matchup"), synergy=val("synergy"), composition=val("composition"),
            mastery=val("mastery"), draft_risk=val("future_opponent"), mechanics=val("mechanics"),
            ml_prediction=round(ml_s, 1) if ml_s is not None else None, ml_explanation=ml_expl,
            terms=[ScoreTerm(**t.__dict__) for t in est.terms],
        )

        mu_details_raw = await self.matchup.details(champ.id, role, draft, tier) if has_enemies else []
        syn_details_raw = await self.synergy.details(champ.id, role, draft) if allies else []
        matchup_details = [MatchupDetail(opponent_name=d["opponent_name"], opponent_role=d["opponent_role"],
                                         win_rate=d["win_rate"] if d.get("games", 0) > 0 else None, delta=d["delta"],
                                         is_lane_opponent=d["is_lane_opponent"], games=d.get("games", 0),
                                         source="Lolalytics" if d.get("games", 0) > 0 else "heuristic",
                                         lane_probability=d.get("lane_probability", 0)) for d in mu_details_raw]
        synergy_details = [SynergyDetail(ally_name=d["ally_name"], ally_role=d["ally_role"], delta=d["delta"]) for d in syn_details_raw]
        comp_warnings = self.composition.warnings(champ, draft)
        tags = self._assign_tags(champ, draft, by_name)

        comp_summary_allies = self.composition.team_summary_from_list(allies, draft) if allies else None
        reasons = generate_reasons(cand=champ, role=role, draft=draft, db=self.db, matchup_details=mu_details_raw,
                                   synergy_details=syn_details_raw, comp_summary=comp_summary_allies, max_reasons=3)
        if mechanics:
            strongest = max(mechanics, key=lambda r: abs(r["score_delta"]))
            edge_reason = {"text": strongest["text"], "kind": strongest["kind"], "champions": strongest["champions"]}
            reasons = ([edge_reason] + [r for r in reasons if r["text"] != edge_reason["text"]])[:3]
        verdict = generate_verdict(cand=champ, draft=draft, db=self.db, matchup=val("matchup"), synergy=val("synergy"),
                                   composition=val("composition"), future=val("future_opponent"), tags=tags, is_pool=is_pool)
        stats = self.meta.stats(champ.id, role, tier)
        return Recommendation(
            champion_id=champ.id, champion_key=champ.key, champion_name=champ.name,
            total_score=est.total, score_sd=est.sd, breakdown=breakdown,
            matchup_details=matchup_details, synergy_details=synergy_details, composition_warnings=comp_warnings,
            is_pool_champion=is_pool, tags=tags, confidence=confidence_from_sd(est.sd),
            meta_games=stats.games if stats else 0, meta_window=stats.patch if stats else None,
            verdict=verdict, reasons=reasons, mechanics=mechanics,
        )

    def _mastery_inputs(self, champ: Champion, entry: PoolEntry, role: str, rank, personal) -> MasteryInputs:
        inputs = MasteryInputs(tier=entry.tier, difficulty=champ.difficulty, rank=rank, now=datetime.now(timezone.utc))
        if personal:
            svc, puuid, region = personal
            stats = svc.get_champion_personal(puuid, champ.id, role, region)
            if stats:
                inputs.personal_games, inputs.personal_wr = stats["games"], stats["win_rate"]
            mastery = svc.get_mastery_entry(puuid, champ.id, region)
            if mastery:
                inputs.mastery_points = int(mastery.get("points", 0))
                if mastery.get("last_played"):
                    inputs.last_played = datetime.fromtimestamp(float(mastery["last_played"]), tz=timezone.utc)
        return inputs
```
Note : `total_score` et `score_sd` portent ici le total **absolu** ; `_recommend` les convertit en avantage.

6. `_wild_card_suggestions(self, draft, role, unavailable, pool_entries, score_entry, reference: float)` : remplacer les deux tests de seuil :
   - `if rec.total_score - reference >= config.scoring.wildcard_min_advantage and len(wildcards) < config.wildcard_max_suggestions:`
   - `if not wildcards and best_wildcard is not None and best_wildcard.total_score - reference >= 0:`

7. Nouveau `_assign_tags` :
```python
    def _assign_tags(self, champ: Champion, draft: DraftState, terms: Dict[str, Term]) -> List[str]:
        tags: List[str] = []
        games = self.meta.games(champ.id, draft.my_role)
        if 0 < games < config.min_games_reliable:
            tags.append("low-data")
        matchup = terms.get("matchup")
        future = terms.get("future_opponent")
        if future is not None and future.value >= -0.5 and future.sd <= 2.0:
            tags.append("safe-blind")
        if future is not None and future.value <= -2.0:
            tags.append("risky-blind")
        if matchup is not None and matchup.value >= 2.0 and draft.my_lane_opponent_revealed:
            tags.append("counter-pick")
        if len(champ.roles) >= 2 and not draft.is_last_pick:
            tags.append("flex")
        if draft.is_last_pick and matchup is not None and matchup.value >= 1.5:
            tags.append("last-pick-counter")
        meta = terms.get("meta")
        if meta is not None and meta.value >= 1.5:
            tags.append("meta-forte")
        mastery = terms.get("mastery")
        if mastery is not None and mastery.value >= 0.5:
            tags.append("comfort")
        return tags
```
8. `_compute_ban_impact` et `_compute_ban_suggestions` : inchangés (ils utilisent `self.meta.score` et `self.matchup.get_top_counters`, conservés). Vérifier que `_compute_ban_impact` ne lit plus `rec.breakdown.matchup >= 55` ou similaire ; s'il compare un sous-score 0-100, remplacer le seuil par `>= 1.5` sur la valeur en points.
9. Supprimer `from app.services.role_inference import MONO_ROLE_THRESHOLD` si inutilisé, et tout import devenu mort.

- [ ] **Step 5 : Lancer toute la suite serveur**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: tout passe. Si `test_caches.py` ou `test_review_fixes.py` référencent `engine.matchup._get_matchup_data`, `weights`, `_draft_risk`, adapter aux noms publics de la Task 4.

- [ ] **Step 6 : Commit**

```bash
git add server/app server/tests
git commit -m "Moteur : somme de termes en points de WR, avantage relatif, groupe de tête

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12 : Routes, profil, migration 004, historique

**Files:**
- Create: `server/alembic/versions/004_rank_and_score_unit.py`
- Modify: `server/app/db/models.py:55-60,142-150`, `server/app/auth/schemas.py`, `server/app/api/auth_routes.py:104-121`, `server/app/api/user_routes.py:55-97`, `server/app/api/routes.py:209-232,258-285`, `server/app/api/history_routes.py`
- Test: `server/tests/unit/test_engine_and_api.py` (routes), `server/tests/integration/` (migration — ajouter un test si la base de test est disponible)

**Interfaces:**
- Produces: `UserDB.rank_tier: Optional[str]` ; `DraftHistoryDB.score_unit: Optional[str]` ; `UpdateMeRequest.rank_tier`, `UserResponse.rank_tier`, `ProfileResponse.rank_tier` ; `HistoryEntryIn.score_unit: Optional[Literal["wr_points"]]`, `recommendation_score` borné `[-50, 50]` ; `GET /api/history` et `/api/history/{id}` exposent `score_unit`.

- [ ] **Step 1 : Écrire les tests**

Ajouter à `test_engine_and_api.py` :
```python
def test_compare_reports_terms_and_tie(client):
    response = client.post('/api/draft/compare', json={"draft_state": {"my_role": "top", "enemy_picks": [{"champion_id": 59}]}, "champion_ids": [78, 75], "rank_bucket": "SILVER"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert "combined_sd" in data and isinstance(data["tied"], bool)
    assert {d["dimension"] for d in data["dimensions"]} >= {"meta", "mastery", "mechanics"}
    assert data["data_status"]["rank"] == "silver"


@pytest.mark.asyncio
async def test_profile_rank_is_used_when_request_has_none(catalog):
    from app.api.routes import _apply_account_context
    from types import SimpleNamespace
    body = DraftRequest(draft_state={"my_role": "top"}, champion_pool={"top": [{"champion_id": 78}]})
    user = SimpleNamespace(rank_tier="DIAMOND", id=None)
    await _apply_account_context(body, user, None)
    assert body.rank_bucket == "diamond"
    explicit = DraftRequest(draft_state={"my_role": "top"}, champion_pool={"top": [{"champion_id": 78}]}, rank_bucket="gold")
    await _apply_account_context(explicit, user, None)
    assert explicit.rank_bucket == "gold"
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit/test_engine_and_api.py -q -k "compare or profile_rank"`
Expected: 2 failed.

- [ ] **Step 3 : Implémenter**

`db/models.py` : dans `UserDB`, après `enable_off_meta`, ajouter `rank_tier = Column(String(20), nullable=True)`. Dans `DraftHistoryDB`, après `win_probability`, ajouter `score_unit = Column(String(20), nullable=True)  # "wr_points" ; NULL = ancien barème 0-100`.

`server/alembic/versions/004_rank_and_score_unit.py` :
```python
"""Rang du joueur, unité de score de l'historique, préférences en multiplicateurs."""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("rank_tier", sa.String(20), nullable=True))
    op.add_column("draft_history", sa.Column("score_unit", sa.String(20), nullable=True))
    # Anciens poids 0..1 → multiplicateurs 0.5..1.5, une seule fois.
    op.execute("""
        UPDATE users SET weight_overrides = (
            SELECT jsonb_object_agg(key, 0.5 + LEAST(GREATEST((value)::float, 0), 1))
            FROM jsonb_each_text(weight_overrides)
        )
        WHERE weight_overrides IS NOT NULL AND jsonb_typeof(weight_overrides) = 'object'
          AND (SELECT count(*) FROM jsonb_each_text(weight_overrides)) > 0
    """)


def downgrade():
    op.execute("""
        UPDATE users SET weight_overrides = (
            SELECT jsonb_object_agg(key, LEAST(GREATEST((value)::float - 0.5, 0), 1))
            FROM jsonb_each_text(weight_overrides)
        )
        WHERE weight_overrides IS NOT NULL AND jsonb_typeof(weight_overrides) = 'object'
          AND (SELECT count(*) FROM jsonb_each_text(weight_overrides)) > 0
    """)
    op.drop_column("draft_history", "score_unit")
    op.drop_column("users", "rank_tier")
```

`auth/schemas.py` : importer `RankBucket` depuis `app.models.validation` ; `UserResponse` gagne `rank_tier: str | None = None` ; `UpdateMeRequest` gagne `rank_tier: RankBucket = None`.

`auth_routes.py::update_me` : ajouter `if "rank_tier" in body.model_fields_set: current_user.rank_tier = body.rank_tier`.

`user_routes.py` : `ProfileResponse.rank_tier: str | None = None` ; dans `get_profile`, `rank_tier=current_user.rank_tier`.

`routes.py::_apply_account_context` : première ligne du corps :
```python
    if current_user is not None and body.rank_bucket is None and getattr(current_user, "rank_tier", None):
        body.rank_bucket = normalize_rank_bucket(current_user.rank_tier)
```
avec `from app.models.validation import normalize_rank_bucket` et, juste après, garde : si la valeur normalisée n'est pas dans `RANK_BUCKETS`, remettre `None`. Les deux tests passent `db=None` : `_get_user_pool` n'est appelé que si le pool est vide ; les deux requêtes fournissent un pool.

`routes.py::compare_champions` : remplacer la construction de la réponse :
```python
    left, right = (indexed[cid] for cid in body.champion_ids)
    names = {t.name for t in left.breakdown.terms} | {t.name for t in right.breakdown.terms}
    def term_value(rec, name):
        return next((t.value for t in rec.breakdown.terms if t.name == name), 0.0)
    order = ["meta", "matchup", "future_opponent", "mastery", "composition", "archetype", "synergy", "mechanics", "model"]
    deltas = [{"dimension": name, "left": round(term_value(left, name), 2), "right": round(term_value(right, name), 2),
               "delta": round(term_value(left, name) - term_value(right, name), 2)} for name in order if name in names]
    combined_sd = round(math.sqrt(left.score_sd ** 2 + right.score_sd ** 2), 2)
    score_delta = round(left.total_score - right.total_score, 2)
    delta_pp = None
    if left.wpa and right.wpa:
        delta_pp = round((left.breakdown.ml_explanation.win_probability - right.breakdown.ml_explanation.win_probability) * 100, 2)
    return {"left": left, "right": right, "score_delta": score_delta, "combined_sd": combined_sd,
            "tied": abs(score_delta) < combined_sd, "dimensions": deltas, "wpa_delta_pp": delta_pp,
            "data_status": result.data_status,
            "explanation": "Même draft, mêmes préférences. Chaque ligne est une contribution en points de win rate ; l'écart final est comparé à l'incertitude combinée."}
```
(`import math` en tête du module.)

`history_routes.py` : `HistoryEntryIn.recommendation_score: Optional[float] = Field(default=None, ge=-50, le=50)` ; ajouter `score_unit: Optional[Literal["wr_points"]] = None` (importer `Literal`). `HistoryEntrySummary` et `HistoryEntryOut` gagnent `score_unit: Optional[str] = None`. Dans `get_history_stats`, remplacer `if e.recommendation_score:` par `if e.recommendation_score is not None and e.score_unit == "wr_points":`.

- [ ] **Step 4 : Lancer les tests**

Run: `cd server && .venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: tout passe. Si `TEST_DATABASE_URL` est configurée (voir README), lancer aussi `alembic upgrade head` sur la base de test puis `pytest tests/integration -q`.

- [ ] **Step 5 : Commit**

```bash
git add server/alembic/versions/004_rank_and_score_unit.py server/app server/tests
git commit -m "Rang du joueur, unité de score en historique et comparaison par termes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13 : Rang via League, payload client et préférences

**Files:**
- Modify: `client/src-tauri/src/lcu.rs:50-60,767-810`, `client/src/services/lcu.js:84-100`, `client/src/services/api.js:89-118`, `client/src/stores/lcuStore.js:50-58`, `client/src/stores/userStore.js:22,35,91,98`, `client/src/stores/draftStore.js:83-97`, `client/src/components/DraftWorkshop.jsx:52-58`, `client/src/components/Settings/DraftPreferences.jsx`
- Test: `client/src/stores/regressions.test.js`, tests Rust dans `lcu.rs`

**Interfaces:**
- Produces: `SummonerInfo.rank_tier: String` ; `parse_rank_tier(&Value) -> String` ; `lcuStore.summoner.rankTier` ; `userStore.rankTier` ; `fetchRecommendations(..., options.rankBucket)` envoie `rank_bucket` ; `DraftPreferences` avec curseurs ×0,5–×1,5 et sélecteur de rang.

- [ ] **Step 1 : Tests**

Rust, dans `mod tests` de `lcu.rs` :
```rust
    #[test]
    fn rank_tier_reads_solo_queue_and_tolerates_unranked() {
        let stats = serde_json::json!({"queueMap": {"RANKED_SOLO_5x5": {"tier": "EMERALD", "division": "II"}}});
        assert_eq!(parse_rank_tier(&stats), "EMERALD");
        let unranked = serde_json::json!({"queueMap": {"RANKED_SOLO_5x5": {"tier": "", "division": "NA"}}});
        assert_eq!(parse_rank_tier(&unranked), "");
        assert_eq!(parse_rank_tier(&serde_json::json!({})), "");
    }
```
Vitest, ajouter à `regressions.test.js` :
```js
it('sends the League rank, then the profile rank, as rank_bucket', async () => {
  useUserStore.setState({ championPool: { mid: [{ champion_id: 103, tier: 'A' }] }, rankTier: 'gold' });
  api.fetchRecommendations.mockResolvedValue({ recommendations: [] });
  await useDraftStore.getState().getRecommendations();
  expect(api.fetchRecommendations.mock.calls[0][5].rankBucket).toBe('gold');
  useLCUStore.setState({ connected: true, summoner: { puuid: 'p', region: 'EUW', rankTier: 'DIAMOND' } });
  await useDraftStore.getState().getRecommendations();
  expect(api.fetchRecommendations.mock.calls[1][5].rankBucket).toBe('DIAMOND');
});

it('stores the profile rank and multiplier preferences', async () => {
  api.fetchProfile.mockResolvedValue({ username: 'u', champion_pool: {}, preferred_roles: ['mid'], enable_wildcard: true, enable_off_meta: true, weight_overrides: { meta: 1.2 }, rank_tier: 'silver' });
  await useUserStore.getState().loadProfile('u');
  expect(useUserStore.getState().rankTier).toBe('silver');
  expect(useUserStore.getState().weightOverrides).toEqual({ meta: 1.2 });
});
```
Vérifier le nom réel de l'action de chargement du profil dans `userStore.js` (ligne ~30, `loadProfile` ou équivalent) et l'utiliser.

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd client && npm.cmd test -- --run` puis `cd client/src-tauri && cargo test --locked`
Expected: les nouveaux tests échouent.

- [ ] **Step 3 : Implémenter**

`lcu.rs` : `SummonerInfo` gagne `pub rank_tier: String,`. Ajouter avant `fetch_summoner_info` :
```rust
/// Tier ranked solo ("EMERALD", "GOLD", …) ou chaîne vide si non classé.
pub fn parse_rank_tier(stats: &serde_json::Value) -> String {
    stats["queueMap"]["RANKED_SOLO_5x5"]["tier"].as_str().unwrap_or("").trim().to_string()
}
```
Dans `fetch_summoner_info`, après le bloc `region_url` :
```rust
    let ranked_url = format!("{}/lol-ranked/v1/current-ranked-stats", base);
    if let Ok(resp) = client.get(&ranked_url).header("Authorization", format!("Basic {}", auth)).send().await {
        if let Ok(stats) = resp.json::<serde_json::Value>().await {
            info.rank_tier = parse_rank_tier(&stats);
        }
    }
```
`lcu.js` : ajouter `rank_tier: ''` à l'objet de repli de `lcuSummonerInfo`.
`lcuStore.js` : dans `set({ summoner: {...} })` ajouter `rankTier: data.rank_tier || ''`.
`userStore.js` : état initial `rankTier: null` ; au chargement du profil `rankTier: data.rank_tier || null` ; dans `updatePreferences`, `...(settings.rank_tier !== undefined ? { rankTier: settings.rank_tier } : {})` ; dans `resetPool`, `rankTier: null`.
`api.js::fetchRecommendations` : ajouter `...(options.rankBucket ? { rank_bucket: options.rankBucket } : {}),` dans le corps.
`draftStore.js::getRecommendations` : passer `rankBucket: summoner?.rankTier || user.rankTier || null` dans l'objet d'options (6e argument).
`DraftWorkshop.jsx` (comparaison) : ajouter `rank_bucket: summoner?.rankTier || user.rankTier || null` au corps envoyé à `compareChampions`.
Abonnement `useUserStore.subscribe` dans `draftStore.js` : ajouter `'rankTier'` à la liste des clés qui invalident les résultats.

`DraftPreferences.jsx` : remplacer entièrement par :
```jsx
import React, { useState } from 'react';
import useUserStore from '../../stores/userStore';
import '../../workshop.css';
const DEFAULTS = { meta: 1, matchup: 1, synergy: 1, composition: 1, mastery: 1, draft_risk: 1 };
const LABELS = { meta: 'Méta', matchup: 'Matchups', synergy: 'Synergies', composition: 'Composition', mastery: 'Maîtrise', draft_risk: 'Adversaire à venir' };
const RANKS = [['', 'Automatique (League) ou inconnu'], ['iron', 'Fer'], ['bronze', 'Bronze'], ['silver', 'Argent'], ['gold', 'Or'], ['platinum', 'Platine'], ['emerald', 'Émeraude'], ['diamond', 'Diamant'], ['master_plus', 'Maître et plus']];
export default function DraftPreferences() {
  const user = useUserStore();
  const [weights, setWeights] = useState({ ...DEFAULTS, ...user.weightOverrides });
  const [saving, setSaving] = useState(false);
  const save = async settings => { setSaving(true); await user.updatePreferences(settings); setSaving(false); };
  return <section className="workshop">
    <h3>Préférences de draft</h3>
    <label><span><input type="checkbox" checked={user.enableWildcard} disabled={saving || !user.profileAvailable} onChange={e => save({ enable_wildcard: e.target.checked })}/> Proposer des champions hors de mon pool</span></label>
    <label><span><input type="checkbox" checked={user.enableOffMeta} disabled={saving || !user.profileAvailable} onChange={e => save({ enable_off_meta: e.target.checked })}/> Autoriser mes choix dans un rôle inhabituel</span></label>
    <label>Mon rang<select aria-label="Mon rang" value={user.rankTier || ''} disabled={saving || !user.profileAvailable} onChange={e => save({ rank_tier: e.target.value || null })}>
      {RANKS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <p className="muted">Le rang détecté par League a priorité. Il choisit les statistiques de ton niveau et le poids du confort.</p>
    <details><summary>Importance des critères</summary><p>Chaque critère est une contribution en points de win rate ; ces multiplicateurs (×0,5 à ×1,5) l'amplifient ou l'atténuent.</p>
      {Object.entries(weights).map(([key, value]) => <label key={key}>{LABELS[key]} · ×{Number(value).toFixed(2)}
        <input aria-label={`Importance ${LABELS[key]}`} type="range" min="0.5" max="1.5" step="0.05" value={value} onChange={e => setWeights(w => ({ ...w, [key]: Number(e.target.value) }))}/>
      </label>)}
      <div className="controls"><button disabled={saving || !user.profileAvailable} onClick={() => save({ weight_overrides: weights })}>Enregistrer</button>
        <button disabled={saving || !user.profileAvailable} onClick={() => { setWeights(DEFAULTS); save({ weight_overrides: null }); }}>Valeurs par défaut</button></div>
    </details>
    {user.error && <p role="alert">{user.error}</p>}
  </section>;
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd client && npm.cmd test -- --run` ; `cd client/src-tauri && cargo test --locked`
Expected: tout passe.

- [ ] **Step 5 : Commit**

```bash
git add client/src-tauri/src/lcu.rs client/src
git commit -m "Client : rang League ou profil transmis à l'analyse, préférences multiplicatives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14 : Affichage des avantages signés, incertitude et égalités

**Files:**
- Modify: `client/src/lib/scores.js`, `client/src/data/mock.js:94-160`, `client/src/components/Recommendations/RecommendationPanel.jsx`, `client/src/components/HeroPanel.jsx:11-27,74-82,126-135`, `client/src/components/DraftPanel.jsx:526-537`, `client/src/components/DraftBoard/DraftBoard.jsx:47-56,118,256-262,329-330`, `client/src/components/DraftWorkshop.jsx:72-82`, `client/src/components/Insights/InsightsPage.jsx:114`, `client/src/lib/replay.js:34`
- Test: `client/src/stores/regressions.test.js`, `client/e2e/workflows.spec.js`

**Interfaces:**
- Produces: `formatAdvantage(value) -> string` (`"+3.1"`, `"−1.8"`, `"0.0"`), `formatSd(sd) -> string` (`"±1.4"`) dans `lib/scores.js` ; `mapRec` renvoie `{ score, sd, tie, terms, ... }` sans `tier`.

- [ ] **Step 1 : Tests**

Remplacer le test `never invents P(win), WPA or confidence intervals from scores` par :
```js
it('maps signed advantages, uncertainty and ties without inventing probabilities', () => {
  const rec = mapRec({ total_score: 2.34, score_sd: 1.2, tie_with_leader: true, champion_key: 'Ahri', breakdown: { meta: 1.1, terms: [{ name: 'meta', value: 1.1, sd: 0.8, source: 'observed', sample: 900, note: '' }] }, matchup_details: [{ win_rate: 58 }], tags: ['hors-pool', 'flex'] });
  expect(rec.score).toBe(2.3); expect(rec.sd).toBe(1.2); expect(rec.tie).toBe(true);
  expect(rec.terms[0]).toMatchObject({ name: 'meta', value: 1.1, source: 'observed' });
  expect(rec).not.toHaveProperty('tier'); expect(rec.winProb).toBeNull(); expect(rec.wpa).toBeNull();
  expect(rec.tags).toEqual(['flex']);
  expect(mapRec({ total_score: -0.4, breakdown: { ml_explanation: { win_probability: .531 } } }).winProb).toBeCloseTo(53.1);
});

it('formats advantages with sign and uncertainty', async () => {
  const { formatAdvantage, formatSd } = await import('../lib/scores');
  expect(formatAdvantage(3.14)).toBe('+3.1'); expect(formatAdvantage(-1.75)).toBe('−1.8'); expect(formatAdvantage(0.04)).toBe('0.0');
  expect(formatSd(1.44)).toBe('±1.4'); expect(formatSd(null)).toBe('');
});

it('saves history with the win-rate unit and a signed score', async () => {
  const { historyPayload } = await import('../lib/replay');
  useDraftStore.setState({ recommendations: [{ champion_key: 'Ahri', total_score: -1.2, breakdown: {} }], stale: false, myRole: 'mid', myTeam: 'blue', allyPicks: { mid: null }, enemyPicks: [], blueBans: [], redBans: [], timeline: [], sessionId: 's' });
  const payload = historyPayload(useDraftStore.getState());
  expect(payload.recommendation_score).toBe(-1.2); expect(payload.score_unit).toBe('wr_points');
});
```
Vérifier l'état minimal réellement attendu par `historyPayload` (il appelle `draft.exportSession()`, présent sur le store) ; ajuster l'état fixé pour que la fonction s'exécute.

E2E : dans `workflows.spec.js`, remplacer la fabrique `recommendation` par :
```js
const recommendation = (champion, score, sd = 1.2, tie = false) => ({ champion_id: champion.id, champion_key: champion.key, champion_name: champion.name,
  total_score: score, score_sd: sd, score_range: [score - sd, score + sd], tie_with_leader: tie, confidence: 60,
  breakdown: { meta: 1.1, matchup: 2.0, synergy: 0, composition: 0.5, mastery: -1.5, draft_risk: 0, mechanics: 0, wpa_adjustment: 0, ml_explanation: null,
    terms: [{ name: 'meta', value: 1.1, sd: 0.8, source: 'observed', sample: 900, note: '' }, { name: 'matchup', value: 2.0, sd: 1.0, source: 'observed', sample: 400, note: '' }, { name: 'mastery', value: -1.5, sd: 1.5, source: 'heuristic', sample: 0, note: 'palier B' }] },
  is_pool_champion: true, matchup_details: [], synergy_details: [], tags: [], reasons: [{ text: 'Exemple de recommandation simulée pour le test.', kind: 'info' }], mechanics: [], verdict: 'Choix à examiner', wpa: null });
```
Réponses simulées : `/api/draft/recommend` → `{ recommendations: [recommendation(champions[0], 2.1, 1.2, true), recommendation(champions[1], -2.1)], reference_mean: 0, top_group_ids: [103], rank_bucket: null, data_status: { patch: '16.17', rank: 'emerald_plus', meta_available: false, wpa_available: false } }` ; `/api/draft/compare` → `left = recommendation(champions[0], 2.1)`, `right = recommendation(champions[1], -2.1)`, `{ left, right, score_delta: 4.2, combined_sd: 1.7, tied: false, dimensions: [{ dimension: 'composition', left: 0.5, right: 0, delta: 0.5 }], wpa_delta_pp: null, explanation: 'Même contexte pour les deux choix.' }`. Assertion du titre de comparaison : `'Ahri est préféré de 4.2 points de win rate'`. Ajouter après le clic ANALYSER : `await expect(page.getByText('+2.1', { exact: false }).first()).toBeVisible();`.

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd client && npm.cmd test -- --run`
Expected: nouveaux tests en échec.

- [ ] **Step 3 : Implémenter**

`lib/scores.js` : ajouter (conserver l'existant) :
```js
export const formatAdvantage = (value) => {
  const v = Number(value) || 0;
  const rounded = Math.round(v * 10) / 10;
  if (Math.abs(rounded) < 0.05) return '0.0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
};
export const formatSd = (sd) => (sd == null || !Number.isFinite(Number(sd)) ? '' : `±${Number(sd).toFixed(1)}`);
export const advantageColor = (value) => (value >= 1 ? 'var(--win)' : value <= -1 ? 'var(--loss)' : 'var(--text-muted)');
```
`mock.js::mapRec` : supprimer le calcul de `tier` ; `score: Math.round((rec.total_score || 0) * 10) / 10`, `sd: rec.score_sd ?? null`, `tie: !!rec.tie_with_leader`, `terms: (bd.terms || []).map(t => ({ name: t.name, value: t.value, sd: t.sd, source: t.source, sample: t.sample || 0, note: t.note || '' }))`, breakdown avec des valeurs à une décimale (`Math.round((bd.meta || 0) * 10) / 10`, idem pour les autres). Dans `_emptyPlaceholder` : retirer `tier`, ajouter `sd: null, tie: false, terms: []`.

`RecommendationPanel.jsx` :
- Importer `formatAdvantage, formatSd, advantageColor` depuis `../../lib/scores`.
- Remplacer `Bar` par une barre centrée :
```jsx
function TermBar({ term, max = 4 }) {
  const pct = Math.min(100, Math.abs(term.value) / max * 100) / 2;
  const color = term.source === 'observed' ? 'var(--accent)' : term.source === 'model' ? '#4ac8e8' : 'var(--text-muted)';
  return (
    <div style={{ marginBottom: 7 }} title={term.note || ''}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{TERM_LABELS[term.name] || term.name}</span>
        <span style={{ fontFamily: 'var(--f-display)', fontSize: 11, fontWeight: 700, color: advantageColor(term.value) }}>{formatAdvantage(term.value)} <span style={{ opacity: .6, fontWeight: 400 }}>{formatSd(term.sd)}</span></span>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--border-subtle)' }}/>
        <div style={{ position: 'absolute', top: 0, height: '100%', width: `${pct}%`, background: color, ...(term.value >= 0 ? { left: '50%' } : { right: '50%' }) }}/>
      </div>
    </div>
  );
}
const TERM_LABELS = { meta: 'Méta', matchup: 'Matchup', future_opponent: 'Adversaire à venir', mastery: 'Maîtrise', composition: 'Compo', archetype: 'Archétype', synergy: 'Synergie', mechanics: 'Mécaniques', model: 'Modèle' };
```
- `TAG_META` : ajouter `'risky-blind': { label: 'BLIND RISQUÉ', color: 'var(--loss)', bg: 'var(--loss-bg)' }`, `'comfort': { label: 'CONFORT', color: '#9cd36b', bg: 'rgba(156,211,107,0.10)' }`.
- `tagAllowed` : `META_S_MIN_SCORE = 1.5` (points).
- Dans `RecommendationCard` : `matchupScore`/`synergyScore` deviennent `const matchup = rec.breakdown?.matchup ?? 0; const synergy = rec.breakdown?.synergy ?? 0;` et les libellés `MU {formatAdvantage(matchup)}` / `SYN {formatAdvantage(synergy)}` avec `advantageColor`. Le grand chiffre : `<div style={{ fontSize: 30, ... }}>{formatAdvantage(rec.total_score)}</div>` et dessous `{formatSd(rec.score_sd)}` ; sous le nom, si `rec.tie_with_leader && rank !== 1` afficher `<span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--warn)' }}>ÉQUIVALENT AU 1ER</span>`.
- Section « Breakdown » : `{(rec.breakdown?.terms || []).map(t => <TermBar key={t.name} term={t}/>)}`.
- `WildcardMini` : `formatAdvantage(rec.total_score)` et `MU {formatAdvantage(rec.breakdown?.matchup ?? 0)}`.
- Dans `RecommendationPanel`, au-dessus de la liste : `const tiedCount = poolRecs.filter(r => r.tie_with_leader).length;` et si `tiedCount > 1` afficher `<div style={{ padding: '8px 12px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', marginBottom: 10, fontFamily: 'var(--f-body)', fontSize: 11, color: 'var(--warn)' }}>{tiedCount} options équivalentes : joue ton confort.</div>`. Sous le titre RECOMMANDATIONS ajouter `<span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>points de win rate vs moyenne du pool</span>`.

`HeroPanel.jsx` : `ScoreBox` affiche `formatAdvantage(value)` et le libellé `'AVANTAGE'` ; ajouter une prop `sd` affichée en dessous avec `formatSd(sd)`. Remplacer la ligne `['TIER', <TierBadge .../>]` par `['INCERTITUDE', <b key="s" style={{ fontFamily:'var(--f-display)', fontSize:14 }}>{formatSd(pick.sd) || '—'}</b>]` ; retirer `TierBadge` de l'import s'il n'est plus utilisé ; à la ligne ~126 (`<TierBadge tier={pick.tier}/>` dans la liste) afficher à la place `{pick.tie && <span className="tier">=</span>}` ; à la ligne ~135 `{formatAdvantage(pick.score)}`.

`DraftPanel.jsx` (onglet breakdown) : remplacer la grille par `{(pick.terms || []).map(t => <TermBar key={t.name} term={t}/>)}` en important `TermBar` — pour éviter une dépendance croisée, déplacer `TermBar` et `TERM_LABELS` dans `client/src/components/Primitives.jsx` (export nommé) et l'importer dans les deux composants.

`DraftBoard.jsx` : ligne 47-56 (`tagAllowed`) seuil `1.5` ; ligne 118 `recommendation_score:topRec?.total_score ?? null, score_unit:'wr_points'` ; lignes 256-262 et 329-330 : `formatAdvantage(...)` et `formatSd(rec.score_sd)`.

`DraftWorkshop.jsx` (comparaison) : titre `{data.tied ? 'Choix équivalents : l’écart est sous l’incertitude' : `${data.score_delta > 0 ? data.left.champion_name : data.right.champion_name} est préféré de ${Math.abs(data.score_delta).toFixed(1)} points de win rate`}` ; `DIMENSIONS` gagne les clés `future_opponent: 'Adversaire à venir', archetype: 'Archétype', model: 'Modèle'` ; ligne « Score final » → `<tr><th>Avantage</th><td>{formatAdvantage(data.left.total_score)} {formatSd(data.left.score_sd)}</td><td>{formatAdvantage(data.right.total_score)} {formatSd(data.right.score_sd)}</td><td>{signed(data.score_delta)} (incertitude {formatSd(data.combined_sd)})</td></tr>`.

`InsightsPage.jsx` ligne 114 : `{entry.recommendation_score != null && <span>{entry.score_unit === 'wr_points' ? `AVANTAGE ${formatAdvantage(entry.recommendation_score)}` : `SCORE ${Math.round(entry.recommendation_score)} (ancien barème)`}</span>}`.

`replay.js::historyPayload` : `recommendation_score: best?.total_score ?? null, score_unit: best ? 'wr_points' : null`.

- [ ] **Step 4 : Lancer les tests et le build**

Run: `cd client && npm.cmd test -- --run && npm.cmd run build && npm.cmd run test:e2e`
Expected: Vitest vert, build OK, 3 parcours Playwright verts (utiliser `PLAYWRIGHT_CHANNEL=chrome` si Chromium n'est pas installé, voir README).

- [ ] **Step 5 : Commit**

```bash
git add client/src client/e2e
git commit -m "Interface : avantages signés en points de win rate, incertitude et égalités

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15 : Calibration et documentation

**Files:**
- Modify: `server/tests/calibration/run_calibration.py:155-235`, `server/tests/calibration/cases.json`, `docs/WPA_ET_MECANIQUES.md`, `README.md:7`, `server/tests/calibration/README.md`

**Interfaces:**
- Produces: types d'assertion `must_have_advantage_above {champion, min_advantage}` et `must_be_tied {champion_a, champion_b}` ; suppression de `must_have_score_above`.

- [ ] **Step 1 : Adapter l'évaluateur**

Dans `evaluate_assertion`, remplacer le bloc `must_have_score_above` par :
```python
    if t == "must_have_advantage_above":
        _, rec = find_rank(recs, a["champion"])
        if rec is None:
            return False, f"{a['champion']} not in recommendations"
        threshold = a["min_advantage"]
        if rec.total_score >= threshold:
            return True, f"{a['champion']} advantage={rec.total_score:+.2f} >= {threshold:+.2f}"
        return False, f"{a['champion']} advantage={rec.total_score:+.2f} < {threshold:+.2f}"

    if t == "must_be_tied":
        _, ra = find_rank(recs, a["champion_a"])
        _, rb = find_rank(recs, a["champion_b"])
        if ra is None or rb is None:
            return False, "one of the champions is not in recommendations"
        combined = (ra.score_sd ** 2 + rb.score_sd ** 2) ** 0.5
        gap = abs(ra.total_score - rb.total_score)
        if gap < combined:
            return True, f"gap {gap:.2f} < combined sd {combined:.2f}"
        return False, f"gap {gap:.2f} >= combined sd {combined:.2f}"
```
Dans `print_case_report` (mode verbose), afficher `f"{r.total_score:+.2f} ±{r.score_sd:.2f}"` à la place du score.

- [ ] **Step 2 : Réécrire `cases.json`**

Règles à appliquer à chacun des 30 cas (lire le fichier en entier avant) :
1. Toute assertion `must_have_score_above` devient `must_have_advantage_above` avec `min_advantage = (min_score − 60) / 10` (ex. 70 → +1.0, 55 → −0.5).
2. Les descriptions citant `HIGH_RISK_BLIND`, « blind penalty » ou « risk score » sont reformulées : « le terme adversaire futur doit pénaliser X face aux counters disponibles ».
3. Les cas `blind_pick` gardent `must_rank_higher_than` ; ajouter à chacun un `setup.rank_bucket: "emerald"` pour figer λ.
4. Ajouter deux cas `category: "ties"` :
```json
{"id": "tie_two_meta_mids", "category": "ties", "description": "Deux mids similaires sans info doivent être annoncés équivalents",
 "setup": {"my_team": "blue", "my_role": "mid", "my_pick_order": 1, "ally_picks": {}, "enemy_picks": {}, "bans": [],
           "champion_pool": {"mid": [{"champion": "Orianna", "tier": "A"}, {"champion": "Syndra", "tier": "A"}]}},
 "assertions": [{"type": "must_be_tied", "champion_a": "Orianna", "champion_b": "Syndra"}]},
{"id": "no_tie_hard_counter", "category": "ties", "description": "Un counter direct en last pick doit se détacher du groupe",
 "setup": {"my_team": "red", "my_role": "top", "my_pick_order": 5, "ally_picks": {"jungle": "Vi", "mid": "Ahri", "bot": "Jinx", "support": "Leona"},
           "enemy_picks": {"top": "Nasus", "jungle": "Jarvan IV", "mid": "Syndra", "bot": "Caitlyn", "support": "Lux"}, "bans": [],
           "champion_pool": {"top": [{"champion": "Vayne", "tier": "A"}, {"champion": "Malphite", "tier": "A"}]}},
 "assertions": [{"type": "must_rank_higher_than", "champion_a": "Vayne", "champion_b": "Malphite"}]}
```
5. `build_request` : lire `setup.get("rank_bucket")` et le passer à `DraftRequest(rank_bucket=...)`.

- [ ] **Step 3 : Exécuter la calibration**

Run: `cd server && .venv/Scripts/python.exe tests/calibration/run_calibration.py --verbose`
Expected: le script s'exécute jusqu'au bilan. Cette suite dépend de Lolalytics ; les échecs réseau sont rapportés tels quels dans le message de commit et ne bloquent pas la tâche. Tout cas qui échoue **sans** erreur réseau est listé dans `server/tests/calibration/README.md` sous « Cas à revoir après le passage en points de WR » avec la valeur observée.

- [ ] **Step 4 : Documentation**

`docs/WPA_ET_MECANIQUES.md` : ajouter en tête de « Ce que DALIA calcule » un paragraphe :

> Depuis septembre 2026, le score d'un champion est une somme de contributions en points de win rate (méta, matchup, adversaire à venir, maîtrise, composition, archétype, synergie, mécaniques, modèle), chacune assortie d'un écart-type. L'avantage affiché est ce total moins la moyenne des totaux du pool évalué ; deux champions dont l'écart est inférieur à la racine de la somme de leurs variances sont présentés comme équivalents. Le rang du joueur choisit les statistiques Lolalytics et pondère le confort. Les constantes sont dans `server/app/scoring/config.py` ; la conception complète est dans `docs/superpowers/specs/2026-09-10-scoring-wr-points-design.md`.

Remplacer la phrase « L'effet dans le score est limité à `2 × WPA`, borné à ±8 points. » par « Le terme modèle vaut le WPA borné à ±4 points, écart-type 2. » Remplacer « Le total de ces règles est borné à ±12 points » par « Le total de ces règles est borné à ±12 points internes, convertis en ±3,6 points de win rate ».

`README.md` ligne 7 : « Le score affiché est un avantage estimé en points de win rate par rapport à la moyenne de ton pool, avec son incertitude ; ce n'est pas une probabilité de victoire. »

- [ ] **Step 5 : Commit**

```bash
git add server/tests/calibration docs/WPA_ET_MECANIQUES.md README.md
git commit -m "Calibration et documentation du scoring en points de win rate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16 : Vérification finale

- [ ] **Step 1 : Suites complètes**

Run:
```
cd server && .venv/Scripts/python.exe -m pytest tests/unit -q
cd client && npm.cmd test -- --run && npm.cmd run build && npm.cmd run test:e2e
cd client/src-tauri && cargo test --locked
```
Expected: tout vert. Reporter les sorties exactes.

- [ ] **Step 2 : Recherche de résidus**

Run: `grep -rn "TIER_TO_MASTERY\|HIGH_RISK_BLIND\|wildcard_min_score\|role_weight_multipliers\|get_champion_score_boost\|_get_matchup_data\|composition.score(" server/app client/src`
Expected: aucune occurrence.

- [ ] **Step 3 : Mettre à jour `REPRISE_PROJET.md`**

Ajouter une section « Passage au scoring en points de win rate (septembre 2026) » de 5 à 8 lignes : ce qui change pour le joueur (chiffre signé, ±σ, équivalents, rang), ce qui a été supprimé, et le renvoi vers la spec. Commit : `git commit -m "Bilan : scoring en points de win rate"` avec l'attribution.
