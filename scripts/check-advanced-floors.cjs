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
const compassHelpers = ['normalizeCompassRefinements', 'readCompassFloorRefinements', 'buildCompassFloorMetadata', 'attachCompassFloorRefinements', 'parseCompassDraft'];
const compassSelected = compassSource.statements.filter(node => ts.isFunctionDeclaration(node) && compassHelpers.includes(node.name?.text));
assert.equal(compassSelected.length, compassHelpers.length);
const compassModule = { exports: {} };
// Grid/room sanitization has its own contract; isolate metadata preservation here.
const compassCode = ts.transpileModule(compassSelected.map(node => node.getFullText(compassSource)).join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const compassContext = { exports: compassModule.exports, module: compassModule, sanitizeDraftState: state => state };
vm.runInNewContext(compassCode + '\nexports.parseCompassDraft = parseCompassDraft;', compassContext);
const { readCompassFloorRefinements, buildCompassFloorMetadata, attachCompassFloorRefinements, parseCompassDraft } = compassModule.exports;
check('Compass parse/autosave metadata preserves inactive and active floor edits', () => {
  const saved = { state: { currentFloor: 'first', foundation: {}, grid: {}, componentQueue: [], placements: [] }, advancedFloorMetadata: { gnd: payload.ground_floor, '1f': payload.first_floor } };
  const parsed = parseCompassDraft(JSON.stringify(saved));
  const sets = readCompassFloorRefinements(parsed);
  assert.equal(sets.ground.customEdges.length, 1);
  assert.equal(sets.first.voidMarkers.length, 1);
  assert.equal(sets.ground.cellLayouts.r1_c1, 'left');
  assert.equal(sets.first.cellLayouts.r1_c1, 'right');
  const autosaved = { state: parsed.state, refinements: sets.first, advancedFloorMetadata: buildCompassFloorMetadata(sets) };
  assert.deepEqual(plain(readCompassFloorRefinements(parseCompassDraft(JSON.stringify(autosaved)))), plain(sets));
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
console.log(`${checks} legacy saved-plan checks passed.`);
