# La synergie mesurée par paire — spec de conception

Chantier 3. Arbitré avec le joueur les 27 et 28 septembre 2026, sur données Lolalytics relevées
à ces dates.

## 1. Objectif

Le terme `synergy` ne voit aucune paire. Mesuré sur 100 duos ADC × support (chantier 3), son
score est purement additif, `f(support) + g(ADC)` : Xayah + Rakan, le duo le plus explicitement
conçu comme paire du jeu, sort dans la bande la plus basse, et 25 combinaisons sur 100 sont
collées au plafond.

Objectif : que le terme mesure ce qu'est une synergie — ce qu'une paire gagne **au-delà** de la
force de chacun — à partir des parties jouées, comme le terme matchup mesure un duel.

Décisions du joueur :

- La mesure **remplace** la synergie de kit quand la donnée existe ; les règles de kit ne
  servent plus qu'en repli (option A, 27/09).
- Le jugement passe par des **cas de calibration tirés des données** et validés un par un (§8).
- Quand son avis et les données divergent, c'est à Claude de trancher (28/09) — conforme à sa
  règle du 27/09, « les données ont raison ».

## 2. Constat

`SynergyAnalyzer.score()` (`app/services/synergy.py`) part de 50 et empile sept blocs lus sur les
notes :

| Bloc | Ce qu'il fait | Problème |
|---|---|---|
| 1. Mélange des dégâts | ±6 selon la part AD/AP de l'équipe | Doublon : `composition` a déjà l'avertissement |
| 2. Chaîne de CC | somme des `cc` de l'équipe | Somme, pas une paire |
| 3. Engage + suite | +5 si un allié engage et que le candidat fait des dégâts | Vrai pour tout carry |
| 4. ADC + support | jusqu'à +23, lu sur les seules notes du support | **La source de l'additivité** |
| 5. Carry mêlée + peel | ±6/8 pour Nilah et Yasuo | Seule vraie règle de paire |
| 6. Frontline / backline | +3/−4 | Doublon : `composition` a déjà l'avertissement |
| 7. AoE | +4 si la moyenne `teamfight` ≥ 4 | Moyenne d'équipe |

`synergy_term` convertit ensuite `(score − 50) × 0,12`, plafonné à ±3 pts : le plafond est atteint
dès 75/100, d'où les 25 duos au plafond.

L'en-tête du module affirme que « l'endpoint de synergie Lolalytics n'est pas accessible ». C'est
faux : il existe, sous un autre nom.

## 3. Source : l'interaction mesurée par Lolalytics

`GET /mega/?ep=build-team&v=1&patch=30&c={slug}&lane={lane}&tier={tier}&queue=ranked&region=all`

Réponse : `team_h = [id, wr, d1, d2, pr, n]`, et `team = {lane: [[...], ...]}` pour les quatre
autres postes, environ 170 lignes chacun (tous les champions, y compris sur quelques parties).

**`d2` est la part non additive.** Vérifié sur Xayah (bot) et ses supports :
`d2 ≈ WR du duo − (WR de Xayah + WR du support − WR moyen)`, à 0,05 près ; l'écart restant vient
de la fenêtre de la tier list utilisée pour la vérification. Ni la force du candidat ni celle de
l'allié n'y figurent : pas de double compte avec `meta` ou `popularity`.

