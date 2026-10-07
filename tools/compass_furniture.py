"""Proposed furnishing for Compass rooms: deterministic, wall-aware placement.

Every item is drawn in its own local frame: u runs along the wall it stands
against, v away from that wall into the room, so one drawing serves all four
walls. Sizes are typical Indian residential furniture in feet (a queen bed
5'0" x 6'6", a 2'9" deep sofa, a 2'0" deep kitchen platform, a 3'0" x 3'0"
shower). Placement never moves a room or a door: an item that cannot stand
clear of the door swings, the windows (tall items) and the other items is left
out. Nothing here is random, so the same room always gets the same furniture.
"""
from __future__ import annotations

import math
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

from compass_standards import RISE, RISERS, STAIR_GAP, STAIR_TWIN, FLIGHT, TREAD, TURNING_CIRCLE

GAP = .25             # Clear floor between two items.
INSET = .45           # Half a 9-inch wall plus a hand's width.
DOOR_CLEARANCE = 3.0  # The zone in front of and behind a door that stays clear.
OPPOSITE = {'S': 'N', 'N': 'S', 'W': 'E', 'E': 'W'}
# Facing inwards from the low-u and high-u ends of an item standing on each wall.
LEFT_END = {'S': 'W', 'N': 'E', 'W': 'N', 'E': 'S'}
RIGHT_END = {'S': 'E', 'N': 'W', 'W': 'S', 'E': 'N'}


def rect_points(r):
    x1, y1, x2, y2 = r
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def ellipse(x, y, rx, ry, n=32):
    return [(x + rx * math.cos(i * math.tau / n), y + ry * math.sin(i * math.tau / n)) for i in range(n)]


class Frame:
    """Local (u along the wall, v into the room) to plan coordinates; `side` is the wall at v = 0."""

    def __init__(self, side, x, y, w, d):
        self.side, self.x, self.y, self.w, self.d = side, x, y, w, d
        self.bounds = (x, y, x + w, y + d) if side in 'SN' else (x, y, x + d, y + w)

    def __call__(self, u, v):
        x, y, w, d = self.x, self.y, self.w, self.d
        if self.side == 'S':
            return (x + u, y + v)
        if self.side == 'N':
            return (x + w - u, y + d - v)
        if self.side == 'W':
            return (x + v, y + w - u)
        return (x + d - v, y + u)

    def local(self, side, u1, v1, w, d):
        """A frame facing `side`, occupying [u1, u1 + extent] x [v1, ...] of this frame."""
        across = (w, d) if (side in 'SN') == (self.side in 'SN') else (d, w)
        corners = [self(u1, v1), self(u1 + across[0], v1 + across[1])]
        x1, y1 = min(p[0] for p in corners), min(p[1] for p in corners)
        return Frame(side, x1, y1, w, d)


class Sketch:
    """Plan lines, filled patches and raised solids of one item, in plan coordinates."""

    def __init__(self, frame):
        self.p, self.lines, self.patches, self.solids = frame, [], [], []

    def outline(self, points, closed=True):
        self.lines.append({'points': [self.p(*q) for q in points], 'closed': closed})

    def block(self, u1, v1, u2, v2, z=0., height=0., tone='fixture', line=True):
        pts = [self.p(*q) for q in rect_points((u1, v1, u2, v2))]
        self.patches.append({'points': pts, 'tone': tone})
        if line:
            self.lines.append({'points': pts, 'closed': True})
        if height:
            self.solids.append({'points': pts, 'z': z, 'height': height, 'tone': tone})

    def round(self, cu, cv, ru, rv, z=0., height=0., tone='pillow', n=24):
        pts = [self.p(*q) for q in ellipse(cu, cv, ru, rv, n)]
        self.patches.append({'points': pts, 'tone': tone})
        self.lines.append({'points': pts, 'closed': True})
        if height:
            self.solids.append({'points': pts, 'z': z, 'height': height, 'tone': tone})


# ---- Drawings (w along the wall, d away from it) -----------------------------------------

