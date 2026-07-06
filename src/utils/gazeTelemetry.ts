/**
 * gazeTelemetry.ts — session telemetry for eye-gaze accuracy debugging
 *
 * Records per-dwell-completion events: the residual (gaze sample at click
 * vs. the target's geometric center), time-to-acquire, and which screen /
 * context the click happened in. From these we derive:
 *   - median residual magnitude (px)            — accuracy
 *   - MAD of residual magnitude (px)            — accuracy stability
 *   - mean drift vector (dx, dy)                — systematic offset
 *   - mean / median acquisition time (ms)       — perceived snappiness
 *
 * Pure measurement layer. No behaviour change. Exposed to the renderer
 * window as `window.__gazeTelemetry` so we can `await
 * window.__gazeTelemetry.snapshot()` in DevTools during a session and
 * see how the patient's accuracy is trending.
 *
 * Reference: audit report R1 (session telemetry before further tuning).
 */

export interface DwellTelemetryEvent {
  /** Sequence number (monotonically increasing) */
  seq: number;
  /** Wall-clock timestamp (ms) */
  ts: number;
  /** Element id when available, else first chars of textContent */
  targetId: string;
  /** data-gaze-context attribute value */
  context: string;
  /** Current screen identifier */
  screen: string;
  /** Target bounding rect at click time */
  rect: { left: number; top: number; width: number; height: number };
  /** Target geometric center */
  center: { x: number; y: number };
  /** Raw gaze sample (post-snap, pre-EMA) at click moment */
  gaze: { x: number; y: number };
  /** Residual: gaze - center, and its magnitude */
  residual: { dx: number; dy: number; mag: number };
  /** Time from onset start to click fire (ms) */
  onsetToClickMs: number;
  /** Time from dwell start to click fire (ms) */
  dwellToClickMs: number;
}

export interface TelemetrySnapshot {
  count: number;
  medianResidualPx: number;
  madPx: number;
  meanResidualPx: number;
  maxResidualPx: number;
  driftVector: { dx: number; dy: number; mag: number };
  meanAcquisitionMs: number;
  medianAcquisitionMs: number;
  perContextCount: Record<string, number>;
  perContextMedianResidual: Record<string, number>;
  /** Dwell interruption aggregates (corner-flicker evidence). */
  interrupts: {
    total: number;
    byKind: Record<string, number>;
    nearEdgeCount: number;
    /** interruptions per completed click — the corner-flicker headline number */
    perClick: number;
  };
  /** Freeze/stall aggregates (>200ms acceptance criterion). */
  freezes: {
    count: number;
    over200Count: number;
    maxMs: number;
    byKind: Record<string, number>;
  };
  /** Transport latency percentiles (helper -> renderer; see GazeLatencySample). */
  latency: {
    count: number;
    ingest: { p50: number; p95: number; max: number };
    pipeline: { p50: number; p95: number; max: number };
    ws: { p50: number; p95: number; max: number };
    e2e: { p50: number; p95: number; max: number };
    paint: { p50: number; p95: number; max: number; sampled: number };
  };
}

/**
 * A dwell interruption: progress that was lost or suspended before the
 * click fired. Recorded so corner-flicker fixes can be judged by data
 * (resets per selection) instead of feel.
 */
export interface DwellInterruptEvent {
  seq: number;
  ts: number;
  /** 'lock_break' | 'target_lost' | 'expired' | 'resumed' */
  kind: string;
  targetId: string;
  screen: string;
  /** Dwell progress (0-1) at the moment of interruption */
  progress: number;
  /** Target rect within 80px of a viewport edge (corner/edge buttons) */
  nearEdge: boolean;
}

/** A detected stall: gaze frames stopped or the rAF loop stalled. */
export interface FreezeEvent {
  seq: number;
  ts: number;
  /** 'gaze_gap' (no WS gaze frames) | 'raf_stall' (render loop blocked) */
  kind: string;
  durationMs: number;
}

/**
 * One gaze frame's transport latency breakdown (all Unix-ms deltas on the
 * same machine clock — helper stamps UtcNow, Python stamps time.time(),
 * renderer stamps Date.now()).
 *   ingestMs   — helper receive -> Python ingest (backend sample_age_ms)
 *   pipelineMs — Python ingest -> broadcast enqueue
 *   wsMs       — broadcast enqueue -> renderer WS receive
 *   e2eMs      — helper receive -> renderer WS receive
 *   paintMs    — WS receive -> first rAF after the cursor transform write
 *                (sampled ~every 8th frame; -1 = not sampled)
 * UtcNow granularity can be ~15.6ms — interpret percentiles over >=500
 * frames, never single samples.
 */
export interface GazeLatencySample {
  ingestMs: number;
  pipelineMs: number;
  wsMs: number;
  e2eMs: number;
  paintMs: number;
}

