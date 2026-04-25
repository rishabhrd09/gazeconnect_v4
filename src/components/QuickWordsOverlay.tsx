/**
 * QuickWordsOverlay - Full-screen overlay for Keyboard/ZoneBoard
 * ==============================================================
 * Uses shared QuickWordsGrid for visual consistency with QuickWordsScreen.
 * Selecting a word fires onWordSelect and closes the overlay.
 */
import React from 'react';
import GazeButton from './core/GazeButton';
import QuickWordsGrid from './shared/QuickWordsGrid';
import { darkColors, lightColors, typography } from '../utils/design';
import type { QuickWord, QuickWordCategory, CoreWord } from '../types/customization';

interface QuickWordsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  categories: QuickWordCategory[];
  coreWords?: CoreWord[];
  onWordSelect: (word: QuickWord) => void;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  showHindi?: boolean;
}

const QuickWordsOverlay: React.FC<QuickWordsOverlayProps> = ({
  isOpen,
  onClose,
  categories,
  coreWords,
  onWordSelect,
  isDarkMode,
  gazeEnabled,
  gazeEnabledTimestamp,
  showHindi = false,
}) => {
  if (!isOpen) return null;

  const colors = isDarkMode ? darkColors : lightColors;
  const primaryFont = typography.fontFamily.primary;

  const handleWordSelect = (word: QuickWord) => {
    onWordSelect(word);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        background: colors.background.primary,
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(14px, 1.8vh, 24px) clamp(24px, 3.2vw, 44px)',
        gap: 'clamp(10px, 1.3vh, 18px)',
        fontFamily: primaryFont,
      }}
    >
      {/* Header: Close button + Title side by side */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(18px, 2.5vw, 36px)', flexShrink: 0 }}>
        {/* Close button */}
        <GazeButton
          id="quick-words-close"
          onClick={onClose}
          isDarkMode={isDarkMode}
          gazeEnabled={gazeEnabled}
          gazeEnabledTimestamp={gazeEnabledTimestamp}
          dwellCategory="navigationButton"
          style={{
            width: 'clamp(180px, 14vw, 260px)',
            height: 'clamp(80px, 9vh, 110px)',
            borderRadius: '24px',
            background: colors.background.tertiary,
            border: `2px solid ${colors.border.main}`,
            boxShadow: isDarkMode ? '0 5px 14px rgba(0,0,0,0.18)' : '0 2px 8px rgba(139, 121, 104, 0.10), 0 1px 2px rgba(139, 121, 104, 0.06)',
            color: colors.text.primary,
            fontSize: 'clamp(22px, 2.8vh, 32px)',
            fontWeight: isDarkMode ? 800 : 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(8px, 1vw, 14px)',
            textAlign: 'center',
            lineHeight: 1,
            letterSpacing: isDarkMode ? '0.05em' : '0.02em',
          }}
        >
          <span style={{ fontSize: 'clamp(18px, 2.2vh, 26px)' }}>✕</span>
          {isDarkMode ? 'CLOSE' : 'Close'}
        </GazeButton>

        {/* Title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{
            color: colors.text.primary,
            fontSize: 'clamp(24px, 3vh, 36px)',
            fontWeight: isDarkMode ? 800 : 600,
            letterSpacing: isDarkMode ? '0.06em' : '0.02em',
          }}>
            {isDarkMode ? 'QUICK WORDS' : 'Quick Words'}
          </span>
          <span style={{
            color: colors.text.secondary,
            fontSize: 'clamp(13px, 1.6vh, 18px)',
            fontWeight: 600,
            letterSpacing: isDarkMode ? '0.04em' : '0.02em',
          }}>
            {isDarkMode ? 'SELECT A PHRASE TO INSERT' : 'Select a phrase to insert'}
          </span>
        </div>
      </div>

      {/* Shared Quick Words Grid */}
      <QuickWordsGrid
        categories={categories}
        coreWords={coreWords}
        onWordSelect={handleWordSelect}
        isDarkMode={isDarkMode}
        gazeEnabled={gazeEnabled}
        gazeEnabledTimestamp={gazeEnabledTimestamp}
        showHindi={showHindi}
        idPrefix="qwo"
      />
    </div>
  );
};

export default QuickWordsOverlay;
