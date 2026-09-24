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

### 0. S'authentifier sur Fandom — obligatoire

Le 22 septembre 2026, le scrape anonyme a été refusé de bout en bout. Le sondage
qui l'établit :

| Requête | Résultat |
|---|---|
| `action=query&meta=siteinfo` | 200, réponse normale |
| `action=cargoquery`, 2 champs, `limit=2` | `ratelimited` |

**Fandom throttle `cargoquery` pour les clients anonymes, pas les requêtes
volumineuses.** Réduire la taille des pages ou attendre ne sert à rien : cinq
tentatives espacées de 60 à 960 secondes ont toutes été refusées. Le backoff du
scraper est correct, la porte est fermée en amont.

Il faut donc un compte Fandom et un **bot password** :

1. Créer un compte sur `lol.fandom.com` (gratuit).
2. Aller sur `https://lol.fandom.com/wiki/Special:BotPasswords`, créer un bot
   avec les droits de lecture de base.
3. Le wiki affiche un identifiant `Utilisateur@nomdubot` et un mot de passe
   généré — affiché **une seule fois**.

Les identifiants se passent par l'environnement, jamais en argument (un
argument atterrit dans l'historique du shell et dans la table des processus) :

```bash
export FANDOM_USERNAME='MonCompte@dalia'
export FANDOM_BOT_PASSWORD='<le mot de passe généré>'
python scraper.py --check-auth     # se connecte, dit qui il est, et sort
```

`--check-auth` est le contrôle à passer avant toute collecte. Sans identifiants,
le scraper refuse de démarrer ; `--allow-anonymous` force le comportement
précédent, avec les backoffs qui vont avec.

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


---

## Premier baseline mesuré — 22 septembre 2026

5 250 décisions de pick reconstruites depuis 525 drafts réelles (LCK 248, LPL 139,
LEC 84, LCS 54), patches 26.16 / 26.17 / 26.18. Aucune cible non résolue, aucun
setup rejeté. Moteur appelé en in-process, cache Lolalytics vivant, tier par
défaut, DDragon 16.18.1. Évaluation : 113 s.

Les drafts sont contemporaines des statistiques que le moteur consomme — c'est
la condition pour que la mesure dise quelque chose sur le moteur plutôt que sur
un décalage de méta.

### Le moteur

| Métrique | Valeur |
|---|---|
| Top-1 | 1,90 % |
| Top-3 | 5,56 % |
| Top-5 | 9,01 % |
| Top-10 | 18,97 % |
| Miss (> 15) | 71,20 % |
| Rang moyen | 13,73 |

Par rôle, le bot se détache (top-3 10,1 %, rang moyen 12,42) et le top ferme la
marche (3,2 %, 14,31). Par phase, le `counter` fait mieux que le `blind`
(6,1 % contre 5,2 % en top-3, et 23,0 % contre 11,5 % en top-10) : le moteur
exploite l'information adverse quand elle existe. Par ligue, l'écart LPL
(7,0 %) / LCK (4,7 %) est réel mais modeste.

### Les témoins — et ce qu'ils révèlent

Un chiffre de concordance seul ne dit rien : il faut savoir à quoi le comparer.
`run_popularity_baseline.py` rejoue les **mêmes cas**, avec la **même troncature
à 15**, en changeant uniquement la règle de classement.

| Règle | Top-1 | Top-3 | Top-5 | Top-10 | Miss | Rang moyen |
|---|---|---|---|---|---|---|
| Pick rate soloqueue | 5,2 % | **12,6 %** | 20,2 % | **44,5 %** | 45,7 % | **11,00** |
| Hasard (univers moyen 45,1) | 2,2 % | 6,6 % | 11,1 % | 22,2 % | 66,8 % | — |
| **Moteur DALIA** | 1,9 % | **5,6 %** | 9,0 % | **19,0 %** | 71,2 % | 13,73 |
| Win rate soloqueue | 0,2 % | 0,5 % | 3,1 % | 5,9 % | 84,2 % | 15,13 |

**Le moteur est sous le hasard.** L'écart n'est pas du bruit d'échantillonnage :
−3,0 écarts-types en top-3, −5,6 en top-10 sur 5 250 cas. Et « trier par pick
rate », une règle d'une ligne qui n'ouvre aucun fichier du dossier `scoring/`,
fait **2,3 fois mieux que le moteur en top-3 et 2,3 fois mieux en top-10**.

L'explication tient dans la dernière ligne. `meta_term` ne consomme que le win
rate :

```python
Term("meta", shrink(stats.win_rate - 50.0, stats.games, c.k_meta), ...)
```

Le pick rate n'entre nulle part dans la notation d'un candidat — il n'existe
dans le moteur que pour la distribution adverse (`min_opponent_pick_rate`). Or
classer par win rate soloqueue donne **0,5 % en top-3, très en dessous du
hasard** : c'est un signal anti-corrélé avec ce que choisissent les bons
drafteurs. Le win rate d'un champion peu joué mesure surtout la compétence de
ceux qui le jouent, pas la force du champion. Le moteur hérite de ce biais, et
ça se voit dans ses n°1 : Amumu en support, Karthus en bot, Warwick en top.

### Ce que la mesure ne dit pas

DALIA ne prétend pas prédire des picks pros. Son usage réel est de classer le
**pool déclaré d'un joueur** — trois à huit champions par rôle — pour de la
soloqueue à son rang, avec un terme de maîtrise. Ici le pool est ouvert (~45
candidats) et la maîtrise est neutre : c'est le moteur privé de deux de ses
entrées. Une concordance basse était attendue.

Ce qui n'était pas attendu, et que « les pros pickent autrement » n'explique
pas, c'est d'être **sous le hasard**. Le hasard ne sait rien non plus. Être
significativement en dessous veut dire que le classement est activement
anti-corrélé avec la préférence d'un bon drafteur — pas qu'il est ignorant.

La suite ne mesure donc pas la qualité du conseil rendu à un joueur. Elle
mesure la qualité du **signal de fond** sur lequel tout le reste s'empile, et
sur ce point elle est sans appel.

## Après le signal méta hybride — 24 septembre 2026

Chantier 13 (`docs/CHANTIERS.md`) : le win rate compte pour un quart, un terme de popularité
par poste s'ajoute. Mêmes 5 250 cas, cache vivant du 24/09.

| Règle | Top-1 | Top-3 | Top-10 | Rang moyen |
|---|---|---|---|---|
| Moteur, avant | 1,8 % | 5,9 % | 19,4 % | 13,69 |
| **Moteur, après** | **5,6 %** | **15,0 %** | **37,0 %** | **11,47** |
| Pick rate soloqueue | 5,5 % | 12,9 % | 42,1 % | 11,16 |
| Hasard | 2,2 % | 6,6 % | 22,1 % | — |

Le moteur passe du dessous du hasard au-dessus du témoin « pick rate » en top-3. Il reste
derrière lui en top-10 : le reste du classement dépend encore de termes que ce témoin ignore.
Réserve : la soloqueue copie les pros, donc un moteur qui écoute la popularité est avantagé
ici par construction — c'est pourquoi le réglage a été choisi sur la calibration.

