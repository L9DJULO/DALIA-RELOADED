# DALIA — Draft Analysis League Intelligence Assistant

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

> Outil d'optimisation de draft League of Legends.  
> Analyse **meta, matchups, synergies, composition d'équipe** et **risque de draft** pour recommander le pick optimal.

![DALIA Screenshot](https://via.placeholder.com/800x400?text=DALIA+Draft+Board)

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| **🔗 Connexion LCU** | Détection automatique du client LoL — picks et bans synchronisés en temps réel (comme Blitz/Porofessor) |
| **Pool de champions** | Configurer ses champions par rôle avec un système de tier list (S/A/B/C/D) |
| **Analyse Meta** | Stats **Master+** : winrate, pickrate, banrate (données Lolalytics 30 jours) — blend automatique entre le patch actuel et le précédent si trop peu de données |
| **Matchups** | Winrate de chaque champion contre les ennemis révélés (lane opponent ×3 poids) |
| **Synergies** | Synergie avec les alliés déjà pick (données Lolalytics) |
| **Composition** | Vérification AD/AP, présence tank, CC, engage, DPS, utilité — alertes automatiques |
| **Prédiction IA** | Réseau de neurones (DraftNet) entraîné sur 100K+ matches Master+ qui prédit P(victoire) via champion embeddings + interactions cross-role. Score calibré avec *temperature scaling* pour éviter la sur-confiance. |
| **Risque de draft** | Pénalité si blind pick avec des gros counters open ; bonus si last pick |
| **Suggestions off-meta** | Propose jusqu'à 2 champions hors du pool si ils sont exceptionnellement adaptés au draft (filtre meta strict) |
| **Ordre de draft complet** | Gère le draft LoL ranked (bans 3+3, picks 1-2-2-1, bans 2+2, picks 2-1-1-2) |

---

## 🏗️ Architecture

```
DALIA RELOADED/
├── backend/                    # Python / FastAPI
│   ├── app/
│   │   ├── api/routes.py       # Endpoints REST
│   │   ├── models/             # Pydantic models (champion, draft, user)
│   │   ├── services/
│   │   │   ├── data_fetcher.py     # Scraping Lolalytics + Data Dragon
│   │   │   ├── champion_data.py    # Base de données champions
│   │   │   ├── meta_analyzer.py    # Score meta (WR, PR, BR)
│   │   │   ├── matchup.py         # Analyse matchups
│   │   │   ├── synergy.py         # Analyse synergies
│   │   │   ├── composition.py     # Analyse composition d'équipe
│   │   │   ├── draft_engine.py    # Moteur principal de recommandation
│   │   │   └── lcu_connector.py   # Connexion au client LoL (LCU API)
│   │   └── data/
│   │       ├── champion_overrides.json  # Classification manuelle 120+ champs
│   │       └── cache/                   # Cache des données Lolalytics
│   ├── requirements.txt
│   └── run.py
│
└── frontend/                   # React / Vite / TailwindCSS
    └── src/
        ├── stores/             # Zustand (draftStore, userStore, lcuStore)
        ├── services/api.js     # Client API
        └── components/
            ├── ChampionPool/   # Éditeur de pool (tier list drag & click)
            ├── DraftBoard/     # Board de draft interactif + LCU status
            └── Recommendations/ # Panel de recommandations avec scores
```

---

## 🚀 Installation & Lancement

### Prérequis
- **Python 3.10+**
- **Node.js 18+**
- **npm** ou **yarn**

### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

Le serveur démarre sur `http://localhost:8000`.  
Docs API interactive : `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Le frontend démarre sur `http://localhost:5173`.  
Le proxy Vite redirige `/api/*` vers le backend.

---

## 🔗 Connexion au Client LoL (LCU)

DALIA se connecte automatiquement au client League of Legends via la **LCU API** (League Client Update) — la même méthode utilisée par Blitz, Porofessor, U.GG, etc.

### Fonctionnement

1. **Détection automatique** : Au démarrage, DALIA cherche le fichier `lockfile` dans le répertoire LoL
2. **Authentification** : Utilise le token local pour s'authentifier sur l'API HTTPS locale
3. **Polling** : Interroge `/lol-champ-select/v1/session` toutes les 1.5s pendant le champ select
4. **Synchronisation** : Met à jour automatiquement le draft board avec les picks/bans en temps réel

### Utilisation

1. **Lance LoL** et connecte-toi
2. **Lance DALIA** (backend + frontend)
3. **Entre en champ select** — DALIA détecte automatiquement
4. Le statut s'affiche en haut à droite du draft board :
   - 🟢 **Champ Select** : synchronisation active
   - 🔵 **Menu** : client détecté mais pas en draft
   - 🔴 **Déconnecté** : client non trouvé
5. Active **Auto-sync ON** pour remplir automatiquement les slots
6. Clique **Analyser le draft** pour obtenir les recommandations

### Chemins détectés automatiquement

Windows :
- `C:\Riot Games\League of Legends`
- `D:\Riot Games\League of Legends`
- Détection via processus `LeagueClientUx.exe`

Mac :
- `/Applications/League of Legends.app/Contents/LoL`

### Note technique

L'API LCU utilise un certificat SSL auto-signé — DALIA l'ignore (connexion locale uniquement).

---

## 📊 Algorithme de scoring

Pour chaque champion candidat, le score total est :

```
Score = Σ (poids_i × sous_score_i)
```

| Sous-score | Poids | Description |
|---|---|---|
| **Meta** | **0.18** | WR (60%) + PR (25%) + BR (15%) normalisés |
| **Matchup** | **0.45** | Δ WR vs ennemis révélés (lane ×3) — le plus important |
| Synergie | 0.05 | Δ WR avec alliés (réduit car souvent surrévalué) |
| Composition | 0.12 | Pénalités : full AD/AP, pas de tank, pas de CC/engage |
| Maîtrise | 0.08 | Tier utilisateur (S=82, A=68, B=54, C=40, D=25) |
| **Prédiction ML** | **10-25%** | DraftNet (champion embeddings + cross-role interactions) — poids **adaptatif** selon la confiance : 25% (haute), 18% (moyenne), 10% (faible) |
| Risque draft | 0.07 | Sécurité du blind pick (réduit car souvent trop conservateur) |

Les poids sont ajustables par l'utilisateur.

### Gestion de la meta
- Données **Master+ Ranked Solo** depuis Lolalytics (30 derniers jours)
- **Blend automatique** : si le patch actuel a < 100 games pour un champion, les données du patch précédent sont mélangées (70/30)
- Cache local avec TTL de 6h

### Composition d'équipe
L'analyseur vérifie :
- **Répartition dégâts** : alerte si >78% AD ou AP (critique) ou >68% (warning)
- **Frontline/Tank** : alerte si aucun champion avec tankiness ≥ 4
- **CC** : alerte si la moyenne CC de l'équipe < 2.0
- **Engage** : alerte si aucun champion avec engage ≥ 4
- **Carry threat** : alerte si aucun champion avec DPS ou burst ≥ 4
- **Trop de carries** : alerte si ≥ 4 carries sans peel/utility

### Risque de draft
- **Last pick** → 90/100 (très safe)
- **Lane opponent révélé** → 80/100
- **Blind pick** → pénalité basée sur :
  - Le pire counter disponible (non banni / non pick)
  - Le nombre de counters dangereux (Δ < -2%) encore accessibles
  - Le nombre de picks ennemis restants

---

## 🔧 Configuration

Éditer `backend/app/config.py` :

```python
class ScoringWeights(BaseModel):
    meta: float = 0.18          # force du champion dans la meta
    matchup: float = 0.45       # le plus important : winrate vs ennemis
    synergy: float = 0.05       # synergie avec alliés (réduit)
    composition: float = 0.12   # équilibre de la comp
    mastery: float = 0.08       # maîtrise personnelle
    draft_risk: float = 0.07    # risque de blind pick (réduit)
```

---

## 📖 API Endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/champions` | Liste tous les champions |
| GET | `/api/champions?role=mid` | Champions filtrés par rôle |
| GET | `/api/meta/tierlist?role=top` | Tier list Master+ pour un rôle |
| POST | `/api/draft/recommend` | **Recommandations de draft** |
| GET | `/api/user/profile` | Profil utilisateur |
| POST | `/api/user/profile` | Sauvegarder le profil |
| POST | `/api/user/pool` | Mettre à jour le pool d'un rôle |
| GET | `/api/patch` | Info patch actuel |
| **GET** | **`/api/lcu/status`** | **État de la connexion LCU + picks/bans live** |
| POST | `/api/lcu/connect` | Connexion manuelle au client LoL |
| POST | `/api/lcu/start-polling` | Démarrer la synchronisation auto |
| POST | `/api/lcu/stop-polling` | Arrêter la synchronisation |

### Corps de la requête draft/recommend

```json
{
  "draft_state": {
    "my_team": "blue",
    "my_role": "mid",
    "bans": [238, 91],
    "ally_picks": [
      {"champion_id": 86, "role": "top"}
    ],
    "enemy_picks": [
      {"champion_id": 157, "role": "mid"}
    ]
  },
  "champion_pool": {
    "mid": [
      {"champion_id": 103, "champion_key": "Ahri", "tier": "S"},
      {"champion_id": 134, "champion_key": "Syndra", "tier": "A"}
    ]
  }
}
```

`my_pick_order` est optionnel : le moteur peut estimer le risque de draft automatiquement selon les picks ennemis déjà révélés et restants.

---

## 🎨 Stack technique

- **Backend** : Python 3.10+, FastAPI, httpx, Pydantic
- **Frontend** : React 18, Vite, TailwindCSS, Zustand, Lucide icons
- **Data** : Lolalytics (Master+ stats, 30 jours), Riot Data Dragon (champion data, images), Riot API (match history)
- **ML** : PyTorch (DraftNet — champion embeddings 32-dim + role projections + 5×5 cross-role matchup interactions)
- **Cache** : Fichier JSON local avec TTL

---

## 🤖 Module IA / Machine Learning

### Architecture du modèle

**DraftNet** — Réseau de neurones qui apprend à prédire P(victoire blue) à partir de la composition des 10 champions.

| Composant | Description |
|---|---|
| **Champion Embeddings** | Chaque champion → vecteur appris de 32 dimensions |
| **Role Projections** | Projections spécifiques par rôle (Fiora top ≠ Fiora mid) |
| **Matchup Interactions** | Produit scalaire de chaque paire (blue_role_i, red_role_j) — capture les menaces cross-role (5×5 = 25 interactions) |
| **MLP** | Concat features + interactions → 256 → 128 → 64 → 1 (logit) |
| **Temperature Scaling** | Calibration T=5.0 pour corriger la sur-confiance (modèle ~60% accuracy) : P=5% → P(calibrée)=36% |

### Explications ML dans l'interface

Chaque recommandation affiche :
- **Badge de confiance** : Haute (données >200 games, draft complet) / Moyenne / Faible
- **P(win) calibrée** : probabilité ajustée après temperature scaling
- **P(win) brute** : sortie du modèle (souvent extrême, affiché pour transparence)
- **Liste de raisons** : qualité des données, complétude du draft (10/10 champions), rappel 60% accuracy

### Pipeline complet

```
1. Collecter    →  2. Entraîner  →  3. Intégration automatique
   (Riot API)       (PyTorch)          (DraftEngine)
```

### Étape 1 — Collecter les données (matches Master+)

```bash
cd backend

# EUW uniquement (~80-120K matches, ~4-5h avec clé prod) :
python -m app.ml.collect_matches --regions euw1 --target 80000 --max-players 5000

# EUW + KR pour diversité (recommandé, ~150-200K matches, ~7-9h) :
python -m app.ml.collect_matches --regions euw1 kr --target 150000 --max-players 5000

# Avec clé de développement (plus lent) :
python -m app.ml.collect_matches --regions euw1 --api-key RGAPI-xxx --key-type dev --target 30000
```

Le collecteur :
- Récupère les joueurs **Challenger / Grandmaster / Master**
- Collecte les match IDs ranked des **30 derniers jours**
- Extrait les compositions (10 champion IDs + résultat)
- **Résumable** : si interrompu, relancer la même commande reprend là où on s'est arrêté (checkpoints par région)
- Sauvegarde en `backend/app/data/matches/matches.jsonl` (merged)

**Régions disponibles** : `euw1`, `na1`, `kr`, `br1`, `eun1`, `jp1`, `la1`, `la2`, `oc1`, `ph2`, `ru`, `sg2`, `th2`, `tr1`, `tw2`, `vn2`

### Étape 2 — Entraîner le modèle

```bash
cd backend
python -m app.ml.train --data app/data/matches/matches.jsonl --epochs 60
```

Options :
- `--epochs 60` — nombre d'epochs (défaut: 60)
- `--batch-size 256` — taille du batch (défaut: 256)
- `--embed-dim 32` — dimension des embeddings (défaut: 32)
- `--hidden-dim 256` — taille du MLP caché (défaut: 256)
- `--lr 0.001` — learning rate (défaut: 0.001)

Le script :
- Split train/val automatique 90/10
- Early stopping si val accuracy stagne 10 epochs
- Sauvegarde automatique du meilleur modèle → `backend/app/data/models/draft_model.pt`
- Logs : accuracy, loss, epoch

Résultat attendu : **~58-62% validation accuracy** (modèle capte des patterns mais reste humble — d'où la calibration nécessaire)

### Étape 3 — Utilisation automatique

Le `DraftEngine` charge le modèle automatiquement au démarrage si `draft_model.pt` existe.

**Influence adaptative** :
- Confiance **haute** (draft complet + champion >200 games) → ML **25%** du score total
- Confiance **moyenne** → ML **18%**
- Confiance **faible** (champion rare / draft incomplet) → ML **10%**

Si le modèle n'est pas encore entraîné, le moteur fonctionne normalement avec les 6 autres sous-scores.

---

## 🤝 Contributing

Les contributions sont les bienvenues ! Pour les changements majeurs, ouvrez d'abord une issue.

1. Fork le repo
2. Créez votre branche (`git checkout -b feature/amazing-feature`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request

---

## 📝 License

Distribué sous licence MIT. Voir [LICENSE](LICENSE) pour plus d'informations.

---

## ⚠️ Disclaimer

Ce projet n'est pas affilié à Riot Games, Inc.  
League of Legends et toutes les propriétés associées sont des marques déposées de Riot Games, Inc.
