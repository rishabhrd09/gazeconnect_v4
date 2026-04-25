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
let isRefinementMapEnabled = true;

// Dynamic App State for Features
let currentAppScreen = 'home';
let isAppNavHidden = false;
let isUiLocked = false;

let activeBrowserView: BrowserView | null = null; // Gaze-controlled BrowserView
let lastNavState: { canGoBack: boolean; canGoForward: boolean; url: string } | null = null;
const domainZoomPrefs = new Map<string, number>();
const DEFAULT_WEB_ZOOM = 1.35;
let lastEdgeScrollAt = 0;
let lastEdgeScrollDirection: 'up' | 'down' | 'none' = 'none';
let highContrastEnabled = false;
let rendererBootReady = false;
let splashTransitionStarted = false;

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
    console.log(`[Main] Nav state changed: back=${nextState.canGoBack}, fwd=${nextState.canGoForward}`);
    mainWindow.webContents.send('webview:navigation-state', {
      canGoBack: nextState.canGoBack,
      canGoForward: nextState.canGoForward,
    });
  } catch (err) {
    console.error('Failed to send navigation state:', err);
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alert-mode-changed', isAlertModeActive);
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
    console.log(`[Main] webview:open called for: ${url}`);
    if (!mainWindow) return { success: false };
    try {
      // Destroy existing view if any
      if (activeBrowserView) {
        mainWindow.removeBrowserView(activeBrowserView);
        (activeBrowserView.webContents as any).destroy?.();
        activeBrowserView = null;
      }
      lastNavState = null;
      lastEdgeScrollAt = 0;
      sendEdgeScrollState('none');
      mainWindow.webContents.send('webview:links', { links: [] });
      highContrastEnabled = false;

      activeBrowserView = new BrowserView({
        webPreferences: {
          contextIsolation: true, // Must be true for security
          nodeIntegration: false,
          sandbox: true,          // Sandbox for safety
        },
      });

      mainWindow.addBrowserView(activeBrowserView);
      activeBrowserView.setBounds(bounds);
      activeBrowserView.setAutoResize({ width: true, height: true });

      // OPTIMIZATION: Inject the gaze cursor script ONCE when the DOM is ready
      activeBrowserView.webContents.on('dom-ready', () => {
        console.log(`[Main] dom-ready for: ${activeBrowserView?.webContents.getURL()}`);
        applyAacBrowsingMode();
        activeBrowserView?.webContents.insertCSS(`
          #gazeconnect-cursor {
            position: fixed; width: 52px; height: 52px; border-radius: 50%;
            border: 4px solid #2DD4BF; background: rgba(45,212,191,0.18);
            pointer-events: none; z-index: 2147483647;
            transform: translate(-50%, -50%);
            transition: left 80ms linear, top 80ms linear, border-color 200ms, background-color 200ms, transform 150ms;
            box-shadow: 0 0 20px rgba(45,212,191,0.5);
            display: none; /* Hidden until valid coordinates received */
          }
          #gazeconnect-cursor.dwelling {
            border-color: #FACC15; background: rgba(250,204,21,0.25);
            transform: translate(-50%, -50%) scale(1.1);
          }
          #gazeconnect-cursor.clicking {
            border-color: #22C55E; background: rgba(34,197,94,0.4);
            transform: translate(-50%, -50%) scale(0.9);
            box-shadow: 0 0 40px rgba(34,197,94,0.8);
          }
        `).then(() => console.log('[Main] Cursor CSS injected')).catch((e) => console.error('[Main] CSS injection failed:', e));

        activeBrowserView?.webContents.executeJavaScript(`
          if (!window.gcUpdate) {
            window.gcState = { x: 0, y: 0, start: 0, clicked: false };
            let gc = document.createElement('div');
            gc.id = 'gazeconnect-cursor';
            document.body.appendChild(gc);
            
            window.gcUpdate = (x, y) => {
              if (!gc) return;
              gc.style.display = 'block';
              gc.style.left = x + 'px';
              gc.style.top = y + 'px';
              
              // DWELL LOGIC (Client-side lightweight)
              const now = Date.now();
              const dist = Math.hypot(x - window.gcState.x, y - window.gcState.y);
              
              if (dist < 50) { // Stable?
                const elapsed = now - window.gcState.start;
                const dwellMs = 1000; // BrowserView dwell is intentionally longer than app buttons
                if (elapsed > 250 && !window.gcState.clicked) gc.classList.add('dwelling');
                if (elapsed > dwellMs && !window.gcState.clicked) {
                   // Click!
                   const el = document.elementFromPoint(x, y);
                   let clickable = null;
                   if (el) {
                       // 1. Check standard interactive elements
                       clickable = el.closest('a, button, input, textarea, [role="button"], [onclick], select, [tabindex], label');
                       
                       // 2. If not found, check computed style for cursor: pointer
                       if (!clickable) {
                           const style = window.getComputedStyle(el);
                           if (style.cursor === 'pointer') clickable = el;
                       }
                   }

                   if (clickable) {
                      window.gcState.clicked = true;
                      gc.classList.remove('dwelling');
                      gc.classList.add('clicking');
                      // Signal main process to perform a TRUSTED click via sendInputEvent
                      // (synthetic .click() doesn't update Chromium history properly)
                      window.gcClickRequest = { x: x, y: y };
                      clickable.focus();
                      setTimeout(() => {
                        gc.classList.remove('clicking');
                        window.gcState.clicked = false;
                        window.gcState.start = Date.now();
                      }, 600);
                   } else if (elapsed > 2000) {
                      window.gcState.start = now; // Reset if just reading
                   }
                }
              } else {
                // Moved
                window.gcState.x = x;
                window.gcState.y = y;
                window.gcState.start = now;
                window.gcState.clicked = false;
                gc.classList.remove('dwelling');
                gc.classList.remove('clicking');
              }
            };
            console.log("GC: Script injected");
          }
        `).then(() => console.log('[Main] Cursor JS injected')).catch((e) => console.error('[Main] JS injection failed:', e));

        // Also send state on load finish
        sendBrowserNavState(true);
        extractAndSendPageLinks();
      });

      // FIX: Single Window Enforcer
      // Intercept 'new-window' requests and load them in the SAME view
      activeBrowserView.webContents.setWindowOpenHandler(({ url }) => {
        console.log(`[BrowserView] Intercepted new window: ${url}`);
        activeBrowserView?.webContents.loadURL(url).finally(() => {
          applyAacBrowsingMode();
          sendBrowserNavState(true);
          extractAndSendPageLinks();
        });
        return { action: 'deny' };
      });

      await activeBrowserView.webContents.loadURL(url);



      activeBrowserView.webContents.on('did-navigate', (e, url) => {
        console.log(`[Main] did-navigate: ${url}`);
        applyAacBrowsingMode();
        sendBrowserNavState(true);
        extractAndSendPageLinks();
      });
      activeBrowserView.webContents.on('did-navigate-in-page', (e, url) => {
        console.log(`[Main] did-navigate-in-page: ${url}`);
        applyAacBrowsingMode();
        sendBrowserNavState(true);
        extractAndSendPageLinks();
      });
      // Also check when loading stops (often settles history state)
      activeBrowserView.webContents.on('did-stop-loading', () => {
        sendBrowserNavState(true);
        extractAndSendPageLinks();
      });

      // POLLING: Safety net in case navigation events are missed (every 1s)
      const pollInterval = setInterval(() => {
        if (!activeBrowserView || !mainWindow) {
          clearInterval(pollInterval);
          return;
        }
        sendBrowserNavState(false);
      }, 1000);

      // Attach interval ID to view so we can clear it if needed
      (activeBrowserView as any)._navPoll = pollInterval;

      sendBrowserNavState(true); // Initial state

      return { success: true, url };
    } catch (err: any) {
      console.error('webview:open failed:', err?.message);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('webview:close', () => {
    if (!mainWindow || !activeBrowserView) return;
    try {
      // Clear polling
      if ((activeBrowserView as any)._navPoll) {
        clearInterval((activeBrowserView as any)._navPoll);
      }

      mainWindow.removeBrowserView(activeBrowserView);
      // Clean up cleanly
      (activeBrowserView.webContents as any).destroy?.();
    } catch { /* ignore */ }
    activeBrowserView = null;
    lastNavState = null;
    lastEdgeScrollAt = 0;
    sendEdgeScrollState('none');
    mainWindow.webContents.send('webview:links', { links: [] });
    highContrastEnabled = false;
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
  ipcMain.handle('webview:updateGaze', (_event: any, x: number, y: number) => {
    if (!activeBrowserView) return;
    try {
      // 1. Fire-and-forget: update the gaze cursor position (must not fail)
      activeBrowserView.webContents.executeJavaScript(
        `if (window.gcUpdate) window.gcUpdate(${x}, ${y});`
      ).catch(() => { });

      // 1b. Edge-gaze auto-scrolling (throttled ~10Hz)
      // x,y are already BrowserView-local coordinates.
      const bounds = activeBrowserView.getBounds();
      const viewHeight = bounds.height;
      const deadZone = viewHeight * 0.02;      // top/bottom 2% ignored
      const topZone = viewHeight * 0.12;       // top 12% scroll up
      const bottomZone = viewHeight * 0.88;    // bottom 12% scroll down
      let direction: 'up' | 'down' | 'none' = 'none';
      let speed = 0;

      if (y > deadZone && y < topZone) {
        direction = 'up';
        speed = Math.max(1, Math.round(3 * (1 - (y / topZone))));
      } else if (y > bottomZone && y < (viewHeight - deadZone)) {
        direction = 'down';
        speed = Math.max(1, Math.round(3 * ((y - bottomZone) / (viewHeight - bottomZone))));
      }

      sendEdgeScrollState(direction);

      if (direction !== 'none') {
        const now = Date.now();
        if (now - lastEdgeScrollAt >= 100) {
          lastEdgeScrollAt = now;
          const delta = Math.max(60, speed * 90);
          const deltaY = direction === 'up' ? delta : -delta;
          activeBrowserView.webContents.sendInputEvent({
            type: 'mouseWheel',
            x: Math.round(Math.max(10, Math.min(bounds.width - 10, x))),
            y: Math.round(Math.max(10, Math.min(bounds.height - 10, y))),
            deltaX: 0,
            deltaY,
          } as any);
        }
      }

      // 2. Separate check: did the injected script request a trusted click?
      //    Returns a JSON string (always serializable) or "null"
      activeBrowserView.webContents.executeJavaScript(`
        (function() {
          var r = window.gcClickRequest;
          window.gcClickRequest = null;
          return r ? JSON.stringify(r) : null;
        })();
      `).then((json: string | null) => {
        if (json && activeBrowserView) {
          try {
            const clickReq = JSON.parse(json);
            const cx = Math.round(clickReq.x);
            const cy = Math.round(clickReq.y);
            console.log(`[Main] Gaze dwell click at (${cx}, ${cy}) — using trusted sendInputEvent`);
            activeBrowserView.webContents.sendInputEvent({ type: 'mouseMove', x: cx, y: cy } as any);
            setTimeout(() => {
              activeBrowserView?.webContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 } as any);
              setTimeout(() => {
                activeBrowserView?.webContents.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 } as any);
                setTimeout(() => sendBrowserNavState(true), 350);
              }, 60);
            }, 30);
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
