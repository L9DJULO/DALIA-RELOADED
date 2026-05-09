#!/usr/bin/env bash
# Polls the git remote and updates the native backend when new commits land.
# Designed to be invoked by a systemd timer every couple of minutes.

set -euo pipefail

REPO_DIR="/home/lneufdjulo/Bureau/DALIA-RELOADED"
SERVER_DIR="$REPO_DIR/server"
VENV_PIP="$SERVER_DIR/.venv/bin/pip"
VENV_ALEMBIC="$SERVER_DIR/.venv/bin/alembic"
BRANCH="main"
LOG_TAG="dalia-auto-update"
RESTART_CMD=(/usr/bin/sudo -n /bin/systemctl restart dalia-backend.service)

log() { logger -t "$LOG_TAG" "$*"; echo "[$(date -Iseconds)] $*"; }

cd "$REPO_DIR"

git fetch --quiet origin "$BRANCH"

LOCAL=$(git rev-parse "$BRANCH")
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
fi

log "New commits detected: $LOCAL -> $REMOTE. Pulling."

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
git reset --hard "origin/$BRANCH"

NEEDS_RESTART=0

if echo "$CHANGED" | grep -q '^server/requirements\.txt$'; then
    log "requirements.txt changed; running pip install."
    "$VENV_PIP" install --quiet -r "$SERVER_DIR/requirements.txt"
    NEEDS_RESTART=1
fi

if echo "$CHANGED" | grep -qE '^server/alembic/versions/'; then
    log "Alembic migrations changed; running alembic upgrade head."
    (cd "$SERVER_DIR" && "$VENV_ALEMBIC" upgrade head)
    NEEDS_RESTART=1
fi

if echo "$CHANGED" | grep -qE '^server/(app/|run\.py|alembic\.ini)'; then
    log "Backend code changed; will restart service."
    NEEDS_RESTART=1
fi

if [ "$NEEDS_RESTART" -eq 1 ]; then
    log "Restarting dalia-backend.service."
    "${RESTART_CMD[@]}"
else
    log "No backend changes; skipping restart."
fi

log "Update complete."
