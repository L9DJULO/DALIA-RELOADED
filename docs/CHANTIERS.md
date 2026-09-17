# Chantiers ouverts

Tout ce qu'on a identifié et volontairement mis de côté, avec ce qui le bloque et ce qu'il coûte de ne
pas le faire. Tenu à jour au fil des découvertes : rien ne doit disparaître dans l'historique de
conversation.

Dernière mise à jour : 17 septembre 2026, après le gel du cache de calibration et le rejeu du baseline.

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

---

## 4bis. Le fichier d'overrides n'a pas suivi les sorties récentes

**Quatre champions sont totalement absents de `champion_overrides.json`** : Ambessa, Locke, Wukong et
Zaahen. Pas d'entrée du tout, donc pas de `roles` non plus : leurs lanes sont devinées par
`_default_roles` depuis les tags Riot. Yunara était dans le même cas jusqu'au 15/09.

Conséquence : un champion récent peut être conseillé dans la mauvaise lane, ou absent de la bonne, sans
aucun signal.

---

## 4ter. Les notes sont par champion, pas par rôle

Un champion porte un seul vecteur quel que soit le poste où il est joué. Malphite support et Malphite
top sont notés pareil, alors qu'ils ne remplissent pas le même office.

Le joueur a par ailleurs signalé que la liste des supports est trop permissive : « Malphite, le pick
existe pas vraiment, c'est super rare quand on monte dans les elos », idem pour Gragas, et Shaco,
Heimerdinger et Sett ne se jouent pas vraiment support à master+. Ces champions sont proposés sur un
poste où ils ne se jouent plus.

---

## 5. Le matchup de lane prime sur l'apport à la partie

Révélé par l'arbitrage du cas `comp_engage_mid_peel`. Mot du joueur : « Zed a un meilleur matchup mid
mais Orianna meilleure overall pour la game, donc je pense Orianna. »

Le moteur classe Zed n°1 et Orianna n°6. Il sur-pondère le duel de couloir face à la contribution
d'équipe. **Aucune vague du plan en cours ne traite ce point.**

C'est probablement le défaut qui coûte le plus de conseils erronés, puisqu'il touche tous les last
picks où le joueur doit arbitrer entre gagner sa lane et gagner la partie.

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

- `import math` devenu mort dans `run_calibration.py` (les deux `math.sqrt` ont été remplacés par
  `comparison_sd`).
- `comparison_sd` est annoté `Sequence` nu — conséquence voulue du duck-typing entre `Term` et
  `ScoreTerm`. Un `Protocol` rendrait le typage statique sans recréer le couplage.
- La branche « blend » de `mastery_term` (peu de parties personnelles) n'a pas de test sur son σ.
- Le docstring de `champion_data.py` affirme « hand-tuned overrides in champion_overrides.json refine
  the most impactful » — c'est faux, aucun `ratings` n'y est surchargé. À corriger ou à rendre vrai.

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
