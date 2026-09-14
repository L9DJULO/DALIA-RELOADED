# Qualité du moteur de scoring — spec de conception

Suite de [la refonte du 10 septembre 2026](2026-09-10-scoring-wr-points-design.md). Le moteur en points de win rate
est en place ; cette spec corrige trois défauts identifiés dans [le bilan de calibration](../../../server/tests/calibration/README.md)
et un quatrième découvert à la mesure.

## 1. Objectif

Rendre les recommandations justes au rang du joueur, en corrigeant d'abord un biais d'estimation, puis en
exprimant une préférence de risque — dans cet ordre, et en mesurant entre les deux.

Ce que cette spec ne fait pas : elle ne touche pas au ML, au WPA, ni aux termes autres que `future_opponent`.

## 2. Constat mesuré (14 septembre 2026)

Mesures prises sur Lolalytics, bot lane, fenêtre 30 jours, via `parse_tierlist` et `parse_counters` du projet.

| Tier | Parties (bot, 30j) | Médiane par champion |
|---|---|---|
| `emerald_plus` | 11,7 M | 2 007 |
| `diamond_plus` | 4,85 M | 944 |
| `d2_plus` | 3,94 M | 760 |
| `master_plus` | 1,91 M | 427 |

Trois conclusions, dont deux qui corrigent des hypothèses écrites avant mesure :

1. **`k_matchup = 200` ne pose pas de problème à haut elo.** Lolalytics ne renvoie que les matchups suffisamment
   échantillonnés : médiane de 384 à 2 147 parties, facteurs de rétrécissement de 0,58 à 0,91. L'hypothèse
   inverse, envisagée en conception, est fausse.
2. **La dilution de la distribution adverse est réelle mais surestimée par le bilan de calibration.** Sur Caitlyn
   bot à `d2_plus` : 43 candidats passent le filtre de pick rate, dont **22 menaces** seulement (`d2 < 0`) — pas
   « une cinquantaine ». Le top 3 des pires matchups capte déjà **37,1 %** de la masse de counter contre 13,6 %
   si elle était uniforme : la distribution est déjà 2,7× concentrée.
3. **Le vrai défaut est ailleurs : `p_counter` ignore le pick rate.** Les pires matchups de Caitlyn à `d2_plus`
   sont Vel'Koz (−7,0), Xerath (−6,5), Seraphine (−4,2) et Lux (−4,2) — des mages bot rarement joués qui
   reçoivent pleine masse de counter. À λ = 0,50, la moitié de la distribution adverse modélise des adversaires
   que le joueur n'affrontera presque jamais.

L'imputation `delta = 0` pour un candidat sans donnée de matchup ne concerne qu'**un seul** candidat sur 43 :
négligeable, laissée telle quelle.

## 3. Rang → tier Lolalytics

`lolalytics_tier` renvoie aujourd'hui le rang tel quel. Les tiers dérivés du rang sont donc des buckets **exacts**
(`diamond`, `emerald`) alors que le tier par défaut est un bucket `_plus` (`emerald_plus`) : incohérent, et
systématiquement moins fourni.

Table explicite remplaçant l'identité, avec les volumes mesurés (bot, 30 j) :

| Rang joueur | Tier Lolalytics | Parties |
|---|---|---|
| `iron` | `iron` | 1,42 M |
| `bronze` | `bronze` | 5,02 M |
| `silver` | `silver` | 7,97 M |
| `gold` | `gold_plus` | 31,4 M |
| `platinum` | `platinum_plus` | 21,2 M |
| `emerald` | `emerald_plus` | 11,7 M |
| `diamond` | `diamond_plus` | 4,85 M |
| `master_plus` | `d2_plus` | 3,94 M |

Règle : le bucket `_plus` quand Lolalytics en fournit un, le bucket exact sinon. **Lolalytics ne fournit de
`_plus` qu'à partir de `gold`** — `silver_plus`, `bronze_plus` et `iron_plus` répondent HTTP 200 avec zéro
champion, ce ne sont pas des tiers valides. D'où les buckets exacts en bas de ladder, où le volume reste de
toute façon suffisant.

`master_plus` est servi par `d2_plus` : 2,1× plus de parties que `master_plus` (1,91 M), population toujours de
haut niveau. Choix du joueur, qui est lui-même à ce rang.

Chaque valeur de la colonne « Tier Lolalytics » a été vérifiée : HTTP 200, 173 champions, et totaux distincts
d'un tier à l'autre (donc le paramètre est réellement honoré, pas silencieusement ignoré).

Le repli `rank_fallback` existant est conservé sans changement.

