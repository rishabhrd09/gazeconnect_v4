/** Selection durations shared by every gaze surface.
 *
 * Eight action groups, and ten complete timing sets that fix all eight at
 * once. There are no per-button sliders or repeat acceleration: a person
 * chooses one named set. Onset, cooldown and tracking stability are separate
 * internal safeguards.
 *
 * 8 Oct 2026, first (maintainer: every set felt slow, even Balanced; the
 * keyboard felt right, cards and the other screens slow): Quick, Brisk and
 * Balanced with keys at 0.6, 0.75 and 1.0 s, cards at 0.7, 0.85 and 1.15 s.
 * For scale: fixed eye-typing dwell is usually 450-1000 ms (Mott et al., CHI
 * 2017; Spakov & Miniotas 2004), 1000 ms is GazeTalk's suggested start, and
 * practised users reach 300-500 ms (Majaranta et al., CHI 2009).
 * 8 Oct 2026, second and third (maintainer: those were too fast for Papa, who
 * managed only Relaxed, and with practice; then a mode between each of the
 * slower ones): ten sets, fastest first, keys at 0.6 (Quick), 0.75 (Brisk),
 * 1.0 (Balanced), 1.3 (Moderate), 1.7 (Calm, the earlier Relaxed), 1.85
 * (Restful), 2.0 (Relaxed), 2.2 (Leisurely), 2.4 (Unhurried) and 2.8 s (Extra
 * Time; Unhurried and Extra Time have the key times Relaxed and Extra Time had
 * on 5 Oct). From Calm on a step is about 1.1x, near a just-noticeable
 * difference, so a person can settle on a pace exactly. A profile saved on
 * Measured (5 Oct: keys 1.7 s) selects Calm, which has them.
 * - One rule for every set: a group takes the key time times its entry in
 *   GROUP_RATIOS, to the nearest 50 ms, within GROUP_LIMITS; no selection takes
 *   longer than 4 s. Keys stay the quickest; cards and pages take 1.15x,
 *   communication 1.05x and deliberate actions 1.3x: about one just-noticeable
 *   step above the keys.
 * - Keys, the Quick Words board's words and Shift share the key time. Word
 *   suggestions and the phrase cell take a little longer (1.1x, second request
 *   of 8 Oct): choosing one puts a whole word in the message.
 * - Video controls: the bar under a playing YouTube video takes 1.6x the key
 *   time (third request of 8 Oct: clearly more than anything else but Urgent
 *   Needs), from 1 s up to 3.9 s, so a passing look while watching (or reading
 *   the subtitles just above the bar) chooses nothing.
 * - Urgent Needs stays deliberately the longest: twice the key time, never
 *   under the 1.45 s it always had in Quick (Balanced 2.5 -> 2.0 s). It answers
 *   even with gaze off, so a resting look must not set it off.
 * check:dwell-groups recomputes every set from GROUP_RATIOS and GROUP_LIMITS.
 */
const GROUP_INFO = {
  typing: { label: 'Typing', description: 'Letters, keyboard keys and Quick Words' },
  words: { label: 'Alphabet groups', description: 'Letter groups on the Zone Board' },
  communication: { label: 'Communication', description: 'Phrases, care requests, quick replies and Speak' },
  navigation: { label: 'Navigation & choices', description: 'Pages, navigation, survey answers, map cells and browsing' },
  deliberate: { label: 'Deliberate actions', description: 'Gaze on/off, Delete Word and confirmations' },
  emergency: { label: 'Urgent Needs', description: 'The Urgent Needs launcher, deliberately long' },
  video: { label: 'Video controls', description: 'The bar under a playing YouTube video' },
  suggestions: { label: 'Word suggestions', description: 'Word suggestions and the phrase cell on the keyboard' },
} as const;
export type DwellGroup = keyof typeof GROUP_INFO;

/** Each group's time as a share of the key time: the same in every set. */
export const GROUP_RATIOS: Readonly<Record<DwellGroup, number>> = {
  typing: 1, words: 0.93, communication: 1.05, navigation: 1.15, deliberate: 1.3, emergency: 2, video: 1.6, suggestions: 1.1,
};
/** [shortest, longest] after the ratio, in ms; every other group is at most 4 s. */
export const GROUP_LIMITS: Readonly<Partial<Record<DwellGroup, readonly [number, number]>>> = {
  emergency: [1450, 4000],
  // Under Urgent Needs' 4 s, so that it stays the longest selection in every set.
  video: [1000, 3900],
};
export const MAX_DWELL_MS = 4000;

