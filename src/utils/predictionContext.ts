import type { CustomizationData, Phrase } from '../types/customization';

/**
 * The household's configured communication content, sent to the word predictor
 * as the reference engine's two personal inputs:
 *   phrases -> `phraseTexts` (every configured, enabled board phrase: which words
 *              this household uses and what follows what)
 *   words   -> caregiver `contentItems` of kind 'word' (People names and
 *              single-word Quick Words: the configured quick-access words)
 * English text only (`en`); order is the caregiver's order. Pure and
 * deterministic, so identical customization always yields identical input.
 */
export interface PredictionContextInput {
  phrases: string[];
  words: string[];
  phraseItems?: PhrasePredictionItem[];
}

export interface PhrasePredictionItem {
  text: string;
  enabled: boolean;
  keywords: string[];
  priority: number;
}

const MAX_PHRASES = 2000;
const MAX_WORDS = 200;

function clean(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function collectPredictionContext(data: CustomizationData): PredictionContextInput {
  const phrases: string[] = [];
  const words: string[] = [];
  const phraseItems = new Map<string, PhrasePredictionItem>();
  const seenPhrases = new Set<string>();
  const seenWords = new Set<string>();
  const addPhrase = (text: string | undefined | null) => {
    const value = clean(text);
    const key = value.toLowerCase();
    if (!value || seenPhrases.has(key) || phrases.length >= MAX_PHRASES) return;
    seenPhrases.add(key);
    phrases.push(value);
  };
  const addWord = (text: string | undefined | null) => {
    const value = clean(text);
    const key = value.toLowerCase();
    if (!value || /\s/.test(value) || seenWords.has(key) || words.length >= MAX_WORDS) return;
    seenWords.add(key);
    words.push(value);
  };
  const addPhrases = (items: ReadonlyArray<Phrase> | undefined, keyword?: string) => items?.forEach((item) => {
    addPhrase(item.en);
    if (!item.prediction && !keyword) return;
    const text = clean(item.en);
    if (!text || phraseItems.size >= MAX_PHRASES) return;
    const previous = phraseItems.get(text.toLowerCase());
    if (previous && !item.prediction) return;
    phraseItems.set(text.toLowerCase(), {
      text, enabled: item.prediction?.enabled !== false,
      keywords: [...new Set((Array.isArray(item.prediction?.keywords) ? item.prediction.keywords : (keyword ? [keyword] : []))
        .filter((value): value is string => typeof value === 'string').map(clean).filter(Boolean))].slice(0, 8),
      priority: Math.min(5, Math.max(0, Math.round(item.prediction?.priority || 0))),
    });
  });

  for (const person of data.people ?? []) {
    if (person.isActive === false) continue;
    addWord(person.name);
    // Full names cannot occupy a single-word slot. Offer the literal name in
    // a call phrase without changing the word engine's existing text inputs.
    const name = clean(person.name);
    if (name && /\s/.test(name) && phraseItems.size < MAX_PHRASES) {
      const text = 'Call ' + name;
      phraseItems.set(text.toLowerCase(), { text, enabled: true,
        keywords: name.split(/\s+/).filter(word => word.length >= 3).slice(0, 8), priority: 0 });
    }
    addPhrases(person.phrases);
  }
  for (const category of data.phraseCategories ?? []) addPhrases(category.phrases);
  for (const section of data.medicalSections ?? []) section.items?.forEach((item) => addPhrase(item.en));
  if (data.quickWords?.enabled !== false) {
    for (const category of data.quickWords?.categories ?? []) {
      for (const word of category.words ?? []) {
        if (!word.enabled) continue;
        addWord(word.en);
        addPhrases(word.phrases, word.en);
      }
    }
    data.quickWords?.coreWords?.forEach((word) => { if (word.enabled) addWord(word.en); });
  }
  for (const card of data.homeEmergencyCards ?? []) if (card.enabled) addPhrase(card.en);
  for (const category of data.aacCategories ?? []) addPhrases(category.items);
  addPhrases(data.feelings);
  addPhrases(data.basicNeeds);
  for (const card of data.alertModeCards ?? []) if (card.enabled) addPhrase(card.label);
  return { phrases, words, ...(phraseItems.size ? { phraseItems: [...phraseItems.values()] } : {}) };
}

/** Stable key so the renderer only resends when the configuration really changed. */
export function predictionContextKey(input: PredictionContextInput): string {
  return JSON.stringify([input.phrases, input.words, input.phraseItems ?? []]);
}