**Décision à confirmer.** Le joueur ne s'est prononcé que sur son propre rang. Le choix d'un bucket `_plus` de
`gold` à `diamond` met en commun les rangs supérieurs : un joueur gold serait donc conseillé sur des
statistiques gold-et-au-dessus, pas strictement gold. Le bucket exact (`gold` : 10,2 M) serait plus fidèle à ce
qu'il affronte réellement. À trancher avant la vague 0 ; sans arbitrage, la table ci-dessus s'applique.

## 4. Distribution adverse (`future_opponent`)

### 4.1 Changement

```python
# aujourd'hui — le pick rate est absent du bras counter
p_counter[c] = threat[c] / Σ threat

# proposé
p_counter[c] ∝ pick_rate[c] · threat[c] ** α
```

Le reste de `opponent_distribution` est inchangé : `p_meta`, le mélange `(1 − λ)·p_meta + λ·p_counter`, et le
repli sur `p_meta` quand aucune menace n'existe.

### 4.2 Pourquoi deux facteurs

Les deux termes font des métiers distincts et doivent rester séparés :

- `pick_rate` porte le réalisme — l'adversaire prend un counter **qu'il joue**.
- `α` porte la concentration — il prend son **meilleur** counter, pas un au hasard parmi les mauvais.

Les fondre dans un seul paramètre était l'erreur de conception initiale.

### 4.3 Paramètre

`counter_alpha: float` dans `ScoringConstants`, valeur unique, calibrée en vague 1. Volontairement **non**
dépendante du rang : `counter_lambda` encode déjà le rang, l'y redoubler serait du double comptage.

### 4.4 Effet attendu sur la variance

Concentrer la masse creuse la moyenne du terme **et** réduit sa variance. Les deux poussent un pick dispersé
vers le bas. C'est la raison pour laquelle la préférence de risque (§5) est calibrée **après** ce changement :
appliquée avant, elle compterait la pénalité deux fois.

## 5. Risque et classement

### 5.1 Décision

> Le classement reste l'espérance. Le risque n'ordonne que l'**intérieur du groupe de tête** : à égalité
> statistique, le plus sûr passe devant.

### 5.2 Pourquoi pas la borne basse

Le bilan de calibration proposait de trier tout le monde sur `avantage − σ`. Écarté pour deux raisons :

- **Ça punit l'ignorance, pas le risque.** Le σ total mélange deux natures opposées. La dispersion de
  `future_opponent` est un risque subi : le joueur ignore qui il affrontera et en subira les conséquences. Le σ
  de `mastery` ou `composition` ne dit que « on manque de données ». Un manque de données n'a jamais fait perdre
  une partie.
- **Ça produit des inversions d'affichage.** Un champion à `+3,1` classé sous un champion à `+2,4`, sans
  explication lisible dans l'interface.

Le groupe de tête existe déjà et l'interface annonce déjà ses membres comme équivalents. Ordonner à l'intérieur
n'affirme donc rien de neuf : c'est un départage, pas une prétention de classement.

### 5.3 Dépendance au contexte de draft

Obtenue sans paramètre : `future_opponent_term` retourne déjà `None` quand `my_lane_opponent_revealed` ou
`remaining_enemy_picks <= 0`. En last pick, le risque de résultat est donc nul pour tous les candidats et le
départage est inerte. En blind pick early, il est large et différencié, et il mord.

### 5.4 Mécanique

- `Term` gagne `outcome_sd: float = 0.0`, avec l'invariant `outcome_sd <= sd`.
- Seul `future_opponent` le renseigne, et seulement dans sa branche **avec** données (`outcome_sd = sd`). Sa
  branche « aucune page de counters » relève de l'ignorance, pas du risque : `outcome_sd = 0`.
- `Estimate.outcome_sd` = `sqrt(Σ outcome_sd²)`, nouveau.
- `Estimate.sd` est **inchangé** : l'affichage, `confidence_from_sd` et `top_group` continuent d'utiliser
  l'incertitude complète, qui reste la grandeur honnête à montrer.
- Dans `draft_engine`, après le tri par espérance et le calcul de `top_group` : réordonner les membres du groupe
  par `outcome_sd` croissant. `top_group_ids` est reconstruit dans le nouvel ordre.

L'appartenance au groupe est déterminée par l'espérance (qui est indistinguable de la meilleure espérance),
l'ordre **dans** le groupe par le risque. Cette séparation évite le point fixe qu'un tri unique introduirait.

### 5.5 Réserve

Si la mesure montre le départage trop faible, un coefficient `γ` sur `total − γ · outcome_sd` reste la sortie de
secours. Il n'est **pas** ajouté d'avance.

### 5.6 Conséquences hors moteur

