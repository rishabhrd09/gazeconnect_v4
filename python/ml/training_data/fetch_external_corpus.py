"""
Fetch a small, REAL, everyday-English corpus for training the tiny CIFG-LSTM
=============================================================================
Why this exists
---------------
The neural word model can only predict words it has *seen in sentences*. Our
hand-written AAC corpus plateaus at ~900 unique words, which caps the model at a
few hundred vocab tokens. This script pulls a small slice of **Tatoeba** — a
public, human-written, everyday-sentence database — cleans it, filters it through
our safety guardrails, and writes `external_corpus.txt` next to this file. The
trainer then blends it with the AAC corpus to lift the model to a few-thousand
real-vocabulary words *with genuine grammatical context*.

Key properties (matches the project's constraints)
--------------------------------------------------
- **Stdlib only** — urllib + bz2. No `datasets`, no `pandas`, no heavy deps.
- **Dev-side only** — writes a plain text file used *only at training time*. The
  shipped app never imports it; the runtime is untouched.
- **Offline distribution safe** — the model that ships stays tiny (~2-3 MB int8);
  only this training-time text file grows on the developer's machine.
- **Guardrail-clean** — every sentence is passed through
  `prediction_guardrails.contains_blocked_prediction_word` and dropped if it
  contains any blocked term, so nothing unsafe enters the training vocabulary.
- **Deterministic** — takes the first N qualifying sentences (no RNG), so a
  re-run reproduces the same corpus.

Usage
-----
    python -m ml.training_data.fetch_external_corpus                 # download + build
    python -m ml.training_data.fetch_external_corpus --max 40000     # smaller slice
    python -m ml.training_data.fetch_external_corpus --input eng_sentences.tsv.bz2
        # use an already-downloaded Tatoeba export (offline / flaky network)

The trainer picks up `external_corpus.txt` automatically via `aac_corpus.py`.
Delete the file to return to the hand-written corpus exactly as before.
"""

from __future__ import annotations

import argparse
import bz2
import os
import re
import sys
import urllib.request

# Public Tatoeba English sentences export (id \t lang \t text), bz2-compressed.
DEFAULT_URL = "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2"

_HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(_HERE, "external_corpus.txt")

# Keep only clean, everyday, telegraphic-to-short sentences. Longer spans add
# rare words and slow training without helping top-5 next-word prediction.
DEFAULT_MAX_SENTENCES = 60000
MIN_WORDS = 2
MAX_WORDS = 12
MAX_WORD_LEN = 18  # reject junk tokens (URLs, run-ons, IDs)

# Normalize to the SAME token space the model uses: lowercase, words separated by
# single spaces, only [a-z'] inside words (apostrophes kept for don't / it's).
_KEEP = re.compile(r"[^a-z' ]+")
_MULTISPACE = re.compile(r"\s+")


def _load_guardrail_filter():
    """Best-effort import of the runtime blocklist so unsafe lines never train.

    Returns a callable(text)->bool (True = contains a blocked word). If the
    module can't be imported (path issues), returns a no-op that keeps every
    line — the runtime guardrails still filter predictions, so this is only an
    extra, training-time cleanliness pass.
    """
    # python/ is two levels up from ml/training_data/
    py_root = os.path.abspath(os.path.join(_HERE, "..", ".."))
    if py_root not in sys.path:
        sys.path.insert(0, py_root)
    try:
        from prediction_guardrails import contains_blocked_prediction_word
        return contains_blocked_prediction_word
    except Exception as exc:  # pragma: no cover - defensive
        print(f"  [warn] guardrail import failed ({exc}); skipping safety pre-filter.")
        return lambda _text: False


def _clean(raw: str) -> str:
    """Return a normalized sentence, or '' if it should be dropped."""
    s = raw.strip().lower()
    if not s:
        return ""
    # Drop rows with digits, urls, or markup before we strip them away silently —
    # those are usually addresses, times, or code, not conversational English.
    if any(ch.isdigit() for ch in s) or "http" in s or "www." in s or "@" in s:
        return ""
    s = _KEEP.sub(" ", s)          # keep only a-z, apostrophe, space
    s = s.replace(" '", " ").replace("' ", " ").strip(" '")
    s = _MULTISPACE.sub(" ", s).strip()
    if not s:
        return ""
    words = s.split(" ")
    if not (MIN_WORDS <= len(words) <= MAX_WORDS):
        return ""
    if any(len(w) > MAX_WORD_LEN for w in words):
        return ""
    # Require at least one 'real' word (>=2 chars) so we don't keep "a a a".
    if not any(len(w) >= 2 for w in words):
        return ""
    return s


