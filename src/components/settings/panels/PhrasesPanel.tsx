/**
 * PhrasesPanel - Accordion-style phrase category editor
 * ======================================================
 * Standard HTML/CSS form elements (no GazeButton).
 * Accordion categories with inline phrase editing.
 */

import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, layout, typography, spacing } from '../../../utils/design';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import type { PhraseCategory, Phrase } from '../../../types/customization';

interface PhrasesPanelProps {
  isDarkMode: boolean;
}

const MAX_CATEGORIES = 3;
const MAX_PHRASES_PER_CAT = 9;

// ============================================
// SCOPED CSS
// ============================================

const scopedCSS = (c: typeof darkColors) => `
  .pp-btn {
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
  .pp-btn:hover { background: ${c.background.tertiary}; border-color: ${c.text.tertiary}; }
  .pp-btn:active { transform: scale(0.97); }
  .pp-btn-primary {
    background: ${c.accent.main};
    color: #fff;
    border-color: ${c.accent.main};
  }
  .pp-btn-primary:hover { background: ${c.accent.hover}; border-color: ${c.accent.hover}; }
  .pp-btn-danger {
    color: ${c.emergency.main};
    border-color: ${c.emergency.main}55;
    background: transparent;
  }
  .pp-btn-danger:hover { background: ${c.emergency.subtle}; border-color: ${c.emergency.main}; }
  .pp-btn-ghost {
    background: transparent;
    border-color: transparent;
    color: ${c.accent.main};
    padding: 6px 12px;
  }
  .pp-btn-ghost:hover { background: ${c.accent.main}15; }
  .pp-btn-success {
    background: ${c.success.main};
    color: #fff;
    border-color: ${c.success.main};
  }
  .pp-btn-success:hover { filter: brightness(1.1); }
  .pp-input {
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
  .pp-input:focus {
    border-color: ${c.accent.main};
    box-shadow: 0 0 0 2px ${c.accent.main}33;
  }
  .pp-input::placeholder { color: ${c.text.tertiary}; }
  .pp-accordion {
    border: 1px solid ${c.border.main};
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 200ms;
  }
  .pp-accordion.expanded { border-color: ${c.accent.main}44; }
  .pp-accordion-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: ${c.background.secondary};
    cursor: pointer;
    user-select: none;
    border: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
    transition: background 150ms;
  }
  .pp-accordion-header:hover { background: ${c.background.tertiary}; }
  .pp-phrase-del {
    width: 30px; height: 30px; border-radius: 6px;
    border: none; background: transparent;
    color: ${c.text.tertiary}; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; transition: all 150ms; flex-shrink: 0;
    font-family: inherit;
  }
  .pp-phrase-del:hover { background: ${c.emergency.subtle}; color: ${c.emergency.main}; }
  .pp-phrase-del:disabled { opacity: 0.3; cursor: not-allowed; }
  .pp-phrase-del:disabled:hover { background: transparent; color: ${c.text.tertiary}; }
  .pp-toast {
    position: fixed; top: 20px; right: 20px; z-index: 1100;
    padding: 12px 22px; border-radius: 10px;
    color: #fff; font-size: 14px; font-weight: 600;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    animation: ppToastIn 200ms ease-out;
  }
  @keyframes ppToastIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// ============================================
// CHEVRON ICON
// ============================================

const Chevron: React.FC<{ open: boolean; color: string }> = ({ open, color }) => (
  <svg
    width={16} height={16} viewBox="0 0 16 16" fill="none"
    stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 200ms', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
  >
    <polyline points="6,3 11,8 6,13" />
  </svg>
);

// ============================================
// TOAST
// ============================================

const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onDone: () => void }> = ({ msg, type, onDone }) => {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  const bg = type === 'success' ? darkColors.success.main : darkColors.emergency.main;
  return <div className="pp-toast" style={{ background: bg }}>{msg}</div>;
};

// ============================================
// MAIN COMPONENT
// ============================================

const PhrasesPanel: React.FC<PhrasesPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { phraseCategories, updatePhraseCategory, addPhraseCategory, removePhraseCategory } = useCustomization();

  // Local editable copy for batch save
  const [editCats, setEditCats] = useState<PhraseCategory[]>(() => structuredClone(phraseCategories));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PhraseCategory | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Track dirty
  const originalSnapshot = JSON.stringify(phraseCategories);
  const isDirty = JSON.stringify(editCats) !== originalSnapshot;

  // Sync external changes when not dirty
  React.useEffect(() => {
    if (!isDirty) {
      const current = JSON.stringify(phraseCategories);
      if (current !== JSON.stringify(editCats)) {
        setEditCats(structuredClone(phraseCategories));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phraseCategories]);

  // Toggle accordion
  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    setRenamingId(null);
  }, []);

  // Rename
  const startRename = useCallback((cat: PhraseCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(cat.id);
    setRenameValue(cat.name);
  }, []);

  const commitRename = useCallback((catId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setToast({ msg: 'Category name is required', type: 'error' });
      return;
    }
    if (editCats.some(c => c.id !== catId && c.name.toLowerCase() === trimmed.toLowerCase())) {
      setToast({ msg: 'Category name must be unique', type: 'error' });
      return;
    }
    setEditCats(prev => prev.map(c => c.id === catId ? { ...c, name: trimmed } : c));
    setRenamingId(null);
  }, [renameValue, editCats]);

  // Add category
  const handleAddCategory = useCallback(() => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      setToast({ msg: 'Category name is required', type: 'error' });
      return;
    }
    if (editCats.length >= MAX_CATEGORIES) {
      setToast({ msg: `Maximum ${MAX_CATEGORIES} categories allowed`, type: 'error' });
      return;
    }
    if (editCats.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setToast({ msg: 'Category name must be unique', type: 'error' });
      return;
    }
    const id = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const newCat: PhraseCategory = { id: id || `cat_${Date.now()}`, name: trimmed, phrases: [{ en: '', hi: '' }] };
    setEditCats(prev => [...prev, newCat]);
    setNewCatName('');
    setShowNewCatInput(false);
    setExpandedId(newCat.id);
  }, [newCatName, editCats]);

  // Delete category (after confirmation)
  const handleDeleteCategory = useCallback(() => {
    if (!deleteTarget) return;
    if (editCats.length <= 1) {
      setToast({ msg: 'Must keep at least 1 category', type: 'error' });
      setDeleteTarget(null);
      return;
    }
    setEditCats(prev => prev.filter(c => c.id !== deleteTarget.id));
    if (expandedId === deleteTarget.id) setExpandedId(null);
    setDeleteTarget(null);
  }, [deleteTarget, editCats.length, expandedId]);

  // Phrase CRUD
  const updatePhrase = useCallback((catId: string, phIdx: number, field: 'en' | 'hi', value: string) => {
    setEditCats(prev => prev.map(c => {
      if (c.id !== catId) return c;
      const phrases = c.phrases.map((p, i) => i === phIdx ? { ...p, [field]: value } : p);
      return { ...c, phrases };
    }));
  }, []);

  const deletePhrase = useCallback((catId: string, phIdx: number) => {
    setEditCats(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return { ...c, phrases: c.phrases.filter((_, i) => i !== phIdx) };
    }));
  }, []);

  const addPhrase = useCallback((catId: string) => {
    setEditCats(prev => prev.map(c => {
      if (c.id !== catId) return c;
      if (c.phrases.length >= MAX_PHRASES_PER_CAT) return c;
      return { ...c, phrases: [...c.phrases, { en: '', hi: '' }] };
    }));
  }, []);

  // Save all
  const handleSaveAll = useCallback(() => {
    // Validate
    for (const cat of editCats) {
      if (!cat.name.trim()) {
        setToast({ msg: 'All categories must have a name', type: 'error' });
        return;
      }
      if (cat.phrases.length === 0) {
        setToast({ msg: `"${cat.name}" must have at least 1 phrase`, type: 'error' });
        return;
      }
      for (const ph of cat.phrases) {
        if (!ph.en.trim()) {
          setToast({ msg: `"${cat.name}" has a phrase with empty English text`, type: 'error' });
          return;
        }
      }
    }

    // Persist each category
    // First remove categories that no longer exist
    for (const existing of phraseCategories) {
      if (!editCats.find(c => c.id === existing.id)) {
        removePhraseCategory(existing.id);
      }
    }
    // Add or update
    for (const cat of editCats) {
      const existing = phraseCategories.find(c => c.id === cat.id);
      if (existing) {
        updatePhraseCategory(cat.id, cat);
      } else {
        addPhraseCategory(cat);
      }
    }
    setToast({ msg: 'All changes saved', type: 'success' });
  }, [editCats, phraseCategories, removePhraseCategory, updatePhraseCategory, addPhraseCategory]);

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
            Phrase Categories
          </div>
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: 4,
          }}>
            {editCats.length} of {MAX_CATEGORIES} categories
            {isDirty && (
              <span style={{ color: colors.accentText.gold, marginLeft: 12, fontWeight: 600 }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!showNewCatInput && (
            <button
              className="pp-btn pp-btn-primary"
              onClick={() => setShowNewCatInput(true)}
              disabled={editCats.length >= MAX_CATEGORIES}
              style={{
                opacity: editCats.length >= MAX_CATEGORIES ? 0.5 : 1,
                cursor: editCats.length >= MAX_CATEGORIES ? 'not-allowed' : 'pointer',
              }}
            >
              + Add Category
            </button>
          )}
          <button
            className="pp-btn pp-btn-success"
            onClick={handleSaveAll}
            disabled={!isDirty}
            style={{
              opacity: isDirty ? 1 : 0.5,
              cursor: isDirty ? 'pointer' : 'default',
            }}
          >
            Save All Changes
          </button>
        </div>
      </div>

      <div style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: `${colors.accent.main}10`,
        border: `1px solid ${colors.accent.main}30`,
        fontSize: 13,
        color: colors.text.secondary,
        lineHeight: 1.5,
      }}>
        Patient screen shows Communication, Feelings &amp; Emotions, and People &amp; Visitors. Each category displays up to {MAX_PHRASES_PER_CAT} phrases.
      </div>

      {/* New category inline input */}
      {showNewCatInput && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '12px 16px',
          background: colors.background.secondary,
          border: `1px solid ${colors.accent.main}44`,
          borderRadius: 10,
        }}>
          <input
            className="pp-input"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddCategory();
              if (e.key === 'Escape') { setShowNewCatInput(false); setNewCatName(''); }
            }}
            placeholder="New category name..."
            autoFocus
            style={{ flex: 1 }}
          />
          <button className="pp-btn pp-btn-success" onClick={handleAddCategory}>
            Create
          </button>
          <button className="pp-btn" onClick={() => { setShowNewCatInput(false); setNewCatName(''); }}>
            Cancel
          </button>
        </div>
      )}

      {/* Category accordions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {editCats.map(cat => {
          const isExpanded = expandedId === cat.id;
          const isRenaming = renamingId === cat.id;

          return (
            <div key={cat.id} className={`pp-accordion${isExpanded ? ' expanded' : ''}`}>
              {/* Accordion header */}
              <div
                className="pp-accordion-header"
                onClick={() => toggleExpand(cat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(cat.id); } }}
              >
                <Chevron open={isExpanded} color={isExpanded ? colors.accent.main : colors.text.tertiary} />

                {/* Category name or rename input */}
                {isRenaming ? (
                  <input
                    className="pp-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter') commitRename(cat.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                    style={{ flex: 1, maxWidth: 240 }}
                  />
                ) : (
                  <span style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: 600,
                    color: isExpanded ? colors.accent.main : colors.text.primary,
                  }}>
                    {cat.name}
                  </span>
                )}

                {/* Phrase count badge */}
                <span style={{
                  fontSize: 12,
                  color: colors.text.tertiary,
                  background: colors.background.tertiary,
                  padding: '2px 10px',
                  borderRadius: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {cat.phrases.length} phrase{cat.phrases.length !== 1 ? 's' : ''}
                </span>

                {/* Rename button */}
                {isRenaming ? (
                  <button className="pp-btn pp-btn-primary" onClick={e => { e.stopPropagation(); commitRename(cat.id); }} style={{ padding: '5px 12px', fontSize: 13 }}>
                    Done
                  </button>
                ) : (
                  <button className="pp-btn" onClick={e => startRename(cat, e)} style={{ padding: '5px 12px', fontSize: 13 }}>
                    Rename
                  </button>
                )}

                {/* Delete button */}
                <button
                  className="pp-btn pp-btn-danger"
                  onClick={e => { e.stopPropagation(); setDeleteTarget(cat); }}
                  style={{ padding: '5px 12px', fontSize: 13 }}
                >
                  Delete
                </button>
              </div>

              {/* Expanded phrase editor */}
              {isExpanded && (
                <div style={{
                  padding: '0 16px 16px 16px',
                  borderTop: `1px solid ${colors.border.main}`,
                  background: colors.background.primary,
                }}>
                  {/* Column headers */}
                  <div style={{
                    display: 'flex', gap: 10, padding: '10px 0 6px 0', alignItems: 'center',
                  }}>
                    <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>English *</span>
                    <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Hindi (optional)</span>
                    <span style={{ width: 30 }} />
                  </div>

                  {/* Phrase rows */}
                  {cat.phrases.map((phrase, phIdx) => (
                    <div
                      key={phIdx}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'center',
                        padding: '5px 0',
                        borderBottom: phIdx < cat.phrases.length - 1 ? `1px solid ${colors.border.main}33` : 'none',
                      }}
                    >
                      <input
                        className="pp-input"
                        value={phrase.en}
                        onChange={e => updatePhrase(cat.id, phIdx, 'en', e.target.value)}
                        placeholder="English phrase"
                        style={{ flex: 1 }}
                      />
                      <input
                        className="pp-input"
                        value={phrase.hi}
                        onChange={e => updatePhrase(cat.id, phIdx, 'hi', e.target.value)}
                        placeholder="Hindi translation"
                        style={{ flex: 1 }}
                      />
                      <button
                        className="pp-phrase-del"
                        onClick={() => deletePhrase(cat.id, phIdx)}
                        title="Delete phrase"
                        disabled={cat.phrases.length <= 1}
                      >
                        &#x2715;
                      </button>
                    </div>
                  ))}

                  {/* Empty state */}
                  {cat.phrases.length === 0 && (
                    <div style={{ padding: '14px 0', textAlign: 'center', color: colors.text.tertiary, fontSize: 14 }}>
                      No phrases. Add at least one.
                    </div>
                  )}

                  {/* Add phrase button */}
                  <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      className="pp-btn pp-btn-ghost"
                      onClick={() => addPhrase(cat.id)}
                      disabled={cat.phrases.length >= MAX_PHRASES_PER_CAT}
                      style={{
                        opacity: cat.phrases.length >= MAX_PHRASES_PER_CAT ? 0.5 : 1,
                        cursor: cat.phrases.length >= MAX_PHRASES_PER_CAT ? 'not-allowed' : 'pointer',
                      }}
                    >
                      + Add Phrase
                    </button>
                    {cat.phrases.length >= MAX_PHRASES_PER_CAT && (
                      <span style={{ fontSize: 12, color: colors.text.tertiary }}>
                        Max {MAX_PHRASES_PER_CAT} phrases
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {editCats.length === 0 && (
          <div style={{
            padding: 28, textAlign: 'center',
            color: colors.text.tertiary, fontSize: 14,
            background: colors.background.secondary,
            borderRadius: 10, border: `1px solid ${colors.border.main}`,
          }}>
            No categories. Click "+ Add Category" to create one.
          </div>
        )}
      </div>

      {/* Delete category confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.name}"?`}
          message={`This will remove "${deleteTarget.name}" and all ${deleteTarget.phrases.length} phrase${deleteTarget.phrases.length !== 1 ? 's' : ''} in it.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteCategory}
          onCancel={() => setDeleteTarget(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
};

export default PhrasesPanel;
