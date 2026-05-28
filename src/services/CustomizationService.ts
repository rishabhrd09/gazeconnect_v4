/**
 * GazeConnect Pro - Customization Service
 * ========================================
 * Manages all configurable data with:
 * - Load/save via Electron IPC (userData/customization.json)
 * - Debounced saves (500ms)
 * - Subscribe/notify pattern for React integration
 * - Export/import for backup
 * - Reset to defaults
 */

import type {
  CustomizationData, Person, PhraseCategory,
  MedicalSection, HomeQuickActions, HomeEmergencyCard,
  ActivityCategory, AACCategory, Phrase, AppSettings, QuickWordsConfig,
  AlertModeCard, QuickWord,
} from '../types/customization';
import { MAX_ACTIVE_PEOPLE } from '../types/customization';
import { DEFAULT_CUSTOMIZATION } from './defaultCustomization';
import {
  CARE_ACTIVITY_CATEGORIES,
  CARE_CONTENT_ARCHITECTURE_VERSION,
  CARE_MEDICAL_SECTIONS,
  CARE_PHRASE_CATEGORIES,
  CARE_QUICK_WORDS,
} from './careContentPresets';

const DEBOUNCE_MS = 500;
const LEGACY_PEOPLE_NAMES = new Set(['Mummy', 'Nilesh', 'Rahul', 'Durgesh']);

const isPersonActive = (person: Person) => person.isActive !== false;

const normalizePeople = (people: Person[]): Person[] => {
  let activeCount = 0;
  let hasActivePerson = false;

  const normalized = people.map(person => {
    const isActive = isPersonActive(person) && activeCount < MAX_ACTIVE_PEOPLE;
    if (isActive) {
      activeCount += 1;
      hasActivePerson = true;
    }
    return person.isActive === isActive ? person : { ...person, isActive };
  });

  if (!hasActivePerson && normalized.length > 0) {
    return normalized.map((person, index) => (
      index === 0 ? { ...person, isActive: true } : person
    ));
  }

  return normalized;
};
const MEDICAL_LABEL_UPDATES: Record<string, { en: string; hi: string }> = {
  'Check tube / mask position': { en: 'Check TT cuff / balloon pressure', hi: 'टीटी कफ / बैलून प्रेशर चेक करें' },
  'Wet my mouth': { en: 'Oral Care / Clean Teeth', hi: 'मुंह / दांत साफ करो' },
  'Remove Urine Pot': { en: 'Fan', hi: 'पंखा' },
  'Adjust Fan / AC': { en: 'AC', hi: 'AC' },
};
const QUICK_WORD_PHRASE_OMISSIONS: Record<string, Set<string>> = {
  medical_tt_suction: new Set(['Tube needs suction']),
  medical_breathing_ambu: new Set(['My breathing is getting worse']),
  medical_bp_pulse: new Set([
    'Please check blood pressure now',
    'Please check oxygen and pulse now',
  ]),
};
const QUICK_WORD_PHRASE_REPLACEMENTS: Record<string, Record<string, Phrase>> = {
  medical_oral_suction: {
    'Please clear my mouth now': {
      en: 'Do oral care and clean my teeth',
      hi: 'ओरल केयर करें और मेरे दांत साफ करें',
    },
  },
};
const SEVERE_PAIN_PHRASES: Phrase[] = [
  { en: 'Back pain / headache', hi: 'पीठ दर्द / सिर दर्द' },
  { en: 'Throat pain', hi: 'गले में दर्द' },
  { en: 'Pain in hands and legs', hi: 'हाथ-पैर में दर्द' },
  { en: 'Stomach pain', hi: 'पेट दर्द' },
];
const CHEST_NEBULIZATION_PHRASES: Phrase[] = [
  { en: 'I have chest discomfort', hi: 'मेरी छाती में तकलीफ है' },
  { en: 'My chest feels tight / chest congestion', hi: 'मेरी छाती भारी लग रही है / छाती में जकड़न' },
  { en: 'Give nebulization', hi: 'नेबुलाइजेशन दें' },
];
const DAILY_FAN_PHRASES: Phrase[] = [
  { en: 'Turn the fan on', hi: 'पंखा चालू करें' },
  { en: 'Turn the fan off', hi: 'पंखा बंद करें' },
  { en: 'Increase the fan', hi: 'पंखा तेज करें' },
  { en: 'Reduce the fan', hi: 'पंखा धीमा करें' },
];
const DAILY_AC_PHRASES: Phrase[] = [
  { en: 'Turn on the AC', hi: 'एसी चालू करें' },
  { en: 'Turn off the AC', hi: 'एसी बंद करें' },
  { en: 'Increase AC cooling', hi: 'एसी कूलिंग बढ़ाएं' },
  { en: 'Reduce AC cooling', hi: 'एसी कूलिंग कम करें' },
];
const DAILY_TOILET_PHRASES: Phrase[] = [
  { en: 'I need the urine pot now', hi: 'मुझे अभी यूरिन पॉट चाहिए' },
  { en: 'Remove the urine pot', hi: 'यूरिन पॉट हटा दें' },
];
const POSITION_HEAD_UP_PHRASES: Phrase[] = [
  { en: 'Raise bed angle', hi: 'बेड एंगल ऊपर करें' },
  { en: 'Raise the backrest', hi: 'बैकरेस्ट ऊपर करें' },
  { en: 'Shift me up', hi: 'मुझे ऊपर खिसकाएं' },
  { en: 'Adjust bed angle to sitting position', hi: 'बेड एंगल बैठने की स्थिति में करें' },
];
const POSITION_HEAD_DOWN_PHRASES: Phrase[] = [
  { en: 'Lower bed angle', hi: 'बेड एंगल नीचे करें' },
  { en: 'Lower the backrest', hi: 'बैकरेस्ट नीचे करें' },
  { en: 'Shift me up', hi: 'मुझे ऊपर खिसकाएं' },
  { en: 'Adjust bed angle to sitting position', hi: 'बेड एंगल बैठने की स्थिति में करें' },
];
const POSITION_WORD_UPDATES: Record<string, { en: string; hi: string; phrases: Phrase[] }> = {
  position_head_up: {
    en: 'Head Up',
    hi: 'सिर ऊपर',
    phrases: POSITION_HEAD_UP_PHRASES,
  },
  position_head_down: {
    en: 'Head Down',
    hi: 'सिर नीचे',
    phrases: POSITION_HEAD_DOWN_PHRASES,
  },
};
const DIRECT_QUICK_WORD_UPDATES: Record<string, { en: string; hi: string }> = {
  position_turn_left: { en: 'Turn Left / Left Karvat', hi: '' },
  position_turn_right: { en: 'Turn Right / Right Karvat', hi: '' },
  daily_water: { en: 'Water', hi: 'पानी' },
};

