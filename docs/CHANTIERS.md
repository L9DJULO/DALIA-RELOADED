# Chantiers ouverts

Tout ce qu'on a identifié et volontairement mis de côté, avec ce qui le bloque et ce qu'il coûte de ne
pas le faire. Tenu à jour au fil des découvertes : rien ne doit disparaître dans l'historique de
conversation.

Dernière mise à jour : 30 septembre 2026, bans conseillés et ordre de la shortlist (chantiers 19 et 20).

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

**Soldé le 28/09** autrement que prévu : l'interaction n'est pas déduite des notes, elle est
**mesurée**. La page de duo Lolalytics (`ep=build-team`), que l'en-tête de `synergy.py` disait
inaccessible, donne `d2` = WR du duo − (WR du candidat + WR de l'allié − WR moyen). Chaque allié
connu apporte `shrink(d2, parties, k)`, `k` par palier et type de paire ; la synergie de kit ne
sert plus que de repli. Spec `2026-09-28-synergie-observee`, bilan dans le `README.md` de la
calibration :

- Part d'interaction sur 10 ADC × 10 supports : 5 % → **78 %**. Avec Rakan, Xayah passe n°1.
- Calibration 48/60 → **51/60** (les trois cas de synergie en échec passent, rien de perdu).
- Concordance pro top-3 14,7 → **16,3 %** (z +4,4), top-10 37,2 → **40,4 %** (z +7,2) ; le
  support gagne 5 points de top-3.

**Reste ouvert** :

- **Paire quasi exclusive** : Kog'Maw n'a que deux supports à plus de 1 000 parties en Master+ ;
  son win rate est presque celui du duo avec Lulu, la synergie y est déjà et l'interaction sort
  à 0. Le moteur surestime Kog'Maw avec un support qui n'est pas un enchanteur. Piste : rétrécir
  vers l'estimation de kit plutôt que vers 0 (option écartée le 27/09).
- **Duos premade** : la soloqueue mêle joueurs seuls et duos ; `d2` mêle l'effet de la paire et
  la coordination.
- La concordance monte encore au-delà de l'échelle retenue (1,5 : top-3 17,2 %) mais la
  calibration y perd Vayne contre les tanks.

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

**Les trois sont tranchés** : ancres `splitpush` et Brand/Vel'Koz le 25/09
(`ARBITRAGE_JOUEUR.md`), `teamfight` mesurée sur les parties pros (chantier 14).

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

**Sorti le 28/09** (choix du joueur : pick rate 0,87 % au poste, tier le plus bas).
`ROLE_EXCLUSIONS` de `scripts/refresh_roles.py` le retire du poste à chaque régénération ; la
distribution des rôles adverses le garde support à 20 %. Calibration : aucun mouvement ;
concordance neutre (top-3 +3 −3, top-10 +0 −1).

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

**Le cas de référence passe le 28/09**, par la composition mesurée (chantier 18) : la composition
alliée n'a qu'une vraie source AP, Zed n'en apporte pas, Orianna si. Orianna n°4, Zed n°5,
écart 0,52 — sous l'incertitude : le cas passe sans se décider. Le défaut de fond (le duel de
couloir pèse plus que l'apport à la partie) reste ouvert ; aucun levier du chantier 5 n'y a servi.

---

## 6. Cas de calibration à ajouter

Attentes **non arbitrées** : le joueur les a évoquées sans trancher le résultat attendu. Ne pas les
inventer, les lui faire préciser.

1. ~~**Xayah dans le pool de `comp_engage_adc_kite`**~~ — fait le 28/09 : Xayah > Samira (devant
   Jinx, les données disent égalité).
2. ~~**Nilah bot contre une compo full auto-attaque**~~ — tranché le 28/09 : pas de cas. La règle
   d'esquive s'applique ; les données ne placent pas Nilah devant Jinx dans cette compo.
3. ~~**Généraliser `edge_case_malphite_vs_full_ad`** à K'Sante et Sion~~ — tranché le 28/09 par la
   définition du tank (chantier 18). K'Sante et Sion perdent contre Darius (49,0 et 48,1 %) :
   pas de cas. Le cas Malphite passe à « top 2 », Ornn étant au palier A.
4. ~~**Support avec Blitzcrank en face**~~ — fait le 28/09 : `comp_engage_support_vs_blitzcrank`,
   Nautilus > Janna. Le moteur renverse son conseil avec le seul support adverse, comme les
   données (Nautilus 51,5 % contre Blitzcrank, 47,6 % contre Leona).
5. ~~**Généraliser `edge_case_tryndamere_no_cc`**~~ — sans objet : le cas est retiré depuis le
   27/09, les données avaient raison.
6. ~~**Remplacer `synergy_senna_tahmkench`**~~ — fait le 28/09 : remplacé par
   `synergy_senna_jhin_over_tristana`, avec quatre autres cas de synergie tirés des données et
   validés par le joueur (chantier 3).

---

## 7. Cas en suspens

1. **`blind_pick_top_flex_priority`** — la prémisse du cas confond **sûr** et **fort**. Mot du joueur :
   « le plus safe c'est Ornn ou Malphite mais c'est clairement pas les picks les plus forts, genre
   Camille c'est strong ». À reformuler avec lui. **Retiré le 28/09** : ses assertions étaient
   vides (cinq champions au pool, « top 5 »), et le premier pick sûr est déjà une propriété
   (`sur_en_blind`).
2. **`edge_case_garen_vs_darius`, Garen > Camille** — « les 2 se jouent, faudra me refaire des tests,
   je vais demander à mes potes master main top ». **Retiré le 27/09** : face aux données
   (Garen 50,8 % contre Darius, Sett 53,9 %), « les données ont raison ».

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

**Soldé le 28/09** : gel élagué aux 684 entrées que la suite lit (`--prune-frozen`, 8,6 Mo) et
versionné avec les snapshots de comparaison. Clone frais, sans cache vivant : calibration hors
ligne à l'identique de `baseline_v16` (57/64, aucun mouvement). Un nouveau cas se termine
désormais par un commit du gel étendu.

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

**Soldés le 25/09** : repli sur le nom brut dans `DraftWorkshop` ; tests de câblage passés par
le moteur (le terme doit atteindre `breakdown.terms`) pour teamfight, popularité et
amortissement méta ; plus de terme teamfight tant que `teamfight_scale` vaut 0 (calibration
appariée : aucun mouvement) ; clés Data Dragon calculées une fois ; test `rank=None` ;
`teamfight_term` typé.

**Laissé volontairement** : `matchup_details` non pondérés. Ce sont des observations
affichées (win rate et écart face à tel adversaire), pas la contribution au score ; les
pondérer ferait afficher un win rate que personne n'a mesuré. Le poids reste dans le terme.

**Fins de ligne soldées le 25/09** : `.gitattributes` (LF partout, CRLF pour `*.ps1`),
normalisation en un commit isolé listé dans `.git-blame-ignore-revs`.

**Postes adverses par élimination, le 25/09** (arbitrage du joueur : « si un autre perso a plus
de chance d'aller mid on le met mid et Vlad passe top par élimination ») :

- `infer_enemy_roles` calcule les marginales exactes sur toutes les répartitions de postes
  distincts, pondérées par les priors. L'ancien verrou n'agissait qu'à 0,85 : Vladimir + Syndra
  (mid 0,81) laissait Vladimir mid à 62 %, il y est maintenant à 25 %.
- Seuil « Lane » de 0,7 à **0,5** : l'adversaire est plus probablement en face qu'ailleurs.
- **Bug trouvé** : la raison lisait `pick.role`, toujours vide en ranked (le client ne révèle
  pas les postes adverses). « Lane favorable » ne sortait donc jamais face à un poste déduit,
  quel que soit le seuil. Elle lit maintenant le poste déduit.
- **Assertions vides** : les cas cherchaient « Lane favorable contre X », texte que le moteur ne
  produit pas (« Lane favorable dans les matchs observes contre X »). Les `must_not` de Naafiri,
  Akali et Galio passaient donc toujours. Libellés corrigés, et un test vérifie désormais que
  chaque libellé de matchup des cas est producible.
- Cas Galio remplacé par `role_inference_vladimir_flex_likely_mid` (Vladimir seul : « Lane
  favorable » attendu) et `role_inference_vladimir_pushed_off_mid` (avec Syndra : plus de
  « Lane »). Calibration 36/53 (les 2 assertions Galio remplacées par 3) ; sur les 31 autres
  cas, aucun mouvement — ils fixent presque tous le poste des ennemis.

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

**Aligné le 25/09.** Le score lit le terme méta et la popularité du moteur, ancrés sur 3 % de
pick rate (50 points, 10 points par doublement). L'ancre est absolue parce que les seuils des
appelants le sont (45 viable, 55 forte, 65 menace, 70 S) : sur le gel du 25/09, autant de
champions au-dessus de chaque seuil qu'avant, mais les bons — Jinx, Thresh, Lee Sin en tête au
lieu de Quinn top, Ivern jungle ou Lux bot. Calibration inchangée, aucun score déplacé ; Morgana
et Xayah entrent en wildcards dans trois cas.

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

### Mené le 25/09 (chantiers 4 et 14)

Les 102 champions ont des notes **calculées** depuis les notes de style Riot et les sous-classes
du wiki, calées sur les 71 du joueur (accord exact 53-71 %, ±1 89-97 %). La note `teamfight`
est **mesurée** sur les parties pros pour les 173 (support exclu, règle de repli pour les champions
peu joués) : la saturation disparaît, 34 des 71 champions du joueur à 4-5 contre 69.

**Reste ouvert** :

- Le levier teamfight reste à 0 : aucune valeur ne tient la calibration. **Re-mesuré le 26/09**
  après la relecture du joueur et la mesure sur le poste pro : même verdict (calibration 36/53
  à toutes les valeurs, 1,0 : +1 point de top-3, −3 de top-10). Le cas Orianna/Zed ne vient
  pas du teamfight mais du terme `archetype`, à l'envers contre une composition engage : il ne
  connaît que le peel (`utility ≥ 4`), pas le contre-engage. **Corrigé le 26/09 par la
  « réception »**, propriété de draft définie par le joueur et posée sur 25 champions
  (`docs/TAXONOMIES_CHAMPIONS.md`) : écart Zed − Orianna 7,7 → 4,2, calibration et concordance
  neutres. Orianna reste n°6 ; le reste de l'écart est matchup, maîtrise du pool du cas,
  popularité et méta.
- Les notes Riot sont grossières sur certains champions clés : Orianna, sous-notée, retombe n°5
  derrière Zed dans le cas de référence. Le joueur relit `server/app/data/ratings_review.md`
  (les notes calculées les plus jouées en pro d'abord) et corrige ce qui le choque — la notation
  à la main se limite aux écarts.
- La participation aux kills mesure la présence, pas l'impact ; le support n'est pas mesuré.

**Relevé par la revue du 25/09.** Soldé le 25/09 pour `pro_teamfight` :

- Mesure sur le poste le plus joué en pro, lu sur les lignes pros et non plus sur `roles[0]`
  des overrides. Un champion surtout joué support reste sur la règle de repli : Seraphine
  n'est pas mesurée sur 5 parties bot pour 338 en support. 98 champions mesurés contre 90 ;
  Pantheon, Trundle, Swain, Senna, Cho'Gath entrent, Yone passe de 5 (7 parties top) à 1
  (122 parties mid), Shen et Camille (surtout support en pro) repassent en repli. 26 notes
  changent ; calibration : aucune assertion basculée, 26 scores déplacés de 0,36 au plus.
- Le poste venant des lignes pros, les clés sont celles de Data Dragon, comme les faits : plus
  d'appariement par casse (Bel'Veth, une seule partie pro, reste en repli faute de données).
- Quintiles centrés sur le rang (deux champions sur un poste : 2 et 4, plus 1 et 3).
- `pro_teamfight` refuse une collecte marquée incomplète ; le collecteur écrit une collecte
  interrompue à côté (`pro_player_stats.incomplete.json`) au lieu d'écraser la dernière complète.

Soldé le 25/09 pour `derive_ratings` : un 4xx (hors 429) n'est plus réessayé ; `review_order`
et `control_report` apparient sans casse ; docstring de `burst` aligné sur la règle.

**Écart de baseline relevé le 25/09** : la calibration donne **35/52** sur le gel du 25/09
(13:29, 2464 entrées), y compris aux commits `0ff980f`, `fc2e542` et `c378565`, alors que le
bilan du chantier 14 annonce 37/52 sur ce gel. Le gel n'étant pas versionné, le 37 a pu être
mesuré sur un autre état du cache. À instruire avant de re-mesurer le levier teamfight ; les
comparaisons de cette passe sont appariées sur le même gel et n'en dépendent pas.

**Expliqué le même jour** (détail dans le `README.md` de la calibration) : le 37 venait du gel
de 00h34, regelé à 13h29 sans nouveau baseline. Le regel coûte un point (Syndra/Malzahar et
Malphite n°1 perdus, Olaf/Kha'Zix gagné), les notes calculées un autre (Quinn/Garen, écart 0,24
pour une incertitude de 2,3). Rien de cassé. Nouveau baseline `baseline_v8` : **36/53**.

---

## 15. WPA des picks : retirer le biais de sélection du signal méta

Proposé le 26/09 après l'article de Coachless sur le Win Probability Added. Le win rate d'un
champion mélange son effet et le niveau de ceux qui le jouent — la cause mesurée au chantier 13.
Le correctif actuel (win rate au quart + popularité) devine ce biais ; le WPA le mesure :
`WR − moyenne de P(victoire | tout sauf le champion)`, avec le niveau et la maîtrise des joueurs
dans le modèle.

Spec : `docs/superpowers/specs/2026-09-26-wpa-des-picks-design.md`. Seule la phase 1 (enrichir la
collecte : rang et maîtrise des 10 joueurs) est décidée.

**Bloqué par** : une clé Riot personnelle (aucune dans `.env` ; une clé de développement expire
toutes les 24 h), et deux choix du joueur — régions et paliers collectés.

---

## 16. Scaling : mesuré, levier laissé à 0

Définition du joueur (26/09) : un champion scale s'il gagne nettement plus dans les parties
longues. Mesuré sur Lolalytics (`scripts/refresh_scaling.py`, `app/data/scaling.json`), terme
`scaling` câblé et testé : face à une équipe qui scale, valoriser ce qui gagne tôt.

**Laissé neutre le 27/09** : les quatre cas du joueur passent déjà sans lui (7/7), et le levier
dégrade la concordance pro (z −2,5 en top-3 à 2,0). Détail dans le `README.md` de la calibration.
Fiora contre Kayle retirée : le joueur pensait à la phase de lane (Fiora 48,3 % des parties).

**Reste ouvert** : la mesure est relative au poste — Jinx sort plate (55 % partout), Kog'Maw
à −2,3 parmi des ADC qui scalent tous. Une mesure absolue (puissance selon le niveau et l'or)
dirait autre chose ; elle n'existe pas dans les sources publiques trouvées.

---

## 17. Règles à l'envers : revue des assertions en échec

Menée le 27/09 (détail dans le `README.md` de la calibration). **Corrigé** : contre une
composition engage, seule la réception du joueur répond (élargie à « tout ce qui désengage ou
contrôle », 51 + 6 partiels) ; calibration 44/60, concordance top-10 +0,3 point (z +2,2).

**Reste à trancher avec le joueur** :

- ~~Confort contre risque~~ : tranché le 27/09 — en blind, le risque l'emporte sur le palier S.
  Échelle de maîtrise inchangée.
- ~~Désaccords cas / données~~ : « les données ont raison » (27/09). Tryndamere, Garen et
  Vayne retirés ; calibration 44/56 (`baseline_v11`). `no_tie_hard_counter` est à réécrire
  avec un counter confirmé par les données. **Réécrit le 28/09** : Jax contre Volibear, Yone
  contre Yorick, Malphite contre Gnar (57 à 60 % sur 7 000 à 10 000 parties), assertion
  `must_lead_alone` — le counter sort seul du groupe de tête.
- ~~Ekko~~ : « pas trop réception » (27/09), laissé sans.

**Risque du blind (27/09)** : le joueur tient que Yasuo en blind est plus risqué que Syndra, mais
les matchups n'en voient rien (pires matchups ≈ 46 % pour les deux, en Émeraude+ comme en
Diamant 2+). Le correctif « flex à sa part réelle » n'a rien gagné (concordance en léger recul) et
n'est pas retenu. Piste : mesurer le risque autrement que par les matchups — dépendance au
jungler, dispersion des résultats, niveau requis.

**Exploré le 28/09 : aucun signal ne confirme le joueur.** Quatre assertions en échec sur six
disent la même chose (Yasuo, Zed, Malzahar trop haut en blind ou en premier pick) :

| Signal | Mesure | Verdict |
|---|---|---|
| Matchups (27/09) | pires matchups, Émeraude+ et Diamant 2+ | ≈ 46 % pour Yasuo comme pour Syndra |
| Dépendance au reste de la draft | écart-type des `d2` contre les ennemis des cinq postes et avec les alliés, pondéré par le pick rate | ne sépare pas : Annie 4,31 (la plus dispersée), Malzahar 4,29, Yasuo 4,19, Orianna 3,73, Syndra 3,61, Zed 3,52 |
| Choix des pros | part des picks faits en phase blind, 1 050 picks mid (moyenne 26 %) | sépare Orianna (55 %, 121 picks) d'Akali (11 %) ou Ahri (4 %), mais Yasuo, Zed, Malzahar n'ont aucun pick pro mid : muet sur eux ; circulaire avec la concordance |
| Résilience quand on est derrière | article d'iTero (1 M+ parties, retard d'or à 12 min) | demanderait les timelines Riot (clé, chantier 15) ; iTero range Malzahar parmi les picks sûrs |

Décision du joueur (28/09) : **consigner et passer**. Les cas Yasuo, Zed et Malzahar restent en
confiance basse. Au passage, `blind_pick_mid_no_zed_akali` testait encore Lux > Akali, attente
rejetée par le joueur le 14/09 (« je trouve Lux vraiment useless ») : inversée, elle échoue
(Lux n°1), calibration 58 → 57/64 (`baseline_v16`), moteur inchangé.

---

## 18. Règles de cas particuliers : 48 règles débranchées depuis la reprise

`app/data/edge_cases.json` n'est lu par aucun module depuis la reprise du 09/09 (`mechanics.py`
l'a remplacé en n'en reprenant qu'une dizaine). Reprise par paquets avec le joueur, en
propriétés (`docs/TAXONOMIES_CHAMPIONS.md`). Faits le 27/09 : encaisser un type de dégâts,
ignorer le CC, contre les tanks et les auto-attaqueurs (inchangés), dashs (en cours). Écartés :
Sylas, Aphelios sans CC, compos fragiles (« trop vague, tous les assassins rentrent dedans »).

**Terminé le 27/09.** Synergies : protection d'hypercarry et Yone appliqués ; Kalista, Soraka,
Twitch non appliqués (concordance en recul). Situationnels : poke libre (Ezreal, Caitlyn) et
premier pick sûr (Pantheon, Lissandra) appliqués, top-3 pro +0,5 point. Non appliqués mais
consignés : ruées (Janna, Milio, Taliyah, Vex). Sans réponse : cibles immobiles.

**Chantier ouvert par la reprise** : les profils de dégâts viennent des tags (Diana 82 %
physique). Les corriger seuls coûte 1,2 point de concordance top-10, la composition étant réglée
dessus : à corriger avec un réglage de la composition, pas avant. **Soldé le 28/09**, voir
« Composition sur des dégâts mesurés » plus bas.

**Tank redéfini le 28/09.** « Encaisser » et « contre les tanks » lisaient `is_tank` = tag Riot
Tank ou `tankiness` ≥ 4 : 53 champions, dont Xayah, Tristana, Yuumi et Bard ; dans le cas
Malphite, les quatre champions du pool prenaient le même bonus. Le joueur retient les
sous-classes Vanguard, Warden et Juggernaut du wiki (propriété `tank`, 35 champions).
Calibration 55/63 inchangée (0 assertion basculée, 3 rangs) ; concordance top-3 16,3 → 16,5 %
(+21 −14, z +1,2), top-10 40,5 → 40,6 % (z +0,8). Appliqué.

**Reste ouvert** : deux copies de l'ancienne définition vivent hors de `Champion.is_tank`.
`composition_archetype.py` donne au « tank » un bonus d'archétype (encaisser l'engage ou le
poke) et `reasons.py` écrit « Frontline {allié} protège {candidat} », qui peut nommer Xayah. Les
aligner touche le scoring de composition : à mesurer comme une vague. **Soldé le 28/09** (six
copies en fait), ci-dessous.

