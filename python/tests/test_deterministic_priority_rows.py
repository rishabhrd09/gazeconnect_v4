"""Current top-five priority overrides whole-board slot stability."""
import asyncio
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'python'))
from services.deterministic_prediction import worker
from services.deterministic_prediction.engine import SnapshotLineage
from services.deterministic_prediction.learning import PredictionLearningStore
from services.deterministic_prediction.service import WordPredictionService


class PriorityRowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        worker.ensure()
        cls.engine = worker.engine()

    def test_promotion_and_demotion_cross_the_row_boundary(self):
        original = ['water', 'wait', 'want', 'warm', 'wash', 'watch', 'walk', 'way', 'was', 'wall']
        ranked = ['water', 'watch', 'want', 'warm', 'wash', 'wait', 'walk', 'way', 'was', 'wall']
        previous = SnapshotLineage('w', tuple(original), tuple(original))
        slots = worker.keyboard_priority_slots(self.engine, ranked, 'wa', previous)
        self.assertIn('watch', slots[:5])
        self.assertNotIn('watch', slots[5:])
        self.assertIn('wait', slots[5:])
        self.assertEqual(set(slots[:5]), set(ranked[:5]))
        self.assertEqual(set(slots[5:]), set(ranked[5:]))
        for index, word in enumerate(original):
            if word not in ('watch', 'wait'):
                self.assertEqual(slots[index], word)

    def test_priority_change_at_the_same_prefix_also_promotes(self):
        original = ['water', 'wait', 'want', 'warm', 'wash', 'watch', 'walk', 'way', 'was', 'wall']
        ranked = ['watch', 'wait', 'want', 'warm', 'wash', 'water', 'walk', 'way', 'was', 'wall']
        slots = worker.keyboard_priority_slots(self.engine, ranked, 'wa', SnapshotLineage('wa', tuple(original), tuple(original)))
        self.assertIn('watch', slots[:5])
        self.assertIn('water', slots[5:])
        self.assertEqual(len(set(slots)), 10)

    def test_underfilled_board_puts_every_remaining_word_on_top(self):
        ranked = ['water', 'watered', 'waters', 'watering']
        old = ['water', None, None, None, 'watered', 'waters', None, None, None, 'watering']
        slots = worker.keyboard_priority_slots(self.engine, ranked, 'wate', SnapshotLineage('wat', tuple(ranked), tuple(old)))
        self.assertEqual(set(filter(None, slots[:5])), set(ranked))
        self.assertEqual(slots[5:], [None] * 5)

    def test_real_growing_prefix_promotes_watch_without_changing_candidates(self):
        first = worker.predict({'draft': 'i need wa', 'slot_count': 10})
        self.assertIn('watch', first['slots'][5:])
        request = {'draft': 'i need wat', 'slot_count': 10,
                   'lineage': {'prefix': first['prefix'], 'candidates': first['ranked'], 'slots': first['slots']}}
        result = worker.predict(request)
        fresh = worker.predict({'draft': request['draft'], 'slot_count': 10})
        self.assertEqual(result['ranked'], fresh['ranked'])
        self.assertEqual(result['scores'], fresh['scores'])
        self.assertIn('watch', result['slots'][:5])
        self.assertNotIn('watch', result['slots'][5:])

    def test_single_row_consumers_retain_reference_stability(self):
        for count in (5, 6):
            first = worker.predict({'draft': 'i need wa', 'slot_count': count})
            previous = SnapshotLineage(first['prefix'], tuple(first['ranked']), tuple(first['slots']))
            result = worker.predict({'draft': 'i need wat', 'slot_count': count,
                'lineage': {'prefix': previous.prefix, 'candidates': first['ranked'], 'slots': first['slots']}})
            self.assertEqual(result['slots'], self.engine.stabilize_candidate_slots(result['ranked'], result['prefix'], previous, count))

    def test_screenshot_maintenance_words_move_up_as_letters_narrow_the_choices(self):
        confirmed = 'plots and money left suction awkward crazy situation mainte '
        previous = None
        for count in range(1, len('mainte') + 1):
            draft = confirmed + 'mainte'[:count]
            result = worker.predict({'draft': draft, 'slot_count': 10, 'lineage': previous})
            self.assertEqual(set(filter(None, result['slots'][:5])), set(result['ranked'][:5]), draft)
            self.assertEqual(set(filter(None, result['slots'][5:])), set(result['ranked'][5:]), draft)
            if count == 3:
                self.assertIn('maintenance', result['slots'][5:])
            previous = {'prefix': result['prefix'], 'candidates': result['ranked'], 'slots': result['slots']}
        self.assertEqual(set(filter(None, result['slots'][:5])), {'maintenance', 'maintenances'})
        self.assertEqual(result['slots'][5:], [None] * 5)

    def test_spawned_worker_enforces_row_priority_with_lineage(self):
        with tempfile.TemporaryDirectory() as temp:
            store = PredictionLearningStore(pathlib.Path(temp)); store.load()
            service = WordPredictionService(store, execution='process')
            async def run():
                first = await service.predict('rows', 'i need wa')
                second = await service.predict('rows', 'i need wat')
                self.assertIn('watch', first['slots'][5:])
                self.assertTrue(second['lineage'])
                self.assertIn('watch', second['slots'][:5])
                self.assertEqual(set(filter(None, second['slots'][:5])), set(second['ranked'][:5]))
            try:
                asyncio.run(run())
            finally:
                service.shutdown()


if __name__ == '__main__':
    unittest.main()
