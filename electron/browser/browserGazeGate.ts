export interface BrowserGazeOptions {
  cursor?: boolean;
  emittedAtWallMs?: number;
}

export interface BrowserGazeRequest {
  readonly generation: number;
  readonly emittedAtWallMs: number;
  readonly kind: 'sample' | 'reset';
}

/** One outstanding page request; invalidation never frees an unsettled slot. */
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
      generation: this.generation, emittedAtWallMs, kind: 'sample',
    };
    this.pending = request;
    return request;
  }

  beginReset(): BrowserGazeRequest | null {
    if (this.pending || !this.resetNeeded) return null;
    const request: BrowserGazeRequest = {
      generation: this.generation, emittedAtWallMs: 0, kind: 'reset',
    };
    this.pending = request;
    this.resetNeeded = false;
    return request;
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
