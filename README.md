# DALIA — Draft Analysis League Intelligence Assistant

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwindcss&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-2.x-EE4C2C?logo=pytorch&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

> Outil d'optimisation de draft League of Legends — **Master+**.  
> Analyse **meta, matchups, synergies, composition d'équipe, maîtrise personnelle** et **prédiction IA** pour recommander le pick optimal à chaque phase du draft.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| **🔗 Connexion LCU** | Détection automatique du client LoL — picks et bans synchronisés en temps réel |
| **Pool de champions** | Champions par rôle avec tier list personnalisée (S / A / B / C / D) |
| **Analyse Meta** | Stats **Master+** blendées : moyenne pondérée patch actuel + 30 derniers jours, au prorata du nombre de games |
| **Matchups** | WR vs chaque ennemi révélé (lane opponent ×3 poids + cross-lane), données 30 jours |
| **Synergies** | WR avec chaque allié déjà pick (données Lolalytics 30 jours) |
| **Composition** | Vérification AD/AP, tank, CC, engage, DPS, utility — alertes automatiques |
| **Prédiction IA** | DraftNet (PyTorch) entraîné sur 50K+ matches Master+. Champion embeddings + interactions cross-role. Score calibré avec *temperature scaling*. |
| **Risque de draft** | Pénalité si blind pick avec gros counters open ; bonus si last pick |
| **Suggestions off-meta** | Jusqu'à 2 champions hors du pool si exceptionnellement adaptés (filtre sample-size strict : ≥5 000 games) |
| **Tags intelligents** | `safe-blind`, `counter-pick`, `last-pick-counter`, `meta-forte`, `flex`, `low-data` |
| **Filtre sample-size** | Champions avec peu de games (< 5K) pénalisés automatiquement ; exclus des wildcards |

---

## 🖥️ Installation

### Option 1 — Exécutable Windows (recommandé)

1. Télécharger `DALIA.zip` depuis la [page Releases](../../releases)
2. Extraire le ZIP
3. Lancer `DALIA.exe` → le backend démarre sur `http://localhost:8000`
4. Ouvrir le frontend séparément (voir ci-dessous) ou accéder à l'API directement

### Option 2 — Depuis les sources

#### Prérequis
- **Python 3.11+**
- **Node.js 18+**

#### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

Le serveur démarre sur `http://localhost:8000`.  
Docs API : `http://localhost:8000/docs`

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Le frontend démarre sur `http://localhost:5173`.  
Le proxy Vite redirige `/api/*` vers le backend.

---

## 🔗 Connexion au Client LoL (LCU)

DALIA se connecte automatiquement au client LoL via la **LCU API** — la même méthode utilisée par Blitz, Porofessor, U.GG.

### Fonctionnement

1. **Détection automatique** : cherche le `lockfile` dans le répertoire LoL
2. **Authentification** : token local pour l'API HTTPS locale
3. **Polling** : interroge `/lol-champ-select/v1/session` toutes les 1.5s
4. **Synchronisation** : met à jour le draft board avec les picks/bans en temps réel

### Utilisation

1. Lance LoL et connecte-toi
2. Lance DALIA (backend + frontend)
3. Entre en champ select — DALIA détecte automatiquement
4. Statut en haut à droite :
   - 🟢 **Champ Select** : synchronisation active
   - 🔵 **Menu** : client détecté mais pas en draft
   - 🔴 **Déconnecté** : client non trouvé
5. Active **Auto-sync ON** pour remplir les slots automatiquement
6. Clique **Analyser le draft** pour obtenir les recommandations

---

## 📊 Algorithme de scoring

Pour chaque champion candidat :

```
Score = Σ (poids_i × sous_score_i)  +  bonus/pénalités multiplicatives
```

### Poids des sous-scores

| Sous-score | Poids | Description |
|---|---|---|
| **Matchup** | **0.35** | Δ WR vs ennemis révélés (lane ×3 poids) — le plus important |
| **Maîtrise** | **0.25** | Tier utilisateur (S=90, A=72, B=55, C=38, D=10) — impact énorme |
| **Composition** | **0.15** | Pénalités : full AD/AP, pas de tank, pas de CC/engage |
| **Meta** | **0.10** | WR/PR/BR blendés (patch actuel + 30j, prorata games) |
| Synergie | 0.05 | Δ WR avec alliés |
| Risque draft | 0.05 | Sécurité du blind pick |
| **Prédiction IA** | **10-25%** | DraftNet — poids **adaptatif** selon la confiance |

