"""Edge and key-boundary stability, replayed through the real backend path.

Default geometry is the rig as first validated: a frameless window maximised to
the work area, 1920x1040 content on a 1920x1080 primary display. The bottom
keyboard row therefore sits against a window boundary that ordinary tracker
noise straddles. In full screen the content is 1920x1080 and every window edge is
a physical screen edge; the screen-edge band tests use that geometry.
Noise uses the spread measured on the Eye Tracker 5 (see gaze_filter_bench).
"""
import pathlib
import sys
import unittest
from typing import Dict, List

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from main import GazeConnectBackend, GazePoint, ServerConfig  # noqa: E402
from gaze_filter_bench import MEASURED_SIGMA_PX, NoiseSource  # noqa: E402

SCREEN_W, SCREEN_H, CONTENT_H = 1920, 1080, 1040
DT = 1 / 33.0
T0 = 1_800_000_000.0


class RecordingBackend(GazeConnectBackend):
    POINT_TTL_SECONDS = 10 ** 9  # Replayed stamps are not wall-clock fresh.

    def _broadcast(self, msg_type: str, data: Dict = None):
        self.events.append((msg_type, dict(data or {})))


def make_backend(edge_tolerance: bool = True, content_h: int = CONTENT_H, window_x: int = 0,
                 content_w: int = SCREEN_W) -> RecordingBackend:
    backend = RecordingBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
    backend.events = []
    if not edge_tolerance:  # The behaviour before these changes, for comparison:
        backend.EDGE_NOISE_HOLD_SECONDS = -1.0     # every stray edge sample invalidates,
        backend.DISPLAY_RESUME_SECONDS = -1.0      # and every loss re-seeds the cursor.
    backend._set_screen_size({
        'width': content_w, 'height': content_h, 'physicalWidth': SCREEN_W, 'physicalHeight': SCREEN_H,
        'dpr': 1, 'windowX': window_x, 'windowY': 0, 'screenX': 0, 'screenY': 0,
        'contentWidth': content_w, 'contentHeight': content_h, 'screenUnits': 'css', 'gazeActive': True,
    })
    backend.events.clear()
    return backend


def feed(backend: RecordingBackend, index: int, x_px: float, y_px: float):
    """One tracker sample at a SCREEN pixel position (may be off-screen)."""
    backend._on_gaze_data(GazePoint(x=x_px / SCREEN_W, y=y_px / SCREEN_H, timestamp=T0 + index * DT,
                                    left_valid=True, right_valid=True, confidence=0.75,
                                    validity_source='combined'))


def feed_invalid(backend: RecordingBackend, index: int):
    """What a blink looks like to the backend: a sample flagged not valid."""
    backend._on_gaze_data(GazePoint(x=0.5, y=0.5, timestamp=T0 + index * DT,
                                    left_valid=False, right_valid=False, confidence=0.0,
                                    validity_source='combined'))


def gaze_payloads(backend: RecordingBackend) -> List[Dict]:
    return [data for kind, data in backend.events if kind == 'gaze']


def frame_motion_rms(payloads: List[Dict]) -> float:
    points = [(p['x'] * SCREEN_W, p['y'] * CONTENT_H) for p in payloads if p.get('is_valid')]
    steps = [(bx - ax) ** 2 + (by - ay) ** 2 for (ax, ay), (bx, by) in zip(points, points[1:])]
    return (sum(steps) / len(steps)) ** 0.5


