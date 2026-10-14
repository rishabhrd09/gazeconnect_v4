/** Refine and placement rules of the Compass map (IMPLEMENTATION_PLAN.md §5.3), on the pure state functions.
 * No browser: src/utils/compassReducer.ts and compassDraft.ts, transpiled. The dwell and layout checks of the
 * focus view and picker are in scripts/check-design-layout.cjs (browser). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const R = require('../src/utils/compassReducer.ts');
const P = require('../src/utils/compassPlan.ts');
const Draft = require('../src/utils/compassDraft.ts');

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const queue = floor => P.CATALOGUE[floor].map(id => ({ roomId: id, roomLabel: P.PLAN_LIBRARY[id].label, shortLabel: id, color: '#888', expandable: false }));
function state(widthFt = 40, depthFt = 60, ground = { splits: [], rooms: [] }, first = { splits: [], rooms: [] }, floor = 'ground') {
  const s = R.createInitialState(queue(floor));
  return { ...s, phase: 'placement', currentFloor: floor, armed: true, numFloors: 'Multi-Floor',
    foundation: { ...s.foundation, facing: 'North', plotWidth: widthFt, plotDepth: depthFt, plotType: 'Middle Plot', gatePosition: 'Left' },
    floors: { ground, first }, componentQueue: queue(floor) };
}
const commit = (s, outcome) => {
  assert.equal(outcome.kind, 'commit', outcome.message); checks++;
  return R.compassReducer(s, { type: 'COMMIT_FLOOR', floor: outcome.floor, activeRoomId: outcome.roomId ?? null });
};
const rooms = s => Object.fromEntries(s.floors[s.currentFloor].rooms.map(r => [r.id, r.regions.join(' ')]));

// Placement: whole cells, identity, connectivity, repeats.
let s = state();
s = commit(s, R.placeCell(s, 'r2_c2', 'living'));
s = commit(s, R.placeCell(s, 'r2_c3', 'living'));
eq(rooms(s), { 'g-living-1': 'r2_c2 r2_c3' });
eq(R.placeCell(s, 'r4_c4', 'living').kind, 'refused', 'a living hall is one connected room');
s = commit(s, R.placeCell(s, 'r2_c4', 'living'));
eq(R.placeCell(s, 'r2_c3', 'living').kind, 'refused', 'removing the middle cell would cut it in two');
s = commit(s, R.placeCell(s, 'r3_c1', 'bedroom'));
s = commit(s, R.placeCell(s, 'r3_c3', 'bedroom'));              // Not touching: a second, separate bedroom.
eq(rooms(s)['g-bedroom-2'], 'r3_c3');
eq(P.planLabels(s.floors.ground)['g-bedroom-2'], 'Bedroom 2');
const replace = R.placeCell(s, 'r2_c4', 'kitchen');
eq(replace.kind, 'confirm-replace', 'an occupied cell asks first');
s = commit(s, R.placeCell(s, 'r2_c4', 'kitchen', true));
eq(rooms(s)['g-living-1'], 'r2_c2 r2_c3');

// Refine: an occupied cell divided, the right half given away, the left half kept (F3).
s = R.compassReducer(s, { type: 'COMMIT_FLOOR', floor: R.splitCell(s.floors.ground, 'r2_c3') });
eq(rooms(s)['g-living-1'], 'r2_c2 r2_c3.L r2_c3.R', 'a new split changes no geometry');
const cut = R.assignHalf(s, 'r2_c3.L', { type: 'use', use: 'bathroom' });
eq(cut.kind, 'disconnects', 'giving the left half away would cut the living hall in two');
s = commit(s, R.assignHalf(s, 'r2_c3.R', { type: 'use', use: 'bathroom' }));
eq(rooms(s)['g-living-1'], 'r2_c2 r2_c3.L');
eq(rooms(s)['g-bathroom-1'], 'r2_c3.R');
// Both halves the same room, then made whole again.
eq(R.wholeOptions(s.floors.ground, 'r2_c3').map(o => o.label), ['Whole cell: Living Hall (removes Bathroom)', 'Whole cell: Bathroom'],
  'a room losing its only region is named');
const undone = R.compassReducer(s, { type: 'UNDO' });
eq(rooms(undone)['g-living-1'], 'r2_c2 r2_c3.L r2_c3.R', 'undo restores the step before');
eq(R.placeCell(s, 'r2_c3', 'dining').kind, 'refused', 'a divided cell is changed with Refine');

// An empty cell: halves assigned one at a time, partial assignment allowed; too narrow halves refused.
s = R.compassReducer(s, { type: 'COMMIT_FLOOR', floor: R.splitCell(s.floors.ground, 'r1_c1') });
eq(R.cellView(s.floors.ground, 'r1_c1'), { key: 'r1_c1', split: true, whole: null, left: null, right: null });
s = commit(s, R.assignHalf(s, 'r1_c1.L', { type: 'use', use: 'passage' }));
eq(R.assignHalf(s, 'r1_c1.R', { type: 'use', use: 'living' }).kind, 'refused', 'one living hall per house');
const narrow = R.assignHalf(state(30, 50, { splits: ['r2_c2'], rooms: [] }), 'r2_c2.L', { type: 'use', use: 'bathroom' });
eq(narrow.kind, 'too-narrow');
eq(R.assignHalf(state(30, 50, { splits: ['r2_c2'], rooms: [] }), 'r2_c2.L', { type: 'use', use: 'passage' }).kind, 'commit',
  "a 30 ft plot's half cell holds a 3'-3\" passage");
eq(R.halvesUsable(300, 600), false, 'no room fits a half cell on a 25 ft plot');
eq(R.halvesUsable(360, 600), true);
// A repeated bedroom that does not touch asks; a touching one is extended.
// On a 60 ft plot a half cell is 7'-6" (7'-0" clear): wide enough for a bedroom of its own.
let t = state(60, 60, { splits: ['r3_c3'], rooms: [{ id: 'g-bedroom-1', use: 'bedroom', regions: ['r1_c1'] }] });
eq(R.assignHalf(state(40, 60, t.floors.ground), 'r3_c3.L', { type: 'use', use: 'bedroom', separate: true }).kind, 'too-narrow',
  'on a 40 ft plot the same half is too narrow for a separate bedroom');
eq(R.assignHalf(t, 'r3_c3.L', { type: 'use', use: 'bedroom' }).kind, 'ask-separate');
t = commit(t, R.assignHalf(t, 'r3_c3.L', { type: 'use', use: 'bedroom', separate: true }));
eq(rooms(t)['g-bedroom-2'], 'r3_c3.L');
t = commit(t, R.assignHalf(t, 'r3_c3.R', { type: 'use', use: 'bedroom' }));
eq(rooms(t)['g-bedroom-2'], 'r3_c3.L r3_c3.R', 'the touching bedroom grows: same room, no wall');
eq(R.wholeOptions(t.floors.ground, 'r3_c3').map(o => o.label), ['Whole cell: Bedroom 2']);
t = R.compassReducer(t, { type: 'COMMIT_FLOOR', floor: R.wholeCell(t.floors.ground, 'r3_c3', 'g-bedroom-2') });
eq(rooms(t)['g-bedroom-2'], 'r3_c3');
eq(t.floors.ground.splits, []);

// Open to below only over the living hall, dining or stair hall (§7.7).
const ground = { splits: [], rooms: [{ id: 'g-living-1', use: 'living', regions: ['r2_c2', 'r2_c3'] }, { id: 'g-bedroom-1', use: 'bedroom', regions: ['r3_c1'] }] };
let u = state(40, 60, ground, { splits: [], rooms: [] }, 'first');
eq(R.placeCell(u, 'r3_c1', 'void', false, ground).kind, 'refused');
u = commit(u, R.placeCell(u, 'r2_c3', 'void', false, ground));
eq(rooms(u)['f-void-1'], 'r2_c3');

// The canonical plan: valid, a split plan needs v2 readers, drafts round-trip, v1 drafts migrate.
const plan = P.normalisePlan(R.planFromState(s));
eq(plan.floors.ground.splits, ['r1_c1', 'r2_c3']);
eq(P.deriveV1(plan), { requires_v2: true });
const raw = JSON.stringify(Draft.draftFromState(s));
const back = Draft.parseDraft(raw, queue);
eq(back.state.floors, s.floors, 'a draft round-trips its floors');
eq(back.fromV1, false);
const v1 = { version: 1, state: { phase: 'placement', currentFloor: 'ground', foundationStep: 7, numFloors: 'Single Floor', currentIndex: 2,
  foundation: { facing: 'East', plotWidth: 40, plotDepth: 60, plotType: 'Middle Plot', numFloors: 'Single Floor', numBedrooms: '2', gatePosition: 'Center' },
  grid: {}, componentQueue: [], placements: [{ placementId: 'p1', roomId: 'living', roomLabel: 'Living Hall', occupiedCells: ['r2_c2', 'r2_c3'] },
    { placementId: 'p2', roomId: 'bedroom', roomLabel: 'Bedroom', occupiedCells: ['r1_c1', 'r4_c4'] }] },
  advancedFloorMetadata: { gnd: { advanced_refinements: { version: 2, subCellSplits: [{ parentCell: 'r2_c3', splitDirection: 'vertical', roomA: 'living', roomB: 'commonBath', roomAPct: 50 }] } } } };
const migrated = Draft.parseDraft(JSON.stringify(v1), queue);
eq(migrated.fromV1, true);
eq(migrated.state.floors.ground.splits, ['r2_c3']);
eq(Object.fromEntries(migrated.state.floors.ground.rooms.map(r => [r.id, r.regions.join(' ')])),
  { 'g-bathroom-1': 'r2_c3.R', 'g-bedroom-1': 'r1_c1', 'g-bedroom-2': 'r4_c4', 'g-living-1': 'r2_c2 r2_c3.L' });
eq(migrated.notices.length, 1, 'the bedroom in two parts is announced once');
// A v1 draft saved on the first floor, with details on both floors: each floor keeps its own, read-only, until converted.
const twoFloors = { version: 1, state: { phase: 'placement', currentFloor: 'first', foundationStep: 7, numFloors: 'Multi-Floor', currentIndex: 0,
  foundation: { facing: 'South', plotWidth: 40, plotDepth: 60, plotType: 'Middle Plot', numFloors: 'Multi-Floor', gatePosition: 'Right' },
  grid: {}, componentQueue: [], placements: [{ placementId: 'f1', roomId: 'ff_master', roomLabel: '1F Master Bedroom', occupiedCells: ['r4_c1'] }],
  groundFloorData: { placements: [{ placementId: 'g1', roomId: 'living', roomLabel: 'Living Hall', occupiedCells: ['r1_c1', 'r1_c2'] }] } },
  advancedFloorMetadata: {
    gnd: { advanced_refinements: { customEdges: [{ id: 'w', cells: ['r1_c1', 'r1_c2'], type: 'full_wall' }] } },
    '1f': { advanced_refinements: { voidMarkers: [{ cell: 'r1_c2', type: 'open_to_below' }] }, cell_layouts: { r4_c1: 'top' } } } };
const both = Draft.parseDraft(JSON.stringify(twoFloors), queue);
eq(both.state.currentFloor, 'first');
eq(both.state.floors.ground.rooms.map(r => r.id), ['g-living-1'], 'the ground floor comes from groundFloorData');
eq(both.state.floors.first.rooms.map(r => r.id), ['f-ff_master-1']);
eq(both.state.legacy.refinements.ground.refinements.customEdges.length, 1);
eq(both.state.legacy.refinements.first.refinements.voidMarkers.length, 1);
eq(both.state.legacy.refinements.first.refinements.cellLayouts, { r4_c1: 'top' });
eq(both.state.legacy.converted, undefined, 'saved details stay locked until the person converts the map');
const converted = R.compassReducer(both.state, { type: 'CONVERT_LEGACY' });
eq(converted.legacy.converted, true);
eq(converted.legacy.refinements, both.state.legacy.refinements, 'converting deletes nothing');
eq(converted.floors, both.state.floors, 'converting changes no room');
const newer = Draft.parseDraft(JSON.stringify({ ...JSON.parse(raw), version: 3 }), queue);
eq(newer.newer, true, 'a newer draft opens read-only');
const copy = Draft.backendCopy(s);
eq(copy.compass_map.requires_v2, true);
eq(copy.compass_map.plot.gate_position, 'Left');
console.log(`Compass Refine rules: ${checks} checks passed (placement, divided cells, whole cell, open to below, drafts, migration).`);
