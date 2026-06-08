/**
 * GazeConnect Pro - Electron Main Process
 * ========================================
 * Handles:
 * - Window management
 * - Python backend lifecycle (dev: venv, prod: PyInstaller exe)
 * - Floor plan Flask server lifecycle (dev/prod)
 * - Tobii helper lifecycle (dev: dotnet run, prod: bundled exe)
 * - System tray
 * - IPC handlers
 */

import { app, BrowserWindow, BrowserView, ipcMain, Tray, Menu, screen, nativeImage, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { browserDiagnostics } from './browser/browserDiagnostics';
import {
  BROWSER_CURSOR_CSS,
  BROWSER_CURSOR_HIDE_SCRIPT,
  BROWSER_CURSOR_RESET_SCRIPT,
  buildBrowserCursorBlockScript,
  buildBrowserCursorInjectionScript,
  buildGazeUpdateAndPollScript,
} from './browser/browserGazeController';
import { disposeBrowserView } from './browser/browserViewController';
import {
  buildYoutubeCommandScript,
  isYoutubeCommand,
  type YoutubeCommandResult,
} from './browser/youtubeController';

// ============================================
// GLOBALS
// ============================================

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let floorplanProcess: ChildProcess | null = null;
let tobiiProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isMouseOnlyMode = false;
let isFocusModeActive = false;
let isAlertModeActive = false;
// When isAlertModeLocked is true, the AlertModeScreen's Home button is
// disabled so the patient can't navigate away. Only the caregiver can
// unlock (or disable Alert Mode entirely) via right-click. The lock is
// automatically cleared whenever Alert Mode is disabled.
let isAlertModeLocked = false;
let isRefinementMapEnabled = true;

// Dynamic App State for Features
let currentAppScreen = 'home';
let isAppNavHidden = false;
let isUiLocked = false;

let activeBrowserView: BrowserView | null = null; // Gaze-controlled BrowserView
let activeBrowserViewSessionId = 0;
let lastNavState: { canGoBack: boolean; canGoForward: boolean; url: string } | null = null;
// v17.16 — last playback state sent to React, for change-detection so we
// only emit webview:playbackState on transitions, not every poll.
let lastPlaybackState: { playing: boolean; hasVideo: boolean; fullscreen: boolean } | null = null;
let playbackPollInFlight = false;
const domainZoomPrefs = new Map<string, number>();
const DEFAULT_WEB_ZOOM = 1.35;
let lastEdgeScrollAt = 0;
let lastEdgeScrollDirection: 'up' | 'down' | 'none' = 'none';
let edgeScrollCandidate: 'up' | 'down' | 'none' = 'none';
let edgeScrollEnteredAt = 0;
let edgeScrollActiveDirection: 'up' | 'down' | 'none' = 'none';
let edgeScrollStartedAt = 0;
let highContrastEnabled = false;
let rendererBootReady = false;
let splashTransitionStarted = false;
let browserDiagnosticsInterval: NodeJS.Timeout | null = null;

type BrowserGazeConfig = {
  dwellMs: number;
  onsetMs: number;
  stabilityRadiusPx: number;
  postClickCooldownMs: number;
  targetRegionSlackPx: number;
  youtubeCardHitZonePx: number;
  youtubeCardUnsnapPx: number;
  youtubeSkipSnapPx: number;
  youtubeSkipUnsnapPx: number;
  youtubeCardStabilityRadiusPx: number;
  edgeScrollEnabled: boolean;
  edgeHoldMs: number;
  edgeZonePct: number;
  edgeDeadZonePct: number;
  edgeMinDeltaPx: number;
  edgeMaxDeltaPx: number;
  edgeThrottleMs: number;
  edgeMaxBurstMs: number;
};

let browserGazeConfig: BrowserGazeConfig = {
  // v17: Patient reported in-browser cursor was "very very difficult" to
  // stop on a video card; widening these defaults gives a larger lock
  // zone once a target is acquired without making fresh acquisition
  // looser. Mirror gcConfig defaults in browserGazeController.ts.
  dwellMs: 1100,
  onsetMs: 280,
  stabilityRadiusPx: 60,
  postClickCooldownMs: 900,
  targetRegionSlackPx: 32,
  // Asymmetric hysteresis (Tobii US10,890,967, audit #6): snap-in narrow,
  // unsnap wide. Once a YouTube target is locked the dwell tolerates a
  // larger gaze drift before reset, preventing boundary flicker.
  youtubeCardHitZonePx: 130,
  youtubeCardUnsnapPx: 230,
  youtubeSkipSnapPx: 140,
  youtubeSkipUnsnapPx: 250,
  youtubeCardStabilityRadiusPx: 130,
  edgeScrollEnabled: false,
  edgeHoldMs: 650,
  edgeZonePct: 0.20,
  edgeDeadZonePct: 0.02,
  edgeMinDeltaPx: 18,
  edgeMaxDeltaPx: 36,
  edgeThrottleMs: 120,
  edgeMaxBurstMs: 6000,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function resetEdgeScrollState(notify: boolean = true) {
  lastEdgeScrollAt = 0;
  edgeScrollCandidate = 'none';
  edgeScrollEnteredAt = 0;
  edgeScrollActiveDirection = 'none';
  edgeScrollStartedAt = 0;
  if (notify) sendEdgeScrollState('none');
}

function sendTrustedBrowserClick(x: number, y: number, expectedSessionId = activeBrowserViewSessionId) {
  const view = activeBrowserView;
  if (!view || expectedSessionId !== activeBrowserViewSessionId || view.webContents.isDestroyed()) return;
  const cx = Math.round(x);
  const cy = Math.round(y);
  // Suspend the in-page dwell cursor for the duration of the post-click
  // cooldown. Previously we reset the dwell which also zeroed
  // `blockedUntil`, defeating the cooldown — letting the gaze fire a
  // second click on the video right after a YouTube command landed,
  // toggling play/pause.
  view.webContents.executeJavaScript(
    buildBrowserCursorBlockScript(browserGazeConfig.postClickCooldownMs)
  ).catch(() => { });
  view.webContents.sendInputEvent({ type: 'mouseMove', x: cx, y: cy } as any);
  setTimeout(() => {
    if (activeBrowserView !== view || expectedSessionId !== activeBrowserViewSessionId || view.webContents.isDestroyed()) return;
    view.webContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 } as any);
    setTimeout(() => {
      if (activeBrowserView !== view || expectedSessionId !== activeBrowserViewSessionId || view.webContents.isDestroyed()) return;
      view.webContents.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 } as any);
      setTimeout(() => sendBrowserNavState(true), 350);
    }, 60);
  }, 30);
}

function startBrowserDiagnosticsSampling(): void {
  if (browserDiagnosticsInterval) clearInterval(browserDiagnosticsInterval);
  browserDiagnosticsInterval = setInterval(() => {
    const snapshot = browserDiagnostics.snapshot(activeBrowserView);
    if (!snapshot.isOpen) return;
    browserDiagnostics.debug(
      'browser-memory',
      `[BrowserView] url=${snapshot.url || 'about:blank'} memory=${snapshot.memoryMb ?? 'n/a'}MB ipc=${snapshot.ipcPerSecond ?? 0}/s state=${snapshot.youtubeState || 'n/a'}`,
      60000
    );
  }, 60000);
}

async function closeActiveBrowserView(reason: string): Promise<void> {
  const view = activeBrowserView;
  activeBrowserView = null;
  activeBrowserViewSessionId += 1;

  if (browserDiagnosticsInterval) {
    clearInterval(browserDiagnosticsInterval);
    browserDiagnosticsInterval = null;
  }

  await disposeBrowserView(mainWindow, view, reason);
  lastNavState = null;
  lastPlaybackState = null;
  resetEdgeScrollState();
  mainWindow?.webContents.send('webview:links', { links: [] });
  mainWindow?.webContents.send('webview:closed', { reason });
  highContrastEnabled = false;
  browserDiagnostics.markClose();
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function getPreferredZoomForUrl(url: string): number {
  const domain = getDomainFromUrl(url);
  if (!domain) return DEFAULT_WEB_ZOOM;
  return domainZoomPrefs.get(domain) ?? DEFAULT_WEB_ZOOM;
}

function rememberZoomForCurrentPage(zoomFactor: number): void {
  if (!activeBrowserView) return;
  const domain = getDomainFromUrl(activeBrowserView.webContents.getURL() || '');
  if (!domain) return;
  domainZoomPrefs.set(domain, zoomFactor);
}

function sendEdgeScrollState(direction: 'up' | 'down' | 'none'): void {
  if (!mainWindow) return;
  if (direction === lastEdgeScrollDirection) return;
  lastEdgeScrollDirection = direction;
  mainWindow.webContents.send('webview:edge-scroll', { direction });
}

async function extractAndSendPageLinks(): Promise<void> {
  if (!activeBrowserView || !mainWindow) return;
  try {
    const raw = await activeBrowserView.webContents.executeJavaScript(`
      (function() {
        try {
          var links = Array.from(document.querySelectorAll('a[href]'))
            .filter(function(a) {
              var text = (a.textContent || '').trim();
              var rect = a.getBoundingClientRect();
              return text.length > 2 && text.length < 100 && rect.width > 0 && rect.height > 0;
            })
            .map(function(a) {
              return { text: (a.textContent || '').trim().slice(0, 60), href: a.href };
            })
            .slice(0, 25);
          return JSON.stringify(links);
        } catch (e) {
          return '[]';
        }
      })();
    `);
    const parsed = JSON.parse(raw || '[]');
    const deduped: Array<{ text: string; href: string }> = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const href = typeof item?.href === 'string' ? item.href : '';
      const text = typeof item?.text === 'string' ? item.text : '';
      if (!href || seen.has(href)) continue;
      seen.add(href);
      deduped.push({ text: text || href, href });
      if (deduped.length >= 15) break;
    }
    mainWindow.webContents.send('webview:links', { links: deduped });
  } catch (err) {
    console.warn('Failed to extract page links:', err);
    mainWindow.webContents.send('webview:links', { links: [] });
  }
}

