import React, { createContext, useContext, useState } from 'react';
import { DEFAULT_DWELL_TIMES, loadDwellPreferences, type DwellTimeSettings, type ALSStageKey } from '../config/dwellTimeConfig';
export type { ALSStageKey } from '../config/dwellTimeConfig';

const DwellTimeContext = createContext<{ settings: DwellTimeSettings; currentStage: ALSStageKey }>({
  settings: DEFAULT_DWELL_TIMES, currentStage: 'mid_als',
});
export const useDwellTime = () => useContext(DwellTimeContext);
export const DwellTimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [value] = useState(() => loadDwellPreferences({ getItem: key => localStorage.getItem(key) }));
  return <DwellTimeContext.Provider value={value}>{children}</DwellTimeContext.Provider>;
};
