# DALIA — Pro Concordance Suite

Mesure à quel point les recommandations du moteur DALIA s'alignent avec les
vraies décisions des drafters pros (LEC / LCK / LCS / LPL). C'est la *source
de vérité* pour calibrer les poids du moteur.

## Pipeline

```
scraper.py            →   pro_drafts.json   (raw, par game)
generate_test_cases.py →  pro_cases.json    (un cas par pick à mesurer)
run_pro_concordance.py →  metrics terminal + report.json optionnel
```

### 1. Scraper les drafts pros

```bash
cd server/tests/pro_concordance
python scraper.py                          # défauts : LEC/LCK/LCS/LPL, 90j
python scraper.py --leagues LEC,LCK        # restreint aux deux ligues
python scraper.py --since 2026-02-01       # période custom
python scraper.py --patches 26.7,26.8      # patches custom
python scraper.py --max-games 20           # smoke test
```

Source : Leaguepedia (Wiki Cargo API publique). Cache local dans `cache/` —
les requêtes ne sont rejouées que si le cache est invalidé (`--no-cache`).

### 2. Générer les cas

```bash
python generate_test_cases.py
```

Pour chaque game, on reconstruit l'état du draft à *chaque pick* (qui a déjà
locké quoi, quel est le côté et le rôle de la décision en cours), et on stocke
le champion réellement choisi par le pro comme "réponse attendue".

200 games × 10 picks ≈ 2 000 cas.

### 3. Mesurer la concordance

```bash
python run_pro_concordance.py
python run_pro_concordance.py --league LEC --role mid
python run_pro_concordance.py --limit 200 --json-out report.json
python run_pro_concordance.py --phase counter        # last-pick uniquement
```

Le runner appelle le moteur DALIA en in-process (import direct, pas HTTP) et
agrège les métriques.

## Métriques produites

| Métrique          | Définition                                                |
|-------------------|-----------------------------------------------------------|
| Top-1 hit rate    | % de cas où le pick pro est notre #1                      |
| Top-3 hit rate    | % où le pick pro est dans notre top 3                     |
| Top-5 hit rate    | idem top 5                                                |
| Top-10 hit rate   | idem top 10                                               |
| Miss rate         | % de cas où le pick pro est hors du top 15 retourné       |
| Average rank      | rang moyen du pick pro (manqué = sentinelle 16)           |

Breakdowns affichés : par rôle, ligue, patch, phase de draft (`blind` /
`adaptive` / `counter`), pick order global (1..10).

## Comment interpréter

**Un top-3 de 50–60 % est probablement excellent.** Les pros pickent
sub-optimalement pour des raisons que le moteur ne peut pas modéliser :

- *Comfort* — un joueur qui spam 800 games de Renekton va le picker même quand
  un autre champ serait théoriquement supérieur.
- *Roster constraints* — le top laner Y ne joue pas le champion Z, donc on
  pivote.
- *Métagame stratégique* — bait pick pour ouvrir un swap, fake hover pour
  chercher une réaction, etc.
- *Erreurs simples* — les pros se trompent aussi. Toutes les décisions ne
  sont pas optimales.

Donc **on ne cherche pas 100 %**. Les seuils utiles sont relatifs :

| Seuil top-3   | Lecture                                           |
|---------------|---------------------------------------------------|
| < 30 %        | Le moteur diverge fort des pros. À investiguer.   |
| 30–45 %       | Correct mais améliorable.                         |
| 45–60 %       | Aligné — niveau coach humain solide.              |
| > 60 %        | Excellent — possiblement overfit, vérifier.       |

Pour comparaison : un humain qui pick "le S-tier de chaque rôle" sans
contexte aurait probablement un top-3 autour de 30–40 %.

## Workflow de calibration

1. **Baseline** — `python run_pro_concordance.py --json-out baseline.json`
2. **Modifier un poids** dans `server/app/services/draft_engine.py` (ou un
   coefficient de bonus / pénalité).
3. **Re-mesurer** — `python run_pro_concordance.py --json-out candidate.json`
4. **Comparer** baseline vs candidate, *globalement et par rôle/ligue*. Une
   amélioration qui tank un sous-segment (e.g. "+3 % global mais -8 % sur
   support") n'est pas une amélioration.
5. **Garder** uniquement si la concordance monte sans dégrader sur certains
   rôles ou ligues.

## Ajouter une nouvelle ligue

1. Ouvrir `scraper.py`, ajouter le shortname à `LEAGUES_TO_SCRAPE` (ou
   passer `--leagues XYZ`).
2. Vérifier que la ligue existe sur Leaguepedia et que son `OverviewPage`
   contient bien le shortname (sinon ajuster `_detect_league`).
3. Re-scraper, re-générer, re-mesurer.

## Limitations connues

- **Champions renommés / récents** — si DDragon n'a pas encore le champion
  apparu sur le wiki, le cas est skippé (compté comme `unresolved target`).
  Aliases custom dans `LP_TO_DDRAGON_KEY` (`run_pro_concordance.py`).
- **Drafts incomplets** — les games avec roles manquants ou picks vides sont
  skippées (le wiki a parfois des trous sur les ligues mineures).
- **Top-15 truncation** — DALIA ne retourne que ses 15 meilleures recos. Un
  pick pro hors-top-15 compte comme miss et un rang sentinel de 16 dans
  `avg_rank`. Le `miss_rate` est rapporté séparément pour ne pas confondre.

## Fichiers

```
pro_concordance/
├── scraper.py               — fetch Leaguepedia → pro_drafts.json
├── generate_test_cases.py   — pro_drafts.json → pro_cases.json
├── run_pro_concordance.py   — pro_cases.json → métriques
├── README.md                — ce fichier
├── cache/                   — cache HTTP (Cargo API)
├── pro_drafts.json          — produit par scraper.py
└── pro_cases.json           — produit par generate_test_cases.py
```
