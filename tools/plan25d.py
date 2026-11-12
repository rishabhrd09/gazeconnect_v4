"""Furnished model view of a floor plan: a soft architectural model seen from above (2.5D).

One floor at a time, from a small plan description in feet (origin top-left, y down): rooms with
floor materials, walls cut at waist height with their doors, windows and sliders, furniture,
stairs, dashed overhead lines, road names, a north arrow, a scale bar and a notes line. Drawn on
the CPU only: Cairo for shapes and the bundled Atkinson Hyperlegible text (compass_text), Pillow
for the blurred shadows and the 2x2 averaging down from twice the size. No GPU, network or model;
nothing random (patterns are seeded from the room), so the same plan gives the same PNG, byte for
byte. Each image comes with a hit map: every room's polygon and label box in pixels, for gaze.
Compass plans come through plan25d_adapter; this module never reads the Compass model itself.

    python tools/plan25d.py plan.json -o out.png [--width 1600] [--theme light|dark]

Plan keys (per floor, or shared at the top level with "floors": [...]):
  title, plot {width, depth}, roads [{side: north|east|south|west|top|right|bottom|left, label}],
  north_deg (clockwise from up), rooms [{name, poly, floor: wood|tile|wet|deck|stone|grass|void,
  tint?, indoor?, open?, size?, show_size?, short?, label?, label_at?, id?, below {rooms, furniture}?}],
  walls [{a, b, thickness, kind?: wall|rail,
  extend?}] or "auto", openings [{wall, at, width, type: door|window|slider} or {x, y, width, type}],
  furniture [{type, x, y, w, d, rot}] (x, y: top-left of its footprint; w along its back; rot
  clockwise, 0 = back at the top), stairs [{poly, steps, direction} or {treads, path}],
  dashed [[[x, y], ...]], texts [{text, at}], notes [str], site [{poly, floor?, roof?}] (an upper floor:
  what lies below it, the ground's garden, paving or roof, drawn faded and unlabelled where no room covers it).
An image under COMPACT_BELOW px tall (the studio's panel) gets slimmer margins and no notes line; a label
that cannot fit its room drops its size line, and labels keep clear of each other.
Budget (28 Oct 2026 laptop, 8 GB, no GPU): the 50 x 40 ft sample floors in 0.5-0.7 s and about
150 MB of RAM each, a Compass floor in 0.3-0.5 s; tests/test_plan25d.py checks both.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import pathlib
import random
import sys

# One BLAS thread, as the floor-plan service sets: numpy otherwise reserves a buffer per CPU thread
# (about 225 MB of commit on the 8 GB laptop) that a few small arrays never use.
for _threads in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS'):
    os.environ.setdefault(_threads, '1')

import cairo  # noqa: E402
import numpy as np  # noqa: E402
import shapely  # noqa: E402
from PIL import Image, ImageFilter  # noqa: E402
from shapely.geometry import LineString, Point, Polygon, box  # noqa: E402
from shapely.ops import polylabel, unary_union  # noqa: E402

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import compass_text as text  # noqa: E402
import plan25d_furniture as furniture  # noqa: E402
from plan25d_furniture import mix, rgb  # noqa: E402

PNG_LEVEL = 1                   # The fastest zlib: larger files, several times quicker than the default 6.
SUPERSAMPLE_UP_TO = 3_600_000   # Output pixels drawn at 2x and averaged 2x2; larger images at 1x (time, memory).
MIN_TEXT_PX = 14
MIN_TARGET_PX = 64          # The smallest room gaze target on screen (the app's buttons are 80 px or more).
NAME_PX, SIZE_PX, ROAD_PX, NOTE_PX, TITLE_PX = 19, 14, 17, 15, 18
MARGIN = {'top': 86, 'bottom': 104, 'side': 66}
COMPACT_MARGIN = {'top': 58, 'bottom': 66, 'side': 40}
COMPACT_BELOW = 760           # Output height under which the compact margins are used.
SITE_FADE = .55               # How far the ground below an upper floor fades toward the page.
WALL_HEIGHT = .22          # How far a cut wall's front face shows, in feet of plan.
EXTERIOR, INTERIOR, RAIL = .5, .34, .2
VOID_SHADE = .26           # How much darker the floor below shows through an open void.   # Drawn thicknesses (ft): slimmer than built walls, as a model reads.
INDOOR_FLOORS = {'wood', 'tile', 'wet', 'void'}

THEMES = {
    'light': dict(
        page='#E4E2DB', glow='#ECEBE5', paving='#D9D7D0', joint='#C8C6BE', plot_edge='#C3C0B6',
        wood='#D9B48F', wood_light='#E3C19E', wood_dark='#CFA983', seam='#B9926D',
        tile='#E6E2DA', grout='#D3CEC5', wet='#C9D3D1', wet_grout='#B3BFBD',
        deck='#D6AE88', deck_seam='#AE8461', stone='#E2D3C4', stone_joint='#D0C0AF',
        grass='#CBD6BC', grass_dot='#B6C4A3', void='#56544E',
        wall_top='#6B7573', wall_side='#59635F', wall_edge='#86908E', sill='#A9B1AE',
        glass='#C9D6D6', glass_hi='#F4F8F8', rail='#B8865F', tread='#D9B38E', tread_dark='#C9A07A',
        ink='#34403E', ink_soft='#4F5C59', arrow='#2F4A44', shadow='#33322C', dash='#55635F',
        halo='#F3EFE7'),
    'dark': dict(
        page='#14181B', glow='#1B2024', paving='#22282B', joint='#2E3539', plot_edge='#384046',
        wood='#6E5644', wood_light='#7A604C', wood_dark='#634D3D', seam='#4C3B2F',
        tile='#3A4144', grout='#31373A', wet='#33424A', wet_grout='#2A363D',
        deck='#634D3C', deck_seam='#46372B', stone='#4A4440', stone_joint='#3D3835',
        grass='#2F3B2F', grass_dot='#3A4A39', void='#0B0D0F',
        wall_top='#A9B4B2', wall_side='#7C8786', wall_edge='#C3CCCA', sill='#6E7877',
        glass='#7F9AA3', glass_hi='#C5D6DA', rail='#9C7352', tread='#7A604C', tread_dark='#695240',
        ink='#EEF2F1', ink_soft='#C8D0CE', arrow='#CFE3DC', shadow='#000000', dash='#9AA8A5',
        halo='#1E2427'),
}
FLOOR_BASE = {'wood': 'wood', 'tile': 'tile', 'wet': 'wet', 'deck': 'deck', 'stone': 'stone', 'grass': 'grass',
              'void': 'void'}


# ── Small helpers ─────────────────────────────────────────────────────────────────────

def seeded(*parts):
    digest = hashlib.sha256('|'.join(str(p) for p in parts).encode('utf-8')).hexdigest()
    return random.Random(int(digest[:16], 16))


def luminance(colour):
    def lin(v):
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in rgb(colour))
    return .2126 * r + .7152 * g + .0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + .05) / (lb + .05)


def fmt_ft(v):
    return f"{round(v)}" if abs(v - round(v)) < .13 else f"{v:.1f}"


def path(c, points, close=True):
    c.new_path()
    for i, (x, y) in enumerate(points):
        (c.move_to if i == 0 else c.line_to)(x, y)
    if close:
        c.close_path()


def poly_of(points):
    p = Polygon(points)
    return p if p.is_valid else p.buffer(0)


def is_rectangle(points):
    if len(points) != 4:
        return False
    xs, ys = sorted({round(x, 3) for x, _ in points}), sorted({round(y, 3) for _, y in points})
    return len(xs) == 2 and len(ys) == 2


# ── Plan normalising ──────────────────────────────────────────────────────────────────

SHARED = ('plot', 'roads', 'north_deg', 'notes', 'scale_ft')


def floors_of(plan):
    """The floors of a plan, each with the shared keys it does not override."""
    if 'floors' not in plan:
        return [plan]
    out = []
    for floor in plan['floors']:
        merged = {k: plan[k] for k in SHARED if k in plan}
        merged.update(floor)
        out.append(merged)
    return out


def room_indoor(room):
    return room.get('indoor', room.get('floor', 'tile') in INDOOR_FLOORS)


def auto_walls(rooms):
    """Walls along the edges of indoor rooms: exterior where the footprint ends, partitions between
    rooms, none between two rooms marked open, a timber rail round a void."""
    indoor = [(r, poly_of(r['poly'])) for r in rooms if room_indoor(r)]
    if not indoor:
        return []
    footprint = unary_union([p for _, p in indoor])
    edges = unary_union([LineString(list(p.exterior.coords)) for _, p in indoor])
    segments = []
    for line in getattr(edges, 'geoms', [edges]):
        cs = list(line.coords)
        for a, b in zip(cs, cs[1:]):
            if math.dist(a, b) > 1e-6:
                segments.append((a, b))
    walls = []
    for a, b in segments:
        mid = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        touching = [r for r, p in indoor if p.boundary.distance(mid) < 1e-6]
        exterior = footprint.boundary.distance(mid) < 1e-6
        voids = [r for r in touching if r.get('floor') == 'void']
        others = [r for r in touching if r.get('floor') != 'void']
        if voids and all(r.get('open') for r in others) and not (exterior and others):
            walls.append({'a': a, 'b': b, 'thickness': RAIL, 'kind': 'rail'})       # the edge of an open void
        elif not exterior and len(touching) >= 2 and all(r.get('open') for r in touching):
            continue                                                                 # one open space
        else:
            walls.append({'a': a, 'b': b, 'thickness': EXTERIOR if exterior else INTERIOR})
    return merge_collinear(walls)


def merge_collinear(walls):
    """Joins touching pieces of the same horizontal or vertical line with the same thickness."""
    groups, other = {}, []
    for w in walls:
        (ax, ay), (bx, by) = w['a'], w['b']
        if abs(ay - by) < 1e-6:
            groups.setdefault(('h', round(ay, 4), w['thickness'], w.get('kind', 'wall')), []).append((min(ax, bx), max(ax, bx)))
        elif abs(ax - bx) < 1e-6:
            groups.setdefault(('v', round(ax, 4), w['thickness'], w.get('kind', 'wall')), []).append((min(ay, by), max(ay, by)))
        else:
            other.append(w)
    out = []
    for (orient, at, t, kind), spans in sorted(groups.items()):
        spans.sort()
        merged = [list(spans[0])]
        for lo, hi in spans[1:]:
            if lo <= merged[-1][1] + 1e-6:
                merged[-1][1] = max(merged[-1][1], hi)
            else:
                merged.append([lo, hi])
        for lo, hi in merged:
            a, b = ((lo, at), (hi, at)) if orient == 'h' else ((at, lo), (at, hi))
            out.append({'a': a, 'b': b, 'thickness': t, **({'kind': kind} if kind != 'wall' else {})})
    return out + other


def resolve_openings(walls, openings):
    """Openings given by a point find their wall; the result is {wall index: [(lo, hi, type)]}."""
    by_wall = {}
    for o in openings or []:
        width = float(o.get('width', 3.))
        if 'wall' in o:
            i, at = int(o['wall']), float(o.get('at', 0.))
        else:
            p = Point(o['x'], o['y'])
            best = None
            for j, w in enumerate(walls):
                d = LineString([w['a'], w['b']]).distance(p)
                if best is None or d < best[0]:
                    best = (d, j)
            if best is None or best[0] > 1.5:
                continue
            i = best[1]
            line = LineString([walls[i]['a'], walls[i]['b']])
            at = line.project(p) - width / 2
        if 0 <= i < len(walls):
            by_wall.setdefault(i, []).append((at, at + width, o.get('type', 'door')))
    return by_wall


def wall_pieces(walls, cuts):
    """(kind, polygon, wall) for every solid piece, sill, slider and rail; doors are gaps."""
    pieces = []
    for i, w in enumerate(walls):
        (ax, ay), (bx, by) = w['a'], w['b']
        length = math.hypot(bx - ax, by - ay)
        if length < 1e-6:
            continue
        ux, uy = (bx - ax) / length, (by - ay) / length
        nx, ny = -uy, ux
        t = float(w.get('thickness', INTERIOR))
        ext = float(w.get('extend', t / 2))

        def rect(u0, u1, width=t):
            h = width / 2
            return [(ax + ux * u0 + nx * h, ay + uy * u0 + ny * h), (ax + ux * u1 + nx * h, ay + uy * u1 + ny * h),
                    (ax + ux * u1 - nx * h, ay + uy * u1 - ny * h), (ax + ux * u0 - nx * h, ay + uy * u0 - ny * h)]
        kind = w.get('kind', 'wall')
        pos = -ext
        for lo, hi, otype in sorted(cuts.get(i, [])):
            lo, hi = max(lo, -ext), min(hi, length + ext)
            if hi <= lo:
                continue
            if lo > pos + 1e-6:
                pieces.append((kind, rect(pos, lo), w))
            if otype in ('window', 'slider'):
                pieces.append((otype, rect(lo, hi), w))
                pieces.append((otype + '-glass', rect(lo, hi, max(.12, t * .3)), w))
            pos = max(pos, hi)
        if length + ext > pos + 1e-6:
            pieces.append((kind, rect(pos, length + ext), w))
    return pieces


def stair_treads(stair):
    """Tread polygons and the walking path of a stair given by a polygon, a step count and a direction."""
    if 'treads' in stair:
        return [list(map(tuple, t)) for t in stair['treads']], [tuple(p) for p in stair.get('path', [])]
    x1, y1, x2, y2 = poly_of(stair['poly']).bounds
    dx, dy = stair.get('direction', (0, -1))
    n = max(2, int(stair.get('steps', 12)))
    treads = []
    along_y = abs(dy) >= abs(dx)
    for k in range(n):
        if along_y:
            a, b = y1 + (y2 - y1) * k / n, y1 + (y2 - y1) * (k + 1) / n
            treads.append([(x1, a), (x2, a), (x2, b), (x1, b)])
        else:
            a, b = x1 + (x2 - x1) * k / n, x1 + (x2 - x1) * (k + 1) / n
            treads.append([(a, y1), (b, y1), (b, y2), (a, y2)])
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    if along_y:
        start, end = ((cx, y2 - .4), (cx, y1 + .4)) if dy < 0 else ((cx, y1 + .4), (cx, y2 - .4))
    else:
        start, end = ((x2 - .4, cy), (x1 + .4, cy)) if dx < 0 else ((x1 + .4, cy), (x2 - .4, cy))
    return treads, [tuple(p) for p in stair.get('path') or [start, end]]


# ── Drawing ───────────────────────────────────────────────────────────────────────────

class Canvas:
    """Feet to pixels: the drawing area sits inside fixed margins; ss is the supersampling factor."""

    def __init__(self, floor, width_px, height_px):
        plot = floor.get('plot') or {}
        xs = [x for r in floor.get('rooms', []) for x, _ in r['poly']] or [0]
        ys = [y for r in floor.get('rooms', []) for _, y in r['poly']] or [0]
        self.pw = float(plot.get('width', max(xs)))
        self.pd = float(plot.get('depth', max(ys)))
        self.compact = height_px is not None and height_px < COMPACT_BELOW
        self.margin = COMPACT_MARGIN if self.compact else MARGIN
        side, top, bottom = self.margin['side'], self.margin['top'], self.margin['bottom']
        k = (width_px - 2 * side) / self.pw
        if height_px is not None:
            k = min(k, (height_px - top - bottom) / self.pd)
        self.k = k
        self.width = int(width_px)
        self.height = int(height_px if height_px is not None else round(top + self.pd * k + bottom))
        self.left = (self.width - self.pw * k) / 2
        self.top = top if height_px is None else top + max(0., (self.height - top - bottom - self.pd * k) / 2)
        self.ss = 2 if self.width * self.height <= SUPERSAMPLE_UP_TO else 1

    def px(self, x, y):
        """Output pixels (not supersampled)."""
        return self.left + x * self.k, self.top + y * self.k

    def feet(self, c, factor=1.):
        c.identity_matrix()
        c.scale(self.ss * factor, self.ss * factor)
        c.translate(self.left, self.top)
        c.scale(self.k, self.k)

    def device(self, c):
        c.identity_matrix()
        c.scale(self.ss, self.ss)


def blurred_mask(cv, draw_shapes, layers, factor=.25):
    """One soft shadow mask from shapes cast in several layers [(blur ft, offset ft, strength)]:
    drawn small (shadows are soft anyway), blurred, combined, stretched smoothly when laid down."""
    w, h = max(1, math.ceil(cv.width * cv.ss * factor)), max(1, math.ceil(cv.height * cv.ss * factor))
    light = np.ones((h, w), dtype=np.float32)                    # how much light each pixel still gets
    stride = cairo.ImageSurface.format_stride_for_width(cairo.FORMAT_A8, w)
    for blur_ft, offset_ft, strength in layers:
        surface = cairo.ImageSurface(cairo.FORMAT_A8, w, h)
        m = cairo.Context(surface)
        cv.feet(m, factor)
        m.translate(*offset_ft)
        draw_shapes(m)
        surface.flush()
        img = Image.frombuffer('L', (w, h), bytes(surface.get_data()), 'raw', 'L', stride, 1)
        img = img.filter(ImageFilter.GaussianBlur(max(.5, blur_ft * cv.k * cv.ss * factor)))
        light *= 1. - strength * np.asarray(img, dtype=np.float32) / 255.
    alpha = np.zeros((h, stride), dtype=np.uint8)
    alpha[:, :w] = np.round((1. - light) * 255.).astype(np.uint8)
    data = bytearray(alpha.tobytes())
    small = cairo.ImageSurface.create_for_data(data, cairo.FORMAT_A8, w, h, stride)
    pattern = cairo.SurfacePattern(small)
    pattern.set_matrix(cairo.Matrix(xx=factor, yy=factor))
    pattern.set_filter(cairo.FILTER_BILINEAR)
    return pattern, (data, small)


def apply_shadow(c, cv, mask, colour, boxes=None, ring=None, holes=()):
    """Lays the mask down in the shadow colour only where it can show: inside `boxes` (feet bounds,
    each a rectangle), or around `ring` (feet bounds) outside the `holes` polygons that will cover it."""
    pattern, _keep = mask
    c.save()
    if boxes or ring:
        cv.feet(c)
        if ring:
            x1, y1, x2, y2 = ring
            c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
            c.rectangle(x1, y1, x2 - x1, y2 - y1)
            for hole in holes:
                path(c, hole)
                c.new_sub_path()
        else:
            for x1, y1, x2, y2 in boxes:
                c.rectangle(x1, y1, x2 - x1, y2 - y1)
        c.clip()
    c.identity_matrix()
    c.set_source_rgb(*rgb(colour))
    c.mask(pattern)
    c.restore()


def floor_colour(room, kind, T):
    """A room's floor colour: its tint when it has one (a dark version of it on a dark page), else
    the theme's colour for its material."""
    tint = room.get('tint')
    if not tint:
        return T[FLOOR_BASE.get(kind, 'tile')]
    return tint if luminance(T['page']) > .3 else mix(T[FLOOR_BASE.get(kind, 'tile')], tint, .22)


