/**
 * CompassMapScreen: the Compass map (4 x 4 cells, road at the bottom), placed with gaze.
 *
 * Version 2 (docs/compass-refine/IMPLEMENTATION_PLAN.md): rooms are identities ("Bedroom 1", "Bedroom 2"),
 * any cell can be divided exactly 50 % left | 50 % right with REFINE, and one canonical plan
 * (CompassPlanV2) is what is saved, sent to the studio and drawn. Every change is one undoable step.
 * The grid, its gaze targets and their dwell timings are unchanged: a divided cell stays one target.
 * - Grid: 4x4 Connected Architectural Layout (Zero gaps)
 * - Plot: Flush to Road (No black gap)
 * - Styling: Professional CAD Blueprints
 */

import React, {
  useReducer, useCallback, useMemo, useEffect, useState, useRef,
} from 'react';
import GazeButton from '../components/core/GazeButton';
import '../styles/compass-workspace.css';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { useWS } from '../hooks/useWebSocket';
import { ArchitecturalCell, SplitCellFace, type SplitHalf } from '../components/ArchitecturalCell';
import { FloorPlanViewerModal } from '../components/FloorPlanViewerModal';
import { CompassPlanStudio } from '../components/CompassPlanStudio';
import { CompassStudio } from '../components/compass/CompassStudio';
import { CompassRoomPicker, PICKER_PAGE, type PickerCard, type PickerQuestion } from '../components/compass/CompassRoomPicker';
import { CompassRefineFocus, type HalfFace, type ThumbCell } from '../components/compass/CompassRefineFocus';
import { PlanReviewModal } from '../components/PlanReviewModal';
import {
  compileCompassPayload,
  CompassMapPayload,
  CompassPlanScope,
  FloorPayload,
  generatePlanCandidates,
  PlanCandidate,
} from '../utils/floorplanApi';
import {
  GridCellKey,
  RoomComponent,
  FloorType,
  ALL_CELL_KEYS,
  RENDER_ORDER,
  GRID_ROWS,
  GRID_COLS
} from '../types/compass';
import type { CellKey, CompassPlanV2, FloorId, FloorIntent, RegionKey, RoomIntent } from '../types/compassPlan';
import {
  parseCellKey,
  buildCellKey,
  cellToRect,
  cellsToBoundingRect,
  computeCoveragePercent,
} from '../utils/compassMath';
import { getDirectionLabels, NORTH_ROSE_DEGREES } from '../utils/compassDirections';
import { formatFeetShort, formatSize } from '../utils/feetInches';
import { REPEATABLE, STAIR_HOSTS, cellOf, deriveV1, normalisePlan, regionsTouch } from '../utils/compassPlan';
import {
  AssignChoice, CompassActionV2, CompassStateV2, MIN_CLEAR_IN, PlaceOutcome, assignHalf, catalogueUses, cellView,
  clearWidthIn, compassReducer, createInitialState, giveBothHalves, halvesUsable, inches, labelsOf, ownerOf, placeCell,
  planFromState, plotInches, regionSizeIn, roomsOfUse, splitCell, voidProblem, wholeCell, wholeOptions,
} from '../utils/compassReducer';
import {
  DRAFT_KEYS, MIGRATED_KEY, ParsedDraft, V1_KEYS, backendCopy, bestDraft, draftFromState, draftScore, parseDraft,
} from '../utils/compassDraft';
import { compassV2Enabled } from '../utils/compassFeatures';
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

const COMPASS_ACCEPTED_PLAN_KEY = 'gazeconnect_compass_accepted_plan_v1';
const COMPASS_AUTOSAVE_DEBOUNCE_MS = 1200;
const COMPASS_AUTOSAVE_MIN_INTERVAL_MS = 5000;
const COMPASS_SNAPSHOT_MIN_INTERVAL_MS = 30000;
/** The armed grid disarms, and Refine ends, after this long without a choice. */
const COMPASS_IDLE_MS = 45000;

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
  // Added 14 Oct 2026 (IMPLEMENTATION_PLAN.md §12): a passage on either floor, and the void over a double-height hall.
  passage: { roomLabel: 'Passage', shortLabel: 'Passage', color: '#B0A48A', expandable: false, recommendedCells: 1, typicalSqft: '25-60' },
  void: { roomLabel: 'Open to below', shortLabel: 'Open below', color: '#9AA8B5', expandable: false, recommendedCells: 1 },
};

