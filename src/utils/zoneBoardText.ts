export interface ZoneSuggestion { word: string; score: number; }

// Small, offline communication vocabulary. The backend remains the primary predictor.
const FALLBACK_WORDS = ['help', 'water', 'please', 'hungry', 'yes', 'no', 'food', 'want', 'need', 'hello', 'home', 'rest', 'thanks', 'family'];
export const ZONE_SUGGESTION_COUNT = 6;

export function currentZoneWord(text: string): string {
  return text.match(/\S+$/)?.[0] ?? '';
}

export function commitZoneSuggestion(text: string, word: string): string {
  return text.slice(0, text.length - currentZoneWord(text).length) + word.trim() + ' ';
}

export function zoneSuggestions(text: string, predictions: readonly ZoneSuggestion[]): ZoneSuggestion[] {
  const prefix = currentZoneWord(text).toLowerCase();
  const ranked = predictions.filter(item => item.word.trim() && Number.isFinite(item.score))
    .slice().sort((a, b) => b.score - a.score);
  const local = FALLBACK_WORDS.map(word => ({ word, score: 0 }));
  const matches = (item: ZoneSuggestion) => item.word.toLowerCase().startsWith(prefix);
  const ordered = prefix
    ? [...ranked.filter(matches), ...local.filter(matches), ...ranked, ...local]
    : [...ranked, ...local];
  const seen = new Set<string>();
  return ordered.filter(item => {
    const key = item.word.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, ZONE_SUGGESTION_COUNT).map(item => ({ ...item, word: item.word.trim() }));
}
