#!/bin/bash
# ============================================================================
#  DALIA v2 — Script de nuit : scraping EUW+KR + entraînement ML multi-config
#  Usage:  cd server && nohup bash overnight.sh > /tmp/dalia_overnight.log 2>&1 &
#  Suivi:  tail -f /tmp/dalia_overnight.log
# ============================================================================
# NB: pas de set -e — le scraping peut échouer (clé API expirée) mais on veut
# que l'entraînement tourne quand même sur les données existantes
cd "$(dirname "$0")"

# Activate venv
if [[ -f venv/bin/activate ]]; then
    source venv/bin/activate
fi

export PYTHONUNBUFFERED=1
LOG="/tmp/dalia_overnight.log"

echo "=============================================" | tee "$LOG"
echo "  DALIA v2 Overnight — $(date)"                | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"

DATA="app/data/matches/matches.jsonl"
MODELS="app/data/models"
TMP="${MODELS}/runs"
mkdir -p "$TMP"

# ── Étape 1 : Scraping EUW1 (target 100K total — récent) ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 1/5 — Scraping EUW1 (target 100000)..." | tee -a "$LOG"
python -m app.ml.collect_matches \
    --regions euw1 \
    --target 100000 \
    --max-players 8000 \
    2>&1 | tee -a "$LOG" || echo ">>> EUW1 scraping terminé (ou déjà complet)" | tee -a "$LOG"

EUW_COUNT=$(wc -l < app/data/matches/euw1/matches.jsonl 2>/dev/null || echo 0)
echo ">>> EUW1 : $EUW_COUNT matches collectés" | tee -a "$LOG"

# ── Étape 2 : Scraping KR (target 100K total) ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 2/5 — Scraping KR (target 100000)..." | tee -a "$LOG"
python -m app.ml.collect_matches \
    --regions kr \
    --target 100000 \
    --max-players 8000 \
    2>&1 | tee -a "$LOG" || echo ">>> KR scraping terminé (ou déjà complet)" | tee -a "$LOG"

KR_COUNT=$(wc -l < app/data/matches/kr/matches.jsonl 2>/dev/null || echo 0)
echo ">>> KR : $KR_COUNT matches collectés" | tee -a "$LOG"

# ── Étape 3 : Merge régions ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 3/5 — Merge EUW+KR..." | tee -a "$LOG"
python -c "
from pathlib import Path
from app.ml.collect_matches import merge_regions
merge_regions(Path('app/data/matches'), ['euw1', 'kr'])
" 2>&1 | tee -a "$LOG"

TOTAL=$(wc -l < "$DATA" 2>/dev/null || echo 0)
echo ">>> Total merged : $TOTAL matches" | tee -a "$LOG"

# ── Étape 4 : Entraînement multi-config (5 runs, garde la meilleure) ──
echo "" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Étape 4/5 — Entraînement multi-config (5 runs)..." | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"

# Run 1: Config éprouvée — embed=48, hidden=384 (bon rapport taille/perf)
echo "" | tee -a "$LOG"
echo ">>> Run 1/5: embed=48, hidden=384, lr=0.0008, epochs=200, batch=256" | tee -a "$LOG"
python -m app.ml.train \
    --data "$DATA" \
    --embed-dim 48 --hidden-dim 384 \
    --lr 0.0008 --epochs 200 --batch-size 256 \
    --output "${TMP}/run1" \
    2>&1 | tee -a "$LOG"

# Run 2: Plus gros modèle — embed=64, hidden=512
echo "" | tee -a "$LOG"
echo ">>> Run 2/5: embed=64, hidden=512, lr=0.0006, epochs=200, batch=256" | tee -a "$LOG"
python -m app.ml.train \
    --data "$DATA" \
    --embed-dim 64 --hidden-dim 512 \
    --lr 0.0006 --epochs 200 --batch-size 256 \
    --output "${TMP}/run2" \
    2>&1 | tee -a "$LOG"

# Run 3: LR très bas + longue convergence
echo "" | tee -a "$LOG"
echo ">>> Run 3/5: embed=48, hidden=384, lr=0.0004, epochs=300, batch=128" | tee -a "$LOG"
python -m app.ml.train \
    --data "$DATA" \
    --embed-dim 48 --hidden-dim 384 \
    --lr 0.0004 --epochs 300 --batch-size 128 \
    --output "${TMP}/run3" \
    2>&1 | tee -a "$LOG"

# Run 4: Gros modèle + LR bas
echo "" | tee -a "$LOG"
echo ">>> Run 4/5: embed=64, hidden=512, lr=0.0004, epochs=300, batch=128" | tee -a "$LOG"
python -m app.ml.train \
    --data "$DATA" \
    --embed-dim 64 --hidden-dim 512 \
    --lr 0.0004 --epochs 300 --batch-size 128 \
    --output "${TMP}/run4" \
    2>&1 | tee -a "$LOG"

# Run 5: Très gros modèle
echo "" | tee -a "$LOG"
echo ">>> Run 5/5: embed=96, hidden=768, lr=0.0003, epochs=250, batch=128" | tee -a "$LOG"
python -m app.ml.train \
    --data "$DATA" \
    --embed-dim 96 --hidden-dim 768 \
    --lr 0.0003 --epochs 250 --batch-size 128 \
    --output "${TMP}/run5" \
    2>&1 | tee -a "$LOG"

# ── Étape 5 : Sélection du meilleur modèle ──
echo "" | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
echo ">>> [$(date +%H:%M)] Comparaison des résultats :" | tee -a "$LOG"

python -c "
import json, shutil, os

RUNS_DIR = 'app/data/models/runs'
MODELS_DIR = 'app/data/models'

results = []
for run in ['run1', 'run2', 'run3', 'run4', 'run5']:
    path = f'{RUNS_DIR}/{run}/training_stats.json'
    try:
        s = json.load(open(path))
        acc = s['best_val_accuracy']
        ep = s['best_epoch']
        ed = s.get('embed_dim', '?')
        hd = s.get('hidden_dim', '?')
        results.append((acc, run, ep, ed, hd))
        print(f'  {run}: val_acc={acc:.4f} (epoch {ep}) — embed={ed}, hidden={hd}')
    except Exception as e:
        print(f'  {run}: FAILED ({e})')

if results:
    best_acc, best_run, best_ep, best_ed, best_hd = max(results)
    print()
    print(f'  MEILLEUR: {best_run} — {best_acc:.4f} (epoch {best_ep}, embed={best_ed}, hidden={best_hd})')
    src = f'{RUNS_DIR}/{best_run}'
    shutil.copy2(f'{src}/draft_model.pt', f'{MODELS_DIR}/draft_model.pt')
    shutil.copy2(f'{src}/training_stats.json', f'{MODELS_DIR}/training_stats.json')
    print(f'  Modèle copié → {MODELS_DIR}/draft_model.pt')
else:
    print('  ERREUR: aucun modèle entraîné avec succès')
" 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
echo "  DALIA v2 Overnight TERMINÉ — $(date)"       | tee -a "$LOG"
echo "  Log complet : $LOG"                           | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
