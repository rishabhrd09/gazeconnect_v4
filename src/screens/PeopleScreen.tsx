/**
 * GazeConnect Pro - People Screen (v4.0 — AAC Compliant Rewrite)
 * ==================================================================================
 * Changes from v3.1:
 *  - Replaced raw <button data-gaze> with GazeButton (matches BasicNeedsScreen /
 *    PhrasesScreen pattern). The previous PersonBtn ran its own rAF dwell loop
 *    AND drew a per-button progress bar, while GazeCursor was simultaneously
 *    tracking dwell on the same element via data-gaze — two competing dwell
 *    systems caused inconsistent timing and visual noise that degraded gaze
 *    accuracy vs. the keyboard.
 *  - Uses dwellCategory="phraseButton" so Settings → Dwell Times → "Phrase Button"
 *    actually applies here (it previously hardcoded dwellTiming.contexts.phrases).
 *  - Removed nested transform:scale(1.03) on hover — GazeButton already applies
 *    scale(1.02) internally; stacking caused ~5% layout shift that bled gaze into
 *    adjacent tiles and could cancel mid-dwell when the edge crossed into a
 *    neighbour's bounding rect.
 *  - Responsive: 13"–27" screens via clamp() — identical on 23" (1920×1080)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { darkColors, lightColors, mixColors } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';
import { MAX_ACTIVE_PEOPLE } from '../types/customization';

interface Props { onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode?: boolean; showHindi?: boolean; }

const PeopleScreen: React.FC<Props> = ({ onNavigate, onSpeak, isDarkMode = true, showHindi = false }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const [selected, setSelected] = useState<string | null>(null);
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const { people: PEOPLE } = useCustomization();
  const activePeople = useMemo(
    () => PEOPLE.filter(person => person.isActive !== false).slice(0, MAX_ACTIVE_PEOPLE),
    [PEOPLE]
  );
  const isDensePeopleGrid = activePeople.length > 6;
  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarm ? '#F5EEDF' : isWarmMode ? '#131412' : colors.background.primary;
  const phraseBg = isMix ? mixColors.home.tileSurfaces.pp : isWarm ? '#FBF5E5' : isWarmMode ? '#20221E' : colors.background.secondary;
  const phraseText = isMix ? mixColors.home.text : isWarm ? '#2F2A26' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const phraseHindi = isMix ? '#493B2E' : isWarm ? '#5C4F44' : isWarmMode ? '#C8C5B8' : colors.text.secondary;
  const phraseHover = isMix ? '#628780' : isWarm ? '#3F6968' : isWarmMode ? '#7FA39B' : '#4F6E68';

  // Per-tile chrome (matches old PersonBtn look)
  const accent = isMix ? '#628780' : isWarmMode ? '#7FA39B' : '#4F6E68';
  const tileBg = isMix ? mixColors.home.tileSurfaces.pp : isWarmMode ? '#20221E' : colors.background.secondary;
  const tileBorder = isMix
    ? mixColors.home.cardBorder
    : isWarmMode
      ? 'rgba(213,216,188,0.14)'
      : colors.border.main;
  const tileShadow = isMix
    ? mixColors.home.cardShadow
    : isWarmMode
      ? '0 8px 18px rgba(0,0,0,0.22)'
      : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)';
  const selectedTileBg = isMix
    ? 'rgba(98,135,128,0.24)'
    : isWarmMode
      ? 'rgba(127,163,155,0.16)'
      : 'rgba(79,110,104,0.12)';
  const selectedPerson = activePeople.find(p => p.name === selected) ?? activePeople[0] ?? null;

  useEffect(() => {
    if (!selected || !activePeople.some(p => p.name === selected)) {
      setSelected(activePeople[0]?.name ?? null);
    }
  }, [activePeople, selected]);

  return (
    <div
      className={`people-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : isWarm ? ' theme-warm' : ''}`}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        backgroundColor: pageBg, padding: '8px', gap: 'clamp(8px, 1vh, 14px)',
        overflow: 'hidden',
      }}
    >
      {/* GlobalNavBar - Home, Keyboard, Medical, Emergency */}
      <GlobalNavBar
        currentPage="people"
        onNavigate={onNavigate}
        onSpeak={onSpeak}
        isDarkMode={isDarkMode}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: isDensePeopleGrid ? 'clamp(14px, 1.6vh, 20px)' : 'clamp(18px, 2vh, 26px)',
          padding: isDensePeopleGrid
            ? 'clamp(14px, 1.8vh, 22px) clamp(24px, 3vw, 44px)'
            : 'clamp(20px, 2.4vh, 30px) clamp(24px, 3vw, 44px)',
          justifyItems: 'stretch',
          alignItems: 'stretch',
          flexShrink: 0,
        }}
      >
        {activePeople.map(p => {
          const isSelected = selected === p.name;
          return (
            <GazeButton
              key={p.name}
              id={`person-${p.name.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => setSelected(p.name)}
              isDarkMode={isDarkMode}
              gazeEnabled={isGazeEnabled}
              gazeEnabledTimestamp={lastEnabledTimestamp}
              dwellCategory="phraseButton"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                minHeight: isDensePeopleGrid ? 'clamp(132px, 16.8vh, 190px)' : 'clamp(164px, 21vh, 240px)',
                padding: isDensePeopleGrid
                  ? 'clamp(18px, 2.4vh, 32px) clamp(24px, 2.4vw, 38px)'
                  : 'clamp(26px, 3.2vh, 44px) clamp(34px, 3.4vw, 56px)',
                backgroundColor: isSelected ? selectedTileBg : tileBg,
                border: `1.5px solid ${isSelected ? accent : tileBorder}`,
                borderRadius: '18px',
                cursor: 'pointer',
                overflow: 'hidden',
                boxShadow: tileShadow,
                // NOTE: no transform here. GazeButton handles its own hover scale.
              }}
            >
              <span style={{
                minWidth: 0,
                maxWidth: '100%',
                fontSize: isDensePeopleGrid ? 'clamp(34px, 4vh, 48px)' : 'clamp(38px, 5vh, 62px)',
                fontWeight: 850,
                color: phraseText,
                textAlign: 'center',
                lineHeight: 1.05,
                letterSpacing: 0,
                // Keep long names readable without letting text escape the target.
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {p.name}
              </span>
            </GazeButton>
          );
        })}
      </div>

      {selectedPerson && (
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          padding: 'clamp(6px, 1vh, 12px) clamp(12px, 1.4vw, 24px) clamp(54px, 7vh, 90px)',
        }}>
          <GazeButton
            id={`selected-person-display-${selectedPerson.name}`}
            onClick={() => onSpeak(selectedPerson.name)}
            isDarkMode={isDarkMode}
            gazeEnabled={isGazeEnabled}
            gazeEnabledTimestamp={lastEnabledTimestamp}
            dwellCategory="phraseButton"
            style={{
              width: '100%',
              minHeight: isDensePeopleGrid ? 'clamp(96px, 12vh, 140px)' : 'clamp(112px, 14vh, 160px)',
              padding: isDensePeopleGrid
                ? 'clamp(16px, 2vh, 26px) clamp(20px, 2vw, 32px)'
                : 'clamp(24px, 3vh, 36px) clamp(20px, 2vw, 32px)',
              backgroundColor: phraseBg,
              border: `1.5px solid ${phraseHover}`,
              borderRadius: '18px',
              color: phraseText,
              textAlign: 'center',
              boxShadow: isMix ? mixColors.home.cardShadow : isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(6px, 1vh, 12px)',
            }}
          >
            <span style={{
              fontSize: 'clamp(34px, 4.4vh, 54px)',
              fontWeight: 800,
              color: phraseText,
              lineHeight: 1.08,
            }}>
              {selectedPerson.name}
            </span>
            {showHindi && (
              <div style={{
                fontSize: 'clamp(22px, 2.5vh, 32px)',
                fontWeight: 700,
                color: phraseHindi,
                fontFamily: "'Noto Sans Devanagari', 'Baloo 2', sans-serif",
                lineHeight: 1.2,
              }}>
                {selectedPerson.nameHi}
              </div>
            )}
          </GazeButton>
        </div>
      )}

      {/* Gaze toggle provided by GlobalNavBar at fixed bottom-center */}
    </div>
  );
};
export default React.memo(PeopleScreen);
