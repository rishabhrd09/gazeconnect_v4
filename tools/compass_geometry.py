"""PlanModel: the one derived description that every Compass view and export draws (§4.4, §7).

All plan geometry lives on an integer lattice, u = 1/8 inch (96 u per foot), so equality is
exact, noding is exact and output is reproducible. Region rectangles come from the plan
(compass_schema); walls, openings, the stair core, the double-height void, supports and
fixtures are derived here and nowhere else. Renderers receive this model and nothing else.

Order of derivation (one floor at a time, both floors for the stair):
regions -> rooms -> noded edges -> boundary kinds (§7.2) -> wall solids -> clear rooms ->
stair core (§7.5) -> doors from an access tree (§7.3) -> windows (§7.4) -> void (§7.7) ->
supports and roofs (§7.6) -> fixtures -> labels -> notes, checks and the model hash.
"""
from __future__ import annotations

import hashlib
import heapq
import json
import math
from itertools import combinations, islice, product
from typing import Dict, List, Optional, Tuple

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polylabel

import compass_furniture as furniture
import compass_schema as schema
from compass_resources import checkpoint
from compass_standards import (DOOR_HEAD, FLIGHT, MUMTY, PARAPET, RISERS, SLAB, STAIR_GAP, STAIR_TWIN, STOREY,
                               TREAD, VENT_HEAD, VENT_SILL, WINDOW_HEAD, WINDOW_SILL, ft_in)

KERNEL = 'compass-geometry/1'
U = 96                         # lattice units per foot (1 u = 1/8 inch)
IN = 8                         # lattice units per inch
WALL_EXT = 9 * IN              # 9-inch exterior wall, inside the region boundary
WALL_INT = 6 * IN              # 6-inch partition, centred
PARAPET_T = 4.5 * IN           # parapet / terrace edge
DOOR_MAIN = 42 * IN            # 3'-6"
DOOR_ROOM = 36 * IN            # 3'-0"
JAMB = 4 * IN                  # a door stays 4 inches from a perpendicular wall
DOOR_EDGE = DOOR_ROOM + 2 * JAMB   # 3'-8": the shortest wall that can hold a door
ZONE = 36 * IN                 # 3'-0" approach / arrival zone at a stair
COLUMN = 9 * IN
WINDOW_END = 18 * IN           # windows keep 1'-6" from the end of a wall run
OVERHANG = 4 * U               # first-floor overhang beyond which columns are proposed
OPEN_DEPTH = 6 * U             # an open space must be 6 ft deep for a window to face it

ZONES = {
    'living': 'public', 'dining': 'public', 'staircase': 'public', 'diningStaircase': 'public', 'ff_living': 'public',
    'drawing': 'public',          # 'private' (a closed room) when the drawing room is chosen separate.
    'kitchen': 'service',
    'masterBed': 'private', 'bedroom': 'private', 'icu': 'private', 'ff_master': 'private', 'ff_bed2': 'private',
    'ff_bed3': 'private',
    'bathroom': 'wet', 'ff_bathroom': 'wet',
    'passage': 'circulation', 'ff_stairLanding': 'circulation',
    'porch': 'covered', 'verandah': 'covered', 'balcony': 'covered', 'ff_balcony': 'covered',
    'lawn': 'open', 'backyard': 'open', 'terrace': 'open', 'ff_terrace': 'open',
    'void': 'void',
}
INDOOR = frozenset({'public', 'service', 'private', 'wet', 'circulation'})
OUTDOOR = frozenset({'covered', 'open'})
# What a room is used for, most important first: furniture, windows and floor finish follow it.
KINDS = {
    'living': ['living'], 'ff_living': ['living'], 'drawing': ['drawing'], 'dining': ['dining'],
    'diningStaircase': ['stair', 'dining'], 'staircase': ['stair', 'lobby'], 'ff_stairLanding': ['stair'],
    'kitchen': ['kitchen'], 'masterBed': ['master'], 'ff_master': ['master'], 'bedroom': ['bed'], 'ff_bed2': ['bed'],
    'ff_bed3': ['bed'], 'icu': ['icu'], 'bathroom': ['bath'], 'ff_bathroom': ['bath'], 'passage': ['passage'],
    'porch': ['paved'], 'verandah': ['paved'], 'lawn': ['green'], 'backyard': ['green'], 'balcony': ['balcony'],
    'terrace': ['balcony'], 'ff_balcony': ['balcony'], 'ff_terrace': ['balcony'], 'void': [],
}
# Window width (ft) and the most windows a room of each kind receives (compass_architecture.WINDOWS).
WINDOWS = {'living': (6, 4), 'drawing': (6, 4), 'dining': (5, 2), 'master': (5, 3), 'bed': (5, 2), 'icu': (5, 2),
           'kitchen': (4, 2), 'stair': (3, 2), 'lobby': (4, 2), 'passage': (3, 1)}
HABITABLE = frozenset({'living', 'drawing', 'dining', 'master', 'bed', 'icu', 'kitchen'})
# Minimum clear widths (§4.6, NBC 2016 as tabled in nbc_standards), in feet.
MIN_CLEAR = {'living': 7 + 10 / 12, 'drawing': 7 + 10 / 12, 'master': 7 + 10 / 12, 'icu': 7 + 10 / 12,
             'bed': 6 + 11 / 12, 'dining': 6 + 11 / 12, 'kitchen': 4 + 11 / 12, 'bath': 3 + 11 / 12,
             'passage': 3 + 3 / 12}
# A passage narrower than this is still walkable but below the plan's wheelchair-route target (§5.3).
PASSAGE_ROUTE = 3 + 11 / 12
KIND_NOUNS = {'living': 'living hall', 'drawing': 'drawing room', 'master': 'master bedroom', 'icu': 'home ICU room',
              'bed': 'bedroom', 'dining': 'dining hall', 'kitchen': 'kitchen', 'bath': 'bathroom', 'passage': 'passage'}
NORTH = {'South': (0., 1.), 'North': (0., -1.), 'East': (1., 0.), 'West': (-1., 0.)}
FLOOR_NAMES = {'ground': 'Ground floor', 'first': 'First floor'}


def ft(value_u: float) -> float:
    return value_u / U


def north_vector(facing: str) -> Tuple[float, float]:
    """North in plan coordinates for the plot's facing (python/tests/fixtures/compass/f02_facings.json)."""
    return NORTH[str(facing).title()]


def where(key: str) -> str:
    """'Row 2 · Column 3, left half': how a region is spoken and written."""
    row, col, half = schema.parse_region(key)
    return f'Row {row} · Column {col}' + {'L': ', left half', 'R': ', right half', 'T': ', top half', 'B': ', bottom half', None: ''}[half]


# ---- Small exact helpers ---------------------------------------------------------------------

def parts(geom):
    if geom is None or geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, 'geoms') else [geom]


def union(geoms):
    geoms = [g for g in geoms if g is not None and not g.is_empty]
    if not geoms:
        return Polygon()
    return shapely.union_all(geoms, grid_size=1)


def rect_poly(r):
    return box(*r)


def largest_rect(shape, limit=4096):
    """The largest axis-aligned rectangle inside `shape` (exact for lattice polygons), as (x1, y1, x2, y2)."""
    if shape.is_empty:
        return None
    if abs(shape.area - shape.envelope.area) < 1e-6:
        return shape.bounds
    xs = sorted({x for p in parts(shape) for ring in (p.exterior, *p.interiors) for x, _ in ring.coords})
    ys = sorted({y for p in parts(shape) for ring in (p.exterior, *p.interiors) for _, y in ring.coords})
    spans = sorted(((a, b, c, d) for (a, b), (c, d) in product(combinations(xs, 2), combinations(ys, 2))),
                   key=lambda r: -(r[1] - r[0]) * (r[3] - r[2]))
    spans = list(islice(spans, limit))
    if not spans:
        return None
    arr = np.array([(a, c, b, d) for a, b, c, d in spans], dtype=float)
    inside = shapely.covers(shape, shapely.box(arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3]))
    for (a, b, c, d), ok in zip(spans, inside):
        if ok:
            return (a, c, b, d)
    return None


# ---- Model ----------------------------------------------------------------------------------

class Room:
    def __init__(self, data, floor, label, zone):
        self.id, self.use, self.floor = data['id'], data['use'], floor
        self.regions = list(data['regions'])
        self.label, self.short = label, schema.LIBRARY[self.use][1]
        self.zone = zone
        self.kinds = list(KINDS[self.use])
        self.kind = next((k for k in self.kinds if k != 'stair'), self.kinds[0] if self.kinds else None)
        self.indoor = zone in INDOOR
        self.outdoor = zone in OUTDOOR
        self.polygon = Polygon()
        self.clear = Polygon()
        self.double_height = False

    def __repr__(self):
        return f'Room({self.id})'


def side_of(region_key, owner, rooms, site=None):
    if site:
        return {'type': 'site', 'site': site, 'room': None, 'zone': 'site', 'region': None}
    rid = owner.get(region_key)
    if rid is None:
        return {'type': 'unassigned', 'room': None, 'zone': 'unassigned', 'region': region_key}
    return {'type': 'room', 'room': rid, 'zone': rooms[rid].zone, 'region': region_key}


