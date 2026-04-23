import pathlib
import sys
import time
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from main import GazeConnectBackend, GazePoint, ServerConfig  # noqa: E402
from services.calibration import CalibrationProfile, CalibrationPoint, GazeCalibrationCorrector  # noqa: E402


class PipelineMappingTests(unittest.TestCase):
    def _backend(self) -> GazeConnectBackend:
        cfg = ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False)
        return GazeConnectBackend(cfg)

    def test_content_center_maps_to_center_physical_screen_report(self):
        backend = self._backend()
        backend._set_screen_size({
            "width": 1536,
            "height": 782,
            "physicalWidth": 1920,
            "physicalHeight": 1080,
            "dpr": 1.25,
            "windowX": 0,
            "windowY": 0,
        })

        # Convert content center back to full-screen normalized coordinates.
        css_screen_h = 1080 / 1.25
        x_in = 0.5
        y_in = (782 * 0.5) / css_screen_h
        x_out, y_out = backend._screen_to_window_normalized(x_in, y_in)

        self.assertAlmostEqual(x_out, 0.5, delta=0.02)
        self.assertAlmostEqual(y_out, 0.5, delta=0.02)

    def test_content_edges_reachable_css_screen_report(self):
        backend = self._backend()
        backend._set_screen_size({
            "width": 1536,
            "height": 782,
            "physicalWidth": 1536,
            "physicalHeight": 864,
            "dpr": 1.25,
            "windowX": 0,
            "windowY": 0,
        })

        # Left/top corner of content
        x0, y0 = backend._screen_to_window_normalized(0.0, 0.0)
        self.assertGreaterEqual(x0, 0.0)
        self.assertGreaterEqual(y0, 0.0)

        # Right/bottom corner of content expressed in full-screen normalized units
        x1_in = 1536 / 1536
        y1_in = 782 / 864
        x1, y1 = backend._screen_to_window_normalized(x1_in, y1_in)
        self.assertAlmostEqual(x1, 1.0, delta=0.02)
        self.assertAlmostEqual(y1, 1.0, delta=0.03)

    def test_idw_post_correction_reduces_local_error(self):
        corrector = GazeCalibrationCorrector()
        profile = CalibrationProfile(
            x_coefficients=[0, 1, 0, 0, 0, 0],
            y_coefficients=[0, 0, 1, 0, 0, 0],
            is_valid=True,
        )
        profile.points = [
            CalibrationPoint(target_x=0.2, target_y=0.2, median_gaze_x=0.24, median_gaze_y=0.22),
            CalibrationPoint(target_x=0.8, target_y=0.2, median_gaze_x=0.82, median_gaze_y=0.24),
            CalibrationPoint(target_x=0.2, target_y=0.8, median_gaze_x=0.23, median_gaze_y=0.83),
            CalibrationPoint(target_x=0.8, target_y=0.8, median_gaze_x=0.84, median_gaze_y=0.85),
        ]
        corrector.load_profile(profile)
        self.assertGreater(corrector.get_stats().get('idw_points', 0), len(profile.points))

        cx, cy = corrector.correct(0.24, 0.22)
        self.assertAlmostEqual(cx, 0.2, delta=0.03)
        self.assertAlmostEqual(cy, 0.2, delta=0.03)

    def test_calibration_session_receives_window_normalized_coordinates(self):
        backend = self._backend()
        backend._set_screen_size({
            "width": 1536,
            "height": 782,
            "physicalWidth": 1920,
            "physicalHeight": 1080,
            "dpr": 1.25,
            "windowX": 0,
            "windowY": 0,
        })

        captured = []

        class Session:
            def update(self, x, y, confidence):
                captured.append((x, y, confidence))

        backend.calibration_active = True
        backend.calibration_session = Session()

        point = GazePoint(
            x=0.5,
            y=0.5,
            timestamp=time.time(),
            left_valid=True,
            right_valid=True,
            confidence=0.95,
        )
        backend._on_gaze_data(point)

        self.assertTrue(captured)
        expected_x, expected_y = backend._screen_to_window_normalized(0.5, 0.5)
        self.assertAlmostEqual(captured[0][0], expected_x, delta=0.02)
        self.assertAlmostEqual(captured[0][1], expected_y, delta=0.02)
        self.assertAlmostEqual(captured[0][2], 0.95, delta=1e-6)

    def test_stale_blink_guard_cancels_backend_dwell_progress(self):
        backend = self._backend()
        backend.BACKEND_DWELL_ENABLED = True
        backend._register_targets([{
            "id": "center",
            "x": 960,
            "y": 540,
            "width": 280,
            "height": 180,
            "size": "md",
            "context": "navigation",
            "enabled": True,
        }])

        detector = backend.dwell_manager.detectors[backend.current_screen]

        backend._on_gaze_data(GazePoint(
            x=0.5, y=0.5, timestamp=time.time(),
            left_valid=True, right_valid=True, confidence=1.0,
        ))
        self.assertIsNotNone(detector.state.target)

        backend._on_gaze_data(GazePoint(
            x=0.5, y=0.5, timestamp=time.time(),
            left_valid=False, right_valid=False, confidence=0.0,
        ))
        self.assertIsNone(detector.state.target)
        self.assertEqual(detector.selections_count, 0)

    def test_classifier_basis_uses_screen_dimensions(self):
        backend = self._backend()
        backend._set_screen_size({
            "width": 1280,
            "height": 720,
            "physicalWidth": 1920,
            "physicalHeight": 1080,
            "dpr": 1.25,
            "windowX": 120,
            "windowY": 80,
        })
        self.assertEqual(backend.gaze_classifier.screen.width_px, 1920)
        self.assertEqual(backend.gaze_classifier.screen.height_px, 1080)

    def test_dual_pull_coordination_payload_exposes_backend_pull(self):
        backend = self._backend()
        backend._register_targets([{
            "id": "nav-center",
            "x": 980,
            "y": 540,
            "width": 220,
            "height": 140,
            "size": "md",
            "context": "navigation",
            "enabled": True,
        }])

        backend._on_gaze_data(GazePoint(
            x=0.515, y=0.5, timestamp=time.time(),
            left_valid=True, right_valid=True, confidence=1.0,
        ))
        payload = backend._last_gaze_payload or {}
        self.assertIn('backend_on_key', payload)
        self.assertIn('backend_magnet_px', payload)
        self.assertIn('backend_zone', payload)
        self.assertGreater(float(payload.get('backend_magnet_px', 0.0)), 0.05)

    def test_on_key_releases_after_short_hold_when_leaving_target(self):
        backend = self._backend()
        backend._register_targets([{
            "id": "center",
            "x": 960,
            "y": 540,
            "width": 240,
            "height": 140,
            "size": "md",
            "context": "navigation",
            "enabled": True,
        }])

        backend._on_gaze_data(GazePoint(
            x=0.5, y=0.5, timestamp=time.time(),
            left_valid=True, right_valid=True, confidence=1.0,
        ))
        payload = backend._last_gaze_payload or {}
        self.assertTrue(payload.get('backend_on_key', False))

        time.sleep(0.14)
        backend._on_gaze_data(GazePoint(
            x=0.08, y=0.08, timestamp=time.time(),
            left_valid=True, right_valid=True, confidence=1.0,
        ))
        payload2 = backend._last_gaze_payload or {}
        self.assertFalse(payload2.get('backend_on_key', True))

    def test_sticky_magnet_handoff_switches_to_closer_adjacent_target(self):
        backend = self._backend()
        backend._register_targets([
            {
                "id": "left",
                "x": 500,
                "y": 540,
                "width": 90,
                "height": 90,
                "size": "md",
                "context": "navigation",
                "enabled": True,
            },
            {
                "id": "right",
                "x": 560,
                "y": 540,
                "width": 90,
                "height": 90,
                "size": "md",
                "context": "navigation",
                "enabled": True,
            },
        ])

        backend._sticky_magnet_target = None
        backend._last_magnet_raw = (500, 540)
        backend._apply_magnetism(500, 540)
        self.assertIsNotNone(backend._sticky_magnet_target)
        self.assertEqual(backend._sticky_magnet_target.id, "left")

        # Move toward right while still inside left release radius.
        backend._apply_magnetism(540, 540)
        self.assertIsNotNone(backend._sticky_magnet_target)
        self.assertEqual(backend._sticky_magnet_target.id, "right")


if __name__ == "__main__":
    unittest.main()
