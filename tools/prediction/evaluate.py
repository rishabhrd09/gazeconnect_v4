#!/usr/bin/env python3
"""Before/after evaluation of keyboard word prediction.

    python tools/prediction/evaluate.py [--out report.json] [--markdown report.md] [--limit N]

Engines
  legacy          the previous engine exactly as main.py ran it (rollback path),
                  without its optional ONNX reranker unless onnxruntime/numpy
                  are installed (the report records which)
  deterministic   the new default engine with the production (GazeConnect) policy
                  and no household context
  production      deterministic + the household context a fresh install sends
                  (People names, Quick Words and board phrases; see
                  tools/prediction/export_household_context.mjs)

Sets (never mixed)
  development  reference dev sets the reference was tuned on
  held-out     reference held-out sets (Vertanen & Kristensson AAC corpus test
               split, two independent Tatoeba-derived sets)
  in-domain    this household's configured phrases; the production engine sees
               them as board phrases, so its in-domain numbers measure recall
               of configured phrases, not generalisation

Protocols
  positions  every word of every sentence after 0, 1 and 2 typed letters
             (strict prefixes only): top-1/5/10 hit, MRR@10, prefix
             compatibility, duplicates, filled slots
  probes     next-word probes (want / want-or-also)
  ksr        keystroke savings: type letters until the word is in the visible
             slots, then select it (one action; the space is included)
  phrases    phrase-cell suggestion (first sentence suggestion) for configured
             phrases, separately from word slots

Development tooling: reads tools/prediction/eval_sets, never ships.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import logging
import math
import os
import re
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
EVAL_SETS = ROOT / 'tools' / 'prediction' / 'eval_sets' / 'reference_eval_sets.v1.json'
TOKEN = re.compile(r"[a-z]+(?:'[a-z]+)?")
PREFIX_LENGTHS = (0, 1, 2)
SLOTS = 10

Engine = Callable[[str], Tuple[List[str], List[Dict[str, Any]], Dict[str, Any]]]


def tokenize(sentence: str) -> List[str]:
    return TOKEN.findall(sentence.lower().replace('’', "'"))


def unique(items: Iterable[str]) -> List[str]:
    return list(dict.fromkeys(items))


def percentile(samples: Sequence[float], q: float) -> float:
    ordered = sorted(samples)
    return ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1)))] if ordered else math.nan


def household_context() -> Dict[str, List[str]]:
    output = subprocess.run(['node', str(ROOT / 'tools' / 'prediction' / 'export_household_context.mjs')],
                            cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(output.stdout)


# ------------------------------------------------------------------ engines
def make_backend(engine: str):
    from main import GazeConnectBackend, ServerConfig

    class Recording(GazeConnectBackend):
        def __init__(self, config):
            self.sent: List[Dict[str, Any]] = []
            super().__init__(config)

        def _send(self, websocket, msg_type, data=None):
            self.sent.append({'type': msg_type, **(data or {})})

    temp = tempfile.mkdtemp(prefix='gazeconnect-eval-')
    with contextlib.redirect_stdout(io.StringIO()):
        return Recording(ServerConfig(
            tobii_enabled=False, tts_enabled=False, log_sessions=False, data_dir=temp, survey_data_dir=temp,
            prediction_engine=engine, prediction_execution='inline', prediction_legacy_data_dirs=[]))


def legacy_engine() -> Tuple[Engine, Dict[str, Any]]:
    backend = make_backend('legacy')
    neural = bool(getattr(backend.prediction, 'neural_predictor', None) and
                  getattr(backend.prediction.neural_predictor, 'is_loaded', False))

    def run(draft: str):
        with contextlib.redirect_stdout(io.StringIO()):
            backend._get_predictions_legacy(None, draft)
        payload = backend.sent[-1]
        return [w['word'] for w in payload['words']], payload.get('sentences') or [], {}
    return run, {'neuralReranker': neural}


def deterministic_engine(context: Optional[Dict[str, List[str]]]) -> Tuple[Engine, Dict[str, Any]]:
    backend = make_backend('deterministic')
    if context:
        backend.word_service.set_context(context['phrases'], context['words'])
    service = backend.word_service
    client = object()

    def run(draft: str):
        result = service.predict_sync(client, draft, SLOTS, True)
        return list(result['ranked']), backend._deterministic_sentences(draft), result
    return run, {'householdContext': bool(context)}


# ---------------------------------------------------------------- protocols
def position_queries(sentences: Iterable[str]) -> List[Tuple[str, str]]:
    queries = []
    for sentence in sentences:
        words = tokenize(sentence)
        for index, target in enumerate(words):
            context = ' '.join(words[:index])
            for letters in PREFIX_LENGTHS:
                if letters >= len(target):
                    continue
                queries.append(((context + ' ' if context else '') + target[:letters], target))
    return queries


def fits(word: str, prefix: str) -> bool:
    return word.startswith(prefix) or word.replace("'", '').startswith(prefix)


class Collector:
    """Runs each distinct draft once per engine and remembers the answer."""

    def __init__(self, engine: Engine):
        self.engine = engine
        self.cache: Dict[str, Tuple[List[str], List[Dict[str, Any]], Dict[str, Any]]] = {}
        self.latency_ms: List[float] = []

    def __call__(self, draft: str):
        if draft not in self.cache:
            started = time.perf_counter()
            self.cache[draft] = self.engine(draft)
            self.latency_ms.append((time.perf_counter() - started) * 1000)
        return self.cache[draft]


def score_positions(collect: Collector, queries: Sequence[Tuple[str, str]], visible: Sequence[int]) -> Dict[str, Any]:
    from services.deterministic_prediction.jsutil import current_prefix
    hits = {n: 0 for n in visible}
    reciprocal = 0.0
    shown = compatible = duplicates = filled = underfilled = 0
    for draft, target in queries:
        words, _, _ = collect(draft)
        words = [w.lower() for w in words[:SLOTS]]
        prefix = current_prefix(draft)
        if target in words:
            rank = words.index(target) + 1
            reciprocal += 1 / rank
            for n in visible:
                hits[n] += rank <= n
        single = [w for w in words if ' ' not in w]
        shown += len(single)
        compatible += sum(fits(w, prefix) for w in single)
        duplicates += len(words) != len(set(words))
        filled += len(words)
        underfilled += len(words) < SLOTS
    total = len(queries) or 1
    return {
        'queries': len(queries),
        **{f'top{n}': round(hits[n] / total, 4) for n in visible},
        'mrr10': round(reciprocal / total, 4),
        'prefixCompatible': round(compatible / (shown or 1), 4),
        'duplicateRate': round(duplicates / total, 4),
        'meanFilledSlots': round(filled / total, 2),
        'underfilledRate': round(underfilled / total, 4),
    }


def score_probes(collect: Collector, probes: Sequence[Dict[str, Any]], visible: Sequence[int]) -> Dict[str, Any]:
    out: Dict[str, Any] = {'probes': len(probes)}
    for n in visible:
        want = either = 0
        for probe in probes:
            words = [w.lower() for w in collect(probe['context'].lower() + ' ')[0][:n]]
            want += probe['want'] in words
            either += probe['want'] in words or any(alt in words for alt in probe.get('also', []))
        out[f'want@{n}'] = round(want / (len(probes) or 1), 4)
        out[f'wantOrAlso@{n}'] = round(either / (len(probes) or 1), 4)
    return out


def score_ksr(collect: Collector, sentences: Iterable[str], visible: int) -> Dict[str, Any]:
    typed_chars = actions = 0
    for sentence in sentences:
        words = tokenize(sentence)
        draft = ''
        for word in words:
            typed_chars += len(word) + 1
            for letters in range(len(word) + 1):
                if letters == len(word):
                    actions += letters + 1  # typed it all, then Space
                    break
                if word in [w.lower() for w in collect(draft + word[:letters])[0][:visible]]:
                    actions += letters + 1  # letters so far, then one selection (adds the space)
                    break
            draft += word + ' '
    return {'visibleSlots': visible, 'characters': typed_chars, 'actions': actions,
            'ksr': round(1 - actions / (typed_chars or 1), 4)}


def normalise_phrase(text: str) -> str:
    return ' '.join(tokenize(text))


def score_phrases(collect: Collector, phrases: Iterable[str]) -> Dict[str, Any]:
    cases = hit_first = hit_any = 0
    for phrase in phrases:
        words = tokenize(phrase)
        if len(words) < 2:
            continue
        target = normalise_phrase(phrase)
        for draft in (words[0] + ' ', words[0] + ' ' + words[1][:1]):
            sentences = [normalise_phrase(s['text']) for s in collect(draft)[1]]
            cases += 1
            hit_first += bool(sentences) and sentences[0] == target
            hit_any += target in sentences
    return {'cases': cases, 'phraseCellTop1': round(hit_first / (cases or 1), 4),
            'anySuggestion': round(hit_any / (cases or 1), 4)}


def care_changes(before: Collector, after: Collector, queries: Sequence[Tuple[str, str]], care: frozenset,
                 visible_before: int, visible_after: int) -> Dict[str, Any]:
    regressions, improvements = [], []
    checked = 0
    for draft, target in queries:
        if target not in care:
            continue
        checked += 1
        old = target in [w.lower() for w in before(draft)[0][:visible_before]]
        new = target in [w.lower() for w in after(draft)[0][:visible_after]]
        if old and not new:
            regressions.append((draft, target))
        elif new and not old:
            improvements.append((draft, target))
    return {'careQueries': checked, 'regressions': len(regressions), 'improvements': len(improvements),
            'regressionExamples': [f'{d!r} -> {t}' for d, t in unique_pairs(regressions)[:12]]}


def unique_pairs(pairs):
    return list(dict.fromkeys(pairs))


def composition_check(collect: Collector, queries: Sequence[Tuple[str, str]]) -> Dict[str, Any]:
    """How often the reference's own ten-slot selection reorders or replaces the five-slot board."""
    violations = raw_hits = anchored_hits = 0
    drafts = unique(draft for draft, _ in queries)
    for draft in drafts:
        result = collect(draft)[2]
        if result['wide'][:len(result['five'])] != result['five']:
            violations += 1
    for draft, target in queries:
        result = collect(draft)[2]
        raw_hits += target in result['wide'][:SLOTS]
        anchored_hits += target in result['ranked'][:SLOTS]
    total = len(queries) or 1
    return {'drafts': len(drafts), 'firstFiveViolationRate': round(violations / (len(drafts) or 1), 4),
            'rawTenTop10': round(raw_hits / total, 4), 'anchoredTenTop10': round(anchored_hits / total, 4)}