class EdgeNoiseToleranceTests(unittest.TestCase):
    BOTTOM_ROW_KEY = [{'id': 'key_space', 'x': 960, 'y': 985, 'width': 600, 'height': 110, 'size': 'md',
                       'context': 'keyboard', 'enabled': True}]

    def _bottom_row_fixation(self, edge_tolerance, inset_px, seed, seconds=10.0):
        """Fixate a bottom-row key with the apparent gaze inset_px above the
        window's bottom edge, using the vertical spread measured at centre."""
        backend = make_backend(edge_tolerance)
        backend._set_screen('keyboard')
        backend._register_targets(self.BOTTOM_ROW_KEY)
        backend.events.clear()
        noise = NoiseSource(seed, MEASURED_SIGMA_PX['centre'], 0.6)
        for i in range(int(seconds / DT)):
            dx, dy = noise.next()
            feed(backend, i, 960 + dx, CONTENT_H - inset_px + dy)
        steady = [p for p in gaze_payloads(backend) if p.get('is_valid')][15:]
        return {
            'losses': sum(1 for kind, _ in backend.events if kind == 'gaze_lost'),
            'held': sum(1 for p in steady if p.get('is_fixation')) / len(steady),
            'motion': frame_motion_rms(steady),
        }

    def test_boundary_noise_no_longer_wipes_filter_and_target_state(self):
        # 12 px inside the edge about one sample in six strays outside. Each
        # used to reset the filter and drop the target, so the hold kept
        # collapsing and the cursor was re-seeded at a raw sample.
        for seed in (50, 51, 52):
            with self.subTest(seed=seed):
                before = self._bottom_row_fixation(False, 12, seed)
                after = self._bottom_row_fixation(True, 12, seed)
                self.assertGreaterEqual(before['losses'], 15)       # The reset storm.
                self.assertLessEqual(after['losses'] * 4, before['losses'])
                self.assertLess(before['held'], 0.75)
                self.assertGreater(after['held'], 0.85)
                self.assertLess(after['motion'], 0.7 * before['motion'])

    def test_a_key_comfortably_inside_the_window_is_unaffected(self):
        before = self._bottom_row_fixation(False, 60, 50)
        after = self._bottom_row_fixation(True, 60, 50)
        self.assertEqual(before, after)
        self.assertEqual(after['losses'], 0)

    def test_tolerated_samples_are_never_published_or_clamped_to_the_border(self):
        backend = make_backend()
        for i in range(10):
            feed(backend, i, 960, 1020)
        published = len(gaze_payloads(backend))
        last = gaze_payloads(backend)[-1]
        feed(backend, 10, 960, 1055)               # Below the window, above the screen bottom.
        feed(backend, 11, 960, 1090)               # Below the physical screen.
        self.assertEqual(len(gaze_payloads(backend)), published)
        self.assertEqual(backend._last_gaze_payload, last)
        self.assertFalse(backend._tracking_lost)
        feed(backend, 12, 960, 1020)
        resumed = gaze_payloads(backend)[-1]
        self.assertTrue(resumed['is_valid'])
        self.assertLess(resumed['y'], 1.0)          # Not pinned to the edge.
        self.assertAlmostEqual(resumed['y'] * CONTENT_H, 1020, delta=2.0)

    def test_sustained_gaze_outside_the_window_is_invalidated_promptly(self):
        for label, y in (('taskbar', 1060), ('below_screen', 1100)):
            with self.subTest(where=label):
                backend = make_backend()
                for i in range(10):
                    feed(backend, i, 960, 1020)
                for k in range(8):
                    feed(backend, 10 + k, 960, y)
                    if backend._tracking_lost:
                        break
                self.assertTrue(backend._tracking_lost)
                # Lost within the hold window plus one sample interval.
                self.assertLessEqual(k * DT, backend.EDGE_NOISE_HOLD_SECONDS + DT + 1e-9)
                # ...and always inside the freshness horizon every consumer enforces.
                self.assertLess(backend.EDGE_NOISE_HOLD_SECONDS + DT, GazeConnectBackend.POINT_TTL_SECONDS)
                self.assertFalse(backend._last_gaze_payload['is_valid'])
                self.assertIsNone(backend.cursor_filter.estimate)

    def test_far_or_unexpected_departures_are_still_invalidated_at_once(self):
        cases = {
            'far below the edge': ((960, 1020), (960, 1040 + 65)),
            'far left of the screen': ((30, 500), (-70, 500)),
            'glance from mid-screen to the taskbar': ((960, 540), (960, 1060)),
            # Inside the brief-noise margin, but the gaze was not resting beside that edge.
            # (Nearer than SCREEN_EDGE_BAND_PX it is at the edge: see ScreenEdgeBandTests.)
            'glance from mid-screen past the left edge': ((960, 540), (-60, 540)),
        }
        for label, (resting, departure) in cases.items():
            with self.subTest(case=label):
                backend = make_backend()
                for i in range(10):
                    feed(backend, i, *resting)
                feed(backend, 10, *departure)
                self.assertTrue(backend._tracking_lost)

    def test_tolerance_needs_a_live_stream_and_never_revives_a_lost_one(self):
        backend = make_backend()
        feed(backend, 0, 960, 1060)                 # First ever sample is outside.
        self.assertTrue(backend._tracking_lost)
        for i in range(1, 6):
            feed(backend, i, 960, 1060)
        self.assertTrue(backend._tracking_lost)
        self.assertEqual(len([p for p in gaze_payloads(backend) if p.get('is_valid')]), 0)

    def test_side_and_top_edges_use_the_same_rule(self):
        for label, resting, stray in (('left', (25, 500), (-15, 500)), ('right', (1895, 500), (1935, 500)),
                                      ('top', (960, 20), (960, -20))):
            with self.subTest(edge=label):
                backend = make_backend()
                for i in range(10):
                    feed(backend, i, *resting)
                feed(backend, 10, *stray)
                self.assertFalse(backend._tracking_lost)
                feed(backend, 11, *resting)
                self.assertTrue(gaze_payloads(backend)[-1]['is_valid'])


