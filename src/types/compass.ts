/**
 * Canonical shared types for Compass Map
 * Grid: 4 columns × 4 rows = 16 cells
 * Row 1 = front (road side), Row 4 = back
 */

export const GRID_ROWS = 4;
export const GRID_COLS = 4;

export type GridCellKey = `r${1 | 2 | 3 | 4}_c${1 | 2 | 3 | 4}`;
export type CompassPhase = 'foundation' | 'placement' | 'review' | 'floor_transition';
export type ExpansionDirection = 'right' | 'down';
export type FloorType = 'ground' | 'first';

export interface CellRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GridCellState {
  roomId: string | null;
  anchorPlacementId: string | null;
  isExpandedChild: boolean;
}

export interface RoomComponent {
  roomId: string;
  roomLabel: string;
  shortLabel: string;
  color: string;
  expandable: boolean;
  recommendedCells?: number;
  typicalSqft?: string;
}

export interface PlacementRecord {
  placementId: string;
  roomId: string;
  roomLabel: string;
  anchorCell: GridCellKey;
  occupiedCells: GridCellKey[];
  coords: CellRect;
  cellRects: Record<string, CellRect>;
}

export interface PendingExpansion {
  anchorCell: GridCellKey;
  room: RoomComponent;
  validDirections: ExpansionDirection[];
  activatedAt: number;
}

export interface CompassHistoryEntry {
  grid: Record<string, GridCellState>;
  placements: PlacementRecord[];
  currentIndex: number;
  phase: CompassPhase;
  pendingExpansion: PendingExpansion | null;
}

/** All 16 cell keys in logical order (r1 = front/road, r4 = back) */
export const ALL_CELL_KEYS: GridCellKey[] = [
  'r1_c1', 'r1_c2', 'r1_c3', 'r1_c4',
  'r2_c1', 'r2_c2', 'r2_c3', 'r2_c4',
  'r3_c1', 'r3_c2', 'r3_c3', 'r3_c4',
  'r4_c1', 'r4_c2', 'r4_c3', 'r4_c4',
];

/**
 * Render order: Row 4 at top of screen (back), Row 1 at bottom (front/road).
 * Use this for the grid .map() to place front at bottom visually.
 */
export const RENDER_ORDER: GridCellKey[] = [
  'r4_c1', 'r4_c2', 'r4_c3', 'r4_c4',
  'r3_c1', 'r3_c2', 'r3_c3', 'r3_c4',
  'r2_c1', 'r2_c2', 'r2_c3', 'r2_c4',
  'r1_c1', 'r1_c2', 'r1_c3', 'r1_c4',
];
