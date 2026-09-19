"""Deterministic word prediction engine: reference parity, contracts and invariants.

The parity fixture was generated from the pinned GazeCompass reference by
`python tools/prediction/parity.py --reference <clone> --write-fixture`;
replaying it needs neither Node nor the reference clone.
"""
import json
import pathlib
import re
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

from prediction_guardrails import is_blocked_prediction_word  # noqa: E402
from services.deterministic_prediction import assets_loader, worker  # noqa: E402
from services.deterministic_prediction import engine as engine_module  # noqa: E402
from services.deterministic_prediction.engine import (  # noqa: E402
    MAX_WORD_CANDIDATES,
    MAX_WORD_SLOTS,
    DeterministicPredictionEngine,
    SnapshotLineage,
    accept_predicted_word,
)
from services.deterministic_prediction.jsutil import current_prefix  # noqa: E402
from services.deterministic_prediction.policy import load_english_only_withheld  # noqa: E402

FIXTURES = ROOT / 'python' / 'tests' / 'fixtures' / 'deterministic_prediction'
PACKAGE = ROOT / 'python' / 'services' / 'deterministic_prediction'


def _load(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


def _resolve(value, shared):
    if isinstance(value, dict) and set(value) == {'$shared'}:
        return shared[value['$shared']]
    return value


def _view(snapshot):
    view = {'prefix': snapshot.prefix, 'candidateSlots': snapshot.candidate_slots}
    if snapshot.candidates != snapshot.candidate_slots:
        view['candidates'] = snapshot.candidates
    return view


def _fits(word, prefix):
    return word.startswith(prefix) or word.replace("'", '').startswith(prefix)


class ReferenceParityFixtureTests(unittest.TestCase):
    """Every committed case must reproduce the reference exactly (reference policy)."""

    @classmethod
    def setUpClass(cls):
        cls.fixture = _load('parity_v1.json')
        cls.engine = DeterministicPredictionEngine()

    def test_fixture_is_pinned_to_the_reference_commit(self):
        pin = json.loads((ROOT / 'tools' / 'prediction' / 'reference_pin.json').read_text(encoding='utf-8'))
        self.assertEqual(self.fixture['referenceCommit'], pin['commit'])
        self.assertEqual(self.fixture['schemaVersion'], 2)
        self.assertGreater(len(self.fixture['cases']), 3000)

    def test_single_snapshots_match_the_reference(self):
        shared = self.fixture['shared']
        mismatches = []
        compared = 0
        for case in self.fixture['cases']:
            if 'sequence' in case:
                continue
            input_ = {key: _resolve(value, shared) for key, value in case['input'].items()}
            for slot_count in case['slotCounts']:
                self.engine._statistics_key = None  # the oracle's cold statistics cache per case
                snapshot = self.engine.build_snapshot(
                    input_['draft'],
                    phrase_texts=input_.get('phraseTexts', ()),
                    accepted_words=input_.get('acceptedWords') or {},
                    accepted_word_last_used_at=input_.get('acceptedWordLastUsedAt'),
                    personal_continuations=input_.get('personalContinuations'),
                    content_items=input_.get('contentItems') or (),
                    slot_count=slot_count,
                    clinical_boost_enabled=input_.get('clinicalBoostEnabled', True) is not False,
                    diagnostics=True,
                )
                compared += 1
                expected = case['expected']
                if _view(snapshot) != expected[str(slot_count)] or snapshot.diagnostics['ranked'][:10] != expected['ranked']:
                    mismatches.append((case['id'], slot_count, expected[str(slot_count)], _view(snapshot)))
        self.assertGreater(compared, 6000)
        self.assertEqual(mismatches[:3], [], f'{len(mismatches)} of {compared} snapshots differ from the reference')

    def test_lineage_sequences_match_the_reference(self):
        # diagnostics off here (on in the other test): results must not depend on it.
        compared = 0
        for case in self.fixture['cases']:
            if 'sequence' not in case:
                continue
            self.engine._statistics_key = None
            previous = None
            for index, (step, expected) in enumerate(zip(case['sequence'], case['expected'])):
                lineage = previous.lineage() if previous is not None and step.get('lineage') else None
                snapshot = self.engine.build_snapshot(step['draft'], previous_snapshot=lineage, slot_count=case['slotCount'])
                self.assertEqual(_view(snapshot), expected, f"{case['id']} step {index} {step['draft']!r}")
                previous = snapshot
                compared += 1
        self.assertGreater(compared, 300)


class InsertionContractTests(unittest.TestCase):
    """The renderer (scripts/check-word-prediction-slots.cjs) checks the same cases."""

    def test_prefix_and_acceptance_match_the_reference(self):
        contract = _load('insertion_contract.v1.json')
        self.assertEqual(contract['reference']['functions'], ['currentPrefix', 'acceptPredictedWord'])
        for case in contract['cases']:
            with self.subTest(draft=case['draft']):
                self.assertEqual(current_prefix(case['draft']), case['prefix'])
                self.assertEqual(accept_predicted_word(case['draft'], case['word']), case['accepted'])


class ReferenceConstantsTests(unittest.TestCase):
    def test_every_numeric_constant_equals_the_exported_reference_value(self):
        tables = assets_loader.load_asset('engine_tables')
        engine = DeterministicPredictionEngine()
        self.assertEqual(len(tables['numericConstants']), 57)
        for name, value in tables['numericConstants']:
            with self.subTest(name=name):
                if name == 'CURATED_SLOT_COUNT':
                    self.assertEqual(engine._curated_slot_count, value)
                else:
                    self.assertEqual(getattr(engine_module, name), value)

    def test_ten_slots_leave_the_five_based_constants_unchanged(self):
        self.assertEqual(MAX_WORD_CANDIDATES, 5)
        self.assertEqual(MAX_WORD_SLOTS, 10)
        self.assertEqual(engine_module.CURATED_RANK_SLOTS, 5)

    def test_slot_count_is_normalised_like_the_reference(self):
        engine = DeterministicPredictionEngine()
        for raw, expected in [(10, 10), (6, 6), (5, 5), (4, 5), (11, 5), (10.0, 10), (True, 5), ('10', 5), (None, 5),
                              (float('nan'), 5), (7.5, 5)]:
            with self.subTest(raw=raw):
                self.assertEqual(engine.normalize_slot_count(raw), expected)

    def test_intentional_differences_are_declared(self):
        self.assertEqual(len(engine_module.DIFFERENCES), 3)
        readme = (ROOT / 'docs' / 'deterministic-prediction' / 'README.md').read_text(encoding='utf-8')
        self.assertIn('Intentional differences', readme)


class AssetTests(unittest.TestCase):
    def test_shipped_assets_match_the_manifest_and_the_pin(self):
        verified = assets_loader.verify_assets()
        manifest = assets_loader.load_manifest()
        pin = json.loads((ROOT / 'tools' / 'prediction' / 'reference_pin.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['reference']['commit'], pin['commit'])
        self.assertEqual(set(verified), {f'{name}.v1.json' for name in assets_loader.ASSET_NAMES})
        for relative, digest in manifest['licenceFiles'].items():
            with self.subTest(licence=relative):
                import hashlib
                self.assertEqual(hashlib.sha256((PACKAGE / 'assets' / relative).read_bytes()).hexdigest(), digest)
        # Provenance records hashes of the pinned sources, never timestamps.
        self.assertNotRegex(json.dumps(manifest), r'20\d\d-\d\d-\d\dT')

    def test_runtime_has_no_clock_randomness_network_or_model_imports(self):
        runtime = ['engine.py', 'shared_english.py', 'semantic.py', 'jsutil.py', 'policy.py',
                   'personal_continuations.py', 'assets_loader.py']
        forbidden = re.compile(r'^\s*(import|from)\s+(time|random|datetime|socket|urllib|requests|http|onnxruntime|numpy)\b', re.M)
        for name in runtime:
            with self.subTest(module=name):
                self.assertIsNone(forbidden.search((PACKAGE / name).read_text(encoding='utf-8')))
        # `socket` is not listed: multiprocessing (the worker's own machinery) imports it.
        code = ("import sys; from services.deterministic_prediction import worker; worker.initialize(); "
                "worker.predict({'draft': 'i need wa', 'slot_count': 10}); "
                "print(sorted({m.split('.')[0] for m in sys.modules} & "
                "{'onnxruntime', 'numpy', 'requests', 'urllib3', 'http', 'aiohttp', 'random', 'ml'}))")
        output = subprocess.run([sys.executable, '-c', code], cwd=ROOT / 'python', capture_output=True, text=True, check=True)
        self.assertEqual(output.stdout.strip(), '[]')


class TenSlotInvariantTests(unittest.TestCase):
    """Production path (worker + GazeConnect policy) over a sample of reference drafts."""

    @classmethod
    def setUpClass(cls):
        worker.ensure()
        fixture = _load('parity_v1.json')
        drafts = [case['input']['draft'] for case in fixture['cases'] if 'input' in case]
        cls.drafts = list(dict.fromkeys(drafts))[::4] + ['', 'i ', 'call pa', 'xq', 'zz', 'i need water. ', "don'"]
        cls.withheld = load_english_only_withheld()
        cls.never = frozenset(worker.engine().tables.never_suggested_words)

    def predict(self, draft, slot_count=10):
        return worker.predict({'draft': draft, 'slot_count': slot_count, 'state': {}, 'phrases': [], 'content_items': []})

    def test_ten_distinct_valid_words_with_the_five_board_first(self):
        underfilled = 0
        for draft in self.drafts:
            ten = self.predict(draft)
            five = self.predict(draft, 5)
            prefix, ranked, slots = ten['prefix'], ten['ranked'], ten['slots']
            with self.subTest(draft=draft):
                self.assertEqual(len(slots), MAX_WORD_SLOTS)
                self.assertEqual(ranked[:len(five['ranked'])], five['ranked'])  # first five preserved
                self.assertEqual(five['slots'], five['ranked'] + [None] * (5 - len(five['ranked'])))
                self.assertEqual(slots, ranked + [None] * (MAX_WORD_SLOTS - len(ranked)))  # no gaps, no padding
                self.assertEqual(len(ranked), len(set(ranked)))
                for word in ranked:
                    self.assertTrue(_fits(word, prefix), word)
                    self.assertRegex(word, r"^[a-z]+(?:'[a-z]+)?$")
                    self.assertFalse(is_blocked_prediction_word(word), word)
                    self.assertNotIn(word, self.withheld)
                    self.assertNotIn(word, self.never)
            underfilled += len(ranked) < MAX_WORD_SLOTS
        self.assertLess(underfilled, len(self.drafts) // 2)

    def test_results_do_not_depend_on_request_order_or_engine_instance(self):
        sample = self.drafts[:150]
        first = DeterministicPredictionEngine()
        second = DeterministicPredictionEngine()
        forward = {draft: first.build_snapshot(draft, slot_count=10).candidate_slots for draft in sample}
        backward = {draft: second.build_snapshot(draft, slot_count=10).candidate_slots for draft in reversed(sample)}
        self.assertEqual(forward, backward)

    def test_lineage_keeps_a_seen_word_in_its_slot_while_the_word_grows(self):
        engine = DeterministicPredictionEngine()
        first = engine.build_snapshot('i need w', slot_count=10)
        second = engine.build_snapshot('i need wa', slot_count=10, previous_snapshot=first.lineage())
        for index, word in enumerate(first.candidate_slots):
            if word and word in second.candidates:
                self.assertEqual(second.candidate_slots[index], word)
        fresh = engine.build_snapshot('i need wa', slot_count=10)
        self.assertEqual(sorted(filter(None, second.candidate_slots)), sorted(filter(None, fresh.candidate_slots)))

    def test_lineage_is_ignored_when_the_word_does_not_grow(self):
        engine = DeterministicPredictionEngine()
        first = engine.build_snapshot('i need wa', slot_count=10)
        stale = SnapshotLineage('wa', tuple(first.candidates), tuple(first.candidate_slots))
        other_word = engine.build_snapshot('i need t', slot_count=10, previous_snapshot=stale)
        self.assertEqual(other_word.candidate_slots, engine.build_snapshot('i need t', slot_count=10).candidate_slots)


if __name__ == '__main__':
    unittest.main()
