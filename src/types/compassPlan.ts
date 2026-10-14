/**
 * CompassPlanV2: the one persisted description of a Compass house (docs/compass-refine/IMPLEMENTATION_PLAN.md §4.3).
 *
 * It stores only what the person chose: plot facts, which cells are divided into a left and a right
 * half (exactly 50 %, screen-relative: left is the smaller x, with the road at the bottom), which rooms
 * own which regions, and two layout preferences. Walls, doors, windows, the stair and every view are
 * derived from it by tools/compass_geometry.py. Mirrored by tools/compass_schema.py.
 */

export type Row = 1 | 2 | 3 | 4;
export type Col = 1 | 2 | 3 | 4;
export type CellKey = `r${Row}_c${Col}`;
export type HalfKey = `${CellKey}.L` | `${CellKey}.R`;
export type RegionKey = CellKey | HalfKey;
export type FloorId = 'ground' | 'first';
export type Facing = 'North' | 'East' | 'South' | 'West';
export type GateSide = 'Left' | 'Center' | 'Right';
export type PlotType = 'Middle Plot' | 'Corner Plot' | 'Independent';

export interface CompassPlanV2 {
  schema: 'gazeconnect.compass-plan';
  version: 2;
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
  splits: CellKey[];                 // sorted, unique; each is exactly 50 % left | 50 % right
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
