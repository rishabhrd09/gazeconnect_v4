/** Visual design only. Independent of colour theme, keyboard feel and gaze Focus Mode. */
export type DesignMode = 'focus' | 'serene';
export const normalizeDesignMode = (value: unknown): DesignMode => value === 'serene' ? 'serene' : 'focus';
