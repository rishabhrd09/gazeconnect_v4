#!/usr/bin/env bash
# ============================================================
#  GazeConnect Pro - First-time setup (macOS / Linux)
# ============================================================
#  macOS twin of setup.bat. Prepares Node + the Python venv so you can do UI
#  development and, most importantly, TRAIN the word model on this machine.
#
#  NOTE ON EYE TRACKING: the Tobii Eye Tracker 5 + its .NET helper are
#  Windows-only. On a Mac you can develop the UI (mouse-as-gaze) and train the
#  model, but real eye tracking + the shippable installer are done on Windows.
#
#  Prerequisites: Node.js 18+, Python 3.10+.  (Optional: Homebrew for the
#  floor-plan extras - cairo etc. - which are not needed for training.)
#
#  Run:  chmod +x setup.sh   (once)
#        ./setup.sh
# ============================================================
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "============================================================"
echo "  GazeConnect Pro - First-time setup (macOS / Linux)"
echo "============================================================"
echo

# ---- Prerequisites ----
echo "[CHECK] Verifying prerequisites..."
ERRORS=0
if command -v node  >/dev/null 2>&1; then echo "  [OK] Node.js $(node --version)"; else echo "  [FAIL] Node.js not found (https://nodejs.org, v18+)"; ERRORS=$((ERRORS+1)); fi
if command -v npm   >/dev/null 2>&1; then echo "  [OK] npm $(npm --version)"; else echo "  [FAIL] npm not found (ships with Node.js)"; ERRORS=$((ERRORS+1)); fi
PYBASE="$(command -v python3 || command -v python || true)"
if [ -n "$PYBASE" ]; then echo "  [OK] $("$PYBASE" --version 2>&1)"; else echo "  [FAIL] Python 3 not found (brew install python)"; ERRORS=$((ERRORS+1)); fi
echo
if [ "$ERRORS" -gt 0 ]; then echo "[ABORT] $ERRORS critical prerequisite(s) missing."; exit 1; fi

# ---- Step 1: Node packages ----
echo "============================================================"
echo "[1/3] Installing Node.js packages..."
echo "============================================================"
npm install || { echo "  [FAIL] npm install failed."; exit 1; }
echo "  Done."; echo

# ---- Step 2: Python venv + packages ----
echo "============================================================"
echo "[2/3] Setting up Python environment..."
echo "============================================================"
VENV="python/.venv"
PY="$VENV/bin/python"
[ -x "$PY" ] || "$PYBASE" -m venv "$VENV" || { echo "  [FAIL] Could not create venv."; exit 1; }
"$PY" -m pip install --quiet --upgrade pip >/dev/null 2>&1

REQ="requirements.txt"; [ -f "$REQ" ] || REQ="python/requirements.txt"
echo "  Installing backend + floor-plan deps from $REQ ..."
if "$PY" -m pip install --quiet -r "$REQ"; then
  echo "  [OK] All Python deps installed."
else
  echo "  [WARN] Full requirements failed (often 'pycairo' needs system libs on macOS)."
  echo "         Installing the CORE deps needed for the backend + training instead..."
  "$PY" -m pip install --quiet numpy onnxruntime websockets pyttsx3 \
    || { echo "  [FAIL] Could not install core deps."; exit 1; }
  echo "  [OK] Core backend + training deps installed."
  echo "       (Floor-plan tooling is optional; for it: brew install cairo pkg-config, then re-run.)"
fi

# ---- Neural model presence ----
if [ -f "python/ml/trained_models/gazeconnect_lm_quantized.onnx" ]; then
  echo "  [OK] Neural model present (gazeconnect_lm_quantized.onnx)."
else
  echo "  [WARN] Neural model not found. Train it with:  ./retrain-model.sh"
fi
echo "  Done."; echo

# ---- Step 3: Notes ----
echo "============================================================"
echo "[3/3] Setup complete"
echo "============================================================"
echo "  Train the word model (Apple-Silicon GPU accelerated):"
echo "     ./retrain-model.sh"
echo
echo "  Develop the UI (mouse-as-gaze; no eye tracker on macOS):"
echo "     ./start-dev.sh"
echo
echo "  Ship it: copy the trained model back to Windows and run build-installer.bat there."
echo
