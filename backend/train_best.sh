#!/bin/bash
# Train multiple models with different hyperparameters and keep the best one.
# Usage: cd backend && bash train_best.sh

set -e
cd "$(dirname "$0")"
source venv/bin/activate

DATA="app/data/matches/matches.jsonl"
MODELS_DIR="app/data/models"
BEST_DIR="${MODELS_DIR}"
TMP_DIR="${MODELS_DIR}/runs"
mkdir -p "$TMP_DIR"

echo "============================================="
echo "  DALIA Multi-Train — Finding best model"
echo "  Data: $(wc -l < $DATA) matches"
echo "============================================="
echo ""

BEST_ACC=0
BEST_RUN=""

# ── Run 1: Baseline (original config) ──
echo ">>> Run 1/3: embed=32, hidden=256, lr=0.001, epochs=80"
python -m app.ml.train \
  --data "$DATA" \
  --embed-dim 32 --hidden-dim 256 \
  --lr 0.001 --epochs 80 --batch-size 256 \
  --output "${TMP_DIR}/run1"

ACC1=$(python3 -c "import json; d=json.load(open('${TMP_DIR}/run1/training_stats.json')); print(d['best_val_accuracy'])")
echo ">>> Run 1 best val accuracy: $ACC1"
echo ""

# ── Run 2: Bigger model ──
echo ">>> Run 2/3: embed=48, hidden=384, lr=0.0008, epochs=80"
python -m app.ml.train \
  --data "$DATA" \
  --embed-dim 48 --hidden-dim 384 \
  --lr 0.0008 --epochs 80 --batch-size 256 \
  --output "${TMP_DIR}/run2"

ACC2=$(python3 -c "import json; d=json.load(open('${TMP_DIR}/run2/training_stats.json')); print(d['best_val_accuracy'])")
echo ">>> Run 2 best val accuracy: $ACC2"
echo ""

# ── Run 3: Smaller LR, longer training ──
echo ">>> Run 3/3: embed=32, hidden=256, lr=0.0005, epochs=120"
python -m app.ml.train \
  --data "$DATA" \
  --embed-dim 32 --hidden-dim 256 \
  --lr 0.0005 --epochs 120 --batch-size 128 \
  --output "${TMP_DIR}/run3"

ACC3=$(python3 -c "import json; d=json.load(open('${TMP_DIR}/run3/training_stats.json')); print(d['best_val_accuracy'])")
echo ">>> Run 3 best val accuracy: $ACC3"
echo ""

# ── Pick best ──
echo "============================================="
echo "  Results:"
echo "  Run 1 (32/256/0.001):   $ACC1"
echo "  Run 2 (48/384/0.0008):  $ACC2"
echo "  Run 3 (32/256/0.0005):  $ACC3"

BEST_RUN=$(python3 -c "
accs = [($ACC1, 'run1'), ($ACC2, 'run2'), ($ACC3, 'run3')]
best = max(accs, key=lambda x: x[0])
print(best[1])
")
BEST_ACC_FINAL=$(python3 -c "
accs = [$ACC1, $ACC2, $ACC3]
print(max(accs))
")

echo "  BEST: $BEST_RUN ($BEST_ACC_FINAL)"
echo "============================================="

# Copy best model to production location
cp "${TMP_DIR}/${BEST_RUN}/draft_model.pt" "${BEST_DIR}/draft_model.pt"
cp "${TMP_DIR}/${BEST_RUN}/training_stats.json" "${BEST_DIR}/training_stats.json"

echo ""
echo "Best model copied to ${BEST_DIR}/draft_model.pt"
echo "Restart the backend to use the new model."
