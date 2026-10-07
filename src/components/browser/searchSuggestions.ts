/**
 * Search suggestions for the web search keyboard (7 Oct 2026, maintainer request). Up to
 * three, from the person's own list, the searches made before and the popular searches
 * (config/searchSuggestions.ts), matched on this computer with fixed rules -- no network,
 * no model, no randomness: the same text and lists always give the same suggestions.
 *
 * Matching, strongest first: the suggestion starts with what was typed; every typed word
 * begins one of its words, in any order ("songs lata"); the same with one letter wrong in
 * words of four or more letters ("lsta"); what was typed appears anywhere in it (three or
 * more letters). Then the person's list before past searches before popular ones, and
 * searches made often or lately first. Exactly what is typed is never suggested.
 *
 * A suggestion still shown after the next key keeps its place, so nothing moves under the
 * eyes. Kept free of React so `npm run check:search-keyboard` can test it directly.
 */
import { SEARCH_QUERY_MAX } from './searchText';
import {
  DEFAULT_WEB_SEARCH, MAX_PERSONAL_SEARCHES, MAX_SEARCH_HISTORY, POPULAR_SEARCHES, SEARCH_SUGGESTION_SLOTS,
  WEB_SEARCH_TARGETS, type WebSearchData, type WebSearchHistoryEntry, type WebSearchTarget,
} from '../../config/searchSuggestions';

export type SuggestionSource = 'personal' | 'history' | 'popular';
export interface SearchSuggestion { text: string; source: SuggestionSource }
export type SuggestionSlots = Array<SearchSuggestion | null>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The matching form: lower case, letters and digits only, single spaces ("Today's" -> "todays"). */
export function searchKey(text: unknown): string {
  let value = String(text ?? '').toLowerCase();
  // Accents off; plain ASCII, the usual case, skips that costlier step.
  if (/[^\x00-\x7f]/.test(value)) value = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return value.replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** An entry as it is kept: trimmed, single spaces, at most SEARCH_QUERY_MAX characters. */
export function cleanSearchEntry(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, SEARCH_QUERY_MAX).join('').trim();
}

const sameEntry = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A saved (or damaged, or missing) section made safe: right shapes, no repeats, within the limits. */
export function normalizeWebSearch(raw: unknown): WebSearchData {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<WebSearchData>;
  const personal = { ...DEFAULT_WEB_SEARCH.personal };
  const history = { ...DEFAULT_WEB_SEARCH.history };
  for (const target of WEB_SEARCH_TARGETS) {
    const list: string[] = [];
    const savedList = source.personal && Array.isArray(source.personal[target]) ? source.personal[target] : [];
    for (const item of savedList) {
      const text = cleanSearchEntry(item);
      if (!text || list.some(kept => sameEntry(kept, text))) continue;
      list.push(text);
      if (list.length >= MAX_PERSONAL_SEARCHES) break;
    }
    personal[target] = list;
    const entries: WebSearchHistoryEntry[] = [];
    const savedHistory = source.history && Array.isArray(source.history[target]) ? source.history[target] : [];
    for (const entry of savedHistory) {
      const q = cleanSearchEntry((entry as Partial<WebSearchHistoryEntry> | null)?.q);
      if (!q || entries.some(kept => sameEntry(kept.q, q))) continue;
      const n = Number((entry as Partial<WebSearchHistoryEntry>).n);
      const t = Number((entry as Partial<WebSearchHistoryEntry>).t);
      entries.push({
        q,
        n: Number.isFinite(n) && n >= 1 ? Math.min(9999, Math.round(n)) : 1,
        t: Number.isFinite(t) && t > 0 ? Math.round(t) : 0,
      });
      if (entries.length >= MAX_SEARCH_HISTORY) break;
    }
    history[target] = entries;
  }
  return {
    personal,
    history,
    showPopular: source.showPopular !== false,
    rememberSearches: source.rememberSearches !== false,
  };
}

/** A search was made: remembered first in its site's list (unless remembering is off). */
export function recordSearch(data: WebSearchData, target: WebSearchTarget, query: string, now: number): WebSearchData {
  if (!data.rememberSearches) return data;
  const q = cleanSearchEntry(query);
  if (!q) return data;
  const list = data.history[target] || [];
  const previous = list.find(entry => sameEntry(entry.q, q));
  const entry: WebSearchHistoryEntry = { q, n: Math.min(9999, (previous ? previous.n : 0) + 1), t: Math.round(now) };
  const next = [entry, ...list.filter(item => !sameEntry(item.q, q))].slice(0, MAX_SEARCH_HISTORY);
  return { ...data, history: { ...data.history, [target]: next } };
}