def draw_bed(s, w, d, hospital=False):
    s.block(0, 0, w, .35, 0, 2.2 if hospital else 2.7, 'wood')                       # headboard
    s.block(0, .35, w, d, 0, 1.15, 'fixture')                                         # frame
    s.block(.12, .45, w - .12, d - .12, 1.15, .45, 'linen', line=False)               # mattress
    if hospital:
        s.block(.3, .55, w - .3, 1.55, 1.6, .25, 'pillow')
        s.outline([(.12, d * .42), (w - .12, d * .42)], False)                        # backrest hinge
        for u1 in (.0, w - .12):
            s.block(u1, d * .42, u1 + .12, d - .35, 1.6, .55, 'metal', line=False)    # side rails
    else:
        pw = (w - .75) / 2
        for lo in (.25, .5 + pw):
            s.block(lo, .55, lo + pw, 1.75, 1.6, .22, 'pillow')
        s.outline([(0, d - 2.1), (w, d - 2.1)], False)                                # folded quilt
        s.block(.12, d - 2.1, w - .12, d - .12, 1.6, .12, 'linen', line=False)


def draw_side_table(s, w, d):
    s.block(0, 0, w, d, 0, 1.9, 'wood')
    s.round(w / 2, d / 2, w * .22, d * .22, 1.9, .5, 'pillow', 16)                    # lamp


def draw_wardrobe(s, w, d):
    s.block(0, 0, w, d, 0, 7.0, 'wood')
    doors = max(2, round(w / 1.5))
    for i in range(1, doors):
        s.outline([(w * i / doors, 0), (w * i / doors, d)], False)
    s.outline([(0, d - .12), (w, d - .12)], False)                                    # shutter line


def draw_sofa(s, w, d):
    s.block(0, 0, w, .7, 0, 2.6, 'linen')                                             # back
    for lo in (0, w - .55):
        s.block(lo, .7, lo + .55, d, 0, 2.0, 'linen')                                 # arms
    seats = 3 if w >= 6 else 2
    span = (w - 1.1) / seats
    for i in range(seats):
        s.block(.55 + i * span + .04, .7, .55 + (i + 1) * span - .04, d - .1, 0, 1.45, 'fixture')


def draw_armchair(s, w, d):
    s.block(0, 0, w, .55, 0, 2.5, 'linen')
    for lo in (0, w - .45):
        s.block(lo, .55, lo + .45, d, 0, 1.9, 'linen')
    s.block(.49, .59, w - .49, d - .08, 0, 1.4, 'fixture')


def draw_coffee_table(s, w, d):
    s.block(0, 0, w, d, 0, 1.35, 'wood')
    s.outline([(.25, .25), (w - .25, .25), (w - .25, d - .25), (.25, d - .25)])


def draw_tv_unit(s, w, d):
    s.block(0, 0, w, d, 0, 1.6, 'wood')
    s.block(w * .18, .05, w * .82, .25, 1.6, 2.4, 'metal')                            # screen


def draw_dining(s, w, d, ends=True):
    """Table, two or three chairs on each long side, and one at each end when there is room."""
    end = .85 if ends else 0.
    s.block(end + .1, 1.3, w - end - .1, d - 1.3, 0, 2.5, 'wood')
    table = w - 2 * end - .2
    seats = 3 if table >= 5.6 else 2
    for i in range(seats):
        cu = end + .1 + table * (i + .5) / seats
        for v1, v2 in ((0, 1.2), (d - 1.2, d)):
            s.block(cu - .7, v1, cu + .7, v2, 0, 1.5, 'linen')
    if ends:
        for u1, u2 in ((0, .85), (w - .85, w)):
            s.block(u1, d / 2 - .7, u2, d / 2 + .7, 0, 1.5, 'linen')


def draw_counter(s, w, d, sink=False, hob=False, fridge=False):
    top = w - 2.6 if fridge else w
    s.block(0, 0, top, d, 0, 2.8, 'wood')
    s.outline([(0, d - .1), (top, d - .1)], False)                                    # platform nosing
    u = .35
    if sink and u + 2.0 <= top:
        s.block(u, .3, u + 2.0, d - .3, 2.8, .1, 'metal')
        s.round(u + 1.0, d / 2, .6, .45, 2.9, .02, 'pillow', 16)
        u += 2.5
    if hob and u + 2.0 <= top:
        s.block(u, .3, u + 2.0, d - .3, 2.8, .08, 'metal')
        for du in (.5, 1.5):
            s.round(u + du, d / 2, .28, .28, 2.88, .02, 'fixture', 16)
    if fridge:
        s.block(w - 2.4, 0, w, d, 0, 6.0, 'metal')
        s.outline([(w - 2.4, d * .62), (w, d * .62)], False)


