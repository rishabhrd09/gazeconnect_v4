/**
 * GazeConnect Pro - Debug Overlay
 * ================================
 * Dev-only viewport diagnostics overlay.
 * Toggle: Ctrl+Shift+D
 * Shows viewport size, scale factor, screen category,
 * and highlights elements that overflow the viewport.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useViewport } from '../../utils/responsive';

const DebugOverlay: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const viewport = useViewport();
  const [overflowCount, setOverflowCount] = useState(0);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Toggle with Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scan for overflow elements and inject red border style
  const scanOverflow = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const all = document.querySelectorAll('*');
    const overflowing: Element[] = [];

    // Remove previous markers
    document.querySelectorAll('[data-debug-overflow]').forEach(el => {
      el.removeAttribute('data-debug-overflow');
    });

    all.forEach(el => {
      const rect = el.getBoundingClientRect();
      // Skip tiny/invisible elements and the debug overlay itself
      if (rect.width < 2 || rect.height < 2) return;
      if ((el as HTMLElement).closest?.('[data-debug-overlay]')) return;

      if (rect.right > vw + 1 || rect.bottom > vh + 1 || rect.left < -1 || rect.top < -1) {
        // Only flag elements that are actually visible (not hidden overflow containers)
        const style = window.getComputedStyle(el);
        if (style.overflow === 'hidden' || style.visibility === 'hidden' || style.display === 'none') return;
        el.setAttribute('data-debug-overflow', 'true');
        overflowing.push(el);
      }
    });

    setOverflowCount(overflowing.length);
  }, []);

  // Inject/remove the CSS rule for overflow highlighting
  useEffect(() => {
    if (visible) {
      const style = document.createElement('style');
      style.textContent = `[data-debug-overflow] { outline: 2px solid red !important; outline-offset: -1px; }`;
      document.head.appendChild(style);
      styleRef.current = style;
      scanOverflow();
      const interval = setInterval(scanOverflow, 2000);
      return () => {
        clearInterval(interval);
        style.remove();
        document.querySelectorAll('[data-debug-overflow]').forEach(el => {
          el.removeAttribute('data-debug-overflow');
        });
        styleRef.current = null;
      };
    }
  }, [visible, scanOverflow]);

  // Re-scan on resize
  useEffect(() => {
    if (visible) scanOverflow();
  }, [viewport.vh, viewport.vw, visible, scanOverflow]);

  if (!visible) return null;

  const category = viewport.isSmallScreen ? 'Small (<800)' : viewport.isMediumScreen ? 'Medium (800-950)' : 'Large (>950)';
  const catColor = viewport.isSmallScreen ? '#F59E0B' : viewport.isMediumScreen ? '#3B82F6' : '#10B981';

  return (
    <div
      data-debug-overlay="true"
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 2147483646,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        color: '#E2E8F0',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '13px',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        lineHeight: 1.7,
        border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(12px)',
        pointerEvents: 'none',
        userSelect: 'none',
        minWidth: '240px',
      }}
    >
      <div style={{ fontWeight: 700, color: '#2DD4BF', marginBottom: '6px', fontSize: '11px', letterSpacing: '1.5px' }}>
        DEBUG OVERLAY
      </div>

      <div>
        <span style={{ color: '#94A3B8' }}>Viewport: </span>
        <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{viewport.vw} x {viewport.vh}</span>
      </div>

      <div>
        <span style={{ color: '#94A3B8' }}>Scale: </span>
        <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{viewport.scale.toFixed(3)}</span>
        <span style={{ color: '#64748B' }}> ({Math.round(viewport.scale * 100)}%)</span>
      </div>

      <div>
        <span style={{ color: '#94A3B8' }}>Screen: </span>
        <span style={{ color: catColor, fontWeight: 700 }}>{category}</span>
      </div>

      <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
        <span style={{ color: '#94A3B8' }}>Overflow: </span>
        <span style={{ color: overflowCount > 0 ? '#EF4444' : '#10B981', fontWeight: 700 }}>
          {overflowCount > 0 ? `${overflowCount} elements` : 'None'}
        </span>
      </div>

      <div style={{ marginTop: '6px', fontSize: '10px', color: '#475569' }}>
        Ctrl+Shift+D to close
      </div>
    </div>
  );
};

/**
 * Wrapper that only renders in development mode.
 * In production builds, this renders nothing.
 */
const DevDebugOverlay: React.FC = () => {
  if (process.env.NODE_ENV === 'production') return null;
  return <DebugOverlay />;
};

export default DevDebugOverlay;
