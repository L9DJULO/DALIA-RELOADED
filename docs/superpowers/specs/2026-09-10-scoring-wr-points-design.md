# Scoring en points de win rate — spec de conception

Date : 10 septembre 2026. Statut : validée en discussion, à implémenter.

## 1. Objectif

Remplacer le score composite 0-100 du moteur de draft par une estimation en points de win rate (ΔWR), relative aux autres champions du pool, avec une incertitude explicite. Le joueur doit lire « Jinx : +3,1 ± 1,4 » et savoir si deux options sont réellement départagées. Chaque terme du score doit être testable seul, exprimé dans la même unité, et justifiable par une source (donnée observée, heuristique de kit, modèle).

Non-objectifs : nouvelles fonctionnalités produit (plan de draft conditionnel, résultat automatique, poids appris), modification du modèle ML, modification du recommandeur de bans au-delà de ce qui est nécessaire pour compiler.

## 2. Vocabulaire

- **Terme** : contribution d'un facteur au score, en points de win rate, avec un écart-type. Type `Term(name, value, sd, source, sample, note)`.
- **Total** : somme des valeurs des termes d'un candidat.
- **Avantage** : total du candidat moins la moyenne des totaux des candidats du pool (hors wildcards). C'est le `total_score` renvoyé et affiché.
- **Rétrécissement** : `shrink(x, n, k) = x × n / (n + k)`, écart-type associé `50 / sqrt(n + k)`.
- **Rang** : l'un de `iron, bronze, silver, gold, platinum, emerald, diamond, master_plus`, ou `None` (inconnu).

## 3. Architecture

Nouveau package `server/app/scoring/` :

| Module | Rôle |
|---|---|
| `types.py` | `Term`, `Estimate` (liste de termes, total, sd), `Rank`, constantes de sources (`observed`, `heuristic`, `model`). |
| `shrink.py` | `shrink(value, n, k)` et `shrink_sd(n, k)`. |
| `rank.py` | Normalisation d'un rang LCU/profil vers `Rank`, tables des facteurs (λ counter-pick, facteur de maîtrise), correspondance vers le paramètre `tier` Lolalytics. |
| `meta_term.py` | Terme méta depuis `MetaAnalyzer`. |
| `matchup_term.py` | Terme matchup contre les ennemis visibles depuis `MatchupAnalyzer`. |
| `opponent_model.py` | Distribution des picks adverses possibles dans mon rôle et terme « adversaire futur ». |
| `mastery_term.py` | Terme maîtrise depuis palier déclaré, stats personnelles, points de maîtrise et difficulté. |
| `composition_term.py` | Terme composition marginale. |
| `heuristic_terms.py` | Termes synergie, mécaniques, archétype, modèle. |
| `aggregate.py` | Somme, écart-type total, avantage relatif, groupe de tête, confiance dérivée. |
| `config.py` | Toutes les constantes numériques de cette spec (k, bornes, facteurs) dans un `ScoringConstants` Pydantic exposé par `app.config`. |

`DraftEngine` (`server/app/services/draft_engine.py`) conserve : inférence des rôles ennemis, injection des pré-picks et du duo, chargement des caches, wildcards, bans, impact des bans, raisons, verdict, tags, résumé de composition. Il perd tout le pipeline de `_score_candidate` (poids, remodelage par ordre de pick, multiplicateurs par rôle, pool de bonus, pénalités multiplicatives, plancher, bornes, pénalité blind), `_draft_risk`, `TIER_TO_MASTERY`, `HIGH_RISK_BLIND`, `_get_blind_penalty_override`, la normalisation post-classement et la mise à l'échelle ×2 du WPA. `_score_candidate` devient : appeler chaque module de terme, agréger, construire la `Recommendation`.

Les analyseurs existants (`MetaAnalyzer`, `MatchupAnalyzer`, `SynergyAnalyzer`, `CompositionAnalyzer`, `MechanicsAnalyzer`, archétypes) restent les fournisseurs de données brutes. `MetaAnalyzer.score` (0-100) et `MatchupAnalyzer.get_top_counters` restent pour le recommandeur de bans, l'impact des bans et le filtre de viabilité des wildcards.

## 4. Termes

