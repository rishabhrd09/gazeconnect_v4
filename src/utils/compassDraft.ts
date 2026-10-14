/**
 * Saving and restoring the Compass map (docs/compass-refine/IMPLEMENTATION_PLAN.md §4.8).
 *
 * Version 2 drafts live under new keys, so a rollback build still finds its version 1 draft untouched.
 * A version 1 draft is migrated once, on load, by the same rules as the floor-plan service
 * (compassPlan.migrateV1): each room becomes one room per connected part, vertical 50 % splits become
 * divided cells, and anything else is kept read-only in `legacy`. Nothing is deleted. A draft newer than
 * this build is opened read-only and never overwritten.
 */
import type { CompassPlanV2, FloorId, FloorIntent } from '../types/compassPlan';
import type { RoomComponent } from '../types/compass';
import { deriveV1, migrateV1, normalisePlan } from './compassPlan';
import { CompassStateV2, Foundation, createInitialState, emptyFloor, nextUnplaced, planFromState, roomsOfUse } from './compassReducer';

export const DRAFT_VERSION = 2;
export const DRAFT_KEYS = { session: 'gazeconnect_compass_progress_v2', primary: 'compass_persistent_backup_v2', last: 'compass_last_session_backup_v2' };
export const V1_KEYS = { session: 'gazeconnect_compass_progress_v1', primary: 'compass_persistent_backup', last: 'compass_last_session_backup' };
/** Set once a version 2 draft exists: from then on the frozen version 1 draft is never migrated again. */
export const MIGRATED_KEY = 'gazeconnect_compass_v2_started';

export interface DraftV2 {
  version: 2;
  plan: CompassPlanV2 | null;
  floors: Record<FloorId, FloorIntent>;
  ui: {
    phase: CompassStateV2['phase'];
    currentFloor: FloorId;
    foundationStep: number;
    foundation: Foundation;
    currentIndex: number;
    numFloors: string;
    activeRoomId: string | null;
  };
  choices: CompassPlanV2['choices'];
  legacy?: CompassPlanV2['legacy'];
}

export interface ParsedDraft {
  state: CompassStateV2;
  notices: string[];
  fromV1: boolean;
  newer: boolean;
  /** The verbatim v1 refinements (for the read-only saved-plan viewer and locked cells). */
  legacySource?: any;
}

type QueueFor = (floor: FloorId) => RoomComponent[];

export function draftFromState(state: CompassStateV2): DraftV2 {
  let plan: CompassPlanV2 | null = null;
  if (state.phase !== 'foundation' && state.foundation.plotWidth && state.foundation.plotDepth) {
    try { plan = normalisePlan(planFromState(state)); } catch { plan = null; }
  }
  return {
    version: DRAFT_VERSION, plan, floors: state.floors, choices: state.choices, legacy: state.legacy,
    ui: { phase: state.phase, currentFloor: state.currentFloor, foundationStep: state.foundationStep, foundation: state.foundation,
      currentIndex: state.currentIndex, numFloors: state.numFloors, activeRoomId: state.activeRoomId },
  };
}

function hydrateFloors(value: any): Record<FloorId, FloorIntent> {
  const floor = (f: any): FloorIntent => ({
    splits: Array.isArray(f?.splits) ? [...f.splits] : [],
    rooms: Array.isArray(f?.rooms) ? f.rooms.map((r: any) => ({ id: r.id, use: r.use, regions: [...(r.regions || [])] })) : [],
  });
  return { ground: floor(value?.ground), first: floor(value?.first) };
}

/** Rebuilds a state from a version 2 draft; the floors are validated through the plan schema. */
function fromV2(draft: DraftV2, queueFor: QueueFor): CompassStateV2 {
  const ui = draft.ui;
  const floors = hydrateFloors(draft.plan?.floors ?? draft.floors);
  // A draft whose floors fail the schema (edited by hand, or damaged) keeps its plot but starts empty.
  try {
    normalisePlan({ schema: 'gazeconnect.compass-plan', version: 2,
      plot: { widthIn: 480, depthIn: 720, facing: 'South', gate: 'Center', plotType: 'Middle Plot' },
      storeys: 2, floors, choices: draft.choices || {} });
  } catch {
    floors.ground = emptyFloor(); floors.first = emptyFloor();
  }
  const queue = queueFor(ui.currentFloor);
  const state = createInitialState(queue);
  return {
    ...state, phase: ui.phase || 'foundation', currentFloor: ui.currentFloor || 'ground', foundation: { ...state.foundation, ...ui.foundation },
    foundationStep: ui.foundationStep || 0, floors, choices: draft.choices || {}, legacy: draft.legacy,
    currentIndex: Math.max(0, Math.min(ui.currentIndex ?? 0, queue.length)), numFloors: ui.numFloors || 'Single Floor',
    activeRoomId: ui.activeRoomId && floors[ui.currentFloor || 'ground'].rooms.some(r => r.id === ui.activeRoomId) ? ui.activeRoomId : null,
  };
}

