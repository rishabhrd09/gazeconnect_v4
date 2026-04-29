import React, { useMemo } from 'react';
import GazeButton from './core/GazeButton';
import type { Phrase, QuickWord } from '../types/customization';
import { useTheme } from '../contexts/ThemeContext';
import { mixColors } from '../utils/design';

interface QuickWordPhraseOverlayProps {
  isOpen: boolean;
  word: QuickWord | null;
  relatedWords: QuickWord[];
  onClose: () => void;
  onSelectPhrase: (phrase: Phrase) => void;
  onSelectRelatedWord: (word: QuickWord) => void;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  showHindi?: boolean;
}

const UI_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, sans-serif";
const HINDI_FONT = "'Noto Sans Devanagari', 'Mangal', sans-serif";

const BackArrowIcon: React.FC<{ size?: number; color?: string; strokeWidth?: number }> = ({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2.4,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: 'block' }}
  >
    <path d="M19.5 8.5 12 16l7.5 7.5" />
    <path d="M12.8 16h13" />
  </svg>
);

const getTone = (wordId?: string | null, isLight = false, isMix = false) => {
  if (wordId?.startsWith('position_')) {
    return isLight
      ? {
        accent: '#5F7858',
        panelBg: 'rgba(246, 249, 243, 0.98)',
        panelBorder: 'rgba(95, 120, 88, 0.16)',
        title: '#243222',
        helper: '#536A4E',
        cardBg: '#E5ECDD',
        cardBorder: 'rgba(95, 120, 88, 0.18)',
        cardText: '#1D271C',
        chipBg: '#DCE6D4',
      }
      : isMix
        ? {
          accent: '#8FA67A',
          panelBg: 'rgba(19, 24, 20, 0.98)',
          panelBorder: 'rgba(143, 166, 122, 0.14)',
          title: '#EAF0E1',
          helper: '#BAC7AE',
          cardBg: '#202B22',
          cardBorder: 'rgba(143, 166, 122, 0.18)',
          cardText: '#F0F4EA',
          chipBg: '#283428',
        }
        : {
          accent: '#7E9772',
          panelBg: 'rgba(12, 16, 13, 0.98)',
          panelBorder: 'rgba(126, 151, 114, 0.13)',
          title: '#EEF3EC',
          helper: '#B9C8B3',
          cardBg: '#1C2721',
          cardBorder: 'rgba(126, 151, 114, 0.18)',
          cardText: '#F1F5EF',
          chipBg: '#223027',
        };
  }

  if (wordId?.startsWith('daily_')) {
    return isLight
      ? {
        accent: '#9A7740',
        panelBg: 'rgba(247, 243, 235, 0.98)',
        panelBorder: 'rgba(154, 119, 64, 0.14)',
        title: '#3A3325',
        helper: '#6C6042',
        cardBg: '#F0E7D8',
        cardBorder: 'rgba(154, 119, 64, 0.18)',
        cardText: '#282219',
        chipBg: '#E5DCC9',
      }
      : isMix
        ? {
          accent: '#BFA15C',
          panelBg: 'rgba(24, 23, 18, 0.98)',
          panelBorder: 'rgba(191, 161, 92, 0.14)',
          title: '#EEE7D8',
          helper: '#C8BA91',
          cardBg: '#292719',
          cardBorder: 'rgba(191, 161, 92, 0.18)',
          cardText: '#F2EDDF',
          chipBg: '#342F1F',
        }
        : {
          accent: '#B19658',
          panelBg: 'rgba(15, 15, 12, 0.98)',
          panelBorder: 'rgba(177, 150, 88, 0.13)',
          title: '#F0ECE2',
          helper: '#D0C3A2',
          cardBg: '#292519',
          cardBorder: 'rgba(177, 150, 88, 0.18)',
          cardText: '#F3EEE4',
          chipBg: '#332E20',
        };
  }

  return isLight
    ? {
      accent: '#9B5E54',
      panelBg: 'rgba(250, 246, 242, 0.98)',
      panelBorder: 'rgba(155, 94, 84, 0.28)',
      title: '#42221F',
      helper: '#7E5A54',
      cardBg: '#F3E8E4',
      cardBorder: 'rgba(155, 94, 84, 0.24)',
      cardText: '#33201D',
      chipBg: '#EFDCD5',
    }
    : isMix
      ? {
        accent: '#B06A5A',
        panelBg: 'rgba(41, 31, 28, 0.98)',
        panelBorder: 'rgba(176, 106, 90, 0.22)',
        title: '#F0E2C4',
        helper: '#D8BCAF',
        cardBg: mixColors.home.tileSurfaces.ph,
        cardBorder: mixColors.home.cardBorder,
        cardText: mixColors.home.text,
        chipBg: '#3A2825',
      }
      : {
        accent: '#B06A5A',
        panelBg: 'rgba(20, 18, 17, 0.98)',
        panelBorder: 'rgba(176, 106, 90, 0.20)',
        title: '#F1ECE4',
        helper: '#D7BEB8',
        cardBg: '#2A1E1C',
        cardBorder: 'rgba(176, 106, 90, 0.24)',
        cardText: '#F5EFEB',
        chipBg: '#302220',
      };
};

