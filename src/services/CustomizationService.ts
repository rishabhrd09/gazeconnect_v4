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
  AlertModeCard,
} from '../types/customization';
import { DEFAULT_CUSTOMIZATION } from './defaultCustomization';

const DEBOUNCE_MS = 500;

export class CustomizationService {
  private data: CustomizationData;
  private listeners: Set<() => void> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  constructor() {
    this.data = structuredClone(DEFAULT_CUSTOMIZATION);
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

    return {
      ...defaults,
      ...saved,
      // Deep merge settings to preserve new settings keys
      settings: { ...defaults.settings, ...(saved.settings || {}) },
      // Deep merge quickWords to preserve coreWords and other new fields
      quickWords: mergedQuickWords,
      // Ensure arrays default to defaults if not present in saved data
      people: saved.people ?? defaults.people,
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
    this.data = { ...this.data, people };
    this.scheduleSave();
    this.notify();
  }

  addPerson(person: Person): void {
    this.data = { ...this.data, people: [...this.data.people, person] };
    this.scheduleSave();
    this.notify();
  }

  removePerson(name: string): void {
    this.data = { ...this.data, people: this.data.people.filter(p => p.name !== name) };
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
    this.data = {
      ...this.data,
      medicalSections: this.data.medicalSections.map(s => s.id === sectionId ? section : s),
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
    this.data = structuredClone(DEFAULT_CUSTOMIZATION);
    this.scheduleSave();
    this.notify();
  }

  resetPeople(): void {
    this.data = { ...this.data, people: structuredClone(DEFAULT_CUSTOMIZATION.people) };
    this.scheduleSave();
    this.notify();
  }
}

// Singleton instance
export const customizationService = new CustomizationService();
