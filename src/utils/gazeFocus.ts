/**
 * Which target the eyes are on, and where the gaze bubble is drawn.
 *
 * The maintainer's rule (22 Sep 2026): first decide which card or key is being
 * looked at, then show the cursor at its centre. The cursor moves centre to
 * centre; it never shows the raw gaze wandering over a target, and it is never
 * moved to the centre after it has appeared there (that visible recentring,
 * and the hops back to the gaze when the eyes moved on, were the jumps he saw).
 * His references: Tobii Experience's "Preview my gaze" bubble, and OptiKey
 * 3.2.5, which with his settings draws no cursor at all and anchors every piece
 * of feedback inside the key (a border, then a pie at the key's centre).
 *
 * GazeFocus decides the target, with hysteresis, from the backend's gaze
 * estimate (never the drawn bubble):
 *  - a new target takes the focus once the estimate has been on it, and off the
 *    current target, for FOCUS_CONFIRM_MS: its second sample at 33 Hz. `since`
 *    is the first of those samples, so the dwell's onset is not made any longer.
 *    Waiting longer bought nothing on the maintainer's recordings: the backend
 *    estimate already absorbs the one-sample flashes, and every A-B-A return
 *    that remained lasted 100 ms or more, a real glance or gaze resting on a
 *    border (22 Sep 2026 replay, 25 to 90 ms: same count, 45 ms more lag);
 *  - the focused target keeps the focus while the estimate stays within its box
 *    grown by EXIT_MARGIN_PX when another target competes for the point, or by
 *    the sticky margin when nothing else is there (the old sticky tolerance).
 *    Noise at a boundary therefore never flips the bubble between neighbours;
 *  - with nothing under the gaze, the focus is released after RELEASE_MS;
 *  - a locked dwell owns the focus (`hold`); only the renderer's lock break,
 *    judged on the raw sample, ends it, and then leave() removes the hysteresis
 *    so the focus follows the estimate strictly.
 *
 * BubbleMotion moves the drawn bubble towards its goal on the display clock: a
 * critically damped spring, so each move is one smooth glide that starts and
 * ends at rest with no overshoot, and a goal that changes mid-glide bends the
 * path instead of restarting it.
 *
 * FreeAnchor is where the bubble rests while no target has the focus: it holds
 * still through fixation noise and follows only a move that lasts.
 */

export interface Point { x: number; y: number; }
export interface RectLike { left: number; top: number; width: number; height: number; }

export const FOCUS_CONFIRM_MS = 25;
export const RELEASE_MS = 180;
export const EXIT_MARGIN_PX = 30;
export const STICKY_MARGIN_PX = 60;
export const STICKY_EDGE_MARGIN_PX = 110;
const EDGE_ZONE_PX = 80;

