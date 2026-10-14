"""Phase 1 corrections of the Compass studio (docs/compass-refine/IMPLEMENTATION_PLAN.md)."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import cairo
import compass_drawing as drawing
import compass_furniture as furniture
from compass_presentation import PALETTES, model, options
from compass_standards import RISERS
from gazeplan_engine_v5.candidates import _room_fits

FIXTURES = Path(__file__).parent / 'fixtures' / 'compass'


def f1():
    return json.loads((FIXTURES / 'f01_asymmetric_30x50.json').read_text())['v1']


class OrientationTests(unittest.TestCase):
    def test_deep_plot_keeps_road_at_bottom_and_left_on_left(self):
        m = model(options(f1(), 'all')['options'][0]['compassData'], 'ground')
        self.assertGreater(m['depth'], m['width'])
        seen = {}
        real = drawing.Plan

        def capture(c, mm, palette, point, *args, **kwargs):
            seen['point'] = point
            return real(c, mm, palette, point, *args, **kwargs)
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 800, 1000)
        with patch.object(drawing, 'Plan', side_effect=capture):
            drawing.draw_2d(cairo.Context(surface), m, PALETTES['warm'], 800, 1000)
        point = seen['point']
        front_left, back_right = point(0, 0), point(m['width'], m['depth'])
        self.assertLess(front_left[0], back_right[0])       # Column 1 is on the left.
        self.assertGreater(front_left[1], back_right[1])    # Row 1 (the road) is at the bottom.
        # True proportions: one foot is the same length across and down.
        self.assertAlmostEqual(back_right[0] - front_left[0], (front_left[1] - back_right[1]) * m['width'] / m['depth'])


class RoomSizeAndDoorTests(unittest.TestCase):
    def test_size_is_judged_on_the_whole_room_not_each_cell(self):
        cells = [{'x1': 0, 'y1': 0, 'x2': 7.5, 'y2': 12.5}, {'x1': 7.5, 'y1': 0, 'x2': 15, 'y2': 12.5}]
        self.assertTrue(_room_fits(cells, 7.87, 7.87))          # 15 x 12.5 room: no cell is 7.87 wide.
        self.assertFalse(_room_fits(cells[:1], 7.87, 7.87))      # one 7.5 ft cell is genuinely narrow
        ell = [{'x1': 0, 'y1': 0, 'x2': 10, 'y2': 10}, {'x1': 0, 'y1': 10, 'x2': 3, 'y2': 20}]
        self.assertTrue(_room_fits(ell, 10, 10))
        self.assertFalse(_room_fits(ell, 3, 20.5))

    def test_shortfalls_are_notes_and_doors_remain(self):
        result = options(f1(), 'all')
        choice = result['options'][0]
        notes = ' '.join(choice['notes'])
        # The drawing room (two 7'-6" cells, 15'-0" x 12'-6") meets the living-room size.
        self.assertNotIn('g-drawing: no uninterrupted rectangle', notes)
        # The living hall is 7'-6" wide (two cells deep): honestly below its 7'-10" target.
        self.assertIn('g-living: no uninterrupted rectangle', notes)
        # A dining hall needs 6'-11"; one 7'-6" cell passes.
        self.assertNotIn('g-dining: no uninterrupted rectangle', notes)
        for floor in ('ground', 'first'):
            doors = model(choice['compassData'], floor)['architecture']['doors']
            self.assertTrue(doors, f'{floor}: a size shortfall must not delete the doors')
        main = [d for d in model(choice['compassData'], 'ground')['architecture']['doors'] if d['type'] == 'main']
        self.assertEqual(len(main), 1)


class StairTests(unittest.TestCase):
    def test_no_short_steep_flights(self):
        from shapely.geometry import box
        for w, d in ((3.6, 9.5), (4.0, 7.0)):
            shape = box(0, 0, w, d)
            flight, _ = furniture.stair(shape, shape.bounds, [], [])
            self.assertIsNone(flight, 'a room too small for a 16-riser stair gets no stair')
        shape = box(0, 0, 7.5, 25)
        flight, _ = furniture.stair(shape, shape.bounds, [], [])
        self.assertIsNotNone(flight)
        treads = [s for s in flight['solids']]
        self.assertGreaterEqual(len(treads), RISERS - 1)
        with self.assertRaises(ValueError):
            furniture.fixture(furniture.Frame('S', 0, 0, 3, 9), furniture.Item('stair', 3, 9, twin=False, along=False))


class JobManagerTests(unittest.TestCase):
    def test_newest_request_replaces_running_and_pending_work(self):
        import threading
        import time
        from compass_resources import JobCancelled, RenderResources, RendererBusy, checkpoint
        resources = RenderResources()
        source = {'plot': {'width_ft': 40, 'depth_ft': 60}, 'ground_floor': {'placements': []}}
        started, release, outcome = threading.Event(), threading.Event(), {}

        def slow():
            started.set()
            for _ in range(200):          # A long stage with cooperative checkpoints.
                checkpoint()
                if release.wait(.01):
                    break
            return b'old'

        def first():
            try:
                outcome['a'] = resources.render_latest(source, {'v': 'a'}, slow, job_id='a')
            except JobCancelled:
                outcome['a'] = 'cancelled'
        thread = threading.Thread(target=first); thread.start()
        self.assertTrue(started.wait(2))
        with self.assertRaises(RendererBusy):            # The original 429 contract still holds.
            with resources.job():
                pass
        self.assertEqual(resources.render_latest(source, {'v': 'b'}, lambda: b'new', job_id='b'), b'new')
        thread.join(2)
        self.assertEqual(outcome['a'], 'cancelled')
        self.assertIsNone(resources.cached(source, {'v': 'a'}), 'superseded work is never cached')
        self.assertEqual(resources.cached(source, {'v': 'b'}), b'new')
        self.assertEqual(resources.state()['running'], None)

    def test_pending_slot_keeps_only_the_newest_per_channel(self):
        import threading
        from compass_resources import JobCancelled, RenderResources
        resources = RenderResources()
        source = {'plot': {'width_ft': 40, 'depth_ft': 60}, 'ground_floor': {'placements': []}}
        gate, results = threading.Event(), {}

        def export():
            with resources.latest('x', 'export'):
                gate.wait(2)
            results['x'] = 'done'

        def preview(name):
            try:
                results[name] = resources.render_latest(source, {'v': name}, lambda: name.encode(), job_id=name)
            except JobCancelled:
                results[name] = 'cancelled'
        running = threading.Thread(target=export); running.start()
        import time
        while resources.state()['running'] is None:
            time.sleep(.005)
        older = threading.Thread(target=preview, args=('p1',)); older.start()
        while not resources.state()['pending']:
            time.sleep(.005)
        newer = threading.Thread(target=preview, args=('p2',)); newer.start()
        older.join(2)
        self.assertEqual(results['p1'], 'cancelled')      # Replaced while waiting.
        gate.set(); running.join(2); newer.join(2)
        self.assertEqual(results, {'p1': 'cancelled', 'x': 'done', 'p2': b'p2'})


class RuntimeTests(unittest.TestCase):
    def test_arguments_and_idle_exit(self):
        import threading
        import floorplan_runtime as runtime
        self.assertEqual(runtime.parse_args(['--parent-pid', '42', '--idle-seconds', '600']),
                         {'parent_pid': 42, 'idle_seconds': 600.0})
        self.assertEqual(runtime.parse_args([]), {'parent_pid': None, 'idle_seconds': 0.0})
        left = threading.Event()
        busy = [True]
        watch = runtime.IdleWatch(.05, lambda: busy[0], on_idle=left.set, poll=.02)
        watch.start()
        self.assertFalse(left.wait(.2), 'never leaves during a job')
        busy[0] = False
        self.assertTrue(left.wait(1))

    def test_health_checks_are_not_use(self):
        """Electron asks /api/health every 5 s; only real requests keep the service from leaving when idle."""
        import floorplan_runtime as runtime
        import floorplan_server
        watch = runtime.IdleWatch(600, lambda: False)
        watch.last -= 100
        previous, floorplan_server.IDLE = floorplan_server.IDLE, watch
        try:
            client = floorplan_server.app.test_client()
            self.assertEqual(client.get('/api/health').status_code, 200)
            self.assertGreaterEqual(watch.idle_for(), 100)
            client.post('/api/floorplan/compass/v2/model', json={})
            self.assertLess(watch.idle_for(), 5)
        finally:
            floorplan_server.IDLE = previous

    def test_health_reports_this_process(self):
        from floorplan_server import app
        body = app.test_client().get('/api/health').get_json()
        self.assertEqual(body['status'], 'ok')
        self.assertIn('jobs', body)
        self.assertIn('memory', body)
        # A fresh service loads neither the legacy renderer nor OR-Tools/pandas before a request.
        import subprocess
        tools = str(Path(__file__).resolve().parents[2] / 'tools')
        code = ('import sys; sys.path[:0]=[%r]; import floorplan_server; '
                'print(sorted(m for m in ("ortools","pandas","gazeconnect_floorplan_v5","floorplan_fusion_v1",'
                '"compass_presentation","gazeplan_engine_v5.engine") if m in sys.modules))') % tools
        loaded = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, timeout=60)
        self.assertEqual(loaded.stdout.strip(), '[]', loaded.stderr)


class LifetimeTests(unittest.TestCase):
    def test_service_ends_with_its_parent_and_when_idle(self):
        """§11 Resources/Lifetime: kill the app hard and the floor-plan process is gone within 5 s."""
        import os
        import socket
        import subprocess
        import time
        import urllib.request
        server = str(Path(__file__).resolve().parents[2] / 'tools' / 'floorplan_server.py')

        def free_port():
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                return probe.getsockname()[1]

        def wait_health(port, limit=15):
            until = time.monotonic() + limit
            while time.monotonic() < until:
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=1) as reply:
                        return json.loads(reply.read())
                except OSError:
                    time.sleep(.1)
            self.fail('service did not answer')

        parent = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
        port = free_port()
        child = subprocess.Popen([sys.executable, server, '--parent-pid', str(parent.pid)],
                                 env={**os.environ, 'FLOORPLAN_PORT': str(port)},
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            health = wait_health(port)
            # On Windows a venv's python.exe is a launcher: the server is then its child (as Electron allows).
            self.assertIn(child.pid, (health['pid'], health['ppid']))
            if hasattr(os, 'getpriority'):
                # Drawing yields to gaze: the service lowers its own priority (below normal on Windows).
                self.assertGreaterEqual(os.getpriority(os.PRIO_PROCESS, health['pid']), os.getpriority(os.PRIO_PROCESS, 0) + 5)
            parent.kill(); parent.wait()
            started = time.monotonic()
            child.wait(timeout=5)
            self.assertLess(time.monotonic() - started, 5)
        finally:
            for process in (parent, child):
                if process.poll() is None:
                    process.kill()
        port = free_port()
        idle = subprocess.Popen([sys.executable, server, '--idle-seconds', '1'],
                                env={**os.environ, 'FLOORPLAN_PORT': str(port)},
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            wait_health(port)
            # Health checks (Electron's come every 5 s) are not use: it still leaves. The watch polls
            # every 10 s; the exit code tells Electron it was idle, not a crash.
            until = time.monotonic() + 25
            while idle.poll() is None and time.monotonic() < until:
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=1) as reply:
                        reply.read()
                except OSError:
                    pass
                time.sleep(.5)
            self.assertEqual(idle.wait(timeout=1), 75)
        finally:
            if idle.poll() is None:
                idle.kill()


if __name__ == '__main__':
    unittest.main()
