# DALIA — Draft Analysis League Intelligence Assistant

> Assistant intelligent de draft pour **League of Legends**.
> Analyse matchups, synergies, compositions d'équipe et méta pour recommander le champion optimal à jouer en ranked.

![Stack](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Stack](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)
![Stack](https://img.shields.io/badge/Tauri_v2-FFC131?logo=tauri&logoColor=black)
![Stack](https://img.shields.io/badge/PyTorch-EE4C2C?logo=pytorch&logoColor=white)
![Stack](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

---

## Getting started

1. Download the latest installer from the [GitHub Releases](../../releases/latest) page.
2. Run the installer. If Windows SmartScreen warns you about an unsigned build, click **More info** → **Run anyway**.
3. Create an account and start drafting — the backend is already running.

---

## Architecture

```
DALIA-RELOADED/
├── server/                    # Backend Python (FastAPI)
│   ├── app/
│   │   ├── api/               # Routes REST (auth, draft, duo, history, user)
│   │   ├── auth/              # JWT + bcrypt (register, login, deps)
│   │   ├── db/                # SQLAlchemy async + PostgreSQL (models, session)
│   │   ├── ml/                # Machine Learning (PyTorch DraftNet)
│   │   │   ├── model.py       #   Architecture du réseau (embeddings + MLP)
│   │   │   ├── train.py       #   Script d'entraînement (AdamW + CosineAnnealing)
│   │   │   ├── predictor.py   #   Prédiction calibrée (temperature scaling)
│   │   │   ├── collect_matches.py  # Collecte de matchs Master+ (Riot API)
│   │   │   └── patch_watcher.py    # Surveillance auto des patchs
│   │   ├── models/            # Schémas Pydantic (champion, draft, history, user)
│   │   └── services/          # Logique métier
│   │       ├── draft_engine.py          # Moteur de recommandation (6 sous-scores)
│   │       ├── ban_recommender.py       # Recommandations de bans
│   │       ├── champion_data.py         # Base de données champions (DDragon)
│   │       ├── data_fetcher.py          # Scraping Lolalytics (cache TTL 6h)
│   │       ├── meta_analyzer.py         # Analyse méta (WR/PR/BR)
│   │       ├── matchup.py               # Matchups cross-lane (Lolalytics)
│   │       ├── synergy.py               # Synergies heuristiques
│   │       ├── composition.py           # Analyse de composition d'équipe
│   │       ├── composition_archetype.py # Détection d'archétype de composition
│   │       ├── edge_cases.py            # Règles spéciales (data/edge_cases.json)
│   │       ├── reasons.py               # Génération d'explications pour les reco
│   │       ├── role_predictor.py        # Prédiction ML du rôle joué
│   │       └── personal_stats.py        # Stats perso (Riot Match-v5 API)
│   ├── alembic/               # Migrations de base de données
│   ├── Dockerfile             # Image de production (python:3.11-slim)
│   ├── docker-compose.yml     # Stack complète (PostgreSQL + backend + frontend dev)
│   ├── overnight.sh           # Script batch : scrape → merge → train
│   └── requirements.txt
│
└── client/                    # Application desktop (Tauri v2 + React)
    ├── src/
    │   ├── components/
    │   │   ├── Auth/          # Page d'authentification (login/register)
    │   │   ├── ChampionPool/  # Éditeur de pool (tier list S/A/B/C/D)
    │   │   ├── DraftBoard/    # Board de draft (picks, bans, sélecteur, overlay recherche)
    │   │   ├── DuoQ/          # Panneau DuoQ (liaison, pool partenaire)
    │   │   ├── Insights/      # Dashboard stats + prédiction live
    │   │   ├── Recommendations/  # Panneau de recommandations détaillées
    │   │   ├── Settings/      # Paramètres + admin ML
    │   │   ├── DraftPanel.jsx # Layout principal du draft (board + reco)
    │   │   ├── HeroPanel.jsx  # Panneau hero / splash art champion sélectionné
    │   │   └── Primitives.jsx # Composants UI réutilisables (Badge, Button, Card…)
    │   ├── lib/               # Constantes partagées, helpers
    │   ├── services/          # Client API (axios) + connecteur LCU (Tauri IPC)
    │   └── stores/            # State management Zustand (8 stores)
    └── src-tauri/             # Shell natif Rust
        └── src/
            ├── lib.rs         # Commandes IPC Tauri (connect, status, summoner)
            └── lcu.rs         # Connecteur LCU (lockfile, API champ select)
```

---

## Fonctionnalités

### Draft & Recommandations

| Fonctionnalité | Description |
|---|---|
| **Draft Board** | Interface 5v5 avec picks alliés par rôle et picks ennemis en ordre de draft |
| **Recommandations IA** | Scoring multi-facteurs : méta, matchup, synergie, composition, maîtrise, risque de draft |
| **Bans intelligents** | Suggestions de bans basées sur les counters de votre pool, la méta et le taux de ban communautaire |
| **Prédiction ML** | Réseau de neurones PyTorch (DraftNet) entraîné sur les matchs D2+, probabilité de victoire calibrée |
| **Wild-cards** | Suggestions hors-pool quand vos champions sont désavantagés |
| **Tags contextuels** | Safe blind, counter-pick, flex pick, meta forte, low data |

### Données & Analyse

| Fonctionnalité | Description |
|---|---|
| **Méta en temps réel** | Tier list fusionnée (patch courant + 30 jours) avec confiance sample-size |
| **Matchups cross-lane** | Données Lolalytics vslane (lane opponent pondéré ×3) |
| **Synergies** | Heuristiques : diversité de dégâts, chaîne CC, engage+follow-up, ADC+support |
| **Composition** | Score d'équilibre (AD/AP, tank, CC, engage, carries) avec warnings |
| **Stats personnelles** | Historique ranked via Riot API (KDA, CS/min, WR par champion) |

### DuoQ

| Fonctionnalité | Description |
|---|---|
| **Liaison par code** | Partagez un code unique avec votre duo partenaire |
| **Pool partenaire** | Visualisez le pool de votre duo et son rôle |
| **Synergie boostée** | En mode DuoQ, la synergie duo est priorisée dans les recommandations |

### LCU (League Client)

| Fonctionnalité | Description |
|---|---|
| **Auto-détection** | Tauri détecte automatiquement le client LoL via lockfile (toutes lettres de lecteur, RiotClientInstalls.json, détection process) |
| **Sync live** | Synchronisation bans/picks/rôle/équipe en temps réel pendant le champ select |
| **Identité Summoner** | Récupération PUUID/gameName pour les stats personnelles |

### Historique & Insights

| Fonctionnalité | Description |
|---|---|
| **Historique** | Sauvegarde complète de chaque draft (picks, bans, score, probabilité) |
| **Résultats** | Enregistrement win/loss/remake avec notes |
| **Dashboard stats** | Win rate, champions les plus joués, performance par rôle, forme récente |
| **Taux de suivi** | Pourcentage de fois où vous avez suivi la recommandation DALIA |

### ML & Entraînement

| Fonctionnalité | Description |
|---|---|
| **DraftNet** | Embeddings de champions + projections par rôle + interactions matchup 5×5 + MLP |
| **Collecte de données** | Scraping multi-région Master+ avec checkpoints résumables |
| **Entraînement configurable** | Script overnight avec 5 configs différentes, sélection du meilleur modèle |
| **Patch Watcher** | Détection auto des nouveaux patchs, déclenchement du re-training |
| **Calibration** | Temperature scaling (T=5.0) pour des probabilités réalistes |
| **Embeddings** | Carte 2D PCA des champions, recherche de similarité (cosine distance) |

---

## API Endpoints

### Authentification

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/api/auth/register` | Non | Créer un compte → retourne JWT + user |
| `POST` | `/api/auth/login` | Non | Se connecter → retourne JWT + user |
| `GET` | `/api/auth/me` | Oui | Profil utilisateur courant |
| `PUT` | `/api/auth/me` | Oui | Modifier paramètres (rôles, poids, wildcards) |

### Champions & Méta

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `GET` | `/api/champions` | Non* | Liste des champions (filtre par rôle optionnel) |
| `GET` | `/api/champions/{id}` | Non* | Détails d'un champion |
| `GET` | `/api/meta/tierlist` | Non* | Tier list méta par rôle |
| `GET` | `/api/patch` | Non* | Version du patch courant |

### Draft

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/api/draft/recommend` | Optionnelle | Recommandations de draft (endpoint principal). Pool body si anonyme, pool DB si authentifié |
| `POST` | `/api/draft/bans` | Optionnelle | Recommandations de bans (même règle pool body/DB) |

### Profil & Pool

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `GET` | `/api/user/profile` | Oui | Profil complet avec pool |
| `GET` | `/api/user/pool` | Oui | Pool de champions uniquement |
| `POST` | `/api/user/pool` | Oui | Remplacer le pool d'un rôle |
| `DELETE` | `/api/user/pool/{role}/{champion_id}` | Oui | Retirer un champion du pool |

### Historique

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `GET` | `/api/history` | Oui | Historique (triée par date, param `limit`) |
| `POST` | `/api/history` | Oui | Sauvegarder un draft |
| `PATCH` | `/api/history/{id}` | Oui | Modifier le résultat (win/loss/remake) |
| `DELETE` | `/api/history/{id}` | Oui | Supprimer une entrée |
| `GET` | `/api/history/stats` | Oui | Statistiques agrégées |

### DuoQ

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `GET` | `/api/duo/code` | Oui | Obtenir/générer le code duo |
| `POST` | `/api/duo/code/regenerate` | Oui | Régénérer le code |
| `GET` | `/api/duo/status` | Oui | Statut de la liaison duo |
| `POST` | `/api/duo/link` | Oui | Lier avec un partenaire (par code) |
| `DELETE` | `/api/duo/unlink` | Oui | Rompre la liaison duo |
| `GET` | `/api/duo/partner/pool` | Oui | Pool du partenaire |

### ML & Embeddings

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `GET` | `/api/ml/status` | Non* | Statut du modèle ML |
| `POST` | `/api/ml/retrain` | Admin | Lancer un re-training |
| `POST` | `/api/ml/reload` | Admin | Recharger le modèle depuis le disque |
| `GET` | `/api/ml/embeddings` | Non* | Carte d'embeddings 2D |
| `GET` | `/api/ml/similar/{id}` | Non* | Champions similaires (cosine distance) |

### Stats personnelles

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/api/personal/stats` | Oui | Stats ranked via Riot API (PUUID + région) |

### Santé

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `GET` | `/health` | Non | Healthcheck (toujours 200, `ready` flag) |

> \* Nécessite que les services soient initialisés (503 sinon).

---

## Stack technique

### Backend (server/)

| Technologie | Usage |
|---|---|
| **FastAPI** | Framework API async |
| **SQLAlchemy 2.0** | ORM async (asyncpg) |
| **PostgreSQL** | Base de données (UUID PK, JSONB) |
| **PyTorch** | Réseau de neurones DraftNet |
| **python-jose** | JWT tokens (HS256) |
| **passlib + bcrypt** | Hash des mots de passe |
| **httpx** | Client HTTP async (Lolalytics, Riot API, DDragon) |
| **Alembic** | Migrations de base de données |

### Frontend (client/)

| Technologie | Usage |
|---|---|
| **React 18** | UI déclarative |
| **Zustand 4** | State management (8 stores : auth, user, draft, lcu, duo, champions, history, theme) |
| **React Router v6** | Routage SPA |
| **Axios** | Client HTTP avec intercepteurs JWT |
| **Tailwind CSS 3** | Styling utilitaire (dark mode, glass UI) |
| **@dnd-kit** | Drag & drop pour l'éditeur de pool |
| **Lucide React** | Icônes SVG |
| **Vite 5** | Bundler/dev server |

### Desktop (client/src-tauri/)

| Technologie | Usage |
|---|---|
| **Tauri v2** | Shell natif (Rust) |
| **reqwest** | Client HTTP async (API LCU) |
| **serde** | Sérialisation JSON |
| **base64** | Auth Basic pour l'API LCU |
| **winreg** | Lecture du registre Windows (localisation du client LoL) |
| **dirs-next** | Résolution de chemins système |

---

## Scoring des recommandations

Le moteur de draft combine 6 sous-scores (pondérés et configurables dans `server/app/config.py`) :

| Score | Poids | Source | Description |
|---|---|---|---|
| **Méta** | 7% | Lolalytics | WR (80%) + PR (15%) + BR (5%), confiance sample-size |
| **Matchup** | 45% | Lolalytics | Avantage matchup cross-lane (lane ×3), `vslane` data + heuristique fallback |
| **Synergie** | 10% | Heuristique | Diversité dégâts, chaîne CC, engage/follow-up, ADC+supp |
| **Composition** | 13% | Heuristique | Équilibre AD/AP, tank, CC, engage, carries + archétype de composition |
| **Maîtrise** | 17% | Pool user | Tier du champion dans le pool (S=100, D=40) |
| **Risque draft** | 8% | Heuristique | Pénalité picks risqués (flex faible, counter fort, blind à risque) |
| **ML** | Blend | DraftNet | Probabilité de victoire (fusion multiplicative calibrée) |

### Bonus & pénalités appliqués
- **Multi-counter** : bonus si le champion counter plusieurs picks ennemis simultanément
- **Archetype counters** : détection poke/engage/kite/burst → bonus contre archétypes vulnérables
- **Blind-pick penalty** : −20 sur les champions à haut risque (Yasuo, Yone, Katarina, Zed, Akali, Fizz, Qiyana, Nidalee, Kindred, …) quand l'ennemi de lane n'est pas encore pick
- **Edge cases** : règles spéciales configurables via `data/edge_cases.json` (interactions exceptionnelles)
- **Raisons** : chaque recommandation est accompagnée d'une explication textuelle générée par `reasons.py`
- **HORS POOL filtering** : recommandations marquées `inPool: false` quand absentes du pool, filtrables côté client
- **DuoQ synergy boost** : si une liaison duo est active, la synergie partenaire est priorisée

### Bans
`/api/draft/recommend` retourne aussi des suggestions de ban inline (top 5) basées sur :
1. Counters de votre pool (ce qui handicape vos champions)
2. Tier S/A globaux du patch courant
3. Taux de ban communautaire (popularité du ban)

---

## Auth

L'API supporte les modes **authentifié** et **anonyme** sur les endpoints draft :
- **Authentifié** (JWT) : pool chargé automatiquement depuis la DB, historique et duo disponibles
- **Anonyme** : le client doit envoyer le `champion_pool` dans le body de la requête

Les endpoints `/api/draft/recommend` et `/api/draft/bans` utilisent `get_optional_user` (OAuth2 avec `auto_error=False`) pour ne pas refuser les requêtes sans token.

---

## Design system (Soul Eater Edition)

Tokens CSS dans `client/src/index.css` :
- **Couleurs** : `--ink-0..5` (noirs profonds), `--bone-0..3` (off-whites), `--accent: #d91e2b` (rouge), `--ok/warn/bad`
- **Typo** : `--f-display: Oswald` (titres), `--f-mono: JetBrains Mono` (data), `--f-body: Inter`
- **Géométrie** : `--edge-weight: 2.5px` (bordures épaisses), `--skew: -1deg` (légère inclinaison)
- **Animations** : `anim-fade-up`, `anim-hero-enter`, `anim-name-enter`, `anim-score-enter`

> ⚠️ Ne pas combiner `anim-fade-up` (qui termine sur `transform: translateY(0)` avec `animation-fill-mode: both`) avec un `transform` inline dynamique — l'animation l'écrasera.

---

## License

MIT
