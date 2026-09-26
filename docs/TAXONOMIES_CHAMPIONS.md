# Classer les champions autrement que par les classes Riot

Recherche du 26 septembre 2026, demandée par le joueur : « il faudrait qu'on se détache des
classes (Warden, etc.), c'est super utile mais pas toujours le cas ». Ce document recense les
façons de décrire un champion trouvées en ligne, ce que chacune fournit concrètement, et ce que
DALIA en fait ou peut en faire.

## Le problème

DALIA décrit un champion par neuf notes de 1 à 5 (`cc`, `engage`, `poke`, `splitpush`,
`teamfight`, `utility`, `burst`, `dps`, `tankiness`), calculées pour 102 champions depuis les
notes de style Riot et les sous-classes du wiki (chantier 4). Deux limites reviennent sans cesse :

- **Une note agrège plusieurs propriétés** (chantier 1) : le E de Jinx et le root d'Aphelios
  sont tous deux « du CC ».
- **Une sous-classe est une étiquette unique** : Orianna n'est pas Warden, et pourtant elle
  « reçoit » un engage mieux que bien des Wardens. Le 26/09, le terme d'archétype la traitait en
  « mage immobile sans peel » face à une composition engage, parce que seule `utility ≥ 4`
  comptait comme réponse.

## Ce qui existe

### 1. Sous-classes Riot (déjà utilisées)

Wiki LoL, `Category:{Sous-classe} champion` : Vanguard, Warden, Juggernaut, Diver, Assassin,
Skirmisher, Burst, Battlemage, Artillery, Catcher, Enchanter, Marksman, Specialist. Une ou deux
par champion. **Utile** comme point de départ ; **trompeur** dès qu'un kit déborde de son
étiquette.

### 2. Mécaniques de kit du wiki — la piste la plus riche

Le wiki classe aussi chaque champion par **mécanique présente dans son kit** : 173 champions,
une trentaine de catégories exploitables, lisibles par l'API MediaWiki sans authentification
(`list=categorymembers`, `cmtitle=Category:{Mécanique} champion`).

| Famille | Catégories (nombre de champions) |
|---|---|
| Contrôle | Slow (138), Stun (68), Knockup (42), Knockback (39), Root (33), Pull (25), Knockdown (13), Suppress (7), Silence (6), Charm (4), Taunt (3), Flee (11, la peur), Ground (3), Sleep (2), Polymorph (1), Knock aside (5), Blind (1), Disarm (2), Nearsight (3), Cripple (3) |
| Protection | Shield (59), Healer (20), Cleanse (11), Resurrection (4), Stasis (6), Invulnerable (15), Immune (40), Untargetable (36) |
| Terrain | Blocker (7 : Anivia, Azir, Jarvan IV, Ornn, Taliyah, Trundle, Yorick) |
| Mobilité | Dash (96), Blink (25), Haste (104), Global (24), Stealth (19) |
| Autre | Execution (32), Self Heal (63), Pet (21), Decoy (12), Shapeshifter (11) |

**Limites mesurées** : l'étiquette est par champion, pas par sort. On ne sait ni si le contrôle
est de zone, ni s'il protège un allié ou soi-même. Le recensement n'est pas toujours exact
(Orianna figure en « Stun »). Surtout, **ces catégories ne suffisent pas à trancher une notion
de draft** : Lux (Root, Slow, Shield) a le même profil que Morgana, que le joueur classe en
réception et Lux non. Elles servent de **pièces justificatives**, pas de verdict.

### 3. Données statiques de Meraki Analytics (licence MIT)

