# Variance de comparaison — plan d'implémentation (vague 0,5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que « ces deux champions sont équivalents » soit décidé par la donnée et non par des constantes heuristiques, en séparant l'incertitude partagée entre candidats de l'incertitude propre à chacun.

**Architecture:** Chaque terme porte deux composantes d'incertitude au lieu d'une. `rel_sd` est l'erreur sur la constante de conversion du terme, la même pour tous les candidats : elle s'annule dans la différence. `abs_sd` est l'échantillonnage ou l'ignorance, propre à chaque candidat : elle ne s'annule jamais. `sd` devient dérivé. Une nouvelle fonction `comparison_sd` calcule l'incertitude de la **différence** entre deux estimations, et remplace `sqrt(sd_a² + sd_b²)` partout où l'on décide si deux champions sont départageables.

**Tech Stack:** Python 3.11, Pydantic, pytest. Aucun changement client, aucune migration Alembic.

**Spec:** [docs/superpowers/specs/2026-09-14-qualite-moteur-scoring-design.md](../specs/2026-09-14-qualite-moteur-scoring-design.md) — **addendum A**, qui amende §5 et §6.

**Contexte d'exécution :** ce plan s'insère entre la Task 2 et la Task 3 de [2026-09-14-qualite-moteur-scoring.md](2026-09-14-qualite-moteur-scoring.md). Cette Task 3 est suspendue jusqu'à la fin de ce plan (spec A.7).

## Global Constraints

- Toutes les commandes serveur partent de `server/` et utilisent `.venv/Scripts/python.exe` (Windows). Un outil Bash sous Git Bash est disponible et plus simple.
- La suite unitaire complète est à **114 passed** au début de ce plan. Elle ne doit jamais descendre.
- Lancer la calibration exige `PYTHONIOENCODING=utf-8` dès que la sortie est redirigée (console Windows en cp1252).
- Les constantes de scoring vivent dans `ScoringConstants` (`server/app/scoring/config.py`). Aucune valeur magique dans les modules de termes.
- Commentaires et docstrings de `server/app/` en français. `server/tests/calibration/run_calibration.py` est en anglais : y écrire en anglais. Messages de commit en français.
- Ne pas modifier `cases.json`. La Task 3 du plan principal en est propriétaire.
- Formule contraignante de la variance de comparaison, par terme :
  `rel_sd² · (valeur_a − valeur_b)² + abs_sd_a² + abs_sd_b²`
- Formule contraignante du σ d'un terme : `sqrt((rel_sd · valeur)² + abs_sd²)`.

---

## Task 1: Deux composantes d'incertitude par terme

**Files:**
- Modify: `server/app/scoring/types.py` (`Term`)
- Modify: `server/app/scoring/config.py` (`ScoringConstants`)
- Modify: `server/app/scoring/heuristic_terms.py`, `server/app/scoring/composition_term.py`, `server/app/scoring/mastery_term.py`
- Modify: `server/app/models/draft.py` (`ScoreTerm`)
- Modify: `server/app/services/draft_engine.py:298`, `server/app/services/draft_engine.py:436`
- Test: `server/tests/unit/scoring/test_aggregate.py`, `server/tests/unit/scoring/test_heuristic_terms.py`

**Interfaces:**
- Produces: `Term(name, value, abs_sd=0.0, source="heuristic", sample=0, note="", rel_sd=0.0)` — le 3ᵉ paramètre positionnel s'appelle désormais `abs_sd` ; tous les appels positionnels existants restent valides et inchangés de sens. `Term.sd` devient une **propriété** dérivée. `ScoreTerm` gagne `abs_sd` et `rel_sd`.

> **Piège à ne pas manquer.** `sd` cesse d'être un champ de dataclass, donc il disparaît de `Term.__dict__`. Les deux sites `ScoreTerm(**term.__dict__)` (`draft_engine.py:298` et `:436`) lèveraient une `ValidationError` sur le champ `sd` manquant. Ils doivent devenir `ScoreTerm(**t.__dict__, sd=t.sd)`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `server/tests/unit/scoring/test_aggregate.py` :

