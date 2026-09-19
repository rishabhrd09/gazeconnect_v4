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
}

const MAX_PHRASES = 2000;
const MAX_WORDS = 200;

function clean(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function collectPredictionContext(data: CustomizationData): PredictionContextInput {
  const phrases: string[] = [];
  const words: string[] = [];
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
  const addPhrases = (items: ReadonlyArray<Phrase> | undefined) => items?.forEach((item) => addPhrase(item.en));

  for (const person of data.people ?? []) {
    if (person.isActive === false) continue;
    addWord(person.name);
    addPhrases(person.phrases);
  }
  for (const category of data.phraseCategories ?? []) addPhrases(category.phrases);
  for (const section of data.medicalSections ?? []) section.items?.forEach((item) => addPhrase(item.en));
  if (data.quickWords?.enabled !== false) {
    for (const category of data.quickWords?.categories ?? []) {
      for (const word of category.words ?? []) {
        if (!word.enabled) continue;
        addWord(word.en);
        addPhrases(word.phrases);
      }
    }
    data.quickWords?.coreWords?.forEach((word) => { if (word.enabled) addWord(word.en); });
  }
  for (const card of data.homeEmergencyCards ?? []) if (card.enabled) addPhrase(card.en);
  for (const category of data.aacCategories ?? []) addPhrases(category.items);
  addPhrases(data.feelings);
  addPhrases(data.basicNeeds);
  for (const card of data.alertModeCards ?? []) if (card.enabled) addPhrase(card.label);
  return { phrases, words };
}

/** Stable key so the renderer only resends when the configuration really changed. */
export function predictionContextKey(input: PredictionContextInput): string {
  return `${input.phrases.join('')}${input.words.join('')}`;
}
