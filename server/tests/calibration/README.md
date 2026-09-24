# DALIA — Calibration Suite

Regression tests for the recommendation engine. Loads scenarios from
`cases.json`, calls `DraftEngine.recommend` directly (no HTTP), and verifies
that the rankings meet the expected assertions. Useful to detect regressions
when you tune the scoring terms in `app/scoring/` or the orchestration in
`app/services/draft_engine.py`.

Depuis septembre 2026 le moteur renvoie un **avantage signé en points de win
rate** par rapport à la moyenne du pool, assorti d'un écart-type. Le rapport
affiche `+2.10 ±1.20`. Un cas dont l'écart est inférieur à l'incertitude
combinée n'est pas départageable : utiliser `must_be_tied` plutôt qu'un
`must_rank_higher_than` dans ce cas.

## How to run

From the `server/` directory (so the `app` package and venv are in scope):

```bash
cd server
python tests/calibration/run_calibration.py
```

Useful flags:

| Flag | Effect |
|------|--------|
| `-v`, `--verbose` | Show the top 5 recommendations of each case + every passed assertion |
| `-f <category>`, `--filter <category>` | Run only cases of a given category (`blind_pick`, `counter`, `anti_autoattack`, `anti_engage`, `synergy`, `pool_restricted`, `pick_order`) |
| `--cases <path>` | Use a custom cases JSON file |
| `--rank <rank>` | Player rank applied to cases without an explicit `rank_bucket` |
| `--diagnose` | Sort ordering assertions by decidability instead of judging pass/fail |
| `--freeze-cache` | Snapshot the live cache into `cache-frozen/` and exit |
| `--live-cache` | Ignore the snapshot and read the live cache (data may drift) |

The script returns exit code **0** when every assertion passes, **1** otherwise
(plug it into CI later when the suite is stable).

> ⚠️ The first run hits Data Dragon + Lolalytics over the network. Subsequent
> runs read from the on-disk cache in `server/app/data/cache/`.

## Le cache gelé — condition de validité des mesures

Le cache vivant a un TTL de six heures. Entre le 14 et le 15 septembre 2026, les
compteurs de triage sont passés de 20/10/8/14 à 21/9/8/14 **sans une ligne de code
changée** : le TTL avait expiré et Lolalytics avait resservi des statistiques fraîches
au milieu d'une mesure. Tant que les données bougent, l'effet d'une vague de scoring est
indiscernable de la dérive.

D'où le gel :

```bash
python tests/calibration/run_calibration.py --freeze-cache --rank master_plus
```

