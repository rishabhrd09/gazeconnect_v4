import asyncio
import json
import pathlib
import sys
import time
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from main import TobiiReceiver, GazeConnectBackend, GazePoint, ServerConfig
from services.signal_conditioner import SignalConditioner, GazeValidity


class ReceiverTests(unittest.IsolatedAsyncioTestCase):
    async def test_combined_validity_is_honored_and_geometry_is_not_stretched(self):
        receiver = TobiiReceiver()
        points = []
        receiver.on_gaze = points.append
        for valid in (True, False):
            await receiver._process_message(json.dumps({
                'type': 'gaze', 'timestamp': time.time() * 1000,
                'x': .025, 'y': .035, 'is_valid': valid, 'confidence': 1,
            }))
        self.assertTrue(points[0].is_valid)
        self.assertFalse(points[1].is_valid)
        self.assertEqual((points[0].x, points[0].y), (.025, .035))
        self.assertEqual(points[0].validity_source, 'combined')
        self.assertEqual(points[0].confidence, .75)

    async def test_invalid_override_nonfinite_and_missing_validity_fail_closed(self):
        cases = [
            {'left_valid': True, 'right_valid': True, 'is_valid': False},
            {'is_valid': 'false'},
            {},
            {'is_valid': True, 'x': float('nan')},
            {'is_valid': True, 'confidence': float('inf')},
            {'is_valid': True, 'timestamp': None},
        ]
        for data in cases:
            receiver = TobiiReceiver()
            points = []
            receiver.on_gaze = points.append
            await receiver._process_message(json.dumps({
                'type': 'gaze', 'x': .5, 'y': .5, 'timestamp': time.time() * 1000,
                **data,
            }))
            self.assertTrue(points)
            self.assertFalse(points[-1].is_valid, data)

    async def test_mailbox_epoch_preserves_an_intervening_lost_sample(self):
        receiver = TobiiReceiver()
        points = []
        receiver.on_gaze = points.append
        now = time.time()
        for i, epoch in enumerate((0, 1)):
            await receiver._process_message(json.dumps({
                'type': 'gaze', 'timestamp': now + i * .03, 'tracking_epoch': epoch,
                'x': .5, 'y': .5, 'is_valid': True,
            }))
        self.assertEqual([p.is_valid for p in points], [True, False, True])
        self.assertLess(points[1].timestamp, points[2].timestamp)

    async def test_timeout_and_disconnect_cancel_pending_reconnect(self):
        receiver = TobiiReceiver()
        receiver.SILENCE_TIMEOUT_SECONDS = .01
        receiver.is_connected = True
        receiver._reader = AsyncMock()
        async def blocked_read():
            await asyncio.Future()
        receiver._reader.readline.side_effect = blocked_read
        points = []
        receiver.on_gaze = points.append
        receiver._receive_task = asyncio.create_task(receiver._receive_loop())
        await asyncio.sleep(.035)
        self.assertEqual(len(points), 1)
        self.assertFalse(points[0].is_valid)
        task = receiver._receive_task
        receiver.disconnect()
        await task
        self.assertTrue(receiver._stopping)
        self.assertFalse(receiver.is_connected)

    async def test_initial_failure_keeps_one_supervisor_and_reconnects(self):
        receiver = TobiiReceiver()
        reader = AsyncMock()
        async def blocked_read():
            await asyncio.Future()
        reader.readline.side_effect = blocked_read
        writer = AsyncMock()
        writer.close = lambda: None
        with patch('main.asyncio.open_connection', new=AsyncMock(side_effect=[OSError(), (reader, writer)])) as connect:
            self.assertFalse(await receiver.connect())
            original = receiver._receive_task
            self.assertFalse(await receiver.connect())
            self.assertIs(receiver._receive_task, original)
            await asyncio.sleep(1.05)
            self.assertTrue(receiver.is_connected)
            self.assertEqual(connect.await_count, 2)
            receiver.disconnect()
            await original

    async def test_reader_enforces_bounded_newline_message(self):
        receiver = TobiiReceiver()
        receiver.is_connected = True
        receiver._reader = asyncio.StreamReader(limit=receiver.MAX_MESSAGE_BYTES)
        receiver._reader.feed_data(b'x' * (receiver.MAX_MESSAGE_BYTES + 1))
        receiver._writer = AsyncMock()
        receiver._writer.close = lambda: None
        points = []
        receiver.on_gaze = points.append
        task = asyncio.create_task(receiver._receive_loop())
        await asyncio.sleep(.02)
        self.assertFalse(receiver.is_connected)
        self.assertEqual(len(points), 1)
        receiver.disconnect()
        task.cancel()
        await task