def decide(a, b, choices):
    """Boundary decision table (§7.2), first match wins. Returns (kind, reason, inward side or None)."""
    if a['room'] and a['room'] == b['room']:
        return 'none', 'same-room', None
    za, zb = a['zone'], b['zone']
    zones = {za, zb}
    opened = ('site', 'unassigned') + tuple(OUTDOOR)

    def pick(zone_set):
        return 'a' if za in zone_set else 'b'
    # Void edges first: a void is not a floor, but it is inside the first-floor envelope.
    if 'void' in zones:
        other = zb if za == 'void' else za
        inward = 'a' if za == 'void' else 'b'
        if other == 'void':
            return 'none', 'same-void', None
        if other in ('public', 'circulation'):
            return 'rail', 'gallery', None
        if other in ('private', 'wet', 'service'):
            return 'partition', 'void-privacy', None
        return 'exterior', 'double-height', inward
    a_in, b_in = za in INDOOR, zb in INDOOR
    if a_in != b_in and (za in opened or zb in opened):
        return 'exterior', 'envelope', 'a' if a_in else 'b'
    if not a_in and not b_in:
        return 'none', 'open-site', None
    if zones == {'public'}:
        return 'open', 'open-plan', None
    kitchen = choices.get('kitchen', 'open')
    if 'service' in zones and zones & {'public', 'circulation'}:
        return ('open', 'kitchen-open', None) if kitchen == 'open' else ('partition', 'kitchen-closed', None)
    if zones <= {'public', 'circulation'}:
        return 'open', 'circulation', None
    if 'service' in zones and 'wet' in zones:
        return 'partition', 'hygiene', None
    if a.get('drawing') or b.get('drawing'):
        return 'partition', 'drawing-separate', None
    if zones & {'private', 'wet'}:
        return 'partition', 'privacy', None
    return 'partition', 'separate', None


def build(plan: dict) -> dict:
    """The PlanModel for a CompassPlanV2 (validated here). Deterministic: no clock, randomness or set order."""
    plan = schema.normalise(plan)
    plot = plan['plot']
    W, D = plot['widthIn'] * IN, plot['depthIn'] * IN
    choices = {'drawingRoom': plan['choices'].get('drawingRoom', 'open'), 'kitchen': plan['choices'].get('kitchen', 'open')}
    asked = set(plan['choices'])
    floors_present = ['ground'] + (['first'] if plan['storeys'] == 2 and 'first' in plan['floors'] else [])
    model = {'kernel': KERNEL, 'plot': {**plot, 'W': W, 'D': D, 'widthFt': W / U, 'depthFt': D / U,
                                         'north': north_vector(plot['facing'])},
             'storeys': plan['storeys'], 'choices': choices, 'asked': asked, 'floors': {}, 'notes': [], 'checks': {}}
    notes = model['notes']
    for issue in schema.check(plan):
        notes.append(issue)
    if plan.get('legacy') and not plan['legacy'].get('converted'):
        notes.append(note('legacy', 'conflict', 'This map has saved plan details from the earlier Refine Map. '
                                                 'Open them with the saved-plan viewer, or convert the map.'))
    for name in floors_present:
        checkpoint()
        model['floors'][name] = _floor(name, plan, W, D, choices)
    _stair(model, plan, notes)
    for name in floors_present:
        checkpoint()
        f = model['floors'][name]
        _doors(model, name, notes)
        _windows(model, name, notes)
    if 'first' in model['floors']:
        _void(model, notes)
        _upper(model, notes)
    elif plan['storeys'] == 1 and model['floors']['ground'].get('stair'):
        model['roofAccess'] = True
    for name in floors_present:
        checkpoint()
        _fixtures(model, name, notes)
        _labels(model, name)
        _room_notes(model, name, notes)
    _general_notes(model, notes)
    model['checks'] = _checks(model)
    model['intent'] = plan
    model['modelHash'] = model_hash(model)
    return model


def note(code, severity, message, rooms=(), regions=(), adjustment=None, floor=None):
    out = {'code': code, 'severity': severity, 'message': message, 'rooms': list(rooms), 'regions': list(regions)}
    if adjustment:
        out['adjustment'] = adjustment
    if floor:
        out['floor'] = floor
    return out


# ---- Regions, rooms, edges, walls -------------------------------------------------------------

def _floor(name, plan, W, D, choices):
    intent = plan['floors'][name]
    names = schema.labels(intent)
    rooms = {}
    for data in intent['rooms']:
        zone = ZONES[data['use']]
        if data['use'] == 'drawing':
            zone = 'public' if choices['drawingRoom'] == 'open' else 'private'
        rooms[data['id']] = Room(data, name, names[data['id']], zone)
    owner = {key: r.id for r in rooms.values() for key in r.regions}
    regions = []
    for key in schema.floor_regions(intent):
        x1, y1, x2, y2 = schema.region_rect_in(key, plan['plot']['widthIn'], plan['plot']['depthIn'])
        regions.append({'key': key, 'rect': (int(round(x1 * IN)), int(round(y1 * IN)), int(round(x2 * IN)), int(round(y2 * IN))),
                        'owner': owner.get(key)})
    rect_of = {r['key']: r['rect'] for r in regions}
    for room in rooms.values():
        room.polygon = union([rect_poly(rect_of[k]) for k in room.regions]).normalize()
    edges = _edges(regions, owner, rooms, W, D, choices)
    runs = _runs(edges)
    for run in runs:
        run['polygon'] = _run_polygon(run)
    walls = union([r['polygon'] for r in runs if r['polygon'] is not None])
    for room in rooms.values():
        room.clear = room.polygon.difference(walls) if room.indoor or room.zone == 'void' else room.polygon
        room.clear = shapely.set_precision(room.clear, 1).normalize()
    unassigned = [r for r in regions if r['owner'] is None]
    return {'name': name, 'label': FLOOR_NAMES[name], 'regions': regions, 'rooms': rooms, 'edges': edges,
            'runs': runs, 'walls': walls, 'unassigned': unassigned, 'doors': [], 'windows': [], 'fixtures': [],
            'stair': None, 'parapets': [], 'supports': [], 'roofBelow': [], 'openToSky': [], 'overhead': []}


def _edges(regions, owner, rooms, W, D, choices):
    """Every boundary segment, noded at every region corner (T-junctions of halves included)."""
    out = []
    for orient in ('v', 'h'):
        lines = {}
        for r in regions:
            x1, y1, x2, y2 = r['rect']
            if orient == 'v':
                lines.setdefault(x2, {'a': [], 'b': []})['a'].append((y1, y2, r['key']))
                lines.setdefault(x1, {'a': [], 'b': []})['b'].append((y1, y2, r['key']))
            else:
                lines.setdefault(y2, {'a': [], 'b': []})['a'].append((x1, x2, r['key']))
                lines.setdefault(y1, {'a': [], 'b': []})['b'].append((x1, x2, r['key']))
        for at in sorted(lines):
            sides = lines[at]
            cuts = sorted({v for lo, hi, _ in sides['a'] + sides['b'] for v in (lo, hi)})
            for lo, hi in zip(cuts, cuts[1:]):
                mid = (lo + hi) / 2
                ka = next((k for a, b, k in sides['a'] if a < mid < b), None)
                kb = next((k for a, b, k in sides['b'] if a < mid < b), None)
                limit = W if orient == 'v' else D
                site_a = ('left' if orient == 'v' else 'front') if at == 0 else None
                site_b = ('right' if orient == 'v' else 'back') if at == limit else None
                if ka is None and site_a is None or kb is None and site_b is None:
                    continue
                a = side_of(ka, owner, rooms, site_a)
                b = side_of(kb, owner, rooms, site_b)
                for side in (a, b):
                    if side['room'] and rooms[side['room']].use == 'drawing' and rooms[side['room']].zone == 'private':
                        side['drawing'] = True
                kind, reason, inward = decide(a, b, choices)
                out.append({'orient': orient, 'at': at, 'lo': lo, 'hi': hi, 'a': a, 'b': b,
                            'kind': kind, 'reason': reason, 'inward': inward})
    return out


def _runs(edges):
    """Collinear edges with the same kind and the same two owners, merged; stable ids."""
    runs = []
    key = lambda e: (e['orient'], e['at'], e['a']['room'] or e['a']['type'], e['b']['room'] or e['b']['type'],
                     e['kind'], e['reason'], e['inward'])
    for e in sorted(edges, key=lambda e: (e['orient'], e['at'], e['lo'])):
        last = runs[-1] if runs else None
        if last is not None and key(last['edges'][-1]) == key(e) and last['hi'] == e['lo']:
            last['hi'] = e['hi']
            last['edges'].append(e)
        else:
            runs.append({'orient': e['orient'], 'at': e['at'], 'lo': e['lo'], 'hi': e['hi'], 'a': e['a'], 'b': e['b'],
                         'kind': e['kind'], 'reason': e['reason'], 'inward': e['inward'], 'edges': [e]})
    for run in runs:
        ends = f"{run['orient']}:{run['at']}:{run['lo']}:{run['hi']}:{run['a']['room']}:{run['b']['room']}"
        run['id'] = 'w' + hashlib.sha1(ends.encode()).hexdigest()[:10]
        run['regionsA'] = sorted({e['a']['region'] for e in run['edges'] if e['a']['region']})
        run['regionsB'] = sorted({e['b']['region'] for e in run['edges'] if e['b']['region']})
        run['thickness'] = WALL_EXT if run['kind'] == 'exterior' else WALL_INT if run['kind'] == 'partition' else 0
    return runs


