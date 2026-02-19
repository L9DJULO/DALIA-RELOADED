# DALIA — Draft Analysis League Intelligence Assistant

Assistant intelligent de draft pour League of Legends. Analyse les matchups, synergies, compositions et recommande le meilleur champion à jouer.

## Architecture

```
DALIA-RELOADED/
├── server/          # FastAPI backend (Python)
│   ├── app/         # Application principale
│   │   ├── api/     # Routes REST (auth, draft, duo, history)
│   │   ├── auth/    # JWT authentication
│   │   ├── db/      # SQLAlchemy models + PostgreSQL
│   │   ├── ml/      # Machine Learning (PyTorch)
│   │   ├── models/  # Pydantic schemas
│   │   └── services/# Draft engine, matchup, synergy, meta
│   ├── Dockerfile   # Production container
│   └── requirements.txt
│
└── client/          # Tauri v2 desktop app (React + Rust)
    ├── src/         # React frontend
    │   ├── components/  # UI (DraftBoard, Insights, DuoQ, Settings)
    │   ├── stores/      # Zustand state management
    │   └── services/    # API client (axios)
    └── src-tauri/   # Tauri shell (Rust)
```

## Fonctionnalités

- **Draft Board** — Picks alliés par rôle, picks ennemis en ordre de draft (Pick 1-5)
- **Recommandations** — Champion optimal basé sur matchups, synergies, compo, meta et maîtrise
- **DuoQ** — Liaison duo via code, synergie boostée entre partenaires
- **Insights** — Meta snapshot, statistiques perso, prédiction de victoire
- **Bans intelligents** — Suggestions de bans basées sur le contexte du draft
- **LCU Connector** — Détection automatique du client LoL (Tauri)
- **ML** — Modèle de prédiction win/loss entraîné sur les matchs collectés

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
# Dans WSL, depuis client/
npm install
npm run tauri build
```

L'installeur `.exe` / `.msi` sera dans `client/src-tauri/target/release/bundle/`.

Tes amis installent le `.exe`, puis dans **Settings** ils entrent l'URL du serveur (ex: `https://dalia-server-xxx.up.railway.app`).

## Dev local

```bash
# Terminal 1: PostgreSQL
cd server && docker-compose up -d

# Terminal 2: Serveur
cd server && pip install -r requirements.txt && python run.py

# Terminal 3: Client
cd client && npm install && npm run tauri dev
```

## License

MIT
