# Brief — retravailler le design de DALIA

À lire en début de conversation par la session qui s'occupera du design. Rédigé le 27/09/2026 à
la fin d'une session consacrée au moteur de conseil. Aucune décision de design n'a encore été
prise : ce document pose le cadre, l'état des lieux, les outils et des pistes à discuter avec le
joueur.

## 1. La demande du joueur

> « Je veux retravailler le design mais rester dans la DA noir-rouge Soul Eater, même logo. Je
> veux voir s'il y a des idées et des améliorations possibles. »

Contraintes fermes :

- **Direction artistique conservée** : noir, rouge, os (blanc cassé), inspiration Soul Eater.
- **Logo inchangé** : `client/src/assets/logo.png`, affiché par `DaliaLogo.jsx`.
- **Le moteur ne bouge pas** : le design ne touche ni aux scores ni aux termes. Ce que l'interface
  affiche vient de l'API (`breakdown.terms`, raisons, avertissements).

Le joueur attend d'abord des **idées et des propositions à valider**, pas une refonte appliquée
d'office. Il décide de la direction ; présenter des options avec leurs compromis.

## 2. État actuel

**Application** : React + Vite + Tailwind, empaquetée en application de bureau avec Tauri
(`client/src-tauri`). Elle se connecte au client League (LCU) pendant la sélection des champions.

**Design system existant** — `client/src/index.css`, section « TOKENS — Soul Eater design
system » :

| Famille | Tokens |
|---|---|
| Fond (encre) | `--ink-0` #000 → `--ink-5` #3a3a42 |
| Texte (os) | `--bone-0` #f4efe6 → `--bone-3` #6e6a61 |
| Accent | `--accent` #d91e2b, hover, pressed, muted, subtle, glow, ring |
| États | `--ok` #9cd36b, `--warn` #f5b027, `--bad` #ff4d56 |
| Équipes | `--blue-team` #4a8bff, `--red-team` = accent |
| Polices | Oswald (titres), Inter (texte), JetBrains Mono (chiffres, labels) |
| Signature | `--edge-weight` 2.5px, `--hatch-opacity` 0.18 (hachures), `--skew` −1deg, `--radius` 2px |

La couleur d'accent est personnalisable et persistée (`stores/themeStore.js`).

**Dette de design** : **605 styles en ligne** (`style={{…}}`) dans `client/src/components`. La
plupart réécrivent à la main tailles, couleurs et espacements au lieu d'utiliser les tokens ou
des classes : c'est le premier frein à toute évolution cohérente.

