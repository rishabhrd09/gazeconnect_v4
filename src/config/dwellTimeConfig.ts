/**
 * GazeConnect Pro - Centralized Dwell Time Configuration
 * ======================================================
 * All dwell timings in one place. Values based on audit of existing codebase.
 * Each category maps to a specific UI context for fine-grained control.
 */

export interface DwellTimeSettings {
  // Core button categories
  standardButton: number;
  navigationButton: number;
  emergencyButton: number;
  quickWord: number;
  gazeToggle: number;
  backSkipButton: number;

  // Screen-specific overrides
  homeScreenTile: number;
  keyboardKey: number;
  phraseButton: number;
  surveyOption: number;
  compassMapAction: number;
  quickfire: number;
  spatialZone: number;
  settingsButton: number;
  medicalUrgent: number;

  // Timing controls
  cooldownAfterActivation: number;
  onsetDelay: number;

  // Visual feedback
  ringAnimationSync: boolean;

  // v17: Progress indicator style
  progressStyle: 'ring' | 'shrink';

  // v17: Variable repeat dwell times (OptiKey-style)
  // When the same key is pressed again within repeatWindowMs, use faster dwell times.
  // Array: [first_press, second_press, third_press, ...]. Last value repeats for subsequent presses.
  // Example: [1100, 250, 350] → first=1100ms, second=250ms, third+=350ms
  repeatDwellEnabled: boolean;
  repeatDwellTimes: number[];
  repeatWindowMs: number;
}

// Category metadata for the Settings UI
export interface DwellCategoryMeta {
  key: keyof DwellTimeSettings;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  group: 'core' | 'screen' | 'advanced';
}

export const DWELL_CATEGORIES: DwellCategoryMeta[] = [
  { key: 'standardButton', label: 'Standard Button', description: 'Default for most buttons', min: 500, max: 2500, step: 50, group: 'core' },
  { key: 'navigationButton', label: 'Navigation Button', description: 'Top nav bar buttons', min: 800, max: 3000, step: 50, group: 'core' },
  { key: 'emergencyButton', label: 'Emergency Button', description: 'Emergency - longer prevents accidents', min: 1400, max: 4000, step: 50, group: 'core' },
  { key: 'quickWord', label: 'Quick Word Button', description: 'Single-word quick communication buttons in overlay', min: 500, max: 2000, step: 50, group: 'core' },
  { key: 'gazeToggle', label: 'Gaze Toggle', description: 'Enable/Disable gaze button', min: 500, max: 2500, step: 50, group: 'core' },
  { key: 'backSkipButton', label: 'Back / Skip Button', description: 'Survey back and skip buttons', min: 600, max: 2500, step: 50, group: 'core' },

  { key: 'homeScreenTile', label: 'Home Screen Tile', description: 'Large tiles on Home screen', min: 500, max: 2500, step: 50, group: 'screen' },
  { key: 'keyboardKey', label: 'Keyboard Key', description: 'Keyboard screen keys', min: 500, max: 2200, step: 50, group: 'screen' },
  { key: 'phraseButton', label: 'Phrase Button', description: 'Phrases, Feelings, Needs, People', min: 500, max: 2500, step: 50, group: 'screen' },
  { key: 'surveyOption', label: 'Survey Option', description: 'Floor plan survey answers', min: 500, max: 2500, step: 50, group: 'screen' },
  { key: 'compassMapAction', label: 'Compass Map Action', description: 'Compass map selection and refinement', min: 500, max: 3000, step: 50, group: 'screen' },
  { key: 'quickfire', label: 'Quick Fire', description: 'Quick reply buttons (Yes/No/Help)', min: 500, max: 2000, step: 50, group: 'screen' },
  { key: 'spatialZone', label: 'Spatial Keyboard Zone', description: 'Spatial keyboard zone selection', min: 500, max: 2500, step: 50, group: 'screen' },
  { key: 'settingsButton', label: 'Settings Button', description: 'Settings navigation', min: 500, max: 2500, step: 50, group: 'screen' },
  { key: 'medicalUrgent', label: 'Medical Urgent', description: 'Urgent medical items - faster access', min: 500, max: 1500, step: 50, group: 'screen' },

  { key: 'cooldownAfterActivation', label: 'Cooldown After Activation', description: 'Pause after a button fires', min: 100, max: 1000, step: 50, group: 'advanced' },
  { key: 'onsetDelay', label: 'Onset Delay', description: 'Silent phase before visual feedback', min: 100, max: 600, step: 25, group: 'advanced' },
  { key: 'repeatWindowMs', label: 'Repeat Key Window', description: 'Time window for faster repeat key presses (ms)', min: 500, max: 5000, step: 250, group: 'advanced' },
];

