"""The outside of the house: one perspective view with four named presets (IMPLEMENTATION_PLAN.md §6.4).

Built entirely from the PlanModel: indoor footprints extruded per floor on a stone plinth,
exterior doors and windows at their model positions, sills and heads; the double-height void's
tall glazing with a transom at the floor line and no floor band across it; a floating roof slab
with a glass balustrade; the stair's headroom cabin; a timber canopy and steps at the main door;
proposed columns under first-floor overhangs; parapets or glass rails on terraces; the compound
wall open at the gate. The camera stands in its named quadrant, about 40 degrees off the
front-back axis and 22 degrees up, and keeps verticals vertical (two-point perspective). The
sun comes from the camera's left, high. Materials are flat colours with a few projected lines;
shadows are exact projections onto the ground, softened by a blurred mask. A still image only:
no orbit, dragging or animation. An architectural illustration, not a photographic render.
"""
from __future__ import annotations

import io
import math

import cairo
import numpy as np
from shapely.affinity import translate
from shapely.geometry import LineString, Point, Polygon, box

import compass_geometry as geometry
import compass_text as text
from compass_plan2d import THEMES, gate_span, mix, rgb
from compass_resources import checkpoint
from compass_standards import DOOR_HEAD, MUMTY, PLINTH, STOREY

U = geometry.U
PRESETS = {'front-left': ('Front left', -1, -1), 'front-right': ('Front right', 1, -1),
           'back-left': ('Back left', -1, 1), 'back-right': ('Back right', 1, 1)}
PLASTER, STONE, TIMBER, FRAME, GLASS, ROOF = '#F1EFEA', '#8A8883', '#7A5234', '#1D2022', '#AEC8CC', '#ECEBE6'
SLAB_T, ROOF_T, OVERHANG, ROAD_OVERHANG = .45, .7, 1.5, 3.25
MAX_FACES, MAX_PIECES = 4000, 12000


class Camera:
    """A horizontal view direction with a lens shift: vertical lines stay vertical."""

    def __init__(self, eye, target):
        self.e = np.array(eye, float)
        f = np.array(target, float) - self.e
        f[2] = 0
        self.f = f / np.linalg.norm(f)
        self.r = np.array([self.f[1], -self.f[0], 0.])
        self.u = np.array([0., 0., 1.])
        self.y0 = self.raw(target)[1]
        self.k, self.cx, self.cy = 1., 0., 0.

    def raw(self, p):
        d = np.asarray(p, float) - self.e
        depth = d @ self.f
        return (d @ self.r) / depth, (d @ self.u) / depth

    def __call__(self, x, y, z=0.):
        a, b = self.raw((x, y, z))
        return self.cx + a * self.k, self.cy - (b - self.y0) * self.k

    def depth(self, p):
        return float((np.asarray(p, float) - self.e) @ self.f)


def order_faces(faces, eye, budget):
    """Back-to-front for a perspective eye: split at existing axis planes (orthogonal architecture)."""
    if not faces:
        return
    planes = [sorted({f[0][0][ax] for f in faces if all(abs(p[ax] - f[0][0][ax]) < 1e-7 for p in f[0])}) for ax in range(3)]
    ax = max(range(3), key=lambda i: len(planes[i]))
    if not planes[ax] or budget[0] > MAX_PIECES:
        yield from sorted(faces, key=lambda f: -sum(math.dist(p, eye) for p in f[0]) / len(f[0]))
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
                if da <= 1e-7:
                    halves[0].append(a)
                if da >= -1e-7:
                    halves[1].append(a)
                if da * db < 0:
                    t = da / (da - db)
                    x = tuple(a[i] + t * (b[i] - a[i]) for i in range(3))
                    halves[0].append(x)
                    halves[1].append(x)
            low.append((halves[0], *rest))
            high.append((halves[1], *rest))
            budget[0] += 1
    far, near = (low, high) if eye[ax] > plane else (high, low)
    yield from order_faces(far, eye, budget)
    yield from same
    yield from order_faces(near, eye, budget)


def _ft(geom):
    return geometry._scale(geom, 1 / U)


def _ccw(poly):
    coords = list(poly.exterior.coords)
    return coords if Polygon(coords).exterior.is_ccw else coords[::-1]


