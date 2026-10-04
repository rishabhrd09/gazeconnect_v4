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

// The packaged renderer uses file:// and has no web origin. Let the main
// process call only its fixed loopback API; do not allow null origins or disable CORS.
async function floorplanFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const request = (window as any).electronAPI?.floorplan?.request;
  if (request && !runtimeApiBase) {
    const reply = await request({ endpoint, body: init?.body });
    return new Response(new Uint8Array(reply.bytes), {
      status: reply.status, headers: { 'Content-Type': reply.contentType },
    });
  }
  return fetch(`${API_BASE}${endpoint}`, init);
}

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
  layout_candidate_id?: string;
  grid_size: { rows: number; cols: number };
  plot: {
    width_ft: number;
    depth_ft: number;
    facing: string;
    type: string;
    num_floors?: string;
    gate_position?: 'Left' | 'Center' | 'Right';
  };
  cell_size_ft?: { width: number; depth: number };
  ground_floor?: FloorPayload;
  first_floor?: FloorPayload;
}

export interface FloorPayload {
  placements: PlacementEntry[];
  coverage_percent?: number;
  empty_cells?: string[];
  advanced_refinements?: Record<string, unknown>;
  cell_layouts?: Record<string, unknown>;
}

export interface PlacementEntry {
  room: string;
  roomId: string;
  placementId?: string;
  cells: string[];
  coords: { x1: number; y1: number; x2: number; y2: number };
  cellRects?: Record<string, { x1: number; y1: number; x2: number; y2: number }>;
  geometryRects?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  area_sqft: number;
}

export type PlanDirection = 'N' | 'E' | 'S' | 'W';

export interface PlanAdjustment {
  floor: 'ground' | 'first';
  placementId: string;
  action: 'room_size';
  direction: PlanDirection;
  amount_ft: 1 | 2;
}

export interface PlanCandidate {
  id: string;
  label: string;
  summary: string;
  changes: string[];
  metrics?: Record<string, number>;
  previews: { ground?: string; first?: string };
  compassData: CompassMapPayload;
  valid: true;
  editableActions?: Array<'room_size'>;
  allowedAdjustments?: Partial<Record<'ground' | 'first', Record<string, PlanDirection[]>>>;
}

export interface PlanCandidatesResult {
  candidates: PlanCandidate[];
  warnings?: string[];
  sourceHash?: string;
}

