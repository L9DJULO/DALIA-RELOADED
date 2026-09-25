# Notes de champions dérivées des données — spec de conception

Chantiers 4 et 14. Conçu avec le joueur le 25 septembre 2026 ; il a demandé d'enchaîner sans
relecture de la spec.

## 1. Objectif

Donner à chacun des 173 champions un vecteur de notes `[cc, engage, poke, splitpush, teamfight,
utility, burst, dps, tankiness]` sans que le joueur note 102 champions à la main.

Deux sources publiées remplacent la notation manuelle :

1. **Les notes de style de Riot** (partie 1) — publiées pour chaque champion, lues par des règles
   de conversion explicites.
2. **Les parties pros** (partie 2) — la note `teamfight` est mesurée, pas décidée.

## 2. Ce que le joueur a décidé

- **Tout calculer, puis caler sur ses notes** : on calcule les 173, on compare aux 71 notes qu'il
  a arbitrées pour comprendre où le calcul se trompe, on corrige les règles, puis ses 71 gardent
  leurs valeurs et les 102 reçoivent le calcul. « Comme ça tout s'accorde. »
- **Règles lisibles**, pas de modèle ajusté : chaque écart doit désigner une règle à corriger.
- **`teamfight` mesuré sur les pros, pour les 173**, ses 71 compris : « la notion de team fight
  est trop vague […] des champions qui jouent ou pas les TF en fonction des games ».
- **Ancres de `splitpush` à 5** : Fiora, Trundle, Yorick, Tryndamere, Nasus.

## 3. Sources

| Source | Contenu | Accès |
|---|---|---|
| CommunityDragon `champions/{id}.json` | `playstyleInfo` : damage, durability, crowdControl, mobility, utility (0-3) ; `tacticalInfo.style` (1 = attaques … 10 = sorts), `attackType` | public, User-Agent requis |
| Data Dragon `champion.json` | portée d'attaque (déjà chargée par le moteur) | public |
| Wiki LoL `Champion_classes/{Classe}`, pour Controller, Fighter, Mage, Marksman, Slayer, Tank, Specialist | sous-classes Riot (Vanguard, Warden, Catcher, Enchanter, Juggernaut, Diver, Burst, Battlemage, Artillery, Marksman, Assassin, Skirmisher, Specialist) | public |
| Leaguepedia `ScoreboardPlayers` | par joueur et par partie : Champion, IngameRole, Kills, Deaths, Assists, TeamKills, DamageToChampions, GameId, Side | bot password Fandom (`FANDOM_USERNAME`, `FANDOM_BOT_PASSWORD`) |

Mesure préalable du 25/09 sur les 71 notes du joueur : chaque note Riot varie dans le même sens
que la sienne. `crowdControl` 3 → surtout 4, 2 → surtout 3 ; `utility` 3 → presque toujours 5 ;
l'axe `style` sépare `dps` et `burst` (style ≤ 4 : dps > burst ; ≥ 5 : burst > dps) ;
`durability` 3 → 4-5, mais `durability` 1 s'étale de 1 à 3, ce que la mobilité explique (la
tankiness du joueur est une survivabilité effective).

## 4. Partie 1 — les règles

### 4.1 Architecture

`server/scripts/derive_ratings.py`, sur le modèle de `refresh_roles.py` :

- **`server/app/services/rating_rules.py`** — une fonction pure par dimension, qui reçoit un
  `ChampionFacts` (notes Riot, style, portée, mêlée/distance, sous-classes) et renvoie une note
  1-5. Aucun accès réseau, aucun état : testable champion par champion.
- **Le script** récupère les faits (CommunityDragon, Data Dragon, wiki), les met en cache dans
  `server/app/data/champion_facts.json` (versionné : les règles doivent pouvoir se rejouer sans
  réseau), applique les règles, écrit le rapport et, avec `--write`, les overrides.
- **Dry-run par défaut** ; `--write` applique.

### 4.2 Règles initiales

Point de départ, à corriger par le rapport de contrôle (§4.3). Les notations `R.x` désignent
`playstyleInfo.x`.

| Dimension | Règle initiale |
|---|---|
| `cc` | `R.crowdControl` 0→1, 1→2, 2→3, 3→4 ; 5 si `crowdControl` 3 et `durability` 3 (Leona, Nautilus, Alistar, Amumu) |
| `tankiness` | `R.durability` 1→1, 2→3, 3→5, puis +1 si `mobility` 2, +2 si 3, plafond 5 (survivabilité effective) |
| `utility` | `R.utility` 0-1→2, 2→4, 3→5 ; +1 si Enchanter, plafond 5 |
| `burst`, `dps` | niveau de dégâts `L` = `R.damage` 1→1, 2→3, 3→5 ; style ≤ 4 (attaques) : dps = L, burst = L−1 ; style ≥ 6 (sorts) : burst = L, dps = max(1, L−3) ; style 5 : les deux à L−1 ; bornés à [1, 5] |
| `poke` | mêlée → 1 ; Artillery → 5 ; mage à distance (style ≥ 6) → 4 ; tireur → 3 ; autre à distance → 2 |
| `engage` | Vanguard → 5 ; Catcher ou Diver → 4 ; `crowdControl` ≥ 2 et `mobility` ≥ 2 → 3 ; `crowdControl` ≥ 2 → 2 ; sinon 1 |
| `splitpush` | ancres du joueur → 5 ; Skirmisher ou Juggernaut → 4 ; Diver ou Specialist → 3 ; Marksman → 2 ; sinon 1 |
| `teamfight` | partie 2 ; repli sans donnée pro : Vanguard, Warden, Battlemage, Enchanter → 4, sinon 3 |

