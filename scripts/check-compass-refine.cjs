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
eq(R.cellView(s.floors.ground, 'r1_c1'), { key: 'r1_c1', split: true, direction: 'left-right', whole: null, left: null, right: null });
s = commit(s, R.assignHalf(s, 'r1_c1.L', { type: 'use', use: 'passage' }));
eq(R.assignHalf(s, 'r1_c1.R', { type: 'use', use: 'living' }).kind, 'refused', 'one living hall per house');
// A room narrower than its use needs is placed with a warning, not refused (B2, decided 16 Oct 2026).
const narrow = R.assignHalf(state(30, 50, { splits: ['r2_c2'], rooms: [] }), 'r2_c2.L', { type: 'use', use: 'bathroom' });
eq([narrow.kind, narrow.short, narrow.floor.rooms.map(r => r.id)], ['commit', { needIn: 47, haveIn: 39 }, ['g-bathroom-1']]);
eq(narrow.message, "Left half: Bathroom. Narrow: 3'-3\" clear; Bathroom needs 3'-11\".");
eq(R.halfShortfall(narrow.floor, 'r2_c2.L', 360, 600), { needIn: 47, haveIn: 39 }, 'the map marks the narrow half');
eq(R.shortfallText('bathroom', { needIn: 47, haveIn: 39 }), "Bathroom: 3'-3\" clear, needs 3'-11\"");
// Only a half under 2'-6" clear refuses: on a 25 ft plot (an older draft divided there) the side-wall half is 2'-1½".
const edge = R.assignHalf(state(25, 60, { splits: ['r2_c1', 'r2_c2'], rooms: [] }), 'r2_c1.L', { type: 'use', use: 'passage' });
eq([edge.kind, edge.haveIn], ['too-narrow', 25.5]);
eq(R.assignHalf(state(25, 60, { splits: ['r2_c1', 'r2_c2'], rooms: [] }), 'r2_c2.L', { type: 'use', use: 'passage' }).kind, 'commit',
  'an inside half of 2\'-7½" takes a passage, with a warning');
// The map's width estimate: a half alone, a half beside a whole cell, two halves across a cell boundary.
eq(R.roomClearWidthIn({ id: 'a', use: 'bedroom', regions: ['r2_c2.L'] }, 480, 720), 54);
eq(R.roomClearWidthIn({ id: 'a', use: 'living', regions: ['r2_c2', 'r2_c3.L'] }, 480, 720), 174);
eq(R.roomClearWidthIn({ id: 'a', use: 'bedroom', regions: ['r2_c2.R', 'r2_c3.L'] }, 480, 720), 114);
eq(R.roomClearWidthIn({ id: 'a', use: 'bedroom', regions: ['r2_c4.R', 'r3_c4.R'] }, 480, 720), 48, 'stacked halves are one half wide');
eq(R.halfShortfall({ splits: ['r2_c3'], rooms: [{ id: 'g-living-1', use: 'living', regions: ['r2_c2', 'r2_c3.L'] }] }, 'r2_c3.L', 480, 720), null,
  'a half that widens a room is judged on the room');
eq(R.assignHalf(state(30, 50, { splits: ['r2_c2'], rooms: [] }), 'r2_c2.L', { type: 'use', use: 'passage' }).kind, 'commit',
  "a 30 ft plot's half cell holds a 3'-3\" passage");