function buildHighContrastScript(enable: boolean): string {
  if (enable) {
    return `
      (function() {
        var id = 'gazeconnect-high-contrast';
        if (document.getElementById(id)) return;
        var style = document.createElement('style');
        style.id = id;
        style.textContent = [
          'html, body { background: #000 !important; color: #fff !important; }',
          'p, div, span, li, td, th, h1, h2, h3, h4, h5, h6 { color: #fff !important; }',
          'a { color: #FACC15 !important; text-decoration: underline !important; }',
          'input, textarea, select, button { background: #111 !important; color: #fff !important; border-color: #FACC15 !important; }'
        ].join('\\n');
        (document.head || document.documentElement).appendChild(style);
      })();
    `;
  }
  return `
    (function() {
      var el = document.getElementById('gazeconnect-high-contrast');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    })();
  `;
}

async function applyHighContrastIfNeeded(): Promise<void> {
  if (!activeBrowserView) return;
  try {
    await activeBrowserView.webContents.executeJavaScript(buildHighContrastScript(highContrastEnabled));
  } catch {
    // ignore
  }
}

function sendBrowserNavState(force = false): void {
  if (!mainWindow || !activeBrowserView) return;
  try {
    const nextState = {
      canGoBack: activeBrowserView.webContents.canGoBack(),
      canGoForward: activeBrowserView.webContents.canGoForward(),
      url: activeBrowserView.webContents.getURL() || '',
    };

    if (
      !force &&
      lastNavState &&
      lastNavState.canGoBack === nextState.canGoBack &&
      lastNavState.canGoForward === nextState.canGoForward &&
      lastNavState.url === nextState.url
    ) {
      return;
    }

    lastNavState = nextState;
    browserDiagnostics.debug(
      'nav-state',
      `[Main] Nav state changed: back=${nextState.canGoBack}, fwd=${nextState.canGoForward}, url=${nextState.url}`,
      1500
    );
    mainWindow.webContents.send('webview:navigation-state', {
      canGoBack: nextState.canGoBack,
      canGoForward: nextState.canGoForward,
      url: nextState.url,
    });
  } catch (err) {
    console.error('Failed to send navigation state:', err);
  }
}

// v17.16 — poll the injected gcGetPlaybackState() and forward playback
// transitions to React via webview:playbackState. Change-detected on
// playing/hasVideo/fullscreen so we only emit on transitions. The rect is
// included in the payload for React layout but is not part of the
// change test (in-video suppression uses the in-page rect, not this copy).
// gcGetPlaybackState() also drives the injected video re-scan and the
// fullscreen auto-exit, so this poll must keep running even while gaze is
// paused — that is why it is a dedicated interval, not piggybacked on the
// per-frame gaze return.
async function sendBrowserPlaybackState(): Promise<void> {
  const view = activeBrowserView;
  const sessionId = activeBrowserViewSessionId;
  if (!mainWindow || !view || view.webContents.isDestroyed()) return;
  if (playbackPollInFlight) return;
  playbackPollInFlight = true;
  try {
    const raw: any = await view.webContents.executeJavaScript(
      'window.gcGetPlaybackState ? window.gcGetPlaybackState() : null'
    );
    if (
      !mainWindow ||
      activeBrowserView !== view ||
      activeBrowserViewSessionId !== sessionId ||
      view.webContents.isDestroyed()
    ) {
      return;
    }
    if (!raw || typeof raw !== 'object') return;
    const next = {
      playing: !!raw.playing,
      hasVideo: !!raw.hasVideo,
      fullscreen: !!raw.fullscreen,
    };
    if (
      lastPlaybackState &&
      lastPlaybackState.playing === next.playing &&
      lastPlaybackState.hasVideo === next.hasVideo &&
      lastPlaybackState.fullscreen === next.fullscreen
    ) {
      return;
    }
    lastPlaybackState = next;
    mainWindow.webContents.send('webview:playbackState', {
      playing: next.playing,
      hasVideo: next.hasVideo,
      rect: raw.rect || null,
      fullscreen: next.fullscreen,
    });
  } catch {
    /* page may be navigating / destroyed — ignore */
  } finally {
    playbackPollInFlight = false;
  }
}

function applyAacBrowsingMode(): void {
  if (!activeBrowserView) return;

  try {
    // Baseline zoom significantly reduces precision demand for eye gaze users.
    const url = activeBrowserView.webContents.getURL() || '';
    const preferredZoom = getPreferredZoomForUrl(url);
    activeBrowserView.webContents.setZoomFactor(preferredZoom);
  } catch {
    // Ignore transient navigation timing issues.
  }

  const injectScript = `
    (function () {
      try {
        if (!document || !document.head) return;
        if (document.getElementById('gazeconnect-aac-style')) return;
        var style = document.createElement('style');
        style.id = 'gazeconnect-aac-style';
        style.textContent = [
          'html { scroll-behavior: smooth !important; }',
          'body { font-size: 18px !important; line-height: 1.6 !important; }',
          'a, button, input, select, textarea, [role="button"], [onclick], [tabindex="0"] {',
          '  min-height: 48px !important;',
          '  min-width: 48px !important;',
          '  padding: 10px 14px !important;',
          '  font-size: 18px !important;',
          '  border-radius: 10px !important;',
          '  line-height: 1.4 !important;',
          '}',
          'a:hover, button:hover, [role="button"]:hover, [onclick]:hover {',
          '  outline: 2px solid #2DD4BF !important;',
          '  outline-offset: 2px !important;',
          '  background-color: rgba(45,212,191,0.08) !important;',
          '}',
          '.ad, [id*="ad-"], [class*="ad-container"], [class*="advertisement"], [class*="promo-banner"],',
          '[class*="cookie"], [id*="cookie"], [class*="popup"], [class*="modal-overlay"], [class*="social-share"] {',
          '  max-height: 0 !important;',
          '  opacity: 0.05 !important;',
          '  pointer-events: none !important;',
          '}',
          'img { max-width: 100% !important; height: auto !important; }'
        ].join('\\n');
        document.head.appendChild(style);
      } catch (_) { /* noop */ }
    })();
  `;

  activeBrowserView.webContents.executeJavaScript(injectScript)
    .then(() => applyHighContrastIfNeeded())
    .catch(() => { /* ignore */ });
}

function setMouseOnlyMode(enabled: boolean): void {
  isMouseOnlyMode = enabled;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mouse-only-mode-changed', isMouseOnlyMode);
  }
  // Keep app menu checkbox state in sync.
  if (app.isReady()) {
    buildAppMenu();
  }
  console.log('Mouse Only Mode:', isMouseOnlyMode ? 'ON' : 'OFF');
}

function setAlertModeActive(enabled: boolean): void {
  isAlertModeActive = enabled;
  if (isAlertModeActive && isFocusModeActive) {
    isFocusModeActive = false;
    mainWindow?.webContents.send('focus-mode-changed', false);
  }
  // Auto-clear the lock whenever Alert Mode is disabled — the lock has no
  // meaning outside Alert Mode and we don't want a stale lock applied to a
  // future Alert Mode session.
  if (!isAlertModeActive && isAlertModeLocked) {
    isAlertModeLocked = false;
    mainWindow?.webContents.send('alert-mode-lock-changed', false);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alert-mode-changed', isAlertModeActive);
  }
}

function setAlertModeLocked(enabled: boolean): void {
  // Only allow lock to be enabled when Alert Mode itself is active.
  isAlertModeLocked = enabled && isAlertModeActive;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alert-mode-lock-changed', isAlertModeLocked);
  }
}

function quitAppNow(): void {
  isQuitting = true;
  app.quit();
}

// ============================================
// TOBII HELPER MANAGEMENT
// ============================================

