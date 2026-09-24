/**
 * Unsaved edits on a Settings page. A page with a Save button reports whether its draft
 * differs from what is saved; SettingsScreen then asks before another page replaces it.
 * Leaving Settings through the top bar never asks: that bar answers gaze, and a gaze
 * selection must never end behind a mouse-only dialog.
 */

import { createContext, useContext, useEffect } from 'react';

export const SettingsDirtyContext = createContext<(pageHasUnsavedChanges: boolean) => void>(() => {});

export function useReportUnsavedChanges(isDirty: boolean): void {
  const report = useContext(SettingsDirtyContext);
  useEffect(() => { report(isDirty); }, [report, isDirty]);
  useEffect(() => () => report(false), [report]);
}