class ScreenEdgeBandTests(unittest.TestCase):
    """Gaze reported just past a PHYSICAL screen edge is at that edge.

    A maintainer decision (AGENTS.md, 21 Sep 2026) that amends "off-screen gaze
    is never mapped onto a border control": a live recording showed gaze
    reported below the screen for 0.3-0.8 s at a time while a bottom control
    was being looked at. The band is narrow, exists only where the window edge
    is the screen edge, and everything past it is rejected as before.
    """
    BAND = GazeConnectBackend.SCREEN_EDGE_BAND_PX
    BOTTOM_KEY = [{'id': 'key_space', 'x': 960, 'y': 1015, 'width': 600, 'height': 110, 'size': 'md',
                   'context': 'keyboard', 'enabled': True}]

    def _rest(self, backend, x, y, count=10, start=0):
        for i in range(count):
            feed(backend, start + i, x, y)

    def test_gaze_just_past_a_physical_screen_edge_is_at_that_edge(self):
        cases = {'bottom': ((960, 1040), (960, 1080 + 30), (960, 1079)),
                 'top': ((960, 40), (960, -30), (960, 1)),
                 'left': ((40, 540), (-30, 540), (1, 540)),
                 'right': ((1880, 540), (1920 + 30, 540), (1919, 540)),
                 'the very edge of the band': ((960, 1040), (960, 1080 + self.BAND), (960, 1079))}
        for label, (resting, reported, expected) in cases.items():
            with self.subTest(edge=label):
                backend = make_backend(content_h=SCREEN_H)
                self._rest(backend, *resting)
                feed(backend, 10, *reported)
                payload = gaze_payloads(backend)[-1]
                self.assertTrue(payload['is_valid'])
                self.assertFalse(backend._tracking_lost)
                self.assertAlmostEqual(payload['mapped_x'] * SCREEN_W, expected[0], delta=0.01)
                self.assertAlmostEqual(payload['mapped_y'] * SCREEN_H, expected[1], delta=0.01)
                # Strictly inside the window, so it can never be "outside" for a consumer...
                self.assertTrue(0 < payload['mapped_x'] < 1 and 0 < payload['mapped_y'] < 1)
                # ...while the tracker's own report stays visible to diagnostics.
                self.assertAlmostEqual(payload['raw_x'] * SCREEN_W, reported[0], delta=0.01)
                self.assertAlmostEqual(payload['raw_y'] * SCREEN_H, reported[1], delta=0.01)

    def test_a_bottom_row_hold_survives_gaze_reported_below_the_screen(self):
        def run(band_px):
            backend = make_backend(content_h=SCREEN_H)
            backend.SCREEN_EDGE_BAND_PX = band_px
            backend._set_screen('keyboard')
            backend._register_targets(self.BOTTOM_KEY)
            backend.events.clear()
            noise = NoiseSource(61, MEASURED_SIGMA_PX['centre'], 0.6)
            index = 0
            # Looking at the key, then 0.6 s reported 25 px under the glass, then back.
            for seconds, y in ((1.0, 1045), (0.6, SCREEN_H + 25), (1.0, 1045)):
                for _ in range(int(seconds / DT)):
                    dx, dy = noise.next()
                    feed(backend, index, 960 + dx, min(y + dy, SCREEN_H + self.BAND))
                    index += 1
            payloads = gaze_payloads(backend)
            steady = payloads[15:]
            return {'losses': sum(1 for kind, _ in backend.events if kind == 'gaze_lost'),
                    'invalid': sum(1 for p in payloads if not p.get('is_valid')),
                    'on_key': sum(1 for p in steady if p.get('backend_on_key')) / len(steady),
                    'held': sum(1 for p in steady if p.get('is_fixation')) / len(steady)}
        strict, banded = run(-1.0), run(self.BAND)
        self.assertGreaterEqual(strict['losses'], 1)            # The bottom-row break that was reported.
        self.assertGreaterEqual(strict["invalid"], 10)
        self.assertEqual(banded['losses'], 0)
        self.assertEqual(banded['invalid'], 0)
        self.assertEqual(banded['on_key'], 1.0)
        self.assertGreater(banded['held'], 0.9)

    def test_gaze_farther_out_than_the_band_is_still_rejected(self):
        for label, resting, reported in (('below', (960, 540), (960, 1080 + self.BAND + 2)),
                                         ('above', (960, 540), (960, -self.BAND - 2)),
                                         ('left', (960, 540), (-self.BAND - 2, 540)),
                                         ('right', (960, 540), (1920 + self.BAND + 2, 540)),
                                         ('corner, one axis too far', (960, 540), (-20, -self.BAND - 2))):
            with self.subTest(where=label):
                backend = make_backend(content_h=SCREEN_H)
                self._rest(backend, *resting)
                held = gaze_payloads(backend)[-1]
                feed(backend, 10, *reported)
                payload = backend._last_gaze_payload
                self.assertTrue(backend._tracking_lost)
                self.assertFalse(payload['is_valid'])
                self.assertNotIn('intent_x', payload)
                # The held display point is not moved towards the rejected sample...
                self.assertEqual((payload['x'], payload['y']), (held['x'], held['y']))
                # ...which is reported for diagnostics only.
                self.assertAlmostEqual(payload['rejected_x'] * SCREEN_W, reported[0], delta=0.1)
                self.assertAlmostEqual(payload['rejected_y'] * SCREEN_H, reported[1], delta=0.1)
                feed(backend, 11, *resting)
                self.assertNotIn('rejected_x', gaze_payloads(backend)[-1])

    def test_a_corner_is_banded_only_when_both_axes_are_within_the_band(self):
        backend = make_backend(content_h=SCREEN_H)
        self._rest(backend, 40, 40)
        feed(backend, 10, -30, -30)
        payload = gaze_payloads(backend)[-1]
        self.assertTrue(payload['is_valid'])
        self.assertAlmostEqual(payload['mapped_x'] * SCREEN_W, 1, delta=0.01)
        self.assertAlmostEqual(payload['mapped_y'] * SCREEN_H, 1, delta=0.01)

    def test_an_edge_that_borders_other_ui_stays_strict(self):
        # Maximised, not full screen: the taskbar lies under the window.
        for label, reported in (('on the taskbar', (960, 1060)), ('under the glass', (960, 1090))):
            with self.subTest(where=label):
                backend = make_backend()
                self._rest(backend, 960, 540)
                feed(backend, 10, *reported)
                self.assertTrue(backend._tracking_lost)
                self.assertFalse(backend._last_gaze_payload['is_valid'])
        # The same window still has three edges on the glass.
        backend = make_backend()
        self._rest(backend, 960, 40)
        feed(backend, 10, 960, -30)
        self.assertTrue(gaze_payloads(backend)[-1]['is_valid'])
        # A window that stops short of the screen's left edge borders other UI there.
        backend = make_backend(content_h=SCREEN_H, window_x=200, content_w=SCREEN_W - 200)
        self._rest(backend, 960, 540)
        feed(backend, 10, -10, 540)
        self.assertTrue(backend._tracking_lost)

    def test_resting_gaze_next_to_a_strict_edge_keeps_the_brief_tolerance_only(self):
        backend = make_backend()
        self._rest(backend, 960, 1020)
        published = len(gaze_payloads(backend))
        feed(backend, 10, 960, 1090)                # Tolerated, never published or clamped.
        self.assertEqual(len(gaze_payloads(backend)), published)
        for k in range(1, 6):
            feed(backend, 10 + k, 960, 1090)
        self.assertTrue(backend._tracking_lost)     # ...and lost once it persists.

    def test_the_band_needs_geometry_the_interface_reported(self):
        backend = RecordingBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
        backend.events = []
        self.assertIsNone(backend._screen_edge_band(-0.001, 0.5))
        feed(backend, 0, -2, 540)
        self.assertFalse(backend._last_gaze_payload['is_valid'])

    def test_the_band_is_measured_in_css_pixels_under_display_scaling(self):
        # 125 % scaling: a 1920x1080 panel is 1536x864 CSS px.
        css_w, css_h = 1536, 864
        def scaled():
            backend = RecordingBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
            backend.events = []
            backend._set_screen_size({
                'width': css_w, 'height': css_h, 'physicalWidth': css_w, 'physicalHeight': css_h,
                'dpr': 1.25, 'windowX': 0, 'windowY': 0, 'screenX': 0, 'screenY': 0,
                'contentWidth': css_w, 'contentHeight': css_h, 'screenUnits': 'css', 'gazeActive': True})
            return backend
        self.assertIsNotNone(scaled()._screen_edge_band(0.5, 1 + (self.BAND - 1) / css_h))
        self.assertIsNone(scaled()._screen_edge_band(0.5, 1 + (self.BAND + 1) / css_h))

    def test_an_invalid_sample_in_the_band_stays_invalid(self):
        backend = make_backend(content_h=SCREEN_H)
        self._rest(backend, 960, 1040)
        backend._on_gaze_data(GazePoint(x=0.5, y=(SCREEN_H + 20) / SCREEN_H, timestamp=T0 + 10 * DT,
                                        left_valid=False, right_valid=False, confidence=0.0,
                                        validity_source='combined'))
        self.assertFalse(backend._last_gaze_payload['is_valid'])
        self.assertTrue(backend._tracking_lost)

    def test_malformed_coordinates_are_never_banded(self):
        backend = make_backend(content_h=SCREEN_H)
        for x, y in ((float('nan'), 0.5), (float('inf'), 0.5), (None, 0.5), ('left', 0.5), (0.5, float('-inf'))):
            self.assertIsNone(backend._screen_edge_band(x, y))
        self.assertIsNone(backend._screen_edge_band(0.5, 0.5))       # On the screen: untouched.
        self.assertIsNone(backend._screen_edge_band(0.0, 1.0))


