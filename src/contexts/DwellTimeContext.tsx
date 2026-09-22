import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_DWELL_TIMES, DEFAULT_DWELL_TIMING_SET, dwellTimesFor, loadDwellPreferences, normalizeDwellTimingSet,
  setDwellTimingSet, type DwellTimeSettings, type DwellTimingSet, type ALSStageKey,
} from '../config/dwellTimeConfig';
import { useCustomization } from './CustomizationContext';
export type { ALSStageKey } from '../config/dwellTimeConfig';

const DwellTimeContext = createContext<{ settings: DwellTimeSettings; currentStage: ALSStageKey; timingSet: DwellTimingSet }>({
  settings: DEFAULT_DWELL_TIMES, currentStage: 'mid_als', timingSet: DEFAULT_DWELL_TIMING_SET,
});
export const useDwellTime = () => useContext(DwellTimeContext);
export const DwellTimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings: appSettings } = useCustomization();
  const timingSet = normalizeDwellTimingSet(appSettings.dwellTimingSet);
  // Before children render: they read the shared table directly as well.
  setDwellTimingSet(timingSet);
  const [guards] = useState(() => loadDwellPreferences({ getItem: key => localStorage.getItem(key) }, timingSet));
  const value = useMemo(() => ({
    settings: { ...guards.settings, ...dwellTimesFor(timingSet) },
    currentStage: guards.currentStage,
    timingSet,
  }), [guards, timingSet]);
  return <DwellTimeContext.Provider value={value}>{children}</DwellTimeContext.Provider>;
};
