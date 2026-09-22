/** Selection durations shared by every gaze surface.
 *
 * Five action groups, and three complete timing sets that fix all five at
 * once. There are no per-button sliders, multipliers or repeat acceleration:
 * a person chooses one named set. Onset, cooldown and tracking stability are
 * separate internal safeguards.
 *
 * The sets follow published eye-typing practice. Novices typically use
 * 500-1000 ms; in Majaranta, Ahola and Spakov (CHI 2009) the mean was 876 ms
 * in the first session and about 500 ms after an hour of practice. OptiKey
 * defaults to 1250 ms after a 250 ms lock-on.
 *   quick     the timings this app shipped with: for a practised user;
 *   balanced  the default: a first-time user's pace;
 *   relaxed   more time to settle on a target and to look away from a wrong one.
 */
const GROUP_INFO = {
  typing: { label: 'Typing', description: 'Individual letters and keyboard keys' },
  words: { label: 'Words & suggestions', description: 'Word suggestions and alphabet groups' },
  communication: { label: 'Communication', description: 'Phrases, care requests and quick replies' },
  navigation: { label: 'Navigation & choices', description: 'Pages, survey answers, map cells and browsing' },
  deliberate: { label: 'Deliberate actions', description: 'Gaze on/off, clearing text and confirmations' },
} as const;
export type DwellGroup = keyof typeof GROUP_INFO;

export const DWELL_TIMING_SETS = {
  quick: {
    label: 'Quick', description: 'For a practised user',
    ms: { typing: 500, words: 1000, communication: 1250, navigation: 1500, deliberate: 2000 },
  },
  balanced: {
    label: 'Balanced (default)', description: 'A comfortable pace for most people',
    ms: { typing: 900, words: 1300, communication: 1600, navigation: 1900, deliberate: 2500 },
  },
  relaxed: {
    label: 'Relaxed', description: 'More time to settle, and to look away from a wrong choice',
    ms: { typing: 1300, words: 1700, communication: 2000, navigation: 2400, deliberate: 3000 },
  },
} as const satisfies Record<string, { label: string; description: string; ms: Record<DwellGroup, number> }>;
export type DwellTimingSet = keyof typeof DWELL_TIMING_SETS;
export const DEFAULT_DWELL_TIMING_SET: DwellTimingSet = 'balanced';
/** Every duration any set can produce: the only values another process may accept. */
export const ALL_DWELL_DURATIONS_MS: number[] = [...new Set(
  Object.values(DWELL_TIMING_SETS).flatMap(set => Object.values(set.ms)),
)].sort((a, b) => a - b);

export function normalizeDwellTimingSet(value: unknown): DwellTimingSet {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DWELL_TIMING_SETS, value)
    ? value as DwellTimingSet : DEFAULT_DWELL_TIMING_SET;
}

let activeTimingSet: DwellTimingSet = DEFAULT_DWELL_TIMING_SET;
/** The five durations of the active timing set. `ms` follows setDwellTimingSet. */
export const DWELL_GROUPS = Object.fromEntries((Object.keys(GROUP_INFO) as DwellGroup[]).map(group => [
  group, { ms: DWELL_TIMING_SETS[DEFAULT_DWELL_TIMING_SET].ms[group] as number, ...GROUP_INFO[group] },
])) as Record<DwellGroup, { ms: number; label: string; description: string }>;

export function getDwellTimingSet(): DwellTimingSet { return activeTimingSet; }
/** Select a timing set for every surface at once. Unknown names select the default. */
export function setDwellTimingSet(value: unknown): DwellTimingSet {
  activeTimingSet = normalizeDwellTimingSet(value);
  for (const group of Object.keys(GROUP_INFO) as DwellGroup[]) {
    DWELL_GROUPS[group].ms = DWELL_TIMING_SETS[activeTimingSet].ms[group];
  }
  return activeTimingSet;
}

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
/** Per-action durations of one timing set. */
export function dwellTimesFor(set: DwellTimingSet): Record<DwellAction, number> {
  const ms = DWELL_TIMING_SETS[set].ms;
  return Object.fromEntries((Object.keys(DWELL_ACTION_GROUPS) as DwellAction[])
    .map(action => [action, ms[DWELL_ACTION_GROUPS[action]]])) as Record<DwellAction, number>;
}
export const DEFAULT_DWELL_TIMES: DwellTimeSettings = {
  ...dwellTimesFor(DEFAULT_DWELL_TIMING_SET),
  cooldownAfterActivation: 420,
  onsetDelay: 350,
  progressStyle: 'ring',
};

// Read old preferences only for internal safeguards. Keep the old storage intact
// for rollback; saved per-action durations never override a timing set.
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
export function loadDwellPreferences(storage: Pick<Storage, 'getItem'>, timingSet: unknown = activeTimingSet) {
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
    ...dwellTimesFor(normalizeDwellTimingSet(timingSet)),
    onsetDelay: guard('onsetDelay', 100, 600),
    cooldownAfterActivation: guard('cooldownAfterActivation', 100, 1000),
    progressStyle: saved.progressStyle === 'shrink' ? 'shrink' : 'ring',
  };
  return { settings, currentStage };
}
