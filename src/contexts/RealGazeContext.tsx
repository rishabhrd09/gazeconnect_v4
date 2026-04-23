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

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

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

const REAL_GAZE_TIMEOUT = 1500; // If no gaze for 1.5s, switch to simulation mode

export const RealGazeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [hasRealGaze, setHasRealGaze] = useState(false);
    const lastGazeTimeRef = useRef(0);
    const hasRealGazeRef = useRef(false);

    const reportGazeReceived = useCallback(() => {
        lastGazeTimeRef.current = Date.now();
        if (!hasRealGazeRef.current) {
            hasRealGazeRef.current = true;
            setHasRealGaze(true);
            console.log('[RealGaze] 📡 Real Tobii gaze detected - disabling mouse dwell');
        }
    }, []);

    // Check for gaze timeout
    useEffect(() => {
        const interval = setInterval(() => {
            if (hasRealGazeRef.current && Date.now() - lastGazeTimeRef.current > REAL_GAZE_TIMEOUT) {
                hasRealGazeRef.current = false;
                setHasRealGaze(false);
                console.log('[RealGaze] ⚠️ No gaze data - enabling mouse dwell for simulation');
            }
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <RealGazeContext.Provider value={{ hasRealGaze, setHasRealGaze, reportGazeReceived }}>
            {children}
        </RealGazeContext.Provider>
    );
};

export default RealGazeContext;
