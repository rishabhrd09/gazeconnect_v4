"""The studio's drawings and exports, all from one PlanModel (IMPLEMENTATION_PLAN.md §6, §9, §11).

The plan, top view and outside are PNG images; the A3 sheets a PDF; the CAD export DXF R2010 in inches and
in millimetres. Each is checked for what can be checked without a person looking at it: it is produced at
the requested size, the same plan gives the same bytes, it is oriented as the map (the facing table of F2),
the sheet chooses portrait for deep plots, and the DXF reads back with the documented units, layers, extents
and north. How good the drawings look is judged by people (docs/compass-refine/evidence), not here.
"""
import io
import json
import math
import re
import struct
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import ezdxf

import compass_dxf as dxf
import compass_geometry as geometry
import compass_perspective as perspective
import compass_plan2d as plan2d
import compass_schema as schema
import compass_studio as studio
import compass_top as top

FIXTURES = Path(__file__).parent / 'fixtures' / 'compass'
U = geometry.U


def fixture(file, name):
    data = json.loads((FIXTURES / file).read_text())
    return next(case['plan'] for case in data['cases'] if case['name'] == name)


C2 = fixture('f15_double_height.json', 'c2')                        # Two floors, a double-height living hall.
HALF = fixture('f15_double_height.json', 'half-void-passage')       # An upstairs cell: Open to below | passage.


def model_of(plan):
    return geometry.build(schema.normalise(plan))


def pdf_objects(pdf):
    """The text of a PDF's objects: cairo writes PDF 1.7 with compressed object streams, so inflate them."""
    parts = [pdf]
    for match in re.finditer(rb'/Type\s*/ObjStm.*?stream\r?\n', pdf, re.S):
        start = match.end()
        parts.append(zlib.decompressobj().decompress(pdf[start:pdf.index(b'endstream', start)]))
    return b'\n'.join(parts)


