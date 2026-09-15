# Chantiers ouverts

Tout ce qu'on a identifié et volontairement mis de côté, avec ce qui le bloque et ce qu'il coûte de ne
pas le faire. Tenu à jour au fil des découvertes : rien ne doit disparaître dans l'historique de
conversation.

Dernière mise à jour : 15 septembre 2026.

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

## 4. Notes de champions — les 99 hors bot lane

`champion_overrides.json` contient 170 champions, dont **zéro** avec `ratings`. Toutes les notes
viennent de `_auto_ratings`, qui ne lit que les tags Riot. Deux champions aux mêmes tags sont
numériquement identiques : 29 ADC se réduisent à 7 vecteurs, 10 supports à 2.

**En cours** : les 29 ADC sont notés à la main avec le joueur (son rôle). Les 47 supports seront
dérivés de la taxonomie officielle des sous-classes (Enchanter / Catcher / Vanguard / Warden), qui
les sépare réellement.

**Reste** : top, jungle et mid, soit ~99 champions. La sous-classe y aide aussi (Juggernaut, Diver,
Burst, Battlemage, Artillery, Assassin, Skirmisher, Specialist).

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

**À faire avant la vague 1 — ce n'est pas du report, c'est la condition de validité des mesures.**

Les compteurs de triage ont bougé entre le 14 et le 15 septembre **sans aucun changement de code** :
20/10/8/14 puis 21/9/8/14. Cause identifiée : `comp_engage_adc_kite` (Caitlyn vs Samira) a un écart de
1,97 pour une incertitude de 2,00. Le TTL du cache a expiré, Lolalytics a resservi des statistiques
fraîches, l'assertion a basculé.

Tant que le cache de calibration n'est pas figé, l'effet d'une vague est **indiscernable de la dérive
des données**.

Corollaire : le `README.md` de la calibration annonce 20/10/8/14 et doit être corrigé.

---

## 10. Dette mineure

- `import math` devenu mort dans `run_calibration.py` (les deux `math.sqrt` ont été remplacés par
  `comparison_sd`).
- `comparison_sd` est annoté `Sequence` nu — conséquence voulue du duck-typing entre `Term` et
  `ScoreTerm`. Un `Protocol` rendrait le typage statique sans recréer le couplage.
- La branche « blend » de `mastery_term` (peu de parties personnelles) n'a pas de test sur son σ.
- Le docstring de `champion_data.py` affirme « hand-tuned overrides in champion_overrides.json refine
  the most impactful » — c'est faux, aucun `ratings` n'y est surchargé. À corriger ou à rendre vrai.