export type AddSearchError = 'empty' | 'duplicate' | 'full';

/** Add to the person's own list: refused when empty, already there, or the list is full. */
export function addPersonalSearch(
  data: WebSearchData, target: WebSearchTarget, value: string,
): { data: WebSearchData; error?: AddSearchError } {
  const text = cleanSearchEntry(value);
  if (!text) return { data, error: 'empty' };
  const list = data.personal[target] || [];
  if (list.some(item => sameEntry(item, text))) return { data, error: 'duplicate' };
  if (list.length >= MAX_PERSONAL_SEARCHES) return { data, error: 'full' };
  return { data: { ...data, personal: { ...data.personal, [target]: [...list, text] } } };
}

export function removePersonalSearch(data: WebSearchData, target: WebSearchTarget, index: number): WebSearchData {
  const list = data.personal[target] || [];
  if (index < 0 || index >= list.length) return data;
  return { ...data, personal: { ...data.personal, [target]: list.filter((_, i) => i !== index) } };
}

export function movePersonalSearch(data: WebSearchData, target: WebSearchTarget, index: number, delta: -1 | 1): WebSearchData {
  const list = [...(data.personal[target] || [])];
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return data;
  [list[index], list[to]] = [list[to], list[index]];
  return { ...data, personal: { ...data.personal, [target]: list } };
}

/** Forget the remembered searches of one site, or of both. */
export function clearSearchHistory(data: WebSearchData, target?: WebSearchTarget): WebSearchData {
  if (target) return { ...data, history: { ...data.history, [target]: [] } };
  return { ...data, history: { youtube: [], google: [] } };
}

// ---- Ranking ----------------------------------------------------------------------------

interface Candidate {
  text: string;
  key: string;
  words: string[];
  source: SuggestionSource;
  /** Times searched (from the remembered searches). */
  n: number;
  /** Last searched, epoch ms (0 = never). */
  t: number;
  /** Position in its own list. */
  order: number;
}

function candidatesFor(data: WebSearchData, target: WebSearchTarget): Candidate[] {
  const byKey = new Map<string, Candidate>();
  const history = data.history[target] || [];
  const used = new Map(history.map(entry => [searchKey(entry.q), entry] as const));
  const add = (text: string, source: SuggestionSource, order: number) => {
    const key = searchKey(text);
    const mapKey = key || `#${source}:${order}`;
    if (byKey.has(mapKey)) return;
    const seen = key ? used.get(key) : undefined;
    byKey.set(mapKey, { text, key, words: key ? key.split(' ') : [], source, n: seen ? seen.n : 0, t: seen ? seen.t : 0, order });
  };
  (data.personal[target] || []).forEach((text, i) => add(text, 'personal', i));
  history.forEach((entry, i) => add(entry.q, 'history', i));
  if (data.showPopular) POPULAR_SEARCHES[target].forEach((text, i) => add(text, 'popular', i));
  return [...byKey.values()];
}

/** a and b differ by at most one inserted, removed or changed character. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const startsWord = (token: string, word: string) => word.startsWith(token);
const startsWordWithSlip = (token: string, word: string) => startsWord(token, word) || (token.length >= 4 && (
  withinOneEdit(token, word.slice(0, token.length))
  || withinOneEdit(token, word.slice(0, token.length + 1))
  || withinOneEdit(token, word.slice(0, token.length - 1))));

/** Every typed word begins a different word of the suggestion (longest typed words placed first). */
function everyWordBegins(tokens: string[], words: string[], fits: (token: string, word: string) => boolean): boolean {
  const free = words.map(() => true);
  for (const token of [...tokens].sort((a, b) => b.length - a.length)) {
    const at = words.findIndex((word, i) => free[i] && fits(token, word));
    if (at < 0) return false;
    free[at] = false;
  }
  return true;
}

function matchLevel(typed: string, tokens: string[], c: Candidate): number {
  if (!c.key || c.key === typed) return 0;
  if (c.key.startsWith(typed)) return 4;
  if (everyWordBegins(tokens, c.words, startsWord)) return 3;
  if (everyWordBegins(tokens, c.words, startsWordWithSlip)) return 2;
  if (typed.length >= 3 && c.key.includes(typed)) return 1;
  return 0;
}

