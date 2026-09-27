# Synergie mesurée par paire — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer la synergie de kit additive par l'interaction de paire mesurée par Lolalytics (`ep=build-team`, colonne `d2`), rétrécie avec un k par type de paire et par palier.

**Architecture:** le fetcher lit la page `build-team` d'un candidat ; `SynergyAnalyzer` en tire une observation rétrécie par allié connu ; `observed_synergy_term` somme ces observations en un `Term` observé, et l'heuristique actuelle (sans ses blocs doublons de `composition`) ne sert plus qu'en repli. Les k viennent de `app/data/synergy_priors.json`, estimés par un script bayésien empirique.

**Tech Stack:** Python 3 / FastAPI / pydantic / pytest-asyncio côté serveur ; React + Vitest côté client.

**Spec:** `docs/superpowers/specs/2026-09-28-synergie-observee-design.md`

## Global Constraints

- Fenêtre des données de paire : `config.counter_patch` (« 30 » jours), comme le matchup.
- `k = 2500 / τ²` ; défauts en dur si le fichier de priors manque : `bot_support` 2251, `other` 11589 (Master+ du 27/09).
- Pas de plafond sur le terme observé ; incertitude en `abs_sd`, `outcome_sd = 0`.
- `synergy_duo_factor` (1,5) s'applique à la seule paire du partenaire duo.
- `synergy_observed_scale` : défaut 1,0.
- Seuil des raisons observées : `|delta| ≥ 1,0`.
- Libellés affichés en français ; décimales à virgule dans les raisons.
- Tests serveur : `python -m pytest tests/unit -q` depuis `server/`. Client : `npx vitest run --pool=threads` depuis `client/`.
- Fins de ligne LF (`.gitattributes`) ; écrire les fichiers accentués avec l'outil d'écriture, pas par heredoc.

## Review Focus

- Allié sans poste dans la draft (pré-pick, virtuel du duo) : le poste principal du champion est utilisé, pas de plantage.
- Page de duo vide pour un palier bas : on retombe sur le palier par défaut, comme le matchup.
- Gel de calibration sans les pages de duo : `FrozenCacheMiss` doit remonter (jamais avalé), pour forcer `--extend-frozen`.
- Ordre de `synergy_details` aligné sur les alliés remplis (le `zip` de `generate_reasons` en dépend), y compris pour un allié absent de la page.
- Ligne de page malformée (liste courte, `null`, NaN) : ignorée sans faire tomber le reste de la page.

---

### Task 1 : Outillage de mesure, cas de calibration et baselines de l'ancien moteur

Avant toute modification du moteur : les nouveaux cas et la référence de l'ancien moteur.

**Files:**
- Modify: `server/tests/calibration/frozen_cache.py` (fonction `extend`)
- Modify: `server/tests/calibration/run_calibration.py` (`--extend-frozen`)
- Modify: `server/tests/calibration/cases.json` (+5 cas, −`synergy_senna_tahmkench`)
- Test: `server/tests/unit/test_frozen_cache.py`

**Interfaces:**
- Produces: `frozen_cache.extend(live: Path, frozen: Path) -> Dict[str, Any]` (manifeste mis à jour, clé `added` du dernier ajout) ; option `--extend-frozen`.

- [ ] **Step 1 : test d'`extend`** (dans `test_frozen_cache.py`)

```python
def test_extend_adds_only_missing_entries_and_dates_it(tmp_path):
    """Étendre le gel ne doit jamais réécrire une entrée : l'ancien moteur rejoue son baseline."""
    live, frozen = tmp_path / "cache", tmp_path / "frozen"
    live.mkdir()
    FileCache(str(live)).set("lola_list_middle", {"cid": {"1": "old"}})
    frozen_cache.freeze(live, frozen, ddragon_version="16.19.1", tier="master_plus")
    FileCache(str(live)).set("lola_list_middle", {"cid": {"1": "fresh"}})
    FileCache(str(live)).set("lola_team_xayah_bottom", {"team": {}})

    manifest = frozen_cache.extend(live, frozen)

    kept = json.loads((frozen / f"{cache_key('lola_list_middle')}.json").read_text(encoding="utf-8"))
    assert kept["data"]["cid"]["1"] == "old" if "data" in kept else kept["cid"]["1"] == "old"
    assert (frozen / f"{cache_key('lola_team_xayah_bottom')}.json").exists()
    assert manifest["entries"] == 2 and manifest["added"] == 1
    assert manifest["extended"][-1]["added"] == 1 and manifest["frozen_at"] > 0
```

