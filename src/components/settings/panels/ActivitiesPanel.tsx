/**
 * ActivitiesPanel - TV / YouTube / Alexa editor
 * ================================================
 * Three fixed sections with section-specific fields.
 * Standard HTML/CSS form elements (no GazeButton).
 */

import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import { useCustomization } from '../../../contexts/CustomizationContext';
import type { ActivityCategory, ActivityItem } from '../../../types/customization';

interface ActivitiesPanelProps {
  isDarkMode: boolean;
}

const MAX_ITEMS = 12;

// Section display config
const SECTION_META: Record<string, { icon: string; color: string; description: string }> = {
  tv: { icon: '📺', color: '#4299E1', description: 'TV channels and controls' },
  youtube: { icon: '▶', color: '#FF0000', description: 'YouTube content to play' },
  alexa: { icon: '◉', color: '#00CAFF', description: 'Alexa voice commands' },
};

// ============================================
// SCOPED CSS
// ============================================

const scopedCSS = (c: typeof darkColors) => `
  .ap-btn {
    padding: 7px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 150ms; border: 1px solid ${c.border.main};
    background: ${c.background.secondary}; color: ${c.text.primary};
    white-space: nowrap; font-family: inherit;
  }
  .ap-btn:hover { background: ${c.background.tertiary}; border-color: ${c.text.tertiary}; }
  .ap-btn:active { transform: scale(0.97); }
  .ap-btn-primary { background: ${c.accent.main}; color: #fff; border-color: ${c.accent.main}; }
  .ap-btn-primary:hover { background: ${c.accent.hover}; border-color: ${c.accent.hover}; }
  .ap-btn-ghost { background: transparent; border-color: transparent; color: ${c.accent.main}; padding: 6px 12px; }
  .ap-btn-ghost:hover { background: ${c.accent.main}15; }
  .ap-btn-success { background: ${c.success.main}; color: #fff; border-color: ${c.success.main}; }
  .ap-btn-success:hover { filter: brightness(1.1); }
  .ap-input {
    padding: 8px 12px; background: ${c.background.tertiary}; border: 1px solid ${c.border.main};
    border-radius: 8px; color: ${c.text.primary}; font-size: 14px; font-family: inherit;
    outline: none; box-sizing: border-box; transition: border-color 150ms, box-shadow 150ms; width: 100%;
  }
  .ap-input:focus { border-color: ${c.accent.main}; box-shadow: 0 0 0 2px ${c.accent.main}33; }
  .ap-input::placeholder { color: ${c.text.tertiary}; }
  .ap-section { border: 1px solid ${c.border.main}; border-radius: 10px; overflow: hidden; transition: border-color 200ms; }
  .ap-section.expanded { border-color: ${c.accent.main}44; }
  .ap-section-header {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px;
    background: ${c.background.secondary}; cursor: pointer; user-select: none;
    border: none; width: 100%; text-align: left; font-family: inherit; transition: background 150ms;
  }
  .ap-section-header:hover { background: ${c.background.tertiary}; }
  .ap-item-del {
    width: 30px; height: 30px; border-radius: 6px; border: none; background: transparent;
    color: ${c.text.tertiary}; cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 17px; transition: all 150ms; flex-shrink: 0; font-family: inherit;
  }
  .ap-item-del:hover { background: ${c.emergency.subtle}; color: ${c.emergency.main}; }
  .ap-item-del:disabled { opacity: 0.3; cursor: not-allowed; }
  .ap-item-del:disabled:hover { background: transparent; color: ${c.text.tertiary}; }
  .ap-toast {
    position: fixed; top: 20px; right: 20px; z-index: 1100;
    padding: 12px 22px; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 600;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4); animation: apToastIn 200ms ease-out;
  }
  @keyframes apToastIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
`;

// ============================================
// SUB-COMPONENTS
// ============================================

const Chevron: React.FC<{ open: boolean; color: string }> = ({ open, color }) => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none"
    stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 200ms', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
    <polyline points="6,3 11,8 6,13" />
  </svg>
);

