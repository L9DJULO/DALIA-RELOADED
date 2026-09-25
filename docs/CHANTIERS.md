# Chantiers ouverts

Tout ce qu'on a identifié et volontairement mis de côté, avec ce qui le bloque et ce qu'il coûte de ne
pas le faire. Tenu à jour au fil des découvertes : rien ne doit disparaître dans l'historique de
conversation.

Dernière mise à jour : 24 septembre 2026, après le premier baseline de concordance pro.

---

## 1. Décomposer les dimensions de notation des champions

**Décidé le 15/09 : à faire pour de vrai, pas maintenant.**

Une note entière de 1 à 5 par dimension mélange des choses distinctes. Exemple donné par le joueur :
le E de Jinx et le root d'Aphelios sont tous deux « du CC », mais le piège de Jinx est lent,
télégraphié et évitable, alors qu'Aphelios applique le sien sur une auto-attaque. Même note, réalités
opposées.

Le défaut n'est pas la longueur de l'échelle — passer à 1-10 ne réglerait rien. C'est que chaque
dimension agrège au moins deux propriétés :

- `cc` = puissance du contrôle **×** fiabilité d'application
- `utility` = existence d'un sort utilitaire **×** son impact réel sur une teamfight
- `tankiness` = survie personnelle **×** tankiness apportée à l'équipe. Relevé par le joueur sur Yuumi :
  « le perso a une bonne survivabilité, il va mourir tout seul 20 % du temps et après son porteur 80 %
  du temps, où un Naut, une Leona est réellement tank, c'est pas pareil ». Yuumi et Nautilus sortent
  tous deux à 5 en disant des choses opposées.
- probablement `engage`, `poke` et `teamfight` de la même façon

**Correctif** : séparer chaque dimension en ses composantes, et faire consommer les composantes par
les termes du moteur. Cela rejoint le chantier 2 : avec des propriétés plutôt que des notes agrégées,
les règles peuvent se généraliser au lieu de nommer des champions.

**Portée** : modèle de données champion, plus les quatre termes qui consomment `ratings` (synergie,
composition, mécaniques, archétype).

**Palliatif en place** : une grille explicite qui redéfinit ce que le chiffre veut dire — « combien de
lockdown fiable ce champion apporte réellement », pas « a-t-il du CC ». Rend les notes défendables
sans refonte. Si on se surprend à vouloir écrire « 2,5 » souvent, c'est que ce chantier s'impose.

---

## 2. Généraliser les règles d'interactions de kits

Le joueur l'a signalé trois fois de suite, sur trois règles différentes :

- « Oui Olaf parfait, mais pas que Olaf » — d'autres champions ignorent le CC
- « Malphite, K'Sante, Sion, tout ce qui stack l'AD » — la règle armure n'est pas propre à Malphite
- « Nilah pour le bot ça s'applique aussi » — la règle anti-auto-attaque n'est pas propre à Jax

Le moteur code des **exceptions nommées** là où il devrait coder des **propriétés**. Chaque nouveau
champion oblige à écrire une règle de plus, et un champion oublié est silencieusement mal conseillé.

**Bloqué par** : le chantier 1. Des propriétés exploitables supposent des dimensions décomposées.

---

## 3. Terme de synergie : ajouter une interaction

Mesuré sur 100 duos ADC × support : le score est **purement additif**, `f(support) + g(ADC)`, sans
aucun terme d'interaction. Étendue à support fixe : 4,0, identique pour les 10 supports. Étendue à ADC
fixe : 21,0, identique pour les 10 ADC. Or l'interaction est exactement ce qu'est une synergie.

Symptômes : Xayah + Rakan sort à 65,0, la bande la plus basse, alors que c'est le duo le plus
explicitement conçu comme paire du jeu. 25 combinaisons sur 100 sont collées au plafond de 90,0.