(Adapter l'assertion `kept` au format réel de `FileCache` — lire `FileCache.set` avant.)

- [ ] **Step 2 : le voir échouer** — `python -m pytest tests/unit/test_frozen_cache.py -q` → `AttributeError: extend`.

- [ ] **Step 3 : implémenter** dans `frozen_cache.py`

```python
def extend(live: Path, frozen: Path) -> Dict[str, Any]:
    """Ajoute au gel les seules entrées du cache vivant qu'il n'a pas.

    Rien d'existant n'est réécrit : l'ancien moteur, qui ne lit pas les entrées
    ajoutées, rejoue son baseline à l'identique sur le gel étendu.
    """
    live, frozen = Path(live), Path(frozen)
    manifest = load_manifest(frozen)
    if manifest is None:
        raise FileNotFoundError(f"Aucun gel dans {frozen} : --freeze-cache d'abord")
    added = 0
    for entry in live.glob("*.json"):
        target = frozen / entry.name
        if entry.name == MANIFEST or target.exists():
            continue
        shutil.copy2(entry, target)
        added += 1
    manifest["entries"] = sum(1 for p in frozen.glob("*.json") if p.name != MANIFEST)
    manifest["added"] = added
    manifest.setdefault("extended", []).append({"at": time.time(), "added": added})
    (frozen / MANIFEST).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
```

Dans `run_calibration.py` : `parser.add_argument("--extend-frozen", action="store_true", help="Add the live cache entries missing from the snapshot, without touching the others, and exit")`, et avant `if args.freeze_cache:` :

```python
    if args.extend_frozen:
        manifest = frozen_cache.extend(Path(config.cache_dir), FROZEN_DIR)
        print(f"{C.GREEN}Gel étendu : {manifest['added']} entrées ajoutées, {manifest['entries']} au total{C.RESET}")
        return 0
```

- [ ] **Step 4 : test vert.**

- [ ] **Step 5 : cas de calibration.** Retirer l'objet `synergy_senna_tahmkench` de `cases.json`. Ajouter cinq objets sur ce modèle (catégorie `synergy`, confiance `medium`, adversaire jungle Lee Sin, poste `bot`, `my_pick_order` 3), avec les pools et assertions `must_rank_higher_than` de la spec §8 :

```json
{
  "id": "synergy_braum_yunara_over_jhin",
  "category": "synergy",
  "description": "Braum support allié — Yunara (attaques rapides) passe devant Jhin. Données Lolalytics 30 j : d2 +4,46 (6 702) contre −5,63 (1 521) en Master+. Validé par le joueur le 27/09/2026.",
  "setup": {
    "my_team": "blue", "my_role": "bot", "my_pick_order": 3,
    "ally_picks": {"support": "Braum"},
    "enemy_picks": {"jungle": "Lee Sin"},
    "bans": [],
    "champion_pool": {"bot": [
      {"champion": "Yunara", "tier": "A"}, {"champion": "Jhin", "tier": "A"},
      {"champion": "Caitlyn", "tier": "A"}, {"champion": "Ezreal", "tier": "B"}]}
  },
  "assertions": [{"type": "must_rank_higher_than", "champion_a": "Yunara", "champion_b": "Jhin"}],
  "confidence": "medium"
}
```

Les quatre autres : `synergy_nautilus_samira_over_ashe` (Nautilus ; Samira, Ashe, Jinx A, Ezreal B ; Samira > Ashe), `synergy_rakan_xayah_over_jinx` (Rakan ; Xayah, Jinx, Kai'Sa A, Caitlyn B ; Xayah > Jinx), `synergy_senna_jhin_over_tristana` (Senna ; Jhin, Tristana, Caitlyn A, Ezreal B ; Jhin > Tristana), `synergy_lulu_twitch_over_jhin` (Lulu ; Twitch, Jhin, Jinx A, Ezreal B ; Twitch > Jhin). Descriptions avec les `d2` et parties de la spec.

- [ ] **Step 6 : suite unitaire** (`python -m pytest tests/unit -q`) — un test lit peut-être `cases.json` (libellés producibles) : il doit rester vert.

- [ ] **Step 7 : baselines de l'ancien moteur.**
  1. `python tests/calibration/run_calibration.py --live-cache` : remplit le cache vivant des pages de counters des nouveaux cas.
  2. `python tests/calibration/run_calibration.py --extend-frozen`.
  3. `python tests/calibration/run_calibration.py --snapshot tests/calibration/snapshots/baseline_v13_pre.json` : noter le score et, pour les 5 nouveaux cas, s'ils passent déjà et avec quel écart (`--diagnose -f synergy`). Un cas qui passe nettement sur l'ancien moteur est à signaler au joueur.
  4. Concordance de l'ancien moteur, **cache vivant sans expiration** pour pouvoir apparier plus tard : pilote dans le scratchpad qui pose `config.cache_ttl_hours = 1_000_000` puis lance `run_pro_concordance.main()` avec `--json-out <scratch>/concordance_old.json` (en arrière-plan).

- [ ] **Step 8 : commit** « Synergie : cas de calibration tirés des données, gel extensible ».

### Task 2 : Collecte des pages de duo

**Files:**
- Modify: `server/app/services/data_fetcher.py` (après `fetch_counter_page` ; `parse_team` après `parse_counters`)
- Modify: `server/tests/conftest.py` (`FakeFetcher.fetch_team_page`)
- Test: `server/tests/unit/test_synergy_data.py`

**Interfaces:**
- Produces: `LolalyticsFetcher.fetch_team_page(champion_slug: str, role: str, tier: Optional[str] = None, patch: str = "counter_default") -> Dict[str, Any]` ; `LolalyticsFetcher.parse_team(raw) -> Dict[str, Dict[int, Tuple[float, int, float]]]` = `{poste de l'allié (top/jungle/mid/bot/support): {ally_id: (d2, parties, WR du duo)}}`.

- [ ] **Step 1 : tests**

```python
import math
import pytest
from app.services.data_fetcher import LolalyticsFetcher, FileCache

H = ["id", "wr", "d1", "d2", "pr", "n"]

def test_parse_team_maps_lanes_to_roles_and_reads_columns_by_name():
    raw = {"team_h": H, "team": {"support": [[497, 55.38, 2.43, 1.26, 17.32, 47986]],
                                 "middle": [[103, 52.0, 0.1, -0.4, 3.0, 900]]}}
    pairs = LolalyticsFetcher.parse_team(raw)
    assert pairs["support"][497] == (1.26, 47986, 55.38)
    assert pairs["mid"][103] == (-0.4, 900, 52.0)

def test_parse_team_follows_a_reordered_header():
    raw = {"team_h": ["n", "d2", "id", "wr"], "team": {"top": [[1200, 0.8, 54, 53.1]]}}
    assert LolalyticsFetcher.parse_team(raw)["top"][54] == (0.8, 1200, 53.1)

@pytest.mark.parametrize("row", [[497, 55.0, 0.0, 1.0, 1.0, 0], [497, 55.0, 0.0, float("nan"), 1.0, 10],
                                 [0, 55.0, 0.0, 1.0, 1.0, 10], [497, 120.0, 0.0, 1.0, 1.0, 10],
                                 [497, 55.0], None, "x", [497, 55.0, 0.0, None, 1.0, 10]])
def test_parse_team_drops_bad_rows_but_keeps_the_page(row):
    raw = {"team_h": H, "team": {"support": [row, [412, 56.6, 3.1, 1.44, 7.8, 21669]]}}
    assert LolalyticsFetcher.parse_team(raw)["support"] == {412: (1.44, 21669, 56.6)}

@pytest.mark.parametrize("raw", [{}, None, [], {"team": []}, {"team_h": H, "team": {"support": "x"}}])
def test_parse_team_tolerates_empty_or_malformed_pages(raw):
    assert LolalyticsFetcher.parse_team(raw).get("support", {}) == {}

@pytest.mark.asyncio
async def test_fetch_team_page_caches_by_tier(tmp_path, monkeypatch):
    fetcher = LolalyticsFetcher(cache_dir=str(tmp_path), cache_ttl_hours=None)
    calls = []
    class R:
        def __init__(self, tier): self.tier = tier
        def json(self): return {"team_h": H, "team": {"support": [[497, 55.0, 0.0, 1.0, 1.0, 100]]}, "t": self.tier}
    async def fake_get(url, **kwargs):
        calls.append(kwargs["params"])
        return R(kwargs["params"]["tier"])
    monkeypatch.setattr(fetcher, "_get", fake_get)
    a = await fetcher.fetch_team_page("xayah", "bot", tier="emerald_plus")
    b = await fetcher.fetch_team_page("xayah", "bot", tier="master_plus")
    again = await fetcher.fetch_team_page("xayah", "bot", tier="emerald_plus")
    assert (a["t"], b["t"], again["t"]) == ("emerald_plus", "master_plus", "emerald_plus")
    assert len(calls) == 2 and calls[0]["ep"] == "build-team" and calls[0]["lane"] == "bottom"
    await fetcher.close()

@pytest.mark.asyncio
async def test_fetch_team_page_swallows_ordinary_errors(tmp_path, monkeypatch):
    fetcher = LolalyticsFetcher(cache_dir=str(tmp_path), cache_ttl_hours=None)
    async def boom(url, **kwargs): raise RuntimeError("down")
    monkeypatch.setattr(fetcher, "_get", boom)
    assert await fetcher.fetch_team_page("xayah", "bot") == {}
    await fetcher.close()
```

- [ ] **Step 2 : les voir échouer.**

- [ ] **Step 3 : implémenter** (même gestion que `fetch_counter_page` : clé `lola_team_{slug}_{lane}_{patch}_{tier}_{queue}_{region}`, `except Exception` → `{}` pour que `FrozenCacheMiss`, un `BaseException`, remonte).

```python
    @staticmethod
    def parse_team(raw: Dict[str, Any]) -> Dict[str, Dict[int, Tuple[float, int, float]]]:
        """{poste de l'allié: {ally_id: (d2, parties, WR du duo)}}.

        d2 = WR du duo − (WR du candidat + WR de l'allié − WR moyen) : la part non
        additive, vérifiée le 27/09/2026 sur Xayah et ses supports. Colonnes lues
        par leur nom dans team_h.
        """
        if not isinstance(raw, dict) or not isinstance(raw.get("team"), dict):
            return {}
        header = raw.get("team_h") if isinstance(raw.get("team_h"), list) else ["id", "wr", "d1", "d2", "pr", "n"]
        col = {name: i for i, name in enumerate(header)}
        if not {"id", "wr", "d2", "n"} <= col.keys():
            return {}
        result: Dict[str, Dict[int, Tuple[float, int, float]]] = {}
        for lane, rows in raw["team"].items():
            if not isinstance(rows, list):
                continue
            parsed = {}
            for row in rows:
                try:
                    cid, games = int(row[col["id"]]), int(row[col["n"]])
                    d2, wr = float(row[col["d2"]]), float(row[col["wr"]])
                except (TypeError, ValueError, IndexError, KeyError, OverflowError):
                    continue
                if not 1 <= cid <= 10000 or games <= 0 or not 0 <= wr <= 100:
                    continue
                if not (math.isfinite(d2) and math.isfinite(wr)) or abs(d2) > 50:
                    continue
                parsed[cid] = (d2, games, wr)
            result[lane_to_role(lane)] = parsed
        return result
```

`FakeFetcher` du `conftest.py` : `async def fetch_team_page(self, *args, **kwargs): return {}`.

- [ ] **Step 4 : vert** (`tests/unit -q` complet).
- [ ] **Step 5 : commit** « Synergie : pages de duo Lolalytics (build-team) ».

### Task 3 : k par palier et type de paire

**Files:**
- Create: `server/app/scoring/synergy_priors.py`
- Create: `server/scripts/refresh_synergy_priors.py`
- Create: `server/app/data/synergy_priors.json` (produit par le script)
- Modify: `server/app/scoring/config.py` (`synergy_k_default`, `synergy_observed_scale`, `synergy_reason_threshold`)
- Test: `server/tests/unit/test_synergy_priors.py`

**Interfaces:**
- Produces: `pair_kind(role_a: str, role_b: str) -> str` (`"bot_support"` | `"other"`) ; `prior_k(tier: Optional[str], kind: str) -> int` ; `estimate_k(pairs: Iterable[Tuple[float, int]], min_games: int = 300, min_pairs: int = 30) -> Optional[Tuple[int, float, int]]` (k, τ, nombre de paires) ; `load_priors()` (lru_cache).

- [ ] **Step 1 : tests**

```python
import random
import pytest
from app.scoring import synergy_priors as sp

def test_pair_kind_is_symmetric():
    assert sp.pair_kind("bot", "support") == sp.pair_kind("support", "bot") == "bot_support"
    assert sp.pair_kind("mid", "jungle") == "other" and sp.pair_kind("bot", "mid") == "other"

def test_estimate_k_recovers_a_known_spread():
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

def test_prior_k_falls_back_to_default_tier_then_config(monkeypatch):
    from app.config import config
    monkeypatch.setattr(sp, "load_priors", lambda: {"emerald_plus": {"bot_support": 1300, "other": 7700}})
    monkeypatch.setattr(config, "rank_tier", "emerald_plus")
    assert sp.prior_k("emerald_plus", "bot_support") == 1300
    assert sp.prior_k("iron", "other") == 7700
    monkeypatch.setattr(sp, "load_priors", lambda: {})
    assert sp.prior_k("iron", "other") == config.scoring.synergy_k_default["other"]
```

- [ ] **Step 2 : échec.**

- [ ] **Step 3 : implémenter.** Config (`ScoringConstants`, bloc synergie) :

```python
    # Synergie mesurée par paire (chantier 3, spec 2026-09-28). k = 2500 / τ², τ estimé
    # sur les paires Lolalytics (Master+, 27/09/2026) ; repli si synergy_priors.json manque.
    synergy_k_default: Dict[str, int] = {"bot_support": 2251, "other": 11589}
    synergy_observed_scale: float = 1.0
    synergy_reason_threshold: float = 1.0
```

`synergy_priors.py` :

```python
"""k de rétrécissement des synergies de paire, par palier et type de paire (spec 2026-09-28 §4).

La dispersion brute de d2 est surtout du bruit d'échantillonnage. Bayes empirique :
τ² = var(d2) − moyenne(2500 / n). Avec k = 2500 / τ², shrink et shrink_sd donnent
la moyenne et l'écart-type a posteriori du modèle normal-normal.
"""
from __future__ import annotations
import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple
from app.config import config

PRIORS_PATH = Path(__file__).resolve().parents[1] / "data" / "synergy_priors.json"


def pair_kind(role_a: str, role_b: str) -> str:
    return "bot_support" if {role_a, role_b} == {"bot", "support"} else "other"


@lru_cache(maxsize=1)
def load_priors() -> Dict[str, Dict[str, int]]:
    try:
        return json.loads(PRIORS_PATH.read_text(encoding="utf-8")).get("tiers", {})
    except (OSError, ValueError, AttributeError):
        return {}


def prior_k(tier: Optional[str], kind: str) -> int:
    priors = load_priors()
    for t in (tier, config.rank_tier):
        k = (priors.get(t) or {}).get(kind) if t else None
        if k:
            return int(k)
    return int(config.scoring.synergy_k_default[kind])


def estimate_k(pairs: Iterable[Tuple[float, int]], min_games: int = 300,
               min_pairs: int = 30) -> Optional[Tuple[int, float, int]]:
    rows = [(d2, n) for d2, n in pairs if n >= min_games]
    if len(rows) < min_pairs:
        return None
    mean = sum(d for d, _ in rows) / len(rows)
    var = sum((d - mean) ** 2 for d, _ in rows) / len(rows)
    tau2 = var - sum(2500.0 / n for _, n in rows) / len(rows)
    if tau2 <= 0:
        return None
    return round(2500.0 / tau2), math.sqrt(tau2), len(rows)
```

`scripts/refresh_synergy_priors.py` (modèle : `refresh_roles.py`, affiche sans écrire, `--write` écrit) : paliers = valeurs de `rank_tier_map` ∪ {`config.rank_tier`, `master_plus`} ; pour chaque palier et chaque poste, `fetch_tierlist` → 20 champions aux plus nombreuses parties → `fetch_team_page` ; paires dédupliquées par `(frozenset des ids, frozenset des postes)` ; `estimate_k` par `pair_kind` ; sortie `{"measured_at": "AAAA-MM-JJ", "window_days": 30, "tiers": {tier: {"bot_support": k, "other": k, "tau": {...}, "pairs": {...}}}}`. Un type sans estimation (None) n'est pas écrit : `prior_k` retombe sur le palier par défaut.

- [ ] **Step 4 : vert.** Puis lancer `python scripts/refresh_synergy_priors.py`, relire les k (ordre de grandeur de la spec §4), puis `--write`.
- [ ] **Step 5 : commit** « Synergie : k par palier et type de paire, estimés sur les données ».

### Task 4 : Le terme observé, le repli et le câblage

**Files:**
- Modify: `server/app/services/synergy.py`
- Create: `server/app/scoring/synergy_term.py`
- Modify: `server/app/services/draft_engine.py` (~l. 434-472)
- Modify: `server/app/models/draft.py` (`SynergyDetail.games`)
- Test: `server/tests/unit/scoring/test_synergy_term.py`, `server/tests/unit/test_engine_and_api.py`

**Interfaces:**
- Consumes: `parse_team`, `fetch_team_page` (Task 2) ; `pair_kind`, `prior_k` (Task 3) ; `shrink`, `shrink_sd`.
- Produces: `PairObservation(ally_id: int, ally_name: str, ally_role: str, d2: float, games: int, value: float, sd: float)` ; `SynergyAnalyzer.observations(champion_id, role, draft, tier) -> Optional[List[PairObservation]]` (None = page indisponible) ; `observed_synergy_term(analyzer, champion_id, role, draft, tier, duo_partner_role=None) -> Optional[Term]` ; `SynergyAnalyzer.details(champion_id, role, draft, tier=None)` renvoie des dicts avec `ally_name, ally_role, delta, games, source`.

- [ ] **Step 1 : tests du terme** (`tests/unit/scoring/test_synergy_term.py`)

```python
import math
import pytest
from app.config import config
from app.models.draft import DraftState
from app.scoring import synergy_priors
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.synergy_term import observed_synergy_term
from app.services.synergy import SynergyAnalyzer

H = ["id", "wr", "d1", "d2", "pr", "n"]
PAGE = {"team_h": H, "team": {"support": [[40, 55.0, 0, 2.0, 5, 4000]], "jungle": [[59, 52.0, 0, 1.0, 5, 30000]]}}

@pytest.fixture(autouse=True)
def fixed_priors(monkeypatch):
    monkeypatch.setattr("app.services.synergy.prior_k", lambda tier, kind: {"bot_support": 2000, "other": 10000}[kind])

def _draft(*allies):
    return DraftState(my_role="bot", ally_picks=[{"champion_id": c, "role": r} for c, r in allies])

def _analyzer(catalog, page):
    async def fetch(slug, role, tier=None, patch="counter_default"): return page
    catalog.fetcher.fetch_team_page = fetch
    return SynergyAnalyzer(catalog, catalog.fetcher)

@pytest.mark.asyncio
async def test_sums_shrunk_pairs_with_a_k_per_pair_kind(catalog):
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((40, "support"), (59, "jungle")), "emerald_plus")
    assert term.value == pytest.approx(shrink(2.0, 4000, 2000) + shrink(1.0, 30000, 10000))
    assert term.abs_sd == pytest.approx(math.hypot(shrink_sd(4000, 2000), shrink_sd(30000, 10000)))
    assert term.source == "observed" and term.sample == 34000 and term.outcome_sd == 0.0

@pytest.mark.asyncio
async def test_ally_missing_from_page_adds_only_uncertainty(catalog):
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((25, "support")), "emerald_plus")
    assert term.value == 0.0 and term.abs_sd == pytest.approx(shrink_sd(0, 2000))

@pytest.mark.asyncio
async def test_ally_without_role_uses_its_main_role(catalog):
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((40, None)), "emerald_plus")
    assert term.value == pytest.approx(shrink(2.0, 4000, 2000))

@pytest.mark.asyncio
async def test_duo_factor_only_weights_the_partner_pair(catalog):
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((40, "support"), (59, "jungle")),
                                       "emerald_plus", duo_partner_role="support")
    f = config.scoring.synergy_duo_factor
    assert term.value == pytest.approx(f * shrink(2.0, 4000, 2000) + shrink(1.0, 30000, 10000))

@pytest.mark.asyncio
async def test_scale_multiplies_value_and_uncertainty(catalog, monkeypatch):
    monkeypatch.setattr(config.scoring, "synergy_observed_scale", 0.5)
    term = await observed_synergy_term(_analyzer(catalog, PAGE), 222, "bot", _draft((40, "support")), "emerald_plus")
    assert term.value == pytest.approx(0.5 * shrink(2.0, 4000, 2000))
    assert term.abs_sd == pytest.approx(0.5 * shrink_sd(4000, 2000))

@pytest.mark.asyncio
async def test_unavailable_page_returns_none_for_the_fallback(catalog):
    assert await observed_synergy_term(_analyzer(catalog, {}), 222, "bot", _draft((40, "support")), "emerald_plus") is None

@pytest.mark.asyncio
async def test_empty_low_tier_page_falls_back_to_default_tier(catalog):
    seen = []
    async def fetch(slug, role, tier=None, patch="counter_default"):
        seen.append(tier)
        return PAGE if tier == catalog.fetcher.TIER else {}
    catalog.fetcher.fetch_team_page = fetch
    term = await observed_synergy_term(SynergyAnalyzer(catalog, catalog.fetcher), 222, "bot", _draft((40, "support")), "iron")
    assert term is not None and seen == ["iron", catalog.fetcher.TIER]

@pytest.mark.asyncio
async def test_details_follow_filled_allies_in_order(catalog):
    analyzer = _analyzer(catalog, PAGE)
    details = await analyzer.details(222, "bot", _draft((59, "jungle"), (25, "support")), "emerald_plus")
    assert [d["ally_name"] for d in details] == ["JarvanIV", "Morgana"]
    assert details[0]["source"] == "observed" and details[0]["games"] == 30000
    assert details[0]["delta"] == pytest.approx(round(shrink(1.0, 30000, 10000), 2))
    assert details[1]["games"] == 0 and details[1]["delta"] == 0.0
```

Test de repli sur l'heuristique : l'ancien `score()` sans blocs 1 et 6 — un test qui vérifie que deux équipes ne différant que par le mélange AD/AP donnent le même score heuristique.

- [ ] **Step 2 : échec.**

- [ ] **Step 3 : implémenter.**

`synergy.py` — en-tête corrigé (l'endpoint existe : `build-team`), puis :

```python
@dataclass(frozen=True)
class PairObservation:
    ally_id: int
    ally_name: str
    ally_role: str
    d2: float
    games: int
    value: float   # shrink(d2, games, k)
    sd: float      # shrink_sd(games, k)
```

Dans `SynergyAnalyzer.__init__` : `self._pairs: Dict[Tuple[int, str, str], Dict[str, Dict[int, Tuple[float, int, float]]]] = {}` et `self._loaded_at = {}`.

```python
    async def load_pairs(self, champion_id: int, role: str, tier: Optional[str] = None):
        tier = tier or self.fetcher.TIER
        key = (champion_id, role, tier)
        if key in self._pairs and time.time() - self._loaded_at.get(key, 0) < config.cache_ttl_hours * 3600:
            return self._pairs[key]
        champ = self.db.get_by_id(champion_id)
        if not champ:
            return {}
        raw = await self.fetcher.fetch_team_page(LolalyticsFetcher.key_to_slug(champ.key), role, tier=tier)
        pairs = {r: rows for r, rows in LolalyticsFetcher.parse_team(raw).items() if rows}
        if not pairs and tier != self.fetcher.TIER:
            pairs = await self.load_pairs(champion_id, role, self.fetcher.TIER)
        if pairs:
            self._pairs[key], self._loaded_at[key] = pairs, time.time()
        return pairs

    async def observations(self, champion_id: int, role: str, draft: DraftState,
                           tier: Optional[str] = None) -> Optional[List[PairObservation]]:
        """Une observation par allié connu, dans l'ordre de la draft. None : page indisponible."""
        pairs = await self.load_pairs(champion_id, role, tier)
        if not pairs:
            return None
        out = []
        for ap in draft.ally_picks:
            ally = self.db.get_by_id(ap.champion_id) if ap.champion_id is not None else None
            if not ally:
                continue
            ally_role = ap.role or (ally.roles[0] if ally.roles else "")
            d2, games, _ = pairs.get(ally_role, {}).get(ally.id, (0.0, 0, 0.0))
            k = prior_k(tier or self.fetcher.TIER, pair_kind(role, ally_role))
            out.append(PairObservation(ally.id, ally.name, ally_role, d2, games,
                                       shrink(d2, games, k), shrink_sd(games, k)))
        return out
```

`score()` : supprimer les blocs 1 (mélange des dégâts) et 6 (frontline/backline), docstring : « repli quand la page de duo est indisponible ». `details(champion_id, role, draft, tier=None)` : si `observations` n'est pas None, renvoyer `[{"ally_name", "ally_role", "delta": round(o.value, 2), "games": o.games, "source": "observed"}]` ; sinon l'heuristique actuelle avec `"games": 0, "source": "kit_heuristic"`.

`app/scoring/synergy_term.py` :

```python
"""Terme synergie mesuré : interaction de paire Lolalytics rétrécie (spec 2026-09-28)."""
from __future__ import annotations
import math
from typing import Optional
from app.config import config
from app.models.draft import DraftState
from app.scoring.types import Term


async def observed_synergy_term(analyzer, champion_id: int, role: str, draft: DraftState,
                                tier: Optional[str], duo_partner_role: Optional[str] = None) -> Optional[Term]:
    """None quand la page du candidat est indisponible : l'appelant passe au repli de kit."""
    observations = await analyzer.observations(champion_id, role, draft, tier)
    if observations is None:
        return None
    c = config.scoring
    value = variance = 0.0
    for o in observations:
        w = c.synergy_duo_factor if duo_partner_role and o.ally_role == duo_partner_role else 1.0
        value += w * o.value
        variance += (w * o.sd) ** 2
    s = c.synergy_observed_scale
    return Term("synergy", value * s, math.sqrt(variance) * s, "observed", sum(o.games for o in observations),
                f"interaction mesurée avec {len(observations)} allié(s)")
```

(`prior_k` n'est appelé qu'à un endroit, `SynergyAnalyzer.observations`, importé dans `synergy.py` : c'est là que la fixture le remplace.)

`draft_engine.py` :

```python
        if allies:
            syn = await observed_synergy_term(self.synergy, champ.id, role, draft, tier, duo_partner_role)
            if syn is None:
                duo_bonus = bool(duo_partner_role) and any(a.role == duo_partner_role and a.champion_id for a in draft.ally_picks)
                syn = synergy_term(await self.synergy.score(champ.id, role, draft), duo_bonus)
            terms.append(syn)
```

et `syn_details_raw = await self.synergy.details(champ.id, role, draft, tier) if allies else []`, `SynergyDetail(..., delta=d["delta"], games=d.get("games", 0), source=d.get("source", "kit_heuristic"))`. `SynergyDetail` : `games: int = 0`.

- [ ] **Step 4 : câblage par le moteur** (`test_engine_and_api.py`) :

```python
def _bot_request(allies):
    return DraftRequest(draft_state={"my_role": "bot", "ally_picks": [{"champion_id": c, "role": r} for c, r in allies]},
                        champion_pool={"bot": [{"champion_id": 222}, {"champion_id": 22}]}, enable_wildcard=False)


@pytest.mark.asyncio
async def test_observed_synergy_reaches_the_breakdown_and_the_details(catalog):
    page = {"team_h": ["id", "wr", "d1", "d2", "pr", "n"], "team": {"support": [[40, 56.0, 0, 3.0, 5, 50000]]}}
    catalog.fetcher.fetch_team_page = AsyncMock(return_value=page)
    result = await DraftEngine(catalog, catalog.fetcher).recommend(_bot_request([(40, "support")]))
    term = _terms(result, 222)["synergy"]
    assert term.source == "observed" and term.value > 0 and term.sample == 50000
    rec = next(r for r in result.recommendations if r.champion_id == 222)
    assert rec.synergy_details[0].source == "observed" and rec.synergy_details[0].games == 50000


@pytest.mark.asyncio
async def test_synergy_falls_back_to_kit_rules_without_a_page(catalog):
    result = await DraftEngine(catalog, catalog.fetcher).recommend(_bot_request([(40, "support")]))
    assert _terms(result, 222)["synergy"].source == "heuristic"
```

- [ ] **Step 5 : vert** (`tests/unit -q` complet).
- [ ] **Step 6 : commit** « Synergie : terme mesuré par paire, règles de kit en repli ».

### Task 5 : Raisons

**Files:**
- Modify: `server/app/services/reasons.py` (`_synergy_reason`, appel dans `generate_reasons`)
- Test: `server/tests/unit/test_synergy_reasons.py`

**Interfaces:**
- Consumes: dicts de `details` (Task 4) avec `source`, `delta`.

- [ ] **Step 1 : tests**

```python
from app.services.reasons import _synergy_reason

def test_observed_pair_above_threshold_is_a_synergy_reason(catalog):
    jinx, janna = catalog.get_by_id(222), catalog.get_by_id(40)
    r = _synergy_reason(jinx, janna, "support", "bot", 1.84, source="observed")
    assert r["text"] == "Duo favorable avec Janna (+1,8)" and r["kind"] == "synergy"

def test_observed_negative_pair_is_a_warning(catalog):
    r = _synergy_reason(catalog.get_by_id(222), catalog.get_by_id(40), "support", "bot", -1.2, source="observed")
    assert r["text"] == "Duo défavorable avec Janna (−1,2)" and r["kind"] == "warning"

def test_observed_small_pair_says_nothing_even_if_a_kit_template_matches(catalog):
    assert _synergy_reason(catalog.get_by_id(222), catalog.get_by_id(40), "support", "bot", 0.6, source="observed") is None

def test_kit_templates_remain_for_the_fallback(catalog):
    r = _synergy_reason(catalog.get_by_id(222), catalog.get_by_id(59), "jungle", "bot", 0.0)
    assert r is None or r["kind"] == "synergy"
```

- [ ] **Step 2 : échec.**
- [ ] **Step 3 : implémenter** — paramètre `source: str = "kit_heuristic"` ; en tête de fonction :

```python
    if source == "observed":
        threshold = config.scoring.synergy_reason_threshold
        shown = f"{delta:+.1f}".replace(".", ",").replace("-", "−")
        if delta >= threshold:
            return _mk(f"Duo favorable avec {ally.name} ({shown})", "synergy", ally.name, cand.name)
        if delta <= -threshold:
            return _mk(f"Duo défavorable avec {ally.name} ({shown})", "warning", ally.name, cand.name)
        return None
```

Appel : `_synergy_reason(cand, ally, pick.role, role, syn.get("delta", 0.0), source=syn.get("source", "kit_heuristic"))`. Importer `config` si absent.

- [ ] **Step 4 : vert.** - [ ] **Step 5 : commit** « Synergie : raisons tirées de la mesure ».

### Task 6 : Affichage

**Files:**
- Modify: `client/src/lib/draftView.js`, `client/src/lib/draftView.test.js`
- Modify: `client/src/data/mock.js` (`mapRec` → `synergies`)
- Modify: `client/src/components/Draft/WhyPanel.jsx`

**Interfaces:**
- Produces: `synergyNote({ games, source }) -> { label: string, title: string }`.

- [ ] **Step 1 : tests** (`draftView.test.js`)

```js
import { synergyNote } from './draftView';

describe('synergyNote', () => {
  it('shows the games behind a measured pair', () => {
    const n = synergyNote({ games: 8816, source: 'observed' });
    expect(n.label.replace(/\s/g, ' ')).toBe('8 816 parties');
    expect(n.title).toMatch(/au-delà de la force de chacun/);
  });
  it('says when a measured pair was never played', () => {
    expect(synergyNote({ games: 0, source: 'observed' }).label).toBe('jamais jouée');
  });
  it('keeps the kit label for the fallback', () => {
    expect(synergyNote({ source: 'kit_heuristic' }).label).toBe('synergie kit');
    expect(synergyNote({}).label).toBe('synergie kit');
  });
});
```

- [ ] **Step 2 : échec.**
- [ ] **Step 3 : implémenter**

```js
/** What the number next to an ally means: a measured pair, or the kit fallback. */
export function synergyNote({ games = 0, source } = {}) {
  if (source !== 'observed') {
    return { label: 'synergie kit', title: 'Complémentarité estimée des kits, pas un gain de win rate' };
  }
  if (!games) return { label: 'jamais jouée', title: 'Paire sans partie observée : aucun effet retenu' };
  return {
    label: `${games.toLocaleString('fr-FR')} parties`,
    title: 'Interaction mesurée : win rate du duo au-delà de la force de chacun',
  };
}
```

`mock.js` : `synergies: (rec.synergy_details || []).map((s) => ({ name: s.ally_name, role: s.ally_role, delta: s.delta, games: s.games || 0, source: s.source }))`. `WhyPanel.jsx` : `const note = synergyNote(s);` → `title={note.title}` sur le `<li>`, `<small>{note.label}</small>`.

- [ ] **Step 4 : vert** (`npx vitest run --pool=threads`), puis `PLAYWRIGHT_CHANNEL=chrome npx playwright test` et `npm run build`.
- [ ] **Step 5 : commit** « Synergie : parties affichées pour une paire mesurée ».

### Task 7 : Mesure, balayage, documentation

- [ ] **Step 1** : `python tests/calibration/run_calibration.py --live-cache` avec le nouveau moteur (remplit les pages de duo), puis `--extend-frozen`. Vérifier que l'ancien baseline est intact : l'ancien moteur n'est plus lançable, mais le nombre d'entrées ajoutées doit correspondre aux seules pages `lola_team_*`.
- [ ] **Step 2** : pilote de balayage dans le scratchpad (pose `config.scoring.synergy_observed_scale`, puis `run_calibration.main()` avec `--snapshot`) pour 0 / 0,5 / 1,0 / 1,5 ; `--compare snapshots/baseline_v13_pre.json` pour chaque valeur. Relever : score global, par catégorie, les 5 cas et Yasuo + Malphite, assertions basculées.
- [ ] **Step 3** : concordance du nouveau moteur aux mêmes valeurs, même pilote à cache sans expiration que la Task 1 ; McNemar apparié (top-3 et top-10) contre `concordance_old.json` (script de comparaison dans le scratchpad : `z = (b − c) / √(b + c)`).
- [ ] **Step 4** : appliquer la règle d'acceptation (spec §7) et fixer `synergy_observed_scale` ; commentaire de mesure dans `config.py`. Snapshot de référence `baseline_v13.json`.
- [ ] **Step 5** : documentation — `server/tests/calibration/README.md` (section « Synergie mesurée par paire (28/09/2026) », tableau du balayage) ; `docs/CHANTIERS.md` §3 (état, limites Kog'Maw/Lulu et premade) et §6.6 (cas Senna remplacé) ; `docs/ARBITRAGE_JOUEUR.md` (avis Kai'Sa/Nautilus et Kog'Maw/Lulu, tranchés le 28/09) ; en-tête de la spec si un point a changé.
- [ ] **Step 6** : suites complètes (serveur, Vitest, Playwright, build) ; commit « Synergie mesurée : bilan de calibration et de concordance » ; fusion rapide dans `main`.
