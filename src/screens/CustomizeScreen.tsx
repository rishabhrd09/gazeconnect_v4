/**
 * GazeConnect Pro - Customize Screen (People Management)
 * =======================================================
 * Standard HTML/CSS form-based editor for managing people and their phrases.
 * NOT gaze-enabled — uses regular mouse/keyboard interaction.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { darkColors, lightColors, typography, spacing, layout } from '../utils/design';
import { useCustomization } from '../contexts/CustomizationContext';
import { generateDefaultPhrases } from '../services/defaultCustomization';
import { ROLES } from '../types/customization';
import type { Person, Phrase } from '../types/customization';
import { BackIcon } from '../components/icons/Icons';

interface Props {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

const MAX_PEOPLE = 8;

// ============================================
// SUB-COMPONENTS
// ============================================

/** Toast notification */
const Toast: React.FC<{ message: string; type: 'success' | 'error'; onDismiss: () => void }> = ({ message, type, onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2800);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'fixed', top: 24, right: 24, zIndex: 1000,
      padding: '14px 24px', borderRadius: 10,
      background: type === 'success' ? darkColors.success.main : darkColors.emergency.main,
      color: '#fff', fontSize: 15, fontWeight: 600,
      boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
      animation: 'czToastIn 200ms ease-out',
    }}>
      {message}
    </div>
  );
};

/** Modal confirmation dialog */
const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}> = ({ title, message, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, danger }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 999,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }} onClick={onCancel}>
    <div onClick={e => e.stopPropagation()} style={{
      background: darkColors.background.secondary,
      border: `1px solid ${darkColors.border.main}`,
      borderRadius: 14, padding: '28px 32px', maxWidth: 420, width: '90%',
      boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
    }}>
      <h3 style={{ color: darkColors.text.primary, fontSize: 18, fontWeight: 700, margin: '0 0 10px 0' }}>
        {title}
      </h3>
      <p style={{ color: darkColors.text.secondary, fontSize: 15, margin: '0 0 24px 0', lineHeight: 1.5 }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="cz-btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className={danger ? 'cz-btn cz-btn-danger' : 'cz-btn cz-btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

/** Unsaved changes dialog (3 options: Save, Discard, Cancel) */
const UnsavedDialog: React.FC<{
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}> = ({ onSave, onDiscard, onCancel }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 999,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }} onClick={onCancel}>
    <div onClick={e => e.stopPropagation()} style={{
      background: darkColors.background.secondary,
      border: `1px solid ${darkColors.border.main}`,
      borderRadius: 14, padding: '28px 32px', maxWidth: 420, width: '90%',
      boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
    }}>
      <h3 style={{ color: darkColors.text.primary, fontSize: 18, fontWeight: 700, margin: '0 0 10px 0' }}>
        Unsaved Changes
      </h3>
      <p style={{ color: darkColors.text.secondary, fontSize: 15, margin: '0 0 24px 0', lineHeight: 1.5 }}>
        You have unsaved changes. What would you like to do?
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="cz-btn" onClick={onCancel}>Cancel</button>
        <button className="cz-btn cz-btn-danger" onClick={onDiscard}>Discard</button>
        <button className="cz-btn cz-btn-primary" onClick={onSave}>Save & Leave</button>
      </div>
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

