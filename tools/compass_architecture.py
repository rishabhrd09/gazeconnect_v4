"""Proposed architectural detail for Compass previews, shared by every output.

Grid rectangles remain the dimension reference. Walls (9 in exterior / 6 in
internal), doors, windows, furniture and stair arrangement are illustrative
proposals, not surveyed construction information. Nothing is written back to
the map. Sizes come from compass_standards; furniture from compass_furniture.
"""
from __future__ import annotations
import math
from itertools import combinations, islice, product
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

import compass_furniture as furniture
from compass_standards import VENT_HEAD, VENT_SILL, WALL_INNER, WALL_OUTER, WINDOW_HEAD, WINDOW_SILL

OUTDOOR = ('lawn', 'garden', 'porch', 'verandah', 'backyard', 'balcony', 'terrace', 'open area')
GREEN = ('lawn', 'garden', 'backyard')
ARCHITECTURE_NOTE = ('Architectural preview: 9-inch outer and 6-inch inner walls; doors, windows, furniture and stair '
                     'arrangement are proposed. Room sizes are clear between the proposed walls and dimension chains '
                     'follow the map grid. Verify site setbacks and construction details with your designer.')

# Window width (ft) and the most windows a room of each kind receives.
WINDOWS = {'living': (6.0, 4), 'drawing': (6.0, 4), 'dining': (5.0, 2), 'master': (5.0, 3), 'bed': (5.0, 2),
           'icu': (5.0, 2), 'kitchen': (4.0, 2), 'stair': (3.0, 2), 'lobby': (4.0, 2)}
VENTILATED = ('bath', 'store')            # A 2'0" ventilator set high, one per room.
DOOR_TAGS = {'main': 'D', 'internal': 'D1', 'bath': 'D2', 'exterior': 'D3'}
HABITABLE = ('living', 'drawing', 'dining', 'master', 'bed', 'icu', 'kitchen')


def is_outdoor(room):
    name = (room['roomId'] + ' ' + room['room']).lower()
    return any(word in name for word in OUTDOOR)


def room_kinds(room):
    """What a room is used for, most important first (a room can be a dining hall and a stair)."""
    name = (room['roomId'] + ' ' + room['room']).lower()
    if room.get('outdoor', is_outdoor(room)):
        return ['green'] if any(w in name for w in GREEN) else ['balcony'] if any(w in name for w in ('balcony', 'terrace')) else ['paved']
    kinds = []
    if 'stair' in name or 'landing' in name:
        kinds.append('stair')
    if 'icu' in name:
        kinds.append('icu')
    elif 'master' in name:
        kinds.append('master')
    elif 'bed' in name:
        kinds.append('bed')
    if 'kitchen' in name:
        kinds.append('kitchen')
    if any(w in name for w in ('bath', 'toilet', 'wc')):
        kinds.append('bath')
    if 'dining' in name:
        kinds.append('dining')
    if 'drawing' in name:
        kinds.append('drawing')
    elif 'living' in name and 'lobby' not in name:
        kinds.append('living')
    if 'store' in name and 'kitchen' not in name:
        kinds.append('store')
    if not kinds and 'lobby' in name:
        kinds.append('lobby')
    return kinds


def primary_kind(kinds):
    rest = [k for k in kinds if k != 'stair']
    return rest[0] if rest else (kinds[0] if kinds else None)


def parts(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, 'geoms') else [geom]


def segments(geom):
    for part in parts(geom):
        if part.geom_type == 'LineString':
            points = list(part.coords)
            yield from zip(points, points[1:])


def rect_points(r):
    x1,y1,x2,y2 = r
    return [(x1,y1),(x2,y1),(x2,y2),(x1,y2)]


def ellipse(x,y,rx,ry):
    return [(x+rx*math.cos(i*math.tau/32), y+ry*math.sin(i*math.tau/32)) for i in range(32)]