class DisplayContinuityTests(unittest.TestCase):
    """A brief loss must not make the cursor hop, and must never be selectable."""
    KEY = [{'id': 'key_h', 'x': 960, 'y': 500, 'width': 150, 'height': 110, 'size': 'md',
            'context': 'keyboard', 'enabled': True}]

    def _fixate(self, backend, count, start=0, x=972.0, seed=8):
        noise = NoiseSource(seed, MEASURED_SIGMA_PX['centre'], 0.6)
        for i in range(count):
            dx, dy = noise.next()
            feed(backend, start + i, x + dx, 500 + dy)

    def _on_key(self, edge_tolerance=True):
        backend = make_backend(edge_tolerance)
        backend._set_screen('keyboard')
        backend._register_targets(self.KEY)
        self._fixate(backend, 50)
        return backend

    def _position(self, backend):
        payload = gaze_payloads(backend)[-1]
        return payload['x'] * SCREEN_W, payload['y'] * CONTENT_H

    def test_a_blink_clears_live_state_and_is_never_selectable(self):
        backend = self._on_key()
        self.assertEqual(backend._on_key_target_id, 'key_h')
        feed_invalid(backend, 50)
        payload = backend._last_gaze_payload
        self.assertFalse(payload['is_valid'])
        self.assertFalse(payload['backend_on_key'])
        self.assertFalse(payload['is_fixation'])
        self.assertNotIn('intent_x', payload)
        # Nothing about the old fixation is reachable while gaze is invalid.
        self.assertIsNone(backend.cursor_filter.estimate)
        self.assertIsNone(backend._on_key_target_id)
        self.assertIsNone(backend._sticky_magnet_target)

    def test_the_cursor_does_not_hop_after_a_blink(self):
        hops = {}
        for label, tolerant in (('before', False), ('after', True)):
            backend = self._on_key(tolerant)
            before_x, before_y = self._position(backend)
            for k in range(6):                       # ~180 ms of invalid samples.
                feed_invalid(backend, 50 + k)
            feed(backend, 56, 972 + 22, 500 - 19)    # First sample back: ordinary noise.
            after_x, after_y = self._position(backend)
            self.assertTrue(gaze_payloads(backend)[-1]['is_valid'])
            hops[label] = ((after_x - before_x) ** 2 + (after_y - before_y) ** 2) ** 0.5
        self.assertGreater(hops['before'], 20.0)     # Re-seeded at the raw sample.
        self.assertLess(hops['after'], 0.4 * hops['before'])   # The fixation it was holding,
        self.assertLess(hops['after'], 10.0)                   # nudged by one ordinary sample.
        self.assertEqual(backend._on_key_target_id, 'key_h')
        self.assertTrue(gaze_payloads(backend)[-1]['is_fixation'])

    def test_a_second_report_of_the_same_loss_is_not_reordered_gaze(self):
        # The receiver and the helper both report 150 ms of silence. The helper's
        # whole-millisecond stamp is often the older one and arrives second.
        def silence(backend, stamp, source):
            backend._on_gaze_data(GazePoint(x=0.5, y=0.5, timestamp=stamp, left_valid=False,
                                            right_valid=False, confidence=0.0, validity_source=source))
        backend = self._on_key()
        before_x, before_y = self._position(backend)
        last = T0 + 49 * DT
        silence(backend, last + 0.1509, 'transport')
        silence(backend, last + 0.1500, 'timeout')
        self.assertEqual(backend._last_gaze_payload['signal_state'], 'blink')
        self.assertFalse(backend._last_gaze_payload['is_valid'])
        self.assertIsNone(backend.cursor_filter.estimate)        # Live state stays cleared.
        feed(backend, 56, 972 + 22, 500 - 19)                     # Eyes reopen ~210 ms later.
        after_x, after_y = self._position(backend)
        self.assertTrue(gaze_payloads(backend)[-1]['is_valid'])
        self.assertLess(((after_x - before_x) ** 2 + (after_y - before_y) ** 2) ** 0.5, 10.0)
        self.assertEqual(backend._on_key_target_id, 'key_h')
        # Reordered VALID gaze, or an invalid sample while tracking is live, is still refused.
        backend._on_gaze_data(GazePoint(x=0.2, y=0.2, timestamp=T0 + 55 * DT, left_valid=True,
                                        right_valid=True, confidence=0.75, validity_source='combined'))
        self.assertEqual(backend._last_gaze_payload['signal_state'], 'out_of_order')
        backend = self._on_key()
        silence(backend, T0 + 40 * DT, 'timeout')
        self.assertEqual(backend._last_gaze_payload['signal_state'], 'out_of_order')

    def test_a_dropout_up_to_the_interfaces_horizon_continues_the_fixation(self):
        # The interface pauses a dwell through a loss of up to 1 s and then
        # continues it; the cursor continues the same fixation, not a re-seed at
        # the first (noisiest) sample back. Near the bottom of the screen the
        # tracker drops the eyes for 0.4-1 s at a time.
        backend = self._on_key()
        before_x, before_y = self._position(backend)
        for k in range(23):                          # ~700 ms.
            feed_invalid(backend, 50 + k)
        feed(backend, 73, 972 + 22, 500 - 19)        # Back on the same key: ordinary noise.
        after_x, after_y = self._position(backend)
        self.assertLess(((after_x - before_x) ** 2 + (after_y - before_y) ** 2) ** 0.5, 10.0)
        self.assertEqual(backend._on_key_target_id, 'key_h')

    def test_a_long_loss_starts_afresh(self):
        backend = self._on_key()
        for k in range(36):                          # ~1.1 s, past the interface's 1 s horizon.
            feed_invalid(backend, 50 + k)
        feed(backend, 86, 994, 481)
        self.assertAlmostEqual(self._position(backend)[0], 994, delta=3.0)   # Re-seeded (less a ~2 px magnet pull).
        self.assertFalse(gaze_payloads(backend)[-1]['is_fixation'])

    def test_losing_focus_or_stale_data_never_resumes(self):
        backend = self._on_key()
        backend._invalidate_gaze('inactive_window', T0 + 50 * DT)
        self.assertIsNone(backend._suspended_display)
        feed(backend, 51, 994, 481)
        self.assertAlmostEqual(self._position(backend)[0], 994, delta=3.0)   # Re-seeded (less a ~2 px magnet pull).
        # A resumable loss followed by a non-resumable one is not resumable.
        backend = self._on_key()
        feed_invalid(backend, 50)
        self.assertIsNotNone(backend._suspended_display)
        backend._invalidate_gaze('stale', T0 + 51 * DT)
        self.assertIsNone(backend._suspended_display)

    def test_a_target_removed_or_a_screen_changed_during_the_loss_is_not_restored(self):
        backend = self._on_key()
        feed_invalid(backend, 50)
        backend._register_targets([])
        feed(backend, 51, 972, 500)
        self.assertIsNone(backend._on_key_target_id)
        self.assertIsNone(backend._sticky_magnet_target)
        backend = self._on_key()
        feed_invalid(backend, 50)
        backend._set_screen('home')
        feed(backend, 51, 994, 481)
        self.assertAlmostEqual(self._position(backend)[0], 994, delta=3.0)   # Re-seeded (less a ~2 px magnet pull).

    def test_suspended_state_is_used_once(self):
        backend = self._on_key()
        feed_invalid(backend, 50)
        feed(backend, 51, 972, 500)
        self.assertIsNone(backend._suspended_display)


