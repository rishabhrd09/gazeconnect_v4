/**
 * The Compass map's state, keyed by room identity, with cells that can be divided into two halves.
 *
 * The canonical data is one FloorIntent per floor (CompassPlanV2, src/types/compassPlan.ts): which cells
 * are divided 50 % left | 50 % right, and which rooms own which regions. Everything the map shows is
 * derived from it. Every change is computed by a pure function below (placement, Refine, whole cell) and
 * committed as one undoable step (COMMIT_FLOOR); no change is ever applied silently or partly.
 * docs/compass-refine/IMPLEMENTATION_PLAN.md §4.3, §5.
 */
import type { CellKey, CompassPlanV2, FloorId, FloorIntent, RegionKey, RoomIntent, SplitDirection } from '../types/compassPlan';
import type { RoomComponent } from '../types/compass';
import {
  CATALOGUE, CELLS, PLAN_LIBRARY, REPEATABLE, STAIR_HOSTS, cellOf, components, floorRegions, nextRoomId,
  parseRegion, planLabels, regionRectIn, regionsTouch, cellRegions, halfName, otherHalf, regionsBelow, splitDirection, splitSides,
} from './compassPlan';

export const UNDO_LIMIT = 120;
export type CompassPhase = 'foundation' | 'placement' | 'review';

export interface Foundation {
  facing: string | null;
  plotWidth: number | null;
  plotDepth: number | null;
  plotType: string | null;
  numFloors: string | null;
  numBedrooms: string | null;
  gatePosition: string | null;
}

export interface HistoryEntry {
  floor: FloorIntent;
  currentIndex: number;
  phase: CompassPhase;
  activeRoomId: string | null;
}

export interface CompassStateV2 {
  phase: CompassPhase;
  currentFloor: FloorId;
  foundation: Foundation;
  foundationStep: number;
  floors: Record<FloorId, FloorIntent>;
  choices: CompassPlanV2['choices'];
  componentQueue: RoomComponent[];
  currentIndex: number;
  /** The room of the current use that new cells join (null: the next cell starts one). */
  activeRoomId: string | null;
  armed: boolean;
  history: HistoryEntry[];
  numFloors: string;
  legacy?: CompassPlanV2['legacy'];
}

export type CompassActionV2 =
  | { type: 'HYDRATE'; state: CompassStateV2 }
  | { type: 'SET_FOUNDATION'; key: keyof Foundation; value: any; total: number }
  | { type: 'PREFILL_FOUNDATION'; foundation: Partial<Foundation>; numFloors: string }
  | { type: 'FOUNDATION_BACK' }
  | { type: 'COMPLETE_FOUNDATION'; queue: RoomComponent[]; numFloors: string }
  | { type: 'SET_QUEUE'; queue: RoomComponent[] }
  | { type: 'ARM_GRID' }
  | { type: 'DISARM_GRID' }
  | { type: 'COMMIT_FLOOR'; floor: FloorIntent; activeRoomId?: string | null }
  | { type: 'REMOVE_ROOM'; roomId: string }
  | { type: 'NEXT_ROOM' }
  | { type: 'SKIP_ROOM' }
  | { type: 'SELECT_ROOM'; roomIndex: number }
  | { type: 'CONTINUE_PLACING' }
  | { type: 'SWITCH_FLOOR'; floor: FloorId; queue: RoomComponent[] }
  | { type: 'SET_NUM_FLOORS'; value: string }
  | { type: 'SET_CHOICE'; key: 'drawingRoom' | 'kitchen'; value: string }
  | { type: 'CONVERT_LEGACY' }
  | { type: 'UNDO' }
  | { type: 'RESET'; queue: RoomComponent[] };

export const emptyFloor = (): FloorIntent => ({ splits: [], rooms: [] });

export function createInitialState(queue: RoomComponent[]): CompassStateV2 {
  return {
    phase: 'foundation', currentFloor: 'ground',
    foundation: { facing: null, plotWidth: null, plotDepth: null, plotType: null, numFloors: null, numBedrooms: null, gatePosition: null },
    foundationStep: 0, floors: { ground: emptyFloor(), first: emptyFloor() }, choices: {},
    componentQueue: queue, currentIndex: 0, activeRoomId: null, armed: false, history: [], numFloors: 'Single Floor',
  };
}

// ---- Reading a floor ---------------------------------------------------------------------

export function roomById(floor: FloorIntent, id: string | null | undefined): RoomIntent | undefined {
  return id ? floor.rooms.find(r => r.id === id) : undefined;
}

