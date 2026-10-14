"""Look-development prototype (scratch, not app code): open-plan living/dining/kitchen, a double-height
living hall, and CPU-only 2D plan, plan-oblique top view and perspective exterior for the C2 house.

Usage: <GazeConnect python/.venv python> -I lookdev.py <repo> <c2_spec.json> <out dir>
"""
import json
import math
import resource
import sys
import time
from pathlib import Path

repo, spec_path, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path[:0] = [str(repo / 'tools'), str(repo / 'python')]
out.mkdir(parents=True, exist_ok=True)

import cairo  # noqa: E402
import numpy as np  # noqa: E402
from shapely.affinity import translate  # noqa: E402
from shapely.geometry import LineString, MultiPoint, Point, Polygon, box  # noqa: E402
from shapely.ops import unary_union  # noqa: E402
import compass_drawing as D  # noqa: E402
from compass_architecture import details, parts  # noqa: E402
from compass_presentation import model, normalise  # noqa: E402
from compass_standards import DOOR_HEAD, WALL_INNER, WALL_OUTER  # noqa: E402

spec = json.loads(spec_path.read_text())
CW, CD = spec['plot']['width_ft'] / 4, spec['plot']['depth_ft'] / 4
W, DEPTH = spec['plot']['width_ft'], spec['plot']['depth_ft']
OPEN = set(spec['open_plan'])
TIMES = {}


def cell(key):
    r, c = int(key[1]), int(key[4])
    return box((c - 1) * CW, (r - 1) * CD, c * CW, r * CD)


VOID = unary_union([cell(k) for k in spec['void_first']])


def rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def mix(a, b, t):
    return '#' + ''.join(f'{round((x * (1 - t) + y * t) * 255):02X}' for x, y in zip(rgb(a), rgb(b)))


# ---------------------------------------------------------------- model: explicit doors, open plan, void
def source_map():
    plot = spec['plot']
    return {'grid_size': {'rows': 4, 'cols': 4},
            'plot': {'width_ft': W, 'depth_ft': DEPTH, 'facing': plot['facing'], 'type': plot['type'],
                     'num_floors': 'Multi-Floor', 'gate_position': plot['gate']},
            'ground_floor': {'placements': [{'roomId': e['gc'], 'room': e['label'], 'placementId': 'g-' + e['gc'], 'cells': e['cells']} for e in spec['ground']]},
            'first_floor': {'placements': [{'roomId': e['gc'], 'room': e['label'], 'placementId': 'f-' + e['gc'], 'cells': e['cells']} for e in spec['first']]}}


def shared_edge(a, b):
    line = a.boundary.intersection(b.boundary)
    segs = [p for p in parts(line) if p.geom_type == 'LineString']
    if not segs:
        return None
    merged = unary_union(segs)
    return max(parts(merged), key=lambda s: s.length)


def build(data, floor, hint=None):
    m = model(data, floor, ground=None)
    by = {r['roomId']: r for r in m['rooms']}
    raw = []
    for pair in spec['doors'][floor]:
        a, b = by[pair[0]], by[pair[1]]
        sa = unary_union(a['polygons']); sb = unary_union(b['polygons'])
        edge = shared_edge(sa, sb)
        (x1, y1), (x2, y2) = edge.coords[0], edge.coords[-1]
        L = edge.length; ux, uy = (x2 - x1) / L, (y2 - y1) / L
        start = 1.0  # a door near a corner keeps the long wall free for furniture
        p, q = (x1 + ux * start, y1 + uy * start), (x1 + ux * (start + 3.0), y1 + uy * (start + 3.0))
        raw.append({'x1': p[0], 'y1': p[1], 'x2': q[0], 'y2': q[1], 'fromPlacementId': a['placementId'], 'toPlacementId': b['placementId']})
    m['doors'] = raw
    m['architecture'] = details(m, hint)
    return m


def side_room(m, pt):
    return next((r for r in m['rooms'] if r['shape'].covers(Point(pt))), None)


def open_plan(m, floor):
    """Remove walls inside the open plan; walls beside the double-height void become rails or partitions."""
    arch = m['architecture']; keep = []; rails = []
    for w in arch['walls']:
        (ax, ay), (bx, by) = w['a'], w['b']; L = math.dist(w['a'], w['b'])
        nx, ny = -(by - ay) / L, (bx - ax) / L; mx, my = (ax + bx) / 2, (ay + by) / 2
        p1, p2 = (mx + nx * .3, my + ny * .3), (mx - nx * .3, my - ny * .3)
        r1, r2 = side_room(m, p1), side_room(m, p2)
        v1 = floor == 'first' and VOID.covers(Point(p1)); v2 = floor == 'first' and VOID.covers(Point(p2))
        if r1 and r2 and r1 is not r2 and not r1['outdoor'] and not r2['outdoor'] and r1['kind'] in OPEN and r2['kind'] in OPEN:
            continue                                            # open plan: no wall at all
        if v1 or v2:
            other = r2 if v1 else r1
            if other is not None and not other['outdoor'] and other['kind'] in OPEN:
                rails.append(w); continue                       # gallery edge: glass balustrade
            if other is not None and not other['outdoor']:
                keep.append({**w, 'exterior': False, 'thickness': WALL_INNER}); continue
        keep.append(w)
    arch['walls'] = keep; arch['rails'] = rails
    if floor == 'first':
        arch['windows'] = [x for x in arch['windows'] if VOID.boundary.distance(LineString([x['a'], x['b']])) > .2]
        indoor = unary_union([r['shape'] for r in m['rooms'] if not r['outdoor']])
        for seg in parts(VOID.boundary.difference(indoor.buffer(.05))):
            if seg.geom_type != 'LineString' or seg.length < 1:
                continue
            a, b = seg.coords[0], seg.coords[-1]
            keep.append({'a': a, 'b': b, 'exterior': True, 'thickness': WALL_OUTER})
            L = seg.length; ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            arch['windows'].append({'a': (a[0] + ux * 1.2, a[1] + uy * 1.2), 'b': (b[0] - ux * 1.2, b[1] - uy * 1.2), 'roomId': None,
                                    'kind': 'window', 'width': L - 2.4, 'tag': 'W', 'sill': .5, 'head': 9.5})
    cuts = unary_union([LineString([o['a'], o['b']]).buffer(.5, cap_style=2) for o in [*arch['doors'], *arch['windows']]])
    raw = unary_union([LineString([w['a'], w['b']]).buffer(w['thickness'] / 2, cap_style=2, join_style=2) for w in keep])
    arch['wallFootprint'] = raw.difference(cuts)
    if floor == 'ground':
        for r in m['rooms']:
            if r['roomId'] == 'living':
                r['room'] = 'Living Hall · double height'
    for r in m['rooms']:
        r['turning'] = None
    return m