export function rectCentre(r: RectLike): Point {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function within(r: RectLike, p: Point, pad: number): boolean {
  return p.x >= r.left - pad && p.x <= r.left + r.width + pad
    && p.y >= r.top - pad && p.y <= r.top + r.height + pad;
}

/** Nothing else claims the point: the old sticky tolerance, wider at a screen edge where the tracker is noisiest. */
function stickyMargin(r: RectLike, viewport?: { width: number; height: number }): number {
  if (!viewport) return STICKY_MARGIN_PX;
  const nearEdge = r.left < EDGE_ZONE_PX || r.top < EDGE_ZONE_PX
    || r.left + r.width > viewport.width - EDGE_ZONE_PX || r.top + r.height > viewport.height - EDGE_ZONE_PX;
  return nearEdge ? STICKY_EDGE_MARGIN_PX : STICKY_MARGIN_PX;
}

export interface FocusUpdate<T> {
  /** Live box of a target; null when it is gone, disabled or covered. */
  rectOf: (target: T) => RectLike | null;
  /** A locked dwell owns the focus: keep it whatever the estimate does. */
  hold?: boolean;
  viewport?: { width: number; height: number };
}

export class GazeFocus<T> {
  /** The focused target, or null (the bubble rests freely). */
  current: T | null = null;
  /** First sample of the evidence that gave `current` the focus (clock of update()). */
  since = 0;
  /** When `current` got the focus. */
  acquiredAt = 0;
  private pending: T | null | undefined = undefined;
  private pendingSince = 0;
  private strict = false;

  /** The estimate has left the focused target; the change is being confirmed. */
  get leaving(): boolean {
    return this.current !== null && this.pending !== undefined && this.pending !== this.current;
  }

  /** No target has the focus yet, but the estimate is on one that is being confirmed. */
  get acquiring(): boolean {
    return this.current === null && this.pending !== undefined && this.pending !== null;
  }

  /** One gaze sample. `candidate` is the target under the estimate (or null). Returns true when the focus changed. */
  update(candidate: T | null, estimate: Point, now: number, opts: FocusUpdate<T>): boolean {
    let current = this.current;
    const rect = current !== null ? opts.rectOf(current) : null;
    if (current !== null && !rect) {
      // Gone from under the gaze (screen change, disabled, covered): no hysteresis for it.
      this.current = current = null;
      this.strict = false;
    }
    if (current !== null && rect) {
      if (opts.hold) { this.pending = undefined; return false; }
      if (candidate === current) { this.pending = undefined; this.strict = false; return false; }
      const pad = candidate === null ? stickyMargin(rect, opts.viewport) : EXIT_MARGIN_PX;
      if (!this.strict && within(rect, estimate, pad)) { this.pending = undefined; return false; }
    } else if (candidate === null) {
      this.pending = undefined;
      return false;
    }
    if (this.pending !== candidate) {
      this.pending = candidate;
      this.pendingSince = now;
    }
    if (now - this.pendingSince < (candidate === null ? RELEASE_MS : FOCUS_CONFIRM_MS)) return false;
    this.current = candidate;
    this.since = this.pendingSince;
    this.acquiredAt = now;
    this.pending = undefined;
    this.strict = false;
    return true;
  }

  /** A locked selection was left (raw gaze away): the focus now follows the estimate without hysteresis. */
  leave(): void {
    this.strict = true;
  }

  reset(): void {
    this.current = null;
    this.pending = undefined;
    this.strict = false;
  }
}

/** Rad/s of the bubble's spring: a move is 90 % done in about 78 ms and at rest by about 120 ms. */
export const BUBBLE_OMEGA = 50;
const SETTLE_PX = 0.35;
const SETTLE_SPEED = 8;          // px/s
const MAX_STEP_S = 0.1;          // A stalled frame is not turned into a jump.

export class BubbleMotion {
  x = 0;
  y = 0;
  placed = false;
  private vx = 0;
  private vy = 0;

  /** Put the bubble somewhere without a glide (first sight, return after a loss). */
  place(p: Point): void {
    this.x = p.x; this.y = p.y; this.vx = 0; this.vy = 0; this.placed = true;
  }

  get moving(): boolean { return this.vx !== 0 || this.vy !== 0; }

  /** Advance the spring dtMs towards goal; returns the position to draw. */
  step(goal: Point, dtMs: number, omega: number = BUBBLE_OMEGA): Point {
    if (!this.placed) { this.place(goal); return { x: this.x, y: this.y }; }
    const dt = Math.max(0, Math.min(MAX_STEP_S, dtMs / 1000));
    if (dt > 0) {
      // Exact critically damped response: x(t) = (c1 + c2 t) e^(-w t), c1 = x0, c2 = v0 + w x0.
      const e = Math.exp(-omega * dt);
      const dx = this.x - goal.x, dy = this.y - goal.y;
      const cx = this.vx + omega * dx, cy = this.vy + omega * dy;
      this.x = goal.x + (dx + cx * dt) * e;
      this.y = goal.y + (dy + cy * dt) * e;
      this.vx = (this.vx - omega * cx * dt) * e;
      this.vy = (this.vy - omega * cy * dt) * e;
    }
    if (Math.hypot(this.x - goal.x, this.y - goal.y) < SETTLE_PX && Math.hypot(this.vx, this.vy) < SETTLE_SPEED) {
      this.x = goal.x; this.y = goal.y; this.vx = 0; this.vy = 0;   // At rest exactly: no sub-pixel creep.
    }
    return { x: this.x, y: this.y };
  }
}

/** Fixation noise inside this never moves the free bubble... */
export const FREE_HOLD_PX = 24;
/** ...and a shift beyond it must last this long. */
export const FREE_MOVE_MS = 90;

export class FreeAnchor {
  point: Point | null = null;
  private awaySince: number | null = null;

  update(estimate: Point, now: number): Point {
    if (!this.point) {
      this.point = { x: estimate.x, y: estimate.y };
      return this.point;
    }
    if (Math.hypot(estimate.x - this.point.x, estimate.y - this.point.y) > FREE_HOLD_PX) {
      if (this.awaySince === null) this.awaySince = now;
      if (now - this.awaySince >= FREE_MOVE_MS) {
        this.point = { x: estimate.x, y: estimate.y };
        this.awaySince = null;
      }
    } else {
      this.awaySince = null;
    }
    return this.point;
  }

  reset(p?: Point): void {
    this.point = p ? { x: p.x, y: p.y } : null;
    this.awaySince = null;
  }
}