export interface PlanApiError extends GenerateError {
  code?: string;
  details?: string[];
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
    const resp = await floorplanFetch('/api/health', { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function readPlanApiError(resp: Response): Promise<PlanApiError> {
  try {
    const body = await resp.json() as { error?: string; code?: string; status?: string; details?: unknown };
    return {
      error: body.error || `Floor plan request failed (${resp.status}).`,
      code: body.code || body.status,
      details: Array.isArray(body.details) ? body.details.filter((detail): detail is string => typeof detail === 'string') : undefined,
    };
  } catch {
    return { error: `Floor plan request failed (${resp.status}).` };
  }
}

/** Generate distinct geometry choices; the existing four display styles are separate. */
export async function generatePlanCandidates(
  compassData: CompassMapPayload,
  context?: FloorPlanFusionContext,
): Promise<PlanCandidatesResult | PlanApiError> {
  try {
    await ensureFloorplanServerReady();
    const resp = await floorplanFetch('/api/floorplan/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compass_map: compassData,
        survey_data: context?.surveyData || undefined,
        user_notes: context?.userNotes?.trim() || undefined,
      }),
    });
    if (!resp.ok) return readPlanApiError(resp);
    return await resp.json() as PlanCandidatesResult;
  } catch (error) {
    return { error: `Unable to generate layout choices: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Preview a precise room adjustment without changing the accepted candidate. */
export async function previewPlanAdjustment(
  candidate: PlanCandidate,
  adjustment: PlanAdjustment,
): Promise<PlanCandidate | PlanApiError> {
  try {
    await ensureFloorplanServerReady();
    const resp = await floorplanFetch('/api/floorplan/candidates/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compass_map: candidate.compassData,
        candidate_id: candidate.id,
        adjustment,
      }),
    });
    if (!resp.ok) return readPlanApiError(resp);
    const body = await resp.json() as { candidate: PlanCandidate };
    return body.candidate;
  } catch (error) {
    return { error: `Unable to preview adjustment: ${error instanceof Error ? error.message : String(error)}` };
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
      const resp = await floorplanFetch(endpoint, {
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
    const resp = await floorplanFetch('/api/floorplan/generate-all', {
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
    const resp = await floorplanFetch('/api/floorplan/preview', {
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
    gatePosition?: string | null;
  },
  placements: Array<{
    placementId?: string;
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
    pls.map((p, index) => ({
      room: p.roomLabel || p.room || p.roomId,
      roomId: p.roomId,
      placementId: p.placementId || `${p.roomId}_${index}`,
      cells: p.occupiedCells || p.cells || [],
      coords: p.coords || { x1: 0, y1: 0, x2: 0, y2: 0 },
      cellRects: p.cellRects || {},
      geometryRects: p.geometryRects,
      area_sqft: p.area_sqft || (() => {
        const rects = Object.values(p.cellRects || {}) as Array<{ x1: number; y1: number; x2: number; y2: number }>;
        if (rects.length) return Math.round(rects.reduce((total, rect) => total + (rect.x2 - rect.x1) * (rect.y2 - rect.y1), 0));
        const rect = p.coords || { x1: 0, y1: 0, x2: 0, y2: 0 };
        return Math.round((rect.x2 - rect.x1) * (rect.y2 - rect.y1));
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
      gate_position: foundation.gatePosition === 'Left' || foundation.gatePosition === 'Right'
        ? foundation.gatePosition : 'Center',
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
  const enriched = { ...compassPayload, plot: { ...compassPayload.plot } };

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

// Compass studio deliberately bypasses survey fusion: preview and export share
// the exact selected geometry, and a ground-only request never edits the draft.
export type CompassPlanScope = 'ground' | 'all';
export type CompassView = '2d' | '3d' | 'exterior';
export type CompassExteriorStyle = 'verandah' | 'warm-modern' | 'terracotta';
export interface CompassPlanOption {
  id: string;
  label: string;
  summary: string;
  compassData: CompassMapPayload;
  valid: boolean;
  notes: string[];
  changes?: Array<{ floor: string; placementId: string; room: string; area_delta_sqft: number }>;
}
async function compassRequest(endpoint: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  await ensureFloorplanServerReady();
  signal?.throwIfAborted();
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 60000);
  try {
    // IPC cannot cancel a main-process HTTP request; still release the UI on
    // close/timeout and ignore its eventual reply. Browser fetch also aborts.
    const request = () => new Promise<Response>((resolve, reject) => {
      const cancel = () => reject(new DOMException('Plan request cancelled', 'AbortError'));
      timeout.signal.addEventListener('abort', cancel, { once: true });
      floorplanFetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: timeout.signal,
      }).then(resolve, reject).finally(() => timeout.signal.removeEventListener('abort', cancel));
    });
    let response = await request();
    // Closing a native IPC request cannot stop Python's already-running job.
    // Briefly retry backpressure after a view change; never queue CPU jobs or
    // retry a malformed map. The outer deadline and abort still bound this.
    for (let attempt = 0; response.status === 429 && attempt < 6; attempt++) {
      await response.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(wait); reject(new DOMException('Plan request cancelled', 'AbortError')); };
        const wait = setTimeout(() => { timeout.signal.removeEventListener('abort', cancel); resolve(); }, Math.min(300 * (attempt + 1), 1000));
        timeout.signal.addEventListener('abort', cancel, { once: true });
        if (timeout.signal.aborted) cancel();
      });
      timeout.signal.throwIfAborted();
      response = await request();
    }
    signal?.throwIfAborted();
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'The plan could not be generated. Please try again.');
    }
    return response;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof TypeError) throw new Error('The floor plan service is unavailable. Start the app’s floor plan service, then try again.');
    if (timeout.signal.aborted) throw new Error('The floor plan service took too long. Please try again.');
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
export async function getCompassPlanOptions(compassData: CompassMapPayload, scope: CompassPlanScope, signal?: AbortSignal): Promise<{ options: CompassPlanOption[]; notes: string[] }> {
  const response = await compassRequest('/api/floorplan/compass/options', { compass_map: compassData, scope }, signal);
  return response.json();
}
export async function renderCompassPlan(compassData: CompassMapPayload, options: {
  floor: 'ground' | 'first'; view: CompassView | 'technical';
  format: 'svg' | 'png' | 'pdf' | 'dxf'; theme: string; angle: number;
  room_id?: string; style?: CompassExteriorStyle;
}, signal?: AbortSignal): Promise<Blob> {
  const response = await compassRequest('/api/floorplan/compass/render', { compass_map: compassData, ...options }, signal);
  return response.blob();
}