def _band(run):
    """(lo, hi) across the run occupied by its wall: exterior walls inside the indoor side, partitions centred."""
    at, t = run['at'], run['thickness']
    if run['kind'] == 'exterior':
        return (at, at + t) if run['inward'] == 'b' else (at - t, at)
    if run['kind'] == 'partition':
        return (at - t // 2, at + t // 2)
    return (at, at)


def _run_polygon(run, lo=None, hi=None):
    if run['kind'] not in ('exterior', 'partition'):
        return None
    lo = run['lo'] if lo is None else lo
    hi = run['hi'] if hi is None else hi
    c1, c2 = _band(run)
    return box(c1, lo, c2, hi) if run['orient'] == 'v' else box(lo, c1, hi, c2)


def _segment(run, lo, hi, across):
    """Plan points (u) along a run at the given offset across it."""
    if run['orient'] == 'v':
        return ((across, lo), (across, hi))
    return ((lo, across), (hi, across))


# ---- Stair core (§7.5) ------------------------------------------------------------------------

TWIN_W, TWIN_D = int(round(STAIR_TWIN[0] * U)), int(round(STAIR_TWIN[1] * U))   # 600 x 848 u
STRAIGHT_L, STRAIGHT_W = (RISERS - 1) * 10 * IN, int(FLIGHT * U)                 # 1200 x 288 u


def _overlap(a, b):
    """Axis-aligned rectangles (x1, y1, x2, y2) share interior area."""
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def _open_neighbours(floor, room):
    ids = set()
    for run in floor['runs']:
        if run['kind'] == 'open':
            a, b = run['a']['room'], run['b']['room']
            if a == room.id and b:
                ids.add(b)
            if b == room.id and a:
                ids.add(a)
    return [floor['rooms'][i] for i in sorted(ids)]


def _positions(lo, hi, size, step):
    if hi - lo < size:
        return []
    return sorted(set(range(lo, hi - size + 1, step)) | {hi - size})


def _core_options(host, zone_space):
    """Every lattice position (3-inch steps, and flush) of both stair types facing four ways.

    The core stays inside the host's clear room; its approach zone may use the floor of rooms
    open to the host (a stair hall open to the living hall is approached across it).
    Returns (kind, core, front, zone, back) for those that fit (one vectorised test each)."""
    clear = host.clear
    if clear.is_empty:
        return []
    x1, y1, x2, y2 = (int(v) for v in clear.bounds)
    step = 3 * IN
    rows = []
    for kind, (cw, cd) in (('dogleg', (TWIN_W, TWIN_D)), ('straight', (STRAIGHT_W, STRAIGHT_L))):
        for front in ('+y', '-y', '+x', '-x'):
            w, d = (cw, cd) if front in ('+y', '-y') else (cd, cw)
            for x in _positions(x1, x2, w, step):
                for y in _positions(y1, y2, d, step):
                    core = (x, y, x + w, y + d)
                    zone = _zone(core, front, ZONE)
                    back = _zone(core, {'+y': '-y', '-y': '+y', '+x': '-x', '-x': '+x'}[front], ZONE) if kind == 'straight' else zone
                    rows.append((kind, core, front, zone, back))
    if not rows:
        return []
    ok = _covers_all(clear, [r[1] for r in rows]) & _covers_all(zone_space, [r[3] for r in rows])
    return [r for r, fine in zip(rows, ok) if fine]


def _covers_all(shape, rects):
    arr = np.array(rects, dtype=float)
    return shapely.covers(shape, shapely.box(arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3]))


def _zone(core, front, depth):
    x1, y1, x2, y2 = core
    return {'+y': (x1, y2, x2, y2 + depth), '-y': (x1, y1 - depth, x2, y1),
            '+x': (x2, y1, x2 + depth, y2), '-x': (x1 - depth, y1, x1, y2)}[front]


def _entry_swings(floor, host, plot):
    """Swing squares of every place the host's entrance door could go (to a porch or garden, or the road at the gate)."""
    gate_c, gate_lo, gate_hi = _gate(plot)
    out = []
    for run in floor['runs']:
        if run['kind'] not in ('exterior', 'partition') or run['hi'] - run['lo'] < DOOR_EDGE:
            continue
        side = 'a' if run['a']['room'] == host.id else 'b' if run['b']['room'] == host.id else None
        if side is None:
            continue
        other = run['b'] if side == 'a' else run['a']
        window = None
        if other['type'] == 'room' and floor['rooms'][other['room']].outdoor:
            pass
        elif other['type'] == 'site' and other['site'] == 'front' and floor['name'] == 'ground':
            window = (gate_lo, gate_hi)
        else:
            continue
        for t in _door_positions(floor, run, DOOR_MAIN, window=window):
            out.append(_swing(run, t, DOOR_MAIN, side)[0])
    return out


def _stair(model, plan, notes):
    ground = model['floors']['ground']
    hosts = [r for r in ground['rooms'].values() if r.use in schema.STAIR_HOSTS['ground']]
    first = model['floors'].get('first')
    landing = [r for r in first['rooms'].values() if r.use in schema.STAIR_HOSTS['first']] if first else []
    if not hosts:
        if landing:
            notes.append(note('stair-missing', 'conflict', 'The 1F Stair Landing has no stair below it. '
                              'Place the Living Lobby + Staircase (or Dining + Staircase) on the ground floor under it.',
                              [landing[0].id], floor='ground'))
        elif model['storeys'] == 2 and first is not None and first['rooms']:
            notes.append(note('stair-missing', 'conflict', 'A two-storey house needs a staircase on the ground floor.', floor='ground'))
        return
    host = hosts[0]
    entry = _entry_point(ground, host, model['plot'])
    zone_space = union([host.clear] + [r.clear for r in _open_neighbours(ground, host) if r.indoor])
    swings = _entry_swings(ground, host, model['plot'])
    candidates = []
    for kind, core, front, zone, back in _core_options(host, zone_space):
        taken = (core, zone, back)
        door_ok = not swings or any(not any(_overlap(s, t) for t in taken) for s in swings)
        zc = ((zone[0] + zone[2]) / 2, (zone[1] + zone[3]) / 2)
        candidates.append((0 if door_ok else 1, 0 if kind == 'dogleg' else 1, round(math.dist(zc, entry)),
                           core, front, kind, zone, back))
    if not candidates:
        notes.append(note('stair-no-fit', 'conflict',
                          f'{host.label}: a 16-riser stair (6\'-3" x 8\'-10" dog-leg, or a 12\'-6" straight flight) '
                          'with 3\'-0" clear in front does not fit here.', [host.id], host.regions,
                          adjustment=_stair_adjustment(host, ground), floor='ground'))
        return
    candidates.sort(key=lambda c: c[:5])
    choice = candidates[0]
    aligned = None
    if landing:
        up = landing[0]
        arrival_space = union([up.clear] + [r.clear for r in _open_neighbours(first, up) if r.indoor])
        if not up.clear.is_empty:
            fits = _covers_all(up.clear, [c[3] for c in candidates]) & _covers_all(
                arrival_space, [c[7] if c[5] == 'straight' else c[6] for c in candidates])
            aligned = next((c for c, fine in zip(candidates, fits) if fine), None)
        if aligned is not None:
            choice = aligned
        else:
            missing = _uncovered(first, up, choice[3], choice[7] if choice[5] == 'straight' else choice[6])
            text = ' and '.join(where(k) for k in missing) or 'the cells over the stair'
            notes.append(note('stair-misaligned', 'conflict',
                              f'The stair rises at the same place on both floors; the 1F Stair Landing does not hold it. '
                              f'Assign {text} to the 1F Stair Landing.', [up.id], missing,
                              adjustment={'action': 'assign', 'floor': 'first', 'use': 'ff_stairLanding', 'regions': missing},
                              floor='first'))
    elif first is not None and first['rooms']:
        cells = sorted({r['key'] for r in first['regions'] if box(*r['rect']).intersection(box(*choice[3])).area > 0})
        notes.append(note('stair-landing-missing', 'conflict', 'Place the 1F Stair Landing over the stair: '
                          + ' and '.join(where(k) for k in cells) + '.', regions=cells,
                          adjustment={'action': 'assign', 'floor': 'first', 'use': 'ff_stairLanding', 'regions': cells},
                          floor='first'))
    if choice[0]:
        notes.append(note('stair-entrance', 'warning', f'{host.label}: the stair leaves no room for the entrance door to '
                          'swing clear of its approach; consider a larger stair hall.', [host.id], floor='ground'))
    _, _, _, core, front, kind, zone, back = choice
    stair = {'kind': kind, 'core': core, 'front': front, 'zone': zone, 'arrival': back if kind == 'straight' else zone,
             'host': host.id, 'risers': RISERS, 'riserIn': STOREY * 12 / RISERS, 'treadIn': TREAD * 12,
             'flightIn': FLIGHT * 12, 'aligned': aligned is not None}
    stair['fixture'] = _stair_fixture(stair)
    ground['stair'] = {**stair, 'role': 'start', 'room': host.id}
    if landing and aligned is not None:
        first['stair'] = {**stair, 'role': 'arrival', 'room': landing[0].id, 'opening': core}
    elif model['storeys'] == 1:
        ground['stair']['role'] = 'start-roof'


