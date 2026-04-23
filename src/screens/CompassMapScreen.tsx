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
import BaseGazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { ArchitecturalCell } from '../components/ArchitecturalCell';
import { FloorPlanViewerModal } from '../components/FloorPlanViewerModal';
import { useDwellTime } from '../contexts/DwellTimeContext';
import { DEFAULT_DWELL_TIMES } from '../config/dwellTimeConfig';
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

// ─── Theme — AAC Compliant: Matte, High-Contrast, No Glass ──

const THEME = {
  bg: '#0B1120',
  panelBg: '#0F172A',
  cardBg: '#1E293B',
  border: 'rgba(100, 116, 139, 0.2)',
  accent: '#2DD4BF',
  text: '#FFFFFF',
  textSub: '#94A3B8',
  textDim: '#64748B',
  success: '#10B981',
  danger: '#EF5350',
  info: '#64B5F6',
  warning: '#FBBF24',
  road: '#38BDF8',
  cellEmpty: 'rgba(30, 41, 59, 0.85)',
  cellEmptyBorder: 'rgba(148, 163, 184, 0.35)',
  cellEmptyText: '#FFFFFF',
  cellArmed: 'rgba(20, 60, 55, 0.9)',
  cellArmedBorder: 'rgba(45, 212, 191, 0.6)',
};

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
];

type FoundationKey = 'facing' | 'plotWidth' | 'plotDepth' | 'plotType' | 'numFloors' | 'numBedrooms';

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
    foundation: { facing: null, plotWidth: null, plotDepth: null, plotType: null, numFloors: null, numBedrooms: null },
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

