/**
 * AlertModeContext — Emergency lock screen for non-active periods
 * ===============================================================
 * When Alert Mode is ON:
 *   - App renders AlertModeScreen unconditionally (full lock)
 *   - All normal navigation is hidden and inaccessible via gaze
 *   - Only caregiver can disable via right-click → Disable Alert Mode
 *
 * State is synced with the Electron main process via IPC,
 * so the native right-click context menu can toggle it.
 * Pattern identical to FocusModeContext.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface AlertModeState {
    isAlertMode: boolean;
    enableAlertMode: () => void;
    disableAlertMode: () => void;
    toggleAlertMode: () => void;
}

const AlertModeContext = createContext<AlertModeState>({
    isAlertMode: false,
    enableAlertMode: () => { },
    disableAlertMode: () => { },
    toggleAlertMode: () => { },
});

export const AlertModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAlertMode, setIsAlertMode] = useState(false);

    // Listen for alert-mode-changed events from Electron main process
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.on) return;

        const handler = (enabled: boolean) => {
            setIsAlertMode(enabled);
        };

        api.on('alert-mode-changed', handler);
        return () => {
            api.off?.('alert-mode-changed', handler);
        };
    }, []);

    const enableAlertMode = useCallback(() => setIsAlertMode(true), []);
    const disableAlertMode = useCallback(() => setIsAlertMode(false), []);
    const toggleAlertMode = useCallback(() => setIsAlertMode(prev => !prev), []);

    return (
        <AlertModeContext.Provider value={{ isAlertMode, enableAlertMode, disableAlertMode, toggleAlertMode }}>
            {children}
        </AlertModeContext.Provider>
    );
};

export const useAlertMode = () => useContext(AlertModeContext);
export default AlertModeContext;
