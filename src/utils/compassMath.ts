/**
 * Pure math/utility functions for Compass Map.
 * No React, no side-effects — safe for unit testing.
 * Grid: 4 columns × 4 rows = 16 cells.
 */

import { GridCellKey, CellRect, ExpansionDirection, GRID_ROWS, GRID_COLS } from '../types/compass';

// ─── Cell Key Parsing ─────────────────────────────────────

export function parseCellKey(cell: GridCellKey): { row: number; col: number } {
  const match = cell.match(/^r(\d)_c(\d)$/);
  if (!match) throw new Error(`Invalid cell key: ${cell}`);
  return { row: parseInt(match[1], 10), col: parseInt(match[2], 10) };
}

export function buildCellKey(row: number, col: number): GridCellKey {
  if (row < 1 || row > GRID_ROWS || col < 1 || col > GRID_COLS) {
    throw new Error(`Invalid row/col: ${row},${col}`);
  }
  return `r${row}_c${col}` as GridCellKey;
}

// ─── Cell-to-Rect Geometry ────────────────────────────────

/** Precision-safe cell-to-rect conversion with terminal edge clamp. */
export function cellToRect(
  cell: GridCellKey,
  plotWidth: number,
  plotDepth: number,
  precision: number = 4,
): CellRect {
  if (plotWidth <= 0 || plotDepth <= 0) return { x1: 0, y1: 0, x2: 0, y2: 0 };

  const { row, col } = parseCellKey(cell);
  const cellWidth = plotWidth / GRID_COLS;
  const cellDepth = plotDepth / GRID_ROWS;

  let x1 = snap((col - 1) * cellWidth, precision);
  let y1 = snap((row - 1) * cellDepth, precision);
  let x2 = snap(col * cellWidth, precision);
  let y2 = snap(row * cellDepth, precision);

  // Terminal edge clamp — avoid float drift on last col/row.
  if (col === GRID_COLS) x2 = plotWidth;
  if (row === GRID_ROWS) y2 = plotDepth;

  return { x1, y1, x2, y2 };
}

export function cellsToBoundingRect(
  cells: GridCellKey[],
  plotWidth: number,
  plotDepth: number,
  precision: number = 4,
): CellRect {
  if (cells.length === 0 || plotWidth <= 0 || plotDepth <= 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }
  const rects = cells.map((c) => cellToRect(c, plotWidth, plotDepth, precision));
  return {
    x1: Math.min(...rects.map((r) => r.x1)),
    y1: Math.min(...rects.map((r) => r.y1)),
    x2: Math.max(...rects.map((r) => r.x2)),
    y2: Math.max(...rects.map((r) => r.y2)),
  };
}

// ─── Expansion ────────────────────────────────────────────

export function getExpandedCells(anchor: GridCellKey, direction: ExpansionDirection): GridCellKey[] {
  const { row, col } = parseCellKey(anchor);
  if (direction === 'right' && col < GRID_COLS) return [anchor, buildCellKey(row, col + 1)];
  if (direction === 'down' && row < GRID_ROWS) return [anchor, buildCellKey(row + 1, col)];
  return [anchor];
}

export function getValidExpansionDirections(
  anchor: GridCellKey,
  occupiedCells: Set<string>,
): ExpansionDirection[] {
  const { row, col } = parseCellKey(anchor);
  const directions: ExpansionDirection[] = [];
  if (col < GRID_COLS && !occupiedCells.has(buildCellKey(row, col + 1))) directions.push('right');
  if (row < GRID_ROWS && !occupiedCells.has(buildCellKey(row + 1, col))) directions.push('down');
  return directions;
}

// ─── Coverage ─────────────────────────────────────────────

export function computeCoveragePercent(
  occupiedCount: number,
  total: number = GRID_ROWS * GRID_COLS,
  precision: number = 1,
): number {
  if (total <= 0) return 0;
  return snap((occupiedCount / total) * 100, precision);
}

// ─── Color Contrast ───────────────────────────────────────

/** Returns dark or light text color based on background luminance. */
export function getContrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#1E293B' : '#FFFFFF';
}

// ─── Contextual Zone Labels ───────────────────────────────

/**
 * Human-readable zone label. Front is always Row 1 (bottom of screen).
 * Row 4 = Back, Row 3 = Mid, Row 2 = Inner, Row 1 = Front.
 */
export function getCellZoneLabel(row: number, col: number): string {
  const rowLabels: Record<number, string> = {
    4: 'Back',
    3: 'Mid',
    2: 'Inner',
    1: 'Front',
  };
  const colLabels: Record<number, string> = {
    1: 'Left',
    2: '',
    3: '',
    4: 'Right',
  };
  const v = rowLabels[row] || '';
  const h = colLabels[col] || '';
  return h ? `${v}\n${h}` : v;
}

// ─── Internal ─────────────────────────────────────────────

function snap(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}
