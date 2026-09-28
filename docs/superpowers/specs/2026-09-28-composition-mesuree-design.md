# La composition sur des dégâts mesurés — spec de conception

Chantier 18, suite (« profils de dégâts ») et reste ouvert du tank redéfini. Arbitré avec le
joueur le 28 septembre 2026, sur données Lolalytics relevées ce jour-là.

## 1. Objectif

Deux entrées du scoring de composition sont fausses, et elles sont lues aux mêmes endroits :

- **Les profils de dégâts viennent des tags Riot.** Diana (Fighter/Assassin) sort à 82 %
  physique ; elle inflige 85 % de dégâts magiques. Le 27/09, les remplacer seuls par le type
  Riot a coûté 1,2 point de concordance top-10 (z −3,5) : la composition est réglée sur les
  anciens profils.
- **Le « tank » existe en six copies** hors de `Champion.is_tank`, toutes sur `tankiness ≥ 4`
  ou le tag Riot Tank — la définition que le joueur a remplacée le 28/09 parce qu'elle faisait
  de Xayah, Tristana ou Yuumi des tanks.

Objectif : des profils **mesurés**, un tank et une frontline définis une fois, et une
composition réglée sur ces entrées — sans perdre de cas de calibration ni de concordance.

Décisions du joueur (28/09) :

- Approche A : collecter les dégâts par type, compter les sources, unifier tank et frontline,
  mesurer par étapes puis régler.
- **Frontline = tank + Divers du wiki**, sans Elise ni Rengar.
- **Trop AD, c'est une seule vraie source AP** (et symétriquement) : on raisonne en sources.
- Seuil d'une vraie source : **10 000 dégâts du type par partie** (validé sur l'échantillon §3).
- Un cas de calibration pour la règle : Syndra > Zed face à des alliés sans source AP (§7).

## 2. Constat : qui lit les profils et le tank

| Endroit | Lit aujourd'hui | Rôle |
|---|---|---|
| `composition._warnings` — dégâts | part AD moyenne des profils, seuils 0,68 / 0,78 | avertissement « comp trop AD/AP » |
| `composition._warnings` — front | `tankiness ≥ 4` (tank), `≥ 3` (front) | « pas de vrai tank/frontline » |
| `composition.team_summary*` | profils × poids de poste (support 0,4) | résumé affiché |
| `mechanics.coverage` | profil ≥ 60 % ; `tankiness ≥ 4` | outils `magic_damage`, `physical_damage`, `frontline` du terme de composition |
| `mechanics.physical_share` | type Riot, sinon profil | règle « encaisser un type de dégâts » |
| `draft_engine._detect_comp_gaps` / `_fills_gap` | moyenne des profils < 25 ; `tankiness ≥ 4` ou tag Tank | manques de la compo adverse |
| `reasons` | part AD du résumé, profil ≥ 55 ; `tankiness` | « Apporte de l'AP… », « Apporte le front manquant », « Frontline X protège Y » |
| `composition_archetype.archetype_counter_adjust` | `tankiness ≥ 4` ou tag Tank ; tag Tank | encaisser l'engage, le poke, les picks ; « mange tout le peel » |
| `synergy._kit_details` / `score` (repli sans page de duo) | `tankiness ≥ 4` ; écart de profils | bonus support tank, tank + carry, diversité |

`edge_cases.py` n'est lu par aucun module (chantier 18) : hors périmètre.

## 3. Source : les dégâts par type de Lolalytics

`https://lolalytics.com/lol/{slug}/build/?tier=master_plus&patch=30` affiche, par champion et par
partie : **Physical Damage**, **Magic Damage**, **True Damage** (infligés aux champions), avec
le rang du champion à son poste. Lolalytics les tient de Mobalytics (« from our friends at
Mobalytics »). Le paramètre `tier` et la fenêtre `patch=30` sont honorés ; le paramètre `lane`
ne change rien — sans importance, le type de dégâts dépend du champion, pas du poste.

**Lire le texte affiché, pas l'état sérialisé.** Le JSON embarqué dans la page (Qwik) partage
des références : lu tel quel, il donnait Ezreal à 99 % magique pour 7 852 dégâts, Darius à 0
magique, Orianna sans dégâts bruts. Le texte rendu (« Physical Damage: 18,969 ») est juste.

Échantillon Master+, 30 jours (dégâts par partie) :

