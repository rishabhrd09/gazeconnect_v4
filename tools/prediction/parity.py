#!/usr/bin/env python3
"""Stage-level parity between the Python port and the pinned TypeScript reference.

    python tools/prediction/parity.py --reference <gazecompass clone> [--suite all] [--full-diagnostics]
    python tools/prediction/parity.py --reference <clone> --write-fixture   # refresh the committed test fixture

Development tooling. Needs Node (esbuild from this repo's node_modules) and a
local GazeCompass clone; the committed fixture lets the Python test suite check
parity without either.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

from services.deterministic_prediction.engine import DeterministicPredictionEngine, SnapshotLineage  # noqa: E402

EVAL_SETS = ROOT / 'tools' / 'prediction' / 'eval_sets' / 'reference_eval_sets.v1.json'
FIXTURE = ROOT / 'python' / 'tests' / 'fixtures' / 'deterministic_prediction' / 'parity_v1.json'
TOKEN = re.compile(r"[a-z]+(?:'[a-z]+)?")

EXAMPLE_DRAFTS = [
    'i need wa', 'i am hu', 'check o', 'my back is hu', 'turn me ', 'give me ', 'have you se',
    'i am waiting for your cal', "i think i'll take a na", 'please stop mo', 'she can ', 'may i ',
    'where are you ', 'can ', 'i need water. ', 'i need water. p', 'please call the ', 'i cannot ',
    'I need s', 'I need su', 'I cannot bre', 'I am br', 'my back hu', 'she swall', 'I need o',
    'I feel na', 'I feel diz', 'I need sec', 'hello ', '', 'i', 'i ', 'dont', "don'", "can't ",
    'i want to eat ', 'i would like some ', 'can i have some ', 'i want to watch ', 'call my ',
    'tell my ', 'my son ', 'what time is it', 'the doctor said my pe', 'the nurse touched my ',
    'i was abused by ', 'she hit me on my ', 'i feel so ', 'this may be wro', 'the weather is lik',
    'the story of my life is int', 'please give me some ', 'after a long ', 'visit ind', 'i want to visit ind',
]

EDGE_DRAFTS = [
    'I NEED WA', 'I Need Water', 'i need\twa', 'i need wa', 'i need wa', 'i’m ', 'don’t ',
    'I’m hu', 'ｉ ｎｅｅｄ ｗａ', 'i need wa\n', 'i need wa \n', 'hello, i need ', 'hello,i need',
    'wait... ', 'what?! ', 'really?" ', "(i need) ", 'i need 2 ', '123 ', '??? ', '   ', ' i need ',
    'i need water 😊 ', 'i need 😊wa', 'i need 👍 ', 'i﻿ need wa', 'i need wa​', 'ﬁ', 'i need ﬁ',
    "rock'n'roll ", "o'clo", "o'clock ", "y'all ", "it's ", "it'", "he's go", "we'll ", "they'd ",
    'constructor ', 'prototype ', '__proto__ ', 'hasOwnProperty ', 'toString ', 'valueOf ',
    'a ' * 30, 'i need water and ' * 8, 'x' * 60, 'qwrtyp ', 'zzz ', 'sucton', 'medcine', 'oxgen', 'positon',
    'I need water. I need ', 'I need water! Can ', 'Thank you. ', 'thank you.', 'thank you. ', 'yes. no. maybe ',
    '"i need ', "'i need ", 'i need "wa', 'mr. smith ', 'e.g. i ', 'i need-wa', 'i/need ', 'i_need ',
]


def tokenize(sentence: str) -> List[str]:
    return TOKEN.findall(sentence.lower())


def position_drafts(sentences: Iterable[str], prefix_lengths=(0, 1, 2, 3)) -> List[str]:
    drafts = []
    for sentence in sentences:
        words = tokenize(sentence)
        for index in range(1, len(words)):
            history = ' '.join(words[:index])
            target = words[index]
            for k in prefix_lengths:
                if len(target) <= k:
                    continue
                drafts.append(f'{history} {target[:k]}')
    return drafts


def unique(items: Iterable[str]) -> List[str]:
    return list(dict.fromkeys(items))


def eval_sets() -> Dict[str, Any]:
    return json.loads(EVAL_SETS.read_text(encoding='utf-8'))


def gazeconnect_phrases() -> List[str]:
    rows = list(csv.DictReader((ROOT / 'docs' / 'phrase-inventory.csv').open(encoding='utf-8')))
    return unique(row['spoken'].strip() for row in rows if row['spoken'].strip())


def sentence_templates() -> List[str]:
    from services.sentence_prediction import SentencePredictor
    texts = []
    for template in SentencePredictor._build_templates(None):
        texts.extend(template['s'])
    return unique(text for text in texts if text.isascii())


def used_profile(sets: Dict[str, Any]) -> Dict[str, int]:
    """A frozen, derived acceptance history (mirrors the reference usedProfile idea)."""
    counts: Dict[str, int] = {}
    sources = [(gazeconnect_phrases(), 3), (sets['development']['ksrDrafts'], 1)]
    for corpus, weight in sources:
        for text in corpus:
            for word in tokenize(text):
                counts[word] = min(counts.get(word, 0) + weight, 100)
    return counts


def caregiver_items() -> List[Dict[str, Any]]:
    words = ['water', 'suction', 'pain', 'nurse', 'rishabh', 'parakh', 'fan', 'tea', 'pillow', 'doctor']
    return [
        {'id': f'caregiver-{word}', 'text': word, 'kind': 'word', 'enabled': True,
         'priorityRank': index + 1, 'useCount': 10 - index, 'pinned': index < 3,
         'lastUsedAt': 1000 + index * 7 if index % 2 == 0 else None}
        for index, word in enumerate(words)
    ] + [
        {'id': 'phrase-1', 'text': 'Please call Rishabh', 'kind': 'phrase', 'enabled': True},
        {'id': 'dup-water', 'text': 'Water', 'kind': 'word', 'enabled': True, 'priorityRank': 2, 'aliases': ['H2O ']},
        {'id': 'disabled', 'text': 'secret', 'kind': 'word', 'enabled': False},
        {'id': 'reserved', 'text': 'Settings', 'kind': 'word', 'enabled': True},
    ]


def continuation_state() -> Dict[str, Any]:
    events = []
    next_id = 1
    for context, word, times in ((['i', 'need'], 'rest', 3), (['i', 'need'], 'water', 2), (['turn', 'me'], 'right', 4),
                                 (['me'], 'up', 2), (['please', 'call'], 'rishabh', 3)):
        for _ in range(times):
            events.append({'id': next_id, 'context': context, 'word': word})
            next_id += 1
    return {'enabled': True, 'nextId': next_id, 'events': events, 'anchors': [], 'draftSignature': ''}


def build_cases(suite: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    sets = eval_sets()
    dev, held = sets['development'], sets['heldOut']
    cases: List[Dict[str, Any]] = []

    def add(case_id: str, draft: str, slot_counts=(5, 10), **extra):
        cases.append({'id': case_id, 'input': {'draft': draft, **extra}, 'slotCounts': list(slot_counts)})

    if suite in ('all', 'core'):
        for i, draft in enumerate(unique(EXAMPLE_DRAFTS)):
            add(f'example-{i}', draft)
        for i, draft in enumerate(unique(EDGE_DRAFTS)):
            add(f'edge-{i}', draft)
        for i, draft in enumerate(unique(dev['goldenDrafts'])):
            add(f'golden-{i}', draft)
        for i, probe in enumerate(dev['nextWordProbes']):
            add(f'probe-{i}', probe['context'] + ' ')
            add(f'probe1-{i}', probe['context'] + ' ' + probe['want'][:1])
    if suite in ('all', 'positions'):
        sentences = [e['text'] for e in dev['evalSentences']] + [e['text'] for e in dev['contextEvalSentences']]
        sentences += dev['ksrDrafts'] + held['aacEvalSentences'] + [e['sentence'] for e in held['independentTatoeba']]
        sentences += [e['sentence'] for e in held['secondIndependent']] + gazeconnect_phrases() + sentence_templates()
        for i, draft in enumerate(unique(position_drafts(sentences))):
            add(f'pos-{i}', draft)
    if suite in ('all', 'personal'):
        profile = used_profile(sets)
        stamps = {word: 1_700_000_000 + i * 60 for i, word in enumerate(sorted(profile)[:40])}
        stamps.update({'Water': 1_700_009_999, 'NotAWord1': 5, 'pain': float('nan') if False else 1_600_000_000})
        phrases = gazeconnect_phrases()
        items = caregiver_items()
        state = continuation_state()
        base = unique(EXAMPLE_DRAFTS + dev['goldenDrafts'][:120] + position_drafts(held['aacEvalSentences'][:60]))
        for i, draft in enumerate(base):
            add(f'used-{i}', draft, acceptedWords=profile, acceptedWordLastUsedAt=stamps)
            add(f'phrases-{i}', draft, phraseTexts=phrases)
            add(f'caregiver-{i}', draft, contentItems=items, acceptedWords={'rishabh': 12, 'khana': 9, 'Pani': 4, '123': 3, "don't": 2})
            add(f'continuations-{i}', draft, personalContinuations=state, acceptedWords={'rest': 2})
            if i % 5 == 0:
                add(f'noclinical-{i}', draft, clinicalBoostEnabled=False)
                add(f'all-{i}', draft, acceptedWords=profile, phraseTexts=phrases, contentItems=items, personalContinuations=state)
    if suite in ('all', 'lineage'):
        sentences = [e['text'] for e in dev['evalSentences'][:40]] + held['aacEvalSentences'][:30] + gazeconnect_phrases()[:30]
        for i, sentence in enumerate(sentences):
            steps = []
            draft = ''
            for word in tokenize(sentence)[:6]:
                for letter in word:
                    draft += letter
                    steps.append({'draft': draft, 'lineage': True})
                draft += ' '
                steps.append({'draft': draft, 'lineage': True})
            # a deletion inside the word and a retype, so lineage must drop and recover
            if len(draft) > 3:
                steps.append({'draft': draft[:-2], 'lineage': True})
                steps.append({'draft': draft[:-3], 'lineage': True})
            cases.append({'id': f'seq-{i}', 'sequence': steps, 'slotCount': 10 if i % 2 == 0 else 5})
    if limit:
        cases = cases[:limit]
    return cases


def run_oracle(reference: str, cases: List[Dict[str, Any]], compact: bool, commit: Optional[str] = None) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        cases_path = Path(tmp) / 'cases.json'
        out_path = Path(tmp) / 'oracle.json'
        cases_path.write_text(json.dumps({'cases': cases}), encoding='utf-8')
        command = ['node', str(ROOT / 'tools' / 'prediction' / 'oracle.mjs'), '--reference', reference,
                   '--cases', str(cases_path), '--out', str(out_path)]
        if compact:
            command.append('--compact')
        if commit:
            command += ['--commit', commit]
        subprocess.run(command, check=True, cwd=ROOT)
        return json.loads(out_path.read_text(encoding='utf-8'))


def _lineage(view: Optional[Dict[str, Any]]) -> Optional[SnapshotLineage]:
    if not view:
        return None
    return SnapshotLineage(view['prefix'], tuple(view['candidates']), tuple(view['candidateSlots']))


def _python_view(snapshot, compact: bool) -> Dict[str, Any]:
    out = {'prefix': snapshot.prefix, 'candidates': snapshot.candidates, 'candidateSlots': snapshot.candidate_slots}
    d = snapshot.diagnostics
    if compact:
        out.update({'ranked': d['ranked'][:24], 'diverse': d['diverse'], 'fused': d['fused']})
    else:
        out['diagnostics'] = d
    return out


def build_python(engine: DeterministicPredictionEngine, input_: Dict[str, Any], slot_count: int, previous) -> Any:
    engine._statistics_key = None  # same cold-cache protocol as the oracle
    return engine.build_snapshot(
        input_['draft'],
        phrase_texts=input_.get('phraseTexts', ()),
        accepted_words=input_.get('acceptedWords') or {},
        accepted_word_last_used_at=input_.get('acceptedWordLastUsedAt'),
        personal_continuations=input_.get('personalContinuations'),
        content_items=input_.get('contentItems') or (),
        previous_snapshot=previous,
        slot_count=slot_count,
        clinical_boost_enabled=input_.get('clinicalBoostEnabled', True) is not False,
        diagnostics=True,
    )


def run_python(engine: DeterministicPredictionEngine, cases: List[Dict[str, Any]], compact: bool) -> List[Dict[str, Any]]:
    results = []
    for case in cases:
        if 'sequence' in case:
            engine._statistics_key = None
            previous_view = None
            steps = []
            for step in case['sequence']:
                input_ = {k: v for k, v in step.items() if k != 'lineage'}
                previous = _lineage(previous_view) if step.get('lineage') else None
                snapshot = engine.build_snapshot(input_['draft'], previous_snapshot=previous, slot_count=case['slotCount'], diagnostics=True)
                previous_view = {'prefix': snapshot.prefix, 'candidates': snapshot.candidates, 'candidateSlots': snapshot.candidate_slots}
                steps.append(_python_view(snapshot, True))
            results.append({'id': case['id'], 'steps': steps})
            continue
        outputs = {}
        for slot_count in case['slotCounts']:
            snapshot = build_python(engine, case['input'], slot_count, _lineage(case['input'].get('previousSnapshot')))
            outputs[str(slot_count)] = _python_view(snapshot, compact)
        results.append({'id': case['id'], 'outputs': outputs})
    return results


def _close(a: float, b: float) -> bool:
    return a == b or (math.isfinite(a) and math.isfinite(b) and abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b)))


def first_divergence(expected: Dict[str, Any], actual: Dict[str, Any]) -> Optional[str]:
    if 'diagnostics' in expected:
        e, a = expected['diagnostics'], actual['diagnostics']
        for stage in ('sourceUnion', 'pool'):
            if e[stage] != a[stage]:
                return stage
        if [x['word'] for x in e['scoredUnion']] != [x['word'] for x in a['scoredUnion']]:
            return 'scoredUnion.order'
        for x, y in zip(e['scoredUnion'], a['scoredUnion']):
            if not _close(x['score'], y['score']):
                return f"scoredUnion.score[{x['word']}]"
        for word, features in e['features'].items():
            other = a['features'].get(word, {})
            for name, value in features.items():
                if not _close(value, other.get(name, math.nan)):
                    return f'features[{word}].{name}'
        for stage in ('ranked', 'diverse', 'diversityDecisions', 'fused', 'expectedPartsOfSpeech', 'recoveredCandidates'):
            if e[stage] != a[stage]:
                return stage
    else:
        for stage in ('ranked', 'diverse', 'fused'):
            if stage in expected and expected[stage] != actual.get(stage):
                return stage
    for stage in ('prefix', 'candidates', 'candidateSlots'):
        if expected[stage] != actual[stage]:
            return stage
    return None


def compare(oracle: Dict[str, Any], python: List[Dict[str, Any]]) -> Dict[str, Any]:
    mismatches = []
    compared = 0
    for expected, actual in zip(oracle['results'], python):
        assert expected['id'] == actual['id']
        if 'steps' in expected:
            for step_index, (e, a) in enumerate(zip(expected['steps'], actual['steps'])):
                compared += 1
                stage = first_divergence(e, a)
                if stage:
                    mismatches.append({'id': expected['id'], 'step': step_index, 'stage': stage,
                                       'expected': e['candidateSlots'], 'actual': a['candidateSlots']})
            continue
        for slots, e in expected['outputs'].items():
            compared += 1
            stage = first_divergence(e, actual['outputs'][slots])
            if stage:
                mismatches.append({'id': expected['id'], 'slots': slots, 'stage': stage,
                                   'expected': e['candidateSlots'], 'actual': actual['outputs'][slots]['candidateSlots']})
    return {'compared': compared, 'mismatches': mismatches}


def _share(value: Any, shared: Dict[str, Any]) -> Any:
    """Large inputs (profiles, phrase lists) are stored once and referenced by content hash."""
    text = json.dumps(value, sort_keys=True, separators=(',', ':'))
    if len(text) < 256:
        return value
    key = hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]
    shared.setdefault(key, value)
    return {'$shared': key}


def _expected_view(view: Dict[str, Any]) -> Dict[str, Any]:
    """prefix + candidateSlots, and candidates only where lineage made them differ."""
    out = {'prefix': view['prefix'], 'candidateSlots': view['candidateSlots']}
    if view['candidates'] != view['candidateSlots']:
        out['candidates'] = view['candidates']
    return out


def write_fixture(cases: List[Dict[str, Any]], oracle: Dict[str, Any], commit: str) -> None:
    """Fixture schema 2: large inputs under `shared`; `ranked` (top 10 of the ranked
    stage, which does not depend on the slot count) stored once per case."""
    expected = {result['id']: result for result in oracle['results']}
    shared: Dict[str, Any] = {}
    entries = []
    for case in cases:
        result = expected[case['id']]
        if 'steps' in result:
            entries.append({**case, 'expected': [_expected_view(step) for step in result['steps']]})
            continue
        rankings = {json.dumps(view['ranked'][:10]) for view in result['outputs'].values()}
        if len(rankings) != 1:
            raise SystemExit(f"{case['id']}: the ranked stage differs between slot counts")
        input_ = {key: value if key == 'draft' else _share(value, shared) for key, value in case['input'].items()}
        views = {slots: _expected_view(view) for slots, view in result['outputs'].items()}
        entries.append({**case, 'input': input_, 'expected': {'ranked': json.loads(rankings.pop()), **views}})
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps({'schemaVersion': 2, 'referenceCommit': commit,
                                   'generator': 'tools/prediction/parity.py --write-fixture',
                                   'shared': shared, 'cases': entries}, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'wrote {len(entries)} fixture cases ({len(shared)} shared inputs) to {FIXTURE.relative_to(ROOT)}')


def fixture_cases() -> List[Dict[str, Any]]:
    """A stratified, reasonably small subset for the committed fixture."""
    chosen = []
    seen = set()
    for case in build_cases('all'):
        prefix = case['id'].split('-')[0]
        number = int(case['id'].rsplit('-', 1)[1])
        keep = (
            prefix in ('example', 'edge', 'golden', 'probe', 'probe1', 'noclinical', 'all') or
            (prefix == 'pos' and number % 23 == 0) or
            (prefix in ('used', 'phrases', 'caregiver', 'continuations') and number % 4 == 0) or
            (prefix == 'seq' and number % 5 == 0)
        )
        if keep and case['id'] not in seen:
            seen.add(case['id'])
            chosen.append(case)
    return chosen


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', default=os.environ.get('GAZECOMPASS_REFERENCE'))
    parser.add_argument('--suite', default='all', choices=('all', 'core', 'positions', 'personal', 'lineage'))
    parser.add_argument('--limit', type=int)
    parser.add_argument('--full-diagnostics', action='store_true', help='compare every stage incl. scores and features')
    parser.add_argument('--commit', help='compare against another reference commit (neutrality checks)')
    parser.add_argument('--write-fixture', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if not args.reference:
        parser.error('--reference or GAZECOMPASS_REFERENCE is required')

    cases = fixture_cases() if args.write_fixture else build_cases(args.suite, args.limit)
    compact = not args.full_diagnostics and not args.write_fixture
    started = time.perf_counter()
    oracle = run_oracle(args.reference, cases, compact=compact if not args.write_fixture else True, commit=args.commit)
    oracle_seconds = time.perf_counter() - started
    engine = DeterministicPredictionEngine()
    started = time.perf_counter()
    python = run_python(engine, cases, compact=compact if not args.write_fixture else True)
    python_seconds = time.perf_counter() - started
    summary = compare(oracle, python)
    report = {
        'referenceCommit': oracle['commit'],
        'suite': args.suite,
        'cases': len(cases),
        'comparisons': summary['compared'],
        'mismatches': len(summary['mismatches']),
        'mismatchStages': {},
        'oracleSeconds': round(oracle_seconds, 1),
        'pythonSeconds': round(python_seconds, 1),
        'pythonHashSeed': os.environ.get('PYTHONHASHSEED', 'random'),
        'examples': summary['mismatches'][:25],
    }
    for mismatch in summary['mismatches']:
        report['mismatchStages'][mismatch['stage'].split('[')[0]] = report['mismatchStages'].get(mismatch['stage'].split('[')[0], 0) + 1
    print(json.dumps(report, indent=2))
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    if args.write_fixture:
        if summary['mismatches']:
            raise SystemExit('Refusing to write a fixture while the port disagrees with the oracle.')
        write_fixture(cases, oracle, oracle['commit'])
    if summary['mismatches']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
