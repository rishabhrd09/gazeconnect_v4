#!/usr/bin/env bash
# ============================================================
#  GazeConnect Pro - OPTIONAL Local LLM setup (macOS / Linux)
# ============================================================
#  macOS twin of setup-llm.bat. Completely optional, opt-in path to try the
#  heavier general-LLM word/phrase prediction (Track 2). The normal app does NOT
#  need this; without it prediction works exactly as before (n-gram + the tiny
#  CIFG-LSTM). This is NEVER bundled into the installer.
#
#  SAFETY: installs into the project venv (python/.venv) and downloads the model
#  into python/ml/trained_models. Never touches system files. To undo: delete the
#  model folder and pip-uninstall (shown at the end).
#
#  Run:  chmod +x setup-llm.sh   (once)
#        ./setup-llm.sh
# ============================================================
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "============================================================"
echo "  GazeConnect Pro - Optional Local LLM setup (Phase 0)"
echo "============================================================"
echo

VENV="python/.venv"
PY="$VENV/bin/python"
if [ ! -x "$PY" ]; then
  echo "  [ABORT] Python venv not found. Run ./setup.sh FIRST, then this script."
  exit 1
fi

echo "[INFO] Free disk space here:"
df -h . | awk 'NR==2 {print "        "$4" free"}'
echo
echo "  This adds, into the project only:"
echo "    - onnxruntime-genai runtime               (~tens of MB, KEPT)"
echo "    - build tools (torch, transformers, onnx)  (~1-2 GB, ONE-TIME - auto-removed)"
echo "    - ONE small quantized model (SmolLM2-360M) (~250-350 MB, KEPT)"
echo "  Net permanent footprint after cleanup: about 300-400 MB. Peak ~2-3 GB."
echo
read -r -p "Proceed? [Y/N] " GO
case "$GO" in [Yy]*) ;; *) echo "  Cancelled. Nothing installed."; exit 0 ;; esac
echo

# ---- Step 1: inference runtime ----
echo "[1/4] Installing onnxruntime-genai (local inference runtime)..."
if ! "$PY" -c "import onnxruntime_genai" >/dev/null 2>&1; then
  "$PY" -m pip install --quiet onnxruntime-genai psutil || { echo "  [FAIL] Could not install onnxruntime-genai. App is unaffected."; exit 1; }
  echo "  [OK] onnxruntime-genai installed."
else
  echo "  [OK] onnxruntime-genai already present - skipping."
fi
echo

# ---- Step 2: build a model (idempotent) ----
MODEL_ID="HuggingFaceTB/SmolLM2-360M-Instruct"
OUT="python/ml/trained_models/smollm2-360m-onnx"
echo "[2/4] Preparing model: $MODEL_ID"
if [ -f "$OUT/genai_config.json" ]; then
  echo "  [OK] Model already built at $OUT - skipping."
else
  echo "  Installing one-time build tools (torch + transformers + onnx)..."
  "$PY" -m pip install --quiet torch transformers onnx || { echo "  [WARN] Could not install build tools. App still works without the LLM."; exit 1; }
  echo "  Building int4 CPU model (downloads + converts; can take a while)..."
  "$PY" -m onnxruntime_genai.models.builder -m "$MODEL_ID" -o "$OUT" -p int4 -e cpu -c "python/.hf_cache" \
    || { echo "  [WARN] Model build failed. App still works without the LLM."; exit 1; }
  echo "  [OK] Model built at $OUT"
  echo "  Reclaiming space: removing one-time build tools + source cache..."
  "$PY" -m pip uninstall -y torch transformers >/dev/null 2>&1 || true
  rm -rf "python/.hf_cache"
  echo "  [OK] Reclaimed. Kept only: onnxruntime-genai runtime + the int4 model."
fi
echo

# ---- Step 3: benchmark ----
echo "[3/4] Benchmarking on this machine (latency, RAM, quality)..."
( cd python && "../$PY" -m ml.llm_benchmark --models "ml/trained_models/smollm2-360m-onnx" )
echo

# ---- Step 4: report ----
echo "[4/4] Done. To REMOVE the LLM later (fully reversible):"
echo "    rm -rf \"$OUT\""
echo "    $PY -m pip uninstall -y onnxruntime-genai onnx"
echo
echo "  The LLM stays OFF until wired in (Phase 1) behind a default-OFF flag."
echo
