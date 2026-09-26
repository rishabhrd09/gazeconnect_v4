/**
 * Settings, grouped (GazeSpell look): a sidebar of three groups, a page header with the page's
 * name, what it is for, a "Saved" note and, where it applies, Reset this page. Pages that
 * already existed open their panel unchanged. Mouse only, like the classic Settings.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { DEFAULT_CUSTOMIZATION } from '../../../services/defaultCustomization';
import ConfirmDialog from '../shared/ConfirmDialog';
import { GROUPED_PAGES, HEADER_RESET_PAGES, ICON, OWN_PAGES, PAGE_GROUPS, type GroupedPageId } from './settingsPages';
import { AboutPage, BackupPage, DisplayPage, EyeGazePage, LineIcon, ResetPage, VoicePage } from './GroupedSettingsPages';
import '../../../styles/settings-grouped.css';

interface GroupedSettingsLayoutProps {
  page: GroupedPageId;
  onOpenPage: (id: GroupedPageId) => void;
  /** The open page has edits that are not saved yet. */
  pageDirty: boolean;
  /** The existing panel for the open page (unused by the pages drawn here). */
  panel: React.ReactNode;
  onExport: () => void;
  onImport: () => void;
  onFactoryReset: () => void;
  onSpeak: (text: string) => void;
  isDarkMode: boolean;
}

const SAVED_NOTE_MS = 1600;

const GroupedSettingsLayout: React.FC<GroupedSettingsLayoutProps> = ({
  page, onOpenPage, pageDirty, panel, onExport, onImport, onFactoryReset, onSpeak, isDarkMode,
}) => {
  const { updateSettings } = useCustomization();
  const { setTheme } = useTheme();
  const [savedNote, setSavedNote] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const noteTimer = useRef<number | undefined>(undefined);
  const current = GROUPED_PAGES[page];

  const showSaved = useCallback(() => {
    window.clearTimeout(noteTimer.current);
    setSavedNote(true);
    noteTimer.current = window.setTimeout(() => setSavedNote(false), SAVED_NOTE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);
  useEffect(() => { window.clearTimeout(noteTimer.current); setSavedNote(false); }, [page]);

  const resetPage = () => {
    const defaults = DEFAULT_CUSTOMIZATION.settings;
    if (page === 'gaze') {
      updateSettings({
        dwellTimingSet: defaults.dwellTimingSet, keyboardFeel: defaults.keyboardFeel, gazeOnNavigate: defaults.gazeOnNavigate,
        showGazeCursor: defaults.showGazeCursor, gazeCursorSize: defaults.gazeCursorSize, filterPreset: defaults.filterPreset,
      });
    } else if (page === 'voice') {
      updateSettings({ ttsRate: defaults.ttsRate, ttsVolume: defaults.ttsVolume });
    } else if (page === 'display') {
      setTheme(defaults.isDarkMode ? 'dark' : 'warm');
    }
    setConfirmReset(false);
    showSaved();
  };

  const renderOwnPage = () => {
    switch (page) {
      case 'gaze': return <EyeGazePage onSaved={showSaved} />;
      case 'voice': return <VoicePage onSaved={showSaved} onSpeak={onSpeak} />;
      case 'display': return <DisplayPage onSaved={showSaved} />;
      case 'backup': return <BackupPage onExport={onExport} onImport={onImport} />;
      case 'reset': return <ResetPage onFactoryReset={onFactoryReset} />;
      case 'about': return <AboutPage />;
      default: return null;
    }
  };

  return (
    <div data-gaze="false" className="gss-layout">
      <nav className="gss-sidebar" aria-label="Settings sections">
        {PAGE_GROUPS.map(group => (
          <div key={group.title} className="gss-group">
            <div className="gss-group-title">{group.title}</div>
            {group.pages.map(item => {
              const isCurrent = item.id === page;
              return (
                <button key={item.id} id={`sidebar-${item.id}`} type="button" className="gss-nav-item"
                  aria-current={isCurrent ? 'page' : undefined} onClick={() => onOpenPage(item.id)}>
                  <LineIcon d={item.icon} />
                  <span className="gss-nav-label">{item.title}</span>
                  {isCurrent && pageDirty && <span className="gss-dirty-dot" role="img" aria-label="Unsaved changes" />}
                </button>
              );
            })}
          </div>
        ))}
        <div className="gss-sidebar-note">
          <LineIcon d={ICON.mouse} />
          <span>Mouse only. The top bar still answers gaze.</span>
        </div>
      </nav>

      <main className="gss-main">
        <header className="gss-page-head">
          <div className="gss-page-titles">
            <h1>{current.title}</h1>
            <p>{current.description}</p>
          </div>
          {savedNote && (
            <div role="status" className="gss-saved"><LineIcon d={ICON.check} /><span>Saved</span></div>
          )}
          {HEADER_RESET_PAGES.has(page) && (
            <button type="button" className="gss-button" onClick={() => setConfirmReset(true)}>
              <LineIcon d={ICON.reset} /><span>Reset this page</span>
            </button>
          )}
        </header>
        <div className="gss-page-body">
          {OWN_PAGES.has(page) ? renderOwnPage() : <div className="settings-panel gss-panel-host">{panel}</div>}
        </div>
      </main>

      {confirmReset && (
        <ConfirmDialog
          title={`Reset ${current.title} to its defaults?`}
          message="Only this page changes. Nothing else is touched."
          confirmLabel="Reset this page"
          onConfirm={resetPage}
          onCancel={() => setConfirmReset(false)}
          isDarkMode={isDarkMode}
          variant="warning"
        />
      )}
    </div>
  );
};

export default GroupedSettingsLayout;