### Composition sur des dégâts mesurés (28/09)

Spec `2026-09-28-composition-mesuree`, arbitrée avec le joueur. Trois étapes mesurées chacune,
puis un réglage ; détail dans le `README.md` de la calibration.

1. **Profils mesurés** : dégâts infligés par type, Lolalytics (chiffres Mobalytics), Master+,
   30 jours, 173/173 (`scripts/refresh_damage.py`, `app/data/damage_profiles.json`). Diana
   passe de 82 % physique à 8 %. Calibration 56 → 57/64 (Lulu > Nautilus contre un engage, en
   échec depuis le 14/09) ; concordance neutre (top-3 z −1,6, top-10 z +0,7) — là où le type
   Riot seul coûtait 1,2 point de top-10 le 27/09.
2. **Tank et frontline** : frontline = tank + Divers, sans Elise ni Rengar (52). Six copies de
   l'ancienne définition remplacées. Neutre sur les deux instruments.
3. **Sources de dégâts** : ≥ 10 000 dégâts du type par partie ; à cinq, aucune source AP est
   critique, une seule avertit (joueur : « trop AD, c'est une seule vraie source AP »).
   Réglage : outils `magic_damage` / `physical_damage` à 1,5 → Orianna > Zed passe (chantier 5).

Bilan contre la référence du 28/09 : calibration **56 → 58/64**, concordance top-3 16,6 → 16,6 %
(z +0,1), top-10 40,7 → 40,4 % (z −1,0).

**Reste ouvert** :

- L'étape 3 coûte du top-10 par rapport à l'étape 2 seule (41,0 → 40,4 %, z −3,0) pour un cas
  de calibration et la règle du joueur ; la calibration, sans biais de popularité, a tranché.
- Profils par poste et variantes de build : Kai'Sa, Varus et Dr. Mundo sortent sources des deux
  types (chantier 8).
- La note `tankiness` ne définit plus rien mais reste lue ailleurs comme survie (chantier 1).

---

## 19. Bans conseillés : l'adversaire de lane joué, pas le pick rare

Test du joueur le 30/09, pool ADC de 18 champions : bans conseillés Taliyah, Corki et Lux,
« Counter ton pool — Vayne, Kalista ». Sa règle : un ban vise **un champion qui counter beaucoup
ou un champion de ton rôle, la plupart du temps de ton rôle, et joué beaucoup** ; « ça doit dans
aucun monde me conseiller ça ».

**Diagnostic.** La stratégie `counter_my_pool` triait la page de counters bot contre bot sur le
seul `d2`, sans nombre de parties ni pick rate. Taliyah bot contre Vayne : −6,5 sur 130 parties,
0,07 % des parties de Vayne ; le bruit d'un win rate sur 130 parties est de ±4,4 points. Le score
saturait à 100 : sur le cache du 30/09, les trois bans étaient Vel'Koz, **Nilah et Karthus, deux
champions du pool du joueur**, à égalité. Sans pool, `patch_broken` (win rate ≥ 52 % seul)
sortait Zilean, Heimerdinger et Hwei, les mêmes en bot et en mid.

**Règle** (`app/scoring/ban_threat.py`). Un ban vaut les points de win rate qu'il évite :
part de pick rate de l'adversaire parmi les champions joués à mon poste (≥ 0,5 %, le filtre de
l'adversaire futur) × perte moyenne du pool face à lui (matchup rétréci, `k_matchup`, pondéré par
palier). Un champion n'est « counter de ton pool » que s'il coûte au moins un demi-point à l'un
des champions du pool. Deux places vont à ces adversaires de lane, une à la plus forte menace
méta ailleurs (le score méta pèse déjà la popularité, chantier 13) ; sans pool, les deux places
vont aux picks méta S du rôle. Les champions du pool ne sont jamais proposés ; `patch_broken`
est retiré.