Le cache vivant est **copié** dans `server/app/data/cache-frozen/` (une copie, pas un gel
sur place : le cache vivant est réécrit dès que l'application tourne), avec un
`MANIFEST.json` qui date le snapshot. Le dossier n'est pas versionné — il se régénère.

**Dès qu'un snapshot existe, la calibration l'utilise par défaut**, sans TTL et réseau
interdit. Chaque run affiche en tête le mode et la date du gel. Il faut demander
`--live-cache` pour en sortir, jamais pour y entrer : une mesure faite par inadvertance
sur des données mouvantes est exactement le défaut qu'on vient de corriger.

Une entrée absente du snapshot lève `FrozenCacheMiss`, qui hérite de `BaseException` à
dessein : `fetch_tierlist` et `fetch_counter_page` avalent tout `Exception` et renvoient
`{}`. Sans cela, un trou dans le gel ferait tourner la calibration sur une méta vide sans
un mot.

## Adding a new case

Append an object to `cases.json` with this shape:

```json
{
  "id": "blind_pick_adc_safe",
  "category": "blind_pick",
  "description": "ADC en blind pick first, doit privilégier safe/flex",
  "confidence": "low",
  "setup": {
    "my_team": "blue",
    "my_role": "adc",
    "my_pick_order": 1,
    "ally_picks": {"top": "Malphite"},
    "enemy_picks": {},
    "bans": [],
    "champion_pool": {
      "adc": [
        {"champion": "Caitlyn", "tier": "S"},
        {"champion": "Ezreal",  "tier": "A"}
      ]
    }
  },
  "assertions": [
    {"type": "must_be_in_top_3", "champion": "Caitlyn"},
    {"type": "must_not_be_top_3", "champion": "Yasuo"},
    {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Aphelios"}
  ]
}
```

### Field notes

- `id` — unique slug, shown in the report.
- `category` — used to bucket the report; pick an existing one or invent a new one.
- `confidence` — optional (`low` / `medium` / `high`). Marks shaky expectations
  so a failure here is less damning. Shown in the report next to the case id.
- `setup.my_role` / role keys in pools and picks accept aliases (`adc`, `bot`,
  `bottom`, `mid`, `middle`, `support`, `supp`, `sup`, `jg`, `jungle`, `top`).
- `setup.champion_pool` — pass `null` (or omit) to use every champion in the
  role at tier `D`. Otherwise restrict to the listed entries.
- Champion names are matched against display name then DDragon key, with
  apostrophes/spaces stripped (`"Kog'Maw"`, `"KogMaw"`, and `"kog'maw"` all work).

### Assertion types

| Type | Fields | Meaning |
|------|--------|---------|
| `must_be_top_1` | `champion` | Champion must be #1 in the recommendations |
| `must_be_in_top_3` | `champion` | Champion must be in indices 0..2 |
| `must_be_in_top_5` | `champion` | Champion must be in indices 0..4 |
| `must_not_be_top_3` | `champion` | Champion must be absent from indices 0..2 (absent from top 15 also passes) |
| `must_rank_higher_than` | `champion_a`, `champion_b` | `a` must rank strictly higher than `b`. If `b` is absent from the top 15 entirely, this passes. If `a` is absent, this fails. |
| `must_have_advantage_above` | `champion`, `min_advantage` | L'avantage du champion (points de win rate vs moyenne du pool) doit être ≥ `min_advantage` |
| `must_be_tied` | `champion_a`, `champion_b` | L'écart entre les deux doit rester sous la racine de la somme de leurs variances : le moteur les déclare équivalents |

When in doubt about an expectation, prefer `must_rank_higher_than` between two
contrasted champions over an absolute "must be top 1" — relative claims are
much more robust to meta drift than absolute ones.

## Reading the report

```
✓ blind_pick_adc  (3/3)
  ADC blind pick — safe ranged ADCs over high-risk hyper carries
  …

✗ comp_full_aa_bot_nilah  (0/1) [confidence:medium]
  Bot vs full auto-attack enemy comp — Nilah (passive vs AAs) should rise
  ✗ must_be_in_top_3: Nilah is #6, expected ≤ 3
  …

═══════════════════════════════════════════════════════════
By category:
  anti_autoattack         3/4   ( 75.0%)
  anti_engage             4/4   (100.0%)
  blind_pick              7/9   ( 77.8%)
  counter                 6/8   ( 75.0%)
  pick_order              2/3   ( 66.7%)
  pool_restricted         3/3   (100.0%)
  synergy                 1/2   ( 50.0%)

Global: 26/33 assertions passed (78.8%)
```

- A case prints its **id**, a count of `passed/total` assertions, and the
  failing ones with a reason.
- The footer shows per-category and global pass rate. Per-category numbers
  surface where the engine is weak (e.g. `synergy 50%` → revisit synergy
  weighting).
- Cases with `"confidence": "low"` are flagged in yellow — treat their
  failures as signals to investigate, not as hard regressions.

## Workflow for tuning weights

1. **Baseline** — run the suite, note the global score and per-category breakdown.
2. **Edit** — change a scoring constant or rule in `app/scoring/`
   ou, plus souvent, une constante de `app/scoring/config.py` (`k_matchup`,
   `counter_lambda`, bornes de maîtrise ou de composition).
3. **Compare** — re-run, compare the new global + per-category scores.
4. **Iterate** — keep the change if the global went up *and* no category
   collapsed. Drop it if any category lost more than it gained — local
   improvements that crater another bucket are usually overfitting to a
   specific case rather than a real engine improvement.
5. **Add cases** — when you find a real-game scenario the engine got wrong,
   bake it into `cases.json` so future tuning can't silently regress on it.

The first run will be slow (network fetches); after that the cache makes
each iteration take a few seconds, which is the whole point of bypassing
HTTP.


## Cas à revoir après le passage en points de win rate

Exécution du 10 septembre 2026, données Lolalytics réelles au tier `emerald`,
32 cas / 52 assertions. Les cas ci-dessous échouent **sans erreur réseau** :
ce sont des attentes écrites pour l'ancien moteur 0-100, à réévaluer une par
une plutôt qu'à faire passer de force.

| Résultat | Ancien moteur (30 cas) | Nouveau moteur (mêmes 30 cas) |
|---|---|---|
| Assertions réussies | 35/50 (70,0 %) | 33/50 (66,0 %) |
| `synergy` | 0/2 | 2/2 |
| `counter` | 7/8 | 6/8 |
| `blind_pick` | 7/10 | 5/10 |
| `anti_engage` | 3/6 | 2/6 |
| `edge_case` | 4/9 | 4/9 |

Les deux moteurs sont au même niveau global sur une suite calibrée pour
l'ancien ; la catégorie `synergy` passe de 0 % à 100 %.

**1. Les mids en blind sont réellement à égalité.** Sur
`blind_pick_mid_no_zed_akali`, les avantages vont de +0,87 à −1,41 avec des
écarts-types de ±2,68 à ±3,14. Les assertions d'ordre strict demandent une
précision que la donnée ne porte pas. Ces cas devraient devenir `must_be_tied`.

**2. Le risque de Yasuo est dans la variance, pas dans la moyenne.** Sur
`blind_pick_mid_no_yasuo`, au tier emerald :

```
Yasuo    +1.82 ±3.29   meta +0.28  future_opponent +0.03 ±2.52  mastery +1.40
Lux      +1.06 ±2.68   meta +2.87  future_opponent -0.42 ±1.64  mastery -1.50
Syndra   +0.87 ±3.03   meta +1.78  future_opponent -1.02 ±2.17  mastery  0.00
Orianna  -3.34 ±3.00   meta -2.53  future_opponent -0.93 ±2.12  mastery  0.00
```

Yasuo porte bien l'écart-type le plus élevé du groupe (±2,52 sur le terme
adversaire, contre ±1,64 pour Lux) : le modèle voit la dispersion. Mais son
espérance reste neutre, et le palier S déclaré par le joueur (+1,40) le place
en tête. Deux pistes, à trancher avant de retoucher les cas :