def intervals_on(edge, geom):
    """Parameter intervals of `edge` that lie along `geom`, merged."""
    spans = []
    for piece in parts(edge.intersection(geom)):
        if piece.geom_type != 'LineString' or piece.length < .01:
            continue
        lo, hi = sorted(edge.project(Point(p)) for p in (piece.coords[0], piece.coords[-1]))
        spans.append([lo, hi])
    spans.sort()
    merged = []
    for lo, hi in spans:
        if merged and lo <= merged[-1][1] + .01:
            merged[-1][1] = max(merged[-1][1], hi)
        else:
            merged.append([lo, hi])
    return merged


def straight_edges(shape):
    """Each straight side of a room once, collinear grid vertices merged."""
    for poly in parts(shape):
        if poly.geom_type != 'Polygon':
            continue
        simple = poly.simplify(1e-9)
        for ring in (simple.exterior, *simple.interiors):
            pts = list(ring.coords)
            for a, b in zip(pts, pts[1:]):
                if math.dist(a, b) > 1e-6:
                    yield LineString([a, b])


def largest_rect(shape):
    """The largest axis-aligned rectangle inside a room (all of it, for a rectangular room).

    Furniture is arranged in it; an L-shaped room's main body can span cells."""
    if abs(shape.area - shape.envelope.area) < 1e-6:
        return shape.bounds
    rings = [ring for poly in parts(shape) if poly.geom_type == 'Polygon' for ring in (poly.exterior, *poly.interiors)]
    xs = sorted({x for ring in rings for x, _ in ring.coords})
    ys = sorted({y for ring in rings for _, y in ring.coords})
    best = None
    for x1, x2 in combinations(xs, 2):
        for y1, y2 in combinations(ys, 2):
            area = (x2 - x1) * (y2 - y1)
            if (best is None or area > best[0] + 1e-9) and shape.covers(box(x1, y1, x2, y2)):
                best = (area, (x1, y1, x2, y2))
    return best[1] if best else shape.bounds


def subtract(spans, cut):
    lo, hi = cut
    return [(x, y) for a, b in spans for x, y in ((a, min(b, lo)), (max(a, hi), b)) if y - x > 1e-6]


def place_windows(room, kind, exposure, doors):
    """Windows centred on each exposed wall run, sized for the room."""
    if kind in VENTILATED:
        width, cap, vent = 2.0, 1, True
    else:
        width, cap = WINDOWS.get(kind, (4.0, 2))
        vent = False
    runs = []
    for edge in straight_edges(room['shape']):
        for lo, hi in intervals_on(edge, exposure):
            if hi - lo >= 3.5:
                runs.append((hi - lo, edge, lo, hi))
    runs.sort(key=lambda r: (-r[0], r[1].coords[0], r[2]))
    out = []
    for length, edge, lo, hi in runs:
        if len(out) >= cap:
            break
        free = [(lo + 1.5, hi - 1.5)]
        for door in doors:
            line = LineString([door['a'], door['b']])
            if edge.distance(line) > .01:
                continue
            d1, d2 = sorted(edge.project(Point(p)) for p in (door['a'], door['b']))
            free = subtract(free, (d1 - 1.0, d2 + 1.0))
        pair = not vent and length >= 2 * width + 7 and cap - len(out) >= 2
        targets = [lo + length / 4, lo + 3 * length / 4] if pair else [(lo + hi) / 2]
        for target in targets:
            fits = [(a, b) for a, b in free if b - a >= width]
            if fits:
                a, b = min(fits, key=lambda s: 0 if s[0] <= target <= s[1] else min(abs(target - s[0]), abs(target - s[1])))
                w = width
            else:
                if not free:
                    continue
                a, b = max(free, key=lambda s: s[1] - s[0])
                w = math.floor((b - a) * 2) / 2
                if w < 2.0:
                    continue
            centre = min(max(target, a + w / 2), b - w / 2)
            start, end = edge.interpolate(centre - w / 2), edge.interpolate(centre + w / 2)
            out.append({'a': (start.x, start.y), 'b': (end.x, end.y), 'roomId': room['placementId'],
                        'kind': 'ventilator' if vent else 'window', 'width': w, 'tag': 'V' if vent else 'W',
                        'sill': VENT_SILL if vent else WINDOW_SILL, 'head': VENT_HEAD if vent else WINDOW_HEAD})
            free = subtract(free, (centre - w / 2 - 1.5, centre + w / 2 + 1.5))
            if len(out) >= cap:
                break
    return out


