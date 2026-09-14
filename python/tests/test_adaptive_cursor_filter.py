import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from services.adaptive_cursor_filter import AdaptiveCursorFilter, FILTER_PROFILES


class AdaptiveCursorFilterTests(unittest.TestCase):
    def test_exactly_four_modes_with_legacy_aliases(self):
        self.assertEqual(set(FILTER_PROFILES), {'responsive', 'balanced', 'stable', 'gentle'})
        self.assertEqual(AdaptiveCursorFilter('als_early').preset, 'balanced')
        self.assertEqual(AdaptiveCursorFilter('als_late').preset, 'gentle')

    def test_elapsed_time_response_is_independent_of_sample_rate(self):
        # A small step stays inside the constant settle time region. Sampling
        # that same physical signal at 30/60/120 Hz must produce the same result.
        outputs = []
        for hz in (30, 60, 120):
            f = AdaptiveCursorFilter()
            f.update(0, 0, 0)
            for i in range(1, hz + 1):
                out = f.update(10, 0, i / hz)
            outputs.append(out[0])
        self.assertLess(max(outputs) - min(outputs), 1e-8)

    def test_step_settles_quickly_without_overshoot_in_every_mode(self):
        for preset in FILTER_PROFILES:
            with self.subTest(preset=preset):
                f = AdaptiveCursorFilter(preset)
                f.update(100, 100, 0)
                last = 100
                for i in range(1, 13):
                    x, y = f.update(900, 500, i / 60)
                    self.assertGreaterEqual(x, last)
                    self.assertLessEqual(x, 900)
                    self.assertLessEqual(y, 500)
                    last = x
                self.assertLess(900 - last, 10)  # <1.25% of the 800px travel at 200ms.

    def test_fixation_jitter_is_reduced_and_large_movement_releases_hold(self):
        f = AdaptiveCursorFilter()
        f.update(500, 500, 0, 'key')
        outputs = []
        for i in range(1, 61):
            outputs.append(f.update(500 + math.sin(i * 2) * 2,
                                    500 + math.cos(i * 2) * 2, i / 60, 'key')[0])
        self.assertLess(max(outputs) - min(outputs), 2)
        self.assertEqual(f.zone, 'lock')
        x, _ = f.update(650, 500, 61 / 60, 'other-key')
        self.assertGreater(x, 600)
        self.assertNotEqual(f.zone, 'lock')

    def test_no_target_never_locks_and_slow_intent_remains_reachable(self):
        f = AdaptiveCursorFilter('gentle')
        f.update(0, 0, 0)
        for i in range(1, 121):
            x, _ = f.update(i / 2, 0, i / 60)
            self.assertNotEqual(f.zone, 'lock')
        self.assertGreater(x, 55)

    def test_gap_resets_old_fixation_and_bad_data_cannot_poison_state(self):
        f = AdaptiveCursorFilter()
        f.update(20, 40, 1)
        self.assertEqual(f.update(100, 200, 1.2), (100, 200))
        self.assertEqual(f.update(0, 0, 1.1), (100, 200))
        with self.assertRaises(ValueError):
            f.update(float('nan'), 200, 1.3)
        self.assertTrue(all(math.isfinite(v) for v in f.update(101, 201, 1.3)))


if __name__ == '__main__':
    unittest.main()