| Champion | Physique | Magique | Brut | Profil actuel (tags) |
|---|---|---|---|---|
| Syndra | 928 | 22 401 | 1 495 | |
| Diana | 2 063 | 21 231 | 1 566 | 82 % physique |
| Orianna | 1 257 | 21 044 | 238 | |
| Malphite | 5 626 | 14 071 | 422 | |
| Kai'Sa | 14 263 | 10 013 | 378 | |
| Ezreal | 18 969 | 7 776 | 432 | |
| Leona | 2 668 | 6 030 | 642 | |
| Lulu | 1 129 | 5 709 | 157 | |
| Jinx | 23 222 | 736 | 386 | |
| Darius | 15 920 | 53 | 4 627 | |

La coupure tombe vers 10 000 : au-dessus en magique, Syndra, Diana, Orianna, Brand, Ahri, Lux,
Malphite, Amumu, Seraphine, Kai'Sa ; en dessous, Karma (8,5 k), Ezreal, Shen, et tous les
supports enchanteurs et tanks (5,7 à 7,2 k).

## 4. Données et chargement

**`scripts/refresh_damage.py`** (depuis `server/`, sur le modèle de `refresh_scaling.py`) : pour
chaque champion Data Dragon, lit les trois valeurs sur la page ci-dessus et écrit
`app/data/damage_profiles.json`, versionné :

```json
{
  "_meta": {"source": "Lolalytics (Mobalytics), dégâts infligés aux champions par partie, master_plus, 30 jours",
            "fetched": "2026-09-28", "failed": []},
  "Diana": {"physical": 2063, "magic": 21231, "true": 1566}
}
```

Un chiffre absent ou illisible met le champion dans `failed` — jamais à zéro. Sans `--write`, le
script affiche le diff et les deux listes de sources (§5) pour relecture.

**Chargement** (`ChampionDatabase.initialize`) :

- `Champion.damage` (pourcentages) est calculé depuis la mesure ;
- nouveau champ `Champion.damage_dealt: Optional[DamageDealt]` (physique, magique, brut, par
  partie).
- Sans mesure : dégâts totaux = médiane des champions mesurés de son poste principal, répartis
  selon le type Riot (`damage_type` ; mixte = moitié-moitié) ; sans type Riot, profil des tags
  comme aujourd'hui.

## 5. Sources de dégâts

