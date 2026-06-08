/**
 * GazeConnect Pro - Feelings Screen (v4.0 — AAC Compliant Rewrite)
 * ==================================================================================
 * Changes from v3.0:
 *  - Replaced raw <button data-gaze> with GazeButton (matches BasicNeedsScreen /
 *    PhrasesScreen pattern). The previous FeelingBtn ran its own rAF dwell loop
 *    AND drew a per-button progress bar, while GazeCursor was simultaneously
 *    tracking dwell on the same element via data-gaze — two competing dwell
 *    systems caused inconsistent timing and visual noise that degraded gaze
 *    accuracy vs. the keyboard.
 *  - Uses dwellCategory="phraseButton" so Settings → Dwell Times → "Phrase Button"
 *    actually applies here (it previously hardcoded dwellTiming.contexts.phrases).
 *  - Removed nested transform:scale(1.03) on hover — GazeButton already applies
 *    scale(1.02) internally; stacking caused 5% layout shift that bled gaze into
 *    adjacent tiles.
 *  - Bumped grid gap 10px → 14px responsive to match AAC ≥12px dead-zone standard
 *    and reduce eye-tracker jitter mis-fires between adjacent tiles.
 */
import React from 'react';
import { darkColors, lightColors, mixColors } from '../utils/design';
import GazeButton from '../components/core/GazeButton';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';

interface Props { onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode?: boolean; showHindi?: boolean; }
interface Item { en: string; hi: string; }

const FeelingScreen: React.FC<Props> = ({ onNavigate, onSpeak, isDarkMode = true, showHindi = false }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const { feelings: FEELINGS } = useCustomization();

  const tileBg = isMix ? mixColors.home.tileSurfaces.ph : isWarm ? '#FBF5E5' : colors.background.secondary;
  const tileBorder = isMix
    ? `1.5px solid ${mixColors.home.cardBorder}`
    : isWarm
      ? '1.5px solid #DED2C2'
      : `2px solid ${colors.border.main}`;
  const tileShadow = isMix
    ? mixColors.home.cardShadow
    : isWarm
      ? '0 6px 16px rgba(122, 99, 71, 0.12), 0 1px 3px rgba(122, 99, 71, 0.08)'
      : undefined;
  const tileTextEn = isMix ? mixColors.home.text : isWarm ? '#2F2A26' : colors.text.primary;
  const tileTextHi = isMix ? mixColors.home.subtleText : isWarm ? '#5C4F44' : colors.text.secondary;

  return (
    <div
      className={`feelings-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : isWarm ? ' theme-warm' : ''}`}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        backgroundColor: isMix ? mixColors.home.root : isWarm ? '#F5EEDF' : colors.background.primary,
        padding: '8px', gap: '8px',
      }}
    >
      {/* GlobalNavBar - Home, Keyboard, Medical, Emergency */}
      <GlobalNavBar
        currentPage="feelings"
        onNavigate={onNavigate}
        onSpeak={onSpeak}
        isDarkMode={isDarkMode}
      />
      <div
        style={{
          flex: 1, minHeight: 0,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          // v4: gap 10px → clamp(12px, 1.4vw, 18px). The old 10px gap was below
          // the AAC ≥12px dead-zone standard, so micro-saccades could flip dwell
          // between adjacent tiles. Larger gap = stable target.
          gap: 'clamp(12px, 1.4vw, 18px)',
          padding: '4px', overflow: 'hidden',
        }}
      >
        {FEELINGS.map((f: Item) => (
          <GazeButton
            key={f.en}
            id={`feeling-${f.en.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => onSpeak(f.en)}
            isDarkMode={isDarkMode}
            gazeEnabled={isGazeEnabled}
            gazeEnabledTimestamp={lastEnabledTimestamp}
            dwellCategory="phraseButton"
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              // AAC minimum 80px target — clamped responsively
              minHeight: 'clamp(96px, 11vh, 132px)',
              padding: 'clamp(10px, 1.5vh, 16px) 10px',
              backgroundColor: tileBg,
              border: tileBorder,
              borderRadius: '12px',
              boxShadow: tileShadow,
              cursor: 'pointer',
              gap: '6px',
              transition: 'background-color 0.15s ease',
            }}
          >
            <span style={{
              fontSize: 'clamp(13px, 1.8vh, 19px)', fontWeight: 600,
              color: tileTextEn, textAlign: 'center', lineHeight: 1.3,
            }}>
              {f.en}
            </span>
            {showHindi && (
              <span style={{
                fontSize: 'clamp(20px, 2.4vh, 30px)', fontWeight: 600,
                color: tileTextHi, textAlign: 'center', marginTop: '8px',
                fontFamily: "'Noto Sans Devanagari', 'Baloo 2', sans-serif",
                lineHeight: 1.3,
              }}>
                {f.hi}
              </span>
            )}
          </GazeButton>
        ))}
      </div>
    </div>
  );
};
export default React.memo(FeelingScreen);
