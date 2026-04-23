import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  DwellTimeSettings,
  DEFAULT_DWELL_TIMES,
  DWELL_SETTINGS_KEY,
  DWELL_PRESETS,
  DWELL_CATEGORIES,
  ALS_STAGE_PRESETS,
} from '../config/dwellTimeConfig';

export type ALSStageKey = keyof typeof ALS_STAGE_PRESETS;

interface DwellTimeContextType {
  settings: DwellTimeSettings;
  updateSettings: (partial: Partial<DwellTimeSettings>) => void;
  restoreDefaults: () => void;
  applyPreset: (preset: keyof typeof DWELL_PRESETS) => void;
  applyALSStage: (stage: ALSStageKey) => void;
  currentStage: ALSStageKey | null;
  isDefault: boolean;
}

const DwellTimeContext = createContext<DwellTimeContextType>({
  settings: DEFAULT_DWELL_TIMES,
  updateSettings: () => {},
  restoreDefaults: () => {},
  applyPreset: () => {},
  applyALSStage: () => {},
  currentStage: null,
  isDefault: true,
});

export const useDwellTime = () => useContext(DwellTimeContext);

const CATEGORY_LIMITS = new Map<keyof DwellTimeSettings, { min: number; max: number }>();
for (const c of DWELL_CATEGORIES) {
  CATEGORY_LIMITS.set(c.key, { min: c.min, max: c.max });
}

const SAFETY_MINIMUMS: Partial<Record<keyof DwellTimeSettings, number>> = {
  keyboardKey: 500,
  emergencyButton: 1200,
  quickWord: 500,
  quickfire: 500,
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

const sanitizeSettings = (candidate: Partial<DwellTimeSettings>): DwellTimeSettings => {
  const merged: DwellTimeSettings = { ...DEFAULT_DWELL_TIMES, ...candidate };
  const out: DwellTimeSettings = { ...merged };

  (Object.keys(merged) as (keyof DwellTimeSettings)[]).forEach((key) => {
    const value = merged[key];
    if (typeof value !== 'number') return;

    const limits = CATEGORY_LIMITS.get(key);
    if (!limits) return;

    const safeMin = Math.max(limits.min, SAFETY_MINIMUMS[key] ?? limits.min);
    const raw = Number(value);
    const fallback = (DEFAULT_DWELL_TIMES as any)[key] as number;
    const normalized = Number.isFinite(raw) ? raw : fallback;

    (out as any)[key] = clamp(normalized, safeMin, limits.max);
  });

  out.ringAnimationSync = Boolean(merged.ringAnimationSync);

  // v17: Preserve non-numeric settings
  out.progressStyle = merged.progressStyle === 'shrink' ? 'shrink' : 'ring';
  out.repeatDwellEnabled = Boolean(merged.repeatDwellEnabled);
  out.repeatDwellTimes = Array.isArray(merged.repeatDwellTimes) ? merged.repeatDwellTimes : DEFAULT_DWELL_TIMES.repeatDwellTimes;
  out.repeatWindowMs = Number.isFinite(merged.repeatWindowMs) ? merged.repeatWindowMs : DEFAULT_DWELL_TIMES.repeatWindowMs;

  return out;
};

const SAFE_DEFAULTS = sanitizeSettings(DEFAULT_DWELL_TIMES);

const ALS_STAGE_STORAGE_KEY = 'gazeconnect_als_stage';
const DEFAULT_ALS_STAGE: ALSStageKey = 'mid_als';

/** Compute dwell settings for a given ALS stage */
const computeStageSettings = (stageKey: ALSStageKey): DwellTimeSettings => {
  const stage = ALS_STAGE_PRESETS[stageKey];
  const newSettings = { ...DEFAULT_DWELL_TIMES };
  for (const key of Object.keys(newSettings) as (keyof DwellTimeSettings)[]) {
    const val = newSettings[key];
    if (typeof val === 'number' && key !== 'onsetDelay' && key !== 'cooldownAfterActivation') {
      (newSettings as any)[key] = Math.round((DEFAULT_DWELL_TIMES[key] as number) * stage.multiplier);
    }
  }
  newSettings.cooldownAfterActivation = Math.round(DEFAULT_DWELL_TIMES.cooldownAfterActivation * stage.cooldownMultiplier);
  newSettings.onsetDelay = stage.onsetDelay;
  return sanitizeSettings(newSettings);
};

export const DwellTimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<DwellTimeSettings>(SAFE_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [currentStage, setCurrentStage] = useState<ALSStageKey | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DWELL_SETTINGS_KEY);
      const savedStage = localStorage.getItem(ALS_STAGE_STORAGE_KEY);

      if (savedStage && savedStage in ALS_STAGE_PRESETS) {
        // User has explicitly chosen a stage — restore their settings + stage
        if (saved) {
          setSettings(sanitizeSettings(JSON.parse(saved)));
        } else {
          setSettings(computeStageSettings(savedStage as ALSStageKey));
        }
        setCurrentStage(savedStage as ALSStageKey);
      } else {
        // No stage ever chosen (first launch OR legacy user) — apply Mid ALS
        const midAlsSettings = computeStageSettings(DEFAULT_ALS_STAGE);
        setSettings(midAlsSettings);
        setCurrentStage(DEFAULT_ALS_STAGE);
        localStorage.setItem(DWELL_SETTINGS_KEY, JSON.stringify(midAlsSettings));
        localStorage.setItem(ALS_STAGE_STORAGE_KEY, DEFAULT_ALS_STAGE);
      }
    } catch (e) {
      console.warn('Failed to load dwell settings, using Mid ALS defaults:', e);
      setSettings(computeStageSettings(DEFAULT_ALS_STAGE));
      setCurrentStage(DEFAULT_ALS_STAGE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DWELL_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save dwell settings:', e);
    }
  }, [settings, loaded]);

  const updateSettings = useCallback((partial: Partial<DwellTimeSettings>) => {
    setSettings(prev => sanitizeSettings({ ...prev, ...partial }));
  }, []);

  const restoreDefaults = useCallback(() => {
    setSettings({ ...SAFE_DEFAULTS });
  }, []);

  const applyPreset = useCallback((preset: keyof typeof DWELL_PRESETS) => {
    const { multiplier } = DWELL_PRESETS[preset];
    const next = { ...SAFE_DEFAULTS } as DwellTimeSettings;

    (Object.keys(next) as (keyof DwellTimeSettings)[]).forEach((key) => {
      const val = next[key];
      if (typeof val === 'number') {
        (next as any)[key] = Math.round(val * multiplier);
      }
    });

    setSettings(sanitizeSettings(next));
  }, []);

  const applyALSStage = useCallback((stageKey: ALSStageKey) => {
    const stageSettings = computeStageSettings(stageKey);
    setSettings(stageSettings);
    setCurrentStage(stageKey);
    try {
      localStorage.setItem(DWELL_SETTINGS_KEY, JSON.stringify(stageSettings));
      localStorage.setItem(ALS_STAGE_STORAGE_KEY, stageKey);
    } catch (e) {
      console.warn('Failed to save ALS stage settings:', e);
    }
  }, []);

  const isDefault = loaded && JSON.stringify(settings) === JSON.stringify(SAFE_DEFAULTS);

  return (
    <DwellTimeContext.Provider value={{ settings, updateSettings, restoreDefaults, applyPreset, applyALSStage, currentStage, isDefault }}>
      {children}
    </DwellTimeContext.Provider>
  );
};
