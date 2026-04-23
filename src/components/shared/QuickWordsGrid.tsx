/**
 * QuickWordsGrid – Spacious Bento-box layout (v4.0)
 * ===================================================
 * Changes from v3:
 *  - Core vocabulary row REMOVED (cards now use full height)
 *  - Category headers enlarged: bigger font, taller padding, coloured bg strip
 *  - Cards are taller and more spacious — better for eye-gaze selection
 *  - Row/Column gaps remain at 16px+ (AAC safe)
 *  - Activation flash retained
 *
 * Used by:
 *   - QuickWordsScreen (standalone page)
 *   - QuickWordsOverlay (keyboard/zone board modal)
 */
import React, { useMemo, useState, useCallback, useRef } from 'react';
import GazeButton from '../core/GazeButton';
import type { QuickWord, QuickWordCategory } from '../../types/customization';

// Full-card backgrounds — warm, muted, calming (AAC-optimised palette)
const CATEGORY_BG: Record<string, string> = {
  emergency: '#4A1F1F',    // Deep warm crimson — serious, not alarming
  position: '#352A1A',     // Deep warm muted brown — earthy, nurturing
  daily: '#0D2E2E',        // Deep muted teal-charcoal
};

const CATEGORY_BORDERS: Record<string, string> = {
  emergency: '#7A3030',    // Warm crimson border
  position: '#5C4428',     // Warm muted brown border
  daily: '#2A5C5C',        // Warm sage teal border
};

const CARD_TEXT_COLORS: Record<string, string> = {
  emergency: '#F5F0EE',    // Warm off-white
  position: '#F5F0EE',     // Warm off-white (consistent)
  daily: '#F5F0EE',        // Warm off-white (consistent)
};

// Header strip backgrounds — deepest tone to anchor the section
const HEADER_BG: Record<string, string> = {
  emergency: '#3A1515',
  position: '#261E10',
  daily: '#091F1F',
};

const HEADER_COLORS: Record<string, string> = {
  emergency: '#D4847A',    // Warm rose-gold — reads "important" not "panic"
  position: '#E8C46A',     // Antique gold — warm, readable, premium
  daily: '#7ECEC0',        // Muted warm teal — calm, nurturing
};

const CATEGORY_ICONS: Record<string, string> = {
  emergency: '\u26A0',    // Warning triangle
  position: '\u2195',     // Up-down arrows
  daily: '\u263C',        // ☼ Subtle rising sun
};

const CATEGORY_ORDER = ['emergency', 'position', 'daily'];
const MAX_WORDS = 6; // Hard limit: 3 rows × 2 columns (AAC best practice)

export interface QuickWordsGridProps {
  categories: QuickWordCategory[];
  coreWords?: unknown[];          // kept for API compat — no longer rendered
  onWordSelect: (word: QuickWord) => void;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  showHindi?: boolean;
  /** Prefix for GazeButton IDs to prevent collisions */
  idPrefix?: string;
}

