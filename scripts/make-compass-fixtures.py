"""Writes the shared Compass fixtures F3-F15. Plans are compact here; edit, then rerun:

    python/.venv/bin/python scripts/make-compass-fixtures.py python/tests/fixtures/compass

F1 and F2 are written by hand. Expectations are checked by python/tests/test_compass_geometry.py
and scripts/check-compass-plan.cjs (the schema part, in TypeScript).
"""
import json, sys
from pathlib import Path
OUT = Path(sys.argv[1])

def plan(w_ft, d_ft, facing, gate, ground, first=None, splits=None, storeys=None, choices=None, plot_type='Middle Plot', **plot):
    def floor(prefix, rooms, sp):
        counts, out = {}, []
        for use, regions in rooms:
            counts[use] = counts.get(use, 0) + 1
            out.append({'id': f'{prefix}-{use}-{counts[use]}', 'use': use, 'regions': sorted(regions)})
        return {'splits': sorted(sp or []), 'rooms': sorted(out, key=lambda r: r['id'])}
    splits = splits or {}
    p = {'schema': 'gazeconnect.compass-plan', 'version': 2,
         'plot': {'widthIn': w_ft * 12, 'depthIn': d_ft * 12, 'facing': facing, 'gate': gate, 'plotType': plot_type, **plot},
         'storeys': storeys or (2 if first is not None else 1),
         'floors': {'ground': floor('g', ground, splits.get('ground'))}, 'choices': choices or {}}
    if first is not None:
        p['floors']['first'] = floor('f', first, splits.get('first'))
    return p

def write(name, data):
    (OUT / name).write_text(json.dumps(data, indent=1) + '\n')

# F3: dividing an occupied cell; and the change that would cut a room in two.
write('f03_split_occupied.json', {'id': 'F3', 'title': 'Dividing a cell that a room already owns', 'cases': [
 {'name': 'living-keeps-left-half', 'plan': plan(40, 60, 'South', 'Center',
   [('porch', ['r1_c2']), ('living', ['r2_c2', 'r2_c3.L']), ('bathroom', ['r2_c3.R'])], splits={'ground': ['r2_c3']}),
  'expect': {'issues': [], 'labels': {'g-living-1': 'Living Hall', 'g-bathroom-1': 'Bathroom'},
             'regionsIn': {'r2_c3.L': [240, 180, 300, 360], 'r2_c3.R': [300, 180, 360, 360]},
             'areasSqft': {'g-living-1': 225, 'g-bathroom-1': 75},
             'kernel': {'boundaries': [['g-living-1', 'g-bathroom-1', 'partition', 'privacy']],
                        'nodes': [['h', 180, 300], ['h', 360, 300]], 'doors': [['g-living-1', 'g-bathroom-1', 'bath']]}}},
 {'name': 'disconnecting-left-half', 'plan': plan(40, 60, 'South', 'Center',
   [('porch', ['r1_c2']), ('living', ['r2_c2', 'r2_c3.R']), ('bathroom', ['r2_c3.L'])], splits={'ground': ['r2_c3']}),
  'expect': {'issues': ['room-disconnected:g-living-1']}},
]})

# F4: divided cells beside whole cells and beside other divided cells (T-junctions).
write('f04_t_junctions.json', {'id': 'F4', 'title': 'Divided cells beside whole and divided cells', 'cases': [
 {'name': 'passage-spine', 'plan': plan(40, 60, 'South', 'Center',
   [('porch', ['r1_c2']), ('living', ['r2_c2.L']), ('passage', ['r2_c2.R', 'r3_c2.R']), ('bedroom', ['r3_c2.L']),
    ('bathroom', ['r2_c3.L']), ('dining', ['r2_c3.R'])], splits={'ground': ['r2_c2', 'r2_c3', 'r3_c2']}),
  'expect': {'issues': [], 'labels': {'g-passage-1': 'Passage'},
             'kernel': {'boundaries': [['g-living-1', 'g-passage-1', 'open', 'circulation'],
                                       ['g-bedroom-1', 'g-passage-1', 'partition', 'privacy'],
                                       ['g-bathroom-1', 'g-passage-1', 'partition', 'privacy']],
                        'nodes': [['h', 180, 180], ['h', 540, 180], ['h', 180, 300]],
                        'doors': [['g-passage-1', 'g-bedroom-1', 'internal'], ['g-passage-1', 'g-bathroom-1', 'bath']]}}},
]})

