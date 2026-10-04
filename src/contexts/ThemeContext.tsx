/** The three supported appearances. Legacy preferences migrate without losing settings. */
import React, { createContext, useContext, useState, useCallback, useLayoutEffect, type ReactNode } from 'react';
import { useCustomization } from './CustomizationContext';
import { darkColors, midnightNavyColors } from '../utils/design';
import { normalizeDesignMode } from '../config/designMode';

export type Theme = 'dark' | 'warm' | 'midnight-navy';
/** Saved 'warm' and the retired 'light' are Warm; 'midnight-navy' stays itself; anything else
 *  (the retired 'mix', a damaged value, nothing saved) is Dark. index.html repeats this rule
 *  before the first paint, and npm run check:look holds the two together. */
export function normalizeTheme(value: string | null): Theme {
  if (value === 'warm' || value === 'light') return 'warm';
  return value === 'midnight-navy' ? 'midnight-navy' : 'dark';
}
/** Dark and Midnight Navy are both dark appearances. Older components only know
 *  settings.isDarkMode, which must stay true for either or they paint light (Warm) colours. */
export function isDarkTheme(theme: Theme): boolean {
  return theme !== 'warm';
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isWarm: boolean;
  /** Midnight Navy: a dark appearance with its own paint (src/styles/midnight-navy.css). */
  isMidnightNavy: boolean;
  // Compatibility for screen-specific legacy paint; these modes cannot be selected.
  isLight: false;
  isMix: false;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark', setTheme: () => {}, isWarm: false, isMidnightNavy: false, isLight: false, isMix: false,
});

function applyTheme(theme: Theme, persist = true) {
  for (const element of [document.documentElement, document.body]) {
    element.dataset.theme = theme;
    element.classList.remove('theme-light', 'theme-mix');
    element.classList.toggle('theme-dark', theme === 'dark');
    element.classList.toggle('theme-warm', theme === 'warm');
    element.classList.toggle('theme-midnight-navy', theme === 'midnight-navy');
  }
  try { if (persist) localStorage.setItem('gc-theme', theme); } catch { /* Appearance still works when storage is unavailable. */ }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isLoaded, settings, updateSetting } = useCustomization();
  const [preference, setPreference] = useState<Theme | null>(() => {
    try {
      const saved = localStorage.getItem('gc-theme');
      return saved ? normalizeTheme(saved) : null;
    } catch { return null; }
  });
  const theme = preference ?? (settings.isDarkMode ? 'dark' : 'warm');
  const designMode = normalizeDesignMode(settings.designMode);

  useLayoutEffect(() => {
    document.documentElement.dataset.design = designMode;
  }, [designMode]);

  useLayoutEffect(() => {
    applyTheme(theme, isLoaded || preference !== null);
    // Both CSS and the older inline styles use the same appearance after disk loading.
    if (isLoaded && settings.isDarkMode !== isDarkTheme(theme)) {
      updateSetting('isDarkMode', isDarkTheme(theme));
    }
  }, [theme, preference, isLoaded, settings.isDarkMode, updateSetting]);

  const setTheme = useCallback((next: Theme) => {
    const normalized = normalizeTheme(next);
    applyTheme(normalized);
    setPreference(normalized);
  }, []);

  return <ThemeContext.Provider value={{
    theme, setTheme, isWarm: theme === 'warm', isMidnightNavy: theme === 'midnight-navy', isLight: false, isMix: false,
  }}>
    {children}
  </ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** The dark colour object older components paint from while settings.isDarkMode is true:
 *  Midnight Navy's (same shape) while that theme is on, Dark's otherwise. */
export function useDarkPalette(): typeof darkColors {
  return useContext(ThemeContext).isMidnightNavy ? midnightNavyColors : darkColors;
}
export default ThemeContext;