function startTobiiHelper(): void {
  const isDev = !app.isPackaged;
  let helperPath: string;

  if (isDev) {
    // Development: use the build output (built with -r win-x64)
    helperPath = path.join(__dirname, '..', 'tobii-helper', 'TobiiGazeHelper',
      'bin', 'Release', 'net6.0-windows', 'win-x64', 'TobiiGazeHelper.exe');
  } else {
    // Production: bundled in resources
    helperPath = path.join(process.resourcesPath, 'tobii-helper', 'TobiiGazeHelper.exe');
  }

  console.log(`Starting Tobii Helper: ${helperPath}`);

  if (!fs.existsSync(helperPath)) {
    console.warn(`Tobii Helper not found at: ${helperPath}`);
    console.warn('Gaze tracking will not be available. App will work in simulation mode.');
    return;
  }

  try {
    tobiiProcess = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    if (tobiiProcess.stdout) {
      tobiiProcess.stdout.on('data', (data) => {
        console.log(`[TobiiHelper] ${data.toString().trim()}`);
      });
    }

    if (tobiiProcess.stderr) {
      tobiiProcess.stderr.on('data', (data) => {
        console.error(`[TobiiHelper Error] ${data.toString().trim()}`);
      });
    }

    tobiiProcess.on('close', (code) => {
      console.log(`Tobii Helper exited with code ${code}`);
      tobiiProcess = null;
    });

    tobiiProcess.on('error', (err) => {
      console.error('Failed to start Tobii Helper:', err);
      tobiiProcess = null;
    });
  } catch (err) {
    console.error('Error spawning Tobii Helper:', err);
  }
}

function stopTobiiHelper(): void {
  if (tobiiProcess) {
    console.log('Stopping Tobii Helper...');
    try {
      tobiiProcess.kill('SIGTERM');
    } catch {
      try { tobiiProcess.kill(); } catch { /* ignore */ }
    }
    tobiiProcess = null;
  }
}

// ============================================
// PYTHON BACKEND MANAGEMENT
// ============================================

function getManagedRuntimePaths() {
  const runtimeRoot = path.join(app.getPath('userData'), 'runtime-data');
  const dataDir = path.join(runtimeRoot, 'data');
  const surveyDataDir = path.join(runtimeRoot, 'survey_data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(surveyDataDir, { recursive: true });
  return { dataDir, surveyDataDir };
}

function startPythonBackend(): void {
  const isDev = !app.isPackaged;

  let command: string;
  let args: string[];

  if (isDev) {
    // Development: use venv Python
    const venvPython = path.join(__dirname, '..', 'python', '.venv', 'Scripts', 'python.exe');
    command = fs.existsSync(venvPython) ? venvPython : 'python';
    const scriptPath = path.join(__dirname, '..', 'python', 'main.py');

    if (!fs.existsSync(scriptPath)) {
      // Try alternative path
      const altPath = path.join(process.cwd(), 'python', 'main.py');
      if (fs.existsSync(altPath)) {
        console.log(`Using alternative script path: ${altPath}`);
        args = [altPath];
      } else {
        console.error('Could not find Python backend script');
        return;
      }
    } else {
      args = [scriptPath];
    }
  } else {
    // Production: use PyInstaller-bundled executable
    const bundledExe = path.join(process.resourcesPath, 'python', 'GazeConnectBackend.exe');
    if (fs.existsSync(bundledExe)) {
      command = bundledExe;
      args = [];
    } else {
      // Fallback: try embedded Python with script
      const embeddedPython = path.join(process.resourcesPath, 'python', 'python.exe');
      const scriptPath = path.join(process.resourcesPath, 'python', 'main.py');
      if (fs.existsSync(embeddedPython) && fs.existsSync(scriptPath)) {
        command = embeddedPython;
        args = [scriptPath];
      } else {
        console.error('No Python backend found in production bundle');
        return;
      }
    }
  }

  const managedPaths = getManagedRuntimePaths();
  const shouldUseManagedPaths = app.isPackaged || process.env.GAZECONNECT_USE_MANAGED_DATA === '1';
  args.push('--host', '127.0.0.1');
  if (shouldUseManagedPaths) {
    args.push('--data-dir', managedPaths.dataDir);
    args.push('--survey-data-dir', managedPaths.surveyDataDir);
  }

  console.log(`Starting Python backend: ${command} ${args.join(' ')}`);

  pythonProcess = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (pythonProcess.stdout) {
    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python] ${data.toString().trim()}`);
    });
  }

  if (pythonProcess.stderr) {
    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python Error] ${data.toString().trim()}`);
    });
  }

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
    pythonProcess = null;

    // Restart if not quitting
    if (!isQuitting && code !== 0) {
      console.log('Restarting Python backend in 3 seconds...');
      setTimeout(startPythonBackend, 3000);
    }
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python process:', err);
  });
}

function stopPythonBackend(): void {
  if (pythonProcess) {
    console.log('Stopping Python backend...');
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
}

function startFloorplanServer(): void {
  if (floorplanProcess) return;

  const isDev = !app.isPackaged;
  let command: string;
  let args: string[];

  if (isDev) {
    const venvPython = path.join(__dirname, '..', 'python', '.venv', 'Scripts', 'python.exe');
    command = fs.existsSync(venvPython) ? venvPython : 'python';
    const scriptPath = path.join(__dirname, '..', 'tools', 'floorplan_server.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn(`Floor plan server script not found at: ${scriptPath}`);
      return;
    }
    args = [scriptPath];
  } else {
    const embeddedPython = path.join(process.resourcesPath, 'python', 'python.exe');
    const scriptPath = path.join(process.resourcesPath, 'tools', 'floorplan_server.py');
    if (!fs.existsSync(embeddedPython) || !fs.existsSync(scriptPath)) {
      console.warn('Floor plan server not bundled. Skipping auto-start.');
      return;
    }
    command = embeddedPython;
    args = [scriptPath];
  }

  console.log(`Starting floor plan server: ${command} ${args.join(' ')}`);

  floorplanProcess = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FLOORPLAN_PORT: process.env.FLOORPLAN_PORT || '5050' },
    windowsHide: true,
  });

  if (floorplanProcess.stdout) {
    floorplanProcess.stdout.on('data', (data) => {
      console.log(`[FloorPlan] ${data.toString().trim()}`);
    });
  }

  if (floorplanProcess.stderr) {
    floorplanProcess.stderr.on('data', (data) => {
      console.error(`[FloorPlan Error] ${data.toString().trim()}`);
    });
  }

  floorplanProcess.on('close', (code) => {
    console.log(`Floor plan server exited with code ${code}`);
    floorplanProcess = null;
    if (!isQuitting && code !== 0) {
      console.log('Restarting floor plan server in 3 seconds...');
      setTimeout(startFloorplanServer, 3000);
    }
  });

  floorplanProcess.on('error', (err) => {
    console.error('Failed to start floor plan server:', err);
    floorplanProcess = null;
  });
}

function stopFloorplanServer(): void {
  if (floorplanProcess) {
    console.log('Stopping floor plan server...');
    floorplanProcess.kill('SIGTERM');
    floorplanProcess = null;
  }
}