# F5: one kitchen over three cells in an L.
write('f05_l_kitchen.json', {'id': 'F5', 'title': 'Multi-cell L-shaped kitchen', 'cases': [
 {'name': 'l-kitchen', 'plan': plan(40, 60, 'South', 'Center',
   [('porch', ['r1_c2']), ('living', ['r2_c2', 'r2_c3']), ('kitchen', ['r3_c2', 'r3_c3', 'r4_c3'])]),
  'expect': {'issues': [], 'areasSqft': {'g-kitchen-1': 450}, 'kernel': {'lShaped': ['g-kitchen-1'],
             'boundaries': [['g-living-1', 'g-kitchen-1', 'open', 'kitchen-open']]}}},
]})

# F6: the open-plan decisions with the drawing room open/separate and the kitchen open/closed.
F6 = [('porch', ['r1_c1']), ('staircase', ['r2_c1']), ('living', ['r2_c2']), ('dining', ['r2_c3']), ('drawing', ['r2_c4']),
      ('kitchen', ['r3_c3']), ('bedroom', ['r3_c1']), ('bathroom', ['r3_c2']), ('lawn', ['r1_c2', 'r1_c3', 'r1_c4'])]
cases = []
for drawing in (None, 'separate'):
    for kitchen in (None, 'closed'):
        choices = {}
        if drawing: choices['drawingRoom'] = drawing
        if kitchen: choices['kitchen'] = kitchen
        b = [['g-living-1', 'g-dining-1', 'open', 'open-plan'], ['g-staircase-1', 'g-living-1', 'open', 'open-plan'],
             ['g-dining-1', 'g-drawing-1', 'partition' if drawing else 'open', 'drawing-separate' if drawing else 'open-plan'],
             ['g-dining-1', 'g-kitchen-1', 'partition' if kitchen else 'open', 'kitchen-closed' if kitchen else 'kitchen-open'],
             ['g-bedroom-1', 'g-staircase-1', 'partition', 'privacy'], ['g-bathroom-1', 'g-kitchen-1', 'partition', 'hygiene'],
             ['g-bedroom-1', 'g-bathroom-1', 'partition', 'privacy'], ['g-living-1', 'g-bathroom-1', 'partition', 'privacy']]
        cases.append({'name': f'drawing-{drawing or "open"}-kitchen-{kitchen or "open"}',
                      'plan': plan(40, 60, 'North', 'Left', F6, choices=choices),
                      'expect': {'issues': [], 'kernel': {'boundaries': b}}})
write('f06_open_plan.json', {'id': 'F6', 'title': 'Open plan: living, dining, kitchen and stair hall without walls', 'cases': cases})

# F7: the stair core on both floors.
g7 = [('porch', ['r1_c1']), ('staircase', ['r2_c1', 'r3_c1']), ('living', ['r2_c2', 'r2_c3']), ('kitchen', ['r3_c2', 'r3_c3']),
      ('bedroom', ['r2_c4']), ('bathroom', ['r3_c4']), ('lawn', ['r1_c2', 'r1_c3', 'r1_c4'])]
write('f07_stair.json', {'id': 'F7', 'title': 'Stair core: aligned, misaligned, too small, with dining', 'cases': [
 {'name': 'aligned', 'plan': plan(40, 60, 'North', 'Left', g7,
   [('ff_stairLanding', ['r2_c1', 'r3_c1']), ('ff_living', ['r2_c2', 'r2_c3']), ('ff_master', ['r3_c2', 'r3_c3']), ('ff_bathroom', ['r3_c4'])]),
  'expect': {'issues': [], 'kernel': {'stair': 'aligned'}}},
 {'name': 'misaligned', 'plan': plan(40, 60, 'North', 'Left', g7,
   [('ff_stairLanding', ['r2_c4']), ('ff_living', ['r2_c2', 'r2_c3']), ('ff_master', ['r3_c2', 'r3_c3'])]),
  'expect': {'issues': [], 'kernel': {'stair': 'misaligned', 'notes': ['stair-misaligned']}}},
 {'name': 'host-too-small', 'plan': plan(20, 30, 'North', 'Left',
   [('porch', ['r1_c1']), ('staircase', ['r2_c1']), ('living', ['r2_c2', 'r2_c3']), ('kitchen', ['r3_c2'])]),
  'expect': {'issues': [], 'kernel': {'stair': 'none', 'notes': ['stair-no-fit']}}},
 {'name': 'dining-and-stair', 'plan': plan(40, 60, 'North', 'Left',
   [('porch', ['r1_c1']), ('living', ['r2_c1']), ('diningStaircase', ['r2_c2', 'r3_c2']), ('kitchen', ['r3_c3']), ('lawn', ['r1_c2'])]),
  'expect': {'issues': [], 'kernel': {'stair': 'ground-only'}}},
]})