`https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/{Champion}.json`,
projet `meraki-analytics/lolstaticdata`. Par sort : `targeting` (Unit, Auto, Direction…),
`affects` (Enemies, Allies), `effectRadius`, `targetRange`, `cooldown`, `spellshieldable`,
`projectile`, et les valeurs qui montent par niveau (« Shield Strength », « Magic Damage »…).
**Ce qui manque** : le type de contrôle n'est pas structuré (la R d'Orianna ne porte que
« Magic Damage »), il faudrait le lire dans le texte. Les `attributeRatings` de Meraki reprennent
les notes Riot déjà utilisées (Orianna : control 2, utility 2 — c'est bien ce qui la sous-note).

### 4. Archétypes de composition (communauté)

Dix archétypes courants ([LoL-Tracker](https://lol-tracker.com/compositions)), chacun avec les
traits requis : Front to Back (frontline, DPS soutenu, peel), Wombo Combo (engage, CC fiable,
zone), Hard Engage (engage, CC fiable, burst), Protect the Carry (hypercarry, peel, boucliers),
Scaling Teamfight, Early Snowball, Pick Comp (pick, vision, burst), Poke Siege (poke,
waveclear), Dive (dive, mobilité, burst), Splitpush 1-3-1 (splitpush, duel, waveclear).

DALIA détecte sept archétypes adverses (`poke`, `engage`, `kite`, `split`, `protect_carry`,
`pick`, `mixed`) mais n'a **ni scaling, ni dive, ni front-to-back, ni waveclear** comme notion.

### 5. Outils de draft

- **DraftForge** : huit attributs par champion pour évaluer une lane — Push Power, Poke,
  Sustain, All-In, Range, Mobility, Early Strength, CC & Clears. Proches de nos notes, avec deux
  axes qui nous manquent : force en début de partie, et poussée de vague.
- **ProComps** : alertes de composition (AP, frontline, scaling).
- **LoLDraftAI** : réseau de neurones sur des millions de parties, sans attributs lisibles.

### 6. Recherche académique

- Clustering k-means de statistiques de parties (dégâts, or, farm, morts, participation…) en six
  archétypes : frontline tank, artillery control, scaling carry, siege splitpush, utility
  support, skirmish bruiser ([arXiv 2605.18338](https://arxiv.org/abs/2605.18338)).
- Découverte de sous-rôles par clustering supervisé sur des parties pros (Springer 2024, accès
  payant, non lu).

## Ce que DALIA en retient

1. **Une couche de propriétés de draft**, à côté des notes : des notions que le joueur définit
   (« réception », puis d'autres), une valeur par champion, et les mécaniques du wiki comme
   pièces justificatives. C'est la réponse au chantier 2 : les règles lisent des propriétés, ne
   nomment plus de champions.
2. **Les notions qui manquent**, par ordre d'impact probable : réception / disengage (fait le
   26/09, voir ci-dessous), force en début de partie contre scaling (mesuré le 26/09 depuis le
   win rate par durée de partie de Lolalytics, sans gain pour le moteur : chantier 16), dive,
   waveclear.
3. **Les mécaniques du wiki et les champs Meraki** comme matière première du chantier 1 :
   décomposer `cc` en « contrôle de zone » et « contrôle ciblé », `utility` en « protège un
   allié » et « accélère l'équipe », etc.

## Première propriété : la réception

Définition du joueur (26/09) : **la capacité à absorber l'engage adverse et à riposter**,
souvent en front-to-back — « par exemple Anivia, Renata, tous les persos qui sont bons à
absorber l'engage ». Règle générale donnée par le joueur : « les mages de contrôle font bien la
réception ».

Liste validée le 26/09 :

| Groupe | Champions |
|---|---|
| Gardiens (Warden du wiki) | Braum, Galio, K'Sante, Poppy, Shen, Tahm Kench, Taric |
| Enchanteurs (Enchanter du wiki) | Janna, Karma, Lulu, Milio, Nami, Renata, Seraphine, Sona, Soraka |
| Mages de contrôle et autres, par kit | Orianna, Anivia, Lissandra, Vex, Taliyah, Azir, Gragas, Zilean, Morgana |
| **Écartés** par le joueur | Lux (« pas trop »), Senna, Yuumi (Enchanters du wiki mais n'absorbent pas un engage) |

Vex : réception, avec la nuance du joueur — sa R lui permet aussi de plonger.

**Élargie le 27/09** : « en gros tout ce qui désengage ou contrôle ». Le joueur a tranché une
liste tirée des mécaniques du wiki (Knockback, Stasis, Blocker, Flee, Ground, Suppress). Sa
réception inclut ceux qui **encaissent et ripostent**, pas seulement ceux qui fuient :

| Verdict | Champions |
|---|---|
| Oui | Alistar, Bard, Thresh, Syndra, Cassiopeia, Malzahar, Viktor, Hwei, Ziggs, Vel'Koz, Xerath, Zyra, Ornn, Sion, Gnar, Sejuani, Rammus, Xin Zhao, Rakan (« gros oui »), Sett, Qiyana, Shyvana, Skarner, Ambessa, Urgot, Darius |
| « Oui et non » → réception partielle (`reception_partielle`, compte à moitié) | Maokai, Vi, Aatrox, Pyke, Viego, Lux (« oui mais pas le premier choix ») |
| Non | Trundle, Zac, Lee Sin, Hecarim, Briar, Warwick, Nocturne, Camille, Kled, Ekko (« pas trop », 27/09) |

Total : 51 réceptions, 6 partielles.

**Dans le moteur** (26/09) : champ `properties` des overrides, lu dans `Champion.properties`.
Contre une composition engage, `archetype_counter_adjust` compte la réception comme le peel
(+0,08), retire le malus « free kill » d'un mage qui reçoit et ne donne plus le bonus de
mobilité à un assassin. Mesure dans le `README.md` de la calibration.

**Le 27/09**, la réception devient la **seule** réponse reconnue à un engage : une note
d'utilité ≥ 4 ne vaut plus peel d'office, et un engage ≥ 4 n'est plus compté comme mobilité.
La réception partielle compte à moitié (bonus et malus « free kill »).

## Sources

- Wiki LoL, API MediaWiki : `https://wiki.leagueoflegends.com/en-us/api.php`, catégories
  `… champion` (sous-classes et mécaniques), lues le 26/09/2026.
- [meraki-analytics/lolstaticdata](https://github.com/meraki-analytics/lolstaticdata) et le
  fichier d'Orianna sur le CDN Meraki.
- [LoL-Tracker — Team Composition Archetypes](https://lol-tracker.com/compositions).
- [DraftForge](https://draftforge.gg/), [ProComps](https://procomps.gg/),
  [LoLDraftAI](https://loldraftai.com/).
- [arXiv 2605.18338 — Robust Player-Conditional Champion Ranking](https://arxiv.org/abs/2605.18338).
- [Dignitas — The Disengage Playstyle](https://dignitas.gg/articles/the-good-ol-bait-and-switch-the-disengage-playstyle-in-lol),
  [Dignitas — Countering Engages](https://dignitas.gg/articles/countering-engages-a-quick-guide-on-countering-engage-champions).
