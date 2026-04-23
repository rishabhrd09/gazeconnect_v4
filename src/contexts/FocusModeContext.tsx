/**
 * FocusModeContext — "Lock" the user on the current screen
 * ========================================================
 * When Focus Mode is ON:
 *   - GlobalNavBar buttons are visually disabled (grayed out)
 *   - Navigation to other screens is blocked
 *   - Emergency & Gaze Toggle remain active (safety-critical)
 *
 * State is synced with the Electron main process via IPC,
 * so the native right-click context menu can toggle it.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface FocusModeState {
  isFocusMode: boolean;
  toggleFocusMode: () => void;
  enableFocusMode: () => void;
  disableFocusMode: () => void;
}

const FocusModeContext = createContext<FocusModeState>({
  isFocusMode: false,
  toggleFocusMode: () => { },
  enableFocusMode: () => { },
  disableFocusMode: () => { },
});

export const FocusModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Listen for focus-mode-changed events from Electron main process
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.on) return;

    const handler = (enabled: boolean) => {
      setIsFocusMode(enabled);
    };

    api.on('focus-mode-changed', handler);
    return () => {
      api.off?.('focus-mode-changed', handler);
    };
  }, []);

  const toggleFocusMode = useCallback(() => setIsFocusMode(prev => !prev), []);
  const enableFocusMode = useCallback(() => setIsFocusMode(true), []);
  const disableFocusMode = useCallback(() => setIsFocusMode(false), []);

  return (
    <FocusModeContext.Provider value={{ isFocusMode, toggleFocusMode, enableFocusMode, disableFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  );
};

export const useFocusMode = () => useContext(FocusModeContext);
export default FocusModeContext;