Le bloc 4 de `synergy.score` (« ADC + Support specific synergy (huge impact) », jusqu'à +23 points) ne
lit que les notes du support, jamais la paire.

**Bloqué par** : les notes de champions (chantier 4). Un terme d'interaction sur des entrées
identiques rend des sorties identiques.

---

## 4. Notes de champions — les 102 hors bot lane

Toutes les notes venaient de `_auto_ratings`, qui ne lit que les tags Riot : deux champions aux mêmes
tags étaient numériquement identiques. 29 ADC se réduisaient à 7 vecteurs, 47 supports à 2.

**Fait le 15/09** : les **71 champions de bot lane** (29 ADC + 47 supports, 5 en commun) sont notés à la
main, arbitrés avec le joueur en sept paquets. Résultat : 29 vecteurs distincts sur 29 ADC, 46 sur 47
supports. La taxonomie des sous-classes a servi de point de départ sourcé, mais **elle ne suffit pas** :
à l'intérieur d'une sous-classe tous les champions restent identiques, donc la notation à la main est
incontournable.

**Reste : 102 champions** (top, jungle, mid). Sur l'ensemble du catalogue on est à 84 vecteurs distincts
pour 173 champions. Les trois plus gros paquets encore identiques : 24 champions sur un même vecteur de
combattant, 18 sur un vecteur d'assassin, 12 sur un vecteur de mage.

**Collision résiduelle en bot lane** : Brand et Vel'Koz sortent identiques (`3 1 5 1 5 2 5 2 1`).
Défendable — même métier d'artillerie — mais à trancher si une différence réelle existe.

**La grille de notation n'est écrite nulle part.** Elle n'existe que pour `cc`, et seulement dans
l'historique de conversation : « combien de lockdown fiable ce champion apporte réellement », avec
l'arbitrage du joueur sur Blitzcrank (« même si compliqué à toucher, ça a beaucoup de value, et y'a
plein de manières d'être sûr de jouer les grabs ») qui la fixe sur l'impact accessible et non sur la
difficulté d'exécution. Les huit autres dimensions n'ont aucune définition écrite. À rédiger avant de
noter les 102 restants, sinon les notes dériveront d'un paquet à l'autre.

**Grille écrite le 24/09** : `docs/GRILLE_NOTATION.md`, tirée des 71 arbitrages (ancres vérifiées
contre le fichier d'overrides). Elle révèle que **`teamfight` est saturée** — 69 des 71 champions
de bot lane à 4 ou 5 — et laisse trois points à trancher avec le joueur avant de noter les 102 :
réarbitrer `teamfight`, fixer les ancres hautes de `splitpush`, départager Brand et Vel'Koz.

---

## 4bis. Le fichier d'overrides n'a pas suivi les sorties récentes

**Soldé le 24/09.** Il ne manquait en fait que trois champions (Ambessa, Locke, Zaahen). Wukong avait
une entrée, mais sous la clé « Wukong » alors que Data Dragon l'appelle « MonkeyKing » : l'entrée
n'était jamais lue, et Wukong retombait sur `_default_roles` — **top seul, jamais proposé en jungle**,
où il est au rang 3.

Même racine, second bug : le slug Lolalytics de Wukong est `wukong`, pas `monkeyking`. La page de
counters renvoyait un 404 que `fetch_counter_page` avale : **le moteur n'a jamais eu aucun matchup
pour Wukong**. Vérifié sur les 173 champions, c'est le seul slug divergent.

Correctifs :

- `scripts/refresh_roles.py` régénère tous les `roles` depuis Lolalytics Master+ : un poste est
  retenu si au moins 15 % des parties du champion s'y jouent, le poste principal toujours. La
  règle d'origine (« pick rate > 2 % ») a été écartée : le pick rate mesure la popularité, et un
  champion peu joué passait sous le seuil partout (Zyra en jungle seule, Vayne en top seule).
- `LolalyticsFetcher.SLUG_EXCEPTIONS` porte `monkeyking → wukong`.
- Le chargeur journalise un avertissement pour toute clé d'override sans champion Data Dragon.

Les rôles dataient du patch 16.3 : 78 champions changent. À rejouer à chaque grosse bascule de méta.

## 4ter. Les notes sont par champion, pas par rôle

Un champion porte un seul vecteur quel que soit le poste où il est joué. Malphite support et Malphite
top sont notés pareil, alors qu'ils ne remplissent pas le même office.

Le joueur a par ailleurs signalé que la liste des supports est trop permissive : « Malphite, le pick
existe pas vraiment, c'est super rare quand on monte dans les elos », idem pour Gragas, et Shaco,
Heimerdinger et Sett ne se jouent pas vraiment support à master+. Ces champions sont proposés sur un
poste où ils ne se jouent plus.

**Liste des supports corrigée le 24/09** par la régénération des rôles (chantier 4bis) : Malphite,
Gragas, Heimerdinger et Sett ne sont plus proposés support. **Shaco le reste** : 22 % de ses parties
Master+ s'y jouent, au-dessus du seuil de 15 %. À trancher avec le joueur si ce pick doit sortir
malgré la donnée.

**Reste ouvert** : les notes par rôle.

---

## 5. Le matchup de lane prime sur l'apport à la partie

Révélé par l'arbitrage du cas `comp_engage_mid_peel`. Mot du joueur : « Zed a un meilleur matchup mid
mais Orianna meilleure overall pour la game, donc je pense Orianna. »

Le moteur classe Zed n°1 et Orianna n°6. Il sur-pondère le duel de couloir face à la contribution
d'équipe. **Aucune vague du plan en cours ne traite ce point.**

C'est probablement le défaut qui coûte le plus de conseils erronés, puisqu'il touche tous les last
picks où le joueur doit arbitrer entre gagner sa lane et gagner la partie.

**Mené les 18 et 24/09** (spec et plan `2026-09-18-apport-a-la-partie`). Les trois leviers sont
câblés, testés, et **laissés neutres** : le poids du matchup et l'amortissement de la méta perdent
des assertions sans en gagner ; le terme teamfight rapproche Orianna de Zed mais dégrade la
concordance pro (z = −3,9). Détail dans le `README.md` de la calibration.

L'écart Zed − Orianna est passé de +5,23 à **+1,51**, Orianna de n°5 à **n°2** — par le signal
méta corrigé (chantier 13), pas par ces leviers. **Reste ouvert** : le cas de référence échoue
encore. Suite : réarbitrer `teamfight` et noter les mids (chantier 4), puis re-mesurer le terme.

---

## 6. Cas de calibration à ajouter

Attentes **non arbitrées** : le joueur les a évoquées sans trancher le résultat attendu. Ne pas les
inventer, les lui faire préciser.

1. **Xayah dans le pool de `comp_engage_adc_kite`** — « Xayah encore mieux ici », elle n'y est pas.
2. **Nilah bot contre une compo full auto-attaque** — miroir du cas Jax top.
3. **Généraliser `edge_case_malphite_vs_full_ad`** à K'Sante et Sion.
4. **Support avec Blitzcrank en face** — « le matchup est chiant », le conseil peel/engage doit-il
   changer face à un engage à skillshot plutôt qu'à un engage dur ?
5. **Généraliser `edge_case_tryndamere_no_cc`** — la règle « aucun CC dur en face » ne devrait pas
   être propre à Tryndamere.
6. **Remplacer `synergy_senna_tahmkench`** — « outdated de fou, ça marche qu'à low elo ». Le cas
   passait parce que Tahm Kench score 86-90 avec **tous** les ADC. Bloqué par le chantier 3 : tout cas
   de synergie testerait un terme incapable de répondre.

---

## 7. Cas en suspens

1. **`blind_pick_top_flex_priority`** — la prémisse du cas confond **sûr** et **fort**. Mot du joueur :
   « le plus safe c'est Ornn ou Malphite mais c'est clairement pas les picks les plus forts, genre
   Camille c'est strong ». À reformuler avec lui.
2. **`edge_case_garen_vs_darius`, Garen > Camille** — « les 2 se jouent, faudra me refaire des tests,
   je vais demander à mes potes master main top ». En attente de sa réponse.

Les deux sont marqués **confiance basse** dans la suite en attendant : leur échec est un signal à
instruire, pas une régression bloquante.

---

## 8. Variantes de build non modélisées

« La variante AP de Kog'Maw est quand même safe, mais on va déjà faire les stuffs de base avant de
parler des variantes. » Le moteur ne connaît qu'un champion, pas ses builds. Un Kog'Maw AP et un
Kog'Maw AD n'ont ni le même profil de dégâts, ni la même portée effective, ni le même risque en blind.

---

## 9. Reproductibilité de la calibration

**Fait le 17/09. C'était la condition de validité des mesures des vagues 1 et 2.**

Les compteurs de triage ont bougé entre le 14 et le 15 septembre **sans aucun changement de code** :
20/10/8/14 puis 21/9/8/14. Cause identifiée : `comp_engage_adc_kite` (Caitlyn vs Samira) a un écart de
1,97 pour une incertitude de 2,00. Le TTL du cache a expiré, Lolalytics a resservi des statistiques
fraîches, l'assertion a basculé.

Tant que le cache de calibration n'est pas figé, l'effet d'une vague est **indiscernable de la dérive
des données**.

Corollaire : le `README.md` de la calibration annonce 20/10/8/14 et doit être corrigé.

**Second corollaire, ajouté le 15/09** : les notes des 71 champions de bot lane viennent de changer, et
quatre termes du moteur consomment `ratings` (synergie, composition, mécaniques, archétype). Le
baseline mesuré avant ce changement ne décrit plus le moteur actuel. **Il faut le rejouer avant toute
mesure des vagues 1 et 2**, une fois le cache figé — dans cet ordre, sinon on re-mesure sur du sable.

**Fait le 17/09, dans cet ordre.**

- `--freeze-cache` copie le cache vivant dans `server/app/data/cache-frozen/` avec un manifeste
  daté. Dès qu'un snapshot existe la calibration l'utilise **par défaut**, sans TTL et réseau
  interdit ; `--live-cache` est l'échappatoire. Il faut demander pour sortir du gel, jamais pour
  y entrer. Chaque run affiche son mode et la date du snapshot en tête.
- Une entrée absente du gel lève `FrozenCacheMiss`, qui hérite de `BaseException` à dessein :
  `fetch_tierlist` et `fetch_counter_page` avalent tout `Exception` et renvoient `{}`. Sans cela
  un trou dans le snapshot ferait tourner la mesure sur une méta vide en silence.
- **Nouveau baseline, snapshot du 17/09** (1250 entrées, Data Dragon 16.18.1, tier `master_plus`) :
  **19 indécidables / 9 décidables conservées / 10 en arbitrage / 14 hors périmètre**, score global
  33/52 (63,5 %). Vérifié identique sur deux runs consécutifs.
- Le `README.md` de la calibration porte les trois colonnes (avant, après, baseline gelé) et
  documente le gel.

**Ce que le rejeu révèle** : le triage a bougé de 20/10/8/14 à 19/9/10/14 alors qu'aucune ligne du
moteur de scoring n'a changé depuis la vague 0,5. Deux causes cumulées, et il faut les tenir
séparées — les notes des 71 champions de bot lane réécrites le 15/09, et la dérive des données sur
laquelle les colonnes « avant / après » avaient été mesurées. **Deux arbitrages de plus** sont
apparus : ce sont des cas à instruire, pas une régression.

**Reste ouvert** : le snapshot est local et non versionné (choix assumé — 15 Mo, projet solo). Un
`git clean -x` ou une autre machine oblige à le reprendre, et le baseline ci-dessus ne sera alors
plus rejouable à l'identique. Si ça devient gênant, versionner les seules entrées que la suite lit
réellement.

---

## 10. Dette mineure

**Soldée le 24/09.** `import math` mort retiré de `run_calibration.py` ; `comparison_sd` typé par un
`Protocol` (`_SdTerm`) sans recoupler `Term` et `ScoreTerm` ; σ de la branche « blend » de
`mastery_term` testé ; docstring de `champion_data.py` aligné sur la réalité — les `ratings` des 71
champions de bot lane sont bien dans `champion_overrides.json`, les 102 autres retombent sur les tags.

**Rouverte le 25/09** par la revue de la branche `chantier-5-apport-partie` — reportés, rien de
bloquant :

- `DraftWorkshop.jsx:81` : `DIMENSIONS[d.dimension]` sans repli sur le nom brut (en-tête vide
  pour un terme non libellé).
- Tests de câblage par recherche dans le source (`teamfight_term(`, `popularity_term(`) : ils
  prouvent l'appel, pas que le terme atteint `breakdown.terms`. Asserter via l'API.
- Barre « Teamfight 0.0 » affichée sur chaque carte tant que `teamfight_scale` vaut 0.
- `role_inference_galio_alone_ambiguous` ne couvre plus le seuil `lane_prob < 0.7` (Galio à 0,81).
- `scraper.py` réécrit de LF en CRLF (~726 lignes) ; pas de `.gitattributes` dans le dépôt.
- `champion_data.py` : l'ensemble des clés Data Dragon est reconstruit pour chaque override.
- `matchup_details` non pondérés par `matchup_weight` ; pas de test `rank=None` dans `matchup_term`.
- `teamfight_term(ratings)` non typé.

---

## 11. La portée des champions — donnée et bug corrigés, équilibre mêlée/distance restant

Soulevé par le joueur le 15/09 : « que le champ proposé soit un melee ou un range, ça peut être utile
dans certains cas de last pick, genre si on a que des range parfois c'est pas ouf ».

Vérifié : le modèle `Champion` (`app/models/champion.py`) **n'a aucun champ de portée**. Data Dragon la
fournit pourtant (`stats.attackrange`, ~125-175 en mêlée, ~500-650 à distance) et le projet appelle
déjà cet endpoint.

Faute de donnée, le code utilise deux approximations, dont une est fausse :

- `mechanics.py:117` — `if r.poke >= 4: result.add("range")`. La couverture « portée » d'une équipe est
  déduite de la note de poke, pas de la portée réelle.
- `synergy.py:108` — `is_melee_carry = is_adc and ratings.tankiness <= 2 and damage.physical >= 60`.
  Devine « carry mêlée » depuis la tankiness et le type de dégâts. Avec les notes arbitrées du 15/09,
  cela classe **Ashe, Draven, Kalista, Lucian, Twitch et Miss Fortune** comme carries mêlée, et rate
  **Nilah et Yasuo** qui le sont vraiment. Le bloc applique ensuite +6 ou −8 à la synergie.

**Fait le 15/09** : `Champion.attack_range` chargé depuis Data Dragon (173/173 champions) et propriété
`is_melee` (seuil 350 — aucun champion entre 225 et 450). `synergy.py` déduit désormais le carry mêlée
de la portée réelle : seuls Nilah et Yasuo sont classés mêlée parmi les ADC, contre six ADC à distance
faussement flaggés avant. 4 tests ajoutés, fixture `catalog` dotée des portées réelles.

**Non fait** : `mechanics.py:117` garde `if r.poke >= 4: result.add("range")`. Volontaire — l'outil
`range` désigne « portée / poke » (`pool_advisor.py:6`), pas le corps-à-corps. Le brancher sur la portée
d'attaque changerait sa sémantique et fausserait le conseiller de pool.

**Reste à faire** : l'équilibre mêlée/distance d'une composition, qui est le besoin initialement exprimé
— « si on a que des range parfois c'est pas ouf ». C'est un **nouvel outil de composition**, distinct de
`range`, pas un correctif. Il touche le scoring de composition, donc à mesurer comme une vague.

**Fait le 24/09** : un avertissement de composition « aucun champion au corps à corps » quand au
moins quatre champions connus de l'équipe sont tous à distance (`Champion.is_melee`). Il passe par
`team_warnings`, donc pèse dans `composition` (pénalité `warning`) et s'affiche dans l'interface.
Seul le cas exprimé par le joueur est traité — rien pour une équipe entièrement mêlée.

Mesure : **aucun mouvement** en calibration (les cas ont rarement trois alliés connus), et rang
moyen 13,69 contre 13,70 sur les 5 250 décisions de la concordance pro. Inoffensif, et de portée
faible : à réévaluer si le joueur trouve qu'il se déclenche trop rarement.

---

## 12. La suite de calibration ne résout pas ce qu'on lui demande de mesurer

Découvert en mesurant la vague 1, le 17/09.

Les deux changements de la vague — le pick rate qui pondère le bras counter, puis
`counter_alpha` qui le concentre — laissent le score global **et** le détail par catégorie
strictement inchangés, à α = 1,0 comme à α = 3,0. Sur les écarts continus du `--diagnose`,
**28 des 38 comparaisons bougent**. Les changements mordent ; ils ne franchissent aucun
seuil d'assertion.

Deux conséquences, à ne pas confondre :

1. **Méthodologique.** Juger un changement sur le seul score de calibration, c'est ne rien
   voir tant qu'une assertion ne bascule pas. Le contrôle de câblage prévu par le plan
   (« même score à α = 1,0 et α = 3,0 ⇒ constante non lue ») a d'ailleurs donné une fausse
   alerte pour cette raison. Il faut comparer les écarts du `--diagnose` entre deux états du
   moteur — ce que le cache gelé (chantier 9) rend possible.
2. **Sur le fond.** 52 assertions dont 19 indécidables et 14 hors périmètre, cela laisse
   19 assertions réellement discriminantes. C'est trop peu pour départager un paramètre
   continu. `counter_alpha` est donc fixé à 1,0 faute de preuve, pas au vu d'une preuve.

**Correctif appliqué le 18/09 : `--snapshot` et `--compare`.** Plutôt que de rendre les
assertions continues — ce qui aurait demandé de fixer des marges en points de win rate
que personne ne sait dire — la suite enregistre le classement complet de chaque cas et
compare deux états du moteur. Le rapport va des assertions basculées aux changements de
rang puis aux déplacements de score. Refus de comparer hors d'un cache gelé commun.

**Ce que l'outil a révélé immédiatement** : porter `counter_alpha` de 1,0 à 3,0, changement
que la vague 1 déclarait sans effet, produit **4 changements de rang** et 47 déplacements de
score. La suite ne ratait pas seulement des mouvements continus — elle ratait des inversions
de classement, dans des cas dont l'assertion portait sur d'autres champions que ceux qui
bougeaient.

**Reste ouvert.** L'outil rend le mouvement *visible* ; il ne dit pas s'il est *bon*. Juger
un déplacement demande toujours un arbitrage, donc des cas supplémentaires — chantier 6, et
la question des assertions quantitatives reste entière si on veut un jugement automatique.

**Constat associé** : la vague 1 ne touche pas le cas Yasuo du blind pick mid — il reste
n°1 à toutes les valeurs de α, et monter α l'éloigne encore. La vague 2 devra le porter
entièrement.

---

## 13. Le signal méta classe à l'envers de ce que choisissent les bons drafteurs

Mesuré le 22/09 par la suite de concordance pro (`server/tests/pro_concordance/`, détail et
chiffres dans son `README.md`) : 5 250 décisions de pick reconstruites depuis 525 drafts LCK, LPL,
LEC et LCS, contemporaines des statistiques que le moteur consomme.

| Règle de classement | Top-3 | Top-10 |
|---|---|---|
| Pick rate soloqueue | 12,6 % | 44,5 % |
| Hasard | 6,6 % | 22,2 % |
| **Moteur DALIA** | **5,6 %** | **19,0 %** |
| Win rate soloqueue | 0,5 % | 5,9 % |

**Le moteur est significativement sous le hasard** (−3,0 écarts-types en top-3, −5,6 en top-10).
Une concordance basse était attendue — pool ouvert, maîtrise neutre, les pros ne jouent pas la
soloqueue. Être *sous le hasard* ne l'était pas : cela veut dire un classement activement
anti-corrélé avec la préférence d'un bon drafteur.

**Cause identifiée** : `meta_term` ne consomme que le win rate, et classer par win rate soloqueue
est le pire des quatre témoins. Le win rate d'un champion peu joué mesure surtout la compétence de
ses joueurs dédiés. Le pick rate n'entre nulle part dans la notation d'un candidat — seulement dans
la distribution adverse. Les n°1 du moteur le trahissent : Amumu support, Karthus bot, Warwick top.

**Lien avec le chantier 5** : sa Task 3 (amortissement de la méta par le contexte) règle le poids
d'un terme dont le signal est lui-même en cause. À trancher avant de l'implémenter.

**Limite de la mesure** : elle ne juge pas le conseil rendu à un joueur sur son pool déclaré, mais
le signal de fond sur lequel tout le reste s'empile.

### Diagnostic du 24/09 : quatre variantes du terme méta, deux instruments

`meta_term` remplacé à la volée (sans toucher au code), rejoué sur les 5 250 décisions de la
concordance et sur la calibration. Calibration comparée sur un gel commun (24/09, 2459 entrées),
baseline 30/52 sur ce gel.

| Variante | Calibration | Concordance top-3 | Top-10 | Rang moyen |
|---|---|---|---|---|
| Actuelle : `shrink(win_rate − 50)` | 30/52 | 5,9 % | 19,4 % | 13,69 |
| Aucun terme méta | 34/52 | 12,2 % | 33,0 % | 12,01 |
| Popularité seule : `ln(pick_rate / 2 %)` | **36/52** | **16,7 %** | **42,6 %** | **10,85** |
| Win rate + popularité | 33/52 | 9,0 % | 25,3 % | 12,93 |

Écarts de concordance appariés (McNemar sur « dans le top-3 ») : z = +14, +21 et +10 contre la
variante actuelle.

**Ce qui est établi** : retirer le terme méta *seul* double la concordance et gagne quatre
assertions. Le win rate brut ne se contente pas de ne pas aider — il dégrade le classement sur
les deux instruments. Ce résultat n'est pas contaminé par la circularité ci-dessous.

**Ce qui ne l'est pas** : la popularité gagne sur les deux instruments, mais la concordance la
favorise en partie par construction — la soloqueue copie les picks pros. La calibration, arbitrée
par le joueur, ne souffre pas de ce biais et va dans le même sens.

**Coût de la variante popularité** : deux assertions perdues. `synergy_senna_tahmkench`, déjà
jugée « outdated de fou » par le joueur (chantier 6), et `counter_pick_top_vs_darius`
(Quinn devant Garen). La catégorie `counter` passe de 6/8 à 5/8 : la règle « ne pas faire perdre
une catégorie » est enfreinte d'une assertion.

**À arbitrer avec le joueur** — c'est un choix de philosophie, pas un réglage :

1. Remplacer le win rate par la popularité (« ce que Master+ joue est ce qui marche »), au risque
   d'un moteur qui recommande ce qui est déjà populaire et réagit en retard à un champion devenu
   fort en début de patch.
2. Garder le win rate mais le neutraliser fortement (rétrécissement bien plus dur, ou amortissement
   total) — la variante « aucun terme » montre déjà l'essentiel du gain.
3. Un hybride dont l'amplitude se calibre.

La constante `a = 1` de la popularité n'est pas calibrée, et son incertitude reprenait celle du
win rate faute de mieux : quelle que soit l'option, elle demande sa propre spec.

### Réglage retenu le 24/09 : hybride calibré (option choisie par le joueur)

`meta` garde le win rate, pondéré par `meta_wr_weight` (valeur et incertitude ensemble) ;
un terme `popularity = popularity_scale · ln(pick_rate / 2 %)`, lu par poste, d'incertitude
relative. La préférence « méta » du joueur pondère les deux. Balayage 4 × 5 sur la calibration
(gel commun) et 4 × 4 sur la concordance :

| win rate × | popularité × | Calibration | Concordance top-3 |
|---|---|---|---|
| 1,0 | 0 (avant) | 30/52 | 5,9 % |
| **0,25** | **1,0** | **37/52** | **15,0 %** |
| 0 | 2,0 | 34/52 | 18,2 % |

**Retenu : (0,25 ; 1,0)**, meilleur point de la calibration — l'instrument sans biais de
popularité — sans catégorie perdante hors `synergy_senna_tahmkench`, déjà jugé périmé. La
concordance monte encore avec la popularité mais la favorise par construction ; au-delà de 1,5
la calibration perd des cas de counter.

Le moteur passe devant la règle « trier par pick rate » (12,9 % en top-3), qu'il suivait à
moins de la moitié. `comp_engage_mid_peel` : Orianna remonte de n°5 à **n°2**, derrière Zed —
le dernier écart est ce que visent les leviers du chantier 5. Yasuo en blind mid reste n°2.

**Reste ouvert** : la Task 3 du chantier 5 (amortir la méta par le contexte) portait sur le win
rate seul. Avec un win rate déjà ramené au quart, son effet sera faible ; à mesurer avant
d'étendre l'amortissement à la popularité.

**Suite identifiée par la revue** : `MetaAnalyzer.score()` (0-100), qui sert aux bans, à
l'impact des bans et au filtre des wildcards, reste pondéré à 80 % par le win rate. Il contredit
désormais le signal hybride du moteur ; à aligner dans une passe dédiée.

---

## 14. Mesurer l'impact en teamfight sur les parties pros

Décidé avec le joueur le 25/09. La note `teamfight` est saturée (69 des 71 champions notés à 4 ou
5) et le joueur juge la notion trop vague pour une note à la main : beaucoup de champions « pas
faits pour les teamfights » y passent bien, et un même champion joue ou non les combats selon la
partie. Sa piste : **mesurer sur les parties pros**, où presque toutes les compositions mêlent des
champions à avantages particuliers qui tiennent aussi un combat à cinq.

La suite de concordance a déjà l'accès authentifié à Leaguepedia et les drafts de 525 parties.
`ScoreboardPlayers` y donne, par joueur et par partie, kills, morts, assists et kills d'équipe,
dégâts aux champions : de quoi estimer une participation aux combats par champion et par poste,
plutôt que de la décréter.

**Bloque** : le levier teamfight du chantier 5, laissé neutre faute d'une note qui départage.

