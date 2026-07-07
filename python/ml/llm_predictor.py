"""
llm_predictor.py — Local small-LLM word & phrase prediction (Phase 1 wrapper).

Part of the `feature/local_llm_keyboard_suggestion` work. The ultimate goal is
that the patient rarely types a whole word letter-by-letter: the intended word
or short phrase should appear in the top ~5 predictions. A modern small local
LLM predicts next words / short phrases from real sentence context far better
than the existing 661-token CIFG-LSTM (which can only rerank among 661 words).

Design rules (see docs/local-llm-benchmark-guide.md and the plan):
  * LOCAL ONLY — runs on-device via onnxruntime-genai (int4/int8 ONNX model).
    Nothing leaves the machine. No cloud API.
  * NEVER breaks the app — if onnxruntime-genai is not installed, or no model is
    present, or anything throws, every method degrades to an empty result and
    the caller falls back to the existing n-gram engine.
  * NEVER blocks the gaze pipeline — every call is bounded by a hard wall-clock
    timeout; the intended integration runs this in a thread executor with a
    debounce (see Phase 1 wiring in main.py, added after the Phase 0 benchmark).
  * SAFE — all output is filtered through prediction_guardrails (English +
    Hindi/Hinglish) before it can reach the UI.

This module is intentionally model-agnostic: you point it at an ONNX-GenAI model
directory (produced by `huggingface-cli` / the onnxruntime-genai model builder)
and it works the same whether that is SmolLM2-360M, Qwen2.5-0.5B, or Llama-3.2-1B.
The Phase 0 benchmark (llm_benchmark.py) decides which tier the hardware supports.
"""

from __future__ import annotations

import time
import logging
import re
from typing import List, Optional

logger = logging.getLogger(__name__)

# ── Guardrails (reused; never surface blocked words) ────────────────────────
try:
    from prediction_guardrails import (
        is_blocked_prediction_word,
        is_valid_prediction_token,
    )
except Exception:  # pragma: no cover - guardrails must exist, but be safe
    def is_blocked_prediction_word(word: str) -> bool:  # type: ignore
        return False

    def is_valid_prediction_token(word: str, min_length: int = 2) -> bool:  # type: ignore
        return len(word) >= min_length

# ── onnxruntime-genai is an OPTIONAL dependency ─────────────────────────────
# The app must run identically whether or not it is installed.
try:
    import onnxruntime_genai as og  # type: ignore
    _OG_AVAILABLE = True
except Exception:
    og = None  # type: ignore
    _OG_AVAILABLE = False


_WORD_RE = re.compile(r"[A-Za-zऀ-ॿ']+")
# Stop the phrase completion at a natural boundary.
_PHRASE_STOP_RE = re.compile(r"[.!?\n]")


def onnx_genai_available() -> bool:
    """True if the optional onnxruntime-genai runtime is importable."""
    return _OG_AVAILABLE


