# DALIA Design — React Standalone

Layout MERGED, Soul Eater design system. Aucun backend requis.

## Démarrage

```bash
cd dalia-design
npm install
npm run dev
```

Ouvre http://localhost:5173

## Structure

```
src/
├── data/
│   └── mock.js          # Toutes les données mockées (draft state, shortlist, etc.)
├── components/
│   ├── Primitives.jsx   # Atoms: Portrait, Tag, Bar, Delta, TimerChip, LCUBadge…
│   ├── HeroPanel.jsx    # Colonne gauche: hero splash + shortlist rows
│   └── DraftPanel.jsx   # Colonne droite: board + timeline + reasoning tabs
├── App.jsx              # Shell, topbar, state (accent, LCU, selected pick)
├── index.css            # Tous les tokens CSS + animations Soul Eater
└── main.jsx             # Entrypoint React
```

## Fonctionnalités

- **Hero splash** — champion recommandé en grand, avec animations slice-in / name-in / score-pop
- **Shortlist** — 5 picks (pool + 1 secret), tilt + ombre accent au clic
- **Board** — picks/bans blue & red, slot actif mis en évidence
- **Timeline** — pick order (10 slots), slot courant pulsant
- **Reasoning tabs** — RAISONS / MATCHUPS / SYNERGIES / BREAKDOWN
- **Timer** — décompte live depuis 28s, passe rouge sous 10s
- **LCU badge** — toggle prototype (vert pulsant / gris)
- **Accent switcher** — 6 couleurs (rouge, violet, acide, cyan, magenta, toxic)

## Adapter au vrai backend

1. Remplacer `src/data/mock.js` par des appels API
2. Connecter le store Zustand existant (`useDraftStore`, `useUserStore`)
3. Faire remonter `selected` / `onSelect` vers le vrai `RecommendationPanel`
