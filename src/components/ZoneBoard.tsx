import React, { useState, useCallback, useEffect } from 'react';
import GazeButton from './core/GazeButton';
import { useDwellTime } from '../contexts/DwellTimeContext';

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
        gridTemplateRows: '1fr 1fr 0.75fr', // Prioritize Alphabet rows (1 & 2) over Functional row (3)
        gap: '1px', // Thin separator
        backgroundColor: '#475569', // The separator line color (Slate 600)
        borderRadius: '16px', // Rounded outer corners for the whole unit
        overflow: 'hidden',
        border: '1px solid #475569',
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
              backgroundColor: '#1E293B', // Slate 800 cell background
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
              fontSize: 'clamp(12px, 1.4vh, 16px)',
              fontWeight: 700,
              color: '#64748B', // Slate 500
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>{zone.label}</div>

            {/* Content Preview */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
            }}>
              {zone.letters.map(l => (
                <span key={l} style={{
                  fontSize: 'clamp(32px, 4vh, 48px)', // Massive
                  fontWeight: 800,
                  color: 'inherit',
                  width: '40px',
                  textAlign: 'center',
                }}>{l}</span>
              ))}
            </div>
          </GazeButton>
        ))}

        {/* DEAD ZONE */}
        <div style={{
          gridArea: 'center',
          backgroundColor: '#0F172A', // Darker to indicate empty
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {currentWord.trim() ? (
            <>
              <div style={{
                fontSize: 'clamp(12px, 1.4vh, 16px)',
                fontWeight: 700,
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}>
                Current Word
              </div>
              <div style={{
                fontSize: 'clamp(34px, 4.2vh, 54px)',
                fontWeight: 800,
                color: '#E2E8F0',
                textAlign: 'center',
                lineHeight: 1.1,
                padding: '0 16px',
                wordBreak: 'break-word',
              }}>
                {currentWord}
              </div>
            </>
          ) : (
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#334155',
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
          backgroundColor: '#475569', // Separator color
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
              fontSize: 'clamp(18px, 2.2vh, 24px)',
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                backgroundColor: '#1E293B',
                color: '#F8FAFC',
                fontWeight: 800,
                fontSize: 'clamp(24px, 3vh, 32px)',
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              backgroundColor: '#065F46', // Emerald 800
              color: '#D1FAE5',
              fontWeight: 800,
              fontSize: 'clamp(18px, 2.2vh, 24px)',
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
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
        backgroundColor: '#475569',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #475569',
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
              backgroundColor: '#1E293B',
              color: '#F8FAFC',
              fontSize: 'clamp(60px, 12vh, 100px)',
              fontWeight: 800,
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            backgroundColor: '#334155',
            color: '#CBD5E1',
            fontSize: '24px',
            fontWeight: 700,
            textTransform: 'uppercase',
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
