#!/bin/bash
# Quick training script — skip scraping, use existing data
set -e
cd "$(dirname "$0")"

if [[ -f venv/bin/activate ]]; then
    source venv/bin/activate
fi

export PYTHONUNBUFFERED=1
LOG="/tmp/dalia_train.log"
DATA="app/data/matches/matches.jsonl"
MODELS="app/data/models"
TMP="${MODELS}/runs"
mkdir -p "$TMP"

TOTAL=$(wc -l < "$DATA")
echo "=============================================" | tee "$LOG"
echo "  DALIA Training — $(date)"                    | tee -a "$LOG"
echo "  Data: $TOTAL matches"                        | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"

# Run 1
echo "" | tee -a "$LOG"
echo ">>> Run 1/3: embed=48, hidden=384, lr=0.0008, epochs=150" | tee -a "$LOG"
python3 -m app.ml.train \
    --data "$DATA" \
    --embed-dim 48 --hidden-dim 384 \
    --lr 0.0008 --epochs 150 --batch-size 256 \
    --output "${TMP}/run1" \
    2>&1 | tee -a "$LOG"

# Run 2
echo "" | tee -a "$LOG"
echo ">>> Run 2/3: embed=64, hidden=512, lr=0.0006, epochs=150" | tee -a "$LOG"
python3 -m app.ml.train \
    --data "$DATA" \
    --embed-dim 64 --hidden-dim 512 \
    --lr 0.0006 --epochs 150 --batch-size 256 \
    --output "${TMP}/run2" \
    2>&1 | tee -a "$LOG"

# Run 3
echo "" | tee -a "$LOG"
echo ">>> Run 3/3: embed=48, hidden=384, lr=0.0004, epochs=200, batch=128" | tee -a "$LOG"
python3 -m app.ml.train \
    --data "$DATA" \
    --embed-dim 48 --hidden-dim 384 \
    --lr 0.0004 --epochs 200 --batch-size 128 \
    --output "${TMP}/run3" \
    2>&1 | tee -a "$LOG"

# Select best model
echo "" | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
echo ">>> Comparaison des résultats :" | tee -a "$LOG"

python3 -c "
import json, shutil
TMP = '${TMP}'
MODELS = '${MODELS}'
results = []
for run in ['run1', 'run2', 'run3']:
    path = f'{TMP}/{run}/training_stats.json'
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
    src = f'{TMP}/{best_run}'
    shutil.copy2(f'{src}/draft_model.pt', f'{MODELS}/draft_model.pt')
    shutil.copy2(f'{src}/training_stats.json', f'{MODELS}/training_stats.json')
    print(f'  Modèle copié → {MODELS}/draft_model.pt')
else:
    print('  ERREUR: aucun modèle entraîné avec succès')
" 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
echo "  DALIA Training TERMINÉ — $(date)"            | tee -a "$LOG"
echo "  Log complet : $LOG"                           | tee -a "$LOG"
echo "=============================================" | tee -a "$LOG"