# ---------------------------------------------------------------- shared helpers
ZONE = {'public': '#F3EFE7', 'private': '#EEF1F2', 'wet': '#E8EFEF', 'stair': '#F1EDE5', 'green': '#E2EADA', 'paved': '#ECE9E2'}


def zone_fill(room):
    if room['outdoor']:
        return ZONE['green'] if room['kind'] == 'green' else ZONE['paved']
    k = room['kind']
    return ZONE['wet'] if k == 'bath' else ZONE['private'] if k in ('bed', 'master', 'icu') else ZONE['stair'] if k == 'stair' else ZONE['public']


def blur(surface, radius):
    surface.flush()
    w, h, stride = surface.get_width(), surface.get_height(), surface.get_stride()
    buf = np.frombuffer(surface.get_data(), dtype=np.uint8).reshape(h, stride)
    a = buf[:, :w].astype(np.float32)
    for _ in range(3):
        for axis in (1, 0):
            pad = [(radius + 1, radius) if ax == axis else (0, 0) for ax in range(2)]
            c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
            a = ((c[:, 2 * radius + 1:] - c[:, :-2 * radius - 1]) if axis == 1 else (c[2 * radius + 1:, :] - c[:-2 * radius - 1, :])) / (2 * radius + 1)
    buf[:, :w] = np.clip(a, 0, 255).astype(np.uint8)
    surface.mark_dirty()


def fill_poly(c, poly, point, z=0.):
    for p in parts(poly):
        if p.geom_type != 'Polygon':
            continue
        c.new_path()
        for ring in (p.exterior, *p.interiors):
            for i, (x, y) in enumerate(ring.coords):
                (c.move_to if i == 0 else c.line_to)(*point(x, y, z))
            c.close_path()
    c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD); c.fill()


# ---------------------------------------------------------------- A. 2D plan, road at the bottom, no rotation
class CleanPlan(D.Plan):
    def room_fill(self, room):
        return zone_fill(room)

    def floors(self):
        for room in self.m['rooms']:
            for poly in room['polygons']:
                D.polygon(self.c, poly, self.point, zone_fill(room))
        self.c.set_line_width(.6)