# F8: a first floor that is only begun; F9: one storey whose stair reaches the roof.
F1 = json.loads((OUT / 'f01_asymmetric_30x50.json').read_text())['plan']
f8 = json.loads(json.dumps(F1))
f8['floors']['first'] = {'splits': [], 'rooms': [{'id': 'f-ff_living-1', 'use': 'ff_living', 'regions': ['r2_c2']},
                                                  {'id': 'f-ff_stairLanding-1', 'use': 'ff_stairLanding', 'regions': ['r2_c1', 'r3_c1']}]}
write('f08_incomplete_first.json', {'id': 'F8', 'title': 'Incomplete first floor', 'cases': [
 {'name': 'begun', 'plan': f8, 'expect': {'issues': [], 'kernel': {'notes': ['unassigned'], 'roofBelow': True}}}]})
f9 = plan(40, 60, 'East', 'Center', [('porch', ['r1_c2']), ('staircase', ['r2_c2']), ('living', ['r2_c3']), ('kitchen', ['r3_c3']),
                                     ('bedroom', ['r3_c2']), ('bathroom', ['r3_c1']), ('lawn', ['r1_c3'])])
write('f09_roof_access.json', {'id': 'F9', 'title': 'Ground floor only, stair to the roof', 'cases': [
 {'name': 'roof', 'plan': f9, 'expect': {'issues': [], 'kernel': {'roofAccess': True, 'notes': ['roof-access']}}}]})

# F10: two bedrooms side by side stay two rooms.
write('f10_two_bedrooms.json', {'id': 'F10', 'title': 'Two adjacent bedrooms', 'cases': [
 {'name': 'two', 'plan': plan(40, 60, 'West', 'Right', [('porch', ['r1_c4']), ('living', ['r2_c3', 'r2_c4']), ('passage', ['r2_c2']),
                                                         ('bedroom', ['r3_c1']), ('bedroom', ['r3_c2']), ('bathroom', ['r2_c1'])]),
  'expect': {'issues': [], 'labels': {'g-bedroom-1': 'Bedroom 1', 'g-bedroom-2': 'Bedroom 2'},
             'kernel': {'boundaries': [['g-bedroom-1', 'g-bedroom-2', 'partition', 'privacy']]}}}]})

# F11: a 20 ft plot, where a half cell is too narrow for any room.
write('f11_narrow.json', {'id': 'F11', 'title': '20 ft narrow plot', 'cases': [
 {'name': 'half-bath', 'plan': plan(20, 40, 'South', 'Center', [('porch', ['r1_c2', 'r1_c3']), ('living', ['r2_c2', 'r2_c3']),
                                                                 ('bathroom', ['r3_c2.L']), ('kitchen', ['r3_c3'])],
                                    splits={'ground': ['r3_c2']}),
  'expect': {'issues': [], 'regionsIn': {'r3_c2.L': [60, 240, 90, 360]}, 'kernel': {'notes': ['size-short']}}}]})

# F12: drafts saved before version 2.
def v1(placements, refinements=None):
    floor = {'placements': [{'roomId': r, 'room': r, 'cells': c} for r, c in placements]}
    if refinements is not None:
        floor['advanced_refinements'] = refinements
    return {'grid_size': {'rows': 4, 'cols': 4}, 'plot': {'width_ft': 40, 'depth_ft': 60, 'facing': 'East', 'type': 'Middle Plot',
            'num_floors': 'Single Floor', 'gate_position': 'Center'}, 'ground_floor': floor}
base = [('porch', ['r1_c2']), ('living', ['r2_c2', 'r2_c3'])]
write('f12_legacy_v1.json', {'id': 'F12', 'title': 'Version 1 drafts: convertible split, horizontal split, custom edges', 'cases': [
 {'name': 'vertical-50', 'v1': v1(base, {'version': 2, 'subCellSplits': [{'parentCell': 'r2_c3', 'splitDirection': 'vertical',
   'roomA': 'living', 'roomB': 'commonBath', 'roomAPct': 50}]}),
  'plan': plan(40, 60, 'East', 'Center', [('porch', ['r1_c2']), ('living', ['r2_c2', 'r2_c3.L']), ('bathroom', ['r2_c3.R'])],
               splits={'ground': ['r2_c3']}), 'expect': {'issues': [], 'notices': 0, 'legacy': False}},
 {'name': 'horizontal', 'v1': v1(base, {'version': 2, 'subCellSplits': [{'parentCell': 'r2_c3', 'splitDirection': 'horizontal',
   'roomA': 'living', 'roomB': 'bathroom'}]}), 'expect': {'issues': [], 'legacy': True}},
 {'name': 'custom-edges', 'v1': v1(base, {'version': 2, 'customEdges': [{'id': 'e1', 'boundary': ['r2_c2', 'r2_c3'],
   'cells': ['r2_c2', 'r2_c3'], 'type': 'no_wall'}]}), 'expect': {'issues': [], 'legacy': True}},
 {'name': 'disconnected-bedroom', 'v1': v1([('porch', ['r1_c2']), ('bedroom', ['r2_c1', 'r2_c4'])]),
  'plan': plan(40, 60, 'East', 'Center', [('porch', ['r1_c2']), ('bedroom', ['r2_c1']), ('bedroom', ['r2_c4'])]),
  'expect': {'issues': [], 'notices': 1, 'legacy': False, 'labels': {'g-bedroom-1': 'Bedroom 1', 'g-bedroom-2': 'Bedroom 2'}}},
]})