```python
def test_term_sd_combines_relative_and_absolute_components():
    # sqrt((0.5*4.0)^2 + 1.5^2) = sqrt(4 + 2.25) = 2.5
    t = Term("composition", 4.0, 1.5, rel_sd=0.5)
    assert math.isclose(t.sd, 2.5)


def test_relative_only_term_at_zero_value_carries_no_uncertainty():
    """Le defaut central : mechanics a 0.00 facturait 1.5 de sigma."""
    assert Term("mechanics", 0.0, 0.0, rel_sd=0.5).sd == 0.0


def test_absolute_only_term_keeps_its_sd_whatever_its_value():
    """Ignorance propre au champion : meta sans donnees vaut 0 mais reste incertain."""
    assert math.isclose(Term("meta", 0.0, 3.0).sd, 3.0)


def test_estimate_sd_sums_derived_term_variances():
    est = Estimate(terms=[Term("meta", 0.0, 3.0), Term("composition", 4.0, 0.0, rel_sd=0.5)])
    assert math.isclose(est.sd, math.sqrt(9.0 + 4.0))
```

Créer `server/tests/unit/scoring/test_heuristic_terms.py` s'il n'existe pas déjà ; sinon y ajouter :

```python
import math
from app.config import config
from app.scoring.heuristic_terms import mechanics_term, synergy_term


def test_mechanics_term_without_any_rule_is_certain():
    t = mechanics_term(0.0)
    assert t.value == 0.0 and t.sd == 0.0


def test_mechanics_uncertainty_grows_with_its_own_effect():
    small, large = mechanics_term(2.0), mechanics_term(10.0)
    assert large.sd > small.sd > 0.0


def test_synergy_uncertainty_is_relative_to_its_value():
    t = synergy_term(50.0, duo_bonus=False)   # score neutre -> valeur 0
    assert t.value == 0.0 and t.sd == 0.0
    strong = synergy_term(100.0, duo_bonus=False)
    assert math.isclose(strong.sd, config.scoring.synergy_rel * abs(strong.value))
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_aggregate.py tests/unit/scoring/test_heuristic_terms.py -q`
Expected: FAIL — `TypeError: Term.__init__() got an unexpected keyword argument 'rel_sd'`.

- [ ] **Step 3: Étendre `Term`**

Dans `server/app/scoring/types.py`, remplacer la dataclass `Term` :

```python
@dataclass
class Term:
    """Contribution d'un facteur en points de win rate, avec ses deux incertitudes.

    `abs_sd` est propre au champion : échantillonnage, ou ignorance quand la
    donnée manque. Elle ne s'annule jamais face à un autre candidat.

    `rel_sd` porte sur la constante qui convertit ce facteur en points de win
    rate. C'est la même erreur pour tous les candidats : elle s'annule dans la
    différence entre deux champions, et disparaît quand le terme vaut zéro.
    """
    name: str
    value: float
    abs_sd: float = 0.0
    source: str = "heuristic"
    sample: int = 0
    note: str = ""
    rel_sd: float = 0.0

    @property
    def sd(self) -> float:
        return math.sqrt((self.rel_sd * self.value) ** 2 + self.abs_sd ** 2)
```

`Estimate` n'est pas modifié : sa propriété `sd` consomme `t.sd`, désormais dérivé.

- [ ] **Step 4: Ajouter les constantes relatives**

Dans `server/app/scoring/config.py`, dans `ScoringConstants` : **supprimer** `mastery_sd_declared`, `comp_sd`, `archetype_sd`, `synergy_sd`, `mechanics_sd` et `model_sd`. Conserver `mastery_sd_observed`, `no_meta_sd`, `heuristic_matchup_sd`, `future_sd_floor` et `future_no_data_sd`, qui restent des incertitudes absolues légitimes.

Ajouter :

```python
    # Incertitudes relatives : erreur sur la constante qui convertit chaque
    # facteur en points de win rate. Partagée par tous les candidats, donc
    # elle s'annule dans la comparaison de deux champions.
    mastery_rel: float = 0.4
    comp_rel: float = 0.5
    archetype_rel: float = 0.5
    synergy_rel: float = 0.5
    mechanics_rel: float = 0.5
    model_rel: float = 0.5
```

