"""The 2D floor plan, one per floor, on screen and on an A3 sheet (IMPLEMENTATION_PLAN.md §6.2).

Everything comes from the PlanModel (compass_geometry): the same walls, openings, stair and
void every other view and the CAD file use. The road is always at the bottom, column 1 on the
left, never rotated or mirrored. Hierarchy follows IS 962 / ISO 128 practice: cut walls are
one solid poché, then openings, then the stair, then furniture and patterns; a few quiet
zone tints instead of a colour per room; no walls inside the open living, dining, kitchen
and stair hall. Text is drawn from the bundled font's outlines (compass_text).
"""
from __future__ import annotations

import io
import math
from typing import Dict, List, Tuple

import cairo
import shapely
from shapely.geometry import LineString, Polygon, box

import compass_geometry as geometry
import compass_text as text
from compass_resources import checkpoint
from compass_standards import DOOR_HEAD, STAIR_CUT, TURNING_CIRCLE, ft_in

U = geometry.U
IN = geometry.IN

# Palettes per app theme: (page, paper, ink, muted, edge) as in compass_presentation.PALETTES.
THEMES = {
    'warm': ('#F4F2EC', '#FFFEF9', '#253641', '#536871', '#9AAAB2'),
    'dark': ('#151B23', '#263443', '#F5F7FA', '#BECDD9', '#4E6579'),
    'midnight-navy': ('#10192B', '#243952', '#F4F7FC', '#C0CEE1', '#59728F'),
    'serene-warm': ('#F6F2E9', '#FFFDF6', '#283C35', '#56695E', '#A5AD96'),
    'serene-dark': ('#18211F', '#2D3C37', '#F5F6ED', '#C6D3C9', '#637B6D'),
    'serene-midnight-navy': ('#111B30', '#273B53', '#F4F7FC', '#C0CEE1', '#657B93'),
    'print': ('#FFFFFF', '#FFFFFF', '#141414', '#4A4A4A', '#9A9A9A'),
}

# Line widths and text sizes: screen in pixels at 1000 px (scaled with the canvas), print in mm.
SCREEN = dict(plot=1.6, wall=.9, door=1.4, arc=.9, window=1.1, glass=.9, fine=.8, dim=.85, tick=1.4, pattern=.5,
              halo=3.2, name=17., size=12.5, area=11.5, dim_text=12., small=11., minimum=9., gap=10., over=4.,
              tier1=26., tier2=46., tick_len=4., text_lift=3., dash=(5., 4.), rail=.8)
PRINT = dict(plot=.5, wall=.25, door=.35, arc=.18, window=.25, glass=.18, fine=.13, dim=.18, tick=.35, pattern=.1,
             halo=.6, name=3.0, size=2.2, area=2.0, dim_text=2.3, small=1.9, minimum=1.8, gap=1.6, over=1.6,
             tier1=7., tier2=13., tick_len=1.1, text_lift=.8, dash=(1.2, .9), rail=.18)


def rgb(value):
    return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))


def mix(a, b, t):
    return '#' + ''.join(f'{round((x * (1 - t) + y * t) * 255):02X}' for x, y in zip(rgb(a), rgb(b)))


def luminance(value):
    r, g, b = rgb(value)
    return .2126 * r + .7152 * g + .0722 * b


class Ink:
    """Every colour of one drawing, from one theme: dark themes get light poché on deep paper."""

    def __init__(self, theme):
        page, paper, ink, muted, edge = THEMES[theme]
        self.dark = luminance(page) < .45
        self.page, self.paper, self.ink, self.muted, self.edge = page, paper, ink, muted, edge
        if theme == 'print':
            self.poche, self.poche_line = '#2B2B2B', '#000000'
            self.line, self.fine, self.dim, self.glass = '#1E1E1E', '#6A6A6A', '#303030', '#2D6E7E'
            self.zone = {'public': '#FFFFFF', 'service': '#FFFFFF', 'private': '#FFFFFF', 'wet': '#FFFFFF',
                         'circulation': '#FFFFFF', 'covered': '#F6F5F2', 'open': '#F3F6F1', 'void': '#FFFFFF'}
            self.pattern = '#C9C9C9'
            self.green, self.paving = '#DCE5D6', '#E4E2DC'
        elif self.dark:
            self.poche = mix(ink, paper, .12)
            self.poche_line = mix(ink, paper, .02)
            self.line = mix(ink, paper, .18)
            self.fine = mix(ink, paper, .5)
            self.dim = muted
            self.glass = '#8FC4CE'
            base = paper
            self.zone = {'public': mix(base, '#D9C3A0', .09), 'service': mix(base, '#D9C3A0', .09),
                         'private': mix(base, '#A9C2A4', .09), 'wet': mix(base, '#93B8CC', .12),
                         'circulation': mix(base, '#FFFFFF', .04), 'covered': mix(base, '#B8AE9C', .10),
                         'open': mix(base, '#7FA57A', .12), 'void': mix(base, '#000000', .14)}
            self.pattern = mix(base, '#FFFFFF', .16)
            self.green, self.paving = mix(base, '#7FA57A', .20), mix(base, '#C9C0B0', .14)
        else:
            self.poche = mix(ink, '#000000', .18)
            self.poche_line = mix(ink, '#000000', .45)
            self.line = mix(ink, paper, .14)
            self.fine = mix(ink, paper, .52)
            self.dim = muted
            self.glass = '#367B8D'
            base = paper
            self.zone = {'public': mix(base, '#E9D9BC', .38), 'service': mix(base, '#E9D9BC', .38),
                         'private': mix(base, '#CFDCCB', .42), 'wet': mix(base, '#C9DCE6', .5),
                         'circulation': mix(base, '#E7E3DB', .45), 'covered': mix(base, '#DCD5C8', .5),
                         'open': mix(base, '#CDDDC4', .55), 'void': mix(base, '#8E9497', .18)}
            self.pattern = mix(base, ink, .10)
            self.green, self.paving = mix(base, '#B8CFAA', .6), mix(base, '#D5CDBF', .55)


def paint(c, colour, alpha=None):
    r, g, b = rgb(colour)
    if alpha is None:
        c.set_source_rgb(r, g, b)
    else:
        c.set_source_rgba(r, g, b, alpha)


def path(c, points, close=True):
    c.new_path()
    for i, p in enumerate(points):
        (c.move_to if i == 0 else c.line_to)(*p)
    if close:
        c.close_path()


def stroke(c, points, colour, width, close=False, dash=None):
    path(c, points, close)
    paint(c, colour)
    c.set_line_width(width)
    if dash:
        c.set_dash(dash)
    c.stroke()
    if dash:
        c.set_dash([])


def label(c, x, y, value, size, colour, halo=None, spread=0., bold=False, anchor='center'):
    text.draw(c, x, y, value, size, rgb(colour), bold=bold, anchor=anchor,
              halo=rgb(halo) if halo else None, spread=spread)


