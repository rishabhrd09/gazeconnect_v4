/**
 * Text rules of the web search keyboard (SearchKeyboard.tsx, 6 Oct 2026), kept
 * free of React so `npm run check:search-keyboard` can test them directly.
 */

/** Longest query kept; anything longer is not a search a patient would type by eye. */
export const SEARCH_QUERY_MAX = 120;

/** The query after one key: letters, space, back one letter, back one word. */
export function applySearchKey(text: string, key: string, action?: string, isShift = false): string {
  switch (action) {
    case 'space':
      return text.length === 0 || text.endsWith(' ') ? text : (text + ' ').slice(0, SEARCH_QUERY_MAX);
    case 'backspace':
      return Array.from(text).slice(0, -1).join('');
    case 'deleteWord': {
      const trimmed = text.replace(/\s+$/, '');
      const cut = trimmed.lastIndexOf(' ');
      return cut < 0 ? '' : trimmed.slice(0, cut + 1);
    }
    case 'shift':
    case 'toggleNumbers':
    case 'gaze':
    case 'speak':
    case 'quickWords':
    case 'enter':
      return text;
    default: {
      if (!key || key.length > 4) return text;
      const typed = isShift ? key.toUpperCase() : key.toLowerCase();
      return Array.from(text + typed).slice(0, SEARCH_QUERY_MAX).join('');
    }
  }
}

/** The words already searched on a YouTube or Google results page: the search keyboard opens with them. */
export function searchedWordsOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const page = new URL(url);
    const host = page.hostname.toLowerCase().replace(/^(www|m)\./, '');
    const words = host === 'youtube.com' && page.pathname === '/results'
      ? page.searchParams.get('search_query')
      : /^google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) && page.pathname === '/search'
        ? page.searchParams.get('q')
        : null;
    return Array.from((words || '').replace(/\s+/g, ' ').trim()).slice(0, SEARCH_QUERY_MAX).join('');
  } catch {
    return '';
  }
}
