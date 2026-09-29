/**
 * HomeLayoutPanel - what the Home screen shows
 * ============================================
 * The left panel: Quick Phrases alone (the default), or the Urgent Needs card above it.
 * The word bar that could run along the bottom of Home was removed on 28 Sep 2026
 * (maintainer's decision: Quick Phrases and Assistance already offer those words).
 * The emergency-card library and its colours left this page on 24 Sep 2026; the
 * cards themselves stay in the saved data (the word predictor still reads them).
 * Standard HTML/CSS form elements (no GazeButton): this page is used with a mouse.
 */

import React, { useState, useCallback } from 'react';
import { useReportUnsavedChanges } from '../shared/unsavedChanges';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { DEFAULT_CUSTOMIZATION } from '../../../services/defaultCustomization';

interface HomeLayoutPanelProps {
  isDarkMode: boolean;
}

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

type LeftPanelMode = 'alert' | 'quick';

/** Only a chosen Urgent Needs card is 'alert'; anything else (incl. the retired 'cards') is Quick Phrases only. */
const readLeftPanelMode = (value: unknown): LeftPanelMode => (value === 'alert' ? 'alert' : 'quick');

// ============================================
// MAIN COMPONENT
// ============================================

const HomeLayoutPanel: React.FC<HomeLayoutPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { data, updateSetting } = useCustomization();

  const savedMode = readLeftPanelMode(data.settings?.homeEmergencyLaunchMode);

  // Local editable copy (saved with Save Changes, as elsewhere in Settings)
  const [editMode, setEditMode] = useState<LeftPanelMode>(savedMode);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const isDirty = editMode !== savedMode;
  useReportUnsavedChanges(isDirty);

  // Sync external changes (another window, an imported backup) when not dirty
  React.useEffect(() => {
    if (!isDirty) setEditMode(savedMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedMode]);

  const handleSave = useCallback(() => {
    updateSetting('homeEmergencyLaunchMode', editMode);
    setToast({ msg: 'Home layout saved', type: 'success' });
  }, [editMode, updateSetting]);

  const handleReset = useCallback(() => {
    setEditMode(readLeftPanelMode(DEFAULT_CUSTOMIZATION.settings.homeEmergencyLaunchMode));
    setShowResetConfirm(false);
    setToast({ msg: 'Default Home layout restored. Press Save Changes to keep it.', type: 'success' });
  }, []);

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px',
    background: colors.background.secondary,
    borderRadius: 10,
    border: `1px solid ${colors.border.main}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  };
  const optionStyle = (selected: boolean): React.CSSProperties => ({
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: 10,
    border: `1.5px solid ${selected ? colors.accent.main : colors.border.main}`,
    background: selected ? `${colors.accent.main}14` : colors.background.tertiary,
    color: colors.text.primary,
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
      <style>{scopedCSS(colors)}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="settings-panel-title" style={{
            fontSize: typography.fontSize.xl,
            color: colors.text.primary,
            fontWeight: typography.fontWeight.bold,
          }}>
            Home Layout
          </div>
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: 4,
          }}>
            Choose what the Home screen shows
            {isDirty && (
              <span style={{ color: colors.accentText.gold, marginLeft: 12, fontWeight: 600 }}>
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
            Reset this page
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

      {/* Left panel */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.text.primary }}>
          Home Left Panel
        </div>
        <div style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
          What sits in the left column of the Home screen.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {([
            { key: 'quick' as LeftPanelMode, title: 'Quick Phrases only', desc: 'The default. Just the Quick Phrases card, large and centred in the column.' },
            { key: 'alert' as LeftPanelMode, title: 'Urgent Needs + Quick Phrases', desc: 'Adds a large Urgent Needs card above Quick Phrases: one look opens the care actions (SOS, suction, pain and your own).' },
          ]).map(option => (
            <button
              key={option.key}
              onClick={() => setEditMode(option.key)}
              style={optionStyle(editMode === option.key)}
            >
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{option.title}</div>
              <div style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 1.45 }}>{option.desc}</div>
            </button>
          ))}
        </div>
        {editMode === 'quick' && (
          <div role="note" style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: `${colors.warning.main}14`,
            border: `1px solid ${colors.warning.main}55`,
            fontSize: 13,
            color: colors.text.primary,
            lineHeight: 1.5,
          }}>
            <strong>Urgent Needs is not on Home.</strong> By gaze, Help and Pain are two looks away in
            Quick Phrases, and suction, the Ambu bag and the ventilator alarm three, in Assistance &gt; URGENT.
            Choose Urgent Needs + Quick Phrases to put a one-look card on Home.
          </div>
        )}
        <div style={{ fontSize: 12, color: colors.text.tertiary, lineHeight: 1.5 }}>
          The Urgent Needs cards themselves are chosen in Settings &gt; Urgent Needs.
        </div>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset Home Layout?"
          message="This restores the left panel to Quick Phrases only, the default. Nothing is saved until you press Save Changes."
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