def draw_wc(s, w, d):
    s.block(.12, 0, w - .12, .6, 0, 2.6, 'pillow')                                    # cistern
    s.round(w / 2, 1.5, .6, .82, 0, 1.35, 'pillow')                                   # pan


def draw_basin(s, w, d):
    s.block(0, 0, w, d, 0, 2.7, 'pillow')
    s.round(w / 2, d * .55, w * .32, d * .3, 2.7, .05, 'metal', 16)


def draw_shower(s, w, d):
    s.block(0, 0, w, d, 0, .08, 'metal')
    s.outline([(0, 0), (w, d)], False)
    s.outline([(w, 0), (0, d)], False)
    s.round(w / 2, d / 2, .22, .22, .08, .02, 'fixture', 12)                           # floor trap


def draw_shelves(s, w, d):
    s.block(0, 0, w, d, 0, 6.5, 'wood')
    bays = max(2, int(w / 2))
    for i in range(1, bays):
        s.outline([(w * i / bays, 0), (w * i / bays, d)], False)


def draw_cot(s, w, d):
    s.block(0, 0, w, d, 0, 1.3, 'fixture')
    s.block(.15, .15, w - .15, d - .15, 1.3, .3, 'linen', line=False)
    s.block(.3, .3, w - .3, 1.3, 1.6, .2, 'pillow')


def draw_trolley(s, w, d):
    s.block(0, 0, w, d, 0, 3.0, 'metal')
    s.block(.15, .1, w - .15, .35, 3.0, 1.1, 'fixture')                                # monitor


def draw_planter(s, w, d):
    s.block(0, 0, w, d, 0, 1.2, 'wood')
    for i in range(max(1, int(w / 1.6))):
        s.round(.8 + i * 1.6, d / 2, .55, .42, 1.2, .9, 'plant', 16)


def draw_tree(s, w, d):
    s.round(w / 2, d / 2, w / 2, d / 2, 0, 0, 'plant')
    s.round(w / 2, d / 2, w * .3, d * .3, 0, 0, 'plant', 16)
    # A trunk and two tiers of canopy read as a tree from every side.
    s.solids.append({'points': [s.p(*q) for q in ellipse(w / 2, d / 2, .22, .22, 10)], 'z': 0, 'height': 3.6, 'tone': 'wood'})
    s.solids.append({'points': [s.p(*q) for q in ellipse(w / 2, d / 2, w * .46, d * .46, 16)], 'z': 3.6, 'height': 2.5, 'tone': 'plant'})
    s.solids.append({'points': [s.p(*q) for q in ellipse(w / 2, d / 2, w * .3, d * .3, 12)], 'z': 6.1, 'height': 1.6, 'tone': 'plant'})


def draw_seating(s, w, d):
    for lo in (0, w - 1.8):
        s.block(lo, 0, lo + 1.8, d, 0, 2.3, 'wood')
        s.block(lo + .15, .45, lo + 1.65, d - .1, 0, 1.4, 'linen', line=False)
    s.round(w / 2, d / 2, .65, .65, 0, 1.6, 'wood', 20)


