/**
 * CompassPlanV2: the one persisted description of a Compass house (docs/compass-refine/IMPLEMENTATION_PLAN.md §4.3).
 *
 * It stores only what the person chose: plot facts, cells divided left/right (v2) or top/bottom (v3),
 * exactly 50 %, screen-relative with the road at the bottom; top is the larger model y. Which rooms
 * own which regions, and two layout preferences. Walls, doors, windows, the stair and every view are
 * derived from it by tools/compass_geometry.py. Mirrored by tools/compass_schema.py.
 */

export type Row = 1 | 2 | 3 | 4;
export type Col = 1 | 2 | 3 | 4;
export type CellKey = `r${Row}_c${Col}`;
export type HalfSide = 'L' | 'R' | 'T' | 'B';
export type SplitDirection = 'left-right' | 'top-bottom';
export type HalfKey = `${CellKey}.${HalfSide}`;
export type RegionKey = CellKey | HalfKey;
export type FloorId = 'ground' | 'first';
export type Facing = 'North' | 'East' | 'South' | 'West';
export type GateSide = 'Left' | 'Center' | 'Right';
export type PlotType = 'Middle Plot' | 'Corner Plot' | 'Independent';

/** Historical public type name retained for the studio; supports canonical formats 2 and 3. */
export interface CompassPlanV2 {
  schema: 'gazeconnect.compass-plan';
  version: 2 | 3;
  plot: {
    widthIn: number;                 // whole inches, 180..2400 (15 to 200 ft)
    depthIn: number;
    facing: Facing;                  // the direction the road side faces
    gate: GateSide;
    plotType: PlotType;
    sidesOpen?: { left: boolean; right: boolean };   // answer to the party-wall question
    secondRoad?: 'Left' | 'Right';                    // corner plots only
  };
  storeys: 1 | 2;
  floors: { ground: FloorIntent; first?: FloorIntent };
  choices: { drawingRoom?: 'separate' | 'open'; kitchen?: 'open' | 'closed' };
  /** Saved details from the retired Refine Map, kept verbatim and read-only. */
  legacy?: { fromVersion: 1; refinements: unknown; reason: string; converted?: boolean };
}

export interface FloorIntent {
  splits: CellKey[];                 // sorted, unique; exactly two equal halves per cell
  /** Version 3: top/bottom exceptions. Missing entries retain the v2 left/right meaning. */
  splitDirections?: Partial<Record<CellKey, SplitDirection>>;
  rooms: RoomIntent[];               // sorted by id
}

export interface RoomIntent {
  id: string;                        // 'g-bedroom-2': floor prefix, use, number
  use: string;                       // a ROOM_LIBRARY id, 'passage' or 'void' (Open to below, first floor)
  regions: RegionKey[];              // sorted, unique, edge-connected
}

export type IssueSeverity = 'info' | 'warning' | 'conflict' | 'infeasible';

export interface PlanIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  rooms: string[];
  regions: string[];
}
