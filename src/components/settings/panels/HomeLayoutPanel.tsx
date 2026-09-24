/**
 * HomeLayoutPanel - what the Home screen shows
 * ============================================
 * - Left panel: the Urgent Needs card above Quick Phrases, or Quick Phrases alone.
 * - Word bar: an optional row of words and phrases along the bottom of Home.
 * The emergency-card library and its colours left this page on 24 Sep 2026; the
 * cards themselves stay in the saved data (the word predictor still reads them).
 * Standard HTML/CSS form elements (no GazeButton): this page is used with a mouse.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useReportUnsavedChanges } from '../shared/unsavedChanges';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { DEFAULT_CUSTOMIZATION } from '../../../services/defaultCustomization';
import {
  HOME_WORD_BAR_PHRASES,
  HOME_WORD_BAR_WORDS,
  normalizeHomeWordBar,
} from '../../../services/CustomizationService';
import type { HomeWordBarConfig } from '../../../types/customization';

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

type LeftPanelMode = 'alert' | 'quick';

/** 'quick' = Quick Phrases only; everything else (incl. the retired 'cards') = Urgent Needs + Quick Phrases. */
const readLeftPanelMode = (value: unknown): LeftPanelMode => (value === 'quick' ? 'quick' : 'alert');

const wordCountFor = (layout: HomeWordBarConfig['layout']) => (layout === '4+2' ? 4 : 3);

