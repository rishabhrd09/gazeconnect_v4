"""The top view: one plan-oblique projection per floor (IMPLEMENTATION_PLAN.md §6.3).

The floor plane is exactly the 2D plan (road at the bottom, never rotated); heights shift
right and back by (+0.22 z, +0.42 z), so front and left wall faces show. Walls are cut at
4'-0" like the plan, with the cut tops in the plan's poché, so thickness and openings read:
sills are low walls with a glass band, doors are full openings. Furniture is simple blocks at
real heights; one soft shadow falls back-right from a light at the front-left. Floors carry
quiet materials. Upstairs, the double-height living hall shows through the void one storey
down, a little darker. A still image only: no animation, orbit or render loop.
"""
from __future__ import annotations

import io
import math

import cairo
import numpy as np
from shapely.geometry import MultiPoint, Polygon, box

import compass_geometry as geometry
import compass_text as text
from compass_drawing import face_normal, ordered_faces
from compass_plan2d import THEMES, luminance, mix, rgb
from compass_resources import checkpoint
from compass_standards import DOOR_HEAD, STOREY, ft_in

U = geometry.U
A, B, CUT = .22, .42, 4.0          # Plan-oblique offsets per foot of height; the plan's cut height.
VIEW = (-A, -B, 1.0)               # Toward the viewer, for back-to-front ordering.
LIGHT = (-.55, -.65, .52)          # From the front-left and high.
WALL, WALL_CUT, SILL = '#F2EFE9', '#2E383E', '#F4F2EC'
GLASS, LEAF, RAIL = '#BFD5D9', '#C4AA86', '#B8D2D6'
FLOOR = {'public': '#EFE7DA', 'service': '#EFE7DA', 'private': '#E9DCC9', 'wet': '#E3ECEE', 'circulation': '#EEEAE3',
         'void': '#E8E5DF', 'covered': '#E6E2D9', 'open': '#DCE6D3'}
TONES = {'linen': '#EEEAE2', 'wood': '#C9AE8E', 'metal': '#B9C8CB', 'plant': '#93B08A', 'pillow': '#F6F3EC',
         'fixture': '#DCD3C5', 'stair': '#E4DCCB'}
DIM = '#41505A'


def face_shade(colour, normal):
    nx, ny, nz = normal
    if abs(nz) > .5:
        return colour
    if nx * VIEW[0] + ny * VIEW[1] < 0:
        nx, ny = -nx, -ny
    lam = max(0., -(nx * LIGHT[0] + ny * LIGHT[1]))
    return mix(colour, '#22303A', .26 * (1 - lam))


def blur(surface, radius):
    """Three box passes (close to a Gaussian) over an A8 mask, in place."""
    surface.flush()
    w, h, stride = surface.get_width(), surface.get_height(), surface.get_stride()
    buf = np.frombuffer(surface.get_data(), dtype=np.uint8).reshape(h, stride)
    a = buf[:, :w].astype(np.float32)
    for _ in range(3):
        for axis in (1, 0):
            pad = [(radius + 1, radius) if ax == axis else (0, 0) for ax in range(2)]
            c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
            a = ((c[:, 2 * radius + 1:] - c[:, :-2 * radius - 1]) if axis == 1 else
                 (c[2 * radius + 1:, :] - c[:-2 * radius - 1, :])) / (2 * radius + 1)
    buf[:, :w] = np.clip(a, 0, 255).astype(np.uint8)
    surface.mark_dirty()


def _ft(points):
    return [(x / U, y / U) for x, y in points]


