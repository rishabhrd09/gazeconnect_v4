/**
 * GazeConnect Pro - Customization Types
 * ======================================
 * All data structures for the customization system.
 * These types are used by CustomizationService, CustomizationContext,
 * and all screens that display configurable content.
 */

import type { WebSearchData } from '../config/searchSuggestions';
export type { WebSearchData, WebSearchTarget, WebSearchHistoryEntry } from '../config/searchSuggestions';

// ============================================
// SHARED
// ============================================

export interface Phrase {
  en: string;
  hi: string;
}

// ============================================
// PEOPLE
// ============================================

export interface Person {
  name: string;
  nameHi: string;
  role: string;
  phrases: Phrase[];
  /** Shown on PeopleScreen. Settings can store more people, but only 9 may be active. */
  isActive?: boolean;
}

export const MAX_ACTIVE_PEOPLE = 9;

export const ROLES = [
  'Son', 'Daughter', 'Wife', 'Husband',
  'Nurse', 'Doctor', 'Caretaker', 'Friend', 'Other',
] as const;

export type PersonRole = typeof ROLES[number];

// ============================================
// PHRASES (PhrasesScreen categories)
// ============================================

export interface PhraseCategory {
  id: string;
  name: string;
  phrases: Phrase[];
}

// ============================================
// MEDICAL (MedicalScreen sections)
// ============================================

export interface MedicalItem {
  en: string;
  hi: string;
  urgent?: boolean;
}

export interface MedicalSection {
  id: string;
  title: string;
  titleHi: string;
  color?: string;
  items: MedicalItem[];
}

// ============================================
// HOME (HomeScreen quick actions)
// ============================================

export interface HomeQuickAction {
  label: string;
}

export interface HomeQuickActions {
  leftSidebar: HomeQuickAction[];
  rightSidebar: HomeQuickAction[];
  footerActions: HomeQuickAction[];
}

/** Independent emergency cards shown on Home Screen (max 4, decoupled from Quick Words) */
export interface HomeEmergencyCard {
  en: string;
  hi: string;
  enabled: boolean;
  priority: QuickWordPriority;
}

export type QuickWordPriority = 'high' | 'medium';
export type QuickWordHighColor =
  | 'red'
  | 'crimson'
  | 'muted_red'
  | 'muted_crimson'
  | 'alert_maroon'
  | 'muted_maroon'
  | 'deep_maroon'
  | 'warm_maroon'
  | 'terracotta';
export type QuickWordMediumColor =
  | 'blue'
  | 'golden'
  | 'teal'
  | 'muted_blue'
  | 'muted_golden'
  | 'muted_teal'
  | 'warm_teal'
  | 'deep_teal'
  | 'alert_maroon'
  | 'warm_maroon'
  | 'muted_crimson'
  | 'soft_umber';

export interface QuickWord {
  id?: string;
  en: string;
  hi: string;
  enabled: boolean;
  priority: QuickWordPriority;
  phrases?: Phrase[];
  relatedWordIds?: string[];
}

export interface CoreWord {
  en: string;
  hi: string;
  enabled: boolean;
}

export interface QuickWordCategory {
  id: string;
  heading: string;
  headingHi: string;
  color: string;
  words: QuickWord[];
}

export interface QuickWordsConfig {
  enabled: boolean;
  categories: QuickWordCategory[];
  coreWords: CoreWord[];
  highColor?: QuickWordHighColor;
  mediumColor?: QuickWordMediumColor;
}

// ============================================
// ACTIVITIES (ActivitiesScreen)
// ============================================

export interface ActivityItem {
  label: string;
  sub?: string;
  num?: string;
  speak: string;
}

export interface ActivityCategory {
  id: string;
  name: string;
  items: ActivityItem[];
}

// ============================================
// AAC BOARD (AABoardScreen)
// ============================================

export interface AACCategory {
  id: string;
  name: string;
  nameHi: string;
  colorKey: string;
  items: Phrase[];
}

