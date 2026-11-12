"""A Compass PlanModel floor as a plan25d plan, for the furnished model view.

The same rooms, walls, doors, windows, furniture and stair that every other Compass view draws
(compass_geometry and compass_furniture), restated in plan25d's keys in feet. The road stays at
the bottom and column 1 on the left, as on the map the person built; nothing is added, moved or
written back. Walls are drawn a little slimmer than built (a model reads that way), centred on
their real line, so every room keeps its clear size and its label.
"""
from __future__ import annotations

import math

import compass_geometry as geometry
from shapely.geometry import box

U = geometry.U
SLIM = .7          # Drawn wall thickness as a share of the built one.
ROT = {'N': 0, 'E': 90, 'S': 180, 'W': 270}
KIND = {'coffee-table': 'coffee_table', 'tv-unit': 'tv_unit', 'side-table': 'side_table',
        'hospital-bed': 'hospital_bed', 'dining': 'dining', 'counter': 'counter', 'tree': 'tree',
        'planter': 'planter', 'seating': 'seating', 'bed': 'bed', 'sofa': 'sofa', 'armchair': 'armchair',
        'wardrobe': 'wardrobe', 'wc': 'wc', 'basin': 'basin', 'shower': 'shower', 'monitor': 'monitor',
        'desk': 'desk', 'chair': 'chair', 'table': 'table', 'tv': 'tv', 'plant': 'plant'}
GREEN = ('lawn', 'garden', 'backyard')
DECK = ('verandah', 'balcony', 'ff_balcony')
PAVED = ('terrace', 'ff_terrace', 'porch')
ICU_TINT = '#D8E3DE'
NOTE = 'Road at the bottom · walls cut at waist height · proposed furnishing · preliminary concept'
DIRECTION_NAMES = {0: 'NORTH', 90: 'EAST', 180: 'SOUTH', 270: 'WEST'}


def _ft(v):
    return v / U


def floor_material(room):
    if room.zone == 'void':
        return 'void'
    if room.zone == 'wet':
        return 'wet'
    if room.use in GREEN:
        return 'grass'
    if room.use in DECK:
        return 'deck'
    if room.use in PAVED or room.zone == 'open':
        return 'stone'
    if room.zone == 'private':
        return 'wood'
    return 'tile'


def _fmt(v):
    return f"{round(v)}" if abs(v - round(v)) < .13 else f"{v:.1f}"


class _Flip:
    """Model units (y away from the road) to plan25d feet (y down, the road at the bottom)."""

    def __init__(self, model):
        self.depth = _ft(model['plot']['D'])

    def pt(self, x, y):
        return [round(_ft(x), 4), round(self.depth - _ft(y), 4)]

    def ft(self, x, y):                      # points already in feet (fixture geometry)
        return [round(x, 4), round(self.depth - y, 4)]


def _polygons(geom):
    return [geom] if geom.geom_type == 'Polygon' else [g for g in getattr(geom, 'geoms', []) if g.geom_type == 'Polygon']


def _furniture(fixtures, flip):
    out = []
    for f in fixtures:
        if f['kind'] == 'stair':
            continue
        x1, y1, x2, y2 = f['bounds']
        bw, bh = x2 - x1, y2 - y1
        rot = ROT.get(f.get('side'), 0)
        w, d = (bw, bh) if rot in (0, 180) else (bh, bw)
        X, Y = flip.ft(x1, y2)
        out.append({'type': KIND.get(f['kind'], 'block'), 'x': X, 'y': Y, 'w': round(w, 4), 'd': round(d, 4), 'rot': rot})
    return out