const CustomizeScreen: React.FC<Props> = ({ onNavigate, isDarkMode = true }) => {
  const { people, updatePeople } = useCustomization();
  const colors = isDarkMode ? darkColors : lightColors;

  // Local editable copy
  const [editPeople, setEditPeople] = useState<Person[]>(() => structuredClone(people));
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  // New person form
  const [newName, setNewName] = useState('');
  const [newNameHi, setNewNameHi] = useState('');
  const [newRole, setNewRole] = useState<string>(ROLES[0]);

  // Track dirty state
  const originalRef = useRef(JSON.stringify(people));
  const isDirty = JSON.stringify(editPeople) !== originalRef.current;

  // Sync if external changes arrive while not dirty
  useEffect(() => {
    if (!isDirty) {
      const newSnapshot = JSON.stringify(people);
      if (newSnapshot !== originalRef.current) {
        setEditPeople(structuredClone(people));
        originalRef.current = newSnapshot;
      }
    }
  }, [people, isDirty]);

  // Navigation with dirty check
  const handleNavigate = useCallback((screen: string) => {
    if (isDirty) {
      setPendingNav(screen);
    } else {
      onNavigate(screen);
    }
  }, [isDirty, onNavigate]);

  // Validate and save
  const doSave = useCallback((): boolean => {
    for (const p of editPeople) {
      if (!p.name.trim()) {
        setToast({ msg: 'All people must have a name', type: 'error' });
        return false;
      }
      if (p.phrases.length === 0) {
        setToast({ msg: `${p.name} must have at least 1 phrase`, type: 'error' });
        return false;
      }
    }
    updatePeople(editPeople);
    originalRef.current = JSON.stringify(editPeople);
    setToast({ msg: 'Changes saved successfully', type: 'success' });
    return true;
  }, [editPeople, updatePeople]);

  // Dialog handlers
  const handleUnsavedSave = useCallback(() => {
    if (doSave() && pendingNav) {
      onNavigate(pendingNav);
      setPendingNav(null);
    }
  }, [doSave, pendingNav, onNavigate]);

  const handleUnsavedDiscard = useCallback(() => {
    if (pendingNav) {
      onNavigate(pendingNav);
      setPendingNav(null);
    }
  }, [pendingNav, onNavigate]);

  // Person CRUD
  const handleAddPerson = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setToast({ msg: 'Name is required', type: 'error' });
      return;
    }
    if (editPeople.length >= MAX_PEOPLE) {
      setToast({ msg: `Maximum ${MAX_PEOPLE} people allowed`, type: 'error' });
      return;
    }
    const hi = newNameHi.trim() || trimmed;
    setEditPeople(prev => [...prev, {
      name: trimmed, nameHi: hi, role: newRole,
      phrases: generateDefaultPhrases(trimmed, hi),
    }]);
    setNewName(''); setNewNameHi(''); setNewRole(ROLES[0]);
    setShowAddForm(false);
  }, [newName, newNameHi, newRole, editPeople.length]);

  const handleDeletePerson = useCallback((idx: number) => {
    setEditPeople(prev => prev.filter((_, i) => i !== idx));
    setConfirmDeleteIdx(null);
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
  }, [expandedIdx]);

  // Person field editing
  const updatePersonField = useCallback((idx: number, field: keyof Person, value: string) => {
    setEditPeople(prev => {
      const next = structuredClone(prev);
      (next[idx] as any)[field] = value;
      return next;
    });
  }, []);

  // Phrase CRUD
  const updatePhrase = useCallback((pIdx: number, phIdx: number, field: 'en' | 'hi', value: string) => {
    setEditPeople(prev => {
      const next = structuredClone(prev);
      next[pIdx].phrases[phIdx][field] = value;
      return next;
    });
  }, []);

  const deletePhrase = useCallback((pIdx: number, phIdx: number) => {
    setEditPeople(prev => {
      const next = structuredClone(prev);
      next[pIdx].phrases.splice(phIdx, 1);
      return next;
    });
  }, []);

  const addPhrase = useCallback((pIdx: number) => {
    setEditPeople(prev => {
      const next = structuredClone(prev);
      next[pIdx].phrases.push({ en: '', hi: '' });
      return next;
    });
  }, []);

  // CSS for form elements (injected as <style> tag)
  const cssVars = {
    bg1: colors.background.primary,
    bg2: colors.background.secondary,
    bg3: colors.background.tertiary,
    border: colors.border.main,
    borderFocus: colors.accent.main,
    text1: colors.text.primary,
    text2: colors.text.secondary,
    text3: colors.text.tertiary,
    accent: colors.accent.main,
    accentHover: colors.accent.hover,
    danger: colors.emergency.main,
    dangerBg: colors.emergency.subtle,
    success: colors.success.main,
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: colors.background.primary, overflow: 'hidden',
    }}>
      {/* Scoped CSS for form elements */}
      <style>{`
        @keyframes czToastIn {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cz-input {
          padding: 10px 14px;
          background: ${cssVars.bg3};
          border: 1px solid ${cssVars.border};
          border-radius: 8px;
          color: ${cssVars.text1};
          font-size: 15px;
          font-family: ${typography.fontFamily.primary};
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .cz-input:focus {
          border-color: ${cssVars.borderFocus};
          box-shadow: 0 0 0 2px ${cssVars.borderFocus}33;
        }
        .cz-input::placeholder { color: ${cssVars.text3}; }
        .cz-select {
          padding: 10px 14px;
          background: ${cssVars.bg3};
          border: 1px solid ${cssVars.border};
          border-radius: 8px;
          color: ${cssVars.text1};
          font-size: 15px;
          font-family: ${typography.fontFamily.primary};
          outline: none;
          cursor: pointer;
          transition: border-color 150ms;
        }
        .cz-select:focus { border-color: ${cssVars.borderFocus}; }
        .cz-btn {
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          font-family: ${typography.fontFamily.primary};
          cursor: pointer;
          transition: all 150ms;
          border: 1px solid ${cssVars.border};
          background: ${cssVars.bg2};
          color: ${cssVars.text1};
          white-space: nowrap;
        }
        .cz-btn:hover { background: ${cssVars.bg3}; border-color: ${cssVars.text3}; }
        .cz-btn:active { transform: scale(0.97); }
        .cz-btn-primary {
          background: ${cssVars.accent};
          color: #fff;
          border-color: ${cssVars.accent};
        }
        .cz-btn-primary:hover { background: ${cssVars.accentHover}; border-color: ${cssVars.accentHover}; }
        .cz-btn-danger {
          color: ${cssVars.danger};
          border-color: ${cssVars.danger}66;
          background: transparent;
        }
        .cz-btn-danger:hover { background: ${cssVars.dangerBg}; border-color: ${cssVars.danger}; }
        .cz-btn-success {
          background: ${cssVars.success};
          color: #fff;
          border-color: ${cssVars.success};
        }
        .cz-btn-success:hover { filter: brightness(1.1); }
        .cz-btn-ghost {
          background: transparent;
          border-color: transparent;
          color: ${cssVars.accent};
        }
        .cz-btn-ghost:hover { background: ${cssVars.accent}15; }
        .cz-person-card {
          background: ${cssVars.bg2};
          border: 1px solid ${cssVars.border};
          border-radius: 12px;
          transition: border-color 200ms;
        }
        .cz-person-card:hover { border-color: ${cssVars.text3}; }
        .cz-person-card.expanded { border-color: ${cssVars.accent}66; }
        .cz-phrase-row {
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 6px 0;
        }
        .cz-phrase-row:not(:last-child) {
          border-bottom: 1px solid ${cssVars.border}66;
        }
        .cz-phrase-delete {
          width: 32px; height: 32px; border-radius: 6px;
          border: none; background: transparent;
          color: ${cssVars.text3}; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; transition: all 150ms; flex-shrink: 0;
        }
        .cz-phrase-delete:hover { background: ${cssVars.dangerBg}; color: ${cssVars.danger}; }
      `}</style>

      {/* ===== HEADER ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 24px',
        borderBottom: `1px solid ${colors.border.main}`,
        flexShrink: 0,
      }}>
        <button
          className="cz-btn"
          onClick={() => handleNavigate('settings')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
        >
          <BackIcon size={18} color={colors.text.primary} />
          Back
        </button>
        <h1 style={{
          fontSize: 22, fontWeight: 700, color: colors.text.primary, margin: 0,
          fontFamily: typography.fontFamily.primary,
        }}>
          Customize People
        </h1>
        <div style={{ flex: 1 }} />
        {isDirty && (
          <span style={{ fontSize: 13, color: colors.accentText.gold, fontWeight: 600 }}>
            Unsaved changes
          </span>
        )}
        <button
          className="cz-btn cz-btn-primary"
          onClick={doSave}
          style={{ padding: '10px 28px', fontSize: 15 }}
        >
          Save Changes
        </button>
      </div>

      {/* ===== CONTENT (scrollable) ===== */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 24px 40px 24px',
        maxWidth: 860, width: '100%', margin: '0 auto',
      }}>
        {/* People count & add button */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 14, color: colors.text.secondary }}>
            {editPeople.length} of {MAX_PEOPLE} people
          </span>
          {!showAddForm && (
            <button
              className="cz-btn cz-btn-primary"
              onClick={() => setShowAddForm(true)}
              disabled={editPeople.length >= MAX_PEOPLE}
              style={{
                opacity: editPeople.length >= MAX_PEOPLE ? 0.5 : 1,
                cursor: editPeople.length >= MAX_PEOPLE ? 'not-allowed' : 'pointer',
              }}
            >
              + Add New Person
            </button>
          )}
        </div>

        {/* ===== ADD PERSON FORM ===== */}
        {showAddForm && (
          <div style={{
            background: colors.background.secondary,
            border: `1px solid ${colors.accent.main}55`,
            borderRadius: 12, padding: 20, marginBottom: 20,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16,
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: colors.accent.main }}>
                Add New Person
              </span>
              <button className="cz-btn" onClick={() => { setShowAddForm(false); setNewName(''); setNewNameHi(''); setNewRole(ROLES[0]); }} style={{ padding: '4px 12px', fontSize: 13 }}>
                Cancel
              </button>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: 'block', fontSize: 13, color: colors.text.secondary, marginBottom: 6 }}>
                  Name (English) *
                </label>
                <input
                  className="cz-input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Papa"
                  autoFocus
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: 'block', fontSize: 13, color: colors.text.secondary, marginBottom: 6 }}>
                  Name (Hindi)
                </label>
                <input
                  className="cz-input"
                  value={newNameHi}
                  onChange={e => setNewNameHi(e.target.value)}
                  placeholder="e.g. &#x092A;&#x093E;&#x092A;&#x093E;"
                />
              </div>
              <div style={{ minWidth: 140 }}>
                <label style={{ display: 'block', fontSize: 13, color: colors.text.secondary, marginBottom: 6 }}>
                  Role
                </label>
                <select className="cz-select" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <button className="cz-btn cz-btn-success" onClick={handleAddPerson} style={{ padding: '10px 24px' }}>
              Add Person
            </button>
          </div>
        )}

        {/* ===== PEOPLE LIST ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editPeople.map((person, idx) => {
            const isExpanded = expandedIdx === idx;
            return (
              <div key={idx} className={`cz-person-card${isExpanded ? ' expanded' : ''}`}>
                {/* Person header row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px',
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: colors.accent.subtle,
                    border: `2px solid ${colors.accent.main}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: colors.accent.main }}>
                      {person.name[0] || '?'}
                    </span>
                  </div>

                  {/* Name + role */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>
                        {person.name}
                      </span>
                      {person.nameHi && person.nameHi !== person.name && (
                        <span style={{ fontSize: 14, color: colors.text.secondary }}>
                          ({person.nameHi})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: colors.text.tertiary, marginTop: 2 }}>
                      {person.role} &middot; {person.phrases.length} phrase{person.phrases.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    className={`cz-btn${isExpanded ? ' cz-btn-primary' : ' cz-btn-ghost'}`}
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    style={{ fontSize: 13 }}
                  >
                    {isExpanded ? 'Collapse' : 'Edit Phrases'}
                  </button>
                  <button
                    className="cz-btn cz-btn-danger"
                    onClick={() => setConfirmDeleteIdx(idx)}
                    style={{ fontSize: 13, padding: '8px 14px' }}
                  >
                    Delete
                  </button>
                </div>

                {/* Expanded: Phrase editor */}
                {isExpanded && (
                  <div style={{
                    padding: '0 18px 18px 18px',
                    borderTop: `1px solid ${colors.border.main}`,
                    marginTop: 0,
                  }}>
                    {/* Person info edit row */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '14px 0', borderBottom: `1px solid ${colors.border.main}66` }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ display: 'block', fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>Name</label>
                        <input className="cz-input" value={person.name} onChange={e => updatePersonField(idx, 'name', e.target.value)} />
                      </div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ display: 'block', fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>Hindi Name</label>
                        <input className="cz-input" value={person.nameHi} onChange={e => updatePersonField(idx, 'nameHi', e.target.value)} />
                      </div>
                      <div style={{ minWidth: 120 }}>
                        <label style={{ display: 'block', fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>Role</label>
                        <select className="cz-select" value={person.role} onChange={e => updatePersonField(idx, 'role', e.target.value)}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Phrases header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 0 8px 0',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.secondary }}>
                        Phrases ({person.phrases.length})
                      </span>
                      <button className="cz-btn cz-btn-ghost" onClick={() => addPhrase(idx)} style={{ fontSize: 13 }}>
                        + Add New Phrase
                      </button>
                    </div>

                    {/* Phrase column headers */}
                    <div style={{ display: 'flex', gap: 10, padding: '0 0 6px 0', alignItems: 'center' }}>
                      <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, paddingLeft: 2 }}>English</span>
                      <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, paddingLeft: 2 }}>Hindi</span>
                      <span style={{ width: 32 }} />
                    </div>

                    {/* Phrase rows */}
                    {person.phrases.map((phrase, phIdx) => (
                      <div key={phIdx} className="cz-phrase-row">
                        <input
                          className="cz-input"
                          value={phrase.en}
                          onChange={e => updatePhrase(idx, phIdx, 'en', e.target.value)}
                          placeholder="English phrase"
                          style={{ flex: 1 }}
                        />
                        <input
                          className="cz-input"
                          value={phrase.hi}
                          onChange={e => updatePhrase(idx, phIdx, 'hi', e.target.value)}
                          placeholder="Hindi phrase"
                          style={{ flex: 1 }}
                        />
                        <button
                          className="cz-phrase-delete"
                          onClick={() => deletePhrase(idx, phIdx)}
                          title="Delete phrase"
                          disabled={person.phrases.length <= 1}
                          style={{ opacity: person.phrases.length <= 1 ? 0.3 : 1, cursor: person.phrases.length <= 1 ? 'not-allowed' : 'pointer' }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}

                    {person.phrases.length === 0 && (
                      <div style={{ padding: '16px 0', textAlign: 'center', color: colors.text.tertiary, fontSize: 14 }}>
                        No phrases. Add at least one phrase.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {editPeople.length === 0 && (
            <div style={{
              padding: 32, textAlign: 'center',
              color: colors.text.tertiary, fontSize: 15,
              background: colors.background.secondary,
              borderRadius: 12, border: `1px solid ${colors.border.main}`,
            }}>
              No people configured. Click "Add New Person" to get started.
            </div>
          )}
        </div>
      </div>

      {/* ===== DIALOGS ===== */}

      {/* Delete confirmation */}
      {confirmDeleteIdx !== null && editPeople[confirmDeleteIdx] && (
        <ConfirmDialog
          title="Delete Person"
          message={`Remove ${editPeople[confirmDeleteIdx].name}? This will delete all their phrases.`}
          confirmLabel="Delete"
          onConfirm={() => handleDeletePerson(confirmDeleteIdx)}
          onCancel={() => setConfirmDeleteIdx(null)}
          danger
        />
      )}

      {/* Unsaved changes on navigate */}
      {pendingNav && (
        <UnsavedDialog
          onSave={handleUnsavedSave}
          onDiscard={handleUnsavedDiscard}
          onCancel={() => setPendingNav(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
};

export default React.memo(CustomizeScreen);