def png_size(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    return struct.unpack('>II', data[16:24])


def small_plan(facing='South', width_ft=40, depth_ft=60):
    return {'schema': 'gazeconnect.compass-plan', 'version': 2,
            'plot': {'widthIn': width_ft * 12, 'depthIn': depth_ft * 12, 'facing': facing, 'gate': 'Center', 'plotType': 'Middle Plot'},
            'storeys': 1, 'choices': {},
            'floors': {'ground': {'splits': ['r2_c3'], 'rooms': [
                {'id': 'g-bathroom-1', 'use': 'bathroom', 'regions': ['r2_c3.R']},
                {'id': 'g-living-1', 'use': 'living', 'regions': ['r1_c2', 'r1_c3', 'r2_c2']},
                {'id': 'g-passage-1', 'use': 'passage', 'regions': ['r2_c3.L']},
                {'id': 'g-porch-1', 'use': 'porch', 'regions': ['r1_c1']},
            ]}}}


class ImageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c2 = model_of(C2)
        cls.half = model_of(HALF)

    def test_plan_images_have_the_requested_size_in_every_theme(self):
        for theme in studio.THEMES:
            with self.subTest(theme):
                self.assertEqual(png_size(plan2d.render_screen(self.c2, 'ground', theme, 1200, 800)), (1200, 800))
        self.assertEqual(png_size(plan2d.render_screen(self.half, 'first', 'warm', 900, 900)), (900, 900))

    def test_the_same_plan_draws_the_same_bytes(self):
        self.assertEqual(plan2d.render_screen(self.half, 'first', 'dark', 1000, 700),
                         plan2d.render_screen(model_of(HALF), 'first', 'dark', 1000, 700))
        self.assertEqual(top.render(self.c2, 'first', 'warm', 1000, 700), top.render(self.c2, 'first', 'warm', 1000, 700))
        self.assertEqual(perspective.render(self.c2, 'back-right', 'warm', 900, 600),
                         perspective.render(self.c2, 'back-right', 'warm', 900, 600))

    def test_fill_width_draws_as_tall_as_filling_the_width_needs(self):
        # The full screen's fill-width view (29 Oct 2026): the width sets the scale, so a deep plot gets a canvas
        # taller than wide and a wide plot one shorter; the requested height is ignored.
        deep, wide = model_of(small_plan(width_ft=40, depth_ft=60)), model_of(small_plan(width_ft=60, depth_ft=40))
        renders = {'plan': (plan2d, lambda m, w: plan2d.render_screen(m, 'ground', 'dark', w, 500, fit='width')),
                   'top': (top, lambda m, w: top.render(m, 'ground', 'dark', w, 500, fit='width'))}
        for name, (module, render) in renders.items():
            for width in (1200, 1650):
                with self.subTest(name, width=width):
                    deep_w, deep_h = png_size(render(deep, width))
                    wide_w, wide_h = png_size(render(wide, width))
                    self.assertEqual((deep_w, wide_w), (width, width))
                    self.assertGreater(deep_h, width)
                    self.assertLess(wide_h, width)
                    self.assertEqual(deep_h, module.fill_height(deep, width))

    def test_fill_height_is_the_first_height_at_which_the_width_sets_the_scale(self):
        model = model_of(small_plan(width_ft=40, depth_ft=60))
        W, D = model['plot']['W'], model['plot']['D']

        def plan_by_width(width, height):
            _, _, top_margin, left, right, _, bottom = plan2d.screen_margins(width, height)
            return (width - left - right) / W <= (height - top_margin - bottom) / D

        def top_by_width(width, height):
            _, _, across, down = top.scales(width, height, W / U, D / U)
            return across <= down

        for module, by_width in ((plan2d, plan_by_width), (top, top_by_width)):
            for width in (900, 1600, 2400):
                with self.subTest(module.__name__, width=width):
                    height = module.fill_height(model, width)
                    self.assertTrue(by_width(width, height))
                    self.assertFalse(by_width(width, height - 1))
        # A very deep plot stops at FILL_MAX_HEIGHT (then fitted by its height) instead of growing without limit.
        needle = model_of(small_plan(width_ft=20, depth_ft=200))
        self.assertEqual(png_size(plan2d.render_screen(needle, 'ground', 'warm', 2400, 500, fit='width')), (2400, 4000))
        # Every other request keeps its size, the plan and top view as before.
        self.assertEqual(png_size(plan2d.render_screen(model, 'ground', 'warm', 3000, 2000)), (2400, 1600))
        self.assertEqual(png_size(top.render(model, 'ground', 'warm', 1000, 3000)), (1000, 1600))
        with self.assertRaises(ValueError):
            studio.render(small_plan(), 'plan', fit='stretch')

    def test_top_view_and_every_outside_angle(self):
        for floor in ('ground', 'first'):
            self.assertEqual(png_size(top.render(self.half, floor, 'midnight-navy', 1000, 650)), (1000, 650))
        for preset in perspective.PRESETS:
            with self.subTest(preset):
                self.assertEqual(png_size(perspective.render(self.c2, preset, 'warm', 960, 600)), (960, 600))

    def test_sheets_one_page_per_floor_portrait_for_deep_plots(self):
        pdf = plan2d.render_sheet(self.c2, ['ground', 'first'])
        self.assertTrue(pdf.startswith(b'%PDF-'))
        objects = pdf_objects(pdf)
        self.assertEqual(len(re.findall(rb'/Type\s*/Page\b', objects)), 2)
        box = [float(v) for v in re.search(rb'/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', objects).groups()]
        self.assertAlmostEqual(box[2], 297 * 72 / 25.4, places=0)           # A3 portrait: 297 x 420 mm.
        self.assertAlmostEqual(box[3], 420 * 72 / 25.4, places=0)
        self.assertEqual(pdf, plan2d.render_sheet(model_of(C2), ['ground', 'first']), 'the same plan, the same PDF')
        wide = model_of(small_plan(width_ft=60, depth_ft=40))
        self.assertEqual(plan2d.sheet_orientation(wide), 'landscape')
        self.assertEqual(plan2d.sheet_orientation(self.c2), 'portrait')


class CadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = model_of(HALF)
        cls.files = {unit: dxf.export(cls.model, floor, unit) for unit in ('in', 'mm') for floor in ('first',)}

    def read(self, unit):
        return ezdxf.read(io.StringIO(self.files[unit].decode('utf-8')))

    def test_dxf_is_r2010_with_its_units_and_reads_back_clean(self):
        for unit, code in (('in', 1), ('mm', 4)):
            with self.subTest(unit):
                doc = self.read(unit)
                self.assertEqual(doc.dxfversion, 'AC1024')
                self.assertEqual(doc.header['$INSUNITS'], code)
                auditor = doc.audit()
                self.assertFalse(auditor.has_errors, [str(e) for e in auditor.errors])
                names = {layer.dxf.name for layer in doc.layers}
                self.assertTrue({name for name, *_ in dxf.LAYERS} <= names)
                used = {e.dxf.layer for e in doc.modelspace()}
                for layer in ('A-WALL', 'A-DOOR', 'A-GLAZ', 'A-STRS', 'A-STRS-VOID', 'A-AREA-IDEN', 'A-ANNO-NRTH'):
                    self.assertIn(layer, used)

    def test_same_plan_same_bytes(self):
        self.assertEqual(dxf.export(model_of(HALF), 'first', 'in'), self.files['in'])

    def test_walls_lie_on_the_plot_in_both_units_at_the_exact_scale(self):
        W, D = self.model['plot']['W'], self.model['plot']['D']
        extents = {}
        for unit, per_u in (('in', 1 / 8), ('mm', 25.4 / 8)):
            with self.subTest(unit):
                points = [p for e in self.read(unit).modelspace().query('LWPOLYLINE[layer=="A-WALL"]') for p in e.get_points('xy')]
                xs, ys = [p[0] for p in points], [p[1] for p in points]
                # Outer walls sit inside the plot line; upstairs the house starts behind the open front row.
                self.assertGreaterEqual(min(xs), -1e-6)
                self.assertGreaterEqual(min(ys), -1e-6)
                self.assertLessEqual(max(xs), W * per_u + 1e-6)
                self.assertLessEqual(max(ys), D * per_u + 1e-6)
                extents[unit] = (min(xs), min(ys), max(xs), max(ys))
        for a, b in zip(extents['in'], extents['mm']):
            self.assertAlmostEqual(a * 25.4, b, places=6)

    def test_north_arrow_matches_the_facing_table(self):
        table = json.loads((FIXTURES / 'f02_facings.json').read_text())['facings']
        for facing, row in table.items():
            with self.subTest(facing):
                model = model_of(small_plan(facing))
                self.assertEqual(list(model['plot']['north']), row['north'])
                doc = ezdxf.read(io.StringIO(dxf.export(model, 'ground', 'in').decode('utf-8')))
                ring = next(iter(doc.modelspace().query('CIRCLE[layer=="A-ANNO-NRTH"]')))
                letter = next(e for e in doc.modelspace().query('TEXT[layer=="A-ANNO-NRTH"]') if e.dxf.text == 'N')
                dx = letter.dxf.align_point.x - ring.dxf.center.x
                dy = letter.dxf.align_point.y - ring.dxf.center.y
                length = math.hypot(dx, dy)
                self.assertAlmostEqual(dx / length, row['north'][0], places=6)
                self.assertAlmostEqual(dy / length, row['north'][1], places=6)

    def test_readme_names_both_files_and_makes_no_dwg_or_code_claim(self):
        text = dxf.readme(self.model, 'first').decode('utf-8')
        self.assertIn('feet-inches.dxf', text)
        self.assertIn('millimetres.dxf', text)
        self.assertIn('R2010', text)
        self.assertNotRegex(text, r'(?i)\bis (a )?(native )?dwg\b')
        self.assertNotRegex(text, r'(?i)(certified|code[- ]compliant|complies with)')


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from floorplan_server import app
        cls.client = app.test_client()

    def post(self, route, body):
        return self.client.post(f'/api/floorplan/compass/v2/{route}', json=body)

    def test_model_and_render_name_the_same_plan(self):
        first = self.post('model', {'plan': HALF})
        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))
        summary = first.get_json()
        self.assertEqual(summary['floorsDrawn'], ['ground', 'first'])
        self.assertRegex(summary['modelHash'], r'^[0-9a-f]{64}$')
        self.assertEqual(self.post('model', {'plan': HALF}).get_json()['modelHash'], summary['modelHash'])
        image = self.post('render', {'plan': HALF, 'view': 'plan', 'floor': 'first', 'format': 'png', 'width': 800, 'height': 600})
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image.headers['X-Plan-Hash'], summary['modelHash'])
        self.assertEqual(png_size(image.data), (800, 600))
        # Fill width (the full screen): the service draws as tall as the plan needs, whatever height is asked.
        tall = self.post('render', {'plan': HALF, 'view': 'plan', 'floor': 'first', 'format': 'png', 'width': 800, 'height': 600,
                                    'fit': 'width'})
        self.assertEqual(tall.status_code, 200)
        self.assertEqual(png_size(tall.data), (800, plan2d.fill_height(model_of(HALF), 800)))
        self.assertEqual(self.post('render', {'plan': HALF, 'view': 'plan', 'fit': 'stretch'}).status_code, 422)

    def test_every_studio_download(self):
        for options, mime, magic in (
            ({'view': 'sheet', 'format': 'pdf'}, 'application/pdf', b'%PDF-'),
            ({'view': 'cad', 'format': 'dxf-in'}, 'application/dxf', b'  0\nSECTION'),
            ({'view': 'cad', 'format': 'dxf-mm'}, 'application/dxf', b'  0\nSECTION'),
            ({'view': 'cad', 'format': 'readme'}, 'text/plain; charset=utf-8', b'GazeConnect Compass'),
            ({'view': 'outside', 'format': 'png', 'preset': 'back-left', 'export': True, 'width': 1200, 'height': 800}, 'image/png', b'\x89PNG'),
        ):
            with self.subTest(options):
                reply = self.post('render', {'plan': C2, 'floor': 'ground', **options})
                self.assertEqual(reply.status_code, 200, reply.data[:200])
                self.assertEqual(reply.headers['Content-Type'], mime)
                self.assertTrue(reply.data.startswith(magic))

    def test_requests_that_cannot_be_drawn_are_refused_plainly(self):
        self.assertEqual(self.post('model', {}).status_code, 400)
        self.assertEqual(self.post('model', {'plan': {'nonsense': True}}).status_code, 422)
        single = small_plan()
        self.assertEqual(self.post('render', {'plan': single, 'floor': 'first'}).status_code, 422)
        self.assertEqual(self.post('render', {'plan': single, 'view': 'video'}).status_code, 422)
        self.assertEqual(self.post('render', {'plan': single, 'width': 10_000}).status_code, 422)
        self.assertEqual(self.post('render', {'plan': single, 'view': 'outside', 'preset': 'above'}).status_code, 422)

    def test_a_version_1_map_is_migrated_by_the_service(self):
        v1 = {'plot': {'width_ft': 40, 'depth_ft': 60, 'facing': 'East', 'type': 'Middle Plot', 'gate_position': 'Center'},
              'ground_floor': {'placements': [{'roomId': 'living', 'room': 'Living Hall', 'cells': ['r1_c1', 'r1_c2']},
                                              {'roomId': 'bedroom', 'room': 'Bedroom', 'cells': ['r3_c1', 'r4_c4']}]}}
        reply = self.post('model', {'plan': v1})
        self.assertEqual(reply.status_code, 200, reply.get_data(as_text=True))
        summary = reply.get_json()
        self.assertEqual(summary['plan']['version'], 2)
        self.assertEqual(len(summary['notices']), 1, 'the bedroom in two parts is announced')


if __name__ == '__main__':
    unittest.main()
