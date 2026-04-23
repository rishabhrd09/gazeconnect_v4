/**
 * GazeConnect Pro - Responsive Viewport Utility
 * ==============================================
 * Detects viewport size and provides scale factors for
 * adapting the UI across 13" to 27" screens.
 *
 * Breakpoints:
 *   Small  = height < 800px  (14" laptops at 1080p with scaling)
 *   Medium = 800-950px
 *   Large  = height > 950px  (23"+ monitors)
 */

import { useState, useEffect } from 'react';

export interface ViewportInfo {
  /** Viewport height in pixels */
  vh: number;
  /** Viewport width in pixels */
  vw: number;
  /** Scale factor: Math.min(1, viewportHeight / 1080) */
  scale: number;
  /** height < 800px */
  isSmallScreen: boolean;
  /** 800px <= height <= 950px */
  isMediumScreen: boolean;
  /** height > 950px */
  isLargeScreen: boolean;
}

function getViewportInfo(): ViewportInfo {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const scale = Math.min(1, vh / 1080);

  return {
    vh,
    vw,
    scale,
    isSmallScreen: vh < 800,
    isMediumScreen: vh >= 800 && vh <= 950,
    isLargeScreen: vh > 950,
  };
}

/**
 * React hook that returns current viewport dimensions, scale factor,
 * and screen-size classification. Updates on window resize.
 */
export function useViewport(): ViewportInfo {
  const [viewport, setViewport] = useState<ViewportInfo>(getViewportInfo);

  useEffect(() => {
    let rafId: number;

    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setViewport(getViewportInfo());
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return viewport;
}

/**
 * Clamp a preferred value between a minimum and maximum.
 * Useful for responsive sizing: `clampSize(60, 80 * scale, 120)`
 */
export function clampSize(min: number, preferred: number, max: number): number {
  return Math.max(min, Math.min(preferred, max));
}
