import React, { useState, useCallback, useEffect } from 'react';
import GazeButton from './core/GazeButton';
import { useDwellTime } from '../contexts/DwellTimeContext';
import { darkColors, screenThemes, typography } from '../utils/design';

/*
 * ZONE BOARD (Connected Spatial Grid)
 * 
 * Layout: 3-Row Grid with thin 1px separators (Connected Unit)
 * Row 1: TopLeft (A-F) | FrontWall (K-P) | TopRight (Q-T)
 * Row 2: LeftWall (G-J)| [REST AREA]     | RightWall (U-Z)
 * Row 3: DELETE | 3 | 4 | 5 | 6 | 7+ | SPACE
 */

interface ZoneData {
  id: string;
  label: string;
  letters: string[];
  area: string; // grid-area name
}

const ZONES: ZoneData[] = [
  // ROW 1
  { id: 'topLeft', label: 'TOP LEFT', letters: ['A', 'B', 'C', 'D', 'E', 'F'], area: 'topLeft' },
  { id: 'front', label: 'FRONT', letters: ['K', 'L', 'M', 'N', 'O', 'P'], area: 'front' },
  { id: 'topRight', label: 'TOP RIGHT', letters: ['Q', 'R', 'S', 'T'], area: 'topRight' },
  // ROW 2
  { id: 'left', label: 'LEFT', letters: ['G', 'H', 'I', 'J'], area: 'left' },
  // CENTER: Dead Zone
  { id: 'right', label: 'RIGHT', letters: ['U', 'V', 'W', 'X', 'Y', 'Z'], area: 'right' },
];

const UI_FONT = typography.fontFamily.primary;
const BORDER = screenThemes.keyboard.keyBorder;
const PANEL_BG = screenThemes.keyboard.textAreaBg;
const CELL_BG = screenThemes.keyboard.keyBg;
const TEXT_MAIN = darkColors.text.primary;
const TEXT_SUB = darkColors.text.secondary;
const TEXT_DIM = screenThemes.keyboard.keyTextMuted;
const SUCCESS_BG = 'rgba(33, 50, 42, 0.96)';
const SUCCESS_BORDER = '#8FB49B';
const SUCCESS_TEXT = '#D9EBDD';

interface ZoneBoardProps {
  onLetterTyped: (letter: string) => void;
  onNumberSelected?: (num: string) => void;
  onDelete?: () => void;
  onSpace?: () => void;
  onSpeak?: () => void;
  onClear?: () => void;
  onAnnounce?: (text: string) => void;
  gazeEnabled?: boolean;
  gazeEnabledTimestamp?: number;
  isDarkMode?: boolean;
  style?: React.CSSProperties;
  currentWord?: string;
}

