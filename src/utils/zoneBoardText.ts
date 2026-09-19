import { acceptWordPrediction, currentWordPrefix } from './wordPredictionSlots';

export interface ZoneSuggestion { word: string; score: number; }

// Small, offline communication vocabulary. The backend remains the primary predictor.
const FALLBACK_WORDS = ['help', 'water', 'please', 'hungry', 'yes', 'no', 'food', 'want', 'need', 'hello', 'home', 'rest', 'thanks', 'family'];
export const ZONE_SUGGESTION_COUNT = 6;

export function currentZoneWord(text: string): string {
  return text.match(/\S+$/)?.[0] ?? '';
}

/** Replace only the unfinished word (punctuation is a word boundary), then one space. */
export function commitZoneSuggestion(text: string, word: string): string {
  return acceptWordPrediction(text, word);
}

/**
 * Up to six suggestions, in the backend's order. The order is NOT re-sorted by
 * score: the deterministic engine's final order (diversity, fusion, habit slot)
 * is deliberately not score-monotonic. Local fallback words only fill the board
 * when they complete the typed prefix; a shorter board is better than a wrong
 * word.
 */
export function zoneSuggestions(text: string, predictions: readonly ZoneSuggestion[]): ZoneSuggestion[] {
  const prefix = currentWordPrefix(text).toLowerCase();
  const fits = (item: ZoneSuggestion) => !prefix || item.word.trim().toLowerCase().startsWith(prefix) ||
    item.word.trim().toLowerCase().replace(/'/g, '').startsWith(prefix);
  // The deterministic backend sends single words only; the legacy rollback may
  // still send empty-draft starters such as "I need", which remain valid here.
  const ranked = predictions.filter(item => item.word.trim() && Number.isFinite(item.score));
  const local = FALLBACK_WORDS.map(word => ({ word, score: 0 }));
  const seen = new Set<string>();
  return [...ranked, ...local].filter(item => {
    const key = item.word.trim().toLowerCase();
    if (!fits(item) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, ZONE_SUGGESTION_COUNT).map(item => ({ ...item, word: item.word.trim() }));
}