def draw_plan(m, floor, path_png):
    t = time.perf_counter()
    WPX, HPX = 1500, 2050
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, WPX * 2 // 2, HPX)
    c = cairo.Context(surface)
    D.paint(c, '#FBFAF7'); c.paint()
    s = min((WPX - 300) / W, (HPX - 420) / DEPTH)
    left = (WPX - W * s) / 2 + 20; top = 190
    point = lambda x, y, z=0.: (left + x * s, top + (DEPTH - y) * s)
    pal = ('#FBFAF7', '#FFFFFF', '#1E2A30', '#5B6B72', '#9AA7AD')
    plan = CleanPlan(c, m, pal, point, s, D.SCREEN, False, False)
    plan.wall = '#1F2A2F'; plan.wall_inner = '#3B474D'; plan.wall_line = '#11181B'
    plan.plot_line(); plan.floors()
    if floor == 'first':  # open to below: light void with the usual crossed diagonals
        c.set_source_rgba(1, 1, 1, .55); fill_poly(c, VOID, point)
        x1, y1, x2, y2 = VOID.bounds
        for a, b in (((x1, y1), (x2, y2)), ((x1, y2), (x2, y1))):
            D.stroke(c, [point(*a), point(*b)], '#A9B3B7', 1.0)
    plan.furniture(); plan.wall_layers(); plan.window_symbols(); plan.door_symbols()
    for w in m['architecture'].get('rails', []):  # glass balustrade: two fine lines and posts
        (ax, ay), (bx, by) = w['a'], w['b']; L = math.dist(w['a'], w['b']); nx, ny = -(by - ay) / L * .08, (bx - ax) / L * .08
        for o in (-1, 1):
            D.stroke(c, [point(ax + nx * o, ay + ny * o), point(bx + nx * o, by + ny * o)], '#4E7F8A', 1.3)
        for k in range(int(L // 4) + 1):
            px, py = ax + (bx - ax) * min(1, k * 4 / L), ay + (by - ay) * min(1, k * 4 / L)
            c.rectangle(*point(px - .12, py + .12), .24 * s, .24 * s); D.paint(c, '#2E3A3F'); c.fill()
    if floor == 'ground':  # edge of the floor above, dashed, around the double-height part
        for seg in parts(VOID.boundary):
            D.dashed(c, [point(*p) for p in seg.coords], '#6B7A80', 1.1, (6., 4.))
    plan.labels()
    if floor == 'first':
        cx, cy = VOID.centroid.x, VOID.centroid.y
        D.halo_text(c, *point(cx, cy + 1.0), 'OPEN TO BELOW', 15, '#33454C', '#FBFAF7', True, 3)
        D.halo_text(c, *point(cx, cy - 1.2), 'double-height living', 12.5, '#5B6B72', '#FBFAF7', False, 3)
    plan.chains(top, 'right', left + W * s)
    north = D.north_vector(m.get('facing'))
    ox, oy = point(0, 0); nx, ny = point(*north)
    D.north_arrow(c, (left + W * s + 70, top - 80), (nx - ox, ny - oy), 22, '#1E2A30', '#FBFAF7', D.SCREEN)
    road_y = top + DEPTH * s + 38
    c.rectangle(left - 20, road_y, W * s + 40, 34); D.paint(c, '#E7E5DF'); c.fill()
    D.text(c, left + W * s / 2, road_y + 23, 'ROAD · NORTH', 16, '#33454C', True)
    title = {'ground': 'Ground floor', 'first': 'First floor'}[floor]
    D.text(c, 60, 70, f'{title} plan', 30, '#1E2A30', True, False)
    D.text(c, 60, 104, 'Open living, dining and kitchen · double-height living hall · 40\'-0" × 60\'-0" plot · North-facing', 16, '#5B6B72', False, False)
    D.text(c, 60, HPX - 40, 'Look-development prototype · preliminary concept · not for construction', 14, '#7B898F', False, False)
    surface.write_to_png(str(path_png))
    TIMES[path_png.name] = round(time.perf_counter() - t, 3)


# ---------------------------------------------------------------- B. plan-oblique top view
A_, B_, CUT = .22, .42, 4.0
VIEW = (-A_, -B_, 1.0)


def face_shade(colour, normal, light=(-.55, -.65, .52)):
    nx, ny, nz = normal
    if abs(nz) > .5:
        return colour
    if nx * VIEW[0] + ny * VIEW[1] < 0:
        nx, ny = -nx, -ny
    lam = max(0., -(nx * light[0] + ny * light[1]))
    return mix(colour, '#22303A', .26 * (1 - lam))


def solids_of(m, z0=0.):
    out_ = []
    for f in m['architecture']['fixtures']:
        for obj in f['solids']:
            z, h = obj['z'], obj['height']
            if f['kind'] == 'stair':
                th = min(h, .45); z, h = z + h - th, th
            top = min(z + h, CUT if f['kind'] != 'stair' else z + h)
            if f['kind'] == 'stair' and z > CUT:
                continue
            if top > z:
                tone = {'stair': '#E4DCCB'}.get(f['kind'], {'linen': '#EEEAE2', 'wood': '#C9AE8E', 'metal': '#B9C8CB', 'plant': '#8FAF86', 'pillow': '#F6F3EC'}.get(obj['tone'], '#DCD3C5'))
                out_.append((obj['points'], z0 + z, top - z, tone, None))
    walls = m['architecture']['walls']
    opens = [('door', o) for o in m['architecture']['doors']] + [('window', o) for o in m['architecture']['windows']]
    for w in walls:
        a, b = w['a'], w['b']; L = math.dist(a, b); dx, dy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        marks, cuts, line = [0., L], [], LineString([a, b])
        for k, o in opens:
            if line.intersection(LineString([o['a'], o['b']])).length < .01:
                continue
            lo, hi = sorted((line.project(Point(o['a'])), line.project(Point(o['b']))))
            marks += [max(0., lo), min(L, hi)]; cuts.append((lo, hi, k, o))
        marks = sorted(set(marks)); t = w['thickness'] / 2
        for lo, hi in zip(marks, marks[1:]):
            hit = next(((k, o) for x, y, k, o in cuts if x - .001 <= (lo + hi) / 2 <= y + .001), None)
            pa, pb = (a[0] + dx * lo, a[1] + dy * lo), (a[0] + dx * hi, a[1] + dy * hi)
            pts = [(pa[0] - dy * t, pa[1] + dx * t), (pb[0] - dy * t, pb[1] + dx * t), (pb[0] + dy * t, pb[1] - dx * t), (pa[0] + dy * t, pa[1] - dx * t)]
            if hit and hit[0] == 'door':
                continue
            if hit and hit[0] == 'window':
                out_.append((pts, z0, hit[1]['sill'], '#F4F2EC', None))
                thin = [(pa[0] - dy * .05, pa[1] + dx * .05), (pb[0] - dy * .05, pb[1] + dx * .05), (pb[0] + dy * .05, pb[1] - dx * .05), (pa[0] + dy * .05, pa[1] - dx * .05)]
                out_.append((thin, z0 + hit[1]['sill'], CUT - hit[1]['sill'], '#C3D8DB', None))
                continue
            out_.append((pts, z0, CUT, '#F2EFE9', '#2A353C'))
    for d in m['architecture']['doors']:
        out_.append((d['leafPolygon'], z0, min(DOOR_HEAD, CUT), '#C4AA86', None))
    for w in m['architecture'].get('rails', []):
        a, b = w['a'], w['b']; L = math.dist(a, b); nx, ny = -(b[1] - a[1]) / L * .05, (b[0] - a[0]) / L * .05
        out_.append(([(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny), (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)], z0, 3.5, '#B8D2D6', '#3A464C'))
    return out_


def draw_top(m, floor, path_png, below=None):
    t = time.perf_counter()
    WPX, HPX = 2400, 1600
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, WPX, HPX)
    c = cairo.Context(surface)
    D.paint(c, '#F7F6F2'); c.paint()
    s = min((WPX - 300) / (W + A_ * CUT), (HPX - 260) / (DEPTH + B_ * CUT))
    ox = (WPX - (W + A_ * CUT) * s) / 2; oy = 120 + (HPX - 260 - (DEPTH + B_ * CUT) * s) / 2 + DEPTH * s

    def point(x, y, z=0.):
        return ox + (x + A_ * z) * s, oy - (y + B_ * z) * s
    path_ = lambda pts: (c.new_path(), [(c.move_to if i == 0 else c.line_to)(*point(*p)) for i, p in enumerate(pts)], c.close_path())
    c.new_path(); [(c.move_to if i == 0 else c.line_to)(*point(*p)) for i, p in enumerate([(0, 0), (W, 0), (W, DEPTH), (0, DEPTH)])]; c.close_path()
    D.paint(c, '#EFEEE8'); c.fill()
    # Ground floor seen through the void, one storey down and a little darker.
    if below is not None and floor == 'first':
        c.save(); c.new_path(); fill_path = [point(x, y) for x, y in VOID.exterior.coords]
        c.move_to(*fill_path[0]); [c.line_to(*p) for p in fill_path[1:]]; c.close_path(); c.clip()
        for room in below['rooms']:
            for poly in room['polygons']:
                D.paint(c, mix(zone_fill(room), '#41505A', .28)); fill_poly(c, poly, point, -10.)
        for pts, z, h, tone, top in sorted(solids_of(below, -10.), key=lambda s_: -min(p[1] for p in s_[0])):
            path_([(p[0], p[1], z + h) for p in pts]) if False else None
            c.new_path(); [(c.move_to if i == 0 else c.line_to)(*point(p[0], p[1], z + h)) for i, p in enumerate(pts)]; c.close_path()
            D.paint(c, mix(tone if top is None else top, '#41505A', .3)); c.fill()
        c.restore()
    for room in m['rooms']:
        for poly in room['polygons']:
            k = room['kind']; tone = zone_fill(room)
            if not room['outdoor'] and k in ('bed', 'master', 'icu'):
                tone = '#E9DCC9'
            D.paint(c, tone); fill_poly(c, poly, point)
            if room['outdoor']:
                continue
            c.save(); c.new_path()
            for i, (x, y) in enumerate(poly.exterior.coords):
                (c.move_to if i == 0 else c.line_to)(*point(x, y))
            c.close_path(); c.clip()
            x1, y1, x2, y2 = poly.bounds
            step = .55 if k in ('bed', 'master', 'icu') else 1.0 if k == 'bath' else 2.0
            line_col = '#DCCBB3' if k in ('bed', 'master', 'icu') else mix(tone, '#9AA3A6', .18)
            yy = y1
            while yy < y2:
                D.stroke(c, [point(x1, yy), point(x2, yy)], line_col, .6); yy += step
            if k not in ('bed', 'master', 'icu'):
                xx = x1
                while xx < x2:
                    D.stroke(c, [point(xx, y1), point(xx, y2)], line_col, .6); xx += step
            c.restore()
    solids = solids_of(m)
    # Soft shadows: shadow hulls into a mask, blurred, multiplied onto the floors.
    mask = cairo.ImageSurface(cairo.FORMAT_A8, WPX, HPX); mc = cairo.Context(mask)
    floor_area = unary_union([p for r in m['rooms'] for p in r['polygons']])
    hulls = [MultiPoint([*pts, *[(x + .45 * (z + h), y + .6 * (z + h)) for x, y in pts]]).convex_hull for pts, z, h, _, _ in solids if z + h > .1]
    shade = unary_union(hulls).intersection(floor_area) if hulls else Polygon()
    mc.set_source_rgba(0, 0, 0, 1); fill_poly(mc, shade, point)
    blur(mask, 7)
    c.set_source_rgba(.12, .15, .17, .24); c.mask_surface(mask, 0, 0)
    faces = []
    for pts, z, h, tone, top in solids:
        for a, b in zip(pts, pts[1:] + pts[:1]):
            faces.append(([(a[0], a[1], z), (b[0], b[1], z), (b[0], b[1], z + h), (a[0], a[1], z + h)], tone, True))
        faces.append(([(p[0], p[1], z + h) for p in pts], top or tone, top is None))
    for pts, tone, lit in D.ordered_faces(faces, VIEW):
        colour = face_shade(tone, D.face_normal(pts)) if lit else tone
        c.new_path(); [(c.move_to if i == 0 else c.line_to)(*point(*p)) for i, p in enumerate(pts)]; c.close_path()
        D.paint(c, colour); c.fill_preserve(); D.paint(c, mix(colour, '#1B2629', .08)); c.set_line_width(.45); c.stroke()
    for room in m['rooms']:
        x1, y1, x2, y2 = room['labelBounds']
        name = room['room'].split(' + ')[0].split(' /')[0].replace('1F ', '').upper()
        D.halo_text(c, *point((x1 + x2) / 2, (y1 + y2) / 2, .2), name, 17, '#24323A', '#F7F6F2', True, 3.4)
    if floor == 'first':
        D.halo_text(c, *point(VOID.centroid.x, VOID.centroid.y, .2), 'OPEN TO BELOW', 15, '#24323A', '#F7F6F2', True, 3.4)
    D.text(c, 70, 70, {'ground': 'Ground floor', 'first': 'First floor'}[floor] + ' · top view', 30, '#1E2A30', True, False)
    D.text(c, 70, HPX - 46, 'Road at the bottom · walls cut at 4\'-0" · look-development prototype', 17, '#6B7A80', False, False)
    surface.write_to_png(str(path_png))
    TIMES[path_png.name] = round(time.perf_counter() - t, 3)


# ---------------------------------------------------------------- C. perspective exterior
P_, H_, SLAB = 1.5, 10.0, .45
PLASTER, STONE, TIMBER, FRAME, GLASS, ROOFC = '#F1EFEA', '#8A8883', '#7A5234', '#1D2022', '#A9C3C8', '#ECEBE6'


class Cam:
    def __init__(self, eye, target):
        self.e = np.array(eye, float)
        f = np.array(target, float) - self.e; f[2] = 0; self.f = f / np.linalg.norm(f)
        self.r = np.array([self.f[1], -self.f[0], 0.]); self.u = np.array([0., 0., 1.])
        self.y0 = self.raw(target)[1]; self.k, self.cx, self.cy = 1., 0., 0.

    def raw(self, p):
        d = np.asarray(p, float) - self.e; depth = d @ self.f
        return (d @ self.r) / depth, (d @ self.u) / depth

    def __call__(self, x, y, z=0.):
        a, b = self.raw((x, y, z))
        return self.cx + a * self.k, self.cy - (b - self.y0) * self.k

    def depth(self, p):
        return (np.asarray(p, float) - self.e) @ self.f


def order_faces(faces, eye):
    if not faces:
        return
    planes = [sorted({f[0][0][ax] for f in faces if all(abs(p[ax] - f[0][0][ax]) < 1e-7 for p in f[0])}) for ax in range(3)]
    ax = max(range(3), key=lambda i: len(planes[i]))
    if not planes[ax]:
        yield from sorted(faces, key=lambda f: -sum(np.linalg.norm(np.array(p) - eye) for p in f[0]) / len(f[0]))
        return
    plane = planes[ax][len(planes[ax]) // 2]
    low, same, high = [], [], []
    for face in faces:
        pts, rest = face[0], face[1:]
        ds = [p[ax] - plane for p in pts]
        if max(ds) < 1e-7 and min(ds) > -1e-7:
            same.append(face)
        elif max(ds) <= 1e-7:
            low.append(face)
        elif min(ds) >= -1e-7:
            high.append(face)
        else:
            halves = ([], [])
            for a, b in zip(pts, pts[1:] + pts[:1]):
                da, db = a[ax] - plane, b[ax] - plane
                if da <= 1e-7: halves[0].append(a)
                if da >= -1e-7: halves[1].append(a)
                if da * db < 0:
                    t_ = da / (da - db); x = tuple(a[i] + t_ * (b[i] - a[i]) for i in range(3))
                    halves[0].append(x); halves[1].append(x)
            low.append((halves[0], *rest)); high.append((halves[1], *rest))
    far, near = (low, high) if eye[ax] > plane else (high, low)
    yield from order_faces(far, eye); yield from same; yield from order_faces(near, eye)


def wall_faces(poly, z0, z1, windows, tall, faces, eye, colour=PLASTER):
    """Outer wall faces of a footprint with window holes, glass, and full-height glazing spans."""
    for ring in [poly.exterior]:
        coords = list(ring.coords)
        if not Polygon(coords).exterior.is_ccw:
            coords = coords[::-1]
        for a, b in zip(coords, coords[1:]):
            L = math.dist(a, b)
            if L < .05:
                continue
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L; n = (uy, -ux, 0.)  # outward for a CCW ring
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if (eye[0] - mid[0]) * n[0] + (eye[1] - mid[1]) * n[1] <= 0:
                continue
            line = LineString([a, b]); cuts = []
            for w in windows:
                seg = LineString([w['a'], w['b']])
                if line.distance(seg) < .45 and seg.length > .1:
                    lo, hi = sorted((line.project(Point(w['a'])), line.project(Point(w['b']))))
                    cuts.append((lo, hi, w.get('sill', 3.) + z0 - P_ if w.get('kind') != 'door' else z0, w.get('head', 7.) + z0 - P_ if w.get('kind') != 'door' else z0 + DOOR_HEAD, w.get('kind')))
            for g in tall:
                inter = line.intersection(g)
                if inter.length > .5:
                    lo, hi = sorted((line.project(Point(inter.coords[0])), line.project(Point(inter.coords[-1]))))
                    cuts.append((lo + .5, hi - .5, z0 + .3, z1 - .5, 'tall'))
            marks = sorted({0., L, *[c_[0] for c_ in cuts], *[c_[1] for c_ in cuts]})
            P = lambda d, z: (a[0] + ux * d, a[1] + uy * d, z)
            for lo, hi in zip(marks, marks[1:]):
                if hi - lo < 1e-4:
                    continue
                hit = next((c_ for c_ in cuts if c_[0] - 1e-4 <= (lo + hi) / 2 <= c_[1] + 1e-4), None)
                spans = [(z0, z1)] if not hit else [(z0, hit[2]), (hit[3], z1)]
                for zz0, zz1 in spans:
                    if zz1 - zz0 > 1e-3:
                        faces.append(([P(lo, zz0), P(hi, zz0), P(hi, zz1), P(lo, zz1)], colour, 'wall', n))
                if hit:
                    inset = -.25
                    q = lambda d, z: (a[0] + ux * d - n[0] * .25, a[1] + uy * d - n[1] * .25, z)
                    kind = 'door' if hit[4] == 'door' else 'glass'
                    faces.append(([q(lo, hit[2]), q(hi, hit[2]), q(hi, hit[3]), q(lo, hit[3])], TIMBER if kind == 'door' else GLASS, kind, n))
                    for d_, sgn in ((lo, 1), (hi, -1)):  # jambs, so every opening has depth
                        faces.append(([P(d_, hit[2]), q(d_, hit[2]), q(d_, hit[3]), P(d_, hit[3])], mix(colour, '#000000', .12), 'reveal', (ux * sgn, uy * sgn, 0.)))
                    # reveal sill and head, so openings have depth
                    faces.append(([P(lo, hit[2]), P(hi, hit[2]), q(hi, hit[2]), q(lo, hit[2])], mix(colour, '#000000', .05), 'reveal', (0, 0, 1)))
                    faces.append(([P(lo, hit[3]), P(hi, hit[3]), q(hi, hit[3]), q(lo, hit[3])], mix(colour, '#000000', .18), 'reveal', (0, 0, -1)))


def prism_faces(poly, z0, z1, colour, faces, eye, top=None, kind='solid'):
    coords = list(poly.exterior.coords)
    if not Polygon(coords).exterior.is_ccw:
        coords = coords[::-1]
    for a, b in zip(coords, coords[1:]):
        L = math.dist(a, b)
        if L < .05:
            continue
        n = ((b[1] - a[1]) / L, -(b[0] - a[0]) / L, 0.)
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if (eye[0] - mid[0]) * n[0] + (eye[1] - mid[1]) * n[1] <= 0:
            continue
        faces.append(([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], colour, kind, n))
    if eye[2] > z1:
        faces.append(([(x, y, z1) for x, y in coords[:-1]], top or colour, kind + '-top', (0, 0, 1)))


def draw_exterior(models, preset, path_png):
    t = time.perf_counter()
    gm, fm = models
    gfp = unary_union([r['shape'] for r in gm['rooms'] if not r['outdoor']])
    ffr = unary_union([r['shape'] for r in fm['rooms'] if not r['outdoor']])
    ffe = unary_union([ffr, VOID])
    terrace = unary_union([r['shape'] for r in fm['rooms'] if r['outdoor']])
    z_ff, z_roof = P_ + H_, P_ + 2 * H_
    centre = (W / 2, (gfp.bounds[1] + gfp.bounds[3]) / 2, 9.)
    az = math.radians(38)
    sx, sy = {'front-left': (-1, -1), 'front-right': (1, -1), 'back-left': (-1, 1), 'back-right': (1, 1)}[preset]
    R, EZ = 92., 34.
    eye = (centre[0] + sx * R * math.sin(az), centre[1] + sy * R * math.cos(az), EZ)
    cam = Cam(eye, centre)
    WPX, HPX = 2400, 1500
    # Light from the camera's left, high: every preset reads, as in architectural photography.
    lx, ly = -cam.r[0] * .55 - cam.f[0] * .35, -cam.r[1] * .55 - cam.f[1] * .35
    LIGHT = np.array([lx, ly, .78]); LIGHT /= np.linalg.norm(LIGHT)
    faces = []
    tall_front = [seg for seg in parts(VOID.boundary.intersection(ffe.boundary)) if seg.length > .5]
    g_windows = [w for w in gm['architecture']['windows']] + [{'a': d['a'], 'b': d['b'], 'kind': 'door'} for d in gm['architecture']['doors'] if d['type'] in ('main', 'exterior')]
    g_windows = [w for w in g_windows if not any(LineString([w['a'], w['b']]).distance(seg) < .45 for seg in tall_front)]
    f_windows = list(fm['architecture']['windows']) + [{'a': d['a'], 'b': d['b'], 'kind': 'door'} for d in fm['architecture']['doors'] if d['type'] in ('main', 'exterior')]
    prism_faces(gfp.buffer(.25, join_style=2), 0., P_, STONE, faces, eye, top='#D9D6CF', kind='plinth')
    wall_faces(gfp, P_, z_ff, g_windows, tall_front, faces, eye)
    wall_faces(ffe, z_ff, z_roof, f_windows, tall_front, faces, eye)
    # Floor band between storeys and the floating roof slab with a recessed shadow line.
    exposed = gfp.difference(ffe)
    band = gfp.buffer(.35, join_style=2)
    prism_faces(band.difference(ffe.buffer(-.01)) if not exposed.is_empty else band, z_ff - .05, z_ff + .5, '#F7F6F2', faces, eye, top='#E3E1DA', kind='slab')
    roof = ffe.buffer(1.5, join_style=2).intersection(box(0, 0, W, DEPTH))
    prism_faces(roof, z_roof, z_roof + .7, '#FAFAF8', faces, eye, top=ROOFC, kind='slab')
    prism_faces(ffe.buffer(-.2, join_style=2), z_roof - .2, z_roof, '#2A2F33', faces, eye, kind='shadowline')
    # Glass balustrades on the roof edge and around the first-floor terrace.
    for poly_, zr in ((roof.buffer(-.3, join_style=2), z_roof + .7), (terrace, z_ff + .5)):
        for p in parts(poly_):
            coords = list(p.exterior.coords)
            for a, b in zip(coords, coords[1:]):
                if math.dist(a, b) > .3:
                    faces.append(([(a[0], a[1], zr), (b[0], b[1], zr), (b[0], b[1], zr + 3.4), (a[0], a[1], zr + 3.4)], '#C9DDE0', 'rail', (0., 0., 0.)))
    # Stair headroom tower over the stair hall, stone clad, and the entrance canopy.
    stair = next(r for r in fm['rooms'] if r['roomId'] == 'ff_stairLanding')['shape'].buffer(-.4, join_style=2)
    prism_faces(stair, z_roof + .7, z_roof + 8.5, STONE, faces, eye, top=ROOFC, kind='tower')
    main = next((d for d in gm['architecture']['doors'] if d['type'] == 'main'), None)
    if main:
        (ax, ay), (bx, by) = main['a'], main['b']; n = main['normal']
        canopy = box(min(ax, bx) - 1.5, min(ay, by) - 4.0, max(ax, bx) + 1.5, max(ay, by)) if n[1] > 0 else box(min(ax, bx) - 1.5, min(ay, by), max(ax, bx) + 1.5, max(ay, by) + 4)
        prism_faces(canopy, P_ + 8.3, P_ + 8.8, TIMBER, faces, eye, top='#3B3F42', kind='canopy')
    # Compound wall with a stone base, open at the gate.
    gate_x = {'Left': W * .125, 'Center': W * .5, 'Right': W * .875}[spec['plot']['gate']]
    for seg in (LineString([(0, 0), (gate_x - 2.5, 0)]), LineString([(gate_x + 2.5, 0), (W, 0)]), LineString([(0, 0), (0, DEPTH)]), LineString([(W, 0), (W, DEPTH)]), LineString([(0, DEPTH), (W, DEPTH)])):
        base = seg.buffer(.35, cap_style=2, join_style=2)
        prism_faces(base, 0., 1.1, STONE, faces, eye, top='#7D7B76', kind='cwall')
        prism_faces(seg.buffer(.25, cap_style=2, join_style=2), 1.1, 3.4, '#EEECE6', faces, eye, top='#3A3F42', kind='cwall')
    ordered = list(order_faces(faces, np.array(eye)))
    # Fit the frame to the house.
    pts = [p for f in faces if f[2] in ('wall', 'slab', 'tower', 'plinth') for p in f[0]]
    xs, ys = zip(*[cam(*p) for p in pts])
    k = min((WPX * .78) / (max(xs) - min(xs)), (HPX * .74) / (max(ys) - min(ys)))
    cam.k = k; xs, ys = zip(*[cam(*p) for p in pts])
    cam.cx = WPX / 2 - (min(xs) + max(xs)) / 2; cam.cy = HPX * .5 - (min(ys) + max(ys)) / 2 + HPX * .04
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, WPX, HPX)
    c = cairo.Context(surface)
    horizon = cam.cy + cam.y0 * cam.k
    sky = cairo.LinearGradient(0, 0, 0, horizon)
    sky.add_color_stop_rgb(0, *rgb('#C6D6E3')); sky.add_color_stop_rgb(1, *rgb('#EEF1F1'))
    c.rectangle(0, 0, WPX, horizon); c.set_source(sky); c.fill()
    ground = cairo.LinearGradient(0, horizon, 0, HPX)
    ground.add_color_stop_rgb(0, *rgb('#D9DDD3')); ground.add_color_stop_rgb(1, *rgb('#C3C9BB'))
    c.rectangle(0, horizon, WPX, HPX - horizon); c.set_source(ground); c.fill()
    near = box(-400, -400, 400, 400)
    hp = Polygon([(eye[0] + cam.f[0] * 8 + cam.r[0] * 900, eye[1] + cam.f[1] * 8 + cam.r[1] * 900),
                  (eye[0] + cam.f[0] * 8 - cam.r[0] * 900, eye[1] + cam.f[1] * 8 - cam.r[1] * 900),
                  (eye[0] + cam.f[0] * 900 - cam.r[0] * 900, eye[1] + cam.f[1] * 900 - cam.r[1] * 900),
                  (eye[0] + cam.f[0] * 900 + cam.r[0] * 900, eye[1] + cam.f[1] * 900 + cam.r[1] * 900)])
    visible = near.intersection(hp)

    def flat(poly, colour, z=0.):
        clipped = poly.intersection(visible)
        if not clipped.is_empty:
            D.paint(c, colour); fill_poly(c, clipped, cam, z)
    flat(box(-200, -26, W + 200, -6), '#6A6F71'); flat(box(-200, -6, W + 200, 0), '#CFCDC6')
    flat(box(0, 0, W, DEPTH), '#D6D3CA')
    for r in gm['rooms']:
        if r['outdoor']:
            flat(r['shape'], '#A2B58E' if r['kind'] == 'green' else '#CBC7BE')
    if main:
        mx_ = (main['a'][0] + main['b'][0]) / 2
        flat(box(min(gate_x, mx_) - 2, 0, max(gate_x, mx_) + 2, min(main['a'][1], main['b'][1])), '#E1DED6')
    # Soft cast shadows and contact shading on the ground.
    sun_dx, sun_dy = -LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2]
    def cast(poly, z0, z1):
        p0, p1 = translate(poly, sun_dx * z0, sun_dy * z0), translate(poly, sun_dx * z1, sun_dy * z1)
        sweep = [Polygon([a, b, (b[0] + sun_dx * (z1 - z0), b[1] + sun_dy * (z1 - z0)), (a[0] + sun_dx * (z1 - z0), a[1] + sun_dy * (z1 - z0))]).buffer(0)
                 for ring in parts(poly) for a, b in zip(list(ring.exterior.coords), list(ring.exterior.coords)[1:])]
        sw = [translate(s_, sun_dx * z0, sun_dy * z0) for s_ in sweep]
        return unary_union([p0, p1, *sw])
    shadow = unary_union([cast(gfp, 0, z_ff), cast(ffe, z_ff, z_roof), cast(roof, z_roof, z_roof + .7), cast(stair, z_roof, z_roof + 8.5)]).intersection(visible)
    mask = cairo.ImageSurface(cairo.FORMAT_A8, WPX, HPX); mc = cairo.Context(mask)
    mc.set_source_rgba(0, 0, 0, .85); fill_poly(mc, shadow, cam)
    mc.set_source_rgba(0, 0, 0, 1); fill_poly(mc, gfp.buffer(1.2, join_style=2).difference(gfp).intersection(visible), cam)
    blur(mask, 9)
    c.set_source_rgba(.14, .16, .19, .42); c.mask_surface(mask, 0, 0)
    # Trees: few, soft, only in the garden areas and never in front of the facade.
    trees = [(6., DEPTH - 6.), (W - 7., DEPTH - 6.5), (W / 2, DEPTH - 4.)]
    def tree(x, y):
        bx_, by_ = cam(x, y, 0); tx_, ty_ = cam(x, y, 14.)
        r_ = abs(ty_ - by_) * .38
        c.set_source_rgba(*rgb('#5D5145'), 1); c.set_line_width(max(2., r_ * .09)); c.move_to(bx_, by_); c.line_to(tx_, ty_ + r_ * .4); c.stroke()
        for dx_, dy_, rr, col, al in ((0, 0, 1., '#6F8B62', .92), (-.35, .18, .7, '#7E9A6F', .85), (.32, .2, .66, '#87A377', .8), (.05, -.25, .62, '#97B086', .75)):
            c.new_path(); c.arc(tx_ + dx_ * r_, ty_ + dy_ * r_, rr * r_, 0, math.tau); c.set_source_rgba(*rgb(col), al); c.fill()
    house_depth = cam.depth(centre)
    behind = [p for p in trees if cam.depth((*p, 0)) > house_depth]
    for p in behind:
        tree(*p)
    for pts, colour, kind, n in ordered:
        nrm = np.array(n, float); lam = max(0., float(nrm @ LIGHT)) if kind not in ('glass',) else .55
        k_ = .66 + .34 * lam
        base = colour if kind != 'glass' else GLASS
        shade_ = mix(base, '#1F2A33', 1 - k_) if kind not in ('shadowline',) else colour
        proj = [cam(*p) for p in pts]
        c.new_path(); c.move_to(*proj[0]); [c.line_to(*p) for p in proj[1:]]; c.close_path()
        if kind == 'glass':
            ys_ = [p[1] for p in proj]; g = cairo.LinearGradient(0, min(ys_), 0, max(ys_))
            g.add_color_stop_rgb(0, *rgb('#D8E6EA')); g.add_color_stop_rgb(.45, *rgb('#9DB8BE')); g.add_color_stop_rgb(1, *rgb('#4F6A72'))
            c.set_source(g); c.fill_preserve(); D.paint(c, FRAME); c.set_line_width(2.4); c.stroke()
            # glazing bars: mullions about every 4 ft and a transom at each floor line
            (x0_, y0_, z0_), (x1_, y1_, _), (_, _, z1_) = pts[0], pts[1], pts[2]
            span = math.dist((x0_, y0_), (x1_, y1_)); bars = max(0, int(span // 4))
            for i in range(1, bars + 1):
                f_ = i / (bars + 1); bx_, by_ = x0_ + (x1_ - x0_) * f_, y0_ + (y1_ - y0_) * f_
                c.move_to(*cam(bx_, by_, z0_)); c.line_to(*cam(bx_, by_, z1_)); c.set_line_width(1.6); c.stroke()
            if z1_ - z0_ > 12:
                zt = P_ + H_
                c.move_to(*cam(x0_, y0_, zt)); c.line_to(*cam(x1_, y1_, zt)); c.set_line_width(3.0); c.stroke()
            continue
        if kind == 'rail':
            c.set_source_rgba(*rgb('#C2D8DC'), .34); c.fill()
            c.move_to(*proj[3]); c.line_to(*proj[2]); D.paint(c, '#2B3236'); c.set_line_width(2.2); c.stroke()
            c.move_to(*proj[0]); c.line_to(*proj[1]); D.paint(c, '#2B3236'); c.set_line_width(3.2); c.stroke(); continue
        D.paint(c, shade_); c.fill_preserve()
        if kind in ('wall', 'reveal'):
            D.paint(c, shade_); c.set_line_width(.6); c.stroke()   # seal seams between strips, no outlines
        else:
            D.paint(c, mix(shade_, '#1B2629', .1)); c.set_line_width(.7); c.stroke()
        if kind == 'wall':  # soffit shadow under slabs and bands
            ys_ = [p[1] for p in proj]; top_y = min(ys_)
            g = cairo.LinearGradient(0, top_y, 0, top_y + (max(ys_) - top_y) * .22)
            g.add_color_stop_rgba(0, .1, .12, .14, .22); g.add_color_stop_rgba(1, .1, .12, .14, 0)
            c.new_path(); c.move_to(*proj[0]); [c.line_to(*p) for p in proj[1:]]; c.close_path(); c.set_source(g); c.fill()
    for p in trees:
        if p not in behind:
            tree(*p)
    D.text(c, 60, HPX - 40, {'front-left': 'Front left', 'front-right': 'Front right', 'back-left': 'Back left', 'back-right': 'Back right'}[preset] + ' · look-development prototype · proposed materials', 22, '#5C6A70', False, False)
    surface.write_to_png(str(path_png))
    TIMES[path_png.name] = round(time.perf_counter() - t, 3)
    return len(faces), len(ordered)


t0 = time.perf_counter()
data = normalise(source_map())
gm = open_plan(build(data, 'ground'), 'ground')
fm = open_plan(build(data, 'first', gm['architecture'].get('stair')), 'first')
TIMES['model_both_floors'] = round(time.perf_counter() - t0, 3)
draw_plan(gm, 'ground', out / 'ld_plan_ground.png')
draw_plan(fm, 'first', out / 'ld_plan_first.png')
draw_top(gm, 'ground', out / 'ld_top_ground.png')
draw_top(fm, 'first', out / 'ld_top_first.png', below=gm)
counts = {}
for preset in ('front-left', 'front-right', 'back-left', 'back-right'):
    counts[preset] = draw_exterior((gm, fm), preset, out / f'ld_ext_{preset}.png')
print(json.dumps({'seconds': TIMES, 'faces_built_vs_drawn': counts,
                  'peak_rss_mb': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576, 1)}, indent=1))
