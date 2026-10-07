"""Exterior views from the Compass footprints, drawn on the CPU with Cairo.

Style is a material recipe, never a replacement for the Compass footprint: real
floor footprints, openings and courtyard holes remain the source. No GPU, WebGL,
downloaded assets, animation, extra process or renderer installation: one bounded
vector scene per image and a few small texture tiles generated on first use.

The look follows the FloorForge "MyVerandah" exterior (white rendered volumes and
floating roof slabs, slim black glazing, frameless glass balustrades, timber and
stone accents, a compound wall with piers, rails and a gate, lawns, hedges and
round-crowned trees in soft daylight) in a painter's renderer:

- exact visibility by binary space partitioning on the axis planes of the faces,
  each split on the plane that cuts the fewest faces, after culling faces that
  turn away from the camera;
- a camera-fixed sun with warm light and cool shade, contact shading at the foot
  of walls, sharp soffit shadows under overhangs, and cast shadows on the ground,
  the verandah floor and the roof terraces;
- stone courses, brick, timber boards, decking, pavers and lawn from small
  repeating tiles, mapped onto every face by its exact (affine) projection;
- billboard trees and shrubs ordered with the faces, and a dusk scene with lit
  windows and lamps for the dark themes.

Proposed Indian residential elements come from compass_standards (plinth and
steps, parapets, chajjas, roofed verandah on columns, a stair tower on the roof).
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

import cairo
import numpy as np
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import triangulate, unary_union

from compass_architecture import parts, rect_points, segments
from compass_drawing import SUN_VIEW, face_normal, mix, paint, path, rgb, sun_offset, text
from compass_standards import (CHAJJA_DEPTH, CHAJJA_THICK, COPING, DOOR_HEAD, MUMTY, PARAPET, PARAPET_THICK,
                               PLINTH, SLAB, STOREY, WALL_OUTER)


@dataclass(frozen=True)
class ExteriorStyle:
    title: str
    plaster: str
    stone: str
    timber: str
    frame: str
    roof: str
    glass: str
    paving: str = '#A9ACAA'
    leaf: str = '#3F6B35'
    leaf_light: str = '#86A257'
    roof_edge: str = 'floating'   # 'floating' white slab and glass rail; 'slim' dark plane and metal rail; 'parapet'
    columns: str = 'stone'        # verandah columns: 'stone' clad, slim 'steel' or 'render'
    cladding: str = 'stone'       # texture of the stone accents: 'stone' courses or exposed 'brick'
    roof_finish: str = 'roof'     # texture of the roof terraces
    pergola: bool = True          # timber louvres over upper terraces


# Palettes of the FloorForge exterior themes these finishes follow: Modern Tropical
# ("MyVerandah"), Warm Modern Minimal and Earth & Terracotta.
STYLES = {
    'verandah': ExteriorStyle('Verandah', '#F1EFEA', '#8A8883', '#7A5234', '#1D2022', '#ECEBE6', '#AEC8CC'),
    'warm-modern': ExteriorStyle('Warm Modern', '#DED9CD', '#8D806D', '#76583E', '#25292A', '#3D4842', '#B7CCCB',
                                 '#B8B1A3', '#5C744F', '#91A06B', 'slim', 'steel', 'stone', 'roof', False),
    'terracotta': ExteriorStyle('Earth & Terracotta', '#E8DCCB', '#B06D4F', '#704832', '#3A342F', '#955947', '#B1C4B9',
                                '#BCAE99', '#5A7049', '#A18B59', 'parapet', 'render', 'brick', 'cotta', False),
}
STOREY_HEIGHT = STOREY  # Proposed presentation height; independent of 2D boundaries.
CAMERA_PITCH = .32  # Lower than the cutaway camera to show the facades clearly.
SHADOW = (.05, .08, .1)
EPS = 1e-7


@dataclass(frozen=True)
class Light:
    sky_top: str
    sky_horizon: str
    field_far: str
    field_near: str
    shade: str          # Tint of surfaces turned from the sun
    sun: str            # Tint of lit surfaces
    dim: float          # 0 by day; how far colours move toward `night` at dusk
    night: str
    glass_top: str
    glass_bottom: str
    glow: bool          # Lit windows and lamps
    shadow: float       # Strength of cast shadows
    haze: str


DAY = Light('#A3C3DB', '#E9EFF0', '#A6B98D', '#7A985A', '#4F6585', '#FFF0D2', 0., '#000000',
            '#DCE9EE', '#3B5560', False, .42, '#DCE6E8')
DUSK = Light('#0F1726', '#4A4660', '#27322D', '#1C2622', '#28324D', '#FFD29A', .46, '#111A2A',
             '#FFE3A6', '#DE914A', True, .3, '#3A3F55')


# ---- Texture tiles -------------------------------------------------------------------------
# Joints and tonal variation only, as translucent overlays on the lit colour, so one tile
# serves every finish and light. Generated once per process: a few hundred kilobytes.

TILE_PPF = 24  # Tile pixels per foot: every tile is a whole number of pixels, so repeats are seamless.
_TILES = {}


def _tone(c, value, strength):
    if value >= 0:
        c.set_source_rgba(1, 1, 1, strength * value)
    else:
        c.set_source_rgba(0, 0, 0, -strength * value * 1.1)


def _rule(c, x1, y1, x2, y2, rgba, width):
    c.move_to(x1, y1); c.line_to(x2, y2); c.set_source_rgba(*rgba); c.set_line_width(width); c.stroke()


def _bond(c, w, h, rnd, uw, uh, stagger, strength, joint, width, highlight=None):
    """Units (pavers, bricks, tiles) in rows; stagger is the fraction each other row shifts."""
    cols, rows = round(w / uw), round(h / uh)
    tones = [[rnd.uniform(-1, 1) for _ in range(cols)] for _ in range(rows)]
    for r in range(rows):
        y, shift = r * uh, (r % 2) * stagger * uw
        for k in range(-1, cols + 1):
            c.rectangle(shift + k * uw, y, uw, uh); _tone(c, tones[r][k % cols], strength); c.fill()
            _rule(c, shift + k * uw, y, shift + k * uw, y + uh, joint, width)
        if highlight:
            _rule(c, 0, y + uh - width * 1.2, w, y + uh - width * 1.2, highlight, width * .7)
    for r in range(rows + 1):
        _rule(c, 0, r * uh, w, r * uh, joint, width)


def _courses(c, w, h, rnd):
    """Ledgestone: long thin stones in courses of varied height, wrapping on every edge."""
    rows, y = [], 0.
    while y < h - 1e-9:
        ch = rnd.choice((.2, .25, .3, .38))
        if h - y - ch < .16:
            ch = h - y
        rows.append((y, ch)); y += ch
    for y, ch in rows:
        start, u = rnd.uniform(0, w), 0.
        while u < w - 1e-9:
            length = rnd.uniform(.7, 2.2)
            if w - u - length < .45:
                length = w - u
            x = (start + u) % w
            for shift in (-w, 0.):
                c.rectangle(x + shift, y, length, ch)
            _tone(c, rnd.uniform(-1, 1), .17); c.fill()
            end = (start + u + length) % w
            for shift in (-w, 0., w):
                _rule(c, end + shift, y, end + shift, y + ch, (0, 0, 0, .42), .045)
            u += length
        _rule(c, 0, y + ch - .05, w, y + ch - .05, (1, 1, 1, .16), .03)
    for y, _ in rows + [(h, 0)]:
        _rule(c, 0, y, w, y, (0, 0, 0, .48), .05)


def _boards(c, w, h, rnd, bw, strength, joints=0, across=False):
    """Boards with grooves and faint grain; `across` lays them along the tile's width."""
    if across:
        c.save(); c.transform(cairo.Matrix(0, 1, 1, 0, 0, 0)); w, h = h, w
    count = round(w / bw)
    for i in range(count):
        x = i * bw
        c.rectangle(x, 0, bw, h); _tone(c, rnd.uniform(-1, 1), strength); c.fill()
        for _ in range(3):
            gx, amp, cycles = x + rnd.uniform(.06, bw - .06), rnd.uniform(.004, .012), rnd.choice((1, 2))
            c.move_to(gx, 0)
            for s in range(1, 25):
                c.line_to(gx + amp * math.sin(math.tau * cycles * s / 24), h * s / 24)
            c.set_source_rgba(0, 0, 0, .07); c.set_line_width(.014); c.stroke()
        for _ in range(joints):
            y = rnd.uniform(0, h)
            for shift in (-h, 0., h):
                _rule(c, x, y + shift, x + bw, y + shift, (0, 0, 0, .4), .03)
    for i in range(count + 1):
        _rule(c, i * bw, 0, i * bw, h, (0, 0, 0, .42), .035)
        _rule(c, i * bw + .03, 0, i * bw + .03, h, (1, 1, 1, .1), .02)
    if across:
        c.restore()


def _speckle(c, w, h, rnd, count, radius, light, dark, stripe=None):
    if stripe:
        c.rectangle(0, 0, w / 2, h); c.set_source_rgba(*stripe); c.fill()
    for _ in range(count):
        x, y, r = rnd.uniform(0, w), rnd.uniform(0, h), rnd.uniform(*radius)
        colour = light if rnd.random() < .45 else dark
        for sx in (-w, 0., w):
            for sy in (-h, 0., h):
                if -r <= x + sx <= w + r and -r <= y + sy <= h + r:
                    c.arc(x + sx, y + sy, r, 0, math.tau); c.set_source_rgba(*colour); c.fill()


def _bars(c, w, h, width, rgba=(.07, .08, .09, .94), across=False):
    if across:
        c.rectangle(0, (h - width) / 2, w, width)
    else:
        c.rectangle((w - width) / 2, 0, width, h)
    c.set_source_rgba(*rgba); c.fill()


