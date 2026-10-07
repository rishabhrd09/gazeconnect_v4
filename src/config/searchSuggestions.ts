/**
 * Search suggestions on the web search keyboard (7 Oct 2026, maintainer request): up to
 * three at a time, from the person's own lists (Settings > Web Search), the searches they
 * made before, and the popular searches below. Everything stays on this computer; nothing
 * typed is sent anywhere until a search is chosen.
 */

export type WebSearchTarget = 'youtube' | 'google';

/** One remembered search: what was searched, how often, and when last (epoch ms). */
export interface WebSearchHistoryEntry {
  q: string;
  n: number;
  t: number;
}

/** Saved with the rest of the profile (CustomizationData.webSearch). */
export interface WebSearchData {
  /** The person's own list for each site, in their order (Settings > Web Search). */
  personal: Record<WebSearchTarget, string[]>;
  /** Searches made from the keyboard, most recent first. */
  history: Record<WebSearchTarget, WebSearchHistoryEntry[]>;
  /** Also suggest the popular searches below. */
  showPopular: boolean;
  /** Remember searches so they can be suggested again. */
  rememberSearches: boolean;
}

export const WEB_SEARCH_TARGETS: readonly WebSearchTarget[] = ['youtube', 'google'];

/** Up to this many entries in each of the person's own lists. */
export const MAX_PERSONAL_SEARCHES = 25;
/** The most recent searches kept for each site. */
export const MAX_SEARCH_HISTORY = 50;
/** Suggestions shown at once, beside the typed text. */
export const SEARCH_SUGGESTION_SLOTS = 3;

/** The maintainer's choice of popular searches (7 Oct 2026); editable lists live in Settings. */
export const POPULAR_SEARCHES: Record<WebSearchTarget, readonly string[]> = {
  youtube: [
    'Old Hindi songs',
    'Lata Mangeshkar songs',
    'Kishore Kumar songs',
    'Mohammed Rafi songs',
    'Jagjit Singh ghazals',
    'Morning bhajan',
    'Hanuman Chalisa',
    'Hindi news live',
    'Cricket highlights',
    'Ramayan Ramanand Sagar',
  ],
  google: [
    'Latest news India',
    'World news today',
    'Weather today',
    'Live cricket score',
    'ALS latest research',
    'ALS clinical trials India',
    'Sensex Nifty today',
    'Gold rate today',
    "Today's panchang",
    'Good news today',
  ],
};

export const DEFAULT_WEB_SEARCH: WebSearchData = {
  personal: { youtube: [], google: [] },
  history: { youtube: [], google: [] },
  showPopular: true,
  rememberSearches: true,
};
