/**
 * CompassMapScreen — v5 Final Surgical Fix
 * ========================================
 * - Grid: 4x4 Connected Architectural Layout (Zero gaps)
 * - Plot: Flush to Road (No black gap)
 * - Gaze Button: Floating Anchor (Does not shrink grid)
 * - Styling: Professional CAD Blueprints
 */

import React, {
  useReducer, useCallback, useMemo, useEffect, useState, useRef,
} from 'react';
import GazeButton from '../components/core/GazeButton';
import { GazeToggleCardFace } from '../components/core/GazeToggleCardFace';
import '../styles/compass-workspace.css';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { ArchitecturalCell } from '../components/ArchitecturalCell';
import { FloorPlanViewerModal } from '../components/FloorPlanViewerModal';
import { CompassPlanStudio } from '../components/CompassPlanStudio';
import { PlanReviewModal } from '../components/PlanReviewModal';
import {
  compileCompassPayload,
  CompassMapPayload,
  CompassPlanScope,
  generatePlanCandidates,
  PlanCandidate,
} from '../utils/floorplanApi';
import {
  GridCellKey,
  CompassPhase,
  ExpansionDirection,
  CellRect,
  GridCellState,
  RoomComponent,
  PlacementRecord,
  CompassHistoryEntry,
  PendingExpansion,
  FloorType,
  ALL_CELL_KEYS,
  RENDER_ORDER,
  GRID_ROWS,
  GRID_COLS
} from '../types/compass';
import {
  parseCellKey,
  buildCellKey,
  cellToRect,
  cellsToBoundingRect,
  getExpandedCells,
  computeCoveragePercent,
} from '../utils/compassMath';
import { getDirectionLabels } from '../utils/compassDirections';
import { useTheme } from '../contexts/ThemeContext';
import type { AdvancedRefinements } from '../types/advancedMap';
import { screenThemes, typography } from '../utils/design';

// ─── Theme — AAC Compliant: Matte, High-Contrast, No Glass ──

const THEME = {
  ...screenThemes.floorPlan,
  panelBg: screenThemes.floorPlan.panelBg,
  cardBg: screenThemes.floorPlan.cardBg,
  accent: '#2DD4BF',
  text: screenThemes.floorPlan.textMain,
  textSub: screenThemes.floorPlan.textSub,
  textDim: screenThemes.floorPlan.textDim,
  success: screenThemes.floorPlan.success,
  danger: screenThemes.floorPlan.danger,
  info: screenThemes.floorPlan.accentStrong,
  warning: screenThemes.floorPlan.warning,
  road: screenThemes.floorPlan.road,
  cellEmpty: 'rgba(34, 50, 71, 0.92)',
  cellEmptyBorder: 'rgba(42, 61, 82, 0.72)',
  cellEmptyText: screenThemes.floorPlan.textMain,
  cellArmed: 'rgba(33, 50, 42, 0.96)',
  cellArmedBorder: 'rgba(156, 197, 177, 0.72)',
};

const UI_FONT = typography.fontFamily.primary;

const COMPASS_DRAFT_KEY = 'gazeconnect_compass_progress_v1';
const COMPASS_ACCEPTED_PLAN_KEY = 'gazeconnect_compass_accepted_plan_v1';
const COMPASS_PRIMARY_BACKUP_KEY = 'compass_persistent_backup';
const COMPASS_LAST_BACKUP_KEY = 'compass_last_session_backup';
const COMPASS_DRAFT_VERSION = 1;
const COMPASS_UNDO_HISTORY_LIMIT = 120;
const COMPASS_AUTOSAVE_DEBOUNCE_MS = 1200;
const COMPASS_AUTOSAVE_MIN_INTERVAL_MS = 5000;
const COMPASS_SNAPSHOT_MIN_INTERVAL_MS = 30000;

// ─── Room Library — 14 Ground Floor Components ───────────────

interface RoomLibEntry {
  roomLabel: string;
  shortLabel: string;
  color: string;
  expandable: boolean;
  recommendedCells?: number;
  typicalSqft?: string;
}

const ROOM_LIBRARY: Record<string, RoomLibEntry> = {
  // Ground Floor Components
  porch: { roomLabel: 'Outer Lobby / Porch / Open Area', shortLabel: 'Outer Lobby', color: '#81C784', expandable: false, recommendedCells: 1, typicalSqft: '60-100' },
  lawn: { roomLabel: 'Lawn / Garden', shortLabel: 'Lawn', color: '#AED581', expandable: true, recommendedCells: 2, typicalSqft: '100-200' },
  verandah: { roomLabel: 'Verandah', shortLabel: 'Verandah', color: '#4DB6AC', expandable: false, recommendedCells: 1, typicalSqft: '60-100' },
  backyard: { roomLabel: 'Backyard', shortLabel: 'Backyard', color: '#66BB6A', expandable: true, recommendedCells: 2, typicalSqft: '80-150' },
  drawing: { roomLabel: 'Drawing Room', shortLabel: 'Drawing', color: '#7E57C2', expandable: true, recommendedCells: 2, typicalSqft: '120-200' },
  kitchen: { roomLabel: 'Kitchen + Store', shortLabel: 'Kitchen', color: '#FFA726', expandable: true, recommendedCells: 2, typicalSqft: '80-120' },
  living: { roomLabel: 'Living Hall', shortLabel: 'Living', color: '#42A5F5', expandable: true, recommendedCells: 2, typicalSqft: '150-250' },
  masterBed: { roomLabel: 'Master Bedroom', shortLabel: 'M.Bed', color: '#5E35B1', expandable: true, recommendedCells: 2, typicalSqft: '140-220' },
  bedroom: { roomLabel: 'Bedroom', shortLabel: 'Bedroom', color: '#7E57C2', expandable: false, recommendedCells: 1, typicalSqft: '100-160' },
  bathroom: { roomLabel: 'Bathroom', shortLabel: 'Bath', color: '#78909C', expandable: false, recommendedCells: 1, typicalSqft: '30-50' },
  staircase: { roomLabel: 'Living Lobby + Staircase', shortLabel: 'Stairs', color: '#8D6E63', expandable: true, recommendedCells: 2, typicalSqft: '60-100' },
  diningStaircase: { roomLabel: 'Dining Hall + Staircase', shortLabel: 'Dining + Stairs', color: '#A1887F', expandable: true, recommendedCells: 2, typicalSqft: '80-130' },
  dining: { roomLabel: 'Dining Hall', shortLabel: 'Dining', color: '#FFCA28', expandable: false, recommendedCells: 1, typicalSqft: '80-120' },
  commonBath: { roomLabel: 'Common Bathroom', shortLabel: 'C.Bath', color: '#546E7A', expandable: false, recommendedCells: 1, typicalSqft: '30-50' },
  icu: { roomLabel: 'Home ICU + Caretaker Unit', shortLabel: 'ICU', color: '#EF5350', expandable: true, recommendedCells: 2, typicalSqft: '180-250' },
  balcony: { roomLabel: 'Balcony', shortLabel: 'Balcony', color: '#26A69A', expandable: false, recommendedCells: 1, typicalSqft: '40-80' },
  terrace: { roomLabel: 'Terrace', shortLabel: 'Terrace', color: '#009688', expandable: false, recommendedCells: 1, typicalSqft: '60-120' },
  // First floor rooms
  ff_master: { roomLabel: '1F Master Bedroom', shortLabel: '1F Master', color: '#3949AB', expandable: true, recommendedCells: 2, typicalSqft: '150-200' },
  ff_bed2: { roomLabel: '1F Bedroom 2', shortLabel: '1F Bed 2', color: '#5C6BC0', expandable: false, recommendedCells: 1, typicalSqft: '100-140' },
  ff_bed3: { roomLabel: '1F Bedroom 3', shortLabel: '1F Bed 3', color: '#7986CB', expandable: false, recommendedCells: 1, typicalSqft: '100-140' },
  ff_living: { roomLabel: '1F Living / Family', shortLabel: '1F Living', color: '#1E88E5', expandable: true, recommendedCells: 2, typicalSqft: '150-250' },
  ff_bathroom: { roomLabel: '1F Bathroom', shortLabel: '1F Bath', color: '#607D8B', expandable: false, recommendedCells: 1, typicalSqft: '30-50' },
  ff_balcony: { roomLabel: '1F Balcony', shortLabel: '1F Balcony', color: '#26A69A', expandable: false, recommendedCells: 1, typicalSqft: '40-80' },
  ff_terrace: { roomLabel: '1F Open Terrace', shortLabel: '1F Terrace', color: '#66BB6A', expandable: false, recommendedCells: 1, typicalSqft: '60-120' },
  ff_stairLanding: { roomLabel: '1F Stair Landing', shortLabel: '1F Stairs', color: '#8D6E63', expandable: false, recommendedCells: 1, typicalSqft: '40-60' },
};

const GF_IDS = [
  'porch', 'lawn', 'verandah', 'backyard', 'drawing', 'kitchen', 'living',
  'masterBed', 'bedroom',
  'bathroom', 'staircase', 'diningStaircase', 'dining', 'icu', 'balcony', 'terrace',
];
const FF_IDS = [
  'ff_master', 'ff_bed2', 'ff_bed3', 'ff_living', 'ff_bathroom',
  'ff_balcony', 'ff_terrace', 'ff_stairLanding',
];

// ─── Foundation Questions ─────────────────────────────────

const FOUNDATION_QUESTIONS: FoundationQuestion[] = [
  {
    key: 'facing' as const,
    text: 'Which direction does your house face?',
    subtext: 'Sets road direction and compass orientation on the plot.',
    options: ['North', 'East', 'South', 'West'],
    columns: 2 as const,
  },
  {
    key: 'plotWidth' as const,
    text: 'What is your plot width (front side)?',
    subtext: 'Width in feet along the road-facing side.',
    options: ['20 ft', '25 ft', '30 ft', '40 ft', '50 ft', '60 ft'],
    columns: 3 as const,
    parse: (v: string) => parseInt(v, 10),
  },
  {
    key: 'plotDepth' as const,
    text: 'What is your plot depth (side)?',
    subtext: 'Depth in feet from road to back boundary.',
    options: ['30 ft', '40 ft', '50 ft', '60 ft', '80 ft', '100 ft'],
    columns: 3 as const,
    parse: (v: string) => parseInt(v, 10),
  },
  {
    key: 'plotType' as const,
    text: 'What type of plot do you have?',
    subtext: 'Corner plots have two road-facing sides. Independent plots are detached.',
    options: ['Corner Plot', 'Middle Plot', 'Independent'],
    columns: 3 as const,
  },
  {
    key: 'numFloors' as const,
    text: 'How many floors are you planning?',
    subtext: 'Choose single floor or multi-floor mapping.',
    options: ['Single Floor', 'Multi-Floor'],
    columns: 2 as const,
  },
  {
    key: 'numBedrooms' as const,
    text: 'How many bedrooms do you need?',
    subtext: 'Helps optimize room placement and sizing.',
    options: ['1', '2', '3', '4+'],
    columns: 2 as const,
  },
  {
    key: 'gatePosition' as const,
    text: 'Where is the main gate?',
    subtext: 'Position of the entry gate along the road-facing side. Drives the gate diagram on the plot.',
    options: ['Left', 'Center', 'Right'],
    columns: 3 as const,
  },
];

type FoundationKey = 'facing' | 'plotWidth' | 'plotDepth' | 'plotType' | 'numFloors' | 'numBedrooms' | 'gatePosition';

interface FoundationQuestion {
  key: FoundationKey;
  text: string;
  subtext: string;
  options: string[];
  columns: 2 | 3;
  parse?: (v: string) => any;
}

// ─── State Types ──────────────────────────────────────────

interface FloorData {
  placements: PlacementRecord[];
  grid: Record<string, GridCellState>;
  coveragePercent: number;
}

interface CompassState {
  phase: CompassPhase;
  currentFloor: FloorType;
  foundation: {
    facing: string | null;
    plotWidth: number | null;
    plotDepth: number | null;
    plotType: string | null;
    numFloors: string | null;
    numBedrooms: string | null;
    gatePosition: string | null;
  };
  foundationStep: number;
  grid: Record<string, GridCellState>;
  componentQueue: RoomComponent[];
  currentIndex: number;
  placements: PlacementRecord[];
  armed: boolean;
  pendingExpansion: PendingExpansion | null;
  history: CompassHistoryEntry[];
  groundFloorData: FloorData | null;
  firstFloorData: FloorData | null;
  numFloors: string;
}

type CompassFloorRefinements = Record<FloorType, AdvancedRefinements>;
type CompassFloorMetadata = Record<'gnd' | '1f', { advanced_refinements: AdvancedRefinements; cell_layouts?: AdvancedRefinements['cellLayouts'] }>;

export function normalizeCompassRefinements(saved?: Partial<AdvancedRefinements>, layouts?: AdvancedRefinements['cellLayouts']): AdvancedRefinements {
  const result: AdvancedRefinements = {
    version: 2, subCellSplits: [], customEdges: [], voidMarkers: [], cellRotations: [],
    cellExpansions: [], caregiverAnnotations: [], vastuFlags: [], accessibilityMarkers: [], cellLayouts: {},
  };
  if (saved) {
    for (const field of Object.keys(result) as (keyof AdvancedRefinements)[]) {
      if (field !== 'version' && field !== 'cellLayouts' && Array.isArray(saved[field])) (result as any)[field] = saved[field];
    }
  }
  result.cellLayouts = layouts || saved?.cellLayouts || {};
  return result;
}

export function readCompassFloorRefinements(source: any, activeFloor: FloorType = source?.state?.currentFloor || 'ground'): CompassFloorRefinements {
  const metadata = source?.advancedFloorMetadata;
  const legacy = source?.refinements || source?.advanced_refinements;
  const ground = metadata?.gnd || source?.ground_floor;
  const first = metadata?.['1f'] || source?.first_floor;
  return {
    ground: normalizeCompassRefinements(ground?.advanced_refinements || (activeFloor === 'ground' ? legacy : undefined), ground?.cell_layouts),
    first: normalizeCompassRefinements(first?.advanced_refinements || (activeFloor === 'first' ? legacy : undefined), first?.cell_layouts),
  };
}

export function buildCompassFloorMetadata(floors: CompassFloorRefinements): CompassFloorMetadata {
  return {
    gnd: { advanced_refinements: floors.ground, cell_layouts: floors.ground.cellLayouts },
    '1f': { advanced_refinements: floors.first, cell_layouts: floors.first.cellLayouts },
  };
}

export function attachCompassFloorRefinements(payload: any, floors: CompassFloorRefinements, activeFloor: FloorType) {
  const metadata = buildCompassFloorMetadata(floors);
  return {
    ...payload, advanced_refinements: floors[activeFloor], cell_layouts: floors[activeFloor].cellLayouts,
    editor_active_floor: activeFloor === 'first' ? '1f' : 'gnd',
    ...(payload.ground_floor ? { ground_floor: { ...payload.ground_floor, ...metadata.gnd } } : {}),
    ...(payload.first_floor ? { first_floor: { ...payload.first_floor, ...metadata['1f'] } } : {}),
  };
}

interface AcceptedCompassPlan {
  sourceFingerprint: string;
  candidate: PlanCandidate;
  selectedFloor?: 'ground' | 'first';
}

function compassPlanFingerprint(payload: CompassMapPayload, notes: string): string {
  const source = payload as CompassMapPayload & { advanced_refinements?: AdvancedRefinements };
  const floor = (which: 'ground' | 'first') => {
    const data = which === 'ground' ? payload.ground_floor : payload.first_floor;
    return data ? {
      placements: data.placements.map(placement => ({
        id: placement.placementId,
        room: placement.roomId,
        cells: [...placement.cells].sort(),
      })),
      advanced_refinements: data.advanced_refinements,
      cell_layouts: data.cell_layouts,
    } : null;
  };
  return JSON.stringify({
    plot: payload.plot,
    grid_size: payload.grid_size,
    ground: floor('ground'),
    first: floor('first'),
    legacy_refinements: source.advanced_refinements,
    notes,
  });
}

