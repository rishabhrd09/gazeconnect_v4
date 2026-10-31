/**
 * Word slots and suggestion insertion contracts (pure; no React).
 *
 * Three kinds of suggestion, three different edits. Each is tested on its own in
 * scripts/check-word-prediction-slots.cjs rather than routed through one helper:
 *   - word slot:      replace ONLY the unfinished word, then one space
 *   - sentence:       complete the active sentence, keeping confirmed text;
 *                     keyword replacements require explicit review
 *   - abbreviation:   replace the typed shortcut token with its expansion
 */

export const WORD_SLOT_COUNT = 10;
export const TOP_WORD_SLOTS = 5;

export interface WordPredictionMeta {
  engine?: string;
  /** The exact draft the backend computed these slots for. */
  text: string;
  prefix: string;
  slot_count?: number;
  lineage?: boolean;
}

export type SentenceMode = 'complete_or_append' | 'append' | 'replace_token' | 'complete_sentence' | 'replace_sentence';

export interface SentenceSuggestion {
  text: string;
  score: number;
  source: string;
  mode?: SentenceMode;
  /** For replace_token: the shortcut the expansion was computed for. */
  token?: string;
  matched_text?: string;
  replacement_start?: number;
  result_text?: string;
  requires_confirmation?: boolean;
}

