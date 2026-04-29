/**
 * GazeConnect Pro - Feelings Screen (v3.0)
 * Added: GazeControlToggle, gaze-aware dwell buttons
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { darkColors, lightColors, dwellTiming, mixColors } from '../utils/design';
import { useGazeControl, GAZE_ENABLE_COOLDOWN_MS } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';

interface Props { onNavigate: (s: string) => void; onSpeak: (t: string) => void; isDarkMode?: boolean; showHindi?: boolean; }
interface Item { en: string; hi: string; }

const FeelingBtn: React.FC<{ item: Item; isDarkMode: boolean; showHindi: boolean; onActivate: (t: string) => void; gazeEnabled: boolean; lastEnabledTimestamp: number }> =
  ({ item, isDarkMode, showHindi, onActivate, gazeEnabled, lastEnabledTimestamp }) => {
    const [progress, setProgress] = useState(0);
    const [hovered, setHovered] = useState(false);
    const [flash, setFlash] = useState(false);
    const tRef = useRef<number | null>(null);
    const dRef = useRef<NodeJS.Timeout | null>(null);
    const sRef = useRef(0);
    const dwellMs = dwellTiming.contexts.phrases;
    const colors = isDarkMode ? darkColors : lightColors;
    const { isMix } = useTheme();

    const clear = () => { if (tRef.current) cancelAnimationFrame(tRef.current); if (dRef.current) clearTimeout(dRef.current); };
    const tick = useCallback(() => {
      const p = Math.min(1, (Date.now() - sRef.current) / dwellMs);
      setProgress(p); if (p < 1) tRef.current = requestAnimationFrame(tick);
    }, [dwellMs]);
    const enter = () => {
      if (!gazeEnabled) return;
      if (lastEnabledTimestamp && Date.now() - lastEnabledTimestamp < GAZE_ENABLE_COOLDOWN_MS) return;
      setHovered(true); sRef.current = Date.now(); tRef.current = requestAnimationFrame(tick);
      dRef.current = setTimeout(() => { setFlash(true); onActivate(item.en); setTimeout(() => setFlash(false), 200); }, dwellMs);
    };
    const leave = () => { setHovered(false); setProgress(0); clear(); };
    useEffect(() => () => clear(), []);

    return (
      <button onMouseEnter={enter} onMouseLeave={leave} onClick={() => onActivate(item.en)}
        data-gaze="true"
        data-gaze-context="phraseButton"
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 'clamp(10px, 1.5vh, 16px) 10px',
          backgroundColor: isMix ? mixColors.home.tileSurfaces.ph : colors.background.secondary,
          border: isMix ? `1.5px solid ${hovered ? '#8B6F49' : mixColors.home.cardBorder}` : `2px solid ${hovered ? colors.accent.main : colors.border.main}`,
          borderRadius: '12px',
          cursor: 'pointer', transform: flash ? 'scale(0.94)' : hovered ? 'scale(1.03)' : 'scale(1)',
          transition: 'all 80ms', overflow: 'hidden',
          boxShadow: isMix ? mixColors.home.cardShadow : undefined,
        }}>
        {hovered && <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, width: `${progress * 100}%`, backgroundColor: isMix ? '#8B6F49' : colors.accent.main }} />}
        <span style={{ fontSize: 'clamp(13px, 1.8vh, 19px)', fontWeight: 600, color: isMix ? mixColors.home.text : colors.text.primary, textAlign: 'center', lineHeight: 1.3 }}>{item.en}</span>
        {showHindi && <span style={{ fontSize: 'clamp(20px, 2.4vh, 30px)', fontWeight: 600, color: isMix ? mixColors.home.subtleText : colors.text.secondary, textAlign: 'center', marginTop: '8px', fontFamily: "'Noto Sans Devanagari', 'Baloo 2', sans-serif", lineHeight: 1.3 }}>{item.hi}</span>}
      </button>
    );
  };

const FeelingScreen: React.FC<Props> = ({ onNavigate, onSpeak, isDarkMode = true, showHindi = false }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix } = useTheme();
  const { feelings: FEELINGS } = useCustomization();
  return (
    <div className={`feelings-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: isMix ? mixColors.home.root : colors.background.primary, padding: '8px', gap: '8px' }}>
      {/* GlobalNavBar - Home, Keyboard, Medical, Emergency */}
      <GlobalNavBar
        currentPage="feelings"
        onNavigate={onNavigate}
        onSpeak={onSpeak}
        isDarkMode={isDarkMode}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', padding: '4px', overflow: 'auto' }}>
        {FEELINGS.map(f => <FeelingBtn key={f.en} item={f} isDarkMode={isDarkMode} showHindi={showHindi} onActivate={onSpeak} gazeEnabled={isGazeEnabled} lastEnabledTimestamp={lastEnabledTimestamp} />)}
      </div>

    </div>
  );
};
export default React.memo(FeelingScreen);
