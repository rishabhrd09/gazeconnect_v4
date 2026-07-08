# End-User Footprint & LLM Decision

**Date:** 2026-07-08 · **Branch:** `feature/local_llm_keyboard_suggestion`

This is the authoritative, durable answer to: *"How much RAM and disk does the **shipped, end-user** app need, does it grow over time, and are we adding a heavy local LLM?"* Written so the numbers and decisions can't drift. If you change the prediction stack or packaging, update this file.

---

## TL;DR
- **Peak RAM (end user, worst case, hours of continuous use): ~400–650 MB, hard ceiling ~700 MB. It plateaus — it never approaches 1–2 GB.**
- **Disk:** installer download **~150–220 MB**; installed on disk **~380–460 MB**.
- **The whole prediction "brain" is ~1.9 MB.** RAM/disk are dominated by fixed runtimes (Electron, bundled Python, .NET Tobii helper), not by the models.
- **No heavy local LLM is shipped.** SmolLM2-360M stays a documented, opt-in, dev-only benchmark — never bundled. The 1–2 GB figure that prompted this decision was **exclusively** that path.
- **App folder does not grow unbounded.** Personalization files are pruned; the one remaining growth vector (per-keystroke session logs) now has a retention cap.

> **Estimate caveat:** nothing is built in the tree right now (no `node_modules/`, `.venv/`, `dist/`, installer). Runtime/dependency weights are engineering estimates from known wheel/runtime sizes. **Measured** parts: ML model + data = **1.9 MB**, Tobii DLLs = **4.8 MB**. Validate the RAM ceiling on a real build via the "RAM sanity" step at the bottom.

---

## 1. Peak RAM — worst case, long session

| Process | Typical RSS | What's in it |
|---|---|---|
| Electron / Chromium UI (main + renderer + GPU + helpers) | ~200–350 MB | Chromium, V8, the React app |
| Python backend (`GazeConnectBackend.exe`) | ~100–250 MB | CPython 3.10 + numpy + **CPU** onnxruntime + the 1.8 MB CIFG-LSTM model + in-RAM dicts/tries |
| .NET Tobii helper | ~30–80 MB | self-contained .NET 6 runtime + Tobii SDK |
| **Combined ceiling** | **~400–650 MB (worst ~700 MB)** | |

**Why it can't creep toward 1–2 GB.** Every in-memory cache in the prediction path is explicitly bounded, and no leak was found:

| Structure | Bound | Location |
|---|---|---|
| Neural inference cache | 200 entries, FIFO | `python/ml/inference.py` (`_cache_max`) |
| Recent words | 100 | `python/services/word_prediction.py` (`max_recent`) |
| Recency tracker | 30-day window (per-word timestamps pruned) | `word_prediction.py` `RecencyTracker` |
| Patient bigrams | pruned when > 5000 pairs | `word_prediction.py` `PatientBigramTracker` |
| Session ring buffer (in-memory) | `deque(maxlen=2000)` | `python/main.py` `SessionLogger` |
| Datamuse cache | bounded LRU+TTL, **off by default** | `word_prediction.py` |

The 1–2 GB number applied **only** to the optional SmolLM2-360M local-LLM path, which is not wired into any shipped code and not bundled. See [`local-llm-benchmark-guide.md`](local-llm-benchmark-guide.md).

---

## 2. Disk — download and installed

| Component | Size | Basis |
|---|---|---|
| Electron runtime (Chromium/Node/V8/locales) | ~200 MB | est. (Electron 28 win-x64) |
| React frontend `dist/` (in `app.asar`) | ~10–25 MB | est. (only imported assets ship) |
| Python backend PyInstaller `--onefile` exe | ~90–150 MB | est. (CPython + numpy + onnxruntime CPU + websockets + pyttsx3) |
| ↳ shipped ML model + data (inside that exe) | **~1.9 MB** | **measured** — `gazeconnect_lm_quantized.onnx` 1.81 MB + `vocabulary.json` 23 KB + `smart_bigrams.json` 34 KB |
| .NET Tobii helper (self-contained) | ~70–80 MB | est. runtime ~65 MB + **measured** DLLs 4.8 MB |
| **Total unpacked on disk** | **~380–460 MB** | est. |
| **NSIS installer `.exe` (download)** | **~150–220 MB** | est. (LZMA-compressed) |

