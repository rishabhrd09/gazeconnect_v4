"""
llm_benchmark.py — Phase 0 benchmark for local small-LLM prediction.

Run this ON THE ACTUAL PATIENT MACHINE to decide which local model tier the
hardware can safely support before we integrate anything. It measures, per
candidate model:

  * load time and resident memory (RAM) added by the model
  * next-word latency  (p50 / p95) over realistic AAC contexts
  * phrase latency     (p50 / p95)
  * sample quality     — prints the top-5 words + a phrase completion so you can
                          eyeball whether the patient's intended word would be
                          selectable in the top row

It changes NOTHING in the app. It only loads models and prints a report + a
recommendation. See docs/local-llm-benchmark-guide.md for how to install
onnxruntime-genai and download the candidate ONNX models.

Usage (from the python/ folder, ideally in the app's venv):
    python -m ml.llm_benchmark --models  ml/trained_models/smollm2-360m-onnx \
                                         ml/trained_models/qwen2.5-0.5b-onnx \
                                         ml/trained_models/llama3.2-1b-onnx
If --models is omitted, a default set of expected directories is probed and any
that exist are benchmarked.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import statistics
from typing import List, Tuple

# allow running as `python -m ml.llm_benchmark` or `python ml/llm_benchmark.py`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from ml.llm_predictor import LocalLLMPredictor, onnx_genai_available
except Exception:
    from llm_predictor import LocalLLMPredictor, onnx_genai_available  # type: ignore

try:
    import psutil  # optional, for RAM measurement
    _PSUTIL = True
except Exception:
    _PSUTIL = False


# Realistic AAC contexts: (typed text so far, partial-word prefix, note)
CONTEXTS: List[Tuple[str, str, str]] = [
    ("I want to go to the ", "",      "→ bathroom / hospital / kitchen?"),
    ("I need ", "",                    "→ help / water / medicine?"),
    ("How are ", "",                   "→ you?"),
    ("Please give me some ", "",       "→ water / food / medicine?"),
    ("I am feeling ", "",              "→ tired / cold / hungry?"),
    ("hello ", "",                     "→ how / good / there?"),
    ("I want to watch ", "",           "→ tv / youtube / a movie?"),
    ("Call the ", "",                  "→ doctor / nurse?"),
    ("I love ", "",                    "→ you?"),
    ("Can you ", "",                   "→ help / please?"),
    ("I need my ", "medi",             "prefix → medicine?"),
    ("Turn on the ", "",               "→ fan / tv / light?"),
    ("mujhe ", "",                     "Hinglish → pani / dard / chahiye?"),
    ("kaise ", "",                     "Hinglish → ho?"),
]


def _rss_mb() -> float:
    if not _PSUTIL:
        return -1.0
    try:
        return psutil.Process().memory_info().rss / (1024 * 1024)
    except Exception:
        return -1.0


def _pct(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, int(len(s) * p))
    return s[idx]


def benchmark_model(model_dir: str) -> None:
    print("\n" + "=" * 78)
    print(f"MODEL: {model_dir}")
    print("=" * 78)
    if not os.path.isdir(model_dir):
        print("  SKIP — directory does not exist.")
        return

    rss_before = _rss_mb()
    t0 = time.perf_counter()
    p = LocalLLMPredictor(model_dir, max_latency_ms=400.0)
    load_ms = (time.perf_counter() - t0) * 1000.0
    rss_after = _rss_mb()

    if not p.available:
        print(f"  UNAVAILABLE — {p._load_error}")
        return

    print(f"  load time      : {load_ms:8.0f} ms")
    if rss_before >= 0 and rss_after >= 0:
        print(f"  RAM added      : {rss_after - rss_before:8.0f} MB  (process now {rss_after:.0f} MB)")

    # warm-up (first call compiles/caches; don't count it)
    p.next_words("I want ", top_k=5)

    word_lat: List[float] = []
    phrase_lat: List[float] = []
    print("\n  Sample predictions (does the intended word hit the top 5?):")
    for text, prefix, note in CONTEXTS:
        t = time.perf_counter()
        words = p.next_words(text, prefix=prefix, top_k=5)
        word_lat.append((time.perf_counter() - t) * 1000.0)

        t = time.perf_counter()
        phrase = p.complete_phrase(text)
        phrase_lat.append((time.perf_counter() - t) * 1000.0)

        shown = f"{text!r}" + (f" +{prefix!r}" if prefix else "")
        print(f"    {shown:34}  words={words}  phrase={phrase!r:22}  {note}")

    print("\n  Latency (over {} contexts):".format(len(CONTEXTS)))
    print(f"    next_words     : p50 {_pct(word_lat,0.5):6.0f} ms   p95 {_pct(word_lat,0.95):6.0f} ms   max {max(word_lat):6.0f} ms")
    print(f"    complete_phrase: p50 {_pct(phrase_lat,0.5):6.0f} ms   p95 {_pct(phrase_lat,0.95):6.0f} ms   max {max(phrase_lat):6.0f} ms")

    # verdict heuristic — for per-keystroke word prediction we want p95 well
    # under the ~250 ms debounce+timeout budget so it feels instant and never
    # queues up behind fast typing.
    p95w = _pct(word_lat, 0.95)
    if p95w <= 180:
        verdict = "GOOD — comfortably fast for per-keystroke word prediction."
    elif p95w <= 300:
        verdict = "OK — usable with a ~250 ms timeout; phrase-only or debounced word use."
    else:
        verdict = "SLOW on this machine — prefer a smaller model, or use for the phrase strip only."
    print(f"\n  VERDICT: {verdict}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase 0 local-LLM benchmark")
    ap.add_argument("--models", nargs="*", default=None,
                    help="ONNX-GenAI model directories to benchmark")
    args = ap.parse_args()

    print("GazeConnect Pro — Local LLM Phase 0 benchmark")
    print(f"onnxruntime-genai available: {onnx_genai_available()}")
    print(f"CPU count: {os.cpu_count()}  |  psutil: {_PSUTIL}")
    if not onnx_genai_available():
        print("\n  onnxruntime-genai is NOT installed — install it first:")
        print("      pip install onnxruntime-genai")
        print("  Then download a candidate model (see docs/local-llm-benchmark-guide.md).")
        return

    models = args.models
    if not models:
        # probe a default set of expected locations
        here = os.path.dirname(os.path.abspath(__file__))
        base = os.path.join(here, "trained_models")
        candidates = [
            "smollm2-360m-onnx", "qwen2.5-0.5b-onnx", "llama3.2-1b-onnx",
        ]
        models = [os.path.join(base, c) for c in candidates]
        print("\n  No --models given; probing default locations under ml/trained_models/ ...")

    any_run = False
    for m in models:
        if os.path.isdir(m):
            any_run = True
        benchmark_model(m)

    if not any_run:
        print("\n  No model directories found. Download at least one (see the guide) and re-run.")
    else:
        print("\n" + "-" * 78)
        print("Next: pick the largest model whose next_words p95 is comfortably under ~250 ms,")
        print("AND that does not disturb the gaze pipeline. Final gate: run the full app, open")
        print("the keyboard, and confirm the backend [LATENCY] line stays <1 ms and TobiiHelper")
        print("frame gaps stay normal while typing with the model active.")


if __name__ == "__main__":
    main()
