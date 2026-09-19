"""Legacy-compatible surface for the backend while the deterministic engine is active.

main.py historically called methods on WordPredictionEngine for abbreviations,
Settings data and learning. This facade answers the same calls WITHOUT building
the legacy n-gram predictor or loading the ONNX model, so the deterministic
engine is the only word ranker running. The legacy engine remains selectable
as a rollback (`--prediction-engine legacy`).
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from .learning import PredictionLearningStore
from .service import ENGINE_VERSION, EnglishOnlyText

logger = logging.getLogger('GazeConnect')

CUSTOM_ABBREVIATIONS_FILE = Path('patient_data') / 'custom_abbreviations.json'
CAREGIVER_WORDS_FILE = Path('patient_data') / 'caregiver_words.v1.json'


class DeterministicPredictionFacade:
    def __init__(
        self,
        store: PredictionLearningStore,
        data_dir: Path,
        legacy_data_dirs: Sequence[Path],
        english_only: EnglishOnlyText,
        enable_neural_sentence_continuation: bool = False,
    ):
        from services import word_prediction as legacy  # constants only; the class is never built
        self._legacy = legacy
        self.store = store
        self.data_dir = Path(data_dir)
        self.legacy_data_dirs = [Path(d) for d in legacy_data_dirs]
        self.english_only = english_only
        self._custom_abbreviations: Dict[str, str] = {}
        self._neural_enabled = enable_neural_sentence_continuation
        self._neural = None
        self._load_custom_abbreviations()

    # ------------------------------------------------------------ learning
    def learn_word(self, word: str, text_before: Optional[str] = None, text_after: Optional[str] = None,
                   context: Optional[Sequence[str]] = None) -> None:
        self.store.record_accepted_word(word or '', text_before, text_after, context)

    def learn_sentence(self, sentence: str) -> None:
        self.store.record_spoken(sentence or '')

    def add_custom_word(self, word: str) -> bool:
        """Settings "add word": an explicit caregiver word, not a usage count."""
        from prediction_guardrails import is_valid_prediction_token, normalize_prediction_word
        normalized = normalize_prediction_word(word or '')
        if not is_valid_prediction_token(normalized, min_length=2) or not self.english_only.allows(normalized):
            return False
        words = self.caregiver_words()
        if normalized not in words:
            words.append(normalized)
            self._write_json(self.data_dir / CAREGIVER_WORDS_FILE, {'schemaVersion': 1, 'words': words})
        return True

    def caregiver_words(self) -> List[str]:
        data = self._read_json(self.data_dir / CAREGIVER_WORDS_FILE) or {}
        return [w for w in data.get('words', []) if isinstance(w, str)]

    def caregiver_content_items(self) -> List[Dict[str, Any]]:
        return [{'id': f'caregiver-{word}', 'text': word, 'kind': 'word', 'enabled': True, 'order': index}
                for index, word in enumerate(self.caregiver_words())]

    def learn_from_chat_history(self, chat_dir: str) -> None:
        """Not used by the deterministic engine: auto-saved chat logs can hold unfinished drafts."""
        return None

    def save(self) -> None:
        self.store.save()

    def load(self) -> None:
        self.store.load()

    # -------------------------------------------------------- abbreviations
    def _abbreviation_paths(self) -> List[Path]:
        return [self.data_dir / CUSTOM_ABBREVIATIONS_FILE] + [d / CUSTOM_ABBREVIATIONS_FILE for d in self.legacy_data_dirs]

    def _load_custom_abbreviations(self) -> None:
        merged: Dict[str, str] = {}
        for path in reversed(self._abbreviation_paths()):  # managed location wins
            data = self._read_json(path)
            if isinstance(data, dict):
                merged.update({str(k).lower(): str(v) for k, v in data.items() if isinstance(v, str)})
        self._custom_abbreviations = merged

    def expand_abbreviation(self, abbrev: str) -> Optional[str]:
        key = (abbrev or '').strip().lower()
        expansion = self._custom_abbreviations.get(key) or self._legacy.ABBREVIATIONS.get(key)
        return expansion if expansion and self.english_only.allows(expansion) else None

    def add_custom_abbreviation(self, abbrev: str, expansion: str) -> bool:
        key, text = (abbrev or '').strip().lower(), (expansion or '').strip()
        if len(key) < 2 or not text:
            return False
        self._custom_abbreviations[key] = text
        self._write_json(self.data_dir / CUSTOM_ABBREVIATIONS_FILE, self._custom_abbreviations)
        return True

    def remove_custom_abbreviation(self, abbrev: str) -> bool:
        key = (abbrev or '').strip().lower()
        if key not in self._custom_abbreviations:
            return False
        del self._custom_abbreviations[key]
        self._write_json(self.data_dir / CUSTOM_ABBREVIATIONS_FILE, self._custom_abbreviations)
        return True

    def get_all_abbreviations(self) -> Dict[str, str]:
        merged = {k: v for k, v in self._legacy.ABBREVIATIONS.items() if self.english_only.allows(v)}
        merged.update(self._custom_abbreviations)
        return merged

    def get_custom_abbreviations(self) -> Dict[str, str]:
        return dict(self._custom_abbreviations)

    def suggest_abbreviation(self, sentence: str) -> Optional[Dict[str, str]]:
        return None

    # ------------------------------------------------------------- Settings
    def get_dictionary_data(self) -> Dict[str, Any]:
        snapshot = self.store.snapshot()
        accepted = snapshot['acceptedWords']
        recent = sorted(snapshot['acceptedWordLastUsedAt'].items(), key=lambda item: item[1])
        words = sorted(set(accepted) | set(self.caregiver_words()))
        abbreviations = self.get_all_abbreviations()
        return {
            'custom_words': words,
            'abbreviations': abbreviations,
            'custom_abbreviations': self.get_custom_abbreviations(),
            'recent_words': [word for word, _ in recent][-50:],
            'word_count': len(words),
            'abbreviation_count': len(abbreviations),
            'prediction_engine': ENGINE_VERSION,
        }

    def get_builtin_data(self) -> Dict[str, Any]:
        legacy = self._legacy
        english = lambda words: sorted(w for w in words if self.english_only.allows(w))  # noqa: E731
        return {
            'core_vocabulary': english(legacy.CORE_VOCABULARY),
            'medical_vocabulary': english(legacy.MEDICAL_VOCABULARY),
            'patient_vocabulary': english(legacy.PATIENT_VOCABULARY),
            'cultural_vocabulary': english(legacy.CULTURAL_VOCABULARY),
            'training_corpus': [],
            'prediction_engine': ENGINE_VERSION,
            'prediction_engine_note': 'Word suggestions use the deterministic GazeCompass port; the legacy corpus is not used.',
        }

    def get_phrase_suggestions(self, category: Optional[str] = None) -> List[str]:
        phrases = self._legacy.AAC_PHRASES
        if category and category in phrases:
            return [p for p in phrases[category] if self.english_only.allows(p)]
        collected: List[str] = []
        for items in phrases.values():
            collected.extend([p for p in items if self.english_only.allows(p)][:3])
        return collected[:15]

    def get_neural_model_info(self) -> Dict[str, Any]:
        if not self._neural_enabled:
            return {'status': 'not_loaded', 'reason': 'Deterministic word prediction is active; neural sentence continuation is off.'}
        predictor = self._neural_predictor()
        return predictor.get_info() if predictor else {'status': 'not_loaded', 'reason': 'Model unavailable'}

    def predict_sentence_neural(self, context: str, num_words: int = 4) -> str:
        if not self._neural_enabled:
            return ''
        predictor = self._neural_predictor()
        if predictor is None:
            return ''
        try:
            return predictor.predict_sentence_continuation(context, num_words=num_words)
        except Exception:
            return ''

    def _neural_predictor(self):
        if self._neural is None:
            try:
                from ml.inference import NeuralPredictor
                predictor = NeuralPredictor()
                self._neural = predictor if predictor.load() else False
            except Exception as error:  # onnxruntime missing or model absent
                logger.info(f'Neural sentence continuation unavailable: {error}')
                self._neural = False
        return self._neural or None

    # ---------------------------------------------------------------- files
    @staticmethod
    def _read_json(path: Path) -> Any:
        try:
            if path.is_file():
                return json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
        return None

    @staticmethod
    def _write_json(path: Path, payload: Any) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            handle, temp_name = tempfile.mkstemp(prefix='.tmp-', suffix='.json', dir=str(path.parent))
            with os.fdopen(handle, 'w', encoding='utf-8') as stream:
                json.dump(payload, stream, ensure_ascii=False, indent=2)
            os.replace(temp_name, path)
        except OSError as error:
            logger.warning(f'Could not save {path.name}: {error}')
