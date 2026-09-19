#!/usr/bin/env python3
"""Cold/warm latency, worker memory and asset size of the deterministic predictor.

    python tools/prediction/measure_runtime.py [--requests 400]

Measures, in fresh processes:
  * inline cold start (load tables + warm-up) and first answer;
  * worker-process cold start: service.start() to the first delivered answer
    (spawn + table load + warm-up), then warm round trips through the worker;
  * resident memory of the worker process and of a process that loaded the
    engine inline (RSS, via psutil or `ps`);
  * shipped asset bytes (raw and zip-deflated, as an installer estimate).
Development tooling; the numbers depend on the machine.
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
PACKAGE = ROOT / 'python' / 'services' / 'deterministic_prediction'
DRAFTS = ['', 'i', 'i ', 'i n', 'i ne', 'i nee', 'i need', 'i need ', 'i need w', 'i need wa', 'i need wat',
          'please call the ', 'my back is hu', 'can you turn me ', 'i want to watch t', 'the nurse', 'call pa']


def rss_mb(pid: int) -> float:
    try:
        import psutil  # type: ignore
        return round(psutil.Process(pid).memory_info().rss / 2 ** 20, 1)
    except ImportError:
        output = subprocess.run(['ps', '-o', 'rss=', '-p', str(pid)], capture_output=True, text=True, check=True)
        return round(int(output.stdout.strip()) / 1024, 1)


def percentiles(samples):
    ordered = sorted(samples)
    pick = lambda q: round(ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1)))], 3)  # noqa: E731
    return {'n': len(ordered), 'p50': pick(0.5), 'p95': pick(0.95), 'p99': pick(0.99), 'max': round(ordered[-1], 3)}


def measure_inline(requests: int) -> dict:
    started = time.perf_counter()
    from services.deterministic_prediction import worker
    timings = worker.initialize()
    ready = time.perf_counter()
    first = worker.predict({'draft': 'i need wa', 'slot_count': 10})
    cold_total = (time.perf_counter() - started) * 1000
    warm = []
    for index in range(requests):
        draft = DRAFTS[index % len(DRAFTS)]
        begin = time.perf_counter()
        worker.predict({'draft': draft, 'slot_count': 10})
        warm.append((time.perf_counter() - begin) * 1000)
    return {'importLoadWarmMs': round((ready - started) * 1000, 1), **timings,
            'coldFirstAnswerMs': round(cold_total, 1), 'firstSlots': first['slots'],
            'warmComputeMs': percentiles(warm), 'processRssMb': rss_mb(os.getpid())}


def measure_process(requests: int) -> dict:
    from services.deterministic_prediction.learning import PredictionLearningStore
    from services.deterministic_prediction.service import WordPredictionService
    with tempfile.TemporaryDirectory() as state:
        store = PredictionLearningStore(Path(state))
        store.load()
        parent_before = rss_mb(os.getpid())
        started = time.perf_counter()
        service = WordPredictionService(store, execution='process')
        service.start()
        client = object()

        async def run():
            first = await service.predict(client, 'i need wa', 10, True)
            cold = (time.perf_counter() - started) * 1000
            trips = []
            for index in range(requests):
                begin = time.perf_counter()
                await service.predict(client, DRAFTS[index % len(DRAFTS)], 10)
                trips.append((time.perf_counter() - begin) * 1000)
            return first, cold, trips

        try:
            first, cold, trips = asyncio.run(run())
            worker_pid = next(iter(service._executor._processes))
            return {'coldStartToFirstAnswerMs': round(cold, 1), 'firstSlots': first['slots'],
                    'warmRoundTripMs': percentiles(trips), 'workerRssMb': rss_mb(worker_pid),
                    'parentRssMb': {'before': parent_before, 'after': rss_mb(os.getpid())}}
        finally:
            service.shutdown()


def asset_sizes() -> dict:
    files = sorted(p for p in (PACKAGE / 'assets').rglob('*') if p.is_file()) + [PACKAGE / 'english_only_policy.v1.json']
    raw = sum(p.stat().st_size for p in files)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, path.relative_to(PACKAGE))
    code = sum(p.stat().st_size for p in PACKAGE.glob('*.py'))
    return {'files': len(files), 'rawMb': round(raw / 2 ** 20, 2), 'deflatedMb': round(len(buffer.getvalue()) / 2 ** 20, 2),
            'pythonSourceKb': round(code / 1024, 1)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--requests', type=int, default=400)
    parser.add_argument('--mode', choices=('all', 'inline', 'process'), default='all')
    args = parser.parse_args()
    if args.mode != 'all':
        result = measure_inline(args.requests) if args.mode == 'inline' else measure_process(args.requests)
        print(json.dumps(result))
        return
    report = {'python': sys.version.split()[0], 'platform': sys.platform, 'assets': asset_sizes()}
    for mode in ('inline', 'process'):  # each in a fresh interpreter: cold means cold
        output = subprocess.run([sys.executable, __file__, '--mode', mode, '--requests', str(args.requests)],
                                capture_output=True, text=True, check=True, cwd=ROOT)
        report[mode] = json.loads(output.stdout.strip().splitlines()[-1])
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