- La distribution de counter-pick est proportionnelle à `max(0, −d2)` sur tous
  les adversaires plausibles. Avec une cinquantaine de candidats, la masse se
  disperse au lieu de se concentrer sur les deux ou trois pires matchups. Un
  vrai counter-picker prend le meilleur counter, pas une loterie pondérée.
  Concentrer cette distribution (exposant, ou top-k) rendrait `λ` réellement
  mordant.
- Le classement pourrait trier sur une borne basse (`avantage − σ`) plutôt que
  sur la moyenne, ce qui pénaliserait mécaniquement les choix dispersés.

Aucun des deux n'est appliqué ici : ce sont des changements de conception, pas
des correctifs.

**3. `edge_case` échoue à l'identique sur les deux moteurs** (4/9). Ces cas
étaient déjà rouges avant la refonte ; ils ne constituent pas une régression.

**4. `no_tie_hard_counter` échoue** : Vayne sort 3e derrière Malphite alors que
le cas attend le counter direct en tête. À instruire avec le détail des termes
avant de conclure.

## Variance de comparaison (vague 0,5)

Mesuré le 14 septembre 2026 sur le cas réel `counter_pick_adc_full_info`, tier
`d2_plus` (Jinx / Xayah / Caitlyn). Le triage de la vague 0 classait 31 des
38 assertions d'ordre comme indécidables — pas une propriété de la donnée,
mais un défaut de calcul du seuil. Termes réels observés sur les trois
candidats :

