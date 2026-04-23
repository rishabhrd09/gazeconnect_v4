/**
 * GazeDebugOverlay.tsx - Visual debugging for gaze accuracy tuning
 *
 * Toggle: Ctrl+Shift+G
 * Shows: raw gaze point, smoothed cursor, fixation indicator,
 * coordinate readout, hit zone visualization, gaze heatmap
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWS } from '../../hooks/useWebSocket';
import { useCustomization } from '../../contexts/CustomizationContext';

interface GazeDebugData {
  rawX: number;
  rawY: number;
  smoothedX: number;
  smoothedY: number;
  gazeState: string;
  backendZone: string;
  isFixation: boolean;
  backendOnKey: boolean;
  magnetPx: number;
  sampleAgeMs: number;
  signalState: string;
  confidence: number;
}

const HEATMAP_CELL_SIZE = 20;
const HEATMAP_DECAY = 0.997; // Per-frame decay

export const GazeDebugOverlay: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showHitZones, setShowHitZones] = useState(false);
  const [data, setData] = useState<GazeDebugData | null>(null);
  const ws = useWS();
  const { settings } = useCustomization();

  const heatmapRef = useRef<number[][]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCountRef = useRef(0);

  // Toggle with Ctrl+Shift+G
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Subscribe to raw gaze data for debug info
  useEffect(() => {
    if (!visible) return;

    const unsub = ws.subscribeGaze((gazeData: any) => {
      if (!gazeData || typeof gazeData.x !== 'number') return;

      const rawX = (gazeData.raw_x ?? gazeData.x) * window.innerWidth;
      const rawY = (gazeData.raw_y ?? gazeData.y) * window.innerHeight;
      const smoothedX = gazeData.x * window.innerWidth;
      const smoothedY = gazeData.y * window.innerHeight;

      setData({
        rawX,
        rawY,
        smoothedX,
        smoothedY,
        gazeState: gazeData.gaze_state || 'unknown',
        backendZone: gazeData.backend_zone || 'unknown',
        isFixation: gazeData.is_fixation || false,
        backendOnKey: gazeData.backend_on_key || false,
        magnetPx: gazeData.backend_magnet_px || 0,
        sampleAgeMs: gazeData.sample_age_ms || 0,
        signalState: gazeData.signal_state || 'unknown',
        confidence: gazeData.confidence || 0,
      });

      // Update heatmap
      if (showHeatmap) {
        const cols = Math.ceil(window.innerWidth / HEATMAP_CELL_SIZE);
        const rows = Math.ceil(window.innerHeight / HEATMAP_CELL_SIZE);

        if (heatmapRef.current.length !== rows) {
          heatmapRef.current = Array.from({ length: rows }, () => new Array(cols).fill(0));
        }

        const col = Math.floor(smoothedX / HEATMAP_CELL_SIZE);
        const row = Math.floor(smoothedY / HEATMAP_CELL_SIZE);
        if (row >= 0 && row < rows && col >= 0 && col < cols) {
          heatmapRef.current[row][col] = Math.min(1, heatmapRef.current[row][col] + 0.02);
        }

        // Decay all cells
        frameCountRef.current++;
        if (frameCountRef.current % 3 === 0) {
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              heatmapRef.current[r][c] *= HEATMAP_DECAY;
            }
          }
        }

        // Draw heatmap
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                const intensity = heatmapRef.current[r][c];
                if (intensity > 0.01) {
                  const hue = Math.max(0, 120 - intensity * 120); // green -> red
                  ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${intensity * 0.6})`;
                  ctx.fillRect(c * HEATMAP_CELL_SIZE, r * HEATMAP_CELL_SIZE, HEATMAP_CELL_SIZE, HEATMAP_CELL_SIZE);
                }
              }
            }
          }
        }
      }
    });

    return unsub;
  }, [visible, ws, showHeatmap]);

  if (!visible) return null;

  const delta = data ? Math.round(Math.hypot(data.smoothedX - data.rawX, data.smoothedY - data.rawY)) : 0;
  const fixationColor = data?.isFixation ? '#00FF00' : (data?.gazeState === 'saccade' ? '#FF4444' : '#FFAA00');

  return (
    <>
      {/* Heatmap canvas */}
      {showHeatmap && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'fixed', top: 0, left: 0,
            width: '100vw', height: '100vh',
            pointerEvents: 'none',
            zIndex: 2147483640,
            opacity: 0.5,
          }}
        />
      )}

      {/* Raw gaze point (red dot) */}
      {data && (
        <div style={{
          position: 'fixed',
          left: data.rawX - 6,
          top: data.rawY - 6,
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 60, 60, 0.7)',
          border: '2px solid rgba(255, 60, 60, 0.9)',
          pointerEvents: 'none',
          zIndex: 2147483645,
        }} />
      )}

      {/* Fixation indicator ring around cursor */}
      {data && (
        <div style={{
          position: 'fixed',
          left: data.smoothedX - 40,
          top: data.smoothedY - 40,
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: `3px solid ${fixationColor}`,
          backgroundColor: `${fixationColor}10`,
          pointerEvents: 'none',
          zIndex: 2147483644,
          transition: 'border-color 100ms',
        }} />
      )}

      {/* Hit zone visualization for keyboard keys */}
      {showHitZones && <HitZoneOverlay />}

      {/* Coordinate readout panel */}
      <div style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.6,
        zIndex: 2147483646,
        pointerEvents: 'auto',
        border: '1px solid #333',
        minWidth: 300,
      }}>
        <div style={{ fontWeight: 'bold', color: '#38BDF8', marginBottom: 4 }}>
          Gaze Debug Overlay (Ctrl+Shift+G to close)
        </div>
        {data ? (
          <>
            <div>
              <span style={{ color: '#FF6666' }}>Raw:</span> {Math.round(data.rawX)},{Math.round(data.rawY)}
              {' | '}
              <span style={{ color: '#38BDF8' }}>Smooth:</span> {Math.round(data.smoothedX)},{Math.round(data.smoothedY)}
              {' | '}
              <span style={{ color: '#FFAA00' }}>Delta:</span> {delta}px
            </div>
            <div>
              <span style={{ color: fixationColor }}>State:</span> {data.gazeState}
              {' | '}
              <span style={{ color: '#888' }}>Zone:</span> {data.backendZone}
              {' | '}
              <span style={{ color: data.isFixation ? '#0F0' : '#888' }}>
                {data.isFixation ? 'FIXATION' : 'moving'}
              </span>
            </div>
            <div>
              <span style={{ color: '#888' }}>OnKey:</span> {data.backendOnKey ? 'YES' : 'no'}
              {' | '}
              <span style={{ color: '#888' }}>Magnet:</span> {data.magnetPx.toFixed(1)}px
              {' | '}
              <span style={{ color: '#888' }}>Age:</span> {data.sampleAgeMs.toFixed(1)}ms
              {' | '}
              <span style={{ color: '#888' }}>Signal:</span> {data.signalState}
            </div>
            <div>
              <span style={{ color: '#888' }}>Offset:</span> X={settings.gazeOffsetX ?? 0} Y={settings.gazeOffsetY ?? 0}
            </div>
          </>
        ) : (
          <div style={{ color: '#888' }}>Waiting for gaze data...</div>
        )}
        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowHeatmap(h => !h)}
            style={{
              padding: '2px 8px', fontSize: 10, cursor: 'pointer',
              backgroundColor: showHeatmap ? '#2DD4BF' : '#333',
              color: showHeatmap ? '#000' : '#fff',
              border: '1px solid #555', borderRadius: 4,
            }}
          >
            {showHeatmap ? 'Heatmap ON' : 'Heatmap OFF'}
          </button>
          <button
            onClick={() => setShowHitZones(h => !h)}
            style={{
              padding: '2px 8px', fontSize: 10, cursor: 'pointer',
              backgroundColor: showHitZones ? '#2DD4BF' : '#333',
              color: showHitZones ? '#000' : '#fff',
              border: '1px solid #555', borderRadius: 4,
            }}
          >
            {showHitZones ? 'Hit Zones ON' : 'Hit Zones OFF'}
          </button>
        </div>
      </div>
    </>
  );
};

/** Renders translucent overlays on keyboard keys showing expanded hit zones */
const HitZoneOverlay: React.FC = () => {
  const [rects, setRects] = useState<DOMRect[]>([]);

  useEffect(() => {
    const refresh = () => {
      const keys = document.querySelectorAll('[data-gaze-context="keyboard"]');
      const newRects: DOMRect[] = [];
      keys.forEach(el => {
        if (el instanceof HTMLElement) {
          newRects.push(el.getBoundingClientRect());
        }
      });
      setRects(newRects);
    };

    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, []);

  const SNAP_MARGIN = 15;

  return (
    <>
      {rects.map((rect, i) => (
        <div
          key={i}
          style={{
            position: 'fixed',
            left: rect.left - SNAP_MARGIN,
            top: rect.top - SNAP_MARGIN,
            width: rect.width + SNAP_MARGIN * 2,
            height: rect.height + SNAP_MARGIN * 2,
            border: '1px solid rgba(45, 212, 191, 0.3)',
            backgroundColor: 'rgba(45, 212, 191, 0.05)',
            borderRadius: 12,
            pointerEvents: 'none',
            zIndex: 2147483640,
          }}
        />
      ))}
    </>
  );
};

export default GazeDebugOverlay;