def draw_stair(s, w, d, twin=True, along=False):
    """Dog-leg stair: the mid-landing stands against the wall (v = 0) and both
    flights come out into the room, so the first step faces the room. Sixteen
    7½-inch risers climb the 10 ft storey (compass_standards). `along`: one
    straight flight beside the wall, climbing in u, for long narrow rooms."""
    s.walk = []
    if along:
        per = RISERS - 1                           # The last riser lands on the floor above.
        tread = w / per
        for i in range(per):
            s.block(i * tread, 0, (i + 1) * tread, d, 0, (i + 1) * RISE, 'stair')
        s.walk = [(.35, d / 2), (w - .45, d / 2)]
    elif twin:
        lane = (w - STAIR_GAP) / 2
        per = RISERS // 2                          # Risers per flight; the last one lands.
        tread = (d - lane) / (per - 1)
        landing = d - (per - 1) * tread
        for i in range(per - 1):                   # Up: from the room towards the landing.
            s.block(0, d - (i + 1) * tread, lane, d - i * tread, 0, (i + 1) * RISE, 'stair')
        s.block(0, 0, w, landing, 0, per * RISE, 'stair')
        for i in range(per - 1):                   # Then back towards the room, one floor up.
            s.block(lane + STAIR_GAP, landing + i * tread, w, landing + (i + 1) * tread, 0, (per + i + 1) * RISE, 'stair')
        s.walk = [(lane / 2, d - .35), (lane / 2, landing / 2), (lane + STAIR_GAP + lane / 2, landing / 2),
                  (lane + STAIR_GAP + lane / 2, d - .45)]
    else:
        per = 12
        tread = d / per
        for i in range(per):
            s.block(0, d - (i + 1) * tread, w, d - i * tread, 0, (i + 1) * RISE, 'stair')
        s.walk = [(w / 2, d - .35), (w / 2, .45)]
    s.outline(s.walk, False)                                                                # Walking line.
    (ax, ay), (bx, by) = s.walk[-2], s.walk[-1]
    length = math.hypot(bx - ax, by - ay) or 1
    ux, uy = (bx - ax) / length, (by - ay) / length
    s.outline([(bx - ux * .55 - uy * .38, by - uy * .55 + ux * .38), (bx, by),
               (bx - ux * .55 + uy * .38, by - uy * .55 - ux * .38)], False)                  # Arrowhead.
    s.round(*s.walk[0], .14, .14, 0, 0, 'fixture', 12)                                      # First riser.
    s.walk = [s.p(*q) for q in s.walk]


DRAW = {
    'bed': draw_bed, 'hospital-bed': lambda s, w, d: draw_bed(s, w, d, True), 'side-table': draw_side_table,
    'wardrobe': draw_wardrobe, 'sofa': draw_sofa, 'armchair': draw_armchair, 'coffee-table': draw_coffee_table,
    'tv-unit': draw_tv_unit, 'dining': draw_dining, 'counter': draw_counter, 'wc': draw_wc, 'basin': draw_basin,
    'shower': draw_shower, 'shelves': draw_shelves, 'cot': draw_cot, 'trolley': draw_trolley,
    'planter': draw_planter, 'tree': draw_tree, 'seating': draw_seating, 'stair': draw_stair,
}


# ---- Placement ---------------------------------------------------------------------------
# Footprints, clear zones and door zones on the 4x4 grid are axis-aligned
# rectangles, so the search uses plain (x1, y1, x2, y2) arithmetic: thousands of
# candidate positions per floor cost milliseconds. Shapely is used only where a
# room is not a rectangle. Touching counts as overlapping, as in shapely.

