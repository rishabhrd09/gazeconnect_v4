"""Gap-hold stale marking (ENABLE_GAP_HOLD_STALE_MARK / GAZECONNECT_GAP_HOLD_MARK).

The gap-hold path re-broadcasts the last gaze payload when a >150ms gap
arrives with a non-VALID sample (blink). Legacy behavior re-sent the
payload VERBATIM — including signal_state:'valid' — which defeated the
frontend's dwellPauseOnGap (it pauses on staleness OR a non-'valid'
signal_state, but a rebroadcast is a fresh WS message with a 'valid'
state). With the flag on, the held frame is re-sent as a copy marked
signal_state:'gap_hold' while is_valid stays true (cursor visible, dwell
paused).
"""

import pathlib
import sys
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from main import GazeConnectBackend, GazePoint, ServerConfig  # noqa: E402


class GapHoldMarkTests(unittest.TestCase):
    def _backend(self) -> GazeConnectBackend:
        cfg = ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False)
        return GazeConnectBackend(cfg)

    def test_helper_marks_copy_without_mutating_original(self):
        original = {"x": 0.5, "signal_state": "valid", "is_valid": True}
        held = GazeConnectBackend._gap_hold_payload(original, True)
        self.assertEqual(held["signal_state"], "gap_hold")
        self.assertTrue(held["is_valid"])  # cursor stays visible
        self.assertIsNot(held, original)
        self.assertEqual(original["signal_state"], "valid")  # no mutation

    def test_legacy_passthrough_is_verbatim(self):
        original = {"signal_state": "valid"}
        self.assertIs(GazeConnectBackend._gap_hold_payload(original, False), original)

    def test_blink_gap_rebroadcast_state_end_to_end(self):
        """Flag ON: the held rebroadcast carries 'gap_hold'.
        Flag OFF: it carries the stale 'valid' (the legacy defect)."""
        for flag, expected_state in ((True, "gap_hold"), (False, "valid")):
            with self.subTest(flag=flag):
                backend = self._backend()
                backend.ENABLE_GAP_HOLD_STALE_MARK = flag
                sent = []
                backend._broadcast = lambda kind, payload, _s=sent: _s.append((kind, payload))

                t0 = time.time()
                # Prime: a valid sample builds _last_gaze_payload.
                backend._on_gaze_data(GazePoint(
                    x=0.5, y=0.5, timestamp=t0,
                    left_valid=True, right_valid=True, confidence=1.0,
                ))
                # Blink: >150ms gap + invalid sample -> gap-hold rebroadcast.
                backend._on_gaze_data(GazePoint(
                    x=0.5, y=0.5, timestamp=t0 + 0.4,
                    left_valid=False, right_valid=False, confidence=0.0,
                ))

                gaze_msgs = [payload for kind, payload in sent if kind == "gaze"]
                self.assertGreaterEqual(
                    len(gaze_msgs), 2,
                    f"flag={flag}: expected primed frame + held rebroadcast, got {len(gaze_msgs)}",
                )
                self.assertEqual(gaze_msgs[0]["signal_state"], "valid")
                self.assertEqual(gaze_msgs[-1]["signal_state"], expected_state)
                self.assertTrue(gaze_msgs[-1]["is_valid"])
                # gaze_lost fired either way (pre-existing behavior).
                self.assertTrue(any(kind == "gaze_lost" for kind, _ in sent))


if __name__ == "__main__":
    unittest.main()