def paint_pattern(c, room, kind, T, rng):
    """The floor material inside the current clip, in feet."""
    x1, y1, x2, y2 = poly_of(room['poly']).bounds
    base = floor_colour(room, kind, T)
    path(c, room['poly'])
    c.set_source_rgb(*rgb(base))
    c.fill()
    if kind in ('wood', 'deck'):
        along_x = room.get('planks', 'x' if (x2 - x1) >= (y2 - y1) else 'y') == 'x'
        width = .5 if kind == 'wood' else .58
        span = (y1, y2) if along_x else (x1, x2)
        length = (x1, x2) if along_x else (y1, y2)
        seam = T['seam'] if kind == 'wood' else T['deck_seam']
        planks = []
        v = span[0]
        while v < span[1]:
            u = length[0] - rng.uniform(0, 4.5)
            while u < length[1]:
                plank = rng.uniform(3., 6.) if kind == 'wood' else rng.uniform(6., 10.)
                tone = mix(base, T['wood_light'] if rng.random() < .5 else T['wood_dark'], rng.uniform(0., .4))
                rx, ry, rw, rh = (u, v, plank, width) if along_x else (v, u, width, plank)
                c.rectangle(rx, ry, rw, rh)
                c.set_source_rgb(*rgb(tone))
                c.fill()
                planks.append((rx, ry, rw, rh, rng.uniform(.2, .8)))
                u += plank
            v += width
        for rx, ry, rw, rh, g in planks:                          # one faint grain line in each plank
            if along_x:
                c.move_to(rx + .3, ry + rh * g); c.line_to(rx + rw - .3, ry + rh * g)
            else:
                c.move_to(rx + rw * g, ry + .3); c.line_to(rx + rw * g, ry + rh - .3)
        c.set_source_rgba(*rgb(seam), .12); c.set_line_width(.025); c.stroke()
        for rx, ry, rw, rh, _ in planks:                          # and the seams between them
            c.rectangle(rx, ry, rw, rh)
        c.set_source_rgba(*rgb(seam), .5 if kind == 'wood' else .7)
        c.set_line_width(.028 if kind == 'wood' else .05)
        c.stroke()
    elif kind in ('tile', 'wet'):
        size = 2. if kind == 'tile' else 1.
        grout = T['grout'] if kind == 'tile' else T['wet_grout']
        y = y1
        while y < y2:
            x = x1
            while x < x2:
                c.rectangle(x, y, size, size)
                c.set_source_rgb(*rgb(mix(base, '#FFFFFF' if rng.random() < .5 else '#000000', rng.uniform(0, .025))))
                c.fill()
                x += size
            y += size
        c.set_source_rgba(*rgb(grout), .9)
        c.set_line_width(.03)
        x = x1
        while x <= x2 + 1e-6:
            c.move_to(x, y1); c.line_to(x, y2); x += size
        y = y1
        while y <= y2 + 1e-6:
            c.move_to(x1, y); c.line_to(x2, y); y += size
        c.stroke()
    elif kind == 'stone':
        paver(c, (x1, y1, x2, y2), base, T['stone_joint'], rng)
    elif kind == 'grass':
        for _ in range(int((x2 - x1) * (y2 - y1) * 1.2)):
            x, y = rng.uniform(x1, x2), rng.uniform(y1, y2)
            c.new_sub_path(); c.arc(x, y, rng.uniform(.05, .14), 0, 2 * math.pi)
            c.set_source_rgba(*rgb(T['grass_dot']), rng.uniform(.25, .6)); c.fill()