export const DEFAULT_DWELL_TIMES: DwellTimeSettings = {
  standardButton: 1300,
  navigationButton: 1400,
  emergencyButton: 2000,
  quickWord: 1200,
  gazeToggle: 1200,
  backSkipButton: 1400,

  homeScreenTile: 1200,
  keyboardKey: 1100,
  phraseButton: 1200,
  surveyOption: 1300,
  compassMapAction: 1200,
  quickfire: 1000,
  spatialZone: 1200,
  settingsButton: 1300,
  medicalUrgent: 900,

  cooldownAfterActivation: 300,
  onsetDelay: 250,

  ringAnimationSync: true,

  // v17: Shrinking circle draws gaze toward button center during dwell
  progressStyle: 'ring',

  // v17: Variable repeat dwell — dramatically speeds up repeated characters (ll, ss, ee, oo)
  // OptiKey uses comma-separated completion times per key: "1000,100,200"
  // First press uses normal dwell, subsequent presses within window use faster times.
  repeatDwellEnabled: true,
  repeatDwellTimes: [0, 250, 350],  // [first=normal, second=250ms, third+=350ms]
  repeatWindowMs: 2000,             // Must re-select within 2s to get faster dwell
};

// Presets for quick configuration (multiplied on top of current base)
export const DWELL_PRESETS = {
  slow: {
    label: 'Slow (Careful)',
    description: 'Longer dwell times - fewer accidental activations',
    multiplier: 1.4,
  },
  balanced: {
    label: 'Balanced',
    description: 'Default timing - good for most users',
    multiplier: 1.0,
  },
  quick: {
    label: 'Quick (Experienced)',
    description: 'Shorter dwell times - faster interaction',
    multiplier: 0.7,
  },
  responsive: {
    label: 'Responsive (Caregiver)',
    description: 'Very short dwell times - for non-ALS users',
    multiplier: 0.55,
  },
} as const;

// ALS Stage Dwell Profiles — research-backed presets
// Based on Tobii Dynavox clinical guidelines, ISAAC AAC standards, Ball et al. 2010
export const ALS_STAGE_PRESETS = {
  caregiver: {
    label: 'Caregiver / Normal',
    description: 'Standard timing for caregivers and non-ALS users',
    multiplier: 0.75,
    cooldownMultiplier: 0.8,
    onsetDelay: 150,
    filterPreset: 'responsive',   // v15: fast tracking for non-ALS users
  },
  early_als: {
    label: 'Early ALS',
    description: 'Mild motor changes — slightly longer dwell, minimal fatigue compensation',
    multiplier: 1.0,
    cooldownMultiplier: 1.0,
    onsetDelay: 250,
    filterPreset: 'balanced',     // v15: balanced smoothing for early stage
  },
  mid_als: {
    label: 'Mid ALS',
    description: 'Moderate weakness — longer dwell, extended cooldowns, reduced accidental activations',
    multiplier: 1.35,
    cooldownMultiplier: 1.4,
    onsetDelay: 350,
    filterPreset: 'als_early',    // v15: moderate stability boost
  },
  late_als: {
    label: 'Late / Advanced ALS',
    description: 'Significant motor impairment — maximum dwell, maximum cooldowns, maximum stability',
    multiplier: 1.8,
    cooldownMultiplier: 2.0,
    onsetDelay: 450,
    filterPreset: 'als_late',     // v15: maximum cursor stability
  },
} as const;

export const DWELL_SETTINGS_KEY = 'gazeconnect_dwell_settings';