`onnxruntime` ships once, as the **CPU** build inside the PyInstaller exe (no `onnxruntime-node`). `torch` / training code (`ml.train`, `ml.model`) are deliberately excluded from the backend build. See [`build-and-installation-guide.md`](build-and-installation-guide.md).

---

## 3. Does the app folder grow over time?

- **Program files:** No — static after install.
- **User data (`./data/`):**
  - Personalization (`custom_dictionary.json`, `patient_data/recency_scores.json`, `patient_data/patient_bigrams.json`) — **capped/pruned, bounded.**
  - **Per-keystroke session logs (`session_*.log`, `text_*.txt`)** — previously the *only* unbounded growth (append-per-keystroke, new file per launch, never trimmed). **Now capped** via retention (Change of 2026-07-08): keep the newest N launch pairs, with an optional age cap. Personalization and survey data are untouched by the prune.

**Config** (`ServerConfig` in `python/main.py`):

| Field | Default | Meaning |
|---|---|---|
| `session_log_keep_files` | `20` | keep newest N `session_*.log` / `text_*.txt` pairs (0 = unlimited) |
| `session_log_retention_days` | `0` | also drop files older than N days (0 = off) |

Enforced in `SessionLogger._prune_old_logs()` at startup, mirroring the existing `_prune_keyboard_chat_logs` / `_prune_spoken_logs` pattern. See [`runtime-storage-and-soak-guide.md`](runtime-storage-and-soak-guide.md).

---

## 4. Decisions locked (2026-07-08)

1. **Consistency (dev-prod parity) is a hard rule.** ONE model artifact stays identical across Mac-dev, Windows-dev, and the shipped installer — what the developer tests is exactly what the patient gets. The current stack already satisfies this (pure-data n-gram/bigrams/vocab + a single 1.8 MB CIFG-LSTM ONNX on the same onnxruntime everywhere; verified loading + predicting on macOS).
2. **Shipped predictor stays lean and offline** and is **kept as-is** (2026-07-08): n-gram + smart bigrams (34 KB) + 1.8 MB CIFG-LSTM ONNX (661 vocab) + patient personalization. No new runtime dependencies; no model change now.
3. **No general-purpose local LLM anywhere — not even in dev.** SmolLM2-360M / `onnxruntime-genai` are memory-heavy (~1–2 GB RAM); using them only in dev would break parity. They remain a *documented, theoretical future option only* (`setup-llm.*`, never bundled) — not part of the product.
4. **If more quality is wanted later,** the blessed path is to retrain/enlarge the *same* CIFG-LSTM (bigger neural vocab + richer data) — it stays one small ONNX identical everywhere, never a general LLM.
5. **Vocabulary kept as-is** (2,574 live words; `GENERAL_ENGLISH_VOCABULARY` already wired). Expansion is essentially free RAM-wise and can be revisited any time.
6. **SpeakFaster:** adopt only the *paradigm* (initials→phrase + personalized phrase cache), offline and model-agnostic, as the next milestone — not the 64B cloud model. See [`speakfaster-lite-milestone.md`](speakfaster-lite-milestone.md).

---

## 5. RAM sanity check (validate on a real build)
During a `--simulate` session (or a full run), watch resident memory of the three processes over ~30–60 min of active typing:
- **Windows:** Task Manager → Details → `GazeConnect*.exe`, `GazeConnectBackend.exe`, the .NET helper → *Working set*.
- **macos/Linux dev:** `ps -o rss= -p <pid>` for the Python backend and Electron helpers.

Expect the combined working set to settle around **~400–650 MB** and stay flat (bounded caches). If it climbs steadily, that's a regression — investigate before shipping.