| Terme | Jinx | Xayah | Caitlyn | σ | Part de la variance |
|---|---|---|---|---|---|
| `meta` (observé) | +3,59 | +3,37 | +0,41 | 0,23–0,41 | 0,4–1,2 % |
| `matchup` (observé) | −0,11 | +0,64 | −1,26 | 0,77–1,41 | 4,5–13,6 % |
| `mastery` | −1,30 | −4,00 | 0,00 | 1,50 | ~17 % |
| `composition` | **+2,00** | **+2,00** | **+2,00** | 2,00 | ~30 % |
| `synergy` | **+3,00** | **+3,00** | **+3,00** | 2,00 | ~30 % |
| `mechanics` | **0,00** | **0,00** | **0,00** | 1,50 | ~17 % |

Les données observées (`meta`, `matchup`) pesaient 5 % de la variance ; les
constantes heuristiques codées en dur, 95 %. `mechanics` valait +0,00 pour
les trois candidats et facturait à lui seul 17 % de l'incertitude ;
`composition` (+2,00) et `synergy` (+3,00) étaient identiques sur les trois
candidats et en portaient 60 % à elles deux. Le seuil de décidabilité
(`sqrt(sd_a² + sd_b²)`) traitait ces σ comme des erreurs indépendantes qui
s'additionnent, alors que `composition` et `synergy` appliquent la **même**
constante de conversion aux trois candidats : la même erreur de modèle, qui
doit s'annuler dans un écart plutôt que s'ajouter. Le seuil calculé avoisinait
5,3 points de win rate — au-dessus de l'écart entre la plupart des paires de
candidats — donc presque tout finissait déclaré équivalent.

**Formule retenue.** Chaque terme porte désormais deux composantes
d'incertitude au lieu d'une seule σ globale :

```
sd = sqrt((rel_sd · valeur)² + abs_sd²)
```

- `rel_sd` — erreur sur la constante de conversion heuristique
  (`composition`, `synergy`, `archetype`, `mechanics`, `model`, palier de
  maîtrise déclaré). **Partagée** par tous les candidats du rôle : elle
  s'annule quand deux candidats portent la même valeur pour ce terme.
- `abs_sd` — échantillonnage ou ignorance (`meta`/`matchup` observés,
  absence de données, maîtrise mesurée sur parties réelles). **Propre** à
  chaque candidat : elle ne s'annule jamais.

La comparaison entre deux champions consomme la somme, terme à terme, de ces
deux comportements :

```
comparison_sd(termes_a, termes_b)
    = sqrt( Σ rel_sd² · (valeur_a − valeur_b)²  +  Σ (abs_sd_a² + abs_sd_b²) )
```

`top_group` (groupe de tête) et le triage de calibration (`assertion_separation`
dans `run_calibration.py`) utilisent tous les deux `comparison_sd` désormais.
`Estimate.sd` — l'incertitude affichée sur un champion pris seul — n'a pas
changé de définition : elle reste la racine de la somme des variances de tous
ses termes.

Effet vérifié sur le cas mesuré : le seuil Jinx–Caitlyn tombe de 5,14 à
**1,29** (devient décidable, écart réel 3,03), Jinx–Xayah de 5,27 à **1,99**
(décidable, écart 2,17) ; Xayah–Caitlyn reste indécidable à juste titre
(seuil 2,34 contre écart 0,86 — ces deux-là sont réellement proches).

**Triage avant / après**, `run_calibration.py --rank master_plus --diagnose`,
52 assertions d'ordre :

| Compteur | Avant | Après | **Baseline gelé (17/09)** |
|---|---|---|---|
| Indécidable (`must_be_tied`) | 31 | 20 | **19** |
| Décidable, passe (conservé) | 2 | 10 | **9** |
| Décidable, échoue (arbitrage) | 5 | 8 | **10** |
| Hors périmètre du triage | 14 | 14 | **14** |

Les colonnes totalisent 52 : `hors périmètre` ne bouge pas, aucune
assertion n'a changé de type, seul le seuil de décidabilité s'est resserré.

La troisième colonne est le **baseline de référence**, rejoué le 17 septembre 2026 sur
cache gelé (snapshot du 17/09, 1250 entrées, Data Dragon 16.18.1, tier `master_plus`).
Elle diffère des deux premières pour deux raisons cumulées, et non à cause d'un
changement du moteur de scoring : les notes des 71 champions de bot lane ont été
réécrites à la main le 15/09 sous quatre termes qui consomment `ratings`, et les colonnes
« avant / après » avaient été mesurées sur des données qui dérivaient. **C'est cette
troisième colonne qui sert de point de comparaison aux vagues 1 et 2**, et elle est
reproductible à l'identique d'un run à l'autre.

