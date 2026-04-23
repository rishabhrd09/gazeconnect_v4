/**
 * GazeConnect Pro - Settings Screen (v5.0 - Mouse-Only)
 * ======================================================
 * Sidebar-navigated customization hub with 6 section panels.
 * MOUSE-CLICK ONLY: All gaze/dwell disabled on this page.
 * Caregiver uses mouse; patient uses gaze on other screens.
 * GlobalNavBar remains fully gaze-enabled for navigation.
 */

import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, typography, spacing, screenThemes } from '../utils/design';
import GazeButton from '../components/core/GazeButton';
import {
  FamilyIcon, MessageIcon, MedicalCrossIcon,
  HomeIcon, TVIcon, SettingsIcon, ChatBubblesIcon,
} from '../components/icons/Icons';
import { useCustomization } from '../contexts/CustomizationContext';
import { GlobalNavBar } from '../components/GlobalNavBar';
import ConfirmDialog from '../components/settings/shared/ConfirmDialog';
import { useTheme } from '../contexts/ThemeContext';

import PeoplePanel from '../components/settings/panels/PeoplePanel';
import PhrasesPanel from '../components/settings/panels/PhrasesPanel';
import MedicalPanel from '../components/settings/panels/MedicalPanel';
import HomeLayoutPanel from '../components/settings/panels/HomeLayoutPanel';
import ActivitiesPanel from '../components/settings/panels/ActivitiesPanel';
import AppSettingsPanel from '../components/settings/panels/AppSettingsPanel';
import DictionaryPanel from '../components/settings/panels/DictionaryPanel';
import QuickWordsPanel from '../components/settings/panels/QuickWordsPanel';
import AlertModePanel from '../components/settings/panels/AlertModePanel';

// ============================================
// TYPES
// ============================================

interface SettingsScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

type SectionId = 'appsettings' | 'dictionary' | 'people' | 'phrases' | 'medical' | 'home' | 'quickwords' | 'activities' | 'alertmode';

interface SidebarSection {
  id: SectionId;
  label: string;
  icon: React.FC<{ size?: number; color?: string }>;
}

const SECTIONS: SidebarSection[] = [
  { id: 'appsettings', label: 'App Settings', icon: SettingsIcon },
  { id: 'dictionary', label: 'Dictionary', icon: MessageIcon },
  { id: 'people', label: 'People', icon: FamilyIcon },
  { id: 'phrases', label: 'Phrases', icon: MessageIcon },
  { id: 'medical', label: 'Medical', icon: MedicalCrossIcon },
  { id: 'home', label: 'Home Layout', icon: HomeIcon },
  { id: 'quickwords', label: 'Quick Words', icon: ChatBubblesIcon },
  { id: 'alertmode', label: '🚨 Alert Mode', icon: SettingsIcon },
  { id: 'activities', label: 'Activities', icon: TVIcon },
];

// Theme from design.ts
const THEME = screenThemes.settings;

// ============================================
// TOAST COMPONENT
// ============================================

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

const Toast: React.FC<{ toast: ToastState; isDarkMode: boolean; onClose: () => void }> = ({ toast, isDarkMode, onClose }) => {
  const bgMap = { success: 'rgba(16, 185, 129, 0.95)', error: 'rgba(239, 68, 68, 0.95)', info: 'rgba(59, 130, 246, 0.95)' };
  React.useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
      padding: '12px 28px', borderRadius: '10px', zIndex: 9000,
      backgroundColor: bgMap[toast.type], color: '#fff',
      fontSize: '14px', fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      pointerEvents: 'auto', cursor: 'pointer', maxWidth: '90vw', textAlign: 'center',
    }} onClick={onClose}>
      {toast.message}
    </div>
  );
};

// ============================================
// JSON VALIDATION
// ============================================

/** Validate that imported data looks like a GazeConnect customization backup */
function validateBackupJSON(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File does not contain valid JSON data.' };
  }
  const requiredArrays = ['people', 'phraseCategories', 'medicalSections'];
  for (const key of requiredArrays) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return { valid: false, error: `Invalid format: "${key}" should be an array.` };
    }
  }
  if (data.settings !== undefined && typeof data.settings !== 'object') {
    return { valid: false, error: 'Invalid format: "settings" should be an object.' };
  }
  const knownKeys = ['people', 'phraseCategories', 'medicalSections', 'homeQuickActions',
    'activityCategories', 'feelings', 'basicNeeds', 'settings', 'version'];
  const hasKnownKey = knownKeys.some(k => k in data);
  if (!hasKnownKey) {
    return { valid: false, error: 'File does not appear to be a GazeConnect backup.' };
  }
  return { valid: true };
}

