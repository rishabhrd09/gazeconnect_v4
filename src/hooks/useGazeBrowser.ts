/**
 * useGazeBrowser — React hook for gaze-controlled BrowserView
 *
 * Wraps Electron IPC calls to manage a BrowserView that can receive
 * click, scroll, and keyboard events from gaze coordinates.
 * Now includes gaze cursor injection into BrowserView pages.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { BrowserGazeOptions } from '../../electron/browser/browserGazeGate';

interface BrowserViewBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

type PageLink = { text: string; href: string };
type EdgeScrollDirection = 'up' | 'down' | 'none';
type ScrollMode = 'off' | 'armed';
type YoutubeCommand = 'play' | 'play_pause' | 'next' | 'skip_ad' | 'show_controls' | 'hide_controls' | 'volume_up' | 'volume_down' | 'get_state'
    | 'maximize' | 'restore' | 'is_maximized' | 'tidy_page';
type PageScrollDirection = 'up' | 'down' | 'top';
/** Where the page stands after the last Up/Down (atTop/atBottom), and whether a scroll is under way. */
export type PageScrollState = { atTop: boolean; atBottom: boolean; pending: boolean };
/** A short message from the browser: something refused (a download, a link), or the page refreshed or restarted. */
export type BrowserNotice = { kind: 'blocked' | 'refreshed' | 'recovered'; what?: string; at: number };
type VideoPlaybackState = {
    playing: boolean;
    hasVideo: boolean;
    rect: { l: number; t: number; w: number; h: number } | null;
    fullscreen: boolean;
};
type YoutubeCommandResult = {
    ok?: boolean;
    status?: 'done' | 'waiting_for_skip' | 'no_ad' | 'no_next' | 'buffering' | 'stalled' | 'failed' | string;
    detail?: string;
    youtubeState?: string;
    blockDwellMs?: number;
    /** get_state: YouTube's own Skip Ad button can be pressed now. */
    skippable?: boolean;
    /** maximize / restore / is_maximized: the in-app full screen is applied. */
    maximized?: boolean;
    /** get_state: video choices on the page (0 on an empty YouTube Home). */
    videoChoices?: number;
    /** get_state: the page's title without " - YouTube". */
    title?: string;
    /** get_state: a YouTube promo popup is over the page (tidy_page answers it with No thanks). */
    promo?: boolean;
    /** get_state: YouTube's miniplayer is playing the last video over this page (tidy_page closes it). */
    miniplayer?: boolean;
    /** get_state: where the video is, in whole seconds. */
    time?: number | null;
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
    targetRegionSlackPx?: number;
    youtubeCardHitZonePx?: number;
    youtubeCardUnsnapPx?: number;
    youtubeSkipSnapPx?: number;
    youtubeSkipUnsnapPx?: number;
    youtubeCardStabilityRadiusPx?: number;
    edgeScrollEnabled?: boolean;
    edgeHoldMs?: number;
    edgeZonePct?: number;
    edgeDeadZonePct?: number;
    edgeMinDeltaPx?: number;
    edgeMaxDeltaPx?: number;
    edgeThrottleMs?: number;
    edgeMaxBurstMs?: number;
    // v17.18 dwell-safety toggles (seeded into every new page by the main
    // process, so a rollback survives page loads — unlike window.gcConfig).
    progressRetentionEnabled?: boolean;
    progressRetentionMs?: number;
    gapPauseEnabled?: boolean;
    gapPauseMs?: number;
    // v17.23 — per-target progress bank (B3 prototype, default OFF).
    progressBankEnabled?: boolean;
};

const getElectronAPI = () => (window as any).electronAPI;
const initialScrollState = (): PageScrollState => ({ atTop: true, atBottom: false, pending: false });