class Plan2D:
    """One floor through `point` (lattice units to sheet units, `k` sheet units per unit)."""

    def __init__(self, c, model, floor, ink, point, k, pen, px=1., technical=False):
        self.c, self.m, self.floor = c, model, model['floors'][floor]
        self.name = floor
        self.ink, self.point, self.k, self.pen, self.px, self.technical = ink, point, k, pen, px, technical
        self.rooms = self.floor['rooms']

    def p(self, value):
        """A pen or text size in sheet units."""
        return self.pen[value] * self.px

    def pts(self, points):
        return [self.point(x, y) for x, y in points]

    def poly(self, geom, fill=None, line=None, width=None, alpha=None):
        for part in geometry.parts(geom):
            if part.geom_type != 'Polygon' or part.is_empty:
                continue
            c = self.c
            c.new_path()
            for ring in (part.exterior, *part.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (c.move_to if i == 0 else c.line_to)(*self.point(x, y))
                c.close_path()
            c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
            if fill:
                paint(c, fill, alpha)
                (c.fill_preserve if line else c.fill)()
            if line:
                paint(c, line)
                c.set_line_width(width or self.p('fine'))
                c.stroke()

    def clip(self, geom):
        c = self.c
        c.new_path()
        for part in geometry.parts(geom):
            if part.geom_type != 'Polygon':
                continue
            for ring in (part.exterior, *part.interiors):
                for i, (x, y) in enumerate(ring.coords):
                    (c.move_to if i == 0 else c.line_to)(*self.point(x, y))
                c.close_path()
        c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
        c.clip()

    # -- Floors, site and context -----------------------------------------------------------
    def floors(self):
        ink = self.ink
        for room in sorted(self.rooms.values(), key=lambda r: r.id):
            zone = room.zone
            if room.outdoor:
                fill = ink.green if room.kind == 'green' else ink.paving
            else:
                fill = ink.zone.get(zone, ink.paper)
            self.poly(room.polygon, fill)
            if self.technical and room.outdoor:
                continue                       # Print keeps outdoor areas as flat tints: a lean, quick PDF.
            if room.kind == 'green':
                self.stipple(room.polygon)
            elif room.outdoor:
                self.grid(room.polygon, 2 * U, ink.pattern)
            elif zone == 'wet':
                self.grid(room.clear, U, ink.pattern)
        # Unbuilt regions, grouped so a connected stretch is named once.
        groups = {'Unassigned': [], 'Roof below': [], 'Open to sky': []}
        for region in self.floor['unassigned']:
            kind = 'Unassigned' if self.name == 'ground' else 'Roof below' if region['key'] in self.floor['roofBelow'] else 'Open to sky'
            groups[kind].append(box(*region['rect']))
        for kind, areas in groups.items():
            if not areas:
                continue
            merged = geometry.union(areas)
            for part in geometry.parts(merged):
                if part.geom_type != 'Polygon':
                    continue
                if kind == 'Open to sky':
                    inner = part.buffer(-3 * IN, join_style=2)
                    for piece in geometry.parts(inner):
                        if piece.geom_type == 'Polygon':
                            stroke(self.c, self.pts(list(piece.exterior.coords)), ink.pattern, self.p('pattern'), True,
                                   dash=(1.5 * self.px, 3 * self.px))
                    self.region_note(part, kind)
                else:
                    self.hatch(part, kind, self.ink.pattern, spacing=(1.5 if kind == 'Unassigned' else 2.5) * U)

    def grid(self, geom, step, colour):
        if geom.is_empty:
            return
        c = self.c
        c.save()
        self.clip(geom)
        x1, y1, x2, y2 = geom.bounds
        width = self.p('pattern')
        x = math.floor(x1 / step) * step
        while x <= x2:
            stroke(c, self.pts([(x, y1), (x, y2)]), colour, width)
            x += step
        y = math.floor(y1 / step) * step
        while y <= y2:
            stroke(c, self.pts([(x1, y), (x2, y)]), colour, width)
            y += step
        c.restore()

    def stipple(self, geom):
        """A quiet lawn: short grass ticks on a staggered grid, bounded in count for any plot."""
        c = self.c
        c.save()
        self.clip(geom)
        x1, y1, x2, y2 = geom.bounds
        step = max(2.4 * U, (x2 - x1) / 28, (y2 - y1) / 28)
        colour = mix(self.ink.green, self.ink.ink, .12 if not self.ink.dark else .2)
        j = 0
        y = y1 + step / 2
        while y < y2:
            x = x1 + (step / 2 if j % 2 else step)
            i = 0
            while x < x2:
                ox = ((i * 7 + j * 3) % 5 - 2) * step * .06
                for dx in (-.12, 0, .12):
                    stroke(c, self.pts([(x + ox + dx * step, y), (x + ox + dx * step * 1.5, y + .3 * step)]), colour, self.p('pattern'))
                x += step
                i += 1
            y += step
            j += 1
        c.restore()

    def hatch(self, geom, note, colour, spacing):
        c = self.c
        c.save()
        self.clip(geom)
        x1, y1, x2, y2 = geom.bounds
        span = (x2 - x1) + (y2 - y1)
        t = -span
        while t < span:
            stroke(c, self.pts([(x1 + t, y1), (x1 + t + (y2 - y1), y2)]), colour, self.p('pattern'))
            t += spacing
        c.restore()
        self.region_note(geom, note)

    def region_note(self, geom, note):
        try:
            from shapely.ops import polylabel
            spot = polylabel(geom, tolerance=IN)
            x, y = self.point(spot.x, spot.y)
        except Exception:
            x1, y1, x2, y2 = geom.bounds
            x, y = self.point((x1 + x2) / 2, (y1 + y2) / 2)
        x1, _, x2, _ = geom.bounds
        size = self.p('small')
        if text.width(note, size) < abs(self.point(x2, 0)[0] - self.point(x1, 0)[0]) - 4 * self.px:
            label(self.c, x, y + size * .35, note, size, self.ink.muted, self.ink.paper, self.p('halo'))

    def void(self):
        """First floor: OPEN TO BELOW with crossed diagonals; ground floor: the edge of the floor above, dashed."""
        if self.name == 'first':
            for room in self.rooms.values():
                if room.zone != 'void':
                    continue
                for part in geometry.parts(room.clear):
                    if part.geom_type != 'Polygon':
                        continue
                    x1, y1, x2, y2 = part.bounds
                    self.poly(part, self.ink.zone['void'])
                    for a, b in (((x1, y1), (x2, y2)), ((x1, y2), (x2, y1))):
                        stroke(self.c, self.pts([a, b]), self.ink.fine, self.p('fine'), dash=self.pen['dash'])
        else:
            for item in self.floor.get('overhead', []):
                for part in geometry.parts(item['polygon']):
                    if part.geom_type == 'Polygon':
                        stroke(self.c, self.pts(list(part.exterior.coords)), self.ink.fine, self.p('fine'), True,
                               dash=(self.pen['dash'][0] * 2, self.pen['dash'][1]))

    # -- Furniture and stair ----------------------------------------------------------------
    def furniture(self):
        c, ink = self.c, self.ink
        to_u = lambda pts: [(x * U, y * U) for x, y in pts]
        for fixture in self.floor['fixtures']:
            if fixture['kind'] == 'stair':
                continue
            for patch in fixture['patches']:
                path(c, self.pts(to_u(patch['points'])))
                paint(c, ink.paper if not ink.dark else mix(ink.paper, '#FFFFFF', .05))
                c.fill()
            for item in fixture['lines']:
                stroke(c, self.pts(to_u(item['points'])), ink.fine, self.p('fine'), item['closed'])

    def stair(self):
        stair = self.floor.get('stair')
        if not stair:
            return
        c, ink = self.c, self.ink
        fixture = stair['fixture']
        to_u = lambda pts: [(x * U, y * U) for x, y in pts]
        solids = fixture['solids']
        ground = self.name == 'ground'
        cut = next((i for i, s in enumerate(solids) if s['height'] > STAIR_CUT + 1e-6), None) if ground else None
        tread = ink.paper if not ink.dark else mix(ink.paper, '#FFFFFF', .06)
        for i, solid in enumerate(solids):
            pts = self.pts(to_u(solid['points']))
            above = cut is not None and i >= cut
            path(c, pts)
            paint(c, tread if not above else mix(tread, ink.paper, .5))
            c.fill()
            if above:
                stroke(c, pts, ink.fine, self.p('fine'), True, dash=self.pen['dash'])
            else:
                stroke(c, pts, ink.line, self.p('fine'), True)
        walk = [(x * U, y * U) for x, y in fixture['walk']]
        end = None
        if cut is not None and cut > 0:
            shared = Polygon(solids[cut - 1]['points']).intersection(Polygon(solids[cut]['points']))
            if shared.geom_type == 'LineString' and shared.length > .01:
                (ax, ay), (bx, by) = [(x * U, y * U) for x, y in (shared.coords[0], shared.coords[-1])]
                length = math.dist((ax, ay), (bx, by))
                ex, ey = (bx - ax) / length, (by - ay) / length
                tx, ty = -ey, ex
                cx, cy = Polygon(to_u(solids[cut]['points'])).centroid.coords[0]
                mx, my = (ax + bx) / 2, (ay + by) / 2
                if (cx - mx) * tx + (cy - my) * ty < 0:
                    tx, ty = -tx, -ty
                s = .3 * U
                zig = [(ax - ex * s - tx * s * .8, ay - ey * s - ty * s * .8), (mx - ex * s * .8 - tx * s * .3, my - ey * s * .8 - ty * s * .3),
                       (mx + tx * s * 1.1, my + ty * s * 1.1), (mx + ex * s * .8 + tx * s * .3, my + ey * s * .8 + ty * s * .3),
                       (bx + ex * s + tx * s * 1.8, by + ey * s + ty * s * 1.8)]
                stroke(c, self.pts(zig), ink.line, self.p('door'))
                hit = LineString(walk).intersection(LineString([(ax - ex * 5 * U, ay - ey * 5 * U), (bx + ex * 5 * U, by + ey * 5 * U)]))
                if hit.geom_type == 'Point':
                    end = (hit.x, hit.y)
        route = walk if ground else list(reversed(walk))
        if end is not None:
            route = [walk[0], end]
        stroke(c, self.pts(route), ink.line, self.p('fine'))
        (ax, ay), (bx, by) = route[-2], route[-1]
        length = math.dist((ax, ay), (bx, by)) or 1
        ux, uy = (bx - ax) / length, (by - ay) / length
        head = [(bx - ux * .55 * U - uy * .35 * U, by - uy * .55 * U + ux * .35 * U), (bx, by),
                (bx - ux * .55 * U + uy * .35 * U, by - uy * .55 * U - ux * .35 * U)]
        stroke(c, self.pts(head), ink.line, self.p('fine'))
        sx, sy = self.point(*route[0])
        c.new_path(); c.arc(sx, sy, max(1.5 * self.px, .14 * U * self.k), 0, math.tau); paint(c, ink.line); c.fill()
        (px_, py_), (qx, qy) = route[0], route[1]
        length = math.dist((px_, py_), (qx, qy)) or 1
        lx, ly = self.point(px_ - (qx - px_) / length * .8 * U, py_ - (qy - py_) / length * .8 * U)
        size = self.p('small')
        label(c, lx, ly + size * .35, 'UP' if ground else 'DN', size, ink.ink, tread, self.p('halo') * .8, bold=True)
        if not ground:
            self.guards(stair)

    def guards(self, stair):
        """3'-7" guard along the stair opening's free edges on the upper floor."""
        x1, y1, x2, y2 = stair['opening']
        walls = self.floor['walls']
        edges = [((x1, y1), (x2, y1)), ((x2, y1), (x2, y2)), ((x2, y2), (x1, y2)), ((x1, y2), (x1, y1))]
        front = {'+y': 2, '-y': 0, '+x': 1, '-x': 3}[stair['front']]
        for i, (a, b) in enumerate(edges):
            if i == front and stair['kind'] == 'dogleg':
                continue                      # The arrival side stays open to the landing.
            line = LineString([a, b])
            if walls.buffer(2).covers(line):
                continue
            self.rail(a, b)

    def rail(self, a, b):
        """A glass balustrade: two fine lines 2 inches apart with posts every 4 feet."""
        (ax, ay), (bx, by) = a, b
        length = math.dist(a, b)
        if length <= 0:
            return
        ux, uy = (bx - ax) / length, (by - ay) / length
        nx, ny = -uy, ux
        for o in (-1 * IN, 1 * IN):
            stroke(self.c, self.pts([(ax + nx * o, ay + ny * o), (bx + nx * o, by + ny * o)]), self.ink.line, self.p('rail'))
        count = max(1, int(length // (4 * U)))
        for i in range(count + 1):
            t = i / count
            px_, py_ = ax + (bx - ax) * t, ay + (by - ay) * t
            r = [(px_ - 1.5 * IN, py_ - 1.5 * IN), (px_ + 1.5 * IN, py_ - 1.5 * IN), (px_ + 1.5 * IN, py_ + 1.5 * IN), (px_ - 1.5 * IN, py_ + 1.5 * IN)]
            path(self.c, self.pts(r)); paint(self.c, self.ink.line); self.c.fill()

    # -- Walls and openings ------------------------------------------------------------------
    def walls(self):
        cuts = [box(*self._band_box(o)) for o in self.floor['doors'] + self.floor['windows']]
        solid = self.floor['walls'].difference(geometry.union(cuts)) if cuts else self.floor['walls']
        self.poly(solid, self.ink.poche, self.ink.poche_line, self.p('wall'))
        for parapet in self.floor.get('parapets', []):
            at, lo, hi = parapet['at'], parapet['lo'], parapet['hi']
            t = geometry.PARAPET_T
            band = (at, at + t) if parapet['inward'] == 'b' else (at - t, at)
            rect = (band[0], lo, band[1], hi) if parapet['orient'] == 'v' else (lo, band[0], hi, band[1])
            self.poly(box(*rect), mix(self.ink.poche, self.ink.paper, .45), self.ink.poche_line, self.p('fine'))
        for col in self.floor.get('supports', []):
            self.poly(box(*col['rect']), self.ink.poche, self.ink.poche_line, self.p('fine'))
        for run in self.floor['runs']:
            if run['kind'] == 'rail':
                a, b = geometry._segment(run, run['lo'], run['hi'], run['at'])
                self.rail(a, b)

    @staticmethod
    def _band_box(opening):
        c1, c2 = opening['band']
        lo, hi = opening['lo'], opening['hi']
        return (c1, lo, c2, hi) if opening['orient'] == 'v' else (lo, c1, hi, c2)

    def windows(self):
        c, ink = self.c, self.ink
        for w in self.floor['windows']:
            c1, c2 = w['band']
            lo, hi = w['lo'], w['hi']
            v = w['orient'] == 'v'
            seg = (lambda a, l, h: [(a, l), (a, h)]) if v else (lambda a, l, h: [(l, a), (h, a)])
            for face in (c1, c2):
                stroke(c, self.pts(seg(face, lo, hi)), ink.line, self.p('window'))
            for end in (lo, hi):
                stroke(c, self.pts([(c1, end), (c2, end)] if v else [(end, c1), (end, c2)]), ink.line, self.p('window'))
            mid = (c1 + c2) / 2
            offsets = (-1.5 * IN, 1.5 * IN) if w['kind'] == 'tall' else (-.5 * IN, .5 * IN)
            for o in offsets:
                stroke(c, self.pts(seg(mid + o, lo, hi)), ink.glass, self.p('glass') * (1.3 if w['kind'] == 'tall' else 1),
                       dash=self.pen['dash'] if w['kind'] == 'ventilator' else None)
            if w['kind'] == 'window':
                outer = c1 if w['normal'][0 if v else 1] < 0 else c2
                sign = -1 if outer == c1 else 1
                sill = outer + sign * 2 * IN
                stroke(c, self.pts(seg(sill, lo - 2 * IN, hi + 2 * IN)), ink.line, self.p('fine'))
            if self.technical:
                outer = c1 if w['normal'][0 if v else 1] < 0 else c2
                sign = -1 if outer == c1 else 1
                at = outer + sign * 14 * IN
                x, y = self.point(*((at, (lo + hi) / 2) if v else ((lo + hi) / 2, at)))
                size = self.p('small')
                label(c, x, y + size * .35, w['tag'], size, ink.ink, ink.page, self.p('halo'))

    def doors(self):
        c, ink = self.c, self.ink
        for d in self.floor['doors']:
            hinge, leaf, strike = d['hinge'], d['leaf'], d['strike']
            hx, hy = hinge
            lx, ly = leaf
            ux, uy = (strike[0] - hx) / d['width'], (strike[1] - hy) / d['width']
            t = 1.5 * IN
            panel = [hinge, leaf, (lx + ux * t, ly + uy * t), (hx + ux * t, hy + uy * t)]
            path(c, self.pts(panel)); paint(c, ink.paper); c.fill_preserve()
            paint(c, ink.line); c.set_line_width(self.p('door')); c.stroke()
            stroke(c, self.pts(d['arc']), ink.fine, self.p('arc'))
            if d['type'] == 'main':
                nx, ny = d['normal']
                mx, my = (d['span'][0][0] + d['span'][1][0]) / 2, (d['span'][0][1] + d['span'][1][1]) / 2
                out = 1.1 * U
                tip = (mx - nx * out, my - ny * out)
                back = (mx - nx * (out + 1.7 * U), my - ny * (out + 1.7 * U))
                ax, ay = -ny, nx
                tri = [tip, (back[0] + ax * .75 * U, back[1] + ay * .75 * U), (back[0] - ax * .75 * U, back[1] - ay * .75 * U)]
                path(c, self.pts(tri)); paint(c, ink.ink); c.fill()
                tx, ty = self.point(mx - nx * (out + 3.0 * U), my - ny * (out + 3.0 * U))
                size = self.p('small')
                label(c, tx, ty + size * .35, 'ENTRY', size, ink.ink, ink.page if self.name == 'ground' else ink.paper,
                      self.p('halo'), bold=True)
            if self.technical:
                nx, ny = d['normal']
                mx, my = (d['span'][0][0] + d['span'][1][0]) / 2, (d['span'][0][1] + d['span'][1][1]) / 2
                x, y = self.point(mx - nx * 13 * IN, my - ny * 13 * IN)
                size = self.p('small')
                label(c, x, y + size * .35, d['tag'], size, ink.ink, ink.paper, self.p('halo'))

    def turning(self):
        for room in self.rooms.values():
            spot = getattr(room, 'turning', None)
            if not spot:
                continue
            x, y = self.point(spot[0] * U, spot[1] * U)
            r = TURNING_CIRCLE / 2 * U * self.k
            self.c.set_dash(self.pen['dash']); self.c.new_path(); self.c.arc(x, y, r, 0, math.tau)
            paint(self.c, self.ink.fine); self.c.set_line_width(self.p('fine')); self.c.stroke(); self.c.set_dash([])

    # -- Labels, chains -------------------------------------------------------------------------
    def labels(self):
        c, ink, pen = self.c, self.ink, self.pen
        tags = []
        for room in sorted(self.rooms.values(), key=lambda r: r.id):
            if room.zone == 'void':
                x1, y1, x2, y2 = room.polygon.bounds
                x, y = self.point((x1 + x2) / 2, (y1 + y2) / 2)
                size = self.p('size')
                label(c, x, y + size * .35, 'OPEN TO BELOW', size, ink.muted, ink.zone['void'], self.p('halo'), bold=True)
                continue
            x1, y1, x2, y2 = (v * U for v in room.label_box)
            cx, cy = self.point((x1 + x2) / 2, (y1 + y2) / 2)
            avail = abs(self.point(x2, 0)[0] - self.point(x1, 0)[0])
            height = abs(self.point(0, y2)[1] - self.point(0, y1)[1])
            name = room.label.upper()
            lines_extra = []
            if room.double_height:
                lines_extra.append('DOUBLE HEIGHT')
            size_line = ''
            if room.indoor:
                clear = geometry.clear_size(room)
                if clear:
                    size_line = f'{ft_in(clear[0])} × {ft_in(clear[1])}'
            area_line = f'{round((room.clear.area if room.indoor else room.polygon.area) / U / U):,} sq ft'
            fill = ink.zone.get(room.zone, ink.paper) if not room.outdoor else (ink.green if room.kind == 'green' else ink.paving)
            size = self.p('name')
            words = self._wrap(name, size, avail)
            while size > self.p('minimum') and (len(words) > 2 or any(text.width(w, size, True) > avail for w in words)
                                                  or (len(words) * 1.15 + 2.6) * size > height):
                size -= .25 * self.px
                words = self._wrap(name, size, avail)
            fits = not any(text.width(w, size, True) > avail for w in words) and len(words) <= 2
            if not fits:
                short = room.short.upper()
                size = self.p('minimum')
                words = [short] if text.width(short, size, True) <= avail else None
            if words is None:
                tags.append(room)
                tag = str(len(tags))
                label(c, cx, cy + size * .35, tag, size, ink.ink, fill, self.p('halo'), bold=True)
                continue
            small = max(self.p('minimum') * .95, min(self.p('size'), size * .76))
            tiny = max(self.p('minimum') * .9, min(self.p('area'), size * .7))
            extra = [l for l in lines_extra if text.width(l, tiny, True) <= avail]
            show_size = size_line and text.width(size_line, small) <= avail + size
            show_area = (len(words) * 1.15 + (1.3 if show_size else 0) + 1.25) * size <= height + size
            block = len(words) * size * 1.15 + (small * 1.3 if show_size else 0) + (tiny * 1.25 if show_area else 0) + len(extra) * tiny * 1.2
            top = cy - block / 2
            for i, value in enumerate(words):
                label(c, cx, top + size * (i + .85) * 1.15 - size * .1, value, size, ink.ink, fill, self.p('halo'), bold=True)
            cursor = top + len(words) * size * 1.15
            for value in extra:
                label(c, cx, cursor + tiny * 1.0, value, tiny, ink.muted, fill, self.p('halo'), bold=True)
                cursor += tiny * 1.2
            if show_size:
                label(c, cx, cursor + small * 1.05, size_line, small, ink.ink if self.technical else ink.muted, fill, self.p('halo'))
                cursor += small * 1.3
            if show_area:
                label(c, cx, cursor + tiny * 1.05, area_line, tiny, ink.muted, fill, self.p('halo'))
        self.tags = tags

    def _fit(self, name, avail, height):
        size = self.p('name')
        words = self._wrap(name, size, avail)
        while size > self.p('minimum') and (len(words) > 2 or any(text.width(w, size, True) > avail for w in words)
                                              or (len(words) * 1.15 + 2.6) * size > height):
            size -= .25 * self.px
            words = self._wrap(name, size, avail)
        return size

    @staticmethod
    def _wrap(name, size, avail):
        lines, current = [], ''
        for word in name.split():
            trial = (current + ' ' + word).strip()
            if current and text.width(trial, size, True) > avail:
                lines.append(current)
                current = word
            else:
                current = trial
        return lines + ([current] if current else [])

    def chain(self, values, axis, line, edge, show_text=True):
        """One dimension line: ticks at `values` (lattice units along `axis`), feet-inches between."""
        c, ink = self.c, self.ink
        values = sorted(set(values))
        pos = [self.point(v, 0)[0] if axis == 'x' else self.point(0, v)[1] for v in values]
        tl = self.p('tick_len')
        a, b = min(pos), max(pos)
        horizontal = axis == 'x'
        stroke(c, [(a - tl * 1.6, line), (b + tl * 1.6, line)] if horizontal else [(line, a - tl * 1.6), (line, b + tl * 1.6)],
               ink.dim, self.p('dim'))
        over = self.p('over') * (1 if line > edge else -1)
        for p_ in pos:
            ext = [(p_, edge), (p_, line + over)] if horizontal else [(edge, p_), (line + over, p_)]
            stroke(c, ext, ink.dim, self.p('dim'))
            tick = [(p_ - tl, line + tl), (p_ + tl, line - tl)] if horizontal else [(line - tl, p_ + tl), (line + tl, p_ - tl)]
            stroke(c, tick, ink.ink, self.p('tick'))
        if not show_text:
            return
        for (v1, p1), (v2, p2) in zip(zip(values, pos), list(zip(values, pos))[1:]):
            value = ft_in((v2 - v1) / U)
            room = abs(p2 - p1)
            size = self.p('dim_text')
            if text.width(value, size) + 3 * tl > room:
                size *= .8
                if text.width(value, size) + 2 * tl > room:
                    continue
            lift = self.p('text_lift')
            if horizontal:
                label(c, (p1 + p2) / 2, line - lift, value, size, ink.ink, ink.page, self.p('halo') * .6)
            else:
                c.save(); c.translate(line - lift, (p1 + p2) / 2); c.rotate(-math.pi / 2)
                label(c, 0, 0, value, size, ink.ink, ink.page, self.p('halo') * .6); c.restore()

    def chains(self, top, left):
        """Grid and half-cell lines, then the overall plot, on the top and the left side."""
        xs = {0, self.m['plot']['W']} | {v for r in self.floor['regions'] for v in (r['rect'][0], r['rect'][2])}
        ys = {0, self.m['plot']['D']} | {v for r in self.floor['regions'] for v in (r['rect'][1], r['rect'][3])}
        self.chain(xs, 'x', top - self.p('tier1'), top - self.p('gap'))
        self.chain({0, self.m['plot']['W']}, 'x', top - self.p('tier2'), top - self.p('tier1') - self.p('over'))
        self.chain(ys, 'y', left - self.p('tier1'), left - self.p('gap'))
        self.chain({0, self.m['plot']['D']}, 'y', left - self.p('tier2'), left - self.p('tier1') - self.p('over'))

    def plot_line(self):
        W, D = self.m['plot']['W'], self.m['plot']['D']
        d0, d1 = self.pen['dash']
        stroke(self.c, self.pts([(0, 0), (W, 0), (W, D), (0, D)]), self.ink.edge, self.p('plot') * .7, True,
               dash=(d0 * 2.4 * self.px, d1 * self.px, d0 * .4 * self.px, d1 * self.px))

    def compound(self):
        """A 4.5-inch compound wall just outside the plot line, open at the gate."""
        W, D = self.m['plot']['W'], self.m['plot']['D']
        t = 4.5 * IN
        gate_lo, gate_hi = gate_span(self.m['plot'])
        pieces = [(-t, -t, 0, D + t), (W, -t, W + t, D + t), (-t, D, W + t, D + t),
                  (-t, -t, gate_lo, 0), (gate_hi, -t, W + t, 0)]
        for r in pieces:
            if r[2] - r[0] > 0 and r[3] - r[1] > 0:
                self.poly(box(*r), mix(self.ink.poche, self.ink.page, .55))
        post = 12 * IN
        for x in (gate_lo, gate_hi):
            lo = min(max(x - post / 2, -t), W + t - post)
            self.poly(box(lo, -t - 3 * IN, lo + post, 3 * IN), self.ink.poche)

    def draw(self):
        checkpoint()
        self.floors()
        self.void()
        self.furniture()
        self.turning()
        self.stair()
        checkpoint()
        self.walls()
        self.windows()
        self.doors()
        self.labels()


def gate_span(plot):
    """The 10 ft gate opening in the compound wall, centred on the chosen gate, inside the plot."""
    centre, _, _ = geometry._gate(plot)
    width = min(10 * U, plot['W'] / 2)
    lo = min(max(centre - width / 2, 0), plot['W'] - width)
    return lo, lo + width


def north_arrow(c, x, y, direction, radius, ink, px, bg):
    """A circle with a half-filled arrow and N, pointing to `direction` on the sheet."""
    dx, dy = direction
    length = math.hypot(dx, dy) or 1
    dx, dy = dx / length, dy / length
    c.new_path(); c.arc(x, y, radius, 0, math.tau); paint(c, ink); c.set_line_width(.9 * px); c.stroke()
    tip = (x + dx * radius * .95, y + dy * radius * .95)
    tail = (x - dx * radius * .7, y - dy * radius * .7)
    side = (-dy * radius * .38, dx * radius * .38)
    mid = (x - dx * radius * .35, y - dy * radius * .35)
    path(c, [tip, (tail[0] + side[0], tail[1] + side[1]), mid]); paint(c, ink); c.fill()
    path(c, [tip, (tail[0] - side[0], tail[1] - side[1]), mid]); paint(c, bg); c.fill_preserve()
    paint(c, ink); c.set_line_width(.9 * px); c.stroke()
    size = radius * .62
    lx, ly = x + dx * (radius + size * .9), y + dy * (radius + size * .9)
    label(c, lx, ly + size * .36, 'N', size, ink, bg, 2 * px, bold=True)


def scale_bar(c, x, y, k, marks, unit, ink, bg, px, height):
    for i, (a, b) in enumerate(zip(marks, marks[1:])):
        c.rectangle(x + a * k, y, (b - a) * k, height)
        paint(c, ink if i % 2 == 0 else bg); c.fill_preserve(); paint(c, ink); c.set_line_width(.7 * px); c.stroke()
    size = height * 2.0
    for value in marks:
        label(c, x + value * k, y - height * .7, f'{value:g}', size, ink, bg, 2 * px)
    label(c, x + marks[-1] * k + size * .6, y + height, unit, size, ink, bg, 2 * px, anchor='left')


def title_of(model, floor):
    plot = model['plot']
    return (f"{geometry.FLOOR_NAMES[floor]} plan · {ft_in(plot['W'] / U)} × {ft_in(plot['D'] / U)} plot · "
            f"{plot['facing']}-facing · Preliminary")


# ---- Screen image ----------------------------------------------------------------------------

def screen_margins(width, height):
    """The studio plan's margins on a width x height canvas: px, the title band, top, left, right, the road band and
    bottom, all in pixels."""
    px = min(width, height) / 1000
    title_h = 46 * px
    road_h = 64 * px
    return (px, title_h, title_h + (SCREEN['tier2'] + 16) * px, (SCREEN['tier2'] + 22) * px, 96 * px, road_h,
            road_h + 54 * px)


# Fill width (the studio's full screen, 29 Oct 2026, maintainer request): the plan spans the width and the canvas is
# as tall as that needs, up to this height.
FILL_MAX_HEIGHT = 4000


def fill_height(model, width):
    """The smallest canvas height at which the plan's scale is set by `width`, at most FILL_MAX_HEIGHT."""
    W, D = model['plot']['W'], model['plot']['D']

    def by_width(height):
        _, _, top, left, right, _, bottom = screen_margins(width, height)
        return (width - left - right) / W <= (height - top - bottom) / D

    low, high = 320, FILL_MAX_HEIGHT
    if not by_width(high):
        return high
    while low < high:
        middle = (low + high) // 2
        if by_width(middle):
            high = middle
        else:
            low = middle + 1
    return low


def draw_screen(c, model, floor, theme, width, height):
    """The floor plan for the studio, fitted to width x height pixels (road at the bottom)."""
    ink = Ink(theme)
    px, title_h, top_margin, left_margin, right_margin, road_h, bottom_margin = screen_margins(width, height)
    pen = SCREEN
    paint(c, ink.page); c.paint()
    W, D = model['plot']['W'], model['plot']['D']
    k = min((width - left_margin - right_margin) / W, (height - top_margin - bottom_margin) / D)
    plan_w, plan_h = W * k, D * k
    left = left_margin + (width - left_margin - right_margin - plan_w) / 2
    top = top_margin + (height - top_margin - bottom_margin - plan_h) / 2
    point = lambda x, y: (left + x * k, top + (D - y) * k)
    bottom = top + plan_h
    # Road band, then the plot paper.
    road = (left - 30 * px, bottom + 10 * px, plan_w + 60 * px, road_h * .55)
    c.rectangle(*road); paint(c, mix(ink.page, ink.ink, .10 if not ink.dark else .18)); c.fill()
    for i in range(int(road[2] // (34 * px)) + 1):
        x = road[0] + i * 34 * px
        stroke(c, [(x, road[1] + road[3] / 2), (min(x + 16 * px, road[0] + road[2]), road[1] + road[3] / 2)],
               mix(ink.page, ink.ink, .35), 1.2 * px)
    c.rectangle(left, top, plan_w, plan_h); paint(c, ink.paper); c.fill()
    plan = Plan2D(c, model, floor, ink, point, k, pen, px)
    plan.compound()
    plan.plot_line()
    plan.draw()
    plan.chains(top, left)
    size = 18 * px
    label(c, left_margin * .4, title_h * .62, title_of(model, floor), size, ink.ink, None, 0, bold=True, anchor='left')
    road_text = f"ROAD · {model['plot']['facing'].upper()}"
    label(c, left + plan_w / 2, road[1] + road[3] + 20 * px, road_text, 13 * px, ink.muted, None, 0, bold=True)
    north = model['plot']['north']
    nx, ny = north[0], -north[1]
    arrow_x = min(width - 40 * px, left + plan_w + 52 * px)
    north_arrow(c, arrow_x, top + 30 * px, (nx, ny), 20 * px, ink.ink, px, ink.page)
    marks = (0, 5, 10) if 10 * U * k <= 260 * px else (0, 2, 5)
    scale_bar(c, left, bottom + road_h * .55 + 30 * px, U * k, marks, 'FT', ink.ink, ink.page, px, 5 * px)
    note = 'Preliminary concept · not for construction · walls, doors, windows and stair are proposed'
    label(c, width - 24 * px, height - 14 * px, note, 11 * px, ink.muted, None, 0, anchor='right')


def render_screen(model, floor, theme='warm', width=1600, height=1000, fmt='png', fit='contain'):
    """`fit='width'` ignores `height` and makes the canvas as tall as the plan needs to fill the width."""
    width = int(min(max(width, 480), 2400))
    height = fill_height(model, width) if fit == 'width' else int(min(max(height, 320), 1600))
    stream = io.BytesIO()
    if fmt == 'svg':
        surface = cairo.SVGSurface(stream, width, height)
    else:
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    draw_screen(cairo.Context(surface), model, floor, theme, width, height)
    if fmt == 'png':
        surface.write_to_png(stream)
    surface.finish()
    return stream.getvalue()


# ---- A3 sheet (millimetres) -------------------------------------------------------------------

SCALES = (50, 100, 200, 500)


def sheet_orientation(model):
    return 'landscape' if model['plot']['W'] >= model['plot']['D'] else 'portrait'


def draw_sheet(c, model, floor, page=1, pages=1):
    """A true-scale A3 sheet: landscape for wide plots, portrait for deep ones (§6.2).

    Landscape: the plan on the left, a 112 mm information column on the right. Portrait: the plan
    above, a 118 mm information band below in three columns. The title block is boxed in the
    bottom-right corner, as on a drawing set."""
    orientation = sheet_orientation(model)
    Wmm, Hmm = (420., 297.) if orientation == 'landscape' else (297., 420.)
    ink = Ink('print')
    pen = PRINT
    paint(c, '#FFFFFF'); c.rectangle(0, 0, Wmm, Hmm); c.fill()
    frame = (15., 10., Wmm - 10., Hmm - 10.)
    stroke(c, [(frame[0], frame[1]), (frame[2], frame[1]), (frame[2], frame[3]), (frame[0], frame[3])], '#141414', .7, True)
    if orientation == 'landscape':
        split = frame[2] - 112.
        area = (frame[0] + 8 + pen['tier2'] + 4, frame[1] + 12 + pen['tier2'] + 4, split - 10, frame[3] - 18)
        stroke(c, [(split, frame[1]), (split, frame[3])], '#141414', .5)
        columns = [(split + 5, frame[1] + 5, frame[2] - 5, frame[3] - 47)]
        title = (split, frame[3] - 42, frame[2], frame[3])
    else:
        split = frame[3] - 118.
        area = (frame[0] + 8 + pen['tier2'] + 4, frame[1] + 12 + pen['tier2'] + 4, frame[2] - 10, split - 16)
        stroke(c, [(frame[0], split), (frame[2], split)], '#141414', .5)
        third = (frame[2] - frame[0]) / 3
        columns = [(frame[0] + 5 + i * third, split + 5, frame[0] + (i + 1) * third - 4, frame[3] - (47 if i == 2 else 5))
                   for i in range(3)]
        title = (frame[0] + 2 * third, frame[3] - 42, frame[2], frame[3])
        for i in (1, 2):
            x = frame[0] + i * third
            stroke(c, [(x, split), (x, frame[3] - (42 if i == 2 else 0))], '#141414', .25)
    W, D = model['plot']['W'], model['plot']['D']
    aw, ah = area[2] - area[0], area[3] - area[1]
    scale = SCALES[-1]
    for s_ in SCALES:
        if W * 25.4 / IN / s_ <= aw and D * 25.4 / IN / s_ <= ah:
            scale = s_
            break
    k = 25.4 / IN / scale                           # millimetres per lattice unit at 1:scale
    ox = area[0] + (aw - W * k) / 2
    oy = area[1] + (ah - D * k) / 2
    point = lambda x, y: (ox + x * k, oy + (D - y) * k)
    plan = Plan2D(c, model, floor, ink, point, k, pen, 1., technical=True)
    plan.compound()
    plan.plot_line()
    plan.draw()
    plan.chains(oy, ox)
    bottom = oy + D * k
    label(c, ox + W * k / 2, bottom + 8.5, f"ROAD · {model['plot']['facing'].upper()}", 2.8, '#141414', '#FFFFFF', .5, bold=True)
    label(c, frame[0] + 6, frame[1] + 7.5, title_of(model, floor).upper(), 3.2, '#141414', '#FFFFFF', .4, bold=True, anchor='left')
    _sheet_info(c, model, floor, columns, scale, k, plan)
    _title_block(c, model, floor, title, scale, page, pages)


def _sheet_info(c, model, floor, columns, scale, k, plan):
    """North, scales, then legend, schedule, areas, notes and room key, flowed through the columns."""
    ink = '#141414'
    x0, y0, x1, _ = columns[0]
    north = model['plot']['north']
    north_arrow(c, x0 + 9, y0 + 10, (north[0], -north[1]), 7., ink, .25, '#FFFFFF')
    label(c, x0 + 22, y0 + 5.5, f'SCALE 1:{scale} ON A3', 2.8, ink, None, 0, bold=True, anchor='left')
    room = x1 - x0 - 34
    feet = max((mk for mk in ((0, 2, 5, 10), (0, 5, 10, 20), (0, 10, 20, 50), (0, 25, 50, 100)) if mk[-1] * U * k <= room),
               key=lambda mk: mk[-1], default=(0, 2, 5, 10))
    scale_bar(c, x0 + 22, y0 + 11, U * k, feet, 'FT', ink, '#FFFFFF', .25, 1.3)
    metres = max((mk for mk in ((0, 1, 2, 5), (0, 2, 5, 10), (0, 5, 10, 20), (0, 10, 20, 50)) if mk[-1] * U * k * 3.28084 <= room),
                 key=lambda mk: mk[-1], default=(0, 1, 2, 5))
    scale_bar(c, x0 + 22, y0 + 18.5, U * k * 3.28084, metres, 'M', ink, '#FFFFFF', .25, 1.3)
    index, (cx, cy, right, limit) = 0, columns[0]
    y = cy + 26
    for heading, rows in _sheet_sections(model, floor, plan):
        lines = []
        for row in rows:
            if len(row) == 2:
                lines.append(row)
            else:
                lines.extend((line,) for line in _wrap_text(row[0], 1.95, right - cx - 2))
        needed = 8 + 3.6 * min(len(lines), 3)
        while y + needed > limit and index + 1 < len(columns):
            index += 1
            cx, cy, right, limit = columns[index]
            y = cy + 1
        y += 4
        label(c, cx, y, heading, 2.5, ink, None, 0, bold=True, anchor='left')
        y += 1.4
        stroke(c, [(cx, y), (right, y)], '#9A9A9A', .15)
        y += 3.4
        for row in lines:
            if y > limit - 1:
                label(c, cx, y, '…', 2.0, ink, None, 0, anchor='left')
                break
            if len(row) == 2:
                label(c, cx, y, row[0], 2.0, ink, None, 0, anchor='left')
                label(c, right, y, row[1], 2.0, ink, None, 0, bold=True, anchor='right')
                y += 3.7
            else:
                label(c, cx + 1, y, row[0], 1.95, ink, None, 0, anchor='left')
                y += 3.1
        y += 1


def _title_block(c, model, floor, rect, scale, page, pages):
    ink, muted = '#141414', '#4A4A4A'
    x0, y0, x1, y1 = rect
    stroke(c, [(x0, y0), (x1, y0)], ink, .5)
    if x0 > 20:
        stroke(c, [(x0, y0), (x0, y1)], ink, .5)
    x = x0 + 5
    plot = model['plot']
    label(c, x, y0 + 7, 'COMPASS HOME PLAN', 3.8, ink, None, 0, bold=True, anchor='left')
    label(c, x, y0 + 13, f'{geometry.FLOOR_NAMES[floor].upper()} PLAN', 3.1, ink, None, 0, bold=True, anchor='left')
    label(c, x, y0 + 18.3, f"Plot {ft_in(plot['W'] / U)} × {ft_in(plot['D'] / U)} · {plot['facing']}-facing · gate {plot['gate'].lower()}",
          2.1, ink, None, 0, anchor='left')
    label(c, x, y0 + 22.5, f"Scale 1:{scale} on A3 · sheet {page} of {pages} · ref {model['modelHash'][:10]}",
          2.1, ink, None, 0, anchor='left')
    stroke(c, [(x0, y0 + 26), (x1, y0 + 26)], ink, .25)
    label(c, x, y0 + 31.2, 'PRELIMINARY · NOT FOR CONSTRUCTION', 2.7, ink, None, 0, bold=True, anchor='left')
    label(c, x, y0 + 35.6, 'Not structurally verified · verify with a licensed architect and engineer', 1.9, muted, None, 0, anchor='left')


def _wrap_text(value, size, width):
    lines, current = [], ''
    for word in value.split():
        trial = (current + ' ' + word).strip()
        if current and text.width(trial, size) > width:
            lines.append(current)
            current = word
        else:
            current = trial
    return lines + ([current] if current else [])


def _sheet_sections(model, floor, plan):
    f = model['floors'][floor]
    legend = [('Proposed 9" outer wall, inside the plot line',), ('Proposed 6" partition, centred on the grid',),
              ('No line between living, dining, kitchen and stair hall: one open space',),
              ('Door with swing; ENTRY arrow at the main door. Toilet doors open outwards',),
              ('Window with sill; ventilator dashed; T = full-height glazing',),
              ('Stair: UP / DN from the first riser, cut at 4\'-0"',)]
    if any(r.zone == 'void' for r in f['rooms'].values()) or f.get('overhead'):
        legend.append(('Double height: crossed = open to below; dashed = edge of the floor above',))
    if f.get('supports'):
        legend.append(('Filled square: proposed column, verify with an engineer',))
    schedule = []
    for tag, kind in (('D', 'Main door'), ('D1', 'Room door'), ('D2', 'Toilet door, opens out'), ('D3', 'Door to open area')):
        found = [d for d in f['doors'] if d['tag'] == tag]
        if found:
            schedule.append((f'{tag}  {kind} {ft_in(found[0]["width"] / U)} × {ft_in(DOOR_HEAD)}', str(len(found))))
    for tag in sorted({w['tag'] for w in f['windows']}, key=lambda t: (t[0], t)):
        found = [w for w in f['windows'] if w['tag'] == tag]
        kind = {'ventilator': 'Ventilator, high', 'tall': 'Full-height glazing'}.get(found[0]['kind'], 'Window')
        schedule.append((f'{tag}  {kind} {ft_in(found[0]["width"] / U)} × {ft_in(found[0]["head"] - found[0]["sill"])}', str(len(found))))
    plot = model['plot']
    built = sum(r.clear.area for r in f['rooms'].values() if r.indoor) / U / U
    gross = geometry.union([r.polygon for r in f['rooms'].values() if r.indoor or r.zone == 'void']).area / U / U
    void = sum(r.polygon.area for r in f['rooms'].values() if r.zone == 'void') / U / U
    open_ = sum(r.polygon.area for r in f['rooms'].values() if r.outdoor) / U / U
    areas = [(f"Plot {ft_in(plot['W'] / U)} × {ft_in(plot['D'] / U)}", f"{round(plot['W'] * plot['D'] / U / U):,} sq ft"),
             ('Built-up (gross, on the grid)', f'{round(gross - void):,} sq ft'), ('Carpet (clear rooms)', f'{round(built):,} sq ft'),
             ('Open areas on this floor', f'{round(open_):,} sq ft')]
    if void:
        areas.append(('Open to below (not counted)', f'{round(void):,} sq ft'))
    notes = [(n['message'],) for n in model['notes'] if n.get('floor') in (None, floor) and n['severity'] in ('conflict', 'infeasible', 'warning')][:6]
    notes.append(('All dimensions feet and inches. Chains measure grid lines; outer walls sit inside them, partitions are centred.',))
    tags = getattr(plan, 'tags', [])
    sections = [('LEGEND', legend), ('DOOR & WINDOW SCHEDULE', schedule), ('AREA STATEMENT', areas)]
    if tags:
        sections.append(('ROOM KEY', [(f'{i}  {room.label}', '') for i, room in enumerate(tags, 1)]))
    sections.append(('NOTES', notes))
    return sections


def render_sheet(model, floors, fmt='pdf'):
    """A3 sheets in millimetres: one page per floor in a PDF; one floor as PNG (5 px/mm) or SVG."""
    orientation = sheet_orientation(model)
    Wmm, Hmm = (420., 297.) if orientation == 'landscape' else (297., 420.)
    stream = io.BytesIO()
    factor = 72 / 25.4 if fmt in ('pdf', 'svg') else 5
    if fmt == 'pdf':
        surface = cairo.PDFSurface(stream, Wmm * factor, Hmm * factor)
        surface.set_metadata(cairo.PDFMetadata.TITLE, 'Compass home plan')
        surface.set_metadata(cairo.PDFMetadata.CREATOR, 'GazeConnect Compass')
        surface.set_metadata(cairo.PDFMetadata.SUBJECT, f'Plan reference {model["modelHash"]}')
        # A fixed date keeps the same plan's PDF byte-identical (§4.6 determinism).
        surface.set_metadata(cairo.PDFMetadata.CREATE_DATE, '2026-01-01T00:00:00')
    elif fmt == 'svg':
        surface = cairo.SVGSurface(stream, Wmm * factor, Hmm * factor)
    else:
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, int(Wmm * factor), int(Hmm * factor))
    c = cairo.Context(surface)
    for i, floor in enumerate(floors, 1):
        c.save()
        c.scale(factor, factor)
        draw_sheet(c, model, floor, i, len(floors))
        c.restore()
        if fmt == 'pdf' and i < len(floors):
            c.show_page()
        if fmt != 'pdf':
            break
    if fmt == 'png':
        surface.write_to_png(stream)
    surface.finish()
    return stream.getvalue()
