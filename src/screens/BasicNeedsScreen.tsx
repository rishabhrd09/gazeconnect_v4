/**
 * GazeConnect Pro - Basic Needs / Daily Care Screen (v4.0 — AAC Compliant Rewrite)
 * ==================================================================================
 * Changes from v3.0:
 *  - Replaced raw <button> with GazeButton (consistent dwell system)
 *  - Font: clamp(20px, 2.4vh, 28px) English / clamp(17px, 2vh, 24px) Hindi
 *  - Grid: 3-column (was 5) — safer for gaze, wider targets
 *  - Gap: 18px (was 10px) — meets AAC ≥16px dead zone standard
 *  - minHeight: clamp(96px, 11vh, 120px) on every button — hard floor
 */
import React from 'react';
import { darkColors, lightColors, mixColors } from '../utils/design';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  onNavigate: (s: string) => void;
  onSpeak: (t: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

interface Item { en: string; hi: string; }

const BasicNeedsScreen: React.FC<Props> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix } = useTheme();
  const { basicNeeds: NEEDS } = useCustomization();

  return (
    <div
      className={`needs-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        backgroundColor: isMix ? mixColors.home.root : colors.background.primary,
        padding: '8px 16px 12px 16px', gap: '8px',
      }}
    >
      {/* GlobalNavBar */}
      <GlobalNavBar
        currentPage="needs"
        onNavigate={onNavigate}
        onSpeak={onSpeak}
        isDarkMode={isDarkMode}
      />

      {/* 3-column grid — AAC compliant sizing */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '18px',
        padding: '8px 4px',
        overflowY: 'auto',
        alignContent: 'start',
      }}>
        {NEEDS.map((n: Item) => (
          <GazeButton
            key={n.en}
            id={`need-${n.en.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => onSpeak(n.en)}
            isDarkMode={isDarkMode}
            gazeEnabled={isGazeEnabled}
            gazeEnabledTimestamp={lastEnabledTimestamp}
            dwellCategory="phraseButton"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'clamp(96px, 11vh, 120px)',
              padding: 'clamp(14px, 1.8vh, 20px) clamp(12px, 1.5vw, 20px)',
              background: isMix ? mixColors.home.tileSurfaces.med : 'linear-gradient(145deg, rgba(50,62,75,0.65) 0%, rgba(40,52,65,0.55) 100%)',
              border: isMix ? `1.5px solid ${mixColors.home.cardBorder}` : `2px solid rgba(90,110,130,0.45)`,
              borderRadius: '16px',
              boxShadow: isMix ? mixColors.home.cardShadow : '0 4px 14px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{
              fontSize: 'clamp(20px, 2.4vh, 28px)',
              fontWeight: 600,
              color: isMix ? mixColors.home.text : '#FFFFFF',
              textAlign: 'center',
              lineHeight: 1.2,
              fontFamily: "'Atkinson Hyperlegible Next', 'Inter', 'Segoe UI', system-ui, sans-serif",
            }}>
              {n.en}
            </span>
            {showHindi && (
              <span style={{
                fontSize: 'clamp(22px, 2.6vh, 30px)',
                fontWeight: 600,
                color: isMix ? mixColors.home.subtleText : 'rgba(200,215,230,0.85)',
                textAlign: 'center',
                lineHeight: 1.3,
                marginTop: '8px',
                fontFamily: "'Noto Sans Devanagari', 'Baloo 2', sans-serif",
              }}>
                {n.hi}
              </span>
            )}
          </GazeButton>
        ))}
      </div>
    </div>
  );
};

export default React.memo(BasicNeedsScreen);