class LocalLLMPredictor:
    """Thin, defensive wrapper around an onnxruntime-genai model directory.

    Usage:
        p = LocalLLMPredictor("python/ml/trained_models/qwen2.5-0.5b-onnx")
        if p.available:
            words  = p.next_words("I want to go to the ", prefix="ho", top_k=5)
            phrase = p.complete_phrase("I want to go to the ")
    """

    def __init__(
        self,
        model_dir: str,
        max_latency_ms: float = 250.0,
        max_new_tokens: int = 8,
        temperature: float = 0.7,
        top_k_sample: int = 40,
    ) -> None:
        self.model_dir = model_dir
        self.max_latency_ms = float(max_latency_ms)
        self.max_new_tokens = int(max_new_tokens)
        self.temperature = float(temperature)
        self.top_k_sample = int(top_k_sample)
        self._model = None
        self._tokenizer = None
        self._load_error: Optional[str] = None
        self._load()

    # ── loading ────────────────────────────────────────────────────────────
    def _load(self) -> None:
        if not _OG_AVAILABLE:
            self._load_error = "onnxruntime-genai not installed"
            return
        try:
            self._model = og.Model(self.model_dir)
            self._tokenizer = og.Tokenizer(self._model)
            logger.info("[LocalLLM] loaded model: %s", self.model_dir)
        except Exception as e:  # missing/invalid model dir → stay disabled
            self._model = None
            self._tokenizer = None
            self._load_error = f"{type(e).__name__}: {e}"
            logger.warning("[LocalLLM] could not load %s (%s)", self.model_dir, self._load_error)

    @property
    def available(self) -> bool:
        return self._model is not None and self._tokenizer is not None

    # ── low-level generation (single continuation) ─────────────────────────
    def _generate(self, prompt: str, max_new_tokens: int, temperature: float,
                  deadline: float) -> str:
        """Generate a short continuation of `prompt`, honoring a wall-clock
        deadline. Returns the newly-generated text (not the prompt). Any error
        or timeout returns ''. Written against the current onnxruntime-genai
        Python API with defensive fallbacks for older versions."""
        if not self.available:
            return ""
        try:
            input_tokens = self._tokenizer.encode(prompt)
            prompt_len = len(input_tokens)

            params = og.GeneratorParams(self._model)
            try:
                params.set_search_options(
                    max_length=prompt_len + max_new_tokens,
                    do_sample=temperature > 0.0,
                    temperature=max(0.01, temperature),
                    top_k=self.top_k_sample,
                )
            except Exception:
                # very old API: attributes instead of set_search_options
                try:
                    params.max_length = prompt_len + max_new_tokens  # type: ignore
                except Exception:
                    pass

            generator = og.Generator(self._model, params)

            # New API (>=0.4): append_tokens. Old API: params.input_ids + loop.
            try:
                generator.append_tokens(input_tokens)
            except Exception:
                try:
                    params.input_ids = input_tokens  # type: ignore
                except Exception:
                    return ""

            produced = 0
            while produced < max_new_tokens:
                if (time.perf_counter() * 1000.0) > deadline:
                    break
                try:
                    if generator.is_done():
                        break
                except Exception:
                    pass
                # Some versions need an explicit compute_logits() before step.
                try:
                    generator.compute_logits()
                except Exception:
                    pass
                generator.generate_next_token()
                produced += 1

            try:
                full = self._tokenizer.decode(generator.get_sequence(0))
            except Exception:
                # fallback: decode only the new tokens if the API differs
                try:
                    new_tokens = generator.get_sequence(0)[prompt_len:]
                    full = self._tokenizer.decode(new_tokens)
                    return full.strip()
                except Exception:
                    return ""
            # strip the prompt prefix to return only the continuation
            cont = full[len(prompt):] if full.startswith(prompt) else full
            return cont
        except Exception as e:  # never let generation break the caller
            logger.debug("[LocalLLM] generation error: %s", e)
            return ""

    # ── public: short-phrase completion ────────────────────────────────────
    def complete_phrase(self, context: str, max_words: int = 6) -> str:
        """Return a short, natural continuation of `context` (e.g.
        'I want to go to the ' → 'bathroom'), guardrail-filtered. '' on failure.
        Low temperature for a confident, single best phrase."""
        if not self.available or not context.strip():
            return ""
        deadline = time.perf_counter() * 1000.0 + self.max_latency_ms
        cont = self._generate(context, max_new_tokens=max_words * 2,
                              temperature=0.3, deadline=deadline)
        if not cont:
            return ""
        # cut at the first sentence boundary and to max_words words
        cut = _PHRASE_STOP_RE.split(cont, 1)[0]
        words = cut.split()[:max_words]
        phrase = " ".join(words).strip()
        # guardrail: drop the whole phrase if it contains a blocked word
        for w in _WORD_RE.findall(phrase.lower()):
            if is_blocked_prediction_word(w):
                return ""
        return phrase

    # ── public: top-k next words ────────────────────────────────────────────
    def next_words(self, context: str, prefix: str = "", top_k: int = 5) -> List[str]:
        """Return up to `top_k` candidate next words for `context`, completing
        `prefix` if given. Guardrail-filtered, de-duplicated, ranked by how
        often the model produced them across a few short samples. [] on failure.

        NOTE: this uses a small number of sampled continuations to gather
        diverse first-words. The Phase 0 benchmark measures whether this is fast
        enough on the target machine; if not, a single-pass top-k-from-logits
        fast path is the documented optimization (see the guide)."""
        if not self.available or (not context.strip() and not prefix):
            return []
        prefix_l = prefix.lower()
        deadline = time.perf_counter() * 1000.0 + self.max_latency_ms
        # If a prefix is being typed, bias the prompt with it so the model
        # completes the same word instead of jumping to the next one.
        prompt = context if not prefix else context + prefix
        counts: dict[str, int] = {}
        samples = 5
        for _ in range(samples):
            if (time.perf_counter() * 1000.0) > deadline:
                break
            cont = self._generate(prompt, max_new_tokens=2,
                                  temperature=self.temperature, deadline=deadline)
            if not cont:
                continue
            # first word of the continuation (prepend the prefix if we biased)
            m = _WORD_RE.search(cont)
            if not m:
                continue
            word = ((prefix + m.group(0)) if prefix else m.group(0)).lower()
            if prefix_l and not word.startswith(prefix_l):
                continue
            if not is_valid_prediction_token(word, min_length=2):
                continue
            counts[word] = counts.get(word, 0) + 1
        ranked = sorted(counts.items(), key=lambda kv: -kv[1])
        return [w for w, _ in ranked[:top_k]]
