#!/usr/bin/env python3
"""Compare the frozen synthetic phrase probes recorded before this change.

--before is the pre-change probe record; --out writes a compact result. This
measures recall of configured content and edit correctness, not unseen-language
accuracy or a patient's communication speed. Results at four candidates keep the
old shortlist size comparable; the new chooser can expose twelve candidates.
"""
from __future__ import annotations
import argparse
import json
import logging
import sys
import tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
from main import GazeConnectBackend, ServerConfig
from services.phrase_prediction import normalized


def inline(rows):
    literals = [r for r in rows if not r.get('requires_confirmation')]
    return next((r for r in (literals or rows) if len(r['text']) <= 42 and len(r['text'].split()) <= 6), None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(); logging.disable(logging.CRITICAL)
    cases = json.loads(args.before.read_text()); metrics = {'cases': 0, 'beforeTop1': 0, 'afterTop1': 0, 'beforeAny4': 0, 'afterAny4': 0, 'afterAny12': 0}
    with tempfile.TemporaryDirectory(prefix='phrase-quality-') as temp:
        backend = GazeConnectBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False,
            data_dir=temp, survey_data_dir=temp, prediction_execution='inline', prediction_legacy_data_dirs=[]))
        configured = ['Could you bring my glasses', 'Please adjust my cushion', 'I do not want visitors', 'Please turn on the bedside lamp', 'Call Rishabh']
        backend.word_service.set_context(configured, ['Rishabh'])
        backend.sentence_predictor.history = [{'text': 'Please check my cushion', 'count': 1, 'last_used': 1}]
        rows = []
        for case in cases:
            after = backend._deterministic_sentences(case['draft'])
            before = case['suggestions']
            if case['group'] == 'configured':
                target = normalized(case['expected'])
                metrics['cases'] += 1
                for name, source in [('before', before), ('after', after)]:
                    shown = inline(source)
                    metrics[name + 'Top1'] += bool(shown and normalized(shown['text']) == target)
                    metrics[name + 'Any4'] += any(normalized(r['text']) == target for r in source[:4])
                metrics['afterAny12'] += any(normalized(r['text']) == target for r in after)
            rows.append({**case, 'after': after})
    report = {'scope': '26 synthetic probes; configured-content recall measured on 20 cases; first/second sentences; no fresh held-out corpus or hardware claim',
              'configuredRecallCounts': metrics, 'cases': rows}
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(metrics, indent=2))

if __name__ == '__main__': main()