### Blending Meta (patch actuel + 30 jours)

Les stats meta (WR, PR, BR) sont une **moyenne pondérée** entre le patch actuel et les 30 derniers jours, au prorata du nombre de games en Master+ :

```
blended_wr = (wr_current × games_current + wr_30d × games_30d) / (games_current + games_30d)
```

- **Début de patch** (peu de games) → les données 30 jours dominent = stats stables
- **Mi-patch** (beaucoup de games) → le patch actuel prend le relais = meta à jour
- Le game count affiché = `max(current, 30d)` pour éviter le double-comptage

### Filtre sample-size

| Games | Effet |
|---|---|
| < 5 000 | Pénalité sévère (×0.35–0.65) + exclusion des wildcards + tag `low-data` |
| 5 000 – 50 000 | Pénalité dégressive (×0.65–1.0) |
| > 50 000 | Confiance totale (×1.0) |

### Composition d'équipe

- **Répartition dégâts** : alerte si >78% AD ou AP (critique) ou >68% (warning)
- **Frontline/Tank** : alerte si aucun champion avec tankiness ≥ 4
- **CC** : alerte si moyenne CC < 2.0
- **Engage** : alerte si aucun engage ≥ 4
- **Carry threat** : alerte si aucun DPS ou burst ≥ 4

### Risque de draft

- **Last pick** → 90/100 (très safe)
- **Lane opponent révélé** → 80/100
- **Blind pick** → pénalité selon worst counter disponible et counters dangereux restants

---

## 🏗️ Architecture

```
DALIA RELOADED/
├── backend/                    # Python / FastAPI
│   ├── app/
│   │   ├── config.py               # Configuration centralisée
│   │   ├── api/routes.py            # Endpoints REST
│   │   ├── models/                  # Pydantic models
│   │   ├── services/
│   │   │   ├── data_fetcher.py      # Lolalytics + Data Dragon
│   │   │   ├── meta_analyzer.py     # Score meta (blended current+30d)
│   │   │   ├── matchup.py           # Analyse matchups (30d)
│   │   │   ├── synergy.py           # Analyse synergies
│   │   │   ├── composition.py       # Analyse composition
│   │   │   ├── draft_engine.py      # Moteur de recommandation
│   │   │   └── lcu_connector.py     # Connexion LCU API
│   │   ├── ml/
│   │   │   ├── model.py             # DraftNet (PyTorch)
│   │   │   ├── predictor.py         # Inférence + temperature scaling
│   │   │   ├── collect_matches.py   # Collecteur Riot API (multi-région)
│   │   │   └── train.py             # Script d'entraînement
│   │   └── data/
│   │       ├── champion_overrides.json  # Classification 120+ champions
│   │       ├── cache/                   # Cache Lolalytics (TTL 6h)
│   │       ├── matches/                 # Données d'entraînement ML
│   │       └── models/                  # Modèles entraînés
│   ├── requirements.txt
│   ├── run.py
│   ├── train_best.sh            # Multi-train : 3 configs, garde meilleure
│   └── dalia.spec               # PyInstaller spec
│
└── frontend/                    # React / Vite / TailwindCSS
    └── src/
        ├── stores/              # Zustand (draft, user, LCU)
        ├── services/api.js      # Client API
        └── components/
            ├── ChampionPool/    # Éditeur de pool (tier list)
            ├── DraftBoard/      # Board de draft + LCU status
            └── Recommendations/ # Recommandations avec scores et tags
```

---

## 🤖 Module IA / Machine Learning

### Architecture DraftNet

Réseau de neurones qui prédit P(victoire blue) à partir de la composition des 10 champions.

| Composant | Description |
|---|---|
| **Champion Embeddings** | Chaque champion → vecteur appris de 48 dimensions |
| **Role Projections** | Projections spécifiques par rôle (même champion ≠ même embedding selon le rôle) |
| **Matchup Interactions** | Produit scalaire entre chaque paire (blue_role_i, red_role_j) → 25 interactions cross-role |
| **MLP** | Concat → 384 → 192 → 96 → 1 (logit) |
| **Temperature Scaling** | T=5.0 pour calibrer la confiance (modèle ~62% accuracy) |

