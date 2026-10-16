/**
 * The app's health log (10 Oct 2026, after the maintainer's 8 GB laptop froze completely while
 * Papa watched YouTube and came back by itself only after a long wait).
 *
 * Every SAMPLE_MS one line of JSON: memory and CPU of each process (main, interface, page, GPU,
 * the rest; the floor-plan service by its own report while it runs), the computer's available
 * and committed memory, the main process's worst event-loop
 * delay, the interface's heartbeat and frame delay, and the page's oldest unanswered script.
 * Events (a stuck page, a page rebuilt, a process gone, a stall, the computer sleeping and
 * waking) are written as they happen. After a freeze the lines before it say which part stopped
 * first; a gap between lines is the main process itself standing still, or the computer asleep
 * (a `resume` line follows it).
 *
 * Stalls are only what the app did not mean (16 Oct 2026, the maintainer's log of 10-16 Oct):
 * all three `main-stall` events were Windows Modern Standby to the second, and most of 124
 * `ui-stall` events were ~60 s gaps with no frame delay: Chromium running a hidden interface's
 * timers once a minute (a covered window or a dark screen, which `isVisible()` cannot see). So
 * `ui-stall` needs the interface visible at both beats, and a wake starts every measure again;
 * see `uiBeat` and `resumed`.
 *
 * The log is about the app, never about the person: pages are recorded by kind (a YouTube video,
 * another YouTube page, another site), never by address or title. Files are capped
 * (MAX_FILE_BYTES each, KEEP_FILES kept); see `write` for why lines are written synchronously.
 */
import { app, powerMonitor } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export const HEALTH_SAMPLE_MS = 5000;
const LAG_PROBE_MS = 100;
/** A 5 s sample that comes this late means the main process stood still. */
const MAIN_STALL_GAP_MS = 12000;
/** The interface beats every 2 s; this long without one means it stood still. */
const UI_STALL_GAP_MS = 6000;
/**
 * On waking, the late timers and Windows' `resume` arrive in either order: a stall seen first
 * waits this long for a `resume` before it is written as it is.
 */
const RESUME_GRACE_MS = 5000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const KEEP_FILES = 6;
const EVENT_REPEAT_MS = 2000;

export type PageHealth = {
  open: boolean;
  kind?: string;
  loading?: boolean;
  quiet?: boolean;
  waiting?: number;
  oldestMs?: number;
  oldestKind?: string;
  pid?: number;
  hidden?: boolean;
};

/**
 * `uiVisible`: the window is on screen (hidden to the tray, its timers are slowed: no stall). It
 * cannot tell a covered window or a dark screen; the heartbeat's own visibility does (`uiBeat`).
 */
type Roles = { uiPid: number; pagePid: number; uiVisible: boolean };
type PendingStall = { name: string; at: number; data: Record<string, unknown> };

const mb = (kb: number | undefined) => Math.round((kb || 0) / 1024);

export class HealthRecorder {
  private dir = '';
  private file = '';
  private timer: NodeJS.Timeout | null = null;
  private lagTimer: NodeJS.Timeout | null = null;
  private lastProbeAt = 0;
  private maxLagMs = 0;
  private lastSampleAt = 0;
  private startedAt = 0;
  private uiBeatAt = 0;
  private uiBeatVisible = false;
  private uiLagMs = 0;
  private suspendAt = 0;
  private resumeAt = 0;
  private pending: PendingStall[] = [];
  private graceTimer: NodeJS.Timeout | null = null;
  private unwatchPower: (() => void) | null = null;
  private fd: number | null = null;
  private size = 0;
  private readonly lastEventAt = new Map<string, number>();
  private readonly suppressed = new Map<string, number>();

  constructor(
    private readonly roles: () => Roles,
    private readonly page: () => PageHealth,
    /** The floor-plan service's own report (floorplanService.ts), only while it runs. */
    private readonly floorplan: () => Record<string, unknown> | null = () => null,
  ) {}

