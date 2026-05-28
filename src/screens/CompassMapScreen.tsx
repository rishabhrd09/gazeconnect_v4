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
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { ArchitecturalCell } from '../components/ArchitecturalCell';
import { FloorPlanViewerModal } from '../components/FloorPlanViewerModal';
import {
  compileCompassPayload,
  CompassMapPayload,
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
  getContrastText,
} from '../utils/compassMath';
import { getDirectionLabels } from '../utils/compassDirections';
import { useTheme } from '../contexts/ThemeContext';
import {
  SplitDirection,
  WallEdgeType,
  AdvancedRefinements,
  CellRotation,
  CellExpansion,
} from '../types/advancedMap';
import { screenThemes, typography, lightColors } from '../utils/design';

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

interface CompassDraftPayload {
  version: number;
  state: CompassState;
  refinements?: AdvancedRefinements;
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

function parseCompassDraft(rawDraft: string): { state: CompassState, refinements?: AdvancedRefinements } | null {
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
      refinements: (parsed as CompassDraftPayload).refinements
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
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const ws = useWS();

  // ── Theme-aware tokens (drafting paper / workshop dusk) ──
  const T_pageBg = isLight ? '#EBE0CC' : isWarm ? '#F5EEDF' : isMix ? '#1A1611' : THEME.bg;
  const T_panelBg = isLight ? '#FAF5E8' : isWarm ? '#F8F1DF' : isMix ? '#241F18' : THEME.panelBg;
  const T_cardBg = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? '#2A2419' : THEME.cardBg;
  const T_panelBorder = isLight ? '#3F6864' : isWarm ? '#CBBCA9' : isMix ? 'rgba(180, 147, 98, 0.42)' : THEME.border;
  const T_panelBorderSoft = isLight ? '#D6CAB7' : isWarm ? '#DED2C2' : isMix ? 'rgba(180, 147, 98, 0.28)' : THEME.border;
  const T_textMain = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : THEME.text;
  const T_textSub = isLight ? '#76624A' : isWarm ? '#6A625B' : isMix ? '#C4B697' : THEME.textSub;
  const T_textDim = isLight ? '#7B6346' : isWarm ? '#8A7C6B' : isMix ? '#A89476' : THEME.textDim;
  const T_textInverse = isLight ? '#FBE9DE' : isWarm ? '#FBF5E5' : isMix ? '#FFFCF1' : '#FFFFFF';
  // Action accent colors
  const T_accent = isLight ? '#1F6B7E' : isWarm ? '#3F6968' : isMix ? '#5E9CA8' : THEME.accent;
  const T_accentSubtle = isLight ? 'rgba(31, 107, 126, 0.14)' : isWarm ? '#E7EEEA' : isMix ? 'rgba(94, 156, 168, 0.18)' : THEME.accentSubtle;
  const T_success = isLight ? '#3D7853' : isWarm ? '#5F7C58' : isMix ? '#5A7548' : THEME.success;
  const T_successSubtle = isLight ? 'rgba(61, 120, 83, 0.16)' : isWarm ? '#E9EFE6' : isMix ? 'rgba(90, 117, 72, 0.20)' : THEME.successSubtle;
  const T_danger = isLight ? '#8A3B38' : isWarm ? '#7A312E' : isMix ? '#9C5A53' : THEME.danger;
  const T_info = isLight ? '#1F6B7E' : isWarm ? '#3F6968' : isMix ? '#5E9CA8' : THEME.info;
  // Refine / Edit / Generate
  const T_refineModeAccent = isLight ? '#8A3B38' : isMix ? '#B49362' : '#2DD4BF';
  const T_editAccent = isLight ? '#1F6B7E' : isMix ? '#5E9CA8' : '#2DD4BF';
  const T_generatePlanBg = isLight ? '#497775' : isWarm ? '#3F6968' : isMix ? '#3A6770' : 'rgba(16,185,129,0.15)';
  const T_generatePlanBorder = isLight ? '#497775' : isWarm ? '#3F6968' : isMix ? '#5E9CA8' : '#497775';
  const T_generatePlanText = isLight ? '#FFF7EF' : isWarm ? '#FFF7EF' : isMix ? '#FFFCF1' : '#497775';
  const T_refineMapBg = isLight ? '#8A3B38' : isWarm ? '#7A312E' : isMix ? '#5A4878' : 'rgba(139,92,246,0.08)';
  const T_refineMapBorder = isLight ? '#8A3B38' : isWarm ? '#7A312E' : isMix ? '#8B7AB8' : 'rgba(139,92,246,0.3)';
  const T_refineMapText = isLight ? '#FFF7EF' : isWarm ? '#FFF7EF' : isMix ? '#FFFCF1' : '#8B5CF6';
  // Hide/show nav (currently solid black/dark) — adapt to theme
  const T_navBtnBg = isLight ? '#FAF5E8' : isMix ? '#2A2419' : THEME.panelBg;
  const T_navBtnBorder = isLight ? '#3F6864' : isMix ? 'rgba(180, 147, 98, 0.42)' : THEME.border;
  const T_overlayDim = isLight ? 'rgba(74, 58, 42, 0.55)' : isMix ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.84)';
  const T_overlayDeep = isLight ? 'rgba(74, 58, 42, 0.62)' : isMix ? 'rgba(0,0,0,0.86)' : 'rgba(0,0,0,0.92)';
  const T_subSurface = isLight ? 'rgba(168, 148, 120, 0.18)' : isMix ? 'rgba(180, 147, 98, 0.10)' : 'rgba(255,255,255,0.05)';

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
  const [showFloorPlanViewer, setShowFloorPlanViewer] = useState(false);
  const [compiledPayload, setCompiledPayload] = useState<CompassMapPayload | null>(null);
  const [foundationReady, setFoundationReady] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ cell: GridCellKey, oldRoomId: string, newRoomId: string } | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  // Compass map opens with the global NavBar hidden by default — the canvas is
  // the workspace; users press SHOW NAV when they need to navigate elsewhere.
  const [navHidden, setNavHidden] = useState(true);

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
  const [showRefinementMapBtn, setShowRefinementMapBtn] = useState(true);
  const [refinementMode, setRefinementMode] = useState(false);
  const [refinementTool, setRefinementTool] = useState<'overview' | 'split' | 'walls' | 'void' | 'rotate' | 'expand'>('overview');
  const [selectedRefinementCell, setSelectedRefinementCell] = useState<string | null>(null);
  const [refinements, setRefinements] = useState<AdvancedRefinements>({
    version: 2, subCellSplits: [], customEdges: [], voidMarkers: [],
    cellRotations: [], cellExpansions: [], cellLayouts: {},
    caregiverAnnotations: [], vastuFlags: [], accessibilityMarkers: [],
  });

  // ─── Phase 2 (Refinement) Dynamic State ─────────
  const [cellEditorOpen, setCellEditorOpen] = useState(false);
  const [cellEditorTool, setCellEditorTool] = useState<'split' | 'walls' | 'void' | 'rotate' | 'expand' | null>(null);
  // NEW: Require READY before allowing cell interaction on main map
  const [mapRefinementArmed, setMapRefinementArmed] = useState(false);
  // NEW: Require READY before allowing tool interaction inside editor
  const [refinementArmed, setRefinementArmed] = useState(false);

  // NEW: Smart Reading Cooldown
  const [readingCooldown, setReadingCooldown] = useState(false);
  const triggerReadingCooldown = useCallback(() => {
    setReadingCooldown(true);
    // 2.5 second safe-scanning period
    setTimeout(() => {
      setReadingCooldown(false);
      onSpeak('Ready.');
    }, 2500);
  }, [onSpeak]);

  // Split sub-state
  const [splitDirection, setSplitDirection] = useState<SplitDirection | null>(null);
  const [splitStep, setSplitStep] = useState<'direction' | 'roomA' | 'pctA' | 'roomB' | 'confirm'>('direction');
  const [subRoomA, setSubRoomA] = useState<string | null>(null);
  const [subRoomAPct, setSubRoomAPct] = useState<25 | 33 | 50 | 67 | 75 | null>(null);
  const [subRoomB, setSubRoomB] = useState<string | null>(null);
  // Rotate sub-state
  const [currentRotation, setCurrentRotation] = useState<0 | 90 | 180 | 270>(0);
  const [currentComboLayout, setCurrentComboLayout] = useState<'left' | 'right' | 'top' | 'bottom'>('left');
  // Wall sub-state for cell editor
  const [cellEditorWallEdge, setCellEditorWallEdge] = useState<'top' | 'right' | 'bottom' | 'left' | null>(null);
  const [splitPickingCell, setSplitPickingCell] = useState<string | null>(null);
  const [splitPickingSide, setSplitPickingSide] = useState<'A' | 'B' | null>(null);
  const [roomPage, setRoomPage] = useState(0);
  const ROOMS_PER_PAGE = 6;

  // Listen for Electron native context menu "Refinement Map" toggle
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.on) return;
    const handler = (enabled: boolean) => {
      setShowRefinementMapBtn(enabled);
      if (!enabled && refinementMode) {
        setRefinementMode(false);
        setSelectedRefinementCell(null);
        setRefinementTool('overview');
        setCellEditorOpen(false);
        setCellEditorTool(null);
      }
    };
    api.on('refinement-map-changed', handler);
    return () => { api.off?.('refinement-map-changed', handler); };
  }, [refinementMode]);

  // Human-readable zone label — replaces raw r2_c1 etc.
  const getCellZoneLabel = (cellId: string): string => {
    const rowMap: Record<string, string> = { r1: 'Front row', r2: 'Inner-front', r3: 'Inner-back', r4: 'Back row' };
    const colMap: Record<string, string> = { c1: 'Left side', c2: 'Left-center', c3: 'Right-center', c4: 'Right side' };
    const parts = cellId.split('_');
    return `${rowMap[parts[0]] || parts[0]}, ${colMap[parts[1]] || parts[1]}`;
  };
  const isConfirmationOpen = !!confirmReplace || !!confirmGenerate || showRestoreConfirm || showRestartConfirm;

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
  const currentRoomCells = currentPlacement?.occupiedCells.length || 0;
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
          if (draft.refinements) {
            setRefinements(draft.refinements);
          }
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
        refinements, // Persist refinements to state draft
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
  }, [state, refinements, surveyLoading]);

  useEffect(() => {
    if (state.phase === 'foundation') setFoundationReady(false);
  }, [state.foundationStep, state.phase]);

  useEffect(() => {
    if (menuOpen) setMenuReady(false);
  }, [menuOpen]);

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
    if (!foundationReady) {
      onSpeak('Press READY first, then choose an option.');
      return;
    }
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
  }, [foundationReady, state.foundationStep, state.foundation.numFloors, onSpeak]);

  // ── Save Handler ────────────────────────────────────────
  const handleSave = useCallback(() => {
    const mkPlacements = (pl: PlacementRecord[]) => pl.map((p) => ({
      room: p.roomLabel, roomId: p.roomId, cells: p.occupiedCells,
      coords: cellsToBoundingRect(p.occupiedCells, pw, pd),
      cellRects: Object.fromEntries(p.occupiedCells.map((c: GridCellKey) => [c, cellToRect(c, pw, pd)])),
      area_sqft: (() => { const r = cellsToBoundingRect(p.occupiedCells, pw, pd); return Math.round((r.x2 - r.x1) * (r.y2 - r.y1)); })(),
    }));

    const payload: any = {
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

    const existing = surveyDataRef.current || {};
    saveSurveyRef.current?.({ ...existing, compass_map: payload, source: 'compass-map-manual' });
    if (typeof snapshotSurveyRef.current === 'function') {
      snapshotSurveyRef.current({ ...existing, compass_map: payload, source: 'compass-map-manual' });
    }
    onSpeak(`Compass Map saved. ${state.placements.length} rooms placed.`);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 5000);
  }, [state, pw, pd, cellWFt, cellDFt, coveragePercent, facing, onSpeak, refinements]);

  // ── Autosave: silently save after each placement change ───
  const placementCount = state.placements.length;
  const autosavePhase = state.phase;
  useEffect(() => {
    if (placementCount === 0) return;
    if (autosavePhase !== 'placement' && autosavePhase !== 'review') return;
    // Debounce and save only when there is meaningful new layout data.
    const t = setTimeout(() => {
      const mkPlacements = (pl: PlacementRecord[]) => pl.map((p) => ({
        room: p.roomLabel, roomId: p.roomId, cells: p.occupiedCells,
        coords: cellsToBoundingRect(p.occupiedCells, pw, pd),
        cellRects: Object.fromEntries(p.occupiedCells.map((c: GridCellKey) => [c, cellToRect(c, pw, pd)])),
        area_sqft: (() => { const r = cellsToBoundingRect(p.occupiedCells, pw, pd); return Math.round((r.x2 - r.x1) * (r.y2 - r.y1)); })(),
      }));
      const payload: any = {
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
  }, [placementCount, autosavePhase, state, pw, pd, cellWFt, cellDFt, coveragePercent, facing, refinements]);

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
    setRefinements({
      version: 2,
      subCellSplits: [],
      customEdges: [],
      voidMarkers: [],
      cellRotations: [],
      cellExpansions: [],
      cellLayouts: {},
      caregiverAnnotations: [],
      vastuFlags: [],
      accessibilityMarkers: [],
    });
    setSelectedRefinementCell(null);
    setRefinementMode(false);
    setMapRefinementArmed(false);
    setRefinementTool('overview');
    setCellEditorOpen(false);
    setCellEditorTool(null);
    setRefinementArmed(false);
    setFoundationReady(false);
    setShowRestartConfirm(false);
    onSpeak('Map reset. Please answer the foundation questions again.');
  }, [initialQueue, onSpeak]);

  // Generate floor plan payload and open renderer modal.
  const handleGenerateFloorPlan = useCallback(() => {
    const payload = compileCompassPayload(
      state.foundation,
      state.placements.map((p) => ({
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
    setCompiledPayload({ ...payload, advanced_refinements: refinements } as any);
    setShowFloorPlanViewer(true);
    onSpeak('Generating architectural floor plan...');
  }, [state, pw, pd, coveragePercent, onSpeak, refinements]);

  // ── Refinement Handlers ────────────────────────────────

  // Check if a cell has any advanced refinement applied
  const hasAnyRefinement = useCallback((cellId: string): boolean => {
    return refinements.subCellSplits.some(s => s.parentCell === cellId) ||
      refinements.customEdges.some(e => e.cells[0] === cellId) ||
      refinements.voidMarkers.some(v => v.cell === cellId) ||
      (refinements.cellRotations || []).some(r => r.cell === cellId) ||
      (refinements.cellExpansions || []).some(x => x.cell === cellId);
  }, [refinements]);

  // ─── INTERACTION HANDLERS ────────────────────────────────
  const handleCellClick = useCallback((cellKey: string) => {
    if (!state.armed && state.phase === 'placement') return;
    if (state.phase === 'placement') {
      dws({ type: 'PLACE_ROOM', cell: cellKey as GridCellKey });
    } else if (state.phase === 'review' || state.phase === 'floor_transition') {
      if (!mapRefinementArmed) return; // Must look at READY first

      const gcs = state.grid[cellKey as GridCellKey];
      if (gcs?.roomId) {
        setSelectedRefinementCell(cellKey);
        setCellEditorOpen(true);
        setCellEditorTool(null);
        setRefinementArmed(false); // Reset arming when opening a new cell
        setMapRefinementArmed(false); // Reset map armed state for when they return
        setSplitDirection(null);
        setSplitStep('direction');
        setSubRoomA(null);
        setRoomPage(0);

        // Let the system finish narrating 'Options for [Room]'
        onSpeak(`Options for ${ROOM_LIBRARY[gcs.roomId]?.roomLabel || cellKey}.`);
      }
    }
  }, [state, dws, onSpeak, lastEnabledTimestamp]); // Added lastEnabledTimestamp to dependencies

  // ---------- SPLIT (cell editor flow) ----------
  const openSplitOverlay = useCallback(() => {
    if (!selectedRefinementCell) { onSpeak('Select a cell first.'); return; }
    // Load existing split if editing
    const existing = refinements.subCellSplits.find(s => s.parentCell === selectedRefinementCell);
    if (existing) {
      setSplitDirection(existing.splitDirection);
      setSubRoomA(existing.roomA);
      setSubRoomAPct((existing.roomAPct || 50) as 25 | 33 | 50 | 67 | 75);
      setSplitStep('direction');
    } else {
      setCellEditorTool('split');
      setSplitStep('direction');
      setSplitDirection(null);
      setSubRoomA(null);
      setSubRoomB(null);
      setSubRoomAPct(null);
      setRoomPage(0);
    }
  }, [selectedRefinementCell, refinements.subCellSplits]);

  const resetSplitOverlay = useCallback(() => {
    setCellEditorTool(null);
    setSplitDirection(null);
    setSplitStep('direction');
    setSubRoomA(null);
    setSubRoomB(null);
    setSubRoomAPct(null);
  }, []);

  const confirmSplitFull = useCallback((roomB: string) => {
    if (!selectedRefinementCell || !splitDirection || !subRoomA) return;
    setRefinements(prev => {
      const cellKey = selectedRefinementCell;
      return {
        ...prev,
        subCellSplits: [
          ...(prev.subCellSplits || []).filter((s: any) => s.parentCell !== cellKey),
          {
            parentCell: cellKey,
            splitDirection: splitDirection!,
            roomA: subRoomA!,
            roomB: subRoomB!,
            roomAPct: subRoomAPct || 50,
            roomBPct: 100 - (subRoomAPct || 50),
          },
        ],
      };
    });
    onSpeak(`Split complete. ${ROOM_LIBRARY[subRoomA]?.shortLabel || subRoomA} ${subRoomAPct || 50}%, ${ROOM_LIBRARY[roomB]?.shortLabel || roomB} ${100 - (subRoomAPct || 50)}%. Returning to map.`);
    resetSplitOverlay();
    setCellEditorOpen(false);
    setMapRefinementArmed(false);
  }, [selectedRefinementCell, splitDirection, subRoomA, subRoomAPct, onSpeak, resetSplitOverlay, subRoomB]);

  // Old inline split (still used by V-SPLIT/H-SPLIT sub-buttons)
  const handleSplit = useCallback((direction: SplitDirection) => {
    if (!selectedRefinementCell) return;
    const cellRoom = state.grid[selectedRefinementCell]?.roomId;
    const defaultA = cellRoom || 'main';
    setRefinements(prev => ({
      ...prev,
      subCellSplits: [
        ...prev.subCellSplits.filter(s => s.parentCell !== selectedRefinementCell),
        { parentCell: selectedRefinementCell, splitDirection: direction, roomA: defaultA, roomB: 'secondary', roomAPct: 50, roomBPct: 50 },
      ],
    }));
    onSpeak(`Cell split ${direction}ly. Assign rooms to each half.`);
    setSplitPickingCell(selectedRefinementCell);
    setSplitPickingSide('A');
  }, [selectedRefinementCell, state.grid, onSpeak]);

  const [wallEdge, setWallEdge] = useState<'top' | 'right' | 'bottom' | 'left'>('right');

  const handleWall = useCallback((wallType: WallEdgeType) => {
    if (!selectedRefinementCell) return;
    const edgeId = `edge_${selectedRefinementCell}_${wallEdge}`;
    setRefinements(prev => ({
      ...prev,
      customEdges: [
        ...prev.customEdges.filter(e => e.id !== edgeId),
        { id: edgeId, boundary: [selectedRefinementCell, wallEdge], cells: [selectedRefinementCell, selectedRefinementCell], type: wallType },
      ],
    }));
    const typeLabel = wallType.replace(/_/g, ' ');
    onSpeak(`${typeLabel} set on ${wallEdge} edge`);
    if (!cellEditorOpen) setSelectedRefinementCell(null);
  }, [selectedRefinementCell, wallEdge, onSpeak]);

  const handleVoid = useCallback(() => {
    if (!selectedRefinementCell) return;
    setRefinements(prev => {
      const existing = prev.voidMarkers.find(v => v.cell === selectedRefinementCell);
      if (existing) {
        return { ...prev, voidMarkers: prev.voidMarkers.filter(v => v.cell !== selectedRefinementCell) };
      }
      return { ...prev, voidMarkers: [...prev.voidMarkers, { cell: selectedRefinementCell, type: 'open_to_below' }] };
    });
    onSpeak('Void marker toggled');
    if (!cellEditorOpen) setSelectedRefinementCell(null);
  }, [selectedRefinementCell, onSpeak]);

  const handleSplitRoomAssign = useCallback((roomId: string) => {
    if (!splitPickingCell || !splitPickingSide) return;
    setRefinements(prev => ({
      ...prev,
      subCellSplits: prev.subCellSplits.map(s =>
        s.parentCell === splitPickingCell
          ? { ...s, [splitPickingSide === 'A' ? 'roomA' : 'roomB']: roomId }
          : s
      ),
    }));
    if (splitPickingSide === 'A') {
      setSplitPickingSide('B');
      onSpeak(`Room A set to ${ROOM_LIBRARY[roomId]?.shortLabel || roomId}. Now pick Room B.`);
    } else {
      setSplitPickingCell(null);
      setSplitPickingSide(null);
      onSpeak(`Room B set to ${ROOM_LIBRARY[roomId]?.shortLabel || roomId}. Split complete.`);
    }
  }, [splitPickingCell, splitPickingSide, onSpeak]);

  // ---------- ROTATE ----------
  const openRotateOverlay = useCallback(() => {
    if (!selectedRefinementCell) { onSpeak('Select a cell first.'); return; }
    const roomId = state.grid[selectedRefinementCell]?.roomId;
    if (roomId === 'staircase' || roomId === 'diningStaircase') {
      const layout = (refinements.cellLayouts || {})[selectedRefinementCell] || 'right';
      setCurrentComboLayout(layout);
      setCellEditorTool('rotate');
      onSpeak('Choose stairs layout for this cell.');
      return;
    }
    const existing = (refinements.cellRotations || []).find(r => r.cell === selectedRefinementCell);
    setCurrentRotation(existing?.degrees || 0);
    setCellEditorTool('rotate');
    onSpeak('Rotate the room assignment within this cell.');
  }, [selectedRefinementCell, refinements.cellRotations, refinements.cellLayouts, state.grid, onSpeak]);

  const confirmRotation = useCallback(() => {
    if (!selectedRefinementCell) return;
    const roomId = state.grid[selectedRefinementCell]?.roomId;
    if (roomId === 'staircase' || roomId === 'diningStaircase') {
      setRefinements(prev => ({
        ...prev,
        cellLayouts: {
          ...(prev.cellLayouts || {}),
          [selectedRefinementCell]: currentComboLayout,
        },
      }));
      onSpeak(`Stairs layout set to ${currentComboLayout}.`);
    } else {
      setRefinements(prev => ({
        ...prev,
        cellRotations: [
          ...(prev.cellRotations || []).filter(r => r.cell !== selectedRefinementCell),
          { cell: selectedRefinementCell, degrees: currentRotation },
        ],
      }));
      onSpeak(`Rotation set to ${currentRotation}°.`);
    }
    setCellEditorTool(null);
  }, [selectedRefinementCell, currentRotation, currentComboLayout, state.grid, onSpeak]);

  // ---------- EXPAND ----------
  const openExpandOverlay = useCallback(() => {
    if (!selectedRefinementCell) { onSpeak('Select a cell first.'); return; }
    if (!state.grid[selectedRefinementCell]?.roomId) { onSpeak('This cell is empty. Place a room first.'); return; }
    setCellEditorTool('expand');
    onSpeak('Choose a direction to expand this room into.');
  }, [selectedRefinementCell, state.grid, onSpeak]);

  const getAdjacentCell = useCallback((cellId: string, dir: 'up' | 'down' | 'left' | 'right'): string | null => {
    const { row, col } = parseCellKey(cellId as GridCellKey);
    const nr = dir === 'up' ? row - 1 : dir === 'down' ? row + 1 : row;
    const nc = dir === 'left' ? col - 1 : dir === 'right' ? col + 1 : col;
    if (nr < 1 || nr > GRID_ROWS || nc < 1 || nc > GRID_COLS) return null;
    return buildCellKey(nr, nc);
  }, []);

  const canExpandDir = useCallback((dir: 'up' | 'down' | 'left' | 'right'): boolean => {
    if (!selectedRefinementCell) return false;
    const adj = getAdjacentCell(selectedRefinementCell, dir);
    if (!adj) return false;
    return !state.grid[adj]?.roomId; // must be empty
  }, [selectedRefinementCell, getAdjacentCell, state.grid]);

  const confirmExpand = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (!selectedRefinementCell) return;
    const targetCell = getAdjacentCell(selectedRefinementCell, dir);
    if (!targetCell) return;
    const roomId = state.grid[selectedRefinementCell]?.roomId;
    if (!roomId) return;
    // Place the same room into the adjacent cell
    const newGrid = { ...state.grid };
    const existingPlacement = state.placements.find(p => p.roomId === roomId);
    const placementId = existingPlacement?.placementId || `p_expand_${Date.now()}_${roomId}`;
    newGrid[targetCell] = { roomId, anchorPlacementId: placementId, isExpandedChild: true };
    // Also track in refinements
    setRefinements(prev => ({
      ...prev,
      cellExpansions: [
        ...(prev.cellExpansions || []).filter(x => !(x.cell === selectedRefinementCell && x.direction === dir)),
        { cell: selectedRefinementCell, direction: dir, targetCell },
      ],
    }));
    // Update grid via dispatch — place room into targetCell
    dispatch({ type: 'PLACE_ROOM', cell: targetCell as GridCellKey });
    onSpeak(`Room expanded ${dir}. Cell ${targetCell} now shares the same room.`);
    setCellEditorTool(null);
  }, [selectedRefinementCell, getAdjacentCell, state.grid, state.placements, onSpeak]);

  // ---------- RESET ALL REFINEMENTS on a cell ----------
  const resetCellRefinements = useCallback(() => {
    if (!selectedRefinementCell) return;
    const cell = selectedRefinementCell;
    setRefinements(prev => ({
      ...prev,
      subCellSplits: prev.subCellSplits.filter(s => s.parentCell !== cell),
      customEdges: prev.customEdges.filter(e => !e.id.includes(cell)),
      voidMarkers: prev.voidMarkers.filter(v => v.cell !== cell),
      cellRotations: (prev.cellRotations || []).filter(r => r.cell !== cell),
      cellExpansions: (prev.cellExpansions || []).filter(x => x.cell !== cell),
      cellLayouts: (() => { const newLayoutMap = { ...prev.cellLayouts }; delete newLayoutMap[cell]; return newLayoutMap; })(),
    }));
    const roomLabel = ROOM_LIBRARY[state.grid[cell]?.roomId || '']?.shortLabel || 'this cell';
    onSpeak(`All refinements removed from ${roomLabel}.`);
    setCellEditorTool(null);
  }, [selectedRefinementCell, state.grid, onSpeak]);

  // ── Hydrate refinements from survey data on mount ──────
  useEffect(() => {
    const compassMap = (ws.surveyData as any)?.compass_map;
    if (compassMap?.advanced_refinements) {
      setRefinements(compassMap.advanced_refinements);
    }
  }, [ws.surveyData]);

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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* LEFT: Question */}
        <div style={{ width: 'clamp(220px, 24%, 380px)', flexShrink: 0, borderRight: `1px solid ${T_panelBorderSoft}`, display: 'flex', flexDirection: 'column', padding: 'clamp(18px, 3vh, 36px) clamp(16px, 1.8vw, 28px)', overflowY: 'auto', background: T_panelBg }}>
          <div style={{ fontSize: 'clamp(15px, 1.9vh, 21px)', fontWeight: 800, color: T_accent, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 'clamp(10px, 1.5vh, 18px)' }}>FOUNDATION</div>
          <div style={{ fontSize: 'clamp(20px, 2.8vh, 30px)', fontWeight: 700, lineHeight: 1.35, color: T_textMain, marginBottom: 'clamp(8px, 1vh, 14px)' }}>{q.text}</div>
          {q.subtext && <div style={{ fontSize: 'clamp(14px, 1.7vh, 19px)', color: T_textSub, lineHeight: 1.5 }}>{q.subtext}</div>}
          <div style={{ fontSize: 'clamp(13px, 1.5vh, 17px)', color: T_textDim, marginTop: 'auto', paddingTop: '12px' }}>Question {stepNum} of {FOUNDATION_QUESTIONS.length}</div>
        </div>
        {/* RIGHT: Options + Command Bar */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(18px, 3vh, 36px) clamp(20px, 2.5vw, 40px)', paddingBottom: 'clamp(280px, 36vh, 400px)' }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'clamp(14px, 1.8vh, 24px)',
              justifyContent: q.options.length <= 4 ? 'center' : 'flex-start',
              alignContent: 'flex-start',
            }}>
              {q.options.map((opt) => {
                // Match the large FloorPlanSurveyScreen card sizing — taller,
                // bolder, more breathing room. 4-or-fewer-options gets portrait
                // cards (compass-direction question); more options use shorter cards.
                const isFewOptions = q.options.length <= 4;
                return (
                  <GazeButton key={opt} id={`fq-${state.foundationStep}-${opt}`} gazeEnabled={isGazeEnabled && foundationReady} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                    onClick={() => handleFoundationAnswer(opt)}
                    style={{
                      flexBasis: q.columns === 2 ? 'calc(50% - 12px)' : 'calc(33.33% - 16px)',
                      minWidth: '160px',
                      minHeight: isFewOptions ? 'clamp(140px, 19vh, 200px)' : 'clamp(86px, 12vh, 132px)',
                      padding: isFewOptions ? 'clamp(28px, 4vh, 48px) clamp(20px, 2.2vw, 32px)' : 'clamp(22px, 3vh, 36px) clamp(20px, 2.2vw, 32px)',
                      borderRadius: '18px',
                      background: foundationReady ? T_cardBg : (isLight ? 'rgba(168, 148, 120, 0.10)' : isMix ? 'rgba(180, 147, 98, 0.06)' : 'rgba(30,41,59,0.45)'),
                      border: foundationReady
                        ? (isLight ? `1.5px solid ${lightColors.border.main}` : isMix ? `2px solid ${T_panelBorderSoft}` : `2px solid ${T_panelBorderSoft}`)
                        : `2px solid ${isLight ? 'rgba(168, 148, 120, 0.25)' : isMix ? 'rgba(180, 147, 98, 0.20)' : 'rgba(100,116,139,0.25)'}`,
                      color: foundationReady ? T_textMain : T_textDim,
                      fontSize: 'clamp(24px, 3.1vh, 34px)',
                      fontWeight: 700,
                      letterSpacing: '0.3px',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isLight ? '0 4px 12px rgba(82, 66, 45, 0.08)' : 'none',
                    }}>
                    {opt}
                  </GazeButton>
                );
              })}
            </div>
          </div>
          {/* Fade overlay above the command bar — masks any cards scrolling
              behind so they never bleed into the action zone. Mirrors the
              pattern used in the large FloorPlanSurveyScreen. */}
          <div style={{
            position: 'absolute',
            left: 0, right: 0, bottom: 0,
            height: 'clamp(220px, 28vh, 320px)',
            pointerEvents: 'none',
            zIndex: 9,
            background: isLight
              ? `linear-gradient(180deg, ${lightColors.background.primary}00 0%, ${lightColors.background.primary}d8 28%, ${lightColors.background.primary} 60%, ${lightColors.background.primary} 100%)`
              : isMix
                ? `linear-gradient(180deg, ${T_pageBg}00 0%, ${T_pageBg}cc 28%, ${T_pageBg} 60%, ${T_pageBg} 100%)`
                : `linear-gradient(180deg, ${T_pageBg}00 0%, ${T_pageBg}cc 28%, ${T_pageBg} 60%, ${T_pageBg} 100%)`,
          }} />

          {/* Command bar — fixed at right-column bottom with solid backdrop
              and a subtle horizontal divider above the buttons (matches the
              large survey's polished shelf style). */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            zIndex: 10,
            background: isLight ? lightColors.background.primary : T_pageBg,
            paddingBottom: 'clamp(28px, 4vh, 52px)',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          }}>
            {/* Subtle horizontal divider line */}
            <div style={{
              height: '1px',
              width: 'min(94%, 1300px)',
              margin: '0 auto',
              marginBottom: 'clamp(14px, 2vh, 22px)',
              background: isLight
                ? 'linear-gradient(90deg, rgba(82, 66, 45, 0) 0%, rgba(82, 66, 45, 0.28) 25%, rgba(82, 66, 45, 0.28) 75%, rgba(82, 66, 45, 0) 100%)'
                : 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 25%, rgba(255,255,255,0.16) 75%, rgba(255,255,255,0) 100%)',
            }} />
            <div style={{
              display: 'flex', flexWrap: 'wrap',
              justifyContent: 'center', alignItems: 'center',
              columnGap: 'clamp(30px, 4vw, 56px)',
              rowGap: 'clamp(18px, 2.4vh, 28px)',
              padding: '0 clamp(20px, 2.5vw, 40px)',
            }}>
            {!foundationReady && (
              <>
                <GazeButton id="f-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                  onClick={() => { setFoundationReady(true); onSpeak('Ready. Please choose an option.'); }}
                  style={{ padding: 'clamp(16px, 2.4vh, 26px) clamp(38px, 4.4vw, 62px)', minHeight: 'clamp(84px, 11.5vh, 118px)', minWidth: 'clamp(240px, 24vw, 350px)', borderRadius: '20px', fontSize: 'clamp(26px, 3.4vh, 36px)', fontWeight: 900, letterSpacing: '0.5px', background: T_accentSubtle, border: `3px solid ${T_accent}`, color: T_accent }}>
                  READY
                </GazeButton>
                {!showRestoreConfirm && (
                  !!localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY)
                  || !!localStorage.getItem(COMPASS_LAST_BACKUP_KEY)
                ) && (
                  <GazeButton id="f-restore" gazeEnabled={isGazeEnabled && !isConfirmationOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                    onClick={() => setShowRestoreConfirm(true)}
                    style={{ padding: 'clamp(16px, 2.4vh, 26px) clamp(32px, 4vw, 56px)', minHeight: 'clamp(84px, 11.5vh, 118px)', minWidth: 'clamp(320px, 34vw, 460px)', borderRadius: '20px', fontSize: 'clamp(24px, 3.1vh, 34px)', lineHeight: 1.1, textAlign: 'center', fontWeight: 900, background: T_cardBg, border: `3px solid ${T_info}`, color: T_info }}>
                    LOAD PREVIOUS SESSION
                  </GazeButton>
                )}
              </>
            )}
            {foundationReady && (
              <div style={{ fontSize: 'clamp(19px, 2.4vh, 26px)', color: T_accent, fontWeight: 800, padding: '10px 18px' }}>
                Select an option
              </div>
            )}
            {state.foundationStep > 0 && (
              <GazeButton id="f-back" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton" onClick={() => dispatch({ type: 'FOUNDATION_BACK' })}
                style={{ padding: 'clamp(14px, 2.1vh, 22px) clamp(34px, 3.8vw, 54px)', minHeight: 'clamp(78px, 10.6vh, 108px)', minWidth: 'clamp(200px, 20vw, 290px)', borderRadius: '20px', fontSize: 'clamp(24px, 3.1vh, 32px)', fontWeight: 800, background: T_cardBg, border: `3px solid ${T_panelBorderSoft}`, color: T_textSub }}>
                {'\u2190'} BACK
              </GazeButton>
            )}
            <GazeButton id="f-skip" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
              onClick={() => { const dflt = q.parse ? q.parse(q.options[0]) : q.options[0]; dispatch({ type: 'SET_FOUNDATION', key: q.key as FoundationKey, value: dflt }); onSpeak(`Skipped. Default: ${q.options[0]}.`); if (state.foundationStep === FOUNDATION_QUESTIONS.length - 1) dispatch({ type: 'COMPLETE_FOUNDATION', queue: generateGFQueue(), numFloors: state.foundation.numFloors || 'Single Floor' }); }}
              style={{ padding: 'clamp(14px, 2.1vh, 22px) clamp(34px, 3.8vw, 54px)', minHeight: 'clamp(78px, 10.6vh, 108px)', minWidth: 'clamp(200px, 20vw, 290px)', borderRadius: '20px', fontSize: 'clamp(24px, 3.1vh, 32px)', fontWeight: 800, background: T_cardBg, border: `3px solid ${T_panelBorderSoft}`, color: T_textSub }}>
              SKIP {'\u2192'}
            </GazeButton>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── RENDER: Vertical CAD Sidebar — all controls stacked ──

  // Context overlay removed — room name now displayed on the road section


  // ─── RENDER: Floor Controls Overlay (Top-Right) ────────────
  const renderFloorControlsOverlay = () => null;

  // ─── RENDER: Right Action Strip (The "Connected Column") ───
  const renderActionStrip = () => {
    const controlsUnlocked = !!currentRoom && state.phase === 'placement' && state.armed && !state.pendingExpansion;
    const canUndo = state.history.length > 0 || (state.phase === 'placement' && !!currentRoom);

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
      <div style={{
        position: 'absolute',
        right: '24px',
        // Dynamic top — tighter when nav is visible. HIDE NAV ends at ~295;
        // strip now starts at 304 (only ~9px below HIDE NAV instead of ~21px),
        // reclaiming vertical space so each button can be taller.
        top: navHidden ? '152px' : '304px',
        // Reduced bottom gutter (was 32px → now 20px) — gives the strip
        // more vertical room which flex-distributes into each button.
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
        <div key={refinementMode ? 'mode-refine' : 'mode-place'} className="cmap-mode-fade" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {refinementMode ? (
          <>
            {/* REFINEMENT MODE — 3-button layout (no dedicated EXIT) */}
            <GazeButton id="strip-open-editor" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (!selectedRefinementCell) { onSpeak('Select a cell first.'); return; }
                setCellEditorOpen(true); setCellEditorTool(null); onSpeak('Cell editor opened. Choose a tool.');
              }}
              style={{
                ...stripBtnStyle(!!selectedRefinementCell, isLight ? 'rgba(122, 54, 58, 0.14)' : isMix ? 'rgba(180, 147, 98, 0.18)' : 'rgba(45,212,191,0.2)'),
                color: selectedRefinementCell ? T_editAccent : T_textDim,
                minHeight: '132px',
              }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.2px', color: selectedRefinementCell ? T_refineModeAccent : T_textDim, fontVariantNumeric: 'tabular-nums' }}>REFINE MODE</div>
              <div style={{ fontSize: '24px' }}>{'🛠'}</div>
              <div style={{ fontSize: 'clamp(18px, 2.1vh, 22px)', fontWeight: 900, letterSpacing: '0.8px' }}>{selectedRefinementCell ? 'OPEN EDITOR' : 'EDIT'}</div>
              {!selectedRefinementCell && <div style={{ fontSize: '14px', color: T_editAccent, fontWeight: 700, letterSpacing: '0.5px', marginTop: '4px', fontStyle: 'italic' }}>{'👁 select a cell'}</div>}
            </GazeButton>

            {/* GENERATE REFINED PLAN — always available in refinement mode */}
            <GazeButton id="strip-generate-refined" gazeEnabled={isGazeEnabled && state.placements.length >= 1 && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (state.placements.length < 1) { onSpeak('Place at least 1 room first.'); return; }
                handleGenerateFloorPlan();
              }}
              style={{
                ...stripBtnStyle(state.placements.length >= 1, T_generatePlanBg),
                color: state.placements.length >= 1
                  ? (isLight ? T_textInverse : isMix ? T_textInverse : '#497775')
                  : T_textDim,
                minHeight: '132px',
              }}>
              <div style={{ fontSize: 'clamp(24px, 2.8vh, 30px)' }}>{'📐'}</div>
              <div style={{ textAlign: 'center', lineHeight: 1.1, fontSize: 'clamp(18px, 2.1vh, 22px)', fontWeight: 900, letterSpacing: '0.8px' }}>GENERATE{'\n'}PLAN</div>
            </GazeButton>
          </>
        ) : (
          <>
            {/* NORMAL PLACEMENT BUTTONS */}
            {/* BUTTON 0: FLOOR TOGGLE */}
            <GazeButton id="strip-floor" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (isConfirmationOpen) return;
                if (isMultiFloor) {
                  const next = state.currentFloor === 'ground' ? 'first' : 'ground';
                  dispatch({ type: 'SWITCH_FLOOR', floor: next });
                  onSpeak(`Switched to ${next} floor.`);
                } else {
                  dws({ type: 'SET_NUM_FLOORS', value: 'Multi-Floor' });
                  onSpeak('First floor mapping enabled.');
                }
              }}
              style={stripBtnStyle(true, isLight ? `${T_accent}1A` : isMix ? `${T_accent}1A` : (state.currentFloor === 'ground' ? 'rgba(45,212,191,0.1)' : 'rgba(100,181,246,0.1)'))}>
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
                  ...stripBtnStyle(controlsUnlocked, isLight ? `${T_accent}1A` : isMix ? `${T_accent}1A` : 'rgba(45,212,191,0.1)'),
                  color: controlsUnlocked
                    ? (isLight ? T_accent : isMix ? '#5E9CA8' : '#2DD4BF')
                    : (isLight ? T_textDim : isMix ? T_textDim : '#475569')
                }}>
                <div style={{ fontSize: 'clamp(28px, 3.4vh, 36px)' }}>{'→'}</div>
                <div style={{ fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900, letterSpacing: '1px' }}>NEXT</div>
              </GazeButton>
            )}

            {/* BUTTON 3: GENERATE */}
            <GazeButton id="strip-generate" gazeEnabled={isGazeEnabled && controlsUnlocked && state.placements.length >= 2 && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (isConfirmationOpen) return;
                if (!controlsUnlocked) { onSpeak('Press READY first.'); return; }
                if (state.placements.length < 2) { onSpeak('Place at least 2 rooms.'); return; }
                setConfirmGenerate(true);
                onSpeak('Do you really want to generate the floor plan?');
              }}
              style={{
                ...stripBtnStyle(controlsUnlocked && state.placements.length >= 2, T_generatePlanBg),
                borderBottom: 'none',
                color: (controlsUnlocked && state.placements.length >= 2)
                  ? (isLight ? T_textInverse : isMix ? T_textInverse : '#497775')
                  : T_textDim,
              }}>
              <div style={{ fontSize: 'clamp(24px, 2.8vh, 30px)' }}>{'📝'}</div>
              <div style={{ textAlign: 'center', lineHeight: 1.1, fontSize: 'clamp(18px, 2.1vh, 22px)', fontWeight: 900, letterSpacing: '0.8px' }}>GENERATE{'\n'}PLAN</div>
            </GazeButton>
          </>
        )}

        {/* BUTTON 4: REFINE MAP — toggles inline refinement mode */}
        {showRefinementMapBtn && (
          <GazeButton
            id="strip-refine-map"
            gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen}
            gazeEnabledTimestamp={lastEnabledTimestamp}
            isDarkMode
            dwellCategory="compassMapAction"
            onClick={() => {
              if (refinementMode) {
                setRefinementMode(false);
                setSelectedRefinementCell(null);
                setRefinementTool('overview');
                setCellEditorOpen(false);
                setCellEditorTool(null);
                onSpeak('Refinement off.');
              } else {
                setRefinementMode(true);
                onSpeak('Refinement mode. Select a cell.');
              }
            }}
            style={{
              ...stripBtnStyle(refinementMode),
              color: (isLight || isMix) ? T_refineMapText : (refinementMode ? T_refineMapText : T_refineMapBorder),
              border: refinementMode ? `2px solid ${T_refineMapBorder}` : `1px solid ${T_refineMapBorder}55`,
              background: refinementMode ? T_refineMapBg : (isLight ? `${T_refineMapBg}` : isMix ? `${T_refineMapBg}` : 'rgba(139,92,246,0.08)'),
              borderBottom: 'none',
            }}
          >
            <div style={{ fontSize: 'clamp(22px, 2.6vh, 28px)' }}>{'✂'}</div>
            <span style={{ fontSize: 'clamp(18px, 2.1vh, 22px)', fontWeight: 900, letterSpacing: '0.8px' }}>REFINE MAP</span>
          </GazeButton>
        )}
        </div>
      </div>
    );
  };

  // ─── RENDER: Architectural Plot Canvas (Left Main) ─────────
  // Layout: White Blueprint Style, Flush to Road, Zero Gaps
  const renderPlotCanvas = () => (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, // Fill available space
      position: 'relative',
      overflow: 'hidden',
      // Top: push grid down ~24px from top NavBar.
      // Bottom: minimal gutter so road hugs viewport bottom (~20px).
      // Right: 360px reserves space for the 296px sidebar + 24px right inset + ~40px gap.
      padding: '24px 360px 20px 40px',
      pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto',
    }}>

      {/* =========================================================
            MAP REFINEMENT READY GATE
            Blocks grid clicking until user is ready
        ========================================================= */}
      {!mapRefinementArmed && (state.phase === 'review' || state.phase === 'floor_transition') && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T_overlayDim }}>
          <div style={{ background: T_panelBg, padding: '40px 60px', borderRadius: '24px', border: `2px solid ${T_panelBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: T_textSub, textAlign: 'center', maxWidth: 400 }}>
              Look at READY to select a room for refinement.
            </div>
            <GazeButton id="map-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => { setMapRefinementArmed(true); onSpeak('Select a room to refine.'); }}
              style={{ width: '280px', height: '140px', borderRadius: '24px', background: T_successSubtle, border: `4px solid ${T_accent}`, color: T_accent, fontSize: '32px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px rgba(0,0,0,0.18)' }}>
              READY
            </GazeButton>
          </div>
        </div>
      )}

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
        <div style={{
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
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
            padding: '4px 16px', borderRadius: '0 0 10px 10px',
            background: isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328',
            color: isLight ? '#FAF5E8' : isMix ? '#FFFCF1' : '#ECEDE3',
            fontSize: 'clamp(12px, 1.4vh, 15px)', fontWeight: 800, letterSpacing: '1px',
            fontVariantNumeric: 'tabular-nums',
            boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
            pointerEvents: 'none', userSelect: 'none',
          }}>BACK &middot; {backDir.toUpperCase()}</div>
          <div style={{
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
          <div style={{
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
          <div style={{
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

              const cellGaze = refinementMode
                ? isGazeEnabled && !isConfirmationOpen && !menuOpen
                : isExpTarget
                  ? isGazeEnabled && expansionReady && !isConfirmationOpen && !menuOpen
                  : isGazeEnabled && state.phase === 'placement' && state.armed && !state.pendingExpansion && !!currentRoom && !isConfirmationOpen && !menuOpen;

              const getNeighborRoom = (r: number, c: number): string | null => {
                if (r < 1 || r > GRID_ROWS || c < 1 || c > GRID_COLS) return null;
                const key = buildCellKey(r, c);
                // Continuous rendering: handle split cells merging dynamically
                const splitCell = refinements.subCellSplits.find(s => s.parentCell === key);
                if (splitCell) {
                  // Which half is closest to our cell?
                  // For simplicity, just return the main roomId if the cell isn't split in ArchitecturalCell yet,
                  // but actually a split cell has two rooms. We'll fallback to normal roomId logic.
                }
                return state.grid[key]?.roomId || null;
              };

              // Identify anchor for continuous rendering text (top-leftmost cell of this room group)
              const cellLayout = (refinements.cellLayouts || {})[cellKey] || undefined;
              let isAnchorForText = true;
              if (isOcc) {
                const placementForCell = state.placements.find(p => p.roomId === cs.roomId);
                if (placementForCell) {
                  // Sort occupied cells to find "top-left"
                  const sortedCells = [...placementForCell.occupiedCells].sort((a, b) => {
                    const pa = parseCellKey(a as GridCellKey);
                    const pb = parseCellKey(b as GridCellKey);
                    if (pa.row !== pb.row) return pa.row - pb.row;
                    return pa.col - pb.col;
                  });
                  isAnchorForText = sortedCells[0] === cellKey;
                }
              }

              return (
                <GazeButton key={cellKey} id={`cell-${cellKey}`} gazeEnabled={cellGaze}
                  gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                  // v5: Cell dwell 2000ms → 1300ms. The old value was the absolute
                  // system MAX (dwellTiming.max = 2000), forcing the user to hold
                  // gaze for 2 full seconds on a small target — exhausting and
                  // gaze drift cancelled the dwell before completion. 1300ms is in
                  // line with phrase/survey dwell (also "pick from many" decisions)
                  // and the wrapper scales it by compassMapAction so users with
                  // slower settings still get longer dwell.
                  //
                  // v5: Removed custom startCellDwell/cancelCellDwell hooks —
                  // GazeButton's own DwellProgressRing/Shrink already shows progress.
                  // Two simultaneous animations were wasting CPU and visually
                  // competing for the user's foveal attention.
                  onDwellStart={() => setHoveredCell(cellKey)}
                  onDwellCancel={() => { if (hoveredCell === cellKey) setHoveredCell(null); }}
                  onDwellComplete={() => setHoveredCell(null)}
                  onClick={() => {
                    if (isConfirmationOpen) return;
                    // Refinement mode — select cell + auto-open editor
                    if (refinementMode) {
                      if (selectedRefinementCell === cellKey) {
                        // Already selected — open cell editor directly
                        handleCellClick(cellKey); // Use the new handler
                      } else {
                        setSelectedRefinementCell(cellKey);
                        setRefinementArmed(false); // Reset arming when selecting a new cell
                        setCellEditorTool(null); // Reset tool
                        setSplitDirection(null); // Reset split state
                        setSplitStep('direction');
                        setSubRoomA(null);
                        setRoomPage(0);
                        onSpeak(`Cell ${cellKey} selected. Tap again to edit, or use EDIT button.`);
                      }
                      return;
                    }
                    // Simple mode — block editing of refined cells
                    if (!refinementMode && hasAnyRefinement(cellKey)) {
                      onSpeak('This cell has advanced refinements. Enter Refine Mode to edit.');
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
                    hideText={refinementMode && refinements.subCellSplits.some(s => s.parentCell === cellKey)}
                  />
                  {/* Refinement visual indicators — shown in BOTH modes */}
                  {refinementMode && (
                    <>
                      {/* Selection highlight */}
                      {selectedRefinementCell === cellKey && (
                        <div style={{ position: 'absolute', inset: 0, border: `3px solid ${T_accent}`, zIndex: 15, pointerEvents: 'none', borderRadius: '2px' }} />
                      )}
                      {/* Split indicator — colored halves + dashed divider with percentage */}
                      {(() => {
                        const split = refinements.subCellSplits.find(s => s.parentCell === cellKey);
                        if (!split) return null;
                        const colorA = ROOM_LIBRARY[split.roomA]?.color || '#8B5CF6';
                        const colorB = ROOM_LIBRARY[split.roomB]?.color || '#64748B';
                        const labelA = ROOM_LIBRARY[split.roomA]?.shortLabel || split.roomA;
                        const labelB = ROOM_LIBRARY[split.roomB]?.shortLabel || split.roomB;
                        const isVert = split.splitDirection === 'vertical';
                        const pctA = split.roomAPct || 50;
                        const pctB = 100 - pctA;
                        return (
                          <>
                            {/* Room A tint */}
                            <div style={{
                              position: 'absolute', zIndex: 13, pointerEvents: 'none',
                              ...(isVert
                                ? { top: 0, bottom: 0, left: 0, width: `${pctA}%` }
                                : { top: 0, left: 0, right: 0, height: `${pctA}%` }),
                              background: `${colorA}33`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {/* #3 — split label: colour dot + small text to avoid overlap */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.6)', padding: '2px 4px', borderRadius: 4 }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: colorA }} />
                                <span style={{ fontSize: 'clamp(8px, 1vw, 11px)', fontWeight: 800, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '35px' }}>{labelA}</span>
                              </div>
                            </div>
                            {/* Room B tint */}
                            <div style={{
                              position: 'absolute', zIndex: 13, pointerEvents: 'none',
                              ...(isVert
                                ? { top: 0, bottom: 0, right: 0, width: `${pctB}%` }
                                : { bottom: 0, left: 0, right: 0, height: `${pctB}%` }),
                              background: `${colorB}33`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.6)', padding: '2px 4px', borderRadius: 4 }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: colorB }} />
                                <span style={{ fontSize: 'clamp(8px, 1vw, 11px)', fontWeight: 800, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '35px' }}>{labelB}</span>
                              </div>
                            </div>
                            {/* Dashed divider line */}
                            <div style={{
                              position: 'absolute', zIndex: 14, pointerEvents: 'none',
                              ...(isVert
                                ? { top: 0, bottom: 0, left: `${pctA}%`, width: '2px', borderLeft: '2px dashed #8B5CF6' }
                                : { left: 0, right: 0, top: `${pctA}%`, height: '2px', borderTop: '2px dashed #8B5CF6' }),
                            }} />
                          </>
                        );
                      })()}
                      {/* Wall edge indicator — colored bar on specified edge */}
                      {refinements.customEdges.filter(e => e.cells[0] === cellKey).map(edge => {
                        const edgeColor = edge.type === 'full_wall' ? '#2DD4BF' : edge.type === 'half_wall_glass' ? '#497775' : edge.type === 'open_archway' ? '#C9A96B' : '#EF5350';
                        const side = edge.boundary[1] || 'right';
                        const posStyle = side === 'top' ? { top: 0, left: 0, right: 0, height: '3px' }
                          : side === 'bottom' ? { bottom: 0, left: 0, right: 0, height: '3px' }
                            : side === 'left' ? { top: 0, left: 0, bottom: 0, width: '3px' }
                              : { top: 0, right: 0, bottom: 0, width: '3px' };
                        return <div key={edge.id} style={{ position: 'absolute', ...posStyle, background: edgeColor, zIndex: 14, pointerEvents: 'none' }} />;
                      })}
                      {/* Void indicator — diagonal stripes + text */}
                      {refinements.voidMarkers.find(v => v.cell === cellKey) && (
                        <div style={{
                          position: 'absolute', inset: 0, zIndex: 14, pointerEvents: 'none',
                          background: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(251,191,36,0.2) 6px, rgba(251,191,36,0.2) 12px)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#C9A96B', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '3px' }}>VOID</span>
                        </div>
                      )}
                      {/* Rotation indicator */}
                      {(() => {
                        const rot = (refinements.cellRotations || []).find(r => r.cell === cellKey);
                        if (!rot || rot.degrees === 0) return null;
                        return (
                          <div style={{ position: 'absolute', top: '2px', left: '2px', zIndex: 15, pointerEvents: 'none', background: 'rgba(245,158,11,0.9)', borderRadius: '3px', padding: '1px 4px', fontSize: '8px', fontWeight: 900, color: '#FFF' }}>
                            ↻{rot.degrees}°
                          </div>
                        );
                      })()}
                    </>
                  )}
                  {/* ✦ badge in simple (non-refinement) mode */}
                  {!refinementMode && hasAnyRefinement(cellKey) && (
                    <div style={{
                      position: 'absolute', top: '2px', right: '2px', zIndex: 15, pointerEvents: 'none',
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: 'rgba(139,92,246,0.9)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 900, color: '#FFF',
                      boxShadow: '0 0 6px rgba(139,92,246,0.5)',
                    }}>
                      ✦
                    </div>
                  )}
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
        <div style={{
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
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${100 / GRID_COLS}%`, padding: '6px' }}>
              <GazeButton
                id="ready-road-left"
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
                    : (isLight ? `${T_accent}1A` : isMix ? `${T_accent}1A` : 'rgba(45,212,191,0.05)'),
                  border: state.armed
                    ? `3px solid ${isLight ? T_accent : isMix ? T_accent : '#2DD4BF'}`
                    : `2px solid ${isLight ? `${T_accent}55` : isMix ? `${T_accent}55` : 'rgba(45,212,191,0.2)'}`,
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
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
            <div style={{
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
            onClick={() => { dispatch({ type: 'SWITCH_FLOOR', floor: 'first' }); onSpeak('Starting first floor. Place your rooms.'); }}
            style={{ padding: '16px 40px', minHeight: 'clamp(60px, 8vh, 80px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)', background: T_accentSubtle, border: `2px solid ${T_accent}`, color: T_accent }}>
            YES, MAP 1ST FLOOR
          </GazeButton>
          <GazeButton id="no-ff" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
            onClick={() => { handleSave(); onSpeak('Saved ground floor only. Done.'); }}
            style={{ padding: '16px 40px', minHeight: 'clamp(60px, 8vh, 80px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)', background: T_cardBg, border: `2px solid ${T_panelBorderSoft}`, color: T_textSub }}>
            NO, FINISH
          </GazeButton>
          <GazeButton id="gen-fp-transition" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
            onClick={() => { handleSave(); handleGenerateFloorPlan(); }}
            style={{
              padding: '16px 40px', minHeight: 'clamp(60px, 8vh, 80px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)',
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDim, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `3px solid ${T_panelBorder}`, borderRadius: '24px', padding: '60px', maxWidth: '1000px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '36px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Replace Room?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.5 }}>
              Do you really want to replace <span style={{ color: oldLib?.color || T_textMain, fontWeight: 700 }}>{oldLib?.roomLabel}</span> with <span style={{ color: newLib?.color || T_textMain, fontWeight: 700 }}>{newLib?.roomLabel}</span>?
            </div>
            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
              <GazeButton id="confirm-replace-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `4px solid ${T_panelBorder}`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>⚠️</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Finalize Floor Plan?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.6 }}>
              Are you sure you have completed and filled all the cells?
              <br />
              Do you really want to generate the floor plan now?
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-gen-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                onClick={() => {
                  setConfirmGenerate(false);
                  handleGenerateFloorPlan();
                }}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: isLight ? T_accent : isMix ? T_accent : '#334155', border: `5px solid ${T_textMain}`, color: T_textInverse, fontSize: '38px', fontWeight: 900, minWidth: '420px' }}>
                YES
              </GazeButton>
              <GazeButton id="confirm-gen-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                onClick={() => setConfirmGenerate(false)}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: 'transparent', border: `5px solid ${T_textDim}`, color: T_textSub, fontSize: '38px', fontWeight: 900, minWidth: '380px' }}>
                NO
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }
    if (showRestoreConfirm) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `4px solid ${T_info}`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>🕒</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Restore Previous Session?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.6 }}>
              This will load your last saved grid layout.
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-restore-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
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
                        if (parsed.refinements) {
                          setRefinements(parsed.refinements);
                        }
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `4px solid ${T_danger}`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>⚠️</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Restart Mapping Completely?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.6 }}>
              This will erase your current placements and let you start over<br />with new dimensions and facing.
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-restart-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
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

  // ─── RENDER: Components Mega-Menu (AAC Compliant) ───────
  const renderMenu = () => {
    if (!menuOpen) return null;
    const removalP = menuConfirmRemove ? state.placements.find((p) => p.placementId === menuConfirmRemove) : null;
    const placedCount = state.placements.length;
    const totalCount = state.componentQueue.length;
    const menuCardsEnabled = menuReady && !menuConfirmRemove;
    const menuGridSlots = Math.max(16, state.componentQueue.length);
    const menuNavSize = 'clamp(126px, 14.2vh, 176px)';

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: T_panelBg, display: 'flex', flexDirection: 'column' }}>
        {/* Header — Solid matte */}
        <div style={{ display: 'flex', alignItems: 'center', padding: 'clamp(12px, 1.8vh, 22px) clamp(20px, 2.5vw, 36px)', borderBottom: `2px solid ${T_panelBorder}`, background: T_panelBg }}>
          {/* Left: Title + info */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: 'clamp(22px, 3vh, 32px)', fontWeight: 900, color: T_textMain, letterSpacing: '1.5px' }}>
              ROOM COMPONENTS
            </span>
            <span style={{ fontSize: 'clamp(13px, 1.5vh, 17px)', color: T_textMain, fontWeight: 700, padding: '5px 14px', background: T_cardBg, borderRadius: '8px', border: `2px solid ${T_accent}` }}>
              {state.currentFloor === 'first' ? '1ST FLOOR' : 'GROUND'}
            </span>
            <span style={{ fontSize: 'clamp(13px, 1.5vh, 17px)', color: T_textSub, fontWeight: 700 }}>
              {placedCount} / {totalCount} placed
            </span>
          </div>
          {/* Center: CLOSE */}
          <GazeButton id="close-menu" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
            onClick={() => { setMenuOpen(false); setMenuConfirmRemove(null); }}
            style={{ padding: '10px 36px', minHeight: 'clamp(52px, 6vh, 68px)', borderRadius: '12px', fontWeight: 900, fontSize: 'clamp(16px, 1.9vh, 21px)', background: T_cardBg, border: `2px solid ${T_danger}`, color: T_textMain, letterSpacing: '1.5px', flexShrink: 0 }}>
            {'\u2715'} CLOSE
          </GazeButton>
          <div style={{ flex: 1 }} />
        </div>

        {/* Removal confirmation */}
        {removalP && (
          <div style={{ background: isLight ? `${T_danger}18` : isMix ? `${T_danger}26` : '#1a0f0f', borderBottom: `2px solid ${T_danger}`, padding: 'clamp(14px, 1.8vh, 22px) clamp(20px, 2.5vw, 36px)', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ color: T_textMain, fontSize: 'clamp(16px, 2vh, 22px)', fontWeight: 800, flex: 1 }}>
              Remove {removalP.roomLabel}?
            </span>
            <GazeButton id="rm-yes" gazeEnabled={isGazeEnabled} dwellCategory="compassMapAction" gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => { dws({ type: 'REMOVE_PLACED_ROOM', placementId: menuConfirmRemove! }); setMenuConfirmRemove(null); }}
              style={{ padding: '10px 30px', minHeight: 'clamp(50px, 5.5vh, 64px)', background: isLight ? `${T_danger}26` : isMix ? `${T_danger}33` : '#2d1515', border: `2px solid ${T_danger}`, borderRadius: '12px', color: T_danger, fontSize: 'clamp(15px, 1.7vh, 19px)', fontWeight: 900 }}>YES, REMOVE</GazeButton>
            <GazeButton id="rm-no" gazeEnabled={isGazeEnabled} dwellCategory="backSkipButton" gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => setMenuConfirmRemove(null)}
              style={{ padding: '10px 30px', minHeight: 'clamp(50px, 5.5vh, 64px)', background: T_cardBg, border: `2px solid ${T_panelBorderSoft}`, borderRadius: '12px', color: T_textMain, fontSize: 'clamp(15px, 1.7vh, 19px)', fontWeight: 800 }}>CANCEL</GazeButton>
          </div>
        )}

        {/* Instruction */}
        <div style={{ padding: 'clamp(10px, 1.2vh, 16px) clamp(20px, 2.5vw, 36px) 0', background: T_panelBg }}>
          <div style={{ fontSize: 'clamp(12px, 1.3vh, 15px)', color: T_textSub, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            {menuCardsEnabled ? 'Select any room to load it for placement' : 'Press ready to unlock room selection'}
          </div>
        </div>

        {/* Room cards — AAC: large, bold, high-contrast, extra padding */}
        <div style={{ flex: 1, minHeight: 0, padding: 'clamp(10px, 1.3vh, 18px) clamp(20px, 2.5vw, 36px) 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'repeat(4, minmax(0, 1fr))', gap: '1px', background: T_panelBorderSoft, border: `1px solid ${T_panelBorderSoft}`, borderRadius: '10px', overflow: 'hidden' }}>
            {Array.from({ length: menuGridSlots }).map((_, idx) => {
              const room = state.componentQueue[idx];
              if (!room) {
                return <div key={`m-empty-${idx}`} style={{ background: isLight ? '#E5DAC2' : isMix ? '#1F1B14' : 'rgba(17,24,39,0.92)' }} />;
              }
              const isPlaced = state.placements.some((p) => p.roomId === room.roomId);
              const pl = state.placements.find((p) => p.roomId === room.roomId);
              const isCurr = idx === state.currentIndex;
              const lib = ROOM_LIBRARY[room.roomId];
              return (
                <GazeButton key={`m-${room.roomId}-${idx}`} id={`m-${room.roomId}-${idx}`} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                  onClick={() => {
                    if (!menuCardsEnabled) {
                      onSpeak('Press READY first, then select a room.');
                      return;
                    }
                    dispatch({ type: 'SELECT_ROOM', roomIndex: idx });
                    setMenuOpen(false);
                    onSpeak(
                      isPlaced
                        ? `Editing ${room.roomLabel}. Press READY, then add or remove cells.`
                        : `Selected ${room.roomLabel}. Press READY to place.`,
                    );
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 'clamp(108px, 11.5vh, 158px)',
                    padding: 'clamp(12px, 1.6vh, 22px) clamp(12px, 1.1vw, 18px)',
                    borderRadius: 0,
                    background: !menuCardsEnabled
                      ? (isLight ? T_cardBg : isMix ? T_cardBg : 'rgba(17,24,39,0.65)')
                      : isCurr
                        ? T_accentSubtle
                        : isPlaced
                          ? (isLight ? '#EDE2C8' : isMix ? '#1F1B14' : 'rgba(30,41,59,0.96)')
                          : T_cardBg,
                    border: 'none',
                    boxShadow: isCurr
                      ? `inset 0 0 0 3px ${T_accent}`
                      : isPlaced
                        ? `inset 0 0 0 2px ${lib?.color || T_accent}`
                        : `inset 0 0 0 1px ${T_panelBorderSoft}`,
                    color: T_textMain,
                    opacity: menuCardsEnabled ? 1 : (isLight || isMix ? 0.55 : 1),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'clamp(6px, 0.8vh, 10px)',
                    textAlign: 'center',
                  }}>
                  {/* Room name row */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(6px, 0.8vh, 10px)', width: '100%' }}>
                    <div style={{ width: 'clamp(14px, 1.7vh, 20px)', height: 'clamp(14px, 1.7vh, 20px)', borderRadius: '4px', background: lib?.color || '#555', flexShrink: 0 }} />
                    <span style={{ fontSize: 'clamp(20px, 2.5vh, 40px)', fontWeight: 900, letterSpacing: '0.4px', lineHeight: 1.06, fontFamily: 'system-ui, -apple-system, sans-serif', textAlign: 'center', width: '100%', overflowWrap: 'anywhere' }}>
                      {room.roomLabel}
                    </span>
                  </div>
                  {/* Status row */}
                  <div>
                    {isCurr ? (
                      <span style={{ fontSize: 'clamp(13px, 1.55vh, 20px)', fontWeight: 900, color: T_accent }}>
                        {'\u25CF'} CURRENT {pl ? `- ${pl.occupiedCells.length} cell${pl.occupiedCells.length === 1 ? '' : 's'}` : ''}
                      </span>
                    ) : isPlaced ? (
                      <span style={{ fontSize: 'clamp(13px, 1.55vh, 20px)', fontWeight: 900, color: lib?.color || T_success }}>
                        {'\u2713'} PLACED {'\u2014'} {pl?.occupiedCells.length || 0} cells
                      </span>
                    ) : (
                      <span style={{ fontSize: 'clamp(13px, 1.55vh, 20px)', fontWeight: 800, color: T_textSub }}>
                        UNPLACED
                      </span>
                    )}
                  </div>
                </GazeButton>
              );
            })}
          </div>
        </div>

        {/* Footer — Solid matte */}
        <div style={{ marginTop: 'clamp(52px, 6vh, 90px)', padding: '0 clamp(20px, 2.5vw, 36px) clamp(16px, 2.4vh, 34px)', background: T_panelBg, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(30px, 4vw, 72px)' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GazeButton id="back-map" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                onClick={() => { setMenuOpen(false); setMenuConfirmRemove(null); }}
                style={{ width: menuNavSize, height: menuNavSize, minHeight: menuNavSize, borderRadius: '50%', fontWeight: 900, fontSize: 'clamp(18px, 2.2vh, 28px)', background: T_cardBg, border: `3px solid ${T_accent}`, color: T_accent, letterSpacing: '0.7px', whiteSpace: 'pre-line', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.05 }}>
                BACK{'\n'}TO MAP
              </GazeButton>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GazeButton id="menu-gaze-toggle" gazeEnabled alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="gazeToggle" onClick={toggleGaze}
                style={{
                  width: menuNavSize,
                  height: menuNavSize,
                  minHeight: menuNavSize,
                  borderRadius: '50%',
                  background: isGazeEnabled ? T_successSubtle : T_cardBg,
                  border: `3px solid ${isGazeEnabled ? T_accent : T_panelBorderSoft}`,
                  color: isGazeEnabled ? T_accent : T_textSub,
                  fontSize: 'clamp(14px, 1.65vh, 20px)',
                  fontWeight: 900,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'pre-line',
                  textAlign: 'center',
                }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isGazeEnabled ? '#2DD4BF' : '#64748B' }} />
                {isGazeEnabled ? 'PAUSE\nGAZE' : 'RESUME\nGAZE'}
              </GazeButton>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GazeButton id="menu-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                onClick={() => {
                  setMenuReady(!menuReady);
                  onSpeak(menuReady ? 'Ready mode off.' : 'Ready. Select any room card.');
                }}
                style={{
                  width: menuNavSize,
                  height: menuNavSize,
                  minHeight: menuNavSize,
                  borderRadius: '50%',
                  fontWeight: 900,
                  fontSize: 'clamp(22px, 2.7vh, 34px)',
                  background: menuReady ? T_successSubtle : T_cardBg,
                  border: `3px solid ${T_accent}`,
                  color: menuReady ? T_textMain : T_accent,
                  boxShadow: menuReady ? '0 8px 18px rgba(0,0,0,0.18)' : 'none',
                  letterSpacing: '0.7px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}>
                READY
              </GazeButton>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Determine if we should show floor transition ───────
  const showFloorTransition = state.phase === 'review' && state.currentFloor === 'ground' && isMultiFloor;

  // ─── MAIN RENDER ────────────────────────────────────────

  const renderRightActionRail = () => null;

  return (
    <div className={`compass-screen${isLight ? ' theme-light' : ''}${isMix ? ' theme-mix' : ''}${isWarm ? ' theme-warm' : ''}`} style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: T_pageBg, display: 'flex', flexDirection: 'column', fontFamily: UI_FONT }}>
      {!menuOpen && !navHidden && (
        <div style={{ pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto' }}>
          <GlobalNavBar
            currentPage="compass-map"
            onNavigate={onNavigate}
            onSpeak={onSpeak}
            isDarkMode={isDarkMode}
            compact={true}
            onRestartCompass={handleRestartCompass}
          />
        </div>
      )}
      {/* Dead zone: 30px non-interactive gap between nav bar and content — prevents accidental nav clicks when targeting top-row compass cells */}
      {!menuOpen && !navHidden && (
        <div
          data-gaze="false"
          style={{ height: '30px', pointerEvents: 'none', flexShrink: 0 }}
        />
      )}
      {/* Floating SHOW NAV ↑ button — shown when nav is hidden, aligned with right action strip */}
      {!menuOpen && navHidden && !isFocusLocked && (
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
      {!menuOpen && !navHidden && (state.phase === 'placement' || state.phase === 'review') && (
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
      {cellEditorOpen && selectedRefinementCell && (() => {
        const cellKey = selectedRefinementCell;
        const cs = state.grid[cellKey];
        const roomId = cs?.roomId || '';
        const lib = ROOM_LIBRARY[roomId];
        const roomColor = lib?.color || '#334155';
        const roomLabel = lib?.shortLabel || cellKey;
        const roomFullLabel = lib?.roomLabel || 'Empty Cell';
        const zoneLabel = getCellZoneLabel(cellKey);
        const roomIds = state.currentFloor === 'first' ? FF_IDS : GF_IDS;
        const hasCellRefinement = hasAnyRefinement(cellKey);

        // Step label for breadcrumb
        const getStepLabel = (): string => {
          if (!cellEditorTool) return 'Choose Tool';
          if (cellEditorTool === 'split') {
            if (splitStep === 'direction') return 'Step 1 / 4 — Direction';
            if (splitStep === 'roomA') return 'Step 2 / 4 — Room A';
            if (splitStep === 'pctA') return 'Step 3 / 4 — Proportion';
            return 'Step 4 / 4 — Room B';
          }
          if (cellEditorTool === 'walls') return cellEditorWallEdge ? 'Step 2 / 2 — Wall Type' : 'Step 1 / 2 — Edge';
          if (cellEditorTool === 'rotate') return 'Rotate';
          if (cellEditorTool === 'expand') return 'Expand Direction';
          if (cellEditorTool === 'void') return 'Void Toggle';
          return '';
        };

        const editorBack = () => {
          if (cellEditorTool === 'split') {
            if (splitStep === 'roomB') { setSplitStep('pctA'); setRoomPage(0); return; }
            if (splitStep === 'pctA') { setSplitStep('roomA'); setRoomPage(0); return; }
            if (splitStep === 'roomA') { setSplitStep('direction'); setRoomPage(0); return; }
          }
          if (cellEditorTool === 'walls' && cellEditorWallEdge) { setCellEditorWallEdge(null); return; }
          if (cellEditorTool) { setCellEditorTool(null); setCellEditorWallEdge(null); setRoomPage(0); onSpeak('Back to tools.'); return; }
          setCellEditorOpen(false); onSpeak('Editor closed.');
        };

        // Show all rooms at once in a responsive grid
        const pagedRoomIds = roomIds;
        const totalPages = 1;

        const effectiveGazeEnabled = isGazeEnabled && refinementArmed && !readingCooldown;

        // Theme-aware room picker card. Paper modes (warm + light) use dark
        // brown text on cream card bg so room names are readable (was light
        // `#E2E8F0` slate on a tan tile — invisible). Dark/mix keep light text.
        const rcBg = isLight ? '#FAF5E8'
            : isWarm ? '#FBF5E5'
            : isMix ? 'rgba(60, 48, 32, 0.55)'
            : 'rgba(139,92,246,0.08)';
        const rcBorder = isLight ? '2px solid rgba(168, 120, 56, 0.30)'
            : isWarm ? '2px solid rgba(122, 99, 71, 0.22)'
            : isMix ? '2px solid rgba(180, 147, 98, 0.32)'
            : '3px solid rgba(139,92,246,0.3)';
        const rcText = isLight ? '#2E2A24'
            : isWarm ? '#2F2A26'
            : isMix ? '#FFFCF1'
            : '#E2E8F0';
        const rcShadow = isLight ? '0 4px 12px rgba(82, 66, 45, 0.10)'
            : isWarm ? '0 1px 2px rgba(82, 65, 48, 0.05)'
            : 'none';
        const roomCard = (id: string, rid: string, onClick: () => void, _dwell = 1500) => (
          <GazeButton key={id} id={id} gazeEnabled={effectiveGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
            onClick={() => { onClick(); setRoomPage(0); }}
            style={{ flex: '1 1 200px', minWidth: '200px', maxWidth: '240px', minHeight: '140px', borderRadius: '16px', border: rcBorder, background: rcBg, color: rcText, fontSize: '24px', fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px', boxShadow: rcShadow }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: ROOM_LIBRARY[rid]?.color || '#555' }} />
            <div style={{ textAlign: 'center', lineHeight: 1.2 }}>{ROOM_LIBRARY[rid]?.shortLabel || rid}</div>
          </GazeButton>
        );

        const bigBtn = (id: string, label: string, color: string, bg: string, border: string, onClick: () => void, _dwell = 1000, extra?: React.CSSProperties) => (
          <GazeButton id={id} gazeEnabled={effectiveGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
            onClick={onClick}
            style={{ minWidth: '140px', minHeight: '80px', borderRadius: '16px', border: `2px solid ${border}`, background: bg, color, fontSize: '18px', fontWeight: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', ...extra }}>
            {label}
          </GazeButton>
        );

        // Tool sidebar button
        const toolSideBtn = (id: string, icon: string, label: string, tool: 'split' | 'walls' | 'void' | 'rotate' | 'expand', color: string, action?: () => void) => {
          const isActive = cellEditorTool === tool;
          // Light/mix: pick a saturated tool color that holds on cream/walnut bg
          const lightToolColor =
            tool === 'split' ? '#5B4B98'
              : tool === 'walls' ? '#1F6B7E'
                : tool === 'rotate' ? '#8C5A1E'
                  : tool === 'expand' ? '#3D7853'
                    : '#5B4B98';
          const mixToolColor =
            tool === 'split' ? '#9B85D9'
              : tool === 'walls' ? '#5E9CA8'
                : tool === 'rotate' ? '#D9A560'
                  : tool === 'expand' ? '#8FB99D'
                    : '#9B85D9';
          const themeToolColor = isLight ? lightToolColor : isMix ? mixToolColor : color;
          const inactiveBorder = isLight
            ? `1.5px solid ${lightColors.border.main}`
            : isMix
              ? '2px solid rgba(180,147,98,0.32)'
              : '2px solid rgba(255,255,255,0.08)';
          const inactiveBg = isLight
            ? lightColors.background.elevated
            : isMix
              ? 'rgba(36, 31, 24, 0.92)'
              : 'rgba(255,255,255,0.03)';
          const inactiveText = isLight
            ? T_textMain
            : isMix
              ? T_textMain
              : '#64748B';
          return (
            <GazeButton id={id} gazeEnabled={effectiveGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => { if (action) { action(); } else { setCellEditorTool(tool); triggerReadingCooldown(); setRoomPage(0); onSpeak(`${label} tool.`); } }}
              style={{
                width: '100%',
                minHeight: 'clamp(140px, 16vh, 170px)',
                flex: 1,
                borderRadius: '18px',
                border: isActive ? `3px solid ${themeToolColor}` : inactiveBorder,
                background: isActive ? `${themeToolColor}22` : inactiveBg,
                color: isActive ? themeToolColor : inactiveText,
                fontSize: 'clamp(16px, 1.9vh, 20px)',
                fontWeight: 900,
                letterSpacing: '0.7px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '14px',
                padding: '18px 8px',
                boxShadow: isActive
                  ? (isLight ? `0 4px 14px ${themeToolColor}33` : '0 4px 14px rgba(0,0,0,0.20)')
                  : 'none',
              }}>
              <span style={{ fontSize: 'clamp(34px, 4vh, 44px)', color: themeToolColor }}>{icon}</span>
              <span>{label}</span>
            </GazeButton>
          );
        };

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: T_pageBg, display: 'flex', flexDirection: 'column' }}>

            {/* ── SMART READING COOLDOWN BANNER ── */}
            {readingCooldown && (
              <div style={{ position: 'absolute', top: 120, left: 0, right: 0, height: '48px', background: T_info, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'slideDown 0.3s ease-out forwards' }}>
                <span style={{ color: T_textInverse, fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>PAUSED: LOOK AROUND FREELY 👁️👀</span>
              </div>
            )}

            {/* ── BREADCRUMB BAR / HEADER (taller for bigger BACK button) ── */}
            <div style={{ position: 'relative', minHeight: 'clamp(140px, 14vh, 160px)', flexShrink: 0, background: T_panelBg, borderBottom: `2px solid ${T_panelBorderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 40px' }}>
              {/* Left Breadcrumbs (Non-interactive) */}
              <div style={{ position: 'absolute', left: 40, display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, overflow: 'hidden' }}>
                <span style={{ color: T_textDim, fontWeight: 600 }}>Refinement</span>
                <span style={{ color: T_textDim }}>›</span>
                {/* #10 — breadcrumb shows full room label, not raw shortLabel */}
                <span style={{ background: `${roomColor}33`, border: `1px solid ${roomColor}66`, color: T_textMain, padding: '6px 20px', borderRadius: 100, fontWeight: 800, fontSize: 18, whiteSpace: 'nowrap' }}>
                  {roomFullLabel} {hasCellRefinement ? '✦' : ''}
                </span>
                <span style={{ color: T_textDim }}>›</span>
                <span style={{ color: T_textSub, fontWeight: 600, whiteSpace: 'nowrap' }}>{getStepLabel()}</span>
              </div>

              {/* Center BACK/EXIT Button — large gaze-friendly target */}
              <GazeButton id="focus-back" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode alwaysActive dwellCategory="backSkipButton"
                onClick={editorBack}
                style={{
                  minHeight: 'clamp(96px, 11vh, 120px)',
                  minWidth: 'clamp(280px, 24vw, 360px)',
                  borderRadius: 22,
                  background: T_subSurface,
                  border: `3px solid ${T_panelBorder}`,
                  color: T_info,
                  fontSize: 'clamp(24px, 2.8vh, 30px)',
                  fontWeight: 900,
                  letterSpacing: '0.5px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 14,
                  padding: '8px 36px',
                  boxShadow: isLight ? '0 6px 18px rgba(82, 66, 45, 0.16)' : '0 8px 32px rgba(0,0,0,0.3)',
                  zIndex: 10,
                }}>
                <span style={{ fontSize: 'clamp(28px, 3.2vh, 36px)' }}>{'←'}</span>
                <span>{!cellEditorTool ? 'EXIT TO MAP' : 'BACK'}</span>
              </GazeButton>

              {/* Right Step Label */}
              <div style={{ position: 'absolute', right: 40, padding: '8px 20px', borderRadius: 100, background: isLight ? `${T_refineMapBorder}22` : isMix ? `${T_refineMapBorder}33` : 'rgba(139,92,246,0.15)', border: `2px solid ${T_refineMapBorder}`, color: T_refineMapText, fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {getStepLabel()}
              </div>
            </div>

            {/* ── 3-COLUMN BODY ── */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

              {/* ══ LEFT: GHOST MAP (320px) ══ */}
              <div style={{ width: 320, flexShrink: 0, background: T_panelBg, borderRight: `2px solid ${T_panelBorderSoft}`, display: 'flex', flexDirection: 'column', padding: 16, gap: 14 }}>
                {/* #8 — Ghost map section header raised + PREVIEW ONLY tag */}
                <div style={{ fontSize: 14, fontWeight: 800, color: T_textDim, letterSpacing: 2, textAlign: 'center' }}>FLOOR MAP</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T_textDim, textAlign: 'center', background: T_subSurface, borderRadius: 6, padding: '2px 8px', letterSpacing: 1 }}>PREVIEW ONLY — non-interactive</div>
                {/* Mini Grid */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`, gap: 3, background: T_cardBg, borderRadius: 10, padding: 6, border: `1px solid ${T_panelBorderSoft}` }}>
                  {RENDER_ORDER.map((ck: GridCellKey) => {
                    const gcs = state.grid[ck];
                    // Highlight the ENTIRE room, not just the single clicked cell
                    const isRoomSelected = gcs?.roomId && gcs.roomId === roomId;
                    const isCellTargeted = ck === cellKey;
                    const gLib = gcs?.roomId ? ROOM_LIBRARY[gcs.roomId] : null;
                    return (
                      <div key={ck} style={{
                        borderRadius: 6,
                        background: gLib ? `${gLib.color}${isRoomSelected ? 'AA' : '44'}` : (isLight ? '#FAF5E8' : isMix ? '#241E16' : 'rgba(255,255,255,0.02)'),
                        border: isCellTargeted ? `3px solid ${T_textMain}` : isRoomSelected ? `2px solid ${T_accent}` : `1px solid ${T_panelBorderSoft}`,
                        boxShadow: isRoomSelected ? `0 0 16px ${T_accent}66` : 'none',
                        opacity: isRoomSelected ? 1 : 0.6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, color: isRoomSelected ? T_textInverse : T_textSub,
                        transition: 'all 0.3s ease', position: 'relative',
                      }}>
                        {gLib?.shortLabel || ''}
                        {isCellTargeted && <div style={{ position: 'absolute', inset: -1, borderRadius: 6, border: `2px solid ${T_accent}`, animation: 'pulse 1.5s ease infinite', pointerEvents: 'none' }} />}
                      </div>
                    );
                  })}
                </div>
                {/* Direction Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: T_textDim, padding: '0 4px' }}>
                  <span>{sideLabels.left}</span>
                  <span>{sideLabels.right}</span>
                </div>
                <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: T_textDim }}>ROAD ({facing})</div>
                {/* Selected Cell Info */}
                <div style={{ background: `${roomColor}15`, border: `1px solid ${roomColor}44`, borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: roomColor }}>{roomFullLabel}</div>
                  <div style={{ fontSize: 11, color: T_textSub, fontWeight: 600, marginTop: 2 }}>{zoneLabel}</div>
                  {hasCellRefinement && <div style={{ fontSize: 10, color: isLight ? '#8C5A1E' : isMix ? '#B49362' : '#F59E0B', fontWeight: 700, marginTop: 4 }}>✦ Has refinements</div>}
                </div>
              </div>

              {/* ══ CENTER: ACTION ZONE (flex) ══ */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '20px 32px', overflow: 'hidden', minWidth: 0 }}>

                {/* ── READY OVERLAY & TOOL MENU PREVIEW ── */}
                {!refinementArmed && (
                  <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Faint Background Tools */}
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'rgba(139,92,246,0.5)', letterSpacing: 3, marginBottom: 20 }}>CHOOSE A TOOL</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', maxWidth: '900px', opacity: 0.3, pointerEvents: 'none', filter: 'blur(2px)' }}>
                      {bigBtn('ce-prev-split', '✂ SPLIT', '#C4B5FD', 'rgba(139,92,246,0.08)', 'rgba(139,92,246,0.3)', () => { }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {bigBtn('ce-prev-walls', '▐ WALLS', '#6EE7B7', 'rgba(45,212,191,0.08)', 'rgba(45,212,191,0.3)', () => { }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {bigBtn('ce-prev-rotate', '↻ ROTATE', '#F59E0B', 'rgba(245,158,11,0.08)', 'rgba(245,158,11,0.3)', () => { }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {bigBtn('ce-prev-expand', '⇔ EXPAND', '#497775', 'rgba(16,185,129,0.08)', 'rgba(16,185,129,0.3)', () => { }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {hasCellRefinement && bigBtn('ce-prev-reset', '✕ RESET', '#EF5350', 'rgba(239,83,80,0.06)', 'rgba(239,83,80,0.3)', () => { }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                    </div>

                    {/* Prominent Overlay READY Button */}
                    <div style={{ position: 'absolute', inset: -20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T_overlayDim, borderRadius: 24, zIndex: 10 }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: T_textInverse, textAlign: 'center', maxWidth: 600, marginBottom: 30 }}>
                        Look at READY to enable tools.
                      </div>
                      <GazeButton id="ce-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                        onClick={() => { setRefinementArmed(true); triggerReadingCooldown(); onSpeak('Tools enabled.'); }}
                        style={{ width: '280px', height: '140px', borderRadius: '24px', background: T_panelBg, border: `4px solid ${T_accent}`, color: T_accent, fontSize: '32px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px rgba(0,0,0,0.18)' }}>
                        READY
                      </GazeButton>
                    </div>
                  </div>
                )}

                {/* ── ACTIVE CELL HEADER + 4 LARGE TOOL CARDS (compass-style) ── */}
                {refinementArmed && cellEditorTool === null && (
                  <div style={{ animation: 'fadeIn 0.3s ease-out', textAlign: 'center', width: '100%', maxWidth: 920, padding: '0 24px' }}>
                    {/* Compact cell-context header */}
                    <div style={{
                      fontSize: 12, fontWeight: 800, color: T_refineMapBorder,
                      letterSpacing: '2.6px', marginBottom: 6,
                    }}>ACTIVE CELL</div>
                    <div style={{
                      fontSize: 'clamp(22px, 2.6vh, 30px)', fontWeight: 900, color: T_textMain,
                      lineHeight: 1.1, marginBottom: 4, letterSpacing: '0.3px',
                    }}>
                      {roomFullLabel}
                      {zoneLabel && (
                        <span style={{ fontSize: 'clamp(13px, 1.5vh, 17px)', fontWeight: 500, color: T_textSub, fontStyle: 'italic', marginLeft: 10 }}>
                          ({zoneLabel})
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: T_textDim, letterSpacing: '0.6px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontVariantNumeric: 'tabular-nums',
                      marginBottom: 'clamp(20px, 2.6vh, 32px)',
                    }}>
                      GRID {cellKey.toUpperCase()} &middot; {cellWFt}&times;{cellDFt} ft
                      {hasCellRefinement && (
                        <span style={{ marginLeft: 12, color: isLight ? '#8C5A1E' : isMix ? '#D9A560' : '#F59E0B', fontWeight: 800 }}>{'✦ refined'}</span>
                      )}
                    </div>

                    {/* CHOOSE A TOOL label */}
                    <div style={{
                      fontSize: 13, fontWeight: 800, color: T_refineMapBorder,
                      letterSpacing: '2.8px', marginBottom: 16,
                    }}>
                      CHOOSE A TOOL
                    </div>

                    {/* 2x2 compass-style tool grid — large gaze-friendly cards */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 'clamp(16px, 2vh, 28px)',
                      maxWidth: 760, margin: '0 auto',
                    }}>
                      {bigBtn('ce-split', '✂ SPLIT',
                        isLight ? '#5B4B98' : isMix ? '#9B85D9' : '#C4B5FD',
                        isLight ? 'rgba(91, 75, 152, 0.10)' : isMix ? 'rgba(155, 133, 217, 0.12)' : 'rgba(139,92,246,0.08)',
                        isLight ? 'rgba(91, 75, 152, 0.42)' : isMix ? 'rgba(155, 133, 217, 0.42)' : 'rgba(139,92,246,0.3)',
                        () => { openSplitOverlay(); triggerReadingCooldown(); }, 1500,
                        { width: '100%', height: 'clamp(160px, 22vh, 220px)', fontSize: 'clamp(26px, 3.2vh, 34px)' })}
                      {bigBtn('ce-walls', '▐ WALLS',
                        isLight ? '#1F6B7E' : isMix ? '#5E9CA8' : '#6EE7B7',
                        isLight ? 'rgba(31, 107, 126, 0.10)' : isMix ? 'rgba(94, 156, 168, 0.12)' : 'rgba(45,212,191,0.08)',
                        isLight ? 'rgba(31, 107, 126, 0.42)' : isMix ? 'rgba(94, 156, 168, 0.42)' : 'rgba(45,212,191,0.3)',
                        () => { setCellEditorTool('walls'); triggerReadingCooldown(); }, 1500,
                        { width: '100%', height: 'clamp(160px, 22vh, 220px)', fontSize: 'clamp(26px, 3.2vh, 34px)' })}
                      {bigBtn('ce-rotate', '↻ ROTATE',
                        isLight ? '#8C5A1E' : isMix ? '#D9A560' : '#F59E0B',
                        isLight ? 'rgba(140, 90, 30, 0.10)' : isMix ? 'rgba(217, 165, 96, 0.12)' : 'rgba(245,158,11,0.08)',
                        isLight ? 'rgba(140, 90, 30, 0.42)' : isMix ? 'rgba(217, 165, 96, 0.42)' : 'rgba(245,158,11,0.3)',
                        () => { openRotateOverlay(); triggerReadingCooldown(); }, 1500,
                        { width: '100%', height: 'clamp(160px, 22vh, 220px)', fontSize: 'clamp(26px, 3.2vh, 34px)' })}
                      {bigBtn('ce-expand', '⇔ EXPAND',
                        isLight ? '#3D7853' : isMix ? '#8FB99D' : '#497775',
                        isLight ? 'rgba(61, 120, 83, 0.10)' : isMix ? 'rgba(143, 185, 157, 0.12)' : 'rgba(16,185,129,0.08)',
                        isLight ? 'rgba(61, 120, 83, 0.42)' : isMix ? 'rgba(143, 185, 157, 0.42)' : 'rgba(16,185,129,0.3)',
                        () => { openExpandOverlay(); triggerReadingCooldown(); }, 1500,
                        { width: '100%', height: 'clamp(160px, 22vh, 220px)', fontSize: 'clamp(26px, 3.2vh, 34px)' })}
                    </div>

                    {hasCellRefinement && (
                      <div style={{ marginTop: 'clamp(16px, 2vh, 24px)', display: 'flex', justifyContent: 'center' }}>
                        {bigBtn('ce-reset', '✕ RESET',
                          isLight ? '#8C3F3F' : isMix ? '#D68264' : '#EF5350',
                          isLight ? 'rgba(140, 63, 63, 0.10)' : isMix ? 'rgba(214, 130, 100, 0.12)' : 'rgba(239,83,80,0.06)',
                          isLight ? 'rgba(140, 63, 63, 0.42)' : isMix ? 'rgba(214, 130, 100, 0.42)' : 'rgba(239,83,80,0.3)',
                          () => { resetCellRefinements(); triggerReadingCooldown(); }, 1500,
                          { width: '300px', height: '92px', fontSize: '22px' })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── SPLIT TOOL ── */}
                {refinementArmed && cellEditorTool === 'split' && (() => {
                  const splitTextColor = isLight ? '#5B4B98' : isMix ? '#9B85D9' : '#C4B5FD';
                  const splitBgColor = isLight ? 'rgba(91, 75, 152, 0.10)' : isMix ? 'rgba(155, 133, 217, 0.12)' : 'rgba(139,92,246,0.1)';
                  const splitBorderColor = isLight ? 'rgba(91, 75, 152, 0.55)' : isMix ? 'rgba(155, 133, 217, 0.55)' : 'rgba(139,92,246,0.4)';
                  return (
                  <>
                    <div style={{ fontSize: 'clamp(22px, 2.6vh, 28px)', fontWeight: 900, color: splitTextColor, letterSpacing: '0.5px' }}>{'✂'} SPLIT &mdash; {roomLabel}</div>
                    {splitStep === 'direction' && (
                      <div style={{ display: 'flex', gap: 'clamp(28px, 3.6vw, 56px)' }}>
                        {bigBtn('ce-split-v', '┃ VERTICAL\nLeft / Right', splitTextColor, splitBgColor, splitBorderColor,
                          () => { setSplitDirection('vertical'); setSplitStep('roomA'); triggerReadingCooldown(); onSpeak('Vertical. Pick first room.'); }, 2000, { width: 'clamp(260px, 26vw, 320px)', height: 'clamp(170px, 22vh, 220px)', fontSize: 'clamp(22px, 2.6vh, 28px)' })}
                        {bigBtn('ce-split-h', '━ HORIZONTAL\nTop / Bottom', splitTextColor, splitBgColor, splitBorderColor,
                          () => { setSplitDirection('horizontal'); setSplitStep('roomA'); triggerReadingCooldown(); onSpeak('Horizontal. Pick first room.'); }, 2000, { width: 'clamp(260px, 26vw, 320px)', height: 'clamp(170px, 22vh, 220px)', fontSize: 'clamp(22px, 2.6vh, 28px)' })}
                      </div>
                    )}
                    {splitStep === 'roomA' && (
                      <>
                        <div style={{ fontSize: 16, color: isLight || isWarm ? T_textSub : isMix ? T_textSub : '#94A3B8', fontWeight: 700 }}>Room for {splitDirection === 'vertical' ? 'LEFT' : 'TOP'} half</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, justifyContent: 'center', alignContent: 'start', maxWidth: '1200px', width: '100%', flex: 1, overflowY: 'auto', padding: '10px' }}>
                          {pagedRoomIds.map(rid => roomCard(`ce-sA-${rid}`, rid, () => { setSubRoomA(rid); setSplitStep('pctA'); triggerReadingCooldown(); onSpeak(`${ROOM_LIBRARY[rid]?.shortLabel || rid}. Choose percentage.`); }, 2000))}
                        </div>

                      </>
                    )}
                    {splitStep === 'pctA' && subRoomA && (
                      <>
                        <div style={{ fontSize: 16, color: isLight || isWarm ? T_textSub : isMix ? T_textSub : '#94A3B8', fontWeight: 700 }}>
                          Space for <span style={{ color: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', fontWeight: 900 }}>{ROOM_LIBRARY[subRoomA]?.shortLabel || subRoomA}</span>
                        </div>

                        {/* LIVE PREVIEW BOX */}
                        <div style={{ width: '400px', height: '240px', background: T_panelBg, border: `4px solid ${T_panelBorder}`, borderRadius: '16px', display: 'flex', flexDirection: splitDirection === 'horizontal' ? 'column' : 'row', overflow: 'hidden', padding: 8, gap: 4 }}>
                          <div style={{ flex: splitDirection === 'horizontal' ? `0 0 ${subRoomAPct || 50}%` : `0 0 ${subRoomAPct || 50}%`, background: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 20 }}>
                            {ROOM_LIBRARY[subRoomA]?.shortLabel} ({subRoomAPct || 50}%)
                          </div>
                          <div style={{
                            flex: 1,
                            background: isLight || isWarm ? 'rgba(122, 99, 71, 0.06)' : isMix ? 'rgba(180, 147, 98, 0.10)' : 'rgba(255,255,255,0.05)',
                            borderRadius: 8, display: 'flex',
                            border: `2px dashed ${isLight || isWarm ? 'rgba(122, 99, 71, 0.32)' : isMix ? 'rgba(180, 147, 98, 0.38)' : '#64748B'}`,
                            alignItems: 'center', justifyContent: 'center',
                            color: isLight || isWarm ? T_textSub : isMix ? T_textSub : '#94A3B8',
                            fontWeight: 800,
                          }}>
                            {100 - (subRoomAPct || 50)}% (Empty)
                          </div>
                        </div>

                        {/* #6 — proportion button gap raised to 28px (AAC ≥16px threshold) */}
                        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
                          {([25, 33, 50, 67, 75] as const).map(pct => bigBtn(`ce-pct-${pct}`, `${pct}%`, subRoomAPct === pct ? '#FFF' : '#C4B5FD', subRoomAPct === pct ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.1)', subRoomAPct === pct ? '#8B5CF6' : 'rgba(139,92,246,0.3)',
                            () => { setSubRoomAPct(pct); setSplitStep('roomB'); triggerReadingCooldown(); onSpeak(`${pct}%. Pick second room.`); }, 2000, { width: '140px', height: '100px', fontSize: '24px' }))}
                        </div>
                      </>
                    )}
                    {splitStep === 'roomB' && subRoomA && (
                      <>
                        <div style={{ fontSize: 16, color: isLight || isWarm ? T_textSub : isMix ? T_textSub : '#94A3B8', fontWeight: 700 }}>Room for {splitDirection === 'vertical' ? 'RIGHT' : 'BOTTOM'} half ({100 - (subRoomAPct || 50)}%)</div>

                        {/* LIVE PREVIEW BOX - B */}
                        <div style={{ width: '400px', height: '140px', background: T_panelBg, border: `4px solid ${T_panelBorder}`, borderRadius: '16px', display: 'flex', flexDirection: splitDirection === 'horizontal' ? 'column' : 'row', overflow: 'hidden', padding: 8, gap: 4, flexShrink: 0 }}>
                          <div style={{ flex: splitDirection === 'horizontal' ? `0 0 ${subRoomAPct || 50}%` : `0 0 ${subRoomAPct || 50}%`, background: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 16 }}>
                            {ROOM_LIBRARY[subRoomA]?.shortLabel} ({subRoomAPct || 50}%)
                          </div>
                          <div style={{
                            flex: 1,
                            background: isLight || isWarm ? 'rgba(79, 115, 136, 0.10)' : isMix ? 'rgba(94, 156, 168, 0.14)' : 'rgba(255,255,255,0.1)',
                            borderRadius: 8, display: 'flex',
                            border: `2px dashed ${isLight ? '#1F6B7E' : isWarm ? '#4F7388' : isMix ? '#5E9CA8' : '#93C5FD'}`,
                            alignItems: 'center', justifyContent: 'center',
                            color: isLight ? '#1F6B7E' : isWarm ? '#3D5E73' : isMix ? '#5E9CA8' : '#93C5FD',
                            fontWeight: 800,
                            animation: 'pulse 1.5s infinite',
                          }}>
                            ? Select Below
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, justifyContent: 'center', alignContent: 'start', maxWidth: '1200px', width: '100%', flex: 1, overflowY: 'auto', padding: '10px' }}>
                          {pagedRoomIds.filter(r => r !== subRoomA).map(rid => roomCard(`ce-sB-${rid}`, rid, () => { setSubRoomB(rid); setSplitStep('confirm'); triggerReadingCooldown(); onSpeak('Confirm your split decision.'); }, 2000))}
                        </div>
                      </>
                    )}
                    {splitStep === 'confirm' && subRoomA && subRoomB && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, animation: 'fadeIn 0.3s ease-out' }}>
                        <div style={{ fontSize: 16, color: isLight || isWarm ? T_textSub : isMix ? T_textSub : '#94A3B8', fontWeight: 700 }}>Review &amp; Confirm Your Split</div>

                        {/* FINAL PREVIEW BOX */}
                        <div style={{ width: '500px', height: '300px', background: T_panelBg, border: `5px solid ${T_panelBorder}`, borderRadius: '24px', display: 'flex', flexDirection: splitDirection === 'horizontal' ? 'column' : 'row', overflow: 'hidden', padding: 8, gap: 4, flexShrink: 0, boxShadow: '0 8px 18px rgba(0,0,0,0.18)' }}>
                          <div style={{ flex: splitDirection === 'horizontal' ? `0 0 ${subRoomAPct || 50}%` : `0 0 ${subRoomAPct || 50}%`, background: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 22, textAlign: 'center', padding: '10px' }}>
                            {ROOM_LIBRARY[subRoomA]?.shortLabel} <br />({subRoomAPct || 50}%)
                          </div>
                          <div style={{ flex: 1, background: ROOM_LIBRARY[subRoomB]?.color || '#64748B', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 22, textAlign: 'center', padding: '10px' }}>
                            {ROOM_LIBRARY[subRoomB]?.shortLabel} <br />({100 - (subRoomAPct || 50)}%)
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 40, marginTop: 10 }}>
                          {bigBtn('ce-cancel-split', '✕ CANCEL',
                            isLight ? '#8C3F3F' : isMix ? '#D68264' : '#EF5350',
                            isLight ? 'rgba(140, 63, 63, 0.10)' : isMix ? 'rgba(214, 130, 100, 0.12)' : 'rgba(239,83,80,0.1)',
                            isLight ? 'rgba(140, 63, 63, 0.55)' : isMix ? 'rgba(214, 130, 100, 0.55)' : 'rgba(239,83,80,0.4)',
                            () => { setSplitStep('roomB'); setSubRoomB(null); triggerReadingCooldown(); onSpeak('Cancelled. Pick second room again.'); }, 1500, { width: '220px', height: '140px', fontSize: '24px' })}

                          {bigBtn('ce-confirm-split', '✔️ CONFIRM SPLIT',
                            isLight ? T_textInverse : isMix ? T_textInverse : '#2DD4BF',
                            isLight ? T_accent : isMix ? T_accent : 'rgba(45,212,191,0.15)',
                            isLight ? T_accent : isMix ? T_accent : 'rgba(45,212,191,0.5)',
                            () => { confirmSplitFull(subRoomB); }, 2500, { width: '320px', height: '140px', fontSize: '28px', boxShadow: isLight ? '0 8px 22px rgba(31, 107, 126, 0.30)' : '0 0 30px rgba(45,212,191,0.3)' })}
                        </div>
                      </div>
                    )}
                  </>
                  );
                })()}

                {/* ── WALLS TOOL ── */}
                {refinementArmed && cellEditorTool === 'walls' && (
                  <>
                    <div style={{ fontSize: 'clamp(22px, 2.6vh, 28px)', fontWeight: 900, color: isLight ? '#1F6B7E' : isMix ? '#5E9CA8' : '#6EE7B7', letterSpacing: '0.5px' }}>{'▐'} WALLS &mdash; {roomLabel}</div>
                    {!cellEditorWallEdge ? (
                      <>
                        <div style={{ fontSize: 16, color: '#94A3B8' }}>Select an edge</div>
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                          {bigBtn('ce-wall-top', 'TOP', '#6EE7B7', 'rgba(45,212,191,0.06)', 'rgba(45,212,191,0.3)', () => { setCellEditorWallEdge('top'); triggerReadingCooldown(); }, 1200)}
                          {bigBtn('ce-wall-bottom', 'BOTTOM', '#6EE7B7', 'rgba(45,212,191,0.06)', 'rgba(45,212,191,0.3)', () => { setCellEditorWallEdge('bottom'); triggerReadingCooldown(); }, 1200)}
                          {bigBtn('ce-wall-left', 'LEFT', '#6EE7B7', 'rgba(45,212,191,0.06)', 'rgba(45,212,191,0.3)', () => { setCellEditorWallEdge('left'); triggerReadingCooldown(); }, 1200)}
                          {bigBtn('ce-wall-right', 'RIGHT', '#6EE7B7', 'rgba(45,212,191,0.06)', 'rgba(45,212,191,0.3)', () => { setCellEditorWallEdge('right'); triggerReadingCooldown(); }, 1200)}
                        </div>
                        <div style={{ width: '180px', height: '120px', borderRadius: '16px', border: `3px solid ${roomColor}`, background: `${roomColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: roomColor }}>{roomLabel}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 16, color: '#94A3B8' }}>{cellEditorWallEdge.toUpperCase()} edge — Choose wall type</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', maxWidth: '1000px' }}>
                          {bigBtn('ce-wt-full', '█ FULL\nWALL', '#6EE7B7', 'rgba(45,212,191,0.1)', 'rgba(45,212,191,0.3)', () => { handleWall('full_wall'); setCellEditorWallEdge(null); setCellEditorTool(null); }, 1500, { width: '200px', height: '140px', fontSize: '20px' })}
                          {bigBtn('ce-wt-glass', '▒ GLASS\nWALL', '#6EE7B7', 'rgba(45,212,191,0.1)', 'rgba(45,212,191,0.3)', () => { handleWall('half_wall_glass'); setCellEditorWallEdge(null); setCellEditorTool(null); }, 1500, { width: '200px', height: '140px', fontSize: '20px' })}
                          {bigBtn('ce-wt-arch', '⌒ OPEN\nARCHWAY', '#6EE7B7', 'rgba(45,212,191,0.1)', 'rgba(45,212,191,0.3)', () => { handleWall('open_archway'); setCellEditorWallEdge(null); setCellEditorTool(null); }, 1500, { width: '200px', height: '140px', fontSize: '20px' })}
                          {bigBtn('ce-wt-remove', '✕ REMOVE\nWALL', '#EF5350', 'rgba(239,83,80,0.08)', 'rgba(239,83,80,0.3)', () => { handleWall('no_wall'); setCellEditorWallEdge(null); setCellEditorTool(null); }, 1500, { width: '200px', height: '140px', fontSize: '20px' })}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ── ROTATE TOOL ── */}
                {refinementArmed && cellEditorTool === 'rotate' && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#F59E0B' }}>
                      {roomId === 'staircase' || roomId === 'diningStaircase' ? '↳ STAIRS LAYOUT' : '↻ ROTATE'} — {roomLabel}
                    </div>

                    {roomId === 'staircase' || roomId === 'diningStaircase' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                        {bigBtn('ce-lo-left', 'Stairs Left', currentComboLayout === 'left' ? '#FFF' : '#F59E0B', currentComboLayout === 'left' ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.1)', currentComboLayout === 'left' ? '#F59E0B' : 'rgba(245,158,11,0.3)', () => setCurrentComboLayout('left'), 800, { width: '160px', height: '100px', fontSize: '18px' })}
                        {bigBtn('ce-lo-right', 'Stairs Right', currentComboLayout === 'right' ? '#FFF' : '#F59E0B', currentComboLayout === 'right' ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.1)', currentComboLayout === 'right' ? '#F59E0B' : 'rgba(245,158,11,0.3)', () => setCurrentComboLayout('right'), 800, { width: '160px', height: '100px', fontSize: '18px' })}
                        {bigBtn('ce-lo-top', 'Stairs Top', currentComboLayout === 'top' ? '#FFF' : '#F59E0B', currentComboLayout === 'top' ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.1)', currentComboLayout === 'top' ? '#F59E0B' : 'rgba(245,158,11,0.3)', () => setCurrentComboLayout('top'), 800, { width: '160px', height: '100px', fontSize: '18px' })}
                        {bigBtn('ce-lo-bottom', 'Stairs Bottom', currentComboLayout === 'bottom' ? '#FFF' : '#F59E0B', currentComboLayout === 'bottom' ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.1)', currentComboLayout === 'bottom' ? '#F59E0B' : 'rgba(245,158,11,0.3)', () => setCurrentComboLayout('bottom'), 800, { width: '160px', height: '100px', fontSize: '18px' })}
                      </div>
                    ) : (
                      <>
                        <div style={{ width: '180px', height: '180px', borderRadius: '20px', border: '2px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.4s ease', transform: `rotate(${currentRotation}deg)` }}>
                          <div style={{ fontSize: '48px', fontWeight: 900, color: '#F59E0B' }}>{roomLabel}</div>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#FFF' }}>{currentRotation}°</div>
                        <div style={{ display: 'flex', gap: 24 }}>
                          {bigBtn('ce-rot-ccw', '↺ -90°', '#F59E0B', 'rgba(245,158,11,0.1)', 'rgba(245,158,11,0.3)', () => setCurrentRotation(prev => ((prev - 90 + 360) % 360) as 0 | 90 | 180 | 270), 800, { width: '140px', height: '90px', fontSize: '22px' })}
                          {bigBtn('ce-rot-cw', '↻ +90°', '#F59E0B', 'rgba(245,158,11,0.1)', 'rgba(245,158,11,0.3)', () => setCurrentRotation(prev => ((prev + 90) % 360) as 0 | 90 | 180 | 270), 800, { width: '140px', height: '90px', fontSize: '22px' })}
                        </div>
                      </>
                    )}

                    <div style={{ display: 'flex', gap: 20 }}>
                      {bigBtn('ce-rot-apply', '✓ APPLY', '#497775', 'rgba(16,185,129,0.12)', 'rgba(16,185,129,0.4)', confirmRotation, 1000, { width: '180px', height: '70px' })}
                    </div>
                  </>
                )}

                {/* ── EXPAND TOOL ── */}
                {refinementArmed && cellEditorTool === 'expand' && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#497775' }}>⇔ EXPAND — {roomLabel}</div>
                    <div style={{ fontSize: 14, color: '#94A3B8' }}>Expand into an empty neighbor</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 140px)', gridTemplateRows: 'repeat(3, 90px)', gap: 12 }}>
                      <div />
                      {bigBtn('ce-exp-up', '↑ UP', canExpandDir('up') ? '#497775' : '#334155', canExpandDir('up') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('up') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('up') && confirmExpand('up'), 1200, { width: '140px', height: '90px' })}
                      <div />
                      {bigBtn('ce-exp-left', '← LEFT', canExpandDir('left') ? '#497775' : '#334155', canExpandDir('left') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('left') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('left') && confirmExpand('left'), 1200, { width: '140px', height: '90px' })}
                      <div style={{ width: '140px', height: '90px', borderRadius: '16px', border: `2px solid ${roomColor}`, background: `${roomColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, color: roomColor }}>{roomLabel}</div>
                      {bigBtn('ce-exp-right', 'RIGHT →', canExpandDir('right') ? '#497775' : '#334155', canExpandDir('right') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('right') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('right') && confirmExpand('right'), 1200, { width: '140px', height: '90px' })}
                      <div />
                      {bigBtn('ce-exp-down', '↓ DOWN', canExpandDir('down') ? '#497775' : '#334155', canExpandDir('down') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('down') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('down') && confirmExpand('down'), 1200, { width: '140px', height: '90px' })}
                      <div />
                    </div>
                  </>
                )}
              </div>

              {/* ══ RIGHT: TOOL SIDEBAR (240px) ══ */}
              <div style={{ width: 240, flexShrink: 0, background: T_panelBg, borderLeft: `2px solid ${T_panelBorderSoft}`, display: 'flex', flexDirection: 'column', padding: '16px 14px', gap: 12 }}>
                {/* #4 — TOOLS label raised to 16px */}
                <div style={{ fontSize: 16, fontWeight: 800, color: T_textDim, letterSpacing: 2, textAlign: 'center', marginBottom: 8 }}>TOOLS</div>
                {refinementArmed && toolSideBtn('ts-split', '✂', 'SPLIT', 'split', '#C4B5FD', () => { openSplitOverlay(); triggerReadingCooldown(); })}
                {refinementArmed && toolSideBtn('ts-walls', '▐', 'WALLS', 'walls', '#6EE7B7')}
                {refinementArmed && toolSideBtn('ts-rotate', '↻', 'ROTATE', 'rotate', '#F59E0B', () => { openRotateOverlay(); triggerReadingCooldown(); })}
                {refinementArmed && toolSideBtn('ts-expand', '⇔', 'EXPAND', 'expand', '#497775', () => { openExpandOverlay(); triggerReadingCooldown(); })}
                <div style={{ flex: 1 }} />
                {refinementArmed && hasCellRefinement && (
                  <GazeButton id="ts-reset" gazeEnabled={isGazeEnabled && !readingCooldown} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                    onClick={resetCellRefinements}
                    style={{ width: '100%', height: '80px', borderRadius: '14px', border: `2px solid ${isLight ? 'rgba(140, 63, 63, 0.42)' : isMix ? 'rgba(214, 130, 100, 0.42)' : 'rgba(239,83,80,0.3)'}`, background: isLight ? 'rgba(140, 63, 63, 0.10)' : isMix ? 'rgba(214, 130, 100, 0.10)' : 'rgba(239,83,80,0.06)', color: isLight ? '#8C3F3F' : isMix ? '#D68264' : '#EF5350', fontSize: '15px', fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0 10px', flexShrink: 0 }}>
                    <span style={{ fontSize: '24px' }}>✕</span>
                    <span>RESET</span>
                  </GazeButton>
                )}
                <GazeButton id="ts-exit" gazeEnabled={isGazeEnabled && !readingCooldown} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                  onClick={() => { setCellEditorOpen(false); setCellEditorTool(null); setRefinementArmed(false); onSpeak('Editor closed.'); }}
                  style={{ width: '100%', height: '80px', borderRadius: '14px', border: isLight ? `1.5px solid ${lightColors.border.main}` : isMix ? '2px solid rgba(180,147,98,0.32)' : '2px solid rgba(255,255,255,0.08)', background: isLight ? lightColors.background.elevated : isMix ? 'rgba(36, 31, 24, 0.92)' : 'rgba(255,255,255,0.03)', color: T_textMain, fontSize: '15px', fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0 10px', flexShrink: 0, marginBottom: '24px' }}>
                  <span style={{ fontSize: '24px' }}>←</span>
                  <span>EXIT</span>
                </GazeButton>
              </div>
            </div>
          </div >
        );
      })()}

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
        @keyframes mode-fade-in {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Smooth state transitions on grid cells — color/border changes
           glide rather than snap, giving the canvas a polished feel. */
        .cmap-cell-anim { transition: background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, opacity 220ms ease; }

        /* Refinement / placement mode swap fades the action strip in */
        .cmap-mode-fade { animation: mode-fade-in 200ms ease-out both; }
      `}</style>

      {/* Room change toast — brief 2s notification */}
      {roomToast && (
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
            background: T_panelBg,
            border: `2px solid ${roomToast.color}55`,
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
                fontSize: 'clamp(30px, 4vh, 46px)', fontWeight: 800,
                color: '#F8FAFC', letterSpacing: '1px', lineHeight: 1.1,
              }}>
                {roomToast.name.toUpperCase()}
              </span>
              <span style={{
                fontSize: 'clamp(15px, 2vh, 21px)', fontWeight: 600,
                color: 'rgba(148, 163, 184, 0.8)', lineHeight: 1,
              }}>
                Room {roomToast.index} of {roomToast.total}
              </span>
            </div>
          </div>
        </div>
      )}

      {
        saveToast && (
          <div style={{ position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: '#0F2A1F', border: '2px solid #10B981', borderRadius: '16px', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#497775', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#FFF', fontSize: '16px', fontWeight: 700 }}>✓</span></div>
            <span style={{ color: T_textMain, fontSize: '18px', fontWeight: 800 }}>Compass Map Saved!</span>
            <GazeButton id="toast-ok" gazeEnabled={isGazeEnabled} alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton" onClick={() => setSaveToast(false)}
              style={{ marginLeft: '16px', minWidth: '120px', height: '80px', background: T_cardBg, border: `2px solid ${T_panelBorderSoft}`, borderRadius: '14px', color: T_textMain, fontSize: '18px', fontWeight: 700 }}>
              OK
            </GazeButton>
          </div>
        )
      }

      {
        showFloorPlanViewer && compiledPayload && (
          <FloorPlanViewerModal
            compassData={compiledPayload}
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
