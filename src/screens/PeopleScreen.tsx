/**
 * GazeConnect Pro - People Screen (v3.1)
 * Responsive: 13"–27" screens via clamp() — identical on 23" (1920×1080)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { darkColors, lightColors, dwellTiming, screenThemes } from '../utils/design';
import { GazeControlToggle, useGazeControl, GAZE_ENABLE_COOLDOWN_MS } from '../components/core/GazeControlToggle';
import GazeButton from '../components/core/GazeButton';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Person } from '../types/customization';

interface Props { onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode?: boolean; showHindi?: boolean; }

const PersonBtn: React.FC<{
  person: Person; isSelected: boolean; isDarkMode: boolean;
  onSelect: () => void; onSpeak: (t: string) => void; gazeEnabled: boolean; lastEnabledTimestamp: number;
}> = ({ person, isSelected, isDarkMode, onSelect, onSpeak, gazeEnabled, lastEnabledTimestamp }) => {
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const tRef = useRef<number | null>(null);
  const dRef = useRef<NodeJS.Timeout | null>(null);
  const sRef = useRef(0);
  const dwellMs = dwellTiming.contexts.phrases;
  const colors = isDarkMode ? darkColors : lightColors;
  const clear = () => { if (tRef.current) cancelAnimationFrame(tRef.current); if (dRef.current) clearTimeout(dRef.current); };
  const tick = useCallback(() => { const p = Math.min(1, (Date.now() - sRef.current) / dwellMs); setProgress(p); if (p < 1) tRef.current = requestAnimationFrame(tick); }, [dwellMs]);
  const enter = () => {
    if (!gazeEnabled) return;
    if (lastEnabledTimestamp && Date.now() - lastEnabledTimestamp < GAZE_ENABLE_COOLDOWN_MS) return;
    setHovered(true); sRef.current = Date.now(); tRef.current = requestAnimationFrame(tick);
    dRef.current = setTimeout(() => { onSpeak(`Call ${person.name}`); onSelect(); }, dwellMs);
  };
  const leave = () => { setHovered(false); setProgress(0); clear(); };
  useEffect(() => () => clear(), []);

  return (
    <button onMouseEnter={enter} onMouseLeave={leave}
      onClick={() => { onSpeak(`Call ${person.name}`); onSelect(); }}
      data-gaze="true"
      data-gaze-context="phraseButton"
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(14px, 2vh, 24px) clamp(10px, 1.2vw, 16px)',
        backgroundColor: isSelected ? colors.accent.subtle : colors.background.secondary,
        border: `2px solid ${isSelected ? colors.accent.main : hovered ? colors.accent.main : colors.border.main}`,
        borderRadius: '12px', cursor: 'pointer', transition: 'all 100ms', overflow: 'hidden',
        transform: hovered ? 'scale(1.03)' : 'scale(1)',
      }}>
      {hovered && <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, width: `${progress * 100}%`, backgroundColor: colors.accent.main }} />}
      <div style={{
        width: 'clamp(40px, 5.5vh, 56px)', height: 'clamp(40px, 5.5vh, 56px)', borderRadius: '50%',
        backgroundColor: isSelected ? colors.accent.main : colors.background.tertiary,
        border: `2px solid ${isSelected ? colors.accent.main : colors.border.main}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 'clamp(6px, 1vh, 10px)',
      }}>
        <span style={{
          fontSize: 'clamp(16px, 2.2vh, 24px)', fontWeight: 700,
          color: isSelected ? colors.text.inverse : colors.text.primary,
        }}>
          {person.name[0]}
        </span>
      </div>
      <span style={{ fontSize: 'clamp(14px, 2vh, 20px)', fontWeight: 700, color: colors.text.primary }}>{person.name}</span>
      <span style={{ fontSize: 'clamp(11px, 1.3vh, 14px)', color: colors.text.secondary, marginTop: '2px' }}>{person.role}</span>
    </button>
  );
};

const PeopleScreen: React.FC<Props> = ({ onNavigate, onSpeak, isDarkMode = true, showHindi = false }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const [selected, setSelected] = useState<string | null>(null);
  const { isGazeEnabled, lastEnabledTimestamp, toggleGaze } = useGazeControl();
  const { isLight } = useTheme();
  const { people: PEOPLE } = useCustomization();

  return (
    <div className={`people-screen${isLight ? ' theme-light' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: colors.background.primary, padding: '8px', gap: 'clamp(4px, 0.8vh, 8px)' }}>
      {/* GlobalNavBar - Home, Keyboard, Medical, Emergency */}
      <GlobalNavBar
        currentPage="people"
        onNavigate={onNavigate}
        onSpeak={onSpeak}
        isDarkMode={isDarkMode}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'clamp(6px, 0.8vw, 10px)', padding: 'clamp(4px, 0.8vh, 8px) clamp(8px, 1vw, 12px)' }}>
        {PEOPLE.map(p => (
          <PersonBtn key={p.name} person={p} isSelected={selected === p.name}
            isDarkMode={isDarkMode} onSelect={() => setSelected(p.name)} onSpeak={onSpeak} gazeEnabled={isGazeEnabled} lastEnabledTimestamp={lastEnabledTimestamp} />
        ))}
      </div>

      {selected && (
        <div style={{
          flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'clamp(6px, 0.8vw, 10px)', padding: 'clamp(4px, 0.8vh, 8px) clamp(8px, 1vw, 12px) clamp(90px, 12vh, 140px) clamp(8px, 1vw, 12px)', overflow: 'auto',
        }}>
          {PEOPLE.find(p => p.name === selected)?.phrases.map(ph => (
            <button key={ph.en} onClick={() => onSpeak(ph.en)}
              data-gaze="true"
              data-gaze-context="phraseButton"
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.accent.main)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.border.main)}
              style={{
                padding: 'clamp(12px, 1.8vh, 18px) clamp(14px, 1.8vw, 22px)', backgroundColor: colors.background.secondary,
                border: `2px solid ${colors.border.main}`, borderRadius: '10px',
                color: colors.text.primary, fontSize: 'clamp(13px, 1.9vh, 19px)', fontWeight: 600, cursor: 'pointer',
                minHeight: 'clamp(48px, 7vh, 68px)', textAlign: 'left', transition: 'all 80ms',
              }}>
              {ph.en}
              {showHindi && <div style={{ fontSize: 'clamp(20px, 2.4vh, 30px)', fontWeight: 600, color: colors.text.secondary, marginTop: '8px', fontFamily: "'Noto Sans Devanagari', 'Baloo 2', sans-serif", lineHeight: 1.3 }}>{ph.hi}</div>}
            </button>
          ))}
        </div>
      )}

      {/* Gaze toggle provided by GlobalNavBar at fixed bottom-center */}
    </div>
  );
};
export default React.memo(PeopleScreen);