const SOURCE_BONUS: Record<SuggestionSource, number> = { personal: 30, history: 15, popular: 0 };
const SOURCE_ORDER: Record<SuggestionSource, number> = { personal: 0, history: 1, popular: 2 };

function score(level: number, c: Candidate, now: number): number {
  const recent = c.t > 0 && now - c.t >= 0 && now - c.t < 7 * DAY_MS ? 5 : 0;
  return level * 100 + SOURCE_BONUS[c.source] + Math.min(20, c.n * 4) + recent;
}

const byTie = (a: Candidate, b: Candidate) => (a.key.length - b.key.length)
  || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  || (SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]);

/** Before anything is typed: the most used of the person's list, the latest search, a popular one, in turn. */
function starters(candidates: Candidate[]): Candidate[] {
  const queues = [
    candidates.filter(c => c.source === 'personal').sort((a, b) => (b.n - a.n) || (a.order - b.order)),
    candidates.filter(c => c.source === 'history').sort((a, b) => (b.t - a.t) || (a.order - b.order)),
    candidates.filter(c => c.source === 'popular').sort((a, b) => a.order - b.order),
  ];
  const out: Candidate[] = [];
  while (out.length < candidates.length && queues.some(queue => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/** The ranked suggestions for what is typed (no slot placement). */
export function rankSearchSuggestions(typed: string, target: WebSearchTarget, data: WebSearchData, now = Date.now()): SearchSuggestion[] {
  const candidates = candidatesFor(data, target);
  const query = searchKey(typed);
  const ranked = !query
    ? starters(candidates)
    : candidates
      .map(c => ({ c, level: matchLevel(query, query.split(' '), c) }))
      .filter(item => item.level > 0)
      .sort((a, b) => (score(b.level, b.c, now) - score(a.level, a.c, now)) || byTie(a.c, b.c))
      .map(item => item.c);
  return ranked.map(c => ({ text: c.text, source: c.source }));
}

/**
 * The three places beside the typed text. A suggestion that is still among the best three
 * keeps the place it had; the others fill the free places in order; a place with nothing to
 * offer stays empty (null).
 */
export function suggestSearches(
  typed: string, target: WebSearchTarget, data: WebSearchData, previous: SuggestionSlots = [], now = Date.now(),
): SuggestionSlots {
  const best = rankSearchSuggestions(typed, target, data, now).slice(0, SEARCH_SUGGESTION_SLOTS);
  const slots: SuggestionSlots = new Array(SEARCH_SUGGESTION_SLOTS).fill(null);
  const placed = new Set<string>();
  const keyOf = (s: SearchSuggestion) => searchKey(s.text) || s.text;
  previous.slice(0, SEARCH_SUGGESTION_SLOTS).forEach((shown, i) => {
    if (!shown) return;
    const still = best.find(s => keyOf(s) === keyOf(shown));
    if (still && !placed.has(keyOf(still))) {
      slots[i] = still;
      placed.add(keyOf(still));
    }
  });
  let free = 0;
  for (const suggestion of best) {
    if (placed.has(keyOf(suggestion))) continue;
    while (free < SEARCH_SUGGESTION_SLOTS && slots[free]) free += 1;
    if (free >= SEARCH_SUGGESTION_SLOTS) break;
    slots[free] = suggestion;
    placed.add(keyOf(suggestion));
  }
  return slots;
}

/** The suggestion's words with the typed beginnings marked, for bold type. */
export function suggestionParts(text: string, typed: string): Array<{ text: string; strong: boolean }> {
  const tokens = searchKey(typed).split(' ').filter(Boolean);
  const parts: Array<{ text: string; strong: boolean }> = [];
  const push = (piece: string, strong: boolean) => {
    if (!piece) return;
    const last = parts[parts.length - 1];
    if (last && last.strong === strong) last.text += piece;
    else parts.push({ text: piece, strong });
  };
  for (const piece of text.split(/(\s+)/)) {
    if (!piece) continue;
    if (/^\s+$/.test(piece)) { push(piece, false); continue; }
    const key = searchKey(piece).replace(/ /g, '');
    const token = tokens.filter(t => key.startsWith(t)).sort((a, b) => b.length - a.length)[0];
    if (!token) { push(piece, false); continue; }
    let counted = 0;
    let cut = 0;
    for (const ch of Array.from(piece)) {
      cut += ch.length;
      if (/[a-z0-9]/i.test(ch)) {
        counted += 1;
        if (counted >= token.length) break;
      }
    }
    push(piece.slice(0, cut), true);
    push(piece.slice(cut), false);
  }
  return parts;
}
