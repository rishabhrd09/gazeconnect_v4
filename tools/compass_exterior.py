"""Small, deterministic exterior renderer using the existing Cairo runtime.

Style is a material recipe, never a replacement for the Compass footprint.
No WebGL, downloaded assets, animation, extra process or renderer installation.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cairo
from shapely.geometry import LineString, Point
from shapely.ops import triangulate, unary_union

from compass_architecture import parts, rect_points, segments
from compass_drawing import mix, paint, path, text, rgb


@dataclass(frozen=True)
class ExteriorStyle:
    title: str
    plaster: str
    stone: str
    timber: str
    frame: str
    roof: str
    glass: str


STYLES = {
    'verandah': ExteriorStyle('Verandah', '#EEECE4', '#979A91', '#987657', '#34494D', '#DADCD6', '#A8C6C9'),
    'warm-modern': ExteriorStyle('Warm Modern', '#EBDFCD', '#B2A48F', '#8B603E', '#49453E', '#D8C8AD', '#B7CCCB'),
    'terracotta': ExteriorStyle('Earth & Terracotta', '#D6A185', '#A18B77', '#725443', '#454C43', '#B97659', '#B1C4B9'),
}
STOREY_HEIGHT = 10.0  # Proposed presentation height; independent of 2D boundaries.
CAMERA_PITCH = .32  # Lower than the cutaway camera to show the facades clearly.


def ordered_faces(faces, camera):
    """BSP ordering for orthogonal architecture, including overlapping storeys.

    Centroid depth sorting makes windows appear through large roof polygons.
    Split intersecting faces at an existing X/Y/Z plane instead. Each branch
    removes at least one coplanar face; the 4x4 input limits scene complexity.
    """
    if not faces:
        return
    planes = [sorted({points[0][axis] for points, _ in faces
                      if all(abs(p[axis] - points[0][axis]) < 1e-7 for p in points)})
              for axis in range(3)]
    axis = max(range(3), key=lambda i: len(planes[i]))
    plane = planes[axis][len(planes[axis]) // 2]
    low, same, high = [], [], []
    for points, colour in faces:
        distances = [p[axis] - plane for p in points]
        if max(distances) < 1e-7 and min(distances) > -1e-7:
            same.append((points, colour))
        elif max(distances) <= 1e-7:
            low.append((points, colour))
        elif min(distances) >= -1e-7:
            high.append((points, colour))
        else:
            halves = ([], [])
            for a, b in zip(points, points[1:] + points[:1]):
                da, db = a[axis] - plane, b[axis] - plane
                if da <= 1e-7:
                    halves[0].append(a)
                if da >= -1e-7:
                    halves[1].append(a)
                if da * db < 0:
                    t = da / (da - db)
                    crossing = tuple(a[i] + t * (b[i] - a[i]) for i in range(3))
                    for half in halves:
                        half.append(crossing)
            low.append((halves[0], colour))
            high.append((halves[1], colour))
    far, near = (low, high) if camera[axis] > 0 else (high, low)
    yield from ordered_faces(far, camera)
    yield from same
    yield from ordered_faces(near, camera)


class Painter:
    """Fixed camera and vector faces; no persistent scene or GPU allocation."""

    def __init__(self, width: float, depth: float, height: float, angle: int):
        self.width, self.depth = width, depth
        self.theta = angle * math.pi / 2
        corners = [self.project(x, y, z) for x in (0, width) for y in (0, depth) for z in (-.5, height)]
        xs, ys = zip(*corners)
        self.centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
        self.scale = min(1400 / (max(xs) - min(xs)), 775 / (max(ys) - min(ys)))
        self.shading_y = tuple(440 + (y - self.centre[1]) * self.scale for y in (min(ys), max(ys)))
        self.faces = []
        self.finished = False

    def project(self, x, y, z=0):
        x, y = x - self.width / 2, y - self.depth / 2
        x, y = x * math.cos(self.theta) - y * math.sin(self.theta), x * math.sin(self.theta) + y * math.cos(self.theta)
        return (x - y) * .866, -(x + y) * CAMERA_PITCH - z

    def point(self, x, y, z=0):
        px, py = self.project(x, y, z)
        return 800 + (px - self.centre[0]) * self.scale, 440 + (py - self.centre[1]) * self.scale

    def face(self, points, colour):
        self.faces.append((points, colour))

    def slab(self, poly, z, height, colour):
        rings = [list(r.coords)[:-1] for r in (poly.exterior, *poly.interiors)]
        for ring in rings:
            for a, b in zip(ring, ring[1:] + ring[:1]):
                self.face([(*a, z), (*b, z), (*b, z + height), (*a, z + height)], mix(colour, '#263A3F', .2))
        # Convex faces make plane splitting exact. Clip the triangulation so
        # courtyard holes and concave footprints remain empty, never roofed.
        for triangle in triangulate(poly):
            for piece in parts(triangle.intersection(poly)):
                if piece.geom_type == 'Polygon' and piece.area > .00001:
                    self.face([(*p, z + height) for p in list(piece.exterior.coords)[:-1]], colour)

    def prism(self, points, z, height, colour):
        for a, b in zip(points, points[1:] + points[:1]):
            shade = mix(colour, '#263A3F', .16 if abs(a[0] - b[0]) < .01 else .30)
            self.face([(*a, z), (*b, z), (*b, z + height), (*a, z + height)], shade)
        self.face([(*p, z + height) for p in points], colour)

    def edge(self, a, b, thickness, z, height, colour):
        length = math.dist(a, b)
        if length < .001:
            return
        nx, ny = -(b[1] - a[1]) / length * thickness / 2, (b[0] - a[0]) / length * thickness / 2
        self.prism([(a[0] - nx, a[1] - ny), (b[0] - nx, b[1] - ny),
                    (b[0] + nx, b[1] + ny), (a[0] + nx, a[1] + ny)], z, height, colour)

    def draw(self, ctx):
        camera = (-math.cos(self.theta) - math.sin(self.theta),
                  math.sin(self.theta) - math.cos(self.theta), CAMERA_PITCH * 2)
        gradients = {}
        for points, colour in ordered_faces(self.faces, camera):
            projected = [self.point(*p) for p in points]
            path(ctx, projected)
            if self.finished:
                # One lighting field per material: triangulation and BSP splits
                # must not turn a flat roof or wall into differently shaded patches.
                gradient = gradients.get(colour)
                if gradient is None:
                    gradient = cairo.LinearGradient(0, self.shading_y[0], 0, self.shading_y[1])
                    gradient.add_color_stop_rgb(0, *rgb(mix(colour, '#FFFFFF', .045)))
                    gradient.add_color_stop_rgb(1, *rgb(mix(colour, '#293B40', .055)))
                    gradients[colour] = gradient
                ctx.set_source(gradient)
            else:
                paint(ctx, colour)
            ctx.fill_preserve()
            # Same-colour hairline covers antialias seams between split faces.
            ctx.set_line_width(1.0)
            ctx.stroke()


def _wall(painter, wall, openings, z, style):
    a, b = wall['a'], wall['b']
    line = LineString([a, b])
    length = line.length
    cuts, positions = [], {0., length}
    for kind, opening in openings:
        overlap = line.intersection(LineString([opening['a'], opening['b']]))
        if overlap.length < .01:
            continue
        lo, hi = sorted(line.project(Point(p)) for p in (opening['a'], opening['b']))
        lo, hi = max(0., lo), min(length, hi)
        cuts.append((lo, hi, kind))
        positions.update((lo, hi))
    positions = sorted(positions)
    for lo, hi in zip(positions, positions[1:]):
        kind = next((kind for start, end, kind in cuts if start <= (lo + hi) / 2 <= end), None)
        pa, pb = line.interpolate(lo).coords[0], line.interpolate(hi).coords[0]
        if kind is None:
            painter.edge(pa, pb, wall['thickness'], z, STOREY_HEIGHT, style.plaster)
            continue
        sill, head = (2.5, 7.5) if kind == 'window' else (0., 7.5)
        if sill:
            painter.edge(pa, pb, wall['thickness'], z, sill, style.plaster)
        painter.edge(pa, pb, wall['thickness'], z + head, STOREY_HEIGHT - head, style.plaster)
        painter.edge(pa, pb, .10, z + sill, head - sill, style.glass if kind == 'window' else style.timber)
        # Slender frames and a centre mullion make actual openings legible.
        for offset in (lo, hi, (lo + hi) / 2):
            centre = line.interpolate(offset)
            painter.prism(rect_points((centre.x - .065, centre.y - .065, centre.x + .065, centre.y + .065)), z + sill, head - sill, style.frame)
        for height in (sill, head):
            painter.edge(pa, pb, .18, z + height - .06, .12, style.frame)
        if kind == 'window':
            painter.edge(pa, pb, .95, z + sill - .12, .12, style.stone)


def draw_exterior(ctx, floors, palette, angle, style_id):
    """Exterior of supplied floors only. Empty plots never acquire a house."""
    style = STYLES[style_id]
    bg, surface, ink, muted, _ = palette
    first = floors[0]
    painter = Painter(first['width'], first['depth'], len(floors) * STOREY_HEIGHT + 1.5, angle)
    painter.finished = True
    footprints = [unary_union([r['shape'] for r in f['rooms'] if not r['outdoor']]) for f in floors]
    # A restrained presentation shadow gives the quick vector view depth.
    # Preview shading is computed locally without an external rendering engine.
    for spread, opacity in ((1.3, .025), (.7, .035), (0., .055)):
        for poly in parts(footprints[0]):
            if poly.geom_type != 'Polygon': continue
            outline = list(poly.exterior.coords)
            path(ctx, [painter.point(x + 2.8 + spread, y - 1.8 - spread, -.45) for x, y in outline])
            ctx.set_source_rgba(.1, .17, .2, opacity); ctx.fill()
    # A quiet plot slab; gardens/paving occur only in explicitly placed areas.
    painter.prism(rect_points((0, 0, first['width'], first['depth'])), -.4, .4, '#D7D5C9')
    for index, floor in enumerate(floors):
        z = index * STOREY_HEIGHT
        occupied_above = footprints[index + 1] if index + 1 < len(floors) else None
        for room in floor['rooms']:
            if not room['outdoor']:
                continue
            garden = any(word in room['room'].lower() for word in ('garden', 'lawn', 'backyard'))
            for poly in room['polygons']:
                painter.slab(poly, z, .12, '#8FAD80' if garden else '#D1C1A8')
            if index:
                for a, b in segments(room['shape'].boundary.intersection(unary_union([r['shape'] for r in floor['rooms']]).boundary)):
                    painter.edge(a, b, .09, z + .2, 2.7, style.glass)
                    painter.edge(a, b, .14, z + 2.9, .1, style.frame)
        openings = [('window', o) for o in floor['architecture']['windows']] + [('door', o) for o in floor['architecture']['doors']]
        for wall in floor['architecture']['walls']:
            if wall['exterior']:
                _wall(painter, wall, openings, z, style)
        # Roofs are bounded by real indoor footprints, including L-shapes and
        # holes. The next floor removes only the part it actually occupies.
        roof = footprints[index] if occupied_above is None else footprints[index].difference(occupied_above)
        for poly in parts(roof):
            if poly.geom_type == 'Polygon':
                painter.slab(poly, z + STOREY_HEIGHT, .35, style.roof)
        for a, b in segments(roof.boundary):
            painter.edge(a, b, .25, z + STOREY_HEIGHT + .35, .65, style.plaster)
        # Plinth/roof-edge bands follow the facade; no invented balcony or
        # stair tower is added just to resemble a reference photograph.
        for a, b in segments(footprints[index].boundary):
            painter.edge(a, b, .78, z, .30, style.stone)
            painter.edge(a, b, .82, z + STOREY_HEIGHT - .20, .18, style.frame)
    painter.draw(ctx)
    text(ctx, 800, 908, f'{style.title.upper()} · EXTERIOR', 30, ink, True)
    text(ctx, 800, 945, f'{len(floors)} {"floor" if len(floors) == 1 else "floors"} from your map · proposed materials and 10 ft storey height', 21, muted)