# ------------------------------------------------------------------- report
def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--markdown', type=Path)
    parser.add_argument('--limit', type=int, help='sentences per set (smoke runs)')
    args = parser.parse_args()
    logging.disable(logging.WARNING)

    sets = json.loads(EVAL_SETS.read_text(encoding='utf-8'))
    dev, held = sets['development'], sets['heldOut']
    context = household_context()
    cut = (lambda items: items[:args.limit]) if args.limit else (lambda items: items)
    sentence_sets = {
        'development': {
            'evalSentences': cut([e['text'] for e in dev['evalSentences']]),
            'contextEvalSentences': cut([e['text'] for e in dev['contextEvalSentences']]),
            'ksrDrafts': cut(dev['ksrDrafts']),
        },
        'held-out': {
            'aacEvalSentences (Vertanen & Kristensson test)': cut(held['aacEvalSentences']),
            'independentTatoeba': cut([e['sentence'] for e in held['independentTatoeba']]),
            'secondIndependent': cut([e['sentence'] for e in held['secondIndependent']]),
        },
        'in-domain': {'householdPhrases': cut(context['phrases'])},
    }

    legacy_run, legacy_info = legacy_engine()
    det_run, _ = deterministic_engine(None)
    prod_run, _ = deterministic_engine(context)
    engines = {'legacy': Collector(legacy_run), 'deterministic': Collector(det_run), 'production': Collector(prod_run)}
    # The previous keyboard (c19bada) showed 4 legacy words with navigation visible and 8 with it hidden; the new one shows 10.
    visible = {'legacy': (1, 4, 5, 8, 10), 'deterministic': (1, 5, 10), 'production': (1, 5, 10)}

    from services.deterministic_prediction import worker
    tables = worker.engine().tables
    index = json.loads((ROOT / 'python' / 'services' / 'deterministic_prediction' / 'assets' / 'index.v1.json').read_text(encoding='utf-8'))
    care = frozenset(index['protectedCare']) | frozenset(tables.clinical_or_safeguarding_words)

    report: Dict[str, Any] = {
        'schemaVersion': 1,
        'engines': {'legacy': legacy_info, 'deterministic': {'policy': 'gazeconnect', 'householdContext': False},
                    'production': {'policy': 'gazeconnect', 'householdContext': {k: len(v) for k, v in context.items()}}},
        'python': sys.version.split()[0],
        'positions': {}, 'probes': {}, 'ksr': {}, 'phrases': {}, 'care': {}, 'composition': {}, 'latencyMs': {},
    }
    for group, named in sentence_sets.items():
        for name, sentences in named.items():
            queries = position_queries(sentences)
            key = f'{group} / {name}'
            report['positions'][key] = {engine: score_positions(collector, queries, visible[engine])
                                        for engine, collector in engines.items()}
            report['ksr'][key] = {
                'legacy@4': score_ksr(engines['legacy'], sentences, 4),
                'legacy@8': score_ksr(engines['legacy'], sentences, 8),
                'deterministic@5': score_ksr(engines['deterministic'], sentences, 5),
                'deterministic@10': score_ksr(engines['deterministic'], sentences, 10),
                'production@10': score_ksr(engines['production'], sentences, 10),
            }
            report['care'][key] = {
                'legacy@4 -> production@10': care_changes(engines['legacy'], engines['production'], queries, care, 4, 10),
                'legacy@5 -> production@5': care_changes(engines['legacy'], engines['production'], queries, care, 5, 5),
            }
            if group != 'in-domain':
                report['composition'][key] = composition_check(engines['deterministic'], queries)
            print(f'{key}: {len(queries)} queries', file=sys.stderr)
    report['probes']['development / nextWordProbes'] = {
        engine: score_probes(collector, dev['nextWordProbes'], (1, 5, 10)) for engine, collector in engines.items()}
    report['phrases']['in-domain / householdPhrases'] = {
        engine: score_phrases(collector, context['phrases']) for engine, collector in engines.items()}
    for engine, collector in engines.items():
        samples = collector.latency_ms
        report['latencyMs'][engine] = {'calls': len(samples), 'p50': round(percentile(samples, 0.5), 3),
                                       'p95': round(percentile(samples, 0.95), 3), 'p99': round(percentile(samples, 0.99), 3),
                                       'max': round(max(samples), 3)}

    text = json.dumps(report, indent=2)
    if args.out:
        args.out.write_text(text + '\n', encoding='utf-8')
    if args.markdown:
        args.markdown.write_text(markdown(report), encoding='utf-8')
    print(text)