def overlaps(a, b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def apart(a, b):
    """Distance between two rectangles (0 when they touch or overlap)."""
    return math.hypot(max(0., b[0] - a[2], a[0] - b[2]), max(0., b[1] - a[3], a[1] - b[3]))


def point_gap(r, p):
    return math.hypot(max(0., r[0] - p[0], p[0] - r[2]), max(0., r[1] - p[1], p[1] - r[3]))


def _intervals(edge, geom):
    """Parameter intervals of `edge` that lie along `geom`."""
    hit = geom.intersection(edge)
    spans = []
    for piece in (list(hit.geoms) if hasattr(hit, 'geoms') else [hit]):
        if piece.is_empty or piece.geom_type != 'LineString' or piece.length < .01:
            continue
        lo, hi = sorted(edge.project(Point(p)) for p in (piece.coords[0], piece.coords[-1]))
        spans.append((lo, hi))
    return sorted(spans)


class Item:
    def __init__(self, kind, w, d, front=0., tall=False, **options):
        self.kind, self.w, self.d, self.front, self.tall, self.options = kind, w, d, front, tall, options


class Room:
    """One room's free floor, door zones, windows and what has been placed so far."""

    def __init__(self, shape, rect, doors, windows):
        self.shape, self.rect = shape, rect
        self.free = shape.buffer(-INSET, join_style=2)
        bounds = self.free.bounds if not self.free.is_empty else None
        self.free_rect = bounds if bounds and abs(self.free.area - box(*bounds).area) < 1e-6 else None
        whole = shape.bounds
        self.shape_rect = whole if abs(shape.area - box(*whole).area) < 1e-6 else None
        self.door_rects, slanted = [], []
        for d in doors:
            (ax, ay), (bx, by) = d['a'], d['b']
            if abs(ay - by) < 1e-9:
                self.door_rects.append((min(ax, bx), ay - DOOR_CLEARANCE, max(ax, bx), ay + DOOR_CLEARANCE))
            elif abs(ax - bx) < 1e-9:
                self.door_rects.append((ax - DOOR_CLEARANCE, min(ay, by), ax + DOOR_CLEARANCE, max(ay, by)))
            else:
                slanted.append(LineString([d['a'], d['b']]).buffer(DOOR_CLEARANCE, cap_style=2))
        self.slanted = unary_union(slanted) if slanted else None
        self.doors = [((d['a'][0] + d['b'][0]) / 2, (d['a'][1] + d['b'][1]) / 2) for d in doors]
        self.windows = [(w['a'], w['b']) for w in windows]
        self.placed = []  # (footprint, footprint plus the clear floor it needs in front)
        self.turning = None
        x1, y1, x2, y2 = rect
        boundary = shape.boundary
        sides = {'S': ((x1, y1), (x2, y1)), 'N': ((x1, y2), (x2, y2)), 'W': ((x1, y1), (x1, y2)), 'E': ((x2, y1), (x2, y2))}
        self.walls = {}  # Parts of each side of the main rectangle that are real walls.
        for side, (a, b) in sides.items():
            origin = a[0] if side in 'SN' else a[1]
            self.walls[side] = [(origin + lo, origin + hi) for lo, hi in _intervals(LineString([a, b]), boundary)]

    def covers(self, r):
        f = self.free_rect
        if f is not None:
            return f[0] - 1e-9 <= r[0] and r[2] <= f[2] + 1e-9 and f[1] - 1e-9 <= r[1] and r[3] <= f[3] + 1e-9
        return not self.free.is_empty and self.free.covers(box(*r))

    def inside(self, r):
        """The clear floor in front of an item must be floor of this room, not a wall."""
        f = self.shape_rect
        if f is not None:
            return f[0] - 1e-9 <= r[0] and r[2] <= f[2] + 1e-9 and f[1] - 1e-9 <= r[1] and r[3] <= f[3] + 1e-9
        return self.shape.covers(box(*r))

    def clear(self, r, zone, companions=()):
        if not self.covers(r) or any(overlaps(r, d) for d in self.door_rects):
            return False
        if zone != r and not self.inside(zone):
            return False
        if self.slanted is not None and box(*r).intersects(self.slanted):
            return False
        for other, reserved in self.placed:
            # A companion (a coffee table before its sofa) may stand in the sofa's clear floor.
            keep = other if other in companions else reserved
            if apart(r, keep) < GAP - 1e-9 or overlaps(zone, other):
                return False
        return True

    def keep(self, frame, item):
        self.placed.append((frame.bounds, zone_of(frame, item)))
        return frame.bounds

    def window_on(self, side, lo, hi):
        x1, y1, x2, y2 = self.rect
        line = {'S': y1, 'N': y2, 'W': x1, 'E': x2}[side]
        for (ax, ay), (bx, by) in self.windows:
            if side in 'SN':
                if abs(ay - line) < .3 and abs(by - line) < .3 and min(hi, max(ax, bx)) - max(lo, min(ax, bx)) > .2:
                    return True
            elif abs(ax - line) < .3 and abs(bx - line) < .3 and min(hi, max(ay, by)) - max(lo, min(ay, by)) > .2:
                return True
        return False

    def door_distance(self, r):
        return min((point_gap(r, p) for p in self.doors), default=20.)


def zone_of(frame, item):
    """The footprint plus the clear floor it needs: in front, or before the first riser of a flight along a wall."""
    x1, y1, x2, y2 = frame.bounds
    f = item.front
    if item.options.get('along'):
        dx1, dy1, dx2, dy2 = {'S': (f, 0, 0, 0), 'N': (0, 0, f, 0), 'W': (0, 0, 0, f), 'E': (0, f, 0, 0)}[frame.side]
    else:
        dx1, dy1, dx2, dy2 = {'S': (0, 0, 0, f), 'N': (0, f, 0, 0), 'W': (0, 0, f, 0), 'E': (f, 0, 0, 0)}[frame.side]
    return (x1 - dx1, y1 - dy1, x2 + dx2, y2 + dy2)


def wall_positions(room, item, sides=None, step=.25):
    """Every position along each real wall of the room's main rectangle, back to the wall."""
    x1, y1, x2, y2 = room.rect
    for side in 'SNWE':
        if sides and side not in sides:
            continue
        horizontal = side in 'SN'
        start, length = (x1 + INSET, x2 - x1 - 2 * INSET) if horizontal else (y1 + INSET, y2 - y1 - 2 * INSET)
        if item.w > length + 1e-9:
            continue
        walls = room.walls[side]
        steps = int((length - item.w) / step + 1e-9)
        for t in sorted({k * step for k in range(steps + 1)} | {(length - item.w) / 2}):
            lo = start + t
            mid = lo + item.w / 2
            if not any(a - .01 <= mid <= b + .01 for a, b in walls):
                continue  # The inside edge of an L-shaped room is not a wall to stand against.
            if horizontal:
                frame = Frame(side, lo, y1 + INSET if side == 'S' else y2 - INSET - item.d, item.w, item.d)
            else:
                frame = Frame(side, x1 + INSET if side == 'W' else x2 - INSET - item.d, lo, item.w, item.d)
            yield side, t, length, lo, lo + item.w, frame


def place(room, item, score, sides=None):
    """The best-scoring clear position along the walls, or None. Lower scores win."""
    best = None
    for side, t, length, lo, hi, frame in wall_positions(room, item, sides):
        if item.tall and room.window_on(side, lo, hi):
            continue
        footprint = frame.bounds
        if not room.clear(footprint, zone_of(frame, item)):
            continue
        value = score(side, t, length, lo, hi, frame, footprint)
        if value is None:
            continue
        key = (round(value, 6), 'SNWE'.index(side), round(t, 4))
        if best is None or key < best[0]:
            best = (key, frame)
    if best is None:
        return None
    room.keep(best[1], item)
    return best[1]


def place_at(room, item, frame, companions=()):
    if frame is None or not room.clear(frame.bounds, zone_of(frame, item), companions):
        return None
    room.keep(frame, item)
    return frame


def centred(t, length, w):
    return abs(t - (length - w) / 2)


def fixture(frame, item):
    sketch = Sketch(frame)
    DRAW[item.kind](sketch, item.w, item.d, **item.options)
    out = {'kind': item.kind, 'bounds': frame.bounds, 'lines': sketch.lines, 'patches': sketch.patches,
           'solids': sketch.solids, 'side': frame.side}
    if item.kind == 'stair':
        out['walk'] = sketch.walk
        out['frame'] = {'side': frame.side, 'x': frame.x, 'y': frame.y, 'w': item.w, 'd': item.d,
                        'twin': item.options.get('twin', True), 'along': item.options.get('along', False)}
    return out


def stair(shape, rect, doors, windows, hint=None):
    """A dog-leg stair (or a single flight in a narrow room) with clear floor at its first riser.

    `hint` is the stair of the other floor: the same footprint is used when it
    fits, so the two plans agree about where the stair rises."""
    room = Room(shape, rect, doors, windows)
    if hint:
        item = Item('stair', hint['w'], hint['d'], front=FLIGHT, twin=hint['twin'], along=hint.get('along', False))
        frame = place_at(room, item, Frame(hint['side'], hint['x'], hint['y'], hint['w'], hint['d']))
        if frame is not None:
            return fixture(frame, item), room
    straight = ((RISERS - 1) * TREAD, FLIGHT)
    for (w, d), twin, along in ((STAIR_TWIN, True, False), (straight, False, True), ((FLIGHT, 9.0), False, False),
                                ((FLIGHT, 6.0), False, False)):
        item = Item('stair', w, d, front=FLIGHT, twin=twin, along=along)
        frame = place(room, item, lambda s, t, L, lo, hi, f, fp: min(t, L - t - f.w) - room.door_distance(fp) * .05)
        if frame is not None:
            return fixture(frame, item), room
    return None, room


def turning_space(room):
    """Centre of a clear 5 ft wheelchair turning circle nearest the room centre, or None."""
    radius = TURNING_CIRCLE / 2
    usable = room.free.buffer(-radius + INSET, join_style=2)
    if usable.is_empty:
        return None
    x1, y1, x2, y2 = usable.bounds
    rectangle = abs(usable.area - box(*usable.bounds).area) < 1e-6
    cx, cy = room.shape.centroid.x, room.shape.centroid.y
    best = None
    for i in range(int((x2 - x1) / .5 + 1e-9) + 1):
        for j in range(int((y2 - y1) / .5 + 1e-9) + 1):
            p = (x1 + i * .5, y1 + j * .5)
            if not rectangle and not usable.covers(Point(p)):
                continue
            if any(point_gap(footprint, p) < radius for footprint, _ in room.placed):
                continue
            key = (round(math.dist(p, (cx, cy)), 4), p[0], p[1])
            if best is None or key < best:
                best = key
    return None if best is None else (best[1], best[2])


def furnish(kinds, shape, rect, doors, windows, room=None):
    """Furniture for a room of the given kinds (most important first) as fixtures.

    `room` carries what is already placed (a stair) so nothing overlaps it."""
    rw, rh = rect[2] - rect[0], rect[3] - rect[1]
    short, long_ = min(rw, rh), max(rw, rh)
    room = room or Room(shape, rect, doors, windows)
    out = []

    def add(item, frame):
        if frame is not None:
            out.append(fixture(frame, item))
        return frame

    for kind in kinds:
        if kind in ('master', 'bed', 'icu'):
            hospital = kind == 'icu'
            bed = Item('hospital-bed' if hospital else 'bed', 3.25 if hospital else 6.0 if kind == 'master' and short >= 13 else 5.0,
                       6.75 if hospital else 6.5, front=2.0)
            reach = 2.5 if hospital else 1.5 + GAP  # Bedside tables, or care access to a hospital bed.

            def bed_score(side, t, length, lo, hi, frame, footprint):
                if min(t, length - t - bed.w) < reach - 1e-9:
                    return None
                return (10 if room.window_on(side, lo, hi) else 0) + centred(t, length, bed.w) - room.door_distance(footprint) * .2

            frame = add(bed, place(room, bed, bed_score))
            if frame is not None:
                table = Item('side-table', 1.5, 1.5)
                ends = (bed.w + GAP,) if hospital else (-1.5 - GAP, bed.w + GAP)
                for u in ends:
                    add(table, place_at(room, table, frame.local(frame.side, u, 0, 1.5, 1.5)))
                if hospital:
                    trolley = Item('trolley', 2.0, 1.5, front=1.5)
                    add(trolley, place(room, trolley, lambda s, t, L, lo, hi, f, fp: apart(fp, frame.bounds)))
                    cot = Item('cot', 3.0, 6.25, front=2.0)
                    add(cot, place(room, cot, lambda s, t, L, lo, hi, f, fp: -apart(fp, frame.bounds) * .1))
            for width in (6.0 if long_ >= 14 else 4.0, 4.0, 3.0):
                wardrobe = Item('wardrobe', width, 2.0, front=3.0, tall=True)
                if add(wardrobe, place(room, wardrobe, lambda s, t, L, lo, hi, f, fp: min(t, L - t - wardrobe.w))) is not None:
                    break
        elif kind in ('living', 'drawing'):
            for width in ((6.5, 5.0) if short >= 11 else (5.0,)):
                sofa = Item('sofa', width, 2.75, front=1.5)

                def sofa_score(side, t, length, lo, hi, frame, footprint):
                    across = rh if side in 'SN' else rw
                    if across - INSET * 2 < sofa.d + 1.5 + 1.75 + 3.0:
                        return None  # No room for the coffee table and a walkway.
                    return centred(t, length, sofa.w) - room.door_distance(footprint) * .3 + (4 if room.window_on(side, lo, hi) else 0)

                frame = add(sofa, place(room, sofa, sofa_score))
                if frame is not None:
                    break
            if frame is not None:
                base = frame.bounds
                table = Item('coffee-table', 3.5 if sofa.w > 6 else 3.0, 1.75)
                tf = add(table, place_at(room, table, frame.local(frame.side, (sofa.w - table.w) / 2, sofa.d + 1.5, table.w, table.d), (base,)))
                if tf is not None:
                    chair = Item('armchair', 2.4, 2.4)
                    centre_v = sofa.d + 1.5 + table.d / 2 - chair.w / 2
                    for end_side, u in ((LEFT_END[frame.side], (sofa.w - table.w) / 2 - .75 - chair.d),
                                        (RIGHT_END[frame.side], (sofa.w + table.w) / 2 + .75)):
                        add(chair, place_at(room, chair, frame.local(end_side, u, centre_v, chair.w, chair.d), (base,)))
                tv = Item('tv-unit', 5.0, 1.5, front=2.5)
                add(tv, place(room, tv, lambda s, t, L, lo, hi, f, fp: centred(t, L, tv.w), sides=OPPOSITE[frame.side]))
        elif kind == 'dining':
            cx, cy = (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2
            for w, d, ends in ((8.2, 5.4, True), (6.4, 5.4, True), (4.6, 5.0, False)):
                table = Item('dining', w, d, ends=ends)
                along = 'S' if rw >= rh else 'W'
                placed = None
                for shift in (0, 1.0, -1.0, 2.0, -2.0, 3.0, -3.0):
                    dx, dy = (shift, 0) if along == 'S' else (0, shift)
                    frame = Frame(along, cx - (w if along == 'S' else d) / 2 + dx, cy - (d if along == 'S' else w) / 2 + dy, w, d)
                    # Leave a 2 ft walkway round the chairs.
                    x1, y1, x2, y2 = frame.bounds
                    if room.covers((x1 - 1.5, y1 - 1.5, x2 + 1.5, y2 + 1.5)) and (placed := place_at(room, table, frame)):
                        break
                if add(table, placed) is not None:
                    break
            unit = Item('shelves', 4.0, 1.5, front=2.0, tall=True)
            add(unit, place(room, unit, lambda s, t, L, lo, hi, f, fp: centred(t, L, unit.w)))
        elif kind == 'kitchen':
            best = None
            for side in 'SNWE':
                run = (rw if side in 'SN' else rh) - 2 * INSET
                for length in [run - k for k in range(0, int(run - 5))]:
                    item = Item('counter', length, 2.0, front=3.0, sink=True, hob=True)
                    for side_, t, L, lo, hi, f in wall_positions(room, item, side):
                        if room.clear(f.bounds, zone_of(f, item)):
                            key = (round(length), 1 if room.window_on(side_, lo, hi) else 0, -t)
                            if best is None or key > best[0]:
                                best = (key, f, item)
                            break
                    if best is not None and best[2].w == length and best[1].side == side:
                        break
            if best is not None:
                _, f, item = best
                add(item, place_at(room, item, f))
                first = f.bounds
                for length in (7.0, 6.0, 5.0, 4.0):
                    second = Item('counter', length, 2.0, front=3.0, fridge=length >= 5.0)
                    sides = 'WE' if f.side in 'SN' else 'SN'
                    if add(second, place(room, second, lambda s, t, L, lo, hi, fr, fp: apart(fp, first), sides=sides)) is not None:
                        break
        elif kind == 'bath':
            shower = Item('shower', 3.0, 3.0)
            add(shower, place(room, shower, lambda s, t, L, lo, hi, f, fp: min(t, L - t - f.w) - room.door_distance(fp) * .2))
            wc = Item('wc', 1.75, 2.5, front=2.0)
            add(wc, place(room, wc, lambda s, t, L, lo, hi, f, fp: -room.door_distance(fp) * .2))
            basin = Item('basin', 1.75, 1.5, front=1.5)
            add(basin, place(room, basin, lambda s, t, L, lo, hi, f, fp: room.door_distance(fp)))
        elif kind == 'store':
            for _ in range(2):
                shelf = Item('shelves', min(6.0, long_ - 1.5), 1.5, front=2.5)
                add(shelf, place(room, shelf, lambda s, t, L, lo, hi, f, fp: -L + centred(t, L, shelf.w) * .1))
        elif kind == 'green':
            for size in (3.5, 3.0):
                tree = Item('tree', size, size)
                if add(tree, place(room, tree, lambda s, t, L, lo, hi, f, fp: min(t, L - t - f.w))) is not None:
                    break
        elif kind == 'paved':
            seats = Item('seating', 5.5, 2.0, front=1.5)
            add(seats, place(room, seats, lambda s, t, L, lo, hi, f, fp: centred(t, L, seats.w) - room.door_distance(fp) * .3))
        elif kind == 'balcony':
            planter = Item('planter', min(6.4, long_ - 1.5), 1.25)
            add(planter, place(room, planter, lambda s, t, L, lo, hi, f, fp: -L))
    room.turning = turning_space(room) if 'icu' in kinds else None
    return out