### Pipeline ML

```
1. Collecter    →    2. Entraîner    →    3. Intégration auto
   (Riot API)           (PyTorch)            (DraftEngine)
```

#### Étape 1 — Collecter les matches (Master+)

```bash
cd backend

# EUW uniquement :
python -m app.ml.collect_matches --regions euw1 --target 80000

# EUW + KR (recommandé) :
python -m app.ml.collect_matches --regions euw1 kr --target 80000

# Avec clé dev (plus lent) :
python -m app.ml.collect_matches --regions euw1 --key-type dev --target 20000
```

- Récupère les joueurs **Challenger / GM / Master / D1 / D2**
- Collecte les match IDs ranked des **30 derniers jours**
- **Résumable** : relancer reprend là où on s'est arrêté (checkpoints)
- Merge automatique multi-région → `matches.jsonl`

**Régions** : `euw1`, `kr`, `na1`, `br1`, `eun1`, `jp1`, `la1`, `la2`, `oc1`, `ru`, `tr1`

#### Étape 2 — Entraîner le modèle

```bash
cd backend
python -m app.ml.train --data app/data/matches/matches.jsonl --epochs 120 --embed-dim 48 --hidden-dim 384
```

| Flag | Défaut | Description |
|---|---|---|
| `--epochs` | 60 | Nombre d'epochs |
| `--embed-dim` | 32 | Dimension des embeddings |
| `--hidden-dim` | 256 | Taille du MLP caché |
| `--lr` | 0.001 | Learning rate |
| `--batch-size` | 256 | Taille du batch |

Script multi-train (3 configs, garde la meilleure) :

```bash
cd backend && bash train_best.sh
```

Résultat attendu : **~60-64% validation accuracy**

#### Étape 3 — Utilisation automatique

Le `DraftEngine` charge `draft_model.pt` au démarrage si disponible.

**Influence adaptative** :
- Confiance **haute** (draft complet + champion > 200 games) → ML **25%** du score
- Confiance **moyenne** → ML **18%**
- Confiance **faible** → ML **10%**

Sans modèle, le moteur fonctionne normalement avec les 6 autres sous-scores.

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
| GET | `/api/lcu/status` | État connexion LCU + picks/bans live |
| POST | `/api/lcu/connect` | Connexion manuelle au client LoL |
| POST | `/api/lcu/start-polling` | Démarrer la synchronisation auto |
| POST | `/api/lcu/stop-polling` | Arrêter la synchronisation |

### Exemple — POST `/api/draft/recommend`

```json
{
  "draft_state": {
    "my_team": "blue",
    "my_role": "mid",
    "bans": [238, 91],
    "ally_picks": [{"champion_id": 86, "role": "top"}],
    "enemy_picks": [{"champion_id": 157, "role": "mid"}]
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

## 🔧 Configuration

Éditer `backend/app/config.py` :

```python
class ScoringWeights(BaseModel):
    meta: float = 0.10          # force dans la meta (blended)
    matchup: float = 0.35       # le plus important : WR vs ennemis
    synergy: float = 0.05       # synergie avec alliés
    composition: float = 0.15   # équilibre de la comp
    mastery: float = 0.25       # maîtrise personnelle (tier)
    draft_risk: float = 0.05    # risque de blind pick
```

Paramètres clés :
- `min_games_reliable = 5_000` — seuil pénalité stats
- `min_games_full_confidence = 50_000` — confiance totale au-dessus
- `counter_patch = "30"` — fenêtre 30 jours pour matchups/synergies
- `cache_ttl_hours = 6` — durée du cache local

---

## 🎨 Stack technique

| Couche | Technologies |
|---|---|
| Backend | Python 3.11+, FastAPI, httpx, Pydantic |
| Frontend | React 18, Vite, TailwindCSS, Zustand, Lucide Icons |
| Data | Lolalytics (Master+, blended current+30d), Data Dragon, Riot API |
| ML | PyTorch (DraftNet — embeddings 48-dim, 25 cross-role interactions) |
| Build | PyInstaller (Windows .exe), WSL build script |
| Cache | JSON local avec TTL |

---

## 🏗️ Build (exe Windows)

```bash
# Depuis WSL
cd backend && bash ../build.sh
```

Produit `DALIA.zip` (~136 MB) contenant l'exécutable standalone.

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
