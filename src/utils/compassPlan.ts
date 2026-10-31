/**
 * CompassPlanV2 in the interface: regions, identity, labels, invariants and migration from v1.
 *
 * The TypeScript twin of tools/compass_schema.py. Both are checked against the same fixtures
 * (python/tests/fixtures/compass, by scripts/check-compass-plan.cjs and test_compass_geometry.py),
 * so a plan the map saves is read identically by the floor-plan service.
 */
import type {
  CellKey, CompassPlanV2, FloorId, FloorIntent, GateSide, HalfSide, PlanIssue, PlotType, RegionKey, RoomIntent, SplitDirection,
} from '../types/compassPlan';

export const PLAN_SCHEMA = 'gazeconnect.compass-plan';
export const PLAN_VERSION = 2;
export const CELLS: CellKey[] = [1, 2, 3, 4].flatMap(r => [1, 2, 3, 4].map(c => `r${r}_c${c}` as CellKey));
export const FLOORS: FloorId[] = ['ground', 'first'];
const FACINGS = ['North', 'East', 'South', 'West'];
const GATES: GateSide[] = ['Left', 'Center', 'Right'];
const PLOT_TYPES: PlotType[] = ['Middle Plot', 'Corner Plot', 'Independent'];
const MIN_SIDE_IN = 180, MAX_SIDE_IN = 2400, MAX_ROOMS = 32, MAX_JSON_BYTES = 64 * 1024;

/** Library labels (CompassMapScreen ROOM_LIBRARY) plus Passage and Open to below (decided 14 Oct 2026). */
export const PLAN_LIBRARY: Record<string, { label: string; short: string }> = {
  porch: { label: 'Outer Lobby / Porch / Open Area', short: 'Outer Lobby' },
  lawn: { label: 'Lawn / Garden', short: 'Lawn' },
  verandah: { label: 'Verandah', short: 'Verandah' },
  backyard: { label: 'Backyard', short: 'Backyard' },
  drawing: { label: 'Drawing Room', short: 'Drawing' },
  kitchen: { label: 'Kitchen + Store', short: 'Kitchen' },
  living: { label: 'Living Hall', short: 'Living' },
  masterBed: { label: 'Master Bedroom', short: 'M.Bed' },
  bedroom: { label: 'Bedroom', short: 'Bedroom' },
  bathroom: { label: 'Bathroom', short: 'Bath' },
  staircase: { label: 'Living Lobby + Staircase', short: 'Stairs' },
  diningStaircase: { label: 'Dining Hall + Staircase', short: 'Dining + Stairs' },
  dining: { label: 'Dining Hall', short: 'Dining' },
  icu: { label: 'Home ICU + Caretaker Unit', short: 'ICU' },
  balcony: { label: 'Balcony', short: 'Balcony' },
  terrace: { label: 'Terrace', short: 'Terrace' },
  passage: { label: 'Passage', short: 'Passage' },
  ff_master: { label: '1F Master Bedroom', short: '1F Master' },
  ff_bed2: { label: '1F Bedroom 2', short: '1F Bed 2' },
  ff_bed3: { label: '1F Bedroom 3', short: '1F Bed 3' },
  ff_living: { label: '1F Living / Family', short: '1F Living' },
  ff_bathroom: { label: '1F Bathroom', short: '1F Bath' },
  ff_balcony: { label: '1F Balcony', short: '1F Balcony' },
  ff_terrace: { label: '1F Open Terrace', short: '1F Terrace' },
  ff_stairLanding: { label: '1F Stair Landing', short: '1F Stairs' },
  void: { label: 'Open to below', short: 'Open below' },
};
export const CATALOGUE: Record<FloorId, string[]> = {
  ground: ['porch', 'lawn', 'verandah', 'backyard', 'drawing', 'kitchen', 'living', 'masterBed', 'bedroom', 'bathroom',
    'staircase', 'diningStaircase', 'dining', 'icu', 'balcony', 'terrace', 'passage'],
  first: ['ff_master', 'ff_bed2', 'ff_bed3', 'ff_living', 'ff_bathroom', 'ff_balcony', 'ff_terrace', 'ff_stairLanding',
    'passage', 'void'],
};
/** Uses that may occur more than once on a floor as separate rooms ("Bedroom 1", "Bedroom 2"). */
export const REPEATABLE = new Set(['bedroom', 'bathroom', 'passage', 'balcony', 'terrace', 'lawn', 'backyard',
  'ff_bathroom', 'ff_balcony', 'ff_terrace', 'void']);
