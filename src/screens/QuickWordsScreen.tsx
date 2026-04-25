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
  const { isLight, isMix } = useTheme();
  const colors = isDarkMode ? darkColors : lightColors;
  const isWarmMode = isDarkMode && !isLight;
  const pageBg = isMix ? '#17130F' : isWarmMode ? '#131412' : lightColors.background.primary;

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
    <div className={`quickwords-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: pageBg,
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
            backgroundColor: isLight ? 'rgba(122, 156, 181, 0.10)' : isMix ? 'rgba(53, 44, 33, 0.88)' : 'rgba(111, 183, 177, 0.10)',
            border: isLight ? `1.5px solid ${lightColors.border.main}` : isMix ? '1.5px solid rgba(139,111,73,0.42)' : '1.5px solid rgba(111, 183, 177, 0.30)',
            borderRadius: '20px',
            color: isLight ? lightColors.text.primary : isMix ? '#F0E2C4' : '#6FB7B1',
            fontSize: 'clamp(16px, 2vh, 22px)',
            fontWeight: 700,
            letterSpacing: isLight ? '0.02em' : '0.06em',
            fontFamily: "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif",
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
            backgroundColor: isLight ? lightColors.background.elevated : isMix ? 'rgba(53,44,33,0.96)' : 'rgba(32,34,30,0.96)',
            border: isLight ? `2px solid ${lightColors.border.main}` : isMix ? '2px solid rgba(139,111,73,0.50)' : '2px solid rgba(143,174,114,0.45)',
            borderRadius: '28px',
            color: isLight ? lightColors.text.primary : isMix ? '#F0E2C4' : '#8FAE72',
            fontSize: 'clamp(36px, 5vh, 56px)',
            fontWeight: isLight ? 600 : 800,
            fontFamily: "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif",
            backdropFilter: 'none',
            boxShadow: isLight ? '0 8px 24px rgba(139, 121, 104, 0.12), 0 2px 6px rgba(139, 121, 104, 0.08)' : '0 8px 40px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            letterSpacing: isLight ? '0.02em' : '0.03em',
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
                color: isLight ? lightColors.text.secondary : isMix ? '#CFA094' : '#D79A83',
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