const CompassRose: React.FC<{ facing: string }> = ({ facing }) => {
  const rotMap: Record<string, number> = { North: 0, South: 180, East: 90, West: 270 };
  return (
    <div style={{
      position: 'absolute', top: '6px', right: '6px', zIndex: 2,
      width: '40px', height: '40px', borderRadius: '50%',
      background: '#0F172A', border: '1px solid rgba(100,116,139,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '9px', color: '#94A3B8', lineHeight: 1,
    }}>
      <div style={{ transform: `rotate(${rotMap[facing] || 0}deg)`, textAlign: 'center' }}>
        <div style={{ color: '#EF5350', fontWeight: 700, fontSize: '10px' }}>N</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '26px', padding: '1px 0' }}><span>W</span><span>E</span></div>
        <div style={{ fontSize: '10px' }}>S</div>
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
  const { isLight } = useTheme();
  const ws = useWS();
  const { settings: dwellSettings } = useDwellTime();

  const compassDwellScale = useMemo(() => {
    const base = DEFAULT_DWELL_TIMES.compassMapAction || 1;
    const target = dwellSettings.compassMapAction || base;
    return Math.max(0.4, target / base);
  }, [dwellSettings.compassMapAction]);

  const GazeButton = useCallback((props: React.ComponentProps<typeof BaseGazeButton>) => {
    const rawDwell = typeof props.dwellTime === 'number'
      ? props.dwellTime
      : DEFAULT_DWELL_TIMES.compassMapAction;
    const scaledDwell = Math.max(500, Math.round(rawDwell * compassDwellScale));
    return <BaseGazeButton {...props} dwellTime={scaledDwell} />;
  }, [compassDwellScale]);

  const initialQueue = useMemo(() => generateGFQueue(), []);
  const [state, dispatch] = useReducer(compassReducer, initialQueue, createInitialState);

  const [hoveredCell, setHoveredCell] = useState<GridCellKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuConfirmRemove, setMenuConfirmRemove] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);
  const [expansionReady, setExpansionReady] = useState(false);
  const [surveyLoading, setSurveyLoading] = useState(true);
  const [dwellingCell, setDwellingCell] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [showFloorPlanViewer, setShowFloorPlanViewer] = useState(false);
  const [compiledPayload, setCompiledPayload] = useState<CompassMapPayload | null>(null);
  const [foundationReady, setFoundationReady] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ cell: GridCellKey, oldRoomId: string, newRoomId: string } | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [navHidden, setNavHidden] = useState(false);

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
  const dwellAnimRef = useRef<number>(0);
  const dwellStartRef = useRef<number>(0);
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
        facing: 'South',
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
  useEffect(() => {
    let restoredFromDraft = false;
    try {
      const rawDraft = sessionStorage.getItem(COMPASS_DRAFT_KEY);
      const rawBackup = localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY);
      const rawLastBackup = localStorage.getItem(COMPASS_LAST_BACKUP_KEY);
      const draftToLoad = pickBestDraftRaw([rawDraft, rawBackup, rawLastBackup]);
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

  // ── Dwell-to-Select Timer (scaled by Compass setting) ─────
  const CELL_DWELL_MS = useMemo(
    () => Math.max(500, Math.round(2000 * compassDwellScale)),
    [compassDwellScale],
  );

  const startCellDwell = useCallback((cellKey: string) => {
    setDwellingCell(cellKey);
    setDwellProgress(0);
    dwellStartRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - dwellStartRef.current;
      const pct = Math.min((elapsed / CELL_DWELL_MS) * 100, 100);
      setDwellProgress(pct);
      if (pct < 100) dwellAnimRef.current = requestAnimationFrame(tick);
    };
    dwellAnimRef.current = requestAnimationFrame(tick);
  }, [CELL_DWELL_MS]);

  const cancelCellDwell = useCallback(() => {
    if (dwellAnimRef.current) cancelAnimationFrame(dwellAnimRef.current);
    dwellAnimRef.current = 0;
    setDwellingCell(null);
    setDwellProgress(0);
  }, []);

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
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(45,212,191,0.3)', borderTopColor: THEME.accent, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ color: THEME.textSub, fontSize: 'clamp(13px, 1.5vh, 16px)' }}>Loading survey data...</span>
        </div>
      );
    }
    const q = FOUNDATION_QUESTIONS[state.foundationStep];
    if (!q) return null;
    const stepNum = state.foundationStep + 1;

    return (
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* LEFT: Question */}
        <div style={{ width: 'clamp(220px, 24%, 380px)', flexShrink: 0, borderRight: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column', padding: 'clamp(18px, 3vh, 36px) clamp(16px, 1.8vw, 28px)', overflowY: 'auto', background: THEME.panelBg }}>
          <div style={{ fontSize: 'clamp(15px, 1.9vh, 21px)', fontWeight: 800, color: THEME.accent, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 'clamp(10px, 1.5vh, 18px)' }}>FOUNDATION</div>
          <div style={{ fontSize: 'clamp(20px, 2.8vh, 30px)', fontWeight: 700, lineHeight: 1.35, color: THEME.text, marginBottom: 'clamp(8px, 1vh, 14px)' }}>{q.text}</div>
          {q.subtext && <div style={{ fontSize: 'clamp(14px, 1.7vh, 19px)', color: THEME.textSub, lineHeight: 1.5 }}>{q.subtext}</div>}
          <div style={{ fontSize: 'clamp(13px, 1.5vh, 17px)', color: THEME.textDim, marginTop: 'auto', paddingTop: '12px' }}>Question {stepNum} of {FOUNDATION_QUESTIONS.length}</div>
        </div>
        {/* RIGHT: Options + Command Bar */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(18px, 3vh, 36px) clamp(20px, 2.5vw, 40px)', paddingBottom: 'clamp(235px, 33vh, 370px)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(12px, 1.5vh, 20px)' }}>
              {q.options.map((opt) => (
                <GazeButton key={opt} id={`fq-${state.foundationStep}-${opt}`} gazeEnabled={isGazeEnabled && foundationReady} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={900}
                  onClick={() => handleFoundationAnswer(opt)}
                  style={{ flexBasis: q.columns === 2 ? 'calc(50% - 12px)' : 'calc(33.33% - 16px)', minWidth: '140px', minHeight: 'clamp(60px, 8vh, 95px)', padding: 'clamp(14px, 1.8vh, 22px) clamp(14px, 1.6vw, 24px)', borderRadius: '14px', background: foundationReady ? THEME.cardBg : 'rgba(30,41,59,0.45)', border: `2px solid ${foundationReady ? THEME.border : 'rgba(100,116,139,0.25)'}`, color: foundationReady ? THEME.text : THEME.textDim, fontSize: 'clamp(16px, 2vh, 22px)', fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {opt}
                </GazeButton>
              ))}
            </div>
          </div>
          {/* Command bar */}
          <div style={{ position: 'absolute', bottom: 'clamp(78px, 12vh, 170px)', left: '50%', transform: 'translateX(-50%)', width: 'min(97%, 1180px)', padding: 'clamp(8px, 1.2vh, 14px) clamp(12px, 1.8vw, 24px)', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 'clamp(30px, 4vw, 56px)', rowGap: 'clamp(22px, 3vh, 34px)', zIndex: 10 }}>
            {!foundationReady && (
              <>
                <GazeButton id="f-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
                  onClick={() => { setFoundationReady(true); onSpeak('Ready. Please choose an option.'); }}
                  style={{ padding: 'clamp(16px, 2.4vh, 26px) clamp(38px, 4.4vw, 62px)', minHeight: 'clamp(84px, 11.5vh, 118px)', minWidth: 'clamp(240px, 24vw, 350px)', borderRadius: '20px', fontSize: 'clamp(26px, 3.4vh, 36px)', fontWeight: 900, letterSpacing: '0.5px', background: 'rgba(45,212,191,0.12)', border: `3px solid ${THEME.accent}`, color: THEME.accent }}>
                  READY
                </GazeButton>
                {!showRestoreConfirm && (
                  !!localStorage.getItem(COMPASS_PRIMARY_BACKUP_KEY)
                  || !!localStorage.getItem(COMPASS_LAST_BACKUP_KEY)
                ) && (
                  <GazeButton id="f-restore" gazeEnabled={isGazeEnabled && !isConfirmationOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={900}
                    onClick={() => setShowRestoreConfirm(true)}
                    style={{ padding: 'clamp(16px, 2.4vh, 26px) clamp(32px, 4vw, 56px)', minHeight: 'clamp(84px, 11.5vh, 118px)', minWidth: 'clamp(320px, 34vw, 460px)', borderRadius: '20px', fontSize: 'clamp(24px, 3.1vh, 34px)', lineHeight: 1.1, textAlign: 'center', fontWeight: 900, background: THEME.cardBg, border: '3px solid #3B82F6', color: '#60A5FA' }}>
                    LOAD PREVIOUS SESSION
                  </GazeButton>
                )}
              </>
            )}
            {foundationReady && (
              <div style={{ fontSize: 'clamp(19px, 2.4vh, 26px)', color: THEME.accent, fontWeight: 800, padding: '10px 18px' }}>
                Select an option
              </div>
            )}
            {state.foundationStep > 0 && (
              <GazeButton id="f-back" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800} onClick={() => dispatch({ type: 'FOUNDATION_BACK' })}
                style={{ padding: 'clamp(14px, 2.1vh, 22px) clamp(34px, 3.8vw, 54px)', minHeight: 'clamp(78px, 10.6vh, 108px)', minWidth: 'clamp(200px, 20vw, 290px)', borderRadius: '20px', fontSize: 'clamp(24px, 3.1vh, 32px)', fontWeight: 800, background: THEME.cardBg, border: `3px solid ${THEME.border}`, color: THEME.textSub }}>
                {'\u2190'} BACK
              </GazeButton>
            )}
            <GazeButton id="f-skip" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
              onClick={() => { const dflt = q.parse ? q.parse(q.options[0]) : q.options[0]; dispatch({ type: 'SET_FOUNDATION', key: q.key as FoundationKey, value: dflt }); onSpeak(`Skipped. Default: ${q.options[0]}.`); if (state.foundationStep === FOUNDATION_QUESTIONS.length - 1) dispatch({ type: 'COMPLETE_FOUNDATION', queue: generateGFQueue(), numFloors: state.foundation.numFloors || 'Single Floor' }); }}
              style={{ padding: 'clamp(14px, 2.1vh, 22px) clamp(34px, 3.8vw, 54px)', minHeight: 'clamp(78px, 10.6vh, 108px)', minWidth: 'clamp(200px, 20vw, 290px)', borderRadius: '20px', fontSize: 'clamp(24px, 3.1vh, 32px)', fontWeight: 800, background: THEME.cardBg, border: `3px solid ${THEME.border}`, color: THEME.textSub }}>
              SKIP {'\u2192'}
            </GazeButton>
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

    // Common style for strip buttons
    const stripBtnStyle = (active: boolean, specialColor?: string) => ({
      flex: 1, width: '100%', borderRadius: 0, margin: 0,
      border: 'none',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      background: active ? (specialColor ? specialColor : 'rgba(255,255,255,0.08)') : 'transparent',
      color: active ? '#F8FAFC' : '#64748B',
      fontSize: '24px', fontWeight: 900,
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
      gap: '8px',
      transition: 'all 0.2s ease',
    });

    return (
      <div style={{
        position: 'absolute',
        right: '48px', // Shifted inward for better reachability
        top: '190px', // Pushed down to reserve space for NAV controls above it
        width: '240px', height: 'calc(100% - 310px)', // Shorter to pull bottom up
        background: '#111827', // Deep charcoal
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '24px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        zIndex: 50,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.4)',
        pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto',
      }}>
        {refinementMode ? (
          <>
            {/* REFINEMENT MODE — 3-button layout (no dedicated EXIT) */}
            <GazeButton id="strip-open-editor" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
              onClick={() => {
                if (!selectedRefinementCell) { onSpeak('Select a cell first.'); return; }
                setCellEditorOpen(true); setCellEditorTool(null); onSpeak('Cell editor opened. Choose a tool.');
              }}
              style={{
                ...stripBtnStyle(!!selectedRefinementCell, 'rgba(45,212,191,0.2)'),
                color: selectedRefinementCell ? '#2DD4BF' : '#475569',
                minHeight: '132px',
              }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: selectedRefinementCell ? '#8BE8DC' : '#64748B' }}>REFINE MODE</div>
              <div style={{ fontSize: '24px' }}>🛠</div>
              <div>EDIT</div>
              {/* #5 — larger SELECT CELL cue */}
              {!selectedRefinementCell && <div style={{ fontSize: '16px', color: '#2DD4BF', fontWeight: 800, letterSpacing: '0.5px', marginTop: '4px' }}>👁 SELECT CELL</div>}
            </GazeButton>

            {/* GENERATE REFINED PLAN — always available in refinement mode */}
            <GazeButton id="strip-generate-refined" gazeEnabled={isGazeEnabled && state.placements.length >= 1 && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1000}
              onClick={() => {
                if (state.placements.length < 1) { onSpeak('Place at least 1 room first.'); return; }
                handleGenerateFloorPlan();
              }}
              style={{ ...stripBtnStyle(state.placements.length >= 1, 'rgba(16,185,129,0.15)'), color: state.placements.length >= 1 ? '#10B981' : '#334155', minHeight: '132px' }}>
              <div style={{ fontSize: '24px' }}>📐</div>
              <div style={{ textAlign: 'center', lineHeight: 1.1, fontSize: '18px' }}>GENERATE{'\n'}PLAN</div>
            </GazeButton>
          </>
        ) : (
          <>
            {/* NORMAL PLACEMENT BUTTONS */}
            {/* BUTTON 0: FLOOR TOGGLE */}
            <GazeButton id="strip-floor" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={900}
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
              style={stripBtnStyle(true, state.currentFloor === 'ground' ? 'rgba(45,212,191,0.1)' : 'rgba(100,181,246,0.1)')}>
              {isMultiFloor ? (
                <>
                  <div style={{ fontSize: '24px', opacity: 0.8 }}>{state.currentFloor === 'ground' ? 'GND' : '1F'}</div>
                  <div style={{ fontSize: '12px', opacity: 0.5, fontWeight: 600 }}>SWITCH</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '24px', opacity: 0.8 }}>GND</div>
                  <div style={{ fontSize: '11px', opacity: 0.5, fontWeight: 600, color: THEME.accent }}>+ ADD 1F</div>
                </>
              )}
            </GazeButton>
            {/* BUTTON 1: ROOMS (MENU) */}
            <GazeButton id="strip-rooms" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
              onClick={() => { setMenuOpen(true); onSpeak('Components menu.'); }}
              style={stripBtnStyle(true, 'linear-gradient(180deg, rgba(56,189,248,0.1) 0%, rgba(56,189,248,0.05) 100%)')}>
              <div style={{ fontSize: '28px', marginBottom: '-4px' }}>☰</div>
              <div>ROOMS</div>
            </GazeButton>

            {/* BUTTON 2: NEXT / KEEP 1 */}
            {state.pendingExpansion ? (
              <GazeButton id="strip-keep" gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
                onClick={() => dws({ type: 'EXPAND_ROOM', direction: 'none' })}
                style={{ ...stripBtnStyle(true, 'rgba(234, 179, 8, 0.15)'), color: '#FACC15' }}>
                <div style={{ fontSize: '24px' }}>TOP</div>
                <div>KEEP 1</div>
              </GazeButton>
            ) : (
              <GazeButton id="strip-next" gazeEnabled={isGazeEnabled && controlsUnlocked && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={900}
                onClick={() => {
                  if (isConfirmationOpen) return;
                  if (!controlsUnlocked) { onSpeak('Press READY first.'); return; }
                  dws({ type: 'NEXT_ROOM' });
                }}
                style={{
                  ...stripBtnStyle(controlsUnlocked, 'rgba(45,212,191,0.1)'),
                  color: controlsUnlocked ? '#2DD4BF' : '#475569'
                }}>
                <div style={{ fontSize: '28px' }}>→</div>
                <div>NEXT</div>
              </GazeButton>
            )}

            {/* BUTTON 3: GENERATE */}
            <GazeButton id="strip-generate" gazeEnabled={isGazeEnabled && controlsUnlocked && state.placements.length >= 2 && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1000}
              onClick={() => {
                if (isConfirmationOpen) return;
                if (!controlsUnlocked) { onSpeak('Press READY first.'); return; }
                if (state.placements.length < 2) { onSpeak('Place at least 2 rooms.'); return; }
                setConfirmGenerate(true);
                onSpeak('Do you really want to generate the floor plan?');
              }}
              style={{
                ...stripBtnStyle(controlsUnlocked && state.placements.length >= 2, 'rgba(16,185,129,0.15)'),
                borderBottom: 'none',
                color: (controlsUnlocked && state.placements.length >= 2) ? '#10B981' : '#334155'
              }}>
              <div style={{ fontSize: '24px' }}>📝</div>
              <div style={{ textAlign: 'center', lineHeight: 1.1 }}>GENERATE{'\n'}PLAN</div>
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
            dwellTime={1000}
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
              color: refinementMode ? '#FFFFFF' : '#8B5CF6',
              border: refinementMode ? '2px solid #8B5CF6' : '1px solid rgba(139,92,246,0.3)',
              background: refinementMode ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.08)',
              borderBottom: 'none',
            }}
          >
            <div style={{ fontSize: '18px' }}>✂</div>
            <span>REFINE MAP</span>
          </GazeButton>
        )}
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
      padding: '10px 320px 100px 40px', // Padded for Strip (240) + Inset (48) + Margins (32)
      pointerEvents: (isConfirmationOpen || menuOpen) ? 'none' : 'auto',
    }}>

      {/* =========================================================
            MAP REFINEMENT READY GATE
            Blocks grid clicking until user is ready
        ========================================================= */}
      {!mapRefinementArmed && (state.phase === 'review' || state.phase === 'floor_transition') && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7, 17, 30, 0.7)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#0D1B2E', padding: '40px 60px', borderRadius: '24px', border: '3px solid rgba(45,212,191,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#94A3B8', textAlign: 'center', maxWidth: 400 }}>
              Look at READY to select a room for refinement.
            </div>
            <GazeButton id="map-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1500}
              onClick={() => { setMapRefinementArmed(true); onSpeak('Select a room to refine.'); }}
              style={{ width: '280px', height: '140px', borderRadius: '24px', background: 'rgba(45,212,191,0.15)', border: `4px solid #2DD4BF`, color: '#2DD4BF', fontSize: '32px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(45,212,191,0.2)' }}>
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
        {/* Compound Wall */}
        <div style={{
          flex: 1, width: '100%',
          display: 'flex', flexDirection: 'column',
          border: state.armed ? '5px solid #2DD4BF' : '5px solid #2E4B3A',
          borderRadius: '12px 12px 0 0',
          background: 'linear-gradient(180deg, #96C795 0%, #86B983 100%)',
          boxShadow: state.armed ? '0 0 25px rgba(45,212,191,0.15)' : '0 10px 30px rgba(0,0,0,0.3)', // Subtle glow
          overflow: 'hidden',
          position: 'relative',
          transition: 'all 0.4s ease',
        }}>
          <CompassRose facing={facing} />

          {/* Directions Labels */}
          <div style={{
            position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 3,
            padding: '4px 10px', borderRadius: '8px', background: 'rgba(15,23,42,0.8)', color: '#F8FAFC',
            fontSize: '12px', fontWeight: 800
          }}>BACK ({backDir})</div>
          <div style={{
            position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', zIndex: 3,
            padding: '4px 10px', borderRadius: '8px', background: 'rgba(15,23,42,0.8)', color: '#F8FAFC',
            fontSize: '12px', fontWeight: 800
          }}>LEFT ({sideLabels.left})</div>
          <div style={{
            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', zIndex: 3,
            padding: '4px 10px', borderRadius: '8px', background: 'rgba(15,23,42,0.8)', color: '#F8FAFC',
            fontSize: '12px', fontWeight: 800
          }}>RIGHT ({sideLabels.right})</div>

          {/* Grid */}
          <div style={{
            position: 'absolute', inset: '12px',
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
            gap: '2px',
            padding: '2px',
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
                  gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={2000}
                  onDwellStart={() => { setHoveredCell(cellKey); if (cellGaze) startCellDwell(cellKey); }}
                  onDwellCancel={() => { if (hoveredCell === cellKey) setHoveredCell(null); cancelCellDwell(); }}
                  onDwellComplete={() => { setHoveredCell(null); cancelCellDwell(); }}
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
                    ...(isHov && cellGaze ? { transform: 'scale(1.02)', zIndex: 10, boxShadow: '0 0 15px rgba(45,212,191,0.5)' } : {})
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
                        <div style={{ position: 'absolute', inset: 0, border: '3px solid #2DD4BF', boxShadow: 'inset 0 0 12px rgba(45,212,191,0.35)', zIndex: 15, pointerEvents: 'none', borderRadius: '2px' }} />
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
                        const edgeColor = edge.type === 'full_wall' ? '#2DD4BF' : edge.type === 'half_wall_glass' ? '#10B981' : edge.type === 'open_archway' ? '#FBBF24' : '#EF5350';
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
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#FBBF24', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '3px' }}>VOID</span>
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
                  {dwellingCell === cellKey && dwellProgress > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${dwellProgress}%`, height: '4px', background: '#2DD4BF', zIndex: 20 }} />
                  )}
                </GazeButton>
              );
            })}
          </div>
        </div>

        {/* Dead zone between grid row 4 and road — prevents accidental gaze cross-selection */}
        <div data-gaze="false" style={{ width: '100%', height: 'clamp(10px, 1.4vh, 18px)', flexShrink: 0, pointerEvents: 'none' }} />

        {/* Road Section */}
        {/* Road Section - Expanded Height + Embedded READY Button */}
        <div style={{
          width: '100%', height: 'clamp(104px, 11.5vh, 136px)', flexShrink: 0,
          marginBottom: '-16px',
          background: '#162038',
          border: state.armed ? '5px solid #2DD4BF' : '5px solid #2E4B3A',
          borderTop: 'none', borderRadius: '0 0 12px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: THEME.road, fontWeight: 900, fontSize: '18px', letterSpacing: '1px',
          position: 'relative'
        }}>
          {/* READY BUTTON - Left (~25% width = 1 cell width) */}
          {state.phase === 'placement' && (
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${100 / GRID_COLS}%`, padding: '6px' }}>
              <GazeButton
                id="ready-road-left"
                gazeEnabled={isGazeEnabled && !isConfirmationOpen && !menuOpen} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
                onClick={() => {
                  if (isConfirmationOpen) return;
                  if (state.armed) { dws({ type: 'DISARM_GRID' }); } else { dws({ type: 'ARM_GRID' }); }
                }}
                style={{
                  width: '100%', height: '100%',
                  borderRadius: '8px',
                  fontWeight: 900, fontSize: '22px', letterSpacing: '1px',
                  background: state.armed ? 'rgba(45,212,191,0.25)' : 'rgba(45,212,191,0.05)',
                  border: state.armed ? '3px solid #2DD4BF' : '2px solid rgba(45,212,191,0.2)',
                  color: state.armed ? '#FFFFFF' : 'rgba(45,212,191,0.6)',
                  boxShadow: state.armed ? '0 0 20px rgba(45,212,191,0.2)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}>
                READY
              </GazeButton>
            </div>
          )}

          {/* Road label + live coverage counter */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none' }}>
            <span>FRONT / ROAD ({facing}) – {pw} ft</span>
            {/* #9 — live coverage counter during placement */}
            {state.phase === 'placement' && (
              <span style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', fontWeight: 700, color: 'rgba(56,189,248,0.6)', letterSpacing: '0.5px' }}>
                {occupiedCount} / {16} cells placed · {coveragePercent}%
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
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '10px',
                  border: `2px solid ${currentRoom.color}33`,
                }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '4px',
                    background: currentRoom.color, flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.25)',
                    boxShadow: `0 0 8px ${currentRoom.color}40`,
                  }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{
                      fontSize: 'clamp(17px, 2.2vh, 24px)', fontWeight: 800,
                      color: '#F8FAFC', letterSpacing: '0.5px', lineHeight: 1.2,
                    }}>
                      {currentRoom.roomLabel.toUpperCase()}
                    </span>
                    {/* #7 — X of Y counter: min raised to 16px */}
                    <span style={{
                      fontSize: 'clamp(16px, 1.8vh, 20px)', fontWeight: 700,
                      color: 'rgba(56, 189, 248, 0.85)', lineHeight: 1,
                    }}>
                      {state.currentIndex + 1} of {state.componentQueue.length}
                    </span>
                  </div>
                </div>
              ) : state.currentIndex >= state.componentQueue.length ? (
                <div style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '10px',
                  border: '2px solid rgba(16, 185, 129, 0.25)',
                }}>
                  <span style={{
                    fontSize: 'clamp(17px, 2.2vh, 24px)', fontWeight: 900,
                    color: THEME.success, letterSpacing: '0.5px',
                  }}>
                    ✓ ALL PLACED
                  </span>
                  <span style={{
                    fontSize: 'clamp(12px, 1.5vh, 16px)', fontWeight: 600,
                    color: '#94A3B8',
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
        <div style={{ fontSize: 'clamp(22px, 3vh, 32px)', fontWeight: 800, color: '#FFFFFF', marginBottom: '16px' }}>Ground Floor Complete!</div>
        <div style={{ fontSize: 'clamp(14px, 1.8vh, 20px)', color: THEME.textSub, marginBottom: '32px' }}>{state.placements.length} rooms placed, {coveragePercent}% coverage</div>
        <div style={{ fontSize: 'clamp(18px, 2.2vh, 24px)', color: '#FFFFFF', marginBottom: '24px', fontWeight: 700 }}>Map First Floor?</div>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
          <GazeButton id="start-ff" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={900}
            onClick={() => { dispatch({ type: 'SWITCH_FLOOR', floor: 'first' }); onSpeak('Starting first floor. Place your rooms.'); }}
            style={{ padding: '16px 40px', minHeight: 'clamp(60px, 8vh, 80px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)', background: 'rgba(45,212,191,0.15)', border: `2px solid ${THEME.accent}`, color: THEME.accent }}>
            YES, MAP 1ST FLOOR
          </GazeButton>
          <GazeButton id="no-ff" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={900}
            onClick={() => { handleSave(); onSpeak('Saved ground floor only. Done.'); }}
            style={{ padding: '16px 40px', minHeight: 'clamp(60px, 8vh, 80px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)', background: THEME.cardBg, border: `2px solid ${THEME.border}`, color: THEME.textSub }}>
            NO, FINISH
          </GazeButton>
          <GazeButton id="gen-fp-transition" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1000}
            onClick={() => { handleSave(); handleGenerateFloorPlan(); }}
            style={{ padding: '16px 40px', minHeight: 'clamp(60px, 8vh, 80px)', borderRadius: '14px', fontWeight: 800, fontSize: 'clamp(16px, 2vh, 22px)', background: 'rgba(100,181,246,0.15)', border: '2px solid #64B5F6', color: '#64B5F6' }}>
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', pointerEvents: 'auto' }}>
          <div style={{ background: '#0F172A', border: `3px solid ${THEME.border}`, borderRadius: '24px', padding: '60px', maxWidth: '1000px', width: '90%', textAlign: 'center', boxShadow: '0 40px 80px rgba(0,0,0,0.8)' }}>
            <div style={{ fontSize: '36px', fontWeight: 900, color: '#FFFFFF', marginBottom: '32px' }}>Replace Room?</div>
            <div style={{ fontSize: '28px', color: '#CBD5E1', marginBottom: '50px', lineHeight: 1.5 }}>
              Do you really want to replace <span style={{ color: oldLib?.color || '#fff', fontWeight: 700 }}>{oldLib?.roomLabel}</span> with <span style={{ color: newLib?.color || '#fff', fontWeight: 700 }}>{newLib?.roomLabel}</span>?
            </div>
            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
              <GazeButton id="confirm-replace-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
                onClick={() => {
                  dws({ type: 'PLACE_ROOM', cell: confirmReplace.cell });
                  setConfirmReplace(null);
                }}
                style={{ padding: '38px 90px', minHeight: '126px', borderRadius: '24px', background: '#334155', border: '4px solid #F8FAFC', color: '#F8FAFC', fontSize: '38px', fontWeight: 900, minWidth: '390px' }}>
                YES
              </GazeButton>
              <GazeButton id="confirm-replace-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={600}
                onClick={() => setConfirmReplace(null)}
                style={{ padding: '38px 90px', minHeight: '126px', borderRadius: '24px', background: 'transparent', border: '4px solid #94A3B8', color: '#94A3B8', fontSize: '38px', fontWeight: 900, minWidth: '360px' }}>
                CANCEL
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }

    if (confirmGenerate) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(15px)', pointerEvents: 'auto' }}>
          <div style={{ background: '#020617', border: `6px solid ${THEME.border}`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 50px 100px rgba(0,0,0,0.9)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>⚠️</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: '#FFFFFF', marginBottom: '32px' }}>Finalize Floor Plan?</div>
            <div style={{ fontSize: '28px', color: '#E2E8F0', marginBottom: '50px', lineHeight: 1.6 }}>
              Are you sure you have completed and filled all the cells?
              <br />
              Do you really want to generate the floor plan now?
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-gen-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1000}
                onClick={() => {
                  setConfirmGenerate(false);
                  handleGenerateFloorPlan();
                }}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: '#334155', border: '5px solid #F8FAFC', color: '#F8FAFC', fontSize: '38px', fontWeight: 900, minWidth: '420px' }}>
                YES
              </GazeButton>
              <GazeButton id="confirm-gen-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
                onClick={() => setConfirmGenerate(false)}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: 'transparent', border: '5px solid #94A3B8', color: '#94A3B8', fontSize: '38px', fontWeight: 900, minWidth: '380px' }}>
                NO
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }
    if (showRestoreConfirm) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(15px)', pointerEvents: 'auto' }}>
          <div style={{ background: '#020617', border: `6px solid #3B82F6`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 50px 100px rgba(0,0,0,0.9)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>🕒</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: '#FFFFFF', marginBottom: '32px' }}>Restore Previous Session?</div>
            <div style={{ fontSize: '28px', color: '#E2E8F0', marginBottom: '50px', lineHeight: 1.6 }}>
              This will load your last saved grid layout.
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-restore-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1000}
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
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: '#3B82F6', border: 'none', color: '#F8FAFC', fontSize: '38px', fontWeight: 900, minWidth: '420px' }}>
                YES, RESTORE
              </GazeButton>
              <GazeButton id="confirm-restore-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
                onClick={() => setShowRestoreConfirm(false)}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: 'transparent', border: '5px solid #94A3B8', color: '#94A3B8', fontSize: '38px', fontWeight: 900, minWidth: '380px' }}>
                CANCEL
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }

    if (showRestartConfirm) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(15px)', pointerEvents: 'auto' }}>
          <div style={{ background: '#020617', border: `6px solid ${THEME.danger}`, borderRadius: '32px', padding: '70px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 50px 100px rgba(0,0,0,0.9)' }}>
            <div style={{ fontSize: '90px', marginBottom: '30px' }}>⚠️</div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: '#FFFFFF', marginBottom: '32px' }}>Restart Mapping Completely?</div>
            <div style={{ fontSize: '28px', color: '#E2E8F0', marginBottom: '50px', lineHeight: 1.6 }}>
              This will erase your current placements and let you start over<br />with new dimensions and facing.
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-restart-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1200}
                onClick={executeRestartCompass}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: '#451a1a', border: `5px solid ${THEME.danger}`, color: THEME.danger, fontSize: '38px', fontWeight: 900, minWidth: '420px' }}>
                YES, RESTART
              </GazeButton>
              <GazeButton id="confirm-restart-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
                onClick={() => setShowRestartConfirm(false)}
                style={{ padding: '38px 100px', minHeight: '132px', borderRadius: '24px', background: 'transparent', border: '5px solid #94A3B8', color: '#94A3B8', fontSize: '38px', fontWeight: 900, minWidth: '380px' }}>
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
      <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: '#0F172A', display: 'flex', flexDirection: 'column' }}>
        {/* Header — Solid matte */}
        <div style={{ display: 'flex', alignItems: 'center', padding: 'clamp(12px, 1.8vh, 22px) clamp(20px, 2.5vw, 36px)', borderBottom: `2px solid ${THEME.border}`, background: '#0F172A' }}>
          {/* Left: Title + info */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: 'clamp(22px, 3vh, 32px)', fontWeight: 900, color: '#FFFFFF', letterSpacing: '1.5px' }}>
              ROOM COMPONENTS
            </span>
            <span style={{ fontSize: 'clamp(13px, 1.5vh, 17px)', color: '#FFFFFF', fontWeight: 700, padding: '5px 14px', background: THEME.cardBg, borderRadius: '8px', border: `2px solid ${THEME.accent}` }}>
              {state.currentFloor === 'first' ? '1ST FLOOR' : 'GROUND'}
            </span>
            <span style={{ fontSize: 'clamp(13px, 1.5vh, 17px)', color: THEME.textSub, fontWeight: 700 }}>
              {placedCount} / {totalCount} placed
            </span>
          </div>
          {/* Center: CLOSE */}
          <GazeButton id="close-menu" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={600}
            onClick={() => { setMenuOpen(false); setMenuConfirmRemove(null); }}
            style={{ padding: '10px 36px', minHeight: 'clamp(52px, 6vh, 68px)', borderRadius: '12px', fontWeight: 900, fontSize: 'clamp(16px, 1.9vh, 21px)', background: THEME.cardBg, border: `2px solid ${THEME.danger}`, color: '#FFFFFF', letterSpacing: '1.5px', flexShrink: 0 }}>
            {'\u2715'} CLOSE
          </GazeButton>
          <div style={{ flex: 1 }} />
        </div>

        {/* Removal confirmation */}
        {removalP && (
          <div style={{ background: '#1a0f0f', borderBottom: '2px solid #EF5350', padding: 'clamp(14px, 1.8vh, 22px) clamp(20px, 2.5vw, 36px)', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ color: '#FFFFFF', fontSize: 'clamp(16px, 2vh, 22px)', fontWeight: 800, flex: 1 }}>
              Remove {removalP.roomLabel}?
            </span>
            <GazeButton id="rm-yes" gazeEnabled={isGazeEnabled} dwellTime={1000} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => { dws({ type: 'REMOVE_PLACED_ROOM', placementId: menuConfirmRemove! }); setMenuConfirmRemove(null); }}
              style={{ padding: '10px 30px', minHeight: 'clamp(50px, 5.5vh, 64px)', background: '#2d1515', border: '2px solid #EF5350', borderRadius: '12px', color: '#EF5350', fontSize: 'clamp(15px, 1.7vh, 19px)', fontWeight: 900 }}>YES, REMOVE</GazeButton>
            <GazeButton id="rm-no" gazeEnabled={isGazeEnabled} dwellTime={600} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              onClick={() => setMenuConfirmRemove(null)}
              style={{ padding: '10px 30px', minHeight: 'clamp(50px, 5.5vh, 64px)', background: THEME.cardBg, border: `2px solid ${THEME.border}`, borderRadius: '12px', color: '#FFFFFF', fontSize: 'clamp(15px, 1.7vh, 19px)', fontWeight: 800 }}>CANCEL</GazeButton>
          </div>
        )}

        {/* Instruction */}
        <div style={{ padding: 'clamp(10px, 1.2vh, 16px) clamp(20px, 2.5vw, 36px) 0', background: '#0F172A' }}>
          <div style={{ fontSize: 'clamp(12px, 1.3vh, 15px)', color: THEME.textSub, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            {menuCardsEnabled ? 'Select any room to load it for placement' : 'Press ready to unlock room selection'}
          </div>
        </div>

        {/* Room cards — AAC: large, bold, high-contrast, extra padding */}
        <div style={{ flex: 1, minHeight: 0, padding: 'clamp(10px, 1.3vh, 18px) clamp(20px, 2.5vw, 36px) 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'repeat(4, minmax(0, 1fr))', gap: '1px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' }}>
            {Array.from({ length: menuGridSlots }).map((_, idx) => {
              const room = state.componentQueue[idx];
              if (!room) {
                return <div key={`m-empty-${idx}`} style={{ background: 'rgba(17,24,39,0.92)' }} />;
              }
              const isPlaced = state.placements.some((p) => p.roomId === room.roomId);
              const pl = state.placements.find((p) => p.roomId === room.roomId);
              const isCurr = idx === state.currentIndex;
              const lib = ROOM_LIBRARY[room.roomId];
              return (
                <GazeButton key={`m-${room.roomId}-${idx}`} id={`m-${room.roomId}-${idx}`} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
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
                    background: !menuCardsEnabled ? 'rgba(17,24,39,0.65)' : isCurr ? 'rgba(45,212,191,0.18)' : isPlaced ? 'rgba(30,41,59,0.96)' : 'rgba(17,24,39,0.94)',
                    border: 'none',
                    boxShadow: isCurr
                      ? `inset 0 0 0 3px ${THEME.accent}`
                      : isPlaced
                        ? `inset 0 0 0 2px ${lib?.color || '#2DD4BF'}`
                        : 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                    color: menuCardsEnabled ? '#FFFFFF' : '#94A3B8',
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
                      <span style={{ fontSize: 'clamp(13px, 1.55vh, 20px)', fontWeight: 900, color: THEME.accent }}>
                        {'\u25CF'} CURRENT {pl ? `- ${pl.occupiedCells.length} cell${pl.occupiedCells.length === 1 ? '' : 's'}` : ''}
                      </span>
                    ) : isPlaced ? (
                      <span style={{ fontSize: 'clamp(13px, 1.55vh, 20px)', fontWeight: 900, color: lib?.color || THEME.success }}>
                        {'\u2713'} PLACED {'\u2014'} {pl?.occupiedCells.length || 0} cells
                      </span>
                    ) : (
                      <span style={{ fontSize: 'clamp(13px, 1.55vh, 20px)', fontWeight: 800, color: '#CBD5E1' }}>
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
        <div style={{ marginTop: 'clamp(52px, 6vh, 90px)', padding: '0 clamp(20px, 2.5vw, 36px) clamp(16px, 2.4vh, 34px)', background: '#0F172A', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(30px, 4vw, 72px)' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GazeButton id="back-map" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={700}
                onClick={() => { setMenuOpen(false); setMenuConfirmRemove(null); }}
                style={{ width: menuNavSize, height: menuNavSize, minHeight: menuNavSize, borderRadius: '50%', fontWeight: 900, fontSize: 'clamp(18px, 2.2vh, 28px)', background: 'rgba(30,41,59,0.95)', border: '3px solid #2DD4BF', color: '#2DD4BF', letterSpacing: '0.7px', whiteSpace: 'pre-line', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.05 }}>
                BACK{'\n'}TO MAP
              </GazeButton>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GazeButton id="menu-gaze-toggle" gazeEnabled alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800} onClick={toggleGaze}
                style={{
                  width: menuNavSize,
                  height: menuNavSize,
                  minHeight: menuNavSize,
                  borderRadius: '50%',
                  background: isGazeEnabled ? 'rgba(45,212,191,0.15)' : 'rgba(30,41,59,0.95)',
                  border: `3px solid ${isGazeEnabled ? '#2DD4BF' : 'rgba(100,116,139,0.45)'}`,
                  color: isGazeEnabled ? '#2DD4BF' : '#94A3B8',
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
              <GazeButton id="menu-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={800}
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
                  background: menuReady ? 'rgba(45,212,191,0.28)' : 'rgba(30,41,59,0.95)',
                  border: '3px solid #2DD4BF',
                  color: menuReady ? '#FFFFFF' : '#2DD4BF',
                  boxShadow: menuReady ? '0 0 28px rgba(45,212,191,0.32)' : 'none',
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
    <div className={`compass-screen${isLight ? ' theme-light' : ''}`} style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: THEME.bg, display: 'flex', flexDirection: 'column' }}>
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
          dwellTime={1200}
          onClick={() => { setNavHidden(false); onSpeak('Navigation restored.'); }}
          style={{
            position: 'fixed', top: '24px', right: '48px', zIndex: 100,
            width: '240px',
            minHeight: 'clamp(72px, 9vh, 100px)',
            borderRadius: '14px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '2px solid rgba(45, 212, 191, 0.4)',
            color: '#2DD4BF',
            fontSize: 'clamp(16px, 2.2vh, 22px)',
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'clamp(6px, 1vw, 10px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
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
          dwellTime={1400}
          onClick={() => { setNavHidden(true); onSpeak('Navigation hidden. Look at SHOW NAV to restore.'); }}
          style={{
            position: 'fixed', top: '185px', right: '48px', zIndex: 100,
            width: '240px',
            minHeight: 'clamp(72px, 9vh, 100px)',
            borderRadius: '14px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '2px solid rgba(100, 116, 139, 0.3)',
            color: THEME.text,
            fontSize: 'clamp(16px, 2.2vh, 22px)',
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'clamp(6px, 1vw, 10px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
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

        const roomCard = (id: string, rid: string, onClick: () => void, dwell = 1500) => (
          <GazeButton key={id} id={id} gazeEnabled={effectiveGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={dwell}
            onClick={() => { onClick(); setRoomPage(0); }}
            style={{ flex: '1 1 200px', minWidth: '200px', maxWidth: '240px', minHeight: '140px', borderRadius: '16px', border: '3px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', color: '#E2E8F0', fontSize: '24px', fontWeight: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: ROOM_LIBRARY[rid]?.color || '#555' }} />
            <div style={{ textAlign: 'center', lineHeight: 1.2 }}>{ROOM_LIBRARY[rid]?.shortLabel || rid}</div>
          </GazeButton>
        );

        const bigBtn = (id: string, label: string, color: string, bg: string, border: string, onClick: () => void, dwell = 1000, extra?: React.CSSProperties) => (
          <GazeButton id={id} gazeEnabled={effectiveGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={dwell}
            onClick={onClick}
            style={{ minWidth: '140px', minHeight: '80px', borderRadius: '16px', border: `2px solid ${border}`, background: bg, color, fontSize: '18px', fontWeight: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', ...extra }}>
            {label}
          </GazeButton>
        );

        // Tool sidebar button
        const toolSideBtn = (id: string, icon: string, label: string, tool: 'split' | 'walls' | 'void' | 'rotate' | 'expand', color: string, action?: () => void) => {
          const isActive = cellEditorTool === tool;
          return (
            <GazeButton id={id} gazeEnabled={effectiveGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={900}
              onClick={() => { if (action) { action(); } else { setCellEditorTool(tool); triggerReadingCooldown(); setRoomPage(0); onSpeak(`${label} tool.`); } }}
              style={{ width: '100%', minHeight: '120px', flex: 1, borderRadius: '16px', border: `2px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}`, background: isActive ? `${color}22` : 'rgba(255,255,255,0.03)', color: isActive ? color : '#64748B', fontSize: '15px', fontWeight: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '14px 6px', letterSpacing: '0.5px' }}>
              <span style={{ fontSize: '32px' }}>{icon}</span>
              <span>{label}</span>
            </GazeButton>
          );
        };

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#07111E', display: 'flex', flexDirection: 'column' }}>

            {/* ── SMART READING COOLDOWN BANNER ── */}
            {readingCooldown && (
              <div style={{ position: 'absolute', top: 120, left: 0, right: 0, height: '48px', background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'slideDown 0.3s ease-out forwards' }}>
                <span style={{ color: '#FFF', fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>PAUSED: LOOK AROUND FREELY 👁️👀</span>
              </div>
            )}

            {/* ── BREADCRUMB BAR / HEADER (120px) ── */}
            <div style={{ position: 'relative', height: 120, flexShrink: 0, background: '#0D1B2E', borderBottom: '2px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 40px' }}>
              {/* Left Breadcrumbs (Non-interactive) */}
              <div style={{ position: 'absolute', left: 40, display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, overflow: 'hidden' }}>
                <span style={{ color: '#2E4A62', fontWeight: 600 }}>Refinement</span>
                <span style={{ color: '#2E4A62' }}>›</span>
                {/* #10 — breadcrumb shows full room label, not raw shortLabel */}
                <span style={{ background: `${roomColor}33`, border: `1px solid ${roomColor}66`, color: '#F0F4F8', padding: '6px 20px', borderRadius: 100, fontWeight: 800, fontSize: 18, whiteSpace: 'nowrap' }}>
                  {roomFullLabel} {hasCellRefinement ? '✦' : ''}
                </span>
                <span style={{ color: '#2E4A62' }}>›</span>
                <span style={{ color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>{getStepLabel()}</span>
              </div>

              {/* Center BACK/EXIT Button (Safely away from corners) */}
              <GazeButton id="focus-back" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode alwaysActive dwellTime={1200}
                onClick={editorBack}
                style={{ height: 72, minWidth: 260, borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: '3px solid rgba(255,255,255,0.2)', color: '#93C5FD', fontSize: 24, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 30px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 10 }}>
                <span style={{ fontSize: 32 }}>←</span> {!cellEditorTool ? 'EXIT TO MAP' : 'BACK'}
              </GazeButton>

              {/* Right Step Label */}
              <div style={{ position: 'absolute', right: 40, padding: '8px 20px', borderRadius: 100, background: 'rgba(139,92,246,0.15)', border: '2px solid rgba(139,92,246,0.3)', color: '#C4B5FD', fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {getStepLabel()}
              </div>
            </div>

            {/* ── 3-COLUMN BODY ── */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

              {/* ══ LEFT: GHOST MAP (320px) ══ */}
              <div style={{ width: 320, flexShrink: 0, background: '#0A1628', borderRight: '2px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: 16, gap: 14 }}>
                {/* #8 — Ghost map section header raised + PREVIEW ONLY tag */}
                <div style={{ fontSize: 14, fontWeight: 800, color: '#4E7898', letterSpacing: 2, textAlign: 'center' }}>FLOOR MAP</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '2px 8px', letterSpacing: 1 }}>PREVIEW ONLY — non-interactive</div>
                {/* Mini Grid */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`, gap: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                  {RENDER_ORDER.map((ck: GridCellKey) => {
                    const gcs = state.grid[ck];
                    // Highlight the ENTIRE room, not just the single clicked cell
                    const isRoomSelected = gcs?.roomId && gcs.roomId === roomId;
                    const isCellTargeted = ck === cellKey;
                    const gLib = gcs?.roomId ? ROOM_LIBRARY[gcs.roomId] : null;
                    return (
                      <div key={ck} style={{
                        borderRadius: 6,
                        background: gLib ? `${gLib.color}${isRoomSelected ? 'AA' : '44'}` : 'rgba(255,255,255,0.02)',
                        border: isCellTargeted ? `3px solid #FFF` : isRoomSelected ? `2px solid #2DD4BF` : '1px solid rgba(255,255,255,0.06)',
                        boxShadow: isRoomSelected ? '0 0 16px rgba(45,212,191,0.4)' : 'none',
                        opacity: isRoomSelected ? 1 : 0.6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, color: isRoomSelected ? '#FFF' : '#94A3B8',
                        transition: 'all 0.3s ease', position: 'relative',
                      }}>
                        {gLib?.shortLabel || ''}
                        {isCellTargeted && <div style={{ position: 'absolute', inset: -1, borderRadius: 6, border: '2px solid #2DD4BF', animation: 'pulse 1.5s ease infinite', pointerEvents: 'none' }} />}
                      </div>
                    );
                  })}
                </div>
                {/* Direction Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: '#3E5C78', padding: '0 4px' }}>
                  <span>{sideLabels.left}</span>
                  <span>{sideLabels.right}</span>
                </div>
                <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#3E5C78' }}>ROAD ({facing})</div>
                {/* Selected Cell Info */}
                <div style={{ background: `${roomColor}15`, border: `1px solid ${roomColor}44`, borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: roomColor }}>{roomFullLabel}</div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginTop: 2 }}>{zoneLabel}</div>
                  {hasCellRefinement && <div style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700, marginTop: 4 }}>✦ Has refinements</div>}
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
                      {bigBtn('ce-prev-expand', '⇔ EXPAND', '#10B981', 'rgba(16,185,129,0.08)', 'rgba(16,185,129,0.3)', () => { }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {hasCellRefinement && bigBtn('ce-prev-reset', '✕ RESET', '#EF5350', 'rgba(239,83,80,0.06)', 'rgba(239,83,80,0.3)', () => { }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                    </div>

                    {/* Prominent Overlay READY Button */}
                    <div style={{ position: 'absolute', inset: -20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.4)', borderRadius: 24, zIndex: 10 }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#F8FAFC', textAlign: 'center', maxWidth: 600, textShadow: '0 4px 12px rgba(0,0,0,0.8)', marginBottom: 30 }}>
                        Look at READY to enable tools.
                      </div>
                      <GazeButton id="ce-ready" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1000}
                        onClick={() => { setRefinementArmed(true); triggerReadingCooldown(); onSpeak('Tools enabled.'); }}
                        style={{ width: '280px', height: '140px', borderRadius: '24px', background: '#0F172A', border: `4px solid #2DD4BF`, color: '#2DD4BF', fontSize: '32px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(45,212,191,0.4)', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                        READY
                      </GazeButton>
                    </div>
                  </div>
                )}

                {/* ── ACTIVE TOOL MENU ── */}
                {refinementArmed && cellEditorTool === null && (
                  <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#8B5CF6', letterSpacing: 3, textAlign: 'center', marginBottom: 20 }}>CHOOSE A TOOL</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', maxWidth: '900px' }}>
                      {bigBtn('ce-split', '✂ SPLIT', '#C4B5FD', 'rgba(139,92,246,0.08)', 'rgba(139,92,246,0.3)', () => { openSplitOverlay(); triggerReadingCooldown(); }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {bigBtn('ce-walls', '▐ WALLS', '#6EE7B7', 'rgba(45,212,191,0.08)', 'rgba(45,212,191,0.3)', () => { setCellEditorTool('walls'); triggerReadingCooldown(); }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {bigBtn('ce-rotate', '↻ ROTATE', '#F59E0B', 'rgba(245,158,11,0.08)', 'rgba(245,158,11,0.3)', () => { openRotateOverlay(); triggerReadingCooldown(); }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {bigBtn('ce-expand', '⇔ EXPAND', '#10B981', 'rgba(16,185,129,0.08)', 'rgba(16,185,129,0.3)', () => { openExpandOverlay(); triggerReadingCooldown(); }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                      {hasCellRefinement && bigBtn('ce-reset', '✕ RESET', '#EF5350', 'rgba(239,83,80,0.06)', 'rgba(239,83,80,0.3)', () => { resetCellRefinements(); triggerReadingCooldown(); }, 1500, { width: '220px', height: '140px', fontSize: '22px' })}
                    </div>
                  </div>
                )}

                {/* ── SPLIT TOOL ── */}
                {refinementArmed && cellEditorTool === 'split' && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#C4B5FD' }}>✂ SPLIT — {roomLabel}</div>
                    {splitStep === 'direction' && (
                      <div style={{ display: 'flex', gap: 40 }}>
                        {bigBtn('ce-split-v', '┃ VERTICAL\nLeft / Right', '#C4B5FD', 'rgba(139,92,246,0.1)', 'rgba(139,92,246,0.4)',
                          () => { setSplitDirection('vertical'); setSplitStep('roomA'); triggerReadingCooldown(); onSpeak('Vertical. Pick first room.'); }, 2000, { width: '280px', height: '180px', fontSize: '24px' })}
                        {bigBtn('ce-split-h', '━ HORIZONTAL\nTop / Bottom', '#C4B5FD', 'rgba(139,92,246,0.1)', 'rgba(139,92,246,0.4)',
                          () => { setSplitDirection('horizontal'); setSplitStep('roomA'); triggerReadingCooldown(); onSpeak('Horizontal. Pick first room.'); }, 2000, { width: '280px', height: '180px', fontSize: '24px' })}
                      </div>
                    )}
                    {splitStep === 'roomA' && (
                      <>
                        <div style={{ fontSize: 16, color: '#94A3B8' }}>Room for {splitDirection === 'vertical' ? 'LEFT' : 'TOP'} half</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, justifyContent: 'center', alignContent: 'start', maxWidth: '1200px', width: '100%', flex: 1, overflowY: 'auto', padding: '10px' }}>
                          {pagedRoomIds.map(rid => roomCard(`ce-sA-${rid}`, rid, () => { setSubRoomA(rid); setSplitStep('pctA'); triggerReadingCooldown(); onSpeak(`${ROOM_LIBRARY[rid]?.shortLabel || rid}. Choose percentage.`); }, 2000))}
                        </div>

                      </>
                    )}
                    {splitStep === 'pctA' && subRoomA && (
                      <>
                        <div style={{ fontSize: 16, color: '#94A3B8' }}>
                          Space for <span style={{ color: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', fontWeight: 900 }}>{ROOM_LIBRARY[subRoomA]?.shortLabel || subRoomA}</span>
                        </div>

                        {/* LIVE PREVIEW BOX */}
                        <div style={{ width: '400px', height: '240px', background: '#0F172A', border: '4px solid #334155', borderRadius: '16px', display: 'flex', flexDirection: splitDirection === 'horizontal' ? 'column' : 'row', overflow: 'hidden', padding: 8, gap: 4 }}>
                          <div style={{ flex: splitDirection === 'horizontal' ? `0 0 ${subRoomAPct || 50}%` : `0 0 ${subRoomAPct || 50}%`, background: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 20 }}>
                            {ROOM_LIBRARY[subRoomA]?.shortLabel} ({subRoomAPct || 50}%)
                          </div>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', border: '2px dashed #64748B', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontWeight: 800 }}>
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
                        <div style={{ fontSize: 16, color: '#94A3B8' }}>Room for {splitDirection === 'vertical' ? 'RIGHT' : 'BOTTOM'} half ({100 - (subRoomAPct || 50)}%)</div>

                        {/* LIVE PREVIEW BOX - B */}
                        <div style={{ width: '400px', height: '140px', background: '#0F172A', border: '4px solid #334155', borderRadius: '16px', display: 'flex', flexDirection: splitDirection === 'horizontal' ? 'column' : 'row', overflow: 'hidden', padding: 8, gap: 4, flexShrink: 0 }}>
                          <div style={{ flex: splitDirection === 'horizontal' ? `0 0 ${subRoomAPct || 50}%` : `0 0 ${subRoomAPct || 50}%`, background: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 16 }}>
                            {ROOM_LIBRARY[subRoomA]?.shortLabel} ({subRoomAPct || 50}%)
                          </div>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', borderRadius: 8, display: 'flex', border: '2px dashed #93C5FD', alignItems: 'center', justifyContent: 'center', color: '#93C5FD', fontWeight: 800, animation: 'pulse 1.5s infinite' }}>
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
                        <div style={{ fontSize: 16, color: '#94A3B8' }}>Review & Confirm Your Split</div>

                        {/* FINAL PREVIEW BOX */}
                        <div style={{ width: '500px', height: '300px', background: '#0F172A', border: '5px solid #475569', borderRadius: '24px', display: 'flex', flexDirection: splitDirection === 'horizontal' ? 'column' : 'row', overflow: 'hidden', padding: 8, gap: 4, flexShrink: 0, boxShadow: '0 0 30px rgba(0,0,0,0.5)' }}>
                          <div style={{ flex: splitDirection === 'horizontal' ? `0 0 ${subRoomAPct || 50}%` : `0 0 ${subRoomAPct || 50}%`, background: ROOM_LIBRARY[subRoomA]?.color || '#8B5CF6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 22, textAlign: 'center', padding: '10px' }}>
                            {ROOM_LIBRARY[subRoomA]?.shortLabel} <br />({subRoomAPct || 50}%)
                          </div>
                          <div style={{ flex: 1, background: ROOM_LIBRARY[subRoomB]?.color || '#64748B', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 22, textAlign: 'center', padding: '10px' }}>
                            {ROOM_LIBRARY[subRoomB]?.shortLabel} <br />({100 - (subRoomAPct || 50)}%)
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 40, marginTop: 10 }}>
                          {bigBtn('ce-cancel-split', '✕ CANCEL', '#EF5350', 'rgba(239,83,80,0.1)', 'rgba(239,83,80,0.4)', () => { setSplitStep('roomB'); setSubRoomB(null); triggerReadingCooldown(); onSpeak('Cancelled. Pick second room again.'); }, 1500, { width: '220px', height: '140px', fontSize: '24px' })}

                          {bigBtn('ce-confirm-split', '✔️ CONFIRM SPLIT', '#2DD4BF', 'rgba(45,212,191,0.15)', 'rgba(45,212,191,0.5)', () => { confirmSplitFull(subRoomB); }, 2500, { width: '320px', height: '140px', fontSize: '28px', boxShadow: '0 0 30px rgba(45,212,191,0.3)' })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── WALLS TOOL ── */}
                {refinementArmed && cellEditorTool === 'walls' && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#6EE7B7' }}>▐ WALLS — {roomLabel}</div>
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
                      {bigBtn('ce-rot-apply', '✓ APPLY', '#10B981', 'rgba(16,185,129,0.12)', 'rgba(16,185,129,0.4)', confirmRotation, 1000, { width: '180px', height: '70px' })}
                    </div>
                  </>
                )}

                {/* ── EXPAND TOOL ── */}
                {refinementArmed && cellEditorTool === 'expand' && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#10B981' }}>⇔ EXPAND — {roomLabel}</div>
                    <div style={{ fontSize: 14, color: '#94A3B8' }}>Expand into an empty neighbor</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 140px)', gridTemplateRows: 'repeat(3, 90px)', gap: 12 }}>
                      <div />
                      {bigBtn('ce-exp-up', '↑ UP', canExpandDir('up') ? '#10B981' : '#334155', canExpandDir('up') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('up') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('up') && confirmExpand('up'), 1200, { width: '140px', height: '90px' })}
                      <div />
                      {bigBtn('ce-exp-left', '← LEFT', canExpandDir('left') ? '#10B981' : '#334155', canExpandDir('left') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('left') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('left') && confirmExpand('left'), 1200, { width: '140px', height: '90px' })}
                      <div style={{ width: '140px', height: '90px', borderRadius: '16px', border: `2px solid ${roomColor}`, background: `${roomColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, color: roomColor }}>{roomLabel}</div>
                      {bigBtn('ce-exp-right', 'RIGHT →', canExpandDir('right') ? '#10B981' : '#334155', canExpandDir('right') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('right') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('right') && confirmExpand('right'), 1200, { width: '140px', height: '90px' })}
                      <div />
                      {bigBtn('ce-exp-down', '↓ DOWN', canExpandDir('down') ? '#10B981' : '#334155', canExpandDir('down') ? 'rgba(16,185,129,0.1)' : 'rgba(30,41,59,0.5)', canExpandDir('down') ? 'rgba(16,185,129,0.4)' : 'rgba(100,116,139,0.15)', () => canExpandDir('down') && confirmExpand('down'), 1200, { width: '140px', height: '90px' })}
                      <div />
                    </div>
                  </>
                )}
              </div>

              {/* ══ RIGHT: TOOL SIDEBAR (240px) ══ */}
              <div style={{ width: 240, flexShrink: 0, background: '#0A1628', borderLeft: '2px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '16px 14px', gap: 12 }}>
                {/* #4 — TOOLS label raised to 16px */}
                <div style={{ fontSize: 16, fontWeight: 800, color: '#4E7898', letterSpacing: 2, textAlign: 'center', marginBottom: 8 }}>TOOLS</div>
                {refinementArmed && toolSideBtn('ts-split', '✂', 'SPLIT', 'split', '#C4B5FD', () => { openSplitOverlay(); triggerReadingCooldown(); })}
                {refinementArmed && toolSideBtn('ts-walls', '▐', 'WALLS', 'walls', '#6EE7B7')}
                {refinementArmed && toolSideBtn('ts-rotate', '↻', 'ROTATE', 'rotate', '#F59E0B', () => { openRotateOverlay(); triggerReadingCooldown(); })}
                {refinementArmed && toolSideBtn('ts-expand', '⇔', 'EXPAND', 'expand', '#10B981', () => { openExpandOverlay(); triggerReadingCooldown(); })}
                <div style={{ flex: 1 }} />
                {refinementArmed && hasCellRefinement && (
                  <GazeButton id="ts-reset" gazeEnabled={isGazeEnabled && !readingCooldown} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1500}
                    onClick={resetCellRefinements}
                    style={{ width: '100%', height: '80px', borderRadius: '14px', border: '2px solid rgba(239,83,80,0.3)', background: 'rgba(239,83,80,0.06)', color: '#EF5350', fontSize: '15px', fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0 10px', flexShrink: 0 }}>
                    <span style={{ fontSize: '24px' }}>✕</span>
                    <span>RESET</span>
                  </GazeButton>
                )}
                <GazeButton id="ts-exit" gazeEnabled={isGazeEnabled && !readingCooldown} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={1200}
                  onClick={() => { setCellEditorOpen(false); setCellEditorTool(null); setRefinementArmed(false); onSpeak('Editor closed.'); }}
                  style={{ width: '100%', height: '80px', borderRadius: '14px', border: '2px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#64748B', fontSize: '15px', fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0 10px', flexShrink: 0, marginBottom: '24px' }}>
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
            background: 'rgba(11, 17, 32, 0.92)',
            backdropFilter: 'blur(12px)',
            border: `2px solid ${roomToast.color}55`,
            borderRadius: '20px',
            padding: 'clamp(24px, 3.5vh, 40px) clamp(36px, 5vw, 64px)',
            boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 24px ${roomToast.color}18`,
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
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#FFF', fontSize: '16px', fontWeight: 700 }}>✓</span></div>
            <span style={{ color: '#FFFFFF', fontSize: '18px', fontWeight: 800 }}>Compass Map Saved!</span>
            <GazeButton id="toast-ok" gazeEnabled={isGazeEnabled} alwaysActive gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellTime={600} onClick={() => setSaveToast(false)}
              style={{ marginLeft: '16px', minWidth: '120px', height: '80px', background: THEME.cardBg, border: `2px solid ${THEME.border}`, borderRadius: '14px', color: '#FFFFFF', fontSize: '18px', fontWeight: 700 }}>
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
