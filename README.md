# DALIA 2.1 — assistant de draft League of Legends

DALIA compare les champions de ton pool avec la draft visible : matchups, composition, maîtrise et interactions de compétences. Le client Windows React/Tauri lit la sélection des champions via LCU ; le serveur FastAPI conserve les comptes, pools et replays dans PostgreSQL.

Fonctionnalités accessibles : draft automatique ou manuelle, modification des picks/bans, annulation, comparaison de deux champions, diagnostic du pool, replays étape par étape et variantes, historique/résultats, duo et préférences de scoring.

Le score d'adéquation n'est pas une probabilité de victoire. Les probabilités et le WPA estimé DALIA restent indisponibles sans modèle validé et contexte suffisant. Aucune donnée Coachless n'est actuellement connectée. Voir [la méthode WPA et les interactions](docs/WPA_ET_MECANIQUES.md) et [le bilan des correctifs](REPRISE_PROJET.md).

## Démarrage local Windows

Prérequis : Python 3.11, Node 24 LTS, PostgreSQL 16 (ou Docker Desktop pour la base). Pour l'application native : Rust stable, Visual Studio Build Tools avec développement C++ et Windows SDK, WebView2. Le navigateur permet de tester le mode manuel sans Rust ni League.

Depuis la racine, générer la configuration privée :

```powershell
py scripts/setup_local.py
docker compose up -d db
```

Le script crée `.env` et, s'il n'existe pas, `server/.env`. Il préserve les fichiers existants : vérifier alors que le mot de passe PostgreSQL, l'URL de base et le secret JWT correspondent entre les deux fichiers. Modifier une variable ne change pas le mot de passe d'un volume PostgreSQL déjà créé. Les exemples ne sont pas des secrets utilisables en production.

Dans un terminal serveur :

```powershell
cd server
py -3.11 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe run.py
```

`run.py` applique les migrations avant de démarrer. `/health` indique que le processus répond ; `/ready` répond 200 seulement quand la base et le catalogue sont disponibles. Une erreur temporaire d'initialisation est retentée. L'accès Internet à Data Dragon est nécessaire au premier chargement ; les statistiques externes peuvent fonctionner en mode dégradé.

Dans un autre terminal :

```powershell
cd client
npm.cmd ci
npm.cmd run dev
```

Ouvrir `http://localhost:1420`, créer un compte, remplir son pool et choisir le mode Manuel. Le serveur local reçoit les appels via le proxy Vite. Pour League en direct : `npm.cmd run tauri dev` dans un terminal développeur Visual Studio, puis ouvrir la sélection des champions de League sur ce PC.

Une clé `RIOT_API_KEY` est optionnelle pour les statistiques personnelles et la collecte ML. La stocker uniquement côté serveur ; les budgets Riot sont partagés entre processus du même hôte via SQLite dans le cache. Plusieurs serveurs doivent partager un limiteur externe adapté.

## Conteneurs et build Windows

```powershell
docker compose up --build -d
docker compose ps
```

Le Compose de développement expose uniquement les ports locaux 1420, 8000 et 5432. Base, cache, modèles et matchs ont des volumes persistants. Le conteneur serveur installe PyTorch CPU, mais aucun modèle ni corpus de matchs réel n'est livré.

Pour produire le client : `./scripts/build-client.ps1` depuis un terminal développeur Visual Studio. Le script installe le lockfile, exécute les tests et construit Tauri. Vérifier `VITE_API_URL` dans `client/.env.production.local` et l'origine correspondante dans la CSP de `client/src-tauri/tauri.conf.json` avant diffusion. La configuration versionnée conserve l'adresse historique du serveur ; elle ne garantit pas sa disponibilité.

## Vérifications

```powershell
cd server
.venv/Scripts/python.exe -m pip install -r requirements-ml.txt
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
.venv/Scripts/python.exe -m pytest tests/unit -q
.venv/Scripts/python.exe -m pip_audit -r requirements.txt
```

Les tests d'intégration nécessitent une **base PostgreSQL dédiée aux tests**. Configurer `TEST_DATABASE_URL` avec un nom contenant `test`, appliquer `alembic upgrade head` sur cette base via `DATABASE_URL`, puis lancer `pytest tests/integration -q`. Ils créent des données de test ; ne jamais leur fournir la base des utilisateurs.

```powershell
cd client
npm.cmd test -- --run
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit
cd src-tauri
cargo test --locked
cargo audit
```

Les tests navigateur simulent les réponses API et les images. Les tests Rust utilisent un snapshot LCU, sans partie réelle. Le workflow [checks.yml](.github/workflows/checks.yml) exécute ces vérifications avec PostgreSQL, Node 24 et Windows. Les anciennes suites `server/tests` de calibration/concordance restent des évaluations exploratoires dépendantes de données externes, distinctes des tests déterministes de `tests/unit`.

## Modèle, livraison et récupération

Installer `requirements-ml.txt` avant les autres requirements pour activer les outils ML. La commande `python -m app.ml.train --patch 16.17` construit un candidat à partir de `server/app/data/matches/matches.jsonl`. Elle conserve le modèle actif. Les matchs doivent contenir leurs identifiants, dates et patchs réels ; voir la méthode dans `docs/WPA_ET_MECANIQUES.md`.

L'activation via le watcher vérifie les résultats, le chargement et le patch ; le modèle précédent est conservé dans `draft_model.previous.pt`. Le réentraînement automatique est désactivé par défaut (`AUTO_TRAIN=0`) et exige un nouveau corpus du patch. Les endpoints ML d'administration restent protégés.

Pour une instance partagée : secret JWT nouvellement généré, mot de passe PostgreSQL propre à l'instance, `ENV=production`, HTTPS et `CORS_ORIGINS` limités aux clients autorisés. Tout secret issu de l'ancien Compose doit être remplacé sur l'instance : retirer sa valeur du dernier commit ne le retire pas de l'historique Git. Le limiteur applicatif utilise l'IP de connexion : derrière un reverse proxy (Railway, Tailscale Funnel, nginx), définir `FORWARDED_ALLOW_IPS` avec les adresses du proxy (`*` si l'application n'est pas joignable directement) pour que `X-Forwarded-For` soit pris en compte ; sinon tous les utilisateurs partagent les quotas de l'adresse du proxy. Railway est détecté automatiquement.

`scripts/auto-update.sh` annonce les mises à jour par défaut. En mode explicite `DALIA_AUTO_DEPLOY=1`, il exige un arbre propre, teste un checkout isolé, demande un script de sauvegarde avant migration, applique un fast-forward et contrôle `/ready`. Un échec remet le code précédent et ses dépendances. Les migrations ne sont pas annulées automatiquement : elles doivent rester compatibles avec le code précédent. La première livraison de cette reprise doit être préparée manuellement avec sauvegarde et nouvelles variables.

Sauvegarder PostgreSQL avec `pg_dump -Fc -f dalia.dump` en fournissant la connexion dans un environnement privé ; conserver aussi les répertoires/volumes modèles et matchs. Tester la restauration avec `pg_restore --exit-on-error --dbname=<base_de_restauration_vide> dalia.dump`, puis vérifier migrations, readiness et un compte de test. Restaurer un modèle précédent par copie, contrôler son patch et utiliser le reload administrateur. Une sauvegarde non restaurée au moins une fois n'est pas une récupération vérifiée.

Le code est préparé localement ; aucun serveur distant ni secret de production n'a été modifié par cette reprise.
