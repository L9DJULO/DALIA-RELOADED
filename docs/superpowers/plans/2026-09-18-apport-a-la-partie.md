# L'apport à la partie face au duel de couloir — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au moteur trois leviers pour que la contribution à la partie pèse face au duel de couloir, chacun neutre par défaut et activé séparément à la mesure.

**Architecture:** Trois changements indépendants sur les termes de scoring — un nouveau terme `teamfight` permanent et faible, un poids du terme `matchup` décroissant avec le rang, et un amortissement du terme `meta` quand le contexte adverse est connu. Les trois constantes réglables valent neutre par défaut : le câblage se commite et se vérifie sans changer le comportement, puis chaque levier s'active seul pour être mesuré avec `--compare`.

**Tech Stack:** Python 3.11, pydantic v2, pytest (`asyncio_mode = auto`). Suite de calibration maison sur cache gelé.

**Spec:** `docs/superpowers/specs/2026-09-18-apport-a-la-partie-design.md`

## Global Constraints

- Toutes les commandes serveur se lancent depuis `server/`. Le `python` du PATH est celui du venv.
- Toute mesure de calibration se fait sur le **cache gelé** (`server/app/data/cache-frozen/`, snapshot du 17/09/2026, Data Dragon 16.18.1, tier `master_plus`). Une mesure sur cache vivant est invalide : les données dérivent seules.
- Baseline de référence : **34/52 (65,4 %)**, triage 18/9/11/14. Snapshot de comparaison : `server/tests/calibration/snapshots/baseline_v2.json`.
- Les termes heuristiques portent leur incertitude en `rel_sd` (erreur sur la constante de conversion, commune à tous les candidats, qui s'annule dans la comparaison), les termes observés en `abs_sd`.
- Quand un terme est multiplié par un poids, **sa valeur et son `abs_sd` sont multipliés ensemble**. Un terme rééchelonné garde une incertitude proportionnelle ; laisser l'`abs_sd` intacte gonflerait l'incertitude relative, élargirait le groupe de tête et déclencherait des réordonnancements parasites du départage par risque subi (vague 2).
- Aucun réglage n'est retenu s'il fait perdre à une catégorie plus qu'il ne fait gagner au global. À égalité de preuve, la valeur qui suppose le moins.
- Les fins de ligne des fichiers existants doivent être préservées : `app/scoring/*.py` et `tests/unit/scoring/*.py` sont en LF, `tests/calibration/run_calibration.py` et son `README.md` en CRLF.

---

## Task 1: Terme d'impact en teamfight

**Files:**
- Modify: `server/app/scoring/config.py` (ajout dans `ScoringConstants`, sous le bloc `# Composition`)
- Modify: `server/app/scoring/heuristic_terms.py` (nouvelle fonction)
- Modify: `server/app/services/draft_engine.py:424` (câblage, après `mechanics_term`)
- Test: `server/tests/unit/scoring/test_heuristic_terms.py`

**Interfaces:**
- Consumes: `Term` (`app.scoring.types`), `ChampionRatings` (`app.models.champion`), `config.scoring`
- Produces: `teamfight_term(ratings: ChampionRatings) -> Term`, nom de terme `"teamfight"`. Constantes `config.scoring.teamfight_reference: float`, `teamfight_scale: float`, `teamfight_rel: float`.

- [ ] **Step 1: Écrire les tests**

Ajouter à la fin de `server/tests/unit/scoring/test_heuristic_terms.py` :

```python
def test_teamfight_term_is_neutral_until_its_scale_is_set():
    """Neutre par defaut : le cablage se commite sans changer le comportement."""
    from app.models.champion import ChampionRatings
    from app.scoring.heuristic_terms import teamfight_term
    assert teamfight_term(ChampionRatings(teamfight=5)).value == 0.0
    assert teamfight_term(ChampionRatings(teamfight=1)).value == 0.0


def test_teamfight_term_separates_a_teamfighter_from_an_assassin(monkeypatch):
    """Orianna (4) doit passer devant Zed (2) sur ce terme, une fois l'echelle posee."""
    from app.config import config
    from app.models.champion import ChampionRatings
    from app.scoring.heuristic_terms import teamfight_term
    monkeypatch.setattr(config.scoring, "teamfight_scale", 0.5)
    orianna = teamfight_term(ChampionRatings(teamfight=4))
    zed = teamfight_term(ChampionRatings(teamfight=2))
    assert orianna.value == pytest.approx(0.5)
    assert zed.value == pytest.approx(-0.5)
    assert orianna.value - zed.value == pytest.approx(1.0), "amplitude visee : ~1 point"


def test_teamfight_term_carries_its_uncertainty_as_rel_sd(monkeypatch):
    """abs_sd elargirait le groupe de tete sans raison et diluerait le departage v2."""
    from app.config import config
    from app.models.champion import ChampionRatings
    from app.scoring.heuristic_terms import teamfight_term
    monkeypatch.setattr(config.scoring, "teamfight_scale", 0.5)
    term = teamfight_term(ChampionRatings(teamfight=5))
    assert term.abs_sd == 0.0 and term.rel_sd > 0.0
    assert term.outcome_sd == 0.0, "ce n'est pas un risque subi : rien n'est ignore ici"
```

Vérifier que `import pytest` est présent en tête du fichier ; l'ajouter sinon.

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `python -m pytest tests/unit/scoring/test_heuristic_terms.py -q`
Expected: FAIL — `ImportError: cannot import name 'teamfight_term' from 'app.scoring.heuristic_terms'`.

- [ ] **Step 3: Ajouter les constantes**

Dans `server/app/scoring/config.py`, à la suite de `comp_cap` / `archetype_scale` :

```python
    # Impact en teamfight. Terme permanent et de faible amplitude : un champion
    # qui pese lourd en combat groupe vaut quelque chose dans toutes les parties,
    # pas seulement dans celles qui s'annoncent groupees (arbitrage du joueur,
    # 18/09/2026). Neutre par defaut, active a la mesure.
    teamfight_reference: float = 3.0
    teamfight_scale: float = 0.0
    teamfight_rel: float = 0.5
```

- [ ] **Step 4: Implémenter le terme**

Dans `server/app/scoring/heuristic_terms.py`, ajouter après `mechanics_term` :

```python
def teamfight_term(ratings) -> Term:
    """Ce que le champion pese quand les dix sont groupes.

    Inconditionnel : ni les allies connus, ni les picks adverses, ni le rang
    n'entrent ici. `composition` mesure la couverture d'outils manquants et
    `archetype` la reponse au plan de jeu adverse ; aucun des deux ne dit cela.

    Limite connue : sur 59 champions mid il n'existe que 29 vecteurs de notes
    distincts. Le terme separe Orianna (4) de Zed (2) mais reste aveugle entre
    Syndra, Lissandra et Veigar, identiques. C'est le chantier 4.
    """
    c = config.scoring
    value = (ratings.teamfight - c.teamfight_reference) * c.teamfight_scale
    return Term("teamfight", value, 0.0, "heuristic", 0,
                "impact en combat groupé", rel_sd=c.teamfight_rel)
```

- [ ] **Step 5: Lancer les tests**

Run: `python -m pytest tests/unit/scoring/test_heuristic_terms.py -q`
Expected: PASS.

- [ ] **Step 6: Câbler dans le moteur**

Dans `server/app/services/draft_engine.py`, juste après `terms.append(mechanics_term(mechanics_delta))` :

```python
        terms.append(teamfight_term(champ.ratings))
```

Et compléter l'import existant en tête du fichier :

```python
from app.scoring.heuristic_terms import mechanics_term, model_term, synergy_term, teamfight_term
```

(vérifier la forme exacte de la ligne d'import avant de la remplacer ; elle peut lister les noms dans un autre ordre.)

- [ ] **Step 7: Verrouiller le câblage**

Ajouter à `server/tests/unit/scoring/test_heuristic_terms.py` :

```python
def test_the_engine_actually_appends_the_teamfight_term():
    """Piege deja rencontre deux fois : une fonction juste, appelee nulle part."""
    import inspect
    from app.services.draft_engine import DraftEngine
    source = inspect.getsource(DraftEngine)
    assert "teamfight_term(" in source
```

- [ ] **Step 8: Lancer toute la suite**

Run: `python -m pytest tests/unit -q`
Expected: PASS. Le nombre de tests augmente de 4 par rapport au départ ; aucun test existant ne casse, puisque `teamfight_scale` vaut 0,0 et que le terme vaut 0.

- [ ] **Step 9: Vérifier que le comportement n'a pas bougé**

Run: `python tests/calibration/run_calibration.py --rank master_plus --compare tests/calibration/snapshots/baseline_v2.json`
Expected: **aucun mouvement**.

Le terme vaut 0 et son `sd` vaut 0 aussi, puisque `rel_sd` multiplie la valeur (`Term.sd` = √((rel_sd · value)² + abs_sd²)). Il n'ajoute donc rien, ni à `Estimate.total`, ni à `Estimate.sd`, ni à `comparison_sd`. Si quelque chose bouge malgré tout, chercher du côté du code qui itère sur les termes par position ou par nombre plutôt que par nom — un terme de plus dans la liste change ces deux choses.

- [ ] **Step 10: Commit**

```bash
git add server/app/scoring/config.py server/app/scoring/heuristic_terms.py server/app/services/draft_engine.py server/tests/unit/scoring/test_heuristic_terms.py
git commit -m "Scoring : terme d'impact en teamfight, neutre par défaut"
```

---

## Task 2: Poids du matchup décroissant avec le rang

**Files:**
- Modify: `server/app/scoring/config.py` (ajout dans `ScoringConstants`, sous le bloc `# Matchup`)
- Modify: `server/app/scoring/rank.py` (nouvelle fonction, à côté de `counter_lambda`)
- Modify: `server/app/scoring/matchup_term.py:12-13` (signature) et `:41` (le `return`)
- Modify: `server/app/services/draft_engine.py:407` (passage du rang)
- Test: `server/tests/unit/scoring/test_rank.py`, `server/tests/unit/scoring/test_matchup_term.py`

**Interfaces:**
- Consumes: `config.scoring`, `RANKS` (`app.scoring.types`)
- Produces: `matchup_weight(rank: Optional[str]) -> float` dans `app.scoring.rank`. `matchup_term` gagne un paramètre `rank: Optional[str] = None` en dernière position. Constantes `config.scoring.matchup_weight: Dict[str, float]`, `matchup_weight_unknown: float`.

- [ ] **Step 1: Écrire les tests du poids**

Ajouter à la fin de `server/tests/unit/scoring/test_rank.py` :

```python
def test_matchup_weight_is_neutral_at_every_rank_by_default():
    """Neutre par defaut : le cablage se commite sans changer le comportement."""
    from app.scoring.rank import matchup_weight
    from app.scoring.types import RANKS
    for rank in RANKS:
        assert matchup_weight(rank) == 1.0
    assert matchup_weight(None) == 1.0
    assert matchup_weight("challenger_imaginaire") == 1.0


def test_matchup_weight_covers_every_rank_the_engine_accepts():
    """Un rang absent de la table tomberait en silence sur la valeur inconnue."""
    from app.config import config
    from app.scoring.types import RANKS
    assert set(config.scoring.matchup_weight) == set(RANKS)


def test_matchup_weight_decreases_with_rank_once_set(monkeypatch):
    """A haut elo une lane perdue se rattrape, une compo ratee non."""
    from app.config import config
    from app.scoring.rank import matchup_weight
    monkeypatch.setitem(config.scoring.matchup_weight, "iron", 1.0)
    monkeypatch.setitem(config.scoring.matchup_weight, "master_plus", 0.6)
    assert matchup_weight("master_plus") < matchup_weight("iron")
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `python -m pytest tests/unit/scoring/test_rank.py -q`
Expected: FAIL — `ImportError: cannot import name 'matchup_weight' from 'app.scoring.rank'`.

- [ ] **Step 3: Ajouter les constantes**

Dans `server/app/scoring/config.py`, sous le bloc `# Matchup`, après `heuristic_matchup_sd` :

```python
    # Poids du duel de couloir selon le rang, en sens inverse de counter_lambda :
    # plus le rang monte, moins la lane decide la partie. Ne s'applique qu'au terme
    # `matchup` ; `future_opponent` porte deja counter_lambda, y superposer un second
    # facteur de rang serait du double comptage. Neutre par defaut, calibre par un
    # facteur d'echelle global — la calibration ne tourne qu'a un rang a la fois et
    # ne saurait pas departager huit valeurs independantes.
    matchup_weight: Dict[str, float] = {
        "iron": 1.0, "bronze": 1.0, "silver": 1.0, "gold": 1.0,
        "platinum": 1.0, "emerald": 1.0, "diamond": 1.0, "master_plus": 1.0,
    }
    matchup_weight_unknown: float = 1.0
```

- [ ] **Step 4: Implémenter le poids**

Dans `server/app/scoring/rank.py`, ajouter à côté de `counter_lambda` :

```python
def matchup_weight(rank: Optional[str]) -> float:
    """Combien le duel de couloir compte a ce rang. 1.0 = a plein."""
    c = config.scoring
    if not rank:
        return c.matchup_weight_unknown
    return c.matchup_weight.get(rank, c.matchup_weight_unknown)
```

Vérifier que `Optional` est importé dans ce fichier ; l'ajouter à l'import `typing` sinon.

- [ ] **Step 5: Lancer les tests du poids**

Run: `python -m pytest tests/unit/scoring/test_rank.py -q`
Expected: PASS.

- [ ] **Step 6: Écrire le test du terme pondéré**

Ajouter à la fin de `server/tests/unit/scoring/test_matchup_term.py` :

```python
async def test_matchup_weight_scales_value_and_uncertainty_together(catalog, monkeypatch):
    """Un terme reechelonne garde une incertitude proportionnelle.

    Laisser l'abs_sd intacte gonflerait l'incertitude relative, elargirait le groupe
    de tete et declencherait des reordonnancements parasites du departage par risque
    subi (vague 2).
    """
    from app.config import config
    from app.models.draft import DraftState
    from app.scoring.matchup_term import matchup_term
    from app.services.matchup import MatchupAnalyzer

    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    analyzer.prefetch = AsyncMock()
    analyzer.matchup_data = AsyncMock(return_value=(0.0, 400, 0.0, -4.0))
    draft = DraftState(my_role="mid", enemy_picks=[{"champion_id": 103, "role": "mid"}])

    full = await matchup_term(analyzer, 61, "mid", draft, None, "master_plus")
    monkeypatch.setitem(config.scoring.matchup_weight, "master_plus", 0.5)
    halved = await matchup_term(analyzer, 61, "mid", draft, None, "master_plus")

    assert halved.value == pytest.approx(full.value * 0.5)
    assert halved.abs_sd == pytest.approx(full.abs_sd * 0.5)
```

Vérifier que `pytest`, `AsyncMock` et la fixture `catalog` sont disponibles dans ce fichier — `catalog` vient de `server/tests/conftest.py`, `AsyncMock` de `unittest.mock`.

- [ ] **Step 7: Lancer, vérifier l'échec**

Run: `python -m pytest tests/unit/scoring/test_matchup_term.py -q`
Expected: FAIL — `TypeError: matchup_term() takes 5 positional arguments but 6 were given`.

- [ ] **Step 8: Pondérer le terme**

Dans `server/app/scoring/matchup_term.py`, changer la signature :

```python
async def matchup_term(analyzer: MatchupAnalyzer, champion_id: int, role: str, draft: DraftState,
                       tier: Optional[str], rank: Optional[str] = None) -> Optional[Term]:
```

et le `return` final :

```python
    source = "observed" if observed else "heuristic"
    weight = matchup_weight(rank)
    return Term("matchup", value * weight, math.sqrt(variance) * weight, source, sample,
                "" if observed else "estimation de kit, aucune donnée de matchup")
```

Ajouter l'import en tête du fichier :

```python
from app.scoring.rank import matchup_weight
```

- [ ] **Step 9: Passer le rang depuis le moteur**

Dans `server/app/services/draft_engine.py`, à l'appel de `matchup_term` :

```python
        mu = await matchup_term(self.matchup, champ.id, role, draft, tier, rank)
```

- [ ] **Step 10: Lancer toute la suite**

Run: `python -m pytest tests/unit -q`
Expected: PASS. `matchup_weight` vaut 1,0 partout, donc aucun comportement ne change.

- [ ] **Step 11: Vérifier que le comportement n'a pas bougé**

Run: `python tests/calibration/run_calibration.py --rank master_plus --compare tests/calibration/snapshots/baseline_v2.json`
Expected: **aucun mouvement**.

- [ ] **Step 12: Commit**

```bash
git add server/app/scoring/config.py server/app/scoring/rank.py server/app/scoring/matchup_term.py server/app/services/draft_engine.py server/tests/unit/scoring/test_rank.py server/tests/unit/scoring/test_matchup_term.py
git commit -m "Scoring : poids du matchup décroissant avec le rang, neutre par défaut"
```

---

## Task 3: Amortissement de la méta par le contexte

**Files:**
- Modify: `server/app/scoring/config.py` (ajout dans `ScoringConstants`, sous le bloc `# Rétrécissement`)
- Modify: `server/app/scoring/meta_term.py` (signature et calcul)
- Modify: `server/app/services/draft_engine.py:405` (calcul et passage de la fraction)
- Test: `server/tests/unit/scoring/test_meta_term.py`

**Interfaces:**
- Consumes: `config.scoring`, `ChampionStats`
- Produces: `meta_term(stats, context_fraction: float = 0.0) -> Term`. Constante `config.scoring.meta_context_damping: float`.

- [ ] **Step 1: Écrire les tests**

Ajouter à la fin de `server/tests/unit/scoring/test_meta_term.py` :

```python
def test_meta_damping_is_neutral_by_default():
    """Neutre par defaut : le cablage se commite sans changer le comportement."""
    from app.models.champion import ChampionStats
    from app.scoring.meta_term import meta_term
    stats = ChampionStats(win_rate=54.0, games=5000)
    assert meta_term(stats, 1.0).value == pytest.approx(meta_term(stats, 0.0).value)


def test_meta_is_intact_while_the_enemy_team_is_unknown(monkeypatch):
    """Sans contexte, la moyenne est la meilleure information disponible."""
    from app.config import config
    from app.models.champion import ChampionStats
    from app.scoring.meta_term import meta_term
    from app.scoring.shrink import shrink
    monkeypatch.setattr(config.scoring, "meta_context_damping", 0.4)
    stats = ChampionStats(win_rate=54.0, games=5000)
    intact = shrink(4.0, 5000, config.scoring.k_meta)
    assert meta_term(stats, 0.0).value == pytest.approx(intact), "zero pick revele : rien n'est amorti"
    assert meta_term(stats, 0.0).value > meta_term(stats, 0.6).value > meta_term(stats, 1.0).value > 0.0


def test_meta_damping_is_symmetric(monkeypatch):
    """Ce n'est pas une penalite des champions forts : la moyenne devient moins
    pertinente dans les deux sens."""
    from app.config import config
    from app.models.champion import ChampionStats
    from app.scoring.meta_term import meta_term
    monkeypatch.setattr(config.scoring, "meta_context_damping", 0.5)
    strong = meta_term(ChampionStats(win_rate=54.0, games=5000), 1.0)
    weak = meta_term(ChampionStats(win_rate=46.0, games=5000), 1.0)
    assert strong.value == pytest.approx(-weak.value)


def test_meta_damping_scales_uncertainty_with_the_value(monkeypatch):
    """Meme regle que le poids du matchup : un terme reechelonne garde une
    incertitude proportionnelle."""
    from app.config import config
    from app.models.champion import ChampionStats
    from app.scoring.meta_term import meta_term
    monkeypatch.setattr(config.scoring, "meta_context_damping", 0.5)
    stats = ChampionStats(win_rate=54.0, games=5000)
    full, damped = meta_term(stats, 0.0), meta_term(stats, 1.0)
    assert damped.value == pytest.approx(full.value * 0.5)
    assert damped.abs_sd == pytest.approx(full.abs_sd * 0.5)


def test_meta_damping_never_touches_the_no_data_branch(monkeypatch):
    """Aucune statistique : c'est de l'ignorance, l'amortir n'a pas de sens."""
    from app.config import config
    from app.scoring.meta_term import meta_term
    monkeypatch.setattr(config.scoring, "meta_context_damping", 0.9)
    term = meta_term(None, 1.0)
    assert term.value == 0.0 and term.abs_sd == config.scoring.no_meta_sd
```

Vérifier que `import pytest` est présent en tête du fichier, et la forme exacte du constructeur `ChampionStats` — le test doit utiliser les mêmes champs que les tests existants du fichier.

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `python -m pytest tests/unit/scoring/test_meta_term.py -q`
Expected: FAIL — `TypeError: meta_term() takes 1 positional argument but 2 were given`.

- [ ] **Step 3: Ajouter la constante**

Dans `server/app/scoring/config.py`, après `no_meta_sd` :

```python
    # Amortissement de la meta par le contexte. Le win rate brut est une moyenne
    # SUR TOUS LES CONTEXTES, y compris ceux ou le champion a ete pique dans une
    # situation favorable. Tant que le contexte reel est inconnu, cette moyenne est
    # la meilleure information disponible ; quand il est connu, continuer a la
    # compter a plein revient a la compter deux fois contre les termes qui, eux,
    # decrivent CETTE partie. Neutre par defaut, active a la mesure.
    meta_context_damping: float = 0.0
```

- [ ] **Step 4: Implémenter l'amortissement**

Remplacer `meta_term` dans `server/app/scoring/meta_term.py` :

```python
def meta_term(stats: Optional[ChampionStats], context_fraction: float = 0.0) -> Term:
    c = config.scoring
    if stats is None or stats.games <= 0:
        return Term("meta", 0.0, c.no_meta_sd, "heuristic", 0, "aucune statistique méta")
    # Symetrique : ramene un champion fort vers zero comme un champion faible.
    damping = 1.0 - c.meta_context_damping * min(1.0, max(0.0, context_fraction))
    return Term("meta", shrink(stats.win_rate - 50.0, stats.games, c.k_meta) * damping,
                shrink_sd(stats.games, c.k_meta) * damping, "observed", stats.games,
                stats.patch or "")
```

- [ ] **Step 5: Lancer les tests**

Run: `python -m pytest tests/unit/scoring/test_meta_term.py -q`
Expected: PASS.

- [ ] **Step 6: Calculer la fraction dans le moteur**

Dans `server/app/services/draft_engine.py`, remplacer la ligne qui construit la liste de termes :

```python
        # Picks ADVERSES seuls : un allie connu informe composition et synergy, mais
        # il ne dit rien sur le contexte dans lequel le win rate moyen a ete observe.
        revealed = len([e for e in draft.enemy_picks if e.champion_id])
        context_fraction = min(1.0, revealed / 5.0)
        terms: List[Term] = [meta_term(self.meta.stats(champ.id, role, tier), context_fraction)]
```

- [ ] **Step 7: Verrouiller le câblage**

Ajouter à `server/tests/unit/scoring/test_meta_term.py` :

```python
def test_the_engine_actually_passes_the_context_fraction():
    """Piege deja rencontre deux fois : un parametre juste, jamais transmis."""
    import inspect
    from app.services.draft_engine import DraftEngine
    source = inspect.getsource(DraftEngine)
    assert "context_fraction" in source
    assert "meta_term(self.meta.stats(champ.id, role, tier), context_fraction)" in source
```

- [ ] **Step 8: Lancer toute la suite**

Run: `python -m pytest tests/unit -q`
Expected: PASS. `meta_context_damping` vaut 0,0, donc `damping` vaut 1,0 et rien ne change.

- [ ] **Step 9: Vérifier que le comportement n'a pas bougé**

Run: `python tests/calibration/run_calibration.py --rank master_plus --compare tests/calibration/snapshots/baseline_v2.json`
Expected: **aucun mouvement**.

- [ ] **Step 10: Commit**

```bash
git add server/app/scoring/config.py server/app/scoring/meta_term.py server/app/services/draft_engine.py server/tests/unit/scoring/test_meta_term.py
git commit -m "Scoring : amortissement de la méta quand le contexte adverse est connu"
```

---

## Task 4: Mesure isolée des trois leviers

**Files:**
- Aucun fichier de code modifié durablement. Les constantes sont remises à neutre à la fin de chaque mesure.
- Modify: `server/tests/calibration/README.md` (section de mesure, en CRLF)

**Interfaces:**
- Consumes: les trois constantes des Tasks 1 à 3, `--compare` (chantier 12), le snapshot `baseline_v2.json`

- [ ] **Step 1: Confirmer le point de départ**

Run: `python tests/calibration/run_calibration.py --rank master_plus --compare tests/calibration/snapshots/baseline_v2.json`
Expected: aucun mouvement. Si quelque chose bouge ici, une des trois tâches n'est pas neutre — corriger avant de mesurer quoi que ce soit, sinon les trois mesures qui suivent sont fausses.

- [ ] **Step 2: Mesurer le terme teamfight seul**

Pour chaque valeur de `teamfight_scale` dans `0.25, 0.5, 0.75, 1.0`, les deux autres constantes restant neutres :

Run: `python tests/calibration/run_calibration.py --rank master_plus --compare tests/calibration/snapshots/baseline_v2.json`

Consigner pour chaque valeur : assertions basculées, changements de rang, nombre de déplacements de score. Puis, à la valeur qui déplace le plus sans dégrader :

Run: `python tests/calibration/run_calibration.py --rank master_plus`

pour le score global et le détail par catégorie. Remettre `teamfight_scale` à 0,0 avant l'étape suivante.

- [ ] **Step 3: Mesurer le poids du matchup seul**

La table `matchup_weight` est renseignée par un facteur d'échelle global appliqué au master+ uniquement, puisque la calibration tourne à ce rang : pour chaque valeur dans `0.8, 0.6, 0.4`, poser `matchup_weight["master_plus"]` à cette valeur, les autres rangs et les autres constantes restant neutres. Même protocole qu'au Step 2. Remettre à 1,0 ensuite.

- [ ] **Step 4: Mesurer l'amortissement de la méta seul**

Pour chaque valeur de `meta_context_damping` dans `0.2, 0.35, 0.5`, les deux autres constantes restant neutres. Même protocole. Remettre à 0,0 ensuite.

- [ ] **Step 5: Vérifier le sens du déplacement sur le cas de référence**

À chaque levier, à sa valeur la plus forte, relever la position d'Orianna et de Zed :

Run: `python tests/calibration/run_calibration.py --rank master_plus --verbose -f anti_engage`

Le cas `comp_engage_mid_peel` ne doit **pas** basculer (§6.4 de la spec) mais l'écart doit se réduire. Un écart qui s'agrandit est un signe que le levier va dans le mauvais sens et doit être rapporté, pas compensé par un autre réglage.

- [ ] **Step 6: Consigner les trois mesures**

Dans `server/tests/calibration/README.md`, ajouter une section `## L'apport à la partie (chantier 5)` avec un tableau par levier : valeur, assertions basculées, changements de rang, déplacements de score, score global, catégories dégradées.

Écrire aussi ce qu'aucun levier n'a bougé. Un levier sans effet mesurable est un résultat, pas un échec à cacher.

- [ ] **Step 7: Commit**

```bash
git add server/tests/calibration/README.md
git commit -m "Mesure : effet isolé des trois leviers de l'apport à la partie"
```

---

## Task 5: Réglage conjoint et bilan

**Files:**
- Modify: `server/app/scoring/config.py` (valeurs retenues)
- Modify: `server/tests/calibration/README.md` (bilan, en CRLF)
- Modify: `docs/CHANTIERS.md` (chantier 5, en LF)
- Modify: `REPRISE_PROJET.md` (section de bilan, en LF)

**Interfaces:**
- Consumes: toutes les tâches précédentes

- [ ] **Step 1: Mesurer les trois leviers ensemble**

Poser les trois constantes aux valeurs retenues au Task 4, puis :

Run: `python tests/calibration/run_calibration.py --rank master_plus --compare tests/calibration/snapshots/baseline_v2.json`
Run: `python tests/calibration/run_calibration.py --rank master_plus`
Run: `python tests/calibration/run_calibration.py --rank master_plus --diagnose`

Comparer au baseline 34/52, triage 18/9/11/14. La mesure conjointe peut différer de la somme des mesures isolées : c'est exactement ce qu'on cherche à voir.

- [ ] **Step 2: Arbitrer les valeurs finales**

Retenir le triplet qui monte le score global sans qu'aucune catégorie ne perde plus qu'elle ne gagne. À égalité, les valeurs les plus faibles. Si aucun triplet ne monte le global, **retenir le triplet neutre** et le dire : la spec aura échoué, et la suite est le chantier 1 (décomposer les notes) plutôt qu'un réglage de poids.

- [ ] **Step 3: Documenter chaque constante à côté d'elle**

Dans `server/app/scoring/config.py`, compléter le commentaire de chacune des trois constantes réglables avec la date du balayage, les valeurs essayées et la raison du choix — comme `counter_alpha` le fait déjà. Une constante sans son historique de mesure redevient arbitraire au passage suivant.

- [ ] **Step 4: Suite complète et client**

```bash
python -m pytest tests/unit -q
cd ../client && npm.cmd test -- --run && npm.cmd run build
```
Expected: suite serveur verte, 24 tests Vitest, build Vite réussi. Aucun fichier client n'est touché par ce plan : un échec ici signale une régression d'API inattendue.

- [ ] **Step 5: Reprendre le snapshot de référence**

Run: `python tests/calibration/run_calibration.py --rank master_plus --snapshot tests/calibration/snapshots/baseline_v3.json`

Le prochain chantier partira de là.

- [ ] **Step 6: Écrire le bilan**

Dans `server/tests/calibration/README.md`, une section de bilan : les trois leviers, leurs valeurs retenues, l'effet conjoint, et la réponse explicite à la question du §6.4 de la spec — de combien l'écart Zed/Orianna s'est réduit, et s'il a basculé.

Dans `docs/CHANTIERS.md`, mettre le chantier 5 à jour : ce qui est fait, ce qui reste. Si le cas de référence échoue toujours, il reste ouvert et il faut dire pourquoi.

Dans `REPRISE_PROJET.md`, une section `## L'apport à la partie (18 septembre 2026)` : ce qui a changé, les chiffres de vérification, ce qui reste ouvert.

- [ ] **Step 7: Commit**

```bash
git add server/app/scoring/config.py server/tests/calibration/README.md docs/CHANTIERS.md REPRISE_PROJET.md
git commit -m "Bilan : l'apport à la partie face au duel de couloir"
```