def _entry_point(floor, host, plot):
    """Where people reach the stair host from: its widest open edge, else its front-most edge."""
    best = None
    for run in floor['runs']:
        ids = (run['a']['room'], run['b']['room'])
        if host.id not in ids or run['kind'] not in ('open', 'partition', 'exterior'):
            continue
        other = run['b'] if run['a']['room'] == host.id else run['a']
        rank = 0 if run['kind'] == 'open' else 1 if other['zone'] in ('public', 'circulation', 'covered') else 2
        mid = ((run['at'], (run['lo'] + run['hi']) / 2) if run['orient'] == 'v' else ((run['lo'] + run['hi']) / 2, run['at']))
        key = (rank, -(run['hi'] - run['lo']), mid[1], mid[0])
        if best is None or key < best[0]:
            best = (key, mid)
    return best[1] if best else (plot['W'] / 2, 0)


def _uncovered(floor, room, *rects):
    keys = []
    target = union([box(*r) for r in rects])
    for region in floor['regions']:
        if region['owner'] != room.id and box(*region['rect']).intersection(target).area > 0:
            keys.append(region['key'])
    return sorted(keys)


def _stair_adjustment(host, floor):
    """Use both cells for the stair hall, or divide a cell: Stair | Dining (§7.5.2)."""
    neighbours = []
    for run in floor['runs']:
        ids = (run['a']['room'], run['b']['room'])
        if host.id in ids and run['kind'] in ('open', 'partition'):
            other = run['b'] if run['a']['room'] == host.id else run['a']
            if other['region']:
                neighbours.append(other['region'])
    if neighbours:
        key = sorted(set(neighbours))[0]
        return {'action': 'assign', 'floor': host.floor, 'use': host.use, 'regions': [key],
                'text': f'Use {where(key)} for the stair hall too.'}
    return None


def _stair_fixture(stair):
    """Treads, walking line and solids in feet, drawn by compass_furniture.draw_stair (16 risers)."""
    x1, y1, x2, y2 = (v / U for v in stair['core'])
    front = stair['front']
    if stair['kind'] == 'dogleg':
        side = {'+y': 'S', '-y': 'N', '+x': 'W', '-x': 'E'}[front]
        w, d = STAIR_TWIN
        item = furniture.Item('stair', w, d, front=FLIGHT, twin=True, along=False)
    else:
        side = {'-x': 'S', '+x': 'N', '+y': 'W', '-y': 'E'}[front]
        w, d = (RISERS - 1) * TREAD, FLIGHT
        item = furniture.Item('stair', w, d, front=FLIGHT, twin=False, along=True)
    return furniture.fixture(furniture.Frame(side, x1, y1, w, d), item)


# ---- Doors and access (§7.3) ------------------------------------------------------------------

DOOR_COST = 10


def _gate(plot):
    centre = plot['W'] * {'Left': .125, 'Center': .5, 'Right': .875}[plot['gate']]
    return centre, centre - plot['W'] / 8, centre + plot['W'] / 8


def _graph(floor, rooms, plot, name, blocked):
    """Rooms joined by open boundaries (free) and by walls long enough for a door (3'-8")."""
    graph: Dict[str, List[tuple]] = {rid: [] for rid, r in rooms.items() if r.zone != 'void'}
    graph['outside'] = []
    gate_c, gate_lo, gate_hi = _gate(plot)
    for run in floor['runs']:
        a, b = run['a'], run['b']
        length = run['hi'] - run['lo']
        if a['room'] and b['room'] and a['room'] != b['room']:
            ra, rb = rooms[a['room']], rooms[b['room']]
            if 'void' in (ra.zone, rb.zone):
                continue
            if run['kind'] in ('open', 'none'):
                graph[ra.id].append((rb.id, 0, run, 'open'))
                graph[rb.id].append((ra.id, 0, run, 'open'))
            elif run['kind'] in ('partition', 'exterior') and length >= DOOR_EDGE and run['reason'] != 'hygiene' \
                    and run['id'] not in blocked:
                graph[ra.id].append((rb.id, DOOR_COST, run, 'door'))
                graph[rb.id].append((ra.id, DOOR_COST, run, 'door'))
        if name == 'ground' and run['orient'] == 'h' and run['at'] == 0 and a['type'] == 'site' and b['room']:
            room = rooms[b['room']]
            lo, hi = max(run['lo'], gate_lo), min(run['hi'], gate_hi)
            if room.outdoor and hi - lo >= DOOR_ROOM:
                graph['outside'].append((room.id, 0, run, 'gate'))
            elif room.indoor and hi - lo >= DOOR_MAIN + 2 * JAMB and run['id'] not in blocked:
                graph['outside'].append((room.id, DOOR_COST + (0 if room.zone == 'public' else 5 * DOOR_COST), run, 'door'))
    return graph


def _doors(model, name, notes):
    """The access tree and its doors; a wall that cannot take a door is set aside and the tree replanned."""
    floor = model['floors'][name]
    rooms = floor['rooms']
    plot = model['plot']
    if name == 'ground':
        roots = ['outside']
    else:
        stair = floor.get('stair')
        roots = [stair['room']] if stair else [r.id for r in rooms.values() if r.use == 'ff_stairLanding'][:1]
    blocked_runs = set()
    for _ in range(len(rooms) + 2):
        graph = _graph(floor, rooms, plot, name, blocked_runs)
        parent = _tree(graph, rooms, roots)
        doors, failed = _assign_doors(floor, rooms, parent, plot, name)
        if not failed:
            break
        blocked_runs |= failed
    floor['doors'] = doors
    floor['access'] = {'roots': roots, 'reached': sorted(k for k in parent if k != 'outside'),
                       'setAside': sorted(blocked_runs)}
    for rid, prev in failed_rooms(parent, doors, rooms):
        notes.append(note('door-no-room', 'warning', f'{rooms[rid].label}: no clear position for a door; '
                          'check door swings and the stair.', [rid], floor=name))
    for door in doors:
        a, b = rooms.get(door['from']), rooms.get(door['to'])
        if a is not None and b is not None and a.zone == 'service' and b.zone == 'private':
            notes.append(note('route-kitchen', 'warning', f'{b.label} opens from the {a.label}; a Passage would give it '
                              'a quieter way in.', [b.id, a.id], floor=name))
    unreachable = sorted(rid for rid, r in rooms.items() if r.zone != 'void' and rid not in parent)
    for rid in unreachable:
        room = rooms[rid]
        adjustment = _reach_adjustment(floor, room, parent)
        why = 'from the entrance' if name == 'ground' else 'from the stair landing'
        notes.append(note('unreachable', 'infeasible', f'{room.label} cannot be reached {why} without passing through '
                          'a bedroom or bathroom, or through unassigned cells.'
                          + (f' {adjustment["text"]}' if adjustment else ''), [rid], room.regions, adjustment, floor=name))


def failed_rooms(parent, doors, rooms):
    """Rooms the tree reaches through a door that could not be placed (only after the replanning ran out)."""
    placed = {d['to'] for d in doors}
    for rid, (_, _, prev, run, how) in sorted(parent.items()):
        if rid != 'outside' and how == 'door' and rid not in placed:
            yield rid, prev


def _assign_doors(floor, rooms, parent, plot, name):
    gate_c, gate_lo, gate_hi = _gate(plot)
    blocked = []
    stair = floor.get('stair')
    if stair:
        blocked = [stair['core'], stair['zone']] + ([stair['arrival']] if stair.get('arrival') else [])
    main_child = None
    if name == 'ground':
        firsts = [(cost, rid) for rid, (cost, _, prev, _, how) in parent.items()
                  if rid != 'outside' and rooms[rid].indoor and (prev == 'outside' or (prev in rooms and rooms[prev].outdoor))
                  and how == 'door']
        main_child = min(firsts)[1] if firsts else None
    doors, swings, failed = [], [], set()
    for rid in sorted(parent, key=lambda k: (parent[k][0], parent[k][1], k)):
        if rid == 'outside':
            continue
        cost, hops, prev, run, how = parent[rid]
        if how != 'door' or run is None:
            continue
        room = rooms[rid]
        parent_room = rooms.get(prev)
        if prev == 'outside' or (rid == main_child and parent_room is not None and parent_room.outdoor):
            dtype = 'main' if rid == main_child else 'exterior'
        elif room.outdoor or (parent_room is not None and parent_room.outdoor):
            dtype = 'exterior'
        elif room.zone == 'wet' or (parent_room is not None and parent_room.zone == 'wet'):
            dtype = 'bath'
        else:
            dtype = 'internal'
        width = DOOR_MAIN if dtype == 'main' else DOOR_ROOM
        # Into the room entered; a bathroom door opens out for assisted access; doors to a garden open in.
        swing_room = rid
        if room.zone == 'wet' and parent_room is not None:
            swing_room = prev
        if room.outdoor and parent_room is not None and parent_room.indoor:
            swing_room = prev
        flip = dtype in ('bath', 'internal')
        window = (gate_lo, gate_hi) if prev == 'outside' else None
        door = _place_door(floor, run, width, swing_room, swings, blocked, flip,
                           near=gate_c if prev == 'outside' else None, window=window)
        if door is None:
            failed.add(run['id'])
            continue
        door.update({'from': prev, 'to': rid, 'type': dtype,
                     'tag': {'main': 'D', 'internal': 'D1', 'bath': 'D2', 'exterior': 'D3'}[dtype]})
        doors.append(door)
        swings.append(door['swingRect'])
    return doors, failed