export function ownerOf(floor: FloorIntent, key: string): RoomIntent | undefined {
  return floor.rooms.find(r => r.regions.includes(key as RegionKey));
}

export interface CellView {
  key: CellKey;
  split: boolean;
  direction: SplitDirection;
  whole: RoomIntent | null;
  left: RoomIntent | null;
  right: RoomIntent | null;
}

export function cellView(floor: FloorIntent, key: CellKey): CellView {
  const split = floor.splits.includes(key);
  const direction = splitDirection(floor, key);
  const [a, b] = splitSides(direction);
  return {
    key, split, direction,
    whole: split ? null : ownerOf(floor, key) || null,
    left: split ? ownerOf(floor, `${key}.${a}`) || null : null,
    right: split ? ownerOf(floor, `${key}.${b}`) || null : null,
  };
}

export function roomsOfUse(floor: FloorIntent, use: string): RoomIntent[] {
  return floor.rooms.filter(r => r.use === use).sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function labelsOf(floor: FloorIntent): Record<string, string> {
  return planLabels(floor);
}

/** Owned plan area as a whole percentage of the plot (a half cell counts as half a cell). */
export function coveragePercent(floor: FloorIntent): number {
  const owned = floor.rooms.reduce((n, r) => n + r.regions.reduce((m, k) => m + (k.includes('.') ? .5 : 1), 0), 0);
  return Math.round(owned / CELLS.length * 100);
}

/** A copy with one room's regions replaced (the room is removed when it has none left). */
function withRegions(floor: FloorIntent, roomId: string, regions: string[]): FloorIntent {
  const rooms = floor.rooms
    .map(r => (r.id === roomId ? { ...r, regions: [...new Set(regions)].sort() as RegionKey[] } : r))
    .filter(r => r.regions.length > 0);
  return { ...floor, rooms };
}

function withNewRoom(floor: FloorIntent, floorId: FloorId, use: string, regions: string[]): { floor: FloorIntent; id: string } {
  const id = nextRoomId(floorId, floor, use);
  const rooms = [...floor.rooms, { id, use, regions: [...regions].sort() as RegionKey[] }].sort((a, b) => (a.id < b.id ? -1 : 1));
  return { floor: { ...floor, rooms }, id };
}

const connected = (regions: string[]) => regions.length === 0 || components(regions).length === 1;
const label = (floor: FloorIntent, room: RoomIntent) => labelsOf(floor)[room.id] || PLAN_LIBRARY[room.use]?.label || room.use;
const library = (use: string) => PLAN_LIBRARY[use]?.label || use;

// ---- Sizes and fit (estimates for the picker; the floor-plan service computes the exact plan) -----

/** Minimum clear width (inches) per use (§4.6); 0 where none applies. */
export const MIN_CLEAR_IN: Record<string, number> = {
  living: 94, drawing: 94, masterBed: 94, icu: 94, ff_master: 94, ff_living: 94,
  bedroom: 83, dining: 83, ff_bed2: 83, ff_bed3: 83,
  kitchen: 59, bathroom: 47, ff_bathroom: 47, passage: 39,
  staircase: 75, diningStaircase: 75, ff_stairLanding: 75,
};

export function regionSizeIn(key: string, widthIn: number, depthIn: number): { width: number; depth: number } {
  const [x1, y1, x2, y2] = regionRectIn(key, widthIn, depthIn);
  return { width: x2 - x1, depth: y2 - y1 };
}

/** Estimated clear width of a region: 3-inch half partitions inside, a 9-inch outer wall at the plot edge. */
export function clearWidthIn(key: string, widthIn: number, depthIn: number): number {
  const { col, half } = parseRegion(key);
  const { width } = regionSizeIn(key, widthIn, depthIn);
  const atLeft = col === 1 && half !== 'R';
  const atRight = col === 4 && half !== 'L';
  const clearWidth = width - (atLeft ? 9 : 3) - (atRight ? 9 : 3);
  if (half !== 'T' && half !== 'B') return clearWidth;
  const [x1, y1, x2, y2] = regionRectIn(key, widthIn, depthIn);
  return Math.min(x2 - x1 - (x1 === 0 ? 9 : 3) - (x2 === widthIn ? 9 : 3),
    y2 - y1 - (y1 === 0 ? 9 : 3) - (y2 === depthIn ? 9 : 3));
}

/** No room is given a half narrower than this (2'-6" clear): the one size limit that refuses (decided 16 Oct 2026). */
export const HALF_MIN_CLEAR_IN = 30;

/** The narrowest and widest clear widths a half cell has on this plot (at the side wall, and inside). */
export function halfClearRangeIn(widthIn: number, depthIn: number, direction: SplitDirection = 'left-right'): { narrowest: number; widest: number } {
  if (direction === 'top-bottom') return { narrowest: clearWidthIn('r1_c1.B', widthIn, depthIn), widest: clearWidthIn('r2_c2.T', widthIn, depthIn) };
  return { narrowest: clearWidthIn('r2_c1.L', widthIn, depthIn), widest: clearWidthIn('r2_c2.L', widthIn, depthIn) };
}

/** Whether cells may be divided on this plot: every half at least 2'-6" clear (30 ft plots and wider; 20 and 25 ft not). */
export function halvesUsable(widthIn: number, depthIn: number, direction: SplitDirection = 'left-right'): boolean {
  return halfClearRangeIn(widthIn, depthIn, direction).narrowest >= HALF_MIN_CLEAR_IN;
}

// ---- Placement mode (whole cells) ----------------------------------------------------------

export type PlaceOutcome =
  | { kind: 'refused'; message: string }
  | { kind: 'confirm-replace'; victim: RoomIntent; victimLabel: string }
  | { kind: 'commit'; floor: FloorIntent; activeRoomId: string | null; message: string; roomId: string | null };

/**
 * A dwell on a whole cell while placing `use`: add it to that use's room, remove it again, or (after
 * the person confirms) take it from another room. Rooms stay one connected piece; a repeatable use in
 * a cell that does not touch its room becomes a separate room ("Bedroom 2").
 */
export function placeCell(state: CompassStateV2, cell: CellKey, use: string, confirmedReplace = false,
  below?: FloorIntent): PlaceOutcome {
  const floorId = state.currentFloor;
  const floor = state.floors[floorId];
  if (floor.splits.includes(cell)) return { kind: 'refused', message: 'This cell is divided. Use Refine to change it.' };
  const owner = ownerOf(floor, cell);
  const name = library(use);
  if (owner && owner.use === use) {
    const rest = owner.regions.filter(k => k !== cell);
    if (!connected(rest)) {
      return { kind: 'refused', message: `Removing this cell would split ${label(floor, owner)} in two. Remove a cell at its end first.` };
    }
    const next = withRegions(floor, owner.id, rest);
    return { kind: 'commit', floor: next, activeRoomId: rest.length ? owner.id : null, roomId: owner.id,
      message: `${label(floor, owner)} removed from this cell.` };
  }
  if (use === 'void') {
    const problem = voidProblem(below, [cell], state.choices);
    if (problem) return { kind: 'refused', message: problem };
  }
  let base = floor;
  if (owner) {
    if (!confirmedReplace) return { kind: 'confirm-replace', victim: owner, victimLabel: label(floor, owner) };
    const rest = owner.regions.filter(k => k !== cell);
    if (!connected(rest)) {
      return { kind: 'refused', message: `Placing ${name} here would split ${label(floor, owner)} in two. Choose a cell at its end.` };
    }
    base = withRegions(floor, owner.id, rest);
  }
  return joinOrCreate(base, floorId, use, cell, state.activeRoomId);
}

function joinOrCreate(floor: FloorIntent, floorId: FloorId, use: string, key: string, activeRoomId: string | null): PlaceOutcome {
  const same = roomsOfUse(floor, use);
  const touching = same.filter(r => r.regions.some(k => regionsTouch(key, k)));
  const name = library(use);
  const target = touching.find(r => r.id === activeRoomId) || touching[0];
  if (target) {
    const next = withRegions(floor, target.id, [...target.regions, key]);
    return { kind: 'commit', floor: next, activeRoomId: target.id, roomId: target.id, message: `${labelsOf(next)[target.id]} extended.` };
  }
  if (same.length && !REPEATABLE.has(use)) {
    return { kind: 'refused', message: `${name} is already placed. Choose a cell next to it.` };
  }
  if (STAIR_HOSTS[floorId].has(use) && floor.rooms.some(r => STAIR_HOSTS[floorId].has(r.use))) {
    return { kind: 'refused', message: 'Only one room on a floor can hold the stair.' };
  }
  const created = withNewRoom(floor, floorId, use, [key]);
  const shown = labelsOf(created.floor)[created.id];
  return { kind: 'commit', floor: created.floor, activeRoomId: created.id, roomId: created.id,
    message: same.length ? `A separate ${shown} placed.` : `${shown} placed.` };
}

/** Why a double-height void cannot stand over these regions, or null (§7.7). */
export function voidProblem(below: FloorIntent | undefined, keys: string[], choices: CompassPlanV2['choices']): string | null {
  if (!below) return 'Place the ground floor first: a double-height space needs the living hall below it.';
  const drawingOpen = choices?.drawingRoom !== 'separate';
  for (const key of keys) {
    const candidates = regionsBelow(key, below);
    for (const k of candidates) {
      const room = ownerOf(below, k);
      const ok = room && (['living', 'dining', 'staircase', 'diningStaircase'].includes(room.use) || (room.use === 'drawing' && drawingOpen));
      if (!ok) return 'A double-height space needs the living hall (or dining or stair hall) below it.';
    }
  }
  return null;
}

// ---- Refine: dividing a cell and assigning its halves -------------------------------------

/** Divides a whole cell 50 % | 50 %; both halves keep the cell's owner, so nothing moves yet. */
export function splitCell(floor: FloorIntent, cell: CellKey, direction: SplitDirection = 'left-right'): FloorIntent {
  if (floor.splits.includes(cell)) return floor;
  const halves = splitSides(direction).map(h => `${cell}.${h}` as RegionKey);
  const owner = ownerOf(floor, cell);
  const splits = [...floor.splits, cell].sort() as CellKey[];
  const rooms = floor.rooms.map(r => (r.id === owner?.id
    ? { ...r, regions: [...r.regions.filter(k => k !== cell), ...halves].sort() as RegionKey[] } : r));
  return { ...floor, splits, rooms, ...(direction === 'top-bottom' ? { splitDirections: { ...floor.splitDirections, [cell]: direction } } : {}) };
}

export type AssignChoice = { type: 'empty' } | { type: 'use'; use: string; separate?: boolean };

/** A room narrower than its use needs: placed with this warning, never refused (decided 16 Oct 2026, B2). */
export interface Shortfall { needIn: number; haveIn: number }

export type AssignOutcome =
  | { kind: 'commit'; floor: FloorIntent; roomId: string | null; message: string; short?: Shortfall }
  | { kind: 'ask-separate'; use: string; label: string; message: string; short?: Shortfall }
  | { kind: 'refused'; message: string }
  | { kind: 'too-narrow'; use: string; needIn: number; haveIn: number; message: string }
  | { kind: 'disconnects'; victim: RoomIntent; victimLabel: string; message: string; otherHalf: RegionKey };

/** "Bedroom: 4'-6" clear, needs 6'-11"", the warning shown on a narrow half. */
export function shortfallText(use: string, short: Shortfall): string {
  return `${library(use)}: ${inches(short.haveIn)} clear, needs ${inches(short.needIn)}`;
}

/**
 * The map's estimate of a room's clear width: its widest run of regions side by side in one row, less a 9-inch
 * outer wall at the plot edge and half a 6-inch partition inside. Only for warnings on the map; the floor-plan
 * service decides the drawn size and writes the size-short note.
 */
export function roomClearWidthIn(room: RoomIntent, widthIn: number, depthIn: number): number {
  if (room.regions.some(k => /\.[TB]$/.test(k))) {
    // Sweep actual bands: a top and a bottom region do not share a horizontal run merely because
    // they have the same row number. Measure both axes for the new orientation.
    const rects = room.regions.map(k => regionRectIn(k, widthIn, depthIn));
    const widestRun = (axis: 0 | 1, extent: number) => {
      const cross = axis === 0 ? 1 : 0;
      const cuts = [...new Set(rects.flatMap(r => [r[cross], r[cross + 2]]))].sort((a, b) => a - b);
      let best = 0;
      for (let i = 1; i < cuts.length; i++) {
        const mid = (cuts[i - 1] + cuts[i]) / 2;
        const spans = rects.filter(r => r[cross] < mid && r[cross + 2] > mid)
          .map(r => [r[axis], r[axis + 2]]).sort((a, b) => a[0] - b[0]);
        if (!spans.length) continue;
        let [start, end] = spans[0];
        const measure = () => { best = Math.max(best, end - start - (start === 0 ? 9 : 3) - (end === extent ? 9 : 3)); };
        for (const [a, b] of spans.slice(1)) {
          if (a <= end) end = Math.max(end, b);
          else { measure(); [start, end] = [a, b]; }
        }
        measure();
      }
      return best;
    };
    return Math.min(widestRun(0, widthIn), widestRun(1, depthIn));
  }
  const rows = new Map<number, Array<[number, number]>>();
  for (const key of room.regions) {
    const [x1, , x2] = regionRectIn(key, widthIn, depthIn);
    const row = parseRegion(key).row;
    rows.set(row, [...(rows.get(row) || []), [x1, x2]]);
  }
  let widest = 0;
  for (const spans of rows.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    let [start, end] = spans[0];
    const measure = () => { widest = Math.max(widest, end - start - (start <= 0.5 ? 9 : 3) - (end >= widthIn - 0.5 ? 9 : 3)); };
    for (const [x1, x2] of spans.slice(1)) {
      if (x1 <= end + 0.5) end = Math.max(end, x2);
      else { measure(); [start, end] = [x1, x2]; }
    }
    measure();
  }
  return widest;
}

/** The warning for a half whose room is narrower than its use needs, or null (B2). */
export function halfShortfall(floor: FloorIntent, key: string, widthIn: number, depthIn: number): Shortfall | null {
  const room = ownerOf(floor, key);
  const need = room ? MIN_CLEAR_IN[room.use] || 0 : 0;
  if (!room || !need) return null;
  const have = roomClearWidthIn(room, widthIn, depthIn);
  return have < need ? { needIn: need, haveIn: have } : null;
}

/**
 * The room this half joins to the rest of itself (B4): giving the half away would cut that room in two. For an
 * undivided cell, as if it were divided (both halves keep the cell's room).
 */
export function halfLinksRoom(floor: FloorIntent, key: RegionKey): RoomIntent | null {
  const divided = splitCell(floor, cellOf(key), /\.[TB]$/.test(key) ? 'top-bottom' : 'left-right');
  const room = ownerOf(divided, key);
  if (!room || room.regions.length < 2) return null;
  return connected(room.regions.filter(k => k !== key)) ? null : room;
}

/** Gives one half (`key`, e.g. 'r2_c3.L') to a room of `use`, or leaves it empty (§5.3). */
export function assignHalf(state: CompassStateV2, key: RegionKey, choice: AssignChoice, below?: FloorIntent): AssignOutcome {
  const floorId = state.currentFloor;
  const floor = state.floors[floorId];
  const { widthIn, depthIn } = plotInches(state);
  if (!parseRegion(key).half || !floorRegions(floor).includes(key)) return { kind: 'refused', message: 'Choose a half in this cell’s saved split direction.' };
  const current = ownerOf(floor, key);
  const side = halfName(key);
  const opposite = otherHalf(key);
  const sideTitle = side[0].toUpperCase() + side.slice(1);
  if (choice.type === 'use' && current?.use === choice.use && !choice.separate) {
    return { kind: 'commit', floor, roomId: current.id, message: `The ${side} half is already ${label(floor, current)}.` };
  }
  if (choice.type === 'use') {
    if (choice.use === 'void') {
      const problem = voidProblem(below, [key], state.choices);
      if (problem) return { kind: 'refused', message: problem };
    }
  }
  // Taking the half away from its owner must leave that room in one piece.
  let base = floor;
  if (current) {
    const rest = current.regions.filter(k => k !== key);
    if (!connected(rest)) {
      return { kind: 'disconnects', victim: current, victimLabel: label(floor, current), otherHalf: opposite,
        message: `${label(floor, current)} would be cut in two. Give the ${halfName(opposite)} half instead, or give both halves.` };
    }
    base = withRegions(floor, current.id, rest);
  }
  if (choice.type === 'empty') {
    return { kind: 'commit', floor: base, roomId: null, message: `The ${side} half is empty.` };
  }
  const use = choice.use;
  const same = roomsOfUse(base, use);
  const touching = same.filter(r => r.regions.some(k => regionsTouch(key, k)));
  if (touching.length && !choice.separate) {
    const target = touching.find(r => r.id === state.activeRoomId) || touching[0];
    const next = withRegions(base, target.id, [...target.regions, key]);
    return { kind: 'commit', floor: next, roomId: target.id, message: `${sideTitle} half: ${labelsOf(next)[target.id]}.` };
  }
  if (same.length && !choice.separate && !REPEATABLE.has(use)) {
    return { kind: 'refused', message: `${library(use)} is already on this floor; a house has one. Choose another room.` };
  }
  if (STAIR_HOSTS[floorId].has(use) && base.rooms.some(r => STAIR_HOSTS[floorId].has(r.use))) {
    return { kind: 'refused', message: 'Only one room on a floor can hold the stair.' };
  }
  // A half that becomes a room on its own is judged by its size before "a separate room?" is asked (A2), so a
  // choice is never two questions. Only a half under 2'-6" clear is refused; a room narrower than its use needs is
  // placed with a warning, as whole rooms are (B2, decided 16 Oct 2026). Extending a room is judged on the room.
  const need = MIN_CLEAR_IN[use] || 0;
  const have = clearWidthIn(key, widthIn, depthIn);
  if (have < HALF_MIN_CLEAR_IN) {
    return { kind: 'too-narrow', use, needIn: Math.max(need, HALF_MIN_CLEAR_IN), haveIn: have,
      message: `This half is only ${inches(have)} clear; no room is given a half under 2'-6".` };
  }
  const short = need && have < need ? { needIn: need, haveIn: have } : undefined;
  const narrow = short ? ` Narrow: ${inches(have)} clear; ${library(use)} needs ${inches(need)}.` : '';
  if (same.length && !choice.separate) {
    return { kind: 'ask-separate', use, label: `${library(use)} ${same.length + 1}`, short,
      message: `${library(use)} is elsewhere on this floor. Make a separate ${library(use)} ${same.length + 1}, or choose another room.${narrow}` };
  }
  const created = withNewRoom(base, floorId, use, [key]);
  return { kind: 'commit', floor: created.floor, roomId: created.id, short,
    message: `${sideTitle} half: ${labelsOf(created.floor)[created.id]}.${narrow}` };
}

/** "Give both halves to B" (the answer to a cut-in-two refusal): both halves, then the cell made whole. */
export function giveBothHalves(state: CompassStateV2, cell: CellKey, use: string, below?: FloorIntent): AssignOutcome {
  if (use === 'void') {
    const problem = voidProblem(below, [cell], state.choices);
    if (problem) return { kind: 'refused', message: problem };
  }
  const floor = state.floors[state.currentFloor];
  const owners = cellRegions(floor, cell).map(k => ownerOf(floor, k)).filter(Boolean) as RoomIntent[];
  let base = floor;
  for (const owner of owners) {
    const rest = owner.regions.filter(k => !k.startsWith(`${cell}.`));
    if (!connected(rest)) return { kind: 'refused', message: `${label(floor, owner)} would be cut in two.` };
    base = withRegions(base, owner.id, rest);
  }
  const unsplit = wholeCell(base, cell, null);
  const outcome = joinOrCreate(unsplit, state.currentFloor, use, cell, state.activeRoomId);
  if (outcome.kind !== 'commit') return { kind: 'refused', message: outcome.kind === 'refused' ? outcome.message : 'Not possible here.' };
  return { kind: 'commit', floor: outcome.floor, roomId: outcome.roomId, message: `Whole cell: ${labelsOf(outcome.floor)[outcome.roomId || ''] || library(use)}.` };
}

export interface WholeOption { owner: string | null; label: string; removes: string[]; allowed: boolean; reason?: string }

/** The answers WHOLE CELL offers for a divided cell (§5.3 "Restore whole cell"). */
export function wholeOptions(floor: FloorIntent, cell: CellKey): WholeOption[] {
  const [a, b] = cellRegions(floor, cell);
  const left = ownerOf(floor, a) || null;
  const right = b ? ownerOf(floor, b) || null : null;
  const names = labelsOf(floor);
  const option = (owner: RoomIntent | null): WholeOption => {
    const removes: string[] = [];
    let allowed = true;
    let reason: string | undefined;
    for (const other of [left, right]) {
      if (!other || other.id === owner?.id) continue;
      const rest = other.regions.filter(k => !k.startsWith(`${cell}.`));
      if (!rest.length) removes.push(names[other.id]);
      else if (!connected(rest)) { allowed = false; reason = `${names[other.id]} would be cut in two`; }
    }
    const text = owner ? `Whole cell: ${names[owner.id]}` : 'Whole cell: empty';
    return { owner: owner?.id || null, label: removes.length ? `${text} (removes ${removes.join(', ')})` : text, removes, allowed, reason };
  };
  if (!left && !right) return [option(null)];
  if (left && right && left.id === right.id) return [option(left)];
  const out: WholeOption[] = [];
  for (const room of [left, right]) if (room && !out.some(o => o.owner === room.id)) out.push(option(room));
  if (!left || !right) out.push(option(null));
  return out;
}

/** Makes a divided cell whole again, owned by `owner` (or empty). */
export function wholeCell(floor: FloorIntent, cell: CellKey, owner: string | null): FloorIntent {
  const rooms = floor.rooms.map(r => {
    const regions = r.regions.filter(k => !k.startsWith(`${cell}.`));
    return { ...r, regions: (r.id === owner ? [...regions, cell] : regions).sort() as RegionKey[] };
  }).filter(r => r.regions.length > 0);
  const splitDirections = { ...floor.splitDirections };
  delete splitDirections[cell];
  return { splits: floor.splits.filter(c => c !== cell), rooms,
    ...(Object.keys(splitDirections).length ? { splitDirections } : {}) };
}

// ---- Plot, plan, and the reducer ---------------------------------------------------------------

/**
 * What SKIP stores for a foundation question: the answer already there (prefilled, or from the survey), and only
 * when there is none the question's first option. Skipping never replaces the plot the person or the survey gave
 * (REFINE_FIX_HANDOFF A1: skipping every question used to store a 20 x 30 ft North plot).
 */
export function skippedAnswer(foundation: Foundation, key: keyof Foundation, firstOption: string | number): { value: string | number; kept: boolean } {
  const current = foundation[key];
  return current !== null && current !== undefined && current !== '' ? { value: current, kept: true } : { value: firstOption, kept: false };
}

export function plotInches(state: Pick<CompassStateV2, 'foundation'>): { widthIn: number; depthIn: number } {
  return { widthIn: Math.round((state.foundation.plotWidth || 40) * 12), depthIn: Math.round((state.foundation.plotDepth || 60) * 12) };
}

const PLOT_TYPES = ['Middle Plot', 'Corner Plot', 'Independent'];

/** The CompassPlanV2 of the current state (the one canonical description saved and sent to the studio). */
export function planFromState(state: CompassStateV2): CompassPlanV2 {
  const { widthIn, depthIn } = plotInches(state);
  const facing = ['North', 'East', 'South', 'West'].includes(state.foundation.facing || '') ? state.foundation.facing! : 'South';
  const gate = ['Left', 'Center', 'Right'].includes(state.foundation.gatePosition || '') ? state.foundation.gatePosition! : 'Center';
  const plotType = PLOT_TYPES.includes(state.foundation.plotType || '') ? state.foundation.plotType! : 'Middle Plot';
  const storeys = state.numFloors === 'Multi-Floor' ? 2 : 1;
  const plan: CompassPlanV2 = {
    schema: 'gazeconnect.compass-plan', version: Object.values(state.floors).some(f => Object.keys(f.splitDirections || {}).length) ? 3 : 2,
    plot: { widthIn: Math.min(2400, Math.max(180, widthIn)), depthIn: Math.min(2400, Math.max(180, depthIn)),
      facing: facing as CompassPlanV2['plot']['facing'], gate: gate as CompassPlanV2['plot']['gate'],
      plotType: plotType as CompassPlanV2['plot']['plotType'] },
    storeys, floors: { ground: state.floors.ground }, choices: { ...state.choices },
  };
  if (state.floors.first.rooms.length || state.floors.first.splits.length || storeys === 2) plan.floors.first = state.floors.first;
  if (state.legacy) plan.legacy = state.legacy;
  return plan;
}

function snapshot(state: CompassStateV2): HistoryEntry {
  return { floor: state.floors[state.currentFloor], currentIndex: state.currentIndex, phase: state.phase, activeRoomId: state.activeRoomId };
}

function pushHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return history.length >= UNDO_LIMIT ? [...history.slice(-(UNDO_LIMIT - 1)), entry] : [...history, entry];
}