class Scene:
    def __init__(self, eye, detail=True):
        self.eye = eye
        self.faces = []
        self.detail = detail

    def add(self, pts, colour, kind, normal, plane=None):
        self.faces.append((pts, colour, kind, normal, plane))

    def facing(self, a, b, n):
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        return (self.eye[0] - mid[0]) * n[0] + (self.eye[1] - mid[1]) * n[1] > 0

    def prism(self, poly, z0, z1, colour, kind='solid', top=None):
        for part in geometry.parts(poly):
            if part.geom_type != 'Polygon' or part.area <= 0:
                continue
            coords = _ccw(part)
            for a, b in zip(coords, coords[1:]):
                length = math.dist(a, b)
                if length < .05:
                    continue
                n = ((b[1] - a[1]) / length, -(b[0] - a[0]) / length, 0.)
                if self.facing(a, b, n):
                    self.add([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], colour, kind, n)
            if self.eye[2] > z1:
                self.add([(x, y, z1) for x, y in coords[:-1]], top or colour, kind + '-top', (0, 0, 1))

    def walls(self, poly, z0, z1, openings, colour=PLASTER, band=None):
        """Outer faces of a footprint between z0 and z1, with recessed openings (jambs, sill and head reveals).

        Collinear outline vertices are merged first, so one facade is one plane with one tone."""
        for part in geometry.parts(poly):
            if part.geom_type != 'Polygon':
                continue
            part = part.simplify(.01, preserve_topology=True)
            coords = _ccw(part)
            for a, b in zip(coords, coords[1:]):
                length = math.dist(a, b)
                if length < .05:
                    continue
                ux, uy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
                n = (uy, -ux, 0.)
                if not self.facing(a, b, n):
                    continue
                line = LineString([a, b])
                cuts = []
                for o in openings:
                    seg = LineString(o['line'])
                    if line.distance(seg) < .05 and seg.length > .1 and line.buffer(.05).covers(seg):
                        lo, hi = sorted((line.project(Point(o['line'][0])), line.project(Point(o['line'][1]))))
                        cuts.append((lo, hi, max(z0, o['z0']), min(z1, o['z1']), o['kind']))
                marks = sorted({0., length, *[c[0] for c in cuts], *[c[1] for c in cuts]})
                P = lambda d, z: (a[0] + ux * d, a[1] + uy * d, z)
                plane = (round(a[0], 3), round(a[1], 3), round(b[0], 3), round(b[1], 3), z0, z1)
                for lo, hi in zip(marks, marks[1:]):
                    if hi - lo < 1e-4:
                        continue
                    hit = next((c for c in cuts if c[0] - 1e-4 <= (lo + hi) / 2 <= c[1] + 1e-4), None)
                    spans = [(z0, z1)] if not hit else [(z0, hit[2]), (hit[3], z1)]
                    for s0, s1 in spans:
                        if s1 - s0 > 1e-3:
                            self.add([P(lo, s0), P(hi, s0), P(hi, s1), P(lo, s1)], colour, 'wall', n, plane)
                    if hit:
                        depth = .25
                        q = lambda d, z: (a[0] + ux * d - n[0] * depth, a[1] + uy * d - n[1] * depth, z)
                        kind = 'door' if hit[4] in ('main', 'door') else 'glass'
                        self.add([q(lo, hit[2]), q(hi, hit[2]), q(hi, hit[3]), q(lo, hit[3])],
                                 TIMBER if kind == 'door' else GLASS, kind, n, (hit[4], hit[3] - hit[2]))
                        if self.detail:
                            for d, sign in ((lo, 1), (hi, -1)):
                                self.add([P(d, hit[2]), q(d, hit[2]), q(d, hit[3]), P(d, hit[3])],
                                         mix(colour, '#000000', .12), 'reveal', (ux * sign, uy * sign, 0.))
                            self.add([P(lo, hit[2]), P(hi, hit[2]), q(hi, hit[2]), q(lo, hit[2])], mix(colour, '#000000', .05),
                                     'reveal', (0, 0, 1))
                            self.add([P(lo, hit[3]), P(hi, hit[3]), q(hi, hit[3]), q(lo, hit[3])], mix(colour, '#000000', .18),
                                     'reveal', (0, 0, -1))

    def rail(self, a, b, z, height=3.6):
        if math.dist(a, b) > .3:
            self.add([(a[0], a[1], z), (b[0], b[1], z), (b[0], b[1], z + height), (a[0], a[1], z + height)], '#C9DDE0', 'rail', (0., 0., 0.))


