/** Selection durations shared by every gaze surface.
 *
 * Five action groups, and four complete timing sets that fix all five at
 * once. There are no per-button sliders, multipliers or repeat acceleration:
 * a person chooses one named set. Onset, cooldown and tracking stability are
 * separate internal safeguards.
 *
 * The keyboard dwell is deliberately longer than the original timings after
 * patient feedback. Typing need not be the shortest group: each group is set
 * for the choice it represents, and every mode is slower than the one before.
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
    label: 'Quick', description: 'For a practised user who prefers shorter selections',
    ms: { typing: 800, words: 1000, communication: 1250, navigation: 1500, deliberate: 2000 },
  },
  balanced: {
    label: 'Balanced (default)', description: 'A comfortable pace for most people, with calmer typing',
    ms: { typing: 1400, words: 1300, communication: 1600, navigation: 1900, deliberate: 2500 },
  },
  relaxed: {
    label: 'Relaxed', description: 'More time to find a key and look away from a wrong choice',
    ms: { typing: 2200, words: 1700, communication: 2000, navigation: 2400, deliberate: 3000 },
  },
  extra_time: {
    label: 'Extra Time', description: 'The slowest pace, with generous time to settle on each key',
    ms: { typing: 3000, words: 2200, communication: 2600, navigation: 3000, deliberate: 3800 },
  },
} as const satisfies Record<string, { label: string; description: string; ms: Record<DwellGroup, number> }>;
export type DwellTimingSet = keyof typeof DWELL_TIMING_SETS;
export const DEFAULT_DWELL_TIMING_SET: DwellTimingSet = 'balanced';
/** An optional keyboard-only feel. The four app-wide speed sets remain intact. */
export type KeyboardFeel = 'standard' | 'familiar';
export const DEFAULT_KEYBOARD_FEEL: KeyboardFeel = 'standard';
/** Initial OptiKey-inspired targets, not a claim of equal end-to-end latency. */
export const FAMILIAR_KEYBOARD_TIMING = {
  onset: 350,
  key: 1750,
  suggestion: 1750,
  modifier: 1500,
  incompleteTtl: 750,
} as const;
export function normalizeKeyboardFeel(value: unknown): KeyboardFeel {
  return value === 'familiar' ? 'familiar' : DEFAULT_KEYBOARD_FEEL;
}
/** Every duration any set can produce: the only values another process may accept. */
export const ALL_DWELL_DURATIONS_MS: number[] = [...new Set(
  Object.values(DWELL_TIMING_SETS).flatMap(set => Object.values(set.ms)),
)].sort((a, b) => a - b);
// The cursor resolves legacy element overrides on every animation frame.
// Prepare each set once so that path never allocates or sorts durations.
const ALLOWED_DURATIONS_BY_SET = Object.fromEntries(
  (Object.keys(DWELL_TIMING_SETS) as DwellTimingSet[]).map(set => [
    set,
    [...new Set(Object.values(DWELL_TIMING_SETS[set].ms))].sort((a, b) => a - b),
  ]),
) as Record<DwellTimingSet, number[]>;

export function normalizeDwellTimingSet(value: unknown): DwellTimingSet {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DWELL_TIMING_SETS, value)
    ? value as DwellTimingSet : DEFAULT_DWELL_TIMING_SET;
}

let activeTimingSet: DwellTimingSet = DEFAULT_DWELL_TIMING_SET;
let activeAllowedDurations = ALLOWED_DURATIONS_BY_SET[DEFAULT_DWELL_TIMING_SET];
/** The five durations of the active timing set. `ms` follows setDwellTimingSet. */
export const DWELL_GROUPS = Object.fromEntries((Object.keys(GROUP_INFO) as DwellGroup[]).map(group => [
  group, { ms: DWELL_TIMING_SETS[DEFAULT_DWELL_TIMING_SET].ms[group] as number, ...GROUP_INFO[group] },
])) as Record<DwellGroup, { ms: number; label: string; description: string }>;

export function getDwellTimingSet(): DwellTimingSet { return activeTimingSet; }
/** Select a timing set for every surface at once. Unknown names select the default. */
export function setDwellTimingSet(value: unknown): DwellTimingSet {
  activeTimingSet = normalizeDwellTimingSet(value);
  activeAllowedDurations = ALLOWED_DURATIONS_BY_SET[activeTimingSet];
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
  return activeAllowedDurations.find(duration => duration >= ms)
    ?? activeAllowedDurations[activeAllowedDurations.length - 1];
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
