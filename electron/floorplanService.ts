/**
 * The floor-plan service: a separate Python process that draws Compass plans, started the first time a
 * plan is opened and never on the gaze path (docs/compass-refine/IMPLEMENTATION_PLAN.md §8.2).
 *
 * - Lifetime: it is given `--parent-pid`, so it ends when Electron does, even after a crash or a hard
 *   kill, and `--idle-seconds`, so it leaves after ten quiet minutes. That idle exit has its own code
 *   (75) and is not restarted; the next plan starts it again.
 * - Readiness: `ensureReady` waits for `/api/health` to answer from our own child (150 ms steps, up to
 *   25 s) instead of a fixed pause, so a cold first request no longer fails. A first start on a slow
 *   Windows laptop (antivirus scanning the bundle, cairo, shapely and numpy loading) can take several
 *   seconds; a process that has ended stops the wait at once.
 * - Watchdog: a drawing request over `JOB_LIMIT_MS`, or a health check unanswered for 5 s while one
 *   runs, ends the process; the next request starts a fresh one. Gaze is never affected: this process
 *   shares nothing with the gaze backend or the interface.
 * - Saving: `save` asks the service for one finished file and writes it to
 *   Documents\GazeConnect Plans\<date>\ under a name the app chose, with no native Save dialog, which a
 *   gaze user could not operate. The interface never supplies bytes or a path. If Windows refuses
 *   Documents (Controlled Folder Access protects it from unrecognised apps), Downloads is used; a file
 *   of the same name that is open in a viewer (locked) is kept, and the new one gets " (2)".
 */
import { app, type IpcMainInvokeEvent } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { requestFloorplan, isFloorplanJobRoute, type FloorplanRequest, type FloorplanReply } from './floorplanTransport';

export const FLOORPLAN_IDLE_EXIT_CODE = 75;
const IDLE_SECONDS = 600;
const READY_STEP_MS = 150;
const READY_LIMIT_MS = 25000;
const JOB_LIMIT_MS = 35000;
const HEALTH_EVERY_MS = 5000;
const HEALTH_LIMIT_MS = 5000;
/**
 * Memory left for everything else while the Outside view draws (REFINE_FIX_HANDOFF C1). Calibrated on the 8 GB
 * Windows laptop on 16 Oct 2026: during a GazeConnect session Windows' available memory was under the old fixed
 * 600 MB floor in 97 % of samples (median 335 MB), while the view itself added 10-30 MB to the service. With this
 * reserve the view was allowed in 83 % of those samples; below it, memory is genuinely short and paging is near.
 */
export const OUTSIDE_RESERVE_MB = 150;
/** Commit (memory and page file together) that stays free after the drawing, so no allocation anywhere fails. */
export const COMMIT_RESERVE_MB = 256;
/** The studio's largest Outside preview, and the size light machines draw it at (without supersampling). */
const FULL_OUTSIDE = { width: 2400, height: 1600 };
const LIGHT_OUTSIDE = { width: 1600, height: 1000 };
/** Total memory of a light machine (4 GB), which always draws at the light size. */
const LIGHT_TOTAL_MB = 4608;
const SAVE_EXTENSIONS: Record<string, RegExp> = {
  png: /^image\/png/, pdf: /^application\/pdf/, dxf: /^application\/dxf/, txt: /^text\/plain/,
};

export interface FloorplanHealth {
  pid?: number;
  ppid?: number;
  memory?: Record<string, number>;
  jobs?: { running?: unknown; pending?: unknown[]; completed?: number; superseded?: number; cache?: { bytes: number; items: number } };
  idleS?: number | null;
  /** Seconds the background warm-up took (tools/floorplan_server.py warm_studio); null until it has finished. */
  warmS?: number | null;
}

/** What the studio is told about memory for the heavier views (src/utils/floorplanApi.ts FloorplanResources). */
export interface FloorplanResources {
  totalMb: number;
  availableMb: number;
  /** Commit still free (memory and page file), when the system reports it. */
  commitFreeMb: number | null;
  /** The Outside view at `width` x `height`: what it may take, and the free memory it needs (cost and reserve). */
  costMb: number;
  needMb: number;
  width: number;
  height: number;
  /** Draw at the light size, without supersampled downloads (4 GB machines, or short of memory for the full size). */
  light: boolean;
  exterior: boolean;
}

/** What drawing the Outside view at this size may take: 4 bytes a pixel, three working images, 30 MB of model and scene. */
export function outsideCostMb(width: number, height: number): number {
  return Math.ceil((4 * width * height * 3) / (1024 * 1024) + 30);
}

const sizeWithin = (value: unknown, low: number, high: number, fallback: number) =>
  (typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : fallback);