/** A version 1 map built from a version 1 draft, then migrated (compassPlan.migrateV1). */
function fromV1(raw: any, queueFor: QueueFor): ParsedDraft | null {
  const st = raw?.state ?? raw;
  if (!st || typeof st !== 'object' || !st.foundation) return null;
  const current: FloorId = st.currentFloor === 'first' ? 'first' : 'ground';
  const groundPlacements = current === 'ground' ? st.placements : st.groundFloorData?.placements;
  const firstPlacements = current === 'first' ? st.placements : st.firstFloorData?.placements;
  const metadata = raw?.advancedFloorMetadata;
  const refinementsFor = (floor: FloorId) => {
    const own = metadata?.[floor === 'ground' ? 'gnd' : '1f'];
    const refinements = own?.advanced_refinements ?? (current === floor ? raw?.refinements : undefined);
    const layouts = own?.cell_layouts;
    return refinements || layouts ? { ...(refinements || {}), ...(layouts ? { cellLayouts: layouts } : {}) } : undefined;
  };
  const placementsOf = (list: any) => (Array.isArray(list) ? list : []).map((p: any) => ({
    roomId: p.roomId, room: p.roomLabel || p.room, cells: p.occupiedCells || p.cells || [],
  }));
  const f = st.foundation;
  const map: any = {
    plot: { width_ft: f.plotWidth || 40, depth_ft: f.plotDepth || 60, facing: f.facing || 'South', type: f.plotType || 'Middle Plot',
      num_floors: st.numFloors || f.numFloors || 'Single Floor', gate_position: f.gatePosition || 'Center' },
    ground_floor: { placements: placementsOf(groundPlacements), advanced_refinements: refinementsFor('ground') },
  };
  if (Array.isArray(firstPlacements) && firstPlacements.length || refinementsFor('first')) {
    map.first_floor = { placements: placementsOf(firstPlacements), advanced_refinements: refinementsFor('first') };
  }
  const { plan, notices } = migrateV1(map);
  const queue = queueFor(current);
  const state = createInitialState(queue);
  const floors: Record<FloorId, FloorIntent> = { ground: plan.floors.ground, first: plan.floors.first || emptyFloor() };
  const phase = st.phase === 'review' || st.phase === 'placement' ? st.phase : 'foundation';
  const index = phase === 'foundation' ? 0 : Math.max(0, Math.min(Number(st.currentIndex) || 0, queue.length));
  const use = queue[index]?.roomId;
  return {
    fromV1: true, newer: false, notices, legacySource: raw,
    state: {
      ...state, phase, currentFloor: current, foundationStep: Number(st.foundationStep) || 0,
      foundation: { ...state.foundation, ...f }, floors, legacy: plan.legacy,
      numFloors: st.numFloors || 'Single Floor', currentIndex: index,
      activeRoomId: use ? roomsOfUse(floors[current], use)[0]?.id || null : null,
    },
  };
}

export function parseDraft(raw: string | null, queueFor: QueueFor): ParsedDraft | null {
  if (!raw) return null;
  let value: any;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const version = Number(value.version);
  if (version > DRAFT_VERSION) {
    // A newer build's draft: shown read-only, never overwritten (§4.8).
    try { return { state: fromV2(value as DraftV2, queueFor), notices: [], fromV1: false, newer: true }; } catch { return null; }
  }
  if (version === DRAFT_VERSION) {
    if (!value.ui || !value.ui.foundation) return null;
    return { state: fromV2(value as DraftV2, queueFor), notices: [], fromV1: false, newer: false };
  }
  try { return fromV1(value, queueFor); } catch { return null; }
}

/** How much work a draft holds: rooms first, then a finished foundation. */
export function draftScore(parsed: ParsedDraft | null): number {
  if (!parsed) return -1;
  const s = parsed.state;
  const rooms = s.floors.ground.rooms.length + s.floors.first.rooms.length;
  return rooms * 100 + (s.phase !== 'foundation' ? 2 : 0) + (s.foundation.facing || s.foundation.plotWidth ? 1 : 0);
}

export function bestDraft(raws: Array<string | null>, queueFor: QueueFor): { raw: string; parsed: ParsedDraft } | null {
  let best: { raw: string; parsed: ParsedDraft } | null = null;
  for (const raw of raws) {
    const parsed = parseDraft(raw, queueFor);
    if (parsed && (!best || draftScore(parsed) > draftScore(best.parsed))) best = { raw: raw!, parsed };
  }
  return best;
}

/** The backend copy: the plan, and for undivided plans the v1 map legacy readers expect (§4.8). */
export function backendCopy(state: CompassStateV2): { compass_plan: CompassPlanV2 | null; compass_map: Record<string, unknown> } {
  let plan: CompassPlanV2 | null = null;
  try { plan = normalisePlan(planFromState(state)); } catch { plan = null; }
  if (!plan) return { compass_plan: null, compass_map: {} };
  let map: Record<string, unknown>;
  try { map = deriveV1(plan); } catch { map = {}; }
  if ((map as any).requires_v2) {
    map = { requires_v2: true, plot: { width_ft: plan.plot.widthIn / 12, depth_ft: plan.plot.depthIn / 12, facing: plan.plot.facing,
      type: plan.plot.plotType, num_floors: plan.storeys === 2 ? 'Multi-Floor' : 'Single Floor', gate_position: plan.plot.gate } };
  }
  return { compass_plan: plan, compass_map: map };
}

export { nextUnplaced };