Le frontend affiche les recommandations dans l'ordre reçu et marque déjà `tie_with_leader` : **aucun changement
client, aucune migration**.

Une seule modification de schéma, **additive** : `Recommendation` gagne `outcome_sd: float = 0.0`, que le
moteur doit lire pour départager le groupe. Le client l'ignore, comme tout champ qu'il ne connaît pas.

Point d'attention à l'implémentation : `scored[0]` sert aussi aux avertissements de composition et à
`win_probability`. Ces deux valeurs suivront le nouveau leader, ce qui est le comportement voulu.

## 6. Suite de calibration

### 6.1 Contrainte d'ordre

La suite doit être **verrouillée avant la vague 1**. Sinon l'étalon bouge en même temps que le moteur et la
mesure ne dit plus rien. Le jugement du joueur porte sur ce qu'est le bon pick à League : il ne dépend pas du
moteur et peut donc être recueilli avant tout changement de code.

### 6.2 Triage mécanique

Pour chaque assertion d'ordre (`must_rank_higher_than`, `must_be_top_1`, `must_be_in_top_N`,
`must_not_be_top_3`), déterminer si la question posée est **décidable** : l'écart entre les champions concernés
dépasse-t-il la racine de la somme de leurs variances ?

| Décidable | Résultat | Traitement |
|---|---|---|
| Non | — | Convertie en `must_be_tied`. La donnée ne porte pas la question. |
| Oui | Réussie | Conservée telle quelle. |
| Oui | Échouée | **Arbitrage joueur.** Le moteur tranche avec assurance, dans le mauvais sens. |

### 6.3 Outillage

Mode `--diagnose` sur `run_calibration.py` : sort la décidabilité de chaque assertion, l'écart observé et
l'incertitude combinée. Rend le triage reproductible au lieu de le laisser au jugement au cas par cas.

### 6.4 Arbitrage

Les cas décidables-échoués sont présentés au joueur avec leur setup et le détail complet des termes. Priorité
aux cas ADC/bot, rôle sur lequel son jugement est le plus solide. Volume attendu : une dizaine d'assertions sur
52, pas la totalité.

### 6.5 Baseline

Le baseline actuel (33/50 à `emerald`) ne décrit pas le régime du joueur et n'est pas une référence valide. Un
nouveau baseline est établi à `d2_plus` sur la suite triée, et devient la référence des vagues 1 et 2.

Effet de bord attendu : après la vague 1, la concentration réduira certains σ et rendra décidables des
assertions qui ne l'étaient pas. C'est un **résultat** à constater en fin de parcours, pas un étalon mouvant.

## 7. Ordre d'implémentation

| Vague | Contenu | Mesure avant de passer à la suivante |
|---|---|---|
| 0 | Table rang → tier (§3), mode `--diagnose` (§6.3), triage et arbitrage (§6.2, §6.4) | Baseline verrouillé à `d2_plus` |
| 1 | Distribution adverse (§4) | Le cas Yasuo redescend-il seul ? Score global et par catégorie |
| 2 | Risque et classement (§5) | Score global et par catégorie ; γ nécessaire ou non |

L'ordre n'est pas cosmétique. La vague 1 corrige un **biais** — l'espérance est fausse. La vague 2 exprime une
**préférence** — à espérance égale, le joueur préfère le sûr. Corriger le biais d'abord est la seule façon de
calibrer la préférence sur du risque résiduel réel.

## 8. Tests

- `opponent_distribution` : une menace rare pèse moins qu'une menace courante de force égale ; la part du top 3
  croît avec `α` ; à `α = 1` et pick rates uniformes, retour au comportement actuel (garde anti-régression) ;
  repli sans menace inchangé ; la distribution somme à 1.
- `lolalytics_tier` : chaque rang de `RANKS` donne le tier attendu ; rang inconnu et `None` donnent le défaut.
- `Term` / `Estimate` : invariant `outcome_sd <= sd` ; `Estimate.outcome_sd` compose en quadrature ;
  `Estimate.sd` inchangé.
- `future_opponent_term` : `outcome_sd = sd` dans la branche avec données, `0` dans la branche sans données.
- `draft_engine` : à espérance quasi égale dans le groupe de tête, le candidat au plus faible `outcome_sd` passe
  premier ; hors groupe l'ordre reste celui de l'espérance ; en last pick le départage est inerte ;
  `top_group_ids` suit le nouvel ordre.

## 9. Critère de réussite

Le jugement du joueur, recueilli par arbitrage (§6.4), fait foi. Le score de la suite de calibration est un
indicateur de régression, pas l'objectif : une hausse obtenue en cassant une catégorie est un
sur-apprentissage, pas une amélioration.
