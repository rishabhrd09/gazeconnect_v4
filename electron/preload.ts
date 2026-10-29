/**
 * GazeConnect Pro - Electron Preload Script
 * =========================================
 * Exposes safe APIs to the renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';

const validEventChannels = [
  'gaze-data',
  'dwell-event',
  'mouse-only-mode-changed',
  'focus-mode-changed',
  'alert-mode-changed',
  'alert-mode-lock-changed',
  'webview:navigation-state',
  'webview:links',
  'webview:edge-scroll',
  'webview:closed',
  'webview:playbackState',
  'webview:notice',
  'ui-lock-toggled',
] as const;

const listenerMap = new Map<string, Map<(...args: any[]) => void, (...args: any[]) => void>>();

function isValidChannel(channel: string): boolean {
  return (validEventChannels as readonly string[]).includes(channel);
}

// A covered window, a dark screen or a locked one hides the interface, and Chromium then runs its
// timers as seldom as once a minute: a late heartbeat is not a stall if the interface was hidden at
// any moment since the last one, even if it is visible again when the beat is sent.
let hiddenSinceBeat = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') hiddenSinceBeat = true;
});

// ============================================
// EXPOSED API
// ============================================

const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    fullscreen: (enabled?: boolean) => ipcRenderer.invoke('window:fullscreen', enabled),
    isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  },

  // Screen info
  screen: {
    getInfo: () => ipcRenderer.invoke('screen:getInfo'),
  },

  // Window bounds for gaze coordinate mapping
  getWindowBounds: () => ipcRenderer.invoke('window:getBounds'),

  // Stream app context for dynamic right-click menus
  updateAppContext: (context: { screen: string, isNavHidden: boolean }) =>
    ipcRenderer.invoke('app:updateContext', context),

  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPaths: () => ipcRenderer.invoke('app:getPaths'),
    rendererReady: () => ipcRenderer.invoke('app:renderer-ready'),
  },

  // The interface's heartbeat for the health log (electron/healthRecorder.ts): one-way, a number
  // and whether the interface stayed visible since the last beat (read here, not by the caller).
  health: {
    beat: (frameLagMs: number) => {
      const visible = document.visibilityState === 'visible' && !hiddenSinceBeat;
      hiddenSinceBeat = document.visibilityState !== 'visible';
      ipcRenderer.send('health:beat', Number(frameLagMs) || 0, visible);
    },
  },

  // Feature switches read once at start. GAZECONNECT_COMPASS_V2=0 returns the Compass map to the
  // earlier studio (no Refine) without touching saved drafts (docs/compass-refine/IMPLEMENTATION_PLAN.md §10).
  features: {
    compassV2: (() => { try { return process.env.GAZECONNECT_COMPASS_V2 !== '0'; } catch { return true; } })(),
  },

  floorplan: {
    ensureServer: () => ipcRenderer.invoke('floorplan:ensure-server'),
    request: (input: { endpoint: string; body?: string }) => ipcRenderer.invoke('floorplan:request', input),
    // Gaze-safe download: the app names the file and writes it to Documents\GazeConnect Plans\<date>.
    save: (input: { endpoint: string; body: string; fileName: string }) => ipcRenderer.invoke('floorplan:save', input),
    // Memory for the heavier views; with `outside: true` it is the check made when the person chooses Outside.
    resources: (request?: { width?: number; height?: number; outside?: boolean }) => ipcRenderer.invoke('floorplan:resources', request),
  },

  // Settings persistence
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  },

  // Customization data persistence
  customization: {
    load: () => ipcRenderer.invoke('customization:load'),
    save: (data: string) => ipcRenderer.invoke('customization:save', data),
    export: (data: string) => ipcRenderer.invoke('customization:export', data),
    import: () => ipcRenderer.invoke('customization:import'),
  },

  // The music library (electron/music): its playlists, and the changes Settings > Music makes.
  // Every call answers with the whole library again; songs play from gcmusic://songs/<file>.
  music: {
    list: () => ipcRenderer.invoke('music:list'),
    addFiles: (playlistId: string) => ipcRenderer.invoke('music:add-files', playlistId),
    addFolder: () => ipcRenderer.invoke('music:add-folder'),
    createPlaylist: (title: string) => ipcRenderer.invoke('music:create-playlist', title),
    renamePlaylist: (id: string, title: string) => ipcRenderer.invoke('music:rename-playlist', id, title),
    movePlaylist: (id: string, delta: number) => ipcRenderer.invoke('music:move-playlist', id, delta),
    removePlaylist: (id: string) => ipcRenderer.invoke('music:remove-playlist', id),
    renameSong: (songId: string, title: string) => ipcRenderer.invoke('music:rename-song', songId, title),
    moveSong: (songId: string, delta: number) => ipcRenderer.invoke('music:move-song', songId, delta),
    setSongPlaylist: (songId: string, playlistId: string) => ipcRenderer.invoke('music:set-song-playlist', songId, playlistId),
    removeSong: (songId: string) => ipcRenderer.invoke('music:remove-song', songId),
    openFolder: () => ipcRenderer.invoke('music:open-folder'),
  },

  // Mouse Only Mode
  mouseOnlyMode: {
    get: () => ipcRenderer.invoke('mouse-only-mode:get'),
  },

  alertMode: {
    set: (enabled: boolean) => ipcRenderer.invoke('alert-mode:set', enabled),
  },

  // Alert Mode Lock — when ON, the Home button on AlertModeScreen is
  // disabled so the patient can't exit. Only the caregiver can toggle via
  // the right-click context menu. Lock auto-clears when Alert Mode is
  // disabled (handled in main process).
  alertModeLock: {
    get: () => ipcRenderer.invoke('alert-mode-lock:get'),
    set: (enabled: boolean) => ipcRenderer.invoke('alert-mode-lock:set', enabled),
  },

  // Gaze-controlled BrowserView for web browsing
  webview: {
    open: (url: string, bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('webview:open', url, bounds),
    close: () => ipcRenderer.invoke('webview:close'),
    scroll: (deltaY: number) => ipcRenderer.invoke('webview:scroll', deltaY),
    // Up / Down / Top chosen by the page (main.ts 'webview:scrollPage').
    scrollPage: (direction: 'up' | 'down' | 'top') => ipcRenderer.invoke('webview:scrollPage', direction),
    // Take the page off the window while an app screen (the search keyboard) is shown.
    setVisible: (visible: boolean) => ipcRenderer.invoke('webview:setVisible', visible),
    back: () => ipcRenderer.invoke('webview:back'),
    forward: () => ipcRenderer.invoke('webview:forward'),
    youtubeCommand: (command: string) => ipcRenderer.invoke('webview:youtubeCommand', command),
    setGazeConfig: (config: Record<string, number | boolean>) =>
      ipcRenderer.invoke('webview:setGazeConfig', config),
    setScrollMode: (enabled: boolean) =>
      ipcRenderer.invoke('webview:setScrollMode', enabled),
    getDiagnostics: () => ipcRenderer.invoke('webview:getDiagnostics'),
    resetBrowserSession: (reason: string) =>
      ipcRenderer.invoke('webview:resetBrowserSession', reason),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('webview:setBounds', bounds),
    // v17.19: one-way send (was invoke) — this fires per gaze frame
    // (~33Hz); the handler returns nothing, so the invoke reply message
    // was pure per-frame overhead on the main-process loop.
    updateGaze: (x: number, y: number, options?: { cursor?: boolean; emittedAtWallMs?: number }) => {
      ipcRenderer.send('webview:updateGaze', x, y, {
        ...options,
        emittedAtWallMs: options?.emittedAtWallMs ?? Date.now(),
      });
      return Promise.resolve();
    },
    navigate: (url: string) => ipcRenderer.invoke('webview:navigate', url),
    refreshLinks: () => ipcRenderer.invoke('webview:refreshLinks'),
    adjustZoom: (delta: number) => ipcRenderer.invoke('webview:adjustZoom', delta),
    toggleHighContrast: (forceState?: boolean) => ipcRenderer.invoke('webview:toggleHighContrast', forceState),
  },

  // Chat history — saves keyboard display text to chat_history/chat_YYYY-MM-DD.txt
  saveSessionText: (text: string) => ipcRenderer.invoke('chat:save', text),

  // Event listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (!isValidChannel(channel)) return;
    const wrapped = (_event: any, ...args: any[]) => callback(...args);
    let byCallback = listenerMap.get(channel);
    if (!byCallback) {
      byCallback = new Map();
      listenerMap.set(channel, byCallback);
    }
    const existing = byCallback.get(callback);
    if (existing) {
      ipcRenderer.removeListener(channel, existing);
    }
    byCallback.set(callback, wrapped);
    ipcRenderer.on(channel, wrapped);
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    if (!isValidChannel(channel)) return;
    const byCallback = listenerMap.get(channel);
    const wrapped = byCallback?.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener(channel, wrapped);
    byCallback?.delete(callback);
    if (byCallback && byCallback.size === 0) {
      listenerMap.delete(channel);
    }
  },

  // Platform info
  platform: process.platform,
};

// ============================================
// EXPOSE TO RENDERER
// ============================================

contextBridge.exposeInMainWorld('electronAPI', api);

// TypeScript type declaration
declare global {
  interface Window {
    electronAPI: typeof api;
  }
}