/**
 * Whether the Outside view may be drawn now, from Electron's memory figures (kB, as `getSystemMemoryInfo` gives them;
 * on Windows `free` is the available memory Task Manager shows, `swapFree` the commit still free). It is decided for
 * the size the studio asks for, falling back to the light size before refusing (C1).
 */
export function decideResources(info: { total: number; free: number; swapTotal?: number; swapFree?: number },
  size?: { width?: unknown; height?: unknown }): FloorplanResources {
  const totalMb = Math.round(info.total / 1024);
  const availableMb = Math.round(info.free / 1024);
  const commitFreeMb = info.swapTotal && typeof info.swapFree === 'number' ? Math.round(info.swapFree / 1024) : null;
  const wanted = { width: sizeWithin(size?.width, 640, FULL_OUTSIDE.width, FULL_OUTSIDE.width),
    height: sizeWithin(size?.height, 400, FULL_OUTSIDE.height, FULL_OUTSIDE.height) };
  const fits = (s: { width: number; height: number }) => {
    const cost = outsideCostMb(s.width, s.height);
    return availableMb >= cost + OUTSIDE_RESERVE_MB && (commitFreeMb === null || commitFreeMb >= cost + COMMIT_RESERVE_MB);
  };
  const light = totalMb <= LIGHT_TOTAL_MB || !fits(wanted);
  const drawn = light ? { width: Math.min(wanted.width, LIGHT_OUTSIDE.width), height: Math.min(wanted.height, LIGHT_OUTSIDE.height) } : wanted;
  const costMb = outsideCostMb(drawn.width, drawn.height);
  return { totalMb, availableMb, commitFreeMb, costMb, needMb: costMb + OUTSIDE_RESERVE_MB, ...drawn, light, exterior: fits(drawn) };
}

export interface SaveRequest { endpoint: string; body: string; fileName: string; }
export interface SaveResult { ok: boolean; folder?: string; file?: string; place?: 'Documents' | 'Downloads'; bytes?: number; error?: string; }

/** Windows device names, which are not files in any folder. */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/** Writes `bytes` as `name` in `folder` via a temporary .part file; a locked file of that name gets " (2)" etc. */
function writeFileSafely(folder: string, name: string, bytes: Buffer): string {
  const dot = name.lastIndexOf('.');
  const stem = name.slice(0, dot), ext = name.slice(dot);
  const part = path.join(folder, `${name}.part`);
  try {
    fs.writeFileSync(part, bytes);
    let lastError: unknown = null;
    for (let n = 1; n <= 9; n++) {
      const file = path.join(folder, n === 1 ? name : `${stem} (${n})${ext}`);
      try {
        fs.renameSync(part, file);
        return file;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES' && code !== 'EEXIST') throw error;
        lastError = error;
      }
    }
    throw lastError;
  } finally {
    try { if (fs.existsSync(part)) fs.unlinkSync(part); } catch { /* leave it; it is only a partial copy */ }
  }
}

interface Deps {
  isQuitting: () => boolean;
  kill: (child: ChildProcess) => void;
  retry: (restart: () => void, startedAt: number) => void;
  event: (name: string, data?: Record<string, unknown>) => void;
  port: () => number;
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class FloorplanService {
  private child: ChildProcess | null = null;
  private ready: Promise<boolean> | null = null;
  private inFlight = 0;
  private healthTimer: NodeJS.Timeout | null = null;
  private lastHealth: FloorplanHealth | null = null;
  private lastHealthAt = 0;
  private replaced = false;
  /** When the current process was spawned, and which of its first replies are already in the health log (D3). */
  private spawnedAt = 0;
  private firsts = new Set<string>();

  constructor(private readonly deps: Deps) {}

  get running(): boolean { return !!this.child; }

  start(): void {
    if (this.deps.isQuitting() || this.child) return;
    const lifetime = ['--parent-pid', String(process.pid), '--idle-seconds', String(IDLE_SECONDS)];
    let command: string;
    let args: string[];
    if (!app.isPackaged) {
      const venvPython = path.join(__dirname, '..', 'python', '.venv',
        ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
      command = fs.existsSync(venvPython) ? venvPython : (process.platform === 'win32' ? 'python' : 'python3');
      const scriptPath = path.join(__dirname, '..', 'tools', 'floorplan_server.py');
      if (!fs.existsSync(scriptPath)) {
        console.warn(`Floor plan server script not found at: ${scriptPath}`);
        return;
      }
      args = [scriptPath, ...lifetime];
    } else {
      command = path.join(process.resourcesPath, 'python', 'floorplan', 'GazeConnectFloorplan.exe');
      if (!fs.existsSync(command)) {
        console.error('Floor plan server is missing from the installed bundle.');
        return;
      }
      args = lifetime;
    }
    console.log(`Starting floor plan server: ${command} ${args.join(' ')}`);
    const startedAt = Date.now();
    this.replaced = false;
    this.spawnedAt = startedAt;
    this.firsts = new Set();
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // One numpy (OpenBLAS) thread: about 225 MB less commit on an 8-thread laptop, drawings as fast (16 Oct 2026).
      env: { ...process.env, FLOORPLAN_PORT: String(this.deps.port()), OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      windowsHide: true,
    });
    this.child = child;
    child.stdout?.on('data', (data) => console.log(`[FloorPlan] ${data.toString().trim()}`));
    child.stderr?.on('data', (data) => console.error(`[FloorPlan Error] ${data.toString().trim()}`));
    child.on('close', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = null;
      this.stopHealth();
      if (code === FLOORPLAN_IDLE_EXIT_CODE) {
        console.log('Floor plan server left after being idle; the next plan starts it again.');
        this.deps.event('floorplan-idle-exit');
        return;
      }
      console.log(`Floor plan server exited with code ${code}`);
      this.deps.event('floorplan-exit', { code });
      // A watchdog replacement or an app exit starts again lazily, on the next request.
      if (!this.replaced) this.deps.retry(() => this.start(), startedAt);
    });
    child.on('error', (err) => {
      console.error('Failed to start floor plan server:', err);
      if (this.child === child) { this.child = null; this.ready = null; this.stopHealth(); }
    });
    this.startHealth();
  }

