/**
 * HomeLayoutPanel - Quick Words Manager
 * ======================================
 * Allows users to:
 * - Manage a library of up to 15 quick words
 * - Choose which 4 are active (shown on the Home Screen)
 * - Add, edit, and remove words
 * Standard HTML/CSS form elements (no GazeButton).
 */

import React, { useState, useCallback, useMemo } from 'react';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { DEFAULT_CUSTOMIZATION } from '../../../services/defaultCustomization';
import type { HomeEmergencyCard, QuickWordPriority, QuickWordHighColor, QuickWordMediumColor } from '../../../types/customization';

interface HomeLayoutPanelProps {
  isDarkMode: boolean;
}

const MAX_WORDS = 15;
const MAX_ACTIVE = 4;

// ============================================
// SCOPED CSS
// ============================================

const scopedCSS = (c: typeof darkColors) => `
  .hl-btn {
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms;
    border: 1px solid ${c.border.main};
    background: ${c.background.secondary};
    color: ${c.text.primary};
    white-space: nowrap;
    font-family: inherit;
  }
  .hl-btn:hover { background: ${c.background.tertiary}; border-color: ${c.text.tertiary}; }
  .hl-btn:active { transform: scale(0.97); }
  .hl-btn-success {
    background: ${c.success.main};
    color: #fff;
    border-color: ${c.success.main};
  }
  .hl-btn-success:hover { filter: brightness(1.1); }
  .hl-btn-danger {
    color: ${c.emergency.main};
    border-color: ${c.emergency.main}55;
    background: transparent;
  }
  .hl-btn-danger:hover { background: ${c.emergency.subtle}; border-color: ${c.emergency.main}; }
  .hl-btn-ghost {
    background: transparent;
    border-color: transparent;
    color: ${c.accent.main};
    padding: 6px 12px;
  }
  .hl-btn-ghost:hover { background: ${c.accent.main}15; }
  .hl-input {
    padding: 8px 12px;
    background: ${c.background.tertiary};
    border: 1px solid ${c.border.main};
    border-radius: 8px;
    color: ${c.text.primary};
    font-size: 14px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    transition: border-color 150ms, box-shadow 150ms;
    width: 100%;
  }
  .hl-input:focus {
    border-color: ${c.accent.main};
    box-shadow: 0 0 0 2px ${c.accent.main}33;
  }
  .hl-input::placeholder { color: ${c.text.tertiary}; }
  .hl-slot-del {
    width: 28px; height: 28px; border-radius: 6px;
    border: none; background: transparent;
    color: ${c.text.tertiary}; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; transition: all 150ms; flex-shrink: 0;
    font-family: inherit;
  }
  .hl-slot-del:hover { background: ${c.emergency.subtle}; color: ${c.emergency.main}; }
  .hl-toast {
    position: fixed; top: 20px; right: 20px; z-index: 1100;
    padding: 12px 22px; border-radius: 10px;
    color: #fff; font-size: 14px; font-weight: 600;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    animation: hlToastIn 200ms ease-out;
  }
  @keyframes hlToastIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .hl-word-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid ${c.border.main};
    background: ${c.background.secondary};
    transition: all 150ms;
  }
  .hl-word-card:hover {
    border-color: ${c.text.tertiary};
  }
  .hl-word-card-active {
    border-color: ${c.accent.main}60;
    background: ${c.accent.main}10;
  }
  .hl-toggle {
    width: 36px; height: 20px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    position: relative;
    transition: background 150ms;
    flex-shrink: 0;
  }
  .hl-toggle::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 150ms;
  }
  .hl-toggle-on {
    background: ${c.accent.main};
  }
  .hl-toggle-on::after {
    transform: translateX(16px);
  }
  .hl-toggle-off {
    background: ${c.border.main};
  }
  .hl-active-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px; height: 22px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: ${c.accent.main};
    flex-shrink: 0;
  }
`;

