/**
 * GazeConnect Pro - Customization Context
 * ========================================
 * Provides customization data to all React components.
 * Wraps CustomizationService with React state management.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  CustomizationData, Person, PhraseCategory,
  MedicalSection, HomeQuickActions, HomeEmergencyCard,
  ActivityCategory, AACCategory, Phrase, AppSettings, QuickWordsConfig,
  AlertModeCard,
} from '../types/customization';
import { CustomizationService, customizationService } from '../services/CustomizationService';

// ============================================
// CONTEXT VALUE
// ============================================

interface CustomizationContextValue {
  // Loading state
  isLoaded: boolean;

  // Full data access
  data: CustomizationData;

  // Convenience getters
  people: Person[];
  phraseCategories: PhraseCategory[];
  medicalSections: MedicalSection[];
  homeQuickActions: HomeQuickActions;
  activityCategories: ActivityCategory[];
  aacCategories: AACCategory[];
  feelings: Phrase[];
  basicNeeds: Phrase[];
  settings: AppSettings;

  // People operations
  addPerson: (person: Person) => void;
  removePerson: (name: string) => void;
  updatePeople: (people: Person[]) => void;
  resetPeople: () => void;

  // Phrase category operations
  updatePhraseCategory: (id: string, category: PhraseCategory) => void;
  addPhraseCategory: (category: PhraseCategory) => void;
  removePhraseCategory: (id: string) => void;

  // Medical operations
  updateMedicalSection: (id: string, section: MedicalSection) => void;
  removeMedicalSection: (id: string) => void;

  // Home operations
  updateHomeQuickActions: (actions: HomeQuickActions) => void;
  updateHomeEmergencyCards: (cards: HomeEmergencyCard[]) => void;
  updateQuickWords: (quickWords: QuickWordsConfig) => void;

  // Activity operations
  updateActivityCategory: (id: string, category: ActivityCategory) => void;
  addActivityCategory: (category: ActivityCategory) => void;
  removeActivityCategory: (id: string) => void;

  // AAC operations
  updateAACCategories: (categories: AACCategory[]) => void;

  // Feelings & needs
  updateFeelings: (feelings: Phrase[]) => void;
  updateBasicNeeds: (needs: Phrase[]) => void;

  // Alert Mode Cards
  updateAlertModeCards: (cards: AlertModeCard[]) => void;

  // Settings operations
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;

  // Export/Import/Reset
  exportJSON: () => string;
  importJSON: (json: string) => void;
  resetToDefaults: () => void;

  // Service reference (for advanced use)
  service: CustomizationService;
}

const CustomizationContext = createContext<CustomizationContextValue | null>(null);

// ============================================
// HOOK
// ============================================

export function useCustomization(): CustomizationContextValue {
  const ctx = useContext(CustomizationContext);
  if (!ctx) throw new Error('useCustomization must be used within CustomizationProvider');
  return ctx;
}

// ============================================
// PROVIDER
// ============================================

export const CustomizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<CustomizationData>(customizationService.getData());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load on mount
  useEffect(() => {
    customizationService.load().then(() => {
      setData(customizationService.getData());
      setIsLoaded(true);
    });
  }, []);

  // Subscribe to service updates
  useEffect(() => {
    const unsub = customizationService.subscribe(() => {
      setData(customizationService.getData());
    });
    return unsub;
  }, []);

  // Memoized operations (delegate to service)
  const addPerson = useCallback((p: Person) => customizationService.addPerson(p), []);
  const removePerson = useCallback((name: string) => customizationService.removePerson(name), []);
  const updatePeople = useCallback((people: Person[]) => customizationService.updatePeople(people), []);
  const resetPeople = useCallback(() => customizationService.resetPeople(), []);

  const updatePhraseCategory = useCallback((id: string, cat: PhraseCategory) => customizationService.updatePhraseCategory(id, cat), []);
  const addPhraseCategory = useCallback((cat: PhraseCategory) => customizationService.addPhraseCategory(cat), []);
  const removePhraseCategory = useCallback((id: string) => customizationService.removePhraseCategory(id), []);

  const updateMedicalSection = useCallback((id: string, sec: MedicalSection) => customizationService.updateMedicalSection(id, sec), []);
  const removeMedicalSection = useCallback((id: string) => customizationService.removeMedicalSection(id), []);

  const updateHomeQuickActions = useCallback((actions: HomeQuickActions) => customizationService.updateHomeQuickActions(actions), []);
  const updateHomeEmergencyCards = useCallback((cards: HomeEmergencyCard[]) => customizationService.updateHomeEmergencyCards(cards), []);
  const updateQuickWords = useCallback((qw: QuickWordsConfig) => customizationService.updateQuickWords(qw), []);

  const updateActivityCategory = useCallback((id: string, cat: ActivityCategory) => customizationService.updateActivityCategory(id, cat), []);
  const addActivityCategory = useCallback((cat: ActivityCategory) => customizationService.addActivityCategory(cat), []);
  const removeActivityCategory = useCallback((id: string) => customizationService.removeActivityCategory(id), []);

  const updateAACCategories = useCallback((cats: AACCategory[]) => customizationService.updateAACCategories(cats), []);

  const updateFeelings = useCallback((f: Phrase[]) => customizationService.updateFeelings(f), []);
  const updateBasicNeeds = useCallback((n: Phrase[]) => customizationService.updateBasicNeeds(n), []);
  const updateAlertModeCards = useCallback((cards: AlertModeCard[]) => customizationService.updateAlertModeCards(cards), []);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    customizationService.updateSetting(key, value);
  }, []);
  const updateSettings = useCallback((partial: Partial<AppSettings>) => customizationService.updateSettings(partial), []);

  const exportJSON = useCallback(() => customizationService.exportJSON(), []);
  const importJSON = useCallback((json: string) => customizationService.importJSON(json), []);
  const resetToDefaults = useCallback(() => customizationService.resetToDefaults(), []);

  const value: CustomizationContextValue = {
    isLoaded,
    data,
    people: data.people,
    phraseCategories: data.phraseCategories,
    medicalSections: data.medicalSections,
    homeQuickActions: data.homeQuickActions,
    activityCategories: data.activityCategories,
    aacCategories: data.aacCategories,
    feelings: data.feelings,
    basicNeeds: data.basicNeeds,
    settings: data.settings,
    addPerson, removePerson, updatePeople, resetPeople,
    updatePhraseCategory, addPhraseCategory, removePhraseCategory,
    updateMedicalSection, removeMedicalSection,
    updateHomeQuickActions,
    updateHomeEmergencyCards,
    updateQuickWords,
    updateActivityCategory, addActivityCategory, removeActivityCategory,
    updateAACCategories,
    updateFeelings, updateBasicNeeds,
    updateAlertModeCards,
    updateSetting, updateSettings,
    exportJSON, importJSON, resetToDefaults,
    service: customizationService,
  };

  return (
    <CustomizationContext.Provider value={value}>
      {children}
    </CustomizationContext.Provider>
  );
};
