# DALIA — Lancer l'app avec Podman (WSL)

> Podman tourne dans **WSL Ubuntu**. Toutes les commandes ci-dessous s'exécutent dans un terminal WSL.
> Pour ouvrir WSL : `Win + R` → `wsl` → Entrée, ou utiliser le terminal Windows Terminal avec le profil Ubuntu.

---

## Prérequis

- WSL Ubuntu avec Podman 4.9.3+ et podman-compose installés (déjà en place)
- Connexion internet (le premier build télécharge PyTorch ~500 Mo)

---

## 1. Premier lancement (build + démarrage)

```bash
cd /mnt/c/Users/Ordi/Desktop/TRAVAIL/PROJETPERSO/DALIA-RELOADED

# Build toutes les images (long la première fois à cause de PyTorch)
podman-compose build

# Démarrer tous les services en arrière-plan
podman-compose up -d
```

> Le premier `build` prend **5–15 minutes** (PyTorch CPU ~500 Mo + npm install).
> Les builds suivants utilisent le cache et prennent moins de 30 secondes.

---

## 2. Lancement rapide (après le premier build)

```bash
cd /mnt/c/Users/Ordi/Desktop/TRAVAIL/PROJETPERSO/DALIA-RELOADED
podman-compose up -d
```

---

## 3. Accéder à l'app

| Service    | URL                        | Description                  |
|------------|----------------------------|------------------------------|
| Frontend   | http://localhost:1420       | Interface React (navigateur) |
| Backend    | http://localhost:8000       | API FastAPI                  |
| API Docs   | http://localhost:8000/docs  | Swagger UI auto-généré       |
| Healthcheck| http://localhost:8000/health| Status du serveur            |

> Ouvre **http://localhost:1420** dans ton navigateur Windows pour utiliser l'app.

---

## 4. Voir les logs

```bash
# Tous les services en temps réel
podman-compose logs -f

# Un seul service
podman-compose logs -f backend
podman-compose logs -f frontend
podman-compose logs -f db
```

---

## 5. Arrêter les services

```bash
# Arrêter sans supprimer les données
podman-compose stop

# Arrêter ET supprimer les containers (les données DB restent dans le volume)
podman-compose down
```

---

## 6. Après avoir modifié du code

### Code backend (Python — hot reload automatique)
Le backend a `reload=True` (uvicorn). Les changements dans `server/` sont pris en compte **automatiquement** grâce au volume monté.

### Code frontend (React/Vite — hot reload automatique)
Le frontend Vite surveille les fichiers. Les changements dans `client/src/` sont rechargés **automatiquement** dans le navigateur.

### Changements de dépendances (requirements.txt / package.json)
```bash
# Rebuilder uniquement le service concerné
podman-compose build backend    # ou frontend
podman-compose up -d backend    # ou frontend
```

---

## 7. Remettre à zéro complètement (base de données incluse)

```bash
podman-compose down -v          # Supprime containers ET volumes (données DB effacées)
podman-compose up -d --build    # Repart de zéro
```

---

## 8. Commandes utiles

```bash
# Status des containers
podman-compose ps

# Entrer dans le container backend (shell interactif)
podman exec -it dalia-backend bash

# Entrer dans la base de données PostgreSQL
podman exec -it dalia-postgres psql -U dalia -d dalia

# Voir l'espace disque utilisé par les images
podman images

# Nettoyer les images inutilisées
podman image prune -a
```

---

## 9. Architecture des services

```
┌──────────────────────────────────────────────────┐
│  Navigateur Windows → http://localhost:1420       │
│                                                   │
│  ┌─────────────┐     ┌──────────────────────┐    │
│  │   Frontend  │────▶│      Backend         │    │
│  │ Vite/React  │     │ FastAPI :8000         │    │
│  │    :1420    │     │ (hot reload actif)   │    │
│  └─────────────┘     └──────────┬───────────┘    │
│                                  │                │
│                      ┌──────────▼───────────┐    │
│                      │   PostgreSQL :5432    │    │
│                      │  (données persistées) │    │
│                      └──────────────────────┘    │
└──────────────────────────────────────────────────┘
```

---

## 10. Dépannage

### Le frontend ne charge pas
```bash
podman-compose logs frontend
# Si "strictPort: true" bloque → vérifier que le port 1420 est libre
```

### Le backend ne démarre pas (DB non prête)
```bash
podman-compose logs db
podman-compose restart backend
```

### Erreur de permissions sur les fichiers montés
```bash
# Si podman ne peut pas lire /mnt/c/...
# Relancer WSL en tant qu'utilisateur normal (pas root)
exit  # sortir du shell root si besoin
wsl
```

### Voir pourquoi un service crashe
```bash
podman-compose logs --tail=50 backend
```
