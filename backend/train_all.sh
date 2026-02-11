#!/bin/bash
# Run 3 training runs and pick the best — designed to run in background
set -e
cd /mnt/c/Users/Ordi/Desktop/TRAVAIL/PROJETPERSO/DALIA-RELOADED/backend
source venv/bin/activate
export PYTHONUNBUFFERED=1

DATA="app/data/matches/matches.jsonl"
LOG="/tmp/train_all.log"

echo "$(date): Starting multi-train on $(wc -l < $DATA) matches" > "$LOG"

echo "$(date): === RUN 1/3: embed=32 hidden=256 lr=0.001 ===" >> "$LOG"
python3 -m app.ml.train --data "$DATA" --embed-dim 32 --hidden-dim 256 --lr 0.001 --epochs 80 --batch-size 256 --output app/data/models/runs/run1 >> "$LOG" 2>&1

echo "$(date): === RUN 2/3: embed=48 hidden=384 lr=0.0008 ===" >> "$LOG"
python3 -m app.ml.train --data "$DATA" --embed-dim 48 --hidden-dim 384 --lr 0.0008 --epochs 80 --batch-size 256 --output app/data/models/runs/run2 >> "$LOG" 2>&1

echo "$(date): === RUN 3/3: embed=32 hidden=256 lr=0.0005 batch=128 ===" >> "$LOG"
python3 -m app.ml.train --data "$DATA" --embed-dim 32 --hidden-dim 256 --lr 0.0005 --epochs 120 --batch-size 128 --output app/data/models/runs/run3 >> "$LOG" 2>&1

# Pick best and copy
echo "$(date): === Comparing results ===" >> "$LOG"
python3 -c "
import json, shutil
results = []
for run in ['run1', 'run2', 'run3']:
    path = f'app/data/models/runs/{run}/training_stats.json'
    try:
        s = json.load(open(path))
        acc = s['best_val_accuracy']
        results.append((acc, run))
        print(f'{run}: val_acc={acc:.4f} (epoch {s[\"best_epoch\"]})')
    except:
        print(f'{run}: FAILED')
if results:
    best_acc, best_run = max(results)
    print(f'BEST: {best_run} ({best_acc:.4f})')
    src = f'app/data/models/runs/{best_run}'
    shutil.copy2(f'{src}/draft_model.pt', 'app/data/models/draft_model.pt')
    shutil.copy2(f'{src}/training_stats.json', 'app/data/models/training_stats.json')
    print('Model copied to app/data/models/draft_model.pt')
" >> "$LOG" 2>&1

echo "$(date): DONE" >> "$LOG"
