/**
 * Saving and restoring the Compass map (docs/compass-refine/IMPLEMENTATION_PLAN.md §4.8).
 *
 * Version 3 drafts live under new keys, so a rollback build still finds its version 1/2 drafts untouched.
 * A version 1 draft is migrated once, on load, by the same rules as the floor-plan service
 * (compassPlan.migrateV1): each room becomes one room per connected part, vertical 50 % splits become
 * divided cells, and anything else is kept read-only in `legacy`. Nothing is deleted. A draft newer than
 * this build is opened read-only and never overwritten.
 */
import type { CompassPlanV2, FloorId, FloorIntent } from '../types/compassPlan';
import type { RoomComponent } from '../types/compass';
import { deriveV1, migrateV1, normalisePlan } from './compassPlan';
import { CompassStateV2, Foundation, createInitialState, emptyFloor, nextUnplaced, planFromState, roomsOfUse } from './compassReducer';

export const DRAFT_VERSION = 3;
export const DRAFT_KEYS = { session: 'gazeconnect_compass_progress_v3', primary: 'compass_persistent_backup_v3', last: 'compass_last_session_backup_v3' };
export const V2_KEYS = { session: 'gazeconnect_compass_progress_v2', primary: 'compass_persistent_backup_v2', last: 'compass_last_session_backup_v2' };
export const V2_MIGRATED_KEY = 'gazeconnect_compass_v2_started';
export const V1_KEYS = { session: 'gazeconnect_compass_progress_v1', primary: 'compass_persistent_backup', last: 'compass_last_session_backup' };
/** Set once a version 3 draft exists: older drafts are never migrated again, including after Restart. */
export const MIGRATED_KEY = 'gazeconnect_compass_v3_started';

export interface DraftV2 {
  version: 2 | 3;
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

function protectedDraft(value: any, queueFor: QueueFor): ParsedDraft {
  const state = createInitialState(queueFor('ground'));
  state.foundation = { ...state.foundation, ...value?.ui?.foundation };
  return { state, notices: ['The saved map could not be validated. Its original data is kept; this view is read-only.'], fromV1: false, newer: true };
}

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
    ...(f?.splitDirections ? { splitDirections: { ...f.splitDirections } } : {}),
    rooms: Array.isArray(f?.rooms) ? f.rooms.map((r: any) => ({ id: r.id, use: r.use, regions: [...(r.regions || [])] })) : [],
  });
  return { ground: floor(value?.ground), first: floor(value?.first) };
}

/** Rebuilds a state from a version 2 draft; the floors are validated through the plan schema. */
function fromV2(draft: DraftV2, queueFor: QueueFor): CompassStateV2 {
  const ui = draft.ui;
  const floors = hydrateFloors(draft.plan?.floors ?? draft.floors);
  // Never turn an unreadable map into an editable empty draft: its original must survive.
  try {
    normalisePlan({ schema: 'gazeconnect.compass-plan', version: draft.plan?.version ?? (Object.values(floors).some(f => Object.keys(f.splitDirections || {}).length) ? 3 : 2),
      plot: { widthIn: 480, depthIn: 720, facing: 'South', gate: 'Center', plotType: 'Middle Plot' },
      storeys: 2, floors, choices: draft.choices || {} });
  } catch { throw new Error('The saved map could not be validated. Its original data is kept.'); }
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
    try { return { state: fromV2(value as DraftV2, queueFor), notices: [], fromV1: false, newer: true }; } catch { return protectedDraft(value, queueFor); }
  }
  if (version === DRAFT_VERSION || version === 2) {
    if (!value.ui || !value.ui.foundation) return null;
    try { return { state: fromV2(value as DraftV2, queueFor), notices: [], fromV1: false, newer: false }; }
    catch { return protectedDraft(value, queueFor); }
  }
  try { return fromV1(value, queueFor); } catch { return null; }
}

/** Reopen the canonical backend copy when no local draft is present. */
export function draftFromPlan(value: unknown, queueFor: QueueFor): ParsedDraft {
  const plan = normalisePlan(value);
  const queue = queueFor('ground');
  const state = createInitialState(queue);
  const numFloors = plan.storeys === 2 ? 'Multi-Floor' : 'Single Floor';
  return { fromV1: false, newer: false, notices: [], state: {
    ...state, phase: 'placement', foundationStep: 7, numFloors, choices: plan.choices, legacy: plan.legacy,
    foundation: { ...state.foundation, facing: plan.plot.facing, plotWidth: plan.plot.widthIn / 12,
      plotDepth: plan.plot.depthIn / 12, plotType: plan.plot.plotType, gatePosition: plan.plot.gate, numFloors },
    floors: { ground: plan.floors.ground, first: plan.floors.first || emptyFloor() },
    currentIndex: nextUnplaced(queue, plan.floors.ground),
  } };
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
    if (parsed && (!best || (parsed.newer && !best.parsed.newer)
      || (parsed.newer === best.parsed.newer && draftScore(parsed) > draftScore(best.parsed)))) best = { raw: raw!, parsed };
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
