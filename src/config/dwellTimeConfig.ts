/** Selection durations shared by every gaze surface.
 *
 * Six action groups, and six complete timing sets that fix all six at once.
 * There are no per-button sliders or repeat acceleration: a person chooses one
 * named set. Onset, cooldown and tracking stability are separate internal
 * safeguards.
 *
 * 5 Oct 2026 (maintainer request after patient feedback): Balanced felt quick,
 * Relaxed and Extra Time slow, and the +71 % step from Balanced to Relaxed was
 * drastic; cards and controls also felt far slower than keys (Extra Time:
 * 3.8 s for a card, 2.8 s for a key). So:
 * - Six sets. Keys fill in 0.8 s (Quick), then 1.4, 1.7, 2.0, 2.4 and 2.8 s:
 *   from Balanced on, each set is about a fifth slower than the one before,
 *   one gentle step at a time up to Extra Time, still the slowest. The step is
 *   a constant ratio because a difference in duration is judged relative to
 *   its length.
 * - One rule for every set: a group takes the key time times its entry in
 *   GROUP_RATIOS, to the nearest 50 ms, within GROUP_LIMITS; no selection takes
 *   longer than 4 s. Cards and controls are only a little slower than keys
 *   (navigation 1.2x, deliberate 1.35x, where they had been 1.36x and 1.79x):
 *   one to two just-noticeable steps, about what OptiKey gives its modifier,
 *   suggestion and Sleep keys (1.2x, 1.4x).
 * - Keys, word suggestions, the phrase cell (29 Sep 2026) and now the words on
 *   the Quick Words board share the key time, for muscle memory.
 * - Urgent Needs keeps its deliberately long time (1.8x: Quick 1.45 s,
 *   Balanced 2.5 s, 4 s from Relaxed), unchanged from the four-set table.
 * - Video controls: the bar under a playing YouTube video takes 1.6x the key
 *   time, never under 2 s, so a person can watch (and read the subtitles just
 *   above the bar) at their own pace.
 * check:dwell-groups recomputes every set from GROUP_RATIOS and GROUP_LIMITS.
 */
const GROUP_INFO = {
  typing: { label: 'Typing', description: 'Letters, keyboard keys, word suggestions and Quick Words' },
  words: { label: 'Alphabet groups', description: 'Letter groups on the Zone Board' },
  communication: { label: 'Communication', description: 'Phrases, care requests, quick replies and Speak' },
  navigation: { label: 'Navigation & choices', description: 'Pages, navigation, survey answers, map cells and browsing' },
  deliberate: { label: 'Deliberate actions', description: 'Gaze on/off, Delete Word and confirmations' },
  emergency: { label: 'Urgent Needs', description: 'The Urgent Needs launcher, deliberately long' },
  video: { label: 'Video controls', description: 'The bar under a playing YouTube video' },
} as const;
export type DwellGroup = keyof typeof GROUP_INFO;

/** Each group's time as a share of the key time: the same in every set. */
export const GROUP_RATIOS: Readonly<Record<DwellGroup, number>> = {
  typing: 1, words: 0.93, communication: 1.1, navigation: 1.2, deliberate: 1.35, emergency: 1.8, video: 1.6,
};
/** [shortest, longest] after the ratio, in ms; every other group is at most 4 s. */
export const GROUP_LIMITS: Readonly<Partial<Record<DwellGroup, readonly [number, number]>>> = {
  video: [2000, 4000],
};
export const MAX_DWELL_MS = 4000;

