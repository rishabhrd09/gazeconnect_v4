"""Both split axes through the real schema, geometry, HTTP handlers and exported geometry."""
import copy
import io
import json
import sys
import unittest
import re
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import cairo
import ezdxf
import compass_schema as schema
import compass_geometry as geometry
import compass_studio as studio
from floorplan_server import app

FIXTURE = Path(__file__).parent / 'fixtures' / 'compass' / 'f16_top_bottom.json'


class SplitDirectionTests(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads(FIXTURE.read_text())['cases'][0]['plan']

    def test_partition_and_ownership_all_facings(self):
        for facing in schema.FACINGS:
            with self.subTest(facing=facing):
                plan = copy.deepcopy(self.plan)
                plan['plot']['facing'] = facing
                model = geometry.build(plan)
                self.assertTrue(all(model['checks'].values()), model['checks'])
                rooms = model['floors']['ground']['rooms']
                self.assertEqual(rooms['g-bedroom-1'].polygon.bounds, (360 * geometry.IN, 180 * geometry.IN, 540 * geometry.IN, 240 * geometry.IN))
                self.assertEqual(rooms['g-bathroom-1'].polygon.bounds, (360 * geometry.IN, 120 * geometry.IN, 540 * geometry.IN, 180 * geometry.IN))
                self.assertEqual(rooms['g-bedroom-1'].polygon.intersection(rooms['g-bathroom-1'].polygon).area, 0)
                boundary = [e for e in model['floors']['ground']['edges'] if e['a']['room'] and e['b']['room']]
                self.assertEqual(len(boundary), 1)
                self.assertEqual((boundary[0]['orient'], boundary[0]['at'], boundary[0]['kind']), ('h', 180 * geometry.IN, 'partition'))

    def test_same_owner_has_no_extra_wall(self):
        self.plan['floors']['ground']['rooms'] = [{'id': 'g-living-1', 'use': 'living', 'regions': ['r2_c3.B', 'r2_c3.T']}]
        model = geometry.build(self.plan)
        inside = [e for e in model['floors']['ground']['edges'] if e['a']['room'] and e['b']['room']]
        self.assertEqual([e['kind'] for e in inside], ['none'])

    def test_cross_floor_coverage_checks_both_overlapping_owners(self):
        plan = json.loads(FIXTURE.read_text())['cases'][2]['plan']
        self.assertEqual(schema.regions_below('r2_c2.T', plan['floors']['ground']), ['r2_c2.L', 'r2_c2.R'])
        self.assertIn('void-below', [n['code'] for n in schema.check(schema.normalise(plan))])
        plan['floors']['ground']['rooms'] = [{'id': 'g-living-1', 'use': 'living', 'regions': ['r2_c2.L', 'r2_c2.R']}]
        self.assertNotIn('void-below', [n['code'] for n in schema.check(schema.normalise(plan))])
        # Opposite combination: an upstairs left half also overlaps both downstairs halves.
        self.assertEqual(schema.regions_below('r2_c2.L', {'splits': ['r2_c2'], 'splitDirections': {'r2_c2': 'top-bottom'}}), ['r2_c2.T', 'r2_c2.B'])

    def test_direction_changes_cache_identity(self):
        old = copy.deepcopy(self.plan)
        old['version'] = 2
        del old['floors']['ground']['splitDirections']
        old['floors']['ground']['rooms'][0]['regions'] = ['r2_c3.R']
        old['floors']['ground']['rooms'][1]['regions'] = ['r2_c3.L']
        self.assertNotEqual(schema.intent_hash(old), schema.intent_hash(self.plan))
        self.assertNotEqual(studio.model_for(old)['modelHash'], studio.model_for(self.plan)['modelHash'])
        self.assertEqual(studio.model_for(self.plan)['modelHash'], studio.model_for(copy.deepcopy(self.plan))['modelHash'])

    def test_real_handlers_and_all_exports_share_model(self):
        client = app.test_client()
        model = client.post('/api/floorplan/compass/v2/model', json={'plan': self.plan, 'jobId': 'split-test'})
        self.assertEqual(model.status_code, 200, model.data)
        expected_hash = model.get_json()['modelHash']
        formats = [('plan', 'png'), ('top', 'png'), ('outside', 'png'), ('sheet', 'png'), ('sheet', 'pdf'),
                   ('cad', 'dxf-in'), ('cad', 'dxf-mm'), ('cad', 'readme')]
        for view, fmt in formats:
            with self.subTest(view=view, fmt=fmt):
                reply = client.post('/api/floorplan/compass/v2/render', json={
                    'plan': self.plan, 'view': view, 'format': fmt, 'floor': 'ground', 'theme': 'dark',
                    'width': 800, 'height': 600, 'jobId': 'split-test',
                })
                self.assertEqual(reply.status_code, 200, reply.data[:300])
                self.assertEqual(reply.headers['X-Plan-Hash'], expected_hash)
                if fmt == 'png':
                    image = cairo.ImageSurface.create_from_png(io.BytesIO(reply.data))
                    self.assertGreater(image.get_width(), 200)
                    self.assertGreater(image.get_height(), 200)
                elif fmt == 'pdf':
                    self.assertTrue(reply.data.startswith(b'%PDF-'))
                elif fmt.startswith('dxf-'):
                    doc = ezdxf.read(io.StringIO(reply.data.decode('utf-8')))
                    self.assertEqual(doc.header['$PROJECTNAME'], expected_hash[:32])
                    factor = 25.4 if fmt == 'dxf-mm' else 1
                    self.assertEqual(doc.header['$INSUNITS'], 4 if factor == 25.4 else 1)
                    # The exported room outline proves the saved top half reached CAD with its actual bounds.
                    areas = list(doc.modelspace().query('LWPOLYLINE[layer=="A-AREA"]'))
                    self.assertEqual(len(areas), 2)
                    bounds = []
                    for area in areas:
                        pts = list(area.get_points('xy'))
                        bounds.append(tuple(round(v / factor, 3) for v in (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))))
                    # A-AREA is clear room area: 9-inch envelope and 3-inch half partition deducted.
                    self.assertIn((369, 183, 531, 231), bounds)
                    self.assertIn((369, 129, 531, 177), bounds)
                    grid = list(doc.modelspace().query('LWPOLYLINE[layer=="A-GRID"]'))
                    self.assertTrue(any(all(abs(p[1] / factor - 180) < .001 for p in line.get_points('xy')) for line in grid))
                else:
                    self.assertIn(expected_hash.encode(), reply.data)

    def test_mixed_junctions_remain_noded_and_area_is_conserved(self):
        plan = json.loads(FIXTURE.read_text())['cases'][1]['plan']
        model = geometry.build(plan)
        self.assertTrue(all(model['checks'].values()), model['checks'])
        self.assertEqual(schema.check(schema.normalise(plan)), [])

    def test_both_floors_and_directions_reach_plan_pdf_and_dxf(self):
        plan = copy.deepcopy(self.plan)
        plan['storeys'] = 2
        plan['floors']['ground']['splits'].append('r4_c4')
        plan['floors']['ground']['rooms'].append({'id': 'g-passage-1', 'use': 'passage', 'regions': ['r4_c4.L']})
        plan['floors']['first'] = {
            'splits': ['r2_c3', 'r4_c4'], 'splitDirections': {'r4_c4': 'top-bottom'},
            'rooms': [
                {'id': 'f-ff_bathroom-1', 'use': 'ff_bathroom', 'regions': ['r4_c4.B']},
                {'id': 'f-ff_living-1', 'use': 'ff_living', 'regions': ['r4_c4.T']},
                {'id': 'f-passage-1', 'use': 'passage', 'regions': ['r2_c3.L']},
            ],
        }
        client = app.test_client()
        summary = client.post('/api/floorplan/compass/v2/model', json={'plan': plan, 'jobId': 'both-floors'})
        self.assertEqual(summary.status_code, 200, summary.data)
        expected_hash = summary.get_json()['modelHash']
        self.assertEqual(summary.get_json()['floorsDrawn'], ['ground', 'first'])
        for floor in ('ground', 'first'):
            for view, fmt in (('plan', 'png'), ('top', 'png'), ('sheet', 'pdf'), ('cad', 'dxf-in'), ('cad', 'dxf-mm')):
                with self.subTest(floor=floor, view=view, fmt=fmt):
                    output = client.post('/api/floorplan/compass/v2/render', json={
                        'plan': plan, 'floor': floor, 'view': view, 'format': fmt, 'width': 800, 'height': 600, 'jobId': 'both-floors',
                    })
                    self.assertEqual(output.status_code, 200, output.data[:200])
                    self.assertEqual(output.headers['X-Plan-Hash'], expected_hash)
                    if fmt.startswith('dxf-'):
                        doc = ezdxf.read(io.StringIO(output.data.decode('utf-8')))
                        # Every floor has a top/bottom and a left/right cell with three owned regions.
                        self.assertEqual(len(doc.modelspace().query('LWPOLYLINE[layer=="A-AREA"]')), 3)
                        self.assertEqual(doc.header['$PROJECTNAME'], expected_hash[:32])
                    elif fmt == 'pdf':
                        self.assertTrue(output.data.startswith(b'%PDF-'))
                        objects = [output.data]
                        # Cairo's PDF 1.7 packs page dictionaries in compressed object streams.
                        for match in re.finditer(rb'/Type\s*/ObjStm.*?stream\r?\n', output.data, re.S):
                            start = match.end()
                            objects.append(zlib.decompressobj().decompress(output.data[start:output.data.index(b'endstream', start)]))
                        self.assertEqual(len(re.findall(rb'/Type\s*/Page\b', b'\n'.join(objects))), 2)
                    else:
                        self.assertTrue(output.data.startswith(b'\x89PNG'))


if __name__ == '__main__':
    unittest.main()