// ============================================
// MAIN SETTINGS SCREEN
// ============================================

const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onNavigate,
  onSpeak,
  isDarkMode = true,
}) => {
  const { exportJSON, importJSON, resetToDefaults } = useCustomization();
  const { isLight } = useTheme();
  const colors = isDarkMode ? darkColors : lightColors;

  const [selectedSection, setSelectedSection] = useState<SectionId>('appsettings');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    setToast({ message, type });
  }, []);

  // ---- EXPORT ----
  const handleExport = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;
      const json = exportJSON();

      if (api?.customization?.export) {
        const result = await api.customization.export(json);
        if (result?.success) {
          const displayPath = result.filePath || 'chosen location';
          showToast(`Backup saved to: ${displayPath}`);
        }
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gazeconnect-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup downloaded');
      }
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Please try again.', 'error');
    }
  }, [exportJSON, showToast]);

  // ---- IMPORT ----
  const handleImport = useCallback(async () => {
    try {
      const api = (window as any).electronAPI;

      if (api?.customization?.import) {
        const data = await api.customization.import();
        if (!data) return;

        const { valid, error } = validateBackupJSON(data);
        if (!valid) {
          showToast(error || 'Invalid backup file.', 'error');
          return;
        }

        setPendingImportData(data);
        setShowImportConfirm(true);
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
          const file = e.target?.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const text = ev.target?.result as string;
              const data = JSON.parse(text);
              const { valid, error } = validateBackupJSON(data);
              if (!valid) {
                showToast(error || 'Invalid backup file.', 'error');
                return;
              }
              setPendingImportData(data);
              setShowImportConfirm(true);
            } catch {
              showToast('Failed to parse JSON file.', 'error');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      }
    } catch (err) {
      console.error('Import failed:', err);
      showToast('Import failed. Please try again.', 'error');
    }
  }, [showToast]);

  const confirmImport = useCallback(() => {
    if (pendingImportData) {
      try {
        importJSON(JSON.stringify(pendingImportData));
        showToast('Settings restored from backup');
      } catch {
        showToast('Failed to apply backup data.', 'error');
      }
    }
    setPendingImportData(null);
    setShowImportConfirm(false);
  }, [pendingImportData, importJSON, showToast]);

  const cancelImport = useCallback(() => {
    setPendingImportData(null);
    setShowImportConfirm(false);
  }, []);

  // ---- RESET ----
  const handleReset = useCallback(() => {
    resetToDefaults();
    setShowResetConfirm(false);
    showToast('All settings reset to factory defaults');
  }, [resetToDefaults, showToast]);

  const renderPanel = () => {
    switch (selectedSection) {
      case 'people': return <PeoplePanel isDarkMode={isDarkMode} />;
      case 'phrases': return <PhrasesPanel isDarkMode={isDarkMode} />;
      case 'medical': return <MedicalPanel isDarkMode={isDarkMode} />;
      case 'home': return <HomeLayoutPanel isDarkMode={isDarkMode} />;
      case 'quickwords': return <QuickWordsPanel isDarkMode={isDarkMode} />;
      case 'alertmode': return <AlertModePanel isDarkMode={isDarkMode} />;
      case 'activities': return <ActivitiesPanel isDarkMode={isDarkMode} />;
      case 'appsettings': return <AppSettingsPanel isDarkMode={isDarkMode} />;
      case 'dictionary': return <DictionaryPanel isDarkMode={isDarkMode} />;
    }
  };

  return (
    <div className={`settings-screen${isLight ? ' theme-light' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: colors.background.primary,
      overflow: 'hidden',
    }}>
      {/* Global Navigation Bar — remains fully gaze-enabled */}
      <div style={{ padding: `${spacing[2]} ${spacing[4]} 0` }}>
        <GlobalNavBar
          currentPage="settings"
          onNavigate={onNavigate}
          onSpeak={onSpeak}
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Main content: sidebar + panel — gaze-disabled zone */}
      <div data-gaze="false" style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
        padding: `${spacing[2]} ${spacing[4]} ${spacing[4]}`,
        gap: spacing[4],
      }}>
        {/* SIDEBAR — mouse-click only */}
        <div style={{
          width: 'clamp(200px, 15vw, 260px)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: THEME.sidebarBg,
          borderRadius: '12px',
          border: `1px solid ${colors.border.main}`,
          overflow: 'hidden',
        }} className="settings-sidebar">
          {/* Section nav items */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: spacing[2],
            gap: spacing[1],
            overflowY: 'auto',
          }}>
            {SECTIONS.map(section => {
              const isSelected = selectedSection === section.id;
              const SectionIcon = section.icon;
              return (
                <GazeButton
                  key={section.id}
                  id={`sidebar-${section.id}`}
                  size="sm"
                  variant="default"
                  onClick={() => setSelectedSection(section.id)}
                  isDarkMode={isDarkMode}
                  gazeEnabled={false}
                  gazeEnabledTimestamp={0}
                  dwellCategory="settingsButton"
                  style={{
                    width: '100%',
                    backgroundColor: isSelected ? THEME.selectedBg : 'transparent',
                    borderRadius: '8px',
                    padding: 'clamp(10px, 1.2vh, 16px) clamp(10px, 1vw, 14px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    justifyContent: 'flex-start',
                    border: 'none',
                    borderLeftWidth: '4px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: isSelected ? THEME.selectedColor : 'transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <SectionIcon
                    size={20}
                    color={isSelected ? THEME.selectedColor : colors.text.tertiary}
                  />
                  <span style={{
                    fontSize: typography.fontSize.sm,
                    fontWeight: isSelected ? typography.fontWeight.semibold : typography.fontWeight.normal,
                    color: isSelected ? THEME.selectedColor : colors.text.secondary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {section.label}
                  </span>
                </GazeButton>
              );
            })}
          </div>

          {/* Separator */}
          <div style={{
            height: 1,
            backgroundColor: THEME.separatorColor,
            margin: `0 ${spacing[3]}`,
          }} />

          {/* Action buttons at bottom — mouse-click only */}
          <div style={{
            padding: spacing[2],
            display: 'flex',
            flexDirection: 'column',
            gap: spacing[1],
          }}>
            <GazeButton
              id="sidebar-export"
              size="sm"
              variant="default"
              onClick={handleExport}
              isDarkMode={isDarkMode}
              gazeEnabled={false}
              gazeEnabledTimestamp={0}
              dwellCategory="settingsButton"
              style={{
                width: '100%',
                padding: 'clamp(8px, 1vh, 12px) clamp(10px, 1vw, 14px)',
                borderRadius: '8px',
                justifyContent: 'flex-start',
                fontSize: typography.fontSize.sm,
              }}
            >
              Export Backup
            </GazeButton>
            <GazeButton
              id="sidebar-import"
              size="sm"
              variant="default"
              onClick={handleImport}
              isDarkMode={isDarkMode}
              gazeEnabled={false}
              gazeEnabledTimestamp={0}
              dwellCategory="settingsButton"
              style={{
                width: '100%',
                padding: 'clamp(8px, 1vh, 12px) clamp(10px, 1vw, 14px)',
                borderRadius: '8px',
                justifyContent: 'flex-start',
                fontSize: typography.fontSize.sm,
              }}
            >
              Import Backup
            </GazeButton>
            <GazeButton
              id="sidebar-reset"
              size="sm"
              variant="emergency"
              onClick={() => setShowResetConfirm(true)}
              isDarkMode={isDarkMode}
              gazeEnabled={false}
              gazeEnabledTimestamp={0}
              dwellCategory="settingsButton"
              style={{
                width: '100%',
                padding: 'clamp(8px, 1vh, 12px) clamp(10px, 1vw, 14px)',
                borderRadius: '8px',
                justifyContent: 'flex-start',
                fontSize: typography.fontSize.sm,
              }}
            >
              Reset to Defaults
            </GazeButton>
          </div>
        </div>

        {/* CONTENT PANEL */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: spacing[4],
          backgroundColor: colors.background.secondary,
          borderRadius: '12px',
          border: `1px solid ${colors.border.main}`,
          minHeight: 0,
        }} className="settings-panel">
          {/* Mouse-Only Banner */}
          <div className="mouse-only-banner" style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            color: '#38BDF8',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}>
            🖱️ Mouse-Only Page — Use mouse click to change settings. Navigation bar above remains gaze-enabled.
          </div>
          {renderPanel()}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast toast={toast} isDarkMode={isDarkMode} onClose={() => setToast(null)} />
      )}

      {/* Import confirmation */}
      {showImportConfirm && (
        <ConfirmDialog
          title="Import Backup?"
          message="This will replace ALL current customizations (people, phrases, medical items, home layout, activities, and settings) with the data from the backup file. This cannot be undone."
          confirmLabel="Replace All"
          onConfirm={confirmImport}
          onCancel={cancelImport}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Reset All confirmation */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset EVERYTHING to Factory Defaults?"
          message="This will permanently erase all your customizations — people, phrases, medical items, home layout, activities, and settings — and restore factory defaults. This cannot be undone."
          confirmLabel="Reset Everything"
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};

export default React.memo(SettingsScreen);