  start(): void {
    if (this.timer) return;
    try {
      this.dir = path.join(app.getPath('userData'), 'logs', 'health');
      fs.mkdirSync(this.dir, { recursive: true });
      this.file = path.join(this.dir, 'health.jsonl');
    } catch {
      return;   // No log rather than no app.
    }
    this.startedAt = Date.now();
    this.lastSampleAt = this.startedAt;
    this.lastProbeAt = this.startedAt;
    this.lagTimer = setInterval(() => {
      const now = Date.now();
      const lag = now - this.lastProbeAt - LAG_PROBE_MS;
      if (lag > this.maxLagMs) this.maxLagMs = lag;
      this.lastProbeAt = now;
    }, LAG_PROBE_MS);
    this.timer = setInterval(() => this.sample(), HEALTH_SAMPLE_MS);
    this.event('start', { version: app.getVersion(), electron: process.versions.electron });
    this.unwatchPower = this.watchPower();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.lagTimer) clearInterval(this.lagTimer);
    this.timer = null;
    this.lagTimer = null;
    this.unwatchPower?.();
    this.unwatchPower = null;
    this.settle(false);   // a stall still waiting for a `resume` is written as it is
    this.close();
  }

  /**
   * The interface's heartbeat, with its worst frame delay since the last one and whether it
   * stayed visible since then (preload.ts). A hidden interface has its timers slowed to once a
   * minute, so a gap counts as `ui-stall` only between two visible beats while main also thinks
   * the window is on screen.
   */
  uiBeat(frameLagMs: unknown, visible: unknown = false): void {
    const now = Date.now();
    const shown = visible === true;
    const since = this.uiBeatAt;
    if (since > 0 && now - since > UI_STALL_GAP_MS && this.uiBeatVisible && shown && this.roles().uiVisible) {
      this.stall('ui-stall', since, now);
    }
    this.uiBeatAt = now;
    this.uiBeatVisible = shown;
    const lag = Number(frameLagMs);
    if (Number.isFinite(lag) && lag >= 0) this.uiLagMs = Math.max(this.uiLagMs, Math.min(600000, Math.round(lag)));
  }

  /** Something happened. The same event more often than every 2 s is counted, not written each time. */
  event(name: string, data: Record<string, unknown> = {}): void {
    this.record(name, data, Date.now());
  }

  /** `event`, stamped with when it happened (a stall written after waiting for a `resume`). */
  private record(name: string, data: Record<string, unknown>, at: number): void {
    if (!this.file) return;
    const now = Date.now();
    const last = this.lastEventAt.get(name) || 0;
    if (now - last < EVENT_REPEAT_MS) {
      this.suppressed.set(name, (this.suppressed.get(name) || 0) + 1);
      return;
    }
    this.lastEventAt.set(name, now);
    const repeats = this.suppressed.get(name) || 0;
    this.suppressed.delete(name);
    this.write({ at: new Date(at).toISOString(), ev: name, ...(repeats ? { repeats } : {}), ...data });
  }

  /**
   * Nothing from `since` to `now`. Measured from a wake (`resumed` set `since`), it is written at
   * once with `afterResume: true`; otherwise it waits up to RESUME_GRACE_MS for a `resume` still
   * on its way, which marks it the same: kept and marked rather than dropped, as Modern Standby
   * may send no `suspend` and a real freeze can end in a sleep.
   */
  private stall(name: string, since: number, now: number): void {
    const data = { gapMs: now - since };
    if (this.resumeAt > 0 && this.resumeAt >= since) {
      this.record(name, { ...data, afterResume: true }, now);
      return;
    }
    this.pending.push({ name, at: now, data });
    if (!this.graceTimer) this.graceTimer = setTimeout(() => this.settle(false), RESUME_GRACE_MS);
  }

  /** Writes the stalls waiting for a `resume`, marked if one came. */
  private settle(afterResume: boolean): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    for (const stall of this.pending.splice(0)) {
      this.record(stall.name, afterResume ? { ...stall.data, afterResume: true } : stall.data, stall.at);
    }
  }

  /**
   * The computer sleeping and waking, and the screen locked and unlocked, as events. Windows
   * stops the whole app in standby, so without this the time asleep reads as a stall.
   */
  private watchPower(): () => void {
    const onSuspend = () => {
      this.suspendAt = Date.now();
      this.event('suspend');
    };
    const onResume = () => this.resumed();
    const onLock = () => this.event('lock-screen');
    const onUnlock = () => this.event('unlock-screen');
    try {
      powerMonitor.on('suspend', onSuspend);
      powerMonitor.on('resume', onResume);
      powerMonitor.on('lock-screen', onLock);
      powerMonitor.on('unlock-screen', onUnlock);
    } catch {
      return () => undefined;   // no power events rather than no log
    }
    return () => {
      powerMonitor.removeListener('suspend', onSuspend);
      powerMonitor.removeListener('resume', onResume);
      powerMonitor.removeListener('lock-screen', onLock);
      powerMonitor.removeListener('unlock-screen', onUnlock);
    };
  }

  /**
   * The computer woke. Every measure starts again from now (the samples, the delay probe, the
   * heartbeat), so the time asleep is not a stall; the `resume` line says how long it was quiet.
   * A stall already seen and waiting is this wake's: it is written with `afterResume: true`.
   */
  private resumed(): void {
    const now = Date.now();
    this.settle(true);
    this.event('resume', {
      sinceSampleMs: now - this.lastSampleAt,
      ...(this.suspendAt ? { sleptMs: now - this.suspendAt } : {}),
    });
    this.suspendAt = 0;
    this.resumeAt = now;
    this.lastSampleAt = now;
    this.lastProbeAt = now;
    this.maxLagMs = 0;
    if (this.uiBeatAt > 0) this.uiBeatAt = now;
    this.uiLagMs = 0;
  }

  private sample(): void {
    try {
      const now = Date.now();
      const since = this.lastSampleAt;
      this.lastSampleAt = now;
      if (now - since > MAIN_STALL_GAP_MS) this.stall('main-stall', since, now);
      const { uiPid, pagePid } = this.roles();
      const procs: Record<string, { mb: number; cpu: number; n?: number }> = {};
      for (const metric of app.getAppMetrics()) {
        const role = metric.pid === uiPid ? 'ui' : metric.pid === pagePid ? 'page'
          : metric.type === 'Browser' ? 'main' : metric.type === 'GPU' ? 'gpu' : 'other';
        const entry = procs[role] || (procs[role] = { mb: 0, cpu: 0 });
        entry.mb += mb(metric.memory.privateBytes ?? metric.memory.workingSetSize);
        entry.cpu = Math.round((entry.cpu + (metric.cpu?.percentCPUUsage || 0)) * 10) / 10;
        if (role === 'other') entry.n = (entry.n || 0) + 1;
      }
      const system = process.getSystemMemoryInfo() as { total: number; free: number; swapTotal?: number; swapFree?: number };
      const appMb = Object.values(procs).reduce((sum, p) => sum + p.mb, 0);
      this.write({
        at: new Date(now).toISOString(),
        up: Math.round((now - this.startedAt) / 1000),
        mainLagMs: this.maxLagMs,
        uiBeatAgeMs: this.uiBeatAt ? now - this.uiBeatAt : null,
        uiLagMs: this.uiLagMs,
        appMb,
        procs,
        sys: {
          totalMb: mb(system.total),
          availMb: mb(system.free),
          // Windows: the commit charge (memory promised to processes, in RAM or the page file).
          commitMb: system.swapTotal && system.swapFree !== undefined ? mb(system.swapTotal - system.swapFree) : null,
          commitLimitMb: system.swapTotal ? mb(system.swapTotal) : null,
        },
        page: this.page(),
        ...((floorplan) => (floorplan ? { floorplan } : {}))(this.floorplan()),
      });
      this.maxLagMs = 0;
      this.uiLagMs = 0;
    } catch {
      /* the log never takes the app down */
    }
  }

  /**
   * One line appended to the open file. Synchronous on purpose: Node's asynchronous file calls
   * start its thread pool, which committed 32 MB in the main process (measured 10 Oct 2026, 49 ->
   * 82 MB private), memory this log is there to watch. A line of under 1 KB every 5 s goes to the
   * Windows file cache and returns at once; the file stays open, so nothing is opened per line.
   */
  private write(entry: Record<string, unknown>): void {
    if (!this.file) return;
    try {
      const line = JSON.stringify(entry) + '\n';
      if (this.fd === null || this.size + line.length > MAX_FILE_BYTES) this.reopen();
      if (this.fd === null) return;
      fs.writeSync(this.fd, line);
      this.size += Buffer.byteLength(line);
    } catch {
      /* disk full or the folder gone: the next line tries again with a fresh file */
      this.close();
    }
  }

  /** Opens the log for appending; one past MAX_FILE_BYTES is put aside first, KEEP_FILES kept. */
  private reopen(): void {
    this.close();
    let size = 0;
    try { size = fs.statSync(this.file).size; } catch { size = 0; }
    if (size >= MAX_FILE_BYTES) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(this.file, path.join(this.dir, `health-${stamp}.jsonl`));
      const old = fs.readdirSync(this.dir).filter((name) => /^health-.*\.jsonl$/.test(name)).sort();
      for (const name of old.slice(0, Math.max(0, old.length - KEEP_FILES))) {
        try { fs.unlinkSync(path.join(this.dir, name)); } catch { /* in use: next time */ }
      }
      size = 0;
    }
    this.fd = fs.openSync(this.file, 'a');
    this.size = size;
  }

  private close(): void {
    if (this.fd === null) return;
    try { fs.closeSync(this.fd); } catch { /* already closed */ }
    this.fd = null;
  }
}