function readAcceptedCompassPlan(): AcceptedCompassPlan | null {
  try {
    const raw = localStorage.getItem(COMPASS_ACCEPTED_PLAN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as AcceptedCompassPlan;
    return value?.sourceFingerprint && value.candidate?.compassData ? value : null;
  } catch {
    return null;
  }
}

interface CompassDraftPayload {
  version: number;
  state: CompassState;
  refinements?: AdvancedRefinements;
  advancedFloorMetadata?: CompassFloorMetadata;
}

type CompassAction =
  | { type: 'HYDRATE_DRAFT'; draft: CompassState }
  | { type: 'SET_FOUNDATION'; key: FoundationKey; value: any }
  | {
    type: 'PREFILL_FOUNDATION';
    foundation: {
      facing: string;
      plotWidth: number;
      plotDepth: number;
      plotType: string;
      numFloors: string;
    };
    numFloors: string;
  }
  | { type: 'FOUNDATION_BACK' }
  | { type: 'COMPLETE_FOUNDATION'; queue: RoomComponent[]; numFloors: string }
  | { type: 'AUTO_FOUNDATION'; foundation: { facing: string; plotWidth: number; plotDepth: number; plotType: string }; queue: RoomComponent[]; numFloors: string }
  | { type: 'SET_QUEUE'; queue: RoomComponent[] }
  | { type: 'ARM_GRID' }
  | { type: 'DISARM_GRID' }
  | { type: 'PLACE_ROOM'; cell: GridCellKey }
  | { type: 'EXPAND_ROOM'; direction: ExpansionDirection | 'none' }
  | { type: 'NEXT_ROOM' }
  | { type: 'SKIP_ROOM' }
  | { type: 'UNDO' }
  | { type: 'RESET'; queue: RoomComponent[] }
  | { type: 'ADD_ROOM'; room: RoomComponent }
  | { type: 'REMOVE_PLACED_ROOM'; placementId: string }
  | { type: 'CONTINUE_PLACING' }
  | { type: 'START_FIRST_FLOOR'; queue: RoomComponent[] }
  | { type: 'SWITCH_FLOOR'; floor: FloorType }
  | { type: 'SET_NUM_FLOORS'; value: 'Single Floor' | 'Multi-Floor' }
  | { type: 'FINISH_NO_FIRST_FLOOR' }
  | { type: 'SELECT_ROOM'; roomIndex: number };

// ─── Helpers ──────────────────────────────────────────────

function makeRoom(id: string): RoomComponent {
  const lib = ROOM_LIBRARY[id];
  if (!lib) throw new Error(`Unknown room: ${id}`);
  return { roomId: id, ...lib };
}

const VALID_ROOM_IDS = new Set<string>([...GF_IDS, ...FF_IDS]);

function normalizeRoomId(roomId: string | null | undefined): string | null {
  if (!roomId) return null;
  if (roomId === 'commonBath') return 'bathroom';
  return roomId;
}

function sanitizeRoomQueue(queue: RoomComponent[]): RoomComponent[] {
  const seen = new Set<string>();
  const ids = queue
    .map((r) => normalizeRoomId(r.roomId))
    .filter((id): id is string => !!id && VALID_ROOM_IDS.has(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  return ids.map(makeRoom);
}

function sanitizePlacements(placements: PlacementRecord[]): PlacementRecord[] {
  return placements.map((p) => {
    const normalizedId = normalizeRoomId(p.roomId) || p.roomId;
    const lib = ROOM_LIBRARY[normalizedId] || ROOM_LIBRARY[p.roomId];
    return {
      ...p,
      roomId: normalizedId,
      roomLabel: lib?.roomLabel || p.roomLabel,
    };
  });
}

function sanitizeGrid(grid: Record<string, GridCellState>): Record<string, GridCellState> {
  const next: Record<string, GridCellState> = {};
  for (const [key, cell] of Object.entries(grid)) {
    next[key] = {
      ...cell,
      roomId: normalizeRoomId(cell.roomId),
    };
  }
  return next;
}

function generateGFQueue(): RoomComponent[] {
  return GF_IDS.map(makeRoom);
}

function generateFFQueue(): RoomComponent[] {
  return FF_IDS.map(makeRoom);
}

function createEmptyGrid(): Record<string, GridCellState> {
  const grid: Record<string, GridCellState> = {};
  for (const key of ALL_CELL_KEYS) {
    grid[key] = { roomId: null, anchorPlacementId: null, isExpandedChild: false };
  }
  return grid;
}

function getOccupiedSet(grid: Record<string, GridCellState>): Set<string> {
  return new Set(Object.entries(grid).filter(([_, cell]) => cell.roomId !== null).map(([k]) => k));
}

function saveSnapshot(state: CompassState): CompassHistoryEntry {
  return JSON.parse(JSON.stringify({
    grid: state.grid, placements: state.placements,
    currentIndex: state.currentIndex, phase: state.phase,
    pendingExpansion: state.pendingExpansion,
  }));
}

function appendHistory(
  history: CompassHistoryEntry[],
  snapshot: CompassHistoryEntry,
): CompassHistoryEntry[] {
  if (history.length >= COMPASS_UNDO_HISTORY_LIMIT) {
    return [...history.slice(-(COMPASS_UNDO_HISTORY_LIMIT - 1)), snapshot];
  }
  return [...history, snapshot];
}

function createInitialState(queue: RoomComponent[]): CompassState {
  return {
    phase: 'foundation', currentFloor: 'ground',
    foundation: { facing: null, plotWidth: null, plotDepth: null, plotType: null, numFloors: null, numBedrooms: null, gatePosition: null },
    foundationStep: 0,
    grid: createEmptyGrid(), componentQueue: queue, currentIndex: 0,
    placements: [], armed: false, pendingExpansion: null, history: [],
    groundFloorData: null, firstFloorData: null, numFloors: 'Single Floor',
  };
}

function clampRoomIndex(index: number, queueLength: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(index, queueLength));
}

function sanitizeDraftState(draft: CompassState): CompassState {
  const fallbackQueue = draft.currentFloor === 'first' ? generateFFQueue() : generateGFQueue();
  const cleanedQueue = Array.isArray(draft.componentQueue) ? sanitizeRoomQueue(draft.componentQueue) : fallbackQueue;
  const queue = cleanedQueue.length > 0 ? cleanedQueue : fallbackQueue;
  const queueLength = queue.length;
  return {
    ...draft,
    phase: draft.phase || 'foundation',
    currentFloor: draft.currentFloor || 'ground',
    grid: sanitizeGrid(draft.grid),
    placements: Array.isArray(draft.placements) ? sanitizePlacements(draft.placements) : [],
    componentQueue: queue,
    currentIndex: clampRoomIndex(draft.currentIndex ?? 0, queueLength),
    armed: false,
    pendingExpansion: null,
    history: Array.isArray(draft.history) ? draft.history : [],
  };
}

function parseCompassDraft(rawDraft: string): { state: CompassState, refinements?: AdvancedRefinements, advancedFloorMetadata?: CompassFloorMetadata } | null {
  try {
    const parsed = JSON.parse(rawDraft) as CompassDraftPayload | CompassState;
    const draftState = (parsed as CompassDraftPayload).state
      ? (parsed as CompassDraftPayload).state
      : (parsed as CompassState);

    if (!draftState || typeof draftState !== 'object') return null;
    if (!draftState.foundation || !draftState.grid || !Array.isArray(draftState.componentQueue)) {
      return null;
    }
    return {
      state: sanitizeDraftState(draftState),
      refinements: (parsed as CompassDraftPayload).refinements,
      advancedFloorMetadata: (parsed as CompassDraftPayload).advancedFloorMetadata,
    };
  } catch {
    return null;
  }
}

function getDraftRestoreScore(parsed: { state: CompassState, refinements?: AdvancedRefinements } | null): number {
  if (!parsed?.state) return -1;
  const placements = Array.isArray(parsed.state.placements) ? parsed.state.placements.length : 0;
  const hasFoundation = !!parsed.state.foundation?.facing
    || !!parsed.state.foundation?.plotWidth
    || !!parsed.state.foundation?.plotDepth;
  const phaseBonus = parsed.state.phase && parsed.state.phase !== 'foundation' ? 2 : 0;
  return placements * 100 + phaseBonus + (hasFoundation ? 1 : 0);
}

function pickBestDraftRaw(candidates: Array<string | null>): string | null {
  let bestRaw: string | null = null;
  let bestScore = -1;
  for (const raw of candidates) {
    if (!raw) continue;
    const score = getDraftRestoreScore(parseCompassDraft(raw));
    if (score > bestScore) {
      bestScore = score;
      bestRaw = raw;
    }
  }
  return bestRaw;
}

// ─── Reducer ──────────────────────────────────────────────

function compassReducer(state: CompassState, action: CompassAction): CompassState {
  switch (action.type) {
    case 'HYDRATE_DRAFT':
      return sanitizeDraftState(action.draft);

    case 'SET_FOUNDATION':
      return {
        ...state,
        foundation: { ...state.foundation, [action.key]: action.value },
        foundationStep: Math.min(state.foundationStep + 1, FOUNDATION_QUESTIONS.length),
      };

    case 'PREFILL_FOUNDATION':
      return {
        ...state,
        phase: 'foundation',
        foundationStep: 0,
        foundation: {
          ...state.foundation,
          ...action.foundation,
        },
        numFloors: action.numFloors,
        armed: false,
        pendingExpansion: null,
      };

    case 'FOUNDATION_BACK':
      if (state.foundationStep <= 0) return state;
      return { ...state, foundationStep: state.foundationStep - 1 };

    case 'COMPLETE_FOUNDATION':
      return { ...state, phase: 'placement', componentQueue: action.queue, currentIndex: 0, armed: false, numFloors: action.numFloors };

    case 'AUTO_FOUNDATION':
      return {
        ...state, phase: 'placement', foundation: { ...state.foundation, ...action.foundation },
        foundationStep: FOUNDATION_QUESTIONS.length,
        componentQueue: action.queue, currentIndex: 0, armed: false,
        numFloors: action.numFloors,
      };

    case 'SET_QUEUE':
      if (state.phase !== 'foundation') return state;
      return { ...state, componentQueue: action.queue };

    case 'ARM_GRID':
      if (state.phase !== 'placement' || state.pendingExpansion) return state;
      if (state.currentIndex >= state.componentQueue.length) return state;
      return { ...state, armed: true };

    case 'DISARM_GRID':
      return { ...state, armed: false };

    case 'PLACE_ROOM': {
      if (!state.armed || state.pendingExpansion || state.phase !== 'placement') return state;
      if (state.currentIndex >= state.componentQueue.length) return state;
      const room = state.componentQueue[state.currentIndex];
      const cellState = state.grid[action.cell];
      const isCurrentRoomCell = cellState?.roomId === room.roomId;

      // Allow overwriting if confirmed (UI handles confirmation)
      // If occupied by another room, we must remove this cell from that room's placement
      let finalPlacements = state.placements;
      if (cellState?.roomId && !isCurrentRoomCell) {
        const victimRoomId = cellState.roomId;
        finalPlacements = finalPlacements.map(p => {
          if (p.roomId === victimRoomId) {
            // Remove the stolen cell
            const newCells = p.occupiedCells.filter((c: GridCellKey) => c !== action.cell);
            return { ...p, occupiedCells: newCells };
          }
          return p;
        }).filter(p => p.occupiedCells.length > 0); // Remove placement if no cells left
      }

      const existingPlacement = finalPlacements.find((p) => p.roomId === room.roomId) || null;
      const placementId = existingPlacement?.placementId || `p_${Date.now()}_${room.roomId}`;
      const history = appendHistory(state.history, saveSnapshot(state));
      const newGrid = { ...state.grid };

      let occupiedCells: GridCellKey[] = [];
      if (isCurrentRoomCell) {
        newGrid[action.cell] = { roomId: null, anchorPlacementId: null, isExpandedChild: false };
        occupiedCells = (existingPlacement?.occupiedCells || []).filter((c: GridCellKey) => c !== action.cell);
      } else {
        newGrid[action.cell] = { roomId: room.roomId, anchorPlacementId: placementId, isExpandedChild: false };
        occupiedCells = Array.from(new Set([...(existingPlacement?.occupiedCells || []), action.cell])) as GridCellKey[];
      }

      const nextPlacements = finalPlacements.filter((p) => p.roomId !== room.roomId);
      if (occupiedCells.length === 0) {
        return {
          ...state,
          grid: newGrid,
          placements: nextPlacements,
          armed: true,
          pendingExpansion: null,
          history,
        };
      }

      // Recalculate geometry for the current room
      const pw = state.foundation.plotWidth || 40;
      const pd = state.foundation.plotDepth || 60;
      const coords = cellsToBoundingRect(occupiedCells, pw, pd);
      const cellRects: Record<string, CellRect> = {};
      for (const cell of occupiedCells) cellRects[cell] = cellToRect(cell, pw, pd);
      const anchorCell = occupiedCells[0];
      const placement: PlacementRecord = {
        placementId,
        roomId: room.roomId,
        roomLabel: room.roomLabel,
        anchorCell,
        occupiedCells,
        coords,
        cellRects,
      };

      // Also need to update geometry for the victim room if it was modified?
      // Yes, if victim room lost a cell, its coords/rects might need update.
      // Ideally we re-calculate all placements, but for now let's rely on the fact that
      // we only touched the victim's occupiedCells list. 
      // If we want to be correct, we should map over nextPlacements and update if modified.
      // But `nextPlacements` contains the victim room (modified).
      const updatedNextPlacements = nextPlacements.map(p => {
        if (cellState?.roomId && p.roomId === cellState.roomId) {
          // Re-calc geometry for victim
          const vCoords = cellsToBoundingRect(p.occupiedCells, pw, pd);
          const vCellRects: Record<string, CellRect> = {};
          for (const c of p.occupiedCells) vCellRects[c] = cellToRect(c, pw, pd);
          // Verify anchor cell is still valid?
          let vAnchor = p.anchorCell;
          if (!p.occupiedCells.includes(vAnchor)) vAnchor = p.occupiedCells[0];

          return { ...p, coords: vCoords, cellRects: vCellRects, anchorCell: vAnchor };
        }
        return p;
      });

      return {
        ...state,
        grid: newGrid,
        placements: [...updatedNextPlacements, placement],
        armed: true,
        pendingExpansion: null,
        history,
      };
    }

    case 'EXPAND_ROOM': {
      if (!state.pendingExpansion) return state;
      const { anchorCell, room } = state.pendingExpansion;
      const placementId = state.grid[anchorCell]?.anchorPlacementId;
      if (!placementId) return state;
      const pw = state.foundation.plotWidth || 40;
      const pd = state.foundation.plotDepth || 60;
      const occupiedCells = action.direction === 'none' ? [anchorCell] : getExpandedCells(anchorCell, action.direction);
      const newGrid = { ...state.grid };
      for (const cell of occupiedCells) {
        if (cell === anchorCell) continue;
        newGrid[cell] = { roomId: room.roomId, anchorPlacementId: placementId, isExpandedChild: true };
      }
      const coords = cellsToBoundingRect(occupiedCells, pw, pd);
      const cellRects: Record<string, CellRect> = {};
      for (const cell of occupiedCells) cellRects[cell] = cellToRect(cell, pw, pd);
      const placement: PlacementRecord = { placementId, roomId: room.roomId, roomLabel: room.roomLabel, anchorCell, occupiedCells, coords, cellRects };
      const nextIdx = state.currentIndex + 1;
      return { ...state, grid: newGrid, placements: [...state.placements, placement], currentIndex: nextIdx, pendingExpansion: null, armed: nextIdx < state.componentQueue.length, phase: nextIdx >= state.componentQueue.length ? 'review' : 'placement' };
    }

    case 'NEXT_ROOM': {
      if (state.phase !== 'placement') return state;
      if (!state.armed) return state;
      const currentRoom = state.componentQueue[state.currentIndex];
      if (!currentRoom) return state;
      const nextIdx = state.currentIndex + 1;
      return {
        ...state,
        currentIndex: nextIdx,
        armed: false,
        pendingExpansion: null,
        phase: nextIdx >= state.componentQueue.length ? 'review' : 'placement',
      };
    }

    case 'SKIP_ROOM': {
      const nextIdx = state.currentIndex + 1;
      return { ...state, currentIndex: nextIdx, armed: false, pendingExpansion: null, phase: nextIdx >= state.componentQueue.length ? 'review' : 'placement' };
    }

    case 'UNDO':
      if (state.phase === 'placement' && !state.armed) return state;
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      return { ...state, grid: prev.grid, placements: prev.placements, currentIndex: prev.currentIndex, phase: prev.phase, pendingExpansion: prev.pendingExpansion, armed: false, history: state.history.slice(0, -1) };

    case 'RESET':
      return createInitialState(action.queue);

    case 'ADD_ROOM':
      return { ...state, componentQueue: [...state.componentQueue, action.room], phase: 'placement' };

    case 'REMOVE_PLACED_ROOM': {
      const target = state.placements.find((p) => p.placementId === action.placementId);
      if (!target) return state;
      const history = appendHistory(state.history, saveSnapshot(state));
      const newGrid = { ...state.grid };
      for (const cell of target.occupiedCells) newGrid[cell] = { roomId: null, anchorPlacementId: null, isExpandedChild: false };
      const targetIdx = state.componentQueue.findIndex((r) => r.roomId === target.roomId);
      return {
        ...state,
        grid: newGrid,
        placements: state.placements.filter((p) => p.placementId !== action.placementId),
        currentIndex: targetIdx >= 0 ? targetIdx : state.currentIndex,
        phase: 'placement',
        armed: false,
        pendingExpansion: null,
        history,
      };
    }

    case 'CONTINUE_PLACING':
      return { ...state, phase: 'placement', armed: false, pendingExpansion: null };

    case 'START_FIRST_FLOOR': {
      const occCount = new Set(Object.entries(state.grid).filter(([_, c]) => c.roomId).map(([k]) => k)).size;
      const gfData: FloorData = { placements: state.placements, grid: state.grid, coveragePercent: computeCoveragePercent(occCount) };
      return {
        ...state, phase: 'placement', currentFloor: 'first',
        groundFloorData: gfData, grid: createEmptyGrid(),
        componentQueue: action.queue, currentIndex: 0,
        placements: [], armed: false, pendingExpansion: null, history: [],
      };
    }

    case 'FINISH_NO_FIRST_FLOOR':
      return state;

    case 'SWITCH_FLOOR': {
      if (action.floor === state.currentFloor) return state;
      const swOcc = getOccupiedSet(state.grid).size;
      const swSnap: FloorData = { placements: state.placements, grid: state.grid, coveragePercent: computeCoveragePercent(swOcc) };
      if (action.floor === 'first') {
        const ff = state.firstFloorData;
        const ffQueue = generateFFQueue();
        const ffPlacements = ff ? ff.placements : [];
        const ffIdx = ff ? getNextRoomIndex(ffQueue, ffPlacements) : 0;
        return {
          ...state, currentFloor: 'first', groundFloorData: swSnap, firstFloorData: null,
          grid: ff ? ff.grid : createEmptyGrid(), placements: ffPlacements,
          componentQueue: ffQueue, currentIndex: ffIdx,
          phase: ffIdx >= ffQueue.length ? 'review' : 'placement',
          armed: false, pendingExpansion: null, history: [],
        };
      } else {
        const gf = state.groundFloorData;
        if (!gf) return state;
        const gfQueue = generateGFQueue();
        const gfIdx = getNextRoomIndex(gfQueue, gf.placements);
        return {
          ...state, currentFloor: 'ground', firstFloorData: swSnap, groundFloorData: null,
          grid: gf.grid, placements: gf.placements,
          componentQueue: gfQueue, currentIndex: gfIdx,
          phase: gfIdx >= gfQueue.length ? 'review' : 'placement',
          armed: false, pendingExpansion: null, history: [],
        };
      }
    }

    case 'SET_NUM_FLOORS':
      return { ...state, numFloors: action.value };

    case 'SELECT_ROOM':
      if (action.roomIndex < 0 || action.roomIndex >= state.componentQueue.length) return state;
      return { ...state, currentIndex: action.roomIndex, phase: 'placement', armed: false, pendingExpansion: null };

    default:
      return state;
  }
}

// ─── Compass Rose ─────────────────────────────────────────

const CompassRose: React.FC<{ facing: string; bg?: string; border?: string; textColor?: string; northColor?: string; size?: number }> = ({ facing, bg, border, textColor, northColor, size = 72 }) => {
  // facing = the direction the road faces (the bottom edge of screen).
  // Convention (see compassDirections.ts): viewer stands on the road looking at the plot.
  //   East-facing road  → viewer faces West → viewer's right = North → N is at SCREEN RIGHT  (rot 90)
  //   South-facing road → viewer faces North → N is at SCREEN TOP                              (rot 0)
  //   West-facing road  → viewer faces East → viewer's right = South → N is at SCREEN LEFT     (rot 270)
  //   North-facing road → viewer faces South → N is at SCREEN BOTTOM                           (rot 180)
  const facingToNorthRot: Record<string, number> = { South: 0, East: 90, North: 180, West: 270 };
  const rot = facingToNorthRot[facing] ?? 0;
  const ring = border || THEME.border;
  const ink = textColor || THEME.textSub;
  const north = northColor || '#8C3F3F';
  return (
    <div style={{
      position: 'absolute', top: '12px', right: '12px', zIndex: 4,
      width: size, height: size, borderRadius: '50%',
      background: bg || THEME.panelBg,
      border: `1.5px solid ${ring}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.30)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', userSelect: 'none',
    }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        transform: `rotate(${rot}deg)`,
        transition: 'transform 280ms ease',
      }}>
        {/* tick marks at cardinal positions */}
        {[0, 90, 180, 270].map((deg) => (
          <div key={deg} style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 1, height: size * 0.46,
            background: ring,
            transformOrigin: 'top center',
            transform: `translate(-50%, 0) rotate(${deg}deg) translateY(${size * 0.04}px)`,
            opacity: 0.42,
          }} />
        ))}
        {/* North arrow — slim triangle */}
        <svg
          width={size * 0.30}
          height={size * 0.42}
          viewBox="0 0 24 34"
          style={{
            position: 'absolute',
            top: size * 0.12, left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <polygon points="12,2 22,32 12,24 2,32" fill={north} stroke={north} strokeWidth="0.6" strokeLinejoin="round" />
        </svg>
        {/* Cardinal letters */}
        <div style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          fontSize: Math.round(size * 0.16), fontWeight: 900, color: north, letterSpacing: '0.5px', lineHeight: 1,
        }}>N</div>
        <div style={{
          position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
          fontSize: Math.round(size * 0.13), fontWeight: 700, color: ink, opacity: 0.62, lineHeight: 1,
        }}>S</div>
        <div style={{
          position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)',
          fontSize: Math.round(size * 0.13), fontWeight: 700, color: ink, opacity: 0.62, lineHeight: 1,
        }}>W</div>
        <div style={{
          position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
          fontSize: Math.round(size * 0.13), fontWeight: 700, color: ink, opacity: 0.62, lineHeight: 1,
        }}>E</div>
      </div>
    </div>
  );
};

// Scale indicator — sits at canvas bottom-left, architectural drawing convention.
// Shows a labeled ruler representing one cell (typically 10ft).
const ScaleBar: React.FC<{ feet: number; bg?: string; ink?: string; muted?: string }> = ({ feet, bg, ink, muted }) => {
  const inkColor = ink || THEME.textSub;
  const mutedColor = muted || THEME.textDim;
  return (
    <div style={{
      position: 'absolute', left: '12px', bottom: '12px', zIndex: 4,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
      background: bg || 'transparent',
      padding: bg ? '6px 10px' : 0,
      borderRadius: bg ? 6 : 0,
      pointerEvents: 'none', userSelect: 'none',
    }}>
      {/* Horizontal scale: two segments alternating filled/empty like a real scale bar */}
      <div style={{ display: 'flex', alignItems: 'center', height: 10 }}>
        <div style={{ width: 1, height: 10, background: inkColor }} />
        <div style={{ width: 28, height: 6, background: inkColor }} />
        <div style={{ width: 1, height: 10, background: inkColor }} />
        <div style={{ width: 28, height: 6, border: `1px solid ${inkColor}`, borderLeft: 'none' }} />
        <div style={{ width: 1, height: 10, background: inkColor }} />
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
        color: mutedColor, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {`0   ${feet}   ${feet * 2} ft`}
      </div>
    </div>
  );
};

// ─── Props ────────────────────────────────────────────────

interface CompassMapScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

// ─── Main Component ───────────────────────────────────────

function CompassMapScreen({ onNavigate, onSpeak, isDarkMode = true }: CompassMapScreenProps) {
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze, enableGaze } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const ws = useWS();

  // ── Theme-aware tokens (drafting paper / workshop dusk) ──
  const T_pageBg = 'var(--ui-page)';
  const T_panelBg = 'var(--ui-panel)';
  const T_cardBg = 'var(--ui-surface)';
  const T_panelBorder = 'var(--ui-border)';
  const T_panelBorderSoft = 'var(--ui-border)';
  const T_textMain = 'var(--ui-ink)';
  const T_textSub = 'var(--ui-muted)';
  const T_textDim = 'var(--ui-muted)';
  const T_textInverse = isLight ? '#FBE9DE' : isWarm ? '#FBF5E5' : isMix ? '#FFFCF1' : '#FFFFFF';
  // Action accent colors
  const T_accent = 'var(--ui-accent-ink)';
  const T_accentSubtle = 'var(--ui-selected)';
  const T_success = isLight ? '#3D7853' : isWarm ? '#5F7C58' : isMix ? '#5A7548' : THEME.success;
  const T_danger = isLight ? '#8A3B38' : isWarm ? '#7A312E' : isMix ? '#9C5A53' : THEME.danger;
  const T_info = 'var(--ui-accent-ink)';
  // Generate plan
  const T_generatePlanBg = 'var(--ui-selected)';
  const T_generatePlanBorder = 'var(--ui-accent-ink)';
  const T_generatePlanText = 'var(--ui-accent-ink)';
  // Hide/show nav (currently solid black/dark) — adapt to theme
  const T_navBtnBg = 'var(--ui-surface)';
  const T_navBtnBorder = 'var(--ui-border)';
  const T_overlayDim = isLight ? 'rgba(74, 58, 42, 0.55)' : isMix ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.84)';
  const T_overlayDeep = isLight ? 'rgba(74, 58, 42, 0.62)' : isMix ? 'rgba(0,0,0,0.86)' : 'rgba(0,0,0,0.92)';

  const initialQueue = useMemo(() => generateGFQueue(), []);
  const [state, dispatch] = useReducer(compassReducer, initialQueue, createInitialState);

  const [hoveredCell, setHoveredCell] = useState<GridCellKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuConfirmRemove, setMenuConfirmRemove] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);
  const [expansionReady, setExpansionReady] = useState(false);
  const [surveyLoading, setSurveyLoading] = useState(true);
  // v5: Removed dwellingCell/dwellProgress state — they powered a redundant
  // per-cell progress bar that has been removed in favour of GazeButton's
  // built-in DwellProgressRing/Shrink. Keeping the state would leak memory
  // and add no-op renders.
  const [studioScope, setStudioScope] = useState<CompassPlanScope>('ground');
  const [showCompassStudio, setShowCompassStudio] = useState(false);
  const [showFloorPlanViewer, setShowFloorPlanViewer] = useState(false);
  const [viewerInitialFloor, setViewerInitialFloor] = useState<'ground' | 'first'>('ground');
  const [compiledPayload, setCompiledPayload] = useState<CompassMapPayload | null>(null);
  const [showPlanReview, setShowPlanReview] = useState(false);
  const [planReviewSource, setPlanReviewSource] = useState<CompassMapPayload | null>(null);
  const [planCandidates, setPlanCandidates] = useState<PlanCandidate[]>([]);
  const [planReviewWarnings, setPlanReviewWarnings] = useState<string[]>([]);
  const [planReviewLoading, setPlanReviewLoading] = useState(false);
  const [planReviewError, setPlanReviewError] = useState<string | null>(null);
  const [planReviewErrorDetails, setPlanReviewErrorDetails] = useState<string[]>([]);
  const [planReviewErrorCode, setPlanReviewErrorCode] = useState<string | null>(null);
  const [acceptedCompassPlan, setAcceptedCompassPlan] = useState<AcceptedCompassPlan | null>(readAcceptedCompassPlan);
  const planReviewRequestId = useRef(0);
  const [foundationReady, setFoundationReady] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const [menuPage, setMenuPage] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState<{ cell: GridCellKey, oldRoomId: string, newRoomId: string } | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  // Compass map opens with the global NavBar hidden by default — the canvas is
  // the workspace; users press SHOW NAV when they need to navigate elsewhere.
  const [navHidden, setNavHidden] = useState(true);

  // Compass Map is a direct-work screen: open with gaze ready and nav hidden
  // so room placement can begin without a manual gaze-toggle round trip.
  useEffect(() => {
    setNavHidden(true);
    enableGaze();
  }, [enableGaze]);

  // Track Focus Lock state from Electron
  const [isFocusLocked, setIsFocusLocked] = useState(false);

  // Sync app context to Electron for dynamic right-click menus
  useEffect(() => {
    if ((window as any).electronAPI?.updateAppContext) {
      (window as any).electronAPI.updateAppContext({ screen: 'floor-plan', isNavHidden: navHidden });
    }
  }, [navHidden]);

  // Listen for Lock Mode toggles
  useEffect(() => {
    if (!(window as any).electronAPI) return;
    const handleLockToggle = (locked: boolean) => {
      setIsFocusLocked(locked);
    };
    (window as any).electronAPI.on('ui-lock-toggled', handleLockToggle);
    return () => {
      (window as any).electronAPI.off('ui-lock-toggled', handleLockToggle);
    };
  }, []);

  // Auto-hide global nav when the phase advances to placement/review — gives
  // the canvas the full workspace immediately after the foundation survey.
  // If the user revealed the nav during the survey, it should fold back away
  // automatically as the actual mapping work starts.
  const lastAutoHidePhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if ((state.phase === 'placement' || state.phase === 'review') && lastAutoHidePhaseRef.current !== state.phase) {
      lastAutoHidePhaseRef.current = state.phase;
      setNavHidden(true);
    }
    if (state.phase === 'foundation') {
      lastAutoHidePhaseRef.current = null;
    }
  }, [state.phase]);

  const [roomToast, setRoomToast] = useState<{ name: string; color: string; index: number; total: number } | null>(null);
  const roomToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read-only compatibility for plans saved before the Refine Map editor was retired.
  const [floorRefinements, setFloorRefinements] = useState<CompassFloorRefinements>(() => readCompassFloorRefinements(null));
  const refinements = floorRefinements[state.currentFloor];
  const refinementsHydratedRef = useRef(false);
  // A dialog owns gaze input while open.
  const isConfirmationOpen = !!confirmReplace || !!confirmGenerate || showRestoreConfirm || showRestartConfirm || showPlanReview || showCompassStudio || showFloorPlanViewer;

  const surveyProcessed = useRef(false);
  const prevPhaseRef = useRef<CompassPhase>(state.phase);
  // v5: Removed dwellAnimRef/dwellStartRef — they backed the per-cell rAF
  // loop driving the now-deleted bottom progress bar.
  const saveSurveyRef = useRef(ws.saveSurvey);
  const snapshotSurveyRef = useRef(ws.snapshotSurvey);
  const surveyDataRef = useRef(ws.surveyData);
  const lastAutosaveAtRef = useRef(0);
  const lastSnapshotAtRef = useRef(0);
  const lastAutosaveFingerprintRef = useRef('');

  useEffect(() => {
    saveSurveyRef.current = ws.saveSurvey;
    snapshotSurveyRef.current = ws.snapshotSurvey;
    surveyDataRef.current = ws.surveyData;
  }, [ws.saveSurvey, ws.snapshotSurvey, ws.surveyData]);

  // ── Computed ────────────────────────────────────────────
  const currentRoom = state.phase === 'placement' && state.currentIndex < state.componentQueue.length
    ? state.componentQueue[state.currentIndex] : null;
  const currentPlacement = useMemo(
    () => (currentRoom ? state.placements.find((p) => p.roomId === currentRoom.roomId) || null : null),
    [state.placements, currentRoom],
  );
  const occupiedCount = useMemo(() => getOccupiedSet(state.grid).size, [state.grid]);
  const coveragePercent = computeCoveragePercent(occupiedCount);
  const pw = state.foundation.plotWidth || 40;
  const pd = state.foundation.plotDepth || 60;
  const cellWFt = Math.round(pw / GRID_COLS);
  const cellDFt = Math.round(pd / GRID_ROWS);
  const facing = state.foundation.facing || 'South';
  const directions = getDirectionLabels(facing);
  const sideLabels = directions;
  const backDir = directions.back;
  const isMultiFloor = state.numFloors === 'Multi-Floor';
  const groundRoomCount = (state.currentFloor === 'ground' ? state.placements : state.groundFloorData?.placements || []).length;
  const firstRoomCount = (state.currentFloor === 'first' ? state.placements : state.firstFloorData?.placements || []).length;
  const canPreviewPlan = groundRoomCount > 0 && !state.pendingExpansion;


  // ── Room change toast — show briefly when currentIndex changes ──
  useEffect(() => {
    if (state.phase !== 'placement') return;
    if (state.currentIndex >= state.componentQueue.length) return;
    const room = state.componentQueue[state.currentIndex];
    if (!room) return;
    if (roomToastTimerRef.current) clearTimeout(roomToastTimerRef.current);
    setRoomToast({ name: room.roomLabel, color: room.color, index: state.currentIndex + 1, total: state.componentQueue.length });
    roomToastTimerRef.current = setTimeout(() => setRoomToast(null), 3000);
    return () => { if (roomToastTimerRef.current) clearTimeout(roomToastTimerRef.current); };
  }, [state.currentIndex, state.phase, state.componentQueue]);
  const viewerSeedNotes = useMemo(() => {
    const surveyObj = (ws.surveyData || {}) as Record<string, any>;
    const ans =
      surveyObj && typeof surveyObj.answers === 'object' && surveyObj.answers
        ? (surveyObj.answers as Record<string, any>)
        : surveyObj;
    return [ans?.special_requests, ans?.final_notes]
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');
  }, [ws.surveyData]);
  const savedPlanForCurrentMap = useMemo(() => {
    if (!acceptedCompassPlan || !planReviewSource) return null;
    return acceptedCompassPlan.sourceFingerprint === compassPlanFingerprint(planReviewSource, viewerSeedNotes)
      ? acceptedCompassPlan.candidate
      : null;
  }, [acceptedCompassPlan, planReviewSource, viewerSeedNotes]);

  const startWithDefaultFoundation = useCallback((speakMsg: string, numFloors = 'Single Floor') => {
    if (surveyProcessed.current) return;
    surveyProcessed.current = true;
    setSurveyLoading(false);
    dispatch({
      type: 'PREFILL_FOUNDATION',
      foundation: {
        // v6: Default facing changed 'South' → 'West' per ALS user preference
        // (most common Indian residential orientation in our test bed). Plot
        // size 40×60 kept as before — both are tweakable in the foundation
        // questions, this is just the pre-fill so a power user can SKIP through.
        facing: 'West',
        plotWidth: 40,
        plotDepth: 60,
        plotType: 'Middle Plot',
        numFloors,
      },
      numFloors,
    });
    onSpeak(`${speakMsg} Please answer facing and floor count to begin mapping.`);
  }, [onSpeak]);

  // ── Session Resume (same app run only) ─────────────────────
  // v6 BUGFIX: Removed COMPASS_LAST_BACKUP_KEY from the auto-hydration list.
  // Previously: when the user clicked "Restart Map", we moved the current draft
  // into LAST_BACKUP (so the explicit "LOAD PREVIOUS SESSION" button could still
  // recover it) and cleared SESSION + PRIMARY. But this same hydration block was
  // also reading LAST_BACKUP and picking the "best" of the three — so after the
  // user navigated to Home and came back, it auto-restored the cells they had
  // just intentionally deleted. Worse, line 1135 then wrote it back to PRIMARY,
  // effectively un-doing the Restart.
  //
  // Correct contract:
  //   - Auto-hydration on mount  → SESSION + PRIMARY only (current/in-progress work)
  //   - LAST_BACKUP              → ONLY via the explicit "LOAD PREVIOUS SESSION"
  //                                button in the foundation screen (line ~1957)
  //
  // This means: if you never clicked Restart, you resume exactly where you left
  // off. If you clicked Restart, you get a clean slate next time you open the
  // screen — and the "Load Previous Session" button is still there if you change
  // your mind.
  useEffect(() => {
    let restoredFromDraft = false;
    try {
      const rawDraft = sessionStorage.getItem(COMPASS_DRAFT_KEY);
      const rawBackup = localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY);
      const draftToLoad = pickBestDraftRaw([rawDraft, rawBackup]);
      if (draftToLoad) {
        const draft = parseCompassDraft(draftToLoad);
        if (draft && draft.state) {
          try {
            localStorage.setItem(COMPASS_PRIMARY_BACKUP_KEY, draftToLoad);
          } catch {
            // Ignore storage write errors.
          }
          dispatch({ type: 'HYDRATE_DRAFT', draft: draft.state });
          setFloorRefinements(readCompassFloorRefinements(draft));
          refinementsHydratedRef.current = true;
          surveyProcessed.current = true;
          restoredFromDraft = true;
          setSurveyLoading(false);
          onSpeak('Compass progress restored. Continue from where you left off.');
        }
      }
    } catch {
      // Ignore malformed local draft payloads.
    }

    const t = setTimeout(() => {
      if (!restoredFromDraft) setSurveyLoading(false);
    }, 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (surveyProcessed.current || surveyLoading) return;
    const a = ws.surveyData;
    if (!a) {
      startWithDefaultFoundation('No in-session survey data found. Opening compass grid with default plot settings.');
      return;
    }

    surveyProcessed.current = true;
    setSurveyLoading(false);

    const facingRaw = a.road_facing as string | undefined;
    const f = facingRaw ? facingRaw.replace(' Facing', '') : null;
    const pwVal = a.plot_width_ft ? parseInt(a.plot_width_ft, 10) : null;
    const pdVal = a.plot_depth_ft ? parseInt(a.plot_depth_ft, 10) : null;
    const ptRaw = a.plot_type as string | undefined;
    const ptMap: Record<string, string> = { 'Corner Plot': 'Corner Plot', 'Middle Plot': 'Middle Plot', 'Three-side Open': 'Corner Plot', 'Independent': 'Middle Plot' };
    const pt = ptRaw ? (ptMap[ptRaw] || ptRaw) : null;
    const nf = (a.num_floors as string) || 'Single Floor';
    const nfNorm = (nf === 'Ground Only' || nf === 'Single Floor') ? 'Single Floor' : 'Multi-Floor';
    dispatch({
      type: 'PREFILL_FOUNDATION',
      foundation: {
        facing: f || 'South',
        plotWidth: pwVal || 40,
        plotDepth: pdVal || 60,
        plotType: pt || 'Middle Plot',
        numFloors: nfNorm,
      },
      numFloors: nfNorm,
    });
    onSpeak('Survey defaults loaded. Please confirm house facing and number of floors.');
  }, [ws.surveyData, surveyLoading, onSpeak, startWithDefaultFoundation]);

  useEffect(() => {
    if (surveyLoading) return;
    try {
      const persistedState: CompassState = {
        ...state,
        history: [],
        armed: false,
        pendingExpansion: null,
      };
      const draftPayload: CompassDraftPayload = {
        version: COMPASS_DRAFT_VERSION,
        state: persistedState,
        refinements, // Legacy active-floor field for older app versions.
        advancedFloorMetadata: buildCompassFloorMetadata(floorRefinements),
      };
      const jsonPayload = JSON.stringify(draftPayload);
      const previousPrimary = localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY);
      if (previousPrimary && previousPrimary !== jsonPayload) {
        const previousParsed = parseCompassDraft(previousPrimary);
        const previousPlacementCount = previousParsed?.state?.placements?.length ?? 0;
        if (previousPlacementCount > 0) {
          localStorage.setItem(COMPASS_LAST_BACKUP_KEY, previousPrimary);
        }
      }
      sessionStorage.setItem(COMPASS_DRAFT_KEY, jsonPayload);
      localStorage.setItem(COMPASS_PRIMARY_BACKUP_KEY, jsonPayload);
    } catch {
      // Ignore storage write errors.
    }
  }, [state, refinements, floorRefinements, surveyLoading]);

  useEffect(() => {
    if (state.phase === 'foundation') setFoundationReady(false);
  }, [state.foundationStep, state.phase]);

  useEffect(() => {
    if (menuOpen) { setMenuReady(false); setMenuPage(Math.floor(state.currentIndex / 8)); }
  }, [menuOpen, state.currentIndex, state.currentFloor]);

  // ── Phase Speech ────────────────────────────────────────
  useEffect(() => {
    if (prevPhaseRef.current === 'placement' && state.phase === 'review') {
      const mapped = new Set(state.placements.map((p) => p.roomId)).size;
      const total = state.componentQueue.length;
      onSpeak(`${state.currentFloor === 'first' ? 'First floor' : 'Ground floor'} sequence complete. ${mapped} of ${total} rooms mapped, ${coveragePercent}% coverage.`);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.placements, state.componentQueue.length, coveragePercent, state.currentFloor, onSpeak]);

  useEffect(() => {
    if (state.pendingExpansion) onSpeak(`${state.pendingExpansion.room.roomLabel} can expand. Choose direction or keep single cell.`);
  }, [state.pendingExpansion, onSpeak]);

  // ── Expansion Delay ─────────────────────────────────────
  useEffect(() => {
    if (state.pendingExpansion) { setExpansionReady(false); const t = setTimeout(() => setExpansionReady(true), 400); return () => clearTimeout(t); }
    setExpansionReady(false); return undefined;
  }, [state.pendingExpansion]);

  // ── v5: Dwell-to-Select Timer + helpers DELETED ────────────
  // The old custom dwell timer (2000ms, rAF-driven) duplicated the dwell
  // behaviour that GazeButton already provides. Cells now use GazeButton's
  // built-in dwell (set via dwellCategory="compassMapAction" on the cell render). This:
  //   - removes ~one rAF loop per cell hover (CPU win on 16 cells)
  //   - kills the "two animations competing for foveal attention" problem
  //   - keeps cell dwell scaling with the Compass setting via the local
  //     dwellCategory="compassMapAction" so user dwell settings remain centralized.

  // ── Auto-disarm 45s ─────────────────────────────────────
  useEffect(() => {
    if (!state.armed) return;
    const t = setTimeout(() => { dispatch({ type: 'DISARM_GRID' }); onSpeak('Grid disarmed due to inactivity.'); }, 45000);
    return () => clearTimeout(t);
  }, [state.armed, onSpeak]);

  // ── Keyboard Shortcuts ──────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); dws({ type: 'UNDO' }); return; }
      if (e.key === 'Escape') { if (menuOpen) { setMenuOpen(false); return; } if (state.pendingExpansion) dws({ type: 'EXPAND_ROOM', direction: 'none' }); else if (state.armed) dws({ type: 'DISARM_GRID' }); return; }
      if (state.phase !== 'placement') return;
      if (e.key.toLowerCase() === 'r' && !state.pendingExpansion) dws({ type: state.armed ? 'DISARM_GRID' : 'ARM_GRID' });
      else if (e.key.toLowerCase() === 'n' && !state.pendingExpansion) dws({ type: 'NEXT_ROOM' });
      else if (e.key.toLowerCase() === 'u') dws({ type: 'UNDO' });
      else if (e.key.toLowerCase() === 'k' && state.pendingExpansion) dws({ type: 'EXPAND_ROOM', direction: 'none' });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state.phase, state.armed, state.pendingExpansion, menuOpen]);

  // ── dispatchWithSpeech ──────────────────────────────────
  const dws = useCallback((action: CompassAction) => {
    switch (action.type) {
      case 'ARM_GRID': if (currentRoom) onSpeak(`Grid ready. Place ${currentRoom.roomLabel}.`); break;
      case 'DISARM_GRID': onSpeak('Grid disarmed.'); break;
      case 'PLACE_ROOM': {
        const { row, col } = parseCellKey(action.cell);
        if (currentRoom) {
          const existingRoomId = state.grid[action.cell]?.roomId;
          if (existingRoomId === currentRoom.roomId) {
            onSpeak(`${currentRoom.roomLabel} removed from row ${row}, column ${col}.`);
          } else if (existingRoomId && existingRoomId !== currentRoom.roomId) {
            const takenBy = ROOM_LIBRARY[existingRoomId]?.roomLabel || 'another room';
            onSpeak(`Cell row ${row}, column ${col} is already used by ${takenBy}.`);
          } else {
            // #2 — voice confirmation on placement
            const zoneRow = row === 4 ? 'Back' : row === 3 ? 'Inner back' : row === 2 ? 'Inner front' : 'Front';
            const zoneCol = col === 1 ? 'Left' : col === 2 ? 'Left centre' : col === 3 ? 'Right centre' : 'Right';
            onSpeak(`${currentRoom.roomLabel} placed. ${zoneRow}, ${zoneCol} zone.`);
          }
        }
        break;
      }
      case 'EXPAND_ROOM': if (state.pendingExpansion) { const rm = state.pendingExpansion.room; onSpeak(action.direction === 'none' ? `Keeping ${rm.roomLabel} in single cell.` : `${rm.roomLabel} expanded ${action.direction}.`); } break;
      case 'NEXT_ROOM': {
        if (!state.armed) {
          onSpeak('Press READY first.');
          break;
        }
        const currentHasCells = currentRoom
          ? state.placements.some((p) => p.roomId === currentRoom.roomId)
          : false;
        const next = state.currentIndex + 1 < state.componentQueue.length ? state.componentQueue[state.currentIndex + 1] : null;
        if (!currentHasCells && currentRoom) {
          if (next) onSpeak(`${currentRoom.roomLabel} left unplaced. Next room: ${next.roomLabel}.`);
          else onSpeak(`${currentRoom.roomLabel} left unplaced. Room list complete. Review and save the map.`);
          break;
        }
        if (next) onSpeak(`Next room: ${next.roomLabel}.`);
        else onSpeak('Room list complete. Review and save the map.');
        break;
      }
      case 'SKIP_ROOM': if (currentRoom) { const next = state.currentIndex + 1 < state.componentQueue.length ? state.componentQueue[state.currentIndex + 1] : null; onSpeak(`Skipped ${currentRoom.roomLabel}.${next ? ` Next: ${next.roomLabel}.` : ''}`); } break;
      case 'UNDO':
        if (!state.armed) {
          onSpeak('Press READY first.');
          break;
        }
        if (state.history.length > 0) {
          const p = state.history[state.history.length - 1];
          const rm = state.componentQueue[p.currentIndex];
          if (rm) onSpeak(`Undone. Re-placing ${rm.roomLabel}.`);
        }
        break;
      case 'REMOVE_PLACED_ROOM': { const t = state.placements.find((p) => p.placementId === action.placementId); if (t) onSpeak(`${t.roomLabel} removed.`); break; }
      case 'RESET': onSpeak('Map cleared. Starting fresh.'); break;
    }
    dispatch(action);
  }, [currentRoom, state, onSpeak]);

  // ── Expansion Direction ─────────────────────────────────
  const getExpDir = useCallback((cellKey: GridCellKey): ExpansionDirection | null => {
    if (!state.pendingExpansion) return null;
    const { anchorCell, validDirections } = state.pendingExpansion;
    const a = parseCellKey(anchorCell);
    if (validDirections.includes('right') && a.col < GRID_COLS && cellKey === buildCellKey(a.row, a.col + 1)) return 'right';
    if (validDirections.includes('down') && a.row < GRID_ROWS && cellKey === buildCellKey(a.row + 1, a.col)) return 'down';
    return null;
  }, [state.pendingExpansion]);

  // ── Foundation Handler ──────────────────────────────────
  const handleFoundationAnswer = useCallback((value: string) => {
    // READY arms dwell selection through gazeEnabled. A deliberate pointer or
    // keyboard click can answer immediately, including in the browser preview.
    const q = FOUNDATION_QUESTIONS[state.foundationStep];
    if (!q) return;
    setFoundationReady(false);
    const parsed = q.parse ? q.parse(value) : value;
    dispatch({ type: 'SET_FOUNDATION', key: q.key as FoundationKey, value: parsed });
    const remaining = FOUNDATION_QUESTIONS.length - state.foundationStep - 1;
    if (remaining > 0) { onSpeak(`Selected ${value}. ${remaining} question${remaining > 1 ? 's' : ''} remaining.`); }
    else { onSpeak('Foundation complete. Starting room placement.'); }
    if (state.foundationStep === FOUNDATION_QUESTIONS.length - 1) {
      const nf = q.key === 'numFloors' ? value : (state.foundation.numFloors || 'Single Floor');
      onSpeak('Foundation complete. Starting room placement.');
      dispatch({ type: 'COMPLETE_FOUNDATION', queue: generateGFQueue(), numFloors: nf });
    }
  }, [state.foundationStep, state.foundation.numFloors, onSpeak]);

  // ── Save Handler ────────────────────────────────────────
  const handleSave = useCallback(() => {
    const mkPlacements = (pl: PlacementRecord[]) => pl.map((p) => ({
      room: p.roomLabel, roomId: p.roomId, placementId: p.placementId, cells: p.occupiedCells,
      coords: cellsToBoundingRect(p.occupiedCells, pw, pd),
      cellRects: Object.fromEntries(p.occupiedCells.map((c: GridCellKey) => [c, cellToRect(c, pw, pd)])),
      area_sqft: Math.round(p.occupiedCells.reduce((area, cell) => {
        const rect = cellToRect(cell, pw, pd);
        return area + (rect.x2 - rect.x1) * (rect.y2 - rect.y1);
      }, 0)),
    }));

    let payload: any = {
      grid_size: { rows: GRID_ROWS, cols: GRID_COLS },
      plot: { width_ft: pw, depth_ft: pd, facing, type: state.foundation.plotType, num_floors: state.numFloors },
      cell_size_ft: { width: cellWFt, depth: cellDFt },
      saved_at: new Date().toISOString(),
      advanced_refinements: refinements,
    };

    if (state.currentFloor === 'first' && state.groundFloorData) {
      payload.ground_floor = { placements: mkPlacements(state.groundFloorData.placements), coverage_percent: state.groundFloorData.coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.groundFloorData!.grid[k]?.roomId) };
      payload.first_floor = { placements: mkPlacements(state.placements), coverage_percent: coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.grid[k]?.roomId) };
    } else if (state.currentFloor === 'ground' && state.firstFloorData) {
      payload.ground_floor = { placements: mkPlacements(state.placements), coverage_percent: coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.grid[k]?.roomId) };
      payload.first_floor = { placements: mkPlacements(state.firstFloorData.placements), coverage_percent: state.firstFloorData.coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.firstFloorData!.grid[k]?.roomId) };
    } else {
      payload.ground_floor = { placements: mkPlacements(state.placements), coverage_percent: coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.grid[k]?.roomId) };
    }

    payload = attachCompassFloorRefinements(payload, floorRefinements, state.currentFloor);
    const existing = surveyDataRef.current || {};
    saveSurveyRef.current?.({ ...existing, compass_map: payload, source: 'compass-map-manual' });
    if (typeof snapshotSurveyRef.current === 'function') {
      snapshotSurveyRef.current({ ...existing, compass_map: payload, source: 'compass-map-manual' });
    }
    onSpeak(`Compass Map saved. ${state.placements.length} rooms placed.`);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 5000);
  }, [state, pw, pd, cellWFt, cellDFt, coveragePercent, facing, onSpeak, refinements, floorRefinements]);

  // ── Autosave: silently save after each placement change ───
  const placementCount = state.placements.length;
  const autosavePhase = state.phase;
  useEffect(() => {
    if (placementCount === 0) return;
    if (autosavePhase !== 'placement' && autosavePhase !== 'review') return;
    // Debounce and save only when there is meaningful new layout data.
    const t = setTimeout(() => {
      const mkPlacements = (pl: PlacementRecord[]) => pl.map((p) => ({
        room: p.roomLabel, roomId: p.roomId, placementId: p.placementId, cells: p.occupiedCells,
        coords: cellsToBoundingRect(p.occupiedCells, pw, pd),
        cellRects: Object.fromEntries(p.occupiedCells.map((c: GridCellKey) => [c, cellToRect(c, pw, pd)])),
        area_sqft: Math.round(p.occupiedCells.reduce((area, cell) => {
          const rect = cellToRect(cell, pw, pd);
          return area + (rect.x2 - rect.x1) * (rect.y2 - rect.y1);
        }, 0)),
      }));
      let payload: any = {
        grid_size: { rows: GRID_ROWS, cols: GRID_COLS },
        plot: { width_ft: pw, depth_ft: pd, facing, type: state.foundation.plotType, num_floors: state.numFloors },
        cell_size_ft: { width: cellWFt, depth: cellDFt },
        saved_at: new Date().toISOString(),
        advanced_refinements: refinements,
      };
      if (state.currentFloor === 'first' && state.groundFloorData) {
        payload.ground_floor = { placements: mkPlacements(state.groundFloorData.placements), coverage_percent: state.groundFloorData.coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.groundFloorData!.grid[k]?.roomId) };
        payload.first_floor = { placements: mkPlacements(state.placements), coverage_percent: coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.grid[k]?.roomId) };
      } else if (state.currentFloor === 'ground' && state.firstFloorData) {
        payload.ground_floor = { placements: mkPlacements(state.placements), coverage_percent: coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.grid[k]?.roomId) };
        payload.first_floor = { placements: mkPlacements(state.firstFloorData.placements), coverage_percent: state.firstFloorData.coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.firstFloorData!.grid[k]?.roomId) };
      } else {
        payload.ground_floor = { placements: mkPlacements(state.placements), coverage_percent: coveragePercent, empty_cells: ALL_CELL_KEYS.filter((k: GridCellKey) => !state.grid[k]?.roomId) };
      }
      payload = attachCompassFloorRefinements(payload, floorRefinements, state.currentFloor);
      const fingerprintPayload = { ...payload };
      delete (fingerprintPayload as Record<string, any>).saved_at;
      const fingerprint = JSON.stringify({
        floor: state.currentFloor,
        coverage: coveragePercent,
        placements: state.placements.length,
        payload: fingerprintPayload,
      });

      if (fingerprint === lastAutosaveFingerprintRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastAutosaveAtRef.current < COMPASS_AUTOSAVE_MIN_INTERVAL_MS) {
        return;
      }

      const existing = surveyDataRef.current || {};
      saveSurveyRef.current?.({ ...existing, compass_map: payload, source: 'compass-map-autosave' });
      lastAutosaveAtRef.current = now;
      lastAutosaveFingerprintRef.current = fingerprint;

      if (
        typeof snapshotSurveyRef.current === 'function'
        && now - lastSnapshotAtRef.current >= COMPASS_SNAPSHOT_MIN_INTERVAL_MS
      ) {
        snapshotSurveyRef.current({ ...existing, compass_map: payload, source: 'compass-map-autosave' });
        lastSnapshotAtRef.current = now;
      }
    }, COMPASS_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [placementCount, autosavePhase, state, pw, pd, cellWFt, cellDFt, coveragePercent, facing, refinements, floorRefinements]);

  // ── Restart Survey Handler ────────────────────────────────
  const handleRestartCompass = useCallback(() => {
    setShowRestartConfirm(true);
  }, []);

  const executeRestartCompass = useCallback(() => {
    try {
      const primary = localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY);
      const sessionDraft = sessionStorage.getItem(COMPASS_DRAFT_KEY);
      const bestBeforeReset = pickBestDraftRaw([primary, sessionDraft]);
      if (bestBeforeReset) {
        const parsed = parseCompassDraft(bestBeforeReset);
        const placementCount = parsed?.state?.placements?.length ?? 0;
        if (placementCount > 0) {
          localStorage.setItem(COMPASS_LAST_BACKUP_KEY, bestBeforeReset);
        }
      }
      sessionStorage.removeItem(COMPASS_DRAFT_KEY);
      localStorage.removeItem(COMPASS_PRIMARY_BACKUP_KEY);
    } catch (e) { }
    dispatch({ type: 'RESET', queue: initialQueue });
    // Clear all cell-level refinements (splits, walls, voids, rotations,
    // expansions, layouts, vastu flags, etc.) so the user gets a truly clean
    // canvas — no leftover ✦ stars on cells they previously edited.
    setFloorRefinements(readCompassFloorRefinements(null));
    refinementsHydratedRef.current = true;
    setAcceptedCompassPlan(null);
    try { localStorage.removeItem(COMPASS_ACCEPTED_PLAN_KEY); } catch { /* Storage may be unavailable. */ }
    setFoundationReady(false);
    setShowRestartConfirm(false);
    onSpeak('Map reset. Please answer the foundation questions again.');
  }, [initialQueue, onSpeak]);

  const requestPlanCandidates = useCallback(async (payload: CompassMapPayload) => {
    const requestId = ++planReviewRequestId.current;
    setPlanReviewLoading(true);
    setPlanReviewError(null);
    setPlanReviewErrorDetails([]);
    setPlanReviewErrorCode(null);
    setPlanCandidates([]);
    setPlanReviewWarnings([]);
    const result = await generatePlanCandidates(payload, {
      surveyData: (ws.surveyData || null) as Record<string, any> | null,
      userNotes: viewerSeedNotes,
      useAdvancedFusion: true,
    });
    if (requestId !== planReviewRequestId.current) return;
    setPlanReviewLoading(false);
    if ('error' in result) {
      setPlanReviewError(result.error);
      setPlanReviewErrorDetails(result.details || []);
      setPlanReviewErrorCode(result.code || null);
      onSpeak(result.code === 'unsupported_refinements'
        ? 'These saved refinements need the original plan viewer. You can open it here.'
        : 'No valid plan was produced. You can adjust the map or try again.');
      return;
    }
    if (!result.candidates.length) {
      setPlanReviewError('The generator found no valid layouts for this map.');
      onSpeak('No valid layouts were found. Adjust the map or try again.');
      return;
    }
    setPlanCandidates(result.candidates);
    setPlanReviewWarnings(result.warnings || []);
    onSpeak(`${result.candidates.length} geometry-checked ${result.candidates.length === 1 ? 'design' : 'designs'} ready. Review the first design.`);
  }, [onSpeak, viewerSeedNotes, ws.surveyData]);

  // Compile the unchanged Compass Map choices, then review validated plans.
  const handleGenerateFloorPlan = useCallback((scope: CompassPlanScope = 'ground') => {
    const payload = compileCompassPayload(
      state.foundation,
      state.placements.map((p) => ({
        placementId: p.placementId,
        roomId: p.roomId,
        roomLabel: p.roomLabel,
        occupiedCells: p.occupiedCells,
        coords: cellsToBoundingRect(p.occupiedCells, pw, pd),
        cellRects: Object.fromEntries(p.occupiedCells.map((c: GridCellKey) => [c, cellToRect(c, pw, pd)])),
      })),
      GRID_ROWS,
      GRID_COLS,
      coveragePercent,
      state.groundFloorData ? {
        placements: state.groundFloorData.placements.map((p) => ({
          placementId: p.placementId,
          roomId: p.roomId,
          roomLabel: p.roomLabel,
          occupiedCells: p.occupiedCells,
          coords: cellsToBoundingRect(p.occupiedCells, pw, pd),
          cellRects: Object.fromEntries(p.occupiedCells.map((c: GridCellKey) => [c, cellToRect(c, pw, pd)])),
        })),
        coveragePercent: state.groundFloorData.coveragePercent,
      } : null,
      state.firstFloorData ? {
        placements: state.firstFloorData.placements.map((p) => ({
          placementId: p.placementId,
          roomId: p.roomId,
          roomLabel: p.roomLabel,
          occupiedCells: p.occupiedCells,
          coords: cellsToBoundingRect(p.occupiedCells, pw, pd),
          cellRects: Object.fromEntries(p.occupiedCells.map((c: GridCellKey) => [c, cellToRect(c, pw, pd)])),
        })),
        coveragePercent: state.firstFloorData.coveragePercent,
      } : null,
      state.currentFloor,
    );
    const source = attachCompassFloorRefinements(payload, floorRefinements, state.currentFloor);
    setCompiledPayload(source);
    setPlanReviewSource(source);
    setStudioScope(scope);
    setShowCompassStudio(true);
    onSpeak(scope === 'ground' ? 'Opening the ground floor plan. Your first floor draft is kept.' : 'Opening both floors.');
  }, [state, pw, pd, coveragePercent, onSpeak, floorRefinements]);

  // Hydrate once: later backend echoes must not overwrite in-progress edits.
  useEffect(() => {
    if (refinementsHydratedRef.current) return;
    const compassMap = (ws.surveyData as any)?.compass_map;
    if (compassMap) {
      setFloorRefinements(readCompassFloorRefinements(compassMap, state.currentFloor));
      refinementsHydratedRef.current = true;
    }
  }, [ws.surveyData, state.currentFloor]);

  const switchCompassFloor = (floor: FloorType) => {
    if (floor === state.currentFloor) return;
    dispatch({ type: 'SWITCH_FLOOR', floor });
  };

  // ─── Gaze Toggle ────────────────────────────────────────
  // ─── RENDER: Foundation Phase ───────────────────────────
  const renderFoundation = () => {
    if (surveyLoading) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexDirection: 'column' }}>
          <div style={{ width: '32px', height: '32px', border: `3px solid ${T_accentSubtle}`, borderTopColor: T_accent, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ color: T_textSub, fontSize: 'clamp(13px, 1.5vh, 16px)' }}>Loading survey data...</span>
        </div>
      );
    }
    const q = FOUNDATION_QUESTIONS[state.foundationStep];
    if (!q) return null;
    const stepNum = state.foundationStep + 1;

    return (
      <div className="foundation-layout">
        <aside className="survey-question-panel">
          <div className="survey-eyebrow">FOUNDATION</div>
          <h1>{q.text}</h1>
          {q.subtext && <p>{q.subtext}</p>}
          <div id="foundation-readiness" className="foundation-readiness" role="status" aria-live="polite" aria-atomic="true">
            {foundationReady ? 'Ready. Please choose an option.' : 'Click an option, or press READY to select with gaze.'}
          </div>
          <div className="survey-question-count">Question {stepNum} of {FOUNDATION_QUESTIONS.length}</div>
          <div className="survey-step-track" aria-hidden="true">
            {FOUNDATION_QUESTIONS.map((question, index) => <span key={question.key} data-complete={index <= state.foundationStep} />)}
          </div>
        </aside>
        <div className="survey-workspace">
          <div className="survey-options-area">
            <div className="survey-choice-grid" role="group" aria-label={q.text} aria-describedby="foundation-readiness"
              style={{ '--choice-columns': q.columns } as React.CSSProperties}>
              {q.options.map(opt => (
                <GazeButton key={`${state.foundationStep}-${opt}`} id={`fq-${state.foundationStep}-${opt}`}
                  className="survey-choice" gazeEnabled={isGazeEnabled && foundationReady}
                  gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode={!isWarm}
                  dwellCategory="surveyOption" onClick={() => handleFoundationAnswer(opt)}>
                  {opt}
                </GazeButton>
              ))}
            </div>
          </div>
          <div className="survey-command-bar foundation-command-bar">
            {!foundationReady && <>
              <GazeButton id="f-ready" className="survey-primary-action" gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode={!isWarm} dwellCategory="compassMapAction"
                onClick={() => { setFoundationReady(true); onSpeak('Ready. Please choose an option.'); }}>READY</GazeButton>
              {!showRestoreConfirm && (localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY) || localStorage.getItem(COMPASS_LAST_BACKUP_KEY)) && (
                <GazeButton id="f-restore" gazeEnabled={isGazeEnabled && !isConfirmationOpen}
                  gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode={!isWarm} dwellCategory="deliberateAction"
                  onClick={() => setShowRestoreConfirm(true)}>LOAD PREVIOUS SESSION</GazeButton>
              )}
            </>}
            {foundationReady && <span className="survey-ready-label">Select an option</span>}
            {state.foundationStep > 0 && <GazeButton id="f-back" gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode={!isWarm} dwellCategory="backSkipButton"
              onClick={() => dispatch({ type: 'FOUNDATION_BACK' })}>← BACK</GazeButton>}
            <GazeButton id="f-skip" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
              isDarkMode={!isWarm} dwellCategory="backSkipButton"
              onClick={() => {
                const dflt = q.parse ? q.parse(q.options[0]) : q.options[0];
                dispatch({ type: 'SET_FOUNDATION', key: q.key as FoundationKey, value: dflt });
                onSpeak(`Skipped. Default: ${q.options[0]}.`);
                if (state.foundationStep === FOUNDATION_QUESTIONS.length - 1) dispatch({ type: 'COMPLETE_FOUNDATION', queue: generateGFQueue(), numFloors: state.foundation.numFloors || 'Single Floor' });
              }}>SKIP →</GazeButton>
          </div>
        </div>
      </div>
    );
  };

  // ─── RENDER: Vertical CAD Sidebar — all controls stacked ──

  // Context overlay removed — room name now displayed on the road section


  // ─── RENDER: Right Action Strip (The "Connected Column") ───
  const renderActionStrip = () => {
    const controlsUnlocked = !!currentRoom && state.phase === 'placement' && state.armed && !state.pendingExpansion;

    // Common style for strip buttons — taller in nav-visible mode so each
    // button feels properly hit-target sized for eye-gaze even when the
    // strip's vertical column is shorter (compressed by HIDE NAV + bottom gap).
    const stripBtnStyle = (active: boolean, specialColor?: string) => ({
      flex: 1, width: '100%', borderRadius: 0, margin: 0,
      border: 'none',
      borderBottom: `1px solid ${T_panelBorderSoft}`,
      background: active ? (specialColor ? specialColor : T_accentSubtle) : (isLight ? 'transparent' : isMix ? 'transparent' : 'transparent'),
      color: active ? T_textMain : T_textDim,
      fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900,
      letterSpacing: '0.4px',
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
      gap: 'clamp(8px, 1.2vh, 14px)',
      // Chunkier vertical padding — gives every button extra height
      // independent of the strip's flex distribution.
      padding: 'clamp(14px, 2.1vh, 26px) clamp(8px, 1vw, 14px)',
      transition: 'all 0.2s ease',
      minHeight: 'clamp(96px, 11vh, 130px)',
    });

    return (
      <div className="compass-action-strip" style={{
        position: 'absolute',
        right: '24px',
        // Dynamic top — tighter when nav is visible. HIDE NAV ends at ~295;
        // strip now starts at 304 (only ~9px below HIDE NAV instead of ~21px),
        // reclaiming vertical space so each button can be taller.
        top: navHidden ? '152px' : '304px',
        // The stylesheet reserves a bottom gaze-clearance band; the four
        // remaining controls share the rail's available height equally.
        width: '296px',
        height: navHidden ? 'calc(100% - 184px)' : 'calc(100% - 324px)',
        background: T_panelBg,
        border: `1px solid ${T_panelBorderSoft}`,
        borderRadius: '24px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        zIndex: 50,
        boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
        pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* NORMAL PLACEMENT BUTTONS */}
            {/* BUTTON 0: FLOOR TOGGLE */}
            <GazeButton id="strip-floor" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (isConfirmationOpen) return;
                if (isMultiFloor) {
                  const next = state.currentFloor === 'ground' ? 'first' : 'ground';
                  switchCompassFloor(next);
                  onSpeak(`Switched to ${next} floor.`);
                } else {
                  dws({ type: 'SET_NUM_FLOORS', value: 'Multi-Floor' });
                  onSpeak('First floor mapping enabled.');
                }
              }}
              style={stripBtnStyle(true, isLight ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : isMix ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : (state.currentFloor === 'ground' ? 'rgba(45,212,191,0.1)' : 'rgba(100,181,246,0.1)'))}>
              {isMultiFloor ? (
                <>
                  <div style={{ fontSize: 'clamp(22px, 2.6vh, 28px)', fontWeight: 900, color: T_textMain, letterSpacing: '0.6px' }}>{state.currentFloor === 'ground' ? 'GND' : '1F'}</div>
                  <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', fontWeight: 700, color: T_textSub, letterSpacing: '1.2px' }}>SWITCH</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 'clamp(22px, 2.6vh, 28px)', fontWeight: 900, color: T_textMain, letterSpacing: '0.6px' }}>GND</div>
                  <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', fontWeight: 700, color: T_accent, letterSpacing: '0.8px' }}>+ ADD 1F</div>
                </>
              )}
            </GazeButton>
            {/* BUTTON 1: ROOMS (MENU) */}
            <GazeButton id="strip-rooms" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => { setMenuOpen(true); onSpeak('Components menu.'); }}
              style={stripBtnStyle(true, T_accentSubtle)}>
              <div style={{ fontSize: 'clamp(26px, 3.2vh, 34px)', marginBottom: '-4px', color: T_textMain }}>{'☰'}</div>
              <div style={{ fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900, color: T_textMain, letterSpacing: '1px' }}>ROOMS</div>
            </GazeButton>

            {/* BUTTON 2: NEXT / KEEP 1 */}
            {state.pendingExpansion ? (
              <GazeButton id="strip-keep" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                onClick={() => dws({ type: 'EXPAND_ROOM', direction: 'none' })}
                style={{ ...stripBtnStyle(true, 'rgba(234, 179, 8, 0.15)'), color: '#FACC15' }}>
                <div style={{ fontSize: '24px' }}>TOP</div>
                <div>KEEP 1</div>
              </GazeButton>
            ) : (
              <GazeButton id="strip-next" gazeEnabled={isGazeEnabled && controlsUnlocked && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                onClick={() => {
                  if (isConfirmationOpen) return;
                  if (!controlsUnlocked) { onSpeak('Press READY first.'); return; }
                  dws({ type: 'NEXT_ROOM' });
                }}
                style={{
                  ...stripBtnStyle(controlsUnlocked, isLight ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : isMix ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : 'rgba(45,212,191,0.1)'),
                  color: controlsUnlocked
                    ? (isLight ? T_accent : isMix ? '#5E9CA8' : '#2DD4BF')
                    : (isLight ? T_textDim : isMix ? T_textDim : '#475569')
                }}>
                <div style={{ fontSize: 'clamp(28px, 3.4vh, 36px)' }}>{'→'}</div>
                <div style={{ fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900, letterSpacing: '1px' }}>NEXT</div>
              </GazeButton>
            )}

            {/* BUTTON 3: GENERATE */}
            <GazeButton id="strip-generate" gazeEnabled={isGazeEnabled && canPreviewPlan && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (isConfirmationOpen) return;
                if (!canPreviewPlan) { onSpeak('Place a ground floor room and finish its size choice first.'); return; }
                setConfirmGenerate(true);
                onSpeak('Choose ground floor only, or both floors.');
              }}
              style={{
                ...stripBtnStyle(canPreviewPlan, T_generatePlanBg),
                borderBottom: 'none',
                color: (canPreviewPlan)
                  ? (isLight ? T_textInverse : isMix ? T_textInverse : '#497775')
                  : T_textDim,
              }}>
              <div style={{ fontSize: 'clamp(24px, 2.8vh, 30px)' }}>{'📝'}</div>
              <div style={{ textAlign: 'center', lineHeight: 1.1, fontSize: 'clamp(18px, 2.1vh, 22px)', fontWeight: 900, letterSpacing: '0.8px' }}>GENERATE{'\n'}PLAN</div>
            </GazeButton>
        </div>
      </div>
    );
  };

  // ─── RENDER: Architectural Plot Canvas (Left Main) ─────────
  // Layout: White Blueprint Style, Flush to Road, Zero Gaps
  const renderPlotCanvas = () => (
    <div className="compass-plot" style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, // Fill available space
      position: 'relative',
      overflow: 'hidden',
      // Top: push grid down ~24px from top NavBar.
      // The workspace stylesheet keeps the road controls clear of the screen edge.
      // Right: 360px reserves space for the 296px sidebar + 24px right inset + ~40px gap.
      padding: '24px 360px 20px 40px',
      pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto',
    }}>

      {/* Plot Area Container */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center'
      }}>
        {/* Compound Wall — multi-layer architectural boundary
            • Outer warm-stone trim (theme-aware) — reads like a real property wall
            • Inner sage compound with grass/lawn appearance
            • Thicker on top + sides; bottom flows into road bar (gate side)
            • Subtle ground shadow gives the plot weight
        */}
        <div className="compass-plot-frame" data-armed={state.armed} style={{
          flex: 1, width: '100%',
          display: 'flex', flexDirection: 'column',
          borderTop: state.armed
            ? `6px solid ${T_accent}`
            : `6px solid ${isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328'}`,
          borderLeft: state.armed
            ? `6px solid ${T_accent}`
            : `6px solid ${isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328'}`,
          borderRight: state.armed
            ? `6px solid ${T_accent}`
            : `6px solid ${isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328'}`,
          borderBottom: 'none',
          borderRadius: '14px 14px 0 0',
          background: isLight ? '#9DB89A' : isMix ? '#6F8869' : '#8DAE85',
          boxShadow: state.armed
            ? `0 0 0 3px ${isLight ? '#5C4A30' : isMix ? '#3D3328' : '#26221C'}, 0 12px 26px rgba(0,0,0,0.18)`
            : `0 0 0 3px ${isLight ? '#5C4A30' : isMix ? '#3D3328' : '#26221C'}, 0 12px 26px rgba(0,0,0,0.16)`,
          overflow: 'hidden',
          position: 'relative',
          transition: 'all 0.4s ease',
        }}>
          <CompassRose
            facing={facing}
            bg={T_panelBg}
            border={isLight ? '#3F6864' : isMix ? 'rgba(180, 147, 98, 0.42)' : T_panelBorderSoft}
            textColor={T_textSub}
            northColor={isLight ? '#8C3F3F' : isMix ? '#C9695C' : '#EF5350'}
            size={72}
          />
          <ScaleBar
            feet={cellWFt}
            ink={isLight ? '#5C4A30' : isMix ? '#A89476' : T_textSub}
            muted={isLight ? T_textSub : isMix ? '#8E7E62' : T_textDim}
          />

          {/* Direction labels — inset tabs on the wall edges (architectural drawing style)
              Side walls use writing-mode vertical-rl so the text runs along the wall
              naturally and stays inside the overflow:hidden boundary.

              v5: Added pointerEvents:'none' on all three labels. They sit at
              z-index 3 above the grid (z-index 2) and visually overlap the
              outer ~15px of edge cells (top of r1_c2/c3, left of r2_c1/r3_c1,
              right of r2_c4/r3_c4). Without pointer-event opt-out, gaze landing
              on those edges hit the label (which has no onClick) and produced
              NO dwell — corners felt "dead" for users. They're informational
              only; the cell beneath should always own the dwell. */}
          <div className="compass-direction" style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
            padding: '4px 16px', borderRadius: '0 0 10px 10px',
            background: isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328',
            color: isLight ? '#FAF5E8' : isMix ? '#FFFCF1' : '#ECEDE3',
            fontSize: 'clamp(12px, 1.4vh, 15px)', fontWeight: 800, letterSpacing: '1px',
            fontVariantNumeric: 'tabular-nums',
            boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
            pointerEvents: 'none', userSelect: 'none',
          }}>BACK &middot; {backDir.toUpperCase()}</div>
          <div className="compass-direction" style={{
            position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)', zIndex: 3,
            padding: '16px 4px', borderRadius: '0 10px 10px 0',
            background: isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328',
            color: isLight ? '#FAF5E8' : isMix ? '#FFFCF1' : '#ECEDE3',
            fontSize: 'clamp(12px, 1.4vh, 15px)', fontWeight: 800, letterSpacing: '1px',
            fontVariantNumeric: 'tabular-nums',
            writingMode: 'vertical-rl' as const,
            textOrientation: 'mixed' as const,
            boxShadow: '2px 0 6px rgba(0,0,0,0.14)',
            pointerEvents: 'none', userSelect: 'none',
          }}>LEFT &middot; {sideLabels.left.toUpperCase()}</div>
          <div className="compass-direction" style={{
            position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)', zIndex: 3,
            padding: '16px 4px', borderRadius: '10px 0 0 10px',
            background: isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328',
            color: isLight ? '#FAF5E8' : isMix ? '#FFFCF1' : '#ECEDE3',
            fontSize: 'clamp(12px, 1.4vh, 15px)', fontWeight: 800, letterSpacing: '1px',
            fontVariantNumeric: 'tabular-nums',
            writingMode: 'vertical-rl' as const,
            textOrientation: 'mixed' as const,
            boxShadow: '-2px 0 6px rgba(0,0,0,0.14)',
            pointerEvents: 'none', userSelect: 'none',
          }}>RIGHT &middot; {sideLabels.right.toUpperCase()}</div>

          {/* Grid
              v5: Bumped gap 2px → clamp(6px, 0.8vh, 10px) — eye-tracker jitter
              (~5-15px even after filtering) was flipping dwell between adjacent
              cells. A larger gap creates a "dead zone" so brief micro-saccades
              land on neutral grout instead of cancelling/firing the wrong cell. */}
          <div className="compass-cell-grid" style={{
            position: 'absolute', inset: '12px',
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
            gap: 'clamp(6px, 0.8vh, 10px)',
            padding: 'clamp(4px, 0.6vh, 8px)',
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '6px',
            zIndex: 2
          }}>
            {RENDER_ORDER.map((cellKey: GridCellKey) => {
              const cs = state.grid[cellKey];
              const isOcc = !!cs?.roomId;
              const lib = isOcc ? ROOM_LIBRARY[cs.roomId!] : null;
              const isCurrentRoomCell = !!currentRoom && cs?.roomId === currentRoom.roomId;
              const expDir = getExpDir(cellKey);
              const isExpTarget = expDir !== null;
              const isExpAnchor = !!state.pendingExpansion && state.pendingExpansion.anchorCell === cellKey;
              const { row, col } = parseCellKey(cellKey);
              const isHov = hoveredCell === cellKey;

              const cellGaze = isExpTarget
                  ? isGazeEnabled && expansionReady && !isConfirmationOpen && !menuOpen
                  : isGazeEnabled && state.phase === 'placement' && state.armed && !state.pendingExpansion && !!currentRoom && !isConfirmationOpen && !menuOpen;

              const getNeighborRoom = (r: number, c: number): string | null => {
                if (r < 1 || r > GRID_ROWS || c < 1 || c > GRID_COLS) return null;
                const key = buildCellKey(r, c);
                return state.grid[key]?.roomId || null;
              };

              // Identify anchor for continuous rendering text (top-leftmost cell of this room group)
              const cellLayout = (refinements.cellLayouts || {})[cellKey] || undefined;
              return (
                <GazeButton key={cellKey} id={`cell-${cellKey}`} gazeEnabled={cellGaze}
                  gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                  // v5: Removed custom startCellDwell/cancelCellDwell hooks —
                  // GazeButton's own DwellProgressRing/Shrink already shows progress.
                  // Two simultaneous animations were wasting CPU and visually
                  // competing for the user's foveal attention.
                  onDwellStart={() => setHoveredCell(cellKey)}
                  onDwellCancel={() => { if (hoveredCell === cellKey) setHoveredCell(null); }}
                  onDwellComplete={() => setHoveredCell(null)}
                  onClick={() => {
                    if (isConfirmationOpen) return;
                    const savedDetail = refinements.subCellSplits.some(s => s.parentCell === cellKey)
                      || refinements.customEdges.some(e => e.cells[0] === cellKey)
                      || refinements.voidMarkers.some(v => v.cell === cellKey)
                      || refinements.cellRotations.some(r => r.cell === cellKey)
                      || refinements.cellExpansions.some(e => e.cell === cellKey);
                    if (savedDetail) {
                      onSpeak('This cell has saved plan details. View them using Generate Plan.');
                      return;
                    }
                    if (isExpTarget && expDir) { dws({ type: 'EXPAND_ROOM', direction: expDir }); return; }
                    if (state.phase !== 'placement') return;
                    if (state.pendingExpansion) { onSpeak('Choose expansion direction.'); return; }
                    if (!state.armed) { onSpeak('Press READY first.'); return; }

                    if (!isOcc || isCurrentRoomCell) {
                      dws({ type: 'PLACE_ROOM', cell: cellKey });
                    } else if (isOcc && !isCurrentRoomCell && currentRoom) {
                      // Occupied by DIFFERENT room -> Ask Confirmation
                      setConfirmReplace({ cell: cellKey, oldRoomId: cs.roomId!, newRoomId: currentRoom.roomId });
                      onSpeak(`Replace ${lib?.roomLabel} with ${currentRoom.roomLabel}?`);
                    }
                  }}
                  contentFill
                  style={{
                    width: '100%', height: '100%', border: 'none', background: 'transparent',
                    display: 'flex', overflow: 'hidden', padding: 0,
                    position: 'relative',
                    // v5: Removed nested transform:scale(1.01). GazeButton already
                    // applies scale(1.02) on hover internally — stacking both pushed
                    // the cell's outer edge into adjacent cells, occasionally firing
                    // mouseleave on the wrong neighbor and cancelling the dwell.
                    // Box-shadow alone provides clear "this cell is being looked at"
                    // feedback without any geometric shift that breaks gaze targeting.
                    ...(isHov && cellGaze ? { zIndex: 10, boxShadow: '0 6px 16px rgba(0,0,0,0.22)' } : {})
                  }}
                >
                  <ArchitecturalCell
                    cellKey={cellKey} row={row} col={col} totalRows={GRID_ROWS} totalCols={GRID_COLS}
                    roomId={cs?.roomId || null} roomLabel={lib?.roomLabel || null} shortLabel={lib?.shortLabel || null}
                    roomColor={lib?.color || '#78909C'}
                    cellWidthFt={cellWFt} cellDepthFt={cellDFt}
                    isArmed={state.armed && !state.pendingExpansion && !!currentRoom}
                    isExpTarget={isExpTarget} isExpAnchor={isExpAnchor} expDirection={expDir}
                    pendingRoomColor={state.pendingExpansion?.room.color}
                    neighborN={getNeighborRoom(row + 1, col)} neighborS={getNeighborRoom(row - 1, col)}
                    neighborE={getNeighborRoom(row, col + 1)} neighborW={getNeighborRoom(row, col - 1)}
                    cellLayout={cellLayout}
                  />
                  {/* v5: Removed duplicate bottom progress bar. The parent
                      GazeButton already renders DwellProgressRing/Shrink centred
                      on the cell — having a second progress indicator at the
                      bottom edge competed for foveal attention and pulled the
                      user's gaze toward the bottom of the cell, increasing the
                      chance of drifting onto the cell below. */}
                </GazeButton>
              );
            })}
          </div>
        </div>

        {/* Minimal gaze-protection gap between grid bottom row and road — visually
            almost touching so the road reads as the natural plot edge */}
        <div data-gaze="false" style={{ width: '100%', height: 'clamp(4px, 0.6vh, 8px)', flexShrink: 0, pointerEvents: 'none' }} />

        {/* Road Section — taller with stronger presence + gate indicator */}
        <div className="compass-road" data-armed={state.armed} style={{
          width: '100%', height: 'clamp(140px, 15.5vh, 184px)', flexShrink: 0,
          marginBottom: '-16px',
          background: isLight ? T_panelBg : isMix ? '#241F18' : '#162038',
          border: state.armed
            ? `4px solid ${isLight ? T_accent : isMix ? '#5E9CA8' : '#2DD4BF'}`
            : `2px solid ${isLight ? T_panelBorderSoft : isMix ? T_panelBorderSoft : '#2E4B3A'}`,
          borderTop: 'none', borderRadius: '0 0 16px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          color: isLight ? T_textMain : isMix ? '#FFFCF1' : THEME.road, fontWeight: 800, fontSize: 'clamp(20px, 2.4vh, 26px)', letterSpacing: '0.6px',
          boxShadow: isLight ? '0 -4px 14px rgba(82, 66, 45, 0.08)' : isMix ? '0 -4px 16px rgba(0,0,0,0.22)' : 'none',
        }}>
          {/* Gate diagram — spans exactly one cell width (25% of grid frontage).
              Position respects user's foundation choice:
                Left   → leftmost cell (center 12.5%)
                Center → straddles cells 2&3 boundary (center 50%)
                Right  → rightmost cell (center 87.5%)
              Visual: pillared gate frame with two doors and an entry arrow,
              styled like an architectural site-plan gate marker. */}
          {(() => {
            const gp = state.foundation.gatePosition || 'Center';
            const centerPct = gp === 'Left' ? 12.5 : gp === 'Right' ? 87.5 : 50;
            const stone = isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328';
            const stoneShade = isLight ? '#5C4A30' : isMix ? '#3D3328' : '#26221C';
            const cream = isLight ? '#FAF5E8' : isMix ? '#FFFCF1' : '#ECEDE3';
            return (
              <div style={{
                position: 'absolute',
                top: '-26px',
                left: `${centerPct}%`,
                width: '25%',
                transform: 'translateX(-50%)',
                zIndex: 5,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                pointerEvents: 'none', userSelect: 'none',
                filter: isLight ? 'drop-shadow(0 3px 5px rgba(82, 66, 45, 0.22))' : 'drop-shadow(0 3px 5px rgba(0,0,0,0.32))',
              }}>
                {/* Gate frame stretches the full container width */}
                <svg
                  width="100%"
                  height="26"
                  preserveAspectRatio="none"
                  viewBox="0 0 100 26"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  {/* Lintel cap — slightly extruded above the wall line */}
                  <rect x="0" y="0" width="100" height="5" fill={stoneShade} />
                  <rect x="0" y="3" width="100" height="4" fill={stone} />
                  {/* Left pillar */}
                  <rect x="0" y="5" width="4.5" height="19" fill={stone} />
                  <rect x="0" y="5" width="1.2" height="19" fill={stoneShade} />
                  {/* Right pillar */}
                  <rect x="95.5" y="5" width="4.5" height="19" fill={stone} />
                  <rect x="98.8" y="5" width="1.2" height="19" fill={stoneShade} />
                  {/* Pillar bases */}
                  <rect x="-1" y="22" width="7" height="4" fill={stoneShade} />
                  <rect x="94" y="22" width="7" height="4" fill={stoneShade} />
                  {/* Two gate panels (split center, decorative) */}
                  <rect x="6" y="8" width="42" height="14" fill="none" stroke={stone} strokeWidth="0.7" opacity="0.55" />
                  <rect x="52" y="8" width="42" height="14" fill="none" stroke={stone} strokeWidth="0.7" opacity="0.55" />
                  {/* Vertical bars on each panel (gate slats) */}
                  <line x1="20" y1="9" x2="20" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  <line x1="34" y1="9" x2="34" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  <line x1="66" y1="9" x2="66" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  <line x1="80" y1="9" x2="80" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  {/* Hinges */}
                  <circle cx="2.2" cy="11" r="0.9" fill={cream} opacity="0.78" />
                  <circle cx="2.2" cy="19" r="0.9" fill={cream} opacity="0.78" />
                  <circle cx="97.8" cy="11" r="0.9" fill={cream} opacity="0.78" />
                  <circle cx="97.8" cy="19" r="0.9" fill={cream} opacity="0.78" />
                  {/* Entry arrow at the center seam */}
                  <polygon points="50,18 46.5,12 53.5,12" fill={stone} opacity="0.78" />
                </svg>
                <div style={{
                  marginTop: -2,
                  background: stone,
                  color: cream,
                  padding: '3px 14px',
                  borderRadius: '0 0 8px 8px',
                  fontSize: 10, fontWeight: 800, letterSpacing: '1.6px',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}>
                  MAIN GATE
                </div>
              </div>
            );
          })()}
          {/* READY BUTTON - Left (~25% width = 1 cell width) */}
          {state.phase === 'placement' && (
            <div className="compass-road-ready" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${100 / GRID_COLS}%`, padding: '6px' }}>
              <GazeButton
                id="ready-road-left" selected={state.armed}
                gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                onClick={() => {
                  if (isConfirmationOpen) return;
                  if (state.armed) { dws({ type: 'DISARM_GRID' }); } else { dws({ type: 'ARM_GRID' }); }
                }}
                style={{
                  width: '100%', height: '100%',
                  borderRadius: '12px',
                  fontWeight: 900, fontSize: 'clamp(24px, 2.9vh, 32px)', letterSpacing: '1.4px',
                  background: state.armed
                    ? (isLight ? T_accent : isMix ? T_accent : 'rgba(45,212,191,0.25)')
                    : (isLight ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : isMix ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : 'rgba(45,212,191,0.05)'),
                  border: state.armed
                    ? `3px solid ${isLight ? T_accent : isMix ? T_accent : '#2DD4BF'}`
                    : `2px solid ${isLight ? `color-mix(in srgb, ${T_accent} 33%, transparent)` : isMix ? `color-mix(in srgb, ${T_accent} 33%, transparent)` : 'rgba(45,212,191,0.2)'}`,
                  color: state.armed
                    ? (isLight ? T_textInverse : isMix ? T_textInverse : T_textInverse)
                    : (isLight ? T_accent : isMix ? T_accent : 'rgba(45,212,191,0.6)'),
                  boxShadow: state.armed
                    ? (isLight ? '0 4px 12px rgba(31, 107, 126, 0.28)' : isMix ? '0 4px 14px rgba(0,0,0,0.30)' : '0 0 20px rgba(45,212,191,0.2)')
                    : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}>
                READY
              </GazeButton>
            </div>
          )}

          {/* Road label + live coverage counter */}
          <div className="compass-road-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
            <span style={{
              color: isLight ? T_accent : isMix ? '#5E9CA8' : THEME.road,
              fontWeight: 800, fontSize: 'clamp(20px, 2.4vh, 27px)', letterSpacing: '0.6px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              FRONT / ROAD ({facing}) &ndash; {pw} ft
            </span>
            {state.phase === 'placement' && (
              <span style={{
                fontSize: 'clamp(14px, 1.6vh, 18px)',
                fontWeight: 700,
                color: isLight ? T_textSub : isMix ? '#C4B697' : 'rgba(56,189,248,0.6)',
                letterSpacing: '0.4px',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {occupiedCount} / {16} cells placed &middot; {coveragePercent}%
              </span>
            )}
          </div>

          {/* CURRENT ROOM DISPLAY - Right portion of road, fills vertical height */}
          {(state.phase === 'placement' || state.phase === 'review') && (
            <div className="compass-current-room" style={{
              position: 'absolute', right: 0, top: '4px', bottom: '4px', width: '28%',
              display: 'flex', alignItems: 'stretch', justifyContent: 'center',
              padding: '0 10px', pointerEvents: 'none',
            }}>
              {currentRoom && state.currentIndex < state.componentQueue.length ? (
                <div style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px',
                  background: isLight ? T_cardBg : isMix ? '#2D2820' : 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '12px',
                  border: `2px solid ${currentRoom.color}55`,
                  boxShadow: isLight ? '0 2px 8px rgba(82, 66, 45, 0.10)' : isMix ? '0 2px 10px rgba(0,0,0,0.20)' : 'none',
                }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '5px',
                    background: currentRoom.color, flexShrink: 0,
                    border: isLight ? `1px solid ${currentRoom.color}` : '1px solid rgba(255,255,255,0.25)',
                    boxShadow: `0 0 10px ${currentRoom.color}55`,
                  }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{
                      fontSize: 'clamp(18px, 2.3vh, 26px)', fontWeight: 800,
                      color: isLight ? T_textMain : isMix ? '#FFFCF1' : '#F8FAFC',
                      letterSpacing: '0.6px', lineHeight: 1.15,
                    }}>
                      {currentRoom.roomLabel.toUpperCase()}
                    </span>
                    <span style={{
                      fontSize: 'clamp(14px, 1.6vh, 18px)', fontWeight: 700,
                      color: isLight ? T_accent : isMix ? '#5E9CA8' : 'rgba(56, 189, 248, 0.85)',
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {state.currentIndex + 1} of {state.componentQueue.length}
                    </span>
                  </div>
                </div>
              ) : state.currentIndex >= state.componentQueue.length ? (
                <div style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                  background: isLight ? T_cardBg : isMix ? '#2D2820' : 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '12px',
                  border: `2px solid ${T_success}55`,
                  boxShadow: isLight ? '0 2px 8px rgba(82, 66, 45, 0.10)' : isMix ? '0 2px 10px rgba(0,0,0,0.20)' : 'none',
                }}>
                  <span style={{
                    fontSize: 'clamp(18px, 2.3vh, 26px)', fontWeight: 900,
                    color: T_success, letterSpacing: '0.5px',
                  }}>
                    &#10003; ALL PLACED
                  </span>
                  <span style={{
                    fontSize: 'clamp(13px, 1.5vh, 16px)', fontWeight: 700,
                    color: isLight ? T_textSub : isMix ? '#C4B697' : '#94A3B8',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {coveragePercent}%
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  const renderFloorTransition = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: '600px', padding: '40px' }}>
        <div style={{ fontSize: 'clamp(22px, 3vh, 32px)', fontWeight: 800, color: T_textMain, marginBottom: '16px' }}>Ground Floor Complete!</div>
        <div style={{ fontSize: 'clamp(14px, 1.8vh, 20px)', color: T_textSub, marginBottom: '32px' }}>{state.placements.length} rooms placed, {coveragePercent}% coverage</div>
        <div style={{ fontSize: 'clamp(18px, 2.2vh, 24px)', color: T_textMain, marginBottom: '24px', fontWeight: 700 }}>Map First Floor?</div>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
          <GazeButton id="start-ff" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
            onClick={() => { switchCompassFloor('first'); onSpeak('Starting first floor. Place your rooms.'); }}
            style={{ padding: '16px 40px', minHeight: 'clamp(80px, 9vh, 96px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)', background: T_accentSubtle, border: `2px solid ${T_accent}`, color: T_accent }}>
            YES, MAP 1ST FLOOR
          </GazeButton>
          <GazeButton id="no-ff" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
            onClick={() => { handleSave(); onSpeak('Saved ground floor only. Done.'); }}
            style={{ padding: '16px 40px', minHeight: 'clamp(80px, 9vh, 96px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)', background: T_cardBg, border: `2px solid ${T_panelBorderSoft}`, color: T_textSub }}>
            NO, FINISH
          </GazeButton>
          <GazeButton id="gen-fp-transition" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
            onClick={() => { handleSave(); setConfirmGenerate(true); }}
            style={{
              padding: '16px 40px', minHeight: 'clamp(80px, 9vh, 96px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)',
              background: T_generatePlanBg,
              border: `2px solid ${T_generatePlanBorder}`,
              color: T_generatePlanText,
            }}>
            GENERATE FLOOR PLAN
          </GazeButton>
        </div>
      </div>
    </div>
  );

  // ─── RENDER: Confirmation Overlays ────────────────────────
  const renderConfirmationOverlay = () => {
    if (confirmReplace) {
      const oldLib = ROOM_LIBRARY[confirmReplace.oldRoomId];
      const newLib = ROOM_LIBRARY[confirmReplace.newRoomId];
      return (
        <div className="compass-confirmation" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDim, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `3px solid ${T_panelBorder}`, borderRadius: '24px', padding: '60px', maxWidth: '1000px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '36px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Replace Room?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.5 }}>
              Do you really want to replace <span style={{ color: oldLib?.color || T_textMain, fontWeight: 700 }}>{oldLib?.roomLabel}</span> with <span style={{ color: newLib?.color || T_textMain, fontWeight: 700 }}>{newLib?.roomLabel}</span>?
            </div>
            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
              <GazeButton id="confirm-replace-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="deliberateAction"
                onClick={() => {
                  dws({ type: 'PLACE_ROOM', cell: confirmReplace.cell });
                  setConfirmReplace(null);
                }}
                style={{ padding: '38px 90px', minHeight: '126px', borderRadius: '24px', background: isLight ? T_accent : isMix ? T_accent : '#334155', border: `4px solid ${T_textMain}`, color: T_textInverse, fontSize: '38px', fontWeight: 900, minWidth: '390px' }}>
                YES
              </GazeButton>
              <GazeButton id="confirm-replace-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                onClick={() => setConfirmReplace(null)}
                style={{ padding: '38px 90px', minHeight: '126px', borderRadius: '24px', background: 'transparent', border: `4px solid ${T_textDim}`, color: T_textSub, fontSize: '38px', fontWeight: 900, minWidth: '360px' }}>
                CANCEL
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }

    if (confirmGenerate) {
      return (
        <div className="compass-plan-choice" role="dialog" aria-modal="true">
          <div className="compass-plan-choice-panel">
            <h2>Which floors would you like to see?</h2>
            <p>You can view the ground floor now. Your first-floor draft stays saved, even if it is unfinished.</p>
            <div className="compass-plan-choice-actions">
              <GazeButton id="confirm-gen-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                onClick={() => { setConfirmGenerate(false); handleGenerateFloorPlan('ground'); }}>
                Ground floor only<br /><small>{groundRoomCount} rooms · view 2D plan</small>
              </GazeButton>
              {isMultiFloor && <GazeButton id="confirm-gen-both" gazeEnabled={isGazeEnabled && firstRoomCount > 0} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction" disabled={!firstRoomCount}
                onClick={() => { setConfirmGenerate(false); handleGenerateFloorPlan('all'); }}>
                Both floors<br /><small>{firstRoomCount ? `${firstRoomCount} first-floor rooms · gaps stay open` : 'No first-floor rooms yet'}</small>
              </GazeButton>}
              <GazeButton id="confirm-gen-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                onClick={() => setConfirmGenerate(false)}>← Back to map</GazeButton>
            </div>
          </div>
        </div>
      );
    }
    if (showRestoreConfirm) {
      return (
        <div className="compass-confirmation" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `4px solid ${T_info}`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>🕒</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Restore Previous Session?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.6 }}>
              This will load your last saved grid layout.
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-restore-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="deliberateAction"
                onClick={() => {
                  try {
                    const item = pickBestDraftRaw([
                      localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY),
                      localStorage.getItem(COMPASS_LAST_BACKUP_KEY),
                    ]);
                    if (item) {
                      const parsed = parseCompassDraft(item);
                      if (parsed && parsed.state) {
                        try {
                          localStorage.setItem(COMPASS_PRIMARY_BACKUP_KEY, item);
                        } catch {
                          // Ignore storage write errors.
                        }
                        dispatch({ type: 'HYDRATE_DRAFT', draft: parsed.state });
                        setFloorRefinements(readCompassFloorRefinements(parsed));
                        refinementsHydratedRef.current = true;
                        surveyProcessed.current = true;
                        onSpeak('Previous session restored.');
                      }
                    }
                  } catch (e) { }
                  setShowRestoreConfirm(false);
                }}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: T_info, border: 'none', color: T_textInverse, fontSize: '38px', fontWeight: 900, minWidth: '420px' }}>
                YES, RESTORE
              </GazeButton>
              <GazeButton id="confirm-restore-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                onClick={() => setShowRestoreConfirm(false)}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: 'transparent', border: `5px solid ${T_textDim}`, color: T_textSub, fontSize: '38px', fontWeight: 900, minWidth: '380px' }}>
                CANCEL
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }

    if (showRestartConfirm) {
      return (
        <div className="compass-confirmation" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `4px solid ${T_danger}`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>⚠️</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Restart Mapping Completely?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.6 }}>
              This will erase your current placements and let you start over<br />with new dimensions and facing.
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-restart-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="deliberateAction"
                onClick={executeRestartCompass}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: isLight ? `${T_danger}18` : isMix ? `${T_danger}26` : '#451a1a', border: `5px solid ${T_danger}`, color: T_danger, fontSize: '38px', fontWeight: 900, minWidth: '420px' }}>
                YES, RESTART
              </GazeButton>
              <GazeButton id="confirm-restart-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                onClick={() => setShowRestartConfirm(false)}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: 'transparent', border: `5px solid ${T_textDim}`, color: T_textSub, fontSize: '38px', fontWeight: 900, minWidth: '380px' }}>
                CANCEL
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // Large, stationary choices; paging retains the component queue's order.
  const renderMenu = () => {
    if (!menuOpen) return null;
    const removalP = menuConfirmRemove ? state.placements.find((p) => p.placementId === menuConfirmRemove) : null;
    const pageCount = Math.max(1, Math.ceil(state.componentQueue.length / 8));
    const page = Math.min(menuPage, pageCount - 1);
    const menuCardsEnabled = menuReady && !menuConfirmRemove;
    const changePage = (next: number) => { setMenuPage(next); setMenuReady(false); };

    return (
      <div className="compass-room-menu">
        <header className="compass-menu-header">
          <div>
            <h1>ROOM COMPONENTS</h1>
            <p><span>{state.currentFloor === 'first' ? '1ST FLOOR' : 'GROUND'}</span>
              {state.placements.length} / {state.componentQueue.length} placed</p>
          </div>
          <GazeButton id="close-menu" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            isDarkMode={!isWarm} dwellCategory="backSkipButton"
            onClick={() => { setMenuOpen(false); setMenuConfirmRemove(null); }}>✕ CLOSE</GazeButton>
        </header>
        {removalP && <div className="compass-menu-confirm" role="alert">
          <span>Remove {removalP.roomLabel}?</span>
          <GazeButton id="rm-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            isDarkMode={!isWarm} dwellCategory="deliberateAction"
            onClick={() => { dws({ type: 'REMOVE_PLACED_ROOM', placementId: menuConfirmRemove! }); setMenuConfirmRemove(null); }}>YES, REMOVE</GazeButton>
          <GazeButton id="rm-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            isDarkMode={!isWarm} dwellCategory="backSkipButton" onClick={() => setMenuConfirmRemove(null)}>CANCEL</GazeButton>
        </div>}
        <div className="compass-menu-instruction" role="status">
          <span>{menuCardsEnabled ? 'Select any room to load it for placement' : 'Click a room, or press READY to select with gaze.'}</span>
          <span>{page + 1} / {pageCount}</span>
        </div>
        <div className="compass-room-grid">
          {state.componentQueue.slice(page * 8, page * 8 + 8).map((room, offset) => {
            const idx = page * 8 + offset;
            const pl = state.placements.find(p => p.roomId === room.roomId);
            const isCurr = idx === state.currentIndex;
            const lib = ROOM_LIBRARY[room.roomId];
            return <GazeButton key={`${page}-${room.roomId}-${idx}`} id={`m-${room.roomId}-${idx}`}
              className="compass-room-choice" selected={isCurr} disabled={!!menuConfirmRemove}
              gazeEnabled={isGazeEnabled && menuCardsEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
              isDarkMode={!isWarm} dwellCategory="compassMapAction"
              onClick={() => {
                if (menuConfirmRemove) return;
                dispatch({ type: 'SELECT_ROOM', roomIndex: idx }); setMenuOpen(false);
                onSpeak(pl ? `Editing ${room.roomLabel}. Press READY, then add or remove cells.` : `Selected ${room.roomLabel}. Press READY to place.`);
              }}>
              <span className="compass-room-dot" style={{ background: lib?.color || T_accent }} aria-hidden="true" />
              <span className="compass-room-name">{room.roomLabel}</span>
              <span className="compass-room-status">
                {isCurr ? `● CURRENT ${pl ? `- ${pl.occupiedCells.length} cell${pl.occupiedCells.length === 1 ? '' : 's'}` : ''}`
                  : pl ? `✓ PLACED — ${pl.occupiedCells.length} cells` : 'UNPLACED'}
              </span>
            </GazeButton>;
          })}
        </div>
        <footer className="compass-menu-footer">
          <GazeButton id="menu-prev" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            disabled={page === 0 || !!menuConfirmRemove} isDarkMode={!isWarm} dwellCategory="backSkipButton"
            onClick={() => changePage(Math.max(0, page - 1))}>← PREVIOUS</GazeButton>
          <GazeButton id="back-map" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            isDarkMode={!isWarm} dwellCategory="backSkipButton"
            onClick={() => { setMenuOpen(false); setMenuConfirmRemove(null); }}>BACK TO MAP</GazeButton>
          <GazeButton id="menu-gaze-toggle" className="gaze-switch-card" gazeEnabled alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp}
            isDarkMode={!isWarm} dwellCategory="gazeToggle" onClick={toggleGaze} selected={isGazeEnabled}
            ariaLabel={isGazeEnabled ? 'Pause gaze' : 'Enable gaze'}>
            <GazeToggleCardFace on={isGazeEnabled} />
          </GazeButton>
          <GazeButton id="menu-ready" className="compass-primary" gazeEnabled={isGazeEnabled}
            gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode={!isWarm} dwellCategory="compassMapAction" selected={menuReady}
            onClick={() => { setMenuReady(!menuReady); onSpeak(menuReady ? 'Ready mode off.' : 'Ready. Select any room card.'); }}>READY</GazeButton>
          <GazeButton id="menu-next" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp}
            disabled={page === pageCount - 1 || !!menuConfirmRemove} isDarkMode={!isWarm} dwellCategory="backSkipButton"
            onClick={() => changePage(Math.min(pageCount - 1, page + 1))}>MORE ROOMS →</GazeButton>
        </footer>
      </div>
    );
  };

  // ─── Determine if we should show floor transition ───────
  const showFloorTransition = state.phase === 'review' && state.currentFloor === 'ground' && isMultiFloor;

  // ─── MAIN RENDER ────────────────────────────────────────

  const renderRightActionRail = () => null;

  return (
    <div data-nav-hidden={navHidden} className={`compass-screen${isLight ? ' theme-light' : ''}${isMix ? ' theme-mix' : ''}${isWarm ? ' theme-warm' : ''}`} style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: T_pageBg, display: 'flex', flexDirection: 'column', fontFamily: UI_FONT }}>
      {!menuOpen && (!navHidden || state.phase === 'foundation') && (
        <div style={{ pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto' }}>
          <GlobalNavBar
            currentPage="compass-map"
            onNavigate={onNavigate}

            isDarkMode={isDarkMode}
            compact={true}
            onRestartCompass={handleRestartCompass}
          />
        </div>
      )}
      {/* Dead zone: 30px non-interactive gap between nav bar and content — prevents accidental nav clicks when targeting top-row compass cells */}
      {!menuOpen && (!navHidden || state.phase === 'foundation') && (
        <div
          data-gaze="false"
          style={{ height: '30px', pointerEvents: 'none', flexShrink: 0 }}
        />
      )}
      {/* Floating SHOW NAV ↑ button — shown when nav is hidden, aligned with right action strip */}
      {!menuOpen && !isConfirmationOpen && navHidden && state.phase !== 'foundation' && !isFocusLocked && (
        <GazeButton
          id="nav-restore"
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode
          alwaysActive
          dwellCategory="navigationButton"
          onClick={() => { setNavHidden(false); onSpeak('Navigation restored.'); }}
          style={{
            position: 'fixed', top: '12px', right: '24px', zIndex: 100,
            width: '296px',
            minHeight: 'clamp(86px, 11vh, 120px)',
            borderRadius: '16px',
            background: T_navBtnBg,
            border: `2px solid ${T_navBtnBorder}`,
            color: T_accent,
            fontSize: 'clamp(16px, 2.2vh, 22px)',
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'clamp(6px, 1vw, 10px)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
            padding: '0 clamp(16px, 2vw, 28px)',
          }}
        >
          SHOW NAV
          <span style={{ fontSize: 'clamp(15px, 2vh, 20px)' }}>↑</span>
        </GazeButton>
      )}
      {/* Floating HIDE NAV ↓ button — shown when nav is visible, aligned with right action strip */}
      {!menuOpen && !isConfirmationOpen && !navHidden && (state.phase === 'placement' || state.phase === 'review') && (
        <GazeButton
          id="hide-nav-btn"
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode
          dwellCategory="navigationButton"
          onClick={() => { setNavHidden(true); onSpeak('Navigation hidden. Look at SHOW NAV to restore.'); }}
          style={{
            position: 'fixed', top: '175px', right: '24px', zIndex: 100,
            width: '296px',
            minHeight: 'clamp(86px, 11vh, 120px)',
            borderRadius: '16px',
            background: T_navBtnBg,
            border: `2px solid ${T_navBtnBorder}`,
            color: T_textMain,
            fontSize: 'clamp(16px, 2.2vh, 22px)',
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'clamp(6px, 1vw, 10px)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
            padding: '0 clamp(16px, 2vw, 28px)',
          }}
        >
          HIDE NAV
          <span style={{ fontSize: 'clamp(15px, 2vh, 20px)' }}>↓</span>
        </GazeButton>
      )}
      {state.phase === 'foundation' && renderFoundation()}

      {!menuOpen && (state.phase === 'placement' || (state.phase === 'review' && !showFloorTransition)) && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden', position: 'relative', pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto' }}>
          {/* LEFT: Plot Canvas + Info Overlays */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderPlotCanvas()}
            {/* Floating READY button removed - moved to Road Section */}
          </div>

          {/* RIGHT: Action Strip */}
          {renderActionStrip()}

          {/* Floating Action Rail (Right) - keep Save/Gen if they are not in the strip */}
          {renderRightActionRail()}
        </div>
      )}

      {!menuOpen && showFloorTransition && renderFloorTransition()}

      {renderMenu()}
      {renderConfirmationOverlay()}

      {/* ═══ CELL FOCUS MODE — 3-Column Layout ═══ */}
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes compass-room-toast {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          10% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          75% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.03); }
        }

        /* Tier 3 micro-animations */
        @keyframes placement-pop {
          0%   { transform: scale(0.94); filter: brightness(1.18); }
          55%  { transform: scale(1.025); filter: brightness(1.10); }
          100% { transform: scale(1);     filter: brightness(1); }
        }

        /* Smooth state transitions on grid cells — color/border changes
           glide rather than snap, giving the canvas a polished feel. */
        .cmap-cell-anim { transition: background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, opacity 220ms ease; }

      `}</style>

      {/* Room change notice belongs to the map, never above room choices. */}
      {roomToast && !menuOpen && !isConfirmationOpen && (
        <div
          key={`room-toast-${roomToast.index}`}
          style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9500,
            pointerEvents: 'none',
            animation: 'compass-room-toast 3s ease-out forwards',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: '16px',
            background: 'var(--ui-panel)',
            border: '1px solid var(--ui-border)',
            borderRadius: '20px',
            padding: 'clamp(24px, 3.5vh, 40px) clamp(36px, 5vw, 64px)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.22)',
          }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '7px',
              background: roomToast.color, flexShrink: 0,
              border: '1.5px solid rgba(255,255,255,0.25)',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{
                fontSize: 'clamp(30px, 4vh, 46px)', fontWeight: 650,
                color: 'var(--ui-ink)', letterSpacing: '0', lineHeight: 1.2,
              }}>
                {roomToast.name.toUpperCase()}
              </span>
              <span style={{
                fontSize: 'clamp(15px, 2vh, 21px)', fontWeight: 600,
                color: 'var(--ui-muted)', lineHeight: 1.3,
              }}>
                Room {roomToast.index} of {roomToast.total}
              </span>
            </div>
          </div>
        </div>
      )}

      {
        saveToast && (
          <div style={{ position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: 'var(--ui-panel)', border: '2px solid var(--ui-accent-ink)', borderRadius: '16px', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#497775', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#FFF', fontSize: '16px', fontWeight: 700 }}>✓</span></div>
            <span style={{ color: T_textMain, fontSize: '18px', fontWeight: 800 }}>Compass Map Saved!</span>
            <GazeButton id="toast-ok" gazeEnabled={isGazeEnabled} alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton" onClick={() => setSaveToast(false)}
              style={{ marginLeft: '16px', minWidth: '120px', height: '80px', background: T_cardBg, border: `2px solid ${T_panelBorderSoft}`, borderRadius: '14px', color: T_textMain, fontSize: '18px', fontWeight: 700 }}>
              OK
            </GazeButton>
          </div>
        )
      }

      {showCompassStudio && compiledPayload && (
        <CompassPlanStudio source={compiledPayload} scope={studioScope} onSpeak={onSpeak}
          onClose={() => { setShowCompassStudio(false); onSpeak('Back to Compass Map.'); }}
          onLegacyReview={() => {
            setShowCompassStudio(false);
            setShowPlanReview(true);
            void requestPlanCandidates(compiledPayload);
          }} />
      )}

      {showPlanReview && (
        <PlanReviewModal
          candidates={planCandidates}
          loading={planReviewLoading}
          error={planReviewError}
          errorDetails={planReviewErrorDetails}
          warnings={planReviewWarnings}
          onRetry={() => { if (planReviewSource) void requestPlanCandidates(planReviewSource); }}
          showOriginalOnError={planReviewErrorCode === 'unsupported_refinements'}
          onOpenOriginalPlan={planReviewSource ? () => {
            planReviewRequestId.current += 1;
            setCompiledPayload(planReviewSource);
            setViewerInitialFloor((planReviewSource as any).editor_active_floor === '1f' ? 'first' : 'ground');
            setShowPlanReview(false);
            setShowFloorPlanViewer(true);
            onSpeak('Opening the original plan with saved refinements.');
          } : undefined}
          onOpenSavedPlan={savedPlanForCurrentMap ? () => {
            planReviewRequestId.current += 1;
            setCompiledPayload(savedPlanForCurrentMap.compassData);
            setViewerInitialFloor(acceptedCompassPlan?.selectedFloor || 'ground');
            setShowPlanReview(false);
            setShowFloorPlanViewer(true);
            onSpeak('Opening your saved plan.');
          } : undefined}
          onClose={() => {
            planReviewRequestId.current += 1;
            setShowPlanReview(false);
            onSpeak('Back to Compass Map.');
          }}
          onAccept={(selected, selectedFloor) => {
            planReviewRequestId.current += 1;
            if (planReviewSource) {
              const saved: AcceptedCompassPlan = {
                sourceFingerprint: compassPlanFingerprint(planReviewSource, viewerSeedNotes),
                candidate: { ...selected, previews: {} },
                selectedFloor,
              };
              setAcceptedCompassPlan(saved);
              try { localStorage.setItem(COMPASS_ACCEPTED_PLAN_KEY, JSON.stringify(saved)); }
              catch { onSpeak('The plan is open, but this browser could not save it locally.'); }
            }
            setCompiledPayload(selected.compassData);
            setViewerInitialFloor(selectedFloor);
            setShowPlanReview(false);
            setShowFloorPlanViewer(true);
            onSpeak(`${selected.label} selected. Opening the plan viewer.`);
          }}
          onSpeak={onSpeak}
        />
      )}

      {
        showFloorPlanViewer && compiledPayload && (
          <FloorPlanViewerModal
            compassData={compiledPayload}
            initialFloor={viewerInitialFloor}
            onClose={() => setShowFloorPlanViewer(false)}
            onSpeak={onSpeak}
            surveyData={(ws.surveyData || null) as Record<string, any> | null}
            initialCustomNotes={viewerSeedNotes}
          />
        )
      }
    </div >
  );
}

function getNextRoomIndex(queue: RoomComponent[], placements: PlacementRecord[]): number {
  const placedIds = new Set(placements.map((p) => p.roomId));
  const firstUnplacedIdx = queue.findIndex((r) => !placedIds.has(r.roomId));
  return firstUnplacedIdx >= 0 ? firstUnplacedIdx : queue.length;
}

export default React.memo(CompassMapScreen);
