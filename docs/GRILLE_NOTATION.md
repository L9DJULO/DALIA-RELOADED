# Grille de notation des champions

Rédigée le 24 septembre 2026 (chantier 4). Elle fixe ce que veut dire chaque chiffre **avant** de
noter les 102 champions de top, jungle et mid, pour que les notes ne dérivent pas d'un paquet à
l'autre.

Elle ne décide rien de neuf : chaque définition est tirée des 71 notes de bot lane arbitrées avec
le joueur les 15/09 (`champion_overrides.json`), et les ancres citées sont ces notes-là. Là où les
arbitrages ne tranchent pas, c'est signalé.

Vecteur : `[cc, engage, poke, splitpush, teamfight, utility, burst, dps, tankiness]`, entiers 1 à 5.

---

## Ce que le moteur lit vraiment

Presque toutes les règles du moteur testent **deux seuils** : `>= 4` (le champion apporte l'outil)
et `<= 2` (il ne l'apporte pas). Le 3 est une zone neutre. Conséquence pratique : **la frontière
qui compte est entre 3 et 4**. Hésiter entre 1 et 2, ou entre 4 et 5, change peu de choses ;
hésiter entre 3 et 4 change ce que le moteur croit que l'équipe possède.

| Seuil | Ce qu'il déclenche |
|---|---|
| `tankiness >= 4` | outil « première ligne », compte comme tank dans les avertissements |
| `engage >= 4` et `cc >= 3` | outil « initiation » |
| `poke >= 4` | outil « portée / poke » |
| `dps >= 4` ou `burst >= 4` | compte comme carry (avertissements « pas de carry », « trop de carries ») |
| `utility >= 4` | synergie et archétype « protect » |
| `tankiness <= 2` | fragile : cible des règles de burst, d'assassin, de carry mêlée |

---

## Les neuf dimensions

### `cc` — combien de lockdown fiable le champion apporte réellement

**Pas « a-t-il du CC »**, mais le contrôle qui immobilise vraiment une cible, pondéré par la
fiabilité d'application. Arbitrage du joueur sur Blitzcrank : la note porte sur **l'impact
accessible**, pas sur la difficulté d'exécution — « même si compliqué à toucher, ça a beaucoup de
value, et y'a plein de manières d'être sûr de jouer les grabs ».

- **5** — plusieurs CC durs, dont au moins un quasi garanti : Leona, Nautilus, Alistar, Amumu.
- **4** — un CC dur décisif ou un CC de zone fiable : Blitzcrank, Janna, Morgana, Rakan, Ashe.
- **3** — un CC réel mais conditionnel, court ou évitable : Lux, Poppy, Jhin, Brand.
- **2** — ralentissements ou CC marginal : Jinx (piège télégraphié), Caitlyn, Vayne.
- **1** — aucun contrôle qui compte en combat : Draven, Ezreal, Lucian, Samira.

Limite connue (chantier 1) : la note mélange puissance et fiabilité. Le E de Jinx et le root
d'Aphelios sont tous deux « du CC » d'intensité différente.

### `engage` — peut-il démarrer un combat que l'équipe peut suivre

- **5** — engage dur, à distance, que l'équipe suit : Malphite, Leona, Nautilus, Rell, Rakan.
- **4** — engage réel mais conditionnel (skillshot, pick) : Blitzcrank, Thresh, Pyke, Sett.
- **3** — peut ouvrir de façon opportuniste : Ashe (R), Kalista (R), Nami, Seraphine.
- **2** — suit un engage, ne le lance pas : Braum, Lulu, Karma.
- **1** — aucun outil d'initiation : Caitlyn, Jinx, Lux, Janna.

### `poke` — dégâts infligés à distance avant que le combat commence

- **5** — artillerie, le poke est son plan de jeu : Xerath, Vel'Koz, Ziggs, Lux, Caitlyn, Ezreal.
- **4** — poke fort mais pas exclusif : Jhin, Karma, Nami, Senna.
- **3** — un peu de harass à distance : Ashe, Jinx, Lulu, Miss Fortune.
- **2** — poke anecdotique : Draven, Janna, Kalista.
- **1** — doit être au contact pour faire des dégâts : Leona, Nautilus, Samira, Nilah.

### `splitpush` — tient-il seul une lane secondaire, 1v1 et pression de tour

Aucun champion de bot lane n'est à 5, et seuls Vayne et Yasuo sont à 4. **Les ancres hautes
restent à arbitrer** avec les tops : les 102 champions restants portent l'essentiel de cette
dimension.

- **5** — *à arbitrer* (candidats : Fiora, Jax, Tryndamere, Yorick).
- **4** — Vayne, Yasuo.
- **3** — pousse vite et s'échappe : Ezreal, Kai'Sa, Tristana, Ziggs.
- **1-2** — ne pèse pas seul sur une lane.

### `teamfight` — ce qu'il pèse quand les dix sont groupés

**Dimension saturée, à réarbitrer.** Sur les 71 champions notés, 69 sont à 4 ou 5 : seuls Shaco
(2) et Ezreal (3) en sortent. En bot lane la note ne départage presque rien. Or le terme
`teamfight` du chantier 5 la lit telle quelle.

Proposition de grille, **non arbitrée** :

- **5** — le combat groupé est sa condition de victoire : Amumu, Miss Fortune, Seraphine, Rell.
- **4** — fort en teamfight sans que ce soit tout son jeu.
- **3** — contribution moyenne.
- **2** — joue pour le pick ou le split plus que pour le combat groupé : Shaco.
- **1** — absent du combat groupé par nature.

### `utility` — apport à l'équipe hors dégâts et hors CC

Soins, boucliers, vitesse, vision, anti-soins, zones.

- **5** — enchanteurs : Janna, Lulu, Milio, Nami, Karma, Renata, Senna, Braum.
- **4** — utilitaire réel mais secondaire : Alistar, Rakan, Pyke, Yuumi.
- **3** — utilité ponctuelle : Blitzcrank, Leona, Jhin, Lux.
- **2** — pas d'apport notable hors dégâts : Caitlyn, Draven, Vayne, Brand.

### `burst` — dégâts concentrés en une rotation

- **5** — tue une cible fragile en un enchaînement : Lux, Brand, Xerath, Draven, Samira, Malphite.
- **4** — gros dégâts ponctuels : Jhin, Kai'Sa, Miss Fortune, Pyke.
- **3** — Caitlyn, Ezreal, Blitzcrank.
- **2** — Jinx, Ashe, Leona.
- **1** — aucun dégât ponctuel : Janna, Soraka, Yuumi, Sona.

### `dps` — dégâts soutenus dans la durée

- **5** — hypercarries en attaque de base : Jinx, Kog'Maw, Aphelios, Kai'Sa, Twitch.
- **4** — Caitlyn, Ezreal, Jhin, Miss Fortune.
- **3** — dégâts continus modestes : Swain, Zyra, Senna.
- **1-2** — pas de DPS soutenu : supports engage et enchanteurs.

### `tankiness` — survivabilité effective, pas résistance brute

Arbitrage du joueur : dash, bouclier, intouchabilité comptent autant que l'armure. Une note haute
veut dire « difficile à tuer », pas « a des résistances ».

- **5** — Alistar, Leona, Nautilus, Braum, Malphite, Tahm Kench.
- **4** — Thresh, Rell, Gragas, Tristana, Xayah.
- **3** — survit par la mobilité : Ezreal, Kai'Sa, Vayne, Yasuo, Nilah.
- **2** — Draven, Lucian, Janna, Lulu.
- **1** — Jinx, Ashe, Lux, Xerath.

Limite connue (chantier 1) : **Yuumi est à 5**, parce qu'elle est intouchable attachée à son
porteur. Le joueur a relevé que ce n'est pas le même « tank » que Nautilus — la note mélange
survie personnelle et tankiness apportée à l'équipe, et le seuil `>= 4` fait compter Yuumi comme
première ligne.

---

## À trancher avec le joueur avant de noter les 102

1. **`teamfight`** : réarbitrer les 71 notes existantes sur la grille ci-dessus, ou l'accepter
   saturée. Tant qu'elle l'est, le levier teamfight du chantier 5 ne départage pas la bot lane.
2. **Ancres hautes de `splitpush`** : quels tops à 5.
3. **Brand et Vel'Koz**, identiques (`3 1 5 1 5 2 5 2 1`) : une différence réelle existe-t-elle ?
