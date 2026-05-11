/**
 * ThemeContext — Dark/Light/Mix/Warm theme with maximum cascade coverage
 * ======================================================================
 * Sets data-theme attribute on BOTH html AND body elements.
 * Also sets .theme-light / .theme-dark / .theme-mix / .theme-warm classes
 * as backup selectors. Persists to localStorage for anti-flash on reload.
 *
 * RULES:
 * - No layout, spacing, content, or functionality changes
 * - Only visual color/font overrides
 * - Gaze cursor and dwell ring must remain visible in all modes
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light' | 'mix' | 'warm';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  isLight: boolean;
  isMix: boolean;
  isWarm: boolean;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  isLight: false,
  isMix: false,
  isWarm: false,
});

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  const body = document.body;
  // Set attribute on both html AND body for maximum CSS cascade coverage
  html.setAttribute('data-theme', theme);
  body.setAttribute('data-theme', theme);
  // Also set classes as backup selector
  html.classList.toggle('theme-light', theme === 'light');
  html.classList.toggle('theme-dark', theme === 'dark');
  html.classList.toggle('theme-mix', theme === 'mix');
  html.classList.toggle('theme-warm', theme === 'warm');
  body.classList.toggle('theme-light', theme === 'light');
  body.classList.toggle('theme-dark', theme === 'dark');
  body.classList.toggle('theme-mix', theme === 'mix');
  body.classList.toggle('theme-warm', theme === 'warm');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('gc-theme') as Theme;
      return saved === 'light' || saved === 'mix' || saved === 'warm'
        ? saved
        : 'dark';
    } catch {
      return 'dark';
    }
  });

  // Apply on mount and every change
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('gc-theme', theme);
    console.log('[ThemeContext] Applied theme:', theme,
      'on element:', document.documentElement.tagName);
  }, [theme]);

  // Also apply immediately on first paint
  useEffect(() => {
    applyTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t); // immediate, don't wait for re-render
  }, []);

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      isLight: theme === 'light',
      isMix: theme === 'mix',
      isWarm: theme === 'warm',
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export default ThemeContext;