def paver(c, bounds, base, joint, rng, size=(2., 1.)):
    """Pavers in running bond: each with its own faint tone, the joints stroked once."""
    x1, y1, x2, y2 = bounds
    pw, ph = size
    pieces = []
    row = 0
    y = y1
    while y < y2:
        x = x1 - (pw / 2 if row % 2 else 0)
        while x < x2:
            c.rectangle(x, y, pw, ph)
            c.set_source_rgb(*rgb(mix(base, '#FFFFFF' if rng.random() < .5 else '#000000', rng.uniform(0, .03))))
            c.fill()
            pieces.append((x, y))
            x += pw
        y += ph
        row += 1
    for x, y in pieces:
        c.rectangle(x, y, pw, ph)
    c.set_source_rgba(*rgb(joint), .85)
    c.set_line_width(.035)
    c.stroke()


def item_frame(item):
    """Centre, size (w along the back, d deep) and turn of a furniture item."""
    w, d, rot = float(item['w']), float(item['d']), float(item.get('rot', 0)) % 360
    a = math.radians(rot)
    bw, bh = abs(w * math.cos(a)) + abs(d * math.sin(a)), abs(w * math.sin(a)) + abs(d * math.cos(a))
    return float(item['x']) + bw / 2, float(item['y']) + bh / 2, w, d, a, (bw, bh)