- [ ] **Step 5: Convertir les termes heuristiques**

Dans `server/app/scoring/heuristic_terms.py`, les trois `return` deviennent :

```python
    return Term("synergy", value, 0.0, "heuristic", 0,
                "synergie de kit" + (", duo" if duo_bonus else ""), rel_sd=c.synergy_rel)
```
```python
    return Term("mechanics", delta * c.mechanics_scale, 0.0, "heuristic", 0,
                "règles d'interactions de kits", rel_sd=c.mechanics_rel)
```
```python
    return Term("model", max(-c.model_cap, min(c.model_cap, delta_pp)), 0.0, "model", 0,
                "WPA estimé DALIA, écart à la moyenne des alternatives", rel_sd=c.model_rel)
```

Dans `server/app/scoring/composition_term.py` :

```python
    return Term("composition", value, 0.0, "heuristic", 0,
                f"apport marginal avec {len(allies)} allié(s) connu(s)", rel_sd=c.comp_rel)
```
```python
    return Term("archetype", value, 0.0, "heuristic", archetype.picks_revealed,
                f"réponse à une composition {archetype.primary.value}", rel_sd=c.archetype_rel)
```

Dans `server/app/scoring/mastery_term.py`, la branche de sélection devient — la branche observée garde une incertitude absolue (échantillonnage réel), les deux autres passent en relative (table palier → points de WR, partagée) :

```python
    if personal is not None and g >= c.mastery_personal_min_games:
        base, abs_sd, rel_sd, source = personal, c.mastery_sd_observed, 0.0, "observed"
    elif personal is not None:
        base = (g * personal + c.mastery_personal_min_games * declared) / (g + c.mastery_personal_min_games)
        abs_sd, rel_sd, source = 0.0, c.mastery_rel, "heuristic"
    else:
        base, abs_sd, rel_sd, source = declared, 0.0, c.mastery_rel, "heuristic"
```

et le `return` final :

```python
    return Term("mastery", value, abs_sd, source, g, note, rel_sd=rel_sd)
```

`meta_term.py`, `matchup_term.py` et `opponent_model.py` ne sont **pas** modifiés : leurs σ sont déjà des incertitudes absolues légitimes et le 3ᵉ argument positionnel est désormais `abs_sd`, ce qui est exactement leur sens.

- [ ] **Step 6: Réparer la propagation vers l'API**

Dans `server/app/models/draft.py`, dans `ScoreTerm`, après `sd: float` :

```python
    abs_sd: float = 0.0
    rel_sd: float = 0.0
```

Dans `server/app/services/draft_engine.py`, les deux sites de construction — `sd` n'est plus dans `__dict__`, il faut le passer explicitement :

```python
                rec.breakdown.terms.append(ScoreTerm(**term.__dict__, sd=term.sd))
```
```python
            terms=[ScoreTerm(**t.__dict__, sd=t.sd) for t in est.terms],
```

- [ ] **Step 7: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS. Des tests existants qui affirmaient des σ absolus sur des termes heuristiques vont échouer — c'est le changement voulu. Les corriger vers la nouvelle formule, sans jamais relâcher une assertion pour la faire passer : si un test attendait `sd == 2.0` pour une composition à +2,00, la valeur juste est `0.5 * 2.00 = 1.0`. Signaler dans le rapport chaque test ainsi modifié, avec l'ancienne et la nouvelle valeur attendue.

- [ ] **Step 8: Commit**

```bash
git add server/app/scoring/ server/app/models/draft.py server/app/services/draft_engine.py server/tests/unit/
git commit -m "Scoring : séparer l'incertitude partagée de l'incertitude propre au champion"
```

---

## Task 2: `comparison_sd` et le groupe de tête

**Files:**
- Modify: `server/app/scoring/aggregate.py`
- Modify: `server/app/services/draft_engine.py:316-320`
- Test: `server/tests/unit/scoring/test_aggregate.py`