# F15: C2, open plan with a double-height living hall (docs/compass-refine/evidence/scripts/c2_spec.json).
c2g = [('porch', ['r1_c1']), ('lawn', ['r1_c2', 'r1_c3', 'r1_c4']), ('staircase', ['r2_c1']), ('living', ['r2_c2', 'r2_c3']),
       ('drawing', ['r2_c4']), ('bedroom', ['r3_c1']), ('bathroom', ['r3_c2']), ('dining', ['r3_c3']), ('kitchen', ['r3_c4']),
       ('backyard', ['r4_c1', 'r4_c2', 'r4_c3', 'r4_c4'])]
c2f = [('ff_stairLanding', ['r2_c1']), ('ff_living', ['r2_c2']), ('void', ['r2_c3']), ('ff_terrace', ['r2_c4']),
       ('ff_bathroom', ['r3_c1']), ('ff_master', ['r3_c2', 'r3_c3', 'r3_c4'])]
write('f15_double_height.json', {'id': 'F15', 'title': 'C2: open plan with a double-height living hall', 'cases': [
 {'name': 'c2', 'plan': plan(40, 60, 'North', 'Left', c2g, c2f, choices={'drawingRoom': 'separate'}),
  'expect': {'issues': [], 'labels': {'f-void-1': 'Open to below'},
             'kernel': {'doubleHeight': ['g-living-1'], 'boundaries': [
                 ['f-ff_living-1', 'f-void-1', 'rail', 'gallery'], ['f-ff_master-1', 'f-void-1', 'partition', 'void-privacy'],
                 ['f-void-1', 'f-ff_terrace-1', 'exterior', 'double-height'], ['g-living-1', 'g-dining-1', 'open', 'open-plan'],
                 ['g-kitchen-1', 'g-drawing-1', 'partition', 'drawing-separate'],
                 ['g-staircase-1', 'g-living-1', 'open', 'open-plan'], ['g-dining-1', 'g-kitchen-1', 'open', 'kitchen-open']],
                 'tallGlazing': True, 'notes': ['double-height']}}},
 {'name': 'half-void-passage', 'plan': plan(40, 60, 'North', 'Left', c2g,
   [('ff_stairLanding', ['r2_c1']), ('ff_living', ['r2_c2']), ('passage', ['r2_c3.L']), ('void', ['r2_c3.R']),
    ('ff_terrace', ['r2_c4']), ('ff_bathroom', ['r3_c1']), ('ff_master', ['r3_c2', 'r3_c3', 'r3_c4'])], splits={'first': ['r2_c3']},
   choices={'drawingRoom': 'separate'}),
  'expect': {'issues': [], 'kernel': {'boundaries': [['f-passage-1', 'f-void-1', 'rail', 'gallery'],
                                                     ['f-ff_living-1', 'f-passage-1', 'open', 'circulation']]}}},
 {'name': 'void-cuts-route', 'plan': plan(40, 60, 'North', 'Left', c2g,
   [('ff_stairLanding', ['r2_c1']), ('ff_living', ['r2_c2']), ('void', ['r2_c3']), ('ff_bed2', ['r3_c3']),
    ('ff_master', ['r3_c1', 'r3_c2']), ('ff_bathroom', ['r3_c4'])]),
  'expect': {'issues': [], 'kernel': {'notes': ['void-cuts-route', 'unreachable'],
             'adjustment': {'code': 'void-cuts-route', 'cell': 'r2_c3', 'halves': {'L': 'passage', 'R': 'void'}}}}},
 {'name': 'void-over-bedroom', 'plan': plan(40, 60, 'North', 'Left', c2g,
   [('ff_stairLanding', ['r2_c1']), ('ff_living', ['r2_c2']), ('void', ['r3_c1']), ('ff_master', ['r3_c2', 'r3_c3', 'r3_c4'])]),
  'expect': {'issues': ['void-below:f-void-1']}},
]})
print('written')