const stripPoliteness = (text: string, language: 'en' | 'hi') => {
  if (language === 'hi') {
    return text.replace(/^कृपया\s+/, '');
  }

  const withoutLeadingPlease = text.replace(/^please\s+/i, '');
  const withoutTrailingPlease = withoutLeadingPlease.replace(/\s+please$/i, '');
  if (withoutTrailingPlease === text) return text;
  return withoutTrailingPlease.charAt(0).toUpperCase() + withoutTrailingPlease.slice(1);
};

const normalizePhrasePoliteness = (phrase: Phrase): Phrase => {
  const en = stripPoliteness(phrase.en, 'en');
  const hi = stripPoliteness(phrase.hi, 'hi');
  return en === phrase.en && hi === phrase.hi ? phrase : { ...phrase, en, hi };
};

const phrasesMatch = (first: Phrase[] | undefined, second: Phrase[]) => {
  if (!first || first.length !== second.length) return false;
  return second.every((phrase, index) => first[index]?.en === phrase.en && first[index]?.hi === phrase.hi);
};

const clonePhrases = (phrases: Phrase[]) => phrases.map(phrase => ({ ...phrase }));

const relatedIdsMatch = (first: string[] | undefined, second: string[]) => {
  if (!first || first.length !== second.length) return false;
  return second.every((id, index) => first[index] === id);
};

const normalizeQuickWordRelatedIds = (word: QuickWord): QuickWord => {
  if (!word.relatedWordIds?.length) return word;

  const relatedWordIds = word.relatedWordIds
    .filter(id => word.id !== 'medical_severe_pain' || (id !== 'daily_pain' && id !== 'daily_ac'))
    .map(id => id === 'daily_pain' ? 'daily_ac' : id);
  const uniqueRelatedWordIds = Array.from(new Set(relatedWordIds));

  return relatedIdsMatch(word.relatedWordIds, uniqueRelatedWordIds)
    ? word
    : { ...word, relatedWordIds: uniqueRelatedWordIds };
};