const getPhraseFontSize = (phrase: string, totalPhrases: number) => {
  const length = phrase.length;
  const isDense = totalPhrases >= 4;

  if (length >= 48) return isDense ? 'clamp(28px, 2.95vh, 38px)' : 'clamp(29px, 3.05vh, 40px)';
  if (length >= 34) return isDense ? 'clamp(31px, 3.25vh, 42px)' : 'clamp(32px, 3.35vh, 44px)';
  return isDense ? 'clamp(36px, 3.75vh, 50px)' : 'clamp(38px, 3.95vh, 52px)';
};

const getRelatedWordFontSize = (phrase: string) => {
  if (phrase.length >= 24) return 'clamp(20px, 2.05vh, 26px)';
  if (phrase.length >= 16 || phrase.includes('/')) return 'clamp(22px, 2.3vh, 29px)';
  return 'clamp(24px, 2.55vh, 32px)';
};

const QuickWordPhraseOverlay: React.FC<QuickWordPhraseOverlayProps> = ({
  isOpen,
  word,
  relatedWords,
  onClose,
  onSelectPhrase,
  onSelectRelatedWord,
  isDarkMode,
  gazeEnabled,
  gazeEnabledTimestamp,
  showHindi = false,
}) => {
  const { isLight, isMix } = useTheme();

  const phrases = useMemo(() => {
    if (!word) return [];
    return word.phrases?.length ? word.phrases : [{ en: word.en, hi: word.hi }];
  }, [word]);
  const visiblePhrases = useMemo(() => phrases.slice(0, 4), [phrases]);
  const visibleRelatedWords = useMemo(() => relatedWords.slice(0, 3), [relatedWords]);

  const tone = useMemo(() => getTone(word?.id, isLight, isMix), [word?.id, isLight, isMix]);
  const phraseCount = visiblePhrases.length;
  const phraseGridColumns = phraseCount === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))';
  const phraseGridRows = phraseCount <= 2 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))';
  const panelShadow = isLight
    ? '0 18px 42px rgba(76, 61, 43, 0.12)'
    : '0 26px 70px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.018)';
  const cardShadow = isLight
    ? '0 12px 24px rgba(89, 75, 54, 0.09)'
    : '0 14px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.024)';
  const secondaryCardShadow = isLight
    ? '0 8px 18px rgba(89, 75, 54, 0.07)'
    : '0 10px 20px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.018)';
  if (!isOpen || !word) return null;

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: isLight ? 'rgba(232, 225, 214, 0.78)' : 'rgba(5, 7, 6, 0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(14px, 1.8vh, 22px) clamp(16px, 1.8vw, 26px)',
      }}
    >
      <div
        style={{
          width: 'min(100%, 1540px)',
          height: 'min(86vh, 900px)',
          overflow: 'hidden',
          borderRadius: '30px',
          background: tone.panelBg,
          border: 'none',
          boxShadow: panelShadow,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: 'clamp(16px, 1.8vh, 22px) clamp(24px, 2.5vw, 38px) clamp(14px, 1.6vh, 20px)',
            borderBottom: `1px solid ${tone.panelBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                color: tone.accent,
                fontSize: 'clamp(12px, 1.25vh, 14px)',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontFamily: UI_FONT,
              }}
            >
              Choose Phrase
            </div>
            <div
              style={{
                color: tone.title,
                fontSize: 'clamp(30px, 3.6vh, 44px)',
                fontWeight: 860,
                lineHeight: 1.06,
                fontFamily: UI_FONT,
              }}
            >
              {word.en}
            </div>
            <div
              style={{
                color: tone.helper,
                fontSize: 'clamp(15px, 1.55vh, 18px)',
                fontWeight: 650,
                fontFamily: UI_FONT,
              }}
            >
              Select one clear phrase to speak
            </div>
          </div>

          <GazeButton
            id="quickword-phrase-overlay-close"
            onClick={onClose}
            gazeEnabled={gazeEnabled}
            gazeEnabledTimestamp={gazeEnabledTimestamp}
            isDarkMode={isDarkMode}
            dwellCategory="navigationButton"
            style={{
              minWidth: 'clamp(320px, 22vw, 420px)',
              height: 'clamp(112px, 11.2vh, 142px)',
              borderRadius: '28px',
              background: tone.chipBg,
              border: 'none',
              color: tone.title,
              fontSize: 'clamp(31px, 3.35vh, 40px)',
              fontWeight: 800,
              fontFamily: UI_FONT,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              boxShadow: secondaryCardShadow,
            }}
            contentFill
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'clamp(12px, 1vw, 18px)',
              }}
            >
              <BackArrowIcon size={48} color={tone.helper} strokeWidth={3.4} />
              <span>Back</span>
            </div>
          </GazeButton>
        </div>

        <div
          style={{
            padding: 'clamp(18px, 2vh, 24px) clamp(22px, 2.2vw, 34px) clamp(20px, 2.2vh, 30px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(16px, 1.6vh, 20px)',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 'min(1180px, 100%)',
              alignSelf: 'center',
              flex: '1 1 auto',
              minHeight: 0,
              maxHeight: phraseCount <= 2 ? 'clamp(260px, 38vh, 420px)' : 'clamp(430px, 54vh, 560px)',
              display: 'grid',
              gridTemplateColumns: phraseGridColumns,
              gridTemplateRows: phraseGridRows,
              gap: 'clamp(14px, 1.8vh, 22px) clamp(14px, 1.4vw, 22px)',
            }}
          >
            {visiblePhrases.map((phrase, index) => (
              <GazeButton
                key={`${word.id || word.en}-${index}`}
                id={`quickword-phrase-${word.id || 'word'}-${index}`}
                onClick={() => onSelectPhrase(phrase)}
                gazeEnabled={gazeEnabled}
                gazeEnabledTimestamp={gazeEnabledTimestamp}
                isDarkMode={isDarkMode}
                dwellCategory={word.priority === 'high' ? 'medicalUrgent' : 'phraseButton'}
                style={{
                  gridColumn: phraseCount === 3 && index === 2 ? '1 / -1' : undefined,
                  width: '100%',
                  height: '100%',
                  minWidth: 0,
                  minHeight: 0,
                  borderRadius: '18px',
                  background: tone.cardBg,
                  border: 'none',
                  color: tone.cardText,
                  padding: 'clamp(22px, 2.4vh, 34px) clamp(24px, 2.4vw, 38px)',
                  boxShadow: cardShadow,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: showHindi && phrase.hi ? '10px' : '0',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    fontSize: getPhraseFontSize(phrase.en, visiblePhrases.length),
                    fontWeight: 800,
                    lineHeight: 1.12,
                    fontFamily: UI_FONT,
                    letterSpacing: '0',
                    textShadow: 'none',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {phrase.en}
                </div>
                {showHindi && phrase.hi && (
                  <div
                    style={{
                      width: '100%',
                      fontSize: 'clamp(17px, 1.8vh, 22px)',
                      lineHeight: 1.2,
                      fontWeight: 720,
                      color: tone.helper,
                      fontFamily: HINDI_FONT,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {phrase.hi}
                  </div>
                )}
              </GazeButton>
            ))}
          </div>

          {visibleRelatedWords.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: 'min(1180px, 100%)', alignSelf: 'center', flexShrink: 0 }}>
              <div
                style={{
                  color: tone.helper,
                  fontSize: 'clamp(13px, 1.35vh, 15px)',
                  fontWeight: 760,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontFamily: UI_FONT,
                }}
              >
                Related Options
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${visibleRelatedWords.length}, minmax(0, 1fr))`,
                  gap: 'clamp(12px, 1.2vh, 16px)',
                }}
              >
                {visibleRelatedWords.map((relatedWord) => (
                  <GazeButton
                    key={relatedWord.id || relatedWord.en}
                    id={`quickword-related-${relatedWord.id || relatedWord.en}`}
                    onClick={() => onSelectRelatedWord(relatedWord)}
                    gazeEnabled={gazeEnabled}
                    gazeEnabledTimestamp={gazeEnabledTimestamp}
                    isDarkMode={isDarkMode}
                    dwellCategory="phraseButton"
                    style={{
                      width: '100%',
                      minHeight: 'clamp(78px, 8vh, 106px)',
                      borderRadius: '16px',
                      background: tone.chipBg,
                      border: 'none',
                      color: tone.title,
                      fontSize: getRelatedWordFontSize(relatedWord.en),
                      fontWeight: 760,
                      fontFamily: UI_FONT,
                      boxShadow: secondaryCardShadow,
                      padding: 'clamp(16px, 1.8vh, 24px) clamp(18px, 1.8vw, 28px)',
                      textAlign: 'center',
                      lineHeight: 1.12,
                    }}
                  >
                    {relatedWord.en}
                  </GazeButton>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(QuickWordPhraseOverlay);
