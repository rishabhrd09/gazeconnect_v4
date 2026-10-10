export interface BrowserGazeOptions {
  cursor?: boolean;
  emittedAtWallMs?: number;
}

export interface BrowserGazeRequest {
  readonly generation: number;
  readonly emittedAtWallMs: number;
  readonly kind: 'sample' | 'reset';
  /** When the request was sent to the page (main-process clock). */
  readonly startedAt: number;
}

/**
 * How long the page may take to answer one gaze request before its slot is given back
 * (10 Oct 2026). Answers normally take 2-9 ms; a page busy starting a video can take a
 * few hundred. Before this, a request the page never answered held the slot for good and
 * gaze selection on the page stopped until the page was closed.
 */
export const BROWSER_GAZE_REQUEST_DEADLINE_MS = 1500;

/** One outstanding page request; invalidation never frees an unsettled slot, only `expire` does. */
export class BrowserGazeGate {
  private generation = 0;
  private pending: BrowserGazeRequest | null = null;
  private resetNeeded = false;
  private selectionEnabled = false;

  static isFresh(emittedAtWallMs: number, now: number): boolean {
    const age = now - emittedAtWallMs;
    return Number.isFinite(emittedAtWallMs) && emittedAtWallMs > 0 &&
      Number.isFinite(age) && age >= -150 && age <= 150;
  }

  enable(): void { this.selectionEnabled = true; }

  disable(): void {
    if (this.selectionEnabled) this.invalidate();
  }

  invalidate(resetPage = true): void {
    this.generation += 1;
    this.selectionEnabled = false;
    this.resetNeeded = resetPage;
  }

  begin(emittedAtWallMs: number, now: number): BrowserGazeRequest | null {
    if (this.pending || this.resetNeeded || !this.selectionEnabled ||
        !BrowserGazeGate.isFresh(emittedAtWallMs, now)) return null;
    const request: BrowserGazeRequest = {
      generation: this.generation, emittedAtWallMs, kind: 'sample', startedAt: now,
    };
    this.pending = request;
    return request;
  }

  beginReset(now = Date.now()): BrowserGazeRequest | null {
    if (this.pending || !this.resetNeeded) return null;
    const request: BrowserGazeRequest = {
      generation: this.generation, emittedAtWallMs: 0, kind: 'reset', startedAt: now,
    };
    this.pending = request;
    this.resetNeeded = false;
    return request;
  }

  /**
   * A request the page has not answered within `maxAgeMs` gives its slot back. Like
   * `invalidate`, the generation moves on (its late answer can select nothing) and the
   * page is reset before the next sample. The page still runs the given-up script when
   * it is free: the caller limits how many of those may wait (pageWork.ts).
   */
  expire(now: number, maxAgeMs = BROWSER_GAZE_REQUEST_DEADLINE_MS): boolean {
    if (!this.pending || now - this.pending.startedAt < maxAgeMs) return false;
    this.pending = null;
    this.invalidate();
    return true;
  }

  finish(request: BrowserGazeRequest): void {
    // A late completion cannot release a different request's slot.
    if (this.pending === request) this.pending = null;
  }

  allowsSelection(request: BrowserGazeRequest, now: number): boolean {
    // Also used immediately before delayed native mouseDown, after finish().
    return request.kind === 'sample' && this.selectionEnabled &&
      request.generation === this.generation &&
      BrowserGazeGate.isFresh(request.emittedAtWallMs, now);
  }
}