**Interfaces:**
- Consumes: `Term.rel_sd`, `Term.abs_sd` (Task 1)
- Produces: `comparison_sd(terms_a, terms_b) -> float`. Volontairement **duck-typé** : il accepte aussi bien des `Term` (`app.scoring.types`) que des `ScoreTerm` (`app.models.draft`), qui portent les mêmes attributs `name`, `value`, `rel_sd`, `abs_sd`. `top_group(items)` change de signature : il prend désormais `Sequence[Tuple[float, Sequence]]` = `[(avantage, termes)]`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `server/tests/unit/scoring/test_aggregate.py` :

```python
from app.scoring.aggregate import comparison_sd, top_group


def test_identical_shared_terms_cost_nothing_in_a_comparison():
    """Le defaut central : composition et synergy identiques gonflaient le seuil."""
    a = [Term("composition", 2.0, 0.0, rel_sd=0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    b = [Term("composition", 2.0, 0.0, rel_sd=0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    assert comparison_sd(a, b) == 0.0


def test_opposite_shared_terms_cost_a_lot():
    a = [Term("composition", 2.0, 0.0, rel_sd=0.5)]
    b = [Term("composition", -2.0, 0.0, rel_sd=0.5)]
    assert math.isclose(comparison_sd(a, b), 0.5 * 4.0)


def test_independent_terms_add_in_quadrature_even_when_equal():
    """L'ignorance ne s'annule pas : deux champions inconnus restent incomparables."""
    a = [Term("meta", 0.0, 3.0)]
    b = [Term("meta", 0.0, 3.0)]
    assert math.isclose(comparison_sd(a, b), math.sqrt(18.0))


def test_term_present_on_one_side_only_still_counts():
    a = [Term("meta", 1.0, 0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    b = [Term("meta", 1.0, 0.5)]
    # synergy: rel 0.5 * (3.0 - 0.0) = 1.5 ; meta: 0.5^2 + 0.5^2
    assert math.isclose(comparison_sd(a, b), math.sqrt(1.5 ** 2 + 0.5))


def test_measured_case_becomes_decidable():
    """Jinx vs Caitlyn, termes reels d2_plus : 5.14 -> 1.29, ecart 3.03."""
    jinx = [Term("meta", 3.59, 0.23, "observed"), Term("matchup", -0.11, 0.77, "observed"),
            Term("mastery", -1.30, 0.0, rel_sd=0.4), Term("composition", 2.00, 0.0, rel_sd=0.5),
            Term("synergy", 3.00, 0.0, rel_sd=0.5), Term("mechanics", 0.0, 0.0, rel_sd=0.5)]
    caitlyn = [Term("meta", 0.41, 0.26, "observed"), Term("matchup", -1.26, 0.83, "observed"),
               Term("mastery", 0.0, 0.0, rel_sd=0.4), Term("composition", 2.00, 0.0, rel_sd=0.5),
               Term("synergy", 3.00, 0.0, rel_sd=0.5), Term("mechanics", 0.0, 0.0, rel_sd=0.5)]
    assert comparison_sd(jinx, caitlyn) < 1.5
    gap = abs(sum(t.value for t in jinx) - sum(t.value for t in caitlyn))
    assert gap > comparison_sd(jinx, caitlyn), "doit devenir decidable"


def test_top_group_uses_pairwise_comparison():
    shared = [Term("composition", 2.0, 0.0, rel_sd=0.5)]
    items = [(3.0, shared + [Term("meta", 3.0, 0.2, "observed")]),
             (2.9, shared + [Term("meta", 2.9, 0.2, "observed")]),
             (-5.0, shared + [Term("meta", -5.0, 0.2, "observed")])]
    assert top_group(items) == [0, 1], "le 3e est nettement derriere"
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_aggregate.py -q`
Expected: FAIL — `ImportError: cannot import name 'comparison_sd' from 'app.scoring.aggregate'`.

- [ ] **Step 3: Implémenter**

Dans `server/app/scoring/aggregate.py`, ajouter `comparison_sd` et remplacer `top_group` :

