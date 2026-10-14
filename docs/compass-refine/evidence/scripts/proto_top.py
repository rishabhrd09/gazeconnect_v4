"""Scratch prototype (not app code): a front-at-bottom plan-oblique "top projection" built from
GazeConnect's existing model, faces and BSP ordering, to measure cost and show the look.

Usage: <GazeConnect python/.venv python> -I proto_top.py <repo> <spec.json> <out dir>
"""
import json
import math
import resource
import sys
import time
from pathlib import Path

repo, spec_path, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path[:0] = [str(repo / 'tools'), str(repo / 'python')]
import cairo  # noqa: E402
from shapely.geometry import LineString, MultiPoint, Point  # noqa: E402
from shapely.ops import unary_union  # noqa: E402
from compass_presentation import model, options  # noqa: E402
from compass_drawing import (face_normal, halo_text, mix, ordered_faces, paint, path, polygon,  # noqa: E402
                             rgb, SUN_VIEW)
from compass_architecture import parts  # noqa: E402
from compass_standards import DOOR_HEAD  # noqa: E402

A, B = 0.22, 0.42          # plan-oblique: z shifts the drawing right and up (front and left faces visible)
CUT = 4.0                  # same 4'-0" cut as the 2D plan
CAMERA = (-A, -B, 1.0)     # direction toward the viewer for this projection
ZONE = {'public': '#F1ECE3', 'private': '#ECEFF1', 'wet': '#E6EEEE', 'service': '#F0EDE6',
        'stair': '#EEE9E1', 'green': '#DCE6D3', 'paved': '#E9E5DD', 'balcony': '#E9E5DD'}


def zone(room):
    k = room['kind']
    if room['outdoor']:
        return ZONE['green'] if k == 'green' else ZONE['paved']
    return ZONE.get({'living': 'public', 'drawing': 'public', 'dining': 'public', 'lobby': 'public',
                     'bed': 'private', 'master': 'private', 'icu': 'private', 'bath': 'wet',
                     'kitchen': 'service', 'store': 'service'}.get(k, 'stair'), ZONE['public'])


def shade(colour, normal):
    nx, ny, nz = normal
    if abs(nz) > .5:
        return colour
    if nx * CAMERA[0] + ny * CAMERA[1] < 0:
        nx, ny = -nx, -ny
    k = .72 + .28 * max(0., -nx * .6 + -ny * .8)   # light from the front-left
    return mix(colour, '#26343A', 1 - k)


