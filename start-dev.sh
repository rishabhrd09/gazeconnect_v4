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
PROJECT_ROOT="$(pwd)"

echo
echo "============================================================"
echo "  GazeConnect Pro - Dev launcher (macOS / Linux)"
echo "  Mode: SIMULATION (mouse-as-gaze; no Tobii hardware on macOS)"
echo "============================================================"
echo

is_project_process() {
  local pid="$1"
  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [ -z "$cmd" ]; then
    return 1
  fi

  case "$cmd" in
    *GazeConnect*|*gazeconnect*|*TobiiGazeHelper*|*GazeConnectBackend*|*vite*|*electron*)
      return 0
      ;;
  esac

  if echo "$cmd" | grep -qF "$PROJECT_ROOT"; then
    return 0
  fi
  return 1
}

cleanup_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN -n -P 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return
  fi
  echo "[WARN] Port $port currently in use:"
  for pid in $pids; do
    local cmd
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    echo "  - PID $pid : ${cmd:-<unknown>}"
    if is_project_process "$pid"; then
      echo "    -> stopping process on port $port (PID $pid)"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      kill -9 "$pid" >/dev/null 2>&1 || true
    else
      echo "    -> skipped (not recognized as project-owned)"
    fi
  done
}

# ---- Free ports used by Vite (5173), Tobii bridge (5555), backend WS (8765) ----
if command -v lsof >/dev/null 2>&1; then
  echo "[CLEANUP] Checking ports 5173, 5555, 8765..."
  for PORT in 5173 5555 8765; do
    cleanup_port "$PORT"
  done
else
  echo "[WARN] lsof not installed; cannot auto-clean ports."
fi
echo "  Done."
echo

if lsof -ti -iTCP:5173 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "[WARN] Port 5173 still in use by unknown process; start may fail."
fi

# ---- Hint for simulate flag (harmless if the app ignores it) ----
export GAZE_SIMULATE=1

echo "[START] Vite + Electron + Python backend (Electron auto-starts the backend)..."
echo
npm run dev:electron
