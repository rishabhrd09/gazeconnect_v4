"""Compass studio contracts: partial floors, geometry parity, real exports."""
import copy
import io
import json
import sys
import unittest
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import ezdxf
from compass_presentation import options, model, render, scoped_map, normalise
from tests.test_gazeplan_candidates import sample_map
from floorplan_server import app
from compass_drawing import sheet_size
import compass_drawing as drawing
import cairo
import math
from compass_presentation import PALETTES
from shapely.geometry import box, LineString, Polygon

class CompassPresentationTests(unittest.TestCase):
    def test_ground_scope_keeps_unfinished_first_floor_untouched(self):
        source = sample_map()
        source['plot']['num_floors'] = 'Multi-Floor'
        source['first_floor'] = {'placements': []}
        original = copy.deepcopy(source)
        result = options(source, 'ground')
        self.assertEqual(source, original)
        self.assertEqual(len(result['options']), 4)
        self.assertTrue(all('first_floor' not in p['compassData'] for p in result['options']))
        self.assertEqual(source['plot']['num_floors'], 'Multi-Floor')
        source['first_floor']['placements'] = [{'roomId':'bedroom','room':'Bedroom','cells':['r4_c4']}]
        original = copy.deepcopy(source)
        options(source,'ground')
        self.assertEqual(source,original)

    def test_alternatives_are_distinct_bounded_and_preserve_room_cells(self):
        source = sample_map()
        choices = options(source,'ground')['options']
        self.assertEqual(len({p['id'] for p in choices}),4)
        self.assertEqual(choices, options(source,'ground')['options'])
        original = source['ground_floor']['placements']
        for option in choices:
            self.assertTrue(option['valid'])
            floor = option['compassData']['ground_floor']
            self.assertEqual([p['cells'] for p in floor['placements']], [p['cells'] for p in original])
            self.assertAlmostEqual(sum(p['area_sqft'] for p in floor['placements']), 2400)
            m=model(option['compassData'],'ground')
            self.assertEqual(len(m['doors']),4)
            self.assertEqual([p['geometryRects'] for p in m['rooms']], [p['geometryRects'] for p in floor['placements']])

    def test_partial_map_is_honest_preview_not_four_fake_layouts(self):
        source=sample_map()
        source['ground_floor']['placements']=[{'roomId':'living','room':'Living Hall','cells':['r4_c4']}]
        result=options(source,'ground')
        self.assertEqual(len(result['options']),1)
        p=result['options'][0]
        self.assertFalse(p['valid']); self.assertTrue(p['notes'])
        self.assertEqual(len(p['compassData']['ground_floor']['placements']),1)
        self.assertEqual(model(p['compassData'],'ground')['doors'],[])
        self.assertTrue(render(p['compassData'],view='3d').startswith(b'\x89PNG'))

    def test_both_partial_floors_can_be_viewed_without_stair_claim(self):
        source=sample_map();source['plot']['num_floors']='Multi-Floor'
        source['first_floor']={'placements':[{'roomId':'bedroom','room':'Bedroom','cells':['r4_c4']}]}
        result=options(source,'all');p=result['options'][0]
        self.assertFalse(p['valid'])
        self.assertIn('first_floor',p['compassData'])
        self.assertEqual(len(model(p['compassData'],'first')['rooms']),1)

    def test_duplicate_and_out_of_bounds_rooms_rejected(self):
        source=sample_map();source['ground_floor']['placements'][1]['cells'].append('r1_c1')
        with self.assertRaises(ValueError): options(source,'ground')
        p=options(sample_map(),'ground')['options'][0]['compassData']
        p['ground_floor']['placements'][0]['geometryRects'][0]['x1']=-2
        with self.assertRaises(ValueError): render(p)
        with self.assertRaises(ValueError): render(sample_map(),floor='first')
        with self.assertRaises(ValueError): options(sample_map(),'anything')

    def test_legacy_refinements_are_not_silently_dropped(self):
        source=sample_map();source['ground_floor']['advanced_refinements']={'customEdges':[{'kind':'door'}]}
        with self.assertRaisesRegex(ValueError,'refinement'): options(source,'ground')

    def test_all_formats_and_cad_dimensions_use_same_geometry(self):
        p=options(sample_map(),'ground')['options'][-1]['compassData']
        for fmt,magic in [('png',b'\x89PNG'),('svg',b'<?xml'),('pdf',b'%PDF')]:
            self.assertTrue(render(p,fmt=fmt).startswith(magic))
        for angle in range(4): self.assertTrue(render(p,view='3d',angle=angle).startswith(b'\x89PNG'))
        doc=ezdxf.read(io.StringIO(render(p,fmt='dxf').decode()))
        self.assertEqual(doc.units,4)
        ms=doc.modelspace(); self.assertEqual(len(ms.query('DIMENSION')),10)
        self.assertEqual(len(ms.query('LINE[layer=="A-DOOR"]')),4)
        polygons=list(ms.query('LWPOLYLINE[layer=="A-ROOM"]'))
        expected=model(p,'ground')['rooms']
        for entity,room in zip(polygons,expected):
            actual=list(entity.get_points('xy'))
            reference=list(room['polygons'][0].exterior.coords)[:-1]
            self.assertEqual(len(actual),len(reference))
            for a,b in zip(actual,reference):
                self.assertAlmostEqual(a[0],b[0]*304.8);self.assertAlmostEqual(a[1],b[1]*304.8)

    def test_irregular_room_holes_and_areas_remain_exact(self):
        source=sample_map();source['ground_floor']['placements']=[{'room':'Ring room','roomId':'living','cells':['r1_c1','r1_c2','r1_c3','r2_c1','r2_c3','r3_c1','r3_c2','r3_c3']}]
        m=model(source,'ground');self.assertEqual(len(m['rooms'][0]['polygons'][0].interiors),1)
        self.assertEqual(m['rooms'][0]['area_sqft'],1200)
        for view in ['2d','3d']: self.assertTrue(render(source,view=view).startswith(b'\x89PNG'))

    def test_architectural_symbols_stay_in_rooms_and_match_cad(self):
        source=json.loads((Path(__file__).parent/'fixtures/compass_architectural_map.json').read_text())
        original=copy.deepcopy(source)
        choices=options(source,'ground')['options']
        self.assertEqual(len(choices),4)
        for plan in choices:
            m=model(plan['compassData'],'ground');arch=m['architecture']
            self.assertTrue(arch['windows']);self.assertTrue(arch['walls'])
            stair=next(r for r in m['rooms'] if r['roomId']=='staircase')
            flights=[f for f in stair['fixtures'] if f['kind']=='stair']
            self.assertEqual(len(flights),1)
            self.assertGreater(len(flights[0]['solids']),12)
            self.assertGreater(max(x['height'] for x in flights[0]['solids']),7)
            for room in m['rooms']:
                label=box(*room['labelBounds'])
                self.assertTrue(room['shape'].covers(label))
                for fixture in room['fixtures']:
                    footprint=box(*fixture['bounds'])
                    self.assertTrue(room['shape'].covers(footprint))
                    self.assertLess(label.intersection(footprint).area,.001)
                    for item in fixture['solids']:
                        self.assertTrue(footprint.buffer(.001).covers(Polygon(item['points'])))
                    for door in arch['doors']:
                        if room['placementId'] in (door['fromPlacementId'],door['toPlacementId']):
                            self.assertFalse(footprint.intersects(LineString([door['a'],door['b']]).buffer(3,cap_style=2)))
            for window in arch['windows']:
                glass=LineString([window['a'],window['b']])
                self.assertLess(arch['wallFootprint'].intersection(glass).length,.001)
                for door in arch['doors']:self.assertGreater(glass.distance(LineString([door['a'],door['b']])),.01)
            doc=ezdxf.read(io.StringIO(render(plan['compassData'],fmt='dxf').decode()))
            ms=doc.modelspace()
            self.assertGreater(len(ms.query('LWPOLYLINE[layer=="A-WALL"]')),0)
            self.assertEqual(len(ms.query('LINE[layer=="A-WIND"]')),2*len(arch['windows']))
            self.assertEqual(len(ms.query('LWPOLYLINE[layer=="A-STAIR"]')),len(flights[0]['lines']))
            cad=list(ms.query('LWPOLYLINE[layer=="A-STAIR"]'))[0]
            expected=flights[0]['lines'][0]['points']
            for actual,point in zip(cad.get_points('xy'),expected):
                self.assertAlmostEqual(actual[0],point[0]*304.8)
                self.assertAlmostEqual(actual[1],point[1]*304.8)
        self.assertEqual(source,original)

    def test_true_proportion_sheet_and_four_rotations_across_themes(self):
        source=json.loads((Path(__file__).parent/'fixtures/compass_architectural_map.json').read_text())
        p=options(source,'ground')['options'][0]['compassData'];m=model(p,'ground')
        width,height=sheet_size(m)
        # A tall plot is rotated to use the screen, never independently stretched.
        self.assertGreater(width,height)
        images=[]
        for angle in range(4):images.append(render(p,view='3d',angle=angle))
        self.assertEqual(len(set(images)),4)
        for theme in ['warm','dark','midnight-navy','serene-warm','serene-dark','serene-midnight-navy']:
            for view in ['2d','3d','technical']:
                self.assertTrue(render(p,view=view,theme=theme,fmt='svg').startswith(b'<?xml'))

    def test_3d_names_use_the_same_camera_as_their_rooms(self):
        source=json.loads((Path(__file__).parent/'fixtures/compass_architectural_map.json').read_text())
        m=model(source,'ground')
        for angle in range(4):
            anchors={};labels={};leaders=[]
            real_polygon,real_text,real_stroke=drawing.polygon,drawing.text,drawing.stroke
            def capture_floor(ctx,poly,point,*args,**kwargs):
                for room in m['rooms']:
                    if any(poly is p for p in room['polygons']):
                        x1,y1,x2,y2=room['labelBounds']
                        anchors[room['room']]=point((x1+x2)/2,(y1+y2)/2,.15)
                return real_polygon(ctx,poly,point,*args,**kwargs)
            def capture_text(ctx,x,y,value,*args,**kwargs):
                labels[value]=(x,y)
                return real_text(ctx,x,y,value,*args,**kwargs)
            def capture_line(ctx,points,*args,**kwargs):
                leaders.append(points[0])
                return real_stroke(ctx,points,*args,**kwargs)
            ctx=cairo.Context(cairo.ImageSurface(cairo.FORMAT_ARGB32,1600,1000))
            with patch.object(drawing,'polygon',side_effect=capture_floor),patch.object(drawing,'text',side_effect=capture_text),patch.object(drawing,'stroke',side_effect=capture_line):
                drawing.draw_3d(ctx,m,PALETTES['warm'],angle)
            for name,anchor in anchors.items():
                self.assertIn(name,labels)
                # A displaced label must lead back to the room. Otherwise its
                # horizontal centre must share the floor's unchanged camera.
                self.assertTrue(abs(labels[name][0]-anchor[0])<.01 or any(math.dist(p,anchor)<.01 for p in leaders),(angle,name,labels[name],anchor))

    def test_real_api_scope_downloads_and_validation(self):
        client=app.test_client()
        source=sample_map();source['plot']['num_floors']='Multi-Floor';source['first_floor']={'placements':[]}
        response=client.post('/api/floorplan/compass/options',json={'compass_map':source,'scope':'ground'})
        self.assertEqual(response.status_code,200)
        p=response.json['options'][0]['compassData']
        for fmt,mime in [('svg','image/svg+xml'),('pdf','application/pdf'),('png','image/png'),('dxf','application/dxf')]:
            r=client.post('/api/floorplan/compass/render',json={'compass_map':p,'format':fmt})
            self.assertEqual(r.status_code,200);self.assertEqual(r.mimetype,mime)
        self.assertEqual(client.post('/api/floorplan/compass/options',json={}).status_code,400)
        self.assertEqual(client.post('/api/floorplan/compass/options',json={'compass_map':source,'scope':'all'}).status_code,422)
        self.assertEqual(client.post('/api/floorplan/compass/render',json={'compass_map':p,'format':'exe'}).status_code,422)

if __name__ == '__main__':unittest.main()