/** YouTube's results page for what was typed on the search keyboard. */
export const youtubeSearchUrl = (query: string) =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
/** Google's results page for what was typed on the search keyboard. */
export const googleSearchUrl = (query: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
export const YOUTUBE_HOME_URL = 'https://www.youtube.com/';
const defaultVideoPlaybackState = (): VideoPlaybackState => ({
    playing: false,
    hasVideo: false,
    rect: null,
    fullscreen: false,
});

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
    const [videoPlaybackState, setVideoPlaybackState] = useState<VideoPlaybackState>(() => defaultVideoPlaybackState());
    const [pageScroll, setPageScroll] = useState<PageScrollState>(() => initialScrollState());
    const [notice, setNotice] = useState<BrowserNotice | null>(null);
    const [pageVisible, setPageVisibleState] = useState(true);
    const boundsRef = useRef<BrowserViewBounds | null>(null);
    const cursorInsideRef = useRef(false);
    // While an app screen covers the page (the search keyboard) no gaze is sent to it.
    const pageHiddenRef = useRef(false);
    // Bumped by every close. An open that resolves after a close was issued
    // belongs to a page the user has already left and is not shown as open.
    const openGenerationRef = useRef(0);

    // The page is a native layer drawn over the whole window, not part of this
    // screen's DOM, so unmounting the screen does not remove it. Whatever takes
    // the screen away (Home, Alert Mode, an error screen), the page goes too.
    useEffect(() => () => {
        openGenerationRef.current += 1;
        const api = getElectronAPI();
        try {
            void api?.webview?.close?.()?.catch?.(() => undefined);
        } catch { /* ignore */ }
    }, []);

    // Navigation state listener
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = (state: { canGoBack: boolean; canGoForward: boolean; url?: string }) => {
            setCanGoBack(state.canGoBack);
            setCanGoForward(state.canGoForward);
            if (typeof state.url === 'string') {
                setCurrentUrl((previous) => {
                    if (previous !== state.url) setPageScroll(initialScrollState());
                    return state.url as string;
                });
            }
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

    // BrowserView playback state listener. This is emitted by Electron from
    // the injected web cursor so React can render gaze-safe video controls
    // outside the BrowserView without touching the main app gaze pipeline.
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = (payload: Partial<VideoPlaybackState>) => {
            setVideoPlaybackState({
                playing: !!payload?.playing,
                hasVideo: !!payload?.hasVideo,
                rect: payload?.rect ?? null,
                fullscreen: !!payload?.fullscreen,
            });
        };
        api.on('webview:playbackState', handler);
        return () => api.off('webview:playbackState', handler);
    }, []);

    // Short notices from the browser: a refused download or link, an automatic refresh.
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const handler = (payload: { kind?: string; what?: string }) => {
            const kind = payload?.kind;
            if (kind !== 'blocked' && kind !== 'refreshed' && kind !== 'recovered') return;
            setNotice({ kind, what: typeof payload?.what === 'string' ? payload.what : undefined, at: Date.now() });
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => setNotice(null), 5000);
        };
        api.on('webview:notice', handler);
        return () => {
            api.off('webview:notice', handler);
            if (timer) clearTimeout(timer);
        };
    }, []);

    // Native BrowserView can be closed by Electron-side safety paths
    // (reset, unresponsive renderer, render-process-gone). Mirror that state
    // immediately so React never leaves a stale page floating over the app.
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = (payload?: { reason?: string }) => {
            // 'replace' is the previous page making way for the one being
            // opened right now; that open is current, not stale.
            if (payload?.reason !== 'replace') openGenerationRef.current += 1;
            setIsOpen(false);
            setCurrentUrl(null);
            setPageLinks([]);
            setEdgeScrollDirection('none');
            setScrollModeState('off');
            setHighContrast(false);
            setVideoPlaybackState(defaultVideoPlaybackState());
            setPageScroll(initialScrollState());
            setPageVisibleState(true);
            pageHiddenRef.current = false;
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
        const generation = openGenerationRef.current;
        try {
            const result = await api.webview.open(url, bounds);
            if (generation !== openGenerationRef.current) {
                // Closed while this page was opening. The main process handles
                // requests in order, so that close has already removed it (or
                // cancelled the open); a further close here could hit the NEXT page.
                setLoading(false);
                return false;
            }
            if (result?.success) {
                setIsOpen(true);
                setCurrentUrl(url);
                setPageLinks([]);
                setHighContrast(false);
                setZoomFactor(1.35);
                setVideoPlaybackState(defaultVideoPlaybackState());
                setPageScroll(initialScrollState());
                setPageVisibleState(true);
                pageHiddenRef.current = false;
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
        openGenerationRef.current += 1;
        try {
            await api.webview.close();
        } catch { /* ignore */ }
        setIsOpen(false);
        setCurrentUrl(null);
        setPageLinks([]);
        setEdgeScrollDirection('none');
        setScrollModeState('off');
        setHighContrast(false);
        setVideoPlaybackState(defaultVideoPlaybackState());
        setPageScroll(initialScrollState());
        setPageVisibleState(true);
        pageHiddenRef.current = false;
        boundsRef.current = null;
        cursorInsideRef.current = false;
    }, []);

    // Up / Down by most of a screen, chosen by the page itself (main.ts 'webview:scrollPage'):
    // the document, or the panel that actually scrolls, never just whatever is under the
    // middle of the view. The result says whether the top or the end has been reached.
    const scrollPage = useCallback(async (direction: PageScrollDirection) => {
        const api = getElectronAPI();
        if (!api?.webview) return null;
        if (!api.webview.scrollPage) {
            await api.webview.scroll(direction === 'down' ? -300 : 300);
            return null;
        }
        setPageScroll((state) => ({ ...state, pending: true }));
        try {
            const result = await api.webview.scrollPage(direction);
            setPageScroll((state) => (result && typeof result.atTop === 'boolean'
                ? { atTop: !!result.atTop, atBottom: !!result.atBottom, pending: false }
                : { ...state, pending: false }));
            return result;
        } catch {
            setPageScroll((state) => ({ ...state, pending: false }));
            return null;
        }
    }, []);

    const scrollDown = useCallback(() => scrollPage('down'), [scrollPage]);
    const scrollUp = useCallback(() => scrollPage('up'), [scrollPage]);
    const scrollToTop = useCallback(() => scrollPage('top'), [scrollPage]);

    // The page is a native layer above the whole interface. To show an app screen over it
    // (the search keyboard), it is taken off the window -- kept alive, exactly as it was --
    // and gaze stops reaching it until it is shown again.
    const setPageVisible = useCallback(async (visible: boolean) => {
        const api = getElectronAPI();
        pageHiddenRef.current = !visible;
        setPageVisibleState(visible);
        if (!visible && cursorInsideRef.current) {
            cursorInsideRef.current = false;
            try { await api?.webview?.updateGaze?.(-1, -1, { emittedAtWallMs: Date.now() }); } catch { /* ignore */ }
        }
        if (!api?.webview?.setVisible) return;
        try {
            await api.webview.setVisible(visible);
        } catch (err) {
            console.error('setPageVisible error:', err);
        }
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
                // A new page starts at its top (the navigation event that follows
                // carries this same address, so it would not reset it again).
                setCurrentUrl(url);
                setPageScroll(initialScrollState());
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
        openGenerationRef.current += 1;
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
        setVideoPlaybackState(defaultVideoPlaybackState());
        setPageScroll(initialScrollState());
        setPageVisibleState(true);
        pageHiddenRef.current = false;
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
            await api.webview.updateGaze(-1, -1, { emittedAtWallMs: Date.now() });
        } catch { /* ignore - may fail if page navigating */ }
    }, []);

    // Send gaze position to BrowserView to show a visible cursor inside web content
    const updateGazeCursor = useCallback(async (clientX: number, clientY: number, options?: BrowserGazeOptions) => {
        const api = getElectronAPI();
        if (!api?.webview?.updateGaze || !boundsRef.current || pageHiddenRef.current) return;
        const b = boundsRef.current;
        const localX = Math.round(clientX - b.x);
        const localY = Math.round(clientY - b.y);
        const safeInsetPx = 18;
        // Only update if gaze is within BrowserView bounds.
        // Hide when gaze returns to app chrome so the page cursor cannot go stale.
        if (localX >= safeInsetPx && localY >= 0 && localX <= b.width - safeInsetPx && localY <= b.height) {
            cursorInsideRef.current = true;
            try {
                await api.webview.updateGaze(localX, localY, {
                    ...options,
                    emittedAtWallMs: options?.emittedAtWallMs ?? Date.now(),
                });
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
        scrollPage,
        scrollDown,
        scrollUp,
        scrollToTop,
        setPageVisible,
        goBack,
        goForward,
        navigateTo,
        refreshLinks,
        adjustZoom,
        toggleHighContrast,
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
        videoPlaybackState,
        pageScroll,
        pageVisible,
        notice,
    };
}
