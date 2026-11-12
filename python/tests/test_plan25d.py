"""The furnished model view (tools/plan25d.py) and its Compass adapter.

The same plan gives the same PNG byte for byte (in this process and in a fresh one); each floor
renders within a second and about 150 MB on the 8 GB laptop's CPU; every room is a gaze target of
at least 64 px with a label that meets WCAG AA at 14 px or more; Compass plans render through the
studio's top view (Model look), which is exactly this renderer's drawing of the adapter's floor.
"""
import contextlib
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'tools'
sys.path[:0] = [str(TOOLS), str(ROOT / 'python')]

import plan25d  # noqa: E402

SAMPLE = TOOLS / 'samples' / 'plan25d_house_50x40.json'
FIXTURES = ROOT / 'python' / 'tests' / 'fixtures' / 'compass'
TIME_LIMIT_S = 1.0
MEMORY_LIMIT_MB = 300
PNG = b'\x89PNG\r\n\x1a\n'

MEMORY_PROBE = r'''
import ctypes, ctypes.wintypes as wt, hashlib, json, os, sys
sys.path[:0] = [sys.argv[1]]
import plan25d
floor = plan25d.floors_of(json.loads(open(sys.argv[2], encoding='utf-8').read()))[0]
png, _ = plan25d.render_floor(floor)
peak = None
if os.name == 'nt':
    class C(ctypes.Structure):
        _fields_ = [('cb', wt.DWORD), ('faults', wt.DWORD), ('peak_ws', ctypes.c_size_t), ('ws', ctypes.c_size_t),
                    ('a', ctypes.c_size_t), ('b', ctypes.c_size_t), ('c', ctypes.c_size_t), ('d', ctypes.c_size_t),
                    ('pagefile', ctypes.c_size_t), ('peak_pagefile', ctypes.c_size_t)]
    me = ctypes.windll.kernel32.GetCurrentProcess
    me.restype = ctypes.c_void_p
    info = ctypes.windll.psapi.GetProcessMemoryInfo
    info.argtypes = [ctypes.c_void_p, ctypes.POINTER(C), wt.DWORD]
    c = C(); c.cb = ctypes.sizeof(c)
    info(me(), ctypes.byref(c), c.cb)
    peak = max(c.peak_ws, c.peak_pagefile) / 2 ** 20
else:
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (2 ** 10 if sys.platform != 'darwin' else 2 ** 20)
print(json.dumps({'peak_mb': peak, 'sha256': hashlib.sha256(png).hexdigest()}))
'''


def sha(data):
    return hashlib.sha256(data).hexdigest()


class SampleHouseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = json.loads(SAMPLE.read_text(encoding='utf-8'))
        cls.floors = plan25d.floors_of(cls.plan)

    def test_the_sample_is_a_50_by_40_ft_house_on_three_floors(self):
        self.assertEqual(self.plan['plot'], {'width': 50, 'depth': 40})
        self.assertEqual([f['title'] for f in self.floors], ['Ground floor', 'First floor', 'Second floor'])
        self.assertGreaterEqual(len(self.floors[0]['rooms']), 8)

    def test_the_same_plan_gives_the_same_png_byte_for_byte(self):
        for floor in self.floors:
            with self.subTest(floor=floor['title']):
                self.assertEqual(sha(plan25d.render_floor(floor)[0]), sha(plan25d.render_floor(floor)[0]))
        dark = self.floors[0]
        self.assertEqual(sha(plan25d.render_floor(dark, theme='dark')[0]), sha(plan25d.render_floor(dark, theme='dark')[0]))

    def test_each_floor_renders_within_a_second(self):
        for floor in self.floors:
            plan25d.render_floor(floor)                               # fonts and caches warm
            times = []
            for _ in range(3):
                started = time.perf_counter()
                plan25d.render_floor(floor)
                times.append(time.perf_counter() - started)
            with self.subTest(floor=floor['title']):
                self.assertLess(min(times), TIME_LIMIT_S)

    def test_a_fresh_process_stays_under_300_mb_and_draws_the_same_bytes(self):
        env = {k: v for k, v in os.environ.items() if k not in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS')}
        out = subprocess.run([sys.executable, '-c', MEMORY_PROBE, str(TOOLS), str(SAMPLE)], capture_output=True,
                             text=True, env=env, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr[-2000:])
        result = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertLess(result['peak_mb'], MEMORY_LIMIT_MB)
        self.assertEqual(result['sha256'], sha(plan25d.render_floor(self.floors[0])[0]))

    def test_every_room_is_a_gaze_target_with_a_readable_label(self):
        for theme in ('light', 'dark'):
            for floor in self.floors:
                png, hit = plan25d.render_floor(floor, theme=theme)
                self.assertTrue(png.startswith(PNG))
                self.assertEqual(len(hit['rooms']), len(floor['rooms']))
                for room in hit['rooms']:
                    with self.subTest(theme=theme, floor=floor['title'], room=room['name']):
                        self.assertTrue(room['gaze_ok'], room)
                        self.assertGreaterEqual(min(room['target'][2:]), 64)
                        self.assertGreaterEqual(len(room['polygon']), 3)
                        if 'label_box' in room:
                            x, y, w, h = room['label_box']
                            self.assertGreaterEqual(room['contrast'], 4.5)
                            self.assertGreaterEqual(room['text_px'], 14)
                            self.assertTrue(0 <= x and x + w <= hit['width'] and 0 <= y and y + h <= hit['height'])

    def test_the_command_line_writes_a_png_and_a_hit_map_per_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            with contextlib.redirect_stdout(io.StringIO()):
                plan25d.main([str(SAMPLE), '-o', str(pathlib.Path(tmp) / 'house.png'), '--width', '1200'])
            for name in ('ground-floor', 'first-floor', 'second-floor'):
                png = pathlib.Path(tmp) / f'house-{name}.png'
                self.assertTrue(png.read_bytes().startswith(PNG))
                hit = json.loads(png.with_suffix('.hitmap.json').read_text(encoding='utf-8'))
                self.assertEqual(hit['width'], 1200)


class CompassAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import compass_studio
        cls.studio = compass_studio
        cls.plans = {}
        for name in ('f15_double_height.json', 'f06_open_plan.json', 'f16_top_bottom.json'):
            data = json.loads((FIXTURES / name).read_text(encoding='utf-8'))
            cls.plans[name] = data['cases'][0]['plan'] if 'cases' in data else data

    def model(self, plan):
        return self.studio.model_for(self.studio.plan_of(plan)[0])

    def test_compass_plans_render_through_the_studio_option(self):
        for name, plan in self.plans.items():
            for floor in self.model(plan)['floors']:
                with self.subTest(plan=name, floor=floor):
                    png, _ = self.studio.render(plan, 'top', floor=floor, width=1400, height=1000, fit='width')
                    self.assertTrue(png.startswith(PNG))
                    png, _ = self.studio.render(plan, 'top', floor=floor, theme='dark', width=1400, height=900)
                    self.assertTrue(png.startswith(PNG))

    def test_the_road_stays_at_the_bottom(self):
        import plan25d_adapter
        model = self.model(self.plans['f15_double_height.json'])
        floor = plan25d_adapter.floor_plan(model, 'ground')
        self.assertEqual(floor['roads'][0]['side'], 'bottom')
        self.assertEqual(floor['north_deg'], 180)                        # a north-facing plot: north is down
        self.assertTrue(floor['roads'][0]['label'].startswith('NORTH ROAD'))

    def test_the_adapter_keeps_the_plans_rooms_walls_openings_and_furniture(self):
        import plan25d_adapter
        model = self.model(self.plans['f15_double_height.json'])
        for name, f in model['floors'].items():
            floor = plan25d_adapter.floor_plan(model, name)
            with self.subTest(floor=name):
                self.assertEqual({r['id'] for r in floor['rooms']}, set(f['rooms']))
                self.assertEqual(len(floor['furniture']), len([x for x in f['fixtures'] if x['kind'] != 'stair']))
                self.assertEqual(len(floor['openings']), len(f['doors']) + len(f['windows']))
                self.assertEqual(len(floor['stairs']), 1)
                _, hit = plan25d.render_floor(floor)
                self.assertTrue(all(r['gaze_ok'] for r in hit['rooms']))

    def test_the_studio_sizes_keep_labels_readable_and_apart(self):
        """Model look in the studio: its panel on 1366 x 768 and 1920 x 1080 screens (compact margins), and
        full screen (fill width). No label under 14 px or below WCAG AA, and no two labels overlapping."""
        import plan25d_adapter
        for name, plan in self.plans.items():
            model = self.model(plan)
            for floor_name in model['floors']:
                floor = plan25d_adapter.floor_plan(model, floor_name)
                for size in ((800, 450), (1250, 650), (1200, None)):
                    with self.subTest(plan=name, floor=floor_name, size=size):
                        _, hit = plan25d.render_floor(floor, *size)
                        labelled = [r for r in hit['rooms'] if 'label_box' in r]
                        self.assertTrue(labelled)
                        self.assertTrue(all(r['text_px'] >= plan25d.MIN_TEXT_PX and r['contrast'] >= 4.5 for r in labelled))
                        boxes = [r['label_box'] for r in labelled]
                        for i, (ax, ay, aw, ah) in enumerate(boxes):
                            for bx, by, bw, bh in boxes[i + 1:]:
                                self.assertFalse(ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah,
                                                 f'labels overlap: {(ax, ay, aw, ah)} {(bx, by, bw, bh)}')

    def test_an_upper_floor_shows_the_ground_below_it(self):
        import plan25d_adapter
        model = self.model(self.plans['f15_double_height.json'])
        self.assertEqual(plan25d_adapter.floor_plan(model, 'ground')['site'], [])
        site = plan25d_adapter.floor_plan(model, 'first')['site']
        self.assertTrue(any(s['floor'] == 'grass' for s in site))         # the garden, faded, not paving
        self.assertTrue(any(s.get('roof') for s in site))

    def test_the_studio_top_view_is_the_model_look(self):
        import plan25d_adapter
        plan = self.plans['f06_open_plan.json']
        top, _ = self.studio.render(plan, 'top', width=1200, height=900)
        direct, _ = plan25d.render_floor(plan25d_adapter.floor_plan(self.model(plan), 'ground'), 1200, 900, 'light')
        self.assertEqual(sha(top), sha(direct))

    def test_the_outside_view_is_gone(self):
        with self.assertRaises(ValueError):
            self.studio.render(self.plans['f06_open_plan.json'], 'outside')


if __name__ == '__main__':
    unittest.main()