class TargetIdentityStabilityTests(unittest.TestCase):
    KEYS = [{'id': f'key_{name}', 'x': x, 'y': 500, 'width': 150, 'height': 110, 'size': 'md',
             'context': 'keyboard', 'enabled': True} for name, x in (('a', 885), ('b', 1035))]

    def _fixate(self, backend, x, y, seconds, seed, start=0):
        noise = NoiseSource(seed, MEASURED_SIGMA_PX['top_right'], 0.6)   # The noisiest measured spot.
        identities = []
        for i in range(int(seconds / DT)):
            dx, dy = noise.next()
            feed(backend, start + i, x + dx, y + dy)
            identities.append(backend._on_key_target_id)
        return identities

    def test_identity_does_not_flip_with_noise_beside_a_key_boundary(self):
        backend = make_backend()
        backend._set_screen('keyboard')
        backend._register_targets(self.KEYS)
        # 12 px inside key_a, beside the shared boundary at x = 960.
        identities = self._fixate(backend, 948, 500, 6.0, seed=9)[15:]
        flips = sum(1 for a, b in zip(identities, identities[1:]) if a != b)
        self.assertLessEqual(flips, 2)
        locked = [p.get('is_fixation') for p in gaze_payloads(backend)[15:]]
        self.assertGreater(sum(locked) / len(locked), 0.85)

    def test_identity_and_cursor_follow_a_real_move_to_the_neighbour(self):
        backend = make_backend()
        backend._set_screen('keyboard')
        backend._register_targets(self.KEYS)
        n = len(self._fixate(backend, 885, 500, 2.0, seed=3))
        self.assertEqual(backend._on_key_target_id, 'key_a')
        followed = self._fixate(backend, 1035, 500, 0.5, seed=4, start=n)
        # Within four samples (~120 ms) of the eye landing on the neighbour.
        self.assertIn('key_b', followed[:4])
        self.assertEqual(followed[-1], 'key_b')
        self.assertGreater(gaze_payloads(backend)[-1]['x'] * SCREEN_W, 990)