def door_geometry(raw, rooms_by_id, kinds_by_id, main_ids):
    """Leaf hinged at the jamb nearer a corner, swinging into its room; toilets open outwards."""
    a, b = (raw['x1'], raw['y1']), (raw['x2'], raw['y2'])
    length = math.dist(a, b)
    if length < .01:
        return None
    ids = (raw['fromPlacementId'], raw['toPlacementId'])
    kinds = {pid: kinds_by_id.get(pid, []) for pid in ids}
    outdoor = {pid: pid == 'outside' or bool(rooms_by_id.get(pid, {}).get('outdoor')) for pid in ids}
    if id(raw) in main_ids:
        kind = 'main'
    elif any(outdoor.values()):
        kind = 'exterior'
    elif any('bath' in kinds[pid] for pid in ids):
        kind = 'bath'
    else:
        kind = 'internal'
    swing = raw['toPlacementId']
    if kind in ('main', 'exterior'):
        swing = next((pid for pid in ids if not outdoor[pid]), swing)
    elif kind == 'bath':
        # Opening outwards keeps the door free if someone falls inside (accessible toilets).
        swing = next((pid for pid in ids if 'bath' not in kinds[pid]), swing)
    room = rooms_by_id.get(swing)
    dx, dy = (b[0]-a[0])/length, (b[1]-a[1])/length
    n = (-dy, dx)
    mid = ((a[0]+b[0])/2, (a[1]+b[1])/2)
    if room and not room['shape'].covers(Point(mid[0]+n[0]*.1, mid[1]+n[1]*.1)):
        n = (-n[0], -n[1])
    hinge, strike = a, b
    if room:
        corners = [Point(p) for poly in parts(room['shape']) for p in poly.exterior.coords]
        if min(Point(b).distance(c) for c in corners) < min(Point(a).distance(c) for c in corners) - 1e-6:
            hinge, strike = b, a
    leaf = (hinge[0]+n[0]*length, hinge[1]+n[1]*length)
    s = ((strike[0]-hinge[0])/length, (strike[1]-hinge[1])/length)
    t = .15
    leaf_polygon = [hinge, leaf, (leaf[0]+s[0]*t, leaf[1]+s[1]*t), (hinge[0]+s[0]*t, hinge[1]+s[1]*t)]
    start = math.atan2(strike[1]-hinge[1], strike[0]-hinge[0])
    sweep = math.atan2(n[1], n[0]) - start
    sweep = (sweep + math.pi) % math.tau - math.pi
    arc = [(hinge[0]+length*math.cos(start+sweep*i/24), hinge[1]+length*math.sin(start+sweep*i/24)) for i in range(25)]
    return {**raw, 'a': a, 'b': b, 'hinge': hinge, 'strike': strike, 'leaf': leaf, 'leafPolygon': leaf_polygon,
            'arc': arc, 'normal': n, 'type': kind, 'tag': DOOR_TAGS[kind], 'swingRoom': swing, 'width': length}


def clear_size(room, walls):
    """Inside size between the proposed wall faces, for a rectangular indoor room."""
    shape = room['shape']
    if room['outdoor'] or abs(shape.area - shape.envelope.area) > .01:
        return None
    x1, y1, x2, y2 = shape.bounds

    def thickness(p):
        # Walls are axis-aligned grid segments: a point is on one when it lies between its ends.
        best = 0.
        for w in walls:
            (ax, ay), (bx, by) = w['a'], w['b']
            if (abs(ax - bx) < 1e-9 and abs(p[0] - ax) < 1e-6 and min(ay, by) - 1e-6 <= p[1] <= max(ay, by) + 1e-6) or \
               (abs(ay - by) < 1e-9 and abs(p[1] - ay) < 1e-6 and min(ax, bx) - 1e-6 <= p[0] <= max(ax, bx) + 1e-6):
                best = max(best, w['thickness'])
        return best
    cx, cy = (x1+x2)/2, (y1+y2)/2
    return (x2-x1 - thickness((x1, cy))/2 - thickness((x2, cy))/2,
            y2-y1 - thickness((cx, y1))/2 - thickness((cx, y2))/2)


