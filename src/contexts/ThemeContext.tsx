/** The two supported appearances. Legacy preferences migrate without losing settings. */
import React, { createContext, useContext, useState, useCallback, useLayoutEffect, type ReactNode } from 'react';
import { useCustomization } from './CustomizationContext';

export type Theme = 'dark' | 'warm';
export function normalizeTheme(value: string | null): Theme {
  return value === 'warm' || value === 'light' ? 'warm' : 'dark';
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isWarm: boolean;
  // Compatibility for screen-specific legacy paint; these modes cannot be selected.
  isLight: false;
  isMix: false;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark', setTheme: () => {}, isWarm: false, isLight: false, isMix: false,
});

function applyTheme(theme: Theme, persist = true) {
  for (const element of [document.documentElement, document.body]) {
    element.dataset.theme = theme;
    element.classList.remove('theme-light', 'theme-mix');
    element.classList.toggle('theme-dark', theme === 'dark');
    element.classList.toggle('theme-warm', theme === 'warm');
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

  useLayoutEffect(() => {
    applyTheme(theme, isLoaded || preference !== null);
    // Both CSS and the older inline styles use the same appearance after disk loading.
    if (isLoaded && settings.isDarkMode !== (theme === 'dark')) {
      updateSetting('isDarkMode', theme === 'dark');
    }
  }, [theme, preference, isLoaded, settings.isDarkMode, updateSetting]);

  const setTheme = useCallback((next: Theme) => {
    const normalized = normalizeTheme(next);
    applyTheme(normalized);
    setPreference(normalized);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme, isWarm: theme === 'warm', isLight: false, isMix: false }}>
    {children}
  </ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export default ThemeContext;
