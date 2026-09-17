# L'apport à la partie face au duel de couloir — spec de conception

Chantier 5. Arbitré avec le joueur le 18 septembre 2026, sur données gelées du 17/09.

## 1. Objectif

Le moteur sur-pondère ce qui se passe dans le couloir face à ce que le champion apporte à la
partie entière. Constat du joueur sur `comp_engage_mid_peel` : « Zed a un meilleur matchup mid
mais Orianna meilleure overall pour la game, donc je pense Orianna. » Le moteur classe Zed n°1
et Orianna n°5.

## 2. Constat mesuré (18 septembre 2026)

Décomposition de l'écart, cache gelé du 17/09, `master_plus` :

| Terme | Zed | Orianna | Écart |
|---|---|---|---|
| meta | +1,80 | −2,18 | **+3,98** |
| matchup | +1,79 | −0,46 | **+2,25** |
| mastery | +0,93 | 0,00 | +0,93 |
| archetype | +0,75 | +1,20 | −0,45 |
| synergy | +2,40 | +2,88 | −0,48 |
| composition | 0,00 | +1,00 | −1,00 |
| **Total** | **+3,68** | **−1,55** | **+5,23** |

**L'énoncé du chantier était inexact.** Le premier moteur de l'écart n'est pas le matchup de
lane mais le terme **méta** — le win rate brut, presque le double du matchup. Zed ne sort pas
n°1 parce qu'il gagne sa lane, mais parce qu'il est fort dans la méta actuelle.

Les deux termes qui portent déjà l'apport à la partie donnent raison au joueur, mais faiblement :
Orianna gagne 1,45 sur `archetype` et `composition` réunis, et en perd 3,98 sur la méta.

**Le moteur n'a pas tort sur les données.** Au master+, Zed gagne réellement plus que la moyenne
et Orianna réellement moins. L'arbitrage du joueur demande que le raisonnement contextuel puisse
contredire une observation de win rate. C'est la tension que cette spec traite.

## 3. Ce qui manque au modèle

Interrogé sur ce que « meilleure overall pour la game » veut dire concrètement, le joueur retient
deux choses :

1. **L'impact en teamfight n'est modélisé nulle part.** `composition` mesure la couverture
   d'outils manquants, `archetype` la réponse au plan de jeu adverse. Aucun des deux ne dit
   « ce champion pèse lourd quand les dix sont groupés ».
2. **Le matchup compte moins à haut elo.** Une lane perdue se rattrape ; une compo sans front
   line ne se rattrape pas.

Il écarte explicitement l'idée que Zed serait un pick « égoïste » — cette lecture reste ouverte
et relève du chantier 1.

## 4. Terme d'impact en teamfight

### 4.1 Décision

Un terme `teamfight`, **permanent et de faible amplitude**, et non conditionné à la forme
annoncée de la partie. Choix du joueur, retenu contre la recommandation initiale.

```python
value = (ratings.teamfight - c.teamfight_reference) * c.teamfight_scale
```

`teamfight_reference = 3.0`, milieu de l'échelle 1-5. `teamfight_scale` est **la constante à
calibrer** ; la cible visée est une amplitude d'environ ±1 point de win rate aux extrêmes de
l'échelle, soit un ordre de grandeur de 0,5, mais c'est le balayage qui tranche et la valeur par
défaut est neutre (§8).

Le terme est **inconditionnel** : il ne dépend ni des alliés connus, ni des picks adverses, ni du
rang. Il est présent pour tout candidat, y compris au tout premier pick. C'est le sens de
« permanent ».

Comme les autres termes heuristiques (`composition`, `archetype`), il porte son incertitude en
`rel_sd` et non en `abs_sd` : l'erreur est sur la constante de conversion en points de win rate,
la même pour tous les candidats, donc elle s'annule dans la comparaison de deux champions. Une
`abs_sd` élargirait le groupe de tête sans raison et diluerait le départage de la vague 2.

### 4.2 Pourquoi permanent plutôt que conditionné

Un terme conditionné à la compo adverse prolongerait `archetype` et éviterait de pénaliser
structurellement les assassins. Le joueur préfère l'effet permanent faible : un impact en
combat groupé vaut quelque chose dans toutes les parties, pas seulement dans celles qui
s'annoncent groupées.

L'objection au permanent faible était qu'un effet faible et inconditionnel est invisible pour
la suite de calibration — comme `counter_alpha`. **Cette objection est levée** : `--compare`
(chantier 12) voit les déplacements de score sans attendre qu'une assertion bascule.

### 4.3 Limite connue

`teamfight` sépare Orianna (4) de Zed (2), donc le terme mord sur le cas de référence. Mais sur
les 59 champions mid il n'existe que **29 vecteurs de notes distincts**, et le plus gros paquet
en regroupe 11 : Syndra, Lissandra et Veigar sont numériquement identiques. Le terme sera aveugle
entre eux.

C'est le chantier 4 (102 champions non notés à la main) qui transparaît. Il ne bloque pas cette
spec, mais il en borne la portée, et il faut le dire plutôt que de laisser croire à une
discrimination qui n'existe pas.

### 4.4 Risque de double comptage

`synergy` lit déjà `ratings`. Dans le cas mesuré il donne +2,88 à Orianna contre +2,40 à Zed,
donc il capte déjà une partie de l'écart de teamfight. Le terme doit être calibré **en présence**
de `synergy`, jamais dans l'absolu, et sa contribution mesurée avec `--compare` isolément.

## 5. Poids du matchup décroissant avec le rang

### 5.1 Décision

Le terme `matchup` est multiplié par un poids dépendant du rang, en sens inverse de
`counter_lambda` : plus le rang monte, moins le duel de couloir décide la partie.

