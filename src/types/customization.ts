/**
 * GazeConnect Pro - Customization Types
 * ======================================
 * All data structures for the customization system.
 * These types are used by CustomizationService, CustomizationContext,
 * and all screens that display configurable content.
 */

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
}

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
  | 'soft_umber';

export interface QuickWord {
  en: string;
  hi: string;
  enabled: boolean;
  priority: QuickWordPriority;
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
  showHindi: boolean;
  dwellTime: number;
  filterPreset: string;
  gazeOnNavigate: 'smart-pause' | 'full-pause' | 'always-active';
  ttsRate: number;
  ttsVolume: number;
  breakReminderInterval: number;   // minutes (10–60, default 20)
  emergencyDwellTime: number;      // ms (800–2000, default 1200)
  ttsLanguage: string;             // 'english' | 'hindi' | 'auto'
  gazeCursorSize: string;          // 'small' | 'medium' | 'large'
  soundEffects: boolean;
  userName: string;                // Name shown on splash screen (default: 'Papa')
  emergencyPhraseEn: string;       // English emergency phrase
  emergencyPhraseHi: string;       // Hindi emergency phrase
  // Gaze accuracy settings
  gazeOffsetX: number;             // Manual X offset correction in px (-100 to +100, default 0)
  gazeOffsetY: number;             // Manual Y offset correction in px (-100 to +100, default 0)
  gazeDebugOverlay: boolean;       // Show gaze debug overlay (default false)
  homeEmergencyLaunchMode?: 'cards' | 'alert'; // Home left panel: four emergency cards or one Alert Mode launcher
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

  // Settings
  settings: AppSettings;

  // Schema version for future migration
  version: number;
}
