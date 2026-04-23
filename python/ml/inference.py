"""
GazeConnect Neural Inference Engine
=====================================
Runs the trained CIFG-LSTM via ONNX Runtime for real-time prediction.
Designed for <20ms inference latency on CPU.

Features:
  - ONNX Runtime inference (CPU optimized)
  - Stateful: maintains LSTM hidden state across words in a sentence
  - Automatic state reset on sentence boundaries
  - Prefix filtering: only returns words matching typed prefix
  - Temperature-controlled sampling

Credits:
  - ONNX Runtime by Microsoft (https://onnxruntime.ai/)
"""

import os
import time
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from .vocabulary import Vocabulary
from prediction_guardrails import is_blocked_prediction_word

logger = logging.getLogger("gazeconnect.neural")

SCRIPT_DIR = Path(__file__).parent
MODEL_DIR = SCRIPT_DIR / "trained_models"


class NeuralPredictor:
    """
    ONNX-based neural next-word predictor.
    Thread-safe, non-blocking design — never stalls the prediction pipeline.

    Usage:
        predictor = NeuralPredictor()
        predictor.load()
        results = predictor.predict("I need", prefix="h", top_k=5)
        # → [("help", 0.42), ("him", 0.15), ("her", 0.12), ...]
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        vocab_path: Optional[str] = None,
        temperature: float = 0.8,
    ):
        self.model_path = model_path or str(MODEL_DIR / "gazeconnect_lm.onnx")
        self.quantized_path = str(MODEL_DIR / "gazeconnect_lm_quantized.onnx")
        self.vocab_path = vocab_path or str(MODEL_DIR / "vocabulary.json")
        self.temperature = temperature

        self.session = None
        self.vocab: Optional[Vocabulary] = None
        self.loaded = False
        self._idx_to_word: List[str] = []

        # LSTM state (maintained across words in a sentence)
        self.h_state: Optional[np.ndarray] = None
        self.c_state: Optional[np.ndarray] = None
        self.hidden_size = 512

        # Cache for recent predictions (key → results)
        self._cache: Dict[str, List[Tuple[str, float]]] = {}
        self._cache_max = 200

        # Performance: track last processed context to avoid re-processing
        self._last_context: Optional[str] = None
        self._last_probs: Optional[np.ndarray] = None

        # Hard timeout — never let neural prediction block UI
        self._max_latency_ms = 30.0

    def load(self) -> bool:
        """Load model and vocabulary. Returns True if successful."""
        try:
            import onnxruntime as ort

            # Prefer quantized model if available
            if os.path.exists(self.quantized_path):
                active_path = self.quantized_path
            elif os.path.exists(self.model_path):
                active_path = self.model_path
            else:
                logger.warning(f"Neural model not found at {self.model_path}")
                logger.warning("Run 'python -m ml.train' to train the model first.")
                return False

            # Load vocabulary
            if not os.path.exists(self.vocab_path):
                logger.warning(f"Vocabulary not found at {self.vocab_path}")
                return False

            self.vocab = Vocabulary.load(self.vocab_path)
            self._idx_to_word = [self.vocab.decode_idx(i) for i in range(self.vocab.size)]

            # Create ONNX Runtime session with CPU optimization
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess_options.intra_op_num_threads = 2  # Limit threads for background use
            sess_options.inter_op_num_threads = 1

            self.session = ort.InferenceSession(
                active_path,
                sess_options,
                providers=["CPUExecutionProvider"],
            )

            # Get hidden size from model
            for inp in self.session.get_inputs():
                if inp.name == "h_in":
                    self.hidden_size = inp.shape[1] if len(inp.shape) > 1 else 512

            self.reset_state()
            self.loaded = True

            model_size = os.path.getsize(active_path) / (1024 * 1024)
            logger.info(
                f"Neural model loaded: {os.path.basename(active_path)} "
                f"({model_size:.1f}MB, vocab={self.vocab.size})"
            )
            return True

        except ImportError:
            logger.warning("onnxruntime not installed. Neural predictions disabled.")
            logger.warning("Install with: pip install onnxruntime")
            return False
        except Exception as e:
            logger.error(f"Failed to load neural model: {e}")
            return False

    def reset_state(self):
        """Reset LSTM hidden state (call at sentence boundaries)."""
        self.h_state = np.zeros((1, self.hidden_size), dtype=np.float32)
        self.c_state = np.zeros((1, self.hidden_size), dtype=np.float32)
        self._cache.clear()
        self._last_context = None
        self._last_probs = None

    def predict(
        self,
        context: str,
        prefix: str = "",
        top_k: int = 10,
        temperature: Optional[float] = None,
    ) -> List[Tuple[str, float]]:
        """
        Predict next words given context. Optimized to avoid redundant ONNX calls.
        If the same context was processed before, reuses cached probability distribution.
        """
        if not self.loaded or self.session is None or self.vocab is None:
            return []

        t0 = time.perf_counter()

        # Check full result cache first
        cache_key = f"{context}|{prefix}|{top_k}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            # Get probability distribution (reuse if same context)
            probs = self._get_probs_for_context(context)
            if probs is None:
                return []

            # Bail if taking too long
            elapsed = (time.perf_counter() - t0) * 1000
            if elapsed > self._max_latency_ms:
                return []

            # Apply prefix filter if provided
            prefix_lower = prefix.lower().strip()
            results = []
            special = {"<PAD>", "<UNK>", "<BOS>", "<EOS>"}

            if prefix_lower:
                for idx, word in enumerate(self._idx_to_word):
                    if (word.startswith(prefix_lower) and word not in special
                            and len(word) > len(prefix_lower)
                            and not is_blocked_prediction_word(word)):
                        results.append((word, float(probs[idx])))
                results.sort(key=lambda x: x[1], reverse=True)
                results = results[:top_k]
            else:
                candidate_count = min(len(probs), max(top_k * 4, top_k))
                if candidate_count <= 0:
                    return []
                top_indices = np.argpartition(-probs, candidate_count - 1)[:candidate_count]
                top_indices = top_indices[np.argsort(-probs[top_indices])]
                for idx in top_indices:
                    idx = int(idx)
                    word = self._idx_to_word[idx]
                    if word not in special and not is_blocked_prediction_word(word):
                        results.append((word, float(probs[idx])))
                        if len(results) >= top_k:
                            break

            # Cache result
            if len(self._cache) >= self._cache_max:
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
            self._cache[cache_key] = results
            return results

        except Exception as e:
            logger.error(f"Neural prediction error: {e}")
            return []

    def _get_probs_for_context(self, context: str) -> Optional[np.ndarray]:
        """
        Run ONNX model on context and return probability distribution.
        Caches the result — if same context is requested again (e.g., different
        prefix filter), returns cached probs without re-running the model.

        IMPORTANT: Always starts from fresh zero state. The full context is
        provided each call, so we must NOT carry over hidden state from
        previous predictions — that caused "random" neural suggestions.
        """
        # Reuse if same context (common: same context, different prefix)
        if context == self._last_context and self._last_probs is not None:
            return self._last_probs

        tokens = self.vocab.encode(context, add_bos=True, add_eos=False)
        if not tokens:
            return None

        # Always start from clean zero state — the full context is re-processed
        # each call. Carrying over old h/c state caused compounding where context
        # from a previous prediction leaked into the current one.
        h = np.zeros((1, self.hidden_size), dtype=np.float32)
        c = np.zeros((1, self.hidden_size), dtype=np.float32)

        all_probs = None
        for token_id in tokens:
            input_ids = np.array([[token_id]], dtype=np.int64)
            outputs = self.session.run(
                None, {"input_ids": input_ids, "h_in": h, "c_in": c}
            )
            all_probs, h, c = outputs

        if all_probs is None:
            return None

        self._last_context = context
        self._last_probs = all_probs[0]
        return self._last_probs

    def predict_sentence_continuation(
        self, context: str, num_words: int = 4, temperature: float = 0.7
    ) -> str:
        """
        Generate a sentence continuation. Has a hard 40ms timeout
        to never block the UI. Reuses cached context probs when possible.
        """
        if not self.loaded or self.session is None or self.vocab is None:
            return ""

        # Check sentence continuation cache
        cont_cache_key = f"cont|{context}|{num_words}"
        if cont_cache_key in self._cache:
            cached = self._cache[cont_cache_key]
            return cached[0][0] if cached else ""

        t0 = time.perf_counter()

        try:
            tokens = self.vocab.encode(context, add_bos=True, add_eos=False)
            if not tokens:
                return ""

            h = np.zeros((1, self.hidden_size), dtype=np.float32)
            c = np.zeros((1, self.hidden_size), dtype=np.float32)

            # Process context tokens
            for token_id in tokens:
                input_ids = np.array([[token_id]], dtype=np.int64)
                outputs = self.session.run(
                    None, {"input_ids": input_ids, "h_in": h, "c_in": c}
                )
                probs, h, c = outputs

            # Generate continuation with hard timeout
            generated_words = []
            special_indices = {self.vocab.pad_idx, self.vocab.unk_idx, self.vocab.bos_idx}

            for _ in range(num_words):
                # Hard timeout check
                if (time.perf_counter() - t0) * 1000 > 40:
                    break

                prob_dist = probs[0].copy()
                for s in special_indices:
                    prob_dist[s] = 0

                eos_prob = prob_dist[self.vocab.eos_idx]
                if eos_prob > 0.3:
                    break
                prob_dist[self.vocab.eos_idx] = 0

                next_token = int(np.argmax(prob_dist))
                word = self.vocab.decode_idx(next_token)
                if is_blocked_prediction_word(word):
                    prob_dist[next_token] = 0
                    if prob_dist.sum() <= 0:
                        break
                    next_token = int(np.argmax(prob_dist))
                    word = self.vocab.decode_idx(next_token)
                if word in ("<PAD>", "<UNK>", "<BOS>", "<EOS>"):
                    break
                if is_blocked_prediction_word(word):
                    break

                generated_words.append(word)

                input_ids = np.array([[next_token]], dtype=np.int64)
                outputs = self.session.run(
                    None, {"input_ids": input_ids, "h_in": h, "c_in": c}
                )
                probs, h, c = outputs

            result = " ".join(generated_words)

            # Cache the result
            if len(self._cache) >= self._cache_max:
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
            self._cache[cont_cache_key] = [(result, 1.0)]

            return result

        except Exception as e:
            logger.error(f"Sentence continuation error: {e}")
            return ""

    def get_word_probabilities(
        self, context: str, candidates: List[str]
    ) -> Dict[str, float]:
        """
        Get neural probability for specific candidate words.
        Used by the fusion engine to weight n-gram candidates.

        Args:
            context: Text typed so far
            candidates: List of candidate words to score

        Returns:
            Dict mapping word → neural probability
        """
        if not self.loaded or self.session is None or self.vocab is None:
            return {}

        try:
            tokens = self.vocab.encode(context, add_bos=True, add_eos=False)
            if not tokens:
                return {}

            h = np.zeros((1, self.hidden_size), dtype=np.float32)
            c = np.zeros((1, self.hidden_size), dtype=np.float32)

            for token_id in tokens:
                input_ids = np.array([[token_id]], dtype=np.int64)
                outputs = self.session.run(
                    None, {"input_ids": input_ids, "h_in": h, "c_in": c}
                )
                probs, h, c = outputs

            prob_dist = probs[0]
            result = {}
            for word in candidates:
                idx = self.vocab.encode_word(word)
                if idx != self.vocab.unk_idx:
                    result[word] = float(prob_dist[idx])
                else:
                    result[word] = 0.0

            return result

        except Exception as e:
            logger.error(f"Word probability error: {e}")
            return {}

    @property
    def is_available(self) -> bool:
        """Check if neural predictions are available."""
        return self.loaded and self.session is not None

    def get_info(self) -> dict:
        """Get model information."""
        if not self.loaded:
            return {"status": "not_loaded"}

        model_path = self.quantized_path if os.path.exists(self.quantized_path) else self.model_path
        return {
            "status": "loaded",
            "model": os.path.basename(model_path),
            "model_size_mb": round(os.path.getsize(model_path) / (1024*1024), 2),
            "vocab_size": self.vocab.size if self.vocab else 0,
            "hidden_size": self.hidden_size,
            "temperature": self.temperature,
        }