def _stair(fixtures, flip):
    """Treads from the stair fixture's tread outlines, and a walking line through their middles from
    the start mark (the small circle the plan draws at the first riser)."""
    for f in fixtures:
        if f['kind'] != 'stair':
            continue
        treads, start = [], None
        for line in f['lines']:
            pts = line['points']
            if line.get('closed') and len(pts) == 4:
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                if (max(xs) - min(xs)) * (max(ys) - min(ys)) <= 12:
                    treads.append([flip.ft(*p) for p in pts])
            elif line.get('closed') and len(pts) > 6 and start is None:
                start = flip.ft(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        if not treads:
            continue
        centres = [(sum(p[0] for p in t) / 4, sum(p[1] for p in t) / 4) for t in treads]
        here = tuple(start) if start else centres[0]
        left, walk = list(centres), [here]
        while left:
            nxt = min(left, key=lambda c: math.dist(c, walk[-1]))
            left.remove(nxt)
            walk.append(nxt)
        corners = [walk[0]]
        for a, b, c in zip(walk, walk[1:], walk[2:]):
            if abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > .05:
                corners.append(b)
        corners.append(walk[-1])
        yield {'treads': treads, 'path': [[round(x, 3), round(y, 3)] for x, y in corners]}


def floor_plan(model, floor):
    """plan25d's plan for one floor of a Compass PlanModel."""
    f = model['floors'][floor]
    plot = model['plot']
    flip = _Flip(model)
    W, D = _ft(plot['W']), _ft(plot['D'])
    nx, ny = plot.get('north', (0., -1.))
    north_deg = round(math.degrees(math.atan2(nx, ny))) % 360      # model y away from the road is image up
    facing = str(plot.get('facing', 'North'))
    roads = [{'side': 'bottom', 'label': f"{facing.upper()} ROAD · {_fmt(W)} ft"}]
    if plot.get('secondRoad') in ('Left', 'Right'):
        edge = 270 if plot['secondRoad'] == 'Left' else 90
        name = DIRECTION_NAMES.get(round(((edge - north_deg) % 360) / 90) * 90 % 360, '')
        roads.append({'side': plot['secondRoad'].lower(), 'label': f"{name} ROAD · {_fmt(D)} ft".strip()})

    rooms = []
    ground = model['floors'].get('ground') if floor != 'ground' else None
    for room in sorted(f['rooms'].values(), key=lambda r: r.id):
        material = floor_material(room)
        for k, poly in enumerate(_polygons(room.polygon)):
            entry = {'id': room.id if k == 0 else f"{room.id}-{k}", 'name': room.label, 'short': room.short,
                     'poly': [flip.pt(x, y) for x, y in list(poly.exterior.coords)[:-1]],
                     'floor': material, 'indoor': bool(room.indoor)}
            if room.use == 'icu':
                entry['tint'] = ICU_TINT
            cx1, cy1, cx2, cy2 = room.clear.bounds
            if k == 0 and room.clear.area >= .98 * box(cx1, cy1, cx2, cy2).area and material != 'void':
                entry['size'] = [round(_ft(cx2 - cx1), 2), round(_ft(cy2 - cy1), 2)]
            if material == 'void' and ground:
                below_rooms = []
                for g in sorted(ground['rooms'].values(), key=lambda r: r.id):
                    if g.polygon.intersects(poly):
                        for gp in _polygons(g.polygon.intersection(poly)):
                            below_rooms.append({'name': g.label, 'poly': [flip.pt(x, y) for x, y in list(gp.exterior.coords)[:-1]],
                                                'floor': floor_material(g), **({'tint': ICU_TINT} if g.use == 'icu' else {})})
                inside = [x for x in ground['fixtures'] if x['kind'] != 'stair'
                          and box(*[v * U for v in x['bounds']]).intersects(poly)]
                entry['below'] = {'rooms': below_rooms, 'furniture': _furniture(inside, flip)}
            rooms.append(entry)

    walls, index = [], {}
    for run in f['runs']:
        if run['polygon'] is None or run['kind'] not in ('exterior', 'partition', 'rail'):
            continue
        c1, c2 = geometry._band(run)
        mid = (c1 + c2) / 2
        a, b = ((run['lo'], mid), (run['hi'], mid)) if run['orient'] == 'h' else ((mid, run['lo']), (mid, run['hi']))
        index[run['id']] = len(walls)
        kind = 'rail' if run['kind'] == 'rail' else 'wall'
        walls.append({'a': flip.pt(*a), 'b': flip.pt(*b), 'thickness': round(_ft(c2 - c1) * SLIM, 3) if kind == 'wall' else .2,
                      'extend': 0, **({'kind': 'rail'} if kind == 'rail' else {})})
    for p in f.get('parapets', []):                           # a terrace's low edge
        a, b = ((p['lo'], p['at']), (p['hi'], p['at'])) if p['orient'] == 'h' else ((p['at'], p['lo']), (p['at'], p['hi']))
        walls.append({'a': flip.pt(*a), 'b': flip.pt(*b), 'thickness': .25, 'extend': 0, 'kind': 'rail'})
    for col in f.get('supports', []):
        if 'rect' in col:
            x1, y1, x2, y2 = col['rect']
            walls.append({'a': flip.pt(x1, (y1 + y2) / 2), 'b': flip.pt(x2, (y1 + y2) / 2),
                          'thickness': round(_ft(y2 - y1), 3), 'extend': 0})
    openings = []
    for kind, items in (('door', f['doors']), ('window', f['windows'])):
        for o in items:
            if o['run'] not in index:
                continue
            run = next(r for r in f['runs'] if r['id'] == o['run'])
            otype = 'door' if kind == 'door' else ('slider' if o.get('kind') == 'tall' else 'window')
            openings.append({'wall': index[o['run']], 'at': round(_ft(o['lo'] - run['lo']), 4),
                             'width': round(_ft(o['hi'] - o['lo']), 4), 'type': otype})

    # An upper floor shows the ground below it, faded, where it has no room: the garden, paving and roof.
    site = []
    for g in sorted(ground['rooms'].values(), key=lambda r: r.id) if ground else []:
        for gp in _polygons(g.polygon):
            site.append({'poly': [flip.pt(x, y) for x, y in list(gp.exterior.coords)[:-1]],
                         'floor': floor_material(g), **({'roof': True} if g.indoor else {})})

    dashed = []
    for over in f.get('overhead', []):
        for poly in _polygons(over['polygon']):
            pts = [flip.pt(x, y) for x, y in poly.exterior.coords]
            dashed.append(pts)
    return {
        'title': f"{f.get('label', geometry.FLOOR_NAMES.get(floor, floor))} · model view",
        'plot': {'width': W, 'depth': D},
        'roads': roads,
        'north_deg': north_deg,
        'rooms': rooms,
        'walls': walls,
        'openings': openings,
        'furniture': _furniture(f['fixtures'], flip),
        'stairs': list(_stair(f['fixtures'], flip)),
        'dashed': dashed,
        'site': site,
        'notes': [NOTE],
    }


def plan(model):
    """Every floor the model draws, as one plan25d plan."""
    return {'floors': [floor_plan(model, name) for name in model['floors']]}
