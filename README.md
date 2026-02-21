# DALIA — Draft Analysis League Intelligence Assistant

> Assistant intelligent de draft pour **League of Legends**.
> Analyse matchups, synergies, compositions d'équipe et méta pour recommander le champion optimal à jouer en ranked.

![Stack](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Stack](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)
![Stack](https://img.shields.io/badge/Tauri_v2-FFC131?logo=tauri&logoColor=black)
![Stack](https://img.shields.io/badge/PyTorch-EE4C2C?logo=pytorch&logoColor=white)
![Stack](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

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
│   │       ├── draft_engine.py       # Moteur de recommandation (6 sous-scores)
│   │       ├── ban_recommender.py    # Recommandations de bans
│   │       ├── champion_data.py      # Base de données champions (DDragon)
│   │       ├── data_fetcher.py       # Scraping Lolalytics (cache TTL 6h)
│   │       ├── meta_analyzer.py      # Analyse méta (WR/PR/BR)
│   │       ├── matchup.py            # Matchups cross-lane (Lolalytics)
│   │       ├── synergy.py            # Synergies heuristiques
│   │       ├── composition.py        # Analyse de composition d'équipe
│   │       └── personal_stats.py     # Stats perso (Riot Match-v5 API)
│   ├── alembic/               # Migrations de base de données
│   ├── Dockerfile             # Image de production (python:3.11-slim)
│   ├── docker-compose.yml     # PostgreSQL local (dev)
│   ├── overnight.sh           # Script batch : scrape → merge → train
│   └── requirements.txt
│
└── client/                    # Application desktop (Tauri v2 + React)
    ├── src/
    │   ├── components/
    │   │   ├── Auth/          # Page d'authentification (login/register)
    │   │   ├── ChampionPool/  # Éditeur de pool (tier list S/A/B/C/D)
    │   │   ├── DraftBoard/    # Board de draft (picks, bans, sélecteur)
    │   │   ├── DuoQ/          # Panneau DuoQ (liaison, pool partenaire)
    │   │   ├── History/       # Historique des drafts
    │   │   ├── Insights/      # Dashboard stats + prédiction live
    │   │   ├── Overlay/       # Overlay flottant pour champ select
    │   │   ├── Recommendations/  # Cartes de recommandation détaillées
    │   │   ├── Settings/      # Paramètres + admin ML
    │   │   └── ui/            # Composants UI réutilisables (Badge, Skeleton)
    │   ├── lib/               # Constantes partagées, helpers
    │   ├── services/          # Client API (axios) + connecteur LCU (Tauri IPC)
    │   └── stores/            # State management (Zustand)
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
| **Overlay flottant** | Widget draggable avec timer, état du draft et top 5 recommandations |
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
| `POST` | `/api/draft/recommend` | Oui | Recommandations de draft (endpoint principal) |
| `POST` | `/api/draft/bans` | Oui | Recommandations de bans |

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
| **Zustand 4** | State management (5 stores actifs) |
| **React Router v6** | Routage SPA |
| **Axios** | Client HTTP avec intercepteurs JWT |
| **Tailwind CSS 3** | Styling utilitaire (dark mode, glass UI) |
| **Lucide React** | Icônes SVG |
| **Vite 5** | Bundler/dev server |

### Desktop (client/src-tauri/)

| Technologie | Usage |
|---|---|
| **Tauri v2** | Shell natif (Rust) |
| **reqwest** | Client HTTP async (API LCU) |
| **serde** | Sérialisation JSON |
| **base64** | Auth Basic pour l'API LCU |

---

## Déploiement

### Serveur (pour toi et tes amis)

Le serveur FastAPI doit tourner en ligne. Options recommandées :

#### Railway (recommandé)
1. Créer un compte sur [railway.app](https://railway.app)
2. Nouveau projet → "Deploy from GitHub repo"
3. Sélectionner le dossier `server/` comme root
4. Ajouter un service PostgreSQL (plugin Railway)
5. Variables d'environnement :
   ```
   DATABASE_URL=<auto par Railway>
   JWT_SECRET=<générer: python -c "import secrets; print(secrets.token_hex(32))">
   RIOT_API_KEY=<optionnel, pour les stats personnelles>
   ```
6. Railway donne une URL publique (ex: `https://dalia-server-xxx.up.railway.app`)

#### Render (alternative)
1. New Web Service → connecter le repo
2. Root directory: `server`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Ajouter PostgreSQL comme service managé

### Client (l'appli desktop)

```bash
cd client
npm install
npm run tauri build
```

L'installeur `.exe` / `.msi` sera dans `client/src-tauri/target/release/bundle/`.

Tes amis installent le `.exe`, puis dans **Settings** ils entrent l'URL du serveur (ex: `https://dalia-server-xxx.up.railway.app`).

---

## Développement local

```bash
# Terminal 1 — PostgreSQL
cd server && docker-compose up -d

# Terminal 2 — Serveur backend
cd server
pip install -r requirements.txt
python run.py
# → http://localhost:8000 (API) + /docs (Swagger)

# Terminal 3 — Client desktop
cd client
npm install
npm run tauri dev
# → http://localhost:1420 (Vite) + fenêtre Tauri
```

### Entraînement du modèle ML

```bash
cd server

# 1. Collecter des matchs (nécessite RIOT_API_KEY)
python -m app.ml.collect_matches --region EUW1 --tier master --count 5000

# 2. Entraîner le modèle
python -m app.ml.train --data app/data/matches/ --epochs 30

# 3. Ou lancer le pipeline overnight complet
bash overnight.sh
```

---

## Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `DATABASE_URL` | Oui | URL PostgreSQL (async: `postgresql+asyncpg://...`) |
| `JWT_SECRET` | Oui | Clé secrète pour signer les JWT (min 32 chars) |
| `RIOT_API_KEY` | Non | Clé API Riot Games (pour stats personnelles + collecte) |
| `PORT` | Non | Port du serveur (défaut: 8000) |

---

## Scoring des recommandations

Le moteur de draft combine 6 sous-scores (pondérés et configurables) :

| Score | Poids | Source | Description |
|---|---|---|---|
| **Méta** | 12% | Lolalytics | WR (80%) + PR (15%) + BR (5%), confiance sample-size |
| **Matchup** | 33% | Lolalytics | Avantage matchup cross-lane (lane ×3), data ou heuristique |
| **Synergie** | 5% | Heuristique | Diversité dégâts, chaîne CC, engage/follow-up, ADC+supp |
| **Composition** | 15% | Heuristique | Équilibre AD/AP, tank, CC, engage, carries |
| **Maîtrise** | 20% | Pool user | Tier du champion dans le pool (S=100, D=40) |
| **Risque draft** | 8% | Heuristique | Pénalité pour picks risqués (flex faible, counter fort) |
| **ML** | Blend | DraftNet | Probabilité de victoire (fusion multiplicative) |

---

## License

MIT