export const STAIR_HOSTS: Record<FloorId, Set<string>> = {
  ground: new Set(['staircase', 'diningStaircase']), first: new Set(['ff_stairLanding']),
};
const VOID_BELOW = new Set(['living', 'dining', 'staircase', 'diningStaircase']);
const ALIASES: Record<string, string> = { commonBath: 'bathroom', masterbed: 'masterBed' };
const REGION = /^r([1-4])_c([1-4])(?:\.(L|R|T|B))?$/;
const ROOM_ID = /^(g|f)-([A-Za-z_][A-Za-z0-9_]*)-([1-9][0-9]{0,2})$/;

export class PlanError extends Error {}

// ---- Regions ------------------------------------------------------------------------------

export function parseRegion(key: string): { row: number; col: number; half: HalfSide | null } {
  const m = REGION.exec(String(key));
  if (!m) throw new PlanError(`Unknown map region ${key}.`);
  return { row: Number(m[1]), col: Number(m[2]), half: (m[3] as HalfSide | undefined) ?? null };
}

export const HALF_NAMES: Record<HalfSide, string> = { L: 'left', R: 'right', T: 'top', B: 'bottom' };
export const OPPOSITE_HALF: Record<HalfSide, HalfSide> = { L: 'R', R: 'L', T: 'B', B: 'T' };
export const splitSides = (direction: SplitDirection): [HalfSide, HalfSide] => direction === 'top-bottom' ? ['T', 'B'] : ['L', 'R'];
export const splitDirection = (floor: Pick<FloorIntent, 'splitDirections'>, cell: CellKey): SplitDirection =>
  floor.splitDirections?.[cell] ?? 'left-right';
export const halfName = (key: string): string => HALF_NAMES[parseRegion(key).half!];
export const otherHalf = (key: string): RegionKey => `${cellOf(key)}.${OPPOSITE_HALF[parseRegion(key).half!]}`;
export function cellRegions(floor: Pick<FloorIntent, 'splits' | 'splitDirections'>, cell: CellKey): RegionKey[] {
  return floor.splits.includes(cell) ? splitSides(splitDirection(floor, cell)).map(h => `${cell}.${h}` as RegionKey) : [cell];
}

export function cellOf(key: string): CellKey {
  return String(key).split('.')[0] as CellKey;
}

/** (x1, y1, x2, y2) of a region in inches: origin at the plot's front-left, +y away from the road. */
export function regionRectIn(key: string, widthIn: number, depthIn: number): [number, number, number, number] {
  const { row, col, half } = parseRegion(key);
  const cw = widthIn / 4, cd = depthIn / 4;
  let x1 = (col - 1) * cw, x2 = col * cw;
  let y1 = (row - 1) * cd, y2 = row * cd;
  if (half === 'L') x2 = x1 + cw / 2;
  else if (half === 'R') x1 = x1 + cw / 2;
  // The road is below the map: screen top is the larger model y.
  if (half === 'T') y1 += cd / 2;
  else if (half === 'B') y2 -= cd / 2;
  return [x1, y1, x2, y2];
}

/** Every region of a floor in map order: whole cells, or the two halves of a divided cell. */
export function floorRegions(floor: Pick<FloorIntent, 'splits' | 'splitDirections'>): RegionKey[] {
  return CELLS.flatMap(c => cellRegions(floor, c));
}

