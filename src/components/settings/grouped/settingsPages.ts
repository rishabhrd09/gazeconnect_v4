/**
 * The grouped Settings (GazeSpell look, 24 Sep 2026): three groups with familiar names. Pages that
 * already existed keep their section ids, so the same panels open under them.
 */
export type GroupedPageId =
  | 'gaze' | 'voice' | 'display'
  | 'home' | 'quickwords' | 'phrases' | 'medical' | 'alertmode' | 'people' | 'activities' | 'dictionary'
  | 'backup' | 'reset' | 'about';

export interface GroupedPage {
  id: GroupedPageId;
  title: string;
  description: string;
  icon: string;
}

/** 24-unit line icons (stroke only). */
export const ICON = {
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  speaker: 'M4 9v6h4l5 4V5L8 9H4z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12',
  contrast: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 3a9 9 0 0 1 0 18z',
  home: 'M4 10.5L12 4l8 6.5 M6 9v11h12V9 M10 20v-5h4v5',
  bubble: 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9l-5 4v-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  phrases: 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9l-5 4v-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M8 9h8 M8 13h5',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0',
  shield: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z M12 9v6 M9 12h6',
  people: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  tv: 'M3.5 7h17v11h-17z M9 3l3 4 3-4 M8 21h8',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a1.5 1.5 0 0 0-1.5-1.5H4z M20 4h-6a2 2 0 0 0-2 2v14a1.5 1.5 0 0 1 1.5-1.5H20z',
  download: 'M12 4v11 M7.5 10.5L12 15l4.5-4.5 M4 17v3h16v-3',
  upload: 'M12 15V4 M7.5 8.5L12 4l4.5 4.5 M4 17v3h16v-3',
  reset: 'M4 4v6h6 M5.6 15a8 8 0 1 0 1.9-8.2L4 10',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v6 M12 7.5v.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  minus: 'M5 12h14',
  plus: 'M12 5v14 M5 12h14',
  mouse: 'M8 4h8a3 3 0 0 1 3 3v8a7 7 0 0 1-14 0V7a3 3 0 0 1 3-3z M12 4v6',
} as const;

const page = (id: GroupedPageId, title: string, description: string, icon: string): GroupedPage => ({ id, title, description, icon });

export const PAGE_GROUPS: Array<{ title: string; pages: GroupedPage[] }> = [
  {
    title: 'Using GazeConnect',
    pages: [
      page('gaze', 'Eye Gaze', 'How looking chooses things, and what Papa sees while he looks.', ICON.eye),
      page('voice', 'Voice', 'How Papa’s messages sound.', ICON.speaker),
      page('display', 'Display', 'The look of every screen.', ICON.contrast),
    ],
  },
  {
    title: 'What Papa sees',
    pages: [
      page('home', 'Home Screen', 'What Papa sees first.', ICON.home),
      page('quickwords', 'Quick Words', 'The words on the Quick Phrases screen.', ICON.bubble),
      page('phrases', 'Phrases', 'Ready-made phrases, by category.', ICON.phrases),
      page('medical', 'Assistance', 'Care requests on the Assistance screen, by section.', ICON.bell),
      page('alertmode', 'Urgent Needs', 'The cards on the Urgent Needs screen.', ICON.shield),
      page('people', 'People', 'Who Papa can call for or talk about.', ICON.people),
      page('activities', 'Activities', 'TV channels, YouTube and Alexa commands.', ICON.tv),
      page('dictionary', 'Word Prediction', 'Words, shortcuts and sentences the keyboard suggests.', ICON.book),
    ],
  },
  {
    title: 'Care & data',
    pages: [
      page('backup', 'Backup & Restore', 'Keep a copy of everything, or bring one back.', ICON.download),
      page('reset', 'Reset', 'Start one page, or everything, from the defaults.', ICON.reset),
      page('about', 'About & Help', 'Version, eye tracker, and how Settings works.', ICON.info),
    ],
  },
];

export const GROUPED_PAGES = Object.fromEntries(
  PAGE_GROUPS.flatMap(group => group.pages).map(p => [p.id, p]),
) as Record<GroupedPageId, GroupedPage>;

/** Pages drawn by the grouped Settings itself; the others open an existing panel. */
export const OWN_PAGES: ReadonlySet<GroupedPageId> = new Set(['gaze', 'voice', 'display', 'backup', 'reset', 'about']);

/** Pages whose settings the page header can reset (the panels carry their own reset). */
export const HEADER_RESET_PAGES: ReadonlySet<GroupedPageId> = new Set(['gaze', 'voice', 'display']);

export function isGroupedPageId(value: string): value is GroupedPageId {
  return Object.prototype.hasOwnProperty.call(GROUPED_PAGES, value);
}
