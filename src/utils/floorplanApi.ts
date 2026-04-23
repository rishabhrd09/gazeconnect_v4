/**
 * floorplanApi.ts — Frontend bridge to Python Floor Plan Generator
 * ================================================================
 * Handles API calls to floorplan_server.py (Flask backend).
 * Compiles compass map + survey data into the format expected by
 * gazeconnect_floorplan_v5.py's parse() function.
 */

// ─── Configuration ─────────────────────────────────────────

const runtimeApiBase =
  (window as any).__GAZECONNECT_FLOORPLAN_API__
  || (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_FLOORPLAN_API
  || (typeof process !== 'undefined'
    ? (process as { env?: Record<string, string | undefined> }).env?.REACT_APP_FLOORPLAN_API
    : undefined);

const API_BASE = runtimeApiBase || 'http://127.0.0.1:5050';
let floorplanBootPromise: Promise<void> | null = null;

async function ensureFloorplanServerReady(): Promise<void> {
  if (floorplanBootPromise) {
    return floorplanBootPromise;
  }

  floorplanBootPromise = (async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.floorplan?.ensureServer) {
        await api.floorplan.ensureServer();
        // Give the spawned process a short warm-up window.
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch {
      // Backend health checks and request retries handle readiness errors.
    } finally {
      floorplanBootPromise = null;
    }
  })();

  return floorplanBootPromise;
}

export type FloorPlanStyle = 'modern' | 'autocad' | 'blueprint' | 'presentation';
export type FloorPlanFormat = 'png' | 'pdf' | 'svg';
export type FloorSelect = 'ground' | 'first' | 'all';

export interface FloorPlanFusionContext {
  surveyData?: Record<string, any> | null;
  userNotes?: string;
  useAdvancedFusion?: boolean;
}

// ─── Types ─────────────────────────────────────────────────

export interface CompassMapPayload {
  grid_size: { rows: number; cols: number };
  plot: {
    width_ft: number;
    depth_ft: number;
    facing: string;
    type: string;
    num_floors?: string;
  };
  cell_size_ft?: { width: number; depth: number };
  ground_floor?: FloorPayload;
  first_floor?: FloorPayload;
}

export interface FloorPayload {
  placements: PlacementEntry[];
  coverage_percent?: number;
  empty_cells?: string[];
}

export interface PlacementEntry {
  room: string;
  roomId: string;
  cells: string[];
  coords: { x1: number; y1: number; x2: number; y2: number };
  cellRects?: Record<string, { x1: number; y1: number; x2: number; y2: number }>;
  area_sqft: number;
}

export interface GenerateResult {
  url: string;
  blob: Blob;
}

export interface GenerateError {
  error: string;
}

export interface AllStylesResult {
  styles: Record<FloorPlanStyle, string>; // base64 data URLs
  floor: string;
}

// ─── Health Check ──────────────────────────────────────────