TILE_RECIPES = {
    'stone': (6., 3., _courses),
    'brick': (1.5, 1., lambda c, w, h, r: _bond(c, w, h, r, .75, .25, .5, .22, (1, 1, 1, .42), .035)),
    'timber': (2., 6., lambda c, w, h, r: _boards(c, w, h, r, 1 / 3, .1)),
    'slats': (6., 2., lambda c, w, h, r: _boards(c, w, h, r, 1 / 3, .1, across=True)),
    'deck': (8., 2.25, lambda c, w, h, r: _boards(c, w, h, r, .375, .13, joints=1, across=True)),
    'pavers': (4., 4., lambda c, w, h, r: _bond(c, w, h, r, 2., 2., 0, .07, (0, 0, 0, .3), .05, (1, 1, 1, .12))),
    'roof': (4., 4., lambda c, w, h, r: _bond(c, w, h, r, 2., 2., 0, .045, (0, 0, 0, .17), .045)),
    'cobble': (3., 1.5, lambda c, w, h, r: _bond(c, w, h, r, .75, .375, .5, .12, (0, 0, 0, .26), .035)),
    'cotta': (2., 2., lambda c, w, h, r: _bond(c, w, h, r, 1., 1., 0, .13, (0, 0, 0, .3), .045, (1, 1, 1, .1))),
    'lawn': (6., 6., lambda c, w, h, r: _speckle(c, w, h, r, 900, (.02, .05), (1, 1, .8, .11), (0, .05, 0, .13),
                                                  (1, 1, 1, .045))),
    'road': (4., 4., lambda c, w, h, r: _speckle(c, w, h, r, 160, (.015, .035), (1, 1, 1, .07), (0, 0, 0, .08))),
    'rail': (.5, 1., lambda c, w, h, r: _bars(c, w, h, .06)),
    'bars': (1 / 3, 1., lambda c, w, h, r: _bars(c, w, h, .06)),
    # Horizontal black slats with gaps, for fences and metal balustrades (FloorForge frontage).
    'slatted': (1., 5 / 12, lambda c, w, h, r: _bars(c, w, h, .2, across=True)),
}


def tile(kind):
    """A repeating texture tile, generated once and cached for the process."""
    if kind not in _TILES:
        w, h, draw = TILE_RECIPES[kind]
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, round(w * TILE_PPF), round(h * TILE_PPF))
        c = cairo.Context(surface)
        c.scale(TILE_PPF, TILE_PPF)
        draw(c, w, h, random.Random(kind))
        surface.flush()
        _TILES[kind] = surface
    return _TILES[kind]


# ---- Visibility ------------------------------------------------------------------------------

class Face:
    __slots__ = ('points', 'flags', 'lo', 'hi', 'payload')

    def __init__(self, points, flags, payload):
        self.points, self.flags, self.payload = points, flags, payload
        xs, ys, zs = zip(*points)
        self.lo, self.hi = (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def _cut(face, axis, plane):
    """Both halves of a face crossing an axis plane; new edges on the plane are not outlined."""
    halves = ([], [], 1.), ([], [], -1.)
    points, flags = face.points, face.flags
    count = len(points)
    for i in range(count):
        a, b, flag = points[i], points[(i + 1) % count], flags[i]
        da, db = a[axis] - plane, b[axis] - plane
        crossing = None
        if (da < -EPS and db > EPS) or (da > EPS and db < -EPS):
            t = da / (da - db)
            crossing = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]))
        for pts, fl, sign in halves:             # sign 1 keeps d <= 0 (low), -1 keeps d >= 0 (high)
            sa, sb = da * sign, db * sign
            if sa <= EPS:
                if sb <= EPS:
                    pts.append(a); fl.append(flag)
                elif crossing is not None:
                    pts += [a, crossing]; fl += [flag, False]
                else:
                    pts.append(a); fl.append(False)
            elif crossing is not None:
                pts.append(crossing); fl.append(flag)
    return [Face(pts, tuple(fl), face.payload) if len(pts) >= 3 else None for pts, fl, _ in halves]


def _plane(group):
    """The face plane that cuts the fewest faces (and roughly halves the rest)."""
    lo = np.array([f.lo for f in group]); hi = np.array([f.hi for f in group])
    best = None
    for axis in range(3):
        low, high = lo[:, axis], hi[:, axis]
        flat = high - low <= EPS
        if not flat.any():
            continue
        values = np.unique(low[flat])
        if len(values) > 48:
            values = values[np.linspace(0, len(values) - 1, 48).round().astype(int)]
        v = values[:, None]
        cuts = ((low < v - EPS) & (high > v + EPS)).sum(1)
        balance = np.abs((high <= v + EPS).sum(1) - (low >= v - EPS).sum(1))
        cost = cuts + .05 * balance
        i = int(cost.argmin())
        if best is None or cost[i] < best[0]:
            best = (cost[i], axis, float(values[i]))
    return None if best is None else best[1:]


def depth_order(faces, camera):
    """Back-to-front order by binary space partitioning on axis planes of the faces.

    Centroid depth sorting makes windows appear through large roof polygons. Every
    split plane holds at least one face, so each step removes faces and the order is
    exact for any arrangement; choosing the plane that cuts fewest faces keeps long
    walls and slabs whole instead of chopping them at every frame and rail.
    """
    out, todo = [], [(False, list(faces))]
    while todo:
        emit, group = todo.pop()
        if emit or len(group) < 2:
            out.extend(group)
            continue
        choice = _plane(group)
        if choice is None:      # Only billboards and oblique faces remain: farthest first.
            group.sort(key=lambda f: sum((f.lo[i] + f.hi[i]) * camera[i] for i in range(3)))
            out.extend(group)
            continue
        axis, plane = choice
        low, same, high = [], [], []
        for face in group:
            a, b = face.lo[axis], face.hi[axis]
            if b <= plane + EPS:
                (same if a >= plane - EPS else low).append(face)
            elif a >= plane - EPS:
                high.append(face)
            else:
                below, above = _cut(face, axis, plane)
                if below:
                    low.append(below)
                if above:
                    high.append(above)
        far, near = (low, high) if camera[axis] > 0 else (high, low)
        todo += [(False, near), (True, same), (False, far)]
    return out