// ============================================
// TOAST
// ============================================

const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onDone: () => void }> = ({ msg, type, onDone }) => {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  const bg = type === 'success' ? darkColors.success.main : darkColors.emergency.main;
  return <div className="hl-toast" style={{ background: bg }}>{msg}</div>;
};

// ============================================
// HELPERS
// ============================================

function getHomeEmergencyCards(data: any): HomeEmergencyCard[] {
  const cards: HomeEmergencyCard[] = data?.homeEmergencyCards ?? [];
  return cards.map(c => ({ ...c, priority: c.priority ?? 'high' }));
}

function getDefaultHomeEmergencyCards(): HomeEmergencyCard[] {
  return structuredClone(DEFAULT_CUSTOMIZATION.homeEmergencyCards);
}

// ============================================
// WORD ROW (editable)
// ============================================

const PRIORITY_PILL_COLORS: Record<QuickWordPriority, { bg: string; text: string }> = {
  high:   { bg: '#6B3E3E', text: '#F5C6C6' },
  medium: { bg: '#3E5B6B', text: '#B8D8E8' },
};

const WordRow: React.FC<{
  word: HomeEmergencyCard;
  index: number;
  activeIndex: number; // -1 if not active, else 0-3
  isEditingThis: boolean;
  canActivate: boolean;
  onToggleActive: () => void;
  onChangePriority: (priority: QuickWordPriority) => void;
  onEdit: () => void;
  onSaveEdit: (en: string, hi: string) => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  colors: typeof darkColors;
}> = ({ word, activeIndex, isEditingThis, canActivate, onToggleActive, onChangePriority, onEdit, onSaveEdit, onCancelEdit, onRemove, colors }) => {
  const [editEn, setEditEn] = useState(word.en);
  const [editHi, setEditHi] = useState(word.hi);

  // Sync when entering edit mode
  React.useEffect(() => {
    if (isEditingThis) {
      setEditEn(word.en);
      setEditHi(word.hi);
    }
  }, [isEditingThis, word.en, word.hi]);

  if (isEditingThis) {
    return (
      <div className="hl-word-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="hl-input"
            value={editEn}
            onChange={e => setEditEn(e.target.value)}
            placeholder="English word/phrase"
            autoFocus
            style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(editEn, editHi); if (e.key === 'Escape') onCancelEdit(); }}
          />
          <input
            className="hl-input"
            value={editHi}
            onChange={e => setEditHi(e.target.value)}
            placeholder="Hindi (optional)"
            style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(editEn, editHi); if (e.key === 'Escape') onCancelEdit(); }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="hl-btn" onClick={onCancelEdit} style={{ fontSize: 13, padding: '5px 12px' }}>Cancel</button>
          <button className="hl-btn hl-btn-success" onClick={() => onSaveEdit(editEn, editHi)} style={{ fontSize: 13, padding: '5px 12px' }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`hl-word-card${word.enabled ? ' hl-word-card-active' : ''}`}>
      {/* Active badge or empty space */}
      {activeIndex >= 0 ? (
        <span className="hl-active-badge">{activeIndex + 1}</span>
      ) : (
        <span style={{ width: 22, height: 22, flexShrink: 0 }} />
      )}

      {/* Toggle */}
      <button
        className={`hl-toggle ${word.enabled ? 'hl-toggle-on' : 'hl-toggle-off'}`}
        onClick={onToggleActive}
        disabled={!word.enabled && !canActivate}
        title={word.enabled ? 'Deactivate' : (canActivate ? 'Activate (show on Home)' : 'Max 4 active words reached')}
        style={{ opacity: (!word.enabled && !canActivate) ? 0.4 : 1 }}
      />

      {/* Word text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: colors.text.primary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {word.en}
        </div>
        {word.hi && (
          <div style={{
            fontSize: 12, color: colors.text.tertiary, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {word.hi}
          </div>
        )}
      </div>

      {/* Priority toggle */}
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: `1px solid ${colors.border.main}` }}>
        {(['high', 'medium'] as QuickWordPriority[]).map(p => {
          const isActive = (word.priority ?? 'high') === p;
          const pillColors = PRIORITY_PILL_COLORS[p];
          return (
            <button
              key={p}
              onClick={() => onChangePriority(p)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'inherit',
                border: 'none',
                cursor: 'pointer',
                background: isActive ? pillColors.bg : 'transparent',
                color: isActive ? pillColors.text : colors.text.tertiary,
                textTransform: 'capitalize',
                transition: 'all 150ms',
                letterSpacing: '0.3px',
              }}
            >
              {p === 'high' ? 'High' : 'Medium'}
            </button>
          );
        })}
      </div>

      {/* Edit button */}
      <button
        className="hl-btn-ghost"
        onClick={onEdit}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: colors.accent.main, fontSize: 13, fontWeight: 600,
          padding: '4px 8px', borderRadius: 6, transition: 'all 150ms',
          fontFamily: 'inherit',
        }}
      >
        Edit
      </button>

      {/* Delete button */}
      <button
        className="hl-slot-del"
        onClick={onRemove}
        title="Remove word"
      >
        &#x2715;
      </button>
    </div>
  );
};

