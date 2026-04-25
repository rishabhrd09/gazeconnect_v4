/**
 * MedicalPanel - Accordion-style medical section editor
 * ======================================================
 * Standard HTML/CSS form elements (no GazeButton).
 * Accordion sections with inline item editing, urgent toggles, color pickers.
 */

import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, layout, typography, spacing, screenThemes } from '../../../utils/design';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import type { MedicalSection, MedicalItem } from '../../../types/customization';

interface MedicalPanelProps {
  isDarkMode: boolean;
}

const MAX_SECTIONS = 8;
const MAX_ITEMS_PER_SECTION = 8;

// Fallback colors per built-in section id
const DEFAULT_SECTION_COLORS: Record<string, string> = {
  airway: '#9F6756',
  urgent: '#9F6756',
  bed: '#A8844D',
  daily: '#B28F52',
  symptoms: '#A97886',
};

const COLOR_PRESETS = [
  { value: '#9F6756', label: 'Muted Terracotta' },
  { value: '#A8844D', label: 'Warm Umber' },
  { value: '#B28F52', label: 'Muted Gold' },
  { value: '#A97886', label: 'Muted Rose' },
  { value: '#8FAE72', label: 'Soft Olive' },
  { value: '#6FB7B1', label: 'Soft Teal' },
];

const getSectionColor = (sec: MedicalSection) =>
  sec.color || DEFAULT_SECTION_COLORS[sec.id] || '#4DB6AC';

// ============================================
// SCOPED CSS
// ============================================