// ============================================
// FEELINGS & BASIC NEEDS
// ============================================

// These use Phrase[] directly

// ============================================
// APP SETTINGS
// ============================================

export interface AppSettings {
  isDarkMode: boolean;
  designMode: 'focus' | 'serene'; // Visual design, independent of theme and gaze behaviour
  showHindi: boolean; // Legacy storage field; normalized to false for this English-only release.
  dwellTime: number;
  filterPreset: string;
  dwellTimingSet: 'quick' | 'balanced' | 'measured' | 'calm' | 'relaxed' | 'extra_time'; // One complete set of the six selection durations (config/dwellTimeConfig)
  keyboardFeel: 'standard' | 'familiar'; // Optional keyboard-only timing and Dark key appearance
  gazeColors: 'standard' | 'high_contrast' | 'soft'; // Cursor ring, dwell fill and highlight palette (config/gazeColors)
  gazeOnNavigate: 'smart-pause' | 'full-pause' | 'always-active';
  ttsRate: number;                 // words per minute, 80-250 (older saves: a multiplier, converted on load)
  ttsVolume: number;
  breakReminderInterval: number;   // minutes; not on the Settings page (the reminder is not shown anywhere yet)
  ttsLanguage: string;             // Legacy storage field; normalized to 'english'.
  gazeCursorSize: string;          // 'small' | 'medium' | 'large'
  showGazeCursor: boolean;         // Moving circle that follows the eyes (default true)
  soundEffects: boolean;           // not on the Settings page: the app plays no click sounds
  userName: string;                // not on the Settings page since the welcome screen went (default: 'Papa')
  // Gaze accuracy settings
  gazeOffsetX: number;             // Legacy storage field; normalized to 0 (see CustomizationService).
  gazeOffsetY: number;             // Legacy storage field; normalized to 0.
  gazeDebugOverlay: boolean;       // Show gaze debug overlay (default false)
  // Calm full-screen video (7 Oct 2026): no controls on screen while a video plays in full
  // screen; looking at the black strip under it for videoRevealHoldMs (3000 | 4000 | 5000,
  // default 4000) offers Show options. On by default.
  calmFullScreenVideo: boolean;
  videoRevealHoldMs: number;
  // Home left panel: 'quick' = Quick Phrases only (the default), 'alert' = the Urgent
  // Needs card above Quick Phrases, only when chosen in Settings > Home Layout
  // (maintainer's decision, 28 Sep 2026). Anything else, including the four emergency
  // cards retired on 24 Sep 2026 ('cards'), is read as 'quick'; a file saved before
  // data version 6 loads as 'quick' once (CustomizationService).
  homeEmergencyLaunchMode?: 'cards' | 'alert' | 'quick';
}

// ============================================
// ALERT MODE CARDS (AlertModeScreen)
// ============================================

/** One of the 5 customizable cards shown in Alert Mode */
export interface AlertModeCard {
  label: string;   // English text spoken and displayed
  enabled: boolean;
}

// ============================================
// ROOT CUSTOMIZATION DATA
// ============================================

export interface CustomizationData {
  // Content
  people: Person[];
  phraseCategories: PhraseCategory[];
  medicalSections: MedicalSection[];
  quickWords: QuickWordsConfig;
  homeQuickActions: HomeQuickActions;
  homeEmergencyCards: HomeEmergencyCard[];
  activityCategories: ActivityCategory[];
  aacCategories: AACCategory[];
  feelings: Phrase[];
  basicNeeds: Phrase[];

  /** 5 customizable alert-mode cards (card 0 = SOS Emergency, always fixed) */
  alertModeCards: AlertModeCard[];

  /** Search suggestions on the web search keyboard: the person's lists, remembered
   *  searches and two switches (Settings > Web Search; config/searchSuggestions.ts). */
  webSearch: WebSearchData;

  // Settings
  settings: AppSettings;

  // Schema version for future migration
  version: number;
}
