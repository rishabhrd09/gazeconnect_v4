/* Exercise the actual pure floor helpers, extracted from the TSX module by its AST. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const payload = {
  ground_floor: { placements: [], advanced_refinements: { customEdges: [{ id: 'wall', cells: ['r1_c1', 'r1_c1'], type: 'full_wall' }] }, cell_layouts: { r1_c1: 'left' } },
  first_floor: { placements: [], advanced_refinements: { voidMarkers: [{ cell: 'r1_c1', type: 'open_to_below' }] }, cell_layouts: { r1_c1: 'right' } },
};
const compassSource = ts.createSourceFile('CompassMapScreen.tsx', fs.readFileSync(path.join(root, 'src/screens/CompassMapScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// Version 2 (14 Oct 2026): drafts are parsed by src/utils/compassDraft.ts (checked in check-compass-refine.cjs);
// the details saved by the retired Refine Map travel read-only in the plan's legacy block, per floor.
const compassHelpers = ['normalizeCompassRefinements', 'readCompassFloorRefinements', 'buildCompassFloorMetadata', 'attachCompassFloorRefinements',
  'legacyFloor', 'legacyCells', 'refinementsFromLegacy'];
const compassSelected = compassSource.statements.filter(node => ts.isFunctionDeclaration(node) && compassHelpers.includes(node.name?.text));
assert.equal(compassSelected.length, compassHelpers.length);
const compassModule = { exports: {} };
const compassCode = ts.transpileModule(compassSelected.map(node => node.getFullText(compassSource)).join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const compassContext = { exports: compassModule.exports, module: compassModule };
vm.runInNewContext(compassCode + '\nexports.legacyCells = legacyCells;\nexports.refinementsFromLegacy = refinementsFromLegacy;', compassContext);
const { readCompassFloorRefinements, buildCompassFloorMetadata, attachCompassFloorRefinements, legacyCells, refinementsFromLegacy } = compassModule.exports;
check('Compass saved metadata preserves inactive and active floor edits', () => {
  const saved = JSON.parse(JSON.stringify({ state: { currentFloor: 'first', foundation: {}, grid: {}, componentQueue: [], placements: [] }, advancedFloorMetadata: { gnd: payload.ground_floor, '1f': payload.first_floor } }));
  const sets = readCompassFloorRefinements(saved);
  assert.equal(sets.ground.customEdges.length, 1);
  assert.equal(sets.first.voidMarkers.length, 1);
  assert.equal(sets.ground.cellLayouts.r1_c1, 'left');
  assert.equal(sets.first.cellLayouts.r1_c1, 'right');
  const autosaved = { state: saved.state, refinements: sets.first, advancedFloorMetadata: buildCompassFloorMetadata(sets) };
  assert.deepEqual(plain(readCompassFloorRefinements(JSON.parse(JSON.stringify(autosaved)))), plain(sets));
  const compiled = attachCompassFloorRefinements(payload, sets, 'first');
  assert.equal(compiled.editor_active_floor, '1f');
  assert.equal(compiled.ground_floor.advanced_refinements.voidMarkers.length, 0);
  assert.equal(compiled.first_floor.advanced_refinements.voidMarkers.length, 1);
  const reopened = readCompassFloorRefinements(compiled);
  assert.equal(reopened.ground.cellLayouts.r1_c1, 'left');
  assert.equal(reopened.first.cellLayouts.r1_c1, 'right');
});
check('Compass legacy root refinements belong only to the active floor', () => {
  const sets = readCompassFloorRefinements({ state: { currentFloor: 'first' }, refinements: { voidMarkers: [{ cell: 'r1_c1' }], cellLayouts: { r1_c1: 'bottom' } } });
  assert.equal(sets.first.voidMarkers.length, 1);
  assert.equal(sets.ground.voidMarkers.length, 0);
  assert.equal(sets.first.cellLayouts.r1_c1, 'bottom');
  const fresh = readCompassFloorRefinements(null);
  assert.equal(fresh.first.voidMarkers.length + fresh.ground.voidMarkers.length, 0);
});
check('A migrated plan keeps each floor\'s saved details, locks their cells until converted, and stair layouts lock nothing', () => {
  const legacy = { fromVersion: 1, reason: 'test', refinements: {
    ground: { refinements: { customEdges: [{ id: 'wall', cells: ['r2_c2', 'r2_c3'], type: 'full_wall' }], cellLayouts: { r3_c1: 'top' } } },
    first: { refinements: { voidMarkers: [{ cell: 'r1_c4', type: 'open_to_below' }], cellLayouts: { r1_c1: 'right' } } },
  } };
  const sets = refinementsFromLegacy(legacy);
  assert.equal(sets.ground.customEdges.length, 1);
  assert.equal(sets.first.voidMarkers.length, 1);
  assert.equal(sets.ground.cellLayouts.r3_c1, 'top');
  assert.equal(sets.first.cellLayouts.r1_c1, 'right');
  assert.deepEqual([...legacyCells(legacy, 'ground')], ['r2_c2']);
  assert.deepEqual([...legacyCells(legacy, 'first')], ['r1_c4']);
  assert.equal(legacyCells({ ...legacy, converted: true }, 'ground').size, 0);
  assert.equal(legacyCells(undefined, 'ground').size, 0);
  const viewer = attachCompassFloorRefinements({ ground_floor: { placements: [] }, first_floor: { placements: [] } }, sets, 'ground');
  assert.equal(viewer.ground_floor.advanced_refinements.customEdges.length, 1);
  assert.equal(viewer.first_floor.advanced_refinements.voidMarkers.length, 1);
  const none = refinementsFromLegacy(undefined);
  assert.equal(none.ground.customEdges.length + none.first.voidMarkers.length, 0);
});
console.log(`${checks} legacy saved-plan checks passed.`);