export class CustomizationService {
  private data: CustomizationData;
  private listeners: Set<() => void> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  constructor() {
    this.data = this.applyPhraseCategoryUpdates(this.applyQuickWordPhraseUpdates(this.applyMedicalLabelUpdates(
      this.applyCareContentArchitecture(structuredClone(DEFAULT_CUSTOMIZATION), true)
    )));
    this.data = { ...this.data, people: normalizePeople(this.data.people) };
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async load(): Promise<CustomizationData> {
    try {
      const api = (window as any).electronAPI;
      if (api?.settings?.load) {
        const saved = await api.settings.load();
        if (saved) {
          // Merge saved data over defaults (preserves new fields added in updates)
          this.data = this.mergeWithDefaults(saved);
          // Force showHindi to false on startup per user request
          if (this.data.settings) {
            this.data.settings.showHindi = false;
          }
        }
      }
    } catch (err) {
      console.warn('CustomizationService: load failed, using defaults:', err);
    }
    this.loaded = true;
    this.notify();
    return this.data;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private mergeWithDefaults(saved: Partial<CustomizationData>): CustomizationData {
    const defaults = structuredClone(DEFAULT_CUSTOMIZATION);
    // Deep merge quickWords to preserve new fields (coreWords, color keys)
    const savedQW = saved.quickWords || {};
    const mergedQuickWords = {
      ...defaults.quickWords,
      ...savedQW,
      categories: (savedQW as any).categories ?? defaults.quickWords.categories,
      coreWords: (savedQW as any).coreWords ?? defaults.quickWords.coreWords,
    };

    const shouldMigratePeople =
      Array.isArray(saved.people) &&
      saved.people.length > 0 &&
      saved.people.some(person =>
        LEGACY_PEOPLE_NAMES.has(person.name)
        || ['Son', 'Daughter', 'Wife', 'Husband', 'Friend'].includes(person.role)
      );

    const merged: CustomizationData = {
      ...defaults,
      ...saved,
      // Deep merge settings to preserve new settings keys
      settings: { ...defaults.settings, ...(saved.settings || {}) },
      // Deep merge quickWords to preserve coreWords and other new fields
      quickWords: mergedQuickWords,
      // Ensure arrays default to defaults if not present in saved data
      people: normalizePeople(shouldMigratePeople ? defaults.people : (saved.people ?? defaults.people)),
      phraseCategories: saved.phraseCategories ?? defaults.phraseCategories,
      medicalSections: saved.medicalSections ?? defaults.medicalSections,
      homeQuickActions: saved.homeQuickActions ?? defaults.homeQuickActions,
      homeEmergencyCards: saved.homeEmergencyCards ?? defaults.homeEmergencyCards,
      activityCategories: saved.activityCategories ?? defaults.activityCategories,
      aacCategories: saved.aacCategories ?? defaults.aacCategories,
      feelings: saved.feelings ?? defaults.feelings,
      basicNeeds: saved.basicNeeds ?? defaults.basicNeeds,
      alertModeCards: saved.alertModeCards ?? defaults.alertModeCards,
      version: saved.version ?? defaults.version,
    };

    return this.applyPhraseCategoryUpdates(this.applyQuickWordPhraseUpdates(this.applyMedicalLabelUpdates(
      this.applyCareContentArchitecture(merged, (saved.version ?? 1) < CARE_CONTENT_ARCHITECTURE_VERSION)
    )));
  }

  private applyMedicalLabelUpdates(data: CustomizationData): CustomizationData {
    let didUpdate = false;

    const medicalSections = data.medicalSections.map(section => {
      let sectionUpdated = false;
      const items = section.items.map(item => {
        const update = MEDICAL_LABEL_UPDATES[item.en];
        if (!update) return item;

        didUpdate = true;
        sectionUpdated = true;
        return { ...item, ...update };
      });

      return sectionUpdated ? { ...section, items } : section;
    });

    return didUpdate ? { ...data, medicalSections } : data;
  }

  private applyPhraseCategoryUpdates(data: CustomizationData): CustomizationData {
    const phraseCategories = data.phraseCategories.map(category => {
      let categoryUpdated = false;
      const phrases = category.phrases.map(phrase => {
        const normalized = normalizePhrasePoliteness(phrase);
        if (normalized !== phrase) categoryUpdated = true;
        return normalized;
      });

      return categoryUpdated ? { ...category, phrases } : category;
    });

    const didUpdate = phraseCategories.some((category, index) => category !== data.phraseCategories[index]);
    return didUpdate ? { ...data, phraseCategories } : data;
  }

  private applyQuickWordPhraseUpdates(data: CustomizationData): CustomizationData {
    const categories = data.quickWords.categories.map(category => {
      let categoryUpdated = false;
      const words = category.words.map(word => {
        if (word.id === 'daily_fan_ac') {
          const relatedWordIds = ['daily_ac', 'daily_blanket', 'daily_water'];
          const didChange = word.en !== 'Fan'
            || word.hi !== 'पंखा'
            || !phrasesMatch(word.phrases, DAILY_FAN_PHRASES)
            || !relatedIdsMatch(word.relatedWordIds, relatedWordIds);

          if (!didChange) return word;

          categoryUpdated = true;
          return {
            ...word,
            en: 'Fan',
            hi: 'पंखा',
            relatedWordIds,
            phrases: clonePhrases(DAILY_FAN_PHRASES),
          };
        }

        if (word.id === 'daily_pain' || word.id === 'daily_ac') {
          const relatedWordIds = ['daily_fan_ac', 'daily_blanket', 'daily_water'];
          const didChange = word.id !== 'daily_ac'
            || word.en !== 'AC'
            || word.hi !== 'एसी'
            || !phrasesMatch(word.phrases, DAILY_AC_PHRASES)
            || !relatedIdsMatch(word.relatedWordIds, relatedWordIds);

          if (!didChange) return word;

          categoryUpdated = true;
          return {
            ...word,
            id: 'daily_ac',
            en: 'AC',
            hi: 'एसी',
            relatedWordIds,
            phrases: clonePhrases(DAILY_AC_PHRASES),
          };
        }

        if (word.id === 'daily_toilet') {
          const relatedWordIds = ['daily_ac', 'daily_water', 'daily_blanket'];
          const didChange = !phrasesMatch(word.phrases, DAILY_TOILET_PHRASES)
            || !relatedIdsMatch(word.relatedWordIds, relatedWordIds);

          if (!didChange) return word;

          categoryUpdated = true;
          return {
            ...word,
            relatedWordIds,
            phrases: clonePhrases(DAILY_TOILET_PHRASES),
          };
        }

        const positionUpdate = word.id ? POSITION_WORD_UPDATES[word.id] : undefined;
        if (positionUpdate) {
          const didChange = word.en !== positionUpdate.en
            || word.hi !== positionUpdate.hi
            || !phrasesMatch(word.phrases, positionUpdate.phrases);

          if (!didChange) return word;

          categoryUpdated = true;
          return {
            ...word,
            en: positionUpdate.en,
            hi: positionUpdate.hi,
            phrases: clonePhrases(positionUpdate.phrases),
          };
        }

        const directUpdate = word.id ? DIRECT_QUICK_WORD_UPDATES[word.id] : undefined;
        if (directUpdate) {
          const didChange = word.en !== directUpdate.en
            || word.hi !== directUpdate.hi
            || Boolean(word.phrases?.length);

          if (!didChange) return word;

          categoryUpdated = true;
          const { phrases: _phrases, ...wordWithoutPhrases } = word;
          return { ...wordWithoutPhrases, ...directUpdate };
        }

        if (word.id === 'medical_severe_pain') {
          const normalizedWord = normalizeQuickWordRelatedIds(word);
          if (phrasesMatch(normalizedWord.phrases, SEVERE_PAIN_PHRASES) && normalizedWord === word) return word;

          categoryUpdated = true;
          return { ...normalizedWord, phrases: clonePhrases(SEVERE_PAIN_PHRASES) };
        }

        if (word.id === 'medical_chest_nebulization') {
          if (phrasesMatch(word.phrases, CHEST_NEBULIZATION_PHRASES)) return word;

          categoryUpdated = true;
          return { ...word, phrases: clonePhrases(CHEST_NEBULIZATION_PHRASES) };
        }

        const omissions = word.id ? QUICK_WORD_PHRASE_OMISSIONS[word.id] : undefined;
        const replacements = word.id ? QUICK_WORD_PHRASE_REPLACEMENTS[word.id] : undefined;
        const normalizedWord = normalizeQuickWordRelatedIds(word);
        const wordPhrases = normalizedWord.phrases;
        if (!wordPhrases?.length) {
          if (normalizedWord !== word) categoryUpdated = true;
          return normalizedWord;
        }

        const phrases = wordPhrases
          .filter(phrase => !omissions?.has(phrase.en))
          .map(phrase => normalizePhrasePoliteness(replacements?.[phrase.en] ?? phrase));
        const didChangePhrases = phrases.length !== wordPhrases.length
          || phrases.some((phrase, index) => phrase !== wordPhrases[index]);
        if (!didChangePhrases && normalizedWord === word) return word;

        categoryUpdated = true;
        return { ...normalizedWord, phrases };
      });

      return categoryUpdated ? { ...category, words } : category;
    });

    const didUpdate = categories.some((category, index) => category !== data.quickWords.categories[index]);
    return didUpdate ? { ...data, quickWords: { ...data.quickWords, categories } } : data;
  }

  private applyCareContentArchitecture(data: CustomizationData, force: boolean): CustomizationData {
    if (!force && (data.version ?? 1) >= CARE_CONTENT_ARCHITECTURE_VERSION) {
      return data;
    }

    return {
      ...data,
      phraseCategories: structuredClone(CARE_PHRASE_CATEGORIES),
      medicalSections: structuredClone(CARE_MEDICAL_SECTIONS),
      quickWords: structuredClone(CARE_QUICK_WORDS),
      activityCategories: structuredClone(CARE_ACTIVITY_CATEGORIES),
      version: Math.max(data.version ?? 1, CARE_CONTENT_ARCHITECTURE_VERSION),
    };
  }

  // ============================================
  // SAVE (debounced)
  // ============================================

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), DEBOUNCE_MS);
  }

  async save(): Promise<void> {
    try {
      const api = (window as any).electronAPI;
      if (api?.settings?.save) {
        await api.settings.save(this.data);
      }
    } catch (err) {
      console.warn('CustomizationService: save failed:', err);
    }
  }

  // ============================================
  // SUBSCRIBE (for React context)
  // ============================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  // ============================================
  // GETTERS
  // ============================================

  getData(): CustomizationData {
    return this.data;
  }

  getPeople(): Person[] {
    return this.data.people;
  }

  getPhraseCategories(): PhraseCategory[] {
    return this.data.phraseCategories;
  }

  getMedicalSections(): MedicalSection[] {
    return this.data.medicalSections;
  }

  getHomeQuickActions(): HomeQuickActions {
    return this.data.homeQuickActions;
  }

  getActivityCategories(): ActivityCategory[] {
    return this.data.activityCategories;
  }

  getAACCategories(): AACCategory[] {
    return this.data.aacCategories;
  }

  getFeelings(): Phrase[] {
    return this.data.feelings;
  }

  getBasicNeeds(): Phrase[] {
    return this.data.basicNeeds;
  }

  getSettings(): AppSettings {
    return this.data.settings;
  }

  // ============================================
  // SETTERS (mutate + save + notify)
  // ============================================

  // --- People ---
  // NOTE: Every setter creates a NEW this.data object reference.
  // This is critical for React re-renders — useState skips updates
  // when the reference is identical (Object.is comparison).

  updatePeople(people: Person[]): void {
    this.data = { ...this.data, people: normalizePeople(people) };
    this.scheduleSave();
    this.notify();
  }

  addPerson(person: Person): void {
    const people = normalizePeople(this.data.people);
    const activeCount = people.filter(isPersonActive).length;
    const nextPerson = {
      ...person,
      isActive: person.isActive ?? activeCount < MAX_ACTIVE_PEOPLE,
    };
    this.data = { ...this.data, people: normalizePeople([...people, nextPerson]) };
    this.scheduleSave();
    this.notify();
  }

  removePerson(name: string): void {
    this.data = { ...this.data, people: normalizePeople(this.data.people.filter(p => p.name !== name)) };
    this.scheduleSave();
    this.notify();
  }

  // --- Phrase Categories ---
  updatePhraseCategory(categoryId: string, category: PhraseCategory): void {
    this.data = {
      ...this.data,
      phraseCategories: this.data.phraseCategories.map(c => c.id === categoryId ? category : c),
    };
    this.scheduleSave();
    this.notify();
  }

  addPhraseCategory(category: PhraseCategory): void {
    this.data = { ...this.data, phraseCategories: [...this.data.phraseCategories, category] };
    this.scheduleSave();
    this.notify();
  }

  removePhraseCategory(categoryId: string): void {
    this.data = { ...this.data, phraseCategories: this.data.phraseCategories.filter(c => c.id !== categoryId) };
    this.scheduleSave();
    this.notify();
  }

  // --- Medical Sections ---
  updateMedicalSection(sectionId: string, section: MedicalSection): void {
    const exists = this.data.medicalSections.some(s => s.id === sectionId);
    this.data = {
      ...this.data,
      medicalSections: exists
        ? this.data.medicalSections.map(s => s.id === sectionId ? section : s)
        : [...this.data.medicalSections, section],
    };
    this.scheduleSave();
    this.notify();
  }

  removeMedicalSection(sectionId: string): void {
    this.data = {
      ...this.data,
      medicalSections: this.data.medicalSections.filter(s => s.id !== sectionId),
    };
    this.scheduleSave();
    this.notify();
  }

  // --- Home Quick Actions ---
  updateHomeQuickActions(actions: HomeQuickActions): void {
    this.data = { ...this.data, homeQuickActions: actions };
    this.scheduleSave();
    this.notify();
  }

  // --- Home Emergency Cards ---
  updateHomeEmergencyCards(cards: HomeEmergencyCard[]): void {
    this.data = { ...this.data, homeEmergencyCards: cards };
    this.scheduleSave();
    this.notify();
  }

  // --- Quick Words ---
  updateQuickWords(quickWords: QuickWordsConfig): void {
    this.data = { ...this.data, quickWords };
    this.scheduleSave();
    this.notify();
  }

  // --- Activities ---
  updateActivityCategory(categoryId: string, category: ActivityCategory): void {
    this.data = {
      ...this.data,
      activityCategories: this.data.activityCategories.map(c => c.id === categoryId ? category : c),
    };
    this.scheduleSave();
    this.notify();
  }

  addActivityCategory(category: ActivityCategory): void {
    this.data = { ...this.data, activityCategories: [...this.data.activityCategories, category] };
    this.scheduleSave();
    this.notify();
  }

  removeActivityCategory(categoryId: string): void {
    this.data = { ...this.data, activityCategories: this.data.activityCategories.filter(c => c.id !== categoryId) };
    this.scheduleSave();
    this.notify();
  }

  // --- AAC Categories ---
  updateAACCategories(categories: AACCategory[]): void {
    this.data = { ...this.data, aacCategories: categories };
    this.scheduleSave();
    this.notify();
  }

  // --- Feelings ---
  updateFeelings(feelings: Phrase[]): void {
    this.data = { ...this.data, feelings };
    this.scheduleSave();
    this.notify();
  }

  // --- Basic Needs ---
  updateBasicNeeds(needs: Phrase[]): void {
    this.data = { ...this.data, basicNeeds: needs };
    this.scheduleSave();
    this.notify();
  }

  // --- Alert Mode Cards ---
  updateAlertModeCards(cards: AlertModeCard[]): void {
    this.data = { ...this.data, alertModeCards: cards };
    this.scheduleSave();
    this.notify();
  }
  // --- Settings ---
  updateSettings(partial: Partial<AppSettings>): void {
    this.data = { ...this.data, settings: { ...this.data.settings, ...partial } };
    this.scheduleSave();
    this.notify();
  }

  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.data = { ...this.data, settings: { ...this.data.settings, [key]: value } };
    this.scheduleSave();
    this.notify();
  }

  // ============================================
  // EXPORT / IMPORT / RESET
  // ============================================

  exportJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importJSON(json: string): void {
    try {
      const parsed = JSON.parse(json) as Partial<CustomizationData>;
      this.data = this.mergeWithDefaults(parsed);
      this.scheduleSave();
      this.notify();
    } catch (err) {
      console.error('CustomizationService: importJSON failed:', err);
      throw new Error('Invalid JSON format');
    }
  }

  resetToDefaults(): void {
    this.data = this.applyCareContentArchitecture(structuredClone(DEFAULT_CUSTOMIZATION), true);
    this.data = { ...this.data, people: normalizePeople(this.data.people) };
    this.scheduleSave();
    this.notify();
  }

  resetPeople(): void {
    this.data = { ...this.data, people: normalizePeople(structuredClone(DEFAULT_CUSTOMIZATION.people)) };
    this.scheduleSave();
    this.notify();
  }
}

// Singleton instance
export const customizationService = new CustomizationService();
