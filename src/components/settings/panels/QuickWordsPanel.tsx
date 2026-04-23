/**
 * QuickWordsPanel - Settings panel for managing all Quick Words
 * =============================================================
 * Allows caregivers to:
 * - View all quick words grouped by category (Emergency, Position, Daily)
 * - Add, edit, delete words within each category
 * - Reorder words with up/down buttons
 * - Toggle words enabled/disabled
 * Standard HTML/CSS form elements (no GazeButton). Mouse-only.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { DEFAULT_CUSTOMIZATION } from '../../../services/defaultCustomization';
import type { QuickWord, QuickWordPriority, QuickWordCategory } from '../../../types/customization';

interface QuickWordsPanelProps {
  isDarkMode: boolean;
}

const MAX_WORDS_PER_CATEGORY = 8;

const CATEGORY_COLORS: Record<string, { accent: string; bg: string }> = {
  emergency: { accent: '#B91C1C', bg: 'rgba(185, 28, 28, 0.1)' },
  position: { accent: '#B45309', bg: 'rgba(180, 83, 9, 0.1)' },
  daily: { accent: '#2C7A7B', bg: 'rgba(44, 122, 123, 0.1)' },
};

// ============================================
// SCOPED CSS
// ============================================

const scopedCSS = (c: typeof darkColors) => `
  .qwp-btn {
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
  .qwp-btn:hover { background: ${c.background.tertiary}; border-color: ${c.text.tertiary}; }
  .qwp-btn:active { transform: scale(0.97); }
  .qwp-btn-success {
    background: ${c.success.main};
    color: #fff;
    border-color: ${c.success.main};
  }
  .qwp-btn-success:hover { filter: brightness(1.1); }
  .qwp-btn-danger {
    color: ${c.emergency.main};
    border-color: ${c.emergency.main}55;
    background: transparent;
  }
  .qwp-btn-danger:hover { background: ${c.emergency.subtle}; border-color: ${c.emergency.main}; }
  .qwp-input {
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
  .qwp-input:focus {
    border-color: ${c.accent.main};
    box-shadow: 0 0 0 2px ${c.accent.main}33;
  }
  .qwp-input::placeholder { color: ${c.text.tertiary}; }
  .qwp-word-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid ${c.border.main};
    background: ${c.background.secondary};
    transition: all 150ms;
  }
  .qwp-word-card:hover { border-color: ${c.text.tertiary}; }
  .qwp-del {
    width: 28px; height: 28px; border-radius: 6px;
    border: none; background: transparent;
    color: ${c.text.tertiary}; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; transition: all 150ms; flex-shrink: 0;
    font-family: inherit;
  }
  .qwp-del:hover { background: ${c.emergency.subtle}; color: ${c.emergency.main}; }
  .qwp-toast {
    position: fixed; top: 20px; right: 20px; z-index: 1100;
    padding: 12px 22px; border-radius: 10px;
    color: #fff; font-size: 14px; font-weight: 600;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    animation: qwpToastIn 200ms ease-out;
  }
  @keyframes qwpToastIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
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
  return <div className="qwp-toast" style={{ background: bg }}>{msg}</div>;
};

// ============================================
// MAIN COMPONENT
// ============================================

const QuickWordsPanel: React.FC<QuickWordsPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { data, updateQuickWords } = useCustomization();

  const originalCategories = data.quickWords?.categories ?? [];

  // Local editable copy of all categories
  const [editCategories, setEditCategories] = useState<QuickWordCategory[]>(
    () => structuredClone(originalCategories)
  );
  const [expandedCatId, setExpandedCatId] = useState<string>(originalCategories[0]?.id ?? 'emergency');
  const [editingKey, setEditingKey] = useState<string | null>(null); // "catId-index"
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Add new word form per category
  const [newWordText, setNewWordText] = useState<Record<string, { en: string; hi: string }>>({});
  // Category heading rename state
  const [editingHeadingId, setEditingHeadingId] = useState<string | null>(null);
  const [headingDraft, setHeadingDraft] = useState('');

  const isDirty = JSON.stringify(editCategories) !== JSON.stringify(originalCategories);

  // Sync external changes when not dirty
  React.useEffect(() => {
    if (!isDirty) {
      const fresh = data.quickWords?.categories ?? [];
      if (JSON.stringify(fresh) !== JSON.stringify(editCategories)) {
        setEditCategories(structuredClone(fresh));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.quickWords]);

  // ---- Category-level helpers ----

  const updateCategoryWords = useCallback((catId: string, updater: (words: QuickWord[]) => QuickWord[]) => {
    setEditCategories(prev =>
      prev.map(cat =>
        cat.id === catId ? { ...cat, words: updater(cat.words) } : cat
      )
    );
  }, []);

  const handleHeadingSave = useCallback((catId: string) => {
    const trimmed = headingDraft.trim();
    if (!trimmed) return;
    setEditCategories(prev =>
      prev.map(cat => cat.id === catId ? { ...cat, heading: trimmed } : cat)
    );
    setEditingHeadingId(null);
  }, [headingDraft]);

  const handleToggleEnabled = useCallback((catId: string, index: number) => {
    updateCategoryWords(catId, words => {
      const updated = [...words];
      updated[index] = { ...updated[index], enabled: !updated[index].enabled };
      return updated;
    });
  }, [updateCategoryWords]);

  const handleRemoveWord = useCallback((catId: string, index: number) => {
    updateCategoryWords(catId, words => words.filter((_, i) => i !== index));
    if (editingKey === `${catId}-${index}`) setEditingKey(null);
  }, [updateCategoryWords, editingKey]);

  const handleSaveEdit = useCallback((catId: string, index: number, en: string, hi: string) => {
    const trimEn = en.trim();
    if (!trimEn) {
      setToast({ msg: 'English word cannot be empty', type: 'error' });
      return;
    }
    updateCategoryWords(catId, words => {
      const updated = [...words];
      updated[index] = { ...updated[index], en: trimEn, hi: hi.trim() };
      return updated;
    });
    setEditingKey(null);
  }, [updateCategoryWords]);

  const handleMoveUp = useCallback((catId: string, index: number) => {
    if (index === 0) return;
    updateCategoryWords(catId, words => {
      const updated = [...words];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      return updated;
    });
  }, [updateCategoryWords]);

  const handleMoveDown = useCallback((catId: string, index: number) => {
    updateCategoryWords(catId, words => {
      if (index >= words.length - 1) return words;
      const updated = [...words];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      return updated;
    });
  }, [updateCategoryWords]);

  const handleAddWord = useCallback((catId: string) => {
    const form = newWordText[catId] ?? { en: '', hi: '' };
    const trimEn = form.en.trim();
    if (!trimEn) {
      setToast({ msg: 'Please enter an English word/phrase', type: 'error' });
      return;
    }
    const cat = editCategories.find(c => c.id === catId);
    if (cat && cat.words.length >= MAX_WORDS_PER_CATEGORY) {
      setToast({ msg: `Maximum ${MAX_WORDS_PER_CATEGORY} words per category`, type: 'error' });
      return;
    }
    if (cat?.words.some(w => w.en.toLowerCase() === trimEn.toLowerCase())) {
      setToast({ msg: 'This word already exists in this category', type: 'error' });
      return;
    }
    updateCategoryWords(catId, words => [
      ...words,
      { en: trimEn, hi: form.hi.trim(), enabled: true, priority: 'medium' as QuickWordPriority },
    ]);
    setNewWordText(prev => ({ ...prev, [catId]: { en: '', hi: '' } }));
  }, [newWordText, editCategories, updateCategoryWords]);

  // ---- Save / Reset ----

  const handleSave = useCallback(() => {
    updateQuickWords({
      ...data.quickWords,
      categories: structuredClone(editCategories),
    });
    setToast({ msg: 'Quick words saved', type: 'success' });
  }, [editCategories, data.quickWords, updateQuickWords]);

  const handleReset = useCallback(() => {
    const defaults = DEFAULT_CUSTOMIZATION.quickWords.categories;
    setEditCategories(structuredClone(defaults));
    setShowResetConfirm(false);
    setToast({ msg: 'Reset all categories to defaults', type: 'success' });
  }, []);

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
            Quick Words Manager
          </div>
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: 4,
          }}>
            Manage words shown on the Quick Words screen across all categories
            {isDirty && (
              <span style={{ color: colors.warning.main, marginLeft: 12, fontWeight: 600 }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="qwp-btn qwp-btn-danger" onClick={() => setShowResetConfirm(true)}>
            Reset All
          </button>
          <button
            className="qwp-btn qwp-btn-success"
            onClick={handleSave}
            disabled={!isDirty}
            style={{ opacity: isDirty ? 1 : 0.5, cursor: isDirty ? 'pointer' : 'default' }}
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
        The Quick Words screen shows 3 columns — one per category. Each category can have up to {MAX_WORDS_PER_CATEGORY} words.
        Toggle words <strong>ON/OFF</strong> to control which appear on the screen.
      </div>

      {/* Category sections */}
      {editCategories.map(cat => {
        const catStyle = CATEGORY_COLORS[cat.id] ?? { accent: '#6BB8C9', bg: 'rgba(107, 184, 201, 0.1)' };
        const isExpanded = expandedCatId === cat.id;
        const enabledCount = cat.words.filter(w => w.enabled).length;
        const form = newWordText[cat.id] ?? { en: '', hi: '' };

        return (
          <div key={cat.id} style={{
            borderRadius: 12,
            border: `1px solid ${colors.border.main}`,
            overflow: 'hidden',
          }}>
            {/* Category header — click to expand/collapse */}
            <button
              onClick={() => setExpandedCatId(isExpanded ? '' : cat.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: isExpanded ? catStyle.bg : colors.background.secondary,
                border: 'none',
                borderLeft: `6px solid ${catStyle.accent}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 150ms',
              }}
            >
              {/* Expand arrow */}
              <span style={{
                fontSize: 12,
                color: colors.text.tertiary,
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 150ms',
                flexShrink: 0,
              }}>
                &#9654;
              </span>
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                color: isExpanded ? catStyle.accent : colors.text.primary,
                flex: 1,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {editingHeadingId === cat.id ? (
                  <span
                    onClick={e => e.stopPropagation()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
                  >
                    <input
                      autoFocus
                      value={headingDraft}
                      onChange={e => setHeadingDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleHeadingSave(cat.id);
                        if (e.key === 'Escape') setEditingHeadingId(null);
                      }}
                      style={{
                        fontSize: 15, fontWeight: 700,
                        background: colors.background.tertiary,
                        border: `1px solid ${catStyle.accent}`,
                        borderRadius: 6, color: catStyle.accent,
                        padding: '3px 8px', outline: 'none',
                        width: '160px', fontFamily: 'inherit',
                      }}
                    />
                    <button
                      onClick={() => handleHeadingSave(cat.id)}
                      style={{
                        fontSize: 12, padding: '3px 10px',
                        background: catStyle.accent, color: '#fff',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >Save</button>
                    <button
                      onClick={() => setEditingHeadingId(null)}
                      style={{
                        fontSize: 12, padding: '3px 8px',
                        background: 'transparent', color: colors.text.tertiary,
                        border: `1px solid ${colors.border.main}`, borderRadius: 6,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >Cancel</button>
                  </span>
                ) : (
                  <>
                    {cat.heading}
                    <button
                      title="Rename category"
                      onClick={e => {
                        e.stopPropagation();
                        setEditingHeadingId(cat.id);
                        setHeadingDraft(cat.heading);
                      }}
                      style={{
                        background: 'transparent', border: 'none',
                        cursor: 'pointer', padding: '2px 4px',
                        color: colors.text.tertiary, fontSize: 13,
                        lineHeight: 1,
                      }}
                    >✏️</button>
                  </>
                )}
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: colors.text.tertiary,
                background: colors.background.tertiary,
                padding: '2px 10px',
                borderRadius: 12,
              }}>
                {enabledCount} active / {cat.words.length} total
              </span>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div style={{
                padding: '12px 16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                background: colors.background.primary,
              }}>
                {cat.words.length === 0 && (
                  <div style={{
                    padding: 16, textAlign: 'center',
                    color: colors.text.tertiary, fontSize: 13,
                  }}>
                    No words in this category. Add one below.
                  </div>
                )}

                {cat.words.map((word, idx) => {
                  const key = `${cat.id}-${idx}`;
                  const isEditing = editingKey === key;

                  if (isEditing) {
                    return (
                      <WordEditRow
                        key={key}
                        word={word}
                        onSave={(en, hi) => handleSaveEdit(cat.id, idx, en, hi)}
                        onCancel={() => setEditingKey(null)}
                      />
                    );
                  }

                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {/* Reorder */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                        <button
                          onClick={() => handleMoveUp(cat.id, idx)}
                          disabled={idx === 0}
                          style={{
                            width: 20, height: 16, border: 'none', borderRadius: 3,
                            background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer',
                            color: idx === 0 ? colors.border.main : colors.text.tertiary,
                            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'inherit',
                          }}
                          title="Move up"
                        >&#9650;</button>
                        <button
                          onClick={() => handleMoveDown(cat.id, idx)}
                          disabled={idx === cat.words.length - 1}
                          style={{
                            width: 20, height: 16, border: 'none', borderRadius: 3,
                            background: 'transparent', cursor: idx === cat.words.length - 1 ? 'default' : 'pointer',
                            color: idx === cat.words.length - 1 ? colors.border.main : colors.text.tertiary,
                            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'inherit',
                          }}
                          title="Move down"
                        >&#9660;</button>
                      </div>

                      {/* Word card */}
                      <div className="qwp-word-card" style={{ flex: 1, borderLeft: `4px solid ${catStyle.accent}` }}>
                        {/* Toggle */}
                        <button
                          onClick={() => handleToggleEnabled(cat.id, idx)}
                          style={{
                            width: 36, height: 20, borderRadius: 10, border: 'none',
                            cursor: 'pointer', position: 'relative', transition: 'background 150ms',
                            flexShrink: 0,
                            background: word.enabled ? catStyle.accent : colors.border.main,
                          }}
                          title={word.enabled ? 'Disable' : 'Enable'}
                        >
                          <span style={{
                            position: 'absolute', top: 2, left: 2,
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            transition: 'transform 150ms',
                            transform: word.enabled ? 'translateX(16px)' : 'translateX(0)',
                          }} />
                        </button>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, color: colors.text.primary,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            opacity: word.enabled ? 1 : 0.5,
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

                        {/* Edit */}
                        <button
                          onClick={() => setEditingKey(key)}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: colors.accent.main, fontSize: 13, fontWeight: 600,
                            padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit',
                          }}
                        >
                          Edit
                        </button>

                        {/* Delete */}
                        <button
                          className="qwp-del"
                          onClick={() => handleRemoveWord(cat.id, idx)}
                          title="Remove word"
                        >
                          &#x2715;
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add new word form */}
                {cat.words.length < MAX_WORDS_PER_CATEGORY && (
                  <div style={{
                    marginTop: 8,
                    padding: '10px 14px',
                    background: colors.background.secondary,
                    borderRadius: 10,
                    border: `1px solid ${colors.border.main}`,
                    display: 'flex', gap: 8, alignItems: 'center',
                  }}>
                    <input
                      className="qwp-input"
                      value={form.en}
                      onChange={e => setNewWordText(prev => ({ ...prev, [cat.id]: { ...form, en: e.target.value } }))}
                      placeholder="English word/phrase"
                      style={{ flex: 1 }}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddWord(cat.id); }}
                    />
                    <input
                      className="qwp-input"
                      value={form.hi}
                      onChange={e => setNewWordText(prev => ({ ...prev, [cat.id]: { ...form, hi: e.target.value } }))}
                      placeholder="Hindi (optional)"
                      style={{ flex: 1 }}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddWord(cat.id); }}
                    />
                    <button
                      className="qwp-btn qwp-btn-success"
                      onClick={() => handleAddWord(cat.id)}
                      style={{ padding: '8px 16px' }}
                    >
                      + Add
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Reset confirmation */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset All Quick Words?"
          message="This will restore all categories to their factory defaults. Any custom words will be lost."
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

// ============================================
// INLINE EDIT ROW
// ============================================

const WordEditRow: React.FC<{
  word: QuickWord;
  onSave: (en: string, hi: string) => void;
  onCancel: () => void;
}> = ({ word, onSave, onCancel }) => {
  const [editEn, setEditEn] = useState(word.en);
  const [editHi, setEditHi] = useState(word.hi);

  return (
    <div className="qwp-word-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, marginLeft: 24 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="qwp-input"
          value={editEn}
          onChange={e => setEditEn(e.target.value)}
          placeholder="English word/phrase"
          autoFocus
          style={{ flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') onSave(editEn, editHi); if (e.key === 'Escape') onCancel(); }}
        />
        <input
          className="qwp-input"
          value={editHi}
          onChange={e => setEditHi(e.target.value)}
          placeholder="Hindi (optional)"
          style={{ flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') onSave(editEn, editHi); if (e.key === 'Escape') onCancel(); }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="qwp-btn" onClick={onCancel} style={{ fontSize: 13, padding: '5px 12px' }}>Cancel</button>
        <button className="qwp-btn qwp-btn-success" onClick={() => onSave(editEn, editHi)} style={{ fontSize: 13, padding: '5px 12px' }}>Save</button>
      </div>
    </div>
  );
};

export default QuickWordsPanel;
