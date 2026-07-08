# Local LLM Prediction — Phase 0 Benchmark Guide

**Branch:** `feature/local_llm_keyboard_suggestion`

> **Decision (2026-07-08): the local LLM is NOT shipped to end users — it is a future option only.**
> This benchmark is opt-in and dev-only, and is **never** bundled into the installer.
> **Rationale:** SmolLM2-360M (int4) adds ~300–400 MB permanent disk and can push runtime
> RAM to ~1–2 GB — unacceptable for the end-user build, which must stay **≤ ~700 MB peak**.
> The shipped predictor stays lean: n-gram + smart bigrams + the 1.8 MB CIFG-LSTM ONNX +
> patient personalization. Revisit only if a distilled/int4 model provably meets a strict RAM
> budget on target hardware. Full analysis: [`footprint-and-llm-decision.md`](footprint-and-llm-decision.md).
> Lean, offline way to capture the SpeakFaster benefit *without* a heavy model:
> [`speakfaster-lite-milestone.md`](speakfaster-lite-milestone.md).

## Why this step exists
The goal is that the patient almost never types a whole word letter‑by‑letter —
the intended word or short phrase should appear in the top ~5 predictions. The
current neural layer is a **661‑word CIFG‑LSTM**, which can only rerank among 661
known words. A small **local** LLM predicts next words / short phrases from real
sentence context far better (Google's *SpeakFaster*, Nature Comms 2024, saved
**57% of motor actions** for eye‑gaze ALS users doing exactly this).

Before we integrate anything, we must confirm the patient's machine can run a
model **fast enough and without disturbing the 66 Hz gaze pipeline.** This
benchmark answers that. It changes nothing in the app — it only loads candidate
models and prints a report.

Everything runs **locally** — no cloud, no data leaves the device.

---

## Easiest path: one script does all of it (optional, opt-in)
```bat
.\setup-llm.bat
```
`setup-llm.bat` (in the project root) does Steps 1–4 below for you: it installs
`onnxruntime-genai` into the project's **own** venv, builds one small default
model (**SmolLM2-360M**, int4, CPU) into the project folder, **auto-removes the
one-time build tools + source cache to reclaim ~1–2 GB**, runs the benchmark, and
prints the permanent footprint (~300–400 MB) + how to remove it. It is **safe**
(venv/project-scoped, never touches Windows system files), **idempotent** (skips
anything already done), and **opt-in** — it does NOT run from `setup.bat` or
`start-dev.bat`, so the normal install stays lean. Peak disk during the build is
~2–3 GB temporarily; edit `MODEL_ID` in the script for a bigger model.

---

## Step 1 — Install the runtime (in the app's venv)
```bat
cd D:\latest_gaze_connect\latest_v4\latest_v4\gazeconnect_v4\python
.\.venv\Scripts\python.exe -m pip install onnxruntime-genai psutil
```
`onnxruntime-genai` is the CPU inference runtime (the app already uses ONNX
Runtime for the LSTM, so this is a natural extension). `psutil` is optional and
only used to report RAM.

## Step 2 — Build one or more candidate models (int4, CPU)
The onnxruntime‑genai *model builder* downloads a HuggingFace model and produces
a ready‑to‑run ONNX directory. You'll need `torch` + `transformers` for the
one‑time conversion:
```bat
.\.venv\Scripts\python.exe -m pip install torch transformers
```
Then build the candidates (start small; add the stretch model only if the small
ones pass). Output folder names must match what the benchmark probes:
```bat
REM ~360M — smallest, safest (start here)
.\.venv\Scripts\python.exe -m onnxruntime_genai.models.builder ^
  -m HuggingFaceTB/SmolLM2-360M-Instruct ^
  -o ml\trained_models\smollm2-360m-onnx -p int4 -e cpu -c .\.hf_cache

REM ~0.5B — a bit stronger
.\.venv\Scripts\python.exe -m onnxruntime_genai.models.builder ^
  -m Qwen/Qwen2.5-0.5B-Instruct ^
  -o ml\trained_models\qwen2.5-0.5b-onnx -p int4 -e cpu -c .\.hf_cache

REM ~1B — stretch (only if the above are fast). Llama-3.2 is gated on HF;
REM if you can't access it, use a non-gated 1-1.5B such as Qwen2.5-1.5B-Instruct.
.\.venv\Scripts\python.exe -m onnxruntime_genai.models.builder ^
  -m Qwen/Qwen2.5-1.5B-Instruct ^
  -o ml\trained_models\llama3.2-1b-onnx -p int4 -e cpu -c .\.hf_cache
```
> Tip: some model authors publish pre‑built ONNX‑GenAI repos you can download
> directly with `huggingface-cli download <repo> --local-dir ml\trained_models\<name>`
> — that skips the `torch`/builder step. Either path produces the same folder.

## Step 3 — Run the benchmark
```bat
.\.venv\Scripts\python.exe -m ml.llm_benchmark
```
(or pass explicit dirs: `... -m ml.llm_benchmark --models ml\trained_models\qwen2.5-0.5b-onnx`)

## Step 4 — Read the report
For each model it prints:
- **load time** and **RAM added**,
- **next‑word** and **phrase** latency (p50 / p95 / max),
- **sample predictions** for ~14 realistic contexts (English + Hinglish) so you
  can eyeball whether the patient's intended word lands in the top 5,
- a **verdict**.

**Pick the largest model whose `next_words` p95 is comfortably under ~250 ms.**
Rough guide: p95 ≤ 180 ms = great for per‑keystroke word prediction; 180–300 ms =
usable with the debounce/timeout, or use it for the phrase strip only; > 300 ms =
too slow on this machine, drop to a smaller model.

## Step 5 — The final gate (does it disturb gaze?)
Latency in isolation isn't enough — the model shares the CPU with the gaze
pipeline. After picking a candidate, run the **full app** (`start-dev.bat`),
open the keyboard, type a few sentences, and confirm in the backend log that:
- the `[LATENCY] … total=…ms` line stays **< 1 ms**, and
- `TobiiHelper` **frame gaps** stay normal (no new multi‑hundred‑ms gaps).

If gaze stays clean, that tier is safe.

---

## What happens next (Phase 1, after you share the results)
Once we know the safe tier, I will:
1. Wire `LocalLLMPredictor` into the prediction path **in a thread executor**
   with a ~150 ms debounce and ~250 ms hard timeout → instant fallback to the
   current n‑gram engine (so the gaze loop never blocks).
2. Feed it recent text + light patient history + a short system prompt, and
   filter every output through the existing guardrails (English + Hindi/Hinglish).
3. Put it behind an `llmPredict` flag, **default OFF**, and measure the win with
   the existing `predictionTelemetry` (top‑4 accept‑rate + chars‑saved) before
   flipping the default.
4. (Later / optional) A *SpeakFaster*‑style abbreviation‑expansion mode — type
   initials, the local LLM expands to the full phrase — the single biggest
   keystroke saver.

## Files added in Phase 0
- `python/ml/llm_predictor.py` — model‑agnostic, fully‑guarded local‑LLM wrapper
  (no‑op if the runtime/model is absent; never breaks the app).
- `python/ml/llm_benchmark.py` — this benchmark harness.
- `docs/local-llm-benchmark-guide.md` — this guide.