def _rect(r):
    x1, y1, x2, y2 = (v / U for v in r)
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def solids(floor, z0=0., stairs=True):
    """(plan points in feet, base z, height, side tone, top tone or None) for everything standing on a floor."""
    out = []
    for fixture in floor['fixtures']:
        stair = fixture['kind'] == 'stair'
        if stair and not stairs:
            continue
        for obj in fixture['solids']:
            z, h = obj['z'], obj['height']
            if stair:
                th = min(h, .45)
                z, h = z + h - th, th
                if z > CUT:
                    continue
            top = z + h if stair else min(z + h, CUT)
            if top > z:
                out.append((obj['points'], z0 + z, top - z, TONES['stair'] if stair else TONES.get(obj['tone'], '#DCD3C5'), None))
    openings = []
    for d in floor['doors']:
        openings.append(('door', d))
    for w in floor['windows']:
        openings.append(('window', w))
    for run in floor['runs']:
        if run['polygon'] is None:
            continue
        c1, c2 = geometry._band(run)
        marks = [run['lo'], run['hi']]
        here = [(o['lo'], o['hi'], kind, o) for kind, o in openings if o['run'] == run['id']]
        for lo, hi, _, _ in here:
            marks += [lo, hi]
        marks = sorted(set(marks))
        for lo, hi in zip(marks, marks[1:]):
            hit = next(((kind, o) for a, b, kind, o in here if a <= (lo + hi) / 2 <= b), None)
            rect = (c1, lo, c2, hi) if run['orient'] == 'v' else (lo, c1, hi, c2)
            pts = _rect(rect)
            if hit and hit[0] == 'door':
                continue
            if hit and hit[0] == 'window':
                sill = min(hit[1]['sill'], CUT) if hit[1]['kind'] != 'tall' else .5
                out.append((pts, z0, sill, SILL, None))
                mid = (c1 + c2) / 2
                thin = (mid - 4, lo, mid + 4, hi) if run['orient'] == 'v' else (lo, mid - 4, hi, mid + 4)
                out.append((_rect(thin), z0 + sill, CUT - sill, GLASS, None))
                continue
            out.append((pts, z0, CUT, WALL, WALL_CUT))
    for d in floor['doors']:
        hinge, leaf, strike = d['hinge'], d['leaf'], d['strike']
        ux, uy = (strike[0] - hinge[0]) / d['width'], (strike[1] - hinge[1]) / d['width']
        t = 12
        panel = [hinge, leaf, (leaf[0] + ux * t, leaf[1] + uy * t), (hinge[0] + ux * t, hinge[1] + uy * t)]
        out.append((_ft(panel), z0, min(DOOR_HEAD, CUT), LEAF, None))
    for run in floor['runs']:
        if run['kind'] != 'rail':
            continue
        a, b = geometry._segment(run, run['lo'], run['hi'], run['at'])
        r = (a[0] - 6, a[1], b[0] + 6, b[1]) if run['orient'] == 'v' else (a[0], a[1] - 6, b[0], b[1] + 6)
        out.append((_rect(r), z0, 3.5, RAIL, '#3A464C'))
    for parapet in floor.get('parapets', []):
        t = geometry.PARAPET_T
        at, lo, hi = parapet['at'], parapet['lo'], parapet['hi']
        band = (at, at + t) if parapet['inward'] == 'b' else (at - t, at)
        rect = (band[0], lo, band[1], hi) if parapet['orient'] == 'v' else (lo, band[0], hi, band[1])
        out.append((_rect(rect), z0, 3.25, WALL, '#BDB6AA'))
    for col in floor.get('supports', []):
        out.append((_rect(col['rect']), z0, CUT, WALL, WALL_CUT))
    return out


def _floor_tone(room):
    if room.outdoor:
        return FLOOR['open'] if room.kind == 'green' else FLOOR['covered']
    return FLOOR.get(room.zone, FLOOR['public'])


def render(model, floor, theme='warm', width=2000, height=1300):
    width, height = int(min(max(width, 480), 2400)), int(min(max(height, 320), 1600))
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    draw(cairo.Context(surface), surface, model, floor, theme, width, height)
    stream = io.BytesIO()
    surface.write_to_png(stream)
    surface.finish()
    return stream.getvalue()


