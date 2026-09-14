# Qualité du moteur de scoring — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger le biais de la distribution adverse, puis départager les champions statistiquement équivalents par le risque subi, en mesurant entre les deux contre une suite de calibration remise d'aplomb.

**Architecture:** Trois vagues séquentielles. La vague 0 répare l'instrument de mesure (table rang → tier, outil de diagnostic, triage des assertions) et verrouille un baseline. La vague 1 corrige un **biais** dans `opponent_distribution` : le pick rate entre dans le bras counter, puis un exposant concentre la masse. La vague 2 exprime une **préférence** : à égalité statistique, le candidat au risque subi le plus faible passe devant. L'ordre est contraint — calibrer la préférence avant d'avoir corrigé le biais compterait la pénalité deux fois.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, pytest (+ `pytest-asyncio`). Aucun changement client, aucune migration Alembic.

**Spec:** [docs/superpowers/specs/2026-09-14-qualite-moteur-scoring-design.md](../specs/2026-09-14-qualite-moteur-scoring-design.md)

## Global Constraints

- Toutes les commandes serveur partent de `server/` et utilisent `.venv/Scripts/python.exe` (Windows).
- La suite unitaire complète doit rester verte : `.venv/Scripts/python.exe -m pytest tests/unit -q` → **105 passed** avant le début, jamais moins après une tâche.
- Les constantes de scoring vivent dans `ScoringConstants` (`app/scoring/config.py`). Aucune valeur magique dans les modules de termes.
- `Estimate.sd` ne change pas de définition : il reste la racine de la somme des variances de **tous** les termes, et reste ce que l'affichage, `confidence_from_sd` et `top_group` consomment.
- Commentaires et messages de commit en français, à l'indicatif, comme le reste du dépôt.
- Les tiers Lolalytics autorisés sont exactement ceux vérifiés le 14/09/2026 : `iron`, `bronze`, `silver`, `gold_plus`, `platinum_plus`, `emerald_plus`, `diamond_plus`, `d2_plus`. **`silver_plus`, `bronze_plus` et `iron_plus` n'existent pas** (HTTP 200, zéro champion).
- Ne jamais faire passer une assertion de calibration en forçant une constante : une hausse obtenue en cassant une catégorie est du sur-apprentissage (spec §9).

---

# Vague 0 — remettre l'instrument d'aplomb

## Task 1: Table rang → tier Lolalytics

**Files:**
- Modify: `server/app/scoring/config.py` (ajout dans `ScoringConstants`)
- Modify: `server/app/scoring/rank.py:17-19`
- Test: `server/tests/unit/scoring/test_rank.py:13-18`

**Interfaces:**
- Consumes: `config.scoring` (`app.config.config`), `RANKS` (`app.scoring.types`)
- Produces: `lolalytics_tier(rank: Optional[str], default: Optional[str] = None) -> str` — signature inchangée, correspondance modifiée. Consommé tel quel par `opponent_model.py:48`, `draft_engine.py:228` et `draft_engine.py:394`.

- [ ] **Step 1: Écrire les tests**

Remplacer `test_lolalytics_tier_falls_back_to_config_default` dans `server/tests/unit/scoring/test_rank.py` par les trois tests suivants (garder les deux autres tests du fichier intacts) :

```python
def test_lolalytics_tier_maps_each_rank_to_a_sampled_bucket():
    assert lolalytics_tier("iron") == "iron"
    assert lolalytics_tier("silver") == "silver"
    assert lolalytics_tier("gold") == "gold_plus"
    assert lolalytics_tier("emerald") == "emerald_plus"
    assert lolalytics_tier("diamond") == "diamond_plus"
    assert lolalytics_tier("master_plus") == "d2_plus"


def test_lolalytics_tier_falls_back_when_the_rank_is_unknown():
    assert lolalytics_tier(None) == "emerald_plus"
    assert lolalytics_tier(None, "master_plus") == "master_plus"
    assert lolalytics_tier("unranked", "master_plus") == "master_plus"
    assert lolalytics_tier("", "d2_plus") == "d2_plus"


def test_no_rank_maps_to_a_bucket_lolalytics_does_not_serve():
    """silver_plus, bronze_plus et iron_plus repondent 200 avec zero champion."""
    served = {"iron", "bronze", "silver", "gold_plus", "platinum_plus",
              "emerald_plus", "diamond_plus", "d2_plus"}
    for rank in RANKS:
        assert lolalytics_tier(rank) in served, f"{rank} pointe vers un bucket vide"
```

Ajouter l'import de `RANKS` en tête du fichier :

