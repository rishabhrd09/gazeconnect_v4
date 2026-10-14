"""Build the FloorForge project equivalent to the shared C1 spec (read-only use of FloorForge).

Usage: <FloorForge .venv python> build_ff_c1.py <FloorForge root> <spec.json> <out project.json>
Rooms sit on the same cell lines as GazeConnect's 10 x 15 ft cells for rows 2-4. FloorForge's own
conventions are kept: uniform 150 mm wall allowance, clear-room polygons, linked U stair, and its
explicit "Suggest doors & windows" aid. Row 1 becomes FloorForge's 15 ft front setback.
"""
import json
import sys
from pathlib import Path

root, spec_path, out_path = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path.insert(0, str(root))
from shapely.geometry import box  # noqa: E402
from shapely.ops import unary_union  # noqa: E402
from floorforge.intent import fuse  # noqa: E402
from floorforge.plan_tools import suggest_openings  # noqa: E402
from floorforge.spaces import SPACE_REGISTRY  # noqa: E402

FT = 304.8
spec = json.loads(spec_path.read_text())
W = round(spec['plot']['width_ft'] * FT)            # 12192
D = round(spec['plot']['depth_ft'] * FT)            # 18288
FRONT = REAR = round(15 * FT)                       # row 1 / row 4 = setbacks, 4572 each
WB, DB = W, D - FRONT - REAR                        # buildable 12192 x 9144 (rows 2-3)
T = 150
# GazeConnect cell lines in buildable-local mm; outer lines moved in by T/2 as FloorForge's
# own "Turn cells into rooms" grid does, interior lines unchanged.
XS = [T / 2, 3048, 6096, 9144, WB - T / 2]
YS = [T / 2, 4572, DB - T / 2]                      # rows 2, 3


def cell_box(key):
    r, c = int(key[1]), int(key[4])
    return box(XS[c - 1], YS[r - 2], XS[c], YS[r - 1])


def rooms_for(floor_index, entries):
    rooms = []
    for e in entries:
        if not e['ff']:
            continue
        poly = unary_union([cell_box(k) for k in e['cells']])
        if SPACE_REGISTRY[e['ff']]['enclosed']:
            poly = poly.buffer(-T / 2, join_style=2)
        pts = [[round(x, 3), round(y, 3)] for x, y in list(poly.exterior.coords)[:-1]]
        rooms.append({'id': f"f{floor_index}-{e['gc']}", 'kind': e['ff'], 'name': e['ffName'], 'polygon': pts})
    return rooms


floors = [{'id': f'floor-{i}', 'rooms': rooms_for(i, spec[key]), 'walls': [], 'openings': []}
          for i, key in enumerate(('ground', 'first'))]
# Authored as a FloorForge user would: the entry opens onto the stair's front landing, and the
# stair hall reaches the living/family room from that landing (doors cannot use the rear side).
floors[0]['openings'] += [
    {'id': 'entry-main', 'roomId': 'f0-staircase', 'side': 'front', 'kind': 'entry', 'offset': 1250, 'width': 1000},
    {'id': 'g-stair-living', 'roomId': 'f0-staircase', 'side': 'right', 'kind': 'door', 'offset': 100, 'width': 900}]
floors[1]['openings'] += [
    {'id': 'f-stair-family', 'roomId': 'f1-ff_stairLanding', 'side': 'right', 'kind': 'door', 'offset': 100, 'width': 900}]
stair_ids = [r['id'] for fl in floors for r in fl['rooms'] if r['kind'] == 'stair']
plan = {'schema': 'floorforge.custom-plan/1', 'units': 'mm', 'wallThickness': T, 'floors': floors,
        'stairs': [{'id': 'main-stair', 'roomIds': stair_ids, 'flightWidth': 1000, 'well': 200,
                    'landing': 1050, 'tread': 250}]}
brief = {
    'title': 'C1 comparison house', 'width_mm': W, 'depth_mm': D, 'road_bearing_deg': 0.0,
    'bedrooms': 3, 'storeys': 2, 'budget_lakh': 65.0, 'attached_baths': 'all', 'style': 'warm',
    'finish': 'standard', 'open_kitchen': False, 'parking': False, 'pooja': False, 'eldercare': False,
    'vastu': 'off', 'front_mm': FRONT, 'rear_mm': REAR, 'left_mm': 0, 'right_mm': 0,
    'latitude': 22.72, 'longitude': 75.86, 'timezone_hours': 5.5, 'solar_date': '2026-03-21',
    'solar_hour': 15.0, 'soil': 'unknown', 'plinth_mm': 450, 'floor_height_mm': 3048,
    'rate_low_inr_ft2': 2000.0, 'rate_high_inr_ft2': 2800.0, 'cost_contingency_pct': 10.0, 'variant': 0,
    'exterior_theme': 'modern_tropical', 'interior_theme': 'bright_natural',
    'change_policy': 'exterior_refinement', 'interior_layout_locked': True, 'seed': 0, 'theme_version': '1',
    'roof_access': True,
}
project = {'schema': 'floorforge.project/0.3', 'brief': brief, 'customPlan': plan}
suggested = suggest_openings(fuse(project))
project['customPlan'] = suggested['customPlan']
out_path.write_text(json.dumps(project, indent=1))
print(json.dumps({'message': suggested['message'],
                  'rooms': {fl['id']: len(fl['rooms']) for fl in floors},
                  'openings': {fl['id']: len(fl['openings']) for fl in project['customPlan']['floors']}}))
