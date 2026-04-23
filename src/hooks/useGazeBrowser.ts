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
    const boundsRef = useRef<BrowserViewBounds | null>(null);

    // Navigation state listener
    useEffect(() => {
        const api = getElectronAPI();
        if (!api?.on) return;
        const handler = (state: { canGoBack: boolean; canGoForward: boolean }) => {
            setCanGoBack(state.canGoBack);
            setCanGoForward(state.canGoForward);
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
        setHighContrast(false);
        boundsRef.current = null;
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

    const updateBounds = useCallback(async (bounds: BrowserViewBounds) => {
        const api = getElectronAPI();
        if (!api?.webview) return;
        boundsRef.current = bounds;
        await api.webview.setBounds(bounds);
    }, []);

    // Send gaze position to BrowserView to show a visible cursor inside web content
    const updateGazeCursor = useCallback(async (clientX: number, clientY: number) => {
        const api = getElectronAPI();
        if (!api?.webview?.updateGaze || !boundsRef.current) return;
        const b = boundsRef.current;
        const localX = Math.round(clientX - b.x);
        const localY = Math.round(clientY - b.y);
        // Only update if gaze is within BrowserView bounds
        if (localX >= 0 && localY >= 0 && localX <= b.width && localY <= b.height) {
            try {
                await api.webview.updateGaze(localX, localY);
            } catch { /* ignore — may fail if page navigating */ }
        }
    }, []);

    return {
        isOpen,
        currentUrl,
        loading,
        boundsRef,
        openPage,
        closePage,
        clickAtGaze,
        scrollDown,
        scrollUp,
        goBack,
        goForward,
        navigateTo,
        refreshLinks,
        adjustZoom,
        toggleHighContrast,
        typeText,
        updateBounds,
        updateGazeCursor,
        canGoBack,
        canGoForward,
        zoomFactor,
        highContrast,
        pageLinks,
        edgeScrollDirection,
    };
}
