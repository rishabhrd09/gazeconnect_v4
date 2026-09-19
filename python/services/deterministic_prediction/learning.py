"""Committed-use learning state for the deterministic word predictor.

What is learned, and when (mirrors the reference Spell app):
  * a word prediction the person ACCEPTED: +1 for that word;
  * a message the person SPOKE: +1 for every word in it;
  * a word the person explicitly inserted otherwise (a Quick Word, or the Zone
    Board's Space confirmation of a typed word): +1.
Nothing is learned from displaying, hovering or dwell progress.

Recency is a persisted commit sequence number, not the wall clock: the ranker
only uses relative recency, so a counter gives the same order without making
results depend on the system clock.

Storage is local JSON (`patient_data/deterministic_prediction_state.v1.json`),
bounded (1,000 words, counts capped at 10,000, 512 continuation events) and
written atomically. The first load migrates the legacy engine's history
read-only; legacy files are never modified or deleted, so the legacy engine can
still be selected as a rollback.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .jsutil import current_prefix, drop_utf16_tail, normalize_word, words_in
from .personal_continuations import (
    apply_continuation_edit,
    empty_personal_continuations,
    normalize_personal_continuations,
)

STATE_FILE_NAME = 'deterministic_prediction_state.v1.json'
SCHEMA_VERSION = 1
MAX_ACCEPTED_WORDS = 1000
MAX_WORD_COUNT = 10000
MAX_UNDO_JOURNAL = 32
_WORD = re.compile(r"[a-z]+(?:'[a-z]+)?")


def _bounded(words: Mapping[str, Any], last_used: Mapping[str, Any]) -> Tuple[Dict[str, int], Dict[str, int]]:
    """boundAcceptedWords / boundAcceptedWordLastUsedAt from the reference session store."""
    if not isinstance(words, dict) or not isinstance(last_used, dict):
        raise ValueError('invalid learned word maps')
    counted = []
    for word, count in words.items():
        if not isinstance(word, str) or not _WORD.fullmatch(word):
            continue
        if isinstance(count, bool) or not isinstance(count, (int, float)) or not count > 0 or (isinstance(count, float) and not math.isfinite(count)):
            continue
        counted.append((word, min(int(count), MAX_WORD_COUNT)))
    counted.sort(key=lambda item: (-item[1], item[0]))
    bounded_words = dict(counted[:MAX_ACCEPTED_WORDS])
    stamps = []
    for word, stamp in last_used.items():
        key = word.strip().lower()
        if not key or key not in bounded_words:
            continue
        if isinstance(stamp, bool) or not isinstance(stamp, (int, float)) or not stamp > 0 or (isinstance(stamp, float) and not math.isfinite(stamp)):
            continue
        stamps.append((key, int(stamp)))
    stamps.sort(key=lambda item: (-item[1], item[0]))
    return bounded_words, dict(stamps[:MAX_ACCEPTED_WORDS])


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def migrate_legacy_history(candidate_dirs: Sequence[Path]) -> Tuple[Dict[str, int], Dict[str, int], Dict[str, Any]]:
    """Read the legacy engine's learned words without modifying them.

    Sources (first directory that has them wins):
      custom_dictionary.json            user_frequencies -> accepted counts,
                                        recent_words order -> relative recency
      patient_data/recency_scores.json  latest use per word -> relative recency
    Legacy bigrams are not converted: personal continuations are opt-in and
    default off, and inventing continuation events from them would change
    rankings nobody enabled.
    """
    report: Dict[str, Any] = {'from': None, 'sourceFiles': {}, 'words': 0}
    for directory in candidate_dirs:
        dictionary = directory / 'custom_dictionary.json'
        if not dictionary.is_file():
            continue
        try:
            data = json.loads(dictionary.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict) or not isinstance(data.get('user_frequencies', {}), dict):
            continue
        counts: Dict[str, int] = {}
        for raw_word, freq in (data.get('user_frequencies') or {}).items():
            word = normalize_word(str(raw_word))
            if not _WORD.fullmatch(word) or isinstance(freq, bool) or not isinstance(freq, (int, float)) or freq <= 0 or (isinstance(freq, float) and not math.isfinite(freq)):
                continue
            counts[word] = min(MAX_WORD_COUNT, counts.get(word, 0) + int(freq))
        order: Dict[str, float] = {}
        recency_path = directory / 'patient_data' / 'recency_scores.json'
        if recency_path.is_file():
            try:
                usage = json.loads(recency_path.read_text(encoding='utf-8'))
                for raw_word, stamps in usage.items():
                    word = normalize_word(str(raw_word))
                    numeric = [s for s in stamps if isinstance(s, (int, float)) and not isinstance(s, bool) and s > 0 and (not isinstance(s, float) or math.isfinite(s))]
                    if word in counts and numeric:
                        order[word] = max(numeric)
                report['sourceFiles']['patient_data/recency_scores.json'] = _file_sha256(recency_path)
            except (OSError, ValueError, AttributeError, TypeError):
                pass
        raw_recent = data.get('recent_words')
        recent = [normalize_word(str(w)) for w in raw_recent] if isinstance(raw_recent, list) else []
        base = max(order.values(), default=0.0)
        for position, word in enumerate(recent):  # oldest first, newest last
            if word in counts and word not in order:
                order[word] = base + 1 + position
        # Relative recency survives as commit sequence numbers 1..n (newest largest).
        sequence = {word: rank + 1 for rank, (word, _) in enumerate(sorted(order.items(), key=lambda item: (item[1], item[0])))}
        bounded_words, bounded_stamps = _bounded(counts, sequence)
        report.update({'from': str(directory), 'words': len(bounded_words)})
        report['sourceFiles']['custom_dictionary.json'] = _file_sha256(dictionary)
        return bounded_words, bounded_stamps, report
    return {}, {}, report


class PredictionLearningStore:
    """Thread-safe, bounded learned state. `version` changes on every mutation."""

    def __init__(self, directory: Path, legacy_dirs: Sequence[Path] = (), continuations_enabled: bool = False):
        self.directory = Path(directory)
        self.path = self.directory / STATE_FILE_NAME
        self._legacy_dirs = [Path(d) for d in legacy_dirs]
        self._lock = threading.RLock()
        self._accepted: Dict[str, int] = {}
        self._last_used: Dict[str, int] = {}
        self._sequence = 0
        self._continuations = empty_personal_continuations()
        self._journal: List[Dict[str, Any]] = []
        self._migration: Dict[str, Any] = {}
        self._dirty = False
        self.version = 0
        self._continuations_enabled_default = continuations_enabled

    # ------------------------------------------------------------ persistence
    def load(self) -> None:
        with self._lock:
            if self.path.is_file():
                try:
                    data = json.loads(self.path.read_text(encoding='utf-8'))
                    if not isinstance(data, dict) or data.get('schemaVersion') != SCHEMA_VERSION:
                        raise ValueError('unsupported schema')
                    self._accepted, self._last_used = _bounded(data.get('acceptedWords') or {}, data.get('acceptedWordLastUsedAt') or {})
                    self._sequence = max([int(data.get('commitSequence') or 0), *self._last_used.values()], default=0)
                    self._continuations = normalize_personal_continuations(data.get('personalContinuations'))
                    self._migration = data.get('migration') or {}
                    self.version += 1
                    return
                except (OSError, ValueError, TypeError, OverflowError):
                    # Keep the unreadable file for inspection; start from a migration.
                    try:
                        os.replace(self.path, self.path.with_suffix('.unreadable.json'))
                    except OSError:
                        pass
            words, stamps, report = migrate_legacy_history(self._legacy_dirs)
            self._accepted, self._last_used = words, stamps
            self._sequence = max(stamps.values(), default=0)
            self._continuations = empty_personal_continuations()
            self._continuations['enabled'] = self._continuations_enabled_default
            self._migration = {'schemaVersion': SCHEMA_VERSION, **report}
            self._dirty = True
            self.version += 1
            self.save()

    def save(self) -> None:
        with self._lock:
            if not self._dirty:
                return
            payload = {
                'schemaVersion': SCHEMA_VERSION,
                'engine': 'gazecompass-deterministic-word-prediction',
                'acceptedWords': self._accepted,
                'acceptedWordLastUsedAt': self._last_used,
                'commitSequence': self._sequence,
                'personalContinuations': self._continuations,
                'migration': self._migration,
            }
            temp_name = None
            try:
                self.directory.mkdir(parents=True, exist_ok=True)
                handle, temp_name = tempfile.mkstemp(prefix='.prediction-state-', suffix='.json', dir=str(self.directory))
                with os.fdopen(handle, 'w', encoding='utf-8') as stream:
                    json.dump(payload, stream, ensure_ascii=False, separators=(',', ':'))
                os.replace(temp_name, self.path)
                self._dirty = False
            except OSError:
                pass  # The in-memory state stays valid; the next save retries.
            finally:
                if temp_name is not None:
                    try:
                        os.unlink(temp_name)
                    except OSError:
                        pass

    # ---------------------------------------------------------------- reading
    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                'version': self.version,
                'acceptedWords': dict(self._accepted),
                'acceptedWordLastUsedAt': dict(self._last_used),
                'personalContinuations': {
                    **self._continuations,
                    'events': [dict(event, context=list(event['context'])) for event in self._continuations['events']],
                    'anchors': [dict(anchor) for anchor in self._continuations['anchors']],
                },
            }

    def migration_report(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._migration)

    # --------------------------------------------------------------- learning
    def _count(self, words: Iterable[str]) -> List[Tuple[str, Optional[int], bool]]:
        self._sequence += 1
        changes = []
        for word in words:
            previous_stamp = self._last_used.get(word)
            existed = word in self._accepted
            self._accepted[word] = min(MAX_WORD_COUNT, self._accepted.get(word, 0) + 1)
            self._last_used[word] = self._sequence
            changes.append((word, previous_stamp, existed))
        self._accepted, self._last_used = _bounded(self._accepted, self._last_used)
        self._dirty = True
        self.version += 1
        return changes

    def record_accepted_word(self, word: str, text_before: Optional[str] = None, text_after: Optional[str] = None,
                             context: Optional[Sequence[str]] = None) -> bool:
        tokens = words_in(normalize_word(word))
        if len(tokens) != 1:
            return False
        token = tokens[0]
        with self._lock:
            previous_count = self._accepted.get(token, 0)
            changes = self._count([token])
            # The draft keeps the inserted spelling ("call Papa "); the token is normalised.
            inserted = text_after is not None and text_after[-(len(token) + 1):].lower() == f'{token} '
            if text_before is not None and inserted:
                end = len(text_after) - 1
                self._journal.append({'word': token, 'start': end - len(token), 'end': end,
                                      'previousStamp': changes[0][1], 'commitStamp': self._sequence,
                                      'counted': self._accepted.get(token, 0) > previous_count})
                self._journal = self._journal[-MAX_UNDO_JOURNAL:]
                self._continuations = apply_continuation_edit(
                    self._continuations, text_before, text_after, word=token, context=list(context or ()))
            return True

    def record_spoken(self, sentence: str) -> int:
        tokens = [token for token in words_in(sentence)]
        if not tokens:
            return 0
        with self._lock:
            self._count(tokens)
            return len(tokens)

    def undo_removed_words(self, text_before: str, text_after: str) -> List[str]:
        """Explicit Delete Word: forget acceptances whose word was just removed."""
        if not text_before.startswith(text_after) or len(text_after) >= len(text_before):
            return []
        undone = []
        with self._lock:
            kept = []
            # Unwind newest first so repeated acceptances restore recency in order.
            for entry in reversed(self._journal):
                removed = entry['end'] > len(text_after) and text_before[entry['start']:entry['end']].lower() == entry['word']
                if not removed:
                    kept.append(entry)
                    continue
                word = entry['word']
                remaining = self._accepted.get(word, 0) - int(entry['counted'])
                if remaining <= 0:
                    self._accepted.pop(word, None)
                    self._last_used.pop(word, None)
                else:
                    self._accepted[word] = remaining
                    # Later spoken/accepted uses are independent commits and survive.
                    if self._last_used.get(word) == entry['commitStamp']:
                        if entry['previousStamp'] is None:
                            self._last_used.pop(word, None)
                        else:
                            self._last_used[word] = entry['previousStamp']
                undone.append(word)
            self._journal = list(reversed(kept))
            if undone:
                self._continuations = apply_continuation_edit(self._continuations, text_before, text_after, undo=True)
                self._dirty = True
                self.version += 1
            return undone

    def reset(self) -> None:
        """Forget learned words (explicit caregiver action). Legacy files are untouched."""
        with self._lock:
            self._accepted.clear()
            self._last_used.clear()
            self._journal.clear()
            enabled = self._continuations.get('enabled', False)
            self._continuations = empty_personal_continuations()
            self._continuations['enabled'] = enabled
            self._migration = {**self._migration, 'resetAfterMigration': True}
            self._dirty = True
            self.version += 1

    def set_continuations_enabled(self, enabled: bool) -> None:
        with self._lock:
            self._continuations = {**empty_personal_continuations(), 'enabled': bool(enabled)} if not enabled else {
                **self._continuations, 'enabled': True, 'anchors': [], 'draftSignature': ''}
            self._dirty = True
            self.version += 1


def context_before_prefix(text: str) -> str:
    """The confirmed text of a draft (everything before the unfinished word)."""
    prefix = current_prefix(text)
    return drop_utf16_tail(text, len(prefix)) if prefix else text
