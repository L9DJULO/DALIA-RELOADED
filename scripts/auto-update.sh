#!/usr/bin/env bash
# Opt-in deployment after isolated validation. No reset --hard.
set -Eeuo pipefail
REPO_DIR="${DALIA_REPO_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${DALIA_BRANCH:-main}"
SERVICE="${DALIA_SERVICE:-dalia-backend.service}"
cd "$REPO_DIR"
exec 9>"$REPO_DIR/.git/dalia-deploy.lock"
flock -n 9 || exit 0
git fetch --quiet origin "$BRANCH"
old=$(git rev-parse HEAD)
candidate=$(git rev-parse "origin/$BRANCH")
[[ "$old" != "$candidate" ]] || exit 0
[[ "${DALIA_AUTO_DEPLOY:-0}" == 1 ]] || { echo "Update available: $candidate. Set DALIA_AUTO_DEPLOY=1 after configuring backup and service."; exit 0; }
[[ -z "$(git status --porcelain)" ]] || { echo "Working tree has local changes; deployment stopped."; exit 1; }
[[ "$(git branch --show-current)" == "$BRANCH" ]] || { echo "Unexpected branch; deployment stopped."; exit 1; }
git merge-base --is-ancestor "$old" "$candidate" || { echo "Not a fast-forward."; exit 1; }
candidate_dir=$(mktemp -d)
trap 'git worktree remove --force "$candidate_dir" >/dev/null 2>&1 || true' EXIT
git worktree add --detach "$candidate_dir" "$candidate"
python3 -m venv "$candidate_dir/server/.venv"
"$candidate_dir/server/.venv/bin/python" -m pip install -q -r "$candidate_dir/server/requirements-ml.txt"
"$candidate_dir/server/.venv/bin/python" -m pip install -q -r "$candidate_dir/server/requirements-dev.txt"
(cd "$candidate_dir/server" && .venv/bin/python -m pytest tests/unit -q)
if [[ -n "$(git diff --name-only "$old" "$candidate" -- server/alembic)" ]]; then
  [[ -n "${DALIA_BACKUP_SCRIPT:-}" && -x "$DALIA_BACKUP_SCRIPT" ]] || { echo "Migration requires an executable DALIA_BACKUP_SCRIPT that saves PostgreSQL."; exit 1; }
  "$DALIA_BACKUP_SCRIPT"
fi
rollback() {
  trap - ERR
  set +e
  echo "Deployment failed. Restoring previous code and dependencies; database migration retained."
  git switch --detach "$old"
  "$REPO_DIR/server/.venv/bin/python" -m pip install -q -r "$REPO_DIR/server/requirements.txt"
  sudo -n systemctl restart "$SERVICE"
  curl --fail --silent --max-time 5 http://127.0.0.1:8000/ready || echo "Recovery needs operator attention."
  exit 1
}
trap rollback ERR
git merge --ff-only "$candidate"
"$REPO_DIR/server/.venv/bin/python" -m pip install -q -r "$REPO_DIR/server/requirements.txt"
(cd "$REPO_DIR/server" && .venv/bin/python -m alembic upgrade head)
sudo -n systemctl restart "$SERVICE"
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:8000/ready >/dev/null; then echo "Deployment ready: $candidate"; exit 0; fi
  sleep 2
done
rollback
