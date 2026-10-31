"""CompassPlanV2: the one persisted description of a Compass house (IMPLEMENTATION_PLAN.md §4.3).

The plan stores only what the person chose: plot facts, which cells are divided into a
left and a right half, which rooms own which regions, and two layout preferences.
Everything else (walls, doors, windows, stair, views, exports) is derived from it by
compass_geometry. This module is mirrored by src/utils/compassPlan.ts; the shared
fixtures in python/tests/fixtures/compass/ hold the vectors both must agree on.

Coordinates of a region are exact: the plan frame has its origin at the plot's
front-left corner, +x along the road (left to right on the map), +y away from the road.
Plot sides are whole inches, so cell and half-cell lines are whole inches too.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Dict, Iterable, List, Optional, Tuple

SCHEMA = 'gazeconnect.compass-plan'
VERSION = 2
ROWS = COLS = 4
CELLS = [f'r{r}_c{c}' for r in range(1, ROWS + 1) for c in range(1, COLS + 1)]
FLOORS = ('ground', 'first')
FACINGS = ('North', 'East', 'South', 'West')
GATES = ('Left', 'Center', 'Right')
PLOT_TYPES = ('Middle Plot', 'Corner Plot', 'Independent')
MIN_SIDE_IN, MAX_SIDE_IN = 180, 2400          # 15 ft to 200 ft (§4.5)
MAX_ROOMS = 32
MAX_JSON_BYTES = 64 * 1024

# The map's room library (CompassMapScreen ROOM_LIBRARY), plus Passage (both floors) and
# Open to below (first floor), decided 14 Oct 2026.
LIBRARY: Dict[str, Tuple[str, str]] = {
    'porch': ('Outer Lobby / Porch / Open Area', 'Outer Lobby'),
    'lawn': ('Lawn / Garden', 'Lawn'),
    'verandah': ('Verandah', 'Verandah'),
    'backyard': ('Backyard', 'Backyard'),
    'drawing': ('Drawing Room', 'Drawing'),
    'kitchen': ('Kitchen + Store', 'Kitchen'),
    'living': ('Living Hall', 'Living'),
    'masterBed': ('Master Bedroom', 'M.Bed'),
    'bedroom': ('Bedroom', 'Bedroom'),
    'bathroom': ('Bathroom', 'Bath'),
    'staircase': ('Living Lobby + Staircase', 'Stairs'),
    'diningStaircase': ('Dining Hall + Staircase', 'Dining + Stairs'),
    'dining': ('Dining Hall', 'Dining'),
    'icu': ('Home ICU + Caretaker Unit', 'ICU'),
    'balcony': ('Balcony', 'Balcony'),
    'terrace': ('Terrace', 'Terrace'),
    'passage': ('Passage', 'Passage'),
    'ff_master': ('1F Master Bedroom', '1F Master'),
    'ff_bed2': ('1F Bedroom 2', '1F Bed 2'),
    'ff_bed3': ('1F Bedroom 3', '1F Bed 3'),
    'ff_living': ('1F Living / Family', '1F Living'),
    'ff_bathroom': ('1F Bathroom', '1F Bath'),
    'ff_balcony': ('1F Balcony', '1F Balcony'),
    'ff_terrace': ('1F Open Terrace', '1F Terrace'),
    'ff_stairLanding': ('1F Stair Landing', '1F Stairs'),
    'void': ('Open to below', 'Open below'),
}
CATALOGUE = {
    'ground': ('porch', 'lawn', 'verandah', 'backyard', 'drawing', 'kitchen', 'living', 'masterBed', 'bedroom',
               'bathroom', 'staircase', 'diningStaircase', 'dining', 'icu', 'balcony', 'terrace', 'passage'),
    'first': ('ff_master', 'ff_bed2', 'ff_bed3', 'ff_living', 'ff_bathroom', 'ff_balcony', 'ff_terrace',
              'ff_stairLanding', 'passage', 'void'),
}
# Uses that may occur more than once on a floor as separate rooms ("Bedroom 1", "Bedroom 2").
REPEATABLE = frozenset({'bedroom', 'bathroom', 'passage', 'balcony', 'terrace', 'lawn', 'backyard',
                        'ff_bathroom', 'ff_balcony', 'ff_terrace', 'void'})
STAIR_HOSTS = {'ground': frozenset({'staircase', 'diningStaircase'}), 'first': frozenset({'ff_stairLanding'})}
# Rooms a double-height void may stand over (§7.7); drawing only when it is open to the living hall.
VOID_BELOW = frozenset({'living', 'dining', 'staircase', 'diningStaircase'})
ALIASES = {'commonBath': 'bathroom', 'masterbed': 'masterBed'}

_REGION = re.compile(r'^r([1-4])_c([1-4])(?:\.(L|R|T|B))?$')
_ID = re.compile(r'^(g|f)-([A-Za-z_][A-Za-z0-9_]*)-([1-9][0-9]{0,2})$')


class PlanError(ValueError):
    """The plan cannot be read at all (structure, keys, limits). Semantic problems are notes."""


# ---- Regions --------------------------------------------------------------------------------

def parse_region(key: str) -> Tuple[int, int, Optional[str]]:
    match = _REGION.match(str(key))
    if not match:
        raise PlanError(f'Unknown map region {key!r}.')
    return int(match.group(1)), int(match.group(2)), match.group(3)


def cell_of(key: str) -> str:
    return str(key).split('.')[0]


def region_rect_in(key: str, width_in: int, depth_in: int) -> Tuple[float, float, float, float]:
    """(x1, y1, x2, y2) of a region in inches. Whole inches for whole-inch plots; halves are exactly 50 %."""
    row, col, half = parse_region(key)
    cw, cd = width_in / COLS, depth_in / ROWS
    x1, x2 = (col - 1) * cw, col * cw
    y1, y2 = (row - 1) * cd, row * cd
    if half == 'L':
        x2 = x1 + cw / 2
    elif half == 'R':
        x1 = x1 + cw / 2
    if half == 'T':
        y1 += cd / 2
    elif half == 'B':
        y2 -= cd / 2
    return (x1, y1, x2, y2)


def split_direction(floor: dict, cell: str) -> str:
    return floor.get('splitDirections', {}).get(cell, 'left-right')


def cell_regions(floor: dict, cell: str) -> List[str]:
    if cell not in floor.get('splits', []):
        return [cell]
    sides = ('T', 'B') if split_direction(floor, cell) == 'top-bottom' else ('L', 'R')
    return [f'{cell}.{h}' for h in sides]


def floor_regions(floor: dict) -> List[str]:
    """Every region of a floor in map order: whole cells, or the two halves of a divided cell."""
    out = []
    for cell in CELLS:
        out.extend(cell_regions(floor, cell))
    return out


def regions_touch(a: str, b: str) -> bool:
    """True when two regions of one floor share an edge of positive length."""
    ra, ca, ha = parse_region(a)
    rb, cb, hb = parse_region(b)
    # Preserve the original fast path on existing left/right maps.
    if ha not in ('T', 'B') and hb not in ('T', 'B'):
        if (ra, ca) == (rb, cb):
            return {ha, hb} == {'L', 'R'}
        if ra == rb and abs(ca - cb) == 1:
            left, right = (ha, hb) if ca < cb else (hb, ha)
            return left in (None, 'R') and right in (None, 'L')
        return ca == cb and abs(ra - rb) == 1 and (ha is None or hb is None or ha == hb)
    ax, ay, ax2, ay2 = region_rect_in(a, 8, 8)
    bx, by, bx2, by2 = region_rect_in(b, 8, 8)
    return (((ax2 == bx or bx2 == ax) and min(ay2, by2) > max(ay, by))
            or ((ay2 == by or by2 == ay) and min(ax2, bx2) > max(ax, bx)))


def regions_overlap(a: str, b: str) -> bool:
    ax, ay, ax2, ay2 = region_rect_in(a, 8, 8)
    bx, by, bx2, by2 = region_rect_in(b, 8, 8)
    return min(ax2, bx2) > max(ax, bx) and min(ay2, by2) > max(ay, by)


def regions_below(key: str, floor: dict) -> List[str]:
    return [k for k in cell_regions(floor, cell_of(key)) if regions_overlap(key, k)]


def components(regions: Iterable[str]) -> List[List[str]]:
    """Edge-connected groups of regions, each sorted, in order of their first region."""
    remaining = sorted(set(regions))
    groups = []
    while remaining:
        group = [remaining.pop(0)]
        changed = True
        while changed:
            changed = False
            for key in list(remaining):
                if any(regions_touch(key, member) for member in group):
                    group.append(key)
                    remaining.remove(key)
                    changed = True
        groups.append(sorted(group))
    return groups


# ---- Identity and labels --------------------------------------------------------------------

def floor_prefix(floor: str) -> str:
    return 'g' if floor == 'ground' else 'f'


def next_room_id(floor_name: str, floor: dict, use: str) -> str:
    """`g-bedroom-3`: one more than the highest number of that use on the floor (a new room is numbered last)."""
    prefix = floor_prefix(floor_name)
    used = [int(m.group(3)) for r in floor.get('rooms', []) if (m := _ID.match(r['id'])) and m.group(2) == use]
    return f'{prefix}-{use}-{max(used, default=0) + 1}'


def labels(floor: dict) -> Dict[str, str]:
    """Display names, derived, never stored: "Bedroom" once, "Bedroom 1"/"Bedroom 2" when repeated."""
    by_use: Dict[str, List[str]] = {}
    for room in sorted(floor.get('rooms', []), key=lambda r: room_order(r['id'])):
        by_use.setdefault(room['use'], []).append(room['id'])
    out = {}
    for use, ids in by_use.items():
        name = LIBRARY.get(use, (use, use))[0]
        for n, rid in enumerate(ids, 1):
            out[rid] = name if len(ids) == 1 else f'{name} {n}'
    return out


def room_order(room_id: str):
    """IDs order by use and number (g-bedroom-2 before g-bedroom-10)."""
    match = _ID.match(room_id)
    return (match.group(2), int(match.group(3))) if match else (room_id, 0)


# ---- Validation -----------------------------------------------------------------------------

def _issue(code, severity, message, rooms=(), regions=(), adjustment=None):
    out = {'code': code, 'severity': severity, 'message': message, 'rooms': list(rooms), 'regions': list(regions)}
    if adjustment:
        out['adjustment'] = adjustment
    return out


def normalise(plan: dict) -> dict:
    """A validated, canonical copy (sorted splits, rooms and regions). Raises PlanError if unreadable."""
    if not isinstance(plan, dict):
        raise PlanError('A Compass plan is required.')
    if len(json.dumps(plan, allow_nan=False).encode()) > MAX_JSON_BYTES:
        raise PlanError('This plan is too large.')
    if plan.get('schema') != SCHEMA or type(plan.get('version')) is not int or plan['version'] not in (2, 3):
        raise PlanError('This is not a supported Compass plan (version 2 or 3).')
    plot = plan.get('plot')
    if not isinstance(plot, dict):
        raise PlanError('Plot details are missing.')
    out_plot = {}
    for key in ('widthIn', 'depthIn'):
        value = plot.get(key)
        if type(value) is not int or not MIN_SIDE_IN <= value <= MAX_SIDE_IN:
            raise PlanError('Plot sides must be whole inches from 15 to 200 feet.')
        out_plot[key] = value
    for key, allowed in (('facing', FACINGS), ('gate', GATES), ('plotType', PLOT_TYPES)):
        if plot.get(key) not in allowed:
            raise PlanError(f'Unknown plot {key}.')
        out_plot[key] = plot[key]
    if 'sidesOpen' in plot:
        sides = plot['sidesOpen']
        if not isinstance(sides, dict) or not all(isinstance(sides.get(k), bool) for k in ('left', 'right')):
            raise PlanError('sidesOpen needs left and right answers.')
        out_plot['sidesOpen'] = {'left': sides['left'], 'right': sides['right']}
    if 'secondRoad' in plot:
        if plot['secondRoad'] not in ('Left', 'Right') or out_plot['plotType'] != 'Corner Plot':
            raise PlanError('A second road belongs to a corner plot, on the left or the right.')
        out_plot['secondRoad'] = plot['secondRoad']
    if plan.get('storeys') not in (1, 2):
        raise PlanError('A plan has one or two storeys.')
    floors = plan.get('floors')
    if not isinstance(floors, dict) or not isinstance(floors.get('ground'), dict) or set(floors) - set(FLOORS):
        raise PlanError('The plan needs a ground floor.')
    out_floors = {}
    seen_ids = set()
    for name in FLOORS:
        if name not in floors:
            continue
        floor = floors[name]
        if not isinstance(floor, dict) or not isinstance(floor.get('splits', []), list) or not isinstance(floor.get('rooms', []), list):
            raise PlanError('Each floor has splits and rooms.')
        splits = sorted(set(floor.get('splits', [])))
        if any(s not in CELLS for s in splits):
            raise PlanError('A divided cell is not a map cell.')
        directions = {}
        if 'splitDirections' in floor:
            if plan['version'] != 3 or not isinstance(floor['splitDirections'], dict):
                raise PlanError('Split directions need a version 3 Compass plan.')
            for cell, direction in sorted(floor['splitDirections'].items()):
                if cell not in splits or direction not in ('left-right', 'top-bottom'):
                    raise PlanError('A split direction must name a divided cell and one direction.')
                if direction == 'top-bottom':
                    directions[cell] = direction
        valid_regions = set(floor_regions({'splits': splits, 'splitDirections': directions}))
        rooms, owner = [], {}
        if len(floor.get('rooms', [])) > MAX_ROOMS:
            raise PlanError(f'A floor can have at most {MAX_ROOMS} rooms.')
        for room in floor.get('rooms', []):
            if not isinstance(room, dict):
                raise PlanError('Invalid room.')
            rid, use, regions = room.get('id'), room.get('use'), room.get('regions')
            match = _ID.match(str(rid))
            if not match or match.group(1) != floor_prefix(name) or match.group(2) != use or rid in seen_ids:
                raise PlanError(f'Invalid or repeated room id {rid!r}.')
            if use not in LIBRARY:
                raise PlanError(f'Unknown room use {use!r}.')
            if not isinstance(regions, list) or not regions or len(regions) > 2 * len(CELLS):
                raise PlanError(f'{rid} needs at least one region.')
            regions = sorted(set(regions))
            for key in regions:
                parse_region(key)
                if key not in valid_regions:
                    raise PlanError(f'{key} does not match the divided cells of this floor.')
                if key in owner:
                    raise PlanError(f'{key} belongs to two rooms.')
                owner[key] = rid
            seen_ids.add(rid)
            rooms.append({'id': rid, 'use': use, 'regions': regions})
        out_floors[name] = {'splits': splits, 'rooms': sorted(rooms, key=lambda r: r['id'])}
        if directions:
            out_floors[name]['splitDirections'] = directions
    choices = plan.get('choices', {}) or {}
    if not isinstance(choices, dict):
        raise PlanError('Invalid layout choices.')
    out_choices = {}
    if 'drawingRoom' in choices:
        if choices['drawingRoom'] not in ('separate', 'open'):
            raise PlanError('drawingRoom is separate or open.')
        out_choices['drawingRoom'] = choices['drawingRoom']
    if 'kitchen' in choices:
        if choices['kitchen'] not in ('open', 'closed'):
            raise PlanError('kitchen is open or closed.')
        out_choices['kitchen'] = choices['kitchen']
    out = {'schema': SCHEMA, 'version': plan['version'], 'plot': out_plot, 'storeys': plan['storeys'],
           'floors': out_floors, 'choices': out_choices}
    if isinstance(plan.get('legacy'), dict):
        out['legacy'] = copy.deepcopy(plan['legacy'])
    return out


def check(plan: dict) -> List[dict]:
    """Semantic notes on a normalised plan, identical in TypeScript (checkPlan). Never raises."""
    notes = []
    floors = plan['floors']
    drawing_open = plan.get('choices', {}).get('drawingRoom') != 'separate'
    for name in FLOORS:
        if name not in floors:
            continue
        floor = floors[name]
        hosts = [r['id'] for r in floor['rooms'] if r['use'] in STAIR_HOSTS[name]]
        if len(hosts) > 1:
            notes.append(_issue('stair-hosts', 'conflict', 'Only one room per floor can hold the stair.', hosts))
        for room in floor['rooms']:
            parts = components(room['regions'])
            if len(parts) > 1:
                notes.append(_issue('room-disconnected', 'conflict',
                                    f'{room["id"]} is in {len(parts)} separate parts.', [room['id']], room['regions']))
            if room['use'] not in CATALOGUE[name] and room['use'] != 'void':
                notes.append(_issue('catalogue', 'warning', f'{room["use"]} is not offered on the {name} floor.', [room['id']]))
            if room['use'] == 'void' and name != 'first':
                notes.append(_issue('void-floor', 'conflict', 'Open to below belongs on the first floor.', [room['id']]))
        if name == 'first' and plan['storeys'] == 1 and floor['rooms']:
            notes.append(_issue('first-unused', 'warning', 'This plan has one storey; the first floor is kept but not drawn.'))
    if 'first' in floors:
        ground_owner = {}
        for room in floors['ground']['rooms']:
            for key in room['regions']:
                ground_owner[key] = room
        for room in floors['first']['rooms']:
            if room['use'] != 'void':
                continue
            for key in room['regions']:
                below = [ground_owner.get(k) for k in regions_below(key, floors['ground'])]
                ok = below and all(b is not None and (b['use'] in VOID_BELOW or (b['use'] == 'drawing' and drawing_open))
                                   for b in below)
                if not ok:
                    notes.append(_issue('void-below', 'conflict',
                                        'A double-height space needs the living hall (or dining or stair hall) below it.',
                                        [room['id']], [key]))
    return notes


def intent_hash(plan: dict) -> str:
    canonical = json.dumps(normalise(plan), sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()


# ---- Migration from version 1 ----------------------------------------------------------------

def _use(raw: str) -> Optional[str]:
    value = ALIASES.get(str(raw), str(raw))
    if value in LIBRARY:
        return value
    lowered = {k.lower(): k for k in LIBRARY}
    return lowered.get(value.lower())


def _active_refinements(source: dict, floor_key: str) -> dict:
    floor = source.get(floor_key) or {}
    if isinstance(floor.get('advanced_refinements'), dict):
        refinements = floor['advanced_refinements']
    elif isinstance(floor.get('refinements'), dict):
        refinements = floor['refinements']
    else:
        refinements = source.get('advanced_refinements') if floor_key == 'ground_floor' else None
        refinements = refinements if isinstance(refinements, dict) else {}
    out = {k: v for k, v in refinements.items() if k not in ('version', 'cellLayouts') and v}
    layouts = floor.get('cell_layouts') or refinements.get('cellLayouts') or {}
    if layouts:
        out['cellLayouts'] = layouts
    return out


def migrate_v1(source: dict) -> Tuple[dict, List[str]]:
    """A v1 Compass map (the payload the app saved) as a CompassPlanV2, and the notices to show once.

    Deterministic. Each v1 room becomes one room per connected part. Vertical 50 % splits
    become divided cells; any other saved refinement keeps the plan in legacy mode with the
    refinements carried verbatim in `legacy`. Nothing is deleted.
    """
    if isinstance(source.get('compass_map'), dict):
        source = source['compass_map']
    plot = source.get('plot') or {}
    width_ft, depth_ft = float(plot.get('width_ft') or 40), float(plot.get('depth_ft') or 60)
    plot_type = str(plot.get('type') or 'Middle Plot')
    plot_type = {'Three-side Open': 'Corner Plot'}.get(plot_type, plot_type)
    if plot_type not in PLOT_TYPES:
        plot_type = 'Middle Plot'
    gate = str(plot.get('gate_position') or 'Center').capitalize()
    plan = {
        'schema': SCHEMA, 'version': VERSION,
        'plot': {'widthIn': int(round(width_ft * 12)), 'depthIn': int(round(depth_ft * 12)),
                 'facing': str(plot.get('facing') or 'South').title() if str(plot.get('facing') or 'South').title() in FACINGS else 'South',
                 'gate': gate if gate in GATES else 'Center', 'plotType': plot_type},
        'storeys': 2 if 'multi' in str(plot.get('num_floors') or '').lower() else 1,
        'floors': {}, 'choices': {},
    }
    notices: List[str] = []
    legacy: Dict[str, dict] = {}
    for name, key in (('ground', 'ground_floor'), ('first', 'first_floor')):
        data = source.get(key)
        if not isinstance(data, dict):
            continue
        floor = {'splits': [], 'rooms': []}
        owned = set()
        for placement in data.get('placements') or []:
            use = _use(placement.get('roomId') or '')
            label = placement.get('room') or placement.get('roomLabel') or placement.get('roomId')
            if use is None:
                notices.append(f'"{label}" is not a Compass room type; it is kept with the saved plan details.')
                legacy.setdefault(name, {}).setdefault('unknownRooms', []).append(copy.deepcopy(placement))
                continue
            cells = []
            for cell in placement.get('cells') or placement.get('occupiedCells') or []:
                if cell in CELLS and cell not in owned and cell not in cells:
                    cells.append(cell)
                elif cell in owned:
                    notices.append(f'{cell} was in two rooms; it stays with the first.')
            owned.update(cells)
            parts = components(cells)
            if len(parts) > 1:
                notices.append(f'{LIBRARY[use][0]} was in {len(parts)} separate parts; each part is now its own room.')
            for part in parts:
                floor['rooms'].append({'id': next_room_id(name, floor, use), 'use': use, 'regions': part})
        refinements = _active_refinements(source, key)
        if refinements:
            splits = refinements.get('subCellSplits') if set(refinements) == {'subCellSplits'} else None
            convertible = isinstance(splits, list) and all(
                isinstance(s, dict) and s.get('splitDirection') == 'vertical' and s.get('roomAPct', 50) in (50, None)
                and s.get('parentCell') in CELLS for s in splits) and len({s['parentCell'] for s in splits}) == len(splits)
            if convertible:
                _apply_v1_splits(name, floor, splits, notices)
            else:
                legacy[name] = {**legacy.get(name, {}), 'refinements': copy.deepcopy(refinements)}
        floor['rooms'].sort(key=lambda r: r['id'])
        plan['floors'][name] = floor
    if 'ground' not in plan['floors']:
        plan['floors']['ground'] = {'splits': [], 'rooms': []}
    if legacy:
        plan['legacy'] = {'fromVersion': 1, 'refinements': legacy,
                          'reason': 'Saved plan details from the earlier Refine Map need converting before they can be drawn.'}
    return normalise(plan), notices


def _apply_v1_splits(name: str, floor: dict, splits: List[dict], notices: List[str]) -> None:
    """Vertical 50 % splits: A is the left half, B the right half (the v1 meaning, kept as is)."""
    for split in sorted(splits, key=lambda s: s['parentCell']):
        cell = split['parentCell']
        base = next((r for r in floor['rooms'] if cell in r['regions']), None)
        if base is not None:
            base['regions'] = sorted([k for k in base['regions'] if k != cell] + [f'{cell}.L', f'{cell}.R'])
        floor['splits'] = sorted(set(floor['splits']) | {cell})
        for half, raw in (('L', split.get('roomA')), ('R', split.get('roomB'))):
            key = f'{cell}.{half}'
            use = _use(raw) if raw else None
            if base is not None and use == base['use']:
                continue                                   # Stays with the room that owns the cell.
            if base is not None:
                base['regions'].remove(key)
            if use is None:
                continue                                   # An empty half stays unassigned.
            joined = next((r for r in sorted(floor['rooms'], key=lambda r: r['id'])
                           if r['use'] == use and any(regions_touch(key, k) for k in r['regions'])), None)
            if joined is not None:
                joined['regions'] = sorted(joined['regions'] + [key])
            else:
                floor['rooms'].append({'id': next_room_id(name, floor, use), 'use': use, 'regions': [key]})
    # A half taken from the middle of a room can leave it in two parts: each part becomes a room.
    for room in list(floor['rooms']):
        if not room['regions']:
            floor['rooms'].remove(room)
            continue
        parts = components(room['regions'])
        if len(parts) > 1:
            notices.append(f'{LIBRARY[room["use"]][0]} was divided by a split cell; each part is now its own room.')
            room['regions'] = parts[0]
            for part in parts[1:]:
                floor['rooms'].append({'id': next_room_id(name, floor, room['use']), 'use': room['use'], 'regions': part})


def derive_v1(plan: dict) -> dict:
    """The v1 `compass_map` that legacy readers expect, for plans without divided cells (§4.8)."""
    plan = normalise(plan)
    if any(f['splits'] for f in plan['floors'].values()) or any(
            r['use'] in ('void', 'passage') for f in plan['floors'].values() for r in f['rooms']):
        return {'requires_v2': True}
    width_ft, depth_ft = plan['plot']['widthIn'] / 12, plan['plot']['depthIn'] / 12
    out = {'grid_size': {'rows': ROWS, 'cols': COLS},
           'plot': {'width_ft': width_ft, 'depth_ft': depth_ft, 'facing': plan['plot']['facing'],
                    'type': plan['plot']['plotType'], 'num_floors': 'Multi-Floor' if plan['storeys'] == 2 else 'Single Floor',
                    'gate_position': plan['plot']['gate']},
           'cell_size_ft': {'width': width_ft / COLS, 'depth': depth_ft / ROWS}}
    for name, key in (('ground', 'ground_floor'), ('first', 'first_floor')):
        if name not in plan['floors']:
            continue
        names = labels(plan['floors'][name])
        out[key] = {'placements': [{'room': names[r['id']], 'roomId': r['use'], 'placementId': r['id'], 'cells': r['regions']}
                                   for r in plan['floors'][name]['rooms']]}
    return out