def _iter_source_lines(input_path: str | None, url: str):
    """Yield decoded text lines from a local bz2/tsv file or the network."""
    if input_path:
        print(f"  Reading local export: {input_path}")
        opener = bz2.open if input_path.endswith(".bz2") else open
        with opener(input_path, "rt", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                yield line
        return

    print(f"  Downloading: {url}")
    print("  (one-time; ~30-40 MB; streamed and filtered, not all kept)")
    req = urllib.request.Request(url, headers={"User-Agent": "GazeConnect-corpus/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        decompressor = bz2.BZ2Decompressor()
        buffer = ""
        while True:
            chunk = resp.read(1 << 16)
            if not chunk:
                break
            try:
                text = decompressor.decompress(chunk).decode("utf-8", errors="ignore")
            except OSError:
                # Not bz2 after all (e.g. server returned plain tsv) — decode raw.
                text = chunk.decode("utf-8", errors="ignore")
            buffer += text
            *lines, buffer = buffer.split("\n")
            for line in lines:
                yield line
        if buffer:
            yield buffer


def build(
    input_path: str | None = None,
    url: str = DEFAULT_URL,
    max_sentences: int = DEFAULT_MAX_SENTENCES,
    output_path: str = OUTPUT_PATH,
) -> dict:
    is_blocked = _load_guardrail_filter()

    kept: list[str] = []
    seen: set[str] = set()
    scanned = 0
    dropped_unsafe = 0

    for line in _iter_source_lines(input_path, url):
        scanned += 1
        # Tatoeba row: id \t lang \t sentence
        parts = line.rstrip("\n").split("\t")
        raw = parts[2] if len(parts) >= 3 else parts[-1]
        sentence = _clean(raw)
        if not sentence or sentence in seen:
            continue
        if is_blocked(sentence):
            dropped_unsafe += 1
            continue
        seen.add(sentence)
        kept.append(sentence)
        if len(kept) >= max_sentences:
            break
        if len(kept) % 10000 == 0:
            print(f"    ... kept {len(kept):,} / scanned {scanned:,}")

    unique_words = set()
    for s in kept:
        unique_words.update(s.split(" "))

    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(kept))
        if kept:
            fh.write("\n")

    return {
        "scanned": scanned,
        "kept": len(kept),
        "dropped_unsafe": dropped_unsafe,
        "unique_words": len(unique_words),
        "output_path": output_path,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch a small real English corpus (Tatoeba) for training.")
    parser.add_argument("--max", type=int, default=DEFAULT_MAX_SENTENCES,
                        help=f"Max sentences to keep (default {DEFAULT_MAX_SENTENCES}).")
    parser.add_argument("--url", default=DEFAULT_URL, help="Source export URL.")
    parser.add_argument("--input", default=None,
                        help="Use a local Tatoeba export (.tsv or .tsv.bz2) instead of downloading.")
    parser.add_argument("--output", default=OUTPUT_PATH, help="Where to write external_corpus.txt.")
    args = parser.parse_args()

    print("=" * 60)
    print("  Fetching external training corpus (Tatoeba English)")
    print("=" * 60)
    try:
        stats = build(input_path=args.input, url=args.url,
                      max_sentences=args.max, output_path=args.output)
    except Exception as exc:
        print(f"\n  [FAIL] Could not build corpus: {exc}")
        print("  The app is UNAFFECTED. You can retry, or download the export")
        print("  manually and pass it with --input <file>. Training falls back")
        print("  to the hand-written corpus if external_corpus.txt is absent.")
        return 1

    print("-" * 60)
    print(f"  Scanned sentences : {stats['scanned']:,}")
    print(f"  Kept (clean+safe) : {stats['kept']:,}")
    print(f"  Dropped (unsafe)  : {stats['dropped_unsafe']:,}")
    print(f"  Unique words      : {stats['unique_words']:,}")
    print(f"  Written to        : {stats['output_path']}")
    print("=" * 60)
    if stats["kept"] == 0:
        print("  [warn] Nothing kept — check the source. external_corpus.txt is empty.")
        return 1
    print("  Done. Re-run the trainer to pick this up automatically.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
