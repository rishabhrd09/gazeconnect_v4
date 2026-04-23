/**
 * GazeConnect Pro - Settings Persistence Hook
 * =============================================
 * Loads settings from Electron IPC on mount, debounce-saves on change.
 * Falls back to defaults if running in browser or on load failure.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppSettings } from '../types/SettingsTypes';
import { DEFAULT_SETTINGS } from '../types/SettingsTypes';
import defaultPeople from '../data/defaultPeople.json';
import type { Person } from '../types/PeopleTypes';

const DEBOUNCE_MS = 1000;

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    ...DEFAULT_SETTINGS,
    people: defaultPeople as Person[],
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings on mount
  useEffect(() => {
    const load = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.settings?.load) {
          const saved = await api.settings.load();
          if (saved) {
            setSettings({
              ...DEFAULT_SETTINGS,
              people: defaultPeople as Person[],
              ...saved, // Saved values override defaults
            });
          }
        }
      } catch (err) {
        console.warn('Settings load failed, using defaults:', err);
      }
      setIsLoaded(true);
    };
    load();
  }, []);

  // Debounced save helper
  const debouncedSave = useCallback((newSettings: AppSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.settings?.save) {
          await api.settings.save(newSettings);
        }
      } catch (err) {
        console.warn('Settings save failed:', err);
      }
    }, DEBOUNCE_MS);
  }, []);

  // Update a single setting and trigger debounced save
  const updateSetting = useCallback(<K extends keyof AppSettings>(
    key: K, value: AppSettings[K]
  ) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  // Replace all settings at once (used for bulk updates)
  const saveSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    debouncedSave(newSettings);
  }, [debouncedSave]);

  return { settings, updateSetting, saveSettings, isLoaded };
}