def furniture_outline(item):
    cx, cy, w, d, _, (bw, bh) = item_frame(item)
    return box(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)


def draw_item(c, item, theme):
    cx, cy, w, d, a, _ = item_frame(item)
    c.save()
    c.translate(cx, cy)
    c.rotate(a)
    c.translate(-w / 2, -d / 2)
    furniture.draw(c, item['type'], w, d, theme)
    c.restore()


def item_shadow(m, item):
    cx, cy, w, d, a, _ = item_frame(item)
    m.save()
    m.translate(cx, cy)
    m.rotate(a)
    m.translate(-w / 2, -d / 2)
    for shape in furniture.footprint(item['type'], w, d):
        if shape[0] == 'round':
            m.new_sub_path()
            m.arc(shape[1], shape[2], shape[3], 0, 2 * math.pi)
        else:
            furniture.rrect(m, *shape[1:])
    m.restore()
    m.fill()


def label_block(lines, k):
    """A label block's width and height in feet, with a little air."""
    return (max(text.width(s, size, False) for s, size in lines) / k + .3,
            sum(size * 1.25 for _, size in lines) / k + .2)


def overlap(box_, boxes):
    """The area (feet²) a box shares with any of the boxes."""
    x1, y1, x2, y2 = box_
    return sum(max(0., min(x2, b[2]) - max(x1, b[0])) * max(0., min(y2, b[3]) - max(y1, b[1])) for b in boxes)


