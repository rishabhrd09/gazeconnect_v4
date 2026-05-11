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
}

const RING_SIZE = 250;
const events: DwellTelemetryEvent[] = [];
let sequence = 0;
let consoleLogCounter = 0;

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

/** Compute aggregate stats over the current event ring. */
export function getSnapshot(): TelemetrySnapshot | null {
  if (events.length === 0) return null;

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
  };
}

/** Return a copy of the event ring (for export / inspection). */
export function getEvents(): DwellTelemetryEvent[] {
  return events.slice();
}

/** Wipe the buffer — handy at start of a controlled test session. */
export function clearTelemetry(): void {
  events.length = 0;
  sequence = 0;
  consoleLogCounter = 0;
}

// Expose to renderer for live inspection. `window.__gazeTelemetry.snapshot()`
// in DevTools returns current aggregates. `.events()` returns raw events.
// `.clear()` resets the buffer.
if (typeof window !== 'undefined') {
  (window as unknown as { __gazeTelemetry: unknown }).__gazeTelemetry = {
    snapshot: getSnapshot,
    events: getEvents,
    clear: clearTelemetry,
  };
}
