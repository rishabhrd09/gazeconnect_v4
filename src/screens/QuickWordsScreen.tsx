/**
 * GazeConnect Pro - Quick Words Screen
 *
 * Keeps the existing category/content structure while presenting the board
 * with a calmer, research-aligned AAC shell.
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { lightColors } from '../utils/design';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useCustomization } from '../contexts/CustomizationContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGazeControl } from '../components/core/GazeControlToggle';
import QuickWordsGrid from '../components/shared/QuickWordsGrid';
import QuickWordPhraseOverlay from '../components/QuickWordPhraseOverlay';
import type { Phrase, QuickWord } from '../types/customization';

interface QuickWordsScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
  injectMode?: boolean;
  onWordInject?: (word: string) => void;
  returnScreen?: string;
}

const UI_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";
const HINDI_FONT = "'Noto Sans Devanagari', 'Mangal', sans-serif";

const QuickWordsScreen: React.FC<QuickWordsScreenProps> = ({
  onNavigate, onSpeak, isDarkMode = true, showHindi = false,
  injectMode = false, onWordInject, returnScreen = 'keyboard',
}) => {
  const { data: { quickWords } } = useCustomization();
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const { isLight, isMix } = useTheme();
  const isWarmMode = isDarkMode && !isLight;
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageBg = isMix
    ? '#17130F'
    : isWarmMode
      ? '#131412'
      : lightColors.background.primary;
  const shellAccent = isLight
    ? '#D6C6B3'
    : isMix
      ? 'rgba(180,147,98,0.22)'
      : 'rgba(213,216,188,0.12)';
  const categories = quickWords?.categories ?? [];
  const [lastSpoken, setLastSpoken] = useState<{ en: string; hi?: string } | null>(null);
  const [activeWord, setActiveWord] = useState<QuickWord | null>(null);

  const allWords = categories.flatMap(category => category.words ?? []);
  const wordMap = useRef<Map<string, QuickWord>>(new Map());

  useEffect(() => {
    const nextMap = new Map<string, QuickWord>();
    allWords.forEach((word) => {
      const key = word.id || word.en;
      nextMap.set(key, word);
    });
    wordMap.current = nextMap;
  }, [allWords]);

  useEffect(() => () => {
    if (dismissRef.current) clearTimeout(dismissRef.current);
  }, []);

  const handleWordSelect = useCallback((word: QuickWord) => {
    if (injectMode || word.phrases?.length) {
      setActiveWord(word);
      return;
    }

    onSpeak(word.en);
    setLastSpoken({ en: word.en, hi: word.hi });
    if (dismissRef.current) clearTimeout(dismissRef.current);
    dismissRef.current = setTimeout(() => setLastSpoken(null), 2200);
  }, [injectMode, onSpeak]);

  const handlePhraseSelect = useCallback((phrase: Phrase) => {
    if (injectMode && onWordInject) {
      onWordInject(phrase.en);
      setActiveWord(null);
      onNavigate(returnScreen);
      return;
    }

    onSpeak(phrase.en);
    setLastSpoken({ en: phrase.en, hi: phrase.hi });
    setActiveWord(null);
    if (dismissRef.current) clearTimeout(dismissRef.current);
    dismissRef.current = setTimeout(() => setLastSpoken(null), 2600);
  }, [injectMode, onNavigate, onSpeak, onWordInject, returnScreen]);

  const relatedWords = useMemo(() => {
    if (!activeWord?.relatedWordIds?.length) return [];
    return activeWord.relatedWordIds
      .map((id) => wordMap.current.get(id))
      .filter((word): word is QuickWord => Boolean(word));
  }, [activeWord]);

  return (
    <div
      className={`quickwords-screen${isLight ? ' theme-light' : isMix ? ' theme-mix' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: pageBg,
        overflow: 'hidden',
        padding: '4px 20px 12px 20px',
      }}
    >
      <GlobalNavBar currentPage="quickwords" onNavigate={onNavigate} onSpeak={onSpeak} isDarkMode={isDarkMode} />

      <QuickWordPhraseOverlay
        isOpen={Boolean(activeWord)}
        word={activeWord}
        relatedWords={relatedWords}
        onClose={() => setActiveWord(null)}
        onSelectPhrase={handlePhraseSelect}
        onSelectRelatedWord={setActiveWord}
        isDarkMode={isDarkMode}
        gazeEnabled={isGazeEnabled}
        gazeEnabledTimestamp={lastEnabledTimestamp}
        showHindi={showHindi}
      />

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
            minWidth: 'clamp(360px, 34vw, 520px)',
            maxWidth: '74vw',
            padding: 'clamp(26px, 3.8vh, 40px) clamp(34px, 4.4vw, 56px)',
            background: isLight ? 'rgba(250, 246, 239, 0.98)' : isMix ? 'rgba(36, 31, 24, 0.98)' : 'rgba(22, 23, 21, 0.98)',
            border: `1.5px solid ${shellAccent}`,
            borderRadius: '22px',
            color: isLight ? lightColors.text.primary : isMix ? '#F0E2C4' : '#ECEDE3',
            boxShadow: isLight ? '0 8px 20px rgba(82, 66, 45, 0.10)' : '0 10px 26px rgba(0,0,0,0.24)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 'clamp(30px, 4.1vh, 46px)',
              fontWeight: 760,
              lineHeight: 1.08,
              fontFamily: UI_FONT,
            }}>
              {lastSpoken.en}
            </div>
            {showHindi && lastSpoken.hi && (
              <>
                <div style={{
                  width: '28px',
                  height: '1px',
                  borderRadius: '999px',
                  background: shellAccent,
                }} />
                <div style={{
                  fontSize: 'clamp(22px, 3vh, 30px)',
                  fontWeight: 700,
                  lineHeight: 1.1,
                  fontFamily: HINDI_FONT,
                  color: isLight ? lightColors.text.secondary : isMix ? '#86654A' : '#D7C7B7',
                }}>
                  {lastSpoken.hi}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'clamp(4px, 0.7vh, 10px) clamp(20px, 2.8vw, 52px) clamp(18px, 2vh, 28px)',
      }}>
        <div style={{
          width: 'min(100%, 1760px)',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
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
            presentation="standalone"
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(QuickWordsScreen);