def markdown(report: Dict[str, Any]) -> str:
    lines = ['# Word prediction evaluation (generated)', '',
             'Generated by `python tools/prediction/evaluate.py`. Legacy = the previous engine through the '
             f"rollback path (ONNX reranker loaded: {report['engines']['legacy']['neuralReranker']}). "
             'Deterministic = new engine, GazeConnect policy, no household context. Production = deterministic '
             'with the fresh-install household context. Latency is in-process compute on the evaluation machine.', '']
    lines += ['## Word slots by position (strict prefixes of 0-2 letters)', '',
              '| Set | Engine | Queries | Top-1 | Top-4 | Top-5 | Top-8 | Top-10 | MRR@10 | Prefix-compatible | Duplicates | Mean filled | Under-filled |',
              '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for key, engines in report['positions'].items():
        for engine, m in engines.items():
            cell = lambda name: f"{m[name]:.3f}" if name in m else '–'  # noqa: E731
            lines.append(f"| {key} | {engine} | {m['queries']} | {cell('top1')} | {cell('top4')} | {cell('top5')} | {cell('top8')} | "
                         f"{cell('top10')} | {m['mrr10']:.3f} | {m['prefixCompatible']:.3f} | {m['duplicateRate']:.3f} | "
                         f"{m['meanFilledSlots']} | {m['underfilledRate']:.3f} |")
    lines += ['', '## Keystroke savings (visible slots)', '', '| Set | Legacy @4 | Legacy @8 | Deterministic @5 | Deterministic @10 | Production @10 |',
              '|---|---:|---:|---:|---:|---:|']
    for key, runs in report['ksr'].items():
        lines.append(f"| {key} | " + ' | '.join(f"{runs[name]['ksr']:.3f}" for name in
                     ('legacy@4', 'legacy@8', 'deterministic@5', 'deterministic@10', 'production@10')) + ' |')
    lines += ['', '## Next-word probes (development)', '', '| Engine | want@1 | want@5 | want@10 | want-or-also@5 |', '|---|---:|---:|---:|---:|']
    for engine, m in report['probes']['development / nextWordProbes'].items():
        lines.append(f"| {engine} | {m['want@1']:.3f} | {m['want@5']:.3f} | {m['want@10']:.3f} | {m['wantOrAlso@5']:.3f} |")
    lines += ['', '## Care vocabulary (protected care + clinical/safeguarding targets)', '',
              '| Set | Comparison | Care queries | Regressions | Improvements |', '|---|---|---:|---:|---:|']
    for key, comparisons in report['care'].items():
        for name, m in comparisons.items():
            lines.append(f"| {key} | {name} | {m['careQueries']} | {m['regressions']} | {m['improvements']} |")
    lines += ['', '## Phrase cell (in-domain configured phrases, separate from word slots)', '',
              '| Engine | Cases | Phrase cell top-1 | Any suggestion |', '|---|---:|---:|---:|']
    for engine, m in report['phrases']['in-domain / householdPhrases'].items():
        lines.append(f"| {engine} | {m['cases']} | {m['phraseCellTop1']:.3f} | {m['anySuggestion']:.3f} |")
    lines += ['', '## Ten-slot composition (reference ten-slot selection vs anchored five-first)', '',
              '| Set | Drafts | First-five violation rate | Raw ten top-10 | Anchored ten top-10 |', '|---|---:|---:|---:|---:|']
    for key, m in report['composition'].items():
        lines.append(f"| {key} | {m['drafts']} | {m['firstFiveViolationRate']:.3f} | {m['rawTenTop10']:.3f} | {m['anchoredTenTop10']:.3f} |")
    lines += ['', '## Latency (in-process compute, ms)', '', '| Engine | Calls | p50 | p95 | p99 | max |', '|---|---:|---:|---:|---:|---:|']
    for engine, m in report['latencyMs'].items():
        lines.append(f"| {engine} | {m['calls']} | {m['p50']} | {m['p95']} | {m['p99']} | {m['max']} |")
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    main()
