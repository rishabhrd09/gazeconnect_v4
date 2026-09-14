"""Invalid display holds are unconditionally nonselectable; no unsafe opt-out."""
import pathlib
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from main import GazeConnectBackend, GazePoint, ServerConfig


class GapHoldTests(unittest.TestCase):
    def test_gap_hold_is_invalid_preserves_acquisition_time_and_recovers(self):
        backend = GazeConnectBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
        backend._broadcast = lambda *args: None
        start = time.time()
        with patch('main.time.time', return_value=start):
            backend._on_gaze_data(GazePoint(0.5, 0.5, start))
        original = dict(backend._last_gaze_payload)
        with patch('main.time.time', return_value=start + .2):
            backend._on_gaze_data(GazePoint(.5, .5, start + .2, False, False, 0))
        held = backend._last_gaze_payload
        self.assertFalse(held['is_valid'])
        self.assertNotEqual(held['signal_state'], 'valid')
        self.assertEqual(held['t_helper_ms'], original['t_helper_ms'])
        self.assertFalse(held['backend_on_key'])
        self.assertNotIn('intent_x', held)
        with patch('main.time.time', return_value=start + .25):
            backend._on_gaze_data(GazePoint(.8, .7, start + .25))
        recovered = backend._last_gaze_payload
        self.assertTrue(recovered['is_valid'])
        self.assertAlmostEqual(recovered['x'], .8)
        self.assertAlmostEqual(recovered['y'], .7)


if __name__ == '__main__':
    unittest.main()