const RING_SIZE = 250;
const INTERRUPT_RING_SIZE = 400;
const FREEZE_RING_SIZE = 200;
const LATENCY_RING_SIZE = 500;
const events: DwellTelemetryEvent[] = [];
const interruptEvents: DwellInterruptEvent[] = [];
const freezeEvents: FreezeEvent[] = [];
const latencySamples: GazeLatencySample[] = [];
let sequence = 0;
let interruptSequence = 0;
let freezeSequence = 0;
let consoleLogCounter = 0;

/**
 * Record a dwell interruption (lock-break, target loss, TTL expiry, resume).
 * Pure measurement — called from GazeCursor's reset/save/resume paths.
 */
export function recordDwellInterrupt(
  partial: Omit<DwellInterruptEvent, 'seq' | 'ts'>,
): void {
  const ev: DwellInterruptEvent = { seq: ++interruptSequence, ts: Date.now(), ...partial };
  if (interruptEvents.length >= INTERRUPT_RING_SIZE) interruptEvents.shift();
  interruptEvents.push(ev);
}

/** Record a freeze/stall episode (>threshold gap in gaze frames or rAF). */
export function recordFreeze(kind: string, durationMs: number): void {
  const ev: FreezeEvent = { seq: ++freezeSequence, ts: Date.now(), kind, durationMs };
  if (freezeEvents.length >= FREEZE_RING_SIZE) freezeEvents.shift();
  freezeEvents.push(ev);
}

/**
 * Record one gaze frame's latency breakdown. The caller keeps the returned
 * reference and may fill paintMs asynchronously (one rAF later) — the ring
 * stores the live object, so the late write is visible in snapshots.
 */
export function recordGazeLatency(sample: GazeLatencySample): GazeLatencySample {
  if (latencySamples.length >= LATENCY_RING_SIZE) latencySamples.shift();
  latencySamples.push(sample);
  return sample;
}

/** Record a dwell-completion event. Called from the dwell-click firing path. */
export function recordDwellEvent(
  partial: Omit<DwellTelemetryEvent, 'seq' | 'ts' | 'residual'>,
): void {
  const cx = partial.center.x;
  const cy = partial.center.y;
  const dx = partial.gaze.x - cx;
  const dy = partial.gaze.y - cy;
  const mag = Math.sqrt(dx * dx + dy * dy);

  const ev: DwellTelemetryEvent = {
    seq: ++sequence,
    ts: Date.now(),
    ...partial,
    residual: { dx, dy, mag },
  };

  if (events.length >= RING_SIZE) events.shift();
  events.push(ev);

  // Periodic console log so the user/operator can verify telemetry is
  // flowing during a session. Every 20 clicks emit a snapshot — that's
  // roughly once every 30–60 s of active typing.
  consoleLogCounter++;
  if (consoleLogCounter >= 20) {
    consoleLogCounter = 0;
    const snap = getSnapshot();
    if (snap) {
      console.log(
        `[GazeTelemetry] n=${snap.count} medianResidual=${snap.medianResidualPx.toFixed(1)}px ` +
        `MAD=${snap.madPx.toFixed(1)}px drift=(${snap.driftVector.dx.toFixed(1)},${snap.driftVector.dy.toFixed(1)})px ` +
        `medianAcq=${snap.medianAcquisitionMs.toFixed(0)}ms`,
      );
    }
  }
}

function latencyPercentiles(values: number[]): { p50: number; p95: number; max: number } {
  if (values.length === 0) return { p50: 0, p95: 0, max: 0 };
  const s = values.slice().sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    p50: Math.round(at(0.5) * 10) / 10,
    p95: Math.round(at(0.95) * 10) / 10,
    max: Math.round(s[s.length - 1] * 10) / 10,
  };
}

/** Aggregate the latency ring (percentiles only — single samples are noise). */
function getLatencyAggregate(): TelemetrySnapshot['latency'] {
  const ingest: number[] = [];
  const pipeline: number[] = [];
  const ws: number[] = [];
  const e2e: number[] = [];
  const paint: number[] = [];
  for (const s of latencySamples) {
    if (s.ingestMs >= 0) ingest.push(s.ingestMs);
    if (s.pipelineMs >= 0) pipeline.push(s.pipelineMs);
    if (s.wsMs >= 0) ws.push(s.wsMs);
    if (s.e2eMs >= 0) e2e.push(s.e2eMs);
    if (s.paintMs >= 0) paint.push(s.paintMs);
  }
  return {
    count: latencySamples.length,
    ingest: latencyPercentiles(ingest),
    pipeline: latencyPercentiles(pipeline),
    ws: latencyPercentiles(ws),
    e2e: latencyPercentiles(e2e),
    paint: { ...latencyPercentiles(paint), sampled: paint.length },
  };
}

