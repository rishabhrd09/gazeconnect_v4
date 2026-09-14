/**
 * GazeConnect Pro - Real Gaze Detection Context
 * ==============================================
 * This context tracks whether REAL gaze data is being received
 * from the Tobii eye tracker.
 * 
 * When real gaze is active:
 * - Mouse CLICKS work normally (caregivers can click)
 * - Mouse HOVER does NOT trigger dwell (prevents accidental clicks)
 * 
 * When no real gaze (simulation mode):
 * - Mouse hover triggers dwell (for testing without eye tracker)
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface RealGazeContextType {
    hasRealGaze: boolean;
    setHasRealGaze: (v: boolean) => void;
    reportGazeReceived: () => void;
}

const RealGazeContext = createContext<RealGazeContextType>({
    hasRealGaze: false,
    setHasRealGaze: () => { },
    reportGazeReceived: () => { },
});

export const useRealGaze = () => useContext(RealGazeContext);

// Electron uses the backend as its only dwell input owner (including explicit
// --simulate). UI-only development may use hover until a gaze stream arrives.
// Tracking loss never changes input mode or enables a parked mouse to select.
export const RealGazeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [hasRealGaze, setHasRealGazeState] = useState(() => Boolean((window as any).electronAPI));
    const hasRealGazeRef = useRef(hasRealGaze);
    const setHasRealGaze = useCallback((value: boolean) => {
        hasRealGazeRef.current = value;
        setHasRealGazeState(value);
    }, []);
    const reportGazeReceived = useCallback(() => {
        if (!hasRealGazeRef.current) setHasRealGaze(true);
    }, [setHasRealGaze]);

    return (
        <RealGazeContext.Provider value={{ hasRealGaze, setHasRealGaze, reportGazeReceived }}>
            {children}
        </RealGazeContext.Provider>
    );
};

export default RealGazeContext;