**Symétrique.** Sur 256 paires vues des deux côtés (page de l'ADC et page du support, Émeraude+),
les deux `d2` concordent à 0,2 près.

Exemples, fenêtre de 30 jours :

| Paire | `d2` Master+ | parties | `d2` Émeraude+ | parties |
|---|---|---|---|---|
| Xayah + Rakan | +2,31 | 8 816 | +1,26 | 47 986 |
| Jinx + Rakan | −2,76 | 2 042 | −1,98 | 11 594 |
| Yasuo mid + Malphite top | — | — | +1,27 | 29 116 |
| Braum + Yunara | +4,46 | 6 702 | +4,41 | 28 387 |
| Braum + Jhin | −5,63 | 1 521 | −4,29 | 8 707 |
| Kai'Sa + Nautilus | −0,67 | 23 323 | −0,35 | 120 388 |
| Senna bot + Yuumi | — | — | −6,85 | 326 |

## 4. Rétrécissement : k par type de paire et par palier

La plupart de la dispersion brute de `d2` est du bruit. Estimation bayésienne empirique sur les
pages des 16 ADC et 16 supports les plus joués : variance réelle `τ² = var(d2) − moyenne(2500/n)`,
paires d'au moins 300 parties.

| Type de paire | τ Master+ | τ Émeraude+ | `k = 2500 / τ²` |
|---|---|---|---|
| bot + support | 1,05 pt | 1,39 pt | 2 251 / 1 299 |
| autre (jungle-mid, top-bot…) | 0,46 pt | 0,57 pt | 11 589 / 7 669 |

Avec `k = 2500 / τ²`, les helpers existants donnent exactement la moyenne et l'écart-type a
posteriori du modèle normal-normal : `shrink(d2, n, k)` et `shrink_sd(n, k) = 50 / √(n + k)`.
Aucun nouvel outil statistique.

Le `k_matchup = 200` du terme matchup est écarté pour la synergie : il laisserait −4 pts à Senna
+ Yuumi sur 326 parties.

**Fichier** : `app/data/synergy_priors.json`, `{tier: {"bot_support": k, "other": k}}`, avec la
date et le nombre de paires. Produit par `scripts/refresh_synergy_priors.py` : pour chaque palier
que le moteur peut demander (valeurs de `rank_tier_map`, `config.rank_tier`, et `master_plus`,
palier du gel de calibration), pages `build-team` des 20 champions les plus joués de chaque
poste, estimation ci-dessus. À rejouer à chaque grosse bascule de méta, comme
`refresh_roles.py`. Un palier absent du fichier prend la valeur du palier par défaut ; un fichier
absent, les valeurs Master+ ci-dessus écrites en dur dans la configuration.

## 5. Le terme

Pour un candidat `C` au poste `R`, avec la page `build-team` de `C` au poste `R` :

```python
for ally in allies_connus:
    ally_role = ally.role or poste_principal(ally)
    row = page[role_to_lane(ally_role)].get(ally.id)
    kind = "bot_support" if {R, ally_role} == {"bot", "support"} else "other"
    k = priors[tier][kind]
    d2, n = (row.d2, row.n) if row else (0.0, 0)
    w = synergy_duo_factor if ally est le partenaire duo else 1.0
    value += w * shrink(d2, n, k)
    variance += (w * shrink_sd(n, k)) ** 2
value *= synergy_observed_scale
Term("synergy", value, sqrt(variance) * synergy_observed_scale, "observed", sum(n), ...)
```

- **Poste de l'allié** : celui de la draft ; inconnu, son poste principal (`roles[0]`).
- **Allié absent de la page** (champion trop récent) : contribue 0, avec l'incertitude maximale
  `shrink_sd(0, k) = τ`.
- **Pas de plafond** : le rétrécissement borne la valeur, comme pour le matchup.
- **Incertitude en `abs_sd`**, pas en `rel_sd` : elle est propre à chaque paire et ne s'annule pas
  entre deux candidats. `outcome_sd = 0` : les alliés sont connus, l'incertitude est une
  ignorance, pas un risque subi.
- **Mode duo** : `synergy_duo_factor` (1,5) ne multiplie plus le terme entier mais la seule paire
  formée avec le partenaire.
- **`synergy_observed_scale`** (défaut 1,0) : le levier du balayage (§7).
- **Préchargement** : la page est chargée en parallèle des pages de matchup dans
  `_score_candidate`, avec le cache à TTL et le disjoncteur existants.

**Repli** : page du candidat indisponible (`{}`) → `SynergyAnalyzer.score()` actuel **sans les
blocs 1 et 6**, converti par `synergy_term` comme aujourd'hui, source `heuristic`.

## 6. Affichage et raisons

- `SynergyDetail` gagne `games: int = 0` ; `source` vaut `observed` ou `kit_heuristic`. En
  observé, `delta` est l'observation rétrécie `shrink(d2, n, k)`, **sans** facteur duo ni
  `synergy_observed_scale` : comme les `matchup_details` (chantier 10), c'est une observation
  affichée, pas la contribution au score.
- `WhyPanel` (« Face à eux, avec eux ») : sous le chiffre, « 8 816 parties » au lieu de
  « synergie kit » quand la paire est observée ; infobulle « Interaction mesurée : win rate du
  duo au-delà de la force de chacun ». Le repli garde le libellé actuel.
- **Raisons** : en observé, une raison seulement si `|delta| ≥ 1,0` — « Duo favorable avec
  Rakan (+1,8) » (`synergy`) ou « Duo défavorable avec Nautilus (−1,2) » (`warning`). Les
  gabarits de kit (`SYNERGY_REASONS`) ne servent qu'en repli : sinon « Engage Nautilus setup la
  DPS d'Ashe » s'afficherait à côté d'un −1,2 mesuré.

## 7. Mesure

**Gel.** Le gel actuel n'a pas les pages `build-team`. Nouvelle option
`run_calibration.py --extend-frozen` : copie du cache vivant vers le gel **les seules entrées
absentes du gel**, sans toucher aux autres, et note la date d'extension dans le manifeste.
L'ancien moteur ne lit pas ces entrées : il rejoue son baseline à l'identique, et l'ancien et le
nouveau se comparent sur le même gel. Le décalage de date entre les pages de duo et le reste est
consigné.

**Ordre** :

1. Ajouter les cas (§8) ; les jouer sur l'ancien moteur. Un cas qui passe déjà nettement ne
   prouve rien : le signaler avant de mesurer.
2. Remplir le cache vivant (un run `--live-cache`), puis `--extend-frozen`.
3. `--snapshot` de l'ancien moteur, puis du nouveau ; `--compare`.
4. Concordance pro (5 250 décisions), appariée : McNemar sur le top-3 et le top-10.
5. Balayage de `synergy_observed_scale` à 0 / 0,5 / 1,0 / 1,5 sur les deux instruments.

**Règle d'acceptation**, celle des chantiers 16 et 18 : aucune catégorie de calibration perdue
(ancien et nouveau moteur jugés sur le même jeu de cas, nouveaux cas compris), et pas de recul
significatif de la concordance (z > −2 en top-3 et en top-10). Sinon le levier
reste à 0, la mesure est consignée dans le `README.md` de la calibration, et le code reste en
place.

## 8. Cas de calibration

Validés par le joueur le 27/09 (1 à 4) et le 28/09 (5). Poste `bot`, support allié déjà pické,
adversaire : jungle Lee Sin. Les deux champions comparés sont au même palier de maîtrise (A) ;
les autres du pool servent de décor. Confiance `medium`.

| Cas | Support allié | Pool | Assertion | `d2` Master+ (parties) | Pourquoi ce n'est pas acquis |
|---|---|---|---|---|---|
| `synergy_braum_yunara_over_jhin` | Braum | Yunara, Jhin, Caitlyn, Ezreal | Yunara > Jhin | +4,46 (6 702) / −5,63 (1 521) | Jhin plus joué (16,8 % contre 12,4 %) |
| `synergy_nautilus_samira_over_ashe` | Nautilus | Samira, Ashe, Jinx, Ezreal | Samira > Ashe | +2,14 (5 163) / −3,17 (1 377) | Ashe meilleur WR et plus jouée |
| `synergy_rakan_xayah_over_jinx` | Rakan | Xayah, Jinx, Kai'Sa, Caitlyn | Xayah > Jinx | +2,31 (8 816) / −2,76 (2 042) | Jinx 54,3 % de WR, 17,7 % de pick |
| `synergy_senna_jhin_over_tristana` | Senna | Jhin, Tristana, Caitlyn, Ezreal | Jhin > Tristana | +2,88 (5 375) / −1,27 (1 592) | Tristana 2 pts de WR de plus |
| `synergy_lulu_twitch_over_jhin` | Lulu | Twitch, Jhin, Jinx, Ezreal | Twitch > Jhin | +0,84 (7 484) / −2,87 (1 141) | Jhin trois fois plus joué |

**Retiré** : `synergy_senna_tahmkench` — « outdated de fou » (joueur), remplacé par le cas Senna
support. **Gardé** : `synergy_yasuo_with_malphite` (+1,27 sur 29 116 parties), seul cas hors
duo bot.

**Proposés par le joueur, sans cas** (« mon avis est celui d'un master ADC », tranché par Claude
le 28/09, consigné dans `docs/ARBITRAGE_JOUEUR.md`) :

- **Kai'Sa + Nautilus** « c'est strong » : −0,67 en Master+ (23 323 parties), −0,35 en Émeraude+
  (120 388), 28ᵉ support de Kai'Sa sur 38. Le duo est fort parce que chacun l'est, ce que `meta`
  et `popularity` récompensent déjà ; il ne gagne pas plus que la somme. Un cas contraire
  testerait le terme contre ses propres données.
- **Kog'Maw + Lulu** : les données ne peuvent pas trancher (§9).

## 9. Limites

- **Paire quasi exclusive.** En Master+, Kog'Maw n'a que deux supports à plus de 1 000 parties
  (Lulu, Milio) : son win rate est presque celui du duo avec Lulu, et le `d2` de la paire sort
  à 0 par construction. Le moteur surestime donc Kog'Maw avec un support qui n'est pas un
  enchanteur, et les autres paires, rétrécies faute de parties, ne corrigent rien. Piste si ça
  gêne : rétrécir vers l'estimation de kit plutôt que vers 0 (option C du 27/09, écartée pour
  l'instant).
- **Duos premade.** La soloqueue mêle joueurs seuls et duos premade ; une paire iconique (Xayah
  + Rakan) est probablement plus jouée en premade, et son `d2` mêle l'effet de la paire et la
  coordination. Non séparable avec cette source.
- **Une page par candidat et par poste** : ~10 requêtes de plus à la première analyse d'une
  draft, mises en cache ensuite.

## 10. Tests

- `parse_team` : lignes valides, champs manquants ou non finis, `n ≤ 0`, lane absente.
- Le terme : k par type de paire, allié absent, poste inconnu, facteur duo sur la seule paire du
  partenaire, `synergy_observed_scale`, repli sans les blocs 1 et 6.
- Câblage **par le moteur** : le terme `synergy` observé atteint `breakdown.terms` (leçon du
  chantier 10 : une recherche dans le source prouve l'appel, pas le résultat).
- Raisons : seuil ±1,0, pas de gabarit de kit en observé.
- `refresh_synergy_priors.py` : estimation de τ et de k sur des données fictives de dispersion
  connue.
- `--extend-frozen` : n'écrase aucune entrée existante, met à jour le manifeste.
- Vitest : parties affichées en observé, libellé de kit en repli.

## 11. Hors périmètre

- Les synergies à trois ou plus (seules les paires sont mesurées).
- Les règles de kit du chantier 18 (`mechanics`), qui restent telles quelles.
- La composition (`composition`, `archetype`).
- La synergie avec le pool du partenaire duo avant qu'il ait pické.

## 12. Fichiers touchés

| Fichier | Changement |
|---|---|
| `server/app/services/data_fetcher.py` | `fetch_team_page`, `parse_team` |
| `server/app/services/synergy.py` | terme observé, repli sans blocs 1 et 6, en-tête corrigé |
| `server/app/scoring/heuristic_terms.py` ou nouveau `synergy_term.py` | construction du `Term` observé |
| `server/app/scoring/config.py` | `synergy_observed_scale`, priors par défaut |
| `server/app/data/synergy_priors.json` | k par palier et type de paire |
| `server/scripts/refresh_synergy_priors.py` | estimation bayésienne empirique |
| `server/app/services/draft_engine.py` | préchargement, facteur duo par paire |
| `server/app/models/draft.py` | `SynergyDetail.games` |
| `server/app/services/reasons.py` | raisons observées, gabarits en repli |
| `server/tests/calibration/cases.json`, `run_calibration.py`, `frozen_cache.py` | 5 cas, retrait, `--extend-frozen` |
| `client/src/data/mock.js`, `client/src/components/Draft/WhyPanel.jsx` | parties affichées |
| `docs/CHANTIERS.md`, `docs/ARBITRAGE_JOUEUR.md`, `server/tests/calibration/README.md` | bilan |