eq(R.halvesUsable(300, 600), false, 'no room fits a half cell on a 25 ft plot');
eq(R.halvesUsable(240, 600), false, 'nor on a 20 ft plot');
eq(R.halvesUsable(360, 600), true);
// The one size limit that refuses: a half under 2'-6" clear. On 25 ft the side-wall halves are 2'-1½" (16 Oct 2026).
eq(R.HALF_MIN_CLEAR_IN, 30);
eq(R.halfClearRangeIn(300, 600), { narrowest: 25.5, widest: 31.5 });
eq(R.halfClearRangeIn(360, 600), { narrowest: 33, widest: 39 });
// SKIP keeps the answer already given (prefilled or from the survey); the first option only when there is none (A1).
const prefilled = { facing: 'West', plotWidth: 40, plotDepth: 60, plotType: 'Middle Plot', numFloors: 'Single Floor', numBedrooms: null, gatePosition: null };
eq(R.skippedAnswer(prefilled, 'plotWidth', 20), { value: 40, kept: true }, 'skipping keeps the prefilled 40 ft');
eq(R.skippedAnswer(prefilled, 'facing', 'North'), { value: 'West', kept: true });
eq(R.skippedAnswer(prefilled, 'gatePosition', 'Left'), { value: 'Left', kept: false }, 'the first option only when nothing is set');
let skipped = { ...R.createInitialState(queue('ground')), foundation: prefilled };
for (const [key, first] of [['facing', 'North'], ['plotWidth', 20], ['plotDepth', 30], ['plotType', 'Corner Plot'], ['numFloors', 'Single Floor'], ['numBedrooms', '1'], ['gatePosition', 'Left']]) {
  skipped = R.compassReducer(skipped, { type: 'SET_FOUNDATION', key, value: R.skippedAnswer(skipped.foundation, key, first).value, total: 7 });
}
eq([skipped.foundation.facing, skipped.foundation.plotWidth, skipped.foundation.plotDepth], ['West', 40, 60], 'skipping every question keeps 40 x 60 West');
// A second bedroom in a narrow half is one question, with the size said in it (A2 with B2): never two questions.
const second = state(40, 60, { splits: ['r3_c3'], rooms: [{ id: 'g-bedroom-1', use: 'bedroom', regions: ['r1_c1'] }] });
const separate = R.assignHalf(second, 'r3_c3.L', { type: 'use', use: 'bedroom' });
eq([separate.kind, separate.short], ['ask-separate', { needIn: 83, haveIn: 54 }]);
eq(separate.message, "Bedroom is elsewhere on this floor. Make a separate Bedroom 2, or choose another room. Narrow: 4'-6\" clear; Bedroom needs 6'-11\".");
eq(R.assignHalf(second, 'r3_c3.L', { type: 'use', use: 'bedroom', separate: true }).kind, 'commit', 'the answer places it');
// B4: the half that joins the rest of a room is known before anything is chosen; the other half is free.
const hall = { splits: [], rooms: [{ id: 'g-living-1', use: 'living', regions: ['r2_c2', 'r2_c3'] }] };
eq(R.halfLinksRoom(hall, 'r2_c3.L')?.id, 'g-living-1', 'the left half of r2_c3 joins r2_c2');
eq(R.halfLinksRoom(hall, 'r2_c3.R'), null);
const kitchenLeft = R.assignHalf(state(40, 60, R.splitCell(hall, 'r2_c3')), 'r2_c3.L', { type: 'use', use: 'kitchen' });
eq([kitchenLeft.kind, kitchenLeft.otherHalf], ['disconnects', 'r2_c3.R']);
const kitchenRight = R.assignHalf(state(40, 60, R.splitCell(hall, 'r2_c3')), 'r2_c3.R', { type: 'use', use: 'kitchen' });
eq([kitchenRight.kind, kitchenRight.short], ['commit', { needIn: 59, haveIn: 54 }], 'scenario 4: one extra selection, with a warning');
// A cell in the middle of a three-cell room: both halves join it, so neither can be given away.
const middle = { splits: [], rooms: [{ id: 'g-living-1', use: 'living', regions: ['r2_c2', 'r2_c3', 'r2_c4'] }] };
eq([R.halfLinksRoom(middle, 'r2_c3.L')?.id, R.halfLinksRoom(middle, 'r2_c3.R')?.id], ['g-living-1', 'g-living-1']);
// A repeated bedroom that does not touch asks; a touching one is extended.
// On a 60 ft plot a half cell is 7'-6" (7'-0" clear): wide enough for a bedroom of its own.
let t = state(60, 60, { splits: ['r3_c3'], rooms: [{ id: 'g-bedroom-1', use: 'bedroom', regions: ['r1_c1'] }] });
const narrowBedroom = R.assignHalf(state(40, 60, t.floors.ground), 'r3_c3.L', { type: 'use', use: 'bedroom', separate: true });
eq([narrowBedroom.kind, narrowBedroom.short], ['commit', { needIn: 83, haveIn: 54 }],
  'on a 40 ft plot the same half takes a separate bedroom with a warning (B2)');
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
const newer = Draft.parseDraft(JSON.stringify({ ...JSON.parse(raw), version: 4 }), queue);
eq(newer.newer, true, 'a newer draft opens read-only');
const copy = Draft.backendCopy(s);
eq(copy.compass_map.requires_v2, true);
eq(copy.compass_map.plot.gate_position, 'Left');
console.log(`Compass Refine rules: ${checks} checks passed (placement, divided cells, whole cell, open to below, drafts, migration).`);