  stop(): void {
    this.stopHealth();
    if (this.child) {
      console.log('Stopping floor plan server...');
      const child = this.child;
      this.child = null;
      this.ready = null;
      this.deps.kill(child);
    }
  }

  /** Starts the service if needed and resolves once our own process answers /api/health. */
  ensureReady(): Promise<boolean> {
    if (!this.child) this.start();
    if (!this.child) return Promise.resolve(false);
    if (!this.ready) {
      this.ready = this.waitReady().then((ok) => {
        if (!ok) this.ready = null;
        return ok;
      });
    }
    return this.ready;
  }

  private async waitReady(): Promise<boolean> {
    const until = Date.now() + READY_LIMIT_MS;
    while (Date.now() < until && this.child) {
      const health = await this.ping(1000);
      if (health) {
        const ours = this.child?.pid;
        // A dev venv's python.exe is a launcher, so the server may be our child's child.
        if (ours && health.pid !== ours && health.ppid !== ours) {
          console.error(`Port ${this.deps.port()} is held by another process (pid ${health.pid}); not using it.`);
          this.deps.event('floorplan-port-foreign', { pid: health.pid ?? null });
          return false;
        }
        this.first('ready', Date.now() - this.spawnedAt);
        return true;
      }
      await delay(READY_STEP_MS);
    }
    return false;
  }

  private async ping(limitMs: number): Promise<FloorplanHealth | null> {
    try {
      const reply = await requestFloorplan({ endpoint: '/api/health' }, this.deps.port(), limitMs);
      if (reply.status !== 200) return null;
      return JSON.parse(Buffer.from(reply.bytes).toString('utf8')) as FloorplanHealth;
    } catch {
      return null;
    }
  }

  /** One renderer request, bounded by the watchdog. */
  async request(input: FloorplanRequest): Promise<FloorplanReply> {
    const job = isFloorplanJobRoute(input?.endpoint);
    let watchdog: NodeJS.Timeout | null = null;
    if (job) {
      this.inFlight += 1;
      watchdog = setTimeout(() => this.replace(`a drawing ran longer than ${JOB_LIMIT_MS / 1000} s`), JOB_LIMIT_MS);
    }
    const startedAt = Date.now();
    try {
      const reply = await requestFloorplan(input, this.deps.port());
      if (reply.status === 200) {
        if (input.endpoint === '/api/floorplan/compass/v2/model') this.first('model', Date.now() - startedAt);
        else if (input.endpoint === '/api/floorplan/compass/v2/render') this.first('image', Date.now() - startedAt);
      }
      return reply;
    } finally {
      if (watchdog) clearTimeout(watchdog);
      if (job) this.inFlight = Math.max(0, this.inFlight - 1);
    }
  }

  /** The first ready answer, model and image of each process, in the health log: how long a first plan waits (D3).
   * One event name each: the log keeps only one event of a name within 2 s, and the image follows the model. */
  private first(what: 'ready' | 'model' | 'image', ms: number): void {
    if (!this.spawnedAt || this.firsts.has(what)) return;
    this.firsts.add(what);
    this.deps.event(`floorplan-first-${what}`, { ms, sinceSpawnMs: Date.now() - this.spawnedAt });
  }

