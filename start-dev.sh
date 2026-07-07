#!/usr/bin/env bash
# ============================================================
#  GazeConnect Pro - Development launcher (macOS / Linux)
# ============================================================
#  macOS twin of start-dev.bat. Starts Vite + Electron + the Python backend for
#  UI development.
#
#  EYE TRACKING IS WINDOWS-ONLY. The Tobii Eye Tracker 5 + its .NET helper do
#  not run on macOS, so on a Mac this is effectively SIMULATION mode (move the
#  mouse to stand in for gaze). Use a Mac for UI work and model training; use
#  Windows for real eye tracking and building the installer.
#
#  Run:  chmod +x start-dev.sh   (once)
#        ./start-dev.sh
# ============================================================
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "============================================================"
echo "  GazeConnect Pro - Dev launcher (macOS / Linux)"
echo "  Mode: SIMULATION (mouse-as-gaze; no Tobii hardware on macOS)"
echo "============================================================"
echo

# ---- Free ports used by Vite (5173), Tobii bridge (5555), backend WS (8765) ----
echo "[CLEANUP] Freeing ports 5173, 5555, 8765 if in use..."
for PORT in 5173 5555 8765; do
  PIDS="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    echo "  Freeing port $PORT (PID $PIDS)"
    # shellcheck disable=SC2086
    kill -9 $PIDS >/dev/null 2>&1 || true
  fi
done
echo "  Done."
echo

# ---- Hint for simulate flag (harmless if the app ignores it) ----
export GAZE_SIMULATE=1

echo "[START] Vite + Electron + Python backend (Electron auto-starts the backend)..."
echo
npm run dev:electron