```python
def comparison_sd(terms_a: Sequence, terms_b: Sequence) -> float:
    """Incertitude sur la DIFFÉRENCE entre deux estimations.

    Distincte de `Estimate.sd`, qui est l'incertitude sur un champion pris
    seul. Un terme heuristique porte la même erreur de conversion pour les
    deux candidats : elle s'annule dans la différence et ne coûte que l'écart
    de valeur. Un terme observé porte une erreur d'échantillonnage propre à
    chaque champion : les variances s'additionnent.

    Accepte indifféremment des `Term` ou des `ScoreTerm` : seuls les attributs
    `name`, `value`, `rel_sd` et `abs_sd` sont lus.
    """
    by_a = {t.name: t for t in terms_a}
    by_b = {t.name: t for t in terms_b}
    var = 0.0
    for name in by_a.keys() | by_b.keys():
        ta, tb = by_a.get(name), by_b.get(name)
        va = ta.value if ta else 0.0
        vb = tb.value if tb else 0.0
        rel = max(ta.rel_sd if ta else 0.0, tb.rel_sd if tb else 0.0)
        var += (rel * (va - vb)) ** 2
        var += (ta.abs_sd if ta else 0.0) ** 2 + (tb.abs_sd if tb else 0.0) ** 2
    return math.sqrt(var)


def top_group(items: Sequence[Tuple[float, Sequence]]) -> List[int]:
    """items = [(avantage, termes)] déjà triés par avantage décroissant.

    Le groupe de tête est contigu : on avance tant que l'écart au leader reste
    sous l'incertitude de leur comparaison — pas sous la somme de leurs
    incertitudes absolues, qui compte deux fois l'erreur de modèle partagée.
    """
    if not items:
        return []
    lead_adv, lead_terms = items[0]
    group = [0]
    for i in range(1, len(items)):
        adv, terms = items[i]
        if lead_adv - adv < comparison_sd(lead_terms, terms):
            group.append(i)
        else:
            break
    return group
```

- [ ] **Step 4: Câbler le moteur**

Dans `server/app/services/draft_engine.py`, l'appel à `top_group` reçoit désormais les termes du breakdown :

```python
        group = top_group([(r.total_score, r.breakdown.terms) for r in scored])
```

- [ ] **Step 5: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS. Corriger les tests existants de `top_group` vers la nouvelle signature sans relâcher leurs assertions.

- [ ] **Step 6: Mesurer**

Run: `PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus`
Expected: consigner le score global et par catégorie. Ce n'est pas encore le baseline verrouillé.

- [ ] **Step 7: Commit**

```bash
git add server/app/scoring/aggregate.py server/app/services/draft_engine.py server/tests/unit/scoring/test_aggregate.py
git commit -m "Agrégation : incertitude de comparaison entre deux champions"
```

---

## Task 3: Rejouer le triage sur un seuil honnête

**Files:**
- Modify: `server/tests/calibration/run_calibration.py` (`assertion_separation`)
- Test: `server/tests/unit/scoring/test_calibration_diagnose.py`

**Interfaces:**
- Consumes: `comparison_sd` (Task 2). `run_calibration.py` amorce déjà `sys.path` pour le paquet `app`, donc `from app.scoring.aggregate import comparison_sd` fonctionne.
- Produces: le triage recalculé, qui débloque la Task 3 du plan principal.

- [ ] **Step 1: Écrire les tests**

Dans `server/tests/unit/scoring/test_calibration_diagnose.py`, le fixture `rec()` doit désormais porter des termes. Le remplacer et ajouter un test :

```python
from app.scoring.types import Term


def rec(name, score, sd, terms=None):
    return SimpleNamespace(champion_name=name, champion_key=name, total_score=score,
                           score_sd=sd, breakdown=SimpleNamespace(
                               terms=terms if terms is not None else [Term("meta", score, sd, "observed")]))


def test_shared_terms_no_longer_inflate_the_separation():
    """Deux champions ne differant que par meta : le seuil ne doit venir que de meta."""
    shared = [Term("composition", 2.0, 0.0, rel_sd=0.5), Term("synergy", 3.0, 0.0, rel_sd=0.5)]
    recs = [rec("A", 8.0, 0.0, shared + [Term("meta", 3.0, 0.3, "observed")]),
            rec("B", 6.0, 0.0, shared + [Term("meta", 1.0, 0.3, "observed")])]
    gap, combined, _ = assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "A", "champion_b": "B"}, recs)
    assert math.isclose(gap, 2.0)
    assert math.isclose(combined, math.sqrt(0.3 ** 2 + 0.3 ** 2))
    assert gap > combined, "decidable : les termes partages s'annulent"
```