  /** Ends a stuck service; the next request starts a fresh one. Never touches gaze. */
  private replace(reason: string): void {
    if (!this.child) return;
    console.error(`Floor plan server replaced: ${reason}.`);
    this.deps.event('floorplan-watchdog', { reason });
    this.replaced = true;
    const child = this.child;
    this.child = null;
    this.ready = null;
    this.stopHealth();
    this.deps.kill(child);
  }

  private startHealth(): void {
    this.stopHealth();
    this.healthTimer = setInterval(async () => {
      if (!this.child || this.ready === null) return;
      const health = await this.ping(HEALTH_LIMIT_MS);
      if (health) {
        this.lastHealth = health;
        this.lastHealthAt = Date.now();
      } else if (this.inFlight > 0) {
        this.replace('no health answer for 5 s during a drawing');
      }
    }, HEALTH_EVERY_MS);
  }

  private stopHealth(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
    this.lastHealth = null;
  }

  /** For the health log: the service's own memory and job state, only while it runs. */
  healthSnapshot(): Record<string, unknown> | null {
    if (!this.child || !this.lastHealth || Date.now() - this.lastHealthAt > 3 * HEALTH_EVERY_MS) return null;
    const memory = this.lastHealth.memory || {};
    const jobs = this.lastHealth.jobs || {};
    return {
      // Private bytes are commit; the working set is the memory it really occupies (on Windows they differ a lot).
      mb: memory.privateMb ?? memory.peakResidentMb ?? null,
      peakMb: memory.peakPrivateMb ?? memory.peakResidentMb ?? null,
      wsMb: memory.workingSetMb ?? null,
      running: !!jobs.running,
      pending: Array.isArray(jobs.pending) ? jobs.pending.length : 0,
      cacheMb: jobs.cache ? Math.round(jobs.cache.bytes / 104857.6) / 10 : null,
      idleS: this.lastHealth.idleS ?? null,
      warmS: this.lastHealth.warmS ?? null,
    };
  }

  /**
   * Memory for the heavier views, read now (the studio asks again each time the person chooses Outside, C2). A
   * refused Outside is written to the health log with the figures it was decided on (C3).
   */
  resources(request?: { width?: unknown; height?: unknown; outside?: unknown }): FloorplanResources {
    const info = process.getSystemMemoryInfo() as { total: number; free: number; swapTotal?: number; swapFree?: number };
    const decision = decideResources(info, request);
    if (request?.outside === true && !decision.exterior) {
      const { totalMb, availableMb, commitFreeMb, costMb, needMb, width, height } = decision;
      this.deps.event('floorplan-resources', { decision: 'refused', totalMb, availableMb, commitFreeMb, costMb, needMb, width, height });
    }
    return decision;
  }

  /** Writes one finished drawing to Documents\GazeConnect Plans\<date>\<fileName>. */
  async save(input: SaveRequest): Promise<SaveResult> {
    const name = typeof input?.fileName === 'string' ? input.fileName : '';
    const ext = /\.([a-z]+)$/.exec(name)?.[1] || '';
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,120}$/.test(name) || name.includes('..') || RESERVED_NAME.test(name) || !SAVE_EXTENSIONS[ext]) {
      return { ok: false, error: 'This file name cannot be used.' };
    }
    if (!isFloorplanJobRoute(input.endpoint)) return { ok: false, error: 'Only drawings can be saved.' };
    if (!(await this.ensureReady())) return { ok: false, error: 'The floor plan service is unavailable.' };
    let reply: FloorplanReply;
    try {
      reply = await this.request({ endpoint: input.endpoint, body: input.body });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'The drawing could not be prepared.' };
    }
    if (reply.status !== 200) {
      let message = 'The drawing could not be prepared. Please try again.';
      try { message = JSON.parse(Buffer.from(reply.bytes).toString('utf8')).error || message; } catch { /* keep */ }
      return { ok: false, error: message };
    }
    if (!SAVE_EXTENSIONS[ext].test(reply.contentType)) return { ok: false, error: 'The service returned a different kind of file.' };
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const bytes = Buffer.from(reply.bytes);
    let lastError = '';
    for (const place of ['Documents', 'Downloads'] as const) {
      try {
        const folder = path.join(app.getPath(place === 'Documents' ? 'documents' : 'downloads'), 'GazeConnect Plans', day);
        fs.mkdirSync(folder, { recursive: true });
        const file = writeFileSafely(folder, name, bytes);
        if (place !== 'Documents') this.deps.event('floorplan-save-fallback', { reason: lastError.slice(0, 200) });
        return { ok: true, folder, file, place, bytes: bytes.byteLength };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    return { ok: false, error: `The file could not be written: ${lastError}` };
  }
}

/** Only the main app window may use the service. */
export function fromMainWindow(event: IpcMainInvokeEvent, window: Electron.BrowserWindow | null): boolean {
  return !!window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
}
