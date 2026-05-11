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
    // When `isAlertModeLocked` is true, the AlertModeScreen's Home button is
    // disabled — the patient can't exit. Only the caregiver can toggle via
    // the right-click context menu (Electron main process). The lock is
    // auto-cleared whenever Alert Mode is disabled.
    isAlertModeLocked: boolean;
    enableAlertMode: () => void;
    disableAlertMode: () => void;
    toggleAlertMode: () => void;
}

const AlertModeContext = createContext<AlertModeState>({
    isAlertMode: false,
    isAlertModeLocked: false,
    enableAlertMode: () => { },
    disableAlertMode: () => { },
    toggleAlertMode: () => { },
});

export const AlertModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAlertMode, setIsAlertMode] = useState(false);
    const [isAlertModeLocked, setIsAlertModeLocked] = useState(false);

    // Listen for alert-mode-changed + alert-mode-lock-changed events.
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.on) return;

        const alertHandler = (enabled: boolean) => {
            setIsAlertMode(enabled);
        };
        const lockHandler = (enabled: boolean) => {
            setIsAlertModeLocked(enabled);
        };

        api.on('alert-mode-changed', alertHandler);
        api.on('alert-mode-lock-changed', lockHandler);

        // Pull initial lock state once on mount (mirror pattern from focus mode).
        if (api.alertModeLock?.get) {
            api.alertModeLock.get()
                .then((locked: boolean) => setIsAlertModeLocked(Boolean(locked)))
                .catch(() => {});
        }

        return () => {
            api.off?.('alert-mode-changed', alertHandler);
            api.off?.('alert-mode-lock-changed', lockHandler);
        };
    }, []);

    const setAlertMode = useCallback((enabled: boolean) => {
        const api = (window as any).electronAPI;
        if (api?.alertMode?.set) {
            api.alertMode.set(enabled).catch(() => setIsAlertMode(enabled));
        } else {
            setIsAlertMode(enabled);
        }
    }, []);

    const enableAlertMode = useCallback(() => setAlertMode(true), [setAlertMode]);
    const disableAlertMode = useCallback(() => setAlertMode(false), [setAlertMode]);
    const toggleAlertMode = useCallback(() => setAlertMode(!isAlertMode), [isAlertMode, setAlertMode]);

    return (
        <AlertModeContext.Provider value={{ isAlertMode, isAlertModeLocked, enableAlertMode, disableAlertMode, toggleAlertMode }}>
            {children}
        </AlertModeContext.Provider>
    );
};

export const useAlertMode = () => useContext(AlertModeContext);
export default AlertModeContext;