class TrackerStatusTests(unittest.TestCase):
    def test_status_explains_silence_and_is_sent_on_change_only(self):
        backend = make_backend()
        backend.config.tobii_enabled = True
        backend.tobii.is_connected = True
        status = {'type': 'status', 'stream_state': 'no_user', 'device_status': 'Tracking',
                  'user_presence': 'NotPresent', 'gaze_tracking': 'GazeNotTracked', 'recoveries': 0}
        for _ in range(3):
            backend.tobii.last_status = status
            backend._on_tracker_status(status)
        sent = [data for kind, data in backend.events if kind == 'tracker_status']
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]['stream_state'], 'no_user')
        self.assertEqual(sent[0]['user_presence'], 'NotPresent')
        backend.tobii.is_connected = False
        backend.tobii.last_status = None
        backend._on_tracker_status(None)
        self.assertEqual([d['stream_state'] for k, d in backend.events if k == 'tracker_status'],
                         ['no_user', 'helper_unavailable'])

    def test_the_unfiltered_stream_is_reported_and_switches_on_jump_confirmation(self):
        backend = make_backend()
        backend.config.tobii_enabled = True
        backend.tobii.is_connected = True
        self.assertFalse(backend.cursor_filter.raw_stream)
        for mode, expected in (('Unfiltered', True), ('LightlyFiltered', False), (None, False)):
            backend.tobii.last_status = {'stream_state': 'streaming', 'stream_mode': mode}
            backend._on_tracker_status(backend.tobii.last_status)
            self.assertEqual(backend.cursor_filter.raw_stream, expected)
            self.assertEqual(backend._tracker_status_payload()['stream_mode'], mode)

    def test_the_interface_timing_summary_reaches_only_other_listeners(self):
        backend = make_backend()
        sent = []
        backend._send = lambda client, kind, data=None: sent.append((client, kind, data))
        interface, observer = object(), object()
        backend.connected_clients = {interface, observer}
        backend._relay_renderer_latency(interface, {'summary': {
            'paint_p50': 7.26, 'frames': 500, 'nan': float('nan'), 'flag': True, 'text': 'typed words',
            'nested': {'a': 1}, 'k' * 40: 1.0}})
        self.assertEqual(sent, [(observer, 'renderer_latency', {'summary': {'paint_p50': 7.3, 'frames': 500.0}})])
        sent.clear()
        backend.connected_clients = {interface}          # Nobody listening: nothing is sent.
        backend._relay_renderer_latency(interface, {'summary': {'paint_p50': 7.0}})
        for malformed in ({}, {'summary': 'fast'}, {'summary': []}, {'summary': {'only': 'text'}}):
            backend.connected_clients = {interface, observer}
            backend._relay_renderer_latency(interface, malformed)
        self.assertEqual(sent, [])
        flood = {'summary': {f'k{i}': i for i in range(200)}}
        backend._relay_renderer_latency(interface, flood)
        self.assertEqual(len(sent[0][2]['summary']), backend.RENDERER_LATENCY_MAX_FIELDS)
        self.assertEqual(backend.events, [])              # Never broadcast, never part of the gaze path.

    def test_an_older_helper_without_status_reports_unknown_not_a_fault(self):
        backend = make_backend()
        backend.config.tobii_enabled = True
        backend.tobii.is_connected = True
        self.assertEqual(backend._tracker_status_payload()['stream_state'], 'unknown')


if __name__ == '__main__':
    unittest.main()
