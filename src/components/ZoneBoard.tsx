import React, { useState, useCallback, useEffect } from 'react';
import GazeButton from './core/GazeButton';
import { useDwellTime } from '../contexts/DwellTimeContext';
import { useTheme } from '../contexts/ThemeContext';
import { screenThemes, typography } from '../utils/design';

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
const KEYBOARD_THEME = screenThemes.keyboard;
const BORDER = KEYBOARD_THEME.keyBorder;
const PANEL_BG = KEYBOARD_THEME.textAreaBg;
const CELL_BG = KEYBOARD_THEME.keyBg;
const TEXT_MAIN = KEYBOARD_THEME.keyText;
const TEXT_SUB = KEYBOARD_THEME.keyTextMuted;
const TEXT_DIM = KEYBOARD_THEME.keyTextMuted;
const SUCCESS_BG = KEYBOARD_THEME.speakBg;
const SUCCESS_BORDER = KEYBOARD_THEME.speakBorder;
const SUCCESS_TEXT = KEYBOARD_THEME.speakText;
const DELETE_BG = KEYBOARD_THEME.deleteWordSoftBg;
const DELETE_BORDER = KEYBOARD_THEME.deleteWordSoftBorder;
const DELETE_TEXT = KEYBOARD_THEME.deleteWordSoftText;

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
  const { isLight, isWarm } = useTheme();
  // Theme-aware tokens — research-grounded AAC zone palette.
  // Citations: Tobii Communicator 5 / Smartbox Grid 3 (colored borders on
  // neutral fills), Modified Fitzgerald Key (red=corrective, green=positive),
  // Wilkinson/Thistle PMC4599784 (muted tints + colored borders > saturated).
  const isPaper = isLight || isWarm;
  const T_BORDER = isPaper ? '#DED2C2' : BORDER;
  const T_PANEL_BG = isLight ? '#EEE9DC' : isWarm ? '#F8F1DF' : PANEL_BG;
  const T_CELL_BG = isLight ? '#FAF5E8' : isWarm ? '#FBF5E5' : CELL_BG;
  const T_TEXT_MAIN = isPaper ? '#2F2A26' : TEXT_MAIN;
  const T_TEXT_SUB = isPaper ? '#6A625B' : TEXT_SUB;
  const T_TEXT_DIM = isPaper ? '#6A625B' : TEXT_DIM;
  // Speak / positive — sage (Modified Fitzgerald)
  const T_SUCCESS_BG = isPaper ? '#DFE8DC' : SUCCESS_BG;
  const T_SUCCESS_BORDER = isPaper ? '#5F7C58' : SUCCESS_BORDER;       // deeper sage
  const T_SUCCESS_TEXT = isPaper ? '#3F5A38' : SUCCESS_TEXT;            // sage text-safe
  // Backspace / corrective — coral
  const T_DELETE_BG = isPaper ? '#F1DBD1' : DELETE_BG;
  const T_DELETE_BORDER = isPaper ? '#A56D55' : DELETE_BORDER;          // deeper coral
  const T_DELETE_TEXT = isPaper ? '#7A312E' : DELETE_TEXT;              // deeper warm maroon
  // Letter hover — subtle warm-amber lift (Solarized)
  const T_KEY_HOVER_BG = isLight ? '#F2E6C7' : isWarm ? '#F5EAC8' : KEYBOARD_THEME.keyHoverBg;

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
        backgroundColor: T_BORDER,
        borderRadius: '14px', // Rounded outer corners for the whole unit
        overflow: 'hidden',
        border: `1px solid ${T_BORDER}`,
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
              backgroundColor: T_CELL_BG,
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
              fontSize: 'clamp(14px, 1.45vh, 18px)',
              fontWeight: 760,
              color: T_TEXT_DIM,
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
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
                  fontSize: 'clamp(38px, 4.5vh, 56px)',
                  fontWeight: 800,
                  color: T_TEXT_MAIN,
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
          backgroundColor: T_PANEL_BG,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {currentWord.trim() ? (
            <>
              <div style={{
                fontSize: 'clamp(14px, 1.45vh, 18px)',
                fontWeight: 760,
                color: T_TEXT_DIM,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontFamily: UI_FONT,
              }}>
                Current Word
              </div>
              <div style={{
                fontSize: 'clamp(44px, 5.3vh, 62px)',
                fontWeight: 820,
                color: T_TEXT_MAIN,
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
              backgroundColor: T_BORDER,
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
          backgroundColor: T_BORDER,
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
              backgroundColor: T_DELETE_BG,
              border: `1px solid ${T_DELETE_BORDER}`,
              color: T_DELETE_TEXT,
              fontWeight: 800,
              fontSize: 'clamp(22px, 2.5vh, 32px)',
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
                backgroundColor: T_CELL_BG,
                border: `1px solid ${T_BORDER}`,
                color: T_TEXT_MAIN,
                fontWeight: 800,
                fontSize: 'clamp(34px, 4vh, 46px)',
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
              backgroundColor: T_SUCCESS_BG,
              color: T_SUCCESS_TEXT,
              border: `1px solid ${T_SUCCESS_BORDER}`,
              fontWeight: 800,
              fontSize: 'clamp(24px, 2.9vh, 36px)',
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
        backgroundColor: T_BORDER,
        borderRadius: '14px',
        overflow: 'hidden',
        border: `1px solid ${T_BORDER}`,
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
              backgroundColor: T_CELL_BG,
              border: `1px solid ${T_BORDER}`,
              color: T_TEXT_MAIN,
              fontSize: 'clamp(66px, 11.2vh, 108px)',
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
            backgroundColor: T_KEY_HOVER_BG,
            border: `1px solid ${T_BORDER}`,
            color: T_TEXT_SUB,
            fontSize: 'clamp(28px, 3.2vh, 40px)',
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