def _tree(graph, rooms, roots):
    """Dijkstra from the roots with privacy: no route continues through a bedroom or bathroom.

    Costs (§7.3, in tenths): an open boundary 0, a door 10, a bedroom or bathroom door from a
    passage or landing 9 (a corridor is the better way in), into a bedroom from the kitchen 100,
    from the garden 130. Ties: an open way in before a new door, then hops, then room id.
    Returns {room: (cost, hops, previous, run, how)}.
    """
    best = {}
    # At equal cost a room is entered through an open boundary rather than a new door
    # (a stair hall open to the living hall needs no door of its own from the porch).
    heap = [(0, 0, 0, r, None, None, None) for r in roots if r in graph]
    heapq.heapify(heap)
    while heap:
        cost, _new_door, hops, node, prev, run_id, how = heapq.heappop(heap)
        if node in best:
            continue
        run = None
        if prev is not None:
            run = next(r for n, _, r, h in graph[prev] if n == node and r['id'] == run_id and h == how)
        best[node] = (cost, hops, prev, run, how)
        here = rooms.get(node)
        if here is not None and here.zone == 'wet' and node not in roots:
            continue            # Nothing continues from a bathroom.
        for nxt, step, run, how2 in sorted(graph.get(node, []), key=lambda e: (e[0], e[2]['id'], e[3])):
            if nxt in best:
                continue
            target = rooms.get(nxt)
            if here is not None and here.zone == 'private' and node not in roots:
                # Only an attached bathroom or balcony continues from a bedroom.
                if target is None or not (target.zone == 'wet' or target.outdoor):
                    continue
            extra = 0
            if how2 == 'door' and here is not None and here.zone == 'circulation' and target is not None \
                    and target.zone in ('private', 'wet'):
                extra = -1      # A passage is the better way into a bedroom or bathroom.
            if here is not None and here.zone == 'service' and target is not None and target.zone == 'private':
                extra = 9 * DOOR_COST
            if target is not None and target.outdoor and here is not None and here.zone == 'private':
                extra = 2 * DOOR_COST       # A bedroom's own balcony, only when nothing else reaches it.
            if here is not None and here.outdoor and target is not None and target.zone == 'private':
                extra = 12 * DOOR_COST      # A bedroom entered from the garden: only when even the kitchen cannot.
            heapq.heappush(heap, (cost + step + extra, 0 if how2 in ('open', 'gate') else 1, hops + 1, nxt, node, run['id'], how2))
    return best


def _free_spans(floor, run):
    """The parts of a run's length that no other wall crosses (a door keeps clear of them)."""
    c1, c2 = _band(run)
    band = box(c1, run['lo'], c2, run['hi']) if run['orient'] == 'v' else box(run['lo'], c1, run['hi'], c2)
    spans = [(run['lo'], run['hi'])]
    for other in floor['runs']:
        if other is run or other['polygon'] is None:
            continue
        hit = band.intersection(other['polygon'])
        if hit.is_empty or hit.area <= 0:
            continue
        bx1, by1, bx2, by2 = hit.bounds
        spans = _subtract(spans, (by1, by2) if run['orient'] == 'v' else (bx1, bx2))
    return spans


