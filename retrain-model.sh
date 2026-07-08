#!/usr/bin/env bash
# ============================================================
#  GazeConnect Pro - Retrain the tiny word model (macOS / Linux)
# ============================================================
#  macOS twin of retrain-model.bat. Blends a small slice of REAL everyday
#  English (Tatoeba) with the curated AAC corpus, retrains the tiny CIFG-LSTM,
#  and drops the new int8 model in as gazeconnect_lm_quantized.onnx.
#
#  On Apple Silicon it trains on the GPU (Metal/MPS) via --device auto, which is
#  noticeably faster than CPU. The SHIPPED model stays ~2-3 MB and runs on plain
#  onnxruntime (no torch at run time). Only this machine grows, temporarily.
#
#  SAFETY: uses the project's own venv (python/.venv); backs up the current
#  model first (reversible); auto-removes the one-time build tools (torch + onnx)
#  at the end. Never touches system files.
#
#  Run:  chmod +x retrain-model.sh   (once)
#        ./retrain-model.sh
# ============================================================
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Keep pip activity inside repo for predictable, auditable behavior.
export PYTHONNOUSERSITE=1
export PIP_NO_CACHE_DIR=1
export PIP_DISABLE_PIP_VERSION_CHECK=1

# ---- Tunables (edit for a bigger corpus / longer training) ----
EPOCHS=20
MAXSENT=45000
MINFREQ=2

# Let unsupported MPS ops fall back to CPU instead of erroring (Apple Silicon).
export PYTORCH_ENABLE_MPS_FALLBACK=1

echo
echo "============================================================"
echo "  GazeConnect Pro - Retrain word model (real-corpus upgrade)"
echo "============================================================"
echo

# ---- Locate / create the venv ----
VENV="python/.venv"
PY="$VENV/bin/python"
if [ ! -x "$PY" ]; then
  echo "[INFO] No venv found - creating one at $VENV (training-only)."
  PYBASE="$(command -v python3 || command -v python || true)"
  if [ -z "$PYBASE" ]; then
    echo "  [ABORT] Python 3 not found. Install it (brew install python) and retry."
    exit 1
  fi
  "$PYBASE" -m venv "$VENV" || { echo "  [ABORT] Could not create venv."; exit 1; }
fi

# ---- Show disk headroom + the deal ----
echo "[INFO] Free disk space here:"
df -h . | awk 'NR==1 || NR==2 {print "        "$0}'
echo
echo "  This will, into the project only:"
echo "    - download a small real-English corpus  (~30-40 MB, filtered to a few MB)"
echo "    - install build tools torch + onnx       (~1-2 GB, ONE-TIME - auto-removed)"
echo "    - retrain + int8-quantize the model      (final model ~2-3 MB, KEPT)"
echo "  Net permanent change: about +1-2 MB. Training uses the GPU on Apple Silicon."
echo "  Your current model is backed up first."
echo
read -r -p "Proceed? [Y/N] " GO
case "$GO" in
  [Yy]*) ;;
  *) echo "  Cancelled. Nothing changed."; exit 0 ;;
esac
echo

MODELDIR="python/ml/trained_models"
BACKUP="$MODELDIR/backup_pre_retrain"
BUILD_TOOLS_INSTALLED=0

restore_backup() {
  for f in gazeconnect_lm_quantized.onnx gazeconnect_lm.onnx vocabulary.json training_log.json; do
    [ -f "$BACKUP/$f" ] && cp -f "$BACKUP/$f" "$MODELDIR/$f"
  done
}

cleanup_build_tools() {
  if [ "$BUILD_TOOLS_INSTALLED" -eq 1 ]; then
    "$PY" -m pip uninstall -y torch onnx >/dev/null 2>&1 || true
    BUILD_TOOLS_INSTALLED=0
  fi
}
trap cleanup_build_tools EXIT

# ---- Step 1: real English corpus ----
echo "============================================================"
echo "[1/6] Fetching a small REAL English corpus (Tatoeba)..."
echo "============================================================"
( cd python && "../$PY" -m ml.training_data.fetch_external_corpus --max "$MAXSENT" )
if [ $? -ne 0 ]; then
  echo "  [ABORT] Corpus fetch failed - nothing changed."
  echo "          If the network is blocked, download the Tatoeba English export"
  echo "          and run (from the python folder):"
  echo "            ../$PY -m ml.training_data.fetch_external_corpus --input <file.tsv.bz2>"
  exit 1