class GazeSafetyTests(unittest.TestCase):
    def backend(self):
        result = GazeConnectBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
        result._broadcast = lambda *args: None
        return result

    def test_timestamp_units(self):
        now = time.time()
        for scale in (1, 1000, 1000000, 1000000000):
            self.assertAlmostEqual(SignalConditioner._normalize_timestamp(now * scale), now, places=5)

    def test_nonfinite_and_offscreen_samples_never_select(self):
        for x in (float('nan'), float('inf'), -.001, 1.001):
            backend = self.backend()
            backend._on_gaze_data(GazePoint(x, .5, time.time()))
            self.assertFalse(backend._last_gaze_payload['is_valid'])

    def test_stale_future_and_reordered_samples_do_not_reposition_cursor(self):
        backend = self.backend()
        now = time.time()
        backend._on_gaze_data(GazePoint(.3, .4, now))
        for stamp in (now - 2, now + 2, now - .01):
            backend._on_gaze_data(GazePoint(.9, .9, stamp))
            self.assertFalse(backend._last_gaze_payload['is_valid'])
            self.assertEqual((backend._last_gaze_payload['x'], backend._last_gaze_payload['y']), (.3, .4))

    def test_explicit_dip_geometry_handles_zoom_and_window_origin(self):
        backend = self.backend()
        backend._set_screen_size({'width': 1000, 'height': 500, 'physicalWidth': 1920,
                                  'physicalHeight': 1080, 'screenUnits': 'css', 'dpr': 1.25,
                                  'windowX': 200, 'windowY': 100,
                                  'contentWidth': 1250, 'contentHeight': 625})
        x, y = backend._screen_to_window_normalized(825 / 1920, 412.5 / 1080)
        self.assertAlmostEqual(x, .5)
        self.assertAlmostEqual(y, .5)
        backend._on_gaze_data(GazePoint(.01, .01, time.time()))
        self.assertEqual(backend._last_gaze_payload['signal_state'], 'outside_window')
        self.assertFalse(backend._last_gaze_payload['is_valid'])

    def test_foreground_gate_and_unchanged_geometry_preserve_filter_state(self):
        backend = self.backend()
        geometry = {'width': 1920, 'height': 1080, 'screenUnits': 'css',
                    'contentWidth': 1920, 'contentHeight': 1080, 'gazeActive': True}
        backend._set_screen_size(geometry)
        backend._on_gaze_data(GazePoint(.5, .5, time.time()))
        filtered = backend.cursor_filter._point
        backend._set_screen_size(geometry)
        self.assertEqual(backend.cursor_filter._point, filtered)
        backend._set_screen_size({**geometry, 'gazeActive': False})
        self.assertFalse(backend._last_gaze_payload['is_valid'])
        backend._on_gaze_data(GazePoint(.9, .9, time.time()))
        self.assertEqual(backend._last_gaze_payload['signal_state'], 'inactive_window')
        self.assertIsNone(backend.cursor_filter._point)

    def test_removed_targets_cannot_retain_backend_cursor_ownership(self):
        backend = self.backend()
        backend._register_targets([{'id': 'old', 'x': 960, 'y': 540,
                                    'width': 200, 'height': 120, 'enabled': True}])
        backend._on_gaze_data(GazePoint(.5, .5, time.time()))
        self.assertIsNotNone(backend._sticky_magnet_target)
        backend._register_targets([])
        self.assertIsNone(backend._sticky_magnet_target)
        self.assertIsNone(backend._on_key_target_id)
        self.assertEqual(backend._apply_magnetism(950, 530), (950, 530))

    def test_legacy_coordinate_calibration_is_not_loaded_into_new_pipeline(self):
        from services.calibration import CalibrationProfile
        backend = self.backend()
        legacy = CalibrationProfile(is_valid=True, coordinate_space='legacy',
                                    x_coefficients=[0, 1, 0, 0, 0, 0],
                                    y_coefficients=[0, 0, 1, 0, 0, 0])
        with patch('main.CalibrationStorage.load', return_value=legacy):
            backend._load_calibration_profile()
        self.assertFalse(backend.calibration_corrector.enabled)

    def test_true_steady_gaze_is_not_rejected_as_frozen(self):
        conditioner = SignalConditioner()
        now = time.time()
        for i in range(500):
            sample = conditioner.process({'x': .5, 'y': .5, 'timestamp': now + i / 60,
                                          'left_valid': True, 'right_valid': True,
                                          'is_valid': True, 'confidence': .75})
            self.assertEqual(sample.state, GazeValidity.VALID)


class BroadcastTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_client_has_one_pending_send_and_does_not_block_fast_client(self):
        backend = GazeConnectBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
        class Client:
            def __init__(self, slow=False):
                self.slow = slow
                self.calls = 0
                self.closed = False
            async def send(self, msg):
                self.calls += 1
                if self.slow:
                    await asyncio.Future()
            async def close(self, **kwargs):
                self.closed = True
        slow, fast = Client(True), Client()
        backend.connected_clients.update((slow, fast))
        loop = asyncio.create_task(backend._gaze_broadcast_loop())
        for i in range(30):
            backend._broadcast('gaze', {'x': i / 30, 'y': .5, 'is_valid': True})
            await asyncio.sleep(.002)
            self.assertLessEqual(len(backend._gaze_send_tasks), 2)
        self.assertEqual(slow.calls, 1)
        self.assertGreater(fast.calls, 5)
        await asyncio.sleep(.15)
        self.assertTrue(slow.closed)
        self.assertNotIn(slow, backend.connected_clients)
        loop.cancel()
        await loop

    async def test_silent_source_becomes_invalid_without_waiting_for_another_sample(self):
        backend = GazeConnectBackend(ServerConfig(tobii_enabled=False, tts_enabled=False, log_sessions=False))
        backend._on_gaze_data(GazePoint(.5, .5, time.time()))
        backend._last_sample_received = time.monotonic() - .2
        loop = asyncio.create_task(backend._gaze_broadcast_loop())
        await asyncio.sleep(.07)
        self.assertFalse(backend._last_gaze_payload['is_valid'])
        self.assertEqual(backend._last_gaze_payload['signal_state'], 'stale')
        loop.cancel()
        await loop


if __name__ == '__main__':
    unittest.main()
