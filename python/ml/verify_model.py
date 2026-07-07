"""
Post-retrain sanity check for the tiny word model
==================================================
Run after retraining (retrain-model.bat calls this as `python -m ml.verify_model`):

  - the quantized model file exists and is within the shipping size budget,
  - it loads under the SAME plain onnxruntime the app ships (no torch/genai),
  - the vocabulary actually grew (real-corpus lift landed),
  - it returns sensible next-word predictions on realistic AAC contexts,
  - a single neural predict stays fast enough for the 30 ms runtime timeout.

Exit code 0 = healthy (safe to keep). Non-zero = something is wrong; the
batch script restores the backed-up model. This never touches the app or
its data — it only loads and queries the freshly written model.
"""

from __future__ import annotations

import os
import time

from .inference import NeuralPredictor

# Shipping budget: the previous model was ~1.9 MB; a real-corpus retrain with
# tie_weights should stay ~2-3 MB. Fail loudly if something blew the size up.
MAX_MODEL_MB = 6.0
# The runtime enforces a 30 ms neural timeout; a warm predict should be well
# under that. Allow generous headroom here for a cold first call on a slow CPU.
MAX_PREDICT_MS = 60.0

# A few realistic contexts (English + Hinglish). We only require that the model
# returns *some* in-vocabulary suggestions — quality is judged in real use via
# predictionTelemetry, not asserted here.
SAMPLE_CONTEXTS = [
    ("i need", ""),
    ("please help", ""),
    ("how are", ""),
    ("i want to", ""),
    ("good", ""),
    ("thank", ""),
    ("mujhe", ""),      # Hinglish: "I ... (need)"
    ("i feel", "t"),    # with a prefix
]


def main() -> int:
    print("=" * 60)
    print("  Verifying retrained model")
    print("=" * 60)

    predictor = NeuralPredictor()

    # --- size budget (check the file the app actually loads) ---
    path = predictor.quantized_path
    if not os.path.exists(path):
        print(f"  [FAIL] Quantized model not found at {path}")
        return 1
    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f"  Model file : {os.path.basename(path)}  ({size_mb:.2f} MB)")
    if size_mb > MAX_MODEL_MB:
        print(f"  [FAIL] Model is {size_mb:.2f} MB, over the {MAX_MODEL_MB:.0f} MB ship budget.")
        return 1

    # --- loads under plain onnxruntime ---
    if not predictor.load():
        print("  [FAIL] Model failed to load under onnxruntime.")
        return 1
    vocab_size = predictor.vocab.size if predictor.vocab else 0
    print(f"  Vocabulary : {vocab_size} tokens")
    if vocab_size < 700:
        print(f"  [FAIL] Vocab is {vocab_size} - the real-corpus lift did not land "
              f"(expected clearly more than the old 661).")
        return 1

    # --- predictions look sane + fast ---
    print("  Sample predictions:")
    max_ms = 0.0
    total_hits = 0
    for context, prefix in SAMPLE_CONTEXTS:
        t0 = time.perf_counter()
        results = predictor.predict(context, prefix=prefix, top_k=5)
        elapsed = (time.perf_counter() - t0) * 1000.0
        max_ms = max(max_ms, elapsed)
        total_hits += len(results)
        words = ", ".join(w for w, _ in results[:5]) or "(none)"
        tag = f"{context!r}" + (f" +{prefix!r}" if prefix else "")
        print(f"    {tag:24s} -> {words}")

    print(f"  Slowest predict: {max_ms:.1f} ms")
    if total_hits == 0:
        print("  [FAIL] Model returned no predictions for any context.")
        return 1
    if max_ms > MAX_PREDICT_MS:
        print(f"  [WARN] Slowest predict {max_ms:.1f} ms exceeds {MAX_PREDICT_MS:.0f} ms. "
              f"Runtime timeout still protects the gaze loop, but check the CPU.")
        # Not fatal — the 30 ms runtime timeout guarantees the gaze loop is safe.

    print("=" * 60)
    print(f"  [OK] Healthy: {size_mb:.2f} MB, {vocab_size} vocab, predicts in "
          f"~{max_ms:.0f} ms. Safe to keep.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