```python
from app.scoring.rank import counter_lambda, lolalytics_tier, mastery_rank_factor, normalize_rank
from app.scoring.types import RANKS
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_rank.py -q`
Expected: FAIL — `assert 'gold' == 'gold_plus'` (la correspondance actuelle est l'identité).

- [ ] **Step 3: Implémenter**

Dans `server/app/scoring/config.py`, ajouter à `ScoringConstants`, juste après le bloc `# Adversaire futur` :

```python
    # Rang → tier Lolalytics. Buckets vérifiés le 14/09/2026 : Lolalytics ne
    # fournit de bucket `_plus` qu'à partir de gold (silver_plus, bronze_plus
    # et iron_plus répondent 200 avec zéro champion), d'où les buckets exacts
    # en bas de ladder. master_plus est servi par d2_plus : 2,1× plus de
    # parties, population toujours de haut niveau.
    rank_tier_map: Dict[str, str] = {
        "iron": "iron", "bronze": "bronze", "silver": "silver",
        "gold": "gold_plus", "platinum": "platinum_plus",
        "emerald": "emerald_plus", "diamond": "diamond_plus",
        "master_plus": "d2_plus",
    }
```

Dans `server/app/scoring/rank.py`, remplacer `lolalytics_tier` :

```python
def lolalytics_tier(rank: Optional[str], default: Optional[str] = None) -> str:
    """Tier Lolalytics pour un rang ; `default` = tier du fetcher (config.rank_tier sinon)."""
    mapped = config.scoring.rank_tier_map.get(rank) if rank else None
    return mapped or default or config.rank_tier
```

L'import de `RANKS` dans `rank.py` reste utilisé par `normalize_rank` — ne pas le retirer.

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS — 107 passed (105 existants, +2 nets sur `test_rank.py`).

- [ ] **Step 5: Commit**

```bash
git add server/app/scoring/config.py server/app/scoring/rank.py server/tests/unit/scoring/test_rank.py
git commit -m "Rang : table explicite vers les tiers Lolalytics réellement servis"
```

---

## Task 2: Diagnostic de décidabilité et sélection du rang dans la calibration

**Files:**
- Modify: `server/tests/calibration/run_calibration.py` (ajout de `assertion_separation`, des drapeaux `--rank` et `--diagnose`, du rapport de diagnostic)
- Test: `server/tests/unit/scoring/test_calibration_diagnose.py` (créer)

**Interfaces:**
- Consumes: `find_rank(recs, name) -> Tuple[Optional[int], Optional[Any]]` (déjà dans `run_calibration.py:143`). Les objets de `recs` sont des `Recommendation` : attributs `champion_name`, `champion_key`, `total_score`, `score_sd`.
- Produces: `assertion_separation(a: Dict[str, Any], recs: List) -> Optional[Tuple[float, float, str]]` → `(écart, incertitude_combinée, libellé)`, ou `None` si l'assertion ne porte pas sur un ordre.

- [ ] **Step 1: Écrire les tests**

Créer `server/tests/unit/scoring/test_calibration_diagnose.py` :

```python
"""Le triage des assertions de calibration doit être mécanique et reproductible."""
import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace

# run_calibration.py est un script hors package : chargement par chemin.
_PATH = Path(__file__).resolve().parents[2] / "calibration" / "run_calibration.py"
_spec = importlib.util.spec_from_file_location("run_calibration", _PATH)
run_calibration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_calibration)
assertion_separation = run_calibration.assertion_separation


def rec(name, score, sd):
    return SimpleNamespace(champion_name=name, champion_key=name,
                           total_score=score, score_sd=sd)


RECS = [rec("Caitlyn", 3.0, 1.0), rec("Jinx", 2.5, 1.0),
        rec("Ezreal", 0.0, 1.0), rec("Yasuo", -4.0, 1.0)]


def test_pair_assertion_reports_gap_and_combined_uncertainty():
    gap, combined, _ = assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Yasuo"}, RECS)
    assert math.isclose(gap, 7.0)
    assert math.isclose(combined, math.sqrt(2.0))


def test_undecidable_pair_has_gap_below_combined_uncertainty():
    gap, combined, _ = assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Jinx"}, RECS)
    assert gap < combined, "0.5 d'écart pour ±1.41 : la donnée ne porte pas la question"


def test_top_n_assertion_compares_against_the_boundary_slot():
    gap, combined, label = assertion_separation(
        {"type": "must_be_in_top_3", "champion": "Yasuo"}, RECS)
    assert math.isclose(gap, 4.0), "Yasuo (-4.0) contre le 3e, Ezreal (0.0)"
    assert "Ezreal" in label


def test_champion_already_at_the_boundary_compares_against_its_neighbour():
    gap, _, label = assertion_separation(
        {"type": "must_be_in_top_3", "champion": "Ezreal"}, RECS)
    assert math.isclose(gap, 4.0), "Ezreal est lui-meme 3e : on le compare au 4e"
    assert "Yasuo" in label


def test_threshold_assertion_compares_advantage_to_the_threshold():
    gap, combined, _ = assertion_separation(
        {"type": "must_have_advantage_above", "champion": "Caitlyn", "min_advantage": 1.0}, RECS)
    assert math.isclose(gap, 2.0) and math.isclose(combined, 1.0)


def test_non_ordering_assertions_have_no_separation():
    for a in ({"type": "must_be_tied", "champion_a": "Caitlyn", "champion_b": "Jinx"},
              {"type": "must_have_reason_containing", "champion": "Caitlyn", "substring": "x"},
              {"type": "must_not_have_reason_containing", "champion": "Caitlyn", "substring": "x"}):
        assert assertion_separation(a, RECS) is None


def test_absent_champion_has_no_separation():
    assert assertion_separation(
        {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Zeri"}, RECS) is None
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_calibration_diagnose.py -q`
Expected: FAIL — `AttributeError: module 'run_calibration' has no attribute 'assertion_separation'`.

- [ ] **Step 3: Implémenter `assertion_separation`**

Dans `server/tests/calibration/run_calibration.py`, insérer juste après `evaluate_assertion` (après la ligne `return False, f"Unknown assertion type: {t}"`) :

```python
# Index du slot frontière testé par chaque assertion de position.
_BOUNDARY_SLOT = {"must_be_top_1": 0, "must_be_in_top_3": 2,
                  "must_be_in_top_5": 4, "must_not_be_top_3": 2}


def assertion_separation(a: Dict[str, Any], recs: List) -> Optional[Tuple[float, float, str]]:
    """Écart observé et incertitude combinée pour une assertion d'ordre.

    Sert au triage : une assertion dont l'écart reste sous l'incertitude
    combinée pose une question que la donnée ne tranche pas, quel que soit le
    moteur. Retourne None pour les assertions qui ne portent pas sur un ordre
    (raisons, égalité explicite) et quand un champion est absent du top 15.
    """
    t = a["type"]

    if t == "must_rank_higher_than":
        _, ra = find_rank(recs, a["champion_a"])
        _, rb = find_rank(recs, a["champion_b"])
        if ra is None or rb is None:
            return None
        gap = abs(ra.total_score - rb.total_score)
        combined = math.sqrt(ra.score_sd ** 2 + rb.score_sd ** 2)
        return gap, combined, f"{a['champion_a']} vs {a['champion_b']}"

    if t in _BOUNDARY_SLOT:
        slot = _BOUNDARY_SLOT[t]
        rank, rec = find_rank(recs, a["champion"])
        if rec is None or len(recs) <= slot:
            return None
        # Le champion occupe deja le slot frontiere : on le compare au suivant.
        other = slot if rank != slot else min(slot + 1, len(recs) - 1)
        if other == rank:
            return None
        boundary = recs[other]
        gap = abs(rec.total_score - boundary.total_score)
        combined = math.sqrt(rec.score_sd ** 2 + boundary.score_sd ** 2)
        return gap, combined, f"{a['champion']} vs #{other + 1} {boundary.champion_name}"

    if t == "must_have_advantage_above":
        _, rec = find_rank(recs, a["champion"])
        if rec is None:
            return None
        return (abs(rec.total_score - a["min_advantage"]), rec.score_sd,
                f"{a['champion']} vs seuil {a['min_advantage']:+.2f}")

    return None
```

`Optional` et `Tuple` sont déjà importés. **`math` ne l'est pas** — l'ajouter à la liste des imports standard, en ordre alphabétique entre `json` et `sys` :

```python
import json
import math
import sys
```

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_calibration_diagnose.py -q`
Expected: PASS — 7 passed.

- [ ] **Step 5: Ajouter les drapeaux `--rank` et `--diagnose`**

Dans `main()`, après `parser.add_argument("--cases", ...)` :

```python
    parser.add_argument("--rank", help="Rang joueur applique a tous les cas sans rank_bucket explicite "
                                       "(iron, bronze, silver, gold, platinum, emerald, diamond, master_plus)")
    parser.add_argument("--diagnose", action="store_true",
                        help="Trie les assertions d'ordre par decidabilite au lieu de juger reussite/echec")
```

Juste après le filtrage par catégorie (après le bloc `if args.filter:`) :

```python
    if args.rank:
        for case in cases:
            case.setdefault("setup", {}).setdefault("rank_bucket", args.rank)
```

- [ ] **Step 6: Produire le rapport de diagnostic**

Ajouter, à côté de `print_case_report` :

```python
def print_case_diagnosis(case: Dict[str, Any], recs: List, results: List[Tuple]) -> List[str]:
    """Affiche la decidabilite de chaque assertion. Retourne un verdict par assertion."""
    verdicts: List[str] = []
    print(f"{C.BOLD}{case['id']}{C.RESET} {C.DIM}[{case.get('category', '?')}]{C.RESET}")
    for (a, passed, message) in results:
        sep = assertion_separation(a, recs)
        if sep is None:
            verdicts.append("hors_ordre")
            print(f"  {C.DIM}·{C.RESET} {a['type']}: hors perimetre du triage")
            continue
        gap, combined, label = sep
        if gap < combined:
            verdicts.append("indecidable")
            print(f"  {C.YELLOW}~{C.RESET} {label}: ecart {gap:.2f} < incertitude {combined:.2f} "
                  f"{C.YELLOW}INDECIDABLE -> must_be_tied{C.RESET}")
        elif passed:
            verdicts.append("decidable_ok")
            print(f"  {C.GREEN}✓{C.RESET} {label}: ecart {gap:.2f} >= {combined:.2f} — conservee")
        else:
            verdicts.append("decidable_ko")
            print(f"  {C.RED}✗{C.RESET} {label}: ecart {gap:.2f} >= {combined:.2f} "
                  f"{C.RED}ARBITRAGE{C.RESET} — {message}")
    return verdicts
```

Dans la boucle de `main()`, remplacer l'appel `print_case_report(case, recs, results, args.verbose)` par :

```python
            if args.diagnose:
                diagnosis.extend(print_case_diagnosis(case, recs, results))
            else:
                print_case_report(case, recs, results, args.verbose)
```

Déclarer `diagnosis: List[str] = []` à côté de `total_pass = 0`, et afficher le récapitulatif avant le `return` final de `main()` :

```python
    if args.diagnose:
        counts = Counter(diagnosis)
        print(f"\n{C.BOLD}Triage des assertions{C.RESET}")
        print(f"  indecidables (-> must_be_tied) : {counts['indecidable']}")
        print(f"  decidables reussies (conservees) : {counts['decidable_ok']}")
        print(f"  {C.RED}decidables echouees (arbitrage) : {counts['decidable_ko']}{C.RESET}")
        print(f"  hors perimetre du triage        : {counts['hors_ordre']}")
        return 0
```

Ajouter `Counter` à l'import `collections` existant : `from collections import Counter, defaultdict`.

- [ ] **Step 7: Vérifier le diagnostic de bout en bout**

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus --diagnose`
Expected: le rapport liste chaque assertion en INDECIDABLE / conservee / ARBITRAGE, puis les quatre compteurs. Code de sortie 0. Premier lancement lent (réseau).

- [ ] **Step 8: Commit**

```bash
git add server/tests/calibration/run_calibration.py server/tests/unit/scoring/test_calibration_diagnose.py
git commit -m "Calibration : triage par décidabilité et sélection du rang"
```

---

## Task 3: Triage, arbitrage et verrouillage du baseline

**Files:**
- Modify: `server/tests/calibration/cases.json`
- Modify: `server/tests/calibration/README.md` (section « Cas à revoir après le passage en points de win rate » → remplacée par le nouveau baseline)

**Interfaces:**
- Consumes: `run_calibration.py --rank master_plus --diagnose` (Task 2), `lolalytics_tier` (Task 1)
- Produces: une suite verrouillée qui sert de référence aux vagues 1 et 2. **Aucune tâche suivante ne doit modifier `cases.json`.**

> Cette tâche comporte un arbitrage humain. Elle ne peut pas être exécutée de bout en bout par un agent : les cas classés `ARBITRAGE` doivent être soumis au joueur, qui tranche. Ne pas deviner à sa place — un cas mal arbitré empoisonne toutes les mesures qui suivent.

- [ ] **Step 1: Enregistrer le diagnostic de référence**

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus --diagnose > ../diagnostic-avant.txt`
Expected: fichier écrit, quatre compteurs en fin de rapport. Ce fichier n'est pas commité.

- [ ] **Step 2: Convertir les assertions indécidables**

Pour chaque ligne `INDECIDABLE` du diagnostic, dans `cases.json`, remplacer l'assertion par une égalité explicite :

```json
{"type": "must_be_tied", "champion_a": "Syndra", "champion_b": "Orianna"}
```

Règle de conversion :
- `must_rank_higher_than` (a, b) → `must_be_tied` (a, b).
- `must_be_top_1`, `must_be_in_top_3`, `must_be_in_top_5`, `must_not_be_top_3` → `must_be_tied` entre le champion et le champion de la frontière nommé dans le libellé du diagnostic.

Ne rien supprimer : une assertion convertie reste une information (« ces deux-là ne sont pas départageables »).

- [ ] **Step 3: Soumettre les cas d'arbitrage au joueur**

Pour chaque ligne `ARBITRAGE`, présenter au joueur :
- l'`id` du cas, sa `description` et son `setup` (rôle, ordre de pick, picks alliés et ennemis, pool) ;
- le top 5 renvoyé par le moteur avec l'avantage et le σ de chacun ;
- le détail des termes des deux champions concernés.

Le top 5 et les termes s'obtiennent avec :

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus --verbose -f <categorie>`

Commencer par les cas ADC/bot, rôle sur lequel le jugement du joueur est le plus solide. Demander une réponse par cas : quel est le bon pick, et pourquoi.

- [ ] **Step 4: Réécrire les assertions arbitrées**

Appliquer la réponse du joueur :
- le joueur confirme l'attente → l'assertion reste telle quelle, c'est une **vraie erreur du moteur** à corriger en vague 1 ou 2 ;
- le joueur donne raison au moteur → réécrire l'assertion dans le sens du moteur ;
- le joueur juge les deux acceptables → `must_be_tied`.

Noter dans la `description` du cas la justification donnée par le joueur quand elle éclaire le choix.

- [ ] **Step 5: Établir le baseline verrouillé**

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus`
Expected: rapport standard avec le score global et le détail par catégorie. Noter ces chiffres : **ils sont la référence des vagues 1 et 2.**

- [ ] **Step 6: Documenter le baseline**

Dans `server/tests/calibration/README.md`, remplacer entièrement la section `## Cas à revoir après le passage en points de win rate` par une section `## Baseline verrouillé du 14 septembre 2026` contenant :
- le tier utilisé (`master_plus` → `d2_plus`) et la commande exacte qui le reproduit ;
- le tableau du score global et par catégorie ;
- le nombre d'assertions converties en `must_be_tied` et le nombre arbitrées ;
- la phrase : « Ce baseline est la référence des vagues 1 et 2. `cases.json` ne doit pas être modifié tant que ces vagues ne sont pas terminées. »

Mettre également à jour la table des types d'assertion si un type a changé de sémantique (elle ne devrait pas avoir bougé).

- [ ] **Step 7: Commit**

```bash
git add server/tests/calibration/cases.json server/tests/calibration/README.md
git commit -m "Calibration : suite triée, arbitrée et baseline verrouillé à d2_plus"
```

---

# Vague 1 — corriger le biais de la distribution adverse

## Task 4: Le pick rate entre dans le bras counter

**Files:**
- Modify: `server/app/scoring/opponent_model.py:19-27`
- Test: `server/tests/unit/scoring/test_opponent_model.py`

**Interfaces:**
- Consumes: `Candidate = Tuple[int, float, Optional[float]]` — `(champion_id, pick_rate, d2 rétréci ou None)`
- Produces: `opponent_distribution(candidates: Sequence[Candidate], lam_q: float, alpha: float = 1.0) -> Dict[int, float]`. Le paramètre `alpha` est ajouté ici avec une valeur par défaut neutre ; la Task 5 le câble sur la configuration.

- [ ] **Step 1: Écrire les tests**

Ajouter à `server/tests/unit/scoring/test_opponent_model.py`, après `test_distribution_without_counter_signal_falls_back_to_meta` :

```python
def test_counter_mass_follows_pick_rate_at_equal_threat():
    """Un counter deux fois plus joué pèse deux fois plus dans la distribution."""
    cands = [(1, 10.0, -4.0), (2, 5.0, -4.0), (3, 10.0, 1.0)]
    d = opponent_distribution(cands, 1.0)
    assert math.isclose(d[1], 2 * d[2])
    assert d[3] == 0.0, "un matchup favorable n'est pas une menace"


def test_rare_hard_counter_weighs_less_than_common_soft_counter():
    """Vel'Koz bot counter fort mais rare ; le pick rate doit le ramener a sa place."""
    cands = [(1, 0.6, -7.0), (2, 12.0, -2.0)]
    d = opponent_distribution(cands, 1.0)
    assert d[2] > d[1]


def test_uniform_pick_rates_keep_counter_mass_proportional_to_threat():
    """Garde anti-regression : a pick rates egaux, on retrouve le comportement d'avant."""
    cands = [(1, 10.0, -6.0), (2, 10.0, -2.0), (3, 10.0, 0.0)]
    d = opponent_distribution(cands, 1.0)
    assert math.isclose(d[1], 0.75) and math.isclose(d[2], 0.25) and d[3] == 0.0
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_opponent_model.py -q`
Expected: FAIL sur `test_counter_mass_follows_pick_rate_at_equal_threat` — la distribution actuelle donne `d[1] == d[2]`, le pick rate étant ignoré.

- [ ] **Step 3: Implémenter**

Dans `server/app/scoring/opponent_model.py`, remplacer `opponent_distribution` :

```python
def opponent_distribution(candidates: Sequence[Candidate], lam_q: float, alpha: float = 1.0) -> Dict[int, float]:
    """Mélange d'un bras méta (ce qui se joue) et d'un bras counter (ce qui punit).

    Le bras counter pondère la menace par le pick rate : l'adversaire prend un
    counter qu'il joue. `alpha` concentre la masse sur les pires matchups.
    """
    total_pr = sum(pr for _, pr, _ in candidates)
    if not candidates or total_pr <= 0:
        return {}
    p_meta = {cid: pr / total_pr for cid, pr, _ in candidates}
    weight = {cid: pr * max(0.0, -(d2 or 0.0)) ** alpha for cid, pr, d2 in candidates}
    total_weight = sum(weight.values())
    p_counter = {cid: w / total_weight for cid, w in weight.items()} if total_weight > 0 else p_meta
    return {cid: (1 - lam_q) * p_meta[cid] + lam_q * p_counter[cid] for cid in p_meta}
```

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS — 117 passed (105 au départ, +2 Task 1, +7 Task 2, +3 ici). Les deux tests historiques de distribution restent verts : dans le premier, seul le champion 1 est une menace, donc `p_counter[1]` vaut toujours 1,0 ; le second ne dépend que du repli sans menace.

- [ ] **Step 5: Mesurer l'effet isolé du pick rate**

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus`
Expected: comparer le score global et par catégorie au baseline de la Task 3. Consigner l'écart. Ne rien ajuster à ce stade.

- [ ] **Step 6: Commit**

```bash
git add server/app/scoring/opponent_model.py server/tests/unit/scoring/test_opponent_model.py
git commit -m "Adversaire futur : le pick rate pondère le bras counter"
```

---

## Task 5: Concentration de la distribution par l'exposant α

**Files:**
- Modify: `server/app/scoring/config.py` (ajout dans `ScoringConstants`)
- Modify: `server/app/scoring/opponent_model.py:70` (câblage de la constante)
- Test: `server/tests/unit/scoring/test_opponent_model.py`

**Interfaces:**
- Consumes: `opponent_distribution(candidates, lam_q, alpha)` (Task 4), `config.scoring`
- Produces: `config.scoring.counter_alpha: float`

- [ ] **Step 1: Écrire les tests**

Ajouter à `server/tests/unit/scoring/test_opponent_model.py` :

```python
def test_alpha_concentrates_mass_on_the_worst_matchup():
    cands = [(1, 10.0, -6.0), (2, 10.0, -3.0), (3, 10.0, -1.0)]
    flat = opponent_distribution(cands, 1.0, 1.0)
    sharp = opponent_distribution(cands, 1.0, 3.0)
    assert sharp[1] > flat[1], "le pire matchup capte plus de masse"
    assert sharp[3] < flat[3], "le matchup le plus doux en capte moins"
    assert math.isclose(sum(sharp.values()), 1.0)


def test_alpha_is_monotonic_on_the_worst_matchup():
    cands = [(1, 10.0, -6.0), (2, 10.0, -3.0), (3, 10.0, -1.0)]
    shares = [opponent_distribution(cands, 1.0, a)[1] for a in (1.0, 1.5, 2.0, 3.0)]
    assert shares == sorted(shares), "la concentration croît avec alpha"


def test_alpha_never_breaks_the_no_threat_fallback():
    cands = [(1, 10.0, 2.0), (2, 10.0, None)]
    assert opponent_distribution(cands, 0.5, 3.0) == opponent_distribution(cands, 0.0, 3.0)


def test_counter_alpha_is_a_rank_independent_scalar():
    """counter_lambda encode deja le rang : y redoubler alpha serait du double comptage."""
    from app.config import config
    assert isinstance(config.scoring.counter_alpha, float)
    assert config.scoring.counter_alpha >= 1.0
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_opponent_model.py -q`
Expected: FAIL sur `test_counter_alpha_is_a_rank_independent_scalar` — `AttributeError: 'ScoringConstants' object has no attribute 'counter_alpha'`. Les trois tests de concentration passent déjà : `alpha` existe depuis la Task 4, ils verrouillent son contrat. Le changement de comportement de cette tâche est le **câblage** de la constante, vérifié au Step 5.

- [ ] **Step 3: Câbler la constante**

Dans `server/app/scoring/config.py`, ajouter à `ScoringConstants`, sous le bloc `# Adversaire futur`, à côté de `counter_lambda_unknown` :

```python
    # Concentration du bras counter. 1.0 = masse proportionnelle à la menace ;
    # au-dessus, la masse se resserre sur les pires matchups. Volontairement
    # indépendant du rang : counter_lambda encode déjà le rang.
    counter_alpha: float = 2.0
```

Dans `server/app/scoring/opponent_model.py`, à la ligne qui construit la distribution :

```python
    dist = opponent_distribution(candidates, lam_q, c.counter_alpha)
```

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS — 121 passed.

- [ ] **Step 5: Calibrer α**

Pour chaque valeur de `counter_alpha` dans `1.0, 1.5, 2.0, 2.5, 3.0` : modifier la constante, puis

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus`

Consigner le score global **et le détail par catégorie** de chaque valeur. Retenir la valeur qui monte le score global **sans qu'aucune catégorie ne perde plus qu'elle ne gagne** (README de la calibration, « Workflow for tuning weights », étape 4). En cas d'égalité, préférer la valeur la plus basse : moins de concentration, moins d'hypothèse.

**Contrôle de câblage** : si `α = 1.0` et `α = 3.0` donnent exactement le même score global et les mêmes catégories, la constante n'est pas lue — revérifier la ligne `dist = opponent_distribution(candidates, lam_q, c.counter_alpha)` du Step 3. Un balayage entièrement plat est un bug, pas un résultat.

Vérifier au passage le cas de référence de la spec :

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus --verbose -f blind_pick`
Expected: observer si Yasuo redescend sous Lux sans intervention de la vague 2. Consigner la réponse — elle décide du dimensionnement de la vague 2.

- [ ] **Step 6: Commit**

```bash
git add server/app/scoring/config.py server/app/scoring/opponent_model.py server/tests/unit/scoring/test_opponent_model.py
git commit -m "Adversaire futur : concentration du bras counter par l'exposant alpha"
```

---

# Vague 2 — le risque subi départage le groupe de tête

## Task 6: Séparer le risque subi de l'incertitude d'estimation

**Files:**
- Modify: `server/app/scoring/types.py:11-34`
- Modify: `server/app/scoring/opponent_model.py:66-73`
- Test: `server/tests/unit/scoring/test_opponent_model.py`, `server/tests/unit/scoring/test_aggregate.py`

**Interfaces:**
- Consumes: `Term`, `Estimate` (`app.scoring.types`)
- Produces: `Term.outcome_sd: float = 0.0` (invariant `outcome_sd <= sd`, imposé à la construction) et `Estimate.outcome_sd -> float` (composition en quadrature). `Estimate.sd` **inchangé**.

- [ ] **Step 1: Écrire les tests**

Ajouter à `server/tests/unit/scoring/test_aggregate.py` :

```python
from app.scoring.types import Estimate, Term


def test_outcome_sd_defaults_to_zero_and_never_exceeds_total_sd():
    assert Term("meta", 1.0, 2.0).outcome_sd == 0.0
    assert Term("future_opponent", 0.0, 2.0, outcome_sd=5.0).outcome_sd == 2.0, "invariant outcome_sd <= sd"


def test_estimate_composes_outcome_sd_in_quadrature_without_touching_sd():
    est = Estimate(terms=[Term("meta", 1.0, 3.0),
                          Term("future_opponent", 0.0, 4.0, outcome_sd=4.0)])
    assert math.isclose(est.sd, 5.0), "sd inchange : tous les termes comptent"
    assert math.isclose(est.outcome_sd, 4.0), "seul le risque subi compte"


def test_estimate_without_outcome_risk_has_zero_outcome_sd():
    est = Estimate(terms=[Term("meta", 1.0, 3.0), Term("mastery", 2.0, 1.5)])
    assert est.outcome_sd == 0.0 and est.sd > 0.0
```

Vérifier que `import math` est présent en tête de `test_aggregate.py` ; l'ajouter sinon.

Ajouter à `server/tests/unit/scoring/test_opponent_model.py` :

```python
@pytest.mark.asyncio
async def test_future_term_without_data_carries_no_outcome_risk(catalog):
    """Branche « aucune page de counters » : c'est de l'ignorance, pas du risque."""
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    matchup.counters = lambda *a, **k: {}
    meta.load_tierlist = AsyncMock()
    matchup.load_matchups = AsyncMock()
    draft = DraftState(my_role="top", enemy_picks=[{"champion_id": 103}])
    term = await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", draft, None)
    assert term is not None and term.sd > 0.0
    assert term.outcome_sd == 0.0
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/scoring/test_aggregate.py tests/unit/scoring/test_opponent_model.py -q`
Expected: FAIL — `TypeError: Term.__init__() got an unexpected keyword argument 'outcome_sd'`.

- [ ] **Step 3: Implémenter**

Dans `server/app/scoring/types.py`, remplacer `Term` et compléter `Estimate` :

```python
@dataclass
class Term:
    name: str
    value: float
    sd: float
    source: str = "heuristic"
    sample: int = 0
    note: str = ""
    outcome_sd: float = 0.0  # part du σ qui est un risque subi, pas une ignorance

    def __post_init__(self):
        # Un risque subi ne peut pas dépasser l'incertitude totale du terme.
        self.outcome_sd = min(max(0.0, self.outcome_sd), max(0.0, self.sd))
```

Ajouter à `Estimate`, après la propriété `sd` :

```python
    @property
    def outcome_sd(self) -> float:
        """Risque subi seul : ce que le joueur ne peut pas savoir au moment du pick.

        Distinct de `sd`, qui agrège aussi l'incertitude d'estimation. Sert au
        départage du groupe de tête, jamais à l'affichage.
        """
        return math.sqrt(sum(t.outcome_sd * t.outcome_sd for t in self.terms))
```

Dans `server/app/scoring/opponent_model.py`, au `return` final de `future_opponent_term` (branche **avec** données), renseigner le risque subi — la dispersion sur les adversaires possibles en est exactement un :

```python
    return Term("future_opponent", value, sd, "observed",
                sum(counters[cid][1] for cid in dist if cid in counters),
                f"{len(dist)} adversaires possibles, λ={lam_q:.2f}", outcome_sd=sd)
```

Ne pas toucher au `return` de la branche sans données : son `outcome_sd` doit rester à 0.

- [ ] **Step 4: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS — 125 passed.

- [ ] **Step 5: Commit**

```bash
git add server/app/scoring/types.py server/app/scoring/opponent_model.py server/tests/unit/scoring/test_aggregate.py server/tests/unit/scoring/test_opponent_model.py
git commit -m "Scoring : distinguer le risque subi de l'incertitude d'estimation"
```

---

## Task 7: Départager le groupe de tête par le risque subi

**Files:**
- Modify: `server/app/models/draft.py:199-207` (champ additif sur `Recommendation`)
- Modify: `server/app/services/draft_engine.py:316-320` (réordonnancement), `server/app/services/draft_engine.py:462` (propagation)
- Test: `server/tests/unit/test_engine_and_api.py`

**Interfaces:**
- Consumes: `Estimate.outcome_sd` (Task 6), `top_group(items) -> List[int]` (`app.scoring.aggregate`)
- Produces: `Recommendation.outcome_sd: float = 0.0`. Les recommandations sont renvoyées triées par espérance décroissante, le groupe de tête réordonné par `outcome_sd` croissant.

- [ ] **Step 1: Écrire les tests**

Ajouter à `server/tests/unit/test_engine_and_api.py` :

```python
from app.models.draft import Recommendation
from app.scoring.aggregate import top_group


def _reorder_head_by_risk(scored):
    """Reproduit le departage du moteur sur une liste deja triee par esperance."""
    group = top_group([(r.total_score, r.score_sd) for r in scored])
    if len(group) > 1:
        head = sorted((scored[i] for i in group), key=lambda r: r.outcome_sd)
        for slot, rec in zip(group, head):
            scored[slot] = rec
    return scored, group


def _rec(cid, name, score, sd, outcome_sd):
    return Recommendation(champion_id=cid, champion_name=name, champion_key=name,
                          total_score=score, score_sd=sd, outcome_sd=outcome_sd)


def test_safest_candidate_leads_a_statistical_tie():
    """Yasuo +1.82 ±3.29 (risque 2.52) contre Lux +1.06 ±2.68 (risque 1.64)."""
    scored = [_rec(157, "Yasuo", 1.82, 3.29, 2.52), _rec(99, "Lux", 1.06, 2.68, 1.64)]
    scored, group = _reorder_head_by_risk(scored)
    assert len(group) == 2, "l'ecart 0.76 reste sous l'incertitude combinee 4.24"
    assert scored[0].champion_name == "Lux"


def test_clear_favourite_is_never_demoted_by_its_risk():
    """Hors groupe de tete, l'esperance seule classe : le risque ne renverse rien."""
    scored = [_rec(1, "Fort", 9.0, 0.5, 0.5), _rec(2, "Sur", 1.0, 0.5, 0.0)]
    scored, group = _reorder_head_by_risk(scored)
    assert group == [0] and scored[0].champion_name == "Fort"


def test_tiebreak_is_inert_when_no_candidate_carries_outcome_risk():
    """En last pick, future_opponent est absent : outcome_sd nul partout."""
    scored = [_rec(1, "A", 2.0, 3.0, 0.0), _rec(2, "B", 1.5, 3.0, 0.0)]
    scored, _ = _reorder_head_by_risk(scored)
    assert [r.champion_name for r in scored] == ["A", "B"], "ordre de l'esperance conserve"
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `.venv/Scripts/python.exe -m pytest tests/unit/test_engine_and_api.py -q`
Expected: FAIL — `AttributeError: 'Recommendation' object has no attribute 'outcome_sd'`, levé par la clé de tri `key=lambda r: r.outcome_sd`. Pydantic ignore silencieusement le champ inconnu passé à `_rec()` ; c'est la lecture qui échoue, pas la construction.

- [ ] **Step 3: Ajouter le champ au modèle**

Dans `server/app/models/draft.py`, dans `Recommendation`, juste après `score_sd` :

```python
    outcome_sd: float = 0.0                     # part du σ qui est un risque subi (adversaire futur)
```

- [ ] **Step 4: Propager depuis l'estimation**

Dans `server/app/services/draft_engine.py`, à la construction de la recommandation (ligne ~462) :

```python
            total_score=est.total, score_sd=est.sd, outcome_sd=est.outcome_sd, breakdown=breakdown,
```

- [ ] **Step 5: Réordonner le groupe de tête**

Dans `server/app/services/draft_engine.py`, remplacer le bloc de tri (lignes ~316-320) :

```python
        scored.sort(key=lambda r: r.total_score, reverse=True)
        group = top_group([(r.total_score, r.score_sd) for r in scored])
        if len(group) > 1:
            # À égalité statistique, le plus sûr passe devant. Seul le risque
            # subi départage : l'incertitude d'estimation dit qu'on manque de
            # données, pas que le pick est risqué. En last pick, future_opponent
            # est absent, outcome_sd est nul partout et ce départage est inerte.
            head = sorted((scored[i] for i in group), key=lambda r: r.outcome_sd)
            for slot, rec in zip(group, head):
                scored[slot] = rec
        for i in group:
            scored[i].tie_with_leader = True
        top_group_ids = [scored[i].champion_id for i in group]
```

Le groupe est déterminé par l'espérance, l'ordre **à l'intérieur** par le risque : cette séparation évite le point fixe qu'un tri unique introduirait. `scored[0]` alimente aussi les avertissements de composition et `win_probability` plus bas dans la fonction ; ces deux valeurs suivront le nouveau leader, ce qui est le comportement voulu.

- [ ] **Step 6: Lancer les tests**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS — 128 passed.

- [ ] **Step 7: Mesurer**

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus`
Expected: comparer au baseline de la Task 3 et à la mesure de la Task 5. Consigner le score global et par catégorie.

Run: `.venv/Scripts/python.exe tests/calibration/run_calibration.py --rank master_plus --diagnose`
Expected: comparer les compteurs à ceux de la Task 3. La concentration de la vague 1 a pu rendre décidables des assertions converties en `must_be_tied` — c'est un **résultat** à consigner, pas une raison de rouvrir `cases.json` maintenant.

- [ ] **Step 8: Commit**

```bash
git add server/app/models/draft.py server/app/services/draft_engine.py server/tests/unit/test_engine_and_api.py
git commit -m "Moteur : le risque subi départage le groupe de tête"
```

---

## Task 8: Vérification complète et bilan

**Files:**
- Modify: `server/tests/calibration/README.md` (bilan des trois vagues)
- Modify: `REPRISE_PROJET.md` (nouvelle section de bilan)

**Interfaces:**
- Consumes: toutes les tâches précédentes

- [ ] **Step 1: Suite serveur complète**

Run: `.venv/Scripts/python.exe -m pytest tests/unit -q`
Expected: PASS — 128 passed.

- [ ] **Step 2: Vérifier que le client n'a pas bougé**

```bash
cd client
npm.cmd test -- --run
npm.cmd run build
```
Expected: 24 tests Vitest passent, build Vite réussi. Aucun fichier client n'a été modifié par ce plan : un échec ici signale une régression d'API inattendue.

- [ ] **Step 3: Écrire le bilan de calibration**

Dans `server/tests/calibration/README.md`, ajouter une section `## Bilan des trois vagues` avec un tableau à quatre colonnes : baseline verrouillé (Task 3), après pick rate (Task 4), après α (Task 5), après départage (Task 7) — score global et détail par catégorie.

Consigner explicitement :
- la valeur de `counter_alpha` retenue et pourquoi les autres ont été écartées ;
- si Yasuo est redescendu à la vague 1 seule, ou s'il a fallu le départage ;
- si `γ` (spec §5.5) s'est avéré nécessaire — et s'il ne l'a pas été, le dire, c'est le résultat attendu ;
- les assertions redevenues décidables après la vague 1.

- [ ] **Step 4: Mettre à jour le bilan projet**

Dans `REPRISE_PROJET.md`, ajouter une section `## Qualité du moteur de scoring (14 septembre 2026)` : ce qui a changé, les chiffres de vérification, et ce qui reste ouvert — la décision sur les buckets `_plus` de gold à diamond (spec §3), et le fait que le jugement du joueur n'a porté que sur le rôle ADC/bot.

- [ ] **Step 5: Commit**

```bash
git add server/tests/calibration/README.md REPRISE_PROJET.md
git commit -m "Bilan : qualité du moteur de scoring"
```
