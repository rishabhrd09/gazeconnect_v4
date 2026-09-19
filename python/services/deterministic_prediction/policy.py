"""Word-slot content policy.

Two layers, kept separate so the reference behaviour stays testable:

1. ``ReferenceWordPolicy`` ports GazeCompass predictionSafety.v1.ts exactly:
   never-suggested words (slurs, profanity, sexual slang and the owner's
   2026-09-07 anatomy removals) are never offered; clinical/safeguarding and
   personal-expression words are context gated (two typed letters, one letter
   when locally personalised, or clinical words in a sensitive context).

2. ``GazeConnectWordPolicy`` adds this application's own rules on top, without
   relaxing anything the reference blocks:
   * every token in python/prediction_guardrails.py stays blocked from word
     slots (current GazeConnect protection coverage is kept, including the
     entries that conflict with symptom/safeguarding language; see
     docs/deterministic-prediction/README.md "Guardrail conflicts");
   * English-only display: romanized Hindi/Hinglish tokens retained in legacy
     learning/history are withheld from suggestions (never deleted from storage).
     Devanagari cannot reach a word slot at all (the engine only admits a-z).

A word that is blocked here can still be typed letter by letter.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, FrozenSet, Iterable, Optional

CATEGORY_NEVER = 'never-suggested'
CATEGORY_ORDINARY = 'ordinary'
CATEGORY_CLINICAL = 'context-gated-clinical-or-safeguarding'
CATEGORY_PERSONAL = 'context-gated-personal-expression'


class ReferenceWordPolicy:
    """Exact port of isPredictionWordPolicyEligible / predictionWordPolicyCategory."""

    name = 'reference'

    def __init__(self, never: Iterable[str], clinical: Iterable[str], personal: Iterable[str]):
        self.never: FrozenSet[str] = frozenset(never)
        self.clinical: FrozenSet[str] = frozenset(clinical)
        self.personal: FrozenSet[str] = frozenset(personal)

    def category(self, word: str) -> str:
        if word in self.never:
            return CATEGORY_NEVER
        if word in self.clinical:
            return CATEGORY_CLINICAL
        if word in self.personal:
            return CATEGORY_PERSONAL
        return CATEGORY_ORDINARY

    def extra_blocked(self, word: str) -> bool:
        return False

    def eligible(self, word: str, prefix_length: int, personalized: bool, sensitive_context: bool) -> bool:
        category = self.category(word)
        if category == CATEGORY_NEVER:
            return False
        if self.extra_blocked(word):
            return False
        if category == CATEGORY_ORDINARY:
            return True
        if prefix_length >= 2:
            return True
        if personalized and prefix_length >= 1:
            return True
        return category == CATEGORY_CLINICAL and sensitive_context


def _default_english_only_path() -> Path:
    return Path(__file__).resolve().parent / 'english_only_policy.v1.json'


def load_english_only_withheld(path: Optional[Path] = None) -> FrozenSet[str]:
    source = path or _default_english_only_path()
    data = json.loads(source.read_text(encoding='utf-8'))
    return frozenset(data['withheldRomanizedHindi'])


class GazeConnectWordPolicy(ReferenceWordPolicy):
    """Reference policy plus GazeConnect guardrails and the English-only display rule."""

    name = 'gazeconnect'

    def __init__(
        self,
        never: Iterable[str],
        clinical: Iterable[str],
        personal: Iterable[str],
        guardrail_blocked: Callable[[str], bool],
        withheld_non_english: Iterable[str],
    ):
        super().__init__(never, clinical, personal)
        self._guardrail_blocked = guardrail_blocked
        self.withheld_non_english: FrozenSet[str] = frozenset(withheld_non_english)

    def extra_blocked(self, word: str) -> bool:
        return word in self.withheld_non_english or self._guardrail_blocked(word)

    def is_display_english(self, word: str) -> bool:
        return word not in self.withheld_non_english
