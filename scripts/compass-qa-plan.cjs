/** Isolated version 2 Compass fixture (14 Oct 2026); never reads or writes user data.
 * The C2 house of python/tests/fixtures/compass/f15_double_height.json, case "half-void-passage" (40 x 60 ft,
 * North-facing, two floors, an upstairs cell divided into Open to below and a passage), with one ground cell
 * divided too: a bathroom in the left half and a passage in the right half. The floor-plan service reports
 * no warning or conflict for it. The draft is built and validated by the app's own modules. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
}
const R = require('../src/utils/compassReducer.ts');
const P = require('../src/utils/compassPlan.ts');
const Draft = require('../src/utils/compassDraft.ts');

function plan() {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../python/tests/fixtures/compass/f15_double_height.json'), 'utf8'));
  const base = JSON.parse(JSON.stringify(fixture.cases.find(c => c.name === 'half-void-passage').plan));
  const ground = base.floors.ground;
  ground.splits = ['r3_c2'];
  ground.rooms.find(r => r.id === 'g-bathroom-1').regions = ['r3_c2.L'];
  ground.rooms.push({ id: 'g-passage-1', use: 'passage', regions: ['r3_c2.R'] });
  ground.rooms.sort((a, b) => (a.id < b.id ? -1 : 1));
  return P.normalisePlan(base);                                 // Throws if the fixture is not a valid plan.
}

function queue(floor) {
  return P.CATALOGUE[floor].map(id => ({ roomId: id, roomLabel: P.PLAN_LIBRARY[id].label, shortLabel: P.PLAN_LIBRARY[id].short, color: '#888', expandable: false }));
}

/** The screen's state with this house on `floor`. */
function state(floor = 'ground') {
  const p = plan();
  const s = R.createInitialState(queue(floor));
  return {
    ...s, phase: 'placement', currentFloor: floor, numFloors: 'Multi-Floor', foundationStep: 7, currentIndex: 0, choices: p.choices,
    foundation: { facing: p.plot.facing, plotWidth: p.plot.widthIn / 12, plotDepth: p.plot.depthIn / 12, plotType: p.plot.plotType,
      numFloors: 'Multi-Floor', numBedrooms: '2', gatePosition: p.plot.gate },
    floors: { ground: p.floors.ground, first: p.floors.first },
  };
}

/** The version 2 draft JSON, as the screen saves it under compass_persistent_backup_v2. */
function draftV2(floor = 'ground') {
  const s = state(floor);
  const blocking = P.checkPlan(P.normalisePlan(R.planFromState(s))).filter(n => n.severity === 'infeasible' || n.severity === 'conflict');
  if (blocking.length) throw new Error(`QA fixture has conflicts: ${JSON.stringify(blocking)}`);
  return JSON.stringify(Draft.draftFromState(s));
}

module.exports = { draftV2, state, plan };
