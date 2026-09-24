/**
 * Music: the song list (written by scripts/import-music.cjs from the maintainer's music folder)
 * and the rules the Music screens follow. No titles are made up here: a song or playlist exists
 * only if the imported folder had it.
 */
import importedLibrary from './musicLibrary.json';

export interface MusicSong {
  id: string;
  title: string;
  artist?: string;
  /** From the music folder's own list; the player shows the file's real length once it loads. */
  seconds?: number;
  /** Path under public/music. */
  file: string;
}

export interface MusicCategory {
  id: string;
  title: string;
  songs: MusicSong[];
}

/** At most four songs on a page. */
export const SONGS_PER_PAGE = 4;

/** Indian Music offers these two first, left and right; any other playlist is under More. */
export const PRIMARY_INDIAN = [
  { id: 'bollywood', title: 'Bollywood' },
  { id: 'krishna', title: 'Krishna' },
] as const;

/** Playlists on one More page: left and right. */
export const CATEGORIES_PER_MORE_PAGE = 2;

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** The imported list, keeping only well-formed entries (a hand-edited file cannot break the screens). */
export function readLibrary(raw: unknown = importedLibrary): MusicCategory[] {
  const categories = (raw as { categories?: unknown })?.categories;
  if (!Array.isArray(categories)) return [];
  const seen = new Set<string>();
  const out: MusicCategory[] = [];
  for (const category of categories) {
    const { id, title, songs } = (category ?? {}) as Record<string, unknown>;
    if (!isText(id) || seen.has(id)) continue;
    seen.add(id);
    const list: MusicSong[] = (Array.isArray(songs) ? songs : [])
      .map(song => (song ?? {}) as Record<string, unknown>)
      .filter(song => isText(song.id) && isText(song.title) && isText(song.file) && !/^[a-z]:|^[\\/]|\.\./i.test(String(song.file)))
      .map(song => ({
        id: String(song.id),
        title: String(song.title).trim(),
        ...(isText(song.artist) ? { artist: String(song.artist).trim() } : {}),
        ...(Number(song.seconds) > 0 ? { seconds: Math.round(Number(song.seconds)) } : {}),
        file: String(song.file),
      }));
    out.push({ id, title: isText(title) ? title.trim() : id, songs: list });
  }
  return out;
}

/** A playlist by id; a primary one the folder did not have comes back empty (the screen says so). */
export function findCategory(library: MusicCategory[], id: string): MusicCategory | null {
  const found = library.find(category => category.id === id);
  if (found) return found;
  const primary = PRIMARY_INDIAN.find(category => category.id === id);
  return primary ? { id: primary.id, title: primary.title, songs: [] } : null;
}

/** Every other playlist that has songs, in the folder's order: what More shows. */
export function morePlaylists(library: MusicCategory[]): MusicCategory[] {
  const primaryIds: readonly string[] = PRIMARY_INDIAN.map(category => category.id);
  return library.filter(category => !primaryIds.includes(category.id) && category.songs.length > 0);
}

export function pageCount(itemCount: number, perPage: number): number {
  return Math.max(1, Math.ceil(itemCount / perPage));
}

export function clampPage(page: number, itemCount: number, perPage: number): number {
  return Math.min(Math.max(0, Math.floor(page) || 0), pageCount(itemCount, perPage) - 1);
}

export function pageItems<T>(items: T[], page: number, perPage: number): T[] {
  const start = clampPage(page, items.length, perPage) * perPage;
  return items.slice(start, start + perPage);
}

/** The page of a playlist that holds a given song (where Leave returns to). */
export function pageOfSong(index: number): number {
  return Math.max(0, Math.floor(index / SONGS_PER_PAGE));
}

/** "4:05", or "1:02:05" past an hour; "--:--" while unknown. */
export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