// Passage (both floors) and Open to below (first floor) were added on 14 Oct 2026 (IMPLEMENTATION_PLAN.md §12).
const GF_IDS = [
  'porch', 'lawn', 'verandah', 'backyard', 'drawing', 'kitchen', 'living',
  'masterBed', 'bedroom',
  'bathroom', 'staircase', 'diningStaircase', 'dining', 'icu', 'balcony', 'terrace', 'passage',
];
const FF_IDS = [
  'ff_master', 'ff_bed2', 'ff_bed3', 'ff_living', 'ff_bathroom',
  'ff_balcony', 'ff_terrace', 'ff_stairLanding', 'passage', 'void',
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

// ─── Saved details from the retired Refine Map (read-only) ───

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


// ─── Helpers ──────────────────────────────────────────────

function makeRoom(id: string): RoomComponent {
  const lib = ROOM_LIBRARY[id];
  if (!lib) throw new Error(`Unknown room: ${id}`);
  return { roomId: id, ...lib };
}

function generateGFQueue(): RoomComponent[] {
  return GF_IDS.map(makeRoom);
}

function generateFFQueue(): RoomComponent[] {
  return FF_IDS.map(makeRoom);
}

const queueFor = (floor: FloorId): RoomComponent[] => (floor === 'first' ? generateFFQueue() : generateGFQueue());
const libraryOf = (use: string | null | undefined) => (use ? ROOM_LIBRARY[use] : undefined);
const ROW_NAMES: Record<number, string> = { 1: 'front', 2: 'front-middle', 3: 'back-middle', 4: 'back' };

type LegacyFloorDetails = { refinements?: Partial<AdvancedRefinements>; unknownRooms?: unknown[] };
function legacyFloor(legacy: CompassPlanV2['legacy'] | undefined, floor: FloorId): LegacyFloorDetails | undefined {
  return (legacy?.refinements as Record<string, LegacyFloorDetails> | undefined)?.[floor];
}

/** Cells that hold details saved by the retired Refine Map; they stay locked, as before, until the map is converted. */
function legacyCells(legacy: CompassPlanV2['legacy'] | undefined, floor: FloorId): Set<string> {
  const out = new Set<string>();
  const refinements = legacy && !legacy.converted ? legacyFloor(legacy, floor)?.refinements : undefined;
  if (!refinements || typeof refinements !== 'object') return out;
  for (const s of refinements.subCellSplits || []) if (s?.parentCell) out.add(s.parentCell);
  for (const e of refinements.customEdges || []) if (e?.cells?.[0]) out.add(e.cells[0]);
  for (const v of refinements.voidMarkers || []) if (v?.cell) out.add(v.cell);
  for (const r of refinements.cellRotations || []) if (r?.cell) out.add(r.cell);
  for (const x of refinements.cellExpansions || []) if (x?.cell) out.add(x.cell);
  return out;
}

/** The saved details of an unconverted map, per floor, in the shape the saved-plan viewer reads. */
function refinementsFromLegacy(legacy: CompassPlanV2['legacy'] | undefined): CompassFloorRefinements {
  const of = (floor: FloorId) => {
    const saved = legacyFloor(legacy, floor)?.refinements;
    return normalizeCompassRefinements(saved, saved?.cellLayouts);
  };
  return { ground: of('ground'), first: of('first') };
}

/** What the retired Refine Map saved, in words, for the conversion question. */
function legacySummary(legacy: CompassPlanV2['legacy'] | undefined): string {
  if (!legacy) return '';
  const names: Record<string, string> = {
    subCellSplits: 'divided cells', customEdges: 'wall changes', voidMarkers: 'open-to-below marks', cellRotations: 'rotations',
    cellExpansions: 'expansions', caregiverAnnotations: 'notes', vastuFlags: 'vastu flags', accessibilityMarkers: 'accessibility marks',
    cellLayouts: 'stair layouts', unknownRooms: 'rooms of unknown types',
  };
  const found = new Set<string>();
  for (const floor of ['ground', 'first'] as FloorId[]) {
    const details = legacyFloor(legacy, floor);
    for (const [key, value] of Object.entries(details?.refinements || {})) {
      if (Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : value) found.add(names[key] || key);
    }
    if (details?.unknownRooms?.length) found.add(names.unknownRooms);
  }
  return [...found].join(', ');
}

/** "3 feet 9 by 12 feet 6", for speech. */
function sizeWords(widthIn: number, depthIn: number): string {
  const words = (value: number) => {
    const total = Math.round(value);
    const feet = Math.floor(total / 12);
    const rest = total - feet * 12;
    return rest ? `${feet} feet ${rest}` : `${feet} feet`;
  };
  return `${words(widthIn)} by ${words(depthIn)}`;
}

/** Owned cells, a divided half counting one half. */
function ownedCount(floor: FloorIntent): number {
  return floor.rooms.reduce((sum, r) => sum + r.regions.reduce((m, k) => m + (k.includes('.') ? .5 : 1), 0), 0);
}

/**
 * The map's version 1 form, with cell rectangles and areas, as the original studio (GAZECONNECT_COMPASS_V2=0),
 * the saved-plan viewer and older backend readers expect (§4.8). Null when the map has divided cells, a
 * passage or an open-to-below, which only the version 2 studio can draw.
 */
function legacyMapOf(state: CompassStateV2): CompassMapPayload | null {
  let v1: any;
  try { v1 = deriveV1(normalisePlan(planFromState(state))); } catch { return null; }
  if (v1.requires_v2) return null;
  const pw = state.foundation.plotWidth || 40;
  const pd = state.foundation.plotDepth || 60;
  const records = (key: 'ground_floor' | 'first_floor') =>
    ((v1[key]?.placements || []) as Array<{ room: string; roomId: string; placementId: string; cells: GridCellKey[] }>).map(p => ({
      placementId: p.placementId, roomId: p.roomId, roomLabel: p.room, occupiedCells: p.cells,
      coords: cellsToBoundingRect(p.cells, pw, pd),
      cellRects: Object.fromEntries(p.cells.map(c => [c, cellToRect(c, pw, pd)])),
    }));
  const coverage = (floor: FloorId) => computeCoveragePercent(ownedCount(state.floors[floor]));
  const ground = { placements: records('ground_floor'), coveragePercent: coverage('ground') };
  const first = state.floors.first.rooms.length ? { placements: records('first_floor'), coveragePercent: coverage('first') } : null;
  const onFirst = state.currentFloor === 'first';
  const current = onFirst ? (first || { placements: [], coveragePercent: 0 }) : ground;
  return compileCompassPayload(state.foundation, current.placements, GRID_ROWS, GRID_COLS, current.coveragePercent,
    onFirst ? ground : null, onFirst ? null : first, state.currentFloor);
}

/** Each floor's empty cells, as the version 1 backend copy carried them. */
function withEmptyCells(map: CompassMapPayload): Record<string, unknown> {
  const floor = (data: FloorPayload | undefined) => data && {
    ...data, empty_cells: ALL_CELL_KEYS.filter(k => !data.placements.some(p => p.cells.includes(k))),
  };
  return { ...map, ground_floor: floor(map.ground_floor), ...(map.first_floor ? { first_floor: floor(map.first_floor) } : {}) };
}

// ─── Compass Rose ─────────────────────────────────────────

const CompassRose: React.FC<{ facing: string; bg?: string; border?: string; textColor?: string; northColor?: string; size?: number }> = ({ facing, bg, border, textColor, northColor, size = 72 }) => {
  // facing = the direction the road faces (the bottom edge of screen).
  // Convention (see compassDirections.ts): viewer stands on the road looking at the plot.
  //   East-facing road  → viewer faces West → viewer's right = North → N is at SCREEN RIGHT  (rot 90)
  //   South-facing road → viewer faces North → N is at SCREEN TOP                              (rot 0)
  //   West-facing road  → viewer faces East → viewer's right = South → N is at SCREEN LEFT     (rot 270)
  //   North-facing road → viewer faces South → N is at SCREEN BOTTOM                           (rot 180)
  const rot = NORTH_ROSE_DEGREES[facing] ?? 0;
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
        {`0   ${formatFeetShort(feet)}   ${formatFeetShort(feet * 2)} ft`}
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
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze, enableGaze, signalNavigation } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const ws = useWS();
  const v2Enabled = useMemo(() => compassV2Enabled(), []);

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
  const [saveToast, setSaveToast] = useState(false);
  const [surveyLoading, setSurveyLoading] = useState(true);
  const [studioScope, setStudioScope] = useState<CompassPlanScope>('ground');
  const [showCompassStudio, setShowCompassStudio] = useState(false);
  const [studioPlan, setStudioPlan] = useState<CompassPlanV2 | null>(null);
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
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const [menuPage, setMenuPage] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState<{ cell: GridCellKey; oldLabel: string; oldColor: string; use: string } | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  // Compass map opens with the global NavBar hidden by default — the canvas is
  // the workspace; users press SHOW NAV when they need to navigate elsewhere.
  const [navHidden, setNavHidden] = useState(true);
  // A draft saved by a newer build is shown, never changed or overwritten (§4.8).
  const [readOnlyDraft, setReadOnlyDraft] = useState(false);
  // Refine (§5): the mode, the cell in focus, and the half whose room is being chosen. UI state only:
  // it is never saved, and leaving it never changes the map.
  const [refineMode, setRefineMode] = useState(false);
  const [focusCell, setFocusCell] = useState<CellKey | null>(null);
  const [focusQuestion, setFocusQuestion] = useState<PickerQuestion | null>(null);
  const [focusMessage, setFocusMessage] = useState('');
  const [assignKey, setAssignKey] = useState<RegionKey | null>(null);
  const [assignReady, setAssignReady] = useState(false);
  const [assignPage, setAssignPage] = useState(0);
  const [pickerQuestion, setPickerQuestion] = useState<PickerQuestion | null>(null);
  const [pickerNotice, setPickerNotice] = useState('');
  const [refineTouch, setRefineTouch] = useState(0);

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
  // Full-screen choices replace the map while they are open, so no hidden target can answer gaze.
  const fullScreenOverlay = menuOpen || !!focusCell || !!assignKey;
  // A dialog owns gaze input while open.
  const isConfirmationOpen = !!confirmReplace || !!confirmGenerate || showRestoreConfirm || showRestartConfirm || showConvertConfirm
    || showPlanReview || showCompassStudio || showFloorPlanViewer;
  const overlayOpen = isConfirmationOpen || fullScreenOverlay;

  const surveyProcessed = useRef(false);
  const prevPhaseRef = useRef<string>(state.phase);
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
  const floorId: FloorId = state.currentFloor;
  const floor = state.floors[floorId];
  const below = floorId === 'first' ? state.floors.ground : undefined;
  const labels = useMemo(() => labelsOf(floor), [floor]);
  const currentRoom = state.phase === 'placement' && state.currentIndex < state.componentQueue.length
    ? state.componentQueue[state.currentIndex] : null;
  const owned = ownedCount(floor);
  const coveragePercent = computeCoveragePercent(owned);
  const pw = state.foundation.plotWidth || 40;
  const pd = state.foundation.plotDepth || 60;
  const { widthIn, depthIn } = plotInches(state);
  // Exact cell sizes: a 30 ft plot has 7'-6" cells. Labels format them in feet and inches.
  const cellWFt = pw / GRID_COLS;
  const cellDFt = pd / GRID_ROWS;
  const facing = state.foundation.facing || 'South';
  const directions = getDirectionLabels(facing);
  const sideLabels = directions;
  const backDir = directions.back;
  const isMultiFloor = state.numFloors === 'Multi-Floor';
  const groundRoomCount = state.floors.ground.rooms.length;
  const firstRoomCount = state.floors.first.rooms.length;
  const canPreviewPlan = groundRoomCount > 0;
  const floorName = floorId === 'first' ? 'First floor' : 'Ground floor';
  // Details saved by the retired Refine Map: read-only, and their cells locked, until the map is converted.
  const legacyLocked = !!state.legacy && !state.legacy.converted;
  const lockedCells = useMemo(() => legacyCells(state.legacy, floorId), [state.legacy, floorId]);
  const floorRefinements = useMemo(() => refinementsFromLegacy(legacyLocked ? state.legacy : undefined), [state.legacy, legacyLocked]);
  const colourOf = (use: string | null | undefined) => libraryOf(use)?.color || '#78909C';

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
      // Default facing West, 40 x 60 ft (the most common plot in the test bed); every answer stays editable.
      foundation: { facing: 'West', plotWidth: 40, plotDepth: 60, plotType: 'Middle Plot', numFloors },
      numFloors,
    });
    onSpeak(`${speakMsg} Please answer facing and floor count to begin mapping.`);
  }, [onSpeak]);

  // ── Session resume (same app run only) ─────────────────────
  // Auto-hydration reads only the session and primary drafts (current work). The last-session backup is
  // reached only through LOAD PREVIOUS SESSION, so a Restart is never undone by reopening the screen.
  // Version 2 keys first; a version 1 draft is migrated once (its keys stay untouched for a rollback build).
  const hydrate = useCallback((parsed: ParsedDraft, raw: string | null, spoken: string) => {
    dispatch({ type: 'HYDRATE', state: parsed.state });
    surveyProcessed.current = true;
    setReadOnlyDraft(parsed.newer);
    const notices = parsed.notices.length ? ` ${parsed.notices.join(' ')}` : '';
    onSpeak(parsed.newer ? 'This map was saved by a newer version of GazeConnect. It is shown read-only.' : `${spoken}${notices}`);
    if (raw && !parsed.newer && !parsed.fromV1) {
      try { localStorage.setItem(DRAFT_KEYS.primary, raw); } catch { /* Ignore storage write errors. */ }
    }
  }, [onSpeak]);

  useEffect(() => {
    let restoredFromDraft = false;
    try {
      const v2 = bestDraft([sessionStorage.getItem(DRAFT_KEYS.session), localStorage.getItem(DRAFT_KEYS.primary)], queueFor);
      if (v2) {
        hydrate(v2.parsed, v2.raw, 'Compass progress restored. Continue from where you left off.');
        restoredFromDraft = true;
      } else if (!localStorage.getItem(MIGRATED_KEY)) {
        const v1 = bestDraft([sessionStorage.getItem(V1_KEYS.session), localStorage.getItem(V1_KEYS.primary)], queueFor);
        if (v1 && draftScore(v1.parsed) > 0) {
          hydrate(v1.parsed, null, 'Your Compass map was updated to the new map. Continue from where you left off.');
          restoredFromDraft = true;
        }
      }
      if (restoredFromDraft) setSurveyLoading(false);
    } catch {
      // Ignore malformed local draft payloads.
    }

    const t = setTimeout(() => {
      if (!restoredFromDraft) setSurveyLoading(false);
    }, 900);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // The kitchen is open to the living hall unless the survey asked for a closed kitchen (§4.7).
    const answers = (a.answers && typeof a.answers === 'object' ? a.answers : a) as Record<string, any>;
    if (/closed/i.test(String(answers.gf_kitchen_config || ''))) dispatch({ type: 'SET_CHOICE', key: 'kitchen', value: 'closed' });
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

  // ── Local draft: every change, version 2 keys only ──
  useEffect(() => {
    if (surveyLoading || readOnlyDraft) return;
    try {
      const json = JSON.stringify(draftFromState(state));
      const previousPrimary = localStorage.getItem(DRAFT_KEYS.primary);
      if (previousPrimary && previousPrimary !== json) {
        const previous = parseDraft(previousPrimary, queueFor);
        if (previous && draftScore(previous) >= 100) localStorage.setItem(DRAFT_KEYS.last, previousPrimary);
      }
      sessionStorage.setItem(DRAFT_KEYS.session, json);
      localStorage.setItem(DRAFT_KEYS.primary, json);
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch {
      // Ignore storage write errors.
    }
  }, [state, surveyLoading, readOnlyDraft]);

  useEffect(() => {
    if (state.phase === 'foundation') setFoundationReady(false);
  }, [state.foundationStep, state.phase]);

  useEffect(() => {
    if (menuOpen) { setMenuReady(false); setMenuPage(Math.floor(state.currentIndex / PICKER_PAGE)); }
  }, [menuOpen, state.currentIndex, state.currentFloor]);

  // ── Phase Speech ────────────────────────────────────────
  useEffect(() => {
    if (prevPhaseRef.current === 'placement' && state.phase === 'review') {
      const mapped = new Set(floor.rooms.map((r) => r.use)).size;
      const total = state.componentQueue.length;
      onSpeak(`${floorName} sequence complete. ${mapped} of ${total} rooms mapped, ${coveragePercent}% coverage.`);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, floor, state.componentQueue.length, coveragePercent, floorName, onSpeak]);

  // ── Auto-disarm 45s ─────────────────────────────────────
  useEffect(() => {
    if (!state.armed) return;
    const t = setTimeout(() => { dispatch({ type: 'DISARM_GRID' }); onSpeak('Grid disarmed due to inactivity.'); }, COMPASS_IDLE_MS);
    return () => clearTimeout(t);
  }, [state.armed, onSpeak]);

  const endRefine = useCallback((spoken?: string) => {
    setRefineMode(false); setFocusCell(null); setFocusQuestion(null); setFocusMessage('');
    setAssignKey(null); setPickerQuestion(null); setPickerNotice('');
    if (spoken) onSpeak(spoken);
  }, [onSpeak]);

  // The same 45 quiet seconds that disarm the grid end Refine on the map (§5.1), with speech: there every cell
  // answers to gaze without READY. The focus view and the room picker are deliberate overlays with their own
  // Back, like the room menu, so they stay open. Leaving Refine never changes the map.
  useEffect(() => {
    if (!refineMode || focusCell || assignKey) return;
    const t = setTimeout(() => endRefine('Refine ended after 45 quiet seconds.'), COMPASS_IDLE_MS);
    return () => clearTimeout(t);
  }, [refineMode, refineTouch, focusCell, assignKey, state.floors, endRefine]);
  const touchRefine = () => setRefineTouch(n => n + 1);

  // ── dispatchWithSpeech ──────────────────────────────────
  const dws = useCallback((action: CompassActionV2) => {
    switch (action.type) {
      case 'ARM_GRID': if (currentRoom) onSpeak(`Grid ready. Place ${currentRoom.roomLabel}.`); break;
      case 'DISARM_GRID': onSpeak('Grid disarmed.'); break;
      case 'NEXT_ROOM': {
        if (!state.armed) {
          onSpeak('Press READY first.');
          break;
        }
        const currentHasCells = currentRoom ? roomsOfUse(floor, currentRoom.roomId).length > 0 : false;
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
        onSpeak(state.history.length > 0 ? 'Undone.' : 'Nothing to undo.');
        break;
      case 'RESET': onSpeak('Map cleared. Starting fresh.'); break;
      default: break;
    }
    dispatch(action);
  }, [currentRoom, state, floor, onSpeak]);

  // ── Keyboard Shortcuts ──────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (!readOnlyDraft) dws({ type: 'UNDO' }); return; }
      if (e.key === 'Escape') {
        if (assignKey) { setAssignKey(null); setPickerQuestion(null); setPickerNotice(''); return; }
        if (focusCell) { setFocusCell(null); setFocusQuestion(null); setFocusMessage(''); return; }
        if (menuOpen) { setMenuOpen(false); return; }
        if (refineMode) { endRefine('Refine done.'); return; }
        if (state.armed) dws({ type: 'DISARM_GRID' });
        return;
      }
      if (state.phase !== 'placement' || refineMode || menuOpen) return;
      if (e.key.toLowerCase() === 'r') dws({ type: state.armed ? 'DISARM_GRID' : 'ARM_GRID' });
      else if (e.key.toLowerCase() === 'n') dws({ type: 'NEXT_ROOM' });
      else if (e.key.toLowerCase() === 'u' && !readOnlyDraft) dws({ type: 'UNDO' });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state.phase, state.armed, menuOpen, refineMode, focusCell, assignKey, readOnlyDraft, dws, endRefine]);

  // ── Foundation Handler ──────────────────────────────────
  const handleFoundationAnswer = useCallback((value: string) => {
    // READY arms dwell selection through gazeEnabled. A deliberate pointer or
    // keyboard click can answer immediately, including in the browser preview.
    const q = FOUNDATION_QUESTIONS[state.foundationStep];
    if (!q) return;
    setFoundationReady(false);
    const parsed = q.parse ? q.parse(value) : value;
    dispatch({ type: 'SET_FOUNDATION', key: q.key as FoundationKey, value: parsed, total: FOUNDATION_QUESTIONS.length });
    const remaining = FOUNDATION_QUESTIONS.length - state.foundationStep - 1;
    if (remaining > 0) { onSpeak(`Selected ${value}. ${remaining} question${remaining > 1 ? 's' : ''} remaining.`); }
    else { onSpeak('Foundation complete. Starting room placement.'); }
    if (state.foundationStep === FOUNDATION_QUESTIONS.length - 1) {
      const nf = q.key === 'numFloors' ? value : (state.foundation.numFloors || 'Single Floor');
      onSpeak('Foundation complete. Starting room placement.');
      dispatch({ type: 'COMPLETE_FOUNDATION', queue: generateGFQueue(), numFloors: nf });
    }
  }, [state.foundationStep, state.foundation.numFloors, onSpeak]);

  // ── The version 1 map: for the original studio (flag off), the saved-plan viewer and older backend readers ──
  const legacyPayload = useCallback((): CompassMapPayload | null => {
    const map = legacyMapOf(state);
    return map ? attachCompassFloorRefinements(map, floorRefinements, floorId) as CompassMapPayload : null;
  }, [state, floorRefinements, floorId]);

  // The backend copy: the canonical plan, beside the derived version 1 fields older readers expect (§4.8).
  // Both travel in compass_map, so they are always saved together.
  const surveyPayload = useCallback((source: string) => {
    const copy = backendCopy(state);
    const legacy = legacyPayload();
    const compassMap = { ...(legacy ? withEmptyCells(legacy) : copy.compass_map), compass_plan: copy.compass_plan, saved_at: new Date().toISOString() };
    return { ...(surveyDataRef.current || {}), compass_map: compassMap, source };
  }, [state, legacyPayload]);

  // ── Save Handler ────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (readOnlyDraft) { onSpeak('This map was saved by a newer version of GazeConnect. It is read-only.'); return; }
    const payload = surveyPayload('compass-map-manual');
    saveSurveyRef.current?.(payload);
    if (typeof snapshotSurveyRef.current === 'function') {
      snapshotSurveyRef.current(payload);
    }
    onSpeak(`Compass Map saved. ${floor.rooms.length} rooms placed.`);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 5000);
  }, [surveyPayload, floor.rooms.length, onSpeak, readOnlyDraft]);

  // ── Autosave: silently save after each change ───
  const roomTotal = groundRoomCount + firstRoomCount;
  useEffect(() => {
    if (roomTotal === 0 || readOnlyDraft) return;
    if (state.phase !== 'placement' && state.phase !== 'review') return;
    // Debounce and save only when there is meaningful new layout data.
    const t = setTimeout(() => {
      const fingerprint = JSON.stringify(backendCopy(state).compass_plan);
      if (fingerprint === lastAutosaveFingerprintRef.current) {
        return;
      }
      const now = Date.now();
      if (now - lastAutosaveAtRef.current < COMPASS_AUTOSAVE_MIN_INTERVAL_MS) {
        return;
      }
      const payload = surveyPayload('compass-map-autosave');
      saveSurveyRef.current?.(payload);
      lastAutosaveAtRef.current = now;
      lastAutosaveFingerprintRef.current = fingerprint;
      if (
        typeof snapshotSurveyRef.current === 'function'
        && now - lastSnapshotAtRef.current >= COMPASS_SNAPSHOT_MIN_INTERVAL_MS
      ) {
        snapshotSurveyRef.current(payload);
        lastSnapshotAtRef.current = now;
      }
    }, COMPASS_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [roomTotal, state, surveyPayload, readOnlyDraft]);

  // ── Restart Survey Handler ────────────────────────────────
  const handleRestartCompass = useCallback(() => {
    // A newer version's map is never overwritten (§4.8), so it cannot be restarted here either.
    if (readOnlyDraft) { onSpeak('This map was saved by a newer version of GazeConnect. It is read-only.'); return; }
    setShowRestartConfirm(true);
  }, [readOnlyDraft, onSpeak]);

  const executeRestartCompass = useCallback(() => {
    try {
      const bestBeforeReset = bestDraft([localStorage.getItem(DRAFT_KEYS.primary), sessionStorage.getItem(DRAFT_KEYS.session)], queueFor);
      if (bestBeforeReset && draftScore(bestBeforeReset.parsed) >= 100) {
        localStorage.setItem(DRAFT_KEYS.last, bestBeforeReset.raw);
      }
      sessionStorage.removeItem(DRAFT_KEYS.session);
      localStorage.removeItem(DRAFT_KEYS.primary);
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch { /* Storage may be unavailable. */ }
    dispatch({ type: 'RESET', queue: initialQueue });
    setAcceptedCompassPlan(null);
    setReadOnlyDraft(false);
    endRefine();
    try { localStorage.removeItem(COMPASS_ACCEPTED_PLAN_KEY); } catch { /* Storage may be unavailable. */ }
    setFoundationReady(false);
    setShowRestartConfirm(false);
    onSpeak('Map reset. Please answer the foundation questions again.');
  }, [initialQueue, onSpeak, endRefine]);

  /** Whether LOAD PREVIOUS SESSION has anything to load (the frozen version 1 draft only before migration). */
  const hasSavedDraft = () => {
    try {
      return !!(localStorage.getItem(DRAFT_KEYS.primary) || localStorage.getItem(DRAFT_KEYS.last)
        || (!localStorage.getItem(MIGRATED_KEY) && (localStorage.getItem(V1_KEYS.primary) || localStorage.getItem(V1_KEYS.last))));
    } catch { return false; }
  };

  const restorePrevious = () => {
    try {
      let best = bestDraft([localStorage.getItem(DRAFT_KEYS.primary), localStorage.getItem(DRAFT_KEYS.last)], queueFor);
      if (!best && !localStorage.getItem(MIGRATED_KEY)) {
        best = bestDraft([localStorage.getItem(V1_KEYS.primary), localStorage.getItem(V1_KEYS.last)], queueFor);
      }
      if (best) hydrate(best.parsed, best.parsed.fromV1 ? null : best.raw, 'Previous session restored.');
    } catch { /* Ignore malformed drafts. */ }
    setShowRestoreConfirm(false);
  };

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

  // The saved-plan viewer for maps that still hold details from the retired Refine Map.
  const openLegacyReview = useCallback(() => {
    const payload = legacyPayload();
    setShowCompassStudio(false);
    if (!payload) { onSpeak('This map uses divided cells; open it in the Compass studio.'); return; }
    setCompiledPayload(payload);
    setPlanReviewSource(payload);
    setShowPlanReview(true);
    void requestPlanCandidates(payload);
  }, [legacyPayload, requestPlanCandidates, onSpeak]);

  // ── Generate: the one canonical plan goes to the studio ──
  const handleGenerateFloorPlan = useCallback((scope: CompassPlanScope = 'ground') => {
    let plan: CompassPlanV2;
    try {
      plan = normalisePlan(planFromState(state));
    } catch {
      onSpeak('The map could not be read. Please check the plot answers.');
      return;
    }
    setStudioScope(scope);
    if (v2Enabled) {
      setStudioPlan(plan);
    } else {
      // GAZECONNECT_COMPASS_V2=0: the original studio, which can draw only undivided maps.
      const payload = legacyPayload();
      if (!payload) { onSpeak('This map has divided cells. The new Compass studio is needed to draw them.'); return; }
      setCompiledPayload(payload);
      setPlanReviewSource(payload);
    }
    setShowCompassStudio(true);
    onSpeak(scope === 'ground' ? 'Opening the ground floor plan. Your first floor draft is kept.' : 'Opening both floors.');
  }, [state, onSpeak, v2Enabled, legacyPayload]);

  const switchCompassFloor = (next: FloorType) => {
    if (next === state.currentFloor) return;
    if (refineMode) endRefine();
    dispatch({ type: 'SWITCH_FLOOR', floor: next, queue: queueFor(next) });
  };

  // ── Placement: a dwell on a whole cell while a room is armed ──
  const commitPlacement = (outcome: PlaceOutcome, cellKey: GridCellKey) => {
    if (outcome.kind === 'refused') { onSpeak(outcome.message); return; }
    if (outcome.kind === 'confirm-replace') {
      if (!currentRoom) return;
      setConfirmReplace({ cell: cellKey, oldLabel: outcome.victimLabel, oldColor: colourOf(outcome.victim.use), use: currentRoom.roomId });
      onSpeak(`Replace ${outcome.victimLabel} with ${currentRoom.roomLabel}?`);
      return;
    }
    dispatch({ type: 'COMMIT_FLOOR', floor: outcome.floor, activeRoomId: outcome.activeRoomId });
    const added = !!outcome.roomId && outcome.floor.rooms.some(r => r.id === outcome.roomId && r.regions.includes(cellKey as RegionKey));
    if (!added) { onSpeak(outcome.message); return; }
    // Voice confirmation on placement
    const { row, col } = parseCellKey(cellKey);
    const zoneRow = row === 4 ? 'Back' : row === 3 ? 'Inner back' : row === 2 ? 'Inner front' : 'Front';
    const zoneCol = col === 1 ? 'Left' : col === 2 ? 'Left centre' : col === 3 ? 'Right centre' : 'Right';
    onSpeak(`${outcome.message} ${zoneRow}, ${zoneCol} zone.`);
  };

  const onCellClick = (cellKey: GridCellKey) => {
    if (overlayOpen) return;
    if (lockedCells.has(cellKey)) {
      onSpeak('This cell has saved plan details. View them using Generate Plan.');
      return;
    }
    if (readOnlyDraft) { onSpeak('This map was saved by a newer version of GazeConnect. It is read-only.'); return; }
    if (refineMode) { openFocus(cellKey); return; }
    if (state.phase !== 'placement') return;
    if (!state.armed) { onSpeak('Press READY first.'); return; }
    if (!currentRoom) return;
    commitPlacement(placeCell(state, cellKey, currentRoom.roomId, false, below), cellKey);
  };

  // ── Refine (§5): a cell in focus, then the room for one of its halves ──
  const toggleRefine = () => {
    if (overlayOpen) return;
    if (refineMode) { endRefine('Refine done.'); return; }
    if (readOnlyDraft) { onSpeak('This map was saved by a newer version of GazeConnect. It is read-only.'); return; }
    if (legacyLocked) {
      setShowConvertConfirm(true);
      onSpeak('This map has saved plan details from the earlier Refine Map. Convert it to the new map first?');
      return;
    }
    signalNavigation();
    if (state.armed) dispatch({ type: 'DISARM_GRID' });
    setRefineMode(true);
    touchRefine();
    onSpeak('Refine. Look at a cell.');
  };

  const openFocus = (cell: CellKey) => {
    signalNavigation();
    setFocusCell(cell); setFocusQuestion(null); setFocusMessage('');
    touchRefine();
    const { row, col } = parseCellKey(cell);
    onSpeak(`Row ${row}, column ${col}. Choose the left half or the right half.`);
  };

  const closeFocus = () => {
    signalNavigation();
    setFocusCell(null); setFocusQuestion(null); setFocusMessage('');
    touchRefine();
    onSpeak('Back to the map. Look at another cell, or choose Done refining.');
  };

  /** The state with the focus cell divided but not committed: dividing and choosing a half's room are one step. */
  const workingState = (): CompassStateV2 => {
    if (!focusCell || floor.splits.includes(focusCell)) return state;
    return { ...state, floors: { ...state.floors, [floorId]: splitCell(floor, focusCell) } };
  };

  const onHalf = (half: 'L' | 'R') => {
    if (!focusCell) return;
    const key = `${focusCell}.${half}` as RegionKey;
    touchRefine();
    if (!floor.splits.includes(focusCell) && !halvesUsable(widthIn, depthIn)) {
      const message = `On a ${pw} ft plot a half cell is only ${inches(clearWidthIn(key, widthIn, depthIn))} wide inside: too narrow for any room. The cell stays whole.`;
      setFocusMessage(message);
      onSpeak(`${message} Choose Back to map.`);
      return;
    }
    signalNavigation();
    setAssignKey(key); setAssignReady(false); setAssignPage(0); setPickerQuestion(null); setPickerNotice('');
    onSpeak(`Room for the ${half === 'L' ? 'left' : 'right'} half. Press READY, then choose a room.`);
  };

  /** When a change takes area from the room that holds the stair: whether the stair still fits is decided by the
   * floor-plan service (its plan notes), so the person is told where to look, and that UNDO puts it back (§5.3). */
  const stairNote = (before: FloorIntent, after: FloorIntent) => {
    const area = (f: FloorIntent) => f.rooms.filter(r => STAIR_HOSTS[floorId].has(r.use))
      .reduce((n, r) => n + r.regions.reduce((m, k) => m + (k.includes('.') ? .5 : 1), 0), 0);
    return area(after) < area(before) ? ' The stair room is smaller now: the plan notes say whether its stair still fits, and UNDO puts it back.' : '';
  };

  /** Commits a split and its half's room (or both halves) as one undoable step, then returns to the cell. */
  const finishAssign = (outcome: { floor: FloorIntent; roomId: string | null; message: string }, key: RegionKey) => {
    dispatch({ type: 'COMMIT_FLOOR', floor: outcome.floor, activeRoomId: outcome.roomId ?? state.activeRoomId });
    const otherSide = key.endsWith('.L') ? 'right' : 'left';
    const stair = stairNote(floor, outcome.floor);
    let spoken = outcome.message;
    if (outcome.roomId) {
      const size = regionSizeIn(key, widthIn, depthIn);
      spoken = `${outcome.message.replace(/\.$/, '')}, ${sizeWords(size.width, size.depth)}.`;
    }
    signalNavigation();
    setAssignKey(null); setPickerQuestion(null); setPickerNotice('');
    setFocusMessage(`${outcome.message}${stair}`);
    touchRefine();
    onSpeak(`${spoken}${stair} Choose the ${otherSide} half, or go back to the map.`);
  };

  const refuse = (message: string) => { setPickerQuestion(null); setPickerNotice(message); onSpeak(message); };

  const applyAssign = (choice: AssignChoice, key: RegionKey) => {
    if (!focusCell) return;
    touchRefine();
    const st = workingState();
    const outcome = assignHalf(st, key, choice, below);
    const otherKey = (key.endsWith('.L') ? key.replace('.L', '.R') : key.replace('.R', '.L')) as RegionKey;
    const wfloor = st.floors[floorId];
    const owners = [...new Set([ownerOf(wfloor, `${focusCell}.L`), ownerOf(wfloor, `${focusCell}.R`)].filter(Boolean))] as RoomIntent[];
    const replaces = (use: string) => {
      const others = owners.filter(r => r.use !== use).map(r => labelsOf(wfloor)[r.id]);
      return others.length ? ` (replaces ${others.join(' and ')} here)` : '';
    };
    const wholeFor = (use: string) => {
      const whole = giveBothHalves(st, focusCell, use);
      if (whole.kind === 'commit') finishAssign(whole, key);
      else refuse('message' in whole ? whole.message : 'Not possible here.');
    };
    switch (outcome.kind) {
      case 'commit':
        finishAssign(outcome, key);
        return;
      case 'ask-separate':
        setPickerQuestion({ text: outcome.message, answers: [
          { id: 'assign-separate', label: `Make a separate ${outcome.label}`, deliberate: true,
            action: () => applyAssign({ type: 'use', use: outcome.use, separate: true }, key) },
          { id: 'assign-other', label: 'Choose another room', action: () => setPickerQuestion(null) },
        ] });
        onSpeak(outcome.message);
        return;
      case 'too-narrow': {
        const name = libraryOf(outcome.use)?.roomLabel || outcome.use;
        setPickerQuestion({ text: outcome.message, answers: [
          { id: 'assign-whole', label: `Use the whole cell for ${name}${replaces(outcome.use)}`, deliberate: true, action: () => wholeFor(outcome.use) },
          { id: 'assign-other', label: 'Choose another room', action: () => setPickerQuestion(null) },
        ] });
        onSpeak(`${outcome.message} Use the whole cell, or choose another room.`);
        return;
      }
      case 'disconnects': {
        const otherSide = key.endsWith('.L') ? 'right' : 'left';
        const answers: PickerQuestion['answers'] = [
          // The other half is assigned by the same rules, so any question it raises is asked in turn.
          { id: 'assign-other-half', label: `Give the ${otherSide} half instead`, deliberate: true, action: () => applyAssign(choice, otherKey) },
        ];
        if (choice.type === 'use') {
          answers.push({ id: 'assign-both-halves', label: `Give both halves to ${libraryOf(choice.use)?.roomLabel || choice.use}`,
            deliberate: true, action: () => wholeFor(choice.use) });
        }
        answers.push({ id: 'assign-other', label: 'Choose another room', action: () => setPickerQuestion(null) });
        setPickerQuestion({ text: outcome.message, answers });
        onSpeak(outcome.message);
        return;
      }
      default:
        refuse(outcome.message);
    }
  };

  const onWhole = () => {
    if (!focusCell) return;
    touchRefine();
    const options = wholeOptions(floor, focusCell);
    const apply = (owner: string | null) => {
      const next = wholeCell(floor, focusCell, owner);
      dispatch({ type: 'COMMIT_FLOOR', floor: next, activeRoomId: owner ?? state.activeRoomId });
      setFocusQuestion(null);
      const message = `${owner ? `Whole cell: ${labelsOf(next)[owner] || 'room'}.` : 'Whole cell: empty.'}${stairNote(floor, next)}`;
      setFocusMessage(message);
      onSpeak(message);
    };
    if (options.length === 1 && options[0].allowed && !options[0].removes.length) { apply(options[0].owner); return; }
    setFocusQuestion({
      text: 'Make this cell whole again? Choose who keeps it.',
      answers: [
        ...options.map((o, i) => ({
          id: `refine-whole-${i}`, label: o.allowed ? o.label : `${o.label}: not possible, ${o.reason}`, deliberate: true,
          action: o.allowed ? () => apply(o.owner) : () => onSpeak(`Not possible: ${o.reason}.`),
        })),
        { id: 'refine-whole-cancel', label: 'Keep it divided', action: () => { setFocusQuestion(null); onSpeak('The cell stays divided.'); } },
      ],
    });
    onSpeak('Make this cell whole again? Choose who keeps it.');
  };

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
              {!showRestoreConfirm && hasSavedDraft() && (
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
                dispatch({ type: 'SET_FOUNDATION', key: q.key as FoundationKey, value: dflt, total: FOUNDATION_QUESTIONS.length });
                onSpeak(`Skipped. Default: ${q.options[0]}.`);
                if (state.foundationStep === FOUNDATION_QUESTIONS.length - 1) dispatch({ type: 'COMPLETE_FOUNDATION', queue: generateGFQueue(), numFloors: state.foundation.numFloors || 'Single Floor' });
              }}>SKIP →</GazeButton>
          </div>
        </div>
      </div>
    );
  };

  // ─── RENDER: Right Action Strip (The "Connected Column") ───
  // Five actions share the rail: Floor, Rooms, Next, Refine and Generate (§5.1). While Refine is on, its
  // button reads DONE REFINING and the other four are disabled. With the version 2 map off, Refine is not offered.
  const renderActionStrip = () => {
    const controlsUnlocked = !!currentRoom && state.phase === 'placement' && state.armed && !refineMode;
    const live = isGazeEnabled && !overlayOpen;

    // Common style for strip buttons. Five buttons of at least 80 px fit the rail at 768 px heights.
    const stripBtnStyle = (active: boolean, specialColor?: string) => ({
      flex: 1, width: '100%', borderRadius: 0, margin: 0,
      border: 'none',
      borderBottom: `1px solid ${T_panelBorderSoft}`,
      background: active ? (specialColor ? specialColor : T_accentSubtle) : 'transparent',
      color: active ? T_textMain : T_textDim,
      fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900,
      letterSpacing: '0.4px',
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
      gap: 'clamp(6px, 1vh, 12px)',
      padding: 'clamp(10px, 1.6vh, 22px) clamp(8px, 1vw, 14px)',
      transition: 'all 0.2s ease',
      minHeight: 'clamp(80px, 9vh, 130px)',
    });
    const accentWash = isLight || isMix ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : 'rgba(45,212,191,0.1)';

    return (
      <div className="compass-action-strip" style={{
        position: 'absolute',
        right: '24px',
        // Dynamic top — tighter when nav is visible.
        top: navHidden ? '152px' : '304px',
        width: '296px',
        height: navHidden ? 'calc(100% - 184px)' : 'calc(100% - 324px)',
        background: T_panelBg,
        border: `1px solid ${T_panelBorderSoft}`,
        borderRadius: '24px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        zIndex: 50,
        boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
        pointerEvents: overlayOpen ? 'none' : 'auto',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* BUTTON 0: FLOOR TOGGLE */}
            <GazeButton id="strip-floor" gazeEnabled={live && !refineMode} disabled={refineMode} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (overlayOpen || refineMode) return;
                if (isMultiFloor) {
                  const next = state.currentFloor === 'ground' ? 'first' : 'ground';
                  switchCompassFloor(next);
                  onSpeak(`Switched to ${next} floor.`);
                } else {
                  dws({ type: 'SET_NUM_FLOORS', value: 'Multi-Floor' });
                  onSpeak('First floor mapping enabled.');
                }
              }}
              style={stripBtnStyle(!refineMode, isLight || isMix ? accentWash : (state.currentFloor === 'ground' ? 'rgba(45,212,191,0.1)' : 'rgba(100,181,246,0.1)'))}>
              {isMultiFloor ? (
                <>
                  <div style={{ fontSize: 'clamp(22px, 2.6vh, 28px)', fontWeight: 900, color: refineMode ? T_textDim : T_textMain, letterSpacing: '0.6px' }}>{state.currentFloor === 'ground' ? 'GND' : '1F'}</div>
                  <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', fontWeight: 700, color: T_textSub, letterSpacing: '1.2px' }}>SWITCH</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 'clamp(22px, 2.6vh, 28px)', fontWeight: 900, color: refineMode ? T_textDim : T_textMain, letterSpacing: '0.6px' }}>GND</div>
                  <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', fontWeight: 700, color: refineMode ? T_textDim : T_accent, letterSpacing: '0.8px' }}>+ ADD 1F</div>
                </>
              )}
            </GazeButton>
            {/* BUTTON 1: ROOMS (MENU) */}
            <GazeButton id="strip-rooms" gazeEnabled={live && !refineMode} disabled={refineMode} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => { if (refineMode) return; setMenuOpen(true); onSpeak('Components menu.'); }}
              style={stripBtnStyle(!refineMode, T_accentSubtle)}>
              <div style={{ fontSize: 'clamp(24px, 3vh, 34px)', marginBottom: '-4px', color: refineMode ? T_textDim : T_textMain }}>{'☰'}</div>
              <div style={{ fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900, color: refineMode ? T_textDim : T_textMain, letterSpacing: '1px' }}>ROOMS</div>
            </GazeButton>

            {/* BUTTON 2: NEXT */}
            <GazeButton id="strip-next" gazeEnabled={live && controlsUnlocked} disabled={refineMode} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (overlayOpen || refineMode) return;
                if (!controlsUnlocked) { onSpeak('Press READY first.'); return; }
                dws({ type: 'NEXT_ROOM' });
              }}
              style={{
                ...stripBtnStyle(controlsUnlocked, accentWash),
                color: controlsUnlocked
                  ? (isLight ? T_accent : isMix ? '#5E9CA8' : '#2DD4BF')
                  : (isLight || isMix ? T_textDim : '#475569'),
              }}>
              <div style={{ fontSize: 'clamp(26px, 3.2vh, 36px)' }}>{'→'}</div>
              <div style={{ fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900, letterSpacing: '1px' }}>NEXT</div>
            </GazeButton>

            {/* BUTTON 3: REFINE / DONE REFINING (§5.1). Not offered when the version 2 map is off. */}
            {v2Enabled && <GazeButton id="strip-refine" gazeEnabled={live && !readOnlyDraft} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              selected={refineMode} disabled={readOnlyDraft} onClick={toggleRefine}
              style={{
                ...stripBtnStyle(true, refineMode ? T_accentSubtle : 'transparent'),
                ...(refineMode ? { boxShadow: `inset 0 0 0 3px ${T_accent}` } : {}),
              }}>
              <div style={{ fontSize: 'clamp(20px, 2.4vh, 26px)', fontWeight: 900, color: refineMode ? T_accent : T_textMain, letterSpacing: '1px' }}>
                {refineMode ? 'DONE REFINING' : 'REFINE'}
              </div>
              <div style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', fontWeight: 700, color: T_textSub, letterSpacing: '0.8px' }}>
                {refineMode ? 'BACK TO PLACING ROOMS' : legacyLocked ? 'CONVERT THE MAP FIRST' : 'DIVIDE A CELL'}
              </div>
            </GazeButton>}

            {/* BUTTON 4: GENERATE */}
            <GazeButton id="strip-generate" gazeEnabled={live && canPreviewPlan && !refineMode} disabled={refineMode} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                if (overlayOpen || refineMode) return;
                if (!canPreviewPlan) { onSpeak('Place a ground floor room first.'); return; }
                setConfirmGenerate(true);
                onSpeak('Choose ground floor only, or both floors.');
              }}
              style={{
                ...stripBtnStyle(canPreviewPlan && !refineMode, T_generatePlanBg),
                borderBottom: 'none',
                color: (canPreviewPlan && !refineMode)
                  ? (isLight || isMix ? T_textInverse : '#497775')
                  : T_textDim,
              }}>
              <div style={{ fontSize: 'clamp(22px, 2.6vh, 30px)' }}>{'📝'}</div>
              <div style={{ textAlign: 'center', lineHeight: 1.1, fontSize: 'clamp(18px, 2.1vh, 22px)', fontWeight: 900, letterSpacing: '0.8px' }}>GENERATE{'\n'}PLAN</div>
            </GazeButton>
        </div>
      </div>
    );
  };

  // ─── RENDER: one map cell. A divided cell stays one gaze target (§5.2). ───
  const neighbourId = (r: number, c: number, side: 'N' | 'S' | 'E' | 'W'): string | null => {
    if (r < 1 || r > GRID_ROWS || c < 1 || c > GRID_COLS) return null;
    const v = cellView(floor, buildCellKey(r, c));
    if (!v.split) return v.whole?.id || null;
    // The half that faces this cell: an east neighbour's left half, a west neighbour's right half.
    if (side === 'E') return v.left?.id || null;
    if (side === 'W') return v.right?.id || null;
    return v.left && v.left.id === v.right?.id ? v.left.id : null;
  };
  const shortNameOf = (room: RoomIntent): string => {
    const number = labels[room.id]?.match(/ (\d+)$/)?.[1];
    const short = libraryOf(room.use)?.shortLabel || labels[room.id] || room.use;
    return number ? `${short} ${number}` : short;
  };

  const renderCell = (cellKey: GridCellKey) => {
    const view = cellView(floor, cellKey);
    const owner = view.whole;
    const { row, col } = parseCellKey(cellKey);
    const isHov = hoveredCell === cellKey;
    const cellGaze = refineMode
      ? isGazeEnabled && !overlayOpen && !readOnlyDraft
      : isGazeEnabled && state.phase === 'placement' && state.armed && !!currentRoom && !overlayOpen;
    const half = (room: RoomIntent | null, key: string): SplitHalf => {
      const size = regionSizeIn(key, widthIn, depthIn);
      return { identity: room?.id || null, label: room ? shortNameOf(room) : null, color: room ? colourOf(room.use) : null,
        size: formatSize(size.width / 12, size.depth / 12) };
    };
    return (
      <GazeButton key={cellKey} id={`cell-${cellKey}`} gazeEnabled={cellGaze}
        className={refineMode ? 'compass-cell-refine' : undefined}
        gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
        onDwellStart={() => setHoveredCell(cellKey)}
        onDwellCancel={() => { if (hoveredCell === cellKey) setHoveredCell(null); }}
        onDwellComplete={() => setHoveredCell(null)}
        onClick={() => onCellClick(cellKey)}
        ariaLabel={view.split
          ? `Row ${row}, column ${col}, divided: left ${view.left ? labels[view.left.id] : 'empty'}, right ${view.right ? labels[view.right.id] : 'empty'}`
          : `Row ${row}, column ${col}: ${owner ? labels[owner.id] : 'empty'}`}
        contentFill
        style={{
          width: '100%', height: '100%', border: 'none', background: 'transparent',
          display: 'flex', overflow: 'hidden', padding: 0,
          position: 'relative',
          ...(isHov && cellGaze ? { zIndex: 10, boxShadow: '0 6px 16px rgba(0,0,0,0.22)' } : {})
        }}
      >
        {view.split ? (
          <SplitCellFace row={row} col={col} totalRows={GRID_ROWS} totalCols={GRID_COLS}
            left={half(view.left, `${cellKey}.L`)} right={half(view.right, `${cellKey}.R`)} />
        ) : (
          <ArchitecturalCell
            cellKey={cellKey} row={row} col={col} totalRows={GRID_ROWS} totalCols={GRID_COLS}
            roomId={owner?.use || null} identity={owner?.id || null}
            roomLabel={owner ? labels[owner.id] : null} shortLabel={owner ? shortNameOf(owner) : null}
            roomColor={colourOf(owner?.use)}
            cellWidthFt={cellWFt} cellDepthFt={cellDFt}
            isArmed={state.armed && !!currentRoom && !refineMode}
            isExpTarget={false} isExpAnchor={false} expDirection={null}
            neighborN={neighbourId(row + 1, col, 'N')} neighborS={neighbourId(row - 1, col, 'S')}
            neighborE={neighbourId(row, col + 1, 'E')} neighborW={neighbourId(row, col - 1, 'W')}
            cellLayout={(floorRefinements[floorId].cellLayouts || {})[cellKey] || undefined}
          />
        )}
      </GazeButton>
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
      // Right: 360px reserves space for the 296px sidebar + 24px right inset + ~40px gap.
      padding: '24px 360px 20px 40px',
      pointerEvents: overlayOpen ? 'none' : 'auto',
    }}>

      {/* Plot Area Container */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center'
      }}>
        {/* Compound Wall — multi-layer architectural boundary */}
        <div className="compass-plot-frame" data-armed={state.armed || refineMode} style={{
          flex: 1, width: '100%',
          display: 'flex', flexDirection: 'column',
          borderTop: state.armed || refineMode
            ? `6px solid ${T_accent}`
            : `6px solid ${isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328'}`,
          borderLeft: state.armed || refineMode
            ? `6px solid ${T_accent}`
            : `6px solid ${isLight ? '#8B7355' : isMix ? '#5A4A36' : '#3A3328'}`,
          borderRight: state.armed || refineMode
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

          {/* Direction labels — inset tabs on the wall edges. Informational only (pointerEvents none),
              so the cell beneath always owns the dwell. */}
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

          {/* Grid. The gap is a dead zone, so micro-saccades land on neutral grout instead of a neighbour. */}
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
            {RENDER_ORDER.map(renderCell)}
          </div>
        </div>

        {/* Minimal gaze-protection gap between grid bottom row and road */}
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
          {/* Gate diagram — spans exactly one cell width (25% of grid frontage), at the foundation's gate position. */}
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
                <svg
                  width="100%"
                  height="26"
                  preserveAspectRatio="none"
                  viewBox="0 0 100 26"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  <rect x="0" y="0" width="100" height="5" fill={stoneShade} />
                  <rect x="0" y="3" width="100" height="4" fill={stone} />
                  <rect x="0" y="5" width="4.5" height="19" fill={stone} />
                  <rect x="0" y="5" width="1.2" height="19" fill={stoneShade} />
                  <rect x="95.5" y="5" width="4.5" height="19" fill={stone} />
                  <rect x="98.8" y="5" width="1.2" height="19" fill={stoneShade} />
                  <rect x="-1" y="22" width="7" height="4" fill={stoneShade} />
                  <rect x="94" y="22" width="7" height="4" fill={stoneShade} />
                  <rect x="6" y="8" width="42" height="14" fill="none" stroke={stone} strokeWidth="0.7" opacity="0.55" />
                  <rect x="52" y="8" width="42" height="14" fill="none" stroke={stone} strokeWidth="0.7" opacity="0.55" />
                  <line x1="20" y1="9" x2="20" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  <line x1="34" y1="9" x2="34" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  <line x1="66" y1="9" x2="66" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  <line x1="80" y1="9" x2="80" y2="21" stroke={stone} strokeWidth="0.45" opacity="0.42" />
                  <circle cx="2.2" cy="11" r="0.9" fill={cream} opacity="0.78" />
                  <circle cx="2.2" cy="19" r="0.9" fill={cream} opacity="0.78" />
                  <circle cx="97.8" cy="11" r="0.9" fill={cream} opacity="0.78" />
                  <circle cx="97.8" cy="19" r="0.9" fill={cream} opacity="0.78" />
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
          {/* READY BUTTON - Left (~25% width = 1 cell width). Not shown in Refine, where cells answer directly. */}
          {state.phase === 'placement' && !refineMode && (
            <div className="compass-road-ready" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${100 / GRID_COLS}%`, padding: '6px' }}>
              <GazeButton
                id="ready-road-left" selected={state.armed}
                gazeEnabled={isGazeEnabled && !overlayOpen && !readOnlyDraft} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
                onClick={() => {
                  if (overlayOpen) return;
                  if (readOnlyDraft) { onSpeak('This map was saved by a newer version of GazeConnect. It is read-only.'); return; }
                  if (state.armed) { dws({ type: 'DISARM_GRID' }); } else { dws({ type: 'ARM_GRID' }); }
                }}
                style={{
                  width: '100%', height: '100%',
                  borderRadius: '12px',
                  fontWeight: 900, fontSize: 'clamp(24px, 2.9vh, 32px)', letterSpacing: '1.4px',
                  background: state.armed
                    ? (isLight || isMix ? T_accent : 'rgba(45,212,191,0.25)')
                    : (isLight || isMix ? `color-mix(in srgb, ${T_accent} 10%, transparent)` : 'rgba(45,212,191,0.05)'),
                  border: state.armed
                    ? `3px solid ${isLight || isMix ? T_accent : '#2DD4BF'}`
                    : `2px solid ${isLight || isMix ? `color-mix(in srgb, ${T_accent} 33%, transparent)` : 'rgba(45,212,191,0.2)'}`,
                  color: state.armed
                    ? T_textInverse
                    : (isLight || isMix ? T_accent : 'rgba(45,212,191,0.6)'),
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

          {/* Road label + live coverage counter (or the Refine instruction) */}
          <div className="compass-road-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none', ...(refineMode || readOnlyDraft ? { maxWidth: '44%', textAlign: 'center' as const } : {}) }}>
            <span style={{
              color: isLight ? T_accent : isMix ? '#5E9CA8' : THEME.road,
              fontWeight: 800, fontSize: 'clamp(20px, 2.4vh, 27px)', letterSpacing: '0.6px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {readOnlyDraft ? 'READ-ONLY MAP' : refineMode ? 'REFINE' : <>FRONT / ROAD ({facing}) &ndash; {pw} ft</>}
            </span>
            {(readOnlyDraft || refineMode || state.phase === 'placement') && (
              <span style={{
                fontSize: 'clamp(14px, 1.6vh, 18px)',
                fontWeight: 700,
                color: isLight ? T_textSub : isMix ? '#C4B697' : 'rgba(56,189,248,0.6)',
                letterSpacing: '0.4px',
                lineHeight: 1.3,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {readOnlyDraft ? 'Saved by a newer version of GazeConnect'
                  : refineMode ? 'Look at a cell to divide it into left and right halves'
                    : <>{formatFeetShort(owned)} / {16} cells placed &middot; {coveragePercent}%</>}
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
              {refineMode ? (
                <div style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                  background: isLight ? T_cardBg : isMix ? '#2D2820' : 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '12px',
                  border: `2px solid ${T_panelBorderSoft}`,
                }}>
                  <span style={{ fontSize: 'clamp(16px, 2vh, 22px)', fontWeight: 800, color: T_textMain, textAlign: 'center', lineHeight: 1.25 }}>
                    {floor.splits.length} DIVIDED {floor.splits.length === 1 ? 'CELL' : 'CELLS'}
                  </span>
                </div>
              ) : currentRoom && state.currentIndex < state.componentQueue.length ? (
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
        <div style={{ fontSize: 'clamp(14px, 1.8vh, 20px)', color: T_textSub, marginBottom: '32px' }}>{floor.rooms.length} rooms placed, {coveragePercent}% coverage</div>
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
      const newLib = libraryOf(confirmReplace.use);
      return (
        <div className="compass-confirmation" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDim, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `3px solid ${T_panelBorder}`, borderRadius: '24px', padding: '60px', maxWidth: '1000px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '36px', fontWeight: 900, color: T_textMain, marginBottom: '32px' }}>Replace Room?</div>
            <div style={{ fontSize: '28px', color: T_textSub, marginBottom: '50px', lineHeight: 1.5 }}>
              Do you really want to replace <span style={{ color: confirmReplace.oldColor, fontWeight: 700 }}>{confirmReplace.oldLabel}</span> with <span style={{ color: newLib?.color || T_textMain, fontWeight: 700 }}>{newLib?.roomLabel || confirmReplace.use}</span>?
            </div>
            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
              <GazeButton id="confirm-replace-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="deliberateAction"
                onClick={() => {
                  const pending = confirmReplace;
                  setConfirmReplace(null);
                  commitPlacement(placeCell(state, pending.cell, pending.use, true, below), pending.cell);
                }}
                style={{ padding: '38px 90px', minHeight: '126px', borderRadius: '24px', background: isLight || isMix ? T_accent : '#334155', border: `4px solid ${T_textMain}`, color: T_textInverse, fontSize: '38px', fontWeight: 900, minWidth: '390px' }}>
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
                onClick={restorePrevious}
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

    // Convert a map that still holds details from the retired Refine Map (§4.8). Nothing is deleted.
    if (showConvertConfirm) {
      const details = legacySummary(state.legacy);
      const divided = state.floors.ground.splits.length + state.floors.first.splits.length > 0;
      return (
        <div className="compass-confirmation" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: T_overlayDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ background: T_panelBg, border: `4px solid ${T_info}`, borderRadius: '32px', padding: '56px 64px', maxWidth: '1100px', width: '90%', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.24)' }}>
            <div style={{ fontSize: '40px', fontWeight: 900, color: T_textMain, marginBottom: '28px' }}>Convert to the new map?</div>
            <div style={{ fontSize: '26px', color: T_textSub, marginBottom: '44px', lineHeight: 1.5 }}>
              Kept and drawn: your rooms{divided ? ' and divided cells' : ''}.<br />
              Kept read-only with the map, not drawn: {details || 'the saved plan details'}.<br />
              Nothing is deleted.
            </div>
            <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
              <GazeButton id="confirm-convert-yes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="deliberateAction"
                onClick={() => {
                  dispatch({ type: 'CONVERT_LEGACY' });
                  setShowConvertConfirm(false);
                  onSpeak('Converted. The saved details are kept read-only. Choose Refine to divide a cell.');
                }}
                style={{ padding: '34px 80px', minHeight: '126px', borderRadius: '24px', background: T_info, border: 'none', color: T_textInverse, fontSize: '34px', fontWeight: 900, minWidth: '400px' }}>
                YES, CONVERT
              </GazeButton>
              <GazeButton id="confirm-convert-no" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
                onClick={() => { setShowConvertConfirm(false); onSpeak('The map is unchanged.'); }}
                style={{ padding: '34px 80px', minHeight: '126px', borderRadius: '24px', background: 'transparent', border: `5px solid ${T_textDim}`, color: T_textSub, fontSize: '34px', fontWeight: 900, minWidth: '360px' }}>
                CANCEL
              </GazeButton>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // ─── RENDER: ROOM COMPONENTS (place mode). Large, stationary choices; paging keeps the queue's order. ───
  const renderMenu = () => {
    if (!menuOpen) return null;
    const placedUses = new Set(floor.rooms.map(r => r.use));
    const cards: PickerCard[] = state.componentQueue.map((room, idx) => {
      const rooms = roomsOfUse(floor, room.roomId);
      const cells = rooms.reduce((n, r) => n + r.regions.reduce((m, k) => m + (k.includes('.') ? .5 : 1), 0), 0);
      const count = `${formatFeetShort(cells)} cell${cells === 1 ? '' : 's'}`;
      const isCurr = idx === state.currentIndex;
      return {
        id: room.roomId, label: room.roomLabel, color: libraryOf(room.roomId)?.color || T_accent, selected: isCurr,
        status: isCurr ? `● CURRENT ${rooms.length ? `- ${count}` : ''}`
          : rooms.length > 1 ? `✓ PLACED — ${rooms.length} rooms, ${count}` : rooms.length ? `✓ PLACED — ${count}` : 'UNPLACED',
      };
    });
    return (
      <CompassRoomPicker mode="place" title="ROOM COMPONENTS" floorLabel={floorId === 'first' ? '1ST FLOOR' : 'GROUND'}
        subtitle={`${state.componentQueue.filter(r => placedUses.has(r.roomId)).length} / ${state.componentQueue.length} placed`}
        cards={cards} page={menuPage} onPage={(next) => { setMenuPage(next); setMenuReady(false); }}
        ready={menuReady} onReady={() => { setMenuReady(!menuReady); onSpeak(menuReady ? 'Ready mode off.' : 'Ready. Select any room card.'); }}
        onChoose={(card) => {
          const idx = state.componentQueue.findIndex(r => r.roomId === card.id);
          if (idx < 0) return;
          const room = state.componentQueue[idx];
          dispatch({ type: 'SELECT_ROOM', roomIndex: idx }); setMenuOpen(false);
          onSpeak(roomsOfUse(floor, room.roomId).length ? `Editing ${room.roomLabel}. Press READY, then add or remove cells.` : `Selected ${room.roomLabel}. Press READY to place.`);
        }}
        onClose={() => setMenuOpen(false)}
        isGazeEnabled={isGazeEnabled} lastEnabledTimestamp={lastEnabledTimestamp} toggleGaze={toggleGaze} isWarm={isWarm} />
    );
  };

  // ─── RENDER: Refine focus view (§5.1 step 3) ───
  const belowText = (key: string): string | undefined => {
    if (!below) return undefined;
    const cell = cellOf(key);
    const room = ownerOf(below, below.splits.includes(cell) ? key : cell);
    return `Below: ${room ? labelsOf(below)[room.id] : 'empty'}`;
  };

  const renderFocus = () => {
    if (!focusCell || assignKey) return null;
    const v = cellView(floor, focusCell);
    const { row, col } = parseCellKey(focusCell);
    // An undivided cell is shown as it would divide: both halves keep the cell's room.
    const face = (room: RoomIntent | null, key: string): HalfFace => {
      const size = regionSizeIn(key, widthIn, depthIn);
      return { label: room ? labels[room.id] : 'Empty', color: room ? colourOf(room.use) : null,
        size: `${inches(size.width)} × ${inches(size.depth)}`, below: belowText(key) };
    };
    const thumbnail: ThumbCell[] = RENDER_ORDER.map(key => {
      const c = cellView(floor, key);
      const colour = (room: RoomIntent | null) => (room ? colourOf(room.use) : null);
      return { key, split: c.split, colors: c.split ? [colour(c.left), colour(c.right)] : [colour(c.whole)] };
    });
    return (
      <CompassRefineFocus
        title="Divide a cell"
        subtitle={`${floorName} · Row ${row} (${ROW_NAMES[row]}), Column ${col}`}
        left={face(v.split ? v.left : v.whole, `${focusCell}.L`)}
        right={face(v.split ? v.right : v.whole, `${focusCell}.R`)}
        divided={v.split} thumbnail={thumbnail} focusKey={focusCell}
        question={focusQuestion} message={focusMessage} canUndo={state.history.length > 0}
        onHalf={onHalf}
        onUndo={() => { touchRefine(); setFocusQuestion(null); setFocusMessage(''); dws({ type: 'UNDO' }); }}
        onWhole={onWhole} onBack={closeFocus}
        isGazeEnabled={isGazeEnabled} lastEnabledTimestamp={lastEnabledTimestamp} toggleGaze={toggleGaze} isWarm={isWarm} />
    );
  };

  // ─── RENDER: the room for one half (ROOM COMPONENTS in assign mode, §5.1 step 5) ───
  const renderAssign = () => {
    if (!assignKey || !focusCell) return null;
    const st = workingState();
    const wfloor = st.floors[floorId];
    const names = labelsOf(wfloor);
    const current = ownerOf(wfloor, assignKey) || null;
    const have = clearWidthIn(assignKey, widthIn, depthIn);
    const size = regionSizeIn(assignKey, widthIn, depthIn);
    const { row, col } = parseCellKey(focusCell);
    const side = assignKey.endsWith('.L') ? 'LEFT' : 'RIGHT';
    const cards: PickerCard[] = [{
      id: 'empty', label: 'Leave empty', color: 'var(--ui-border)', selected: !current,
      status: current ? `Now: ${names[current.id]}` : '● THIS HALF IS EMPTY',
    }];
    for (const use of catalogueUses(floorId)) {
      const lib = libraryOf(use);
      const rooms = roomsOfUse(wfloor, use);
      const joins = rooms.find(r => r.regions.some(k => k !== assignKey && regionsTouch(assignKey, k)));
      const need = MIN_CLEAR_IN[use] || 0;
      const stairTaken = STAIR_HOSTS[floorId].has(use) && wfloor.rooms.some(r => STAIR_HOSTS[floorId].has(r.use) && r.use !== use);
      // The same rules as assignHalf, in a few words, so a card never promises what choosing it refuses.
      let fit: PickerCard['fit'];
      if (current?.use === use) fit = { ok: true, text: 'Already this room' };
      else if (use === 'void') fit = voidProblem(below, [assignKey], state.choices)
        ? { ok: false, text: 'Needs the living hall below' } : { ok: true, text: 'Makes the living hall below double height' };
      else if (joins) fit = { ok: true, text: `Joins ${names[joins.id]}` };
      else if (rooms.length && !REPEATABLE.has(use)) fit = { ok: false, text: 'One per floor: placed elsewhere' };
      else if (stairTaken) fit = { ok: false, text: 'The stair is already placed' };
      else fit = need && have < need ? { ok: false, text: `Too narrow: needs ${inches(need)}` } : { ok: true, text: `Fits: ${inches(have)} clear` };
      cards.push({
        id: use, label: lib?.roomLabel || use, color: colourOf(use), selected: current?.use === use, fit,
        status: current?.use === use ? '● THIS HALF' : !rooms.length ? 'Not placed yet'
          : rooms.length === 1 ? 'Placed on this floor' : `${rooms.length} on this floor`,
      });
    }
    return (
      <CompassRoomPicker mode="assign" title={`Room for the ${side} half`} floorLabel={floorId === 'first' ? '1ST FLOOR' : 'GROUND'}
        subtitle={`Row ${row}, Column ${col} · ${inches(size.width)} × ${inches(size.depth)}`}
        cards={cards} page={assignPage} onPage={(next) => { setAssignPage(next); setAssignReady(false); touchRefine(); }}
        ready={assignReady} onReady={() => { setAssignReady(!assignReady); touchRefine(); onSpeak(assignReady ? 'Ready mode off.' : 'Ready. Select a room for this half.'); }}
        onChoose={(card) => applyAssign(card.id === 'empty' ? { type: 'empty' } : { type: 'use', use: card.id }, assignKey)}
        onClose={() => { signalNavigation(); setAssignKey(null); setPickerQuestion(null); setPickerNotice(''); touchRefine(); onSpeak('Back to the cell. Nothing changed.'); }}
        question={pickerQuestion} notice={pickerNotice}
        isGazeEnabled={isGazeEnabled} lastEnabledTimestamp={lastEnabledTimestamp} toggleGaze={toggleGaze} isWarm={isWarm} />
    );
  };

  // ─── Determine if we should show floor transition ───────
  const showFloorTransition = state.phase === 'review' && state.currentFloor === 'ground' && isMultiFloor;

  // ─── MAIN RENDER ────────────────────────────────────────

  return (
    <div data-nav-hidden={navHidden} className={`compass-screen${isLight ? ' theme-light' : ''}${isMix ? ' theme-mix' : ''}${isWarm ? ' theme-warm' : ''}`} style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: T_pageBg, display: 'flex', flexDirection: 'column', fontFamily: UI_FONT }}>
      {!fullScreenOverlay && (!navHidden || state.phase === 'foundation') && (
        <div style={{ pointerEvents: overlayOpen ? 'none' : 'auto' }}>
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
      {!fullScreenOverlay && (!navHidden || state.phase === 'foundation') && (
        <div
          data-gaze="false"
          style={{ height: '30px', pointerEvents: 'none', flexShrink: 0 }}
        />
      )}
      {/* Floating SHOW NAV ↑ button — shown when nav is hidden, aligned with right action strip */}
      {!overlayOpen && navHidden && state.phase !== 'foundation' && !isFocusLocked && (
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
      {!overlayOpen && !navHidden && (state.phase === 'placement' || state.phase === 'review') && (
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

      {!fullScreenOverlay && (state.phase === 'placement' || (state.phase === 'review' && !showFloorTransition)) && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden', position: 'relative', pointerEvents: overlayOpen ? 'none' : 'auto' }}>
          {/* LEFT: Plot Canvas + Info Overlays */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderPlotCanvas()}
          </div>

          {/* RIGHT: Action Strip */}
          {renderActionStrip()}
        </div>
      )}

      {!fullScreenOverlay && showFloorTransition && renderFloorTransition()}

      {renderMenu()}
      {renderFocus()}
      {renderAssign()}
      {renderConfirmationOverlay()}

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
      {roomToast && !overlayOpen && !refineMode && (
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

      {showCompassStudio && v2Enabled && studioPlan && (
        <CompassStudio plan={studioPlan} scope={studioScope} onSpeak={onSpeak}
          onClose={() => { setShowCompassStudio(false); onSpeak('Back to Compass Map.'); }}
          onLegacyReview={openLegacyReview} />
      )}

      {showCompassStudio && !v2Enabled && compiledPayload && (
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

export default React.memo(CompassMapScreen);
