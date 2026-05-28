/**
 * GazeConnect Pro - People Types
 */

export interface Person {
  name: string;
  nameHi: string;
  role: string;
  phrases: { en: string; hi: string }[];
  isActive?: boolean;
}

export const ROLES = [
  'Son', 'Daughter', 'Wife', 'Husband',
  'Nurse', 'Doctor', 'Caretaker', 'Friend', 'Other',
] as const;

export type PersonRole = typeof ROLES[number];
