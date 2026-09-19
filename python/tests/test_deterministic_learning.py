"""Committed-use learning for the deterministic predictor: migration, bounds, undo, persistence."""
import hashlib
import json
import pathlib
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

from services.deterministic_prediction import learning  # noqa: E402
from services.deterministic_prediction.engine import accept_predicted_word  # noqa: E402
from services.deterministic_prediction.learning import (  # noqa: E402
    MAX_ACCEPTED_WORDS,
    MAX_WORD_COUNT,
    STATE_FILE_NAME,
    PredictionLearningStore,
    context_before_prefix,
    migrate_legacy_history,
)


def _digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class LearningStoreTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = pathlib.Path(temp.name)
        self.state_dir = self.root / 'patient_data'

    def store(self, legacy=(), **kwargs) -> PredictionLearningStore:
        store = PredictionLearningStore(self.state_dir, legacy, **kwargs)
        store.load()
        return store

    def write_legacy(self, directory: pathlib.Path) -> None:
        (directory / 'patient_data').mkdir(parents=True, exist_ok=True)
        (directory / 'custom_dictionary.json').write_text(json.dumps({
            'user_frequencies': {'Water': 5, 'suction': 3, 'khana': 2, 'bad token!': 4, 'zero': 0, 'flag': True},
            'recent_words': ['suction', 'water'],
        }), encoding='utf-8')
        (directory / 'patient_data' / 'recency_scores.json').write_text(json.dumps({
            'suction': [1700000000.5], 'khana': [1690000000], 'unknown': [1800000000],
        }), encoding='utf-8')

    # ------------------------------------------------------------ migration
    def test_first_load_migrates_legacy_history_read_only(self):
        legacy = self.root / 'legacy'
        self.write_legacy(legacy)
        before = {path: _digest(path) for path in legacy.rglob('*.json')}
        store = self.store([self.root / 'missing', legacy])
        state = store.snapshot()
        self.assertEqual(state['acceptedWords'], {'water': 5, 'suction': 3, 'khana': 2})
        # Relative recency survives as commit sequence numbers (no wall-clock values).
        stamps = state['acceptedWordLastUsedAt']
        self.assertEqual(sorted(stamps, key=stamps.get), ['khana', 'suction', 'water'])
        self.assertEqual(set(stamps.values()), {1, 2, 3})
        report = store.migration_report()
        self.assertEqual(report['from'], str(legacy))
        self.assertEqual(report['words'], 3)
        self.assertEqual(set(report['sourceFiles']), {'custom_dictionary.json', 'patient_data/recency_scores.json'})
        self.assertEqual(before, {path: _digest(path) for path in legacy.rglob('*.json')})
        self.assertTrue((self.state_dir / STATE_FILE_NAME).is_file())

    def test_migration_happens_once_and_state_survives_restart(self):
        legacy = self.root / 'legacy'
        self.write_legacy(legacy)
        store = self.store([legacy])
        store.record_spoken('I need water')
        store.save()
        (legacy / 'custom_dictionary.json').write_text(json.dumps({'user_frequencies': {'other': 9}}), encoding='utf-8')
        reloaded = self.store([legacy])
        self.assertEqual(reloaded.snapshot()['acceptedWords'], store.snapshot()['acceptedWords'])
        self.assertNotIn('other', reloaded.snapshot()['acceptedWords'])

    def test_unreadable_state_is_kept_aside_and_rebuilt(self):
        self.state_dir.mkdir(parents=True)
        (self.state_dir / STATE_FILE_NAME).write_text('{not json', encoding='utf-8')
        store = self.store()
        self.assertEqual(store.snapshot()['acceptedWords'], {})
        self.assertTrue((self.state_dir / 'deterministic_prediction_state.v1.unreadable.json').is_file())
        self.assertEqual(json.loads((self.state_dir / STATE_FILE_NAME).read_text(encoding='utf-8'))['schemaVersion'], 1)

    def test_save_is_atomic_and_leaves_no_temporary_files(self):
        store = self.store()
        store.record_accepted_word('water')
        store.save()
        self.assertEqual(sorted(p.name for p in self.state_dir.iterdir()), [STATE_FILE_NAME])
        with mock.patch.object(learning.os, 'replace', side_effect=OSError('disk full')):
            store.record_accepted_word('rest')
            store.save()  # must not raise; the previous file stays intact
        self.assertNotIn('rest', json.loads((self.state_dir / STATE_FILE_NAME).read_text(encoding='utf-8'))['acceptedWords'])
        store.save()  # retried on the next save
        self.assertIn('rest', json.loads((self.state_dir / STATE_FILE_NAME).read_text(encoding='utf-8'))['acceptedWords'])

    # ------------------------------------------------------------- learning
    def test_only_committed_single_words_are_counted(self):
        store = self.store()
        version = store.version
        self.assertTrue(store.record_accepted_word('Water'))
        self.assertFalse(store.record_accepted_word('two words'))
        self.assertFalse(store.record_accepted_word('123'))
        self.assertEqual(store.record_spoken('I need water, please!'), 4)
        self.assertEqual(store.snapshot()['acceptedWords'], {'water': 2, 'i': 1, 'need': 1, 'please': 1})
        self.assertGreater(store.version, version)

    def test_recency_is_a_commit_sequence_not_the_clock(self):
        results = []
        for clock in (1_000.0, 9_999_999_999.0):
            with mock.patch.object(time, 'time', return_value=clock):
                store = PredictionLearningStore(self.root / f'clock-{int(clock)}')
                store.load()
                store.record_accepted_word('water')
                store.record_spoken('rest now')
                results.append(store.snapshot())
        self.assertEqual(results[0]['acceptedWordLastUsedAt'], results[1]['acceptedWordLastUsedAt'])
        self.assertEqual(results[0]['acceptedWordLastUsedAt'], {'water': 1, 'rest': 2, 'now': 2})

    def test_counts_and_vocabulary_are_bounded(self):
        store = self.store()
        store._accepted = {'water': MAX_WORD_COUNT}
        store.record_accepted_word('water')
        self.assertEqual(store.snapshot()['acceptedWords']['water'], MAX_WORD_COUNT)
        words = [f"w{''.join(chr(97 + (i // 26 ** k) % 26) for k in range(3))}" for i in range(MAX_ACCEPTED_WORDS + 50)]
        for word in words:
            store.record_accepted_word(word)
        state = store.snapshot()
        self.assertEqual(len(state['acceptedWords']), MAX_ACCEPTED_WORDS)
        self.assertIn('water', state['acceptedWords'])  # the most-used word is kept
        self.assertLessEqual(set(state['acceptedWordLastUsedAt']), set(state['acceptedWords']))

    # ----------------------------------------------------------------- undo
    def test_delete_word_undoes_exactly_the_accepted_word(self):
        store = self.store()
        store.record_spoken('water')  # an earlier, spoken use survives the undo
        before = 'i need wa'
        after = accept_predicted_word(before, 'water')
        store.record_accepted_word('water', before, after, ['i', 'need'])
        self.assertEqual(store.snapshot()['acceptedWords']['water'], 2)
        self.assertEqual(store.undo_removed_words(after, 'i need '), ['water'])
        self.assertEqual(store.snapshot()['acceptedWords']['water'], 1)
        self.assertEqual(store.undo_removed_words(after, 'i need '), [])  # only once

    def test_undo_restores_a_new_word_to_absent_and_handles_inserted_capitals(self):
        store = self.store()
        store.record_accepted_word('Papa', 'call pa', 'call Papa ', ['call'])
        self.assertEqual(store.snapshot()['acceptedWords'], {'papa': 1})
        self.assertEqual(store.undo_removed_words('call Papa ', 'call '), ['papa'])
        self.assertEqual(store.snapshot()['acceptedWords'], {})
        self.assertEqual(store.snapshot()['acceptedWordLastUsedAt'], {})

    def test_undo_ignores_edits_that_do_not_remove_the_word(self):
        store = self.store()
        store.record_accepted_word('water', 'i need wa', 'i need water ', ['i', 'need'])
        self.assertEqual(store.undo_removed_words('i need water ', 'i need water now '), [])
        self.assertEqual(store.undo_removed_words('i need water now ', 'i need water '), [])
        self.assertEqual(store.snapshot()['acceptedWords'], {'water': 1})

    def test_continuations_are_learned_only_when_enabled(self):
        disabled = self.store()
        disabled.record_accepted_word('water', 'i need wa', 'i need water ', ['i', 'need'])
        self.assertEqual(disabled.snapshot()['personalContinuations']['events'], [])
        enabled = PredictionLearningStore(self.root / 'enabled', continuations_enabled=True)
        enabled.load()
        enabled.record_accepted_word('water', 'i need wa', 'i need water ', ['i', 'need'])
        events = enabled.snapshot()['personalContinuations']['events']
        self.assertEqual([(e['context'], e['word']) for e in events], [(['i', 'need'], 'water')])
        enabled.undo_removed_words('i need water ', 'i need ')
        self.assertEqual(enabled.snapshot()['personalContinuations']['events'], [])

    def test_reset_forgets_learning_but_not_legacy_files(self):
        legacy = self.root / 'legacy'
        self.write_legacy(legacy)
        before = {path: _digest(path) for path in legacy.rglob('*.json')}
        store = self.store([legacy])
        store.reset()
        store.save()
        self.assertEqual(self.store([legacy]).snapshot()['acceptedWords'], {})
        self.assertEqual(before, {path: _digest(path) for path in legacy.rglob('*.json')})
        self.assertTrue(store.migration_report()['resetAfterMigration'])

    def test_context_before_prefix(self):
        self.assertEqual(context_before_prefix('i need wa'), 'i need ')
        self.assertEqual(context_before_prefix('i need '), 'i need ')
        self.assertEqual(context_before_prefix('hi 😊wa'), 'hi 😊')

    def test_legacy_migration_without_sources_is_empty(self):
        self.assertEqual(migrate_legacy_history([self.root / 'nowhere'])[:2], ({}, {}))


if __name__ == '__main__':
    unittest.main()
