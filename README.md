# DALIA — Draft Analysis League Intelligence Assistant

Outil d'optimisation de draft League of Legends.  
Analyse **meta, matchups, synergies, composition d'équipe** et **risque de draft** pour recommander le pick optimal.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| **Pool de champions** | Configurer ses champions par rôle avec un système de tier list (S/A/B/C/D) |
| **Analyse Meta** | Stats D2+ : winrate, pickrate, banrate — blend automatique entre le patch actuel et le précédent si trop peu de données |
| **Matchups** | Winrate de chaque champion contre les ennemis révélés (lane opponent ×3 poids) |
| **Synergies** | Synergie avec les alliés déjà pick (données Lolalytics) |
| **Composition** | Vérification AD/AP, présence tank, CC, engage, DPS, utilité — alertes automatiques |
| **Risque de draft** | Pénalité si blind pick avec des gros counters open ; bonus si last pick |
| **Suggestions off-meta** | Propose jusqu'à 2 champions hors du pool si ils sont exceptionnellement adaptés au draft |
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
│   │   │   └── draft_engine.py    # Moteur principal de recommandation
│   │   └── data/
│   │       ├── champion_overrides.json  # Classification manuelle 120+ champs
│   │       └── cache/                   # Cache des données Lolalytics
│   ├── requirements.txt
│   └── run.py
│
└── frontend/                   # React / Vite / TailwindCSS
    └── src/
        ├── stores/             # Zustand (draftStore, userStore)
        ├── services/api.js     # Client API
        └── components/
            ├── ChampionPool/   # Éditeur de pool (tier list drag & click)
            ├── DraftBoard/     # Board de draft interactif (bans + picks)
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

## 📊 Algorithme de scoring

Pour chaque champion candidat, le score total est :

```
Score = Σ (poids_i × sous_score_i)
```

| Sous-score | Poids | Description |
|---|---|---|
| Meta | 0.15 | WR (60%) + PR (25%) + BR (15%) normalisés |
| Matchup | **0.25** | Δ WR vs ennemis révélés (lane ×3) |
| Synergie | 0.15 | Δ WR avec alliés |
| Composition | 0.15 | Pénalités : full AD/AP, pas de tank, pas de CC/engage |
| Maîtrise | 0.15 | Tier utilisateur (S=100, A=85, B=70, C=55, D=40) |
| Risque draft | 0.15 | Sécurité du blind pick (counters dispo, position de pick) |

Les poids sont ajustables par l'utilisateur.

### Gestion de la meta
- Données **D2+ Ranked Solo** depuis Lolalytics
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
    meta: float = 0.15
    matchup: float = 0.25
    synergy: float = 0.15
    composition: float = 0.15
    mastery: float = 0.15
    draft_risk: float = 0.15
```

---

## 📖 API Endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/champions` | Liste tous les champions |
| GET | `/api/champions?role=mid` | Champions filtrés par rôle |
| GET | `/api/meta/tierlist?role=top` | Tier list D2+ pour un rôle |
| POST | `/api/draft/recommend` | **Recommandations de draft** |
| GET | `/api/user/profile` | Profil utilisateur |
| POST | `/api/user/profile` | Sauvegarder le profil |
| POST | `/api/user/pool` | Mettre à jour le pool d'un rôle |
| GET | `/api/patch` | Info patch actuel |

### Corps de la requête draft/recommend

```json
{
  "draft_state": {
    "my_team": "blue",
    "my_role": "mid",
    "my_pick_order": 3,
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

---

## 🎨 Stack technique

- **Backend** : Python 3.10+, FastAPI, httpx, Pydantic
- **Frontend** : React 18, Vite, TailwindCSS, Zustand, Lucide icons
- **Data** : Lolalytics (D2+ stats), Riot Data Dragon (champion data, images)
- **Cache** : Fichier JSON local avec TTL

---

## 📝 Licence

Projet personnel — usage non commercial.  
Riot Games et League of Legends sont des marques déposées de Riot Games, Inc.
