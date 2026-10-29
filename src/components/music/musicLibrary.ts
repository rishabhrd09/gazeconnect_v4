/**
 * Music: the library the caregiver fills in Settings > Music (29 Oct 2026; electron/music keeps it
 * in the Music folder, outside the app) and the rules the Music screens follow. The app carries no
 * songs of its own: Papa sees only playlists that have songs whose files are there, so nothing on
 * the Music screen is a title that cannot play.
 */

export interface MusicSong {
  id: string;
  title: string;
  artist?: string;
  /** From the file's tags or the folder's own list; the player shows the file's real length once it loads. */
  seconds?: number;
  /** File name in the library's songs folder. */
  file: string;
  /** The file is no longer in the folder (Settings says so; the Music screen leaves it out). */
  missing?: boolean;
}

export interface MusicPlaylist {
  id: string;
  title: string;
  songs: MusicSong[];
}

export interface MusicLibraryState {
  /** Where the songs are kept, for Settings to show. */
  folder: string;
  playlists: MusicPlaylist[];
}

/** At most four songs on a page. */
export const SONGS_PER_PAGE = 4;

/** Playlists on one page: left and right (More, above, turns the page). */
export const PLAYLISTS_PER_PAGE = 2;

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** The library as main sent it, keeping only well-formed entries (a damaged answer cannot break the screens). */
export function readLibrary(raw: unknown): MusicPlaylist[] {
  const playlists = (raw as { playlists?: unknown })?.playlists;
  if (!Array.isArray(playlists)) return [];
  const seen = new Set<string>();
  const out: MusicPlaylist[] = [];
  for (const playlist of playlists) {
    const { id, title, songs } = (playlist ?? {}) as Record<string, unknown>;
    if (!isText(id) || seen.has(id)) continue;
    seen.add(id);
    const list: MusicSong[] = (Array.isArray(songs) ? songs : [])
      .map(song => (song ?? {}) as Record<string, unknown>)
      .filter(song => isText(song.id) && isText(song.title) && isText(song.file) && !/[\\/]|^\.|\.\./.test(String(song.file)))
      .map(song => ({
        id: String(song.id),
        title: String(song.title).trim(),
        ...(isText(song.artist) ? { artist: String(song.artist).trim() } : {}),
        ...(Number(song.seconds) > 0 ? { seconds: Math.round(Number(song.seconds)) } : {}),
        file: String(song.file),
        ...(song.missing === true ? { missing: true } : {}),
      }));
    out.push({ id, title: isText(title) ? title.trim() : id, songs: list });
  }
  return out;
}

/** What Papa sees: the playlists that have songs he can play, each with only those songs, in order. */
export function playablePlaylists(playlists: MusicPlaylist[]): MusicPlaylist[] {
  return playlists
    .map(playlist => ({ ...playlist, songs: playlist.songs.filter(song => !song.missing) }))
    .filter(playlist => playlist.songs.length > 0);
}

/** The library from main; null where there is none (the interface outside the app). */
export async function loadMusicLibrary(): Promise<MusicLibraryState | null> {
  const api = typeof window !== 'undefined' ? (window as any).electronAPI?.music : undefined;
  if (!api?.list) return null;
  try {
    const reply = await api.list();
    return reply?.ok ? { folder: String(reply.folder || ''), playlists: readLibrary(reply) } : null;
  } catch {
    return null;
  }
}

/** Where a song's file is played from (electron/music/musicService.ts answers it). */
export function songUrl(song: MusicSong): string {
  return `gcmusic://songs/${encodeURIComponent(song.file)}`;
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
