"""Pure request -> response prediction function, runnable inline, in a thread or
in a separate worker process.

Everything a request needs travels with it (draft, learned-state snapshot,
phrase data, lineage), so the result depends only on the request: the worker
keeps caches, never state that could change an answer.
"""
from __future__ import annotations

import gc
import multiprocessing
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .engine import MAX_WORD_CANDIDATES, MAX_WORD_SLOTS, DeterministicPredictionEngine, SnapshotLineage
from .policy import GazeConnectWordPolicy, load_english_only_withheld

_ENGINE: Optional[DeterministicPredictionEngine] = None
_POLICY_NAME = 'gazeconnect'
_WATCHING_PARENT = False


def _exit_with_parent() -> None:
    """A worker process must not outlive the backend that spawned it.

    Electron ends the backend with a hard kill (TerminateProcess on Windows),
    which skips executor shutdown; the pool's pipe does not tell the worker, so
    it would stay orphaned. The parent sentinel does, on every platform."""
    global _WATCHING_PARENT
    parent = multiprocessing.parent_process()
    if parent is None or _WATCHING_PARENT:
        return
    _WATCHING_PARENT = True

    def watch() -> None:
        parent.join()
        os._exit(0)

    threading.Thread(target=watch, name='prediction-parent-watch', daemon=True).start()


def build_policy(engine: DeterministicPredictionEngine, name: str):
    if name == 'reference':
        return engine.reference_policy
    from prediction_guardrails import is_blocked_prediction_word
    tables = engine.tables
    return GazeConnectWordPolicy(
        tables.never_suggested_words,
        tables.clinical_or_safeguarding_words,
        tables.personal_expression_words,
        guardrail_blocked=is_blocked_prediction_word,
        withheld_non_english=load_english_only_withheld(),
    )


def initialize(asset_dir: Optional[str] = None, policy: str = 'gazeconnect') -> Dict[str, Any]:
    """Load tables once per process and warm the lazily parsed shards."""
    global _ENGINE, _POLICY_NAME
    _exit_with_parent()
    started = time.perf_counter()
    engine = DeterministicPredictionEngine(Path(asset_dir) if asset_dir else None)
    engine.policy = build_policy(engine, policy)
    _POLICY_NAME = policy
    loaded = time.perf_counter()
    for draft in ('', 'i need ', 'i need wa', 'please call the ', 'my back is hu'):
        engine.build_snapshot(draft, slot_count=MAX_WORD_SLOTS)
    _ENGINE = engine
    if multiprocessing.parent_process() is not None:
        # The ~90k table containers never change: exempt them from full
        # collections, which otherwise rescan them and pause a request 5-12 ms.
        gc.collect()
        gc.freeze()
    return {'load_ms': round((loaded - started) * 1000, 1), 'warm_ms': round((time.perf_counter() - loaded) * 1000, 1)}


def ensure(asset_dir: Optional[str] = None, policy: str = 'gazeconnect') -> None:
    if _ENGINE is None or _POLICY_NAME != policy:
        initialize(asset_dir, policy)


def engine() -> DeterministicPredictionEngine:
    if _ENGINE is None:
        initialize()
    return _ENGINE  # type: ignore[return-value]


def compose_ten(five: List[str], ten: List[str]) -> List[str]:
    """The five-slot board first, then the ten-slot request's other words in order."""
    shown = set(five)
    return [*five, *[word for word in ten if word not in shown]][:MAX_WORD_SLOTS]


def predict(request: Dict[str, Any]) -> Dict[str, Any]:
    """One snapshot. `request` keys: draft, slot_count, composition, lineage, state, phrases."""
    started = time.perf_counter()
    eng = engine()
    state = request.get('state') or {}
    draft = request.get('draft') or ''
    slot_count = eng.normalize_slot_count(request.get('slot_count', MAX_WORD_SLOTS))
    stages = eng._rank(
        draft,
        phrase_texts=request.get('phrases') or (),
        accepted_words=state.get('acceptedWords') or {},
        accepted_word_last_used_at=state.get('acceptedWordLastUsedAt'),
        personal_continuations=state.get('personalContinuations'),
        content_items=request.get('content_items') or (),
        clinical_boost_enabled=True,
        diagnostics=False,
        policy=eng.policy,
        personal_cache_key=('state', state.get('version')) if state.get('version') is not None else None,
        content_cache_key=None,
    )
    lineage = request.get('lineage')
    previous = None
    if lineage:
        previous = SnapshotLineage(lineage['prefix'], tuple(lineage['candidates']), tuple(lineage['slots']))
    five = eng.select(stages, slot_count=MAX_WORD_CANDIDATES)
    if slot_count > MAX_WORD_CANDIDATES:
        wide = eng.select(stages, slot_count=slot_count)
        ranked = compose_ten(five.candidates, wide.candidates) if request.get('composition', 'anchored') == 'anchored' else wide.candidates
    else:
        wide = five
        ranked = five.candidates
    slots = eng.stabilize_candidate_slots(ranked, stages.prefix, previous, slot_count)
    scores = {entry.word: entry.score for entry in stages.ranked_all}
    return {
        'prefix': stages.prefix,
        'ranked': ranked,
        'slots': slots,
        'five': five.candidates,
        'wide': wide.candidates,
        'scores': {word: scores.get(word, 0.0) for word in ranked},
        'policy': _POLICY_NAME,
        'compute_ms': round((time.perf_counter() - started) * 1000, 3),
    }
