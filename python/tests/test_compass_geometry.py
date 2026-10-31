"""CompassPlanV2 and the PlanModel kernel against the shared fixtures (IMPLEMENTATION_PLAN.md §4, §7, §11).

Every fixture case in python/tests/fixtures/compass is checked here; the schema part of the
same expectations is checked in TypeScript by scripts/check-compass-plan.cjs.
"""
import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from shapely.geometry import box

import compass_geometry as geometry
import compass_schema as schema

FIXTURES = Path(__file__).parent / 'fixtures' / 'compass'
U = geometry.U


def cases():
    for path in sorted(FIXTURES.glob('f*.json')):
        data = json.loads(path.read_text())
        for case in data.get('cases', []):
            yield f'{data["id"]}:{case["name"]}', case


def issue_codes(plan):
    return sorted(f'{n["code"]}:{n["rooms"][0]}' if n['rooms'] else n['code']
                  for n in schema.check(schema.normalise(plan)) if n['severity'] != 'warning')


def run_between(model, a, b):
    floor = model['floors']['first' if a.startswith('f-') else 'ground']
    found = [r for r in floor['runs'] if {r['a']['room'], r['b']['room']} == {a, b}]
    return found


class SchemaTests(unittest.TestCase):
    def test_f1_migration_is_exact(self):
        f1 = json.loads((FIXTURES / 'f01_asymmetric_30x50.json').read_text())
        plan, notices = schema.migrate_v1(f1['v1'])
        self.assertEqual(plan, schema.normalise(f1['plan']))
        self.assertEqual(notices, [])
        self.assertEqual(schema.derive_v1(plan)['ground_floor']['placements'][0]['placementId'], 'g-backyard-1')

    def test_fixture_cases(self):
        for name, case in cases():
            with self.subTest(name):
                expect = case.get('expect', {})
                plan = case.get('plan')
                if 'v1' in case:
                    migrated, notices = schema.migrate_v1(case['v1'])
                    if plan is not None:
                        self.assertEqual(migrated, schema.normalise(plan))
                    if 'notices' in expect:
                        self.assertEqual(len(notices), expect['notices'], notices)
                    self.assertEqual('legacy' in migrated, expect.get('legacy', False))
                    plan = migrated
                if 'issues' in expect:
                    self.assertEqual(issue_codes(plan), sorted(expect['issues']))
                normal = schema.normalise(plan)
                for floor in normal['floors'].values():
                    labels = schema.labels(floor)
                    for rid, label in expect.get('labels', {}).items():
                        if rid in labels:
                            self.assertEqual(labels[rid], label)
                for key, rect in expect.get('regionsIn', {}).items():
                    self.assertEqual(list(schema.region_rect_in(key, normal['plot']['widthIn'], normal['plot']['depthIn'])), rect)

    def test_regions_and_connectivity(self):
        self.assertTrue(schema.regions_touch('r2_c2', 'r2_c3.L'))
        self.assertFalse(schema.regions_touch('r2_c2', 'r2_c3.R'))
        self.assertTrue(schema.regions_touch('r2_c3.L', 'r3_c3'))
        self.assertTrue(schema.regions_touch('r2_c3.L', 'r3_c3.L'))
        self.assertFalse(schema.regions_touch('r2_c3.L', 'r3_c3.R'))
        self.assertTrue(schema.regions_touch('r2_c3.L', 'r2_c3.R'))
        self.assertEqual(schema.components(['r1_c1', 'r1_c2.R', 'r1_c2.L']), [['r1_c1', 'r1_c2.L', 'r1_c2.R']])

    def test_structural_errors_are_refused(self):
        f1 = json.loads((FIXTURES / 'f01_asymmetric_30x50.json').read_text())['plan']
        for mutate in (lambda p: p['plot'].update(widthIn=359.5), lambda p: p['plot'].update(widthIn=100),
                       lambda p: p['floors']['ground']['rooms'][0]['regions'].append('r1_c1'),
                       lambda p: p['floors']['ground']['rooms'][0].update(regions=['r4_c2.L']),
                       lambda p: p['floors']['ground']['rooms'][0].update(id='g-backyard-x'),
                       lambda p: p.update(version=4)):
            plan = copy.deepcopy(f1)
            mutate(plan)
            with self.assertRaises(schema.PlanError):
                schema.normalise(plan)

    def test_new_ids_are_numbered_after_existing_ones(self):
        floor = {'rooms': [{'id': 'g-bedroom-1', 'use': 'bedroom', 'regions': ['r1_c1']},
                           {'id': 'g-bedroom-3', 'use': 'bedroom', 'regions': ['r1_c3']}]}
        self.assertEqual(schema.next_room_id('ground', floor, 'bedroom'), 'g-bedroom-4')
        self.assertEqual(schema.next_room_id('first', {'rooms': []}, 'void'), 'f-void-1')