/** The unfinished word as the prediction engine reads it (NFKC, ’ -> ', letters and apostrophes). */
export function currentWordPrefix(text: string): string {
  const normalized = text.normalize('NFKC').replace(/’/g, "'");
  const match = normalized.match(/([A-Za-z']+)$/);
  return match ? match[1] : '';
}

function endsWithWhitespace(text: string): boolean {
  return /\s$/.test(text);
}

/** acceptPredictedWord from the reference engine: replace the unfinished word, add one space. */
export function acceptWordPrediction(text: string, word: string): string {
  const prefix = currentWordPrefix(text);
  const before = prefix ? text.slice(0, -prefix.length) : text;
  const separator = before && !endsWithWhitespace(before) ? ' ' : '';
  return `${before}${separator}${word.trim()} `;
}

/** A word may only be inserted while it still completes what is typed. */
export function wordFitsText(text: string, word: string): boolean {
  const prefix = currentWordPrefix(text).toLowerCase();
  if (!prefix) return true;
  const candidate = word.normalize('NFKC').toLowerCase().replace(/’/g, "'");
  return candidate.startsWith(prefix) || (candidate.includes("'") && candidate.replace(/'/g, '').startsWith(prefix));
}

/** Returns the new text, or null when the suggestion no longer applies to `text`. */
export function acceptSentenceSuggestion(text: string, suggestion: SentenceSuggestion, replacementReviewed = false): string | null {
  const phrase = suggestion.text.trim();
  if (!phrase) return null;
  if (suggestion.matched_text !== undefined && suggestion.matched_text !== text) return null;
  if (suggestion.requires_confirmation && !replacementReviewed) return null;
  if (suggestion.mode === 'complete_sentence' || suggestion.mode === 'replace_sentence') {
    const start = suggestion.replacement_start;
    const result = suggestion.result_text;
    if (!Number.isSafeInteger(start) || start! < 0 || start! > text.length || typeof result !== 'string'
      || suggestion.matched_text !== text || !result.startsWith(text.slice(0, start))) return null;
    if (start! > 0 && /[\uD800-\uDBFF]/.test(text[start! - 1])) return null;
    if (suggestion.mode === 'replace_sentence') {
      return replacementReviewed && suggestion.requires_confirmation === true
        && result === text.slice(0, start) + phrase + ' ' ? result : null;
    }
    const active = text.slice(start);
    const confirmed = active.replace(/[A-Za-z'’]+$/, '');
    if (!result.slice(start).startsWith(confirmed) || result.trimEnd() === text.trimEnd()) return null;
    const normalize = (value: string) => value.normalize('NFKC').replace(/’/g, "'").replace(/\s+/g, ' ').toLowerCase();
    if (!normalize(result.slice(start)).startsWith(normalize(active))) return null;
    return result;
  }
  if (suggestion.mode === 'replace_token') {
    const token = text.match(/(\S+)$/)?.[1] ?? '';
    if (!token || (suggestion.token && token.toLowerCase() !== suggestion.token.toLowerCase())) return null;
    return `${text.slice(0, text.length - token.length)}${phrase} `;
  }
  const trimmed = text.trimEnd();
  const completes = trimmed.length > 0 && phrase.toLowerCase().startsWith(trimmed.toLowerCase());
  if (completes) return `${phrase} `;
  return `${trimmed}${trimmed ? ' ' : ''}${phrase} `;
}

/**
 * Ten presentation slots. Backend `word_slots` keep their positions; a legacy
 * backend without them falls back to its ranked list. Never pads with
 * duplicates or words that do not complete the typed prefix.
 */
export function presentWordSlots(
  wordSlots: ReadonlyArray<string | null> | null | undefined,
  words: ReadonlyArray<{ word: string }>,
  text: string,
  count: number = WORD_SLOT_COUNT,
): Array<string | null> {
  const source: Array<string | null> = wordSlots && wordSlots.length
    ? [...wordSlots]
    : words.map((item) => item.word);
  const seen = new Set<string>();
  const slots: Array<string | null> = [];
  for (let index = 0; index < count; index += 1) {
    const word = source[index];
    const key = word ? word.toLowerCase() : '';
    if (!word || word.trim().includes(' ') || seen.has(key) || !wordFitsText(text, word)) {
      slots.push(null);
      continue;
    }
    seen.add(key);
    slots.push(word);
  }
  return slots;
}

/** Slots are selectable only for the draft they were computed for. */
export function predictionsAreFresh(meta: WordPredictionMeta | null | undefined, text: string): boolean {
  return !meta || meta.text === text;
}

/**
 * A phrase takes the top row's last slot from a word only at the right time (29 Oct 2026,
 * maintainer request). Measured before this rule, the default phrases filled the slot after a
 * single letter ("i" offered "I need help immediately"). The engine's best-ranked phrase decides:
 *   - it must do more than a word slot already does (phraseAddsWords): "I need Water" at
 *     "i need wa", or "Call Rishabh" at "call r", only repeats a word on screen;
 *   - it must be a confident match (phraseIsConfident).
 * Otherwise the slot stays a word: a weaker phrase further down never stands in for it, whether
 * because it is easier to match or because the best one is already a word slot ("Call Rahul" at
 * "call r"). The slot then shows the best confident phrase short enough to read there.
 * A completion is confident with PHRASE_MIN_COVERAGE of the phrase, or PHRASE_MIN_WORDS of its
 * words, typed in the current sentence; a lone keyword's replacement (always reviewed before use)
 * with the whole word, not its first letters; a caregiver's shortcut expansion always; an opening
 * offered on an empty draft never. Expand > Suggested phrases still lists every phrase offered.
 */
export const PHRASE_MIN_COVERAGE = 0.4;
export const PHRASE_MIN_WORDS = 3;

const phraseWords = (value: string): string[] => value.normalize('NFKC').replace(/’/g, "'").toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [];

/** The phrase adds a word after the one being typed (or the next one), or the one word it adds is not among `words`. */
export function phraseAddsWords(text: string, suggestion: SentenceSuggestion, words: ReadonlyArray<string | null> = []): boolean {
  if (suggestion.mode === 'replace_token') return true;
  const start = Number.isSafeInteger(suggestion.replacement_start) ? suggestion.replacement_start! : 0;
  const active = text.slice(start);
  const typed = phraseWords(active).length;
  const added = phraseWords(suggestion.text).slice(/[A-Za-z0-9'’]$/.test(active) ? Math.max(0, typed - 1) : typed);
  if (added.length !== 1) return added.length > 1;
  return !words.some(word => !!word && phraseWords(word).join(' ') === added[0]);
}

export function phraseIsConfident(text: string, suggestion: SentenceSuggestion): boolean {
  if (suggestion.mode === 'replace_token') return true;
  if (suggestion.mode === 'append' || !suggestion.text.trim()) return false;
  const start = Number.isSafeInteger(suggestion.replacement_start) ? suggestion.replacement_start! : 0;
  const typed = text.slice(start).trim();
  if (!typed) return false;
  if (suggestion.mode === 'replace_sentence') {
    // The keyword matched a whole word of the phrase, or a caregiver's keyword exactly (it then
    // begins no word of the phrase); only the first letters of a phrase word are not enough yet.
    const [keyword] = phraseWords(typed);
    const words = phraseWords(suggestion.text);
    return !!keyword && (words.includes(keyword) || !words.some(word => word.startsWith(keyword)));
  }
  const typedWords = typed.split(/\s+/).length;
  return typedWords >= PHRASE_MIN_WORDS || typed.length >= PHRASE_MIN_COVERAGE * suggestion.text.trim().length;
}

/**
 * The top row's phrase slot, given the word slots on screen: a confident phrase short enough to read
 * in the slot (`inline`), else the way to the best one (`inline: false`, the chooser); null leaves
 * the slot to a fifth word. A literal completion comes before a reviewed replacement.
 */
export function keyboardPhrase(suggestions: ReadonlyArray<SentenceSuggestion>, text: string, words: ReadonlyArray<string | null> = []):
  { suggestion: SentenceSuggestion; inline: boolean } | null {
  const usable = suggestions.filter(s => acceptSentenceSuggestion(text, s, s.requires_confirmation === true) !== null);
  const literal = usable.filter(s => !s.requires_confirmation);
  const pool = literal.length ? literal : usable;
  const timely = (s: SentenceSuggestion) => phraseAddsWords(text, s, words) && phraseIsConfident(text, s);
  if (!pool.length || !timely(pool[0])) return null;
  const short = pool.find(s => isShortSentence(s.text) && timely(s));
  return short ? { suggestion: short, inline: true } : { suggestion: pool[0], inline: false };
}

/** The phrase the slot shows in full, if any (see keyboardPhrase). */
export function inlineSentenceSuggestion(suggestions: ReadonlyArray<SentenceSuggestion>, text: string, words: ReadonlyArray<string | null> = []): SentenceSuggestion | null {
  const phrase = keyboardPhrase(suggestions, text, words);
  return phrase?.inline ? phrase.suggestion : null;
}

/**
 * The keyboard's two word rows (29 Oct 2026, maintainer request): five equal slots on top holding
 * the five top-row words, or, when a phrase is offered, four of them with the phrase on the right;
 * five words below. With a phrase, an empty top slot gives way first; otherwise the lowest-ranked of
 * the top five steps down, into an empty bottom slot or in place of the lowest-ranked bottom word,
 * so the best four stay on top and no other bottom word moves.
 */
export function arrangeWordRows(
  slots: ReadonlyArray<string | null>,
  ranked: ReadonlyArray<string>,
  phrase: boolean,
): { top: Array<string | null>; bottom: Array<string | null> } {
  const pad = (row: Array<string | null>, length: number) => { while (row.length < length) row.push(null); return row; };
  const top = pad(slots.slice(0, TOP_WORD_SLOTS), TOP_WORD_SLOTS);
  const bottom = pad(slots.slice(TOP_WORD_SLOTS, WORD_SLOT_COUNT), WORD_SLOT_COUNT - TOP_WORD_SLOTS);
  if (!phrase) return { top, bottom };
  const order = ranked.map(word => word.toLowerCase());
  const rank = (word: string | null) => {
    const index = word ? order.indexOf(word.toLowerCase()) : -1;
    return index < 0 ? order.length : index;
  };
  const lowest = (row: Array<string | null>) => row.reduce((worst, word, index) => (rank(word) >= rank(row[worst]) ? index : worst), 0);
  const empty = top.lastIndexOf(null);
  const [stepping] = top.splice(empty >= 0 ? empty : lowest(top), 1);
  if (stepping) {
    const free = bottom.indexOf(null);
    const replaced = free >= 0 ? free : lowest(bottom);
    if (free >= 0 || rank(stepping) < rank(bottom[replaced])) bottom[replaced] = stepping;
  }
  return { top, bottom };
}

/** Short phrase buttons only: long sentence suggestions were confusing on the keyboard. */
export function isShortSentence(text: string, maxWords = 6, maxChars = 42): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= maxChars && trimmed.split(/\s+/).length <= maxWords;
}
