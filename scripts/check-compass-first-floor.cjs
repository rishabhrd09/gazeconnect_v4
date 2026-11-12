/** The first floor over the ground floor (12 Nov 2026, docs/compass-refine/FIRST_FLOOR_RULES.md), on the map's own
 * functions: placing a whole cell (placeCell), a half (assignHalf), both halves (giveBothHalves) and Whole Cell
 * (wholeOptions) refuse what the rules refuse and say their notes; the ground floor is never judged by them; and
 * Generate's "Both floors" opens only when firstFloorBlockers is empty. The rules themselves are checked against
 * compass_schema.py through python/tests/fixtures/compass/f17_first_floor_rules.json (check-compass-plan.cjs). */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ts = require('typescript');
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
}
const root = path.resolve(__dirname, '..');
const P = require('../src/utils/compassPlan.ts');
const R = require('../src/utils/compassReducer.ts');
const qa = require('./compass-qa-plan.cjs');

const fixture = JSON.parse(fs.readFileSync(path.join(root, 'python/tests/fixtures/compass/f17_first_floor_rules.json'), 'utf8'));
const planOf = name => P.normalisePlan(fixture.cases.find(c => c.name === name).plan);
let checks = 0;
const ok = (value, message) => { checks += 1; assert.ok(value, message); };

/** The map's state on the first floor over the ground floor of an F17 case. */
function onFirst(name, first) {
  const p = planOf(name);
  return {
    ...R.createInitialState([]), phase: 'placement', currentFloor: 'first', numFloors: 'Multi-Floor', foundationStep: 7,
    currentIndex: 0, choices: {}, activeRoomId: null,
    foundation: { facing: 'North', plotWidth: 40, plotDepth: 60, plotType: 'Middle Plot', numFloors: 'Multi-Floor', numBedrooms: '2', gatePosition: 'Left' },
    floors: { ground: p.floors.ground, first: first || { splits: [], rooms: [] } },
  };
}
const place = (state, cell, use) => R.placeCell(state, cell, use, false, state.floors.ground);
const refused = (outcome, words, message) => ok(outcome.kind === 'refused' && outcome.message.includes(words), `${message}: ${JSON.stringify(outcome)}`);
const placed = (outcome, note, message) => ok(outcome.kind === 'commit' && (note ? outcome.note?.includes(note) && outcome.message.includes(`Note: ${outcome.note}`) : !outcome.note),
  `${message}: ${JSON.stringify({ kind: outcome.kind, message: outcome.message, note: outcome.note })}`);

// 1. Whole cells (placeCell): each rule, refused or placed with its note.
const s = onFirst('ready');
placed(place(s, 'r2_c2', 'ff_master'), null, 'a bedroom over the living hall');
refused(place(s, 'r4_c2', 'ff_master'), 'open to the sky', 'a bedroom over the backyard');
refused(place(s, 'r1_c3', 'ff_terrace'), 'open to the sky', 'a terrace over the lawn');
refused(place(s, 'r1_c4', 'passage'), 'open to the sky', 'a passage over the lawn');
refused(place(s, 'r3_c4', 'ff_bathroom'), 'Home ICU', 'a bathroom over the Home ICU');
placed(place(s, 'r3_c2', 'ff_bathroom'), null, 'a bathroom over the bathroom');
placed(place(s, 'r3_c3', 'ff_bathroom'), 'waterproofed', 'a bathroom over the kitchen');
placed(place(s, 'r3_c1', 'ff_bathroom'), 'waterproofed', 'a bathroom over a bedroom');
placed(place(s, 'r1_c1', 'ff_living'), 'columns', 'a living room over the porch');
placed(place(s, 'r1_c1', 'ff_balcony'), null, 'a balcony over the porch (its roof)');
placed(place(s, 'r1_c3', 'ff_balcony'), 'columns in the garden', 'a balcony over the lawn');
placed(place(s, 'r2_c3', 'ff_balcony'), null, 'a balcony inside the plot beside an open roof (no note)');
const closedIn = P.normalisePlan(fixture.cases.find(c => c.name === 'balcony-closed-in').plan).floors.first;
const closedState = onFirst('balcony-closed-in', { ...closedIn, rooms: closedIn.rooms.filter(r => r.use !== 'ff_balcony') });
placed(place(closedState, 'r3_c2', 'ff_balcony'), 'no open side', 'a balcony with rooms on all four sides: a note, never a refusal');
placed(place(s, 'r3_c3', 'ff_terrace'), null, 'a terrace over the kitchen');
refused(place(s, 'r2_c2', 'ff_stairLanding'), 'on the Inner Left cell (row 2, column 1), above the Living Lobby + Staircase',
  'the landing over the living hall: the refusal says where the stair is');
placed(place(onFirst('landing-partly-over-stair'), 'r2_c1', 'ff_stairLanding'), null, 'the landing over a cell that is half stair');
placed(place(s, 'r2_c1', 'ff_stairLanding'), null, 'the landing over the staircase');
refused(place(s, 'r2_c1', 'ff_bed2'), 'stair rises here', 'a bedroom over the staircase');
placed(place(s, 'r2_c3', 'void'), null, 'Open to below over the living hall');
refused(place(s, 'r3_c1', 'void'), 'double-height', 'Open to below over a bedroom (its own rule, as before)');
refused(place(onFirst('nothing-below'), 'r4_c4', 'ff_bed3'), 'Plan the ground floor under this cell first', 'a room over an unplanned cell');
refused(place(onFirst('landing-without-staircase'), 'r2_c1', 'ff_stairLanding'), 'Place the staircase on the ground floor first',
  'the landing with no staircase below');