export async function checkBackendHealth(): Promise<boolean> {
  try {
    await ensureFloorplanServerReady();
    const resp = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Generate Single Floor Plan ────────────────────────────

export async function generateFloorPlan(
  compassData: CompassMapPayload,
  style: FloorPlanStyle = 'modern',
  format: FloorPlanFormat = 'png',
  floor: FloorSelect = 'ground',
  context?: FloorPlanFusionContext,
): Promise<GenerateResult | GenerateError> {
  await ensureFloorplanServerReady();

  const endpoint = context?.useAdvancedFusion
    ? '/api/floorplan/generate-advanced'
    : '/api/floorplan/generate';

  const body = JSON.stringify({
    compass_map: compassData,
    style,
    format,
    floor,
    survey_data: context?.surveyData || undefined,
    user_notes: context?.userNotes?.trim() || undefined,
  });

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[FloorPlanAPI] Attempt ${attempt}/${MAX_RETRIES}: POST ${API_BASE}${endpoint}`);
      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[FloorPlanAPI] Server error ${resp.status}:`, text);
        try {
          const err = JSON.parse(text);
          return { error: err.error || `Server error ${resp.status}` };
        } catch {
          return { error: `Server error ${resp.status}: ${text}` };
        }
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      console.log(`[FloorPlanAPI] Success on attempt ${attempt}, size=${blob.size}`);
      return { url, blob };
    } catch (e: any) {
      console.error(`[FloorPlanAPI] Attempt ${attempt} failed:`, e.message);
      if (attempt < MAX_RETRIES) {
        console.log(`[FloorPlanAPI] Retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      } else {
        return { error: `Connection failed: ${e.message}. Ensure floorplan_server.py is running on port 5050.` };
      }
    }
  }
  return { error: 'Unexpected error after retries.' };
}

// ─── Generate All 4 Styles ────────────────────────────────

export async function generateAllStyles(
  compassData: CompassMapPayload,
  floor: FloorSelect = 'ground',
  context?: FloorPlanFusionContext,
): Promise<AllStylesResult | GenerateError> {
  try {
    await ensureFloorplanServerReady();
    const resp = await fetch(`${API_BASE}/api/floorplan/generate-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compass_map: compassData,
        floor,
        survey_data: context?.surveyData || undefined,
        user_notes: context?.userNotes?.trim() || undefined,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
      return { error: err.error || `Server error ${resp.status}` };
    }

    return await resp.json();
  } catch (e: any) {
    return { error: `Connection failed: ${e.message}` };
  }
}

// ─── Quick Preview (low-res) ──────────────────────────────

export async function generatePreview(
  compassData: CompassMapPayload,
  style: FloorPlanStyle = 'presentation',
  context?: FloorPlanFusionContext,
): Promise<GenerateResult | GenerateError> {
  try {
    await ensureFloorplanServerReady();
    const resp = await fetch(`${API_BASE}/api/floorplan/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compass_map: compassData,
        style,
        survey_data: context?.surveyData || undefined,
        user_notes: context?.userNotes?.trim() || undefined,
      }),
    });

    if (!resp.ok) {
      return { error: `Preview failed: ${resp.status}` };
    }

    const blob = await resp.blob();
    return { url: URL.createObjectURL(blob), blob };
  } catch (e: any) {
    return { error: e.message };
  }
}

// ─── Data Compiler: Compass State → API Payload ───────────
// This compiles the live CompassMapScreen reducer state into
// the exact JSON format expected by the Python parse() function.

export function compileCompassPayload(
  foundation: {
    facing: string | null;
    plotWidth: number | null;
    plotDepth: number | null;
    plotType: string | null;
    numFloors: string | null;
  },
  placements: Array<{
    roomId: string;
    roomLabel: string;
    occupiedCells: string[];
    coords: { x1: number; y1: number; x2: number; y2: number };
    cellRects?: Record<string, { x1: number; y1: number; x2: number; y2: number }>;
  }>,
  gridRows: number,
  gridCols: number,
  coveragePercent: number,
  groundFloorData?: { placements: any[]; coveragePercent: number } | null,
  firstFloorData?: { placements: any[]; coveragePercent: number } | null,
  currentFloor?: 'ground' | 'first',
): CompassMapPayload {
  const pw = foundation.plotWidth || 40;
  const pd = foundation.plotDepth || 60;
  const cellW = Math.round(pw / gridCols);
  const cellD = Math.round(pd / gridRows);

  const mkPlacements = (pls: any[]): PlacementEntry[] =>
    pls.map((p) => ({
      room: p.roomLabel || p.room || p.roomId,
      roomId: p.roomId,
      cells: p.occupiedCells || p.cells || [],
      coords: p.coords || { x1: 0, y1: 0, x2: 0, y2: 0 },
      cellRects: p.cellRects || {},
      area_sqft: p.area_sqft || (() => {
        const c = p.coords || { x1: 0, y1: 0, x2: 0, y2: 0 };
        return Math.round((c.x2 - c.x1) * (c.y2 - c.y1));
      })(),
    }));

  const payload: CompassMapPayload = {
    grid_size: { rows: gridRows, cols: gridCols },
    plot: {
      width_ft: pw,
      depth_ft: pd,
      facing: foundation.facing || 'South',
      type: foundation.plotType || 'Middle Plot',
      num_floors: foundation.numFloors || 'Single Floor',
    },
    cell_size_ft: { width: cellW, depth: cellD },
  };

  // Build floor data based on current state
  if (currentFloor === 'first' && groundFloorData) {
    payload.ground_floor = {
      placements: mkPlacements(groundFloorData.placements),
      coverage_percent: groundFloorData.coveragePercent,
    };
    payload.first_floor = {
      placements: mkPlacements(placements),
      coverage_percent: coveragePercent,
    };
  } else if (currentFloor === 'ground' && firstFloorData) {
    payload.ground_floor = {
      placements: mkPlacements(placements),
      coverage_percent: coveragePercent,
    };
    payload.first_floor = {
      placements: mkPlacements(firstFloorData.placements),
      coverage_percent: firstFloorData.coveragePercent,
    };
  } else {
    payload.ground_floor = {
      placements: mkPlacements(placements),
      coverage_percent: coveragePercent,
    };
  }

  return payload;
}

// ─── Data Compiler: Survey Answers → Enrichment ───────────
// Merges survey answers into compass payload for richer floor plans

export function enrichWithSurveyData(
  compassPayload: CompassMapPayload,
  surveyAnswers: Record<string, any>,
): CompassMapPayload {
  // Survey can override/enrich plot data
  const enriched = { ...compassPayload };

  if (surveyAnswers.plot_width_ft) {
    enriched.plot.width_ft = parseInt(surveyAnswers.plot_width_ft, 10) || enriched.plot.width_ft;
  }
  if (surveyAnswers.plot_depth_ft) {
    enriched.plot.depth_ft = parseInt(surveyAnswers.plot_depth_ft, 10) || enriched.plot.depth_ft;
  }
  if (surveyAnswers.road_facing) {
    enriched.plot.facing = surveyAnswers.road_facing.replace(' Facing', '') || enriched.plot.facing;
  }
  if (surveyAnswers.plot_type) {
    enriched.plot.type = surveyAnswers.plot_type || enriched.plot.type;
  }

  return enriched;
}