def details(m, stair_hint=None):
    rooms = m['rooms']
    for room in rooms:
        room['outdoor'] = is_outdoor(room)
        room['shape'] = unary_union(room['polygons'])
        room['kinds'] = room_kinds(room)
        room['kind'] = primary_kind(room['kinds'])
    by_id = {r['placementId']: r for r in rooms}
    kinds_by_id = {r['placementId']: r['kinds'] for r in rooms}
    building = unary_union([r['shape'] for r in rooms if not r['outdoor']])
    boundaries = unary_union([r['shape'].boundary for r in rooms if not r['outdoor']])
    walls = []
    for a,b in segments(boundaries):
        segment = LineString([a,b])
        mid = segment.interpolate(.5, normalized=True)
        external = building.boundary.distance(mid) < .001
        walls.append({'a':a,'b':b,'exterior':external,'thickness':WALL_OUTER if external else WALL_INNER})
    # The main door: from the road, else the front-most door from an outdoor entry into the house.
    raw_doors = [d for d in m['doors'] if math.dist((d['x1'], d['y1']), (d['x2'], d['y2'])) >= .01]
    entry = [d for d in raw_doors if 'outside' in (d['fromPlacementId'], d['toPlacementId'])]
    if not entry and m.get('floor') == 'ground':
        entry = [d for d in raw_doors
                 if sum(bool(by_id.get(pid, {}).get('outdoor')) for pid in (d['fromPlacementId'], d['toPlacementId'])) == 1]
    main_ids = {id(min(entry, key=lambda d: (min(d['y1'], d['y2']), d['x1'])))} if entry else set()
    doors = [door for door in (door_geometry(raw, by_id, kinds_by_id, main_ids) for raw in raw_doors) if door]
    # Windows only face the plot perimeter or explicitly placed outdoor space.
    # Unfilled cells are not silently treated as gardens or light wells.
    outdoors = unary_union([r['shape'] for r in rooms if r['outdoor']])
    site = box(0, 0, m['width'], m['depth'])
    exposure = [site.boundary, *([] if outdoors.is_empty else [outdoors.boundary])]
    if m.get('floor') == 'first' and not building.is_empty:
        exposure.append(building.boundary)  # Upstairs, the open edge of a floor faces the roof below.
    exposure = unary_union(exposure)
    windows, notes = [], []
    for room in rooms:
        if room['outdoor']:
            continue
        own = [d for d in doors if room['placementId'] in (d['fromPlacementId'], d['toPlacementId'])]
        placed = place_windows(room, room['kind'], exposure, own)
        windows.extend(placed)
        if not placed and room['kind'] in HABITABLE:
            notes.append(f'{room["room"]}: no outside wall for a window here; plan a ventilation shaft or a skylight.')
        elif not placed and room['kind'] == 'bath':
            notes.append(f'{room["room"]}: no outside wall for a ventilator; plan an exhaust duct.')
    # Schedule tags by size on this floor: W is the widest, then W1, W2 ...; V ventilators.
    widths = sorted({w['width'] for w in windows if w['kind'] == 'window'}, reverse=True)
    for w in windows:
        if w['kind'] == 'window':
            rank = widths.index(w['width'])
            w['tag'] = 'W' if rank == 0 else f'W{rank}'
    fixtures = []
    stair_frame = None
    for room in rooms:
        room['fixtures'] = []
        room['turning'] = None
        own_doors = [d for d in doors if room['placementId'] in (d['fromPlacementId'], d['toPlacementId'])]
        own_windows = [w for w in windows if w['roomId'] == room['placementId']]
        rect = largest_rect(room['shape'])
        state = None
        items = []
        if 'stair' in room['kinds']:
            flight, state = furniture.stair(room['shape'], rect, own_doors, own_windows, stair_hint)
            if flight is None:
                notes.append(f'{room["room"]}: the available space cannot contain the proposed stair footprint with clear door approaches.')
            else:
                items.append(flight)
                stair_frame = stair_frame or flight['frame']
        if state is None:
            state = furniture.Room(room['shape'], rect, own_doors, own_windows)
        items.extend(furniture.furnish([k for k in room['kinds'] if k != 'stair'], room['shape'], rect,
                                       own_doors, own_windows, state))
        for item in items:
            item['roomId'] = room['placementId']
            fixtures.append(item)
            room['fixtures'].append(item)
        room['turning'] = getattr(state, 'turning', None)
        room['clear'] = clear_size(room, walls)
    # The ENTRY arrow and its word stand outside the main door: keep names off them.
    entry_marks = []
    for door in doors:
        if door['type'] == 'main':
            (ax, ay), (bx, by) = door['a'], door['b']
            ux, uy = (bx - ax) / door['width'], (by - ay) / door['width']
            nx, ny = door['normal']
            mx, my = (ax + bx) / 2, (ay + by) / 2
            entry_marks.append(Polygon([(mx - ux * 2.2, my - uy * 2.2), (mx + ux * 2.2, my + uy * 2.2),
                                        (mx + ux * 2.2 - nx * 4.8, my + uy * 2.2 - ny * 4.8),
                                        (mx - ux * 2.2 - nx * 4.8, my - uy * 2.2 - ny * 4.8)]))
    # Reserve an actual empty rectangle for names so stairs/furniture do not
    # disappear beneath the text. This is annotation placement, not a room edit.
    for room in rooms:
        a=room['anchor']; region=room['shape'].buffer(-.4,join_style=2)
        for mark in entry_marks:
            region=region.difference(mark)
        for fixture in room['fixtures']:
            region=region.difference(box(*fixture['bounds']).buffer(.3, join_style=2))
        for door in doors:
            if room['placementId']==door['swingRoom']:
                points=[door['a'],door['b'],door['leaf']]
                region=region.difference(box(min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)))
        rects=[]
        for p in parts(region):
            if p.geom_type!='Polygon': continue
            xs=sorted({v[0] for v in p.exterior.coords});ys=sorted({v[1] for v in p.exterior.coords})
            # Bounded even for a restored map with many small wall segments.
            # Prefer long spans first; never enumerate millions of rectangles.
            x_spans=sorted(combinations(xs,2),key=lambda v:v[1]-v[0],reverse=True)
            y_spans=sorted(combinations(ys,2),key=lambda v:v[1]-v[0],reverse=True)
            spans=list(islice(product(x_spans,y_spans),2048))
            if not spans: continue
            bounds=np.array([(x1,y1,x2,y2) for (x1,x2),(y1,y2) in spans])
            # One vectorised covers test instead of thousands of single ones.
            inside=shapely.covers(p,shapely.box(bounds[:,0],bounds[:,1],bounds[:,2],bounds[:,3]))
            for (x1,y1,x2,y2),ok in zip(bounds.tolist(),inside):
                if ok:rects.append((min((x2-x1)/2, y2-y1)**2 * ((x2-x1)*(y2-y1))**.15, (x1,y1,x2,y2)))
        room['labelBounds']=max(rects)[1] if rects else (a['x1'],a['y1'],a['x2'],a['y2'])
        room['labelRegions']=[r for _,r in rects] or [room['labelBounds']]
    # All wall footprints use these same openings in 2D and CAD. 3D splits the
    # same segments vertically into sill, opening and lintel bands.
    raw_walls=unary_union([LineString([w['a'],w['b']]).buffer(w['thickness']/2,cap_style=2,join_style=2) for w in walls])
    cuts=unary_union([LineString([o['a'],o['b']]).buffer(.5,cap_style=2) for o in [*doors,*windows]])
    return {'walls':walls,'wallFootprint':raw_walls.difference(cuts), 'doors':doors,'windows':windows,'fixtures':fixtures,
            'notes':notes,'stair':stair_frame}