def convex_pieces(poly):
    """Convex faces for a plane polygon, flagged on the edges that belong to its boundary."""
    if not poly.interiors and poly.convex_hull.area - poly.area < 1e-9:
        points = list(orient(poly, 1.).exterior.coords)[:-1]
        return [(points, (True,) * len(points))]
    boundary, out = poly.boundary, []
    # Clip the triangulation so courtyard holes and concave footprints remain empty, never roofed.
    for triangle in triangulate(poly):
        for piece in parts(triangle.intersection(poly)):
            if piece.geom_type == 'Polygon' and piece.area > .00001:
                points = list(piece.exterior.coords)[:-1]
                out.append((points, tuple(boundary.distance(Point((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) < 1e-6
                                          for p, q in zip(points, points[1:] + points[:1]))))
    return out


def polygons(geom):
    return [p for p in parts(geom) if p.geom_type == 'Polygon' and p.area > 1e-6] if geom is not None else []


# ---- Painter -----------------------------------------------------------------------------------

class Painter:
    """Fixed camera and vector faces; no persistent scene or GPU allocation."""

    def __init__(self, width: float, depth: float, height: float, angle: int, margin=(0., 0., 0., 0.)):
        self.width, self.depth = width, depth
        self.theta = angle * math.pi / 2
        left, front, right, back = margin
        corners = [self.project(x, y, z) for x in (-left, width + right) for y in (-front, depth + back) for z in (-.5, height)]
        xs, ys = zip(*corners)
        self.centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
        self.scale = min(1400 / (max(xs) - min(xs)), 775 / (max(ys) - min(ys)))
        self.shading_y = tuple(440 + (y - self.centre[1]) * self.scale for y in (min(ys), max(ys)))
        self.faces, self.meta = [], []
        self.finished = False
        self.light = DAY
        c, s = math.cos(self.theta), math.sin(self.theta)
        self.camera = (-c - s, s - c, CAMERA_PITCH * 2)   # Toward the camera; exact for this projection.
        length = math.hypot(self.camera[0], self.camera[1])
        self.toward_camera = (self.camera[0] / length, self.camera[1] / length)
        self._planes = {}

    def project(self, x, y, z=0):
        x, y = x - self.width / 2, y - self.depth / 2
        x, y = x * math.cos(self.theta) - y * math.sin(self.theta), x * math.sin(self.theta) + y * math.cos(self.theta)
        return (x - y) * .866, -(x + y) * CAMERA_PITCH - z

    def point(self, x, y, z=0):
        px, py = self.project(x, y, z)
        return 800 + (px - self.centre[0]) * self.scale, 440 + (py - self.centre[1]) * self.scale

    # -- Scene -----------------------------------------------------------------------------------
    def face(self, points, colour, **meta):
        if meta.get('ao') or meta.get('soffit') or meta.get('glass'):
            zs = [p[2] for p in points]
            ys = [self.point(*p)[1] for p in points]
            meta['z'], meta['span'] = (min(zs), max(zs)), (min(ys), max(ys))
        self.faces.append((points, colour))
        self.meta.append(meta)

    def facing(self, nx, ny):
        """Whether a vertical face with this outward normal turns toward the camera."""
        return nx * self.camera[0] + ny * self.camera[1] > 1e-9

    def slab(self, poly, z, height, colour, top=None, top_pattern=None, side_pattern=None, outline=False, **meta):
        """A closed horizontal solid; sides turned from the camera are never seen, so never kept."""
        for poly in polygons(poly):
            poly = orient(poly, 1.)
            if height > 1e-9:
                for ring in (poly.exterior, *poly.interiors):
                    ring = list(ring.coords)[:-1]
                    for a, b in zip(ring, ring[1:] + ring[:1]):
                        nx, ny = b[1] - a[1], a[0] - b[0]   # Right of a-b: out of the solid for shells and holes.
                        if nx * nx + ny * ny > 1e-14 and self.facing(nx, ny):
                            self.face([(*a, z), (*b, z), (*b, z + height), (*a, z + height)], colour,
                                      pattern=side_pattern, outline=outline, **meta)
            for points, flags in convex_pieces(poly):
                self.face([(*p, z + height) for p in points], top or colour, pattern=top_pattern,
                          outline=flags if outline else False)

    def prism(self, points, z, height, colour, top=None, **meta):
        cx, cy = sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)
        cap = {k: v for k, v in meta.items() if k not in ('ao', 'soffit', 'pattern', 'top_pattern')}
        if meta.get('top_pattern'):
            cap['pattern'] = meta['top_pattern']
        side = {k: v for k, v in meta.items() if k != 'top_pattern'}
        if height > 1e-9:
            for a, b in zip(points, points[1:] + points[:1]):
                nx, ny = b[1] - a[1], a[0] - b[0]
                if nx * nx + ny * ny < 1e-14:
                    continue
                if nx * (a[0] + b[0] - 2 * cx) + ny * (a[1] + b[1] - 2 * cy) < 0:
                    nx, ny = -nx, -ny
                if self.facing(nx, ny):
                    self.face([(*a, z), (*b, z), (*b, z + height), (*a, z + height)], colour, **side)
        self.face([(*p, z + height) for p in points], top or colour, **cap)

    def edge(self, a, b, thickness, z, height, colour, offset=0., **meta):
        """A wall-like bar along a-b; `offset` moves it sideways (outwards when positive)."""
        length = math.dist(a, b)
        if length < .001:
            return
        nx, ny = -(b[1] - a[1]) / length, (b[0] - a[0]) / length
        hx, hy = nx * thickness / 2, ny * thickness / 2
        ox, oy = nx * offset, ny * offset
        self.prism([(a[0] - hx + ox, a[1] - hy + oy), (b[0] - hx + ox, b[1] - hy + oy),
                    (b[0] + hx + ox, b[1] + hy + oy), (a[0] + hx + ox, a[1] + hy + oy)], z, height, colour, **meta)

    def pane(self, a, b, z, height, colour, **meta):
        """A single vertical face (glass, a door leaf, a railing screen), seen from either side."""
        self.face([(*a, z), (*b, z), (*b, z + height), (*a, z + height)], colour, **meta)

    def sprite(self, x, y, z0, z1, half, draw):
        """A billboard (tree, shrub, lamp) ordered with the faces through a camera-facing proxy."""
        px, py = -self.toward_camera[1], self.toward_camera[0]
        self.face([(x - px * half, y - py * half, z0), (x + px * half, y + py * half, z0),
                   (x + px * half, y + py * half, z1), (x - px * half, y - py * half, z1)], '#000000', sprite=draw)

    def decal(self, geom, z, alpha):
        """A cast shadow lying on a terrace or floor, ordered like the surface it falls on."""
        for poly in polygons(geom):
            for points, _ in convex_pieces(poly):
                self.face([(*p, z) for p in points], '#000000', decal=alpha)

    # -- Light -----------------------------------------------------------------------------------
    def sun_facing(self, normal):
        """How squarely a face meets the camera-fixed sun: 1 for roofs, about .75 and .15 for walls."""
        nx, ny, nz = normal
        if abs(nz) > .5:
            return 1.
        t = self.theta
        rx, ry = nx * math.cos(t) - ny * math.sin(t), nx * math.sin(t) + ny * math.cos(t)
        if rx + ry > 0:
            rx, ry = -rx, -ry                       # The side that faces the camera.
        return max(0., rx * SUN_VIEW[0] + ry * SUN_VIEW[1]) / SUN_VIEW[2]

    def shade(self, colour, normal, light):
        """Warm light and cool shade from one sun fixed to the camera."""
        lam = self.sun_facing(normal)
        k = .67 + .33 * lam
        c = mix(colour, light.shade, (1 - k) * .75)
        c = mix(c, '#000000', (1 - k) * .4)
        c = mix(c, light.sun, .1 * lam)
        return mix(c, light.night, light.dim) if light.dim else c

    # -- Drawing ---------------------------------------------------------------------------------
    def plane_matrix(self, axis, value):
        """User space to plane feet (u, v) for an axis plane: exact, as the projection is affine."""
        key = (axis, round(value, 6))
        if key not in self._planes:
            if axis == 2:
                o, u, v = self.point(0, 0, value), self.point(1, 0, value), self.point(0, 1, value)
            elif axis == 0:
                o, u, v = self.point(value, 0, 0), self.point(value, 1, 0), self.point(value, 0, 1)
            else:
                o, u, v = self.point(0, value, 0), self.point(1, value, 0), self.point(0, value, 1)
            m = cairo.Matrix(u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1])
            try:
                m.invert()
            except cairo.Error:
                m = None
            self._planes[key] = m
        return self._planes[key]

    def texture(self, kind, axis, value, cache):
        key = ('tile', kind, axis, round(value, 6))
        if key not in cache:
            m = self.plane_matrix(axis, value) if axis is not None else None
            source = None
            if m is not None:
                source = cairo.SurfacePattern(tile(kind))
                source.set_extend(cairo.EXTEND_REPEAT)
                source.set_filter(cairo.FILTER_BILINEAR)
                source.set_matrix(m.multiply(cairo.Matrix(TILE_PPF, 0, 0, TILE_PPF, 0, 0)))
            cache[key] = source
        return cache[key]

    def lit(self, shade, cache):
        """One lighting field per shaded material: splits of a flat roof or wall share it."""
        key = ('lit', shade)
        if key not in cache:
            gradient = cairo.LinearGradient(0, self.shading_y[0], 0, self.shading_y[1])
            gradient.add_color_stop_rgb(0, *rgb(mix(shade, '#FFFFFF', .045)))
            gradient.add_color_stop_rgb(1, *rgb(mix(shade, '#293B40', .055)))
            cache[key] = gradient
        return cache[key]

    def overlay(self, meta, axis, value, lam, cache):
        """Contact shade at the foot of a wall, under its slab, and the slab's sharp sun shadow."""
        if axis not in (0, 1):
            return None
        z0, z1 = meta['z']
        ao, soffit = meta.get('ao') or '', meta.get('soffit')
        key = ('ao', axis, round(value, 6), round(z0, 4), round(z1, 4), ao, soffit, round(lam, 3))
        if key in cache:
            return cache[key]
        height = z1 - z0
        effects, marks = [], {0., 1.}
        if 'base' in ao:
            band = min(1.5, height * .5) / height
            effects.append(lambda t, b=band: .3 * max(0., 1 - t / b) ** 1.7)
            marks |= {band * f for f in (.12, .25, .5, .75, 1.)}
        if soffit:
            depth, under = soffit
            top = (under - z0) / height
            reach = min(.9, height * .3) / height
            effects.append(lambda t, top=top, r=reach: .2 * max(0., 1 - (top - t) / r) ** 1.7 if t <= top else 0.)
            marks |= {top - reach * f for f in (0., .25, .5, .75, 1.)}
            if lam > .3 and depth > 0:
                edge, soft = top - depth / lam / height, .12 / height
                effects.append(lambda t, e=edge, s=soft, top=top:
                               .3 if e <= t <= top else (.3 * (1 - (e - t) / s) if e - s < t < e else 0.))
                marks |= {edge - soft, edge, min(1., top + 1e-4)}
        if not effects:
            cache[key] = None
            return None
        gradient = cairo.LinearGradient(0, z0, 0, z1)
        for t in sorted(m for m in marks if 0. <= m <= 1.):
            alpha = 1 - math.prod(1 - f(t) for f in effects)
            gradient.add_color_stop_rgba(t, *SHADOW, alpha)
        gradient.set_matrix(self.plane_matrix(axis, value))
        cache[key] = gradient
        return gradient

    def glass(self, meta, light, lam, cache):
        top, bottom = meta['span']
        rail = bool(meta.get('rail'))
        key = ('glass', round(top, 1), round(bottom, 1), rail, round(lam, 2))
        if key not in cache:
            gradient = cairo.LinearGradient(0, top, 0, bottom + .01)
            if light.glow and not rail:
                gradient.add_color_stop_rgba(0, *rgb(light.glass_top), .96)
                gradient.add_color_stop_rgba(1, *rgb(light.glass_bottom), .96)
            elif rail:
                # Balustrade glass mostly shows what lies behind it, with a little sky in it.
                sky = mix(light.glass_top, '#FFFFFF', .2) if not light.glow else mix(light.sky_horizon, light.night, .3)
                low = mix(sky, light.glass_bottom, .5) if not light.glow else light.night
                gradient.add_color_stop_rgba(0, *rgb(sky), .5 if not light.glow else .35)
                gradient.add_color_stop_rgba(1, *rgb(low), .3 if not light.glow else .2)
            else:
                # Sky reflected in the upper glass, the dark room behind the lower part.
                sky = mix(light.glass_top, '#FFFFFF', .25 * lam)
                gradient.add_color_stop_rgba(0, *rgb(sky), .97)
                gradient.add_color_stop_rgba(.42, *rgb(mix(sky, light.glass_bottom, .55)), .97)
                gradient.add_color_stop_rgba(1, *rgb(mix(light.glass_bottom, '#10181C', .35)), .97)
            cache[key] = gradient
        return cache[key]

    def draw(self, ctx, light=None):
        light = light or self.light
        metas = self.meta + [{} for _ in range(len(self.faces) - len(self.meta))]
        items = []
        for (points, colour), meta in zip(self.faces, metas):
            normal = face_normal(points)
            outline = meta.get('outline')
            flags = tuple(outline) if isinstance(outline, (tuple, list)) else (bool(outline),) * len(points)
            lam = self.sun_facing(normal)
            items.append(Face(points, flags, (colour, meta, lam, self.shade(colour, normal, light) if self.finished else colour)))
        cache = {}
        for face in depth_order(items, self.camera):
            self.paint_face(ctx, face, light, cache)

    def paint_face(self, ctx, face, light, cache):
        colour, meta, lam, shade = face.payload
        projected = [self.point(*p) for p in face.points]
        if meta.get('sprite'):
            ctx.save(); path(ctx, projected); ctx.clip(); meta['sprite'](ctx); ctx.restore()
            return
        path(ctx, projected)
        if not self.finished:
            paint(ctx, colour)
            ctx.fill_preserve()
            ctx.set_line_width(1.0)
            ctx.stroke()
            return
        if 'decal' in meta:
            ctx.set_source_rgba(*SHADOW, meta['decal']); ctx.fill()
            return
        if meta.get('emissive'):
            paint(ctx, colour); ctx.fill()
            return
        axis = next((i for i in (2, 0, 1) if face.hi[i] - face.lo[i] < 1e-6), None)
        value = face.lo[axis] if axis is not None else 0.
        if 'glow' in meta:
            # Light on a wall or floor: a circle in the surface's own plane, so it lands as an ellipse.
            m = self.plane_matrix(axis, value) if axis is not None else None
            if m is not None:
                gx, gy, gz, radius = meta['glow']
                u, v = {0: (gy, gz), 1: (gx, gz), 2: (gx, gy)}[axis]
                glow = cairo.RadialGradient(u, v, 0, u, v, radius)
                glow.add_color_stop_rgba(0, 1., .84, .58, .55)
                glow.add_color_stop_rgba(.35, 1., .8, .52, .22)
                glow.add_color_stop_rgba(1, 1., .8, .52, 0)
                glow.set_matrix(m)
                ctx.set_source(glow); ctx.fill()
            ctx.new_path()
            return
        if meta.get('screen'):
            source = self.texture(meta['screen'], axis, value, cache)
            if source is not None:
                ctx.set_source(source); ctx.fill()
            ctx.new_path()
            return
        ctx.set_line_width(1.0)
        if meta.get('glass'):
            ctx.set_source(self.glass(meta, light, lam, cache)); ctx.fill_preserve()
        else:
            # Every layer is stroked too: a same-colour hairline covers antialias seams
            # between split faces without breaking the texture or shading across them.
            layers = [self.lit(shade, cache)]
            if meta.get('pattern'):
                layers.append(self.texture(meta['pattern'], axis, value, cache))
            if meta.get('ao') or meta.get('soffit'):
                layers.append(self.overlay(meta, axis, value, lam, cache))
            for source in layers:
                if source is not None:
                    ctx.set_source(source); ctx.fill_preserve(); ctx.stroke_preserve()
        ctx.new_path()
        if any(face.flags):
            for (a, b), flag in zip(zip(projected, projected[1:] + projected[:1]), face.flags):
                if flag:
                    ctx.move_to(*a); ctx.line_to(*b)
            ctx.set_source_rgba(*rgb(mix(shade, '#0B0F12', .55)), .85); ctx.set_line_width(.75); ctx.stroke()

    def visible_ground(self, z=0.):
        """The part of the plane at height z that falls inside the picture."""
        key = ('view', round(z, 6))
        if key not in self._planes:
            m = self.plane_matrix(2, z)
            self._planes[key] = Polygon([m.transform_point(x, y) for x, y in ((-20, -20), (1620, -20), (1620, 1020), (-20, 1020))])
        return self._planes[key]

    def flat(self, ctx, geom, colour, light, pattern=None, z=0., cache=None):
        """A horizontal ground surface drawn directly, under everything that stands on it."""
        shade = self.shade(colour, (0., 0., 1.), light)
        cache = {} if cache is None else cache
        for poly in polygons(geom.intersection(self.visible_ground(z))):
            ctx.new_path()
            for ring in (poly.exterior, *poly.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (ctx.move_to if i == 0 else ctx.line_to)(*self.point(x, y, z))
                ctx.close_path()
            ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
            for source in (self.lit(shade, cache), self.texture(pattern, 2, z, cache) if pattern else None):
                if source is not None:
                    ctx.set_source(source); ctx.fill_preserve()
            ctx.new_path()
            ctx.set_fill_rule(cairo.FILL_RULE_WINDING)


# ---- Geometry helpers ------------------------------------------------------------------------

def outward(poly, a, b):
    """Unit normal of edge a-b pointing out of `poly`."""
    length = math.dist(a, b)
    nx, ny = -(b[1] - a[1]) / length, (b[0] - a[0]) / length
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    if poly.covers(Point(mid[0] + nx * .2, mid[1] + ny * .2)):
        nx, ny = -nx, -ny
    return nx, ny


def outer_offset(poly, a, b, distance):
    """Painter.edge offset (along the edge's left normal) that moves a bar `distance` outwards."""
    length = math.dist(a, b)
    left = (-(b[1] - a[1]) / length, (b[0] - a[0]) / length)
    out = outward(poly, a, b)
    return distance if left[0] * out[0] + left[1] * out[1] > 0 else -distance


def merged_walls(walls):
    """Exterior wall segments merged into straight runs, so a facade has no false joints."""
    runs, out = {}, []
    for w in walls:
        if not w['exterior']:
            continue
        (ax, ay), (bx, by) = w['a'], w['b']
        if abs(ay - by) < 1e-9:
            runs.setdefault(('y', round(ay, 6), w['thickness']), []).append(sorted((ax, bx)))
        elif abs(ax - bx) < 1e-9:
            runs.setdefault(('x', round(ax, 6), w['thickness']), []).append(sorted((ay, by)))
        else:
            out.append(w)
    for (axis, at, thickness), spans in runs.items():
        spans.sort()
        merged = [list(spans[0])]
        for lo, hi in spans[1:]:
            if lo <= merged[-1][1] + 1e-6:
                merged[-1][1] = max(merged[-1][1], hi)
            else:
                merged.append([lo, hi])
        for lo, hi in merged:
            a, b = ((lo, at), (hi, at)) if axis == 'y' else ((at, lo), (at, hi))
            out.append({'a': a, 'b': b, 'thickness': thickness, 'exterior': True})
    return out


def sweep(poly, dx, dy):
    """The ground shadow of a prism: its footprint swept along the sun offset."""
    pieces = [poly, Polygon([(x + dx, y + dy) for x, y in poly.exterior.coords])]
    for ring in (poly.exterior, *poly.interiors):
        pts = list(ring.coords)
        for a, b in zip(pts, pts[1:]):
            quad = Polygon([a, b, (b[0] + dx, b[1] + dy), (a[0] + dx, a[1] + dy)])
            if quad.is_valid and quad.area > 1e-9:
                pieces.append(quad)
    return unary_union(pieces)


# ---- Planting and lamps (billboards) ---------------------------------------------------------

def blob(ctx, x, y, r, light_colour, dark_colour, alpha=1., edge=.16):
    gradient = cairo.RadialGradient(x - r * .35, y - r * .42, r * .1, x, y, r)
    gradient.add_color_stop_rgba(0, *rgb(light_colour), alpha)
    gradient.add_color_stop_rgba(.7, *rgb(mix(light_colour, dark_colour, .6)), alpha)
    gradient.add_color_stop_rgba(1, *rgb(dark_colour), alpha)
    ctx.new_path(); ctx.arc(x, y, r, 0, math.tau); ctx.set_source(gradient)
    if edge:
        ctx.fill_preserve()
        ctx.set_source_rgba(*rgb(mix(dark_colour, '#000000', .4)), edge * alpha); ctx.set_line_width(.6); ctx.stroke()
    else:
        ctx.fill()


def tree(painter, x, y, radius, style, light, shrub=False, z=0., cone=False, tone=0.):
    """A domed tree on a tapering trunk, a clipped shrub, or a conical topiary, of shaded leaf clusters."""
    leaf, leaf_light = mix(style.leaf, '#25402A', tone), mix(style.leaf_light, style.leaf, tone)
    if light.dim:
        leaf, leaf_light = mix(leaf, light.night, light.dim * 1.2), mix(leaf_light, light.night, light.dim * 1.3)
    rnd = random.Random(f'{x:.2f},{y:.2f},{radius:.2f}')
    trunk = 0. if shrub else 3.6 + radius * .45
    crown = z + trunk + radius * (.72 if shrub else .55)
    clusters = []
    if cone:
        # Stacked, narrowing clusters read as a cypress or a clipped cone.
        for dz, r in ((0., .9), (.9, .82), (1.7, .7), (2.4, .56), (3., .42), (3.5, .28)):
            clusters.append((rnd.uniform(-.06, .06) * radius, rnd.uniform(-.06, .06) * radius, dz * radius, r * radius))
    elif shrub:
        for i in range(4):
            a, d = rnd.uniform(0, math.tau), (0. if i == 0 else rnd.uniform(.3, .6) * radius)
            clusters.append((math.cos(a) * d, math.sin(a) * d, rnd.uniform(-.2, .3) * radius, rnd.uniform(.45, .62) * radius))
    else:
        # A dome: clusters near the middle sit higher, those at the rim lower and darker.
        for i in range(11):
            a = i * 2.39996 + rnd.uniform(-.3, .3)
            d = 0. if i == 0 else radius * rnd.uniform(.3, .78)
            dome = .42 * (1 - (d / radius) ** 2)
            clusters.append((math.cos(a) * d, math.sin(a) * d, radius * (dome + rnd.uniform(-.1, .1)), radius * rnd.uniform(.36, .52)))
    low = min(c[2] for c in clusters)
    high = max(c[2] for c in clusters)

    def draw(ctx):
        s = painter.scale
        bark = mix('#4A3626', light.night, light.dim)
        if not shrub and not cone:
            (bx, by), (tx, ty) = painter.point(x, y, z), painter.point(x, y, crown - radius * .1)
            w0, w1 = max(1.4, .26 * s), max(.9, .12 * s)
            ctx.new_path(); ctx.move_to(bx - w0, by); ctx.line_to(tx - w1, ty); ctx.line_to(tx + w1, ty)
            ctx.line_to(bx + w0, by); ctx.close_path(); paint(ctx, bark); ctx.fill()
            for dx, dy, dz, _ in clusters[1:4]:
                px, py = painter.point(x + dx * .7, y + dy * .7, crown + dz * .5)
                ctx.new_path(); ctx.move_to(tx, ty + w1 * 3); ctx.line_to(px, py)
                ctx.set_line_width(w1 * 1.2); paint(ctx, bark); ctx.stroke()
            # The crown's shaded underside gives it volume.
            ux, uy = painter.point(x, y, crown - radius * .05)
            blob(ctx, ux, uy, radius * .95 * s, mix(leaf, '#000000', .25), mix(leaf, '#000000', .45))
        blobs = []
        for i, (dx, dy, dz, r) in enumerate(clusters):
            px, py = painter.point(x + dx, y + dy, crown + dz)
            blobs.append((dz * .8 + (x + dx) * painter.camera[0] * .3 + (y + dy) * painter.camera[1] * .3, i, px, py, r * s, dz))
        for _, i, px, py, r, dz in sorted(blobs):
            height = (dz - low) / (high - low) if high > low else .5
            blob(ctx, px, py, r, mix(mix(leaf, leaf_light, .35 + .65 * height), leaf, .1 * (i % 3)), mix(leaf, '#000000', .18 * (1 - height)))
    painter.sprite(x, y, z - .2, crown + radius * (4.05 if cone else 1.2), radius * 1.8, draw)


def lamp(painter, x, y, z, light):
    """A small light on a gate pier; it glows at dusk."""
    def draw(ctx):
        px, py = painter.point(x, y, z)
        r = max(2.5, .3 * painter.scale)
        if light.glow:
            halo = cairo.RadialGradient(px, py, 0, px, py, r * 4)
            halo.add_color_stop_rgba(0, 1., .85, .58, .6)
            halo.add_color_stop_rgba(1, 1., .85, .58, 0)
            ctx.set_source(halo); ctx.paint()
        ctx.new_path(); ctx.arc(px, py, r * .55, 0, math.tau)
        ctx.set_source_rgb(*(rgb('#FFE7B8') if light.glow else rgb('#E4E0D6'))); ctx.fill()
    painter.sprite(x, y, z - 1.2, z + 1.2, 1.4, draw)


def wall_light(painter, at, u, face, zc, frame, light):
    """A wall light beside a door; at dusk it washes the wall around it with warm light."""
    painter.prism([at(u - .12, face), at(u + .12, face), at(u + .12, face + .22), at(u - .12, face + .22)],
                  zc - .35, .7, frame, outline=True)
    painter.pane(at(u - .08, face + .23), at(u + .08, face + .23), zc - .3, .2, '#FFE7B8' if light.glow else '#D9D4C7',
                 emissive=True)
    if light.glow:
        (ax, ay), (bx, by) = at(u - 2.8, face + .03), at(u + 2.8, face + .03)
        cx, cy = at(u, face + .03)
        painter.face([(ax, ay, zc - 3.4), (bx, by, zc - 3.4), (bx, by, zc + 2.8), (ax, ay, zc + 2.8)], '#000000',
                     glow=(cx, cy, zc - .3, 2.8))


# ---- Setting -----------------------------------------------------------------------------------

def backdrop(ctx, painter, light):
    """Sky and a field to a horizon beyond the site: the setting, never part of the design.

    A parallel view has no horizon of its own, so the ground is cut where the site's
    farthest corner lies and fades into haze there (see `horizon_haze`)."""
    far = min(painter.point(x, y, 0)[1] for x in (-24, painter.width + 24) for y in (-24, painter.depth + 24))
    horizon = max(40., min(330., far))
    sky = cairo.LinearGradient(0, 0, 0, horizon)
    sky.add_color_stop_rgb(0, *rgb(light.sky_top))
    sky.add_color_stop_rgb(1, *rgb(light.sky_horizon))
    ctx.rectangle(0, 0, 1600, horizon + 1); ctx.set_source(sky); ctx.fill()
    if light.glow:
        glow = cairo.LinearGradient(0, horizon - 90, 0, horizon)
        glow.add_color_stop_rgba(0, .93, .62, .38, 0)
        glow.add_color_stop_rgba(1, .93, .62, .38, .38)
        ctx.rectangle(0, horizon - 90, 1600, 90); ctx.set_source(glow); ctx.fill()
    field = cairo.LinearGradient(0, horizon, 0, 1000)
    field.add_color_stop_rgb(0, *rgb(light.field_far))
    field.add_color_stop_rgb(1, *rgb(light.field_near))
    ctx.rectangle(0, horizon, 1600, 1000 - horizon); ctx.set_source(field); ctx.fill()
    return horizon


def horizon_haze(ctx, light, horizon):
    """Haze over the far ground, then a line of distant trees standing on the horizon."""
    haze = cairo.LinearGradient(0, horizon, 0, horizon + 170)
    haze.add_color_stop_rgba(0, *rgb(light.haze), .92)
    haze.add_color_stop_rgba(.35, *rgb(light.haze), .45)
    haze.add_color_stop_rgba(1, *rgb(light.haze), 0)
    ctx.rectangle(0, horizon, 1600, 170); ctx.set_source(haze); ctx.fill()
    # A soft, continuous line of far trees: overlapping crowns in two hazy tones.
    rnd = random.Random('horizon')
    for depth, tone in ((0, mix(light.field_far, light.haze, .6)), (1, mix(light.field_far, light.haze, .4))):
        x = -30. + depth * 40
        while x < 1640:
            r = rnd.uniform(6, 13) if depth else rnd.uniform(9, 18)
            if rnd.random() < .85:
                blob(ctx, x, horizon - r * (.5 if depth else .7) + 2, r, mix(tone, '#FFFFFF', .04),
                     mix(tone, '#000000', .05), 1., edge=0)
            x += r * rnd.uniform(.9, 2.)


# ---- The house -----------------------------------------------------------------------------------

def _opening(painter, style, light, kind, opening, pa, pb, n, z, t, room_kind, sheltered, main, space=(0., 0.)):
    """Glazing in slim frames with sills, timber pods or eyebrows; or a door in its portal.
    `space` is the plain wall beside the opening (before, after), for the door's wall lights."""
    nx, ny = n
    length = math.dist(pa, pb)
    ux, uy = (pb[0] - pa[0]) / length, (pb[1] - pa[1]) / length
    face, frame = t / 2, style.frame

    def at(u, v):                          # u along the wall from pa, v outwards from the wall centre
        return (pa[0] + ux * u + nx * v, pa[1] + uy * u + ny * v)

    def bar(u1, u2, v1, v2, z1, z2, colour, **meta):
        painter.prism([at(u1, v1), at(u2, v1), at(u2, v2), at(u1, v2)], z + z1, z2 - z1, colour, outline=True, **meta)

    sill, head = (opening['sill'], opening['head']) if kind == 'window' else (0., DOOR_HEAD)
    glass_v, f = face - .3, .13
    if kind == 'window' or main is False:
        vent = kind == 'window' and opening['kind'] == 'ventilator'
        painter.pane(at(0, glass_v), at(length, glass_v), z + sill, head - sill, style.glass, glass=True)
        for u1, u2 in ((0, f), (length - f, length)):
            bar(u1, u2, glass_v - .08, glass_v + .14, sill, head, frame)
        bar(f, length - f, glass_v - .08, glass_v + .14, head - f, head, frame)
        if kind == 'window':
            bar(f, length - f, glass_v - .08, glass_v + .14, sill, sill + f, frame)
        if not vent and length > 2.6:
            bar(length / 2 - .05, length / 2 + .05, glass_v - .06, glass_v + .1, sill, head, frame)
        if kind == 'window':
            bar(-.18, length + .18, face - .32, face + .22, sill - .14, sill, mix(style.stone, '#FFFFFF', .45))
        if vent:
            return
        if kind == 'window' and room_kind in ('bed', 'master', 'icu') and style.roof_edge != 'parapet':
            # A slim projecting pod lined with timber (FloorForge bedroom windows).
            d, w = .9, .2
            bar(-w - .12, -.12, face, face + d, sill - .3, head + .3, style.timber)
            bar(length + .12, length + w + .12, face, face + d, sill - .3, head + .3, style.timber)
            bar(-w - .12, length + w + .12, face, face + d, head + .1, head + .3, style.timber)
            bar(-w - .12, length + w + .12, face, face + d, sill - .3, sill - .14, style.timber)
        elif not sheltered:
            # An eyebrow at lintel level; the traditional deeper chajja in the parapet finish.
            deep = style.roof_edge == 'parapet'
            colour = style.roof if style.roof_edge == 'slim' else style.plaster
            bar(-.45, length + .45, face, face + (CHAJJA_DEPTH if deep else 1.15), head + .15,
                head + .15 + (CHAJJA_THICK if deep else .2), colour)
        return
    # The main door: a timber leaf in a dark portal, a pull handle, canopy and lamp.
    painter.pane(at(0, glass_v), at(length, glass_v), z, head, style.timber, pattern='timber')
    for u1, u2 in ((-.14, .08), (length - .08, length + .14)):
        bar(u1, u2, glass_v - .06, face + .06, 0, head + .14, frame)
    bar(-.14, length + .14, glass_v - .06, face + .06, head, head + .14, frame)
    bar(length - .55, length - .47, glass_v, glass_v + .12, 2.4, 5.6, frame)
    if not sheltered:
        colour = style.roof if style.roof_edge == 'slim' else style.plaster
        bar(-1., length + 1., face, face + 3., head + .5, head + .8, colour)
    for u, free in ((-.6, space[0]), (length + .6, space[1])):
        if free >= 1.3:
            wall_light(painter, at, u, face, z + 6.2, frame, light)


def _wall(painter, wall, openings, z, style, light, footprint, kinds, soffit, sheltered):
    """The outer face of an exterior wall run, with reveals at its openings and their fittings.

    Faces never seen from outside are never made: the inner face, the wall head under the
    slab, joints between pieces, and walls (with their openings) that turn from the camera."""
    a, b = wall['a'], wall['b']
    n = outward(footprint, a, b)
    if not painter.facing(*n):
        return
    line = LineString([a, b])
    length, t = line.length, wall['thickness']
    cuts, positions = [], {0., length}
    for kind, opening in openings:
        overlap = line.intersection(LineString([opening['a'], opening['b']]))
        if overlap.length < .01:
            continue
        lo, hi = sorted(line.project(Point(p)) for p in (opening['a'], opening['b']))
        lo, hi = max(0., lo), min(length, hi)
        cuts.append((lo, hi, kind, opening))
        positions.update((lo, hi))
    positions = sorted(positions)
    ux, uy = (b[0] - a[0]) / length, (b[1] - a[1]) / length

    def at(u, v=t / 2):  # u along the run, v outwards from its centre line
        return (a[0] + ux * u + n[0] * v, a[1] + uy * u + n[1] * v)
    for lo, hi in zip(positions, positions[1:]):
        hit = next(((kind, o) for start, end, kind, o in cuts if start <= (lo + hi) / 2 <= end), None)
        if hit is None:
            # Runs extend by half a wall at both ends to close the corners.
            start = lo - t / 2 if lo <= 1e-9 else lo
            end = hi + t / 2 if hi >= length - 1e-9 else hi
            painter.pane(at(start), at(end), z, STOREY, style.plaster, ao='base', soffit=soffit)
            continue
        kind, opening = hit
        sill, head = (opening['sill'], opening['head']) if kind == 'window' else (0., DOOR_HEAD)
        if sill:
            painter.pane(at(lo), at(hi), z, sill, style.plaster, ao='base')
        painter.pane(at(lo), at(hi), z + head, STOREY - head, style.plaster, soffit=soffit)
        for u, sign in ((lo, 1.), (hi, -1.)):           # The jamb that faces the camera.
            if painter.facing(ux * sign, uy * sign):
                painter.pane(at(u, -t / 2), at(u), z + sill, head - sill, style.plaster)
        mid = at((lo + hi) / 2, t / 2 + 1.)
        room = opening.get('roomId') if kind == 'window' else opening.get('swingRoom')
        main = None if kind == 'window' else opening['type'] == 'main'
        before = lo - max([end for start, end, *_ in cuts if end <= lo + 1e-6] + [0.])
        after = min([start for start, end, *_ in cuts if start >= hi - 1e-6] + [length]) - hi
        _opening(painter, style, light, kind, opening, at(lo, 0.), at(hi, 0.), n, z, t, kinds.get(room),
                 sheltered.covers(Point(mid)), main, (before, after))


def _steps(painter, a, b, out, rise, colour, width=None, count=3):
    """Steps descending outwards from edge a-b, centred, `count` treads of one foot."""
    length = math.dist(a, b)
    ux, uy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
    width = min(length, width or length)
    cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    for step in range(count):
        near, far = step * 1., (step + 1) * 1.
        corners = [(cx + ux * s * width / 2 + out[0] * d, cy + uy * s * width / 2 + out[1] * d)
                   for s, d in ((-1, near), (1, near), (1, far), (-1, far))]
        painter.prism(corners, 0., rise * (count - step) / count, colour, outline=True)


def _frontage(painter, W, D, indoor, porches, style, light, gate_x):
    """Compound wall on the plot edges the house leaves free: a stone base with white piers and
    black rails along the road, rendered walls elsewhere, and an open gate on the entry axis."""
    plot = box(0, 0, W, D)
    blocked = indoor.buffer(WALL_OUTER / 2 + .05, join_style=2)
    front_open = porches.buffer(.05, join_style=2) if not porches.is_empty else Polygon()
    runs, shadows, gate = [], [], None
    for a, b, side in (((0., 0.), (W, 0.), 'front'), ((W, 0.), (W, D), 'side'), ((W, D), (0., D), 'side'),
                       ((0., D), (0., 0.), 'side')):
        free = LineString([a, b]).difference(blocked)
        if side == 'front' and not front_open.is_empty:
            free = free.difference(front_open)
        for piece in parts(free):
            if piece.geom_type == 'LineString' and piece.length >= 1.5:
                runs.append((piece, side))
    for piece, side in runs:
        p, q = piece.coords[0], piece.coords[-1]
        inset = outer_offset(plot, p, q, -.32)
        ox, oy = outward(plot, p, q)
        if side != 'front':
            painter.edge(p, q, .5, 0., 5., style.plaster, offset=inset, ao='base')
            painter.edge(p, q, .64, 5., .16, mix(style.plaster, style.frame, .1), offset=inset, outline=True)
            shadows.append((LineString([p, q]).buffer(.3, cap_style=2), 5.2))
            continue
        spans = [(0., piece.length)]
        lo_x, hi_x = min(p[0], q[0]), max(p[0], q[0])
        if gate is None and gate_x is not None and lo_x + 2.6 <= gate_x <= hi_x - 2.6:
            g0, g1 = gate_x - 2. - lo_x, gate_x + 2. - lo_x
            if p[0] > q[0]:
                g0, g1 = piece.length - g1, piece.length - g0
            spans = [(0., g0), (g1, piece.length)]
            gate = (piece.interpolate(g0).coords[0], piece.interpolate(g1).coords[0])
        posts = []
        for s0, s1 in spans:
            if s1 - s0 < .8:
                continue
            pa, pb = piece.interpolate(s0).coords[0], piece.interpolate(s1).coords[0]
            painter.edge(pa, pb, .62, 0., 2.4, style.stone, offset=inset, pattern=style.cladding, ao='base')
            painter.edge(pa, pb, .7, 2.4, .12, mix(style.stone, '#FFFFFF', .45), offset=inset, outline=True)
            bays = max(1, math.ceil((s1 - s0) / 8.))
            posts += [s0 + (s1 - s0) * k / bays for k in range(bays + 1)]
            # Black horizontal slats on the stone base: one see-through face per stretch, and a cap.
            ra = (pa[0] - ox * .32, pa[1] - oy * .32)
            rb = (pb[0] - ox * .32, pb[1] - oy * .32)
            painter.pane(ra, rb, 2.52, 2.2, style.frame, screen='slatted')
            painter.edge(pa, pb, .12, 4.72, .1, style.frame, offset=inset, outline=True)
            shadows.append((LineString([pa, pb]).buffer(.32, cap_style=2), 2.6))
        for u in posts:
            cx, cy = piece.interpolate(min(max(u, .5), piece.length - .5)).coords[0]
            cx, cy = cx - ox * .32, cy - oy * .32
            painter.prism(rect_points((cx - .5, cy - .5, cx + .5, cy + .5)), 0., 5.3, style.plaster, outline=True, ao='base')
            painter.prism(rect_points((cx - .6, cy - .6, cx + .6, cy + .6)), 5.3, .16, mix(style.plaster, style.frame, .12),
                          outline=True)
            shadows.append((Point(cx, cy).buffer(.5, cap_style=3), 5.4))
    if gate:
        # The pedestrian gate stands open into the yard, with lamps on its piers.
        (gx, gy), (hx, hy) = gate
        x0, x1 = min(gx, hx), max(gx, hx)
        for px in (x0 - .5, x1 + .5):
            painter.prism(rect_points((px - .55, -.1, px + .55, 1.)), 0., 5.8, style.plaster, outline=True, ao='base')
            painter.prism(rect_points((px - .65, -.2, px + .65, 1.1)), 5.8, .18, mix(style.plaster, style.frame, .12), outline=True)
            lamp(painter, px, .45, 6.35, light)
        leaf = (x0 + .15, .9), (x0 + .15, .9 + (x1 - x0) * .48)
        painter.pane(leaf[0], leaf[1], .35, 3.9, style.frame, screen='bars')
        for zz in (.3, 4.15):
            painter.edge(leaf[0], leaf[1], .1, zz, .12, style.frame, outline=True)
        painter.edge((leaf[1][0], leaf[1][1] - .06), (leaf[1][0], leaf[1][1] + .06), .12, .3, 3.97, style.frame, outline=True)
    return shadows


def _pergola(painter, poly, z, style):
    """Timber louvres on slim dark posts over an upper terrace (FloorForge terraces)."""
    x1, y1, x2, y2 = poly.bounds
    if min(x2 - x1, y2 - y1) < 7 or poly.area < 60 or poly.envelope.area - poly.area > 1:
        return
    i, top = .8, 8.2
    for px, py in ((x1 + i, y1 + i), (x2 - i, y1 + i), (x2 - i, y2 - i), (x1 + i, y2 - i)):
        painter.prism(rect_points((px - .14, py - .14, px + .14, py + .14)), z, top, style.frame, outline=True)
    along_x = (x2 - x1) <= (y2 - y1)
    if along_x:
        for yy in (y1 + i, y2 - i):
            painter.prism(rect_points((x1 + i - .2, yy - .14, x2 - i + .2, yy + .14)), z + top, .32, style.frame, outline=True)
    else:
        for xx in (x1 + i, x2 - i):
            painter.prism(rect_points((xx - .14, y1 + i - .2, xx + .14, y2 - i + .2)), z + top, .32, style.frame, outline=True)
    span = (y1 + i, y2 - i) if along_x else (x1 + i, x2 - i)
    count = min(22, int((span[1] - span[0]) / .9))
    for k in range(count + 1):
        c = span[0] + k * (span[1] - span[0]) / max(count, 1)
        rect = (x1 + i - .35, c - .08, x2 - i + .35, c + .08) if along_x else (c - .08, y1 + i - .35, c + .08, y2 - i + .35)
        painter.prism(rect_points(rect), z + top + .32, .42, style.timber, outline=True)


def _roof_spot(plate, tower, size=(12., 10.)):
    """A free rectangle on the top roof for a shaded sitting area, near the stair tower if possible."""
    usable = plate.buffer(-1.2, join_style=2)
    if usable.is_empty:
        return None
    x1, y1, x2, y2 = usable.bounds
    spots = []
    for w, d in (size, size[::-1]):
        spots += [box(x, y, x + w, y + d) for x in (x1, x2 - w) for y in (y1, y2 - d)]
        if tower is not None:
            tx1, ty1, tx2, ty2 = tower.bounds
            spots += [box(tx2 + 1.5, ty1, tx2 + 1.5 + w, ty1 + d), box(tx1 - 1.5 - w, ty1, tx1 - 1.5, ty1 + d),
                      box(tx1, ty2 + 1.5, tx1 + w, ty2 + 1.5 + d), box(tx1, ty1 - 1.5 - d, tx1 + w, ty1 - 1.5)]
    spots = [s for s in spots if usable.covers(s) and (tower is None or s.distance(tower) >= 1.4)]
    if not spots:
        return None
    return min(spots, key=lambda s: (s.distance(tower) if tower is not None else 0., s.bounds))


def draw_exterior(ctx, floors, palette, angle, style_id):
    """Exterior of supplied floors only. Empty plots never acquire a house."""
    style = STYLES[style_id]
    bg, surface, ink, muted, _ = palette
    light = DUSK if sum(rgb(bg)) < 1.5 else DAY
    first = floors[0]
    W, D = float(first['width']), float(first['depth'])
    count, half = len(floors), WALL_OUTER / 2
    levels = [PLINTH + i * STOREY_HEIGHT for i in range(count + 1)]
    site = box(-half, -half, W + half, D + half)
    indoor = [unary_union([r['shape'] for r in f['rooms'] if not r['outdoor']]) for f in floors]
    outdoor = [[r for r in f['rooms'] if r['outdoor']] for f in floors]
    porch_rooms = [r for r in outdoor[0] if r.get('kind') == 'paved']
    porches = unary_union([r['shape'] for r in porch_rooms])
    decks = [Polygon()] + [unary_union([r['shape'] for r in outdoor[i]]) for i in range(1, count)]
    covered = [unary_union([indoor[0], porches])] + indoor[1:]
    above = [indoor[i + 1] if i + 1 < count else Polygon() for i in range(count)]
    floating = style.roof_edge in ('floating', 'slim')
    overhang = {'floating': 1.75, 'slim': 1.25}.get(style.roof_edge, 0.)
    thick = {'floating': .8, 'slim': .5}.get(style.roof_edge, SLAB + .1)
    plates = []
    for i in range(count):
        plate = covered[i].buffer(half + overhang, join_style=2).intersection(site) if not covered[i].is_empty else Polygon()
        plates.append(plate.difference(above[i]) if not above[i].is_empty else plate)
    top_z = levels[-1] + max(PARAPET, MUMTY + .6)
    painter = Painter(W, D, top_z + 1., angle, margin=(3., 14., 3., 3.))
    painter.finished = True
    painter.light = light
    dx, dy = sun_offset(painter.theta)
    cache = {}

    # -- Entrance: the main door sets the gate, the path and the steps.
    main = next((d for d in first['architecture']['doors'] if d['type'] == 'main'), None)
    gate_x, onto_porch, door_out = None, False, None
    if main is not None:
        (ax, ay), (bx, by) = main['a'], main['b']
        mid = ((ax + bx) / 2, (ay + by) / 2)
        door_out = (-main['normal'][0], -main['normal'][1])
        step_out = Point(mid[0] + door_out[0] * 1.2, mid[1] + door_out[1] * 1.2)
        onto_porch = porches.covers(step_out) if not porches.is_empty else False
        if not onto_porch and door_out[1] < -.7:
            gate_x = mid[0]
        elif onto_porch:
            porch = next((p for p in polygons(porches) if p.buffer(.1).covers(step_out)), None)
            if porch is not None and porch.bounds[1] > 1e-6:
                gate_x = (porch.bounds[0] + porch.bounds[2]) / 2

    # -- Setting: sky and field, the street with a footpath on both sides, the plot and its
    # open areas, all cut at the horizon.
    horizon = backdrop(ctx, painter, light)
    ctx.save(); ctx.rectangle(0, horizon, 1600, 1000 - horizon); ctx.clip()
    road = '#4F5457' if not light.dim else '#3A4045'
    painter.flat(ctx, box(-200, -30.4, W + 200, -6.4), road, light, 'road', cache=cache)
    painter.flat(ctx, unary_union([box(k * 12., -18.6, k * 12. + 5., -18.2) for k in range(-17, int((W + 200) / 12) + 1)]),
                 '#D9D6CE', light, cache=cache)
    painter.flat(ctx, unary_union([box(-200, -6.4, W + 200, -6.), box(-200, -30.8, W + 200, -30.4)]), '#CFCBC2', light,
                 cache=cache)
    painter.flat(ctx, unary_union([box(-200, -6., W + 200, 0.), box(-200, -36.8, W + 200, -30.8)]), '#C6C7C3', light,
                 'pavers', cache=cache)
    painter.flat(ctx, box(0, 0, W, D), style.paving, light, 'cobble', cache=cache)
    lawn = '#6F9446' if style.roof_edge != 'parapet' else '#76914A'
    for room in outdoor[0]:
        if room.get('kind') == 'green':
            painter.flat(ctx, room['shape'], lawn, light, 'lawn', cache=cache)
    walk = None
    if gate_x is not None:
        if not onto_porch:
            target = (main['a'][1] + main['b'][1]) / 2 - half - 3.
        else:
            target = min((p.bounds[1] for p in polygons(porches) if p.bounds[0] - 1e-6 <= gate_x <= p.bounds[2] + 1e-6),
                         default=0.)
        if target > .5:
            walk = box(gate_x - 2., 0., gate_x + 2., target).difference(indoor[0].buffer(half))
            painter.flat(ctx, walk, mix(style.paving, '#FFFFFF', .45), light, 'pavers', cache=cache)

    # -- Planting: the garden's own trees, hedges and cones along the compound wall, and
    # neighbourhood trees that frame the picture from behind the house, never in front of it.
    plants = []                                   # (x, y, radius, shape, tone) with shape tree, shrub or cone
    for room in outdoor[0]:
        if room.get('kind') != 'green':
            continue
        x1, y1, x2, y2 = room['shape'].bounds
        for fixture in room.get('fixtures', []):
            if fixture['kind'] == 'tree':
                fx1, fy1, fx2, fy2 = fixture['bounds']
                plants.append(((fx1 + fx2) / 2, (fy1 + fy2) / 2, max(2.6, min(4.6, min(x2 - x1, y2 - y1) * .3)), 'tree', 0.))
    inner = box(1.1, 1.1, W - 1.1, D - 1.1).boundary
    hedges = 0
    for room in outdoor[0]:
        if room.get('kind') != 'green':
            continue
        hedge = inner.intersection(room['shape'].buffer(-1.05, join_style=2))
        if walk is not None:
            hedge = hedge.difference(walk.buffer(.8))
        for piece in parts(hedge):
            if piece.geom_type != 'LineString' or piece.length < 1.5:
                continue
            steps = max(1, int(piece.length / 2.3))
            for k in range(steps + 1):
                sx, sy = piece.interpolate(k / steps, normalized=True).coords[0]
                if hedges < 40 and all(math.dist((sx, sy), p[:2]) > p[2] + 1.2 for p in plants if p[3] == 'tree'):
                    cone = style.roof_edge == 'floating' and k % 2 == 0
                    plants.append((sx, sy, 1.3 if cone else 1.05 + .1 * ((k * 7) % 3), 'cone' if cone else 'shrub', .1 * (k % 3)))
                    hedges += 1
    rnd = random.Random(f'{W:.1f}:{D:.1f}:{angle}')
    toward, reach = painter.toward_camera, (W + D) / 2
    ring = [(x, D + 9.) for x in np.arange(-6., W + 7., 15.)] + [(-9., y) for y in np.arange(4., D + 9., 15.)] + \
           [(W + 9., y) for y in np.arange(4., D + 9., 15.)] + [(x, -3.) for x in np.arange(-14., W + 15., 16.)] + \
           [(x, -34.) for x in np.arange(-22., W + 23., 18.)]
    for x, y in ring:
        x, y = x + rnd.uniform(-2.5, 2.5), y + rnd.uniform(-2., 2.)
        r = rnd.uniform(4.2, 6.2)
        if (x - W / 2) * toward[0] + (y - D / 2) * toward[1] > -reach * .3:
            continue
        if painter.point(x, y, 3.8 + r * .35 + r * 2.2)[1] < 18:
            continue
        plants.append((x, y, r, 'tree', rnd.uniform(.05, .35)))

    # -- Cast shadows on the ground: the house, its slabs, the compound wall and the trees.
    house_shadow = []
    for i in range(count):
        height = levels[i + 1] + (PARAPET if not floating and i == count - 1 else 0.)
        for poly in polygons(indoor[i].buffer(half, join_style=2)):
            house_shadow.append(sweep(poly, dx * height, dy * height))
        for poly in polygons(plates[i]):
            house_shadow.append(affinity.translate(poly, dx * levels[i + 1], dy * levels[i + 1]))
    for shape, height in _frontage(painter, W, D, indoor[0], porches, style, light, gate_x):
        for poly in polygons(shape):
            house_shadow.append(sweep(poly, dx * height, dy * height))
    if house_shadow:
        cast = unary_union(house_shadow)
        for spread, opacity in ((1.3, .3), (.45, .4), (0., .5)):
            for poly in polygons(cast.buffer(spread) if spread else cast):
                path(ctx, [painter.point(x, y, .02) for x, y in poly.exterior.coords])
                ctx.set_source_rgba(*SHADOW, light.shadow * opacity); ctx.fill()
    for tx, ty, r, shape, _ in plants:
        h = {'shrub': r * 1.4, 'cone': r * 3.}.get(shape, 3.6 + r * 1.3)
        cx, cy = painter.point(tx + dx * h, ty + dy * h, .02)
        for spread, opacity in ((1.15, .3), (.85, .45)):
            ctx.save(); ctx.translate(cx, cy); ctx.scale(1., .5 if shape != 'cone' else .4)
            ctx.new_path(); ctx.arc(0, 0, r * painter.scale * spread, 0, math.tau); ctx.restore()
            ctx.set_source_rgba(*SHADOW, light.shadow * opacity); ctx.fill()
    ctx.restore()
    horizon_haze(ctx, light, horizon)

    # -- Everything that stands, in one exactly ordered scene.
    for tx, ty, r, shape, tone in plants:
        tree(painter, tx, ty, r, style, light, shrub=shape != 'tree', cone=shape == 'cone', tone=tone)
    base = PLINTH
    if not indoor[0].is_empty:
        painter.slab(indoor[0].buffer(half + .3, join_style=2), 0., base, style.stone,
                     top=mix(style.stone, '#FFFFFF', .3), side_pattern=style.cladding, outline=True)
    for room in porch_rooms:
        for poly in room['polygons']:
            painter.slab(poly, 0., base, style.stone, top=mix(style.paving, '#FFFFFF', .4), top_pattern='pavers',
                         side_pattern=style.cladding, outline=True)
            # Columns at the open corners carry the roof slab over the verandah.
            for x, y in list(poly.simplify(1e-6).exterior.coords)[:-1]:
                if indoor[0].distance(Point(x, y)) < .6:
                    continue
                column = box(x - .9, y - .9, x + .9, y + .9).intersection(poly)
                if column.is_empty:
                    continue
                cx = x if abs(column.bounds[0] - x) < 1e-6 else x - .9
                cy = y if abs(column.bounds[1] - y) < 1e-6 else y - .9
                height = levels[1] - thick - base
                if style.columns == 'steel':
                    painter.prism(rect_points((cx + .3, cy + .3, cx + .6, cy + .6)), base, height, style.frame, outline=True)
                else:
                    stone = style.columns == 'stone'
                    painter.prism(rect_points((cx, cy, cx + .9, cy + .9)), base, height, style.stone if stone else style.plaster,
                                  pattern=style.cladding if stone else None, outline=True, ao='base')
            # Steps down from the open edge that faces the road, else the yard.
            best = None
            for a, b in segments(LineString(poly.simplify(1e-6).exterior.coords)):
                mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                if math.dist(a, b) < 3. or indoor[0].distance(Point(mid)) < .5:
                    continue
                if abs(mid[0]) < 1e-6 or abs(mid[0] - W) < 1e-6 or abs(mid[1] - D) < 1e-6:
                    continue
                out = outward(poly, a, b)
                score = math.dist(a, b) + (100. if out[1] < -.7 else 0.)
                if best is None or score > best[0]:
                    best = (score, a, b, out)
            if best:
                _, a, b, out = best
                _steps(painter, a, b, out, base, mix(style.stone, '#FFFFFF', .35), width=min(math.dist(a, b) - 1.5, 6.5))
            for fixture in room.get('fixtures', []):
                for solid in fixture['solids']:
                    z0, height, colour = solid['z'], solid['height'], style.timber
                    if fixture['kind'] == 'seating' and solid['tone'] == 'wood' and height > 2:
                        height, colour = 1.2, mix(style.frame, style.timber, .3)      # Low lounge frames...
                    elif solid['tone'] == 'linen':
                        z0, height, colour = 1.2, .38, '#ECE7DC'                       # ...with pale cushions.
                    elif solid['tone'] != 'wood':
                        colour = mix(style.plaster, style.timber, .2)
                    painter.prism(solid['points'], base + z0, height, colour, outline=True)
    for room in outdoor[0]:
        if room.get('kind') == 'balcony':     # An open terrace at ground level: a low paved platform.
            for poly in room['polygons']:
                painter.slab(poly, 0., base / 2, style.stone, top=mix(style.paving, '#FFFFFF', .3), top_pattern='pavers',
                             side_pattern=style.cladding, outline=True)

    for i, floor in enumerate(floors):
        z, level = levels[i], levels[i + 1]
        footprint = indoor[i]
        kinds = {r['placementId']: r.get('kind') for r in floor['rooms']}
        if i:
            # Upper storeys over open ground below stand on a slab of their own.
            for poly in polygons(footprint.difference(covered[i - 1])):
                painter.slab(poly.buffer(half, join_style=2), z - thick, thick, style.plaster, outline=True)
            # Terraces and balconies: timber decking, a lawn for roof gardens, planters and seats.
            for room in outdoor[i]:
                green = room.get('kind') == 'green'
                for poly in room['polygons']:
                    if not covered[i - 1].buffer(.1).covers(poly):
                        painter.slab(poly, z - thick, thick, style.plaster, outline=True)
                    painter.slab(poly, z, .12, lawn if green else style.timber, top_pattern='lawn' if green else 'deck',
                                 outline=True)
                    if style.pergola and not green and room.get('kind') == 'balcony':
                        _pergola(painter, poly, z + .12, style)
                for fixture in room.get('fixtures', []):
                    for solid in fixture['solids']:
                        if solid['tone'] == 'plant':
                            xs, ys = zip(*solid['points'])
                            tree(painter, sum(xs) / len(xs), sum(ys) / len(ys), max(.8, (max(xs) - min(xs)) * .75), style,
                                 light, shrub=True, z=z + .12 + solid['z'])
                        else:
                            colour = style.timber if solid['tone'] == 'wood' else mix(style.plaster, style.stone, .3)
                            painter.prism(solid['points'], z + .12 + solid['z'], solid['height'], colour, outline=True)
        if footprint.is_empty:
            continue
        # Walls with their openings; overhangs above them cast sharp shadows on the walls.
        openings = [('window', o) for o in floor['architecture']['windows']] + \
                   [('door', o) for o in floor['architecture']['doors'] if o['type'] in ('main', 'exterior')]
        for wall in merged_walls(floor['architecture']['walls']):
            a, b = wall['a'], wall['b']
            n = outward(footprint, a, b)
            probe = Point((a[0] + b[0]) / 2 + n[0] * (half + .25), (a[1] + b[1]) / 2 + n[1] * (half + .25))
            if floating and plates[i].covers(probe):
                soffit = (overhang, level - thick)
            elif i + 1 < count:
                soffit = (.45, level - .55)
            else:
                soffit = None
            _wall(painter, wall, openings, z, style, light, footprint, kinds, soffit, plates[i])
        if i + 1 < count:
            # A crisp projecting floor band where the storey above stands flush.
            band = footprint.buffer(half + .45, join_style=2).difference(footprint)
            painter.slab(band, level - .55, .6, style.plaster if style.roof_edge != 'slim' else style.roof, outline=True)

    # The stair rises to the roof under a stone-clad stair tower on the top floor.
    stair = next((f for f in floors[-1]['architecture']['fixtures'] if f['kind'] == 'stair'), None)
    tower = box(*stair['bounds']).buffer(.45, join_style=2) if stair and not plates[-1].is_empty else None
    if tower is not None:
        level = levels[-1]
        cabin = tower.bounds
        clad = style.stone if style.roof_edge != 'slim' else style.plaster
        painter.prism(rect_points(cabin), level, MUMTY, clad, pattern=style.cladding if clad == style.stone else None,
                      outline=True, ao='base')
        roof_colour = style.roof if style.roof_edge == 'slim' else style.plaster
        painter.prism(rect_points((cabin[0] - .6, cabin[1] - .6, cabin[2] + .6, cabin[3] + .6)), level + MUMTY, .45,
                      roof_colour, outline=True)
        mid = (cabin[0] + cabin[2]) / 2
        painter.pane((mid - 1.5, cabin[1] - .03), (mid + 1.5, cabin[1] - .03), level, DOOR_HEAD, style.timber, pattern='timber')
        h = MUMTY + .45
        painter.decal(sweep(tower, dx * h, dy * h).difference(tower).intersection(plates[-1]), level + .14,
                      light.shadow * .9)

    # -- Roofs: floating slabs with frameless glass rails, slim dark planes with slatted metal
    # rails, or parapets with a coping.
    for i in range(count):
        level, plate = levels[i + 1], plates[i]
        if plate.is_empty:
            continue
        if style.roof_edge == 'floating':
            painter.slab(plate, level - thick, thick, style.plaster, top=style.roof, top_pattern=style.roof_finish, outline=True)
        elif style.roof_edge == 'slim':
            painter.slab(plate, level - thick, thick, style.roof, top=mix(style.paving, '#FFFFFF', .62),
                         top_pattern=style.roof_finish, outline=True)
        else:
            painter.slab(plate, level - thick, thick, style.plaster, top=style.roof, top_pattern=style.roof_finish, outline=True)
        walkable = unary_union([plate, decks[i + 1]]) if i + 1 < count else plate
        edge_line = walkable.boundary
        if i + 1 < count and not indoor[i + 1].is_empty:
            edge_line = edge_line.difference(indoor[i + 1].buffer(half + .3, join_style=2))
        if i + 1 == count and tower is not None:
            edge_line = edge_line.difference(tower.buffer(1.2, join_style=2))
        for a, b in segments(edge_line):
            if math.dist(a, b) < .3:
                continue
            n = outward(walkable, a, b)
            inset = .3 if style.roof_edge != 'parapet' else PARAPET_THICK / 2
            ra, rb = (a[0] - n[0] * inset, a[1] - n[1] * inset), (b[0] - n[0] * inset, b[1] - n[1] * inset)
            if style.roof_edge == 'floating':
                # Frameless glass in a slim dark base channel (FloorForge balconies).
                painter.edge(ra, rb, .2, level, .24, style.frame, outline=True)
                painter.pane(ra, rb, level + .24, 3.1, style.glass, glass=True, rail=True, outline=(False, False, True, False))
            elif style.roof_edge == 'slim':
                painter.pane(ra, rb, level + .1, 3.2, style.frame, screen='slatted')
                painter.edge(ra, rb, .14, level + 3.3, .1, style.frame, outline=True)
            else:
                painter.edge(ra, rb, PARAPET_THICK, level, PARAPET - COPING, style.plaster, ao='base')
                painter.edge(ra, rb, PARAPET_THICK + .22, level + PARAPET - COPING, COPING, style.roof, outline=True)
        if i + 1 == count and style.pergola:
            spot = _roof_spot(plate, tower)
            if spot is not None:
                _pergola(painter, spot, level, style)
        # The storey above casts its shadow on this terrace.
        if i + 1 < count and not indoor[i + 1].is_empty:
            h = STOREY + (PARAPET if not floating and i + 2 == count else 0.)
            upper = indoor[i + 1].buffer(half, join_style=2)
            cast = unary_union([sweep(p, dx * h, dy * h) for p in polygons(upper)])
            painter.decal(cast.difference(upper).intersection(walkable), level + .14, light.shadow * .9)
    # The verandah floor lies in the shade of its roof, except where the sun reaches in; at dusk
    # downlights in the roof leave warm pools of light on it.
    if not porches.is_empty and not plates[0].is_empty:
        h = levels[1] - thick - base
        painter.decal(affinity.translate(plates[0], dx * h, dy * h).intersection(porches), base + .01, light.shadow * .8)
        if light.glow:
            pools = 0
            for poly in polygons(porches):
                inner = poly.buffer(-1.8, join_style=2)
                x1, y1, x2, y2 = poly.bounds
                for px in np.arange(x1 + 3.5, x2 - 1., 7.):
                    for py in np.arange(y1 + 3.5, y2 - 1., 7.):
                        if pools < 8 and inner.covers(Point(px, py)):
                            spot = box(px - 3.6, py - 3.6, px + 3.6, py + 3.6).intersection(poly)
                            for points, _ in convex_pieces(spot) if spot.geom_type == 'Polygon' else []:
                                painter.face([(*p, base + .02) for p in points], '#000000', glow=(px, py, base, 3.6))
                            pools += 1
    # Steps up to the plinth outside a main door that opens straight onto the yard.
    if main is not None and not onto_porch:
        (ax, ay), (bx, by) = main['a'], main['b']
        ux, uy = (bx - ax) / main['width'], (by - ay) / main['width']
        a = (ax - ux * .75 + door_out[0] * (half + .3), ay - uy * .75 + door_out[1] * (half + .3))
        b = (bx + ux * .75 + door_out[0] * (half + .3), by + uy * .75 + door_out[1] * (half + .3))
        _steps(painter, a, b, door_out, base, mix(style.stone, '#FFFFFF', .35))
    painter.draw(ctx)
    # A caption band in the theme's own colour keeps the titles legible over the scene.
    ctx.rectangle(0, 872, 1600, 128); ctx.set_source_rgba(*rgb(bg), .92); ctx.fill()
    text(ctx, 800, 908, f'{style.title.upper()} · EXTERIOR', 30, ink, True)
    text(ctx, 800, 945, f'{len(floors)} {"floor" if len(floors) == 1 else "floors"} from your map · proposed materials, 1\'-6" plinth and 10 ft storeys', 21, muted)