```python
value = raw_matchup * c.matchup_weight[rank]
```

### 5.2 Périmètre

Le poids s'applique au terme `matchup` seul. `future_opponent` n'y touche pas : il porte déjà
`counter_lambda`, qui encode le rang. Y superposer un second facteur de rang serait du double
comptage — même faute que celle évitée en gardant `counter_alpha` indépendant du rang.

### 5.3 Valeur inconnue

Aucune valeur n'est fixée a priori. La table est calibrée par balayage, avec le refus habituel :
on ne retient pas un réglage qui fait perdre à une catégorie plus qu'il ne lui fait gagner.

La table doit couvrir les huit rangs de `RANKS` et fournir un `matchup_weight_unknown` pour un
rang absent ou non reconnu, exactement comme `counter_lambda_unknown`. Le balayage porte sur un
facteur d'échelle appliqué à toute la table plutôt que sur huit valeurs indépendantes : la suite
de calibration ne tourne que sur un rang à la fois, elle ne pourrait pas départager huit
paramètres.

## 6. Amortissement de la méta par le contexte

### 6.1 Décision

```python
value = raw_meta * (1.0 - c.meta_context_damping * context_fraction)
```

`context_fraction` est la part du contexte adverse connue :

```python
context_fraction = len([e for e in draft.enemy_picks if e.champion_id]) / 5.0
```

Cinq au dénominateur, la taille d'une équipe adverse complète, bornée à 1,0. À zéro pick révélé
le terme méta est intact ; à draft adverse complet il est amorti de `meta_context_damping`.

Le compte porte sur les picks **adverses** seuls, pas sur les alliés. Un allié connu informe
`composition` et `synergy`, mais il ne dit rien sur le contexte dans lequel le win rate moyen du
candidat a été observé — ce que l'amortissement corrige, c'est la confrontation à l'équipe d'en
face.

L'amortissement porte sur la **valeur** du terme, pas sur son incertitude. Réduire `abs_sd` en
même temps ferait croire à une observation plus précise, alors qu'on affirme l'inverse : la
moyenne devient moins pertinente, pas mieux mesurée.

### 6.2 Le raisonnement

Le win rate brut est une moyenne **sur tous les contextes**, y compris ceux où le champion a été
pické dans une situation favorable. Tant que le contexte réel est inconnu, cette moyenne est la
meilleure information disponible. Quand il est connu, continuer à la compter à plein revient à la
compter deux fois contre les termes qui, eux, décrivent *cette* partie.

L'amortissement est **symétrique** : il ramène un champion fort vers zéro comme un champion
faible. Ce n'est pas une pénalité des champions forts, c'est un aveu que la moyenne devient moins
informative à mesure que le particulier se précise.

### 6.3 Ce que l'amortissement ne fera pas

Le cas de référence **ne basculera pas** à des magnitudes défendables :

| Réglage | Écart Zed − Orianna |
|---|---|
| Aujourd'hui | +5,23 |
| teamfight ±1, matchup ×0,6, méta amortie de 35 % | +2,14 |
| teamfight ±1, matchup ×0,4, méta amortie de **80 %** | −0,10 |

Faire passer `comp_engage_mid_peel` demanderait d'éventrer le seul terme entièrement observé du
moteur, au prix probable de `blind_pick` et `counter` qui reposent dessus. **Ce n'est pas
l'objectif de cette spec.** Le cas est marqué `confidence: low` : son échec est un signal à
instruire, pas une régression bloquante.

L'objectif est que le moteur aille dans le sens de l'arbitrage du joueur, et qu'on sache de
combien. Si la mesure montre un déplacement nul, la spec a échoué et il faudra revenir au
chantier 1 — des notes décomposées plutôt que des poids.

## 7. Protocole de mesure

Le cache gelé (chantier 9) et `--compare` (chantier 12) sont des prérequis, pas du confort.

1. **Snapshot de référence** avant toute modification, sur le cache gelé du 17/09.
2. **Un `--compare` par levier isolé**, les deux autres neutres. Consigner déplacements de score,
   changements de rang et assertions basculées séparément.
3. **Balayage de chaque constante**, les autres à leur valeur neutre.
4. **Mesure conjointe** des trois, pour révéler les interactions que les mesures isolées ratent.

Refus de retenir un réglage qui fait perdre à une catégorie plus qu'il ne fait gagner au global.
À égalité de preuve, la valeur qui suppose le moins — la règle qui a fixé `counter_alpha` à 1,0.

## 8. Constantes introduites

| Constante | Rôle | Valeur neutre |
|---|---|---|
| `teamfight_reference` | milieu de l'échelle des notes | 3.0 (fixe, non calibrée) |
| `teamfight_scale` | amplitude du terme teamfight | 0.0 |
| `teamfight_rel` | incertitude relative du terme | 0.5, comme `comp_rel` |
| `matchup_weight` | table rang → poids du matchup | 1.0 aux huit rangs |
| `matchup_weight_unknown` | rang absent ou non reconnu | 1.0 |
| `meta_context_damping` | amortissement maximal de la méta | 0.0 |

Les trois constantes réglables valent **neutre par défaut**, de sorte que le câblage puisse être
commité et vérifié sans changer le comportement, et que chaque levier soit activé séparément à la
mesure.

## 9. Hors périmètre

- La notation à la main des 102 champions de top, jungle et mid (chantier 4), qui borne la portée
  du terme teamfight.
- La décomposition des dimensions de notation (chantier 1).
- Les cas de calibration en attente d'arbitrage (chantier 6).
- Le résidu du cas Yasuo laissé ouvert par la vague 2 : `γ` reste non activé, et savoir s'il
  relève de cette spec ou d'autre chose n'est pas tranché ici.
