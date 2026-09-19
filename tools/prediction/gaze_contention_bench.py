#!/usr/bin/env python3
"""Does word prediction delay the asyncio gaze loop? Measure it.

A synthetic gaze task wakes at 66 Hz on the same event loop the backend uses
and records how late each wake-up is, while a typing task requests predictions
letter by letter through sentences. Modes:

  idle            no typing (loop noise floor)
  legacy-inline   previous engine called inline, as main.py did before
  inline          deterministic engine called inline
  thread          deterministic engine in a worker thread (shares the GIL)
  process         deterministic engine in a worker process (default)

    python tools/prediction/gaze_contention_bench.py [--seconds 20] [--interval-ms 150]

Numbers are machine-specific. A Mac run is not Windows/Tobii validation.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import statistics
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

FRAME_S = 1 / 66


def percentile(values, q):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1)))] if ordered else 0.0


def typing_drafts():
    sets = json.loads((ROOT / 'tools' / 'prediction' / 'eval_sets' / 'reference_eval_sets.v1.json').read_text())
    for entry in sets['development']['evalSentences']:
        draft = ''
        for word in entry['text'].split():
            for letter in word:
                draft += letter
                yield draft
            draft += ' '
            yield draft


async def gaze_loop(stop: asyncio.Event, lateness_ms: list):
    loop = asyncio.get_running_loop()
    next_tick = loop.time() + FRAME_S
    sample = {'type': 'gaze', 'x': 0.5, 'y': 0.5, 'is_valid': True, 'confidence': 0.9}
    while not stop.is_set():
        await asyncio.sleep(max(0.0, next_tick - loop.time()))
        now = loop.time()
        lateness_ms.append((now - next_tick) * 1000)
        json.dumps(sample)  # a little per-frame work, like serialising a frame
        next_tick += FRAME_S
        if now - next_tick > 0.25:  # after a long stall, resynchronise rather than burst
            next_tick = now + FRAME_S


async def typing_task(mode: str, stop: asyncio.Event, interval_s: float, round_trips: list, context: dict):
    drafts = typing_drafts()
    while not stop.is_set():
        try:
            draft = next(drafts)
        except StopIteration:
            drafts = typing_drafts()
            continue
        started = time.perf_counter()
        if mode == 'legacy-inline':
            context['legacy'].predict(draft, top_k=12)
            context['sentences'].predict(draft.strip(), top_k=3) if len(draft.strip()) >= 2 else None
        else:
            result = await context['service'].predict('bench', draft, 10)
            if result is not None and len(draft.strip()) >= 2:
                context['sentences'].predict(draft.strip(), top_k=6)
        round_trips.append((time.perf_counter() - started) * 1000)
        await asyncio.sleep(interval_s)


async def run_mode(mode: str, seconds: float, interval_ms: float) -> dict:
    from services.sentence_prediction import SentencePredictor
    temp = Path(tempfile.mkdtemp())
    context = {'sentences': SentencePredictor(temp)}
    if mode == 'legacy-inline':
        from services.word_prediction import WordPredictionEngine
        context['legacy'] = WordPredictionEngine(str(temp))
    elif mode != 'idle':
        from services.deterministic_prediction.learning import PredictionLearningStore
        from services.deterministic_prediction.service import WordPredictionService
        store = PredictionLearningStore(temp / 'patient_data')
        store.load()
        service = WordPredictionService(store, execution=mode)
        service.start()
        await service.predict('bench', 'warm up', 10)  # includes worker start-up
        context['service'] = service
    stop = asyncio.Event()
    lateness: list = []
    round_trips: list = []
    tasks = [asyncio.create_task(gaze_loop(stop, lateness))]
    if mode != 'idle':
        tasks.append(asyncio.create_task(typing_task(mode, stop, interval_ms / 1000, round_trips, context)))
    await asyncio.sleep(seconds)
    stop.set()
    await asyncio.gather(*tasks)
    if 'service' in context:
        context['service'].shutdown()
    late = lateness[5:]
    return {
        'mode': mode,
        'frames': len(late),
        'gaze_late_ms': {
            'p50': round(percentile(late, 0.5), 3), 'p95': round(percentile(late, 0.95), 3),
            'p99': round(percentile(late, 0.99), 3), 'max': round(max(late), 3),
            'over_5ms_pct': round(100 * sum(v > 5 for v in late) / len(late), 2),
            'over_15ms_pct': round(100 * sum(v > 15 for v in late) / len(late), 2),
        },
        'predictions': len(round_trips),
        'prediction_round_trip_ms': {
            'p50': round(percentile(round_trips, 0.5), 3), 'p95': round(percentile(round_trips, 0.95), 3),
            'p99': round(percentile(round_trips, 0.99), 3),
            'mean': round(statistics.fmean(round_trips), 3) if round_trips else 0.0,
        } if round_trips else {},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=float, default=20)
    parser.add_argument('--interval-ms', type=float, default=150)
    parser.add_argument('--modes', default='idle,legacy-inline,inline,thread,process')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    report = {
        'python': sys.version.split()[0], 'platform': platform.platform(), 'cpu_count': os.cpu_count(),
        'interval_ms': args.interval_ms, 'seconds_per_mode': args.seconds, 'results': [],
    }
    for mode in args.modes.split(','):
        result = asyncio.run(run_mode(mode, args.seconds, args.interval_ms))
        report['results'].append(result)
        print(json.dumps(result))
    if args.out:
        args.out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
