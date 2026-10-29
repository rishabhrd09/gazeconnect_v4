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

/** Prefer a usable literal completion; keyword rewrites are reviewed separately. */
export function inlineSentenceSuggestion(suggestions: ReadonlyArray<SentenceSuggestion>, text: string): SentenceSuggestion | null {
  const eligible = suggestions.filter(s => acceptSentenceSuggestion(text, s, s.requires_confirmation === true) !== null);
  const literal = eligible.filter(s => !s.requires_confirmation);
  return (literal.length ? literal : eligible).find(s => isShortSentence(s.text)) ?? null;
}

/** Short phrase buttons only: long sentence suggestions were confusing on the keyboard. */
export function isShortSentence(text: string, maxWords = 6, maxChars = 42): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= maxChars && trimmed.split(/\s+/).length <= maxWords;
}
