/** CompassPlanV2 in TypeScript against the shared fixtures (python/tests/fixtures/compass).
 * The same expectations are checked in Python by python/tests/test_compass_geometry.py. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const plan = require('../src/utils/compassPlan.ts');
const directions = require('../src/utils/compassDirections.ts');
const feet = require('../src/utils/feetInches.ts');

const dir = path.join(__dirname, '..', 'python', 'tests', 'fixtures', 'compass');
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

// F1: v1 migrates to exactly the stored plan; F2: one orientation table for labels and the rose.
const f1 = JSON.parse(fs.readFileSync(path.join(dir, 'f01_asymmetric_30x50.json')));
const migrated = plan.migrateV1(f1.v1);
eq(migrated.plan, plan.normalisePlan(f1.plan), 'F1 migration');
eq(migrated.notices, [], 'F1 notices');
const f2 = JSON.parse(fs.readFileSync(path.join(dir, 'f02_facings.json')));
for (const [facing, row] of Object.entries(f2.facings)) {
  eq(directions.getDirectionLabels(facing), row.labels, `labels ${facing}`);
  eq(directions.NORTH_ROSE_DEGREES[facing], row.roseDegrees, `rose ${facing}`);
}

const codes = p => plan.checkPlan(plan.normalisePlan(p)).filter(n => n.severity !== 'warning')
  .map(n => (n.rooms.length ? `${n.code}:${n.rooms[0]}` : n.code)).sort();
for (const file of fs.readdirSync(dir).filter(f => /^f\d+.*\.json$/.test(f)).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file)));
  for (const c of data.cases || []) {
    const name = `${data.id}:${c.name}`;
    const expect = c.expect || {};
    let p = c.plan;
    if (c.v1) {
      const out = plan.migrateV1(c.v1);
      if (p) eq(out.plan, plan.normalisePlan(p), `${name} migration`);
      if ('notices' in expect) eq(out.notices.length, expect.notices, `${name} notices`);
      eq('legacy' in out.plan, !!expect.legacy, `${name} legacy`);
      p = out.plan;
    }
    if (expect.issues) eq(codes(p), [...expect.issues].sort(), `${name} issues`);
    const normal = plan.normalisePlan(p);
    for (const floor of Object.values(normal.floors)) {
      const labels = plan.planLabels(floor);
      for (const [id, label] of Object.entries(expect.labels || {})) if (id in labels) eq(labels[id], label, `${name} ${id}`);
    }
    for (const [key, rect] of Object.entries(expect.regionsIn || {})) {
      eq(plan.regionRectIn(key, normal.plot.widthIn, normal.plot.depthIn), rect, `${name} ${key}`);
    }
  }
}

// Regions, identity, structural errors and derived v1 maps.
eq(plan.regionsTouch('r2_c2', 'r2_c3.L'), true);
eq(plan.regionsTouch('r2_c2', 'r2_c3.R'), false);
eq(plan.regionsTouch('r2_c3.L', 'r3_c3.R'), false);
eq(plan.components(['r1_c1', 'r1_c2.R', 'r1_c2.L']), [['r1_c1', 'r1_c2.L', 'r1_c2.R']]);
eq(plan.nextRoomId('ground', { rooms: [{ id: 'g-bedroom-1', use: 'bedroom', regions: [] }, { id: 'g-bedroom-3', use: 'bedroom', regions: [] }] }, 'bedroom'), 'g-bedroom-4');
for (const mutate of [p => { p.plot.widthIn = 359.5; }, p => { p.floors.ground.rooms[0].regions.push('r1_c1'); },
  p => { p.floors.ground.rooms[0].regions = ['r4_c2.L']; }, p => { p.version = 4; }]) {
  const copy = JSON.parse(JSON.stringify(f1.plan));
  mutate(copy);
  assert.throws(() => plan.normalisePlan(copy), plan.PlanError); checks++;
}
eq(plan.deriveV1(f1.plan).ground_floor.placements[0], { room: 'Backyard', roomId: 'backyard', placementId: 'g-backyard-1', cells: ['r4_c2', 'r4_c3'] });
const f3 = JSON.parse(fs.readFileSync(path.join(dir, 'f03_split_occupied.json'))).cases[0].plan;
eq(plan.deriveV1(f3), { requires_v2: true }, 'split plans need v2');
eq(feet.formatFeetInches(7.5), `7'-6"`);
eq(feet.formatFeetInches(3.125), `3'-1½"`);
eq(feet.formatSize(3.75, 12.5), `3'-9" × 12'-6"`);
eq(feet.formatFeetShort(6.25), '6¼');
console.log(`Compass plan (TypeScript): ${checks} checks against the shared fixtures passed.`);