export const DWELL_TIMING_SETS = {
  quick: {
    label: 'Quick', description: 'The shortest selections, for a practised user',
    ms: { typing: 800, words: 750, communication: 900, navigation: 950, deliberate: 1100, emergency: 1450, video: 2000 },
  },
  balanced: {
    label: 'Balanced (default)', description: 'The standard pace',
    ms: { typing: 1400, words: 1300, communication: 1550, navigation: 1700, deliberate: 1900, emergency: 2500, video: 2250 },
  },
  measured: {
    label: 'Measured', description: 'A little more time than Balanced',
    ms: { typing: 1700, words: 1600, communication: 1850, navigation: 2050, deliberate: 2300, emergency: 3050, video: 2700 },
  },
  calm: {
    label: 'Calm', description: 'A little more time than Measured',
    ms: { typing: 2000, words: 1850, communication: 2200, navigation: 2400, deliberate: 2700, emergency: 3600, video: 3200 },
  },
  relaxed: {
    label: 'Relaxed', description: 'A little more time than Calm',
    ms: { typing: 2400, words: 2250, communication: 2650, navigation: 2900, deliberate: 3250, emergency: 4000, video: 3850 },
  },
  extra_time: {
    label: 'Extra Time', description: 'The slowest pace, with the most time',
    ms: { typing: 2800, words: 2600, communication: 3100, navigation: 3350, deliberate: 3800, emergency: 4000, video: 4000 },
  },
} as const satisfies Record<string, { label: string; description: string; ms: Record<DwellGroup, number> }>;
export type DwellTimingSet = keyof typeof DWELL_TIMING_SETS;
export const DEFAULT_DWELL_TIMING_SET: DwellTimingSet = 'balanced';
/** "Keys 1.7 s · cards 2.05 s": how long the ring takes to fill, for Settings. */
export function describeTimingSet(set: DwellTimingSet): string {
  const seconds = (ms: number) => `${String(ms / 1000)} s`;
  const { typing, navigation } = DWELL_TIMING_SETS[set].ms;
  return `Keys ${seconds(typing)} · cards ${seconds(navigation)}`;
}
/** An optional keyboard-only feel. The six app-wide speed sets remain intact. */
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
/** The seven durations of the active timing set. `ms` follows setDwellTimingSet. */
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
  emergencyButton: 'emergency', quickWord: 'communication', gazeToggle: 'deliberate',
  backSkipButton: 'navigation', homeScreenTile: 'navigation', keyboardKey: 'typing',
  predictionButton: 'typing', phraseButton: 'communication', surveyOption: 'navigation', compassMapAction: 'navigation',
  quickfire: 'communication', spatialZone: 'words', settingsButton: 'navigation',
  medicalUrgent: 'communication', deliberateAction: 'deliberate',
  // A word on the Quick Words board: the key time (5 Oct 2026). `quickWord`
  // remains Speak and the Urgent Needs board.
  quickWordChoice: 'typing',
  // The bar under a playing YouTube video.
  videoControl: 'video',
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

// ============================================
// CALM FULL-SCREEN VIDEO (7 Oct 2026, maintainer request)
// ============================================
// While a YouTube video plays in full screen, no control is on screen; a plain black
// strip runs under the video (src/components/browser/calmWatch.ts). Looking at the
// strip for one of these times offers a single Show options button, which takes the
// Video controls time like the rest of the bar. This is a look, not a selection, so it
// is not one of the seven groups above and does not follow the Selection speed set.
export const VIDEO_REVEAL_HOLD_CHOICES_MS = [3000, 4000, 5000] as const;
export const DEFAULT_VIDEO_REVEAL_HOLD_MS = 4000;
export const VIDEO_REVEAL_TIMING = {
  /** A glance shorter than this shows nothing at all. */
  quietMs: 1000,
  /** Blinks and the tracker's drop-outs pause the count, never reset it. Looking down at the
   *  screen's bottom edge, a tracker often loses the eyes for up to a second (the maintainer's
   *  tracker log, 7 Oct 2026); 0.6 s threw the look away. */
  gapGraceMs: 1500,
  /** The eyes back on the video this long start the count again. */
  resetAwayMs: 700,
  /** Show options goes away if it is not chosen within this time... */
  offerTimeoutMs: 8000,
  /** ...or once the eyes have been back on the video this long. */
  offerAwayMs: 2000,
  /** The bar hides again after this long without the eyes on it (never while a video has ended
   *  or is paused). */
  controlsIdleMs: 8000,
  /** After Next, Back, Play or Skip Ad on the bar, it hides once the video (not an ad) has played
   *  this long (8 Oct 2026, maintainer request). Pause keeps it. */
  hideAfterActionMs: 1000,
  /** A video paused this long while the bar is away brings the bar back; it stays while paused. */
  pausedShowMs: 2000,
  /** The strip counts from this far above its top edge: a tracker reports a look at the
   *  screen's bottom edge a little too high (was 16 px below it, 8 Oct 2026). YouTube's
   *  captions sit 60-100 px above the strip, outside this band. */
  stripEdgePx: 32,
} as const;
export function normalizeVideoRevealHoldMs(value: unknown): number {
  const ms = typeof value === 'number' ? value : Number(value);
  return (VIDEO_REVEAL_HOLD_CHOICES_MS as readonly number[]).includes(ms) ? ms : DEFAULT_VIDEO_REVEAL_HOLD_MS;
}