`Champion.is_source("magic")` / `is_source("physical")` : au moins **10 000** dégâts du type par
partie (constante `DAMAGE_SOURCE_MIN` dans la config de scoring). Un champion peut être source
des deux types (Kai'Sa). Le brut ne fait pas de source.

**Part physique d'une équipe** = somme des dégâts physiques ÷ somme des dégâts physiques et
magiques, pondérée par ce que chacun inflige réellement. Remplace le poids fixe de poste
(`_ROLE_DAMAGE_WEIGHT`, support 0,4). `mechanics.physical_share` lit la mesure, puis le type
Riot, puis les tags.

## 6. Tank et frontline

- **`tank`** (en place depuis le 28/09) : Vanguard, Warden, Juggernaut — 35 champions. Ce qui
  **encaisse**.
- **`frontline`** : tank + Divers du wiki, sans Elise ni Rengar (arbitrage du joueur) — 52
  champions. Ce qui **tient le contact**. Propriété `frontline` dans `champion_overrides.json`,
  lue par `Champion.is_frontline` ; un test vérifie qu'elle suit
  `champion_facts.json` (tank ∪ Diver) avec les deux exceptions nommées.
- `tankiness` ne définit plus rien ; elle reste une note de survie.

Qui lit quoi :

| Endroit | Nouvelle lecture |
|---|---|
| Couverture `frontline` (terme de composition) | `is_frontline` |
| Avertissement « pas de frontline » (≥ 3 champions) | aucun `is_frontline` |
| Manque adverse `no_frontline`, et le champion qui le comble | `is_frontline` |
| Raisons « Apporte le front manquant », « Frontline X protège Y » | `is_frontline` |
| Archétype : encaisser l'engage, le poke, les picks ; « mange tout le peel » | `is_tank` |
| Repli de synergie de kit : support tank, tank + carry | `is_tank` |

## 7. Règles de composition

- **Avertissement de dégâts** (remplace les seuils 0,68 / 0,78) :
  - équipe de 5 : aucune source AP → **critique** (« comp full AD ») ; une seule → avertissement ;
  - équipe de 4 : aucune source AP → avertissement ;
  - sous 4 : rien. Symétrique pour l'AD.
- **Couverture** `magic_damage` / `physical_damage` : le champion est une source du type.
- **Manques adverses** `no_ap` / `no_ad` : aucune source du type parmi les ennemis révélés
  (inchangé : dès deux ennemis) ; le champion qui comble est une source du type.
- **Raison « Apporte de l'AP dans une comp AD-heavy »** : le candidat est une source AP et les
  alliés connus (au moins trois) en ont une au plus. Symétrique pour l'AD.
- **Repli de synergie de kit, diversité des dégâts** : l'un est source d'un type dont l'autre
  n'est pas source.
- **Résumé d'équipe affiché** : parts pondérées par les dégâts infligés (§5).

**Cas de calibration** `comp_full_ad_allies_mid_ap_source` : last pick mid, alliés Darius (top),
Lee Sin (jungle), Jinx (bot), Leona (support) — aucune vraie source AP ; pool Syndra (A), Zed
(A). Attente du joueur : **Syndra > Zed**. Ajouté avant toute mesure, rejoué sur le moteur
actuel pour connaître son point de départ.

## 8. Mesure

Référence : calibration `baseline_v14` (55/63, gel du 25/09 étendu), concordance appariée du
28/09 (top-3 16,5 %, top-10 40,6 %). Trois étapes, chacune mesurée contre la précédente :

1. **Profils mesurés seuls** — données et chargement (§4), règles inchangées.
2. **Tank et frontline** (§6).
3. **Règles des sources** (§5, §7).

Calibration : `--compare` sur le gel, qui est commun. Concordance : 5 250 décisions, cache
vivant sans expiration, variantes basculées dans un même lanceur (chaque étape rejouable
par drapeau), McNemar apparié en top-3 et top-10, et par poste.

**Réglage.** Si le cumul perd une assertion de calibration, ou recule en concordance à z ≤ −2 :
grille sur `comp_tool_weights` (`frontline` ∈ {0,75 ; 1,5 ; 2,25}, `magic_damage` et
`physical_damage` ∈ {0,5 ; 1,0 ; 1,5}) et `comp_warning_penalty` (avertissement ∈ {0,5 ; 1,0 ;
2,0}, critique au double). Toute la grille en calibration ; en concordance, les trois meilleurs
points de calibration. Retenu : le meilleur point de calibration sans catégorie perdante — la
calibration, arbitrée par le joueur, n'a pas le biais de popularité de la concordance.

**Acceptation** : calibration ≥ 55/63 (+ le nouveau cas) sans catégorie perdante, concordance
pas significativement sous la référence (z > −2 en top-3 et top-10). Un recul que le réglage
ne rattrape pas est présenté au joueur avant d'appliquer.

## 9. Tests

- `refresh_damage` : lecture des trois libellés sur une page enregistrée (fixture), nombres à
  séparateur de milliers ; libellé absent → `failed`, pas zéro.
- Chargement : profil calculé depuis la mesure ; repli médiane de poste + type Riot ; repli tags.
- `is_source` au seuil ; Kai'Sa source des deux types.
- `frontline` suit tank ∪ Diver moins Elise et Rengar (test de données, comme `tank`).
- Avertissements : 5 champions sans source AP → critique ; une source → avertissement ; 4
  champions sans source → avertissement ; 3 → rien ; symétrie AD.
- Couverture, manques adverses, raisons, archétype, repli de synergie : chacun lit la nouvelle
  définition (un champion à tankiness 4 sans propriété ne compte plus ; un Diver compte comme
  frontline, pas comme tank).
- Câblage par le moteur : les avertissements atteignent `breakdown.terms` via `composition`.

## 10. Hors périmètre

- Profils par poste (le paramètre `lane` de la page est ignoré) et variantes de build
  (chantier 8 : Kai'Sa reste hybride).
- `edge_cases.py`, module mort.
- La note `tankiness` elle-même (chantier 1).

## 11. Documentation

`docs/TAXONOMIES_CHAMPIONS.md` (frontline, sources, source des profils), `docs/CHANTIERS.md`
(chantier 18), `ARBITRAGE_JOUEUR.md` (décisions du 28/09 sur la composition),
`README.md` de la calibration (bilan des trois étapes et du réglage, nouvelle référence).