def _door_positions(floor, run, width, near=None, window=None):
    """First 4 in from the start, 4 in from the end, then centred, per clear span (nearest `near` first)."""
    out = []
    for a, b in _free_spans(floor, run):
        if window is not None:
            a, b = max(a, window[0]), min(b, window[1])
        if b - a < width + 2 * JAMB:
            continue
        options = [a + JAMB, b - JAMB - width, (a + b - width) // 2]
        if near is not None:
            options.append(min(max(near - width / 2, a + JAMB), b - JAMB - width))
        for t in options:
            t = int(round(t / IN)) * IN
            t = min(max(t, int(math.ceil((a + JAMB) / IN)) * IN), int((b - JAMB - width) // IN) * IN)
            if t not in out and a + JAMB <= t and t + width <= b - JAMB:
                out.append(t)
    if near is not None:
        out.sort(key=lambda t: (abs(t + width / 2 - near), t))
    return out


def _swing(run, t, width, side):
    """The square a door leaf sweeps on one side of its wall: (rect, face, sign)."""
    c1, c2 = _band(run)
    face = c2 if side == 'b' else c1
    sign = 1 if side == 'b' else -1
    a, b = sorted((face, face + sign * width))
    rect = (a, t, b, t + width) if run['orient'] == 'v' else (t, a, t + width, b)
    return rect, face, sign


def _place_door(floor, run, width, swing_room, swings, blocked, flip, near=None, window=None):
    """The first position whose swing stays clear of other swings and the stair (core and its zones)."""
    prefer = 'b' if run['b']['room'] == swing_room else 'a'
    sides = [prefer] + ([{'a': 'b', 'b': 'a'}[prefer]] if flip else [])
    for t in _door_positions(floor, run, width, near=near, window=window):
        for side in sides:
            rect, face, sign = _swing(run, t, width, side)
            if any(_overlap(rect, other) for other in swings + blocked):
                continue
            room = run[side]['room']
            return _door_geometry(run, t, width, side, face, sign, rect, room)
    return None


def _door_geometry(run, t, width, swing_side, face, sign, rect, swing_room):
    lo, hi = run['lo'], run['hi']
    near_start = (t - lo) <= (hi - (t + width))
    along_hinge, along_strike = (t, t + width) if near_start else (t + width, t)
    if run['orient'] == 'v':
        hinge, strike = (face, along_hinge), (face, along_strike)
        leaf = (face + sign * width, along_hinge)
        normal = (sign, 0)
    else:
        hinge, strike = (along_hinge, face), (along_strike, face)
        leaf = (along_hinge, face + sign * width)
        normal = (0, sign)
    start = math.atan2(strike[1] - hinge[1], strike[0] - hinge[0])
    end = math.atan2(leaf[1] - hinge[1], leaf[0] - hinge[0])
    sweep = (end - start + math.pi) % math.tau - math.pi
    arc = [(hinge[0] + width * math.cos(start + sweep * i / 24), hinge[1] + width * math.sin(start + sweep * i / 24)) for i in range(25)]
    c1, c2 = _band(run)
    return {'run': run['id'], 'orient': run['orient'], 'at': run['at'], 'lo': t, 'hi': t + width, 'band': (c1, c2),
            'width': width, 'hinge': hinge, 'strike': strike, 'leaf': leaf, 'arc': arc, 'normal': normal,
            'swingRoom': swing_room, 'swingRect': rect, 'swingZone': box(*rect), 'span': _segment(run, t, t + width, run['at'])}


def _reach_adjustment(floor, room, reached):
    """A bounded search: one unassigned neighbour as a Passage, or one neighbouring cell divided Room | Passage."""
    rooms = floor['rooms']
    owner = {r['key']: r['owner'] for r in floor['regions']}
    reachable = {rid for rid in reached if rid in rooms and rooms[rid].zone in ('public', 'circulation', 'service', 'covered', 'open')}
    for region in floor['regions']:
        if region['owner'] is not None:
            continue
        key = region['key']
        touches_room = any(schema.regions_touch(key, k) for k in room.regions)
        touches_reach = any(schema.regions_touch(key, k) for rid in reachable for k in rooms[rid].regions)
        if touches_room and touches_reach:
            return {'action': 'assign', 'floor': floor['name'], 'use': 'passage', 'regions': [key],
                    'text': f'Assign {where(key)} as a Passage to reach {room.label}.'}
    for region in floor['regions']:
        key = region['key']
        if '.' in key or region['owner'] in (None, room.id):
            continue
        blocker = rooms[region['owner']]
        if blocker.zone not in ('private', 'wet'):
            continue
        for half in ('L', 'R', 'T', 'B'):
            passage = f'{key}.{half}'
            keep = f'{key}.{ {"L": "R", "R": "L", "T": "B", "B": "T"}[half] }'
            touches_room = any(schema.regions_touch(passage, k) for k in room.regions)
            touches_reach = any(schema.regions_touch(passage, k) for rid in reachable for k in rooms[rid].regions)
            if touches_room and touches_reach:
                sides = {'L': 'left', 'R': 'right', 'T': 'top', 'B': 'bottom'}
                return {'action': 'split', 'floor': floor['name'], 'cell': key,
                        **({'direction': 'top-bottom'} if half in ('T', 'B') else {}),
                        'halves': {half: 'passage', keep[-1]: blocker.use},
                        'text': f'Divide {where(key)}: {sides[keep[-1]]} half {blocker.label}, '
                                f'{sides[half]} half Passage, to reach {room.label}.'}
    return None


# ---- Windows (§7.4) --------------------------------------------------------------------------

def _exposed(model, floor, run, room_side):
    """Whether an exterior run of a room faces open air a window may use, and why."""
    plot = model['plot']
    other = run['b'] if room_side == 'a' else run['a']
    if other['type'] == 'site':
        site = other['site']
        if site in ('front', 'back'):
            return True
        if plot['plotType'] == 'Independent':
            return True
        if plot.get('secondRoad', '').lower() == site:
            return True
        return bool(plot.get('sidesOpen', {}).get(site))
    region = next(r for r in floor['regions'] if r['key'] == other['region'])
    x1, y1, x2, y2 = region['rect']
    depth = (x2 - x1) if run['orient'] == 'v' else (y2 - y1)
    if other['type'] == 'unassigned' and floor['name'] == 'first':
        return True                      # Upstairs, an unbuilt cell is roof or sky.
    return depth >= OPEN_DEPTH


def _windows(model, name, notes):
    floor = model['floors'][name]
    rooms = floor['rooms']
    doors_by_run: Dict[str, List[dict]] = {}
    for door in floor['doors']:
        doors_by_run.setdefault(door['run'], []).append(door)
    for room in sorted(rooms.values(), key=lambda r: r.id):
        if not room.indoor:
            continue
        kind = room.kind
        vent = kind == 'bath'
        width_ft, cap = (2, 1) if vent else WINDOWS.get(kind, (4, 2))
        width = width_ft * U
        exposed = []
        for run in floor['runs']:
            if run['kind'] != 'exterior':
                continue
            side = 'a' if run['a']['room'] == room.id else 'b' if run['b']['room'] == room.id else None
            if side is None or side != run['inward']:
                continue
            if _exposed(model, floor, run, side):
                exposed.append(run)
        exposed.sort(key=lambda r: (-(r['hi'] - r['lo']), r['orient'], r['at'], r['lo']))
        placed = []
        for run in exposed:
            if len(placed) >= cap:
                break
            free = [(run['lo'] + WINDOW_END, run['hi'] - WINDOW_END)]
            for door in doors_by_run.get(run['id'], []):
                free = _subtract(free, (door['lo'] - U, door['hi'] + U))
            length = run['hi'] - run['lo']
            pair = not vent and length >= 2 * width + 7 * U and cap - len(placed) >= 2
            targets = [run['lo'] + length / 4, run['lo'] + 3 * length / 4] if pair else [(run['lo'] + run['hi']) / 2]
            for target in targets:
                if len(placed) >= cap:
                    break
                fits = [(a, b) for a, b in free if b - a >= width]
                w = width
                if not fits:
                    if not free:
                        continue
                    a, b = max(free, key=lambda s: s[1] - s[0])
                    w = (b - a) // U * U
                    if w < 2 * U:
                        continue
                    fits = [(a, b)]
                a, b = min(fits, key=lambda s: 0 if s[0] <= target <= s[1] else min(abs(target - s[0]), abs(target - s[1])))
                centre = min(max(target, a + w / 2), b - w / 2)
                lo = int(round((centre - w / 2) / IN)) * IN
                window = _window(run, lo, lo + w, 'ventilator' if vent else 'window', room)
                placed.append(window)
                free = _subtract(free, (lo - WINDOW_END, lo + w + WINDOW_END))
        floor['windows'].extend(placed)
        if not placed and kind in HABITABLE:
            notes.append(note('no-window', 'warning', f'{room.label}: no outside wall for a window here; plan a ventilation '
                              'shaft or a skylight.', [room.id], floor=name))
        elif not placed and vent:
            notes.append(note('no-ventilator', 'warning', f'{room.label}: no outside wall for a ventilator; plan an exhaust duct.',
                              [room.id], floor=name))
    widths = sorted({w['width'] for w in floor['windows'] if w['kind'] == 'window'}, reverse=True)
    for w in floor['windows']:
        if w['kind'] == 'window':
            rank = widths.index(w['width'])
            w['tag'] = 'W' if rank == 0 else f'W{rank}'


def _subtract(spans, cut):
    lo, hi = cut
    return [(x, y) for a, b in spans for x, y in ((a, min(b, lo)), (max(a, hi), b)) if y - x > 0]


def _window(run, lo, hi, kind, room, sill=None, head=None):
    c1, c2 = _band(run)
    outer = run['at']
    outward = -1 if (c1 >= outer and c2 > outer) else 1     # Exterior walls sit inside: the outside is the other way.
    if run['orient'] == 'v':
        normal = (outward, 0)
    else:
        normal = (0, outward)
    if kind == 'ventilator':
        sill, head = VENT_SILL, VENT_HEAD
    elif kind == 'window':
        sill, head = WINDOW_SILL, WINDOW_HEAD
    return {'run': run['id'], 'orient': run['orient'], 'at': run['at'], 'lo': lo, 'hi': hi, 'band': (c1, c2),
            'width': hi - lo, 'kind': kind, 'tag': 'V' if kind == 'ventilator' else 'W', 'room': room.id,
            'sill': sill, 'head': head, 'normal': normal, 'span': _segment(run, lo, hi, run['at'])}


# ---- Double height (§7.7), upper floor and supports (§7.6) ------------------------------------

def _void(model, notes):
    ground, first = model['floors']['ground'], model['floors']['first']
    voids = [r for r in first['rooms'].values() if r.zone == 'void']
    if not voids:
        return
    plot = model['plot']
    for void in voids:
        below = [r for r in ground['rooms'].values() if r.polygon.intersection(void.polygon).area > 0]
        for room in below:
            if room.zone == 'public':
                room.double_height = True
        ground['overhead'].append({'room': void.id, 'polygon': void.polygon})
        if any(k.endswith(('.L', '.R')) for k in void.regions) and plot['W'] < 30 * U:
            notes.append(note('narrow-void', 'warning', 'A half-cell double height on a plot under 30 ft is very narrow.',
                              [void.id], void.regions, floor='first'))
        elif any(k.endswith(('.T', '.B')) for k in void.regions) and min(plot['W'] / 4, plot['D'] / 8) < 3.75 * U:
            notes.append(note('narrow-void', 'warning', 'A top/bottom half-cell double height is very narrow on this plot.',
                              [void.id], void.regions, floor='first'))
        # Tall glazing on the void's outer edges, continued down the ground-floor facade below.
        for run in first['runs']:
            if run['reason'] != 'double-height':
                continue
            ids = (run['a']['room'], run['b']['room'])
            if void.id not in ids:
                continue
            lo, hi = run['lo'] + WINDOW_END, run['hi'] - WINDOW_END
            if hi - lo < 2 * U:
                continue
            first['windows'].append({**_window(run, lo, hi, 'tall', void, 1.5, STOREY + WINDOW_HEAD + .5),
                                     'tag': 'T', 'doubleHeight': True})
            for low in ground['runs']:
                if low['kind'] == 'exterior' and low['orient'] == run['orient'] and low['at'] == run['at'] \
                        and low['lo'] <= lo and hi <= low['hi'] and low['inward'] == run['inward']:
                    holder = ground['rooms'].get(low[low['inward']]['room'])
                    if holder is None or not holder.double_height:
                        continue
                    ground['windows'] = [w for w in ground['windows'] if not (w['run'] == low['id'] and w['hi'] > lo and w['lo'] < hi)]
                    ground['windows'].append({**_window(low, lo, hi, 'tall', holder, 1.5, STOREY + WINDOW_HEAD + .5),
                                              'tag': 'T', 'doubleHeight': True})
    # The void must not cut the first floor's circulation (checked on the graph without the void).
    reached = set(first.get('access', {}).get('reached', []))
    cut = [r for r in first['rooms'].values() if r.zone != 'void' and r.id not in reached]
    if cut and first.get('stair'):
        for void in voids:
            adjustment = _void_split_adjustment(model, void, cut)
            if adjustment:
                notes.append(note('void-cuts-route', 'conflict', 'The double-height space cuts the first floor in two. '
                                  + adjustment['text'], [void.id] + [r.id for r in cut], void.regions, adjustment, floor='first'))
                break
    notes.append(note('double-height', 'info', 'Double height: the slab opening and its edge beams are not designed. '
                      'A double-height space joins the floors for smoke and sound; check local fire and acoustic rules.',
                      [v.id for v in voids], floor='first'))
    tall = [w for w in first['windows'] if w['kind'] == 'tall']
    hot = []
    for w in tall:
        facing = _facing_of(w['normal'], plot['facing'])
        if facing in ('West', 'South'):
            hot.append(facing)
    if hot:
        notes.append(note('heat-gain', 'info', f'Tall glazing facing {" and ".join(sorted(set(hot)))} gains heat; '
                          'plan shading or a deep overhang.', floor='first'))


def _facing_of(normal, plot_facing):
    """Compass direction of an outward plan normal."""
    nx, ny = north_vector(plot_facing)
    ex, ey = ny, -nx                     # East is north turned clockwise in plan coordinates.
    dot_n = normal[0] * nx + normal[1] * ny
    dot_e = normal[0] * ex + normal[1] * ey
    if abs(dot_n) >= abs(dot_e):
        return 'North' if dot_n > 0 else 'South'
    return 'East' if dot_e > 0 else 'West'


def _void_split_adjustment(model, void, cut):
    """Divide a void cell into Open to below | Passage so the cut rooms are reached (bounded: two options per cell)."""
    first = model['floors']['first']
    rooms = first['rooms']
    reached = [rooms[k] for k in first['access']['reached'] if k in rooms]
    for key in sorted(void.regions):
        if '.' in key:
            continue
        for half in ('R', 'L', 'T', 'B'):
            passage = f'{key}.{half}'
            other = {'L': 'R', 'R': 'L', 'T': 'B', 'B': 'T'}[half]
            joins_cut = any(schema.regions_touch(passage, k) for r in cut for k in r.regions)
            joins_reach = any(schema.regions_touch(passage, k) for r in reached if r.zone in ('public', 'circulation') for k in r.regions)
            if joins_cut and joins_reach:
                sides = {'L': 'left', 'R': 'right', 'T': 'top', 'B': 'bottom'}
                return {'action': 'split', 'floor': 'first', 'cell': key, 'halves': {other: 'void', half: 'passage'},
                        **({'direction': 'top-bottom'} if half in ('T', 'B') else {}),
                        'text': f'Divide {where(key)}: {sides[other]} half Open to below, {sides[half]} half Passage.'}
    return None


def _upper(model, notes):
    """Columns under overhangs, roof below / open to sky, parapets on terraces (§7.6)."""
    ground, first = model['floors']['ground'], model['floors']['first']
    indoor_below = union([r.polygon for r in ground['rooms'].values() if r.indoor])
    for region in first['unassigned']:
        poly = box(*region['rect'])
        (first['roofBelow'] if indoor_below.intersection(poly).area >= poly.area - 1 else first['openToSky']).append(region['key'])
    columns = []
    for room in sorted(first['rooms'].values(), key=lambda r: r.id):
        if not room.indoor:
            continue
        over = room.polygon.difference(indoor_below)
        for part in parts(over):
            if part.geom_type != 'Polygon' or part.area <= 0:
                continue
            x1, y1, x2, y2 = part.bounds
            if min(x2 - x1, y2 - y1) < OVERHANG:
                continue
            for cx, cy in sorted(set(part.exterior.coords)):
                corner = Point(cx, cy)
                if indoor_below.distance(corner) < 1:
                    continue
                if not room.polygon.covers(corner):
                    continue
                sx = 1 if cx <= (x1 + x2) / 2 else -1
                sy = 1 if cy <= (y1 + y2) / 2 else -1
                col = (min(cx, cx + sx * COLUMN), min(cy, cy + sy * COLUMN), max(cx, cx + sx * COLUMN), max(cy, cy + sy * COLUMN))
                columns.append({'rect': tuple(int(v) for v in col), 'room': room.id})
        if any(p.area > 0 for p in parts(over)):
            notes.append(note('support', 'warning', f'{room.label} stands over open ground: support is not designed; '
                              'an engineer must confirm columns and beams.', [room.id], floor='first'))
    uniq = {}
    for col in columns:
        uniq.setdefault(col['rect'], col)
    first['supports'] = [uniq[k] for k in sorted(uniq)]
    ground['supports'] = list(first['supports'])
    for run in first['runs']:
        for side, other in ((run['a'], run['b']), (run['b'], run['a'])):
            if not side['room'] or not first['rooms'][side['room']].outdoor:
                continue
            drop = other['type'] == 'site' or (other['type'] == 'unassigned' and other['region'] in first['openToSky'])
            if drop:
                first['parapets'].append({'run': run['id'], 'orient': run['orient'], 'at': run['at'], 'lo': run['lo'],
                                          'hi': run['hi'], 'inward': 'b' if side is run['b'] else 'a', 'room': side['room']})


# ---- Fixtures and labels ---------------------------------------------------------------------

def _wall_sides(room, floor):
    """Intervals (feet) of each side of a room's main rectangle that are real wall faces."""
    rect = largest_rect(room.clear)
    if rect is None:
        return None, {}
    x1, y1, x2, y2 = rect
    walls = floor['walls']
    sides = {'S': ((x1, y1), (x2, y1), (0, -1)), 'N': ((x1, y2), (x2, y2), (0, 1)),
             'W': ((x1, y1), (x1, y2), (-1, 0)), 'E': ((x2, y1), (x2, y2), (1, 0))}
    out = {}
    for side, (a, b, (nx, ny)) in sides.items():
        probe = LineString([(a[0] + nx * 4, a[1] + ny * 4), (b[0] + nx * 4, b[1] + ny * 4)])
        hit = probe.intersection(walls)
        spans = []
        for piece in parts(hit):
            if piece.geom_type != 'LineString' or piece.length < 2:
                continue
            values = sorted((p[0] if side in 'SN' else p[1]) for p in piece.coords)
            spans.append((values[0] / U, values[-1] / U))
        out[side] = sorted(spans)
    return tuple(v / U for v in rect), out


def _fixtures(model, name, notes):
    floor = model['floors'][name]
    to_ft = lambda p: (p[0] / U, p[1] / U)
    for room in sorted(floor['rooms'].values(), key=lambda r: r.id):
        room.fixtures = []
        room.turning = None
        if room.clear.is_empty or room.zone == 'void':
            continue
        shape = _scale(room.clear, 1 / U)
        rect, walls = _wall_sides(room, floor)
        if rect is None:
            continue
        doors = [{'a': to_ft(d['span'][0]), 'b': to_ft(d['span'][1])} for d in floor['doors'] if room.id in (d['from'], d['to'])]
        windows = [{'a': to_ft(w['span'][0]), 'b': to_ft(w['span'][1])} for w in floor['windows'] if w['room'] == room.id]
        state = furniture.Room(shape, rect, doors, windows, inset=1 / 12, walls=walls if room.indoor else None)
        items = []
        stair = floor.get('stair')
        if stair and stair.get('room') == room.id:
            fixture = stair['fixture']
            items.append(fixture)
            core = tuple(v / U for v in stair['core'])
            zones = [tuple(v / U for v in stair['zone'])] + ([tuple(v / U for v in stair['arrival'])] if stair.get('arrival') else [])
            state.placed.append((core, core))
            for z in zones:
                state.placed.append((z, z))
        kinds = [k for k in room.kinds if k not in ('stair', 'lobby', 'passage')]
        if room.outdoor and name == 'first':
            kinds = [k for k in kinds if k == 'balcony']
        try:
            items.extend(furniture.furnish(kinds, shape, rect, doors, windows, state))
        except Exception:                       # Furniture is illustrative; a room never fails because of it.
            pass
        for item in items:
            item['roomId'] = room.id
        room.fixtures = items
        room.turning = getattr(state, 'turning', None)
        floor['fixtures'].extend(items)


def _scale(geom, factor):
    return shapely.transform(geom, lambda c: c * factor)


def geometry_parts_polygons(geom):
    return [g for g in parts(geom) if g.geom_type == 'Polygon' and not g.is_empty]


def _entry_marks(floor):
    """Where the ENTRY arrow and its word stand, outside the main door (feet)."""
    marks = []
    for door in floor['doors']:
        if door['type'] != 'main':
            continue
        (ax, ay), (bx, by) = door['span']
        nx, ny = door['normal']
        mx, my = (ax + bx) / 2 / U, (ay + by) / 2 / U
        ux, uy = (bx - ax) / door['width'], (by - ay) / door['width']
        corners = [(mx - ux * 2.4 - nx * .2, my - uy * 2.4 - ny * .2), (mx + ux * 2.4 - nx * .2, my + uy * 2.4 - ny * .2),
                   (mx + ux * 2.4 - nx * 4.4, my + uy * 2.4 - ny * 4.4), (mx - ux * 2.4 - nx * 4.4, my - uy * 2.4 - ny * 4.4)]
        marks.append(Polygon(corners))
    return marks


LOW_FIXTURES = frozenset({'dining', 'coffee-table'})   # A name may stand over these on its halo.


def _best_label_rect(region):
    best = None
    for p in parts(region):
        if p.geom_type != 'Polygon':
            continue
        xs = sorted({v[0] for v in p.exterior.coords}); ys = sorted({v[1] for v in p.exterior.coords})
        spans = list(islice(product(sorted(combinations(xs, 2), key=lambda v: v[0] - v[1]),
                                    sorted(combinations(ys, 2), key=lambda v: v[0] - v[1])), 2048))
        if not spans:
            continue
        arr = np.array([(x1, y1, x2, y2) for (x1, x2), (y1, y2) in spans])
        inside = shapely.covers(p, shapely.box(arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3]))
        for (x1, y1, x2, y2), ok in zip(arr.tolist(), inside):
            if ok:
                score = min((x2 - x1) / 2, y2 - y1) ** 2 * ((x2 - x1) * (y2 - y1)) ** .15
                if best is None or score > best[0]:
                    best = (score, (x1, y1, x2, y2))
    return best


def _labels(model, name):
    """A clear rectangle for each room's name: inside the clear room, off fixtures, door swings and the
    ENTRY mark. When that leaves only a sliver, the name may stand over a dining or coffee table (on
    its halo), never over the stair, a bed, a sofa, a counter or a fitting."""
    floor = model['floors'][name]
    marks = _entry_marks(floor)
    for room in floor['rooms'].values():
        base = _scale(room.clear, 1 / U).buffer(-.35, join_style=2)
        for mark in marks:
            base = base.difference(mark)
        for door in floor['doors']:
            if door['swingRoom'] == room.id:
                base = base.difference(_scale(door['swingZone'], 1 / U))
        strict, relaxed = base, base
        for fixture in getattr(room, 'fixtures', []):
            keep_out = box(*fixture['bounds']).buffer(.3, join_style=2)
            strict = strict.difference(keep_out)
            if fixture['kind'] not in LOW_FIXTURES:
                relaxed = relaxed.difference(keep_out)
        best = _best_label_rect(strict)
        if fixture_count := len(getattr(room, 'fixtures', [])):
            loose = _best_label_rect(relaxed)
            if loose is not None and (best is None or loose[0] > 2.5 * best[0]):
                best = loose
        if best is None:
            clear = _scale(room.clear if not room.clear.is_empty else room.polygon, 1 / U)
            polys = geometry_parts_polygons(clear)
            point = polylabel(max(polys, key=lambda g: g.area), tolerance=.25) if polys else clear.representative_point()
            best = (0, (point.x - .5, point.y - .5, point.x + .5, point.y + .5))
        room.label_box = best[1]


# ---- Notes, checks, hash ---------------------------------------------------------------------

def clear_size(room):
    """Clear width x depth in feet for a rectangular room, else None."""
    if room.clear.is_empty or abs(room.clear.area - room.clear.envelope.area) > 1:
        return None
    x1, y1, x2, y2 = room.clear.bounds
    return ((x2 - x1) / U, (y2 - y1) / U)


def _room_notes(model, name, notes):
    floor = model['floors'][name]
    for room in sorted(floor['rooms'].values(), key=lambda r: r.id):
        need = MIN_CLEAR.get(room.kind)
        if need is None or room.clear.is_empty:
            continue
        rect = largest_rect(room.clear)
        if rect is None:
            continue
        short = min(rect[2] - rect[0], rect[3] - rect[1]) / U
        if short + 1e-9 < need:
            adjustment = None
            if any('.' in k for k in room.regions):
                cell = schema.cell_of(sorted(k for k in room.regions if '.' in k)[0])
                adjustment = {'action': 'whole-cell', 'floor': name, 'cell': cell, 'use': room.use,
                              'text': f'Use the whole of {where(cell)} for {room.label}.'}
            noun = KIND_NOUNS.get(room.kind, room.kind)
            notes.append(note('size-short', 'conflict', f'{room.label} is {ft_in(short)} clear at its narrowest; '
                              f'a {noun} needs at least {ft_in(need)}.',
                              [room.id], room.regions, adjustment, floor=name))
        elif room.kind == 'passage' and short + 1e-9 < PASSAGE_ROUTE:
            notes.append(note('passage-narrow', 'warning', f'{room.label} is {ft_in(short)} clear at its narrowest: '
                              f'enough to walk, but narrower than the {ft_in(PASSAGE_ROUTE)} planned for a wheelchair '
                              'route. Check local accessibility rules.', [room.id], room.regions, floor=name))


def _general_notes(model, notes):
    ground = model['floors']['ground']
    if any(r['reason'] == 'kitchen-open' for f in model['floors'].values() for r in f['runs']):
        notes.append(note('open-kitchen', 'info', 'Open kitchen: confirm exhaust, ventilation and gas safety locally.'))
    if ground.get('stair') and any(r['kind'] == 'open' and ground['stair']['room'] in (r['a']['room'], r['b']['room'])
                                   for r in ground['runs']):
        notes.append(note('open-stair', 'info', 'Open stair: check its guard and fire-escape requirements locally.'))
    drawing = [r for r in ground['rooms'].values() if r.use == 'drawing']
    living = [r for r in ground['rooms'].values() if r.use in ('living', 'staircase', 'dining')]
    if drawing and 'drawingRoom' not in model['asked'] and any(
            run['kind'] in ('open', 'partition') and {run['a']['room'], run['b']['room']} & {d.id for d in drawing}
            and {run['a']['room'], run['b']['room']} & {r.id for r in living} for run in ground['runs']):
        notes.append(note('default-drawing', 'info', 'The drawing room is drawn open to the living hall (the default). '
                          'Answer "separate" to give it walls and a door.', [d.id for d in drawing], floor='ground'))
    if model['plot']['plotType'] == 'Middle Plot' and 'sidesOpen' not in model['plot']:
        notes.append(note('default-sides', 'info', 'Side boundaries are taken as neighbours\' walls (the default): '
                          'no windows on the left and right sides.'))
    for name, floor in model['floors'].items():
        if floor['unassigned']:
            notes.append(note('unassigned', 'info', f'{FLOOR_NAMES[name]}: {len(floor["unassigned"])} map regions are '
                              'unassigned; they are not treated as corridors.', regions=[r['key'] for r in floor['unassigned']],
                              floor=name))
    if model['storeys'] == 1 and ground.get('stair'):
        notes.append(note('roof-access', 'info', f'The stair continues to the roof under a {ft_in(MUMTY)} headroom cabin (mumty).'))
    notes.append(note('preliminary', 'info', 'Preliminary concept · not structurally verified · not for construction. '
                      'Verify with a licensed architect and engineer.'))


def _checks(model):
    """Named invariants (§4.6 layers 2-4, §11) as pass/fail."""
    out = {}
    W, D = model['plot']['W'], model['plot']['D']
    for name, floor in model['floors'].items():
        area = sum((r['rect'][2] - r['rect'][0]) * (r['rect'][3] - r['rect'][1]) for r in floor['regions'])
        out[f'{name}:partition'] = area == W * D and union([box(*r['rect']) for r in floor['regions']]).area == W * D
        sides_ok = all(e['a'] is not None and e['b'] is not None for e in floor['edges'])
        out[f'{name}:noding'] = sides_ok
        walls = floor['walls']
        clear = sum(r.clear.area for r in floor['rooms'].values() if r.indoor or r.zone == 'void')
        outdoor = sum(r.polygon.area for r in floor['rooms'].values() if r.outdoor)
        unassigned = sum(box(*r['rect']).area for r in floor['unassigned'])
        out[f'{name}:lost-area'] = abs(clear + walls.area + outdoor + unassigned - W * D) < 1
        out[f'{name}:no-slivers'] = all(r['hi'] - r['lo'] >= 3 * IN for r in floor['runs'] if r['polygon'] is not None)
        out[f'{name}:walls-inside-plot'] = walls.is_empty or box(0, 0, W, D).covers(walls)
    if 'first' in model['floors'] and model['floors']['first'].get('stair'):
        out['stair:aligned'] = model['floors']['first']['stair']['core'] == model['floors']['ground']['stair']['core']
    return out


def _canonical(model):
    floors = {}
    for name, floor in model['floors'].items():
        floors[name] = {
            'walls': shapely.to_wkt(floor['walls'].normalize(), rounding_precision=0) if not floor['walls'].is_empty else '',
            'runs': [(r['id'], r['kind'], r['reason']) for r in floor['runs']],
            'doors': [(d['run'], d['lo'], d['hi'], d['type'], d['swingRoom']) for d in floor['doors']],
            'windows': [(w['run'], w['lo'], w['hi'], w['kind']) for w in floor['windows']],
            'stair': (floor['stair']['core'], floor['stair']['front']) if floor.get('stair') else None,
            'supports': [c['rect'] for c in floor['supports']],
        }
    return {'kernel': KERNEL, 'intent': model['intent'], 'floors': floors,
            'notes': [(n['code'], n.get('floor'), n['rooms'], n['regions']) for n in model['notes']]}


def model_hash(model):
    text = json.dumps(_canonical(model), sort_keys=True, separators=(',', ':'), default=list)
    return hashlib.sha256(text.encode()).hexdigest()


def room_list(model, name):
    floor = model['floors'][name]
    return sorted(floor['rooms'].values(), key=lambda r: r.id)


def summary(model):
    """JSON-safe description for the studio: rooms with sizes, notes, checks and the hash."""
    out = {'modelHash': model['modelHash'], 'plot': {k: v for k, v in model['plot'].items() if k not in ('W', 'D')},
           'storeys': model['storeys'], 'floors': {}, 'notes': model['notes'], 'checks': model['checks']}
    for name, floor in model['floors'].items():
        rooms = []
        for room in room_list(model, name):
            size = clear_size(room)
            rooms.append({'id': room.id, 'use': room.use, 'label': room.label, 'zone': room.zone, 'regions': room.regions,
                          'areaSqft': round(room.polygon.area / U / U, 1),
                          'clearSqft': round(room.clear.area / U / U, 1) if room.indoor else None,
                          'clear': [round(size[0], 4), round(size[1], 4)] if size and room.indoor else None,
                          'doubleHeight': room.double_height})
        out['floors'][name] = {'rooms': rooms, 'doors': len(floor['doors']), 'windows': len(floor['windows']),
                               'stair': bool(floor.get('stair')), 'reached': floor.get('access', {}).get('reached', [])}
    return out