Les six tests existants du fichier continuent d'utiliser `rec()` avec sa valeur par défaut et restent valides sans modification de leurs assertions — leur `combined` était déjà `sqrt(sd_a² + sd_b²)` sur un unique terme observé, ce que la nouvelle formule reproduit exactement.

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_calibration_diagnose.py -q`
Expected: FAIL sur `test_shared_terms_no_longer_inflate_the_separation` — `assertion_separation` calcule encore `sqrt(score_sd_a² + score_sd_b²)`, donc `combined` vaut 0,0 ici et le test échoue sur la valeur attendue.

- [ ] **Step 3: Implémenter**

Dans `server/tests/calibration/run_calibration.py`, ajouter l'import auprès des autres imports `app` :

```python
from app.scoring.aggregate import comparison_sd  # noqa: E402
```

Puis, dans `assertion_separation`, remplacer les **trois** calculs de `combined` par la comparaison par termes. Pour la branche des paires :

```python
        gap = abs(ra.total_score - rb.total_score)
        combined = comparison_sd(ra.breakdown.terms, rb.breakdown.terms)
```

Pour la branche des slots frontière :

```python
        gap = abs(rec.total_score - boundary.total_score)
        combined = comparison_sd(rec.breakdown.terms, boundary.breakdown.terms)
```

La branche `must_have_advantage_above` compare une valeur à un seuil fixe, pas à un autre champion : il n'y a pas d'erreur partagée à annuler. Elle garde `rec.score_sd`.

Mettre à jour la docstring de `assertion_separation` pour dire que l'incertitude est celle de la comparaison, pas la somme des incertitudes absolues. En anglais, langue de ce fichier.

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS.

- [ ] **Step 5: Rejouer le triage**

Run: `PYTHONIOENCODING=utf-8 .venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus --diagnose`
Expected: les quatre compteurs. Référence d'avant cette vague : indecidable=31, decidable_ok=2, decidable_ko=5, hors_ordre=14. Le nombre d'indécidables doit **chuter nettement** ; `hors_ordre` doit rester à 14, aucune assertion n'ayant changé de type.

Si `indecidable` reste au-dessus de 20, ne pas maquiller le résultat : le rapporter tel quel en DONE_WITH_CONCERNS, avec deux ou trois exemples d'assertions encore indécidables et le détail de leurs termes. Cela signifierait que l'incertitude résiduelle est portée par les termes observés, ce qui est une conclusion légitime et une information utile.

- [ ] **Step 6: Commit**

```bash
git add server/tests/calibration/run_calibration.py server/tests/unit/scoring/test_calibration_diagnose.py
git commit -m "Calibration : décidabilité jugée sur l'incertitude de comparaison"
```

---

## Task 4: Vérification et bilan de la vague 0,5

**Files:**
- Modify: `server/tests/calibration/README.md`

- [ ] **Step 1: Suite serveur complète**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS, jamais sous 114.

- [ ] **Step 2: Vérifier que le client n'a pas bougé**

```bash
cd client
npm.cmd test -- --run
npm.cmd run build
```
Expected: 24 tests Vitest passent, build Vite réussi. `ScoreTerm` a gagné deux champs additifs ; le client doit les ignorer. Un échec ici signale une régression d'API.

- [ ] **Step 3: Documenter**

Dans `server/tests/calibration/README.md`, ajouter une section `## Variance de comparaison (vague 0,5)` : le défaut mesuré (95 % de la variance portée par des constantes, `mechanics` à 0,00 facturant 17 %), la formule retenue, et le tableau des quatre compteurs avant/après.

Dire aussi, en une phrase, la distinction que le lecteur doit retenir : `Estimate.sd` répond à « que vaut ce champion dans l'absolu », `comparison_sd` à « celui-ci est-il meilleur que celui-là », et c'est leur confusion qui était le défaut.

- [ ] **Step 4: Commit**

```bash
git add server/tests/calibration/README.md
git commit -m "Bilan : variance de comparaison"
```