Score global de calibration : **33/52 assertions (63,5 %)**
(`run_calibration.py --rank master_plus`, sans `--diagnose`).

**Ce qu'il faut retenir** : `Estimate.sd` répond à « que vaut ce champion
dans l'absolu », `comparison_sd` répond à « celui-ci est-il meilleur que
celui-là » — c'est la confusion des deux qui était le défaut.


## Biais de la distribution adverse (vague 1)

Deux changements sur le bras counter de `opponent_model.opponent_distribution`, mesurés
le 17 septembre 2026 sur le snapshot gelé du 17/09, `--rank master_plus`.

**Le pick rate pondère la menace.** Le bras counter répartissait la masse au prorata de
la seule menace : un counter très dur mais rare pesait autant qu'un counter moyen et
massivement joué. L'adversaire prend un counter qu'il joue — la masse devient
`pick_rate × menace`.

**`counter_alpha` concentre la masse** sur les pires matchups, hors du rang :
`counter_lambda` encode déjà le rang, l'y redoubler serait du double comptage.

### Ce que la mesure dit — et ne dit pas

| α | Global | Détail par catégorie |
|---|---|---|
| 1,0 | 33/52 (63,5 %) | identique au baseline |
| 1,5 | 33/52 (63,5 %) | identique |
| 2,0 | 33/52 (63,5 %) | identique |
| 2,5 | 33/52 (63,5 %) | identique |
| 3,0 | 33/52 (63,5 %) | identique |

**Aucun des deux changements ne fait basculer une assertion.** Le baseline 19/9/10/14 et
le score 33/52 sont inchangés.

Ce n'est pourtant pas un défaut de câblage, et c'est important de ne pas confondre les
deux. Le plan prévoyait un contrôle — « si α = 1,0 et α = 3,0 donnent le même score, la
constante n'est pas lue » — qui donne ici une **fausse alerte**, parce qu'il ne regarde
que des compteurs pass/fail. Vérifié sur les écarts continus du diagnostic, **28 des 38
comparaisons bougent** entre les deux valeurs (Caitlyn vs Kog'Maw : écart 0,29 → 0,03,
incertitude 2,40 → 2,14). Les deux changements déplacent réellement les estimations ;
ils ne franchissent simplement aucun seuil d'assertion.

**Leçon pour les vagues suivantes** : juger un changement sur le seul score de
calibration, c'est ne rien voir tant qu'une assertion ne bascule pas. Comparer les
écarts du `--diagnose` entre deux états du moteur — ce que le cache gelé rend possible.

### Contrôle de la spec : Yasuo

Le cas de référence était : le terme d'adversaire futur doit empêcher Yasuo de dominer
le blind pick mid. **Yasuo reste n°1 à toutes les valeurs de α**, et monter α l'éloigne
encore (écart Orianna–Yasuo 5,75 → 6,17 entre α = 1,0 et α = 3,0). La concentration
aggrave ce cas au lieu de le corriger.

Conséquence pour le dimensionnement : **la vague 1 ne touche pas le cas Yasuo, la vague 2
devra le porter entièrement.**

### Valeur retenue

`counter_alpha = 1,0`, et non 2,0 comme le plan le proposait. Les cinq valeurs sont à
égalité de preuve ; la règle de départage du plan — « préférer la valeur la plus basse :
moins de concentration, moins d'hypothèse » — tranche pour 1,0. À rejuger le jour où la
suite saura discriminer ces cas.


## Bilan des trois vagues

Toutes les colonnes mesurées sur le **même snapshot gelé** du 17/09/2026,
`--rank master_plus`. Sans ce gel, aucune de ces comparaisons ne voudrait dire quoi
que ce soit : les compteurs bougeaient seuls d'un jour à l'autre.

