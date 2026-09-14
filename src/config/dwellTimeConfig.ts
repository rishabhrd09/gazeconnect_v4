/** Five fixed selection durations shared by every gaze surface.
 * Onset, cooldown and tracking stability are separate internal safeguards.
 */
export const DWELL_GROUPS = {
  typing: { ms: 500, label: 'Typing', description: 'Individual letters and keyboard keys' },
  words: { ms: 1000, label: 'Words & suggestions', description: 'Word suggestions and alphabet groups' },
  communication: { ms: 1250, label: 'Communication', description: 'Phrases, care requests and quick replies' },
  navigation: { ms: 1500, label: 'Navigation & choices', description: 'Pages, survey answers, map cells and browsing' },
  deliberate: { ms: 2000, label: 'Deliberate actions', description: 'Gaze on/off, clearing text and confirmations' },
} as const;
export type DwellGroup = keyof typeof DWELL_GROUPS;
export const DWELL_ACTION_GROUPS = {
  standardButton: 'navigation', navigationButton: 'navigation',
  emergencyButton: 'deliberate', quickWord: 'communication', gazeToggle: 'deliberate',
  backSkipButton: 'navigation', homeScreenTile: 'navigation', keyboardKey: 'typing',
  predictionButton: 'words', phraseButton: 'communication', surveyOption: 'navigation', compassMapAction: 'navigation',
  quickfire: 'communication', spatialZone: 'words', settingsButton: 'navigation',
  medicalUrgent: 'communication', deliberateAction: 'deliberate',
} as const satisfies Record<string, DwellGroup>;
export type DwellAction = keyof typeof DWELL_ACTION_GROUPS;
export type DwellContext = DwellAction | 'keyboard' | 'prediction' | 'navigation' | 'phrases' | 'settings' | 'emergency' | 'calibration' | 'spatial';
export type DwellTimeSettings = Record<DwellAction, number> & {
  cooldownAfterActivation: number;
  onsetDelay: number;
  progressStyle: 'ring' | 'shrink';
};

export function dwellForAction(action: DwellAction): number {
  return DWELL_GROUPS[DWELL_ACTION_GROUPS[action]].ms;
}
const CONTEXT_ACTIONS: Record<string, DwellAction> = {
  keyboard: 'keyboardKey', prediction: 'predictionButton', spatial: 'spatialZone',
  phrases: 'phraseButton', quickfire: 'quickfire', quickword: 'quickWord',
  emergency: 'emergencyButton', navigation: 'navigationButton',
  compass: 'compassMapAction', 'compass-map': 'compassMapAction',
  settings: 'settingsButton', standard: 'standardButton',
  ...Object.fromEntries(Object.keys(DWELL_ACTION_GROUPS).map(key => [key.toLowerCase(), key])),
};
export function dwellForContext(context: string): number {
  const key = context.toLowerCase();
  return dwellForAction(Object.prototype.hasOwnProperty.call(CONTEXT_ACTIONS, key) ? CONTEXT_ACTIONS[key] : 'standardButton');
}
/** Old element overrides cannot introduce an extra duration. Round upward. */
export function fixedDwell(ms: number, fallback: number = DWELL_GROUPS.navigation.ms): number {
  if (!Number.isFinite(ms) || ms <= 0) return fallback;
  return Object.values(DWELL_GROUPS).find(group => group.ms >= ms)?.ms ?? DWELL_GROUPS.deliberate.ms;
}
export const DEFAULT_DWELL_TIMES: DwellTimeSettings = {
  ...Object.fromEntries(Object.keys(DWELL_ACTION_GROUPS).map(key => [key, dwellForAction(key as DwellAction)])) as Record<DwellAction, number>,
  cooldownAfterActivation: 420,
  onsetDelay: 350,
  progressStyle: 'ring',
};

// Read old preferences only for internal safeguards. Keep the old storage intact
// for rollback; saved per-action durations no longer override the five groups.
export const DWELL_SETTINGS_KEY = 'gazeconnect_dwell_settings';
export type ALSStageKey = 'caregiver' | 'early_als' | 'mid_als' | 'late_als';
export interface KeyboardCadence { onset: number; cooldown: number; }
export const KEYBOARD_CADENCE_BY_STAGE: Record<ALSStageKey, KeyboardCadence> = {
  caregiver: { onset: 120, cooldown: 450 },
  early_als: { onset: 150, cooldown: 600 },
  mid_als: { onset: 150, cooldown: 700 },
  late_als: { onset: 200, cooldown: 850 },
};
export const KEYBOARD_CADENCE_DEFAULT = KEYBOARD_CADENCE_BY_STAGE.mid_als;
const LEGACY_GUARDS: Record<ALSStageKey, { onsetDelay: number; cooldownAfterActivation: number }> = {
  caregiver: { onsetDelay: 150, cooldownAfterActivation: 240 },
  early_als: { onsetDelay: 250, cooldownAfterActivation: 300 },
  mid_als: { onsetDelay: 350, cooldownAfterActivation: 420 },
  late_als: { onsetDelay: 450, cooldownAfterActivation: 600 },
};
export function loadDwellPreferences(storage: Pick<Storage, 'getItem'>) {
  let currentStage: ALSStageKey = 'mid_als';
  let saved: Record<string, unknown> = {};
  try {
    const stage = storage.getItem('gazeconnect_als_stage');
    if (stage && Object.prototype.hasOwnProperty.call(LEGACY_GUARDS, stage)) currentStage = stage as ALSStageKey;
    const parsed = JSON.parse(storage.getItem(DWELL_SETTINGS_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch { /* Unavailable or malformed storage uses fixed defaults. */ }
  const guard = (key: 'onsetDelay' | 'cooldownAfterActivation', min: number, max: number) => {
    const value = saved[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value)) : LEGACY_GUARDS[currentStage][key];
  };
  const settings: DwellTimeSettings = {
    ...DEFAULT_DWELL_TIMES,
    onsetDelay: guard('onsetDelay', 100, 600),
    cooldownAfterActivation: guard('cooldownAfterActivation', 100, 1000),
    progressStyle: saved.progressStyle === 'shrink' ? 'shrink' : 'ring',
  };
  return { settings, currentStage };
}