const ZoneBoard: React.FC<ZoneBoardProps> = ({
  onLetterTyped,
  onNumberSelected,
  onDelete,
  onSpace,
  onAnnounce,
  gazeEnabled = false,
  gazeEnabledTimestamp = 0,
  style,
  currentWord = '',
}) => {
  const [activeZone, setActiveZone] = useState<ZoneData | null>(null);
  const { settings } = useDwellTime();
  const [interactionEnabled, setInteractionEnabled] = useState(true);

  // Buffer time when entering a zone to prevent accidental clicks
  useEffect(() => {
    if (activeZone) {
      setInteractionEnabled(false);
      // Moderate buffer: prevents accidental clicks without feeling too slow.
      const bufferTime = Math.max(1300, Math.round(settings.standardButton * 1.5));
      const timer = setTimeout(() => {
        setInteractionEnabled(true);
      }, bufferTime);
      return () => clearTimeout(timer);
    } else {
      setInteractionEnabled(true);
    }
  }, [activeZone, settings.standardButton]);

  // --- HANDLERS ---

  const handleZoneClick = useCallback((zone: ZoneData) => {
    setActiveZone(zone);
    onAnnounce?.(zone.label);
  }, [onAnnounce]);

  const handleBack = useCallback(() => {
    setActiveZone(null);
  }, []);

  const handleLetterClick = useCallback((char: string) => {
    onLetterTyped(char);
    setActiveZone(null); // Auto-return
  }, [onLetterTyped]);


  // --- RENDERERS ---

  // 1. MAIN OVERVIEW (The Connected Room)
  const renderOverview = () => {
    return (
      <div style={{
        display: 'grid',
        width: '100%',
        height: '100%',
        // 3 Rows: zones, zones, functional
        gridTemplateAreas: `
          "topLeft front topRight"
          "left    center right"
          "functional functional functional"
        `,
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1.06fr 0.72fr', // Give the current-word row slightly more room without materially shrinking functional keys
        gap: '1px', // Thin separator
        backgroundColor: BORDER,
        borderRadius: '16px', // Rounded outer corners for the whole unit
        overflow: 'hidden',
        border: `1px solid ${BORDER}`,
        ...style,
      }}>
        {/* ZONES */}
        {ZONES.map((zone) => (
          <GazeButton
            key={zone.id}
            id={`zone-${zone.id}`}
            gazeEnabled={gazeEnabled}
            gazeEnabledTimestamp={gazeEnabledTimestamp}
            onClick={() => handleZoneClick(zone)}
            dwellCategory="spatialZone"
            style={{
              gridArea: zone.area,
              width: '100%',
              height: '100%',
              backgroundColor: CELL_BG,
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              // No individual border radius to look connected
            }}
          >
            {/* Label */}
            <div style={{
              fontSize: 'clamp(12px, 1.3vh, 15px)',
              fontWeight: 700,
              color: TEXT_DIM,
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontFamily: UI_FONT,
            }}>{zone.label}</div>

            {/* Content Preview */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
            }}>
              {zone.letters.map(l => (
                <span key={l} style={{
                  fontSize: 'clamp(36px, 4.4vh, 54px)',
                  fontWeight: 800,
                  color: TEXT_MAIN,
                  width: '40px',
                  textAlign: 'center',
                  fontFamily: UI_FONT,
                }}>{l}</span>
              ))}
            </div>
          </GazeButton>
        ))}

        {/* DEAD ZONE */}
        <div style={{
          gridArea: 'center',
          backgroundColor: PANEL_BG,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {currentWord.trim() ? (
            <>
              <div style={{
                fontSize: 'clamp(11px, 1.25vh, 15px)',
                fontWeight: 700,
                color: TEXT_DIM,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontFamily: UI_FONT,
              }}>
                Current Word
              </div>
              <div style={{
                fontSize: 'clamp(44px, 5.2vh, 68px)',
                fontWeight: 900,
                color: TEXT_MAIN,
                textAlign: 'center',
                lineHeight: 1.02,
                padding: '0 18px',
                maxWidth: '92%',
                wordBreak: 'break-word',
                fontFamily: UI_FONT,
              }}>
                {currentWord}
              </div>
            </>
          ) : (
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: BORDER,
              opacity: 0.5
            }} />
          )}
        </div>

        {/* FUNCTIONAL ROW (Nested Grid for perfect alignment) */}
        <div style={{
          gridArea: 'functional',
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr 1fr 1fr 1fr 1fr 1.25fr', // Reduced DEL/SPACE width to widen numbers
          gap: '1px', // Keep the thin lines
          backgroundColor: BORDER,
          width: '100%',
          height: '100%',
        }}>
          {/* DELETE */}
          <GazeButton
            id="zb-delete"
            gazeEnabled={gazeEnabled}
            gazeEnabledTimestamp={gazeEnabledTimestamp}
            onClick={onDelete}
            style={{
              backgroundColor: '#7F1D1D', // Red 900
              color: '#FECACA',
              fontWeight: 800,
              fontSize: 'clamp(20px, 2.4vh, 26px)',
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: UI_FONT,
            }}
          >DEL</GazeButton>

          {/* NUMBERS */}
          {['3', '4', '5', '6', '7+'].map((val) => (
            <GazeButton
              key={val}
              id={`zb-len-${val}`}
              gazeEnabled={gazeEnabled}
              gazeEnabledTimestamp={gazeEnabledTimestamp}
              onClick={() => onNumberSelected?.(val)}
              style={{
                backgroundColor: CELL_BG,
                color: TEXT_MAIN,
                fontWeight: 800,
                fontSize: 'clamp(28px, 3.4vh, 36px)',
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: UI_FONT,
              }}
            >{val}</GazeButton>
          ))}

          {/* SPACE */}
          <GazeButton
            id="zb-space"
            gazeEnabled={gazeEnabled}
            gazeEnabledTimestamp={gazeEnabledTimestamp}
            onClick={onSpace}
            style={{
              backgroundColor: SUCCESS_BG,
              color: SUCCESS_TEXT,
              border: `1px solid ${SUCCESS_BORDER}`,
              fontWeight: 800,
              fontSize: 'clamp(20px, 2.4vh, 26px)',
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: UI_FONT,
            }}
          >SPACE</GazeButton>
        </div>

      </div>
    );
  };


  // 2. ZOOMED VIEW (Connected Grid)
  const renderZoomed = (zone: ZoneData) => {
    // 3 columns, auto rows.
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: zone.letters.length > 5 ? '1fr 1fr 0.5fr' : '1fr 1fr',
        gap: '1px',
        backgroundColor: BORDER,
        borderRadius: '16px',
        overflow: 'hidden',
        border: `1px solid ${BORDER}`,
      }}>
        {/* Letters */}
        {zone.letters.map((char) => (
          <GazeButton
            key={char}
            id={`zb-char-${char}`}
            gazeEnabled={gazeEnabled && interactionEnabled}
            gazeEnabledTimestamp={gazeEnabledTimestamp}
            onClick={() => handleLetterClick(char)}
            style={{
              backgroundColor: CELL_BG,
              color: TEXT_MAIN,
              fontSize: 'clamp(60px, 12vh, 100px)',
              fontWeight: 800,
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: UI_FONT,
            }}
          >
            {char}
          </GazeButton>
        ))}

        {/* Back Button */}
        <GazeButton
          id="zb-back"
          gazeEnabled={gazeEnabled && interactionEnabled}
          gazeEnabledTimestamp={gazeEnabledTimestamp}
          onClick={handleBack}
          dwellCategory="navigationButton"
          style={{
            gridColumn: zone.letters.length > 5 ? '1 / -1' : 'auto', // Span if needed
            backgroundColor: screenThemes.keyboard.keyHoverBg,
            color: TEXT_SUB,
            fontSize: '26px',
            fontWeight: 700,
            textTransform: 'uppercase',
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: UI_FONT,
          }}
        >
          BACK
        </GazeButton>
      </div>
    );
  };

  return activeZone ? renderZoomed(activeZone) : renderOverview();
};

export default React.memo(ZoneBoard);