const uniqueTexts = (values: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = (value ?? '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

// The Home screen's own word bar colours (HomeScreen.tsx), so the preview matches it.
const barPreviewPalette = (isWarm: boolean) => (isWarm
  ? { wordBg: '#F4EFE7', wordText: '#285C4D', phraseBg: '#EDEFE6', phraseText: '#26342D', frame: '#FBF7F0' }
  : { wordBg: '#1D241F', wordText: '#A5D0B9', phraseBg: '#222B27', phraseText: '#DCE6DD', frame: '#161B18' });

// ============================================
// MAIN COMPONENT
// ============================================

const HomeLayoutPanel: React.FC<HomeLayoutPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { isWarm } = useTheme();
  const { data, updateSetting, updateHomeWordBar } = useCustomization();

  const savedMode = readLeftPanelMode(data.settings?.homeEmergencyLaunchMode);
  const savedBar = useMemo(
    () => normalizeHomeWordBar(data.homeWordBar, undefined, DEFAULT_CUSTOMIZATION.homeWordBar),
    [data.homeWordBar],
  );

  // Local editable copy (saved with Save Changes, as elsewhere in Settings)
  const [editMode, setEditMode] = useState<LeftPanelMode>(savedMode);
  const [editBar, setEditBar] = useState<HomeWordBarConfig>(() => structuredClone(savedBar));
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const isDirty = editMode !== savedMode || JSON.stringify(editBar) !== JSON.stringify(savedBar);
  useReportUnsavedChanges(isDirty);

  // Sync external changes (another window, an imported backup) when not dirty
  React.useEffect(() => {
    if (!isDirty) {
      setEditMode(savedMode);
      setEditBar(structuredClone(savedBar));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedMode, savedBar]);

  // Suggestions offered while typing: the app's own words and phrases.
  const wordOptions = useMemo(() => uniqueTexts([
    ...(data.quickWords?.coreWords ?? []).filter(w => w.enabled).map(w => w.en),
    ...(data.quickWords?.categories ?? []).flatMap(c => c.words.filter(w => w.enabled).map(w => w.en)),
  ]), [data.quickWords]);
  const phraseOptions = useMemo(() => uniqueTexts([
    ...(data.homeEmergencyCards ?? []).map(c => c.en),
    ...(data.alertModeCards ?? []).map(c => c.label),
    ...(data.quickWords?.categories ?? []).flatMap(c => c.words.flatMap(w => (w.phrases ?? []).map(p => p.en))),
    ...(data.phraseCategories ?? []).flatMap(c => c.phrases.map(p => p.en)),
  ]), [data.homeEmergencyCards, data.alertModeCards, data.quickWords, data.phraseCategories]);

  const wordCount = wordCountFor(editBar.layout);
  const setWord = useCallback((index: number, value: string) => {
    setEditBar(bar => ({ ...bar, words: bar.words.map((w, i) => (i === index ? value : w)) }));
  }, []);
  const setPhrase = useCallback((index: number, value: string) => {
    setEditBar(bar => ({ ...bar, phrases: bar.phrases.map((p, i) => (i === index ? value : p)) }));
  }, []);

  const handleSave = useCallback(() => {
    const bar = normalizeHomeWordBar(editBar, undefined, DEFAULT_CUSTOMIZATION.homeWordBar);
    const shown = [...bar.words.slice(0, wordCountFor(bar.layout)), ...bar.phrases].filter(t => t.trim());
    if (bar.enabled && shown.length === 0) {
      setToast({ msg: 'Add at least one word or phrase, or turn the word bar off', type: 'error' });
      return;
    }
    updateSetting('homeEmergencyLaunchMode', editMode);
    updateHomeWordBar(bar);
    setEditBar(structuredClone(bar));
    setToast({ msg: 'Home layout saved', type: 'success' });
  }, [editBar, editMode, updateHomeWordBar, updateSetting]);

  const handleReset = useCallback(() => {
    setEditMode(readLeftPanelMode(DEFAULT_CUSTOMIZATION.settings.homeEmergencyLaunchMode));
    setEditBar(structuredClone(DEFAULT_CUSTOMIZATION.homeWordBar));
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
  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: colors.text.secondary, marginBottom: 4, letterSpacing: '0.02em',
  };
  const preview = barPreviewPalette(isWarm);
  const previewCells = [
    ...editBar.words.slice(0, wordCount).map(text => ({ text: text.trim(), phrase: false })),
    ...editBar.phrases.map(text => ({ text: text.trim(), phrase: true })),
  ].filter(cell => cell.text);

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
            { key: 'alert' as LeftPanelMode, title: 'Urgent Needs + Quick Phrases', desc: 'A large Urgent Needs card opens the care actions (SOS, suction, pain and your own). Quick Phrases sits below it.' },
            { key: 'quick' as LeftPanelMode, title: 'Quick Phrases only', desc: 'Just the Quick Phrases card, large and centred in the column.' },
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
          <div role="alert" style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: `${colors.warning.main}14`,
            border: `1px solid ${colors.warning.main}55`,
            fontSize: 13,
            color: colors.text.primary,
            lineHeight: 1.5,
          }}>
            <strong>No way to call for help from Home.</strong> With Quick Phrases only, the patient cannot
            open Urgent Needs from the Home screen. Choose this only if urgent needs are covered another way,
            for example by words in the word bar below.
          </div>
        )}
        <div style={{ fontSize: 12, color: colors.text.tertiary, lineHeight: 1.5 }}>
          The Urgent Needs cards themselves are chosen in Settings &gt; Urgent Needs.
        </div>
      </div>

      {/* Word bar */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.text.primary, flex: 1 }}>
            Word Bar at the Bottom of Home
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: editBar.enabled ? colors.accent.main : colors.text.tertiary }}>
            {editBar.enabled ? 'On' : 'Off'}
          </span>
          <button
            className={`hl-toggle ${editBar.enabled ? 'hl-toggle-on' : 'hl-toggle-off'}`}
            onClick={() => setEditBar(bar => ({ ...bar, enabled: !bar.enabled }))}
            aria-label={editBar.enabled ? 'Turn the word bar off' : 'Turn the word bar on'}
            aria-pressed={editBar.enabled}
          />
        </div>
        <div style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
          Words and phrases that stay on the Home screen, along the bottom. One look speaks them.
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          opacity: editBar.enabled ? 1 : 0.55,
          transition: 'opacity 150ms',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {([
              { key: '3+2' as const, title: '3 words + 2 phrases' },
              { key: '4+2' as const, title: '4 words + 2 phrases' },
            ]).map(option => (
              <button
                key={option.key}
                onClick={() => setEditBar(bar => ({ ...bar, layout: option.key }))}
                style={{ ...optionStyle(editBar.layout === option.key), padding: '10px 14px' }}
              >
                <div style={{ fontSize: 14, fontWeight: 800 }}>{option.title}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wordCount}, minmax(0, 1fr))`, gap: 10 }}>
            {editBar.words.slice(0, wordCount).map((word, index) => (
              <label key={`word-${index}`} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={fieldLabelStyle}>Word {index + 1}</span>
                <input
                  className="hl-input"
                  list="hl-word-options"
                  value={word}
                  maxLength={24}
                  placeholder="Type or pick a word"
                  onChange={event => setWord(index, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HOME_WORD_BAR_PHRASES}, minmax(0, 1fr))`, gap: 10 }}>
            {editBar.phrases.map((phrase, index) => (
              <label key={`phrase-${index}`} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={fieldLabelStyle}>Phrase {index + 1}</span>
                <input
                  className="hl-input"
                  list="hl-phrase-options"
                  value={phrase}
                  maxLength={60}
                  placeholder="Type or pick a phrase"
                  onChange={event => setPhrase(index, event.target.value)}
                />
              </label>
            ))}
          </div>
          <datalist id="hl-word-options">
            {wordOptions.map(option => <option key={option} value={option} />)}
          </datalist>
          <datalist id="hl-phrase-options">
            {phraseOptions.map(option => <option key={option} value={option} />)}
          </datalist>
          {HOME_WORD_BAR_WORDS > wordCount && editBar.words.slice(wordCount).some(w => w.trim()) && (
            <div style={{ fontSize: 12, color: colors.text.tertiary }}>
              Word {wordCount + 1} is kept, and shows again with 4 words + 2 phrases.
            </div>
          )}

          {/* Preview */}
          <div>
            <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Preview</div>
            <div style={{
              display: 'flex', gap: 8, padding: 10, borderRadius: 10,
              background: preview.frame, border: `1px solid ${colors.border.main}`, minHeight: 64,
            }}>
              {previewCells.length === 0 ? (
                <div style={{ fontSize: 13, color: colors.text.tertiary, alignSelf: 'center', padding: '0 6px' }}>
                  Nothing to show yet: add a word or a phrase.
                </div>
              ) : previewCells.map((cell, index) => (
                <div key={index} style={{
                  flex: cell.phrase ? '1.7 1 0' : '1 1 0',
                  minWidth: 0,
                  height: 64,
                  borderRadius: 8,
                  background: cell.phrase ? preview.phraseBg : preview.wordBg,
                  color: cell.phrase ? preview.phraseText : preview.wordText,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 8px',
                  fontSize: cell.phrase ? 14 : 18,
                  fontWeight: 720,
                  textAlign: 'center',
                  lineHeight: 1.15,
                  overflow: 'hidden',
                }}>
                  {cell.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset Home Layout?"
          message="This restores the left panel (Quick Phrases only) and the word bar (off, with its starting words) to their defaults. Nothing is saved until you press Save Changes."
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
