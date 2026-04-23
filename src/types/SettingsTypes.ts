/**
 * GazeConnect Pro - Settings Types
 */

import type { Person } from './PeopleTypes';

export interface AppSettings {
  // Appearance
  isDarkMode: boolean;
  showHindi: boolean;

  // Gaze
  dwellTime: number;
  filterPreset: string;
  /** Controls gaze behavior when navigating between screens.
   *  'smart-pause'   — Gaze stays on, dwell freezes for ~1.2s (recommended, prevents Midas Touch)
   *  'full-pause'    — Gaze fully disables, patient re-enables via toggle (current behavior)
   *  'always-active' — No pause at all, dwell is immediately active on new screen
   */
  gazeOnNavigate: 'smart-pause' | 'full-pause' | 'always-active';

  // Voice
  ttsRate: number;
  ttsVolume: number;

  // People
  people: Person[];

  // Emergency
  emergencyPhraseEn: string;
  emergencyPhraseHi: string;

  // Gaze accuracy
  gazeOffsetX: number;
  gazeOffsetY: number;
  gazeDebugOverlay: boolean;

  // Schema version for future migration
  version: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  isDarkMode: true,
  showHindi: false,
  dwellTime: 900,
  filterPreset: 'normal',
  gazeOnNavigate: 'smart-pause',
  ttsRate: 1.0,
  ttsVolume: 1.0,
  people: [],
  emergencyPhraseEn: 'I need help immediately! This is an emergency!',
  emergencyPhraseHi: 'मुझे तुरंत मदद चाहिए! यह एक आपातकालीन स्थिति है!',
  gazeOffsetX: 0,
  gazeOffsetY: 0,
  gazeDebugOverlay: false,
  version: 1,
};
