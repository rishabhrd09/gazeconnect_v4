/**
 * Word slots and suggestion insertion contracts (pure; no React).
 *
 * Three kinds of suggestion, three different edits. Each is tested on its own in
 * scripts/check-word-prediction-slots.cjs rather than routed through one helper:
 *   - word slot:      replace ONLY the unfinished word, then one space
 *   - sentence:       complete the typed text when the sentence starts with it,
 *                     otherwise append it after the typed text
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

export type SentenceMode = 'complete_or_append' | 'append' | 'replace_token';

export interface SentenceSuggestion {
  text: string;
  score: number;
  source: string;
  mode?: SentenceMode;
  /** For replace_token: the shortcut the expansion was computed for. */
  token?: string;
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
export function acceptSentenceSuggestion(text: string, suggestion: SentenceSuggestion): string | null {
  const phrase = suggestion.text.trim();
  if (!phrase) return null;
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

/** Short phrase buttons only: long sentence suggestions were confusing on the keyboard. */
export function isShortSentence(text: string, maxWords = 6, maxChars = 42): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= maxChars && trimmed.split(/\s+/).length <= maxWords;
}