def place_label(room, lines, k, obstacles, labels=()):
    """Where the label block's centre goes (feet): inside the room, clear of furniture, stairs and the
    labels already placed, as near its middle as that allows."""
    p = poly_of(room['poly'])
    if 'label_at' in room:
        return tuple(room['label_at'])
    bw, bh = label_block(lines, k)
    inner = p.buffer(-.45) if p.buffer(-.45).area > 0 else p
    try:
        centre = polylabel(inner, .1) if not is_rectangle(room['poly']) else p.centroid
    except Exception:
        centre = p.representative_point()
    x1, y1, x2, y2 = inner.bounds
    steps = 12
    X, Y = (a.ravel() for a in np.meshgrid(np.linspace(x1, x2, steps + 1), np.linspace(y1, y2, steps + 1), indexing='ij'))
    area = bw * bh
    outside = shapely.area(shapely.difference(shapely.box(X - bw / 2, Y - bh / 2, X + bw / 2, Y + bh / 2), inner)) / area
    hit = np.zeros_like(X)
    if obstacles:
        O = np.asarray(obstacles, dtype=float)
        ix = np.clip(np.minimum(X[:, None] + bw / 2, O[None, :, 2]) - np.maximum(X[:, None] - bw / 2, O[None, :, 0]), 0, None)
        iy = np.clip(np.minimum(Y[:, None] + bh / 2, O[None, :, 3]) - np.maximum(Y[:, None] - bh / 2, O[None, :, 1]), 0, None)
        hit = (ix * iy).sum(axis=1) / area
    crowd = np.zeros_like(X)
    if labels:
        L = np.asarray(labels, dtype=float)
        ix = np.clip(np.minimum(X[:, None] + bw / 2, L[None, :, 2]) - np.maximum(X[:, None] - bw / 2, L[None, :, 0]), 0, None)
        iy = np.clip(np.minimum(Y[:, None] + bh / 2, L[None, :, 3]) - np.maximum(Y[:, None] - bh / 2, L[None, :, 1]), 0, None)
        crowd = (ix * iy).sum(axis=1) / area
    score = 5 * outside + 8 * hit + 30 * crowd + np.hypot(X - centre.x, Y - centre.y) / max(1., math.hypot(x2 - x1, y2 - y1))
    best = int(np.argmin(score))                          # the first of equal scores: deterministic
    return float(X[best]), float(Y[best])


def fill_height(floor, width_px):
    """The height a floor drawn `width_px` wide takes when no height is given (the plot's scale set by the width)."""
    return Canvas(floor, width_px, None).height