**Écrans** (`client/src/components`) : `Layout`, `DraftBoard` (tableau de sélection),
`Recommendations` (cartes de conseil), `HeroPanel`, `DraftPanel`, `DraftWorkshop` (comparer deux
champions), `ChampionPool` et `PoolAdvisor` (pool du joueur), `Insights`, `HistoryPage` et
replays, `DuoQ`, `Settings`, `Auth`. Primitives partagées dans `Primitives.jsx` (dont `TermBar`,
barre signée d'un terme de score, et `TERM_LABELS`).

**Maquette de référence** : `DALIA DESIGN/react-export/` (export React d'une maquette antérieure,
avec son propre `tailwind.config.js`) — à comparer avec l'application actuelle.

**Ce que l'interface doit expliquer** (vocabulaire du moteur, `docs/CHANTIERS.md`) : avantage en
points de win rate relatif au pool, incertitude (±σ), groupe de tête (« choix équivalents »),
termes (méta, popularité, matchup, adversaire à venir, maîtrise, composition, archétype, synergie,
mécaniques, scaling adverse), raisons textuelles, réception, tags (META S, safe-blind…).

## 3. Outils installés pour ce travail (27/09)

Installés globalement pour Claude Code (`~/.claude/skills`) :

| Outil | Rôle |
|---|---|
| `redesign-existing-projects` (taste-skill) | Audite une interface existante, repère les motifs « générés par IA », la remet à niveau sans casser le fonctionnel. **Point d'entrée recommandé** : on part de l'existant. |
| `design-taste-frontend` (taste-skill) | Création d'interface avec un vrai parti pris ; utile pour un écran neuf. |
| `industrial-brutalist-ui`, `high-end-visual-design`, `minimalist-ui` (taste-skill) | Trois styles. **Un seul par projet.** Le plus proche de Soul Eater : `industrial-brutalist-ui` (contrastes durs, grilles rigides, typographie massive), à tempérer par la DA existante — les tokens actuels priment sur le style de la skill. |
| `web-design-guidelines` (Vercel) | Audit du code : 100+ règles (accessibilité, clavier, focus, formulaires, animations, contraste, mode sombre). Sortie `fichier:ligne`. |
| `playwright-cli` | Ouvre l'application dans un vrai navigateur, clique, remplit, capture, émule le mobile. Chaque commande affiche un `Assertion failed … async.c` sans conséquence (Node 25 sous Windows). |
| awesome-claude-design (VoltAgent) | Pas un outil : 68 `DESIGN.md` de marques (getdesign.md). Peut servir d'inspiration ponctuelle ; ici la DA est imposée, donc à n'utiliser que pour des idées de structure. |

**Boucle de travail** : proposer → le joueur valide → `redesign-existing-projects` applique →
`playwright-cli` montre le rendu réel → `web-design-guidelines` audite → corriger → revérifier.

## 4. Lancer et vérifier

Depuis `client/` :

- `npm run dev` — serveur Vite. L'API (`server/`) doit tourner pour les vraies données ; sinon
  les parcours Playwright existants simulent l'API (`client/e2e/workflows.spec.js`).
- `npx vitest run` — 24 tests (jsdom, 15-50 s).
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test` — 3 parcours de bout en bout (édition et
  analyse, conseil de pool, sauvegarde et relecture).
- Lancer les deux suites après chaque lot de modifications : le design ne doit casser aucun
  parcours.

## 5. Pistes à proposer au joueur (non validées)

1. **Résorber les styles en ligne** vers les tokens et des classes : préalable à tout le reste,
   invisible pour l'utilisateur mais rend la DA cohérente et modifiable.
2. **Hiérarchie de la carte de recommandation** : l'avantage, son incertitude et le verdict
   « équivalent » doivent se lire en un coup d'œil pendant un timer de sélection ; les termes en
   second niveau.
3. **Lisibilité des termes** : `TermBar` affiche des barres signées ; tester un ordre stable, des
   libellés compréhensibles sans connaître le moteur, et la distinction observé / estimé
   (couleur par source déjà présente).
4. **Signature Soul Eater** : exploiter davantage l'existant (hachures, angle −1°, trait épais,
   Oswald) de façon systématique plutôt que ponctuelle — sans surcharger.
5. **Contraste et accessibilité** : vérifier `--bone-3` sur `--ink-*` et le rouge sur noir (texte
   petit, focus visible), via `web-design-guidelines`.
6. **États** : chargement, analyse périmée, données indisponibles (« WPA indisponible »,
   « échantillon indisponible »), client League non connecté — souvent les écrans les moins
   soignés.
7. **Rythme en draft** : l'application sert pendant 30 secondes de sélection ; mesurer ce qui
   est lisible d'un regard (taille, densité, animations courtes).

## 6. Ce qui est hors sujet

- Toute modification du moteur, des termes ou des données (`server/`).
- Le logo et la palette de fond (encre, os, rouge) : on peut ajuster les nuances et les usages,
  pas changer de direction.
- Publier ou déployer quoi que ce soit.

## 7. Message pour démarrer la conversation

> Lis `docs/BRIEF_REDESIGN.md`. Je veux retravailler le design de DALIA en gardant la DA noir-rouge
> Soul Eater et le même logo. Commence par un audit de l'existant (`redesign-existing-projects`,
> captures `playwright-cli` des écrans principaux, audit `web-design-guidelines`), puis
> propose-moi des pistes d'amélioration classées par impact, avec des exemples visuels, avant de
> modifier quoi que ce soit.