**Résultat.** Pool du joueur : **Ezreal** (11,4 % de pick, coûte à Varus, Jinx, Caitlyn),
**Aphelios** (8,8 %, Vayne, Kai'Sa, Kalista), **Thresh** (méta S). Suivent Zeri et Lucian. Sans
pool : bot Jinx, Yunara, Thresh ; mid Ahri, Viktor, Jinx. Calibration et recommandations
inchangées (snapshot avant/après : aucun rang ni score déplacé).

**Reste ouvert** :

- La menace méta hors rôle et l'`enemy_comp_completion` gardent leurs sévérités 0-100 d'origine ;
  seule leur place (le troisième ban) change.
- `POST /api/draft/bans` (`services/ban_recommender.py`) garde l'ancienne logique, sans filtre de
  parties. Le client ne l'appelle pas (`fetchBanRecommendations` n'a aucun appelant) : à retirer
  ou à brancher sur `ban_threat`.

---

## 20. La shortlist suit l'ordre des points

Test du joueur le 30/09, blind bot, Twitch en S et seize ADC en B : Yunara +1,3 n°1, Twitch
+2,9 n°6. Sa règle : **« classer par ordre de point, si un perso a +3 le mettre devant »**, un
groupe de tête **« top 3 »** ; safe et flex doivent compter, « mais ici ça devrait pas être
ordonné comme ça ».

