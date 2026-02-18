#!/bin/bash
# ============================================================================
#  DALIA — Script de nuit : scraping EUW+KR + entraînement ML
#  Usage:  cd backend && nohup bash overnight.sh > /tmp/dalia_overnight.log 2>&1 &
#  Suivi:  tail -f /tmp/dalia_overnight.log
# ============================================================================
set -e
cd "$(dirname "$0")"

# Activate venv
if [[ -f venv/bin/activate ]]; then
    source venv/bin/activate
fi

export PYTHONUNBUFFERED=1
LOG="/tmp/dalia_overnight.log"

echo "=============================================" | tee "$LOG"
echo "  DALIA Overnight — $(date)"                    | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"

# ── Étape 1 : Scraping EUW (target 80K total) ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 1/4 — Scraping EUW1 (target 80000)..." | tee -a "$LOG"
python3 -m app.ml.collect_matches \
    --regions euw1 \
    --target 80000 \
    --max-players 6000 \
    2>&1 | tee -a "$LOG"

EUW_COUNT=$(wc -l < app/data/matches/euw1/matches.jsonl 2>/dev/null || echo 0)
echo ">>> EUW1 : $EUW_COUNT matches collectés" | tee -a "$LOG"

# ── Étape 2 : Scraping KR (target 80K total) ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 2/4 — Scraping KR (target 80000)..." | tee -a "$LOG"
python3 -m app.ml.collect_matches \
    --regions kr \
    --target 80000 \
    --max-players 6000 \
    2>&1 | tee -a "$LOG"

KR_COUNT=$(wc -l < app/data/matches/kr/matches.jsonl 2>/dev/null || echo 0)
echo ">>> KR : $KR_COUNT matches collectés" | tee -a "$LOG"

# ── Étape 3 : Merge régions ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 3/4 — Merge EUW+KR..." | tee -a "$LOG"
python3 -c "
from pathlib import Path
from app.ml.collect_matches import merge_regions
merge_regions(Path('app/data/matches'), ['euw1', 'kr'])
" 2>&1 | tee -a "$LOG"

TOTAL=$(wc -l < app/data/matches/matches.jsonl 2>/dev/null || echo 0)
echo ">>> Total merged : $TOTAL matches" | tee -a "$LOG"

# ── Étape 4 : Entraînement (3 configs, garde la meilleure) ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 4/4 — Entraînement multi-config..." | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"

DATA="app/data/matches/matches.jsonl"
MODELS="app/data/models"
TMP="${MODELS}/runs"
mkdir -p "$TMP"

# Run 1: Config actuelle éprouvée (embed=48, hidden=384) — plus d'epochs
echo "" | tee -a "$LOG"
echo ">>> Run 1/3: embed=48, hidden=384, lr=0.0008, epochs=150" | tee -a "$LOG"
python3 -m app.ml.train \
    --data "$DATA" \
    --embed-dim 48 --hidden-dim 384 \
    --lr 0.0008 --epochs 150 --batch-size 256 \
    --output "${TMP}/run1" \
    2>&1 | tee -a "$LOG"

# Run 2: Plus gros modèle
echo "" | tee -a "$LOG"
echo ">>> Run 2/3: embed=64, hidden=512, lr=0.0006, epochs=150" | tee -a "$LOG"
python3 -m app.ml.train \
    --data "$DATA" \
    --embed-dim 64 --hidden-dim 512 \
    --lr 0.0006 --epochs 150 --batch-size 256 \
    --output "${TMP}/run2" \
    2>&1 | tee -a "$LOG"

# Run 3: LR plus bas + batch plus petit (convergence plus fine)
echo "" | tee -a "$LOG"
echo ">>> Run 3/3: embed=48, hidden=384, lr=0.0004, epochs=200, batch=128" | tee -a "$LOG"
python3 -m app.ml.train \
    --data "$DATA" \
    --embed-dim 48 --hidden-dim 384 \
    --lr 0.0004 --epochs 200 --batch-size 128 \
    --output "${TMP}/run3" \
    2>&1 | tee -a "$LOG"

# ── Sélection du meilleur modèle ──
echo "" | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
echo ">>> Comparaison des résultats :" | tee -a "$LOG"

python3 -c "
import json, shutil, os
results = []
for run in ['run1', 'run2', 'run3']:
    path = f'${TMP}/{run}/training_stats.json'
    try:
        s = json.load(open(path))
        acc = s['best_val_accuracy']
        ep = s['best_epoch']
        results.append((acc, run, ep))
        print(f'  {run}: val_acc={acc:.4f} (best epoch {ep})')
    except Exception as e:
        print(f'  {run}: FAILED ({e})')
if results:
    best_acc, best_run, best_ep = max(results)
    print(f'')
    print(f'  MEILLEUR: {best_run} — {best_acc:.4f} (epoch {best_ep})')
    src = f'${TMP}/{best_run}'
    shutil.copy2(f'{src}/draft_model.pt', '${MODELS}/draft_model.pt')
    shutil.copy2(f'{src}/training_stats.json', '${MODELS}/training_stats.json')
    print(f'  Modèle copié → ${MODELS}/draft_model.pt')
else:
    print('  ERREUR: aucun modèle entraîné avec succès')
" 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
echo "  DALIA Overnight TERMINÉ — $(date)"           | tee -a "$LOG"
echo "  Log complet : $LOG"                           | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
