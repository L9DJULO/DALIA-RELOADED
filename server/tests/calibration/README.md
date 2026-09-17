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
