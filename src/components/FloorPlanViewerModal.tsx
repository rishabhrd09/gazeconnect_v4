/**
 * FloorPlanViewerModal — Full-screen Architectural Plan Viewer
 * ============================================================
 * Displays PyCairo-generated floor plans with:
 *  - 4-style switcher (modern/autocad/blueprint/presentation)
 *  - Floor toggle (ground/first)
 *  - Live cell grid mini-map visualization
 *  - Plan metadata panel
 *  - Download buttons (PNG/PDF/SVG)
 *  - Full gaze accessibility (ALS-compliant)
 *
 * Usage:
 *   <FloorPlanViewerModal
 *     compassData={compiledPayload}
 *     onClose={() => setShowViewer(false)}
 *     onSpeak={onSpeak}
 *   />
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GazeButton from './core/GazeButton';
import { useGazeControl } from './core/GazeControlToggle';
import { screenThemes, typography } from '../utils/design';
import { useTheme } from '../contexts/ThemeContext';
import {
  generateFloorPlan,
  checkBackendHealth,
  FloorPlanStyle,
  FloorPlanFormat,
  CompassMapPayload,
  FloorPlanFusionContext,
} from '../utils/floorplanApi';

// ─── Room Colors (mirrored from CompassMapScreen) ────────

const ROOM_COLORS: Record<string, string> = {
  porch: '#81C784', lawn: '#AED581', verandah: '#4DB6AC', backyard: '#66BB6A',
  drawing: '#7E57C2', kitchen: '#FFA726', living: '#42A5F5', bathroom: '#78909C',
  staircase: '#8D6E63', diningStaircase: '#A1887F', dining: '#FFCA28', commonBath: '#546E7A', icu: '#EF5350',
  balcony: '#26A69A', terrace: '#009688', ff_master: '#3949AB', ff_bed2: '#5C6BC0',
  ff_bed3: '#7986CB', ff_living: '#1E88E5', ff_bathroom: '#607D8B',
  ff_balcony: '#26A69A', ff_terrace: '#66BB6A', ff_stairLanding: '#8D6E63',
};

// ─── Theme ─────────────────────────────────────────────────

const T = {
  ...screenThemes.floorPlan,
  panel: screenThemes.floorPlan.panelBg,
  card: screenThemes.floorPlan.cardBg,
  blue: screenThemes.floorPlan.accentStrong,
  text: screenThemes.floorPlan.textMain,
  sub: screenThemes.floorPlan.textSub,
  dim: screenThemes.floorPlan.textDim,
  danger: screenThemes.floorPlan.danger,
  warn: screenThemes.floorPlan.warning,
};

const UI_FONT = typography.fontFamily.primary;

const STYLES: FloorPlanStyle[] = ['modern', 'autocad', 'blueprint', 'presentation'];

const STYLE_INFO: Record<FloorPlanStyle, { label: string; icon: string; color: string }> = {
  modern: { label: 'MODERN', icon: '◆', color: '#14B8A6' },
  autocad: { label: 'AUTOCAD', icon: '▣', color: '#00E5FF' },
  blueprint: { label: 'BLUEPRINT', icon: '◈', color: '#50B0F7' },
  presentation: { label: 'PRESENT.', icon: '◇', color: '#1976D2' },
};

// ─── Props ─────────────────────────────────────────────────

interface FloorPlanViewerProps {
  compassData: CompassMapPayload;
  onClose: () => void;
  onSpeak: (text: string) => void;
  surveyData?: Record<string, any> | null;
  initialCustomNotes?: string;
}

// ─── Cell Grid Mini-Map ────────────────────────────────────

const CellGridMiniMap: React.FC<{
  compassData: CompassMapPayload;
  floor: 'ground' | 'first';
  miniBg?: string;
  miniBorder?: string;
  miniEmptyCellBg?: string;
  miniEmptyText?: string;
  miniDataText?: string;
}> = ({ compassData, floor, miniBg, miniBorder, miniEmptyCellBg, miniEmptyText, miniDataText }) => {
  const rows = compassData.grid_size?.rows || 4;
  const cols = compassData.grid_size?.cols || 4;
  const floorData = floor === 'first' ? compassData.first_floor : compassData.ground_floor;
  const placements = floorData?.placements || [];

  // Build cell→room map
  const cellMap: Record<string, { room: string; roomId: string; color: string }> = {};
  for (const p of placements) {
    for (const cell of p.cells || []) {
      cellMap[cell] = { room: p.room, roomId: p.roomId, color: ROOM_COLORS[p.roomId] || '#78909C' };
    }
  }

  // Render: row 4 at top (back), row 1 at bottom (road)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: '0px',
      width: '100%',
      aspectRatio: `${cols}/${rows}`,
      border: `2px solid ${miniBorder || T.border}`,
      borderRadius: '6px',
      overflow: 'hidden',
      background: miniBg || T.bg,
    }}>
      {Array.from({ length: rows }, (_, ri) => rows - ri).map(row =>
        Array.from({ length: cols }, (_, ci) => ci + 1).map(col => {
          const cellKey = `r${row}_c${col}`;
          const data = cellMap[cellKey];
          const isRightEdge = col < cols;
          const isBottomEdge = row > 1;
          return (
            <div key={cellKey} style={{
              background: data ? `${data.color}30` : (miniEmptyCellBg || 'rgba(30,41,59,0.4)'),
              borderRight: isRightEdge ? '1px solid rgba(100,116,139,0.15)' : 'none',
              borderBottom: isBottomEdge ? '1px solid rgba(100,116,139,0.15)' : 'none',
              borderLeft: data ? `3px solid ${data.color}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1px',
              minHeight: '28px',
            }}>
              <span style={{
                fontSize: '7px', fontWeight: 700,
                color: data ? (miniDataText || '#FFFFFF') : (miniEmptyText || '#475569'),
                textAlign: 'center', lineHeight: 1,
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {data ? (data.room.length > 10 ? data.roomId : data.room) : ''}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────

export function FloorPlanViewerModal({
  compassData,
  onClose,
  onSpeak,
  surveyData = null,
  initialCustomNotes = '',
}: FloorPlanViewerProps) {
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();

  // ── Theme-aware tokens (drafting paper / workshop dusk) ──
  const T_overlayBg = isLight
    ? 'rgba(74, 58, 42, 0.55)'
    : isWarm
      ? 'rgba(47, 42, 38, 0.50)'
      : isMix
        ? 'rgba(0,0,0,0.78)'
        : 'rgba(0,0,0,0.94)';
  const T_modalBg = isLight ? '#F2EDE0' : isWarm ? '#F5EEDF' : isMix ? '#1A1611' : T.bg;
  const T_panel = isLight ? '#FAF5E8' : isWarm ? '#F8F1DF' : isMix ? '#241F18' : T.panel;
  const T_card = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? '#2A2419' : T.card;
  const T_border = isLight
    ? '#D6CAB7'
    : isWarm
      ? '#DED2C2'
      : isMix
        ? 'rgba(180, 147, 98, 0.42)'
        : T.border;
  const T_text = isLight ? '#2E2A24' : isWarm ? '#2F2A26' : isMix ? '#FFFCF1' : T.text;
  const T_sub = isLight ? '#76624A' : isWarm ? '#6A625B' : isMix ? '#C4B697' : T.sub;
  const T_dim = isLight ? '#9A8568' : isWarm ? '#8A7C6B' : isMix ? '#8E7E62' : T.dim;
  const T_accent = isLight ? '#1F6B7E' : isWarm ? '#3F6968' : isMix ? '#5E9CA8' : T.accent;
  const T_accentSubtle = isLight
    ? 'rgba(31, 107, 126, 0.14)'
    : isWarm
      ? '#E7EEEA'
      : isMix
        ? 'rgba(94, 156, 168, 0.16)'
        : T.accentSubtle;
  const T_danger = isLight ? '#8A3B38' : isWarm ? '#7A312E' : isMix ? '#9C5A53' : T.danger;
  const T_blue = isLight ? '#1F6B7E' : isWarm ? '#3F6968' : isMix ? '#5E9CA8' : T.blue;
  const T_elevated = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : isMix ? '#2A2419' : T.elevatedBg;

  const [style, setStyle] = useState<FloorPlanStyle>('modern');
  const [floor, setFloor] = useState<'ground' | 'first'>('ground');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [customNotes, setCustomNotes] = useState(initialCustomNotes);
  const [appliedNotes, setAppliedNotes] = useState(initialCustomNotes);

  const hasFF = !!(compassData.first_floor?.placements?.length);
  const gfCount = compassData.ground_floor?.placements?.length || 0;
  const ffCount = compassData.first_floor?.placements?.length || 0;

  const fusionContext: FloorPlanFusionContext = useMemo(
    () => ({
      surveyData,
      userNotes: appliedNotes,
      useAdvancedFusion: true,
    }),
    [surveyData, appliedNotes],
  );

  // Check backend on mount
  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  useEffect(() => {
    setCustomNotes(initialCustomNotes);
    setAppliedNotes(initialCustomNotes);
  }, [initialCustomNotes]);

  // Generate on style/floor change
  const doGenerate = useCallback(async () => {
    if (!compassData) return;
    setLoading(true);
    setError(null);
    onSpeak(`Generating ${STYLE_INFO[style].label} floor plan...`);

    const result = await generateFloorPlan(compassData, style, 'png', floor, fusionContext);

    if ('error' in result) {
      setError(result.error);
      setLoading(false);
      onSpeak('Generation failed.');
    } else {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(result.url);
      setBlob(result.blob);
      setLoading(false);
      onSpeak(`${STYLE_INFO[style].label} plan ready.`);
    }
  }, [compassData, style, floor, onSpeak, fusionContext]);

  useEffect(() => {
    doGenerate();
  }, [style, floor, appliedNotes]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, []);

  // Download
  const handleDownload = useCallback(async (fmt: FloorPlanFormat) => {
    if (fmt === 'png' && blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `floorplan_${floor}_${style}.png`;
      a.click();
      onSpeak('PNG downloaded.');
      return;
    }
    const result = await generateFloorPlan(compassData, style, fmt, floor, fusionContext);
    if ('error' in result) { onSpeak('Download failed.'); return; }
    const a = document.createElement('a');
    a.href = result.url;
    a.download = `floorplan_${floor}_${style}.${fmt}`;
    a.click();
    URL.revokeObjectURL(result.url);
    onSpeak(`${fmt.toUpperCase()} downloaded.`);
  }, [compassData, style, floor, blob, onSpeak, fusionContext]);

  // ─── Render ──────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: T_overlayBg, display: 'flex', flexDirection: 'column',
      fontFamily: UI_FONT,
    }}>
      {/* ═══ HEADER BAR ═══ */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        padding: 'clamp(8px, 1.2vh, 14px) clamp(12px, 1.5vw, 24px)',
        paddingLeft: 'clamp(300px, 28vw, 420px)',
        minHeight: 'clamp(112px, 13vh, 148px)',
        borderBottom: `2px solid ${T_border}`, background: T_panel,
        gap: 'clamp(8px, 1vw, 16px)',
        justifyContent: 'flex-end',
        position: 'relative',
      }}>
        {/* Title */}
        <div style={{ position: 'absolute', left: 'clamp(12px, 1.5vw, 24px)', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <div style={{ fontSize: 'clamp(15px, 2vh, 22px)', fontWeight: 900, color: T_text, letterSpacing: '1.5px' }}>
            ARCHITECTURAL FLOOR PLAN
          </div>
          <div style={{ fontSize: 'clamp(10px, 1.1vh, 13px)', color: T_sub, fontWeight: 600, marginTop: '2px' }}>
            {compassData.plot.width_ft}' × {compassData.plot.depth_ft}' — {compassData.plot.facing} Facing — {compassData.plot.type}
          </div>
        </div>

        {/* Style Switcher */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {STYLES.map(s => (
            <GazeButton key={s} id={`vs-${s}`} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="navigationButton"
              onClick={() => setStyle(s)}
              style={{
                padding: '8px 12px', minHeight: 'clamp(84px, 9vh, 108px)', minWidth: 'clamp(104px, 8.5vw, 136px)',
                borderRadius: '10px', fontWeight: 800,
                fontSize: 'clamp(11px, 1.35vh, 14px)', letterSpacing: '0.6px',
                background: style === s ? T_accentSubtle : T_card,
                border: `2px solid ${style === s ? STYLE_INFO[s].color : T_border}`,
                color: style === s ? STYLE_INFO[s].color : T_dim,
                fontFamily: UI_FONT,
              }}>
              {STYLE_INFO[s].icon} {STYLE_INFO[s].label}
            </GazeButton>
          ))}
        </div>

        {/* Floor Toggle */}
        {hasFF && (
          <div style={{ display: 'flex', gap: '8px', marginLeft: '0px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {(['ground', 'first'] as const).map(f => (
              <GazeButton key={f} id={`vf-${f}`} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="navigationButton"
                onClick={() => setFloor(f)}
                style={{
                  padding: '8px 12px', minHeight: 'clamp(84px, 9vh, 108px)', minWidth: 'clamp(96px, 8vw, 128px)',
                  borderRadius: '10px', fontWeight: 800,
                  fontSize: 'clamp(11px, 1.35vh, 14px)',
                  background: floor === f ? T_accentSubtle : T_card,
                  border: `2px solid ${floor === f ? T_accent : T_border}`,
                  color: floor === f ? T_accent : T_dim,
                  fontFamily: UI_FONT,
                }}>
                {f === 'ground' ? 'GND' : '1F'}
              </GazeButton>
            ))}
          </div>
        )}

        {/* Close */}
        <GazeButton id="close-fpv" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
          onClick={onClose}
          style={{
            padding: '10px 18px', minHeight: 'clamp(84px, 9vh, 108px)', minWidth: 'clamp(116px, 9vw, 150px)',
            borderRadius: '10px', fontWeight: 900, fontSize: 'clamp(15px, 1.7vh, 19px)',
            background: T_card, border: `2px solid ${T_danger}`, color: T_text, marginLeft: '0px',
            fontFamily: UI_FONT,
          }}>
          ✕ CLOSE
        </GazeButton>
      </div>

      {/* ═══ MAIN BODY ═══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Left Panel: Mini-Map + Data + Downloads ── */}
        <div style={{
          width: 'clamp(320px, 28vw, 420px)', flexShrink: 0,
          background: T_panel, borderRight: `2px solid ${T_border}`,
          display: 'flex', flexDirection: 'column', gap: '20px',
          padding: 'clamp(24px, 3vh, 32px)', overflowY: 'auto',
        }}>
          {/* Mini-Map */}
          <div>
            <div style={{ fontSize: '11px', color: T_dim, fontWeight: 800, letterSpacing: '1.5px', marginBottom: '8px' }}>
              CELL MAPPING — {floor === 'first' ? '1ST FLOOR' : 'GROUND'}
            </div>
            <CellGridMiniMap
              compassData={compassData}
              floor={floor}
              miniBg={T_modalBg}
              miniBorder={T_border}
              miniEmptyCellBg={isLight ? '#FAF5E8' : isMix ? '#241E16' : undefined}
              miniEmptyText={isLight ? '#9A8568' : isMix ? '#8E7E62' : undefined}
              miniDataText={isLight ? '#FBE9DE' : isMix ? '#FFFCF1' : undefined}
            />
          </div>

          {/* Room Legend */}
          <div style={{ background: T_card, borderRadius: '8px', padding: '12px', border: `1px solid ${T_border}` }}>
            <div style={{ fontSize: '11px', color: T_dim, fontWeight: 800, letterSpacing: '1.5px', marginBottom: '8px' }}>
              ROOMS ({floor === 'first' ? ffCount : gfCount})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(floor === 'first' ? compassData.first_floor : compassData.ground_floor)?.placements?.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0,
                    background: ROOM_COLORS[p.roomId] || '#78909C',
                  }} />
                  <span style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: T_sub, fontWeight: 700, flex: 1 }}>
                    {p.room}
                  </span>
                  <span style={{ fontSize: '11px', color: T_dim, fontWeight: 800 }}>
                    {p.area_sqft}ft²
                  </span>
                </div>
              )) || <span style={{ fontSize: '12px', color: T_dim }}>No rooms placed</span>}
            </div>
          </div>

          {/* Plan Data */}
          <div style={{ background: T_card, borderRadius: '8px', padding: '12px', border: `1px solid ${T_border}` }}>
            <div style={{ fontSize: '11px', color: T_dim, fontWeight: 800, letterSpacing: '1.5px', marginBottom: '8px' }}>
              PLOT INFO
            </div>
            {[
              ['Plot', `${compassData.plot.width_ft}' × ${compassData.plot.depth_ft}'`],
              ['Total Area', `${compassData.plot.width_ft * compassData.plot.depth_ft} sq ft`],
              ['Grid', `${compassData.grid_size.rows}×${compassData.grid_size.cols}`],
              ['Coverage', `${(floor === 'first' ? compassData.first_floor : compassData.ground_floor)?.coverage_percent || 0}%`],
              ['Style', STYLE_INFO[style].label],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ fontSize: '13px', color: T_sub, fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: '13px', color: T_text, fontWeight: 800 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Custom notes for advanced fusion */}
          <div style={{ background: T_card, borderRadius: '8px', padding: '12px', border: `1px solid ${T_border}` }}>
            <div style={{ fontSize: '11px', color: T_dim, fontWeight: 800, letterSpacing: '1.5px', marginBottom: '8px' }}>
              CUSTOM PLAN NOTES (OPTIONAL)
            </div>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Example: Elderly-friendly access, larger kitchen, private guest room..."
              style={{
                width: '100%',
                minHeight: '84px',
                resize: 'vertical',
                background: T_elevated,
                color: T_text,
                border: `1px solid ${T_border}`,
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: 1.4,
                fontFamily: UI_FONT,
              }}
            />
            <GazeButton id="apply-custom-notes" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="compassMapAction"
              onClick={() => {
                setAppliedNotes(customNotes.trim());
                onSpeak('Custom notes applied. Regenerating floor plan.');
              }}
              style={{
                marginTop: '10px',
                width: '100%',
                minHeight: 'clamp(84px, 9vh, 108px)',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '13px',
                textTransform: 'uppercase',
                background: T_accentSubtle,
                border: `2px solid ${T_accent}`,
                color: T_accent,
                fontFamily: UI_FONT,
              }}>
              APPLY NOTES
            </GazeButton>
          </div>



          {/* Backend Status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0',
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: backendOk === true ? T.success : backendOk === false ? T_danger : T.warn,
            }} />
            <span style={{ fontSize: '9px', color: T_dim }}>
              {backendOk === true ? 'Backend connected' : backendOk === false ? 'Backend offline' : 'Checking...'}
            </span>
          </div>
        </div>

        {/* ── Main Image Area ── */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: T_modalBg, overflow: 'auto', position: 'relative',
          padding: 'clamp(4px, 0.8vh, 12px)',
        }}>
          {loading && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '52px', height: '52px',
                border: '4px solid rgba(45,212,191,0.2)', borderTopColor: T_accent,
                borderRadius: '50%', animation: 'fpv-spin 1s linear infinite',
                margin: '0 auto 16px',
              }} />
              <div style={{ color: T_sub, fontSize: 'clamp(14px, 1.8vh, 18px)', fontWeight: 700 }}>
                Generating {STYLE_INFO[style].label} Floor Plan...
              </div>
              <div style={{ color: T_dim, fontSize: 'clamp(10px, 1.2vh, 13px)', marginTop: '8px' }}>
                PyCairo render engine • IS 962:1989 standards
              </div>
            </div>
          )}

          {error && !loading && (
            <div style={{ textAlign: 'center', maxWidth: '480px', padding: '32px' }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>⚠️</div>
              <div style={{ color: T_danger, fontSize: 'clamp(16px, 2vh, 22px)', fontWeight: 800, marginBottom: '10px' }}>
                Generation Failed
              </div>
              <div style={{ color: T_sub, fontSize: 'clamp(11px, 1.4vh, 15px)', lineHeight: 1.5, marginBottom: '16px' }}>
                {error}
              </div>
              <div style={{ color: T_dim, fontSize: 'clamp(10px, 1.2vh, 13px)', lineHeight: 1.5, marginBottom: '20px', background: T_card, padding: '12px', borderRadius: '8px', textAlign: 'left' }}>
                <strong>To start the backend:</strong><br />
                <code style={{ color: T_accent }}>cd tools && python floorplan_server.py</code><br /><br />
                This runs on port 5050 and serves the PyCairo floor plan generator as an HTTP API.
              </div>
              <GazeButton id="retry-gen" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="navigationButton"
                onClick={doGenerate}
                style={{
                  padding: '10px 24px', minHeight: 'clamp(84px, 9vh, 108px)', borderRadius: '10px',
                  background: T_accentSubtle, border: `2px solid ${T_accent}`,
                  color: T_accent, fontWeight: 800, fontSize: 'clamp(12px, 1.4vh, 16px)',
                }}>
                RETRY
              </GazeButton>
            </div>
          )}

          {imageUrl && !loading && !error && (
            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={imageUrl}
                alt={`Floor Plan — ${STYLE_INFO[style].label}`}
                style={{
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
                }}
              />
              <GazeButton id="magnify-btn" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="navigationButton"
                onClick={() => setIsFullscreen(true)}
                style={{
                  position: 'absolute', bottom: '60px', right: '320px', // Further inward, above the downloads
                  width: '120px', height: '120px', borderRadius: '60px',
                  background: T_panel, border: `4px solid ${T_accent}`, color: T_accent,
                  fontSize: '72px', fontWeight: 900,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.24)',
                  cursor: 'pointer', zIndex: 50,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
                }}>
                ＋
              </GazeButton>

              {/* Downloads — Now floating on the right side */}
              <div style={{
                position: 'absolute', right: '24px', bottom: '24px',
                background: T_panel,
                border: `2px solid ${T_border}`, borderRadius: '16px',
                padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
                boxShadow: '0 8px 20px rgba(0,0,0,0.22)',
                zIndex: 40, width: '220px',
              }}>
                <div style={{ fontSize: '13px', color: T_dim, fontWeight: 900, letterSpacing: '2px', textAlign: 'center' }}>
                  DOWNLOAD PLAN
                </div>
                {(['png', 'pdf', 'svg'] as const).map(fmt => (
                  <GazeButton key={fmt} id={`dl-${fmt}`} gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="navigationButton"
                    onClick={() => handleDownload(fmt)}
                    style={{
                      padding: '16px 12px', minHeight: 'clamp(84px, 9vh, 108px)', borderRadius: '12px',
                      fontWeight: 900, fontSize: 'clamp(18px, 2vh, 22px)',
                      background: T_card, border: `3px solid ${T_border}`,
                      color: T_blue, textTransform: 'uppercase' as const,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                      fontFamily: UI_FONT,
                    }}>
                    ⬇ {fmt}
                  </GazeButton>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ FULLSCREEN OVERLAY ═══ */}
      {isFullscreen && imageUrl && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: T_modalBg, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', // No padding, allow full bleed
        }}>
          <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
            <img
              src={imageUrl}
              alt="Fullscreen Floor Plan"
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'contain', // Maximizes image without cropping
                objectPosition: 'center',
              }}
            />
          </div>
          <GazeButton id="minimize-btn" gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode dwellCategory="backSkipButton"
            onClick={() => setIsFullscreen(false)}
            style={{
              position: 'absolute', bottom: '60px', right: '80px', // Further inward from corner
              width: '140px', height: '140px', borderRadius: '70px',
              background: T_panel, border: `4px solid ${T_danger}`, color: T_danger,
              fontSize: '84px', fontWeight: 900,
              boxShadow: '0 8px 22px rgba(0,0,0,0.24)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              zIndex: 10001,
            }}>
            ━
          </GazeButton>
        </div>
      )}

      <style>{`@keyframes fpv-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default React.memo(FloorPlanViewerModal);
