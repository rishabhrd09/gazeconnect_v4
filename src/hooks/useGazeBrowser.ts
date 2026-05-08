/**
 * useGazeBrowser — React hook for gaze-controlled BrowserView
 *
 * Wraps Electron IPC calls to manage a BrowserView that can receive
 * click, scroll, and keyboard events from gaze coordinates.
 * Now includes gaze cursor injection into BrowserView pages.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface BrowserViewBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

type PageLink = { text: string; href: string };
type EdgeScrollDirection = 'up' | 'down' | 'none';
type ScrollMode = 'off' | 'armed';
type YoutubeCommand = 'play' | 'play_pause' | 'next' | 'skip_ad' | 'show_controls' | 'hide_controls' | 'get_state';
type YoutubeCommandResult = {
    ok?: boolean;
    status?: 'done' | 'waiting_for_skip' | 'no_ad' | 'no_next' | 'buffering' | 'stalled' | 'failed' | string;
    detail?: string;
    youtubeState?: string;
};
type BrowserDiagnostics = {
    url: string;
    isOpen: boolean;
    browserViewAlive: boolean;
    youtubeState?: string;
    lastCommand?: string;
    lastCommandStatus?: string;
    openCount: number;
    memoryMb?: number;
    ipcPerSecond?: number;
};
type BrowserGazeConfig = {
    dwellMs?: number;
    onsetMs?: number;
    stabilityRadiusPx?: number;
    postClickCooldownMs?: number;
    edgeScrollEnabled?: boolean;
    edgeHoldMs?: number;
    edgeZonePct?: number;
    edgeDeadZonePct?: number;
    edgeMinDeltaPx?: number;
    edgeMaxDeltaPx?: number;
    edgeThrottleMs?: number;
    edgeMaxBurstMs?: number;
};

const getElectronAPI = () => (window as any).electronAPI;

export function useGazeBrowser() {
    const [isOpen, setIsOpen] = useState(false);
    const [currentUrl, setCurrentUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [zoomFactor, setZoomFactor] = useState(1.35);
    const [highContrast, setHighContrast] = useState(false);
    const [pageLinks, setPageLinks] = useState<PageLink[]>([]);
    const [edgeScrollDirection, setEdgeScrollDirection] = useState<EdgeScrollDirection>('none');
    const [scrollMode, setScrollModeState] = useState<ScrollMode>('off');
    const boundsRef = useRef<BrowserViewBounds | null>(null);
    const cursorInsideRef = useRef(false);

    // Navigation state listener
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = (state: { canGoBack: boolean; canGoForward: boolean; url?: string }) => {
            setCanGoBack(state.canGoBack);
            setCanGoForward(state.canGoForward);
            if (typeof state.url === 'string') setCurrentUrl(state.url);
        };
        api.on('webview:navigation-state', handler);
        return () => api.off('webview:navigation-state', handler);
    }, []);

    // Extracted page links listener
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = (payload: { links?: PageLink[] }) => {
            setPageLinks(Array.isArray(payload?.links) ? payload.links : []);
        };
        api.on('webview:links', handler);
        return () => api.off('webview:links', handler);
    }, []);

    // Edge-scroll activity listener (for subtle overlay hints)
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = (payload: { direction?: EdgeScrollDirection }) => {
            const dir = payload?.direction;
            setEdgeScrollDirection(dir === 'up' || dir === 'down' ? dir : 'none');
        };
        api.on('webview:edge-scroll', handler);
        return () => api.off('webview:edge-scroll', handler);
    }, []);

    // Native BrowserView can be closed by Electron-side safety paths
    // (reset, unresponsive renderer, render-process-gone). Mirror that state
    // immediately so React never leaves a stale page floating over the app.
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = () => {
            setIsOpen(false);
            setCurrentUrl(null);
            setPageLinks([]);
            setEdgeScrollDirection('none');
            setScrollModeState('off');
            setHighContrast(false);
            boundsRef.current = null;
            cursorInsideRef.current = false;
        };
        api.on('webview:closed', handler);
        return () => api.off('webview:closed', handler);
    }, []);

    const openPage = useCallback(async (url: string, bounds: BrowserViewBounds) => {
        const api = getElectronAPI();
        if (!api?.webview) {
            console.warn('useGazeBrowser: electronAPI.webview not available (running in browser?)');
            return false;
        }
        setLoading(true);
        boundsRef.current = bounds;
        try {
            const result = await api.webview.open(url, bounds);
            if (result?.success) {
                setIsOpen(true);
                setCurrentUrl(url);
                setPageLinks([]);
                setHighContrast(false);
                setZoomFactor(1.35);
                setLoading(false);
                return true;
            }
        } catch (err) {
            console.error('useGazeBrowser openPage error:', err);
        }
        setLoading(false);
        return false;
    }, []);

    const closePage = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        try {
            await api.webview.close();
        } catch { /* ignore */ }
        setIsOpen(false);
        setCurrentUrl(null);
        setPageLinks([]);
        setEdgeScrollDirection('none');
        setScrollModeState('off');
        setHighContrast(false);
        boundsRef.current = null;
        cursorInsideRef.current = false;
    }, []);

    const clickAtGaze = useCallback(async (clientX: number, clientY: number) => {
        const api = getElectronAPI();
        if (!api?.webview || !boundsRef.current) return;
        // Convert page coordinates to BrowserView-local coordinates
        const b = boundsRef.current;
        const localX = Math.round(clientX - b.x);
        const localY = Math.round(clientY - b.y);
        if (localX < 0 || localY < 0 || localX > b.width || localY > b.height) return;
        try {
            await api.webview.click(localX, localY);
        } catch (err) {
            console.error('clickAtGaze error:', err);
        }
    }, []);

    const clickAtViewPoint = useCallback(async (localX: number, localY: number) => {
        const api = getElectronAPI();
        if (!api?.webview?.click) return;
        try {
            await api.webview.click(Math.round(localX), Math.round(localY));
        } catch (err) {
            console.error('clickAtViewPoint error:', err);
        }
    }, []);

    const scrollDown = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        await api.webview.scroll(-300); // negative = scroll down in Chromium
    }, []);

    const scrollUp = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        await api.webview.scroll(300); // positive = scroll up
    }, []);

    const goBack = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        await api.webview.back();
    }, []);

    const goForward = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        await api.webview.forward();
    }, []);

    const navigateTo = useCallback(async (url: string) => {
        const api = getElectronAPI();
        if (!api?.webview?.navigate || !url) return false;
        try {
            const result = await api.webview.navigate(url);
            if (result?.success) {
                setCurrentUrl(url);
                return true;
            }
        } catch (err) {
            console.error('navigateTo error:', err);
        }
        return false;
    }, []);

    const refreshLinks = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview?.refreshLinks) return;
        await api.webview.refreshLinks();
    }, []);

    const adjustZoom = useCallback(async (delta: number) => {
        const api = getElectronAPI();
        if (!api?.webview?.adjustZoom) return zoomFactor;
        try {
            const next = await api.webview.adjustZoom(delta);
            if (typeof next === 'number') {
                setZoomFactor(next);
                return next;
            }
        } catch (err) {
            console.error('adjustZoom error:', err);
        }
        return zoomFactor;
    }, [zoomFactor]);

    const toggleHighContrast = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview?.toggleHighContrast) return highContrast;
        try {
            const next = await api.webview.toggleHighContrast();
            setHighContrast(!!next);
            return !!next;
        } catch (err) {
            console.error('toggleHighContrast error:', err);
            return highContrast;
        }
    }, [highContrast]);

    const typeText = useCallback(async (text: string) => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        await api.webview.type(text);
    }, []);

    // Execute JS in the BrowserView with user-gesture context. Used by the
    // AAC toolbar to reliably click YouTube's fullscreen / skip-ad buttons —
    // keyboard shortcuts ('f', 'l') don't work without focus + user gesture,
    // but executeJavaScript with userGesture=true does.
    const executeJs = useCallback(async (code: string) => {
        const api = getElectronAPI();
        if (!api?.webview?.executeJs) return { success: false };
        try {
            return await api.webview.executeJs(code);
        } catch (err: any) {
            console.error('executeJs error:', err?.message || err);
            return { success: false, error: err?.message || String(err) };
        }
    }, []);

    const youtubeCommand = useCallback(async (command: YoutubeCommand): Promise<YoutubeCommandResult> => {
        const api = getElectronAPI();
        if (!api?.webview?.youtubeCommand) return { ok: false, status: 'failed', detail: 'ipc_unavailable' };
        try {
            return await api.webview.youtubeCommand(command);
        } catch (err: any) {
            console.error('youtubeCommand error:', err?.message || err);
            return { ok: false, status: 'failed', detail: err?.message || String(err) };
        }
    }, []);

    const setGazeConfig = useCallback(async (config: BrowserGazeConfig) => {
        const api = getElectronAPI();
        if (!api?.webview?.setGazeConfig) return;
        try {
            await api.webview.setGazeConfig(config);
        } catch (err) {
            console.error('setGazeConfig error:', err);
        }
    }, []);

    const setScrollMode = useCallback(async (mode: ScrollMode) => {
        const api = getElectronAPI();
        const enabled = mode === 'armed';
        setScrollModeState(mode);
        if (!api?.webview?.setScrollMode) return;
        try {
            await api.webview.setScrollMode(enabled);
        } catch (err) {
            console.error('setScrollMode error:', err);
            setScrollModeState('off');
        }
    }, []);

    const getDiagnostics = useCallback(async (): Promise<BrowserDiagnostics | null> => {
        const api = getElectronAPI();
        if (!api?.webview?.getDiagnostics) return null;
        try {
            return await api.webview.getDiagnostics();
        } catch (err) {
            console.error('getDiagnostics error:', err);
            return null;
        }
    }, []);

    const resetBrowserSession = useCallback(async (reason: string) => {
        const api = getElectronAPI();
        if (!api?.webview?.resetBrowserSession) {
            await closePage();
            return;
        }
        try {
            await api.webview.resetBrowserSession(reason);
        } catch (err) {
            console.error('resetBrowserSession error:', err);
        }
        setIsOpen(false);
        setCurrentUrl(null);
        setPageLinks([]);
        setEdgeScrollDirection('none');
        setScrollModeState('off');
        setHighContrast(false);
        boundsRef.current = null;
        cursorInsideRef.current = false;
    }, [closePage]);

    const updateBounds = useCallback(async (bounds: BrowserViewBounds) => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        boundsRef.current = bounds;
        await api.webview.setBounds(bounds);
    }, []);

    const hideGazeCursor = useCallback(async () => {
        const api = getElectronAPI();
        if (!api?.webview?.updateGaze) return;
        cursorInsideRef.current = false;
        try {
            await api.webview.updateGaze(-1, -1);
        } catch { /* ignore - may fail if page navigating */ }
    }, []);

    // Send gaze position to BrowserView to show a visible cursor inside web content
    const updateGazeCursor = useCallback(async (clientX: number, clientY: number, options?: { cursor?: boolean }) => {
        const api = getElectronAPI();
        if (!api?.webview?.updateGaze || !boundsRef.current) return;
        const b = boundsRef.current;
        const localX = Math.round(clientX - b.x);
        const localY = Math.round(clientY - b.y);
        const safeInsetPx = 18;
        // Only update if gaze is within BrowserView bounds.
        // Hide when gaze returns to app chrome so the page cursor cannot go stale.
        if (localX >= safeInsetPx && localY >= 0 && localX <= b.width - safeInsetPx && localY <= b.height) {
            cursorInsideRef.current = true;
            try {
                await api.webview.updateGaze(localX, localY, options);
            } catch { /* ignore — may fail if page navigating */ }
        } else if (cursorInsideRef.current) {
            await hideGazeCursor();
        }
    }, [hideGazeCursor]);

    return {
        isOpen,
        currentUrl,
        loading,
        boundsRef,
        openPage,
        closePage,
        clickAtGaze,
        clickAtViewPoint,
        scrollDown,
        scrollUp,
        goBack,
        goForward,
        navigateTo,
        refreshLinks,
        adjustZoom,
        toggleHighContrast,
        typeText,
        executeJs,
        youtubeCommand,
        setGazeConfig,
        setScrollMode,
        getDiagnostics,
        resetBrowserSession,
        updateBounds,
        hideGazeCursor,
        updateGazeCursor,
        canGoBack,
        canGoForward,
        zoomFactor,
        highContrast,
        pageLinks,
        edgeScrollDirection,
        scrollMode,
    };
}
