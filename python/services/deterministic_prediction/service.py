"""Backend service around the deterministic word predictor.

Responsibilities:
  * run the CPU work away from the asyncio gaze loop (worker process by
    default; thread or inline are available for tests and fallback);
  * latest-only scheduling per client: at most one computation in flight and
    one waiting, older requests are dropped rather than queued;
  * slot lineage: slot positions persist only while the SAME unfinished word
    grows after an unchanged confirmed text. Any other edit, a new word, a
    sentence boundary, a replacement, navigation (explicit reset) or a
    disconnect starts a fresh board;
  * the learned-state snapshot and phrase data travel with each request, so a
    result depends only on its inputs.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import multiprocessing
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, List, Optional, Sequence

from . import worker
from .jsutil import current_prefix
from .learning import PredictionLearningStore, context_before_prefix
from .policy import load_english_only_withheld

logger = logging.getLogger('GazeConnect')

ENGINE_NAME = 'deterministic'
ENGINE_VERSION = 'gazecompass-de33a95-port-1'
DEFAULT_SLOT_COUNT = 10
MAX_PHRASES = 2000
MAX_CONFIGURED_WORDS = 200
MAX_PHRASE_CHARS = 240
_DEVANAGARI = re.compile(r'[ऀ-ॿ]')
_LATIN_TOKEN = re.compile(r"[a-z]+(?:'[a-z]+)?")


@dataclass
class _Lineage:
    confirmed: str
    prefix: str
    candidates: List[str]
    slots: List[Optional[str]]


class EnglishOnlyText:
    """Display filter for phrase-level suggestions (sentences, starters, abbreviations)."""

    def __init__(self, withheld: Iterable[str]):
        self.withheld = frozenset(withheld)

    def allows(self, text: str) -> bool:
        if not text or _DEVANAGARI.search(text):
            return False
        return not any(token in self.withheld for token in _LATIN_TOKEN.findall(text.lower()))


class WordPredictionService:
    def __init__(
        self,
        store: PredictionLearningStore,
        *,
        execution: str = 'process',
        composition: str = 'anchored',
        policy: str = 'gazeconnect',
        asset_dir: Optional[Path] = None,
        content_items: Optional[Any] = None,
    ):
        self.store = store
        self._content_items = content_items or (lambda: [])
        self.execution = execution
        self.composition = composition
        self.policy_name = policy
        self.asset_dir = str(asset_dir) if asset_dir else None
        self._phrases: List[str] = []
        self._configured_words: List[str] = []
        self._phrases_version = 0
        self._lineage: Dict[Any, _Lineage] = {}
        self._tickets: Dict[Any, int] = {}
        self._locks: Dict[Any, asyncio.Lock] = {}
        self._executor: Optional[concurrent.futures.Executor] = None
        self._executor_lock = threading.Lock()
        self._warm: Optional[concurrent.futures.Future] = None
        self._timings: Deque[Dict[str, float]] = deque(maxlen=512)
        self.english_only = EnglishOnlyText(load_english_only_withheld())

    # ---------------------------------------------------------- lifecycle
    def start(self) -> None:
        """Create the executor and warm it without blocking the caller."""
        if self.execution == 'inline':
            worker.initialize(self.asset_dir, self.policy_name)
            return
        executor = self._ensure_executor()
        self._warm = executor.submit(worker.initialize, self.asset_dir, self.policy_name) if self.execution == 'thread' else executor.submit(_noop)

    def _ensure_executor(self) -> concurrent.futures.Executor:
        with self._executor_lock:
            if self._executor is None:
                if self.execution == 'process':
                    self._executor = concurrent.futures.ProcessPoolExecutor(
                        max_workers=1,
                        mp_context=multiprocessing.get_context('spawn'),
                        initializer=worker.initialize,
                        initargs=(self.asset_dir, self.policy_name),
                    )
                else:
                    self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix='word-prediction')
            return self._executor

    def shutdown(self) -> None:
        with self._executor_lock:
            executor, self._executor = self._executor, None
        if executor is not None:
            executor.shutdown(wait=False, cancel_futures=True)

    def forget_client(self, client: Any) -> None:
        """Disconnect: drop lineage and cancel pending work for that client.

        Removing the ticket invalidates in-flight work (its ticket no longer
        matches) without keeping a reference to the closed connection."""
        self._lineage.pop(client, None)
        self._tickets.pop(client, None)
        self._locks.pop(client, None)

    # --------------------------------------------------------------- inputs
    def _clean_texts(self, texts: Sequence[Any], limit: int) -> List[str]:
        cleaned: List[str] = []
        seen = set()
        for value in list(texts)[:limit]:
            if not isinstance(value, str):
                continue
            text = ' '.join(value.split())[:MAX_PHRASE_CHARS]
            key = text.lower()
            if not text or key in seen or not self.english_only.allows(text):
                continue
            seen.add(key)
            cleaned.append(text)
        return cleaned

    def set_context(self, phrases: Sequence[Any], words: Sequence[Any] = ()) -> Dict[str, int]:
        """Household configuration: board phrases (phraseTexts) and configured words (caregiver items)."""
        cleaned_phrases = self._clean_texts(phrases, MAX_PHRASES)
        cleaned_words = [word for word in self._clean_texts(words, MAX_CONFIGURED_WORDS) if len(word.split()) == 1]
        if cleaned_phrases != self._phrases or cleaned_words != self._configured_words:
            self._phrases = cleaned_phrases
            self._configured_words = cleaned_words
            self._phrases_version += 1
        return {'phrases': len(cleaned_phrases), 'words': len(cleaned_words)}

    def set_phrases(self, phrases: Sequence[Any]) -> int:
        return self.set_context(phrases, self._configured_words)['phrases']

    def content_items(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        seen = set()
        for word in [*self._configured_words, *self._content_items()]:
            text = word['text'] if isinstance(word, dict) else word
            key = str(text).lower()
            if key in seen:
                continue
            seen.add(key)
            items.append(word if isinstance(word, dict) else
                         {'id': f'configured-{key}', 'text': text, 'kind': 'word', 'enabled': True, 'order': len(items)})
        return items

    # --------------------------------------------------------------- predict
    def _request(self, client: Any, text: str, slot_count: int, reset_lineage: bool) -> Dict[str, Any]:
        confirmed = context_before_prefix(text)
        prefix = current_prefix(text)
        previous = None if reset_lineage else self._lineage.get(client)
        lineage = None
        if (previous is not None and previous.confirmed == confirmed and previous.prefix and prefix and
                len(prefix) >= len(previous.prefix) and prefix.startswith(previous.prefix)):
            lineage = {'prefix': previous.prefix, 'candidates': previous.candidates, 'slots': previous.slots}
        return {
            'draft': text,
            'slot_count': slot_count,
            'composition': self.composition,
            'lineage': lineage,
            'state': self.store.snapshot(),
            'phrases': list(self._phrases),
            'content_items': self.content_items(),
        }

    def _remember(self, client: Any, text: str, result: Dict[str, Any]) -> None:
        self._lineage[client] = _Lineage(context_before_prefix(text), result['prefix'], list(result['ranked']), list(result['slots']))

    def predict_sync(self, client: Any, text: str, slot_count: int = DEFAULT_SLOT_COUNT, reset_lineage: bool = False) -> Dict[str, Any]:
        """Inline computation for callers without an event loop (tests, tools)."""
        worker.ensure(self.asset_dir, self.policy_name)
        request = self._request(client, text, slot_count, reset_lineage)
        result = worker.predict(request)
        self._remember(client, text, result)
        result['lineage'] = request['lineage'] is not None
        return result

    async def predict(self, client: Any, text: str, slot_count: int = DEFAULT_SLOT_COUNT,
                      reset_lineage: bool = False) -> Optional[Dict[str, Any]]:
        """Returns None when a newer request from the same client superseded this one."""
        ticket = self._tickets.get(client, 0) + 1
        self._tickets[client] = ticket
        lock = self._locks.setdefault(client, asyncio.Lock())
        async with lock:
            if self._tickets.get(client) != ticket:
                return None
            request = self._request(client, text, slot_count, reset_lineage)
            started = time.perf_counter()
            result = await self._run(request)
            if result is None or self._tickets.get(client) != ticket:
                return None
            round_trip = (time.perf_counter() - started) * 1000
            self._timings.append({'round_trip_ms': round_trip, 'compute_ms': result.get('compute_ms', 0.0)})
            self._remember(client, text, result)
            result['lineage'] = request['lineage'] is not None
            return result

    async def _run(self, request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if self.execution == 'inline':
            worker.ensure(self.asset_dir, self.policy_name)
            return worker.predict(request)
        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(self._ensure_executor(), worker.predict, request)
        except concurrent.futures.process.BrokenProcessPool:
            logger.warning('Word prediction worker stopped; restarting it (this request uses a thread).')
            self.shutdown()
            fallback = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            try:
                return await loop.run_in_executor(fallback, worker.predict, request)
            finally:
                fallback.shutdown(wait=False)

    def timing_summary(self) -> Dict[str, float]:
        samples = sorted(t['round_trip_ms'] for t in self._timings)
        if not samples:
            return {}
        pick = lambda q: samples[min(len(samples) - 1, int(q * (len(samples) - 1)))]  # noqa: E731
        return {'n': len(samples), 'p50_ms': round(pick(0.5), 2), 'p95_ms': round(pick(0.95), 2), 'p99_ms': round(pick(0.99), 2)}


def _noop() -> None:
    return None