/** The first use in the queue that has no room yet (the queue's length when all are placed). */
export function nextUnplaced(queue: RoomComponent[], floor: FloorIntent): number {
  const placed = new Set(floor.rooms.map(r => r.use));
  const index = queue.findIndex(r => !placed.has(r.roomId));
  return index >= 0 ? index : queue.length;
}

export function compassReducer(state: CompassStateV2, action: CompassActionV2): CompassStateV2 {
  switch (action.type) {
    case 'HYDRATE':
      return { ...action.state, armed: false, history: [] };
    case 'SET_FOUNDATION':
      return { ...state, foundation: { ...state.foundation, [action.key]: action.value }, foundationStep: Math.min(state.foundationStep + 1, action.total) };
    case 'PREFILL_FOUNDATION':
      return { ...state, phase: 'foundation', foundationStep: 0, foundation: { ...state.foundation, ...action.foundation }, numFloors: action.numFloors, armed: false };
    case 'FOUNDATION_BACK':
      return state.foundationStep <= 0 ? state : { ...state, foundationStep: state.foundationStep - 1 };
    case 'COMPLETE_FOUNDATION':
      return { ...state, phase: 'placement', componentQueue: action.queue, currentIndex: 0, activeRoomId: null, armed: false, numFloors: action.numFloors };
    case 'SET_QUEUE':
      return state.phase !== 'foundation' ? state : { ...state, componentQueue: action.queue };
    case 'ARM_GRID':
      if (state.phase !== 'placement' || state.currentIndex >= state.componentQueue.length) return state;
      return { ...state, armed: true };
    case 'DISARM_GRID':
      return { ...state, armed: false };
    case 'COMMIT_FLOOR': {
      if (action.floor === state.floors[state.currentFloor]) return state;
      return {
        ...state, history: pushHistory(state.history, snapshot(state)),
        floors: { ...state.floors, [state.currentFloor]: action.floor },
        activeRoomId: action.activeRoomId === undefined ? state.activeRoomId : action.activeRoomId,
      };
    }
    case 'REMOVE_ROOM': {
      const floor = state.floors[state.currentFloor];
      if (!roomById(floor, action.roomId)) return state;
      const room = roomById(floor, action.roomId)!;
      const next: FloorIntent = { ...floor, rooms: floor.rooms.filter(r => r.id !== action.roomId) };
      const index = state.componentQueue.findIndex(r => r.roomId === room.use);
      return {
        ...state, history: pushHistory(state.history, snapshot(state)), floors: { ...state.floors, [state.currentFloor]: next },
        currentIndex: index >= 0 ? index : state.currentIndex, phase: 'placement', armed: false,
        activeRoomId: roomsOfUse(next, room.use)[0]?.id || null,
      };
    }
    case 'NEXT_ROOM': {
      if (state.phase !== 'placement' || !state.armed || !state.componentQueue[state.currentIndex]) return state;
      const index = state.currentIndex + 1;
      const use = state.componentQueue[index]?.roomId;
      return { ...state, currentIndex: index, armed: false, phase: index >= state.componentQueue.length ? 'review' : 'placement',
        activeRoomId: use ? roomsOfUse(state.floors[state.currentFloor], use)[0]?.id || null : null };
    }
    case 'SKIP_ROOM': {
      const index = state.currentIndex + 1;
      return { ...state, currentIndex: index, armed: false, activeRoomId: null, phase: index >= state.componentQueue.length ? 'review' : 'placement' };
    }
    case 'SELECT_ROOM': {
      if (action.roomIndex < 0 || action.roomIndex >= state.componentQueue.length) return state;
      const use = state.componentQueue[action.roomIndex].roomId;
      return { ...state, currentIndex: action.roomIndex, phase: 'placement', armed: false,
        activeRoomId: roomsOfUse(state.floors[state.currentFloor], use)[0]?.id || null };
    }
    case 'CONTINUE_PLACING':
      return { ...state, phase: 'placement', armed: false };
    case 'SWITCH_FLOOR': {
      if (action.floor === state.currentFloor) return state;
      const floor = state.floors[action.floor];
      const index = nextUnplaced(action.queue, floor);
      return {
        ...state, currentFloor: action.floor, componentQueue: action.queue, currentIndex: index,
        phase: index >= action.queue.length ? 'review' : 'placement', armed: false, history: [],
        activeRoomId: action.queue[index] ? roomsOfUse(floor, action.queue[index].roomId)[0]?.id || null : null,
      };
    }
    case 'SET_NUM_FLOORS':
      return { ...state, numFloors: action.value };
    case 'SET_CHOICE':
      return { ...state, choices: { ...state.choices, [action.key]: action.value } };
    case 'CONVERT_LEGACY':
      return state.legacy ? { ...state, legacy: { ...state.legacy, converted: true } } : state;
    case 'UNDO': {
      if (!state.history.length) return state;
      const last = state.history[state.history.length - 1];
      return {
        ...state, floors: { ...state.floors, [state.currentFloor]: last.floor }, currentIndex: last.currentIndex,
        phase: last.phase, activeRoomId: last.activeRoomId, armed: false, history: state.history.slice(0, -1),
      };
    }
    case 'RESET':
      return createInitialState(action.queue);
    default:
      return state;
  }
}

/** Every use of a floor's catalogue (for the room picker), in the map's own order. */
export function catalogueUses(floor: FloorId): string[] {
  return CATALOGUE[floor];
}

export function inches(value: number): string {
  const total = Math.round(value * 2) / 2;
  const feet = Math.floor(total / 12);
  const rest = total - feet * 12;
  const whole = Math.floor(rest);
  return `${feet}'-${whole}${rest - whole >= .5 ? '½' : ''}"`;
}

/** Regions of a floor that are not owned by any room. */
export function unassignedRegions(floor: FloorIntent): string[] {
  const owned = new Set(floor.rooms.flatMap(r => r.regions));
  return floorRegions(floor).filter(k => !owned.has(k));
}