def draw(c, surface, model, floor, theme, width, height):
    page, paper, ink, muted, edge = THEMES[theme]
    dark = luminance(page) < .45
    px = min(width, height) / 1000
    W, D = model['plot']['W'] / U, model['plot']['D'] / U
    f = model['floors'][floor]
    c.set_source_rgb(*rgb(page)); c.paint()
    title_h = 64 * px
    s = min((width - 120 * px) / (W + A * CUT), (height - title_h - 90 * px) / (D + B * CUT))
    ox = (width - (W + A * CUT) * s) / 2
    oy = title_h + (height - title_h - 90 * px - (D + B * CUT) * s) / 2 + (D + B * CUT) * s

    def point(x, y, z=0.):
        return ox + (x + A * z) * s, oy - (y + B * z) * s

    def fill(points, colour, z=0., alpha=None):
        c.new_path()
        for i, (x, y) in enumerate(points):
            (c.move_to if i == 0 else c.line_to)(*point(x, y, z))
        c.close_path()
        r, g, b = rgb(colour)
        c.set_source_rgba(r, g, b, 1 if alpha is None else alpha)
        c.fill()

    def fill_geom(geom, colour, z=0.):
        for part in geometry.parts(geom):
            if part.geom_type != 'Polygon':
                continue
            c.new_path()
            for ring in (part.exterior, *part.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (c.move_to if i == 0 else c.line_to)(*point(x / U, y / U, z))
                c.close_path()
            c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
            c.set_source_rgb(*rgb(colour))
            c.fill()

    def clip_geom(geom, z=0.):
        c.new_path()
        for part in geometry.parts(geom):
            if part.geom_type != 'Polygon':
                continue
            for ring in (part.exterior, *part.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (c.move_to if i == 0 else c.line_to)(*point(x / U, y / U, z))
                c.close_path()
        c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
        c.clip()

    site = '#E9E7E0' if not dark else '#C9C7BF'
    fill([(0, 0), (W, 0), (W, D), (0, D)], site)
    ground = model['floors']['ground']
    wells = []
    if floor == 'first':
        # Around the first floor, the ground floor seen from above, flat and muted: its roof where
        # it is built, gardens where it is not. Depth is shown only where one can look down: the
        # double-height void and the stair opening, one storey below and a little darker.
        for room in ground['rooms'].values():
            if room.indoor:
                fill_geom(room.polygon, mix('#E4E1DA', DIM, .10))
            else:
                fill_geom(room.polygon, mix(_floor_tone(room), DIM, .18))
        wells = [r.polygon for r in f['rooms'].values() if r.zone == 'void']
        if f.get('stair') and f['stair'].get('opening'):
            wells.append(box(*f['stair']['opening']))
        for well in wells:
            c.save()
            clip_geom(well)
            fill_geom(well, mix('#E4E1DA', DIM, .45))
            for room in ground['rooms'].values():
                fill_geom(room.polygon, mix(_floor_tone(room), DIM, .3), -STOREY)
            below = []
            for pts, z, h, tone, top in solids(ground, -STOREY):
                below.append((pts, z, h, mix(tone, DIM, .3), mix(top, DIM, .3) if top else None))
            if f.get('stair'):
                for pts, z, h, tone, top in solids({**f, 'doors': [], 'windows': [], 'runs': [], 'parapets': [], 'supports': [],
                                                    'fixtures': [x for x in f['fixtures'] if x['kind'] == 'stair']}, -STOREY):
                    below.append((pts, z, h, mix(tone, DIM, .15), None))
            faces = []
            for pts, z, h, tone, top in below:
                for a, b in zip(pts, pts[1:] + pts[:1]):
                    faces.append(([(a[0], a[1], z), (b[0], b[1], z), (b[0], b[1], z + h), (a[0], a[1], z + h)], tone, True))
                faces.append(([(p[0], p[1], z + h) for p in pts], top or tone, top is None))
            for pts, tone, lit in ordered_faces(faces, VIEW):
                colour = face_shade(tone, face_normal(pts)) if lit else tone
                c.new_path()
                for i, p in enumerate(pts):
                    (c.move_to if i == 0 else c.line_to)(*point(*p))
                c.close_path()
                c.set_source_rgb(*rgb(colour)); c.fill()
            c.restore()
    checkpoint()
    well_area = geometry.union(wells) if wells else None
    for room in sorted(f['rooms'].values(), key=lambda r: r.id):
        if room.zone == 'void':
            continue
        tone = _floor_tone(room)
        shape = room.polygon.difference(well_area) if well_area is not None else room.polygon
        fill_geom(shape, tone)
        _floor_pattern(c, room, point, tone, px, clip_geom, well_area)
    items = solids(f, stairs=floor != 'first')
    # Soft shadows: hulls of each solid and its offset copy, into a half-resolution mask, blurred.
    half = cairo.ImageSurface(cairo.FORMAT_A8, max(1, width // 2), max(1, height // 2))
    mc = cairo.Context(half)
    mc.scale(.5, .5)
    floor_area = geometry.union([r.polygon for r in f['rooms'].values() if r.zone != 'void'])
    hulls = []
    for pts, z, h, _, _ in items:
        if z + h <= .1:
            continue
        hull = MultiPoint([*pts, *[(x + .45 * (z + h), y + .6 * (z + h)) for x, y in pts]]).convex_hull
        if hull.geom_type == 'Polygon':
            hulls.append(hull)
    if hulls:
        shade = geometry.union([geometry._scale(h, U) for h in hulls]).intersection(floor_area)
        for part in geometry.parts(shade):
            if part.geom_type != 'Polygon':
                continue
            mc.new_path()
            for ring in (part.exterior, *part.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (mc.move_to if i == 0 else mc.line_to)(*point(x / U, y / U))
                mc.close_path()
            mc.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
            mc.set_source_rgba(0, 0, 0, 1)
            mc.fill()
        blur(half, max(2, int(5 * px)))
        c.save()
        c.scale(2, 2)
        c.set_source_rgba(.12, .15, .17, .22)
        c.mask_surface(half, 0, 0)
        c.restore()
    checkpoint()
    faces = []
    for pts, z, h, tone, top in items:
        for a, b in zip(pts, pts[1:] + pts[:1]):
            faces.append(([(a[0], a[1], z), (b[0], b[1], z), (b[0], b[1], z + h), (a[0], a[1], z + h)], tone, True))
        faces.append(([(p[0], p[1], z + h) for p in pts], top or tone, top is None))
    drawn = 0
    for pts, tone, lit in ordered_faces(faces, VIEW):
        colour = face_shade(tone, face_normal(pts)) if lit else tone
        c.new_path()
        for i, p in enumerate(pts):
            (c.move_to if i == 0 else c.line_to)(*point(*p))
        c.close_path()
        c.set_source_rgb(*rgb(colour)); c.fill_preserve()
        c.set_source_rgb(*rgb(mix(colour, '#1B2629', .08))); c.set_line_width(.45 * px); c.stroke()
        drawn += 1
        if drawn % 500 == 0:
            checkpoint()
    # Names only, on a thin halo: this is a presentation view.
    halo = rgb(page)
    for room in sorted(f['rooms'].values(), key=lambda r: r.id):
        if room.zone == 'void':
            x1, y1, x2, y2 = room.polygon.bounds
            x, y = point((x1 + x2) / 2 / U, (y1 + y2) / 2 / U, .2)
            text.draw(c, x, y, 'OPEN TO BELOW', 15 * px, rgb('#24323A'), bold=True, anchor='center', halo=(1, 1, 1, .85), spread=3.4 * px)
            continue
        x1, y1, x2, y2 = room.label_box
        x, y = point((x1 + x2) / 2, (y1 + y2) / 2, .2)
        name = room.short.replace('1F ', '').upper() if text.width(room.label.upper(), 16 * px, True) > (x2 - x1) * s * 1.1 else room.label.upper()
        text.draw(c, x, y, name, 15.5 * px, rgb('#24323A'), bold=True, anchor='center', halo=(1, 1, 1, .85), spread=3.4 * px)
    plot = model['plot']
    title = f"{geometry.FLOOR_NAMES[floor]} · top view · {ft_in(plot['W'] / U)} × {ft_in(plot['D'] / U)} plot · {plot['facing']}-facing"
    text.draw(c, 36 * px, 40 * px, title, 19 * px, rgb(ink), bold=True)
    text.draw(c, 36 * px, height - 24 * px, "Road at the bottom · walls cut at 4'-0\" · proposed furnishing · preliminary concept",
              12 * px, rgb(muted))


def _floor_pattern(c, room, point, tone, px, clip_geom, well=None):
    """Quiet materials: timber planks in bedrooms, large tiles in the open spaces, small tiles in wet rooms."""
    if room.outdoor or room.clear.is_empty:
        return
    kind = room.kind
    c.save()
    clip_geom(room.clear.difference(well) if well is not None else room.clear)
    x1, y1, x2, y2 = (v / U for v in room.clear.bounds)
    if kind in ('bed', 'master', 'icu'):
        step, colour, cross = .55, '#DCCBB3', False
    elif kind == 'bath':
        step, colour, cross = 1.0, mix(tone, '#9AA3A6', .2), True
    else:
        step, colour, cross = 2.0, mix(tone, '#9AA3A6', .16), True
    c.set_source_rgb(*rgb(colour))
    c.set_line_width(.55 * px)
    y = math.floor(y1 / step) * step
    while y <= y2:
        c.move_to(*point(x1, y)); c.line_to(*point(x2, y)); y += step
    if cross:
        x = math.floor(x1 / step) * step
        while x <= x2:
            c.move_to(*point(x, y1)); c.line_to(*point(x, y2)); x += step
    else:
        # Staggered plank ends.
        row = 0
        y = math.floor(y1 / step) * step
        while y <= y2:
            x = x1 + (row % 4) * 1.4
            while x <= x2:
                c.move_to(*point(x, y)); c.line_to(*point(x, min(y + step, y2))); x += 5.6
            y += step
            row += 1
    c.stroke()
    c.restore()