/** True when two regions of one floor share an edge of positive length. */
export function regionsTouch(a: string, b: string): boolean {
  const ra = parseRegion(a), rb = parseRegion(b);
  // Keep the original inexpensive path for existing maps and legacy migration.
  if (ra.half !== 'T' && ra.half !== 'B' && rb.half !== 'T' && rb.half !== 'B') {
    if (ra.row === rb.row && ra.col === rb.col) return ra.half !== null && rb.half !== null && ra.half !== rb.half;
    if (ra.row === rb.row && Math.abs(ra.col - rb.col) === 1) {
      const [left, right] = ra.col < rb.col ? [ra.half, rb.half] : [rb.half, ra.half];
      return (left === null || left === 'R') && (right === null || right === 'L');
    }
    return ra.col === rb.col && Math.abs(ra.row - rb.row) === 1 && (ra.half === null || rb.half === null || ra.half === rb.half);
  }
  const [ax, ay, ax2, ay2] = regionRectIn(a, 8, 8), [bx, by, bx2, by2] = regionRectIn(b, 8, 8);
  return ((ax2 === bx || bx2 === ax) && Math.min(ay2, by2) > Math.max(ay, by))
    || ((ay2 === by || by2 === ay) && Math.min(ax2, bx2) > Math.max(ax, bx));
}

/** Positive area overlap, including differently divided floors. Corner/edge contact is not coverage. */
export function regionsOverlap(a: string, b: string): boolean {
  const [ax, ay, ax2, ay2] = regionRectIn(a, 8, 8), [bx, by, bx2, by2] = regionRectIn(b, 8, 8);
  return Math.min(ax2, bx2) > Math.max(ax, bx) && Math.min(ay2, by2) > Math.max(ay, by);
}
export function regionsBelow(key: string, floor: FloorIntent): RegionKey[] {
  return cellRegions(floor, cellOf(key)).filter(k => regionsOverlap(key, k));
}

/** Edge-connected groups of regions, each sorted, in order of their first region. */
export function components(regions: Iterable<string>): string[][] {
  const remaining = [...new Set(regions)].sort();
  const groups: string[][] = [];
  while (remaining.length) {
    const group = [remaining.shift()!];
    let changed = true;
    while (changed) {
      changed = false;
      for (const key of [...remaining]) {
        if (group.some(member => regionsTouch(key, member))) {
          group.push(key);
          remaining.splice(remaining.indexOf(key), 1);
          changed = true;
        }
      }
    }
    groups.push(group.sort());
  }
  return groups;
}

// ---- Identity and labels ------------------------------------------------------------------

export function floorPrefix(floor: FloorId): 'g' | 'f' { return floor === 'ground' ? 'g' : 'f'; }

/** `g-bedroom-3`: one more than the highest number of that use on the floor (a new room is numbered last). */
export function nextRoomId(floorName: FloorId, floor: Pick<FloorIntent, 'rooms'>, use: string): string {
  let highest = 0;
  for (const room of floor.rooms) {
    const m = ROOM_ID.exec(room.id);
    if (m && m[2] === use) highest = Math.max(highest, Number(m[3]));
  }
  return `${floorPrefix(floorName)}-${use}-${highest + 1}`;
}

function roomOrder(a: RoomIntent, b: RoomIntent): number {
  const ma = ROOM_ID.exec(a.id), mb = ROOM_ID.exec(b.id);
  if (!ma || !mb) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (ma[2] !== mb[2]) return ma[2] < mb[2] ? -1 : 1;
  return Number(ma[3]) - Number(mb[3]);
}

/** Display names, derived and never stored: "Bedroom" once, "Bedroom 1" and "Bedroom 2" when repeated. */
export function planLabels(floor: Pick<FloorIntent, 'rooms'>): Record<string, string> {
  const byUse = new Map<string, string[]>();
  for (const room of [...floor.rooms].sort(roomOrder)) {
    if (!byUse.has(room.use)) byUse.set(room.use, []);
    byUse.get(room.use)!.push(room.id);
  }
  const out: Record<string, string> = {};
  for (const [use, ids] of byUse) {
    const name = PLAN_LIBRARY[use]?.label || use;
    ids.forEach((id, i) => { out[id] = ids.length === 1 ? name : `${name} ${i + 1}`; });
  }
  return out;
}

// ---- Validation ---------------------------------------------------------------------------

function issue(code: string, severity: PlanIssue['severity'], message: string, rooms: string[] = [], regions: string[] = []): PlanIssue {
  return { code, severity, message, rooms, regions };
}

