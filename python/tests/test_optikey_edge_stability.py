import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from services.one_euro_filter import OptiKeyGazeFilter  # noqa: E402


class OptiKeyEdgeStabilityTests(unittest.TestCase):
    def _filter(self) -> OptiKeyGazeFilter:
        filt = OptiKeyGazeFilter(damping_level=0.4)
        filt.set_screen_mode('home')
        return filt

    def test_hard_edge_passthrough_reaches_bottom(self):
        filt = self._filter()
        filt.update(0.5, 0.5)
        _, y = filt.update(0.5, 1.0)
        self.assertAlmostEqual(y, 1.0, delta=1e-6)

    def test_near_edge_motion_does_not_lock(self):
        filt = self._filter()
        filt.update(0.93, 0.50)
        x, _ = filt.update(0.975, 0.50)
        self.assertGreater(x, 0.95)
        self.assertIn(filt._current_zone, {'edge', 'edge-hold', 'free'})

    def test_micro_jitter_stays_stable_near_center(self):
        filt = self._filter()
        filt.update(0.5, 0.5)

        outputs = []
        for x, y in [
            (0.5008, 0.4996),
            (0.4997, 0.5005),
            (0.5006, 0.5003),
            (0.4999, 0.4998),
        ]:
            outputs.append(filt.update(x, y))

        spread_x = max(v[0] for v in outputs) - min(v[0] for v in outputs)
        spread_y = max(v[1] for v in outputs) - min(v[1] for v in outputs)
        self.assertLess(spread_x, 0.0025)
        self.assertLess(spread_y, 0.0025)

    def test_navigation_fixation_zone_keeps_responsive_motion(self):
        filt = self._filter()
        filt.update(0.5, 0.5)

        out = (0.5, 0.5)
        for x in [0.512, 0.518, 0.525]:
            out = filt.update(x, 0.5)

        self.assertGreater(out[0], 0.505)
        self.assertEqual(filt._current_zone, 'fixation')


if __name__ == "__main__":
    unittest.main()