| Catégorie | Baseline verrouillé | + pick rate (v1) | + α (v1) | + départage (v2) |
|---|---|---|---|---|
| anti_autoattack | 4/4 | 4/4 | 4/4 | 4/4 |
| anti_engage | 3/6 | 3/6 | 3/6 | 3/6 |
| blind_pick | 5/10 | 5/10 | 5/10 | **6/10** |
| counter | 7/8 | 7/8 | 7/8 | 7/8 |
| edge_case | 2/9 | 2/9 | 2/9 | 2/9 |
| pick_order | 2/3 | 2/3 | 2/3 | 2/3 |
| pool_restricted | 3/3 | 3/3 | 3/3 | 3/3 |
| role_inference | 5/5 | 5/5 | 5/5 | 5/5 |
| synergy | 2/2 | 2/2 | 2/2 | 2/2 |
| ties | 0/2 | 0/2 | 0/2 | 0/2 |
| **Global** | **33/52 (63,5 %)** | 33/52 | 33/52 | **34/52 (65,4 %)** |

Triage : 19/9/10/14 au baseline, inchangé après la vague 1, **18/9/11/14** après le
départage — une assertion quitte l'indécidable pour l'arbitrage.

### La vague 1 ne déplace aucune assertion

Ni le pick rate ni α ne font bouger un seul compteur. Ce n'est pas un défaut de
câblage : 28 des 38 comparaisons du `--diagnose` bougent entre α = 1,0 et α = 3,0.
Les changements déplacent les estimations sans franchir de seuil. Voir le chantier 12
pour ce que cela dit du pouvoir de résolution de la suite.

### `counter_alpha` retenu à 1,0

