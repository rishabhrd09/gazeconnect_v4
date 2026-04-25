/**
 * GazeConnect Pro - Electron Preload Script
 * =========================================
 * Exposes safe APIs to the renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';

const validEventChannels = [
  'emergency-triggered',
  'gaze-data',
  'dwell-event',
  'mouse-only-mode-changed',
  'focus-mode-changed',
  'alert-mode-changed',
  'refinement-map-changed',
  'webview:navigation-state',
  'webview:links',
  'webview:edge-scroll',
  'ui-lock-toggled',
] as const;

const listenerMap = new Map<string, Map<(...args: any[]) => void, (...args: any[]) => void>>();

function isValidChannel(channel: string): boolean {
  return (validEventChannels as readonly string[]).includes(channel);
}

// ============================================
// EXPOSED API
// ============================================

const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    fullscreen: () => ipcRenderer.invoke('window:fullscreen'),
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

  floorplan: {
    ensureServer: () => ipcRenderer.invoke('floorplan:ensure-server'),
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

  // Mouse Only Mode
  mouseOnlyMode: {
    get: () => ipcRenderer.invoke('mouse-only-mode:get'),
  },

  alertMode: {
    set: (enabled: boolean) => ipcRenderer.invoke('alert-mode:set', enabled),
  },

  // Gaze-controlled BrowserView for web browsing
  webview: {
    open: (url: string, bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('webview:open', url, bounds),
    close: () => ipcRenderer.invoke('webview:close'),
    click: (x: number, y: number) => ipcRenderer.invoke('webview:click', x, y),
    scroll: (deltaY: number) => ipcRenderer.invoke('webview:scroll', deltaY),
    back: () => ipcRenderer.invoke('webview:back'),
    forward: () => ipcRenderer.invoke('webview:forward'),
    type: (text: string) => ipcRenderer.invoke('webview:type', text),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('webview:setBounds', bounds),
    updateGaze: (x: number, y: number) =>
      ipcRenderer.invoke('webview:updateGaze', x, y),
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
