"""
GazeConnect Prediction Fusion Engine
======================================
Combines n-gram statistical predictions with neural CIFG-LSTM predictions
using context-conditioned linear interpolation.

Algorithm:
  P(word | context) = λ_nn * P_neural(word) + λ_ngram * P_ngram(word)

  Where λ weights dynamically shift based on:
  - N-gram confidence: if strong n-gram match → boost λ_ngram
  - Novel context: if weak/no n-gram match → boost λ_nn
  - Patient history: always prioritizes learned patient-specific patterns

Credits:
  - Linear interpolation: Jelinek & Mercer (1980)
  - Context-conditioned interpolation: inspired by Kneser-Ney backoff
"""

import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("gazeconnect.fusion")


class PredictionFusion:
    """
    Fuses n-gram and neural predictions using adaptive interpolation.

    The fusion weights dynamically adjust:
    - Strong n-gram context (frequent pattern) → 70% n-gram, 30% neural
    - Weak n-gram context (novel sentence)    → 30% n-gram, 70% neural
    - Patient-specific words always get boosted regardless of source
    """

    # Default interpolation weights
    # N-gram is primary (personalized, deterministic), neural supplements
    DEFAULT_NEURAL_WEIGHT = 0.25   # λ_nn base weight
    DEFAULT_NGRAM_WEIGHT = 0.75    # λ_ngram base weight

    # Dynamic weight bounds
    MIN_NEURAL_WEIGHT = 0.10       # Never go below this (neural always contributes)
    MAX_NEURAL_WEIGHT = 0.50       # Cap neural influence (n-gram always dominant)
    MIN_NGRAM_WEIGHT = 0.50        # N-gram always contributes at least 50%
    MAX_NGRAM_WEIGHT = 0.90        # Cap n-gram influence

    # Patient history boost
    PATIENT_HISTORY_BOOST = 1.8    # Boost for words from patient's learned history

    # Score thresholds
    STRONG_NGRAM_THRESHOLD = 0.15  # N-gram score above this = strong context
    WEAK_NGRAM_THRESHOLD = 0.03    # N-gram score below this = weak context

    def __init__(
        self,
        neural_weight: float = DEFAULT_NEURAL_WEIGHT,
        ngram_weight: float = DEFAULT_NGRAM_WEIGHT,
    ):
        self.base_neural_weight = neural_weight
        self.base_ngram_weight = ngram_weight

    def fuse(
        self,
        ngram_predictions: List[Tuple[str, float]],
        neural_predictions: List[Tuple[str, float]],
        patient_words: Optional[set] = None,
        context_strength: Optional[float] = None,
    ) -> List[Tuple[str, float]]:
        """
        Fuse n-gram and neural predictions into a single ranked list.

        Args:
            ngram_predictions: [(word, score), ...] from n-gram model
            neural_predictions: [(word, probability), ...] from neural model
            patient_words: Set of words from patient's learned history
            context_strength: Optional override for n-gram context confidence (0-1)

        Returns:
            Fused predictions as [(word, fused_score), ...] sorted by score
        """
        if not neural_predictions:
            return ngram_predictions

        if not ngram_predictions:
            # Neural-only predictions (fallback)
            return [(w, s * self.base_neural_weight) for w, s in neural_predictions]

        # Determine dynamic weights
        lambda_nn, lambda_ng = self._compute_weights(
            ngram_predictions, context_strength
        )

        # Build score maps
        ngram_scores: Dict[str, float] = {}
        for word, score in ngram_predictions:
            ngram_scores[word] = score

        neural_scores: Dict[str, float] = {}
        for word, prob in neural_predictions:
            neural_scores[word] = prob

        # Normalize scores to [0, 1] range for fair interpolation
        ngram_max = max(ngram_scores.values()) if ngram_scores else 1.0
        neural_max = max(neural_scores.values()) if neural_scores else 1.0

        if ngram_max > 0:
            ngram_normalized = {w: s / ngram_max for w, s in ngram_scores.items()}
        else:
            ngram_normalized = ngram_scores

        if neural_max > 0:
            neural_normalized = {w: s / neural_max for w, s in neural_scores.items()}
        else:
            neural_normalized = neural_scores

        # Fuse candidates. Neural-only words (not in n-gram) must have
        # strong probability (>= 5% of top neural prob) to be included.
        # This prevents low-quality neural words from leaking in.
        NEURAL_ONLY_MIN_THRESHOLD = 0.05  # 5% of top neural probability
        all_words = set(ngram_scores.keys())
        for word, prob in neural_scores.items():
            norm_prob = neural_normalized.get(word, 0.0)
            if word in ngram_scores or norm_prob >= NEURAL_ONLY_MIN_THRESHOLD:
                all_words.add(word)

        fused: Dict[str, float] = {}

        for word in all_words:
            ng_score = ngram_normalized.get(word, 0.0)
            nn_score = neural_normalized.get(word, 0.0)

            # Linear interpolation
            fused_score = lambda_ng * ng_score + lambda_nn * nn_score

            # Patient history boost
            if patient_words and word in patient_words:
                fused_score *= self.PATIENT_HISTORY_BOOST

            # Source bonus: words appearing in BOTH models get a confidence boost
            if word in ngram_scores and word in neural_scores:
                fused_score *= 1.15  # 15% agreement bonus

            fused[word] = fused_score

        # Sort by fused score, descending
        results = sorted(fused.items(), key=lambda x: x[1], reverse=True)
        return results

    def _compute_weights(
        self,
        ngram_predictions: List[Tuple[str, float]],
        context_strength: Optional[float] = None,
    ) -> Tuple[float, float]:
        """
        Compute context-conditioned interpolation weights.

        Strong n-gram context → trust n-grams more
        Weak n-gram context   → trust neural more
        """
        if context_strength is not None:
            # Direct override
            lambda_ng = self.MIN_NGRAM_WEIGHT + context_strength * (
                self.MAX_NGRAM_WEIGHT - self.MIN_NGRAM_WEIGHT
            )
            lambda_nn = 1.0 - lambda_ng
            return max(lambda_nn, self.MIN_NEURAL_WEIGHT), lambda_ng

        # Assess n-gram confidence from top prediction score
        if ngram_predictions:
            top_score = ngram_predictions[0][1]

            if top_score > self.STRONG_NGRAM_THRESHOLD:
                # Strong n-gram context → trust n-grams
                lambda_ng = 0.70
                lambda_nn = 0.30
            elif top_score < self.WEAK_NGRAM_THRESHOLD:
                # Weak n-gram context → trust neural
                lambda_ng = 0.30
                lambda_nn = 0.70
            else:
                # Medium confidence → balanced
                lambda_ng = self.base_ngram_weight
                lambda_nn = self.base_neural_weight
        else:
            lambda_ng = self.MIN_NGRAM_WEIGHT
            lambda_nn = self.MAX_NEURAL_WEIGHT

        return lambda_nn, lambda_ng

    def fuse_sentence_predictions(
        self,
        template_sentences: List[Tuple[str, float]],
        neural_continuation: str,
        context: str,
    ) -> List[Tuple[str, float]]:
        """
        Fuse template-based sentence predictions with neural sentence continuation.

        The neural continuation is added as an additional candidate if it's
        substantially different from existing template matches.

        Args:
            template_sentences: [(sentence, score), ...] from template matcher
            neural_continuation: Generated continuation from neural model
            context: The text typed so far

        Returns:
            Combined sentence predictions
        """
        if not neural_continuation or len(neural_continuation.strip()) < 3:
            return template_sentences

        # Build the full predicted sentence
        full_neural = f"{context.strip()} {neural_continuation}".strip()

        # Check if neural prediction is substantially different from templates
        is_novel = True
        for sent, _ in template_sentences:
            # Simple overlap check
            sent_words = set(sent.lower().split())
            neural_words = set(full_neural.lower().split())
            overlap = len(sent_words & neural_words) / max(len(sent_words), 1)
            if overlap > 0.7:
                is_novel = False
                break

        results = list(template_sentences)

        if is_novel and len(results) < 5:
            # Add neural prediction with moderate score
            base_score = results[-1][1] * 0.9 if results else 1.0
            results.append((full_neural, base_score))

        return results
