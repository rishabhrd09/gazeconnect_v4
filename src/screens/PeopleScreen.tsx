/**
 * GazeConnect Pro - People Screen (v3.1)
 * Responsive: 13"–27" screens via clamp() — identical on 23" (1920×1080)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { darkColors, lightColors, dwellTiming, mixColors, screenThemes } from '../utils/design';
import { useGazeControl, GAZE_ENABLE_COOLDOWN_MS } from '../components/core/GazeControlToggle';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Person } from '../types/customization';

interface Props { onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode?: boolean; showHindi?: boolean; }

const PersonBtn: React.FC<{
  person: Person; isSelected: boolean; isDarkMode: boolean;
  onSelect: () => void; gazeEnabled: boolean; lastEnabledTimestamp: number;
}> = ({ person, isSelected, isDarkMode, onSelect, gazeEnabled, lastEnabledTimestamp }) => {
  const { isLight, isMix, isWarm } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const tRef = useRef<number | null>(null);
  const dRef = useRef<NodeJS.Timeout | null>(null);
  const sRef = useRef(0);
  const dwellMs = dwellTiming.contexts.phrases;
  const colors = isDarkMode ? darkColors : lightColors;
  const isWarmMode = isDarkMode && !isLight;
  const accent = isMix ? '#628780' : isWarmMode ? '#7FA39B' : '#4F6E68';
  const cardBg = isMix ? mixColors.home.tileSurfaces.pp : isWarmMode ? '#20221E' : colors.background.secondary;
  const cardText = isMix ? mixColors.home.text : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const cardBorder = isSelected
    ? accent
    : hovered
      ? accent
      : isMix
        ? mixColors.home.cardBorder
        : isWarmMode
          ? 'rgba(213,216,188,0.14)'
          : colors.border.main;
  const avatarBg = isSelected
    ? accent
    : isMix
      ? 'rgba(199,131,143,0.22)'
      : isWarmMode
        ? 'rgba(199,131,143,0.16)'
        : colors.background.tertiary;
  const avatarText = isSelected ? '#201A15' : cardText;
  const clear = () => { if (tRef.current) cancelAnimationFrame(tRef.current); if (dRef.current) clearTimeout(dRef.current); };
  const tick = useCallback(() => { const p = Math.min(1, (Date.now() - sRef.current) / dwellMs); setProgress(p); if (p < 1) tRef.current = requestAnimationFrame(tick); }, [dwellMs]);
  const enter = () => {
    if (!gazeEnabled) return;
    if (lastEnabledTimestamp && Date.now() - lastEnabledTimestamp < GAZE_ENABLE_COOLDOWN_MS) return;
    setHovered(true); sRef.current = Date.now(); tRef.current = requestAnimationFrame(tick);
    dRef.current = setTimeout(() => { onSelect(); }, dwellMs);
  };
  const leave = () => { setHovered(false); setProgress(0); clear(); };
  useEffect(() => () => clear(), []);

  return (
    <button onMouseEnter={enter} onMouseLeave={leave}
      onClick={onSelect}
      data-gaze="true"
      data-gaze-context="phraseButton"
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 'clamp(148px, 17vh, 190px)',
        padding: 'clamp(18px, 2.4vh, 28px) clamp(14px, 1.5vw, 22px)',
        backgroundColor: isSelected ? (isMix ? 'rgba(98,135,128,0.24)' : isWarmMode ? 'rgba(127,163,155,0.16)' : 'rgba(79,110,104,0.12)') : cardBg,
        border: `1.5px solid ${cardBorder}`,
        borderRadius: '16px', cursor: 'pointer', transition: 'all 100ms', overflow: 'hidden',
        transform: hovered ? 'scale(1.03)' : 'scale(1)',
        boxShadow: isMix ? mixColors.home.cardShadow : isWarmMode ? '0 8px 18px rgba(0,0,0,0.22)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
      }}>
      {hovered && <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, width: `${progress * 100}%`, backgroundColor: accent }} />}
      <div style={{
        width: 'clamp(54px, 6.6vh, 72px)', height: 'clamp(54px, 6.6vh, 72px)', borderRadius: '50%',
        backgroundColor: avatarBg,
        border: `2px solid ${isSelected ? accent : cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 'clamp(10px, 1.3vh, 14px)',
      }}>
        <span style={{
          fontSize: 'clamp(20px, 2.7vh, 30px)', fontWeight: 800,
          color: avatarText,
        }}>
          {person.name[0]}
        </span>
      </div>
      <span style={{ fontSize: 'clamp(18px, 2.3vh, 26px)', fontWeight: 800, color: cardText, textAlign: 'center', lineHeight: 1.12 }}>{person.name}</span>
    </button>
  );
};

const PeopleScreen: React.FC<Props> = ({ onNavigate, onSpeak, isDarkMode = true, showHindi = false }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const [selected, setSelected] = useState<string | null>(null);
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix, isWarm } = useTheme();
  const { people: PEOPLE } = useCustomization();
  const fallbackPerson: Person = { name: 'Rishabh', nameHi: 'Rishabh', role: '', phrases: [] };
  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarm ? '#F5EEDF' : isWarmMode ? '#131412' : colors.background.primary;
  const phraseBg = isMix ? mixColors.home.tileSurfaces.pp : isWarm ? '#FBF5E5' : isWarmMode ? '#20221E' : colors.background.secondary;
  const phraseBorder = isMix ? mixColors.home.cardBorder : isWarm ? '#DED2C2' : isWarmMode ? 'rgba(213,216,188,0.14)' : colors.border.main;
  const phraseText = isMix ? mixColors.home.text : isWarm ? '#2F2A26' : isWarmMode ? '#ECEDE3' : colors.text.primary;
  const phraseHindi = isMix ? '#493B2E' : isWarm ? '#5C4F44' : isWarmMode ? '#C8C5B8' : colors.text.secondary;
  const phraseHover = isMix ? '#628780' : isWarm ? '#3F6968' : isWarmMode ? '#7FA39B' : '#4F6E68';
  const selectedPerson = PEOPLE.find(p => p.name === selected) ?? PEOPLE[0] ?? fallbackPerson;

  useEffect(() => {
    if (!selected || !PEOPLE.some(p => p.name === selected)) {
      setSelected((PEOPLE[0] ?? fallbackPerson).name);
    }
  }, [PEOPLE, selected]);

  return (
    <div className={`people-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : isWarm ? ' theme-warm' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: pageBg, padding: '8px', gap: 'clamp(8px, 1vh, 14px)', overflow: 'hidden' }}>
      {/* GlobalNavBar - Home, Keyboard, Medical, Emergency */}
      <GlobalNavBar
        currentPage="people"
        onNavigate={onNavigate}
        onSpeak={onSpeak}
        isDarkMode={isDarkMode}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(clamp(220px, 17vw, 330px), 1fr))',
        gap: 'clamp(12px, 1.4vw, 22px)',
        padding: 'clamp(14px, 2vh, 24px) clamp(12px, 1.4vw, 24px)',
        flexShrink: 0,
      }}>
        {PEOPLE.map(p => (
          <PersonBtn key={p.name} person={p} isSelected={selected === p.name}
            isDarkMode={isDarkMode} onSelect={() => setSelected(p.name)} gazeEnabled={isGazeEnabled} lastEnabledTimestamp={lastEnabledTimestamp} />
        ))}
      </div>

      {selectedPerson && (
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          padding: 'clamp(8px, 1.2vh, 16px) clamp(12px, 1.4vw, 24px) clamp(90px, 11vh, 130px)',
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
              minHeight: 'clamp(138px, 18vh, 210px)',
              padding: 'clamp(24px, 3vh, 36px) clamp(20px, 2vw, 32px)',
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
