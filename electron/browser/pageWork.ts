/**
 * Scripts the main process has asked the embedded page to run that have not answered yet
 * (10 Oct 2026, the YouTube freeze investigation).
 *
 * `webContents.executeJavaScript` cannot be cancelled. A script given up on (withPageTimeout)
 * keeps its place in the page's queue and still runs once the page is free, so a busy page
 * used to collect one more script every few seconds from each poll: 10 were waiting at once in
 * a measured soak, and all of them ran together when the page recovered, which made the
 * recovery slower still. Each kind of script now has a limit on how many may be waiting; past
 * it a request is refused at once instead of being queued in the page.
 *
 * How long the oldest script has waited is also how a stuck page is noticed: Chromium's own
 * `unresponsive` event only comes when an input event goes unanswered, and gaze requests are
 * scripts, not input events.
 *
 * A script that has not answered after LOST_AFTER_MS is no longer counted (its document may
 * have gone without an answer), `clear` forgets every script of a document that has been
 * replaced, and `dropStartedBefore` those overtaken by a later script the page did answer,
 * so a lost answer can never block requests for good or pass for a stuck page.
 */

/** Longer than a stuck page takes to be rebuilt (main.ts), so a stuck page's scripts are not forgotten first. */
export const PAGE_WORK_LOST_AFTER_MS = 30000;

type Entry = { kind: string; startedAt: number };

export class PageWorkTracker {
  private seq = 0;
  private readonly open = new Map<number, Entry>();

  constructor(private readonly lostAfterMs = PAGE_WORK_LOST_AFTER_MS) {}

  /** Starts a script of this kind unless `limit` of them are already waiting: a token, or null if refused. */
  begin(kind: string, now: number, limit = 1): number | null {
    if (this.count(now, kind) >= limit) return null;
    this.seq += 1;
    this.open.set(this.seq, { kind, startedAt: now });
    return this.seq;
  }

  /** The script answered (or failed). A token from before `clear` is ignored. */
  end(token: number | null | undefined): void {
    if (token != null) this.open.delete(token);
  }

  /** Scripts waiting of exactly this kind, or of every kind starting with `prefix` ending in ':' or ''. */
  count(now: number, kindOrPrefix = ''): number {
    this.sweep(now);
    let n = 0;
    for (const entry of this.open.values()) {
      if (kindOrPrefix === '' || entry.kind === kindOrPrefix ||
          (kindOrPrefix.endsWith(':') && entry.kind.startsWith(kindOrPrefix))) n += 1;
    }
    return n;
  }

  /** How long the oldest script still counted has waited, 0 when none is waiting. */
  oldestAgeMs(now: number): number {
    this.sweep(now);
    let oldest = 0;
    for (const entry of this.open.values()) oldest = Math.max(oldest, now - entry.startedAt);
    return oldest;
  }

  /** The kind of the oldest script still counted ('' when none), for the health log. */
  oldestKind(now: number): string {
    this.sweep(now);
    let kind = '';
    let startedAt = Infinity;
    for (const entry of this.open.values()) {
      if (entry.startedAt < startedAt) { startedAt = entry.startedAt; kind = entry.kind; }
    }
    return kind;
  }

  /** A new document: the scripts of the old one are forgotten. */
  clear(): void {
    this.open.clear();
  }

  /**
   * The page answered a script sent at `startedAt`: it is running scripts, so any sent before
   * that and still unanswered lost their answer (or are about to give it) and stop counting.
   * Returns how many were dropped.
   */
  dropStartedBefore(startedAt: number): number {
    let dropped = 0;
    for (const [token, entry] of this.open) {
      if (entry.startedAt < startedAt) {
        this.open.delete(token);
        dropped += 1;
      }
    }
    return dropped;
  }

  /** Stops counting scripts older than the lost limit; returns how many were dropped. */
  sweep(now: number): number {
    let dropped = 0;
    for (const [token, entry] of this.open) {
      if (now - entry.startedAt >= this.lostAfterMs) {
        this.open.delete(token);
        dropped += 1;
      }
    }
    return dropped;
  }
}
