/* Exercise the actual pure floor helpers, extracted from the TSX module by its AST. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function loadTs(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {})(id => {
    const resolved = path.resolve(path.dirname(file), id);
    return id.startsWith('.') ? loadTs(resolved + '.ts') : require(id);
  }, mod, mod.exports);
  return mod.exports;
}
const source = ts.createSourceFile('AdvancedMapScreen.tsx', fs.readFileSync(path.join(root, 'src/screens/AdvancedMapScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['createAdvancedFloor', 'readAdvancedFloors', 'serializeAdvancedFloors', 'advancedMapFromDraft', 'syncAdvancedCompassDraft'];
const selected = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(selected.length, names.length);
const code = ts.transpileModule(selected.map(node => node.getFullText(source)).join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(code, { exports: moduleUnderTest.exports, module: moduleUnderTest,
  ...loadTs(path.join(root, 'src/types/compass.ts')), ...loadTs(path.join(root, 'src/utils/compassMath.ts')) });
const { readAdvancedFloors, serializeAdvancedFloors, advancedMapFromDraft, syncAdvancedCompassDraft } = moduleUnderTest.exports;
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const map = {
  plot: { width_ft: 40, depth_ft: 60, facing: 'North', type: 'Middle Plot' },
  ground_floor: { placements: [{ roomId: 'kitchen', room: 'Kitchen + Store', cells: ['r1_c1', 'r4_c4'] }], advanced_refinements: { customEdges: [{ id: 'ground-wall', cells: ['r1_c1', 'r1_c1'], type: 'full_wall' }] }, cell_layouts: { r1_c1: 'left' } },
  first_floor: { placements: [{ roomId: 'bedroom', roomLabel: 'Bedroom', occupiedCells: ['r1_c1'] }], advanced_refinements: { voidMarkers: [{ cell: 'r1_c1', type: 'open_to_below' }] }, cell_layouts: { r1_c1: 'right' } },
};
const floors = readAdvancedFloors(map);
check('same cell keys belong to independent floors', () => {
  assert.equal(floors.gnd.grid.r1_c1.roomId, 'kitchen');
  assert.equal(floors['1f'].grid.r1_c1.roomId, 'bedroom');
  floors['1f'].grid.r2_c1 = { roomId: 'living', roomLabel: 'Living Hall' };
  assert.equal(floors.gnd.grid.r2_c1, undefined);
});
const payload = serializeAdvancedFloors(floors, map, 40, 60, 'North');
check('serialize saves each floor, exact cell area and coverage', () => {
  assert.deepEqual(plain(payload.ground_floor.placements[0].cells), ['r1_c1', 'r4_c4']);
  assert.equal(payload.ground_floor.placements[0].area_sqft, 300);
  assert.equal(payload.ground_floor.coverage_percent, 13);
  assert.equal(payload.first_floor.placements.length, 2);
  assert.equal(payload.first_floor.placements[0].roomId, 'bedroom');
});
check('refinement and stair layout sets never bleed between floors', () => {
  assert.equal(payload.ground_floor.advanced_refinements.voidMarkers.length, 0);
  assert.equal(payload.first_floor.advanced_refinements.customEdges.length, 0);
  assert.equal(payload.ground_floor.cell_layouts.r1_c1, 'left');
  assert.equal(payload.first_floor.cell_layouts.r1_c1, 'right');
});
for (const currentFloor of ['ground', 'first']) check(`Compass draft round trip preserves both floors while ${currentFloor} is active`, () => {
  const draft = { version: 1, state: { currentFloor, foundation: { plotWidth: 40, plotDepth: 60, facing: 'North' }, numFloors: 'Multi-Floor', grid: {}, placements: [], history: ['old'], armed: true, pendingExpansion: { old: true } } };
  const saved = syncAdvancedCompassDraft(draft, payload);
  assert.equal(saved.state.currentFloor, currentFloor);
  assert.equal(saved.state.grid.r1_c1.roomId, currentFloor === 'first' ? 'bedroom' : 'kitchen');
  assert.equal(typeof saved.state.grid.r1_c1.anchorPlacementId, 'string');
  assert.equal(saved.state.grid.r4_c3.roomId, null);
  assert.equal(saved.state.armed, false);
  assert.equal(saved.state.pendingExpansion, null);
  assert.equal(saved.state.history.length, 0);
  assert.equal(draft.state.armed, true, 'input draft must remain untouched');
  const restored = readAdvancedFloors(advancedMapFromDraft(saved));
  assert.deepEqual(plain(restored), plain(floors));
});
check('legacy top-level refinements stay on ground floor', () => {
  const legacy = readAdvancedFloors({ ground_floor: map.ground_floor, advanced_refinements: { voidMarkers: [{ cell: 'r2_c1', type: 'open_to_below' }] } });
  assert.equal(legacy['1f'].refinements.voidMarkers.length, 0);
  assert.deepEqual(plain(legacy['1f'].grid), {});
});
check('out-of-grid saved cells are ignored', () => {
  const result = readAdvancedFloors({ ground_floor: { placements: [{ roomId: 'bedroom', cells: ['r1_c1', 'r0_c0', '__proto__'] }] } });
  assert.deepEqual(Object.keys(result.gnd.grid), ['r1_c1']);
});
check('adding first-floor rooms upgrades a Single Floor survey and draft', () => {
  const output = serializeAdvancedFloors(floors, { ...map, plot: { ...map.plot, num_floors: 'Single Floor' } }, 40, 60, 'North');
  assert.equal(output.plot.num_floors, 'Multi-Floor');
  const draft = { version: 1, state: { currentFloor: 'ground', numFloors: 'Single Floor', foundation: { numFloors: 'Single Floor' }, grid: {}, placements: [] } };
  const saved = syncAdvancedCompassDraft(draft, output);
  assert.equal(saved.state.numFloors, 'Multi-Floor');
  assert.equal(saved.state.foundation.numFloors, 'Multi-Floor');
  assert.equal(saved.state.firstFloorData.placements.length, 2);
});
check('an existing Multi-Floor choice survives when first floor is empty', () => {
  const empty = readAdvancedFloors({});
  const output = serializeAdvancedFloors(empty, { plot: { num_floors: 'Multi-Floor' } }, 40, 60, 'North');
  assert.equal(output.plot.num_floors, 'Multi-Floor');
  const saved = syncAdvancedCompassDraft({ state: { currentFloor: 'ground', numFloors: 'Multi-Floor', foundation: {} } }, output);
  assert.equal(saved.state.numFloors, 'Multi-Floor');
});
check('legacy active first-floor refinements and embedded stair layouts survive', () => {
  const draft = { state: { currentFloor: 'first', foundation: {}, grid: {}, placements: [{ roomId: 'staircase', roomLabel: 'Stairs', occupiedCells: ['r1_c1'] }], groundFloorData: { placements: [] } },
    refinements: { voidMarkers: [{ cell: 'r1_c1', type: 'open_to_below' }], cellLayouts: { r1_c1: 'bottom' } } };
  const restored = readAdvancedFloors(advancedMapFromDraft(draft));
  assert.equal(restored['1f'].refinements.voidMarkers.length, 1);
  assert.equal(restored.gnd.refinements.voidMarkers.length, 0);
  assert.equal(restored['1f'].cellLayouts.r1_c1, 'bottom');
});
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
  const saved = syncAdvancedCompassDraft({ state: { currentFloor: 'first', foundation: {}, grid: {}, componentQueue: [], placements: [] } }, payload);
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
  const reopened = readAdvancedFloors(compiled);
  assert.equal(reopened.gnd.cellLayouts.r1_c1, 'left');
  assert.equal(reopened['1f'].cellLayouts.r1_c1, 'right');
});
check('Compass legacy root refinements belong only to the active floor', () => {
  const sets = readCompassFloorRefinements({ state: { currentFloor: 'first' }, refinements: { voidMarkers: [{ cell: 'r1_c1' }], cellLayouts: { r1_c1: 'bottom' } } });
  assert.equal(sets.first.voidMarkers.length, 1);
  assert.equal(sets.ground.voidMarkers.length, 0);
  assert.equal(sets.first.cellLayouts.r1_c1, 'bottom');
  const fresh = readCompassFloorRefinements(null);
  assert.equal(fresh.first.voidMarkers.length + fresh.ground.voidMarkers.length, 0);
});
console.log(`${checks} advanced floor checks passed.`);