// ============================================
// MINI PREVIEW (4 active words)
// ============================================

const HIGH_COLOR_PREVIEW: Record<QuickWordHighColor, string> = {
  red: '#5E3A3A',
  crimson: '#5C3454',
  muted_red: '#4A2E2E',
  muted_crimson: '#3F2536',
};

const MEDIUM_COLOR_PREVIEW: Record<QuickWordMediumColor, string> = {
  blue: '#3E5565',
  golden: '#5E5538',
  teal: '#3E6B58',
  muted_blue: '#2E4550',
  muted_golden: '#4E4430',
  muted_teal: '#2F5044',
};

const ActivePreview: React.FC<{
  words: HomeEmergencyCard[];
  colors: typeof darkColors;
  highColor: QuickWordHighColor;
  mediumColor: QuickWordMediumColor;
}> = ({ words, colors, highColor, mediumColor }) => {
  // Auto-sort: high priority first, then medium (stable sort preserves relative order)
  const active = words
    .filter(w => w.enabled)
    .sort((a, b) => {
      const pa = (a.priority ?? 'high') === 'high' ? 0 : 1;
      const pb = (b.priority ?? 'high') === 'high' ? 0 : 1;
      return pa - pb;
    })
    .slice(0, MAX_ACTIVE);

  return (
    <div style={{
      padding: 16,
      background: colors.background.primary,
      borderRadius: 10,
      border: `1px solid ${colors.border.main}`,
    }}>
      <div style={{ fontSize: 12, color: colors.text.tertiary, fontWeight: 600, marginBottom: 10 }}>
        Home Screen Preview — Quick Word Buttons
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
        maxWidth: 280,
      }}>
        {[0, 1, 2, 3].map(i => {
          const word = active[i];
          const priority: QuickWordPriority = word?.priority ?? 'high';
          const previewBg = priority === 'high' ? HIGH_COLOR_PREVIEW[highColor] : MEDIUM_COLOR_PREVIEW[mediumColor];
          return (
            <div key={i} style={{
              padding: '12px 8px',
              borderRadius: 12,
              background: word ? previewBg : `${colors.border.main}33`,
              border: word ? 'none' : `1px dashed ${colors.border.main}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 48,
            }}>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: word ? '#fff' : colors.text.tertiary,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                lineHeight: 1.3,
              }}>
                {word ? word.en : 'Empty'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const HomeLayoutPanel: React.FC<HomeLayoutPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const {
    data,
    updateHomeEmergencyCards,
    updateQuickWords,
    homeQuickActions,
    updateHomeQuickActions,
  } = useCustomization();

  // Get home emergency cards (independent from quickWords)
  const originalWords = useMemo(() => getHomeEmergencyCards(data), [data.homeEmergencyCards]);
  const originalHighColor: QuickWordHighColor = data.quickWords?.highColor ?? 'red';
  const originalMediumColor: QuickWordMediumColor = data.quickWords?.mediumColor ?? 'blue';

  // Local editable copy
  const [editWords, setEditWords] = useState<HomeEmergencyCard[]>(() => structuredClone(originalWords));
  const [editHighColor, setEditHighColor] = useState<QuickWordHighColor>(originalHighColor);
  const [editMediumColor, setEditMediumColor] = useState<QuickWordMediumColor>(originalMediumColor);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Add new card form
  const [newEn, setNewEn] = useState('');
  const [newHi, setNewHi] = useState('');
  const [newPriority, setNewPriority] = useState<QuickWordPriority>('high');

  // Track dirty
  const isDirty = JSON.stringify(editWords) !== JSON.stringify(originalWords) || editHighColor !== originalHighColor || editMediumColor !== originalMediumColor;
  const activeCount = editWords.filter(w => w.enabled).length;

  // Sync external changes when not dirty
  React.useEffect(() => {
    if (!isDirty) {
      const freshWords = getHomeEmergencyCards(data);
      if (JSON.stringify(freshWords) !== JSON.stringify(editWords)) {
        setEditWords(structuredClone(freshWords));
      }
      const freshHighColor = data.quickWords?.highColor ?? 'red';
      if (freshHighColor !== editHighColor) {
        setEditHighColor(freshHighColor);
      }
      const freshMediumColor = data.quickWords?.mediumColor ?? 'blue';
      if (freshMediumColor !== editMediumColor) {
        setEditMediumColor(freshMediumColor);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.homeEmergencyCards]);

  // Toggle word active/inactive
  const handleToggle = useCallback((index: number) => {
    setEditWords(prev => {
      const updated = [...prev];
      const word = updated[index];
      if (word.enabled) {
        // Deactivate
        updated[index] = { ...word, enabled: false };
      } else {
        // Activate — check limit
        const currentActive = prev.filter(w => w.enabled).length;
        if (currentActive >= MAX_ACTIVE) return prev;
        updated[index] = { ...word, enabled: true };
      }
      return updated;
    });
  }, []);

  // Change priority
  const handleChangePriority = useCallback((index: number, priority: QuickWordPriority) => {
    setEditWords(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], priority };
      return updated;
    });
  }, []);

  // Edit word
  const handleSaveEdit = useCallback((index: number, en: string, hi: string) => {
    const trimEn = en.trim();
    if (!trimEn) {
      setToast({ msg: 'English word cannot be empty', type: 'error' });
      return;
    }
    setEditWords(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], en: trimEn, hi: hi.trim() };
      return updated;
    });
    setEditingIndex(null);
  }, []);

  // Remove word
  const handleRemove = useCallback((index: number) => {
    setEditWords(prev => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  }, [editingIndex]);

  // Add new word
  const handleAdd = useCallback(() => {
    const trimEn = newEn.trim();
    if (!trimEn) {
      setToast({ msg: 'Please enter an English word/phrase', type: 'error' });
      return;
    }
    if (editWords.length >= MAX_WORDS) {
      setToast({ msg: `Maximum ${MAX_WORDS} words reached`, type: 'error' });
      return;
    }
    // Check duplicate
    if (editWords.some(w => w.en.toLowerCase() === trimEn.toLowerCase())) {
      setToast({ msg: 'This word already exists in the library', type: 'error' });
      return;
    }
    const shouldActivate = activeCount < MAX_ACTIVE;
    setEditWords(prev => [...prev, { en: trimEn, hi: newHi.trim(), enabled: shouldActivate, priority: newPriority }]);
    setNewEn('');
    setNewHi('');
    setNewPriority('high');
  }, [newEn, newHi, newPriority, editWords, activeCount]);

  // Move word up/down in list
  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setEditWords(prev => {
      const updated = [...prev];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      return updated;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setEditWords(prev => {
      if (index >= prev.length - 1) return prev;
      const updated = [...prev];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      return updated;
    });
  }, []);

  // Save — update homeEmergencyCards independently (decoupled from Quick Words)
  const handleSave = useCallback(() => {
    // Validate at least 1 active card
    const activeCards = editWords.filter(w => w.enabled);
    if (activeCards.length === 0) {
      setToast({ msg: 'At least 1 card must be active', type: 'error' });
      return;
    }

    // Save home emergency cards directly
    updateHomeEmergencyCards(structuredClone(editWords));

    // Persist color changes to quickWords (colors are read from quickWords by HomeScreen)
    if (editHighColor !== originalHighColor || editMediumColor !== originalMediumColor) {
      updateQuickWords({
        ...data.quickWords,
        highColor: editHighColor,
        mediumColor: editMediumColor,
      });
    }

    // Also sync leftSidebar with active cards as fallback
    const newLeftSidebar = activeCards.slice(0, MAX_ACTIVE).map(w => ({ label: w.en }));
    updateHomeQuickActions({
      ...homeQuickActions,
      leftSidebar: newLeftSidebar,
    });

    setToast({ msg: 'Home emergency cards saved', type: 'success' });
  }, [editWords, editHighColor, editMediumColor, originalHighColor, originalMediumColor, data.quickWords, updateHomeEmergencyCards, updateQuickWords, updateHomeQuickActions, homeQuickActions]);

  // Reset
  const handleReset = useCallback(() => {
    const defaultCards = getDefaultHomeEmergencyCards();
    setEditWords(structuredClone(defaultCards));
    setEditHighColor('red');
    setEditMediumColor('blue');
    setShowResetConfirm(false);
    setToast({ msg: 'Reset to default cards', type: 'success' });
  }, []);

  // Compute active index for each word
  const activeIndices = useMemo(() => {
    const map = new Map<number, number>();
    let activeI = 0;
    for (let i = 0; i < editWords.length; i++) {
      if (editWords[i].enabled && activeI < MAX_ACTIVE) {
        map.set(i, activeI);
        activeI++;
      }
    }
    return map;
  }, [editWords]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
      <style>{scopedCSS(colors)}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{
            fontSize: typography.fontSize.xl,
            color: colors.text.primary,
            fontWeight: typography.fontWeight.bold,
          }}>
            Home Emergency Cards
          </div>
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: 4,
          }}>
            Manage the emergency cards on the Home Screen (independent from Quick Words)
            {isDirty && (
              <span style={{ color: colors.warning.main, marginLeft: 12, fontWeight: 600 }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="hl-btn hl-btn-danger"
            onClick={() => setShowResetConfirm(true)}
          >
            Reset to Defaults
          </button>
          <button
            className="hl-btn hl-btn-success"
            onClick={handleSave}
            disabled={!isDirty}
            style={{
              opacity: isDirty ? 1 : 0.5,
              cursor: isDirty ? 'pointer' : 'default',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: `${colors.accent.main}10`,
        border: `1px solid ${colors.accent.main}30`,
        fontSize: 13,
        color: colors.text.secondary,
        lineHeight: 1.5,
      }}>
        Toggle words <strong>ON</strong> to show them on the Home Screen (max {MAX_ACTIVE} active).
        You can save up to {MAX_WORDS} words in your library and swap them anytime.
      </div>

      {/* Active count indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: colors.text.secondary,
        }}>
          Active on Home:
        </span>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: activeCount >= MAX_ACTIVE ? colors.warning.main : colors.accent.main,
          background: activeCount >= MAX_ACTIVE ? `${colors.warning.main}15` : `${colors.accent.main}15`,
          padding: '2px 10px', borderRadius: 12,
        }}>
          {activeCount} / {MAX_ACTIVE}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 12, color: colors.text.tertiary,
          background: colors.background.tertiary,
          padding: '2px 10px', borderRadius: 12, fontWeight: 600,
        }}>
          {editWords.length} / {MAX_WORDS} words saved
        </span>
      </div>

      {/* Word Library */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '16px',
        background: colors.background.secondary,
        borderRadius: 10,
        border: `1px solid ${colors.border.main}`,
      }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: colors.text.primary, marginBottom: 4,
        }}>
          Word Library
        </div>

        {editWords.length === 0 && (
          <div style={{
            padding: 20, textAlign: 'center',
            color: colors.text.tertiary, fontSize: 13,
          }}>
            No words yet. Add your first quick word below.
          </div>
        )}

        {editWords.map((word, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Reorder buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
              <button
                onClick={() => handleMoveUp(idx)}
                disabled={idx === 0}
                style={{
                  width: 20, height: 16, border: 'none', borderRadius: 3,
                  background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer',
                  color: idx === 0 ? colors.border.main : colors.text.tertiary,
                  fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', transition: 'color 150ms',
                }}
                title="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => handleMoveDown(idx)}
                disabled={idx === editWords.length - 1}
                style={{
                  width: 20, height: 16, border: 'none', borderRadius: 3,
                  background: 'transparent', cursor: idx === editWords.length - 1 ? 'default' : 'pointer',
                  color: idx === editWords.length - 1 ? colors.border.main : colors.text.tertiary,
                  fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', transition: 'color 150ms',
                }}
                title="Move down"
              >
                ▼
              </button>
            </div>

            {/* Word card */}
            <div style={{ flex: 1 }}>
              <WordRow
                word={word}
                index={idx}
                activeIndex={activeIndices.get(idx) ?? -1}
                isEditingThis={editingIndex === idx}
                canActivate={activeCount < MAX_ACTIVE}
                onToggleActive={() => handleToggle(idx)}
                onChangePriority={(p) => handleChangePriority(idx, p)}
                onEdit={() => setEditingIndex(idx)}
                onSaveEdit={(en, hi) => handleSaveEdit(idx, en, hi)}
                onCancelEdit={() => setEditingIndex(null)}
                onRemove={() => handleRemove(idx)}
                colors={colors}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add new word */}
      {editWords.length < MAX_WORDS && (
        <div style={{
          padding: '14px 16px',
          background: colors.background.secondary,
          borderRadius: 10,
          border: `1px solid ${colors.border.main}`,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>
            Add New Word
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="hl-input"
              value={newEn}
              onChange={e => setNewEn(e.target.value)}
              placeholder="English word/phrase"
              style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <input
              className="hl-input"
              value={newHi}
              onChange={e => setNewHi(e.target.value)}
              placeholder="Hindi (optional)"
              style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            {/* Priority selector */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: `1px solid ${colors.border.main}` }}>
              {(['high', 'medium'] as QuickWordPriority[]).map(p => {
                const isActive = newPriority === p;
                const pillColors = PRIORITY_PILL_COLORS[p];
                return (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? pillColors.bg : 'transparent',
                      color: isActive ? pillColors.text : colors.text.tertiary,
                      textTransform: 'capitalize',
                      transition: 'all 150ms',
                    }}
                  >
                    {p === 'high' ? 'High' : 'Medium'}
                  </button>
                );
              })}
            </div>
            <button
              className="hl-btn hl-btn-success"
              onClick={handleAdd}
              style={{ padding: '8px 16px' }}
            >
              + Add
            </button>
          </div>
          {activeCount < MAX_ACTIVE && (
            <div style={{ fontSize: 12, color: colors.text.tertiary }}>
              New words will be automatically activated (you have {MAX_ACTIVE - activeCount} slot{MAX_ACTIVE - activeCount !== 1 ? 's' : ''} available)
            </div>
          )}
        </div>
      )}

      {/* Card Color Customization */}
      <div style={{
        padding: '14px 16px',
        background: colors.background.secondary,
        borderRadius: 10,
        border: `1px solid ${colors.border.main}`,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>
            Card Color Customization
          </div>
          <div style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 3, lineHeight: 1.4 }}>
            Choose background colors for quick word cards on the Home Screen.
          </div>
        </div>

        {/* High Priority Color */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.text.secondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            High Priority
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {([
              { key: 'muted_red' as QuickWordHighColor, label: 'Subtle Red (Recommended)', bg: '#563636', bgSub: '#472D2D' },
              { key: 'muted_crimson' as QuickWordHighColor, label: 'Subtle Crimson', bg: '#4A2B42', bgSub: '#3D2438' },
              { key: 'red' as QuickWordHighColor, label: 'Warm Red', bg: '#6B3E3E', bgSub: '#583333' },
              { key: 'crimson' as QuickWordHighColor, label: 'Deep Crimson', bg: '#5C3454', bgSub: '#4D2B47' },
            ]).map(opt => {
              const isSelected = editHighColor === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setEditHighColor(opt.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: isSelected
                      ? `2px solid ${colors.accent.main}`
                      : `1px solid ${colors.border.main}`,
                    background: isSelected ? `${colors.accent.main}10` : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 36, height: 28, borderRadius: 6, flexShrink: 0,
                    background: `linear-gradient(145deg, ${opt.bg} 0%, ${opt.bgSub} 100%)`,
                    border: '1px solid rgba(255,255,255,0.1)',
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? colors.accent.main : colors.text.primary }}>
                    {opt.label}
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: 14, color: colors.accent.main, marginLeft: 4 }}>&#10003;</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: colors.border.main, opacity: 0.5 }} />

        {/* Medium Priority Color */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.text.secondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Medium Priority
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {([
              { key: 'muted_blue' as QuickWordMediumColor, label: 'Subtle Blue (Recommended)', bg: '#344E5C', bgSub: '#2C4250' },
              { key: 'muted_golden' as QuickWordMediumColor, label: 'Subtle Golden', bg: '#5C5036', bgSub: '#4D442E' },
              { key: 'muted_teal' as QuickWordMediumColor, label: 'Subtle Teal', bg: '#355C4C', bgSub: '#2D4E40' },
              { key: 'blue' as QuickWordMediumColor, label: 'Steel Blue', bg: '#3E5B6B', bgSub: '#334D5C' },
              { key: 'golden' as QuickWordMediumColor, label: 'Warm Golden', bg: '#6B5B3E', bgSub: '#5C4D33' },
              { key: 'teal' as QuickWordMediumColor, label: 'Muted Teal', bg: '#3E6B58', bgSub: '#335C4A' },
            ]).map(opt => {
              const isSelected = editMediumColor === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setEditMediumColor(opt.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: isSelected
                      ? `2px solid ${colors.accent.main}`
                      : `1px solid ${colors.border.main}`,
                    background: isSelected ? `${colors.accent.main}10` : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 36, height: 28, borderRadius: 6, flexShrink: 0,
                    background: `linear-gradient(145deg, ${opt.bg} 0%, ${opt.bgSub} 100%)`,
                    border: '1px solid rgba(255,255,255,0.1)',
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? colors.accent.main : colors.text.primary }}>
                    {opt.label}
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: 14, color: colors.accent.main, marginLeft: 4 }}>&#10003;</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Preview */}
      <ActivePreview words={editWords} colors={colors} highColor={editHighColor} mediumColor={editMediumColor} />

      {/* Reset confirmation */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset Emergency Cards?"
          message="This will restore the Home screen emergency cards to their factory defaults. Any custom cards will be lost."
          confirmLabel="Reset"
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
          isDarkMode={isDarkMode}
          variant="warning"
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
};

export default HomeLayoutPanel;