def draw_top(c, m, W=1600, H=1000):
    w, d = m['width'], m['depth']
    sx = (W - 160) / (w + A * CUT)
    sy = (H - 170) / (d + B * CUT)
    s = min(sx, sy)
    ox = (W - (w + A * CUT) * s) / 2
    oy = 70 + (H - 170 - (d + B * CUT) * s) / 2 + (d + B * CUT) * s

    def point(x, y, z=0.):
        return ox + (x + A * z) * s, oy - (y + B * z) * s
    paint(c, '#FBFAF7'); c.paint()
    # Plot and floors: flat zone tints only.
    path(c, [point(0, 0), point(w, 0), point(w, d), point(0, d)])
    paint(c, '#F4F2EC'); c.fill_preserve(); paint(c, '#C9C6BD'); c.set_line_width(1); c.stroke()
    for room in m['rooms']:
        for poly in room['polygons']:
            polygon(c, poly, point, zone(room))
    solids = []
    for fixture in m['architecture']['fixtures']:
        for obj in fixture['solids']:
            z, h = obj['z'], obj['height']
            if fixture['kind'] == 'stair':
                thick = min(h, .5); z, h = z + h - thick, thick
            top = min(z + h, CUT)
            if top > z:
                solids.append((obj['points'], z, top - z, '#D8CDBD' if fixture['kind'] != 'stair' else '#E2DACB', None))
    walls = m['architecture']['walls']
    openings = [('door', o) for o in m['architecture']['doors']] + [('window', o) for o in m['architecture']['windows']]
    for wall in walls:
        a, b = wall['a'], wall['b']; length = math.dist(a, b); dx, dy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
        cuts, marks, line = [], [0., length], LineString([a, b])
        for kind, o in openings:
            if line.intersection(LineString([o['a'], o['b']])).length < .01:
                continue
            lo, hi = sorted((line.project(Point(o['a'])), line.project(Point(o['b']))))
            marks += [max(0., lo), min(length, hi)]; cuts.append((lo, hi, kind, o))
        marks = sorted(set(marks)); t = wall['thickness'] / 2
        for lo, hi in zip(marks, marks[1:]):
            hit = next(((k, o) for x, y, k, o in cuts if x - .001 <= (lo + hi) / 2 <= y + .001), None)
            pa = (a[0] + dx * lo, a[1] + dy * lo); pb = (a[0] + dx * hi, a[1] + dy * hi)
            pts = [(pa[0] - dy * t, pa[1] + dx * t), (pb[0] - dy * t, pb[1] + dx * t), (pb[0] + dy * t, pb[1] - dx * t), (pa[0] + dy * t, pa[1] - dx * t)]
            if hit and hit[0] == 'door':
                continue
            if hit and hit[0] == 'window':
                sill = hit[1]['sill']
                solids.append((pts, 0., min(sill, CUT), '#F3F1EB', None))
                if sill < CUT:
                    thin = [(pa[0] - dy * .05, pa[1] + dx * .05), (pb[0] - dy * .05, pb[1] + dx * .05), (pb[0] + dy * .05, pb[1] - dx * .05), (pa[0] + dy * .05, pa[1] - dx * .05)]
                    solids.append((thin, sill, CUT - sill, '#BFD6D8', None))
                continue
            solids.append((pts, 0., CUT, '#F3F1EB', '#2A2F33'))     # cut top shows the plan's poché
    for door in m['architecture']['doors']:
        solids.append((door['leafPolygon'], 0., min(DOOR_HEAD, CUT), '#C9B497', None))
    # One soft floor shadow toward the back-right.
    floor = unary_union([p for r in m['rooms'] for p in r['polygons']])
    shadows = [MultiPoint([*pts, *[(x + .35 * (z + h), y + .55 * (z + h)) for x, y in pts]]).convex_hull
               for pts, z, h, _, _ in solids if z + h > .05]
    shade_poly = unary_union(shadows).intersection(floor) if shadows else None
    if shade_poly is not None:
        for poly in parts(shade_poly):
            if poly.geom_type != 'Polygon':
                continue
            path(c, [point(x, y, .01) for x, y in poly.exterior.coords])
            for ring in poly.interiors:
                for i, (x, y) in enumerate(ring.coords):
                    (c.move_to if i == 0 else c.line_to)(*point(x, y, .01))
                c.close_path()
            c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD); c.set_source_rgba(.1, .12, .13, .09); c.fill()
    faces = []
    for pts, z, h, tone, top in solids:
        for a, b in zip(pts, pts[1:] + pts[:1]):
            faces.append(([(a[0], a[1], z), (b[0], b[1], z), (b[0], b[1], z + h), (a[0], a[1], z + h)], tone, True))
        faces.append(([(p[0], p[1], z + h) for p in pts], top or tone, top is None))
    count = 0
    for points, tone, lit in ordered_faces(faces, CAMERA):
        count += 1
        colour = shade(tone, face_normal(points)) if lit else tone
        path(c, [point(*p) for p in points]); paint(c, colour); c.fill_preserve()
        paint(c, mix(colour, '#1B2629', .18)); c.set_line_width(.5); c.stroke()
    for room in m['rooms']:
        x1, y1, x2, y2 = room['labelBounds']
        x, y = point((x1 + x2) / 2, (y1 + y2) / 2, .1)
        halo_text(c, x, y, room['room'].upper() if len(room['room']) < 16 else room['room'].split(' + ')[0].split(' /')[0].upper(),
                  14, '#26343A', '#FBFAF7', True, 3.2)
    return count


spec = json.loads(spec_path.read_text())
plot = spec['plot']
source = {'grid_size': {'rows': 4, 'cols': 4},
          'plot': {'width_ft': plot['width_ft'], 'depth_ft': plot['depth_ft'], 'facing': plot['facing'],
                   'type': plot['type'], 'num_floors': 'Multi-Floor', 'gate_position': plot['gate']},
          'ground_floor': {'placements': [{'roomId': e['gc'], 'room': e['label'], 'placementId': 'g-' + e['gc'], 'cells': e['cells']} for e in spec['ground']]},
          'first_floor': {'placements': [{'roomId': e['gc'], 'room': e['label'], 'placementId': 'f-' + e['gc'], 'cells': e['cells']} for e in spec['first']]}}
plan = options(source, 'all')['options'][0]['compassData']
report = {}
for floor in ('ground', 'first'):
    m = model(plan, floor)
    t = time.perf_counter()
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 2400, 1500)
    c = cairo.Context(surface); c.scale(1.5, 1.5)
    n = draw_top(c, m)
    surface.write_to_png(str(out / f'proto_top_{floor}.png'))
    report[floor] = {'seconds': round(time.perf_counter() - t, 3), 'drawn_faces': n}
report['peak_rss_mb'] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576, 1)
print(json.dumps(report))