def _openings(model, floor, z_floor):
    """Exterior doors and windows of a floor as lines on the outer wall face (feet), with z ranges."""
    f = model['floors'][floor]
    out = []
    for w in f['windows']:
        (ax, ay), (bx, by) = w['span']
        line = ((ax / U, ay / U), (bx / U, by / U))
        if w['kind'] == 'tall':
            if floor == 'first':
                continue                 # Drawn once, through both storeys, from the ground floor list.
            out.append({'line': line, 'z0': PLINTH + .4, 'z1': PLINTH + 2 * STOREY - .9, 'kind': 'tall'})
        else:
            out.append({'line': line, 'z0': z_floor + w['sill'], 'z1': z_floor + w['head'], 'kind': w['kind']})
    for d in f['doors']:
        if d['type'] not in ('main', 'exterior'):
            continue
        rooms = f['rooms']
        a, b = rooms.get(d['from']), rooms.get(d['to'])
        if not ((a is not None and a.outdoor) or (b is not None and b.outdoor) or d['from'] == 'outside'):
            continue
        (ax, ay), (bx, by) = geometry._segment({'orient': d['orient']}, d['lo'], d['hi'], d['at'])
        out.append({'line': ((ax / U, ay / U), (bx / U, by / U)), 'z0': z_floor, 'z1': z_floor + DOOR_HEAD,
                    'kind': 'main' if d['type'] == 'main' else 'door'})
    return out


def _void_tall(model):
    """Tall glazing of the void's outer edges, when the ground floor below has no matching exterior wall."""
    first = model['floors'].get('first')
    if not first:
        return []
    out = []
    ground_tall = {(w['orient'], w['at'], w['lo'], w['hi']) for w in model['floors']['ground']['windows'] if w['kind'] == 'tall'}
    for w in first['windows']:
        if w['kind'] == 'tall' and (w['orient'], w['at'], w['lo'], w['hi']) not in ground_tall:
            (ax, ay), (bx, by) = w['span']
            out.append({'line': ((ax / U, ay / U), (bx / U, by / U)), 'z0': PLINTH + STOREY + .4,
                        'z1': PLINTH + 2 * STOREY - .9, 'kind': 'tall'})
    return out


def render(model, preset='front-left', theme='warm', width=2000, height=1250, scale=1.0):
    if preset not in PRESETS:
        raise ValueError('Choose one of the four outside views.')
    width, height = int(min(max(width, 480), 3000)), int(min(max(height, 320), 2000))
    W2, H2 = int(width * scale), int(height * scale)
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W2, H2)
    c = cairo.Context(surface)
    draw(c, model, preset, theme, W2, H2)
    if scale != 1.0:
        out = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
        oc = cairo.Context(out)
        oc.scale(1 / scale, 1 / scale)
        pattern = cairo.SurfacePattern(surface)
        pattern.set_filter(cairo.FILTER_BEST)
        oc.set_source(pattern)
        oc.paint()
        surface = out
    stream = io.BytesIO()
    surface.write_to_png(stream)
    return stream.getvalue()


