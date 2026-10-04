"""Room cameras, exterior geometry, occlusion, and bounded renderer resources."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import cairo
from shapely.geometry import Polygon, box
from compass_presentation import model, normalise, render, PALETTES
from compass_exterior import Painter, STYLES, draw_exterior
from compass_resources import RenderResources, RendererBusy, MAX_REQUEST_BYTES, validate_source
from floorplan_server import app, compass_resources
import compass_drawing as drawing


class RoomViewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = normalise(json.loads((Path(__file__).parent / 'fixtures/compass_architectural_map.json').read_text()))

    def test_every_room_has_four_views_without_changing_source(self):
        original = copy.deepcopy(self.source)
        for room in self.source['ground_floor']['placements']:
            views = [render(self.source, view='3d', fmt='svg', room_id=room['placementId'], angle=a) for a in range(4)]
            self.assertTrue(all(v.startswith(b'<?xml') for v in views))
            self.assertEqual(len(set(views)), 4)
        self.assertEqual(self.source, original)

    def test_room_camera_excludes_other_rooms_and_keeps_irregular_shape(self):
        m = model(self.source, 'ground')
        room = next(r for r in m['rooms'] if r['shape'].area < r['shape'].envelope.area)
        seen = []
        original_polygon = drawing.polygon
        def capture(c, poly, point, *args, **kwargs):
            seen.append(poly)
            return original_polygon(c, poly, point, *args, **kwargs)
        ctx = cairo.Context(cairo.ImageSurface(cairo.FORMAT_ARGB32, 1600, 1000))
        with patch.object(drawing, 'polygon', side_effect=capture):
            drawing.draw_3d(ctx, m, PALETTES['warm'], 0, room['placementId'])
        self.assertEqual(seen, room['polygons'])
        self.assertLess(sum(p.area for p in seen), room['shape'].envelope.area)

    def test_room_identity_is_not_its_name_and_is_scoped_to_floor(self):
        source = copy.deepcopy(self.source)
        source['first_floor'] = copy.deepcopy(source['ground_floor'])
        for room in source['first_floor']['placements']:
            room['placementId'] = 'first:' + room['placementId']
        ids = [r['placementId'] for r in source['ground_floor']['placements']]
        for r in source['ground_floor']['placements']:
            r['room'] = 'My room'
        self.assertNotEqual(render(source, view='3d', room_id=ids[0]), render(source, view='3d', room_id=ids[1]))
        with self.assertRaisesRegex(ValueError, 'selected floor'):
            render(source, floor='first', view='3d', room_id=ids[0])
        for kwargs in ({'room_id':''}, {'room_id':'missing'}, {'room_id':ids[0], 'fmt':'pdf'}, {'room_id':ids[0], 'view':'2d'}):
            with self.assertRaises(ValueError):
                render(source, **{'view':'3d', **kwargs})

    def test_exterior_uses_only_actual_floors_and_does_not_edit_map(self):
        source = copy.deepcopy(self.source)
        original = copy.deepcopy(source)
        with patch('compass_presentation.draw_exterior') as draw:
            render(source, view='exterior')
            floors = draw.call_args.args[1]
            self.assertEqual(len(floors), 1)
            self.assertEqual([r['geometryRects'] for r in floors[0]['rooms']], [r['geometryRects'] for r in source['ground_floor']['placements']])
        source['first_floor'] = {'placements':[{'roomId':'bedroom','room':'Bedroom','cells':['r4_c4']}]}
        with patch('compass_presentation.draw_exterior') as draw:
            render(source, view='exterior')
            self.assertEqual(len(draw.call_args.args[1]), 2)
            self.assertEqual(len(draw.call_args.args[1][1]['rooms']), 1)
        del source['first_floor']
        self.assertEqual(source, original)
        outputs = [render(source, view='exterior', style=s) for s in STYLES]
        self.assertEqual(len(set(outputs)), 3)
        for angle in range(4):
            self.assertTrue(render(source, view='exterior', angle=angle, fmt='svg').startswith(b'<?xml'))

    def test_exterior_roof_preserves_courtyard_void(self):
        p = Painter(20, 20, 12, 0)
        room = box(0, 0, 20, 20).difference(box(5, 5, 15, 15))
        p.slab(room, 10, .35, '#FFFFFF')
        top = [Polygon([(x,y) for x,y,z in points]) for points, colour in p.faces if all(abs(q[2]-10.35)<.0001 for q in points)]
        self.assertAlmostEqual(sum(t.area for t in top), room.area)
        self.assertTrue(all(t.intersection(box(5,5,15,15)).area < .0001 for t in top))

    def test_roof_occludes_rear_windows_instead_of_centroid_sorting(self):
        p = Painter(10, 10, 12, 0)
        p.face([(0,0,10),(10,0,10),(10,10,10),(0,10,10)], '#FF0000')
        p.face([(10,0,0),(10,10,0),(10,10,10),(10,0,10)], '#0000FF')
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32,1600,1000)
        p.draw(cairo.Context(surface));surface.flush()
        x,y = map(round,p.point(7,4,10))
        # Native Cairo little-endian BGRA on supported Windows/macOS machines.
        pixel = bytes(surface.get_data()[y*surface.get_stride()+x*4:y*surface.get_stride()+x*4+4])
        self.assertEqual(pixel, b'\x00\x00\xff\xff')

    def test_finished_shading_is_continuous_across_coplanar_face_splits(self):
        def draw(faces):
            painter = Painter(20, 20, 10, 0)
            painter.finished = True
            for points in faces:
                painter.face(points, '#DADCD6')
            surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 1600, 1000)
            painter.draw(cairo.Context(surface)); surface.flush()
            samples = []
            for x in (2, 5, 8, 12, 15, 18):
                for y in (4, 8, 12, 16):
                    px, py = map(round, painter.point(x, y, 5))
                    offset = py * surface.get_stride() + px * 4
                    samples.append(bytes(surface.get_data()[offset:offset + 4]))
            return samples
        whole = draw([[(0,0,5),(20,0,5),(20,20,5),(0,20,5)]])
        split = draw([[(0,0,5),(10,0,5),(10,20,5),(0,20,5)],
                      [(10,0,5),(20,0,5),(20,20,5),(10,20,5)]])
        # Triangulation/BSP changes visibility ordering, not a flat roof's finish.
        self.assertLessEqual(max(abs(a-b) for p,q in zip(whole,split) for a,b in zip(p,q)),1)

    def test_actual_routes_handle_room_exterior_and_busy(self):
        client = app.test_client(); room = self.source['ground_floor']['placements'][0]['placementId']
        for view, extra in [('3d',{'room_id':room}), ('exterior',{'style':'terracotta'})]:
            r = client.post('/api/floorplan/compass/render',json={'compass_map':self.source,'view':view,'format':'svg',**extra})
            self.assertEqual(r.status_code,200);self.assertTrue(r.data.startswith(b'<?xml'))
        # Use uncached output to exercise backpressure, not a cheap cache hit.
        with compass_resources.job():
            r=client.post('/api/floorplan/compass/render',json={'compass_map':self.source,'view':'exterior','theme':'serene-dark','angle':3,'style':'terracotta'})
            self.assertEqual(r.status_code,429)
        self.assertEqual(client.get('/api/health').status_code,200)
        self.assertEqual(client.post('/api/floorplan/compass/render',data=b'x'*(MAX_REQUEST_BYTES+1),content_type='application/json').status_code,413)
        for bad in ({'plot':None}, {'plot':{'width_ft':10**400,'depth_ft':40}}, {'plot':{'width_ft':float('inf'),'depth_ft':40}}):
            self.assertEqual(client.post('/api/floorplan/compass/render',json={'compass_map':bad}).status_code,422)


class ResourceTests(unittest.TestCase):
    def setUp(self):
        self.source={'plot':{'width_ft':40,'depth_ft':60},'ground_floor':{'placements':[]}}

    def test_lru_evicts_by_bytes_and_item_count(self):
        cache=RenderResources(max_bytes=10,max_items=2)
        calls=[]
        def get(n,size=4):
            return cache.render(self.source,{'room_id':str(n)},lambda: (calls.append(n),bytes([n])*size)[1])
        get(1);get(2);get(1);get(3)
        self.assertEqual(calls,[1,2,3]);self.assertEqual(cache.stats(),{'items':2,'bytes':8})
        get(2);self.assertEqual(calls,[1,2,3,2])
        get(4,8);self.assertEqual(cache.stats(),{'items':1,'bytes':8})
        get(5,12);self.assertEqual(cache.stats(),{'items':1,'bytes':8})

    def test_one_job_rejects_queue_and_releases_after_failure(self):
        cache=RenderResources()
        with cache.job():
            with self.assertRaises(RendererBusy):
                cache.render(self.source,{},lambda:b'no')
        with self.assertRaises(RuntimeError):
            with cache.job():raise RuntimeError('test')
        self.assertEqual(cache.render(self.source,{},lambda:b'ok'),b'ok')

    def test_cache_key_includes_source_floor_room_style_and_angle(self):
        cache=RenderResources();calls=[]
        base={'floor':'ground','room_id':'1','style':'verandah','angle':0}
        cases=[base,{**base,'floor':'first'},{**base,'room_id':'2'},{**base,'style':'terracotta'},{**base,'angle':1}]
        for case in cases:
            cache.render(self.source,case,lambda:(calls.append(True),b'x')[1])
        source=copy.deepcopy(self.source);source['plot']['width_ft']=44
        cache.render(source,base,lambda:(calls.append(True),b'x')[1])
        self.assertEqual(len(calls),6)

    def test_complexity_limits_before_any_render_work(self):
        for mutate in (lambda s:s.update(grid_size={'rows':100,'cols':100}),lambda s:s.update(extra='x'*MAX_REQUEST_BYTES),lambda s:s['ground_floor'].update(placements=[{'cells':[]}]*17),lambda s:s['ground_floor'].update(placements=[{'cells':[],'geometryRects':[{}]*17}])):
            source=copy.deepcopy(self.source);mutate(source)
            with self.assertRaises(ValueError):validate_source(source)

if __name__=='__main__': unittest.main()
