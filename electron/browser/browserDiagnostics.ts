import { app, BrowserView } from 'electron';

export type YoutubeState =
  | 'idle'
  | 'search_results'
  | 'watch_loading'
  | 'ad_waiting'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'stalled'
  | 'ended'
  | 'error';

export type BrowserDiagnostics = {
  url: string;
  isOpen: boolean;
  browserViewAlive: boolean;
  youtubeState?: YoutubeState;
  lastCommand?: string;
  lastCommandStatus?: string;
  openCount: number;
  memoryMb?: number;
  ipcPerSecond?: number;
};

const DEBUG_BROWSER_GAZE =
  process.env.DEBUG_BROWSER_GAZE === '1' ||
  process.env.DEBUG_BROWSER_GAZE === 'true';

class BrowserDiagnosticsTracker {
  private openCount = 0;
  private lastCommand = '';
  private lastCommandStatus = '';
  private youtubeState: YoutubeState = 'idle';
  private ipcTicks: number[] = [];
  private lastDebugAt = new Map<string, number>();
  private lastWarningAt = new Map<string, number>();

  markOpen(): void {
    this.openCount += 1;
    this.youtubeState = 'idle';
    this.lastCommand = '';
    this.lastCommandStatus = '';
    this.ipcTicks = [];
  }

  markClose(): void {
    this.youtubeState = 'idle';
    this.ipcTicks = [];
  }

  recordIpcTick(): void {
    const now = Date.now();
    this.ipcTicks.push(now);
    while (this.ipcTicks.length > 0 && now - this.ipcTicks[0] > 1000) {
      this.ipcTicks.shift();
    }
  }

  recordCommand(command: string, status: string, youtubeState?: YoutubeState): void {
    this.lastCommand = command;
    this.lastCommandStatus = status;
    if (youtubeState) this.youtubeState = youtubeState;
  }

  setYoutubeState(state?: YoutubeState): void {
    if (state) this.youtubeState = state;
  }

  debug(key: string, message: string, minIntervalMs = 2000): void {
    if (!DEBUG_BROWSER_GAZE) return;
    this.logThrottled(this.lastDebugAt, key, message, minIntervalMs, 'debug');
  }

  warn(key: string, message: string, minIntervalMs = 15000): void {
    this.logThrottled(this.lastWarningAt, key, message, minIntervalMs, 'warn');
  }

  snapshot(activeBrowserView: BrowserView | null): BrowserDiagnostics {
    const url = activeBrowserView?.webContents?.getURL?.() || '';
    return {
      url,
      isOpen: !!activeBrowserView,
      browserViewAlive: !!activeBrowserView && !activeBrowserView.webContents.isDestroyed(),
      youtubeState: this.youtubeState,
      lastCommand: this.lastCommand || undefined,
      lastCommandStatus: this.lastCommandStatus || undefined,
      openCount: this.openCount,
      memoryMb: getBrowserViewMemoryMb(activeBrowserView),
      ipcPerSecond: this.ipcTicks.length,
    };
  }

  private logThrottled(
    bucket: Map<string, number>,
    key: string,
    message: string,
    minIntervalMs: number,
    level: 'debug' | 'warn'
  ): void {
    const now = Date.now();
    const last = bucket.get(key) || 0;
    if (now - last < minIntervalMs) return;
    bucket.set(key, now);
    const fn = level === 'warn' ? console.warn : console.log;
    fn(message);
  }
}

function getBrowserViewMemoryMb(activeBrowserView: BrowserView | null): number | undefined {
  try {
    const pid = activeBrowserView?.webContents?.getOSProcessId?.();
    if (!pid) return Math.round(process.memoryUsage().rss / 1024 / 1024);
    const metric = app.getAppMetrics().find((item) => item.pid === pid) as any;
    const workingSetKb = metric?.memory?.workingSetSize;
    if (typeof workingSetKb === 'number' && Number.isFinite(workingSetKb)) {
      return Math.round(workingSetKb / 1024);
    }
  } catch {
    // Fall back to the main process RSS below.
  }

  try {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
  } catch {
    return undefined;
  }
}

export const browserDiagnostics = new BrowserDiagnosticsTracker();