/** A validated, canonical copy. Throws PlanError when the plan cannot be read at all. */
export function normalisePlan(plan: unknown): CompassPlanV2 {
  const p = plan as any;
  if (!p || typeof p !== 'object') throw new PlanError('A Compass plan is required.');
  if (JSON.stringify(p).length > MAX_JSON_BYTES) throw new PlanError('This plan is too large.');
  if (p.schema !== PLAN_SCHEMA || ![2, 3].includes(p.version)) throw new PlanError('This is not a supported Compass plan (version 2 or 3).');
  const plot = p.plot;
  if (!plot || typeof plot !== 'object') throw new PlanError('Plot details are missing.');
  const outPlot: any = {};
  for (const key of ['widthIn', 'depthIn']) {
    const v = plot[key];
    if (!Number.isInteger(v) || v < MIN_SIDE_IN || v > MAX_SIDE_IN) throw new PlanError('Plot sides must be whole inches from 15 to 200 feet.');
    outPlot[key] = v;
  }
  for (const [key, allowed] of [['facing', FACINGS], ['gate', GATES], ['plotType', PLOT_TYPES]] as const) {
    if (!(allowed as readonly string[]).includes(plot[key])) throw new PlanError(`Unknown plot ${key}.`);
    outPlot[key] = plot[key];
  }
  if ('sidesOpen' in plot) {
    const s = plot.sidesOpen;
    if (!s || typeof s.left !== 'boolean' || typeof s.right !== 'boolean') throw new PlanError('sidesOpen needs left and right answers.');
    outPlot.sidesOpen = { left: s.left, right: s.right };
  }
  if ('secondRoad' in plot) {
    if (!['Left', 'Right'].includes(plot.secondRoad) || outPlot.plotType !== 'Corner Plot') {
      throw new PlanError('A second road belongs to a corner plot, on the left or the right.');
    }
    outPlot.secondRoad = plot.secondRoad;
  }
  if (p.storeys !== 1 && p.storeys !== 2) throw new PlanError('A plan has one or two storeys.');
  const floors = p.floors;
  if (!floors || typeof floors !== 'object' || !floors.ground || Object.keys(floors).some(k => !FLOORS.includes(k as FloorId))) {
    throw new PlanError('The plan needs a ground floor.');
  }
  const outFloors: any = {};
  const seen = new Set<string>();
  for (const name of FLOORS) {
    if (!(name in floors)) continue;
    const floor = floors[name];
    if (!floor || !Array.isArray(floor.splits ?? []) || !Array.isArray(floor.rooms ?? [])) throw new PlanError('Each floor has splits and rooms.');
    const splits = [...new Set<string>(floor.splits ?? [])].sort();
    if (splits.some(s => !CELLS.includes(s as CellKey))) throw new PlanError('A divided cell is not a map cell.');
    const directions: FloorIntent['splitDirections'] = {};
    if ('splitDirections' in floor) {
      if (p.version !== 3 || !floor.splitDirections || typeof floor.splitDirections !== 'object' || Array.isArray(floor.splitDirections)) {
        throw new PlanError('Split directions need a version 3 Compass plan.');
      }
      for (const cell of Object.keys(floor.splitDirections).sort()) {
        const direction = floor.splitDirections[cell];
        if (!splits.includes(cell) || !['left-right', 'top-bottom'].includes(direction)) throw new PlanError('A split direction must name a divided cell and one direction.');
        if (direction === 'top-bottom') directions[cell as CellKey] = direction;
      }
    }
    const valid = new Set<string>(floorRegions({ splits: splits as CellKey[], splitDirections: directions }));
    if ((floor.rooms ?? []).length > MAX_ROOMS) throw new PlanError(`A floor can have at most ${MAX_ROOMS} rooms.`);
    const owner = new Map<string, string>();
    const rooms: RoomIntent[] = [];
    for (const room of floor.rooms ?? []) {
      if (!room || typeof room !== 'object') throw new PlanError('Invalid room.');
      const m = ROOM_ID.exec(String(room.id));
      if (!m || m[1] !== floorPrefix(name) || m[2] !== room.use || seen.has(room.id)) throw new PlanError(`Invalid or repeated room id ${room.id}.`);
      if (!PLAN_LIBRARY[room.use]) throw new PlanError(`Unknown room use ${room.use}.`);
      if (!Array.isArray(room.regions) || !room.regions.length || room.regions.length > 32) throw new PlanError(`${room.id} needs at least one region.`);
      const regions = [...new Set<string>(room.regions)].sort();
      for (const key of regions) {
        parseRegion(key);
        if (!valid.has(key)) throw new PlanError(`${key} does not match the divided cells of this floor.`);
        if (owner.has(key)) throw new PlanError(`${key} belongs to two rooms.`);
        owner.set(key, room.id);
      }
      seen.add(room.id);
      rooms.push({ id: room.id, use: room.use, regions: regions as RegionKey[] });
    }
    outFloors[name] = { splits, rooms: rooms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
    if (Object.keys(directions).length) outFloors[name].splitDirections = directions;
  }
  const choices = p.choices ?? {};
  if (typeof choices !== 'object') throw new PlanError('Invalid layout choices.');
  const outChoices: any = {};
  if ('drawingRoom' in choices) {
    if (!['separate', 'open'].includes(choices.drawingRoom)) throw new PlanError('drawingRoom is separate or open.');
    outChoices.drawingRoom = choices.drawingRoom;
  }
  if ('kitchen' in choices) {
    if (!['open', 'closed'].includes(choices.kitchen)) throw new PlanError('kitchen is open or closed.');
    outChoices.kitchen = choices.kitchen;
  }
  const out: CompassPlanV2 = { schema: PLAN_SCHEMA, version: p.version, plot: outPlot, storeys: p.storeys, floors: outFloors, choices: outChoices };
  if (p.legacy && typeof p.legacy === 'object') out.legacy = JSON.parse(JSON.stringify(p.legacy));
  return out;
}

/** Ground regions under a first-floor region: the same key, its whole cell, or both halves of it. */
/** Semantic notes on a normalised plan, identical to compass_schema.check. Never throws. */
export function checkPlan(plan: CompassPlanV2): PlanIssue[] {
  const notes: PlanIssue[] = [];
  const drawingOpen = plan.choices?.drawingRoom !== 'separate';
  for (const name of FLOORS) {
    const floor = plan.floors[name];
    if (!floor) continue;
    const hosts = floor.rooms.filter(r => STAIR_HOSTS[name].has(r.use)).map(r => r.id);
    if (hosts.length > 1) notes.push(issue('stair-hosts', 'conflict', 'Only one room per floor can hold the stair.', hosts));
    for (const room of floor.rooms) {
      const parts = components(room.regions);
      if (parts.length > 1) notes.push(issue('room-disconnected', 'conflict', `${room.id} is in ${parts.length} separate parts.`, [room.id], [...room.regions]));
      if (!CATALOGUE[name].includes(room.use) && room.use !== 'void') notes.push(issue('catalogue', 'warning', `${room.use} is not offered on the ${name} floor.`, [room.id]));
      if (room.use === 'void' && name !== 'first') notes.push(issue('void-floor', 'conflict', 'Open to below belongs on the first floor.', [room.id]));
    }
    if (name === 'first' && plan.storeys === 1 && floor.rooms.length) {
      notes.push(issue('first-unused', 'warning', 'This plan has one storey; the first floor is kept but not drawn.'));
    }
  }
  const first = plan.floors.first;
  if (first) {
    const groundOwner = new Map<string, RoomIntent>();
    for (const room of plan.floors.ground.rooms) for (const key of room.regions) groundOwner.set(key, room);
    for (const room of first.rooms) {
      if (room.use !== 'void') continue;
      for (const key of room.regions) {
        const below = regionsBelow(key, plan.floors.ground).map(k => groundOwner.get(k));
        const ok = below.length > 0 && below.every(b => b !== undefined && (VOID_BELOW.has(b.use) || (b.use === 'drawing' && drawingOpen)));
        if (!ok) notes.push(issue('void-below', 'conflict', 'A double-height space needs the living hall (or dining or stair hall) below it.', [room.id], [key]));
      }
    }
  }
  return notes;
}

// ---- Migration from version 1 -------------------------------------------------------------

function useOf(raw: unknown): string | null {
  const value = ALIASES[String(raw)] || String(raw ?? '');
  if (PLAN_LIBRARY[value]) return value;
  const lower = value.toLowerCase();
  return Object.keys(PLAN_LIBRARY).find(k => k.toLowerCase() === lower) || null;
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function activeRefinements(source: any, floorKey: 'ground_floor' | 'first_floor'): Record<string, unknown> {
  const floor = source[floorKey] || {};
  let refinements: any;
  if (floor.advanced_refinements && typeof floor.advanced_refinements === 'object') refinements = floor.advanced_refinements;
  else if (floor.refinements && typeof floor.refinements === 'object') refinements = floor.refinements;
  else refinements = floorKey === 'ground_floor' && source.advanced_refinements && typeof source.advanced_refinements === 'object' ? source.advanced_refinements : {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(refinements)) {
    if (k === 'version' || k === 'cellLayouts') continue;
    if (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : v) out[k] = v;
  }
  const layouts = floor.cell_layouts || refinements.cellLayouts || {};
  if (layouts && Object.keys(layouts).length) out.cellLayouts = layouts;
  return out;
}

/**
 * A v1 Compass map (the payload the app saved) as a CompassPlanV2, with the notices to show once.
 * Deterministic and identical to compass_schema.migrate_v1. Nothing is deleted.
 */
export function migrateV1(input: any): { plan: CompassPlanV2; notices: string[] } {
  const source = input && typeof input.compass_map === 'object' ? input.compass_map : input || {};
  const plot = source.plot || {};
  const widthFt = Number(plot.width_ft) || 40, depthFt = Number(plot.depth_ft) || 60;
  let plotType = String(plot.type || 'Middle Plot');
  if (plotType === 'Three-side Open') plotType = 'Corner Plot';
  if (!PLOT_TYPES.includes(plotType as PlotType)) plotType = 'Middle Plot';
  const facing = titleCase(String(plot.facing || 'South'));
  const gateRaw = String(plot.gate_position || 'Center');
  const gate = gateRaw[0].toUpperCase() + gateRaw.slice(1).toLowerCase();
  const plan: any = {
    schema: PLAN_SCHEMA, version: PLAN_VERSION,
    plot: { widthIn: Math.round(widthFt * 12), depthIn: Math.round(depthFt * 12),
      facing: FACINGS.includes(facing) ? facing : 'South', gate: GATES.includes(gate as GateSide) ? gate : 'Center', plotType },
    storeys: String(plot.num_floors || '').toLowerCase().includes('multi') ? 2 : 1,
    floors: {}, choices: {},
  };
  const notices: string[] = [];
  const legacy: Record<string, any> = {};
  for (const [name, key] of [['ground', 'ground_floor'], ['first', 'first_floor']] as const) {
    const data = source[key];
    if (!data || typeof data !== 'object') continue;
    const floor: FloorIntent = { splits: [], rooms: [] };
    const owned = new Set<string>();
    for (const placement of data.placements || []) {
      const use = useOf(placement.roomId);
      const label = placement.room || placement.roomLabel || placement.roomId;
      if (!use) {
        notices.push(`"${label}" is not a Compass room type; it is kept with the saved plan details.`);
        (legacy[name] ||= {}).unknownRooms = [...(legacy[name]?.unknownRooms || []), JSON.parse(JSON.stringify(placement))];
        continue;
      }
      const cells: string[] = [];
      for (const cell of placement.cells || placement.occupiedCells || []) {
        if (CELLS.includes(cell) && !owned.has(cell) && !cells.includes(cell)) cells.push(cell);
        else if (owned.has(cell)) notices.push(`${cell} was in two rooms; it stays with the first.`);
      }
      cells.forEach(c => owned.add(c));
      const parts = components(cells);
      if (parts.length > 1) notices.push(`${PLAN_LIBRARY[use].label} was in ${parts.length} separate parts; each part is now its own room.`);
      for (const part of parts) floor.rooms.push({ id: nextRoomId(name, floor, use), use, regions: part as RegionKey[] });
    }
    const refinements = activeRefinements(source, key);
    if (Object.keys(refinements).length) {
      const splits = Object.keys(refinements).length === 1 && Array.isArray(refinements.subCellSplits) ? refinements.subCellSplits as any[] : null;
      const convertible = !!splits && splits.every(s => s && typeof s === 'object' && s.splitDirection === 'vertical'
        && (s.roomAPct === undefined || s.roomAPct === null || s.roomAPct === 50) && CELLS.includes(s.parentCell))
        && new Set(splits.map(s => s.parentCell)).size === splits.length;
      if (convertible) applyV1Splits(name, floor, splits!, notices);
      else legacy[name] = { ...(legacy[name] || {}), refinements: JSON.parse(JSON.stringify(refinements)) };
    }
    floor.rooms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    plan.floors[name] = floor;
  }
  if (!plan.floors.ground) plan.floors.ground = { splits: [], rooms: [] };
  if (Object.keys(legacy).length) {
    plan.legacy = { fromVersion: 1, refinements: legacy, reason: 'Saved plan details from the earlier Refine Map need converting before they can be drawn.' };
  }
  return { plan: normalisePlan(plan), notices };
}

function applyV1Splits(name: FloorId, floor: FloorIntent, splits: any[], notices: string[]): void {
  for (const split of [...splits].sort((a, b) => (a.parentCell < b.parentCell ? -1 : 1))) {
    const cell = split.parentCell as CellKey;
    const base = floor.rooms.find(r => r.regions.includes(cell));
    if (base) base.regions = [...base.regions.filter(k => k !== cell), `${cell}.L`, `${cell}.R`].sort() as RegionKey[];
    floor.splits = [...new Set([...floor.splits, cell])].sort() as CellKey[];
    for (const [half, raw] of [['L', split.roomA], ['R', split.roomB]] as const) {
      const key = `${cell}.${half}` as RegionKey;
      const use = raw ? useOf(raw) : null;
      if (base && use === base.use) continue;
      if (base) base.regions = base.regions.filter(k => k !== key);
      if (!use) continue;
      const joined = [...floor.rooms].sort((a, b) => (a.id < b.id ? -1 : 1))
        .find(r => r.use === use && r.regions.some(k => regionsTouch(key, k)));
      if (joined) joined.regions = [...joined.regions, key].sort() as RegionKey[];
      else floor.rooms.push({ id: nextRoomId(name, floor, use), use, regions: [key] });
    }
  }
  for (const room of [...floor.rooms]) {
    if (!room.regions.length) { floor.rooms.splice(floor.rooms.indexOf(room), 1); continue; }
    const parts = components(room.regions);
    if (parts.length > 1) {
      notices.push(`${PLAN_LIBRARY[room.use].label} was divided by a split cell; each part is now its own room.`);
      room.regions = parts[0] as RegionKey[];
      for (const part of parts.slice(1)) floor.rooms.push({ id: nextRoomId(name, floor, room.use), use: room.use, regions: part as RegionKey[] });
    }
  }
}

/** The v1 `compass_map` legacy readers expect, for plans without divided cells (§4.8). */
export function deriveV1(input: CompassPlanV2): Record<string, unknown> {
  const plan = normalisePlan(input);
  const floors = FLOORS.map(f => plan.floors[f]).filter(Boolean) as FloorIntent[];
  if (floors.some(f => f.splits.length) || floors.some(f => f.rooms.some(r => r.use === 'void' || r.use === 'passage'))) {
    return { requires_v2: true };
  }
  const widthFt = plan.plot.widthIn / 12, depthFt = plan.plot.depthIn / 12;
  const out: Record<string, unknown> = {
    grid_size: { rows: 4, cols: 4 },
    plot: { width_ft: widthFt, depth_ft: depthFt, facing: plan.plot.facing, type: plan.plot.plotType,
      num_floors: plan.storeys === 2 ? 'Multi-Floor' : 'Single Floor', gate_position: plan.plot.gate },
    cell_size_ft: { width: widthFt / 4, depth: depthFt / 4 },
  };
  for (const [name, key] of [['ground', 'ground_floor'], ['first', 'first_floor']] as const) {
    const floor = plan.floors[name];
    if (!floor) continue;
    const names = planLabels(floor);
    out[key] = { placements: floor.rooms.map(r => ({ room: names[r.id], roomId: r.use, placementId: r.id, cells: r.regions })) };
  }
  return out;
}