fi
echo "  [OK] external_corpus.txt ready."
echo

# ---- Step 2: back up current model ----
echo "============================================================"
echo "[2/6] Backing up the current model (reversible)..."
echo "============================================================"
mkdir -p "$BACKUP"
for f in gazeconnect_lm_quantized.onnx gazeconnect_lm.onnx vocabulary.json training_log.json; do
  [ -f "$MODELDIR/$f" ] && cp -f "$MODELDIR/$f" "$BACKUP/$f"
done
echo "  [OK] Backed up to $BACKUP"
echo

# ---- Step 3: build tools (torch + onnx) + runtime essentials ----
echo "============================================================"
echo "[3/6] Installing build tools (torch + onnx) ..."
echo "============================================================"
# Runtime essentials the retrained model needs at run time (kept, idempotent).
"$PY" -m pip install --quiet --upgrade pip >/dev/null 2>&1
"$PY" -m pip install --quiet numpy onnxruntime || { echo "  [ABORT] Could not install numpy/onnxruntime."; exit 1; }
# One-time build tools (removed at the end). On macOS the default PyPI torch
# wheel already supports Apple-Silicon MPS - do NOT use the CPU-only index.
if ! "$PY" -c "import torch" >/dev/null 2>&1; then
  BUILD_TOOLS_INSTALLED=1
  "$PY" -m pip install --quiet torch || { echo "  [ABORT] Could not install torch. Backup is safe in $BACKUP."; exit 1; }
else
  echo "  [OK] torch already present."
fi
if ! "$PY" -c "import onnx" >/dev/null 2>&1; then
  BUILD_TOOLS_INSTALLED=1
  "$PY" -m pip install --quiet onnx || { echo "  [ABORT] Could not install onnx."; exit 1; }
fi
echo "  [OK] Build tools ready."
echo

# ---- Step 4: retrain + quantize ----
echo "============================================================"
echo "[4/6] Retraining + int8 quantizing (the long part)..."
echo "============================================================"
( cd python && "../$PY" -m ml.train --epochs "$EPOCHS" --min-freq "$MINFREQ" --device auto )
if [ $? -ne 0 ]; then
  echo "  [FAIL] Training failed. Restoring the backed-up model..."
  restore_backup
  echo "  [OK] Original model restored. Removing build tools..."
  "$PY" -m pip uninstall -y torch onnx >/dev/null 2>&1 || true
  exit 1
fi
echo "  [OK] New model trained + quantized."
echo

# ---- Step 5: verify ----
echo "============================================================"
echo "[5/6] Verifying the new model (size + loads + predicts)..."
echo "============================================================"
( cd python && "../$PY" -m ml.verify_model )
if [ $? -ne 0 ]; then
  echo
  echo "  [WARN] Verification failed. Restoring the backed-up model to be safe..."
  restore_backup
  echo "  [OK] Original model restored. Build tools will still be removed below."
fi
echo

# ---- Step 6: reclaim space ----
echo "============================================================"
echo "[6/6] Reclaiming space (build tools + dev-only artifacts)..."
echo "============================================================"
# Keep one-time build tools clean and predictable after successful run.
cleanup_build_tools
# Dev-only outputs the runtime never loads - keep the folder ship-lean.
rm -f "$MODELDIR/gazeconnect_lm.onnx" "$MODELDIR/gazeconnect_lm.pt" \
      "python/ml/training_data/external_corpus.txt"
echo "  [OK] Removed torch + onnx + dev-only artifacts."
echo "       Kept: onnxruntime + the new quantized model + vocabulary."
echo
echo "============================================================"
echo "  Done."
echo "============================================================"
if [ -f "$MODELDIR/gazeconnect_lm_quantized.onnx" ]; then
  SIZE=$(wc -c < "$MODELDIR/gazeconnect_lm_quantized.onnx" | tr -d ' ')
  echo "  New model: $MODELDIR/gazeconnect_lm_quantized.onnx  ($SIZE bytes)"
fi
echo
echo "  Copy the new model + vocabulary.json back to your Windows project"
echo "  (python/ml/trained_models/) and run build-installer.bat there to ship it."
echo
echo "  To REVERT to the previous model:"
echo "    cp -f \"$BACKUP/\"* \"$MODELDIR/\""
echo