class KernelTests(unittest.TestCase):
    built = {}

    @classmethod
    def model(cls, name, plan):
        if name not in cls.built:
            cls.built[name] = geometry.build(plan)
        return cls.built[name]

    def test_invariants_hold_for_every_fixture(self):
        for name, case in cases():
            plan = case.get('plan') or schema.migrate_v1(case['v1'])[0]
            with self.subTest(name):
                model = self.model(name, plan)
                self.assertTrue(all(model['checks'].values()), model['checks'])
                plot = box(0, 0, model['plot']['W'], model['plot']['D'])
                for floor in model['floors'].values():
                    self.assertTrue(plot.covers(floor['walls']))
                    for e in floor['edges']:
                        self.assertNotEqual(e['a'], e['b'])

    def test_fixture_kernel_expectations(self):
        for name, case in cases():
            expect = case.get('expect', {}).get('kernel')
            if not expect:
                continue
            with self.subTest(name):
                model = self.model(name, case['plan'])
                codes = [n['code'] for n in model['notes']]
                for a, b, kind, reason in expect.get('boundaries', []):
                    found = run_between(model, a, b)
                    self.assertTrue(found, f'{a} and {b} share no boundary')
                    self.assertEqual({(r['kind'], r['reason']) for r in found}, {(kind, reason)}, (a, b))
                for orient, at, value in expect.get('nodes', []):
                    edges = [e for e in model['floors']['ground']['edges'] if e['orient'] == orient and e['at'] == at * 8]
                    self.assertIn(value * 8, {v for e in edges for v in (e['lo'], e['hi'])}, (orient, at, value))
                for a, b, kind in expect.get('doors', []):
                    floor = model['floors']['first' if a.startswith('f-') else 'ground']
                    self.assertIn((a, b, kind), {(d['from'], d['to'], d['type']) for d in floor['doors']})
                for code in expect.get('notes', []):
                    self.assertIn(code, codes)
                stair = expect.get('stair')
                ground, first = model['floors']['ground'], model['floors'].get('first')
                if stair == 'aligned':
                    self.assertEqual(first['stair']['core'], ground['stair']['core'])
                    self.assertEqual(first['stair']['opening'], ground['stair']['core'])
                    self.assertNotIn('stair-misaligned', codes)
                elif stair == 'misaligned':
                    self.assertIsNotNone(ground['stair'])
                    self.assertIsNone(first['stair'])
                elif stair == 'none':
                    self.assertIsNone(ground['stair'])
                elif stair == 'ground-only':
                    self.assertIsNotNone(ground['stair'])
                for rid in expect.get('doubleHeight', []):
                    self.assertTrue(ground['rooms'][rid].double_height)
                if expect.get('tallGlazing'):
                    self.assertTrue([w for w in first['windows'] if w['kind'] == 'tall'])
                    self.assertTrue([w for w in ground['windows'] if w['kind'] == 'tall'])
                for rid in expect.get('lShaped', []):
                    clear = ground['rooms'][rid].clear
                    self.assertLess(clear.area, clear.envelope.area)
                    x1, y1, x2, y2 = ground['rooms'][rid].label_box
                    self.assertTrue(geometry._scale(clear, 1 / U).covers(box(x1, y1, x2, y2)))
                if expect.get('roofBelow'):
                    self.assertTrue(first['roofBelow'])
                if 'roofAccess' in expect:
                    self.assertEqual(model.get('roofAccess', False), expect['roofAccess'])
                if 'adjustment' in expect:
                    wanted = expect['adjustment']
                    note = next(n for n in model['notes'] if n['code'] == wanted['code'])
                    self.assertEqual(note['adjustment']['cell'], wanted['cell'])
                    self.assertEqual(note['adjustment']['halves'], wanted['halves'])

    def test_walls_sit_inside_rooms_and_open_plan_has_no_walls(self):
        f15 = next(c for n, c in cases() if n == 'F15:c2')
        model = self.model('F15:c2', f15['plan'])
        ground = model['floors']['ground']
        walls = ground['walls']
        living = ground['rooms']['g-living-1'].polygon
        dining = ground['rooms']['g-dining-1'].polygon
        shared = living.intersection(dining)                 # The line between them: no wall over it
        (x1, y1), (x2, y2) = sorted(shared.coords)            # (walls of other rooms may meet its ends).
        inner = box(x1 + geometry.WALL_INT, y1 - 1, x2 - geometry.WALL_INT, y2 + 1)
        self.assertEqual(walls.intersection(inner).area, 0)
        # Exterior walls: outer face on the plot line, 9 inches inside.
        self.assertEqual(walls.bounds[0], 0)
        stair = ground['rooms']['g-staircase-1']
        self.assertEqual(stair.clear.bounds[0], geometry.WALL_EXT)

    def test_clear_sizes_and_areas(self):
        f3 = next(c for n, c in cases() if n == 'F3:living-keeps-left-half')
        model = self.model('F3:living-keeps-left-half', f3['plan'])
        rooms = model['floors']['ground']['rooms']
        self.assertEqual(rooms['g-living-1'].polygon.area, 225 * U * U)
        bath = geometry.clear_size(rooms['g-bathroom-1'])
        # 5'-0" half: a 3" half partition on the left, a 9" exterior wall on the right (r2_c4 is unassigned).
        self.assertEqual(bath, (4.0, 15 - 9 / 12 - 9 / 12))

    def test_access_never_routes_through_private_rooms(self):
        for name, case in cases():
            plan = case.get('plan') or schema.migrate_v1(case['v1'])[0]
            model = self.model(name, plan)
            for floor in model['floors'].values():
                rooms = floor['rooms']
                for door in floor['doors']:
                    parent = rooms.get(door['from'])
                    child = rooms.get(door['to'])
                    if parent is not None and parent.zone == 'wet':
                        self.fail(f'{name}: a door continues from a bathroom')
                    if parent is not None and parent.zone == 'private' and child is not None:
                        self.assertTrue(child.zone == 'wet' or child.outdoor, (name, door['from'], door['to']))

    def test_door_swings_do_not_clash(self):
        for name, case in cases():
            plan = case.get('plan') or schema.migrate_v1(case['v1'])[0]
            model = self.model(name, plan)
            for floor in model['floors'].values():
                zones = [d['swingZone'] for d in floor['doors']]
                for i, a in enumerate(zones):
                    for b in zones[i + 1:]:
                        self.assertEqual(a.intersection(b).area, 0, name)
                stair = floor.get('stair')
                if stair:
                    for zone in zones:
                        self.assertEqual(zone.intersection(box(*stair['core'])).area, 0, name)

    def test_stair_is_sixteen_risers(self):
        f7 = next(c for n, c in cases() if n == 'F7:aligned')
        model = self.model('F7:aligned', f7['plan'])
        stair = model['floors']['ground']['stair']
        self.assertEqual(stair['risers'], 16)
        self.assertEqual(stair['riserIn'], 7.5)
        self.assertEqual(stair['treadIn'], 10)
        x1, y1, x2, y2 = stair['core']
        self.assertEqual(sorted((x2 - x1, y2 - y1)), [600, 848])      # 6'-3" x 8'-10" dog-leg core.

    def test_determinism_across_processes(self):
        f15 = next(c for n, c in cases() if n == 'F15:c2')
        first = geometry.build(f15['plan'])['modelHash']
        self.assertEqual(first, geometry.build(copy.deepcopy(f15['plan']))['modelHash'])
        tools = str(Path(__file__).resolve().parents[2] / 'tools')
        code = ('import sys, json; sys.path[:0]=[%r]; import compass_geometry as g; '
                'print(g.build(json.load(sys.stdin))["modelHash"])') % tools
        other = subprocess.run([sys.executable, '-c', code], input=json.dumps(f15['plan']), capture_output=True, text=True, timeout=60)
        self.assertEqual(other.stdout.strip(), first, other.stderr)

    def test_orientation_table(self):
        table = json.loads((FIXTURES / 'f02_facings.json').read_text())['facings']
        for facing, row in table.items():
            self.assertEqual(list(geometry.north_vector(facing)), row['north'])


if __name__ == '__main__':
    unittest.main()
