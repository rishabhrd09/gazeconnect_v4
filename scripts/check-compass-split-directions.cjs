/** Split directions: real editor rules, save/backend round trips and TypeScript/Python parity. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {spawnSync} = require('node:child_process');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, file);
const P = require('../src/utils/compassPlan.ts'), R = require('../src/utils/compassReducer.ts'), D = require('../src/utils/compassDraft.ts');
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const queue = floor => P.CATALOGUE[floor].map(roomId => ({roomId, roomLabel: P.PLAN_LIBRARY[roomId].label}));
const base = () => ({...R.createInitialState(queue('ground')), phase: 'placement', numFloors: 'Multi-Floor',
  foundation: {facing: 'West', plotWidth: 60, plotDepth: 40, plotType: 'Independent', gatePosition: 'Center'}});
const commit = (s, out) => { eq(out.kind, 'commit', out.message); return R.compassReducer(s, {type: 'COMMIT_FLOOR', floor: out.floor}); };
let s = base();
s = commit(s, R.placeCell(s, 'r2_c3', 'bedroom'));
const before = s;
const preview = R.splitCell(s.floors.ground, 'r2_c3', 'top-bottom');
eq(before.floors.ground.splits, [], 'preview never changes the source');
eq(preview.rooms[0].regions, ['r2_c3.B', 'r2_c3.T'], 'both halves retain the owner');
eq(R.splitCell(preview, 'r2_c3', 'left-right'), preview, 'a split cannot acquire a second direction');
s = commit(s, R.assignHalf({...s, floors: {...s.floors, ground: preview}}, 'r2_c3.B', {type: 'use', use: 'bathroom'}));
eq(R.ownerOf(s.floors.ground, 'r2_c3.T').use, 'bedroom');
eq(R.ownerOf(s.floors.ground, 'r2_c3.B').use, 'bathroom');
eq(R.assignHalf(s, 'r2_c3.L', {type: 'empty'}).kind, 'refused', 'inactive halves cannot be assigned');
eq(R.compassReducer(s, {type: 'UNDO'}).floors, before.floors, 'first assignment and split undo together');
eq(R.regionSizeIn('r2_c3.T', 720, 480), {width: 180, depth: 60});
eq(R.coveragePercent(s.floors.ground), 6, 'two halves still occupy one of sixteen cells');
eq(R.halvesUsable(240, 720), false);
eq(R.halvesUsable(240, 720, 'top-bottom'), true, 'narrow plots can use deep halves');
eq(R.halvesUsable(720, 240, 'top-bottom'), false, 'shallow halves must meet the same minimum');
eq(R.halvesUsable(720, 240), true);
const raw = D.draftFromState(s);
eq(raw.version, 3); eq(raw.plan.version, 3);
eq(D.parseDraft(JSON.stringify(raw), queue).state.floors, s.floors, 'draft reload keeps direction and owners');
const copy = D.backendCopy(s);
eq(D.draftFromPlan(copy.compass_plan, queue).state.floors, s.floors, 'backend reopen keeps both floors');
eq(copy.compass_map.requires_v2, true, 'legacy renderer cannot flatten either split');
const oldState = base(); oldState.floors.ground = {splits: ['r1_c1'], rooms: []};
const old = {...D.draftFromState(oldState), version: 2};
eq(old.plan.version, 2, 'left/right canonical format is unchanged');
eq(D.parseDraft(JSON.stringify(old), queue).state.floors, oldState.floors, 'v2 drafts remain readable');
eq(D.parseDraft(JSON.stringify({...raw, version: 4}), queue).newer, true);
eq(D.DRAFT_KEYS.primary.endsWith('_v3'), true);
const broken = structuredClone(raw); broken.plan.floors.ground.rooms[0].regions = ['r2_c3.L'];
eq(D.parseDraft(JSON.stringify(broken), queue).newer, true, 'unreadable saved work cannot be overwritten');
const future = structuredClone(raw); future.version = 4; future.plan.version = 4;
eq(D.parseDraft(JSON.stringify(future), queue).newer, true, 'an unknown future plan remains protected');
eq(D.bestDraft([JSON.stringify(raw), JSON.stringify(future)], queue).parsed.newer, true, 'a stale session cannot overwrite a protected primary');
const options = R.wholeOptions(s.floors.ground, 'r2_c3');
eq(options.length, 2, 'both owners offered before changing direction');
const whole = R.wholeCell(s.floors.ground, 'r2_c3', R.ownerOf(s.floors.ground, 'r2_c3.T').id);
eq(whole.splitDirections, undefined); eq(whole.splits, []);
eq(R.splitCell(whole, 'r2_c3').rooms[0].regions, ['r2_c3.L', 'r2_c3.R']);
const mixed = R.splitCell(s.floors.ground, 'r1_c1');
eq(mixed.splitDirections, {r2_c3: 'top-bottom'}, 'adding a left/right split keeps the other direction');
eq(R.wholeCell(mixed, 'r1_c1', null).splitDirections, mixed.splitDirections, 'whole-cell preserves other splits');
// A top half is the bridge to the row behind it; its bottom sibling is not.
let connected = base(); connected = commit(connected, R.placeCell(connected, 'r2_c2', 'living'));
connected = commit(connected, R.placeCell(connected, 'r3_c2', 'living'));
connected.floors.ground = R.splitCell(connected.floors.ground, 'r2_c2', 'top-bottom');
eq(R.assignHalf(connected, 'r2_c2.T', {type: 'use', use: 'bathroom'}).kind, 'disconnects');
eq(R.assignHalf(connected, 'r2_c2.B', {type: 'use', use: 'bathroom'}).kind, 'commit');
const upstairs = {...base(), currentFloor: 'first'};
upstairs.floors.first = R.splitCell(upstairs.floors.first, 'r2_c2', 'top-bottom');
const below = {splits: ['r2_c2'], splitDirections: {r2_c2: 'top-bottom'}, rooms: [
  {id: 'g-living-1', use: 'living', regions: ['r2_c2.T']}, {id: 'g-bedroom-1', use: 'bedroom', regions: ['r2_c2.B']},
]};
eq(R.assignHalf(upstairs, 'r2_c2.T', {type: 'use', use: 'void'}, below).kind, 'commit');
eq(R.assignHalf(upstairs, 'r2_c2.B', {type: 'use', use: 'void'}, below).kind, 'refused');
eq(R.giveBothHalves(upstairs, 'r2_c2', 'void', below).kind, 'refused', 'whole-cell answer validates all ground area');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../python/tests/fixtures/compass/f16_top_bottom.json')));
for (const {plan} of fixture.cases) {
  eq(P.normalisePlan(plan), plan, 'shared fixture is canonical');
  for (const mutate of [p => {p.version = 2;}, p => {p.floors.ground.splitDirections = {r4_c4: 'top-bottom'};},
    p => {p.floors.ground.splitDirections = {r2_c3: 'both'};}]) {
    const p = structuredClone(fixture.cases[0].plan); mutate(p);
    assert.throws(() => P.normalisePlan(p), P.PlanError); checks++;
  }
}
// Compare every pair of all possible regions, not just hand-picked neighbours.
const keys = P.CELLS.flatMap(c => [c, ...['L', 'R', 'T', 'B'].map(h => `${c}.${h}`)]);
const vectors = keys.flatMap(a => keys.map(b => [a, b, P.regionsTouch(a, b), P.regionsOverlap(a, b)]));
const python = process.env.COMPASS_PYTHON || path.join(__dirname, '../python/.venv/Scripts/python.exe');
const py = spawnSync(python, ['-c', "import sys,json;sys.path.insert(0,'tools');import compass_schema as s;v=json.load(sys.stdin);assert all(s.regions_touch(a,b)==t and s.regions_overlap(a,b)==o for a,b,t,o in v);print(len(v))"], {input: JSON.stringify(vectors), encoding: 'utf8', cwd: path.join(__dirname, '..')});
assert.equal(py.status, 0, py.stderr || py.error?.message); checks += vectors.length;
console.log(`Compass split directions: ${checks} checks passed (editing, exclusive directions, undo, save/reopen, compatibility, geometry parity).`);