Balayage sur 1,0 / 1,5 / 2,0 / 2,5 / 3,0 : **score global et détail par catégorie
identiques aux cinq valeurs**. Aucune n'est écartée par une mesure — elles sont
toutes indiscernables. La règle de départage du plan (« à égalité, préférer la valeur
la plus basse : moins de concentration, moins d'hypothèse ») tranche pour 1,0, et non
pour le 2,0 que le plan proposait a priori.

### Yasuo : il a fallu le départage

**Non, la vague 1 ne suffit pas.** Yasuo reste n°1 du blind pick mid à toutes les
valeurs de α, et monter α l'éloigne encore (écart Orianna–Yasuo 5,75 → 6,17). La
concentration aggrave ce cas.

C'est le départage de la vague 2 qui le fait reculer, de **n°1 à n°3**, derrière Lux
et Syndra. Il garde la meilleure espérance (+2,62) mais porte le plus gros risque
subi, donc il perd sa place à l'intérieur du groupe d'égalité statistique. Une des
trois assertions du cas passe désormais (`Syndra > Yasuo`).

### `γ` n'a pas été activé

La spec (§5.5) gardait en réserve un coefficient `γ` sur `total − γ · outcome_sd`
« si la mesure montre le départage trop faible ». Le départage seul a produit le sens
attendu et un gain net sans régression de catégorie : **`γ` n'a pas été nécessaire**,
ce qui était le résultat espéré.

Reste ouvert : Yasuo est n°3 et l'assertion en demande mieux que top 3. Savoir si ce
résidu appelle `γ` ou relève du chantier 5 — le matchup de lane qui prime sur l'apport
à la partie — n'est pas tranché par cette mesure. Ne pas activer `γ` pour forcer ce
cas sans avoir répondu à la question.

### Assertions redevenues décidables

**Aucune après la vague 1** : le triage reste à 19/9/10/14. Après le départage, une
assertion passe d'indécidable à arbitrage. L'hypothèse du plan — que la concentration
de la vague 1 rendrait des assertions décidables — n'est **pas** vérifiée.


## Comparer deux états du moteur

46 des 52 assertions portent sur un rang, et un rang est une fonction en escalier :
il ne dit rien tant qu'un seuil n'est pas franchi. La vague 1 l'a montré en grand —
28 comparaisons déplacées sur 38, zéro compteur bougé.

```bash
# avant de toucher au moteur
python tests/calibration/run_calibration.py --rank master_plus     --snapshot tests/calibration/snapshots/base.json

# apres le changement
python tests/calibration/run_calibration.py --rank master_plus     --compare tests/calibration/snapshots/base.json
```

Le snapshot enregistre, pour chaque cas, le **classement complet** — pas seulement le
top 5, un déplacement peut naître n'importe où — avec `total_score`, `score_sd`,
`outcome_sd`, et le verdict de chaque assertion.

Le rapport va du plus fort au plus faible :

| Niveau | Ce que c'est |
|---|---|
| Assertions basculées | ce que la suite voyait déjà |
| Changements de rang | ce qu'elle rate quand le rang bouge hors d'un seuil testé |
| Déplacements de score | ce qu'elle ne voit jamais |

Exemple réel, `counter_alpha` porté de 1,0 à 3,0 — le changement que la vague 1
déclarait sans effet :

```
Assertions basculées : 0
Changements de rang : 4
  Fiora    #4 -> #3   (blind_pick_top_flex_priority)
  Ornn     #3 -> #4   (blind_pick_top_flex_priority)
  Caitlyn  #2 -> #3   (synergy_senna_tahmkench)
  Senna    #3 -> #2   (synergy_senna_tahmkench)
Déplacements de score : 47
```

**Quatre inversions de classement passaient inaperçues.** La suite ne ratait pas
seulement des mouvements continus, elle ratait des changements d'ordre — dans des cas
dont l'assertion portait sur d'autres champions que ceux qui bougeaient.

### Le refus qui compte

Le snapshot embarque le manifeste du cache gelé. **Comparer deux runs pris sur des
caches différents, ou hors gel, est refusé.** Sans ce garde-fou l'outil attribuerait
au changement de code ce qui n'est qu'une dérive de données — exactement ce qui s'est
produit le 15/09 et qui a motivé le gel.

Les snapshots vivent dans `snapshots/`, non versionné : ils se régénèrent, et ils ne
valent que pour le cache gelé qui les a produits.

## Regel du 24 septembre 2026

Les rôles des champions ont été régénérés (`scripts/refresh_roles.py`, chantier 4bis) : Viktor
est désormais proposé bot, Wukong jungle, etc. Le snapshot du 17/09 ne contenait pas les matchups
de ces nouveaux postes — `FrozenCacheMiss`, exactement le garde-fou voulu.

- Le snapshot du 17/09 est **conservé** dans `server/app/data/cache-frozen-2026-09-17/` : pour
  rejouer le baseline documenté plus haut, le renommer en `cache-frozen/`.
- Nouveau gel : **24/09/2026, 2212 entrées, Data Dragon 16.19.1, tier `master_plus`**. Les deux
  états (anciens et nouveaux rôles) ont peuplé le cache vivant avant le gel, pour que la
  comparaison se fasse sur un snapshot commun.
- Baseline sur ce gel : **32/52**. Anciens et nouveaux rôles : **0 assertion basculée**,
  42 changements de rang, 44 déplacements de score.

Un gel ne peut pas rejouer un appel qui échoue en direct : `fetch_counter_page` n'écrit pas
en cache une réponse vide, et le rejeu gelé lève alors `FrozenCacheMiss`. C'est ainsi qu'est
apparu le slug erroné de Wukong.

## L'apport à la partie (chantier 5)

Mesuré le 24/09/2026 sur un gel commun (2459 entrées, Data Dragon 16.19.1, `master_plus`),
**après** le réglage du signal méta (chantier 13 : win rate × 0,25, popularité × 1,0).
Référence `snapshots/baseline_v6.json` : **37/52**. Chaque levier seul, les deux autres neutres.
Cas de référence `comp_engage_mid_peel` : Orianna n°2, Zed n°1, écart **1,51** point.

### Terme teamfight (`teamfight_scale`)

| Valeur | Global | Basculées | Rangs | Scores | Orianna / Zed / écart |
|---|---|---|---|---|---|
| 0,25 | 37 | 0 | 18 | 117 | 2 / 1 / 1,01 |
| 0,5 | 37 | 0 | 21 | 117 | 2 / 1 / 0,51 |
| 0,75 | 36 | −1 (`comp_full_aa_top_jax`) | 29 | 117 | 2 / 1 / 0,01 |
| 1,0 | 38 | +2 −1 | 38 | 117 | **1 / 2 / −0,49** |

À 1,0, `comp_engage_mid_peel` et `counter_pick_top_vs_darius` passent, `comp_full_aa_top_jax`
tombe : la catégorie `anti_autoattack` perd une assertion.

### Poids du matchup (`matchup_weight["master_plus"]`)

| Valeur | Global | Basculées | Rangs | Orianna / Zed / écart |
|---|---|---|---|---|
| 0,8 | 35 | −2 | 25 | 2 / 1 / 1,24 |
| 0,6 | 35 | −2 | 41 | 2 / 1 / 0,97 |
| 0,4 | 35 | −2 | 54 | 2 / 1 / 0,69 |

Les deux mêmes assertions tombent à toutes les valeurs : `counter_pick_top_vs_darius` et
`edge_case_malphite_vs_full_ad`. Aucune n'est gagnée.

### Amortissement de la méta (`meta_context_damping`)

| Valeur | Global | Basculées | Rangs | Orianna / Zed / écart |
|---|---|---|---|---|
| 0,2 | 36 | −1 | 12 | 2 / 1 / 1,44 |
| 0,35 | 36 | −1 | 15 | 2 / 1 / 1,37 |
| 0,5 | 36 | −1 | 19 | 2 / 1 / 1,32 |

`counter_pick_top_vs_darius` tombe à toutes les valeurs. Aucune assertion gagnée.

### Ce que la mesure dit

- **Les trois leviers vont dans le sens de l'arbitrage du joueur** : l'écart Zed − Orianna se
  réduit à chaque fois.
- **Seul le terme teamfight le fait sans rien casser.** Le poids du matchup et l'amortissement
  de la méta ne gagnent aucune assertion et en perdent : les cas de counter ont besoin du duel
  de couloir à plein, et un win rate déjà ramené au quart (chantier 13) n'a plus rien à amortir.
  La spec les supposait utiles ; sur ce moteur ils ne le sont pas.
- **La spec prévoyait que le cas de référence ne basculerait pas** (§6.4). Avec le signal méta
  corrigé, il bascule à `teamfight_scale = 1,0` — au prix d'une assertion anti-auto-attaque.
- Limite : la note `teamfight` est saturée en bot lane (69 des 71 champions notés à 4 ou 5,
  `docs/GRILLE_NOTATION.md`) et les champions mid sont encore notés depuis les tags Riot. Le
  terme ne départage donc réellement qu'une partie des candidats ; à re-mesurer après le
  réarbitrage.

### Bilan : aucun levier retenu en l'état

Mesure conjointe inutile : le poids du matchup et l'amortissement de la méta ne gagnent rien et
perdent à toutes les valeurs, il ne reste que le terme teamfight. Or celui-ci, recoupé sur la
concordance pro (5 250 décisions), **dégrade** : top-3 15,0 → 14,0 % à 0,5 (z = −3,9),
13,5 % à 1,0 (z = −4,7). Sur la calibration il ne monte pas le global à 0,5 et fait perdre
`anti_autoattack` à 1,0.

**Retenu : le triplet neutre** (`teamfight_scale` 0, `matchup_weight` 1,0, `meta_context_damping`
0). Référence suivante : `snapshots/baseline_v7.json`, 37/52, triage 13/11/13/15.

**Réponse au §6.4 de la spec** : l'écart Zed − Orianna, +5,23 le 18/09, est à **+1,51** sans
aucun des trois leviers — c'est le signal méta corrigé (chantier 13) qui l'a réduit, pas cette
spec. Le terme teamfight le fait basculer à 1,0, mais au prix d'une assertion et de la
concordance : le cas reste ouvert.

**Pourquoi le terme teamfight échoue** : sa formule suit la spec, mais la note qu'il lit est
saturée en bot lane et dérivée des tags Riot en mid. Le terme amplifie une donnée grossière.
Suite : réarbitrer `teamfight` (proposition dans `docs/GRILLE_NOTATION.md`), noter les mids,
re-mesurer. C'est la conclusion que la spec prévoyait en cas d'échec : revenir aux notes.

