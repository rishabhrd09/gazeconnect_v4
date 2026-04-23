export type SplitDirection = 'vertical' | 'horizontal';
export type WallEdgeType = 'full_wall' | 'half_wall_glass' | 'open_archway' | 'no_wall';

export interface SubCellAssignment {
  parentCell: string;
  splitDirection: SplitDirection;
  roomA: string;
  roomB: string;
  roomAPct?: number;   // percentage 25-75, default 50
  roomBPct?: number;   // auto-calculated: 100 - roomAPct
}

export interface EdgeDefinition {
  id: string;
  boundary: [string, string];
  cells: [string, string];
  type: WallEdgeType;
}

export interface VoidMarker {
  cell: string;
  type: 'open_to_below';
}

export interface CellRotation {
  cell: string;
  degrees: 0 | 90 | 180 | 270;
}

export interface CellExpansion {
  cell: string;
  direction: 'up' | 'down' | 'left' | 'right';
  targetCell: string;
}

export interface CaregiverAnnotation {
  id: string;
  text: string;
}

export interface VastuFlag {
  cell: string;
  roomId: string;
  issue: string;
  suggestion: string;
}

export interface AccessibilityMarker {
  cell: string;
  type: 'wheelchair_turning_circle' | 'wide_door';
}

export interface AdvancedRefinements {
  version: 2;
  subCellSplits: SubCellAssignment[];
  customEdges: EdgeDefinition[];
  voidMarkers: VoidMarker[];
  cellRotations: CellRotation[];
  cellExpansions: CellExpansion[];
  caregiverAnnotations: CaregiverAnnotation[];
  vastuFlags: VastuFlag[];
  accessibilityMarkers: AccessibilityMarker[];
  cellLayouts?: Record<string, 'left' | 'right' | 'top' | 'bottom'>;
}

export type AdvancedPhase = 'room_selection' | 'overview' | 'split' | 'walls' | 'void' | 'rotate' | 'expand' | 'notes';