const scopedCSS = (c: typeof darkColors) => `
  .mp-btn {
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
  .mp-btn:hover { background: ${c.background.tertiary}; border-color: ${c.text.tertiary}; }
  .mp-btn:active { transform: scale(0.97); }
  .mp-btn-primary {
    background: ${c.accent.main};
    color: #fff;
    border-color: ${c.accent.main};
  }
  .mp-btn-primary:hover { background: ${c.accent.hover}; border-color: ${c.accent.hover}; }
  .mp-btn-danger {
    color: ${c.emergency.main};
    border-color: ${c.emergency.main}55;
    background: transparent;
  }
  .mp-btn-danger:hover { background: ${c.emergency.subtle}; border-color: ${c.emergency.main}; }
  .mp-btn-ghost {
    background: transparent;
    border-color: transparent;
    color: ${c.accent.main};
    padding: 6px 12px;
  }
  .mp-btn-ghost:hover { background: ${c.accent.main}15; }
  .mp-btn-success {
    background: ${c.success.main};
    color: #fff;
    border-color: ${c.success.main};
  }
  .mp-btn-success:hover { filter: brightness(1.1); }
  .mp-input {
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
  .mp-input:focus {
    border-color: ${c.accent.main};
    box-shadow: 0 0 0 2px ${c.accent.main}33;
  }
  .mp-input::placeholder { color: ${c.text.tertiary}; }
  .mp-accordion {
    border: 1px solid ${c.border.main};
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 200ms;
  }
  .mp-accordion.expanded { border-color: ${c.accent.main}44; }
  .mp-accordion-header {
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
  .mp-accordion-header:hover { background: ${c.background.tertiary}; }
  .mp-item-del {
    width: 30px; height: 30px; border-radius: 6px;
    border: none; background: transparent;
    color: ${c.text.tertiary}; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; transition: all 150ms; flex-shrink: 0;
    font-family: inherit;
  }
  .mp-item-del:hover { background: ${c.emergency.subtle}; color: ${c.emergency.main}; }
  .mp-item-del:disabled { opacity: 0.3; cursor: not-allowed; }
  .mp-item-del:disabled:hover { background: transparent; color: ${c.text.tertiary}; }
  .mp-urgent-toggle {
    width: 26px; height: 26px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; padding: 0; outline: none;
    transition: all 150ms; flex-shrink: 0;
    font-family: inherit;
  }
  .mp-urgent-toggle:hover { filter: brightness(1.2); }
  .mp-color-dot {
    width: 32px; height: 32px; border-radius: 50%;
    cursor: pointer; outline: none;
    transition: all 150ms; position: relative;
    display: flex; align-items: center; justify-content: center;
  }
  .mp-color-dot:hover { transform: scale(1.12); }
  .mp-toast {
    position: fixed; top: 20px; right: 20px; z-index: 1100;
    padding: 12px 22px; border-radius: 10px;
    color: #fff; font-size: 14px; font-weight: 600;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    animation: mpToastIn 200ms ease-out;
  }
  @keyframes mpToastIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// ============================================
// SUB-COMPONENTS
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

const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onDone: () => void }> = ({ msg, type, onDone }) => {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  const bg = type === 'success' ? darkColors.success.main : darkColors.emergency.main;
  return <div className="mp-toast" style={{ background: bg }}>{msg}</div>;
};

// ============================================
// MAIN COMPONENT
// ============================================

const MedicalPanel: React.FC<MedicalPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { medicalSections, updateMedicalSection, removeMedicalSection } = useCustomization();

  // Local editable copy for batch save
  const [editSections, setEditSections] = useState<MedicalSection[]>(() => structuredClone(medicalSections));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameEn, setRenameEn] = useState('');
  const [renameHi, setRenameHi] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSecEn, setNewSecEn] = useState('');
  const [newSecHi, setNewSecHi] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MedicalSection | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Track dirty
  const originalSnapshot = JSON.stringify(medicalSections);
  const isDirty = JSON.stringify(editSections) !== originalSnapshot;

  // Sync external changes when not dirty
  React.useEffect(() => {
    if (!isDirty) {
      const current = JSON.stringify(medicalSections);
      if (current !== JSON.stringify(editSections)) {
        setEditSections(structuredClone(medicalSections));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicalSections]);

  // Accordion toggle
  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    setRenamingId(null);
  }, []);

  // Rename section
  const startRename = useCallback((sec: MedicalSection, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(sec.id);
    setRenameEn(sec.title);
    setRenameHi(sec.titleHi);
  }, []);

  const commitRename = useCallback((secId: string) => {
    const trimmedEn = renameEn.trim();
    if (!trimmedEn) {
      setToast({ msg: 'Section title (English) is required', type: 'error' });
      return;
    }
    if (editSections.some(s => s.id !== secId && s.title.toLowerCase() === trimmedEn.toLowerCase())) {
      setToast({ msg: 'Section title must be unique', type: 'error' });
      return;
    }
    setEditSections(prev => prev.map(s =>
      s.id === secId ? { ...s, title: trimmedEn, titleHi: renameHi.trim() || trimmedEn } : s
    ));
    setRenamingId(null);
  }, [renameEn, renameHi, editSections]);

  // Add section
  const handleAddSection = useCallback(() => {
    const trimmedEn = newSecEn.trim();
    if (!trimmedEn) {
      setToast({ msg: 'Section title is required', type: 'error' });
      return;
    }
    if (editSections.length >= MAX_SECTIONS) {
      setToast({ msg: `Maximum ${MAX_SECTIONS} sections allowed`, type: 'error' });
      return;
    }
    if (editSections.some(s => s.title.toLowerCase() === trimmedEn.toLowerCase())) {
      setToast({ msg: 'Section title must be unique', type: 'error' });
      return;
    }
    const id = trimmedEn.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `sec_${Date.now()}`;
    const newSec: MedicalSection = {
      id,
      title: trimmedEn,
      titleHi: newSecHi.trim() || trimmedEn,
      color: COLOR_PRESETS[0].value,
      items: [{ en: '', hi: '' }],
    };
    setEditSections(prev => [...prev, newSec]);
    setNewSecEn('');
    setNewSecHi('');
    setShowNewSection(false);
    setExpandedId(newSec.id);
  }, [newSecEn, newSecHi, editSections]);

  // Delete section (after confirmation)
  const handleDeleteSection = useCallback(() => {
    if (!deleteTarget) return;
    if (editSections.length <= 1) {
      setToast({ msg: 'Must keep at least 1 section', type: 'error' });
      setDeleteTarget(null);
      return;
    }
    setEditSections(prev => prev.filter(s => s.id !== deleteTarget.id));
    if (expandedId === deleteTarget.id) setExpandedId(null);
    setDeleteTarget(null);
  }, [deleteTarget, editSections.length, expandedId]);

  // Section color
  const setSectionColor = useCallback((secId: string, color: string) => {
    setEditSections(prev => prev.map(s => s.id === secId ? { ...s, color } : s));
  }, []);

  // Item CRUD
  const updateItem = useCallback((secId: string, itemIdx: number, field: 'en' | 'hi', value: string) => {
    setEditSections(prev => prev.map(s => {
      if (s.id !== secId) return s;
      const items = s.items.map((it, i) => i === itemIdx ? { ...it, [field]: value } : it);
      return { ...s, items };
    }));
  }, []);

  const toggleUrgent = useCallback((secId: string, itemIdx: number) => {
    setEditSections(prev => prev.map(s => {
      if (s.id !== secId) return s;
      const items = s.items.map((it, i) => i === itemIdx ? { ...it, urgent: !it.urgent } : it);
      return { ...s, items };
    }));
  }, []);

  const deleteItem = useCallback((secId: string, itemIdx: number) => {
    setEditSections(prev => prev.map(s => {
      if (s.id !== secId) return s;
      return { ...s, items: s.items.filter((_, i) => i !== itemIdx) };
    }));
  }, []);

  const addItem = useCallback((secId: string) => {
    setEditSections(prev => prev.map(s => {
      if (s.id !== secId) return s;
      if (s.items.length >= MAX_ITEMS_PER_SECTION) return s;
      return { ...s, items: [...s.items, { en: '', hi: '' }] };
    }));
  }, []);

  // Save all
  const handleSaveAll = useCallback(() => {
    for (const sec of editSections) {
      if (!sec.title.trim()) {
        setToast({ msg: 'All sections must have a title', type: 'error' });
        return;
      }
      if (sec.items.length === 0) {
        setToast({ msg: `"${sec.title}" must have at least 1 item`, type: 'error' });
        return;
      }
      for (const item of sec.items) {
        if (!item.en.trim()) {
          setToast({ msg: `"${sec.title}" has an item with empty English text`, type: 'error' });
          return;
        }
      }
    }

    for (const existing of medicalSections) {
      if (!editSections.find(sec => sec.id === existing.id)) {
        removeMedicalSection(existing.id);
      }
    }

    for (const sec of editSections) {
      updateMedicalSection(sec.id, sec);
    }

    setToast({ msg: 'All changes saved', type: 'success' });
  }, [editSections, medicalSections, removeMedicalSection, updateMedicalSection]);

  const urgentColor = screenThemes.medical.urgent;

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
            Medical / Assistance
          </div>
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: 4,
          }}>
            {editSections.length} of {MAX_SECTIONS} sections
            {isDirty && (
              <span style={{ color: colors.warning.main, marginLeft: 12, fontWeight: 600 }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!showNewSection && (
            <button
              className="mp-btn mp-btn-primary"
              onClick={() => setShowNewSection(true)}
              disabled={editSections.length >= MAX_SECTIONS}
              style={{
                opacity: editSections.length >= MAX_SECTIONS ? 0.5 : 1,
                cursor: editSections.length >= MAX_SECTIONS ? 'not-allowed' : 'pointer',
              }}
            >
              + Add Section
            </button>
          )}
          <button
            className="mp-btn mp-btn-success"
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
        Patient screens show one Back card plus the first {MAX_ITEMS_PER_SECTION} items in each section. The built-in Medical / Urgent section keeps that patient-facing title for clarity.
      </div>

      {/* New section form */}
      {showNewSection && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
          padding: '14px 16px',
          background: colors.background.secondary,
          border: `1px solid ${colors.accent.main}44`,
          borderRadius: 10,
        }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>
              Title (English) *
            </label>
            <input
              className="mp-input"
              value={newSecEn}
              onChange={e => setNewSecEn(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddSection();
                if (e.key === 'Escape') { setShowNewSection(false); setNewSecEn(''); setNewSecHi(''); }
              }}
              placeholder="e.g. Pain Management"
              autoFocus
            />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>
              Title (Hindi)
            </label>
            <input
              className="mp-input"
              value={newSecHi}
              onChange={e => setNewSecHi(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddSection();
                if (e.key === 'Escape') { setShowNewSection(false); setNewSecEn(''); setNewSecHi(''); }
              }}
              placeholder="Hindi title..."
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="mp-btn mp-btn-success" onClick={handleAddSection}>Create</button>
            <button className="mp-btn" onClick={() => { setShowNewSection(false); setNewSecEn(''); setNewSecHi(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Section accordions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {editSections.map(sec => {
          const isExpanded = expandedId === sec.id;
          const isRenaming = renamingId === sec.id;
          const secColor = getSectionColor(sec);
          const urgentCount = sec.items.filter(it => it.urgent).length;

          return (
            <div key={sec.id} className={`mp-accordion${isExpanded ? ' expanded' : ''}`}>
              {/* Accordion header */}
              <div
                className="mp-accordion-header"
                onClick={() => toggleExpand(sec.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(sec.id); } }}
              >
                <Chevron open={isExpanded} color={isExpanded ? secColor : colors.text.tertiary} />

                {/* Color dot */}
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  backgroundColor: secColor, flexShrink: 0,
                }} />

                {/* Section title or rename inputs */}
                {isRenaming ? (
                  <div style={{ display: 'flex', gap: 8, flex: 1 }} onClick={e => e.stopPropagation()}>
                    <input
                      className="mp-input"
                      value={renameEn}
                      onChange={e => setRenameEn(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitRename(sec.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      placeholder="English title"
                      autoFocus
                      style={{ flex: 1, maxWidth: 180 }}
                    />
                    <input
                      className="mp-input"
                      value={renameHi}
                      onChange={e => setRenameHi(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitRename(sec.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      placeholder="Hindi title"
                      style={{ flex: 1, maxWidth: 180 }}
                    />
                  </div>
                ) : (
                  <span style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 600,
                      color: isExpanded ? secColor : colors.text.primary,
                    }}>
                      {sec.title}
                    </span>
                    {sec.titleHi && sec.titleHi !== sec.title && (
                      <span style={{ fontSize: 13, color: colors.text.tertiary }}>
                        ({sec.titleHi})
                      </span>
                    )}
                  </span>
                )}

                {/* Badges */}
                <span style={{
                  fontSize: 12, color: colors.text.tertiary,
                  background: colors.background.tertiary,
                  padding: '2px 10px', borderRadius: 12, fontWeight: 600, flexShrink: 0,
                }}>
                  {sec.items.length} item{sec.items.length !== 1 ? 's' : ''}
                </span>
                {urgentCount > 0 && (
                  <span style={{
                    fontSize: 11, color: urgentColor, fontWeight: 700,
                    background: `${urgentColor}18`,
                    padding: '2px 8px', borderRadius: 12, flexShrink: 0,
                  }}>
                    {urgentCount} urgent
                  </span>
                )}

                {/* Rename / Delete buttons */}
                {isRenaming ? (
                  <button className="mp-btn mp-btn-primary" onClick={e => { e.stopPropagation(); commitRename(sec.id); }} style={{ padding: '5px 12px', fontSize: 13 }}>
                    Done
                  </button>
                ) : (
                  <button className="mp-btn" onClick={e => startRename(sec, e)} style={{ padding: '5px 12px', fontSize: 13 }}>
                    Rename
                  </button>
                )}
                <button
                  className="mp-btn mp-btn-danger"
                  onClick={e => { e.stopPropagation(); setDeleteTarget(sec); }}
                  style={{ padding: '5px 12px', fontSize: 13 }}
                >
                  Delete
                </button>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{
                  padding: '0 16px 16px 16px',
                  borderTop: `1px solid ${colors.border.main}`,
                  background: colors.background.primary,
                }}>
                  {/* Color picker row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 0', borderBottom: `1px solid ${colors.border.main}33`,
                  }}>
                    <span style={{ fontSize: 13, color: colors.text.secondary, fontWeight: 600, marginRight: 4 }}>
                      Section Color
                    </span>
                    {COLOR_PRESETS.map(preset => {
                      const isActive = secColor === preset.value;
                      return (
                        <button
                          key={preset.value}
                          className="mp-color-dot"
                          onClick={() => setSectionColor(sec.id, preset.value)}
                          title={preset.label}
                          style={{
                            backgroundColor: preset.value,
                            border: isActive
                              ? `3px solid ${colors.text.primary}`
                              : `2px solid ${colors.border.main}`,
                            boxShadow: isActive ? `0 0 0 2px ${preset.value}40` : 'none',
                          }}
                        >
                          {isActive && (
                            <span style={{
                              color: '#fff', fontSize: 14, fontWeight: 700,
                              textShadow: '0 1px 2px rgba(0,0,0,0.5)', lineHeight: 1,
                            }}>
                              &#10003;
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: 'flex', gap: 10, padding: '10px 0 6px 0', alignItems: 'center',
                  }}>
                    <span style={{ width: 26 }} /> {/* urgent toggle space */}
                    <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>English *</span>
                    <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Hindi (optional)</span>
                    <span style={{ width: 30 }} /> {/* delete btn space */}
                  </div>

                  {/* Item rows */}
                  {sec.items.map((item, idx) => {
                    const isUrgent = !!item.urgent;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex', gap: 10, alignItems: 'center',
                          padding: '5px 0',
                          borderBottom: idx < sec.items.length - 1 ? `1px solid ${colors.border.main}33` : 'none',
                          borderLeft: isUrgent ? `3px solid ${urgentColor}` : '3px solid transparent',
                          paddingLeft: isUrgent ? 7 : 10,
                          marginLeft: -10,
                          background: isUrgent ? `${urgentColor}08` : 'transparent',
                          borderRadius: isUrgent ? 4 : 0,
                        }}
                      >
                        {/* Urgent toggle */}
                        <button
                          className="mp-urgent-toggle"
                          onClick={() => toggleUrgent(sec.id, idx)}
                          title={isUrgent ? 'Mark as normal' : 'Mark as urgent'}
                          style={{
                            border: `2px solid ${isUrgent ? urgentColor : colors.border.main}`,
                            backgroundColor: isUrgent ? `${urgentColor}20` : 'transparent',
                          }}
                        >
                          <span style={{
                            fontSize: 14, lineHeight: 1,
                            color: isUrgent ? urgentColor : 'transparent',
                          }}>
                            &#10003;
                          </span>
                        </button>

                        {/* English input */}
                        <input
                          className="mp-input"
                          value={item.en}
                          onChange={e => updateItem(sec.id, idx, 'en', e.target.value)}
                          placeholder="English text"
                          style={{ flex: 1 }}
                        />

                        {/* Hindi input */}
                        <input
                          className="mp-input"
                          value={item.hi}
                          onChange={e => updateItem(sec.id, idx, 'hi', e.target.value)}
                          placeholder="Hindi text"
                          style={{ flex: 1 }}
                        />

                        {/* Urgent badge (inline label) */}
                        {isUrgent && (
                          <span style={{
                            fontSize: 10, color: urgentColor, fontWeight: 700,
                            letterSpacing: 0.5, flexShrink: 0,
                            textTransform: 'uppercase',
                          }}>
                            urgent
                          </span>
                        )}

                        {/* Delete button */}
                        <button
                          className="mp-item-del"
                          onClick={() => deleteItem(sec.id, idx)}
                          title="Delete item"
                          disabled={sec.items.length <= 1}
                        >
                          &#x2715;
                        </button>
                      </div>
                    );
                  })}

                  {/* Empty state */}
                  {sec.items.length === 0 && (
                    <div style={{ padding: '14px 0', textAlign: 'center', color: colors.text.tertiary, fontSize: 14 }}>
                      No items. Add at least one.
                    </div>
                  )}

                  {/* Add item button */}
                  <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      className="mp-btn mp-btn-ghost"
                      onClick={() => addItem(sec.id)}
                      disabled={sec.items.length >= MAX_ITEMS_PER_SECTION}
                      style={{
                        opacity: sec.items.length >= MAX_ITEMS_PER_SECTION ? 0.5 : 1,
                        cursor: sec.items.length >= MAX_ITEMS_PER_SECTION ? 'not-allowed' : 'pointer',
                      }}
                    >
                      + Add Item
                    </button>
                    {sec.items.length >= MAX_ITEMS_PER_SECTION && (
                      <span style={{ fontSize: 12, color: colors.text.tertiary }}>
                        Max {MAX_ITEMS_PER_SECTION} items
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {editSections.length === 0 && (
          <div style={{
            padding: 28, textAlign: 'center',
            color: colors.text.tertiary, fontSize: 14,
            background: colors.background.secondary,
            borderRadius: 10, border: `1px solid ${colors.border.main}`,
          }}>
            No sections. Click "+ Add Section" to create one.
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.title}"?`}
          message={`This will remove "${deleteTarget.title}" and all ${deleteTarget.items.length} item${deleteTarget.items.length !== 1 ? 's' : ''} in it.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteSection}
          onCancel={() => setDeleteTarget(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
};

export default MedicalPanel;