Un champion peut porter plusieurs sous-classes ; chaque règle dit laquelle prime (la plus
favorable à la dimension).

### 4.3 Le rapport de contrôle

Pour chaque dimension sauf `teamfight` (remplacé, §5) : sur les 71 notes du joueur, taux
d'accord exact, taux d'accord à ±1, et la liste des écarts ≥ 2 (« Nautilus : calculé 3, joueur
5 »). Écrit dans `server/app/data/ratings_report.md` à chaque run.

**Critère d'arrêt des itérations** : ≥ 50 % d'accord exact et ≥ 85 % à ±1 par dimension. Une
dimension qui n'y arrive pas est signalée, pas forcée : son écart résiduel part dans la liste de
relecture du joueur.

Garde-fou contre le surapprentissage : une règle ne nomme jamais un champion, sauf les ancres que
le joueur a données (§2). Corriger un écart en ajoutant une exception nommée est interdit — c'est
exactement le défaut du chantier 2.

### 4.4 Écriture

- Les 71 notes du joueur ne sont **jamais** réécrites, sauf `teamfight` (§5).
- Les 102 autres reçoivent le calcul.
- Chaque entrée porte `"ratings_source": "joueur"` ou `"calcul"` ; le chargeur l'ignore, les
  humains le lisent.
- Format et fins de ligne du fichier conservés (CRLF, indentation 2).

### 4.5 Liste de relecture

Le rapport liste, pour les 102, les champions où les signaux se contredisent — par exemple une
note Riot `durability` 3 avec une mobilité 3, ou aucune sous-classe trouvée. Le joueur ne relit
que ceux-là.

## 5. Partie 2 — `teamfight` mesuré sur les pros

### 5.1 Données

Extension de `server/tests/pro_concordance/scraper.py` : une requête `ScoreboardPlayers` sur les
parties LCK, LPL, LEC et LCS de la saison 2026, **patches antérieurs à 26.16**. Sortie :
`server/app/data/pro_player_stats.json` (une ligne par joueur et par partie, champs du §3).

**Pourquoi avant 26.16** : la suite de concordance mesure le moteur sur les parties 26.16-26.18.
Si la note `teamfight` venait des mêmes parties, mesurer le levier teamfight sur la concordance
reviendrait à se noter soi-même.

### 5.2 Mesure

Par champion et par poste (`IngameRole`) :

- **participation aux kills** `KP = (K + A) / TeamKills` par partie, moyennée ;
- **part des dégâts** `DMG / somme des DMG de l'équipe`, par partie, moyennée — en appoint.

Signal : `KP` relatif à la moyenne du poste, rétréci vers 0 par le nombre de parties
(`shrink`, `k` = 20 parties), puis converti en note 1-5 par quintiles **à l'intérieur de chaque
poste**. La part de dégâts n'entre pas dans la note ; elle est écrite dans le rapport pour que le
joueur voie qui porte les combats.

Un champion joué sur plusieurs postes prend la note de son poste principal (rôle en tête de
`champion_overrides.json`). Sous 5 parties pros sur ce poste : repli sur la règle du §4.2, marqué
« peu de données ».

### 5.3 Limite assumée

La participation aux kills mesure la **présence** dans les combats, pas l'impact : l'ult de
Malphite qui gagne le combat et l'ADC qui achève comptent pareil. C'est une mesure, pas encore
l'impact.

### 5.4 Re-mesure du levier teamfight

Une fois les notes écrites : balayage de `teamfight_scale` (0 ; 0,25 ; 0,5 ; 1,0) sur la
calibration (gel commun) et la concordance pro. Même règle que le chantier 5 : aucune catégorie
ne perd plus qu'elle ne gagne, et la concordance ne doit pas baisser significativement.

## 6. Vérification

- Tests unitaires : chaque règle sur des faits construits à la main (dont les cas frontières :
  `crowdControl` 0, style 5, champion sans sous-classe) ; la mesure KP sur une partie fabriquée ;
  le repli sous 5 parties ; la préservation des 71 notes du joueur à l'écriture.
- Rapport de contrôle au critère du §4.3.
- Calibration et concordance avant/après l'écriture des notes, sur un gel commun.

## 7. Hors périmètre

- Décomposer les dimensions (chantier 1) et généraliser les règles de kits (chantier 2).
- Les notes par rôle (chantier 4ter).
- Une mesure d'**impact** en teamfight au-delà de la présence.