// A refused room is never offered as a replacement first: the rules come before "Replace ...?".
const withLanding = { ...s, floors: { ...s.floors, first: { splits: [], rooms: [{ id: 'f-ff_stairLanding-1', use: 'ff_stairLanding', regions: ['r2_c1'] }] } } };
refused(place(withLanding, 'r2_c1', 'ff_master'), 'stair rises here', 'no replacement offered over the stair');
// The ground floor is never judged by the first-floor rules (no floor below).
const ground = { ...s, currentFloor: 'ground', floors: { ground: { splits: [], rooms: [] }, first: { splits: [], rooms: [] } } };
ok(R.placeCell(ground, 'r4_c2', 'bathroom', false, undefined).kind === 'commit', 'the ground floor places as before');

// 2. Halves (assignHalf), both halves (giveBothHalves) and Whole Cell (wholeOptions).
const divided = onFirst('ready', { splits: ['r4_c2'], rooms: [] });
const half = (key, use) => R.assignHalf(divided, key, { type: 'use', use }, divided.floors.ground);
refused(half('r4_c2.R', 'ff_bed2'), 'open to the sky', 'a bedroom half over the backyard');
placed(half('r4_c2.L', 'ff_balcony'), 'columns in the garden', 'a balcony half over the backyard');
refused(R.giveBothHalves(divided, 'r4_c2', 'ff_master', divided.floors.ground), 'open to the sky', 'both halves over the backyard');
const icuCell = onFirst('ready', { splits: ['r3_c4'], rooms: [{ id: 'f-ff_bathroom-1', use: 'ff_bathroom', regions: ['r3_c4.L'] }] });
const options = R.wholeOptions(icuCell.floors.first, 'r3_c4', icuCell.floors.ground);
const bath = options.find(o => o.owner === 'f-ff_bathroom-1');
ok(bath && !bath.allowed && /Home ICU/.test(bath.reason || ''), `Whole Cell cannot give the bathroom the cell over the ICU: ${JSON.stringify(options)}`);
ok(options.some(o => o.owner === null && o.allowed), 'Whole Cell can still leave the cell empty');
ok(R.wholeOptions(icuCell.floors.first, 'r3_c4').find(o => o.owner === 'f-ff_bathroom-1').allowed, 'without a floor below, Whole Cell is as before');

// The notes (warnings) of every F17 case, as compass_schema.py gives them (python/tests/test_compass_first_floor.py).
for (const c of fixture.cases) {
  const warnings = P.checkPlan(P.normalisePlan(c.plan)).filter(n => n.severity === 'warning' && n.code.startsWith('ff-'))
    .map(n => `${n.code}:${n.rooms[0]}`).sort();
  assert.deepEqual(warnings, [...c.expect.warnings].sort(), `${c.name} warnings`); checks += 1;
}

// 3. Generate's "Both floors": open only when the first floor is ready.
const codes = name => P.firstFloorBlockers(planOf(name)).map(b => b.code);
ok(codes('ready').length === 0, `a ready first floor opens Both floors: ${codes('ready')}`);
ok(P.firstFloorBlockers({ ...planOf('ready'), floors: { ground: planOf('ready').floors.ground } })[0].code === 'ff-empty', 'no first floor: closed');
ok(codes('over-garden')[0] === 'ff-over-garden', 'a room over the garden closes it');
ok(codes('over-stair').includes('ff-no-landing') && codes('over-stair').includes('ff-over-stair'), 'no landing, and a room over the stair');
ok(codes('landing-without-staircase')[0] === 'ff-no-stair', 'no staircase below comes first');
ok(codes('balcony-over-lawn').join() === 'ff-cut-off', 'a balcony not joined to the landing (a warning alone never closes it)');
ok(codes('bath-over-kitchen').join() === 'ff-cut-off', 'a bathroom over the kitchen is a note; only its being cut off closes it');
const text = P.firstFloorBlockers(planOf('bath-over-icu'))[0];
ok(text.text === '1F Bath: over the Home ICU' && /Home ICU/.test(text.message), `a short reason and the full one: ${JSON.stringify(text)}`);
// The ground floor changed later under a first-floor room: the plan's first floor is no longer ready.
const changed = planOf('ready');
changed.floors.ground.rooms = changed.floors.ground.rooms.map(r => (r.use === 'living' ? { ...r, use: 'lawn', id: 'g-lawn-2' } : r));
ok(P.firstFloorBlockers(P.normalisePlan(changed)).some(b => b.code === 'ff-over-garden'), 'a living hall turned into a garden under a 1F room closes it');
// The studio's QA house (check-compass-studio-v2.cjs) stays ready, so its Both floors stays open.
ok(P.firstFloorBlockers(qa.plan()).length === 0, `the QA house is ready: ${JSON.stringify(P.firstFloorBlockers(qa.plan()))}`);
const screen = fs.readFileSync(path.join(root, 'src/screens/CompassMapScreen.tsx'), 'utf8');
ok(screen.includes('gazeEnabled={isGazeEnabled && !bothBlocked}') && screen.includes('disabled={!!bothBlocked}')
  && screen.includes('firstFloorBlockers(normalisePlan(planFromState(state)))'), 'Both floors is gated by firstFloorBlockers');
ok(screen.includes('wholeOptions(floor, focusCell, below)') && screen.includes('firstFloorFindings(use, assignKey, below, wfloor)'),
  'Whole Cell and the half picker use the rules');
ok(screen.includes('if (refusals.every(Boolean)) { tell(refusals[0]!); return; }'),
  'placing on a divided cell refuses at once when neither half may take the room');

console.log(`Compass first floor: ${checks} checks passed (whole cells, halves, both halves, Whole Cell, the ground floor untouched, Both floors).`);
