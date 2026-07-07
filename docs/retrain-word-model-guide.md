# Retrain the tiny word model on a real corpus (Track 1)

**Branch:** `feature/local_llm_keyboard_suggestion`
**One command:** `.\retrain-model.bat`

## What this does and why
The shipped next-word model is a tiny **CIFG-LSTM** (`gazeconnect_lm_quantized.onnx`).
A word-level model can only predict words it has **seen in training sentences**, and
our hand-written AAC corpus plateaus at **~900 unique words** — which is why the model
tops out at **661 vocabulary tokens** and its suggestions feel narrow.

This path blends a **small slice of real, everyday English** (Tatoeba — a public,
human-written sentence database) with the curated AAC corpus, retrains the same tiny
model, and drops the new int8 model in place. Real sentences give the model genuine
vocabulary **and grammatical context**, so it reranks common next words far better.

**It stays safe for low-spec, offline distribution:**
- The shipped model is still **~2–3 MB** and runs on the **onnxruntime we already ship**
  (no torch, no genai at run time, ~tens of MB RAM).
- Only this developer machine grows, and only **temporarily** — the build tools and the
  training text are auto-removed at the end.
- The app pipeline, gaze loop, and the 30 ms neural timeout are **unchanged**.

## Run it

**Windows:**
```bat
.\retrain-model.bat
```

**macOS / Linux (MacBook — trains faster on Apple Silicon GPU):**
```bash
chmod +x retrain-model.sh   # once
./retrain-model.sh
```
The macOS twin does the same six steps and uses `--device auto`, which trains on
Apple's Metal (MPS) GPU when available — noticeably faster than CPU. It creates a
training venv if one doesn't exist, and uses the default PyPI `torch` wheel (which
ships Apple-Silicon support — do **not** use the CPU-only index on a Mac). When it
finishes, copy the new `gazeconnect_lm_quantized.onnx` + `vocabulary.json` back into
the Windows project's `python/ml/trained_models/` and run `build-installer.bat`
**on Windows** to ship it (the installer + eye-tracker stack are Windows-only).
That single script does everything, in order, and is fully reversible:
1. **Fetch** a real English corpus (Tatoeba, ~30–40 MB download → filtered to a few-MB
   text file). Every sentence is passed through the app's **safety guardrails**, so no
   blocked word ever enters the training vocabulary.
2. **Back up** the current model to `python\ml\trained_models\backup_pre_retrain\`.
3. **Install** the one-time build tools (`torch` cpu + `onnx`, ~1–2 GB, temporary).
4. **Retrain + int8-quantize** the CIFG-LSTM on the blended corpus.
5. **Verify** the new model (size within budget, loads under onnxruntime, vocab actually
   grew, predicts sensibly and fast). If verification fails, it **auto-restores** the backup.
6. **Reclaim space** — uninstall torch + onnx and delete dev-only artifacts, leaving the
   model folder as lean as it ships today.

Peak disk during training needs ~2–3 GB free; net permanent change is only **+1–2 MB**
(a slightly bigger model). Training on CPU takes roughly **30–90 min**.

### Tunables (top of `retrain-model.bat`)
| Var | Default | Meaning |
|---|---|---|
| `EPOCHS` | `20` | Training epochs. Lower = faster, higher = a bit sharper. |
| `MAXSENT` | `45000` | Real sentences to blend in. More = broader vocab, longer training. |
| `MINFREQ` | `2` | Min word frequency to enter the vocab (drops corpus typos/noise). |

### If the network is blocked
Download the Tatoeba English export manually
(`eng_sentences.tsv.bz2` from downloads.tatoeba.org), then from the `python` folder:
```bat
..\.venv\Scripts\python.exe -m ml.training_data.fetch_external_corpus --input <file.tsv.bz2>
```
and re-run `retrain-model.bat` (it will reuse the fetched corpus).

## Measure the win (before flipping anything on by default)
The model is used automatically on next app start — no code change. To confirm it's better:
1. `start-dev.bat`, open the keyboard, type realistic **English + Hinglish** sentences.
2. Watch **`predictionTelemetry`** — the **top-4 accept-rate** and **chars-saved** should
   rise vs the old model. Keep it only if it clearly wins.
3. Confirm the backend `[LATENCY]` line stays **< 1 ms** and there are no new gaze frame gaps.

## Shipping it to end users (they never train)

**End users never run any of the above.** You (the developer) train once; the resulting
~2–3 MB model file is bundled into the installer, exactly like compiling the `.exe`. End
users install the app and the model just runs on the onnxruntime that ships with it — no
torch, no Tatoeba, no training, ~tens of MB RAM.

> **Packaging fix (2026-07-07):** the previous `build-installer.bat` bundled only the
> backend code, so the packaged `.exe` couldn't find the model and silently fell back to
> n-gram only (it works in dev because dev runs Python from source). `build-installer.bat`
> now bundles, into the PyInstaller `.exe`:
> - `ml/trained_models/gazeconnect_lm_quantized.onnx` + `vocabulary.json` (the model),
> - `data/smart_bigrams.json` (the smart-bigram table),
> - `--collect-all onnxruntime` (the inference runtime; onnxruntime is imported lazily so
>   PyInstaller couldn't see it before),
> - `--hidden-import ml.inference/ml.fusion/ml.vocabulary` (torch-free; `ml.model`/`ml.train`
>   are deliberately **not** bundled, so torch never ships).
>
> Net installer size increase ≈ **~20 MB** (onnxruntime native libs + the model) — the price
> of shipping *any* neural model, and far below a general LLM. It aborts early with a clear
> message if the model file is missing.

**Verify the packaged build actually loads the model** (do this once after building):
1. `.\build-installer.bat` (it now refuses to build if the model is missing).
2. Install the produced installer on a clean machine (or run the packaged app).
3. In the backend log, confirm you see **`[Neural LM] Loaded: gazeconnect_lm_quantized.onnx`**
   (not `[Neural LM] Model not found — using n-gram only`).

## Revert (fully reversible)
```bat
copy /y "python\ml\trained_models\backup_pre_retrain\*" "python\ml\trained_models\"
```
That restores the previous model, vocabulary, and log exactly as before.

## Files
- `retrain-model.bat` — the one-command, self-cleaning orchestrator (project root).
- `python/ml/training_data/fetch_external_corpus.py` — stdlib-only Tatoeba fetcher
  (clean + dedupe + guardrail-filter → `external_corpus.txt`).
- `python/ml/training_data/aac_corpus.py` — blends `external_corpus.txt` at weight 1 when
  present (byte-identical to before when it's absent; AAC categories stay weighted 2–10).
- `python/ml/train.py` — now accepts `--vocab-size` and `--min-freq`.
- `python/ml/verify_model.py` — post-retrain health check (`python -m ml.verify_model`).
- `build-installer.bat` — now bundles the model + vocab + smart_bigrams + onnxruntime into
  the packaged `.exe` so the model reaches end users (see the packaging note above).

## How this relates to the opt-in general LLM (Track 2)
This (Track 1) is the **default, bundled** upgrade — tiny, offline, ships to everyone.
The separate `setup-llm.bat` + `docs/local-llm-benchmark-guide.md` remain an **opt-in**
path for capable machines that want a full small-LLM (~300 MB); it is never bundled.
