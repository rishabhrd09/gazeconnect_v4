/**
 * GazeConnect Pro - Quick Words Screen
 * =====================================
 * Full-page Quick Words with 3-column pillow-card grid.
 * Uses shared QuickWordsGrid component for visual consistency.
 *
 * Supports two modes:
 *   - Normal: clicking speaks the word
 *   - Inject: clicking inserts word into typing area and returns to caller
 */
import React, { useState, useCallback } from 'react';
import { darkColors, lightColors } from '../utils/design';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGazeControl } from '../components/core/GazeControlToggle';
import QuickWordsGrid from '../components/shared/QuickWordsGrid';
import type { QuickWord } from '../types/customization';

interface QuickWordsScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
  /** When true, selecting a word injects text instead of speaking */
  injectMode?: boolean;
  /** Called with the selected word text when in inject mode */
  onWordInject?: (word: string) => void;
  /** Screen to return to after inject (default: keyboard) */
  returnScreen?: string;
}

const QuickWordsScreen: React.FC<QuickWordsScreenProps> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
  injectMode = false, onWordInject, returnScreen = 'keyboard',
}) => {
  const { data: { quickWords } } = useCustomization();
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight } = useTheme();
  const colors = isDarkMode ? darkColors : lightColors;

  const categories = quickWords?.categories ?? [];

  const [lastSpoken, setLastSpoken] = useState<{ en: string, hi?: string } | null>(null);

  const handleWordSelect = useCallback((word: QuickWord) => {
    if (injectMode && onWordInject) {
      onWordInject(word.en);
      onNavigate(returnScreen);
    } else {
      onSpeak(word.en);
      setLastSpoken({ en: word.en, hi: word.hi });
      setTimeout(() => setLastSpoken(null), 2500);
    }
  }, [injectMode, onWordInject, onNavigate, returnScreen, onSpeak]);

  return (
    <div className={`quickwords-screen${isLight ? ' theme-light' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#080F14',
      overflow: 'hidden',
      padding: '4px 20px 12px 20px',
    }}>
      <GlobalNavBar currentPage="quickwords" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      {/* Inject mode indicator — dedicated row with strong teal stripe */}
      {injectMode && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'clamp(8px, 1vh, 12px) 0',
          flexShrink: 0,
        }}>
          <span style={{
            padding: 'clamp(10px, 1.2vh, 14px) clamp(24px, 3vw, 40px)',
            backgroundColor: 'rgba(126, 206, 192, 0.12)',
            border: '1.5px solid rgba(126, 206, 192, 0.35)',
            borderRadius: '20px',
            color: '#7ECEC0',
            fontSize: 'clamp(16px, 2vh, 22px)',
            fontWeight: 700,
            letterSpacing: '0.06em',
            fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
          }}>
            TAP A WORD TO INSERT INTO TEXT
          </span>
        </div>
      )}

      {/* LAST SPOKEN INDICATOR — centered overlay, zero layout impact */}
      {!injectMode && lastSpoken && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9000,
          pointerEvents: 'none',
        }}>
          <div style={{
            padding: 'clamp(28px, 4vh, 48px) clamp(48px, 6vw, 80px)',
            backgroundColor: 'rgba(16, 185, 129, 0.14)',
            border: '2px solid rgba(16, 185, 129, 0.45)',
            borderRadius: '28px',
            color: '#10B981',
            fontSize: 'clamp(36px, 5vh, 56px)',
            fontWeight: 800,
            fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            letterSpacing: '0.03em',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              🔊 <span>{lastSpoken.en}</span>
            </div>
            {showHindi && lastSpoken.hi && (
              <div style={{
                fontSize: 'clamp(28px, 4vh, 44px)',
                fontFamily: "'Noto Sans Devanagari', 'Mangal', sans-serif",
                color: 'rgba(16, 185, 129, 0.85)',
                fontWeight: 700,
              }}>
                {lastSpoken.hi}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shared Quick Words Grid */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(10px, 1.8vh, 22px) clamp(16px, 3vw, 48px) clamp(12px, 1.5vh, 20px)',
      }}>
        <QuickWordsGrid
          categories={categories}
          coreWords={quickWords?.coreWords}
          onWordSelect={handleWordSelect}
          isDarkMode={isDarkMode}
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          showHindi={showHindi}
          idPrefix="qws"
        />
      </div>
    </div>
  );
};

export default React.memo(QuickWordsScreen);