Toutes les constantes ci-dessous vivent dans `scoring/config.py`. Les multiplicateurs de préférence (section 7) s'appliquent à la valeur du terme après calcul, jamais à l'écart-type.

### 4.1 Méta (`meta`)

`value = shrink(WR − 50, n, k_meta)` avec `k_meta = 500`, WR et n issus de `ChampionStats` pour (champion, rôle, rang). `sd = shrink_sd(n, k_meta)`. Sans statistique : `value = 0`, `sd = 3.0`, `source = heuristic`, note « aucune statistique ». Pick rate et ban rate ne participent pas au score.

### 4.2 Matchup (`matchup`)

Pour chaque ennemi visible `e` de distribution de rôles `p_e(r')` : pour chaque rôle `r'` de probabilité positive, on lit `(vs_wr, n, d1, d2)` sur la page de counters (champion, mon rôle, vs_lane = r' si r' ≠ mon rôle). Contribution du rôle : `p_e(r') × w(r') × shrink(d2, n, k_mu)` avec `k_mu = 200`, `w = 1.0` si `r'` est mon rôle, sinon `0.5`. Variance de la contribution : `(p_e(r') × w(r'))² × shrink_sd(n, k_mu)²`.

Sans donnée pour (champion, e, r') : on utilise l'estimation de kit actuelle `_estimate_matchup` convertie : `value = (score_kit − 50) × 0.2` (donc entre −7 et +1,6), `sd = 3.0`, `source = heuristic`.

`value` du terme = somme des contributions ; `sd` = racine de la somme des variances. Sans ennemi visible : terme absent (valeur 0, sd 0, non listé).

`MatchupDetail` est conservé pour l'affichage, `delta` reste le d2 brut.

### 4.3 Adversaire futur (`future_opponent`)

Actif seulement quand mon adversaire de lane n'est pas révélé (`draft.my_lane_opponent_revealed` faux) et qu'il reste au moins un pick ennemi.

Candidats adverses `X` : champions dont le rôle `my_role` est dans `roles`, non bannis, non pris, avec `pick_rate ≥ 0.5 %` dans le rôle au rang courant.

- Distribution méta : `p_meta(x) ∝ pick_rate(x)`.
- Distribution counter : `p_counter(x) ∝ max(0, −d2(c vs x))` avec d2 rétréci (`k_mu`) ; si la somme est nulle, `p_counter = p_meta`.
- `λ(rang)` : iron/bronze/silver 0.15, gold/platinum 0.25, emerald/diamond 0.35, master_plus 0.50, inconnu 0.30.
- Probabilité que l'adversaire identifie mon rôle `q` : 1 si le candidat est mono-rôle, ou si mon rôle est le seul rôle allié non rempli ; sinon `1 / |roles(c) ∩ rôles alliés non remplis|` (au moins 1 élément car mon rôle est non rempli).
- `p(x) = (1 − λq) × p_meta(x) + λq × p_counter(x)`.
- `value = Σ p(x) × shrink(d2(c vs x), n_x, k_mu)`.
- `sd = sqrt(Σ p(x) × (d_x − value)²)` où `d_x` est le d2 rétréci ; plancher `sd ≥ 1.0`.

Sans page de counters disponible : `value = 0`, `sd = 4.0`, `source = heuristic`.

Le terme remplace intégralement `_draft_risk`, `HIGH_RISK_BLIND`, `HIGH_RISK_BLIND_PENALTY`, la lecture de `blind_pick_penalty` dans `champion_overrides.json` (la clé est ignorée), le bonus flex et la pénalité situationnelle. Les tags `safe-blind` et `counter-pick` sont recalculés à partir de ce terme (section 8).

### 4.4 Maîtrise (`mastery`)

Entrées : palier déclaré `T` (S/A/B/C/D, B par défaut), stats personnelles (parties `g`, WR `w` en ranked pour champion+rôle), maîtrise Riot (`points`, `last_played` datetime), difficulté `D` (1 à 10, `info.difficulty` Data Dragon, 5 par défaut), rang.

- `f_diff = 0.6 + 0.08 × D`.
- `f_rank` : iron/bronze/silver 1.3, gold/platinum/emerald 1.0, diamond/master_plus 0.8, inconnu 1.0.
- Base déclarée : S +1.0, A 0.0, B −1.5, C −3.0, D −5.0.
- Base personnelle (si `g ≥ 10`) : `clamp(shrink(w − 50, g, 10), −6, +6)`. Si `3 ≤ g < 10` : moyenne pondérée `(g × personnelle + 10 × déclarée) / (g + 10)`. Si `g < 3` : base déclarée.
- Fraîcheur : `months = min(3, mois écoulés depuis last_played)` ; `pénalité = 0.5 × months`. Sans `last_played` connu : 0. Si `points ≥ 100 000` : pénalité divisée par 2.
- `value = (base − pénalité) × f_diff × f_rank`.
- `sd` : 1.0 avec base personnelle (`g ≥ 10`), 1.5 sinon. `source = observed` si `g ≥ 10`, sinon `heuristic`.

`PersonalStatsService.get_champion_score_boost` est supprimée. Le service expose `get_champion_personal(puuid, champion_id, role, region) → {games, win_rate} | None` (cache existant) et `get_mastery(puuid, region) → {champion_id: {points, last_played}}` via `lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}`, cache disque 24 h, budget `RiotBudget`, rafraîchi en arrière-plan comme les stats. Sans clé Riot : les deux renvoient `None` et le terme utilise le palier déclaré.

`Champion` gagne `difficulty: int = 5`, rempli depuis Data Dragon dans `champion_data.py`.

### 4.5 Composition marginale (`composition`)

`valeur_équipe(team)` = `Σ_outil couvert poids(outil)` − `Σ_avertissement pénalité(sévérité)`, où :

- outils = `MechanicsAnalyzer.coverage` union sur l'équipe, poids : frontline 1.5, engage 1.5, magic_damage 1.0, physical_damage 1.0, range 1.0, peel 1.0, anti_mobility 0.5, anti_tank 0.5, anti_attacks 0.5 ;
- avertissements = `CompositionAnalyzer._warnings(team)` : critical −2.0, warning −1.0.

`raw = valeur_équipe(alliés + candidat) − valeur_équipe(alliés)`, puis `value = clamp(raw, −4, +4) × min(1, n_alliés / 4)`, `sd = 2.0`, `source = heuristic`. Avec 0 allié : terme absent. `CompositionAnalyzer.score` (0-100) est supprimée ; `warnings` et `team_summary_from_list` restent.

Archétype ennemi : `value = (archetype_counter_adjust(c, primary) − 1) × 15 × confidence`, `sd = 1.5`, terme `archetype`, absent si `MIXED` ou sans ennemi.

### 4.6 Synergie (`synergy`)

`value = clamp((SynergyAnalyzer.score − 50) × 0.12, −3, +3)`, `sd = 2.0`, `source = heuristic`. Duo actif et rôle du partenaire présent parmi les alliés : `value × 1.5` (borne ±4.5). Sans allié : terme absent. Les seuils à effet de falaise de `SynergyAnalyzer` ne sont pas retouchés dans cette spec.

### 4.7 Mécaniques (`mechanics`)

`value = mechanics_delta × 0.3` (les règles restent bornées à ±12 points internes, soit ±3.6 WR), `sd = 1.5`, `source = heuristic`. La liste `mechanics` renvoyée à l'interface est inchangée.

### 4.8 Modèle (`model`)

Inchangé dans son calcul (WPA conditionnel sur les alternatives éligibles) mais intégré comme terme : `value = clamp(delta_pp, −4, +4)`, `sd = 2.0`, `source = model`. Il est ajouté après le premier passage, comme aujourd'hui, puis l'agrégation est recalculée. `breakdown.wpa_adjustment` vaut cette valeur.

## 5. Agrégation

- `total = Σ value × pref(term)`, `sd_total = sqrt(Σ sd²)`.
- `reference_mean` = moyenne des `total` des candidats du pool (`is_pool_champion`), calculée après le terme modèle. Avec un seul candidat, `reference_mean = total` et l'avantage vaut 0.
- `total_score = total − reference_mean` pour tous, wildcards compris.
- `score_sd = sd_total`, `score_range = [total_score − sd_total, total_score + sd_total]`.
- Tri décroissant par `total_score`.
- Groupe de tête : le premier candidat, puis chaque candidat suivant `i` tel que `leader.total_score − i.total_score < sqrt(leader.sd² + i.sd²)`. `tie_with_leader = True` pour ces candidats (le leader inclus). Le groupe est contigu : on s'arrête au premier candidat hors critère.
- `confidence = clamp(100 × (1 − sd_total / 6), 8, 95)`.
- `ScoreBreakdown` : `meta, matchup, synergy, composition, mastery, draft_risk, mechanics, wpa_adjustment` contiennent les valeurs signées des termes correspondants (`draft_risk` = terme `future_opponent`, 0 si absent) ; `ml_prediction` et `ml_explanation` inchangés ; nouveau `terms: List[Term]`.

## 6. Rang

- `DraftRequest.rank_bucket: Optional[Rank]`. `UserDB.rank_tier: Optional[str]` (migration 004), exposé dans le profil et modifiable dans Réglages. Priorité : requête, puis profil, puis inconnu.
- `LolalyticsFetcher.fetch_tierlist` et `fetch_counter_page` prennent `tier: str` ; `MetaAnalyzer` et `MatchupAnalyzer` incluent le tier dans leurs clés de cache et de verrous. Correspondance : `iron→iron, bronze→bronze, silver→silver, gold→gold, platinum→platinum, emerald→emerald, diamond→diamond, master_plus→master_plus, None→emerald_plus`. Si une page revient vide pour un tier autre que `emerald_plus`, on recharge en `emerald_plus` et `data_status.rank_fallback = True`. `data_status.rank` indique le tier effectivement utilisé.
- Connecteur Rust : `fetch_summoner_info` ajoute `rank_tier` lu sur `/lol-ranked/v1/current-ranked-stats` (`queueMap.RANKED_SOLO_5x5.tier`, chaîne vide si non classé). Le store LCU l'expose ; la construction centralisée du payload envoie `rank_bucket` (LCU si connu, sinon profil).
- Le rang pilote `λ` (4.3), `f_rank` (4.4) et le tier des données.

## 7. Préférences

`weight_overrides` garde ses six clés (`meta, matchup, synergy, composition, mastery, draft_risk`) mais chaque valeur est un multiplicateur dans `[0.5, 1.5]`, défaut 1.0. `validate_weights` applique cette borne. Le terme `future_opponent` est multiplié par `draft_risk`, `mechanics`, `archetype` et `model` par 1.0. Le mode duo n'altère plus les préférences (le ×1.5 de 4.6 suffit). L'écran `DraftPreferences` affiche ×0,5 à ×1,5 avec libellés « importance de … ». Les valeurs déjà stockées en base (0 à 1) sont converties à la lecture : `v_new = 0.5 + v_old × 1.0`, une seule fois, par la migration 004 (`UPDATE` JSONB) ; la validation refuse ensuite les valeurs hors borne.

## 8. Tags, verdict, raisons, wildcards, bans

- `_assign_tags` reçoit les termes : `counter-pick` si `matchup.value ≥ 2.0` avec adversaire de lane révélé ; `safe-blind` si `future_opponent` présent et `value ≥ −0.5` et `sd ≤ 2.0` ; `risky-blind` si `future_opponent.value ≤ −2.0` ; `flex` inchangé (rôles ≥ 2) ; `meta` si `meta.value ≥ 1.5` ; `off-meta` inchangé ; `comfort` si `mastery.value ≥ 0.5`.
- `generate_verdict` reçoit `matchup, synergy, composition, future_opponent, mastery` en points : seuils 60/62/65 → +2.0/+2.5/+3.0, `risk_s ≥ 72` → `future_opponent ≥ 0`, `syn_s ≥ 64` → `synergy ≥ 1.5`, `comp_s ≥ 72` → `composition ≥ 1.5`.
- `generate_reasons` inchangée (elle lit les détails de matchup/synergie).
- Wildcards : viabilité méta inchangée (`MetaAnalyzer.score ≥ 45`) ; sélection si `total_score ≥ wildcard_min_advantage = 1.5` ; repli sur le meilleur si `total_score ≥ 0`.
- Bans, impact des bans : inchangés ; `helped_recommendations` continue de lister les noms.
- `DraftResponse` ajoute `reference_mean: float`, `top_group_ids: List[int]`, `rank_bucket: Optional[str]`. `win_probability` inchangé.

## 9. Historique et replays

- `DraftHistoryDB.score_unit: Optional[str]` (migration 004), `"wr_points"` pour toute nouvelle sauvegarde, `NULL` pour l'existant. `HistoryEntry.score_unit` exposé. L'interface affiche « ancien barème » quand il est nul.
- `HistoryStats.avg_recommendation_score` ne moyenne que les entrées `wr_points`.
- Les replays réanalysent avec le moteur courant ; aucune donnée de score n'est stockée dans la timeline.

## 10. Client

- `RecommendationPanel` : chiffre principal signé avec une décimale et « ± sd », badge « équivalent au 1er » quand `tie_with_leader` et que ce n'est pas le leader, mention « équivalents, joue ton confort » au-dessus de la liste quand le groupe de tête a plus d'un membre. Barres du détail centrées sur zéro, une par terme de `terms`, couleur par source.
- `DraftBoard`, `DraftWorkshop`, `InsightsPage`, `lib/replay.js`, `data/mock.js` : mêmes conventions d'affichage ; aucun calcul de score côté client.
- Comparaison : tableau des termes côte à côte, ligne « écart » avec `sqrt(sd_a² + sd_b²)` et mention « départagés » ou « équivalents ».
- Réglages : curseurs ×0,5 à ×1,5 ; sélecteur de rang (auto via League, sinon manuel).
- Payload centralisé : `rank_bucket`.

## 11. Suppression

Code retiré : `TIER_TO_MASTERY`, `HIGH_RISK_BLIND`, `HIGH_RISK_BLIND_PENALTY`, `_OVERRIDES_PATH`/`_load_overrides_lower`/`_get_blind_penalty_override` dans le moteur, `_draft_risk`, la normalisation post-classement, `ScoringWeights` normalisés et `role_weight_multipliers` dans `app.config`, `wildcard_min_score`, `CompositionAnalyzer.score`, `PersonalStatsService.get_champion_score_boost`. La clé `blind_pick_penalty` de `champion_overrides.json` est retirée du fichier.

## 12. Tests

- `tests/unit/scoring/` : `shrink` (limites n=0, n→∞), `rank` (normalisation LCU « EMERALD » → `emerald`, inconnu), `opponent_model` (λq, mono-rôle contre flex, absence de counters, distribution sommant à 1, variance), `mastery_term` (chaque branche de g, fraîcheur, points, difficulté, rang), `composition_term` (marginal nul quand l'outil est déjà couvert, atténuation), `aggregate` (moyenne des avantages du pool nulle, groupe de tête contigu, confiance bornée).
- `tests/unit/test_engine_and_api.py` : invariants sur une draft complète (avantage moyen du pool = 0, `score_range` encadre `total_score`, wildcards comparés à `reference_mean`, `terms` non vide, `draft_risk` = 0 quand l'adversaire de lane est révélé), préférences hors borne refusées, `rank_bucket` transmis à la source, repli `emerald_plus`.
- `tests/calibration/cases.json` : les assertions `must_rank_higher_than`, `must_be_in_top_3`, `must_not_be_top_1` sont conservées ; nouveau type `must_be_tied` pour les cas où l'écart attendu est sous l'incertitude ; les cas mentionnant `HIGH_RISK_BLIND` sont reformulés en termes de `future_opponent`. `run_calibration.py` lit `total_score` signé.
- Client : Vitest sur l'affichage signé, le badge d'égalité, l'ancien barème, la conversion des curseurs ; Playwright sur analyse, comparaison et réglage du rang avec API simulée.
- Rust : test du parser de `current-ranked-stats` sur un snapshot.

## 13. Ordre d'implémentation

1. Package `scoring` : types, shrink, rank, aggregate, avec tests.
2. Termes méta, matchup, adversaire futur (fetcher et caches paramétrés par tier).
3. Terme maîtrise (difficulté Data Dragon, maîtrise Riot, service personnel).
4. Termes composition, synergie, mécaniques, archétype, modèle.
5. Réécriture de `_score_candidate` et de `_recommend`, suppression de l'ancien pipeline, tags/verdict, wildcards, modèles API.
6. Migration 004, préférences, profil, historique.
7. Rust et store LCU (rang), payload client.
8. Interface : recommandations, comparaison, replays, insights, réglages.
9. Calibration et documentation (`docs/WPA_ET_MECANIQUES.md`, README).
