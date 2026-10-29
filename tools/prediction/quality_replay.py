#!/usr/bin/env python3
"""Paired prediction regression; synthetic profiles only, never patient data.

Record BEFORE editing: --record /tmp/baseline.json
Compare AFTER editing: --compare /tmp/baseline.json --out /tmp/result.json
Uses existing evaluation sets (not newly held-out data). Word outputs must match
exactly: ranking, physical slots and scores, including growing-word lineage.
--allow-row-promotion permits the explicitly requested priority-row presentation
change, while requiring identical ranked words/scores and correct row membership.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import logging
import sys
import tempfile
import time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
from services.deterministic_prediction import worker
from services.deterministic_prediction.learning import PredictionLearningStore
from services.deterministic_prediction.service import WordPredictionService
from services.deterministic_prediction.jsutil import words_in


def replay(limit: int) -> dict:
    source = ROOT / 'tools/prediction/eval_sets/reference_eval_sets.v1.json'
    sets = json.loads(source.read_text())['heldOut']
    cases = []
    for name, rows in sets.items():
        chosen = rows if limit <= 0 else [rows[i * len(rows) // min(limit, len(rows))] for i in range(min(limit, len(rows))) ]
        for row in chosen:
            sentence = row['sentence'] if isinstance(row, dict) else row
            tokens = words_in(sentence)
            for index, target in enumerate(tokens):
                if not index: continue
                for count in (0, 1, 2):
                    if count < len(target):
                        cases.append((name, ' '.join(tokens[:index]) + ' ' + target[:count], target))
    outputs, metrics, timings = {}, {}, []
    configured = ['Call Rishabh', 'Please adjust my pillow', 'I need water', 'Could you bring my glasses', 'Please turn off the light']
    with tempfile.TemporaryDirectory(prefix='prediction-quality-') as temp:
        for profile in ('fresh', 'configured', 'learned'):
            store = PredictionLearningStore(Path(temp) / profile); store.load()
            if profile == 'learned':
                for word, context in [('pillow', 'Please adjust my '), ('glasses', 'Could you bring my '), ('rice', 'i need ')]:
                    for _ in range(6): store.record_accepted_word(word, context, context + word + ' ', words_in(context))
            service = WordPredictionService(store, execution='inline'); service.start()
            if profile != 'fresh': service.set_context(configured, ['Rishabh', 'pillow', 'glasses'])
            client = object(); cache = {}
            for name, draft, target in cases:
                if draft not in cache:
                    started = time.perf_counter()
                    result = service.predict_sync(client, draft, 10, True)
                    timings.append((time.perf_counter() - started) * 1000)
                    cache[draft] = {k: result[k] for k in ('ranked', 'slots', 'scores')}
                    outputs[profile + '\x1f' + draft] = cache[draft]
                result = cache[draft]
                score = metrics.setdefault(profile + '/' + name, {'cases': 0, 'top5': 0, 'top10': 0})
                score['cases'] += 1
                score['top5'] += target in result['ranked'][:5]
                score['top10'] += target in result['ranked'][:10]
            for stem in ['i need water', 'please adjust my pillow', "i don't want", 'call rishabh']:
                service.forget_client(client)
                for count in range(len(stem) + 1):
                    draft = stem[:count]
                    result = service.predict_sync(client, draft)
                    outputs[profile + '\x1flineage:' + draft] = {k: result[k] for k in ('ranked', 'slots', 'scores')}
            service.shutdown()
    timings.sort()
    output_hash = hashlib.sha256(json.dumps(outputs, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'protocol': 'existing shared held-out sets, 0-2 letter strict prefixes; synthetic fresh/configured/learned profiles; exact anchored ten-slot outputs and lineage; no hardware claim',
            'inputSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'limitPerSet': limit,
            'outputSha256': output_hash,
            'wordBoards': len(outputs), 'metrics': metrics, 'wordComputeMs': {'p50': round(timings[len(timings)//2], 3), 'p95': round(timings[int(len(timings)*.95)], 3)}, 'outputs': outputs}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record', type=Path); parser.add_argument('--compare', type=Path)
    parser.add_argument('--out', type=Path); parser.add_argument('--limit', type=int, default=60)
    parser.add_argument('--allow-row-promotion', action='store_true',
                        help='Require identical ranked words/scores but allow slots to follow current top-five priority')
    args = parser.parse_args(); logging.disable(logging.WARNING)
    report = replay(args.limit)
    if args.compare:
        before = json.loads(args.compare.read_text())
        if before['inputSha256'] != report['inputSha256'] or before['limitPerSet'] != report['limitPerSet']:
            raise SystemExit('Inputs changed; refusing an invalid comparison')
        if 'outputs' in before:
            changed = [key for key in before['outputs'].keys() | report['outputs'].keys() if before['outputs'].get(key) != report['outputs'].get(key)]
            before_hash = hashlib.sha256(json.dumps(before['outputs'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        else:
            before_hash = before['outputSha256']
            changed = [] if before_hash == report['outputSha256'] else ['output fingerprint differs']
        report['comparison'] = {'changedWordBoards': len(changed), 'examples': changed[:20], 'baselineOutputSha256': before_hash, 'baselineComputeMs': before['wordComputeMs']}
        if args.allow_row_promotion:
            if 'outputs' not in before:
                raise SystemExit('Row-promotion comparison requires the full baseline, not only its fingerprint')
            changed_ranking = [key for key in before['outputs'].keys() | report['outputs'].keys()
                if {k: before['outputs'].get(key, {}).get(k) for k in ('ranked', 'scores')}
                != {k: report['outputs'].get(key, {}).get(k) for k in ('ranked', 'scores')}]
            def wrong_rows(outputs):
                return [key for key, row in outputs.items()
                    if set(filter(None, row['slots'][:5])) != set(row['ranked'][:5])
                    or set(filter(None, row['slots'][5:])) != set(row['ranked'][5:10])]
            report['comparison'].update({'mode': 'row-promotion', 'changedRankingOrScoreBoards': len(changed_ranking),
                'beforePriorityRowViolations': len(wrong_rows(before['outputs'])),
                'afterPriorityRowViolations': len(wrong_rows(report['outputs']))})
    if args.record:
        if args.record.exists(): raise SystemExit('Refusing to overwrite baseline')
        args.record.write_text(json.dumps(report, separators=(',', ':')))
    summary = {k: v for k, v in report.items() if k != 'outputs'}
    if args.out: args.out.write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))
    comparison = report.get('comparison', {})
    if args.allow_row_promotion:
        if not args.compare: raise SystemExit('--allow-row-promotion requires --compare')
        if comparison.get('changedRankingOrScoreBoards') or comparison.get('afterPriorityRowViolations'): raise SystemExit(1)
    elif comparison.get('changedWordBoards'): raise SystemExit(1)

if __name__ == '__main__': main()
