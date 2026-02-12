#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  DALIA — Build distributable Windows .exe from WSL
#
#  Uses Node.js (WSL) for frontend + Windows Python for PyInstaller.
#
#  Usage:  bash build.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/frontend"
BACKEND="$ROOT/backend"
DIST="$BACKEND/dist/DALIA"

# Windows path (for python.exe / cmd.exe)
WIN_BACKEND="$(wslpath -w "$BACKEND")"
WIN_ROOT="$(wslpath -w "$ROOT")"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  DALIA — Build distributable (.exe Windows)"
echo "══════════════════════════════════════════════════════════"
echo ""

# ── Pre-checks ──────────────────────────────────────────────────────────
command -v node       >/dev/null 2>&1 || { echo "[ERREUR] Node.js non trouvé."; exit 1; }
command -v python.exe >/dev/null 2>&1 || { echo "[ERREUR] python.exe (Windows) non trouvé."; exit 1; }

echo "  Node.js    : $(node --version)"
echo "  Python.exe : $(python.exe --version 2>&1)"
echo ""

# ── Step 1: Build frontend ──────────────────────────────────────────────
echo "[1/4] Build du frontend..."
cd "$FRONTEND"
npm install --silent 2>/dev/null
npm run build

if [[ ! -f "$FRONTEND/dist/index.html" ]]; then
  echo "[ERREUR] Le build frontend n'a pas généré dist/index.html"
  exit 1
fi
echo "       ✓ Frontend OK"
echo ""

# ── Step 2: Install Python dependencies (Windows Python) ────────────────
echo "[2/4] Installation des dépendances Python (Windows)..."
cd "$BACKEND"
python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu --quiet 2>/dev/null || true
python.exe -m pip install -r requirements.txt --quiet 2>/dev/null
python.exe -m pip install pyinstaller --quiet 2>/dev/null
echo "       ✓ Dépendances OK"
echo ""

# ── Step 3: PyInstaller (Windows Python → .exe) ─────────────────────────
echo "[3/4] Création de l'exécutable avec PyInstaller..."
echo "       (ça peut prendre quelques minutes)"
echo ""
cd "$BACKEND"
python.exe -m PyInstaller dalia.spec --noconfirm --clean

if [[ ! -d "$DIST" ]]; then
  echo "[ERREUR] PyInstaller a échoué — dossier DALIA introuvable."
  exit 1
fi
echo ""
echo "       ✓ Exécutable créé"
echo ""

# ── Step 4: Finalization — copy extras + zip ────────────────────────────
echo "[4/4] Finalisation..."

# Copy guide
if [[ -f "$ROOT/GUIDE_TESTEUR.txt" ]]; then
  cp "$ROOT/GUIDE_TESTEUR.txt" "$DIST/"
fi

# Create zip
cd "$BACKEND/dist"
rm -f DALIA.zip
zip -r DALIA.zip DALIA/ -q
ZIPSIZE="$(du -sh DALIA.zip | cut -f1)"
echo "       ✓ DALIA.zip créé ($ZIPSIZE)"
echo ""

# ── Done ────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════"
echo "  BUILD TERMINÉ !"
echo ""
echo "  Exécutable : $DIST/DALIA.exe"
echo "  Zip release : $BACKEND/dist/DALIA.zip"
echo ""
echo "  → Upload DALIA.zip dans la release GitHub"
echo "══════════════════════════════════════════════════════════"
echo ""