**Diagnostic.** Depuis le 18/09 (`018ee9b`), l'intérieur du groupe de tête était trié par risque
subi (`outcome_sd`) contre l'ordre des points. Avec des σ de ±3, l'écart Twitch–Jhin (2,1) reste
sous l'incertitude de la comparaison : toute la shortlist entrait dans le groupe et la plus sûre
passait devant. Sur la calibration, 8 cas sur 42 affichaient une liste hors de l'ordre des points.

**Règle** (`rank_shortlist`, `app/scoring/aggregate.py`). Les points décident de l'ordre ; à
points égaux, le moins exposé passe devant. Le groupe de tête garde son critère (écart sous
l'incertitude de la comparaison), borné à 3 (`top_group_max`).

**Mesure** (gel, master_plus) : 57/64 → 57/64. Gagnées : Akali > Lux (blind mid sans Zed),
Syndra > Malzahar (first pick). Perdues : **Syndra > Yasuo** (blind mid, arbitrage du 14/09,
« Yasuo c'est du bait ») et Orianna > Malzahar. Le départage cachait que les points eux-mêmes
placent Yasuo 2,3 points devant Syndra en blind. Le levier `risk_aversion` (γ, risque subi payé
en points dans `future_opponent`) est en place et laissé à 0 : γ = 0,25 à 0,75 ne change rien,
γ = 1 donne 58/64 (Orianna > Malzahar tient) mais ne reprend que 0,2 point sur Yasuo.

**Reste ouvert — étape suivante du joueur** : faire compter safe et flex **dans les points**.
Yasuo en blind mid est le cas témoin ; γ seul n'y suffit pas (il faudrait ≈ 10). À mesurer aussi
sur la concordance pro avant de retenir un γ.