// ============================================
// APPLICATION MENU (Mouse Only Mode toggle)
// ============================================

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Mouse Only Mode',
          type: 'checkbox',
          checked: isMouseOnlyMode,
          accelerator: 'CmdOrCtrl+Shift+M',
          click: (menuItem) => {
            setMouseOnlyMode(menuItem.checked);
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About GazeConnect Pro',
          click: () => {
            // Could show about dialog
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================
// WINDOW MANAGEMENT
// ============================================

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#0D1117',
    show: false,
    frame: false,              // v13: No title bar — AAC app needs full screen
    titleBarStyle: 'hidden',   // v13: Hidden for macOS compatibility
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Build application menu (includes Mouse Only Mode toggle)
  buildAppMenu();

  // Right-click app context menu (requested):
  // 1) Mouse Only Mode toggle
  // 2) Focus Mode toggle (lock navigation)
  // 3) Full Screen Mode toggle
  // 4) Exit App
  mainWindow.webContents.on('context-menu', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Base menu options
    const menuTemplate: Array<Electron.MenuItemConstructorOptions> = [
      {
        label: 'Mouse Only Mode',
        type: 'checkbox',
        checked: isMouseOnlyMode,
        click: (menuItem) => setMouseOnlyMode(menuItem.checked),
      },
      {
        label: '🚨 Enable Alert Mode',
        type: 'checkbox',
        checked: isAlertModeActive,
        click: (menuItem) => {
          setAlertModeActive(menuItem.checked);
        },
      },
      // Lock Alert Mode — only meaningful when Alert Mode is already active.
      // When ON, the AlertModeScreen's Home button is disabled so the patient
      // can't exit; only the caregiver can unlock (or fully disable Alert
      // Mode) via this same right-click menu.
      {
        label: isAlertModeLocked ? '🔐 Unlock Alert Mode' : '🔒 Lock Alert Mode',
        type: 'checkbox',
        checked: isAlertModeLocked,
        enabled: isAlertModeActive,
        click: (menuItem) => {
          setAlertModeLocked(menuItem.checked);
        },
      },
      {
        label: '🔒 Focus Mode (Lock Navigation)',
        type: 'checkbox',
        checked: isFocusModeActive,
        click: (menuItem) => {
          isFocusModeActive = menuItem.checked;
          if (isFocusModeActive && isAlertModeActive) {
            isAlertModeActive = false;
            mainWindow?.webContents.send('alert-mode-changed', false);
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('focus-mode-changed', isFocusModeActive);
          }
        },
      },
      {
        label: '✂ Refinement Map (Compass)',
        type: 'checkbox',
        checked: isRefinementMapEnabled,
        click: (menuItem) => {
          isRefinementMapEnabled = menuItem.checked;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('refinement-map-changed', isRefinementMapEnabled);
          }
        },
      },
    ];

    // DYNAMIC INJECTION: Lock Mode only shows if on Keyboard/Compass AND nav is hidden
    if ((currentAppScreen === 'keyboard' || currentAppScreen === 'floor-plan') && isAppNavHidden) {
      menuTemplate.push(
        { type: 'separator' },
        {
          label: isUiLocked ? '🔓 Un-Lock Keyboard/Compass Mode' : '🔐 Lock Keyboard/Compass Mode',
          type: 'checkbox',
          checked: isUiLocked,
          click: (menuItem) => {
            isUiLocked = menuItem.checked;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ui-lock-toggled', isUiLocked);
            }
          },
        }
      );
    }

    // Default system options
    menuTemplate.push(
      { type: 'separator' },
      {
        label: 'Full Screen Mode',
        type: 'checkbox',
        checked: mainWindow.isFullScreen(),
        click: (menuItem) => {
          mainWindow?.setFullScreen(menuItem.checked);
        },
      },
      {
        label: 'Exit App',
        click: () => {
          quitAppNow();
        },
      }
    );

    const contextMenu = Menu.buildFromTemplate(menuTemplate);

    contextMenu.popup({ window: mainWindow });
  });

  // Load app
  const isDev = !app.isPackaged;
  if (isDev) {
    const devUrls = ['http://localhost:5173', 'http://127.0.0.1:5173'];
    const loadWithRetry = (retries = 30, urlIndex = 0) => {
      const devUrl = devUrls[urlIndex % devUrls.length];
      mainWindow!.loadURL(devUrl).catch((err: Error) => {
        if (retries > 0) {
          console.log(`Vite not ready on ${devUrl}, retrying in 1s... (${retries} attempts left)`);
          setTimeout(() => loadWithRetry(retries - 1, urlIndex + 1), 1000);
        } else {
          console.error('Failed to load Vite dev server:', err.message);
        }
      });
    };
    loadWithRetry();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Show when ready — if splash is active, signal it instead of showing directly
  mainWindow.once('ready-to-show', () => {
    mainWindowReady = true;
    if (splashWindow && !splashWindow.isDestroyed()) {
      console.log('[Main] mainWindow ready-to-show');
      maybeBeginSplashTransition('window-ready');
    } else {
      // No splash (already closed or never created) — show immediately
      mainWindow?.maximize();
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // Fallback: if ready-to-show doesn't fire within 20s, show anyway
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('ready-to-show timeout - forcing window visible');
      closeSplashWindow();
      mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
    }
  }, 20000);

  // Handle close
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================
// SYSTEM TRAY
// ============================================

function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'public', 'assets', 'icons', 'tray-icon.png');

  let icon: Electron.NativeImage;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a minimal 16x16 tray icon (Windows requires a valid icon)
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAI0lEQVQ4T2NkYPj/n4EBFTAiC4AEQWxkNagGjAbBaBCgBAYA3OEJEJ/KEl8AAAAASUVORK5CYII='
    );
  }

  try {
    tray = new Tray(icon);
  } catch (err) {
    console.warn('Failed to create system tray:', err);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show GazeConnect',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Emergency Alert',
      click: () => {
        mainWindow?.webContents.send('emergency-triggered');
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('GazeConnect Pro');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// ============================================
// IPC HANDLERS
// ============================================

function setupIpcHandlers(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.hide();
  });

  ipcMain.handle('window:fullscreen', () => {
    mainWindow?.setFullScreen(!mainWindow.isFullScreen());
  });

  ipcMain.handle('window:isFullscreen', () => {
    return mainWindow?.isFullScreen() ?? false;
  });

  ipcMain.handle('screen:getInfo', () => {
    const display = screen.getPrimaryDisplay();
    return {
      width: display.bounds.width,
      height: display.bounds.height,
      scaleFactor: display.scaleFactor,
    };
  });

  // Window bounds for gaze coordinate mapping
  // CRITICAL: Use getContentBounds() NOT getBounds()!
  // getBounds() includes the title bar (~32px on Windows), which creates a
  // systematic Y offset in gaze coordinates — the cursor appears ~31px below
  // where the user is actually looking. getContentBounds() returns the web
  // content area bounds, which matches window.innerWidth/innerHeight exactly.
  ipcMain.handle('window:getBounds', () => {
    if (!mainWindow) return null;
    const contentBounds = mainWindow.getContentBounds();
    const display = screen.getPrimaryDisplay();
    return {
      x: contentBounds.x,
      y: contentBounds.y,
      width: contentBounds.width,
      height: contentBounds.height,
      screenWidth: display.bounds.width,
      screenHeight: display.bounds.height,
      scaleFactor: display.scaleFactor,
      isFullScreen: mainWindow.isFullScreen(),
      isMaximized: mainWindow.isMaximized(),
    };
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPaths', () => {
    return {
      userData: app.getPath('userData'),
      documents: app.getPath('documents'),
      temp: app.getPath('temp'),
    };
  });

  ipcMain.handle('app:renderer-ready', () => {
    rendererBootReady = true;
    maybeBeginSplashTransition('renderer-ready');
    return true;
  });

  ipcMain.handle('floorplan:ensure-server', () => {
    if (!floorplanProcess) {
      startFloorplanServer();
    }
    return true;
  });

  // Stream app context
  ipcMain.handle('app:updateContext', (_event, context: { screen: string, isNavHidden: boolean }) => {
    // If navigating away, auto-unlock
    if (context.screen !== currentAppScreen && isUiLocked) {
      isUiLocked = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ui-lock-toggled', false);
      }
    }
    currentAppScreen = context.screen;
    isAppNavHidden = context.isNavHidden;
    // Auto-unlock if nav somehow un-hides while locked
    if (!isAppNavHidden && isUiLocked) {
      isUiLocked = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ui-lock-toggled', false);
      }
    }
    return true;
  });

  // Settings persistence
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  ipcMain.handle('settings:load', async () => {
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    return null;
  });

  ipcMain.handle('settings:save', async (_event: any, settings: any) => {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      return false;
    }
  });

  // Customization data persistence
  const customizationPath = path.join(app.getPath('userData'), 'customization.json');

  ipcMain.handle('customization:load', async () => {
    try {
      if (fs.existsSync(customizationPath)) {
        const data = fs.readFileSync(customizationPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Failed to load customization:', err);
    }
    return null;
  });

  ipcMain.handle('customization:save', async (_event: any, data: string) => {
    try {
      const tmpPath = customizationPath + '.tmp';
      fs.writeFileSync(tmpPath, data, 'utf-8');
      fs.renameSync(tmpPath, customizationPath);
      return true;
    } catch (err) {
      console.error('Failed to save customization:', err);
      return false;
    }
  });

  ipcMain.handle('customization:export', async (_event: any, data: string) => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export Backup',
        defaultPath: `gazeconnect-backup-${dateStr}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { success: false };
      fs.writeFileSync(result.filePath, data, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err) {
      console.error('Failed to export customization:', err);
      return { success: false };
    }
  });

  ipcMain.handle('customization:import', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Customization',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const data = fs.readFileSync(result.filePaths[0], 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to import customization:', err);
      return null;
    }
  });

  // ============================================
  // BROWSERVIEW — GAZE-CONTROLLED WEB BROWSING
  // ============================================

  ipcMain.handle('webview:open', async (_event: any, url: string, bounds: { x: number; y: number; width: number; height: number }) => {
    browserDiagnostics.debug('webview-open', `[Main] webview:open called for: ${url}`, 500);
    if (!mainWindow) return { success: false };
    try {
      if (activeBrowserView) {
        await closeActiveBrowserView('replace');
      }
      lastNavState = null;
      lastPlaybackState = null;
      resetEdgeScrollState();
      mainWindow.webContents.send('webview:links', { links: [] });
      highContrastEnabled = false;

      const view = new BrowserView({
        webPreferences: {
          contextIsolation: true, // Must be true for security
          nodeIntegration: false,
          sandbox: true,          // Sandbox for safety
        },
      });

      activeBrowserView = view;
      activeBrowserViewSessionId += 1;
      const sessionId = activeBrowserViewSessionId;
      browserDiagnostics.markOpen();
      startBrowserDiagnosticsSampling();

      mainWindow.addBrowserView(view);
      view.setBounds(bounds);
      view.setAutoResize({ width: true, height: true });

      const listenerCleanup: Array<() => void> = [];
      const onBrowserViewEvent = (eventName: string, handler: (...args: any[]) => void) => {
        view.webContents.on(eventName as any, handler as any);
        listenerCleanup.push(() => {
          try {
            view.webContents.removeListener(eventName as any, handler as any);
          } catch {
            // Ignore cleanup races during BrowserView teardown.
          }
        });
      };
      (view as any)._browserViewCleanup = () => {
        while (listenerCleanup.length) {
          const cleanup = listenerCleanup.pop();
          cleanup?.();
        }
      };

      const injectBrowserPageHelpers = async () => {
        if (activeBrowserView !== view || activeBrowserViewSessionId !== sessionId || view.webContents.isDestroyed()) return;
        applyAacBrowsingMode();
        view.webContents.insertCSS(BROWSER_CURSOR_CSS)
          .catch((e) => browserDiagnostics.warn('cursor-css', `[Main] Cursor CSS injection failed: ${e?.message || e}`));
        // Seed window.gcConfig with the latest live values BEFORE the
        // cursor IIFE runs — the IIFE merges existing window.gcConfig
        // over its built-in defaults, so this is how any user-tuned
        // dwell / snap settings take effect on a fresh page.
        const seedConfig = JSON.stringify({
          dwellMs: browserGazeConfig.dwellMs,
          onsetMs: browserGazeConfig.onsetMs,
          stabilityRadiusPx: browserGazeConfig.stabilityRadiusPx,
          postClickCooldownMs: browserGazeConfig.postClickCooldownMs,
          targetRegionSlackPx: browserGazeConfig.targetRegionSlackPx,
          youtubeCardHitZonePx: browserGazeConfig.youtubeCardHitZonePx,
          youtubeCardUnsnapPx: browserGazeConfig.youtubeCardUnsnapPx,
          youtubeSkipSnapPx: browserGazeConfig.youtubeSkipSnapPx,
          youtubeSkipUnsnapPx: browserGazeConfig.youtubeSkipUnsnapPx,
          youtubeCardStabilityRadiusPx: browserGazeConfig.youtubeCardStabilityRadiusPx,
        });
        view.webContents.executeJavaScript(
          `window.gcConfig = Object.assign(window.gcConfig || {}, ${seedConfig});`
        ).catch(() => { });
        view.webContents.executeJavaScript(buildBrowserCursorInjectionScript())
          .catch((e) => browserDiagnostics.warn('cursor-js', `[Main] Cursor JS injection failed: ${e?.message || e}`));
        sendBrowserNavState(true);
        extractAndSendPageLinks();
      };

      onBrowserViewEvent('dom-ready', () => {
        browserDiagnostics.debug('dom-ready', `[Main] dom-ready for: ${view.webContents.getURL()}`, 1000);
        void injectBrowserPageHelpers();
      });

      view.webContents.setWindowOpenHandler(({ url }) => {
        browserDiagnostics.debug('window-open', `[BrowserView] Intercepted new window: ${url}`, 1000);
        view.webContents.loadURL(url).finally(() => {
          void injectBrowserPageHelpers();
        });
        return { action: 'deny' };
      });

      onBrowserViewEvent('did-start-navigation', () => {
        view.webContents.executeJavaScript(BROWSER_CURSOR_RESET_SCRIPT).catch(() => { });
      });
      onBrowserViewEvent('did-navigate', (_e, nextUrl) => {
        browserDiagnostics.debug('did-navigate', `[Main] did-navigate: ${nextUrl}`, 1000);
        view.webContents.executeJavaScript(BROWSER_CURSOR_RESET_SCRIPT).catch(() => { });
        void injectBrowserPageHelpers();
      });
      onBrowserViewEvent('did-navigate-in-page', (_e, nextUrl) => {
        browserDiagnostics.debug('did-navigate-in-page', `[Main] did-navigate-in-page: ${nextUrl}`, 1000);
        view.webContents.executeJavaScript(BROWSER_CURSOR_RESET_SCRIPT).catch(() => { });
        void injectBrowserPageHelpers();
      });
      onBrowserViewEvent('did-stop-loading', () => {
        sendBrowserNavState(true);
        extractAndSendPageLinks();
      });
      onBrowserViewEvent('unresponsive', () => {
        browserDiagnostics.warn('browser-unresponsive', '[BrowserView] renderer became unresponsive');
        void closeActiveBrowserView('unresponsive');
      });
      onBrowserViewEvent('responsive', () => {
        browserDiagnostics.debug('browser-responsive', '[BrowserView] renderer responsive again', 1000);
      });
      onBrowserViewEvent('render-process-gone', (_event, details) => {
        browserDiagnostics.warn('browser-render-gone', `[BrowserView] render process gone: ${details?.reason || 'unknown'}`);
        void closeActiveBrowserView(`render-process-gone:${details?.reason || 'unknown'}`);
      });
      onBrowserViewEvent('destroyed', () => {
        browserDiagnostics.markClose();
      });

      const pollInterval = setInterval(() => {
        if (activeBrowserView !== view || !mainWindow) {
          clearInterval(pollInterval);
          return;
        }
        sendBrowserNavState(false);
      }, 1000);

      (view as any)._navPoll = pollInterval;

      // v17.16 — playback-state poll. Faster than the 1 s nav poll so the
      // Watch Mode rail appears promptly on play; also drives the injected
      // video re-scan + fullscreen auto-exit even when gaze is paused.
      const playbackPoll = setInterval(() => {
        if (activeBrowserView !== view || !mainWindow || view.webContents.isDestroyed()) {
          clearInterval(playbackPoll);
          return;
        }
        void sendBrowserPlaybackState();
      }, 200);

      (view as any)._playbackPoll = playbackPoll;

      await view.webContents.loadURL(url);
      sendBrowserNavState(true);

      return { success: true, url };
    } catch (err: any) {
      console.error('webview:open failed:', err?.message);
      await closeActiveBrowserView('open-failed');
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('webview:close', async () => {
    await closeActiveBrowserView('close');
    return { success: true };
  });

  ipcMain.handle('webview:click', (_event: any, x: number, y: number) => {
    if (!activeBrowserView) return;
    try {
      // First move the mouse to the target position — this updates Chromium's
      // hover state so the correct element receives the click event
      activeBrowserView.webContents.sendInputEvent({ type: 'mouseMove', x, y } as any);
      // Then dispatch mouseDown + mouseUp for a full click
      setTimeout(() => {
        activeBrowserView?.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 } as any);
        setTimeout(() => {
          activeBrowserView?.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 } as any);
          setTimeout(() => sendBrowserNavState(true), 350);
        }, 60);
      }, 30);
    } catch (err) {
      console.error('webview:click error:', err);
    }
  });

  ipcMain.handle('webview:scroll', (_event: any, deltaY: number) => {
    if (!activeBrowserView) return;
    try {
      // Send scroll at center of the view
      const bounds = activeBrowserView.getBounds();
      const cx = Math.round(bounds.width / 2);
      const cy = Math.round(bounds.height / 2);
      activeBrowserView.webContents.sendInputEvent({
        type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY,
      } as any);
    } catch (err) {
      console.error('webview:scroll error:', err);
    }
  });

  ipcMain.handle('webview:back', () => {
    console.log('[Main] webview:back called');
    if (activeBrowserView?.webContents.canGoBack()) {
      activeBrowserView.webContents.goBack();
      console.log('[Main] Executed goBack');
      setTimeout(() => sendBrowserNavState(true), 250);
    } else {
      console.log('[Main] cannot goBack');
      sendBrowserNavState(true);
    }
  });

  ipcMain.handle('webview:forward', () => {
    if (activeBrowserView?.webContents.canGoForward()) {
      activeBrowserView.webContents.goForward();
      setTimeout(() => sendBrowserNavState(true), 250);
    }
  });

  ipcMain.handle('webview:type', (_event: any, text: string) => {
    if (!activeBrowserView) return;
    try {
      for (const char of text) {
        activeBrowserView.webContents.sendInputEvent({ type: 'keyDown', keyCode: char } as any);
        activeBrowserView.webContents.sendInputEvent({ type: 'char', keyCode: char } as any);
        activeBrowserView.webContents.sendInputEvent({ type: 'keyUp', keyCode: char } as any);
      }
    } catch (err) {
      console.error('webview:type error:', err);
    }
  });

  // Execute JavaScript in the active BrowserView with user-gesture context.
  // The user-gesture flag is critical for browser APIs that require it (e.g.
  // Element.requestFullscreen, autoplay-with-sound, popups). Used by the AAC
  // toolbar to reliably click YouTube's fullscreen / skip-ad buttons.
  ipcMain.handle('webview:executeJs', async (_event: any, code: string) => {
    if (!activeBrowserView || !code || typeof code !== 'string') return { success: false };
    try {
      const result = await activeBrowserView.webContents.executeJavaScript(code, true);
      return { success: true, result };
    } catch (err: any) {
      console.error('webview:executeJs error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('webview:youtubeCommand', async (_event: any, command: string) => {
    const view = activeBrowserView;
    const sessionId = activeBrowserViewSessionId;
    if (!view || view.webContents.isDestroyed() || typeof command !== 'string') {
      return { ok: false, status: 'failed', detail: 'no_active_browser_view' };
    }

    if (!isYoutubeCommand(command)) {
      return { ok: false, status: 'failed', detail: 'unknown_command' };
    }

    try {
      const result = await view.webContents.executeJavaScript(
        buildYoutubeCommandScript(command),
        true
      ) as YoutubeCommandResult | null;
      if (activeBrowserView !== view || activeBrowserViewSessionId !== sessionId) {
        return { ok: false, status: 'failed', detail: 'stale_browser_view' };
      }
      const safeResult = result || { ok: false, status: 'failed', detail: 'empty_result' };
      const blockMs = Math.max(
        0,
        Math.min(8000, Number((safeResult as YoutubeCommandResult).blockDwellMs) || 0)
      );
      const point = (safeResult as YoutubeCommandResult).trustedClick;
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        sendTrustedBrowserClick(point.x, point.y, sessionId);
      } else if (blockMs > 0) {
        // No coordinate-based click was needed — the script already
        // dispatched a synthetic click directly on the target. Suspend
        // the in-page dwell cursor for the requested duration so the
        // user's gaze can't immediately fire a second click on the
        // video (which YouTube would interpret as play/pause).
        view.webContents.executeJavaScript(
          buildBrowserCursorBlockScript(blockMs)
        ).catch(() => { });
      }
      browserDiagnostics.recordCommand(command, safeResult.status || 'failed', safeResult.youtubeState);
      return safeResult;
    } catch (err: any) {
      console.error('webview:youtubeCommand error:', err?.message || err);
      browserDiagnostics.recordCommand(command, 'failed');
      return { ok: false, status: 'failed', detail: err?.message || String(err) };
    }
  });

    /*
    const allowed = new Set(['play_pause', 'next', 'skip_ad', 'show_controls', 'hide_controls']);
    if (!allowed.has(command)) {
      return { ok: false, status: 'failed', detail: 'unknown_command' };
    }

    const script = `
      (function(command) {
        const player = document.querySelector('#movie_player') || document;
        const video = player.querySelector('video') || document.querySelector('video');
        const state = window.gcYouTubeController = window.gcYouTubeController || {};

        const visible = (el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width >= 10 && rect.height >= 10 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || 1) > 0.05 &&
            !el.disabled &&
            el.getAttribute('aria-disabled') !== 'true';
        };

        const centerOf = (el) => {
          const rect = el.getBoundingClientRect();
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        };

        const pressElement = (el) => {
          if (!el) return false;
          try { el.scrollIntoView?.({ block: 'center', inline: 'center' }); } catch (_) {}
          const events = ['pointerdown', 'mousedown', 'mouseup', 'click'];
          for (const type of events) {
            try {
              el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                buttons: type.endsWith('down') ? 1 : 0
              }));
            } catch (_) {}
          }
          try { el.click?.(); } catch (_) {}
          return true;
        };

        const normalizeButton = (el) =>
          el && (el.closest('button, [role="button"], .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-next-button, .ytp-play-button') || el);

        const findSkipButton = () => {
          const selectors = [
            '.ytp-ad-skip-button',
            '.ytp-ad-skip-button-modern',
            '.ytp-skip-ad-button',
            '.ytp-ad-skip-button-container button',
            '.ytp-ad-preview-container button',
            '.videoAdUiSkipButton',
            'button[aria-label*="Skip" i]',
            '[role="button"][aria-label*="Skip" i]',
            '[title*="Skip" i]',
            '[data-title-no-tooltip*="Skip" i]',
            'button[class*="skip" i]',
            '[role="button"][class*="skip" i]'
          ];
          const roots = [player, document];
          const candidates = [];
          for (const root of roots) {
            for (const selector of selectors) {
              try { root.querySelectorAll(selector).forEach((el) => candidates.push(normalizeButton(el))); } catch (_) {}
            }
          }
          document.querySelectorAll('button, [role="button"], .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')
            .forEach((el) => {
              const text = [
                el.textContent || '',
                el.getAttribute('aria-label') || '',
                el.getAttribute('title') || '',
                el.getAttribute('data-title-no-tooltip') || ''
              ].join(' ');
              if (/skip|छोड़|छोड|छोड़/i.test(text)) candidates.push(normalizeButton(el));
            });
          const seen = new Set();
          for (const candidate of candidates) {
            if (!candidate || seen.has(candidate)) continue;
            seen.add(candidate);
            if (visible(candidate)) return candidate;
          }
          return null;
        };

        const installAdSkipObserver = () => {
          if (state.adSkipObserver) return;
          state.adSkipObserver = new MutationObserver(() => {
            const button = findSkipButton();
            if (button) pressElement(button);
          });
          state.adSkipObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'aria-disabled', 'disabled']
          });
        };

        const adPresent = () =>
          !!document.querySelector('.ad-showing, .ytp-ad-player-overlay, .ytp-ad-module, .video-ads, .ytp-ad-text, .ytp-ad-preview-container');

        installAdSkipObserver();

        if (command === 'skip_ad') {
          const button = findSkipButton();
          if (button) {
            return { ok: true, status: 'done', detail: 'skip_clicked', trustedClick: centerOf(button) };
          }
          return { ok: false, status: adPresent() ? 'waiting_for_skip' : 'no_ad' };
        }

        if (command === 'play_pause') {
          const spinnerVisible = visible(player.querySelector?.('.ytp-spinner, .ytp-spinner-container') || document.querySelector('.ytp-spinner, .ytp-spinner-container'));
          const videoStalledAtStart = !!video && !video.paused && video.currentTime < 0.35 && (video.readyState < 3 || spinnerVisible);
          try {
            if (player && typeof player.getPlayerState === 'function' && typeof player.playVideo === 'function' && typeof player.pauseVideo === 'function') {
              const s = player.getPlayerState();
              if (videoStalledAtStart || s === 3 || s === 5 || s === -1) {
                player.playVideo();
                try { video?.play?.(); } catch (_) {}
                return { ok: true, status: 'done', detail: 'player_recover_play' };
              }
              if (s === 1) player.pauseVideo(); else player.playVideo();
              return { ok: true, status: 'done', detail: 'player_api' };
            }
          } catch (_) {}
          if (video) {
            if (videoStalledAtStart || video.paused) video.play?.(); else video.pause?.();
            return { ok: true, status: 'done', detail: 'video_element' };
          }
          const playButton = normalizeButton(player.querySelector?.('.ytp-play-button') || document.querySelector('.ytp-play-button'));
          if (visible(playButton)) {
            return { ok: true, status: 'done', detail: 'play_button', trustedClick: centerOf(playButton) };
          }
          return { ok: false, status: 'failed', detail: 'no_play_target' };
        }

        if (command === 'next') {
          const nextButton = normalizeButton(player.querySelector?.('.ytp-next-button') || document.querySelector('.ytp-next-button'));
          if (visible(nextButton)) {
            return { ok: true, status: 'done', detail: 'next_button', trustedClick: centerOf(nextButton) };
          }
          try {
            if (player && typeof player.nextVideo === 'function') {
              player.nextVideo();
              return { ok: true, status: 'done', detail: 'player_api' };
            }
          } catch (_) {}
          const playlistItem = document.querySelector('ytd-playlist-panel-video-renderer:not([selected]), ytd-compact-video-renderer a#thumbnail, ytd-video-renderer a#thumbnail');
          if (visible(playlistItem)) {
            const target = playlistItem.closest('a, button, [role="button"]') || playlistItem;
            return { ok: true, status: 'done', detail: 'playlist_fallback', trustedClick: centerOf(target) };
          }
          return { ok: false, status: 'no_next', detail: 'no_next_target' };
        }

        if (command === 'show_controls' || command === 'hide_controls') {
          const rect = (player.getBoundingClientRect && player.getBoundingClientRect()) || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
          const x = Math.round(rect.left + rect.width / 2);
          const y = Math.round(rect.top + rect.height / 2);
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
          return { ok: true, status: 'done', detail: 'mousemove_controls' };
        }

        return { ok: false, status: 'failed', detail: 'unhandled_command' };
      })(${JSON.stringify(command)});
    `;

    try {
      const result = await activeBrowserView!.webContents.executeJavaScript(script, true);
      const point = result?.trustedClick;
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        sendTrustedBrowserClick(point.x, point.y);
      }
      return result || { ok: false, status: 'failed', detail: 'empty_result' };
    } catch (err: any) {
      console.error('webview:youtubeCommand error:', err?.message || err);
      return { ok: false, status: 'failed', detail: err?.message || String(err) };
    }
  });

    */
  ipcMain.handle('webview:setGazeConfig', async (_event: any, config: Partial<BrowserGazeConfig>) => {
    browserGazeConfig = {
      dwellMs: clampNumber(config?.dwellMs, browserGazeConfig.dwellMs, 700, 3200),
      onsetMs: clampNumber(config?.onsetMs, browserGazeConfig.onsetMs, 100, 900),
      stabilityRadiusPx: clampNumber(config?.stabilityRadiusPx, browserGazeConfig.stabilityRadiusPx, 30, 90),
      postClickCooldownMs: clampNumber(config?.postClickCooldownMs, browserGazeConfig.postClickCooldownMs, 600, 1800),
      targetRegionSlackPx: clampNumber(config?.targetRegionSlackPx, browserGazeConfig.targetRegionSlackPx, 8, 60),
      youtubeCardHitZonePx: clampNumber(config?.youtubeCardHitZonePx, browserGazeConfig.youtubeCardHitZonePx, 60, 200),
      youtubeCardUnsnapPx: clampNumber(config?.youtubeCardUnsnapPx, browserGazeConfig.youtubeCardUnsnapPx, 80, 280),
      youtubeSkipSnapPx: clampNumber(config?.youtubeSkipSnapPx, browserGazeConfig.youtubeSkipSnapPx, 60, 200),
      youtubeSkipUnsnapPx: clampNumber(config?.youtubeSkipUnsnapPx, browserGazeConfig.youtubeSkipUnsnapPx, 80, 280),
      youtubeCardStabilityRadiusPx: clampNumber(config?.youtubeCardStabilityRadiusPx, browserGazeConfig.youtubeCardStabilityRadiusPx, 50, 180),
      edgeScrollEnabled: typeof config?.edgeScrollEnabled === 'boolean' ? config.edgeScrollEnabled : browserGazeConfig.edgeScrollEnabled,
      edgeHoldMs: clampNumber(config?.edgeHoldMs, browserGazeConfig.edgeHoldMs, 300, 1600),
      edgeZonePct: clampNumber(config?.edgeZonePct, browserGazeConfig.edgeZonePct, 0.06, 0.22),
      edgeDeadZonePct: clampNumber(config?.edgeDeadZonePct, browserGazeConfig.edgeDeadZonePct, 0.01, 0.04),
      edgeMinDeltaPx: clampNumber(config?.edgeMinDeltaPx, browserGazeConfig.edgeMinDeltaPx, 12, 70),
      edgeMaxDeltaPx: clampNumber(config?.edgeMaxDeltaPx, browserGazeConfig.edgeMaxDeltaPx, 18, 90),
      edgeThrottleMs: clampNumber(config?.edgeThrottleMs, browserGazeConfig.edgeThrottleMs, 80, 220),
      edgeMaxBurstMs: clampNumber(config?.edgeMaxBurstMs, browserGazeConfig.edgeMaxBurstMs, 2000, 10000),
    };

    if (activeBrowserView) {
      const serialized = JSON.stringify({
        dwellMs: browserGazeConfig.dwellMs,
        onsetMs: browserGazeConfig.onsetMs,
        stabilityRadiusPx: browserGazeConfig.stabilityRadiusPx,
        postClickCooldownMs: browserGazeConfig.postClickCooldownMs,
        targetRegionSlackPx: browserGazeConfig.targetRegionSlackPx,
        youtubeCardHitZonePx: browserGazeConfig.youtubeCardHitZonePx,
        youtubeCardUnsnapPx: browserGazeConfig.youtubeCardUnsnapPx,
        youtubeSkipSnapPx: browserGazeConfig.youtubeSkipSnapPx,
        youtubeSkipUnsnapPx: browserGazeConfig.youtubeSkipUnsnapPx,
        youtubeCardStabilityRadiusPx: browserGazeConfig.youtubeCardStabilityRadiusPx,
      });
      try {
        await activeBrowserView.webContents.executeJavaScript(
          `window.gcConfig = Object.assign(window.gcConfig || {}, ${serialized});`
        );
      } catch { /* page may be navigating */ }
    }
    return browserGazeConfig;
  });

  ipcMain.handle('webview:setScrollMode', async (_event: any, enabled: boolean) => {
    browserGazeConfig.edgeScrollEnabled = Boolean(enabled);
    resetEdgeScrollState();
    return { enabled: browserGazeConfig.edgeScrollEnabled };
  });

  ipcMain.handle('webview:getDiagnostics', () => {
    return browserDiagnostics.snapshot(activeBrowserView);
  });

  ipcMain.handle('webview:resetBrowserSession', async (_event: any, reason: string) => {
    await closeActiveBrowserView(typeof reason === 'string' && reason ? reason : 'renderer-reset');
    return { success: true };
  });

  ipcMain.handle('webview:setBounds', (_event: any, bounds: { x: number; y: number; width: number; height: number }) => {
    if (activeBrowserView) {
      activeBrowserView.setBounds(bounds);
    }
  });

  ipcMain.handle('webview:navigate', async (_event: any, url: string) => {
    if (!activeBrowserView || !url) return { success: false };
    try {
      await activeBrowserView.webContents.loadURL(url);
      applyAacBrowsingMode();
      sendBrowserNavState(true);
      extractAndSendPageLinks();
      return { success: true };
    } catch (err: any) {
      console.error('webview:navigate error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('webview:refreshLinks', async () => {
    await extractAndSendPageLinks();
  });

  ipcMain.handle('webview:adjustZoom', (_event: any, delta: number = 0) => {
    if (!activeBrowserView) return DEFAULT_WEB_ZOOM;
    try {
      const current = activeBrowserView.webContents.getZoomFactor();
      const next = Math.max(0.75, Math.min(2.5, current + Number(delta || 0)));
      activeBrowserView.webContents.setZoomFactor(next);
      rememberZoomForCurrentPage(next);
      return next;
    } catch {
      return DEFAULT_WEB_ZOOM;
    }
  });

  ipcMain.handle('webview:toggleHighContrast', async (_event: any, forceState?: boolean) => {
    if (!activeBrowserView) return false;
    try {
      highContrastEnabled = typeof forceState === 'boolean' ? forceState : !highContrastEnabled;
      await activeBrowserView.webContents.executeJavaScript(buildHighContrastScript(highContrastEnabled));
      return highContrastEnabled;
    } catch (err) {
      console.error('webview:toggleHighContrast error:', err);
      return highContrastEnabled;
    }
  });

  // Inject visible gaze cursor into BrowserView so user can see where they're looking
  // Inject visible gaze cursor into BrowserView with AUTOMATIC DWELL CLICKING
  // Inject visible gaze cursor into BrowserView with AUTOMATIC DWELL CLICKING
  // v2: OPTIMIZED - cursor update is fire-and-forget, click check runs separately
  ipcMain.handle('webview:updateGaze', (_event: any, x: number, y: number, options?: { cursor?: boolean }) => {
    const view = activeBrowserView;
    const sessionId = activeBrowserViewSessionId;
    if (!view || view.webContents.isDestroyed()) return;
    try {
      const bounds = view.getBounds();
      const cursorEnabled = options?.cursor !== false;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
        view.webContents.executeJavaScript(
          BROWSER_CURSOR_HIDE_SCRIPT
        ).catch(() => { });
        resetEdgeScrollState();
        return;
      }

      // 1b. Edge-gaze auto-scrolling (throttled ~10Hz)
      // x,y are already BrowserView-local coordinates.
      const viewHeight = bounds.height;
      const deadZone = viewHeight * browserGazeConfig.edgeDeadZonePct;
      const topZone = viewHeight * browserGazeConfig.edgeZonePct;
      const bottomZone = viewHeight * (1 - browserGazeConfig.edgeZonePct);
      let direction: 'up' | 'down' | 'none' = 'none';
      let depth = 0;

      if (y > deadZone && y < topZone) {
        direction = 'up';
        depth = Math.max(0, Math.min(1, 1 - (y / topZone)));
      } else if (y > bottomZone && y < (viewHeight - deadZone)) {
        direction = 'down';
        depth = Math.max(0, Math.min(1, (y - bottomZone) / (viewHeight - bottomZone)));
      }

      const now = Date.now();
      if (!browserGazeConfig.edgeScrollEnabled || direction === 'none') {
        resetEdgeScrollState();
      } else if (direction !== edgeScrollCandidate) {
        edgeScrollCandidate = direction;
        edgeScrollEnteredAt = now;
        edgeScrollActiveDirection = 'none';
        edgeScrollStartedAt = 0;
        sendEdgeScrollState(direction);
      } else {
        sendEdgeScrollState(direction);
      }

      if (browserGazeConfig.edgeScrollEnabled && direction !== 'none' && edgeScrollEnteredAt > 0) {
        const edgeHoldElapsed = now - edgeScrollEnteredAt;
        if (edgeHoldElapsed >= browserGazeConfig.edgeHoldMs && edgeScrollActiveDirection === 'none') {
          edgeScrollActiveDirection = direction;
          edgeScrollStartedAt = now;
        }

        if (
          edgeScrollActiveDirection === direction &&
          now - edgeScrollStartedAt <= browserGazeConfig.edgeMaxBurstMs &&
          now - lastEdgeScrollAt >= browserGazeConfig.edgeThrottleMs
        ) {
          lastEdgeScrollAt = now;
          const delta = browserGazeConfig.edgeMinDeltaPx +
            (browserGazeConfig.edgeMaxDeltaPx - browserGazeConfig.edgeMinDeltaPx) * depth;
          const deltaY = Math.round(direction === 'up' ? delta : -delta);
          view.webContents.sendInputEvent({
            type: 'mouseWheel',
            x: Math.round(Math.max(10, Math.min(bounds.width - 10, x))),
            y: Math.round(Math.max(10, Math.min(bounds.height - 10, y))),
            deltaX: 0,
            deltaY,
          } as any);
        } else if (edgeScrollActiveDirection === direction && now - edgeScrollStartedAt > browserGazeConfig.edgeMaxBurstMs) {
          edgeScrollActiveDirection = 'none';
          edgeScrollStartedAt = 0;
          edgeScrollEnteredAt = now;
        }
      }

      browserDiagnostics.recordIpcTick();
      view.webContents.executeJavaScript(
        buildGazeUpdateAndPollScript(x, y, cursorEnabled)
      ).then((json: string | null) => {
        if (json && activeBrowserView === view && activeBrowserViewSessionId === sessionId && !view.webContents.isDestroyed()) {
          try {
            const clickReq = JSON.parse(json);
            const cx = Math.round(clickReq.x);
            const cy = Math.round(clickReq.y);
            browserDiagnostics.debug(
              'gaze-dwell-click',
              `[Main] Gaze dwell click ${clickReq.kind || 'unknown'} at (${cx}, ${cy})`,
              1000
            );
            sendTrustedBrowserClick(cx, cy, sessionId);
          } catch { /* ignore parse errors */ }
        }
      }).catch(() => { });
    } catch { /* ignore */ }
  });

  // Mouse Only Mode: renderer can query current state
  ipcMain.handle('mouse-only-mode:get', () => isMouseOnlyMode);
  ipcMain.handle('alert-mode:set', (_event: any, enabled: boolean) => {
    setAlertModeActive(Boolean(enabled));
    return isAlertModeActive;
  });
  // Lock state — renderer can query + set. Setting only takes effect when
  // Alert Mode is active (gated by setAlertModeLocked).
  ipcMain.handle('alert-mode-lock:get', () => isAlertModeLocked);
  ipcMain.handle('alert-mode-lock:set', (_event: any, enabled: boolean) => {
    setAlertModeLocked(Boolean(enabled));
    return isAlertModeLocked;
  });

  // Chat history — auto-save keyboard display text to chat_history/chat_YYYY-MM-DD.txt
  const chatHistoryDir = !app.isPackaged
    ? path.join(__dirname, '..', 'chat_history')
    : path.join(app.getPath('userData'), 'chat_history');

  if (!fs.existsSync(chatHistoryDir)) {
    fs.mkdirSync(chatHistoryDir, { recursive: true });
  }
  console.log(`Chat history: ${chatHistoryDir}`);

  let lastSaved = '';
  const KEYBOARD_CHAT_KEEP_FILES = 5;

  const pruneKeyboardChatLogs = () => {
    try {
      const files = fs.readdirSync(chatHistoryDir)
        .filter((name) => /^chat_.*\.txt$/i.test(name))
        .map((name) => ({
          name,
          fullPath: path.join(chatHistoryDir, name),
          mtimeMs: fs.statSync(path.join(chatHistoryDir, name)).mtimeMs,
        }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      for (const stale of files.slice(KEYBOARD_CHAT_KEEP_FILES)) {
        try {
          fs.unlinkSync(stale.fullPath);
        } catch {
          // Ignore transient file access conflicts.
        }
      }
    } catch {
      // Ignore prune failures; chat save should continue.
    }
  };

  ipcMain.handle('chat:save', async (_event: any, text: string) => {
    try {
      if (text === lastSaved) return { success: true };
      lastSaved = text;
      const dateStr = new Date().toISOString().slice(0, 10);
      const filePath = path.join(chatHistoryDir, `chat_${dateStr}.txt`);
      fs.writeFileSync(filePath, text, 'utf-8');
      pruneKeyboardChatLogs();
      return { success: true, path: filePath };
    } catch (err) {
      console.error('Failed to save chat:', err);
      return { success: false };
    }
  });
}

// ============================================
// SPLASH SCREEN
// ============================================

let splashStartTime = 0;
let mainWindowReady = false; // Track if main window content is painted and ready
const SPLASH_MIN_DURATION_MS = 10000;  // Keep welcome splash visible around 10s
const SPLASH_MAX_DURATION_MS = 25000;  // Safety fallback: force-close after 25 seconds

function maybeBeginSplashTransition(reason: string): void {
  if (splashTransitionStarted) return;
  if (!splashWindow || splashWindow.isDestroyed()) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindowReady || !rendererBootReady) return;
  splashTransitionStarted = true;
  console.log(`[Splash] Transition triggered by ${reason}`);
  transitionFromSplash();
}

function createSplashWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  splashTransitionStarted = false;
  mainWindowReady = false;
  rendererBootReady = false;

  // Splash should be full screen but NOT alwaysOnTop so user can alt-tab away
  splashWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: false,
    backgroundColor: '#0c1520',
    show: false,          // Don't show until HTML content is ready
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: false,   // Prevents locking the desktop
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.maximize();

  const splashPath = path.join(__dirname, '..', 'electron', 'splash.html');
  const prodSplashPath = path.join(__dirname, 'splash.html');
  const resolvedPath = fs.existsSync(splashPath) ? splashPath : prodSplashPath;

  console.log(`[Splash] Loading: ${resolvedPath}`);
  splashWindow.loadFile(resolvedPath);

  // Read saved userName from settings.json so splash can display it
  let savedUserName = 'Papa';
  try {
    const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsFilePath)) {
      const raw = fs.readFileSync(settingsFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed?.settings?.userName) {
        savedUserName = parsed.settings.userName;
      }
    }
  } catch {
    // Ignore — default to 'Papa'
  }

  // Only show splash once its HTML content has rendered — avoids blank screen flash
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.executeJavaScript(
        `document.getElementById('userName').textContent = ${JSON.stringify(savedUserName)};`
      ).catch(() => { /* ignore */ });
      splashWindow.show();
      splashWindow.focus();
      console.log(`[Splash] Content ready — showing with name: ${savedUserName}`);
    }
  });

  splashStartTime = Date.now();

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  // Safety fallback: force-close splash after max duration
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      console.log('[Splash] Max duration reached — force closing');
      closeSplashWindow();
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.setOpacity(1);
        mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }, SPLASH_MAX_DURATION_MS);
}

function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    try {
      splashWindow.close();
    } catch { /* ignore */ }
    splashWindow = null;
  }
}

function transitionFromSplash(): void {
  // Allow main window to paint in the background by showing it, but invisible
  // This completely solves Chromium background rendering pauses (black screens)
  if (mainWindow) {
    mainWindow.setOpacity(0);
    mainWindow.maximize();
    mainWindow.showInactive();
  }

  // Ensure splash stays visually on top of main window within the app's Z-order
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.moveTop();
    splashWindow.focus();
  }

  const elapsed = Date.now() - splashStartTime;
  const remaining = Math.max(0, SPLASH_MIN_DURATION_MS - elapsed);

  console.log(`[Splash] Elapsed: ${elapsed}ms, waiting ${remaining}ms more before transition`);

  // Wait for minimum splash duration (10s) while user can use other desktop apps
  setTimeout(() => {
    // Reveal fully rendered main window instantly (no black flash)
    if (mainWindow) mainWindow.setOpacity(1);

    // Trigger fade-out animation in splash HTML
    if (splashWindow && !splashWindow.isDestroyed()) {
      try {
        splashWindow.webContents.executeJavaScript('window.startFadeOut && window.startFadeOut()');
      } catch { /* ignore */ }
    }

    // After fade-out animation completes (~900ms), focus main and close splash
    setTimeout(() => {
      mainWindow?.focus();

      // Brief delay before closing splash so there's no flash
      setTimeout(() => {
        closeSplashWindow();
      }, 300);
    }, 950);
  }, remaining);
}

// ============================================
// APP LIFECYCLE
// ============================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    console.log('GazeConnect Pro starting...');

    // 0. Show splash screen IMMEDIATELY
    createSplashWindow();

    // 1. Start Tobii Helper first (needs time to init TCP server)
    startTobiiHelper();

    // 2. Start Python backend (Floorplan server starts lazily on demand).
    startPythonBackend();

    // 3. Create window immediately; WebSocket reconnect handles backend warm-up.
    createWindow();
    setupIpcHandlers();
    // Tray is non-critical — don't let it block window creation
    try { createTray(); } catch (err) { console.warn('Tray creation failed:', err); }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    stopPythonBackend();
    stopFloorplanServer();
    stopTobiiHelper();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopPythonBackend();
  stopFloorplanServer();
  stopTobiiHelper();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