const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onDone: () => void }> = ({ msg, type, onDone }) => {
  React.useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? darkColors.success.main : darkColors.emergency.main;
  return <div className="ap-toast" style={{ background: bg }}>{msg}</div>;
};

// ============================================
// TV ITEM EDITOR
// ============================================

const TVItemEditor: React.FC<{
  items: ActivityItem[];
  onUpdate: (items: ActivityItem[]) => void;
  colors: typeof darkColors;
}> = ({ items, onUpdate, colors }) => {
  const updateField = (idx: number, field: keyof ActivityItem, value: string) => {
    const next = items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    onUpdate(next);
  };
  const remove = (idx: number) => onUpdate(items.filter((_, i) => i !== idx));
  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    onUpdate([...items, { label: '', num: '', speak: '' }]);
  };

  return (
    <>
      {/* Column headers */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 0 6px 0', alignItems: 'center' }}>
        <span style={{ flex: 2, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Label *</span>
        <span style={{ width: 80, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Channel #</span>
        <span style={{ flex: 2, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Speak Text *</span>
        <span style={{ width: 30 }} />
      </div>

      {items.map((item, idx) => (
        <div key={idx} style={{
          display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0',
          borderBottom: idx < items.length - 1 ? `1px solid ${colors.border.main}33` : 'none',
        }}>
          <input className="ap-input" value={item.label}
            onChange={e => updateField(idx, 'label', e.target.value)}
            placeholder="e.g. News - 508" style={{ flex: 2 }} />
          <input className="ap-input" value={item.num || ''}
            onChange={e => updateField(idx, 'num', e.target.value)}
            placeholder="508" style={{ width: 80, flex: 'none' }} />
          <input className="ap-input" value={item.speak}
            onChange={e => updateField(idx, 'speak', e.target.value)}
            placeholder="Change to channel 508" style={{ flex: 2 }} />
          <button className="ap-item-del" onClick={() => remove(idx)} title="Delete"
            disabled={items.length <= 1}>&#x2715;</button>
        </div>
      ))}

      <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="ap-btn ap-btn-ghost" onClick={add}
          disabled={items.length >= MAX_ITEMS}
          style={{ opacity: items.length >= MAX_ITEMS ? 0.5 : 1, cursor: items.length >= MAX_ITEMS ? 'not-allowed' : 'pointer' }}>
          + Add TV Item
        </button>
        {items.length >= MAX_ITEMS && <span style={{ fontSize: 12, color: colors.text.tertiary }}>Max {MAX_ITEMS}</span>}
      </div>
    </>
  );
};

// ============================================
// YOUTUBE ITEM EDITOR
// ============================================

const YouTubeItemEditor: React.FC<{
  items: ActivityItem[];
  onUpdate: (items: ActivityItem[]) => void;
  colors: typeof darkColors;
}> = ({ items, onUpdate, colors }) => {
  const updateField = (idx: number, field: keyof ActivityItem, value: string) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      // Auto-generate speak text from label
      if (field === 'label') updated.speak = value;
      return updated;
    });
    onUpdate(next);
  };
  const remove = (idx: number) => onUpdate(items.filter((_, i) => i !== idx));
  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    onUpdate([...items, { label: '', sub: '', speak: '' }]);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, padding: '10px 0 6px 0', alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Label *</span>
        <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Hindi Sub</span>
        <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Speak Text (auto)</span>
        <span style={{ width: 30 }} />
      </div>

      {items.map((item, idx) => (
        <div key={idx} style={{
          display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0',
          borderBottom: idx < items.length - 1 ? `1px solid ${colors.border.main}33` : 'none',
        }}>
          <input className="ap-input" value={item.label}
            onChange={e => updateField(idx, 'label', e.target.value)}
            placeholder="e.g. Play old songs" style={{ flex: 1 }} />
          <input className="ap-input" value={item.sub || ''}
            onChange={e => updateField(idx, 'sub', e.target.value)}
            placeholder="पुराने गाने" style={{ flex: 1 }} />
          <input className="ap-input" value={item.speak}
            onChange={e => updateField(idx, 'speak', e.target.value)}
            placeholder="Auto from label" style={{ flex: 1, color: item.speak === item.label ? colors.text.tertiary : colors.text.primary }} />
          <button className="ap-item-del" onClick={() => remove(idx)} title="Delete"
            disabled={items.length <= 1}>&#x2715;</button>
        </div>
      ))}

      <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="ap-btn ap-btn-ghost" onClick={add}
          disabled={items.length >= MAX_ITEMS}
          style={{ opacity: items.length >= MAX_ITEMS ? 0.5 : 1, cursor: items.length >= MAX_ITEMS ? 'not-allowed' : 'pointer' }}>
          + Add YouTube Item
        </button>
        {items.length >= MAX_ITEMS && <span style={{ fontSize: 12, color: colors.text.tertiary }}>Max {MAX_ITEMS}</span>}
      </div>
    </>
  );
};

// ============================================
// ALEXA ITEM EDITOR
// ============================================

const AlexaItemEditor: React.FC<{
  items: ActivityItem[];
  onUpdate: (items: ActivityItem[]) => void;
  colors: typeof darkColors;
}> = ({ items, onUpdate, colors }) => {
  const updateField = (idx: number, field: keyof ActivityItem, value: string) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      // Auto-generate speak text with "Alexa play" prefix
      if (field === 'label') updated.speak = `Alexa play ${value}`;
      return updated;
    });
    onUpdate(next);
  };
  const remove = (idx: number) => onUpdate(items.filter((_, i) => i !== idx));
  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    onUpdate([...items, { label: '', sub: '', speak: 'Alexa play ' }]);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, padding: '10px 0 6px 0', alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Label *</span>
        <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Hindi Sub</span>
        <span style={{ flex: 1, fontSize: 12, color: colors.text.tertiary, fontWeight: 600 }}>Speak Text (auto: "Alexa play...")</span>
        <span style={{ width: 30 }} />
      </div>

      {items.map((item, idx) => (
        <div key={idx} style={{
          display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0',
          borderBottom: idx < items.length - 1 ? `1px solid ${colors.border.main}33` : 'none',
        }}>
          <input className="ap-input" value={item.label}
            onChange={e => updateField(idx, 'label', e.target.value)}
            placeholder="e.g. Hanuman Chalisa" style={{ flex: 1 }} />
          <input className="ap-input" value={item.sub || ''}
            onChange={e => updateField(idx, 'sub', e.target.value)}
            placeholder="हनुमान चालीसा" style={{ flex: 1 }} />
          <input className="ap-input" value={item.speak}
            onChange={e => updateField(idx, 'speak', e.target.value)}
            placeholder="Alexa play ..."
            style={{ flex: 1, color: item.speak === `Alexa play ${item.label}` ? colors.text.tertiary : colors.text.primary }} />
          <button className="ap-item-del" onClick={() => remove(idx)} title="Delete"
            disabled={items.length <= 1}>&#x2715;</button>
        </div>
      ))}

      <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="ap-btn ap-btn-ghost" onClick={add}
          disabled={items.length >= MAX_ITEMS}
          style={{ opacity: items.length >= MAX_ITEMS ? 0.5 : 1, cursor: items.length >= MAX_ITEMS ? 'not-allowed' : 'pointer' }}>
          + Add Alexa Item
        </button>
        {items.length >= MAX_ITEMS && <span style={{ fontSize: 12, color: colors.text.tertiary }}>Max {MAX_ITEMS}</span>}
      </div>
    </>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const ActivitiesPanel: React.FC<ActivitiesPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { activityCategories, updateActivityCategory } = useCustomization();

  // Local editable copy
  const [editCats, setEditCats] = useState<ActivityCategory[]>(() => structuredClone(activityCategories));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Dirty tracking
  const originalSnapshot = JSON.stringify(activityCategories);
  const isDirty = JSON.stringify(editCats) !== originalSnapshot;

  // Sync external when clean
  React.useEffect(() => {
    if (!isDirty) {
      const current = JSON.stringify(activityCategories);
      if (current !== JSON.stringify(editCats)) {
        setEditCats(structuredClone(activityCategories));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityCategories]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  // Update items for a specific category
  const updateItems = useCallback((catId: string, items: ActivityItem[]) => {
    setEditCats(prev => prev.map(c => c.id === catId ? { ...c, items } : c));
  }, []);

  // Save all
  const handleSaveAll = useCallback(() => {
    for (const cat of editCats) {
      if (cat.items.length === 0) {
        setToast({ msg: `"${cat.name}" must have at least 1 item`, type: 'error' });
        return;
      }
      for (const item of cat.items) {
        if (!item.label.trim()) {
          setToast({ msg: `"${cat.name}" has an item with empty label`, type: 'error' });
          return;
        }
        if (!item.speak.trim()) {
          setToast({ msg: `"${cat.name}" has an item with empty speak text`, type: 'error' });
          return;
        }
      }
    }

    for (const cat of editCats) {
      updateActivityCategory(cat.id, cat);
    }
    setToast({ msg: 'All changes saved', type: 'success' });
  }, [editCats, updateActivityCategory]);

  // Render the section-specific editor
  const renderEditor = (cat: ActivityCategory) => {
    const items = cat.items;
    const onUpdate = (newItems: ActivityItem[]) => updateItems(cat.id, newItems);

    switch (cat.id) {
      case 'tv': return <TVItemEditor items={items} onUpdate={onUpdate} colors={colors} />;
      case 'youtube': return <YouTubeItemEditor items={items} onUpdate={onUpdate} colors={colors} />;
      case 'alexa': return <AlexaItemEditor items={items} onUpdate={onUpdate} colors={colors} />;
      default: return <TVItemEditor items={items} onUpdate={onUpdate} colors={colors} />;
    }
  };

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
            Activities
          </div>
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: 4,
          }}>
            TV channels, YouTube, and Alexa commands
            {isDirty && (
              <span style={{ color: colors.warning.main, marginLeft: 12, fontWeight: 600 }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <button
          className="ap-btn ap-btn-success"
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

      {/* Section accordions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {editCats.map(cat => {
          const isExpanded = expandedId === cat.id;
          const meta = SECTION_META[cat.id] || SECTION_META.tv;

          return (
            <div key={cat.id} className={`ap-section${isExpanded ? ' expanded' : ''}`}>
              {/* Section header */}
              <div
                className="ap-section-header"
                onClick={() => toggleExpand(cat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(cat.id); } }}
              >
                <Chevron open={isExpanded} color={isExpanded ? meta.color : colors.text.tertiary} />

                {/* Section icon */}
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${meta.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                  color: meta.color,
                }}>
                  {meta.icon}
                </span>

                {/* Name */}
                <span style={{
                  flex: 1, fontSize: 15, fontWeight: 600,
                  color: isExpanded ? meta.color : colors.text.primary,
                }}>
                  {cat.name}
                </span>

                {/* Item count */}
                <span style={{
                  fontSize: 12, color: colors.text.tertiary,
                  background: colors.background.tertiary,
                  padding: '2px 10px', borderRadius: 12, fontWeight: 600, flexShrink: 0,
                }}>
                  {cat.items.length} item{cat.items.length !== 1 ? 's' : ''}
                </span>

                {/* Description on hover area */}
                <span style={{ fontSize: 12, color: colors.text.tertiary, flexShrink: 0 }}>
                  {meta.description}
                </span>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div style={{
                  padding: '0 16px 16px 16px',
                  borderTop: `1px solid ${colors.border.main}`,
                  background: colors.background.primary,
                }}>
                  {renderEditor(cat)}

                  {cat.items.length === 0 && (
                    <div style={{ padding: '14px 0', textAlign: 'center', color: colors.text.tertiary, fontSize: 14 }}>
                      No items. Add at least one.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
};

export default ActivitiesPanel;