const QuickWordsGrid: React.FC<QuickWordsGridProps> = ({
  categories,
  onWordSelect,
  isDarkMode,
  gazeEnabled,
  gazeEnabledTimestamp,
  showHindi = false,
  idPrefix = 'qwg',
}) => {
  const orderedCategories = useMemo(() => {
    return CATEGORY_ORDER
      .map(id => categories.find(c => c.id === id))
      .filter(Boolean) as QuickWordCategory[];
  }, [categories]);

  // Activation flash state
  const [activatedKey, setActivatedKey] = useState<string | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSelect = useCallback((word: QuickWord, key: string) => {
    onWordSelect(word);
    setActivatedKey(key);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setActivatedKey(null), 500);
  }, [onWordSelect]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      gap: 'clamp(20px, 2.5vw, 28px)',
      width: '100%',
      height: '100%',
      minHeight: 0,
    }}>
      {orderedCategories.map((cat) => {
        const headerColor = HEADER_COLORS[cat.id] || '#7ECEC0';
        const headerBg = HEADER_BG[cat.id] || '#091F1F';
        const cardBg = CATEGORY_BG[cat.id] || CATEGORY_BG.daily;
        const cardBorder = CATEGORY_BORDERS[cat.id] || CATEGORY_BORDERS.daily;
        const cardTextColor = CARD_TEXT_COLORS[cat.id] || CARD_TEXT_COLORS.daily;

        const activeWords = cat.words.filter(w => w.enabled).slice(0, MAX_WORDS);
        const categoryName = cat.heading || cat.id.charAt(0).toUpperCase() + cat.id.slice(1);

        return (
          <div
            key={cat.id}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              backgroundColor: isDarkMode ? 'rgba(20, 25, 35, 0.45)' : 'rgba(0,0,0,0.04)',
              borderRadius: '28px',
              overflow: 'hidden',           // clips the header strip to rounded corners
              border: `1.5px solid ${cardBorder}50`,
              minWidth: 0,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            {/* ── Category Header — "plaque" style anchor ── */}
            <div style={{
              backgroundColor: headerBg,
              borderBottom: `2px solid ${cardBorder}60`,
              padding: 'clamp(16px, 2.5vh, 28px) clamp(12px, 1.5vw, 24px)',
              minHeight: 'clamp(60px, 7vh, 80px)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(8px, 1vw, 14px)',
              borderRadius: '14px 14px 0 0',
            }}>
              <span style={{
                fontSize: 'clamp(20px, 2.6vh, 30px)',
                lineHeight: 1,
                color: headerColor,
              }}>
                {CATEGORY_ICONS[cat.id] || ''}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '2px' }}>
                <h3 style={{
                  margin: 0,
                  fontSize: 'clamp(18px, 2.2vh, 26px)',
                  fontWeight: 900,
                  color: headerColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
                  textShadow: `0 0 20px ${headerColor}40`,
                }}>
                  {categoryName}
                </h3>
                {showHindi && (
                  <>
                    <div style={{ width: '40px', height: '1.5px', background: 'rgba(255,255,255,0.18)', borderRadius: '1px', margin: '2px 0' }} />
                    <span style={{
                      fontSize: 'clamp(20px, 2.6vh, 32px)',
                      fontWeight: 700,
                      color: 'rgba(255, 210, 140, 0.95)',
                      fontFamily: "'Noto Sans Devanagari', 'Mangal', sans-serif",
                      lineHeight: 1.2,
                      letterSpacing: '0.02em',
                    }}>
                      {{ emergency: 'इमरजेंसी', position: 'पोजीशन', daily: 'रोज़' }[cat.id] || categoryName}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* ── 2-Column fluid grid — fills all remaining height ── */}
            <div style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              columnGap: 'clamp(16px, 2vw, 20px)',
              rowGap: 'clamp(16px, 2vh, 20px)',
              padding: 'clamp(16px, 2vh, 24px) clamp(14px, 1.5vw, 20px)',
            }}>
              {activeWords.length > 0 ? activeWords.map((word, idx) => {
                const btnKey = `${idPrefix}-${cat.id}-${idx}`;
                const isActivated = activatedKey === btnKey;
                return (
                  <GazeButton
                    key={btnKey}
                    id={btnKey}
                    onClick={() => handleSelect(word, btnKey)}
                    isDarkMode={isDarkMode}
                    gazeEnabled={gazeEnabled}
                    gazeEnabledTimestamp={gazeEnabledTimestamp}
                    dwellCategory={cat.id === 'emergency' ? 'medicalUrgent' : 'quickWord'}
                    style={{
                      width: '100%',
                      height: '100%',
                      minHeight: 'clamp(120px, 14vh, 160px)',
                      backgroundColor: cardBg,
                      borderRadius: '18px',
                      border: isActivated
                        ? `2.5px solid rgba(255,255,255,0.85)`
                        : `1.5px solid ${cardBorder}`,
                      boxShadow: isActivated
                        ? '0 0 26px rgba(255,255,255,0.22)'
                        : '0 4px 16px rgba(0,0,0,0.18)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 'clamp(10px, 1.4vh, 18px) clamp(8px, 1vw, 14px)',
                      gap: 'clamp(4px, 0.6vh, 8px)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transform: isActivated ? 'scale(1.04)' : 'scale(1)',
                      transition: 'transform 0.12s ease, box-shadow 0.12s ease, border 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
                      <span style={{
                        fontSize: word.en.includes(' ')
                          ? 'clamp(20px, 2.5vh, 28px)'
                          : 'clamp(24px, 3vh, 34px)',
                        fontWeight: 800,
                        color: cardTextColor,
                        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
                        textAlign: 'center',
                        lineHeight: 1.15,
                        letterSpacing: '0.02em',
                        wordBreak: 'break-word',
                        textShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {word.en}
                      </span>

                      {showHindi && word.hi && (
                        <span style={{
                          fontSize: word.en.includes(' ')
                            ? 'clamp(24px, 3vh, 32px)'
                            : 'clamp(26px, 3.2vh, 36px)',
                          fontWeight: 700,
                          color: 'rgba(255, 210, 140, 0.95)',
                          fontFamily: "'Noto Sans Devanagari', 'Mangal', sans-serif",
                          textAlign: 'center',
                          lineHeight: 1.2,
                          textShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}>
                          {word.hi}
                        </span>
                      )}
                    </div>
                  </GazeButton>
                );
              }) : (
                <div style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '20px',
                  color: 'rgba(255,255,255,0.3)',
                  fontStyle: 'italic',
                  fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
                }}>
                  No words configured.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(QuickWordsGrid);