def draw(c, model, preset, theme, width, height):
    name, sx, sy = PRESETS[preset]
    page, paper, ink, muted, edge = THEMES[theme]
    px = min(width, height) / 1000
    W, D = model['plot']['W'] / U, model['plot']['D'] / U
    ground = model['floors']['ground']
    first = model['floors'].get('first')
    two = first is not None and any(r.indoor or r.zone == 'void' for r in first['rooms'].values())
    gfp = _ft(geometry.union([r.polygon for r in ground['rooms'].values() if r.indoor]))
    ffe = _ft(geometry.union([r.polygon for r in first['rooms'].values() if r.indoor or r.zone == 'void'])) if two else Polygon()
    if gfp.is_empty:
        raise ValueError('Place an indoor room on the ground floor to see the outside.')
    z_ff = PLINTH + STOREY
    z_roof = PLINTH + (2 if two else 1) * STOREY
    house = gfp.union(ffe) if not ffe.is_empty else gfp
    hx1, hy1, hx2, hy2 = house.bounds
    centre = ((hx1 + hx2) / 2, (hy1 + hy2) / 2, z_roof * .45)
    radius = math.hypot(hx2 - hx1, hy2 - hy1) / 2 + 6
    distance = radius / math.tan(math.radians(19)) * 1.08
    az = math.radians(40)
    eye = (centre[0] + sx * distance * math.sin(az), centre[1] + sy * distance * math.cos(az), distance * math.tan(math.radians(22)) * .55 + 8)
    cam = Camera(eye, centre)
    light = np.array([-cam.r[0] * .55 - cam.f[0] * .35, -cam.r[1] * .55 - cam.f[1] * .35, .78])
    light /= np.linalg.norm(light)
    detail = True
    for attempt in range(2):
        scene = Scene(eye, detail)
        _build(scene, model, gfp, ffe, two, z_ff, z_roof, W, D)
        if len(scene.faces) <= MAX_FACES:
            break
        detail = False                          # Simplified detail: no reveals when the house is very large.
    checkpoint()
    budget = [0]
    ordered = list(order_faces(scene.faces, eye, budget))
    checkpoint()
    pts = [p for f in scene.faces if f[2] in ('wall', 'slab', 'tower', 'plinth') for p in f[0]]
    xs, ys = zip(*[cam(*p) for p in pts])
    cam.k = min((width * .74) / (max(xs) - min(xs)), (height * .70) / (max(ys) - min(ys)))
    xs, ys = zip(*[cam(*p) for p in pts])
    cam.cx = width / 2 - (min(xs) + max(xs)) / 2
    cam.cy = height * .5 - (min(ys) + max(ys)) / 2 + height * .03
    horizon = cam.cy + cam.y0 * cam.k
    sky = cairo.LinearGradient(0, 0, 0, max(1, horizon))
    sky.add_color_stop_rgb(0, *rgb('#C3D4E2'))
    sky.add_color_stop_rgb(.8, *rgb('#E6ECEE'))
    sky.add_color_stop_rgb(1, *rgb('#F0F1EE'))
    c.rectangle(0, 0, width, max(0, horizon)); c.set_source(sky); c.fill()
    earth = cairo.LinearGradient(0, horizon, 0, height)
    earth.add_color_stop_rgb(0, *rgb('#DADDD4')); earth.add_color_stop_rgb(1, *rgb('#C6CBBE'))
    c.rectangle(0, horizon, width, height - horizon); c.set_source(earth); c.fill()
    # The ground plane, clipped to what lies in front of the camera.
    visible = Polygon([(eye[0] + cam.f[0] * 6 + cam.r[0] * 2000, eye[1] + cam.f[1] * 6 + cam.r[1] * 2000),
                       (eye[0] + cam.f[0] * 6 - cam.r[0] * 2000, eye[1] + cam.f[1] * 6 - cam.r[1] * 2000),
                       (eye[0] + cam.f[0] * 2000 - cam.r[0] * 2000, eye[1] + cam.f[1] * 2000 - cam.r[1] * 2000),
                       (eye[0] + cam.f[0] * 2000 + cam.r[0] * 2000, eye[1] + cam.f[1] * 2000 + cam.r[1] * 2000)])

    def flat(poly, colour, z=0., alpha=1.):
        clipped = poly.intersection(visible)
        for part in geometry.parts(clipped):
            if part.geom_type != 'Polygon':
                continue
            c.new_path()
            for ring in (part.exterior, *part.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (c.move_to if i == 0 else c.line_to)(*cam(x, y, z))
                c.close_path()
            c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
            c.set_source_rgba(*rgb(colour), alpha)
            c.fill()

    flat(box(-300, -30, W + 300, -7), '#6B7072')                 # road
    flat(box(-300, -7, W + 300, 0), '#D2D0C9')                   # footpath
    flat(box(0, 0, W, D), '#D4D1C7')                             # site
    lawns = []
    for room in ground['rooms'].values():
        if room.outdoor:
            poly = _ft(room.polygon)
            flat(poly, '#A6B993' if room.kind == 'green' else '#CDC9C0')
            if room.kind == 'green':
                lawns.append(poly)
                _stipple(c, cam, poly.intersection(visible), px)
            else:
                _joints(c, cam, poly.intersection(visible), px)
    main = next((d for d in ground['doors'] if d['type'] == 'main'), None)
    gate_lo, gate_hi = (v / U for v in gate_span(model['plot']))
    if main:
        mx = (main['lo'] + main['hi']) / 2 / U if main['orient'] == 'h' else main['at'] / U
        my = min(main['at'], main['band'][0]) / U if main['orient'] == 'h' else (main['lo'] + main['hi']) / 2 / U
        path = box(min((gate_lo + gate_hi) / 2, mx) - 2, 0, max((gate_lo + gate_hi) / 2, mx) + 2, max(1, my))
        flat(path.difference(gfp), '#E2DFD7')
    # Shadows: exact projections onto the ground, softened by a blurred half-resolution mask.
    sun_dx, sun_dy = -light[0] / light[2], -light[1] / light[2]

    def cast(poly, z0, z1):
        pieces = [translate(poly, sun_dx * z0, sun_dy * z0), translate(poly, sun_dx * z1, sun_dy * z1)]
        for part in geometry.parts(poly):
            if part.geom_type != 'Polygon':
                continue
            coords = list(part.exterior.coords)
            for a, b in zip(coords, coords[1:]):
                quad = Polygon([(a[0] + sun_dx * z0, a[1] + sun_dy * z0), (b[0] + sun_dx * z0, b[1] + sun_dy * z0),
                                (b[0] + sun_dx * z1, b[1] + sun_dy * z1), (a[0] + sun_dx * z1, a[1] + sun_dy * z1)]).buffer(0)
                pieces.append(quad)
        return geometry.union(pieces)

    casters = [cast(gfp, 0, z_ff if two else z_roof)]
    if two:
        casters.append(cast(ffe, z_ff, z_roof))
    stair_top = _stair_tower(model)
    if stair_top is not None:
        casters.append(cast(stair_top, z_roof, z_roof + MUMTY))
    shadow = geometry.union(casters).intersection(visible)
    half = cairo.ImageSurface(cairo.FORMAT_A8, max(1, width // 2), max(1, height // 2))
    mc = cairo.Context(half)
    mc.scale(.5, .5)
    for geom, alpha in ((shadow, .85), (gfp.buffer(1.2, join_style=2).difference(gfp).intersection(visible), 1.)):
        for part in geometry.parts(geom):
            if part.geom_type != 'Polygon':
                continue
            mc.new_path()
            for ring in (part.exterior, *part.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (mc.move_to if i == 0 else mc.line_to)(*cam(x, y, 0))
                mc.close_path()
            mc.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
            mc.set_source_rgba(0, 0, 0, alpha)
            mc.fill()
    from compass_top import blur
    blur(half, max(2, int(4.5 * px)))
    c.save(); c.scale(2, 2); c.set_source_rgba(.14, .16, .19, .40); c.mask_surface(half, 0, 0); c.restore()
    trees = _trees(lawns, gfp, cam, centre)
    house_depth = cam.depth(centre)
    for p in trees:
        if cam.depth((*p, 0)) > house_depth:
            _tree(c, cam, *p)
    checkpoint()
    _paint(c, cam, ordered, light, px, z_ff, two)
    for p in trees:
        if cam.depth((*p, 0)) <= house_depth:
            _tree(c, cam, *p)
    caption = f"{name} · proposed materials · preliminary concept, not for construction"
    text.draw(c, 32 * px, height - 22 * px, caption, 13 * px, rgb('#4F5D63'))
    text.draw(c, 32 * px, 40 * px, name.upper(), 18 * px, rgb('#24323A'), bold=True)


def _stair_tower(model):
    """The headroom cabin (mumty) over the stair core, when the stair reaches the roof."""
    top = model['floors'].get('first') or model['floors']['ground']
    stair = top.get('stair') or model['floors']['ground'].get('stair')
    if not stair:
        return None
    x1, y1, x2, y2 = (v / U for v in stair['core'])
    return box(x1 - .3, y1 - .3, x2 + .3, y2 + .3)


def _build(scene, model, gfp, ffe, two, z_ff, z_roof, W, D):
    ground = model['floors']['ground']
    first = model['floors'].get('first')
    plot_box = box(0, 0, W, D)
    scene.prism(gfp.buffer(.25, join_style=2), 0., PLINTH, STONE, 'plinth', top='#D9D6CF')
    g_open = _openings(model, 'ground', PLINTH)
    top_z = z_ff if two else z_roof
    scene.walls(gfp, PLINTH, top_z, g_open)
    if two:
        f_open = _openings(model, 'first', z_ff) + _void_tall(model)
        upper_only = ffe.difference(gfp.buffer(.01))
        scene.walls(ffe, z_ff, z_roof, f_open)
        # The floor band between storeys, except across the double-height glazing.
        band = gfp.buffer(.35, join_style=2)
        voids = geometry.union([_ft(r.polygon) for r in first['rooms'].values() if r.zone == 'void'])
        if not voids.is_empty:
            band = band.difference(voids.buffer(.6, join_style=2))
        scene.prism(band.difference(ffe.buffer(-.4, join_style=2)), z_ff - .05, z_ff + .5, '#F7F6F2', 'slab', top='#E3E1DA')
        if not upper_only.is_empty:
            scene.prism(upper_only, z_ff - SLAB_T, z_ff, '#F5F4F0', 'slab')
        # Terraces and balconies upstairs: glass rails on their open edges.
        for parapet in first.get('parapets', []):
            a, b = geometry._segment(parapet, parapet['lo'], parapet['hi'], parapet['at'])
            scene.rail((a[0] / U, a[1] / U), (b[0] / U, b[1] / U), z_ff + .5)
        roof_shape = ffe
    else:
        roof_shape = gfp
    # A floating roof slab, deeper toward the road, never past the plot.
    over = roof_shape.buffer(OVERHANG, join_style=2)
    front = box(0, -10, W, roof_shape.bounds[1] + 1).intersection(roof_shape.buffer(ROAD_OVERHANG, join_style=2))
    roof = over.union(front).intersection(plot_box)
    scene.prism(roof, z_roof, z_roof + ROOF_T, '#FAFAF8', 'slab', top=ROOF)
    scene.prism(roof_shape.buffer(-.2, join_style=2), z_roof - .2, z_roof, '#2A2F33', 'shadowline')
    for part in geometry.parts(roof.buffer(-.3, join_style=2)):
        if part.geom_type == 'Polygon':
            coords = list(part.exterior.coords)
            for a, b in zip(coords, coords[1:]):
                scene.rail(a, b, z_roof + ROOF_T)
    tower = _stair_tower(model)
    if tower is not None:
        scene.prism(tower.intersection(roof_shape.buffer(-.2, join_style=2)) if not roof_shape.is_empty else tower,
                    z_roof + ROOF_T, z_roof + MUMTY, STONE, 'tower', top=ROOF)
    # Porch and verandah roofs with corner columns where the floor above does not cover them.
    for room in ground['rooms'].values():
        if room.zone != 'covered':
            continue
        poly = _ft(room.polygon)
        if two:
            poly = poly.difference(ffe)
        if poly.is_empty or poly.area < 4:
            continue
        scene.prism(poly.buffer(.4, join_style=2).intersection(plot_box), PLINTH + 8.6, PLINTH + 9.2, '#F7F6F2', 'slab', top='#E3E1DA')
        x1, y1, x2, y2 = poly.bounds
        for cx, cy in ((x1, y1), (x2, y1), (x1, y2), (x2, y2)):
            if gfp.buffer(.3).covers(Point(cx, cy)):
                continue
            scene.prism(box(cx - .45 if cx > x1 else cx, cy - .45 if cy > y1 else cy, cx if cx > x1 else cx + .45, cy if cy > y1 else cy + .45),
                        PLINTH, PLINTH + 8.6, '#EFEDE8', 'solid')
    # Proposed columns under first-floor overhangs.
    for col in model['floors']['ground'].get('supports', []):
        x1, y1, x2, y2 = (v / U for v in col['rect'])
        scene.prism(box(x1, y1, x2, y2), 0, z_ff - SLAB_T, '#EFEDE8', 'solid')
    # The main door: a timber canopy and three steps up to the plinth.
    main = next((d for d in ground['doors'] if d['type'] == 'main'), None)
    if main:
        nx, ny = main['normal']
        (ax, ay), (bx, by) = [(x / U, y / U) for x, y in main['span']]
        out = (-nx, -ny)
        lo_x, hi_x, lo_y, hi_y = min(ax, bx), max(ax, bx), min(ay, by), max(ay, by)
        if main['orient'] == 'h':
            face = min(main['band']) / U if out[1] < 0 else max(main['band']) / U
            canopy = box(lo_x - 1.5, face - 4 if out[1] < 0 else face, hi_x + 1.5, face if out[1] < 0 else face + 4)
            for i in range(3):
                step = box(lo_x - .5, face - (i + 1) * .9 if out[1] < 0 else face + i * .9, hi_x + .5, face - i * .9 if out[1] < 0 else face + (i + 1) * .9)
                scene.prism(step.difference(gfp), 0, PLINTH * (3 - i) / 3, '#D9D6CF', 'solid')
        else:
            face = min(main['band']) / U if out[0] < 0 else max(main['band']) / U
            canopy = box(face - 4 if out[0] < 0 else face, lo_y - 1.5, face if out[0] < 0 else face + 4, hi_y + 1.5)
            for i in range(3):
                step = box(face - (i + 1) * .9 if out[0] < 0 else face + i * .9, lo_y - .5, face - i * .9 if out[0] < 0 else face + (i + 1) * .9, hi_y + .5)
                scene.prism(step.difference(gfp), 0, PLINTH * (3 - i) / 3, '#D9D6CF', 'solid')
        rooms = ground['rooms']
        porch = any(rooms[r].zone == 'covered' for r in (main['from'], main['to']) if r in rooms)
        if not porch:                             # A porch roof already shelters the door.
            scene.prism(canopy.difference(gfp), PLINTH + 8.3, PLINTH + 8.8, TIMBER, 'canopy', top='#3B3F42')
    # The compound wall, stone base and white top, open at the gate.
    gate_lo, gate_hi = (v / U for v in gate_span(model['plot']))
    for seg in (LineString([(0, 0), (gate_lo, 0)]), LineString([(gate_hi, 0), (W, 0)]), LineString([(0, 0), (0, D)]),
                LineString([(W, 0), (W, D)]), LineString([(0, D), (W, D)])):
        if seg.length < .3:
            continue
        scene.prism(seg.buffer(.35, cap_style=2, join_style=2), 0., 1.1, STONE, 'cwall', top='#7D7B76')
        scene.prism(seg.buffer(.25, cap_style=2, join_style=2), 1.1, 3.4, '#EEECE6', 'cwall', top='#3A3F42')
    for x in (gate_lo, gate_hi):
        scene.prism(box(x - .6, -.6, x + .6, .6), 0., 4.6, STONE, 'cwall', top='#5F5D59')


def _paint(c, cam, ordered, light, px, z_ff, two):
    for pts, colour, kind, n, plane in ordered:
        normal = np.array(n, float)
        lam = max(0., float(normal @ light)) if kind != 'glass' else .55
        sky = .08 * max(0., normal[2]) if kind != 'glass' else 0
        k = .64 + .30 * lam + sky
        shade = mix(colour, '#1F2A33', max(0., 1 - k)) if kind != 'shadowline' else colour
        proj = [cam(*p) for p in pts]
        c.new_path(); c.move_to(*proj[0])
        for p in proj[1:]:
            c.line_to(*p)
        c.close_path()
        if kind in ('glass', 'door'):
            if kind == 'glass':
                ys = [p[1] for p in proj]
                g = cairo.LinearGradient(0, min(ys), 0, max(ys))
                g.add_color_stop_rgb(0, *rgb('#DCE8EB')); g.add_color_stop_rgb(.45, *rgb('#9DB8BE')); g.add_color_stop_rgb(1, *rgb('#52707A'))
                c.set_source(g)
            else:
                c.set_source_rgb(*rgb(mix(TIMBER, '#1F2A33', max(0., 1 - k))))
            c.fill_preserve()
            c.set_source_rgb(*rgb(FRAME)); c.set_line_width(2.0 * px); c.stroke()
            (x0, y0, z0), (x1, y1, _), (_, _, z1) = pts[0], pts[1], pts[2]
            span = math.dist((x0, y0), (x1, y1))
            if kind == 'glass':
                bars = max(0, int(span // 4))
                for i in range(1, bars + 1):
                    f = i / (bars + 1)
                    bx, by = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
                    c.move_to(*cam(bx, by, z0)); c.line_to(*cam(bx, by, z1))
                c.set_line_width(1.4 * px); c.stroke()
                if z1 - z0 > 12 and two:
                    c.move_to(*cam(x0, y0, z_ff)); c.line_to(*cam(x1, y1, z_ff))
                    c.set_line_width(2.8 * px); c.stroke()      # Transom at the floor line.
            else:
                for i in range(1, 6):                           # Timber boards.
                    f = i / 6
                    bx, by = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
                    c.move_to(*cam(bx, by, z0)); c.line_to(*cam(bx, by, z1))
                c.set_source_rgba(*rgb('#3D2A1C'), .45); c.set_line_width(.9 * px); c.stroke()
            continue
        if kind == 'rail':
            c.set_source_rgba(*rgb('#C2D8DC'), .32); c.fill()
            c.move_to(*proj[3]); c.line_to(*proj[2]); c.set_source_rgb(*rgb('#2B3236')); c.set_line_width(1.8 * px); c.stroke()
            c.move_to(*proj[0]); c.line_to(*proj[1]); c.set_line_width(2.6 * px); c.stroke()
            continue
        if kind == 'wall' and plane is not None:
            # One soffit gradient per wall plane, defined by the plane's own top edge, so every strip
            # of a facade (beside, above and below its windows) carries exactly the same tone.
            source = _plane_gradient(cam, plane, shade)
        else:
            source = None
        if source is not None:
            c.set_source(source)
        else:
            c.set_source_rgb(*rgb(shade))
        c.fill_preserve()
        c.set_line_width(.7 * px)                                # Same-colour seal: no seams, no outlines.
        c.stroke()
        if kind in ('plinth', 'tower') and len(pts) == 4 and abs(n[2]) < .5:
            # Stone coursing, generated in 3D and projected.
            (x0, y0, z0), (x1, y1, _), (_, _, z1) = pts[0], pts[1], pts[2]
            z = z0 + .5
            while z < z1:
                c.move_to(*cam(x0, y0, z)); c.line_to(*cam(x1, y1, z)); z += .5
            c.set_source_rgba(*rgb('#5E5C58'), .35); c.set_line_width(.7 * px); c.stroke()


def _plane_gradient(cam, plane, shade):
    ax, ay, bx, by, z0, z1 = plane
    a1, b1 = np.array(cam(ax, ay, z1)), np.array(cam(bx, by, z1))
    edge = b1 - a1
    length = float(np.linalg.norm(edge)) or 1.
    normal = np.array([-edge[1], edge[0]]) / length
    if normal[1] < 0:
        normal = -normal
    mx, my = (ax + bx) / 2, (ay + by) / 2
    top, bottom = np.array(cam(mx, my, z1)), np.array(cam(mx, my, z0))
    height = float(np.linalg.norm(bottom - top))
    start = top
    end = top + normal * height * .26
    g = cairo.LinearGradient(start[0], start[1], end[0], end[1])
    g.add_color_stop_rgb(0, *rgb(mix(shade, '#1F2A33', .17)))
    g.add_color_stop_rgb(1, *rgb(shade))
    g.set_extend(cairo.EXTEND_PAD)
    return g


def _stipple(c, cam, poly, px):
    for part in geometry.parts(poly):
        if part.geom_type != 'Polygon':
            continue
        x1, y1, x2, y2 = part.bounds
        step = max(2.5, (x2 - x1) / 18)
        y = y1 + step / 2
        j = 0
        while y < y2:
            x = x1 + (step / 2 if j % 2 else step)
            while x < x2:
                if part.covers(Point(x, y)):
                    sx, sy = cam(x, y, 0)
                    c.new_path(); c.arc(sx, sy, .9 * px, 0, math.tau)
                    c.set_source_rgba(*rgb('#7E9670'), .45); c.fill()
                x += step
            y += step
            j += 1


def _joints(c, cam, poly, px):
    """Paving joints projected in perspective (2 ft squares)."""
    for part in geometry.parts(poly):
        if part.geom_type != 'Polygon':
            continue
        x1, y1, x2, y2 = part.bounds
        c.save()
        c.new_path()
        for i, (x, y) in enumerate(part.exterior.coords):
            (c.move_to if i == 0 else c.line_to)(*cam(x, y, 0))
        c.close_path(); c.clip()
        x = math.floor(x1 / 2) * 2
        while x <= x2:
            c.move_to(*cam(x, y1, 0)); c.line_to(*cam(x, y2, 0)); x += 2
        y = math.floor(y1 / 2) * 2
        while y <= y2:
            c.move_to(*cam(x1, y, 0)); c.line_to(*cam(x2, y, 0)); y += 2
        c.set_source_rgba(*rgb('#A9A59C'), .5); c.set_line_width(.6 * px); c.stroke()
        c.restore()


def _trees(lawns, gfp, cam, centre):
    """At most three trees, in lawns or backyards, never between the camera and the house."""
    out = []
    to_eye = (cam.e[0] - centre[0], cam.e[1] - centre[1])
    for poly in sorted(lawns, key=lambda p: -p.area):
        for part in geometry.parts(poly):
            if part.geom_type != 'Polygon' or part.area < 60:
                continue
            for spot in (part.representative_point(), part.centroid):
                x, y = spot.x, spot.y
                facade_side = (x - centre[0]) * to_eye[0] + (y - centre[1]) * to_eye[1] > 0
                if facade_side or gfp.buffer(5).covers(Point(x, y)) or not part.buffer(-2).covers(Point(x, y)):
                    continue
                if all(math.dist((x, y), q) > 10 for q in out):
                    out.append((x, y))
                    break
            if len(out) >= 3:
                return out
    return out


def _tree(c, cam, x, y):
    bx, by = cam(x, y, 0)
    tx, ty = cam(x, y, 14.)
    r = abs(ty - by) * .38
    c.set_source_rgba(*rgb('#5D5145'), 1); c.set_line_width(max(2., r * .09)); c.move_to(bx, by); c.line_to(tx, ty + r * .4); c.stroke()
    for dx, dy, rr, col, al in ((0, 0, 1., '#6F8B62', .9), (-.35, .18, .7, '#7E9A6F', .82), (.32, .2, .66, '#87A377', .78),
                                (.05, -.25, .62, '#97B086', .72)):
        c.new_path(); c.arc(tx + dx * r, ty + dy * r, rr * r, 0, math.tau); c.set_source_rgba(*rgb(col), al); c.fill()