/** Aggregate the interruption + freeze rings (always computable). */
function getAuxAggregates(): Pick<TelemetrySnapshot, 'interrupts' | 'freezes'> {
  const byKind: Record<string, number> = {};
  let nearEdgeCount = 0;
  for (const e of interruptEvents) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    if (e.nearEdge && e.kind !== 'resumed') nearEdgeCount++;
  }
  // 'resumed' is recovery, not loss — exclude from the per-click loss rate
  const lossCount = interruptEvents.filter((e) => e.kind !== 'resumed').length;

  const fByKind: Record<string, number> = {};
  let over200 = 0;
  let maxMs = 0;
  for (const f of freezeEvents) {
    fByKind[f.kind] = (fByKind[f.kind] || 0) + 1;
    if (f.durationMs > 200) over200++;
    if (f.durationMs > maxMs) maxMs = f.durationMs;
  }

  return {
    interrupts: {
      total: lossCount,
      byKind,
      nearEdgeCount,
      perClick: events.length > 0 ? lossCount / events.length : lossCount,
    },
    freezes: {
      count: freezeEvents.length,
      over200Count: over200,
      maxMs,
      byKind: fByKind,
    },
  };
}

/** Compute aggregate stats over the current event ring. */
export function getSnapshot(): TelemetrySnapshot | null {
  if (events.length === 0) {
    // No clicks yet — still surface interruption/freeze/latency data if any.
    if (interruptEvents.length === 0 && freezeEvents.length === 0 && latencySamples.length === 0) return null;
    return {
      count: 0,
      medianResidualPx: 0,
      madPx: 0,
      meanResidualPx: 0,
      maxResidualPx: 0,
      driftVector: { dx: 0, dy: 0, mag: 0 },
      meanAcquisitionMs: 0,
      medianAcquisitionMs: 0,
      perContextCount: {},
      perContextMedianResidual: {},
      ...getAuxAggregates(),
      latency: getLatencyAggregate(),
    };
  }

  const mags = events.map((e) => e.residual.mag).sort((a, b) => a - b);
  const acqs = events.map((e) => e.onsetToClickMs).sort((a, b) => a - b);
  const median = mags[Math.floor(mags.length / 2)];
  const mean = mags.reduce((s, v) => s + v, 0) / mags.length;
  const max = mags[mags.length - 1];

  const deviations = mags.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];

  const meanDx = events.reduce((s, e) => s + e.residual.dx, 0) / events.length;
  const meanDy = events.reduce((s, e) => s + e.residual.dy, 0) / events.length;

  const meanAcq = events.reduce((s, e) => s + e.onsetToClickMs, 0) / events.length;
  const medianAcq = acqs[Math.floor(acqs.length / 2)];

  const perContextCount: Record<string, number> = {};
  const perContextResiduals: Record<string, number[]> = {};
  for (const e of events) {
    const c = e.context || 'unknown';
    perContextCount[c] = (perContextCount[c] || 0) + 1;
    (perContextResiduals[c] = perContextResiduals[c] || []).push(e.residual.mag);
  }
  const perContextMedianResidual: Record<string, number> = {};
  for (const [c, arr] of Object.entries(perContextResiduals)) {
    const sorted = arr.slice().sort((a, b) => a - b);
    perContextMedianResidual[c] = sorted[Math.floor(sorted.length / 2)];
  }

  return {
    count: events.length,
    medianResidualPx: median,
    madPx: mad,
    meanResidualPx: mean,
    maxResidualPx: max,
    driftVector: {
      dx: meanDx,
      dy: meanDy,
      mag: Math.sqrt(meanDx * meanDx + meanDy * meanDy),
    },
    meanAcquisitionMs: meanAcq,
    medianAcquisitionMs: medianAcq,
    perContextCount,
    perContextMedianResidual,
    ...getAuxAggregates(),
    latency: getLatencyAggregate(),
  };
}

/** Return a copy of the latency ring (raw per-frame samples). */
export function getLatencySamples(): GazeLatencySample[] {
  return latencySamples.slice();
}

/** Return a copy of the interruption ring. */
export function getInterruptEvents(): DwellInterruptEvent[] {
  return interruptEvents.slice();
}

/** Return a copy of the freeze ring. */
export function getFreezeEvents(): FreezeEvent[] {
  return freezeEvents.slice();
}

/** Return a copy of the event ring (for export / inspection). */
export function getEvents(): DwellTelemetryEvent[] {
  return events.slice();
}

/** Wipe the buffers — handy at start of a controlled test session. */
export function clearTelemetry(): void {
  events.length = 0;
  interruptEvents.length = 0;
  freezeEvents.length = 0;
  latencySamples.length = 0;
  sequence = 0;
  interruptSequence = 0;
  freezeSequence = 0;
  consoleLogCounter = 0;
}

// Expose to renderer for live inspection. `window.__gazeTelemetry.snapshot()`
// in DevTools returns current aggregates. `.events()` returns raw click events,
// `.interruptions()` the dwell-interruption ring, `.freezes()` the stall ring.
// `.clear()` resets all buffers.
if (typeof window !== 'undefined') {
  (window as unknown as { __gazeTelemetry: unknown }).__gazeTelemetry = {
    snapshot: getSnapshot,
    events: getEvents,
    interruptions: getInterruptEvents,
    freezes: getFreezeEvents,
    latency: getLatencySamples,
    clear: clearTelemetry,
  };
}