def render_floor(floor, width_px=1600, height_px=None, theme='light'):
    """(PNG bytes, hit map) for one floor."""
    T = THEMES[theme]
    cv = Canvas(floor, width_px, height_px)
    W, H = int(cv.width * cv.ss), int(cv.height * cv.ss)
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    c = cairo.Context(surface)
    c.set_antialias(cairo.ANTIALIAS_GOOD)
    title = floor.get('title', 'Floor')
    rooms = floor.get('rooms', [])
    walls = floor.get('walls')
    if walls in (None, 'auto'):
        walls = auto_walls(rooms)
    cuts = resolve_openings(walls, floor.get('openings'))
    pieces = wall_pieces(walls, cuts)
    items = floor.get('furniture', [])

    # Page and plot.
    c.identity_matrix()
    glow = cairo.ImageSurface(cairo.FORMAT_ARGB32, max(1, cv.width // 8), max(1, cv.height // 8))
    gc = cairo.Context(glow)                                        # the page and a soft light in the middle, drawn small
    gc.set_source_rgb(*rgb(T['page'])); gc.paint()
    cx, cy = cv.px(cv.pw / 2, cv.pd / 2)
    g = cairo.RadialGradient(cx / 8, cy / 8, 0, cx / 8, cy / 8, max(cv.width, cv.height) * .7 / 8)
    g.add_color_stop_rgba(0, *rgb(T['glow']), 1)
    g.add_color_stop_rgba(1, *rgb(T['glow']), 0)
    gc.set_source(g); gc.paint()
    glow_pattern = cairo.SurfacePattern(glow)
    glow_pattern.set_matrix(cairo.Matrix(xx=1 / (8 * cv.ss), yy=1 / (8 * cv.ss)))
    glow_pattern.set_filter(cairo.FILTER_BILINEAR)
    glow_pattern.set_extend(cairo.EXTEND_PAD)
    c.set_source(glow_pattern); c.paint()
    plot_mask = blurred_mask(cv, lambda m: (m.rectangle(0, 0, cv.pw, cv.pd), m.fill()), [(.9, (.25, .45), .16)])
    apply_shadow(c, cv, plot_mask, T['shadow'], ring=(-4, -4, cv.pw + 4, cv.pd + 4),
                 holes=[[(0, 0), (cv.pw, 0), (cv.pw, cv.pd), (0, cv.pd)]])
    cv.feet(c)
    c.save()
    c.rectangle(0, 0, cv.pw, cv.pd); c.clip()
    paver(c, (0, 0, cv.pw, cv.pd), T['paving'], T['joint'], seeded(title, 'plot'))
    for s in floor.get('site', []):                       # an upper floor: the ground below it, faded
        colour = mix(T['paving'], T['wall_side'], .3) if s.get('roof') else floor_colour(s, s.get('floor', 'stone'), T)
        path(c, s['poly']); c.set_source_rgb(*rgb(mix(colour, T['page'], SITE_FADE))); c.fill()
    c.restore()

    # The building's soft shadow on the plot.
    indoor = [poly_of(r['poly']) for r in rooms if room_indoor(r)]
    def building(m):
        for p in indoor:
            path(m, list(p.exterior.coords)); m.fill()
    if indoor:
        bx1, by1, bx2, by2 = unary_union(indoor).bounds
        footprint = unary_union(indoor)
        apply_shadow(c, cv, blurred_mask(cv, building, [(1.1, (.35, .6), .22)]), T['shadow'],
                     ring=(max(0, bx1 - 1), max(0, by1 - 1), min(cv.pw, bx2 + 3), min(cv.pd, by2 + 3)),
                     holes=[list(g.exterior.coords) for g in getattr(footprint, 'geoms', [footprint])])

    # Floors, voids with what is below, stairs, overhead lines.
    cv.feet(c)
    for n, room in enumerate(rooms):
        kind = room.get('floor', 'tile')
        c.save()
        path(c, room['poly']); c.clip()
        rng = seeded(title, room.get('id', room.get('name')), n)
        if kind == 'void':
            for below in room.get('below', {}).get('rooms', []):
                paint_pattern(c, below, below.get('floor', 'tile'), T, seeded(title, 'below', below.get('name')))
            for item in room.get('below', {}).get('furniture', []):
                draw_item(c, item, theme)
            path(c, room['poly'])
            c.set_source_rgba(*rgb(T['void']), VOID_SHADE); c.fill()
        else:
            paint_pattern(c, room, kind, T, rng)
        c.restore()
    stair_lines = []
    for s in floor.get('stairs', []):
        treads, walk = stair_treads(s)
        for i, t in enumerate(treads):
            path(c, t)
            c.set_source_rgb(*rgb(T['tread'] if i % 2 == 0 else T['tread_dark'])); c.fill_preserve()
            c.set_source_rgba(*rgb(T['seam']), .55); c.set_line_width(.03); c.stroke()
        stair_lines.append((walk, s))
    for d in floor.get('dashed', []):
        path(c, d, close=len(d) > 2 and d[0] == d[-1])
        c.set_dash([.45, .3]); c.set_source_rgba(*rgb(T['dash']), .85); c.set_line_width(.06); c.stroke()
        c.set_dash([])

    # Shadows of the furniture and the cut walls: a wide soft one and a tight contact one.
    solid = [poly for kind, poly, _ in pieces if kind in ('wall',)]
    def standing(m):
        for item in items:
            item_shadow(m, item)
        for poly in solid:
            path(m, poly); m.fill()
    casters = [furniture_outline(i).bounds for i in items if i['type'] not in furniture.FLAT]
    casters += [poly_of(poly).bounds for poly in solid]
    if casters:
        apply_shadow(c, cv, blurred_mask(cv, standing, [(.5, (.22, .36), .2), (.14, (.06, .1), .2)]),
                     T['shadow'], boxes=[(x1 - .3, y1 - .3, x2 + 1.4, y2 + 1.6) for x1, y1, x2, y2 in casters])

    # Furniture, then the walls over it.
    cv.feet(c)
    for item in items:
        draw_item(c, item, theme)
    h = WALL_HEIGHT
    for kind, poly, _ in pieces:
        if kind in ('wall', 'window', 'slider'):
            raise_by = h if kind == 'wall' else h * .4
            hull = poly_of(poly + [(x, y + raise_by) for x, y in poly]).convex_hull
            path(c, list(hull.exterior.coords))
            c.set_source_rgb(*rgb(T['wall_side'] if kind == 'wall' else mix(T['wall_side'], T['page'], .35))); c.fill()
    for kind, poly, _ in pieces:
        if kind == 'wall':
            path(c, poly)
            c.set_source_rgb(*rgb(T['wall_top'])); c.fill_preserve()
            c.set_source_rgba(*rgb(T['wall_edge']), .55); c.set_line_width(.03); c.stroke()
        elif kind in ('window', 'slider'):
            path(c, poly); c.set_source_rgb(*rgb(T['sill'])); c.fill()
        elif kind in ('window-glass', 'slider-glass'):
            path(c, poly); c.set_source_rgb(*rgb(T['glass'])); c.fill_preserve()
            c.set_source_rgba(*rgb(T['glass_hi']), .9); c.set_line_width(.025); c.stroke()
            if kind == 'slider-glass':
                (x1, y1), (x2, y2), (x3, y3), (x4, y4) = poly
                c.move_to((x1 + x4) / 2, (y1 + y4) / 2); c.line_to((x2 + x3) / 2, (y2 + y3) / 2)
                c.set_source_rgba(*rgb(T['rail']), .9); c.set_line_width(.03); c.stroke()
        elif kind == 'rail':
            path(c, poly); c.set_source_rgb(*rgb(T['rail'])); c.fill_preserve()
            c.set_source_rgba(*rgb(T['glass_hi']), .5); c.set_line_width(.02); c.stroke()

    # Stair walking lines.
    for walk, s in stair_lines:
        if len(walk) < 2:
            continue
        path(c, walk, close=False)
        c.set_source_rgb(*rgb(T['arrow'])); c.set_line_width(.075); c.set_line_join(1); c.stroke()
        (x1, y1), (x2, y2) = walk[-2], walk[-1]
        a = math.atan2(y2 - y1, x2 - x1)
        for side in (-1, 1):
            c.move_to(x2, y2)
            c.line_to(x2 - .55 * math.cos(a + side * .5), y2 - .55 * math.sin(a + side * .5))
        c.set_line_width(.075); c.stroke()
        c.new_sub_path(); c.arc(*walk[0], .14, 0, 2 * math.pi); c.fill()

    # Labels, kept clear of furniture and stairs, each checked against its floor.
    obstacles = [furniture_outline(i).bounds for i in items if i['type'] not in furniture.FLAT]
    obstacles += [poly_of(t).bounds for s in floor.get('stairs', []) for t in stair_treads(s)[0]]
    hit = {'floor': title, 'width': cv.width, 'height': cv.height, 'rooms': [], 'min_text_px': MIN_TEXT_PX}
    placed = []                                    # label boxes so far (feet), for the next labels to avoid
    cv.device(c)
    for n, room in enumerate(rooms):
        p = poly_of(room['poly'])
        name = room.get('name', '')
        x1, y1, x2, y2 = p.bounds
        lines = []
        if name and room.get('label', True):
            size = NAME_PX
            limit = (x2 - x1) * cv.k * .92
            label = name
            while text.width(label, size) > limit and size > 15:
                size -= 1
            if text.width(label, size) > limit and room.get('short'):
                label = room['short']
            lines.append((label, size))
        dims = room.get('size') if room.get('label', True) else None
        if dims is None and room.get('label', True) and is_rectangle(room['poly']) and room.get('show_size', (x2 - x1) * (y2 - y1) >= 70) \
                and room.get('floor') != 'void':
            dims = [x2 - x1, y2 - y1]
        if dims:
            lines.append((dims if isinstance(dims, str) else f"{fmt_ft(dims[0])} ft × {fmt_ft(dims[1])} ft", SIZE_PX))
        base = floor_colour(room, room.get('floor', 'tile'), T)
        if room.get('floor') == 'void':
            base = mix(T['tile'], T['void'], VOID_SHADE)
        ink = T['ink'] if contrast(T['ink'], base) >= contrast(T['halo'], base) else T['halo']
        entry = {'id': room.get('id', name), 'name': name,
                 'polygon': [[round(v, 1) for v in cv.px(x, y)] for x, y in p.exterior.coords][:-1]}
        mrr = p.minimum_rotated_rectangle
        sides = [math.dist(a, b) for a, b in zip(list(mrr.exterior.coords), list(mrr.exterior.coords)[1:])]
        entry['min_side_px'] = round(min(sides) * cv.k, 1) if sides else 0
        if len(lines) == 2:                         # a size line that cannot fit the room is left out
            bw, bh = label_block(lines, cv.k)
            if bw > (x2 - x1) * .96 or bh > (y2 - y1) * .9:
                lines = lines[:1]
        if lines:
            lx, ly = place_label(room, lines, cv.k, obstacles, placed)
            bw, bh = label_block(lines, cv.k)
            if len(lines) == 2 and overlap((lx - bw / 2, ly - bh / 2, lx + bw / 2, ly + bh / 2), placed) > 0:
                lines = lines[:1]                   # crowded by a neighbour's label: the name alone
                lx, ly = place_label(room, lines, cv.k, obstacles, placed)
                bw, bh = label_block(lines, cv.k)
            gx, gy = 12 / cv.k, 4 / cv.k                # air between neighbouring labels, so two never read as one
            placed.append((lx - bw / 2 - gx, ly - bh / 2 - gy, lx + bw / 2 + gx, ly + bh / 2 + gy))
            px_, py_ = cv.px(lx, ly)
            block = sum(s * 1.25 for _, s in lines)
            y = py_ - block / 2
            widths = []
            for label, size in lines:
                y += size * 1.05
                text.draw(c, px_, y, label, size, rgb(ink), anchor='center', halo=(*rgb(base), .92), spread=3.2)
                widths.append(text.width(label, size))
                y += size * .2
            bw = max(widths)
            entry['label_box'] = [round(px_ - bw / 2, 1), round(py_ - block / 2, 1), round(bw, 1), round(block, 1)]
            entry['contrast'] = round(contrast(ink, base), 2)
            entry['text_px'] = min(s for _, s in lines)
        # The gaze target: the room itself, or, for a room thinner than MIN_TARGET_PX on screen (a
        # 2 ft gully), a box that size around its label, kept on the image.
        if entry['min_side_px'] >= MIN_TARGET_PX:
            xs, ys = [q[0] for q in entry['polygon']], [q[1] for q in entry['polygon']]
            target = [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)]
        else:
            cx_, cy_ = ((entry['label_box'][0] + entry['label_box'][2] / 2, entry['label_box'][1] + entry['label_box'][3] / 2)
                        if 'label_box' in entry else cv.px(*poly_of(room['poly']).representative_point().coords[0]))
            tw = max(MIN_TARGET_PX, entry['label_box'][2] + 8 if 'label_box' in entry else 0)
            tx = min(max(0., cx_ - tw / 2), cv.width - tw)
            ty = min(max(0., cy_ - MIN_TARGET_PX / 2), cv.height - MIN_TARGET_PX)
            target = [tx, ty, tw, MIN_TARGET_PX]
        entry['target'] = [round(v, 1) for v in target]
        entry['gaze_ok'] = target[2] >= MIN_TARGET_PX and target[3] >= MIN_TARGET_PX
        hit['rooms'].append(entry)
    for note in floor.get('texts', []):                                    # e.g. Start / Arrive on a stair
        x, y = cv.px(*note['at'])
        size = max(MIN_TEXT_PX, int(note.get('size', 15)))
        text.draw(c, x, y, note['text'], size, rgb(T['ink']), anchor='center', halo=(*rgb(T['halo']), .9), spread=3.)

    annotate(c, cv, floor, T, title)
    surface.flush()
    img = Image.frombuffer('RGBA', (W, H), bytes(surface.get_data()), 'raw', 'BGRA', surface.get_stride(), 1).convert('RGB')
    surface.finish()
    if cv.ss == 2:
        img = img.reduce(2)                                          # 2x2 averaging: plain supersampling
    out = io.BytesIO()
    img.save(out, 'PNG', compress_level=PNG_LEVEL)
    return out.getvalue(), hit


EDGES = {0: 'top', 90: 'right', 180: 'bottom', 270: 'left'}
DIRECTIONS = {'north': 0, 'east': 90, 'south': 180, 'west': 270}


def road_edge(side, north_deg):
    side = side.lower()
    if side in ('top', 'right', 'bottom', 'left'):
        return side
    return EDGES[round(((DIRECTIONS.get(side, 0) + north_deg) % 360) / 90) * 90 % 360]


def annotate(c, cv, floor, T, title):
    """Title, road names on their edges, the north arrow, a scale bar and the notes line."""
    cv.device(c)
    ink, soft = rgb(T['ink']), rgb(T['ink_soft'])
    north = float(floor.get('north_deg', 0))
    side = cv.margin['side']
    text.draw(c, max(24., side * .55), 40, title, TITLE_PX, ink)
    x0, y0 = cv.px(0, 0)
    x1, y1 = cv.px(cv.pw, cv.pd)
    for road in floor.get('roads', []):
        edge = road_edge(road.get('side', 'bottom'), north)
        label = road.get('label', '')
        if edge in ('top', 'bottom'):
            y = y0 - 26 if edge == 'top' else y1 + 34
            w = text.width(label, ROAD_PX)
            text.draw(c, (x0 + x1) / 2 + 12, y, label, ROAD_PX, ink, anchor='center')
            ax, ay = (x0 + x1) / 2 - w / 2 - 12, y - ROAD_PX * .35
            arrow(c, ax, ay, 0 if edge == 'top' else 180, 12, ink)
        else:
            x = x1 + 30 if edge == 'right' else x0 - 30
            c.save()
            c.translate(x, (y0 + y1) / 2)
            c.rotate(math.pi / 2 if edge == 'right' else -math.pi / 2)
            text.draw(c, 0, ROAD_PX * .35, label, ROAD_PX, ink, anchor='center')
            c.restore()
    # North arrow, top right.
    nx, ny = cv.width - max(24., side * .55) - 14, 36
    c.new_sub_path(); c.arc(nx, ny, 17, 0, 2 * math.pi)
    c.set_source_rgba(*soft, .6); c.set_line_width(1.2); c.stroke()
    arrow(c, nx, ny, north, 13, ink, head=True)
    text.draw(c, nx - 34, ny + 6, 'N', 15, ink, bold=True, anchor='center')
    # Scale bar, bottom right.
    nice = next((v for v in (1, 2, 5, 10, 20, 25, 50, 100) if v * cv.k >= 70), 100)
    length = nice * cv.k
    bx, by = cv.width - max(24., side * .55) - length, cv.height - (40 if cv.compact else 52)
    c.move_to(bx, by); c.line_to(bx + length, by)
    for x in (bx, bx + length):
        c.move_to(x, by - 6); c.line_to(x, by + 6)
    c.set_source_rgb(*ink); c.set_line_width(1.6); c.stroke()
    text.draw(c, bx + length / 2, by + 22, f"{nice} ft", SIZE_PX, ink, anchor='center')
    notes = ' · '.join(floor.get('notes', []))
    if notes and not cv.compact:
        text.draw(c, cv.width / 2, cv.height - 26, notes, NOTE_PX, soft, anchor='center')


def arrow(c, x, y, angle_deg, length, colour, head=True):
    """An arrow centred on (x, y) pointing angle_deg clockwise from up."""
    a = math.radians(angle_deg)
    dx, dy = math.sin(a), -math.cos(a)
    sx, sy = x - dx * length / 2, y - dy * length / 2
    ex, ey = x + dx * length / 2, y + dy * length / 2
    c.move_to(sx, sy); c.line_to(ex, ey)
    if head:
        for side in (-1, 1):
            b = a + side * 2.6
            c.move_to(ex, ey); c.line_to(ex + math.sin(b) * 6, ey - math.cos(b) * 6)
    c.set_source_rgb(*colour); c.set_line_width(1.7); c.set_line_cap(1); c.stroke()


# ── Files ─────────────────────────────────────────────────────────────────────────────

def slug(name):
    return ''.join(ch if ch.isalnum() else '-' for ch in name.lower()).strip('-') or 'floor'


def render_plan_25d(plan, out_path, width_px=1600, theme='light'):
    """Writes one PNG per floor (and a .hitmap.json beside each); returns the path, or the list of
    paths for a plan with several floors (out-<floor>.png)."""
    out_path = pathlib.Path(out_path)
    floors = floors_of(plan)
    written = []
    for floor in floors:
        target = out_path if len(floors) == 1 else out_path.with_name(f"{out_path.stem}-{slug(floor.get('title', 'floor'))}{out_path.suffix}")
        png, hit = render_floor(floor, width_px, None, theme)
        target.write_bytes(png)
        target.with_suffix('.hitmap.json').write_text(json.dumps(hit, indent=1), encoding='utf-8')
        written.append(str(target))
    return written[0] if len(written) == 1 else written


def main(argv=None):
    ap = argparse.ArgumentParser(description='Furnished 2.5D model view of a floor plan (PNG + hit map).')
    ap.add_argument('plan')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--theme', choices=sorted(THEMES), default='light')
    args = ap.parse_args(argv)
    plan = json.loads(pathlib.Path(args.plan).read_text(encoding='utf-8'))
    result = render_plan_25d(plan, args.out, args.width, args.theme)
    for p in result if isinstance(result, list) else [result]:
        print(p)


if __name__ == '__main__':
    main()