export const DWELL_TIMING_SETS = {
  quick: {
    label: 'Quick', description: 'The fastest selections, for a practised user',
    ms: { typing: 600, words: 550, communication: 650, navigation: 700, deliberate: 800, emergency: 1450, video: 1000, suggestions: 650 },
  },
  brisk: {
    label: 'Brisk', description: 'A little faster than Balanced',
    ms: { typing: 750, words: 700, communication: 800, navigation: 850, deliberate: 1000, emergency: 1500, video: 1200, suggestions: 850 },
  },
  balanced: {
    label: 'Balanced', description: 'The standard pace',
    ms: { typing: 1000, words: 950, communication: 1050, navigation: 1150, deliberate: 1300, emergency: 2000, video: 1600, suggestions: 1100 },
  },
  moderate: {
    label: 'Moderate', description: 'A little more time than Balanced',
    ms: { typing: 1300, words: 1200, communication: 1350, navigation: 1500, deliberate: 1700, emergency: 2600, video: 2100, suggestions: 1450 },
  },
  calm: {
    label: 'Calm', description: 'A little more time than Moderate',
    ms: { typing: 1700, words: 1600, communication: 1800, navigation: 1950, deliberate: 2200, emergency: 3400, video: 2700, suggestions: 1850 },
  },
  restful: {
    label: 'Restful', description: 'A little more time than Calm',
    ms: { typing: 1850, words: 1700, communication: 1950, navigation: 2150, deliberate: 2400, emergency: 3700, video: 2950, suggestions: 2050 },
  },
  relaxed: {
    label: 'Relaxed', description: 'A little more time than Restful',
    ms: { typing: 2000, words: 1850, communication: 2100, navigation: 2300, deliberate: 2600, emergency: 4000, video: 3200, suggestions: 2200 },
  },
  leisurely: {
    label: 'Leisurely', description: 'A little more time than Relaxed',
    ms: { typing: 2200, words: 2050, communication: 2300, navigation: 2550, deliberate: 2850, emergency: 4000, video: 3500, suggestions: 2400 },
  },
  unhurried: {
    label: 'Unhurried', description: 'A little more time than Leisurely',
    ms: { typing: 2400, words: 2250, communication: 2500, navigation: 2750, deliberate: 3100, emergency: 4000, video: 3850, suggestions: 2650 },
  },
  extra_time: {
    label: 'Extra Time', description: 'The slowest pace, with the most time',
    ms: { typing: 2800, words: 2600, communication: 2950, navigation: 3200, deliberate: 3650, emergency: 4000, video: 3900, suggestions: 3100 },
  },
} as const satisfies Record<string, { label: string; description: string; ms: Record<DwellGroup, number> }>;
export type DwellTimingSet = keyof typeof DWELL_TIMING_SETS;
export const DEFAULT_DWELL_TIMING_SET: DwellTimingSet = 'balanced';
/** A set retired on 8 Oct 2026, and the set a profile saved on it now selects (the same key time). */
const RETIRED_TIMING_SETS: Readonly<Record<string, DwellTimingSet>> = { measured: 'calm' };
/** "Keys 1 s · cards 1.15 s": how long the ring takes to fill, for Settings. */
export function describeTimingSet(set: DwellTimingSet): string {
  const seconds = (ms: number) => `${String(ms / 1000)} s`;
  const { typing, navigation } = DWELL_TIMING_SETS[set].ms;
  return `Keys ${seconds(typing)} · cards ${seconds(navigation)}`;
}
/** An optional keyboard-only feel. The five app-wide speed sets remain intact. */
export type KeyboardFeel = 'standard' | 'familiar';
export const DEFAULT_KEYBOARD_FEEL: KeyboardFeel = 'standard';
/** Familiar keyboard: a slightly longer settle before each key's ring (Standard: the stage's
 *  keyboard onset, 150 ms) and partial progress kept 750 ms. Since 8 Oct 2026 its keys,
 *  suggestions and Shift fill in the selected speed's key time, like Standard's: they had filled
 *  in a fixed 1.75 s (Shift 1.5 s) after a 350 ms settle whatever the speed, so with Familiar
 *  the keyboard ignored Selection speed and was the slowest screen (maintainer report). */
export const FAMILIAR_KEYBOARD_TIMING = {
  onset: 250,
  incompleteTtl: 750,
} as const;
/** What a Familiar key or Shift fills in (the selected speed's key time), or a suggestion
 *  (its suggestion time). */
export function familiarKeyboardFillMs(kind: 'key' | 'modifier' | 'suggestion' = 'key'): number {
  return kind === 'suggestion' ? DWELL_GROUPS.suggestions.ms : DWELL_GROUPS.typing.ms;
}
/** After a key, how long before a DIFFERENT key may begin (8 Oct 2026): 0.4 of the key time,
 *  to 50 ms, from 250 ms up to the stage's keyboard cooldown. Typing then speeds up with the
 *  selected speed instead of waiting a fixed 0.7 s after every letter (at Quick that wait was
 *  longer than the key itself). The same key keeps the stage's full cooldown, so a look that
 *  stays on it repeats it no sooner than before. */
export function keyboardNextKeyWaitMs(typingMs: number, stageCooldownMs: number): number {
  const wait = Math.round((typingMs * 0.4) / 50) * 50;
  return Math.min(stageCooldownMs, Math.max(250, wait));
}
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
  if (typeof value !== 'string') return DEFAULT_DWELL_TIMING_SET;
  if (Object.prototype.hasOwnProperty.call(DWELL_TIMING_SETS, value)) return value as DwellTimingSet;
  return Object.prototype.hasOwnProperty.call(RETIRED_TIMING_SETS, value) ? RETIRED_TIMING_SETS[value] : DEFAULT_DWELL_TIMING_SET;
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
  predictionButton: 'suggestions', phraseButton: 'communication', surveyOption: 'navigation', compassMapAction: 'navigation',
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
