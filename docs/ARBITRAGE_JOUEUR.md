# Arbitrage du joueur — vérité terrain de la calibration

Ce document est la **référence** de ce que le moteur devrait conseiller. Il enregistre les décisions du
joueur (master+, main ADC) sur les cas où le moteur et la suite de calibration divergeaient, avec ses
mots. Quand une assertion de `server/tests/calibration/cases.json` contredit ce document, c'est le
document qui fait foi.

Bilan cumulé : **27 assertions confirmées sur 29**, 2 rejetées, 3 en suspens.

## Premier passage — les 8 cas où le moteur tranchait à l'envers

Rang master+, rôle de référence ADC/bot. Les 8 cas classés `decidable_ko` au triage du 14/09
(le moteur tranche avec assurance, dans le sens contraire à l'assertion).

**Résultat global : les 8 assertions sont CONFIRMÉES. Aucune n'était une attente périmée.**
Le moteur se trompe sur les 8. Les correctifs vont dans le moteur, pas dans la suite.

| # | Cas | Verdict | Mot du joueur |
|---|---|---|---|
| 1 | `blind_pick_adc` — Ezreal > Kog'Maw | **confirmée** | « absurde, Ezreal meilleur » |
| 2 | `counter_pick_support_vs_engage` — Lulu > Nautilus | **confirmée** | « Lulu meilleur » |
| 3 | `comp_engage_support_peel` — Lulu > Pyke | **confirmée**, avec nuance | « ici Lulu meilleur, mais si c'était Blitzcrank en face le matchup est chiant » |
| 4 | `blind_pick_mid_no_yasuo` — Orianna > Yasuo | **confirmée** | « Yasuo c'est du bait, pas un bon pick à blind, super situationnel vu la méta mid » |
| 5 | `comp_engage_mid_peel` — Orianna > Zed | **confirmée** | « Zed a un meilleur matchup mid mais Orianna meilleure overall pour la game » |
| 6 | `no_tie_hard_counter` — Vayne > Malphite | **confirmée**, confiance basse | « ça dépend, les 2 matchups sont compliqués, mais Vayne overall dans Nasus (Nasus broken dans la méta) » |
| 7 | `edge_case_garen_vs_darius` — Garen > Sett | **confirmée**, confiance basse | « je connais pas assez mais dans ma tête oui » |
| 8 | `edge_case_tryndamere_no_cc` — Tryndamere top 3 | **confirmée**, à généraliser | « oui je valide, mais pas que Tryndamere : plein de persos dans le même sens souffrent des CC et peuvent être plus value. Dans le sens inverse, Olaf est un edge case contre beaucoup de CC » |

## Réponse au fil rouge (cas 4 et 5)

Question posée : le palier S déclaré doit-il pouvoir porter un pick en tête de classement ?
**Réponse : non.** Un champion très situationnel ne doit pas sortir n°1 en blind pick sous le seul
poids du confort déclaré. Le terme maîtrise pèse trop lourd en blind.

## Défauts moteur révélés, au-delà du confort

- **Cas 5 — le matchup de lane prime sur l'apport à la partie.** Le joueur reconnaît que Zed gagne
  la lane et choisit quand même Orianna. Le moteur sur-pondère le duel de couloir face à la
  contribution d'équipe. **Aucune vague du plan ne traite ce point.**
- **Cas 2 et 3 — peel contre engage.** Relève des termes composition/archétype, pas de la
  distribution adverse. Non traité par les vagues 1 et 2.
- **Cas 3 — le bon conseil dépend du matchup adverse**, pas d'une règle générale « peel > engage ».
- **Cas 7 et 8 — règles d'interactions de kits.** Non traité par les vagues 1 et 2.

## Cas à ajouter, suggérés par le joueur (attentes non arbitrées)

Ce sont des pistes, pas des assertions : l'attente exacte n'a pas été tranchée, ne pas l'inventer.

1. **Support avec Blitzcrank en face** — le conseil peel/engage doit-il changer quand l'adversaire
   est un engage à skillshot plutôt qu'un engage dur ? (issu du cas 3)
2. **Olaf contre une composition à CC lourd** — miroir du cas Tryndamere : un champion qui ignore
   le CC doit monter quand l'adversaire en empile. (issu du cas 8)
3. **Généraliser `edge_case_tryndamere_no_cc`** — la règle « aucun CC dur en face » ne devrait pas
   être propre à Tryndamere.

---

## Second passage — les 21 assertions indécidables

**19 confirmées, 2 rejetées, 3 en suspens.** Cumulé avec le 1er passage : 27 sur 29 confirmées.

## Confirmées

| Cas | Assertion | Mot du joueur |
|---|---|---|
| `blind_pick_adc` | Caitlyn > Kog'Maw | « Cait bcp plus safe en blind, Kog est situationnel » |
| `comp_engage_adc_kite` | Caitlyn > Samira | « en tout cas c'est jamais Samira » |
| `comp_engage_adc_kite` | Ezreal > Samira | « Ezreal meilleur, mais pour briller avec il faut être bien bon » |
| `blind_pick_mid_no_yasuo` | Syndra > Yasuo | « Syndra bien meilleur » |
| `blind_pick_mid_no_zed_akali` | Annie > Zed | « Annie meilleur pour le premier » |
| `pick_order_first_avoids_niche` | Orianna > Malzahar | « Orianna et Syndra je valide » |
| `pick_order_first_avoids_niche` | Syndra > Malzahar | idem |
| `pick_order_last_allows_niche` | Malzahar top 3 | « dans l'idée oui, 80 % sûr » → **confiance basse** |
| `edge_case_galio_vs_ap_heavy` | Galio top 3 | « je valide, Galio strong ici » |
| `counter_pick_top_vs_darius` | Vayne > Sett | « Vayne super bon dans Darius si tu sais bien jouer » |
| `comp_full_aa_top_jax` | Jax top 3 | « je valide » |
| `edge_case_malphite_vs_full_ad` | Malphite n°1 | « Malphite, K'Sante, Sion, tout ce qui stack l'AD » |
| `edge_case_olaf_vs_cc` | Olaf > Kha'Zix, Olaf top 3 | « oui Olaf parfait » |

## Rejetées — l'attente était fausse, le moteur a raison

1. **`synergy_senna_tahmkench` — Senna top 3.** « Senna Tahm Kench c'est outdated de fou, ça marche
   qu'à low elo mais c'est plus du tout viable, faut qu'on soit au goût du jour. »
   → Le cas doit être **remplacé** par une synergie actuelle. Le joueur n'en a pas encore nommé une.
   Attention : `synergy` est la seule catégorie passée de 0/2 à 2/2 lors de la refonte de septembre ;
   la retirer change ce constat.

2. **`blind_pick_mid_no_zed_akali` — Lux > Akali.** « Je dirais Akali, je trouve Lux vraiment useless. »
   → Assertion à **inverser** : `Akali > Lux`. Contexte donné : « ici tous les blinds sont mauvais ».

## En suspens — ne pas trancher sans lui

1. **`blind_pick_top_flex_priority` — Malphite top 5.** « Le plus safe c'est Ornn ou Malphite mais
   c'est clairement pas les picks les plus forts, genre Camille c'est strong. »
   → La prémisse du cas (« un tank flex doit bien se classer grâce au bonus de first pick ») confond
   **sûr** et **fort**. À reformuler avec lui, pas à corriger d'office.

2. **`edge_case_garen_vs_darius` — Garen > Camille.** « Les 2 se jouent, je sais pas assez, faudra me
   refaire des tests, je vais demander à mes potes master main top. » → **En attente de sa réponse.**

3. **Variantes de build.** « La variante AP de Kog'Maw est quand même safe, mais on va déjà faire les
   stuffs de base avant de parler des variantes. » → Le moteur ne modélise pas les builds. Hors
   périmètre, noté pour plus tard.

## Cas à ajouter — attentes à faire préciser

1. **Xayah dans `comp_engage_adc_kite`.** « Xayah encore mieux ici. » Elle n'est pas dans le pool du cas.
2. **Nilah bot contre une compo full auto-attaque.** « Nilah pour le bot ça s'applique aussi » (miroir de Jax top).
3. **Généraliser `edge_case_malphite_vs_full_ad`** à K'Sante et Sion — tout ce qui stack l'armure.
4. Rappel du 1er passage : Blitzcrank en face pour le cas support, généraliser le cas « aucun CC dur ».

---

# Découverte : les notes de champions sortent des tags Riot (15 septembre 2026)

Cherchée en voulant réparer le terme de synergie. La racine est en amont.

## Constat

`server/app/data/champion_overrides.json` contient 170 champions, dont **0 avec `ratings`** et
**0 avec `damage`** — uniquement `roles` (169). Le docstring de `champion_data.py` affirme pourtant
« hand-tuned overrides in champion_overrides.json refine the most impactful ». C'est faux.

Toutes les notes viennent donc de `_auto_ratings` (`champion_data.py:50`), qui ne lit que les tags Riot.
Deux champions aux mêmes tags sont **numériquement identiques**.

Mesuré sur 10 supports : deux vecteurs distincts seulement.

```
Thresh, Leona, Nautilus, Tahm Kench, Braum  -> engage=4 utility=5 tank=5 cc=4
Rakan, Seraphine, Lulu, Karma, Milio        -> engage=3 utility=5 tank=2 cc=4
```

## Conséquence sur la synergie

Le bloc 4 de `synergy.score` (« ADC + Support specific synergy (huge impact) », jusqu'à +23 points) ne
lit que les notes du support, jamais la paire. D'où la mesure sur 100 duos :

- étendue à support fixe (variation due à l'ADC) : **4,0**, identique pour les 10 supports
- étendue à ADC fixe (variation due au support) : **21,0**, identique pour les 10 ADC

Des étendues rigoureusement constantes = score purement additif `f(support) + g(ADC)`, sans terme
d'interaction. Xayah + Rakan sort à 65,0, la bande la plus basse, alors que c'est le duo le plus
explicitement conçu comme paire du jeu. 25 combinaisons sur 100 sont au plafond de 90,0.

Le cas `synergy_senna_tahmkench` passait parce que Tahm Kench score 86-90 avec **tous** les ADC.

## Portée réelle

`ratings` alimente aussi composition, couverture de mécaniques et archétype. Quatre termes du moteur ne
voient qu'une douzaine de profils pour 170 champions.

**Réparer le terme de synergie seul est inopérant** : un terme d'interaction sur des entrées identiques
rend des sorties identiques.

## Décision du joueur

Noter à la main le bot lane d'abord (ADC + supports), par paquets de 10, proposition puis correction.
Le terme d'interaction de synergie ne sera traité qu'ensuite, sur des entrées qui discriminent.
