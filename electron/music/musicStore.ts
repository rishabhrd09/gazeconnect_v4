/**
 * The music library (29 Oct 2026, maintainer request): the songs a caregiver adds in Settings >
 * Music, kept outside the app in the person's own Music folder (Music\GazeConnect Pro, see
 * musicService.ts) so they survive updates and reinstalls and can be backed up by copying one
 * folder. It holds:
 *   songs\         the audio files, copied in (a song's file name never changes after that)
 *   library.json   the playlists in order, each with its songs in order and their titles
 * Playlists and titles live only in library.json: renaming a playlist or moving a song to another
 * one moves no file. The installer carries no songs (the recordings are not ours to give away), so a
 * new library starts with four empty playlists, which the Music screen does not show until they
 * have songs.
 *
 * Everything here is synchronous and file-only (no Electron): one song's copy at a time, so the
 * main process's event loop runs between songs, and without Node's thread pool (healthRecorder.ts:
 * it committed 32 MB in the main process).
 */
import * as fs from 'fs';
import * as path from 'path';

export const LIBRARY_FILE = 'library.json';
export const SONGS_DIR = 'songs';
/** What Chromium (and so the player) plays, with the type each is served as. */
export const AUDIO_TYPES: ReadonlyMap<string, string> = new Map([
  ['.mp3', 'audio/mpeg'], ['.m4a', 'audio/mp4'], ['.aac', 'audio/aac'], ['.ogg', 'audio/ogg'], ['.oga', 'audio/ogg'],
  ['.opus', 'audio/ogg'], ['.wav', 'audio/wav'], ['.flac', 'audio/flac'], ['.webm', 'audio/webm'],
]);
/** A two-hour recording at 320 kbps is about 290 MB; anything larger is not a song. */
export const MAX_SONG_BYTES = 500 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 80;
export const MAX_PLAYLISTS = 50;

export interface StoredSong {
  id: string;
  title: string;
  artist?: string;
  seconds?: number;
  /** File name inside songs\ (no folder). */
  file: string;
}

export interface StoredPlaylist {
  id: string;
  title: string;
  songs: StoredSong[];
}

export interface Library {
  version: 1;
  playlists: StoredPlaylist[];
}

/** A song as the screens get it: `missing` when its file is no longer in songs\. */
export interface ListedSong extends StoredSong {
  missing?: true;
}

export interface ListedPlaylist {
  id: string;
  title: string;
  songs: ListedSong[];
}

/** A new library: the playlists Papa's music had, empty until songs are added. */
export const DEFAULT_PLAYLISTS: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'bollywood', title: 'Bollywood' },
  { id: 'krishna', title: 'Shri Krishna' },
  { id: 'chalisa', title: 'Chalisa' },
  { id: 'devotional', title: 'Devotional' },
];

export const defaultLibrary = (): Library => ({
  version: 1,
  playlists: DEFAULT_PLAYLISTS.map(({ id, title }) => ({ id, title, songs: [] })),
});

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** A title as typed: one line, trimmed, at most MAX_TITLE_LENGTH characters; null when empty. */
export function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH).trim();
  return title || null;
}

export const slug = (text: string): string => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** A plain audio file name inside songs\: no folder, no way out of it. */
export function isSongFileName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 200 && name === path.basename(name)
    && !/[\\/:*?"<>|\u0000-\u001f]/.test(name) && name !== '.' && name !== '..' && !name.startsWith('.')
    && AUDIO_TYPES.has(path.extname(name).toLowerCase());
}

/** A saved or hand-edited library, keeping only well-formed entries (a damaged file cannot break the screens). */
export function normalizeLibrary(raw: unknown): Library {
  const list = (raw as { playlists?: unknown })?.playlists;
  if (!Array.isArray(list)) return defaultLibrary();
  const playlistIds = new Set<string>();
  const songIds = new Set<string>();
  const playlists: StoredPlaylist[] = [];
  for (const entry of list) {
    const { id, title, songs } = (entry ?? {}) as Record<string, unknown>;
    const name = cleanTitle(title);
    if (!isText(id) || playlistIds.has(id) || !name || playlists.length >= MAX_PLAYLISTS) continue;
    playlistIds.add(id);
    const kept: StoredSong[] = [];
    for (const item of Array.isArray(songs) ? songs : []) {
      const song = (item ?? {}) as Record<string, unknown>;
      const songTitle = cleanTitle(song.title);
      if (!isText(song.id) || songIds.has(song.id) || !songTitle || !isSongFileName(song.file)) continue;
      songIds.add(song.id);
      const artist = cleanTitle(song.artist);
      const seconds = Number(song.seconds);
      kept.push({ id: song.id, title: songTitle, ...(artist ? { artist } : {}), ...(seconds > 0 ? { seconds: Math.round(seconds) } : {}), file: song.file });
    }
    playlists.push({ id, title: name, songs: kept });
  }
  return { version: 1, playlists };
}

/**
 * The saved library, or a new one. A file that cannot be read is kept as library.damaged.json
 * (the first time) rather than lost, and the songs folder is left as it is.
 */
export function loadLibrary(root: string): Library {
  const file = path.join(root, LIBRARY_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return defaultLibrary();
  }
  try {
    return normalizeLibrary(JSON.parse(text));
  } catch {
    const keep = path.join(root, 'library.damaged.json');
    try { if (!fs.existsSync(keep)) fs.copyFileSync(file, keep); } catch { /* still start fresh */ }
    return defaultLibrary();
  }
}

/** Written whole and then renamed into place, so a crash leaves the old list or the new one. */
export function saveLibrary(root: string, library: Library): void {
  fs.mkdirSync(path.join(root, SONGS_DIR), { recursive: true });
  const file = path.join(root, LIBRARY_FILE);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalizeLibrary(library), null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** The library with each song's file looked for. */
export function listLibrary(root: string): ListedPlaylist[] {
  const songs = path.join(root, SONGS_DIR);
  return loadLibrary(root).playlists.map(playlist => ({
    id: playlist.id,
    title: playlist.title,
    songs: playlist.songs.map(song => (fs.existsSync(path.join(songs, song.file)) ? { ...song } : { ...song, missing: true as const })),
  }));
}

// ---- Changes. Each takes the library, changes it in place and says whether it did. ----

const findPlaylist = (library: Library, id: unknown) => library.playlists.find(playlist => playlist.id === id);

function findSong(library: Library, songId: unknown): { playlist: StoredPlaylist; index: number } | null {
  for (const playlist of library.playlists) {
    const index = playlist.songs.findIndex(song => song.id === songId);
    if (index >= 0) return { playlist, index };
  }
  return null;
}

function uniqueId(base: string, taken: Set<string>): string {
  const start = base || 'item';
  let id = start;
  for (let n = 2; taken.has(id); n += 1) id = `${start}-${n}`;
  return id;
}

const allSongIds = (library: Library) => new Set(library.playlists.flatMap(playlist => playlist.songs.map(song => song.id)));

export type ChangeError = 'not-found' | 'empty-title' | 'duplicate-title' | 'too-many';

/** A new empty playlist at the end. Two playlists cannot share a title (Papa sees only titles). */
export function createPlaylist(library: Library, title: unknown): { id: string } | { error: ChangeError } {
  const name = cleanTitle(title);
  if (!name) return { error: 'empty-title' };
  if (library.playlists.some(playlist => playlist.title.toLowerCase() === name.toLowerCase())) return { error: 'duplicate-title' };
  if (library.playlists.length >= MAX_PLAYLISTS) return { error: 'too-many' };
  const id = uniqueId(slug(name) || 'playlist', new Set(library.playlists.map(playlist => playlist.id)));
  library.playlists.push({ id, title: name, songs: [] });
  return { id };
}

export function renamePlaylist(library: Library, id: unknown, title: unknown): ChangeError | null {
  const playlist = findPlaylist(library, id);
  if (!playlist) return 'not-found';
  const name = cleanTitle(title);
  if (!name) return 'empty-title';
  if (library.playlists.some(other => other !== playlist && other.title.toLowerCase() === name.toLowerCase())) return 'duplicate-title';
  playlist.title = name;
  return null;
}

/** One place earlier (-1) or later (+1). The first two playlists are the ones Music opens with. */
export function movePlaylist(library: Library, id: unknown, delta: number): boolean {
  const from = library.playlists.findIndex(playlist => playlist.id === id);
  const to = from + Math.sign(delta);
  if (from < 0 || to < 0 || to >= library.playlists.length) return false;
  const [playlist] = library.playlists.splice(from, 1);
  library.playlists.splice(to, 0, playlist);
  return true;
}

/** The playlist goes; its songs' files are returned for the caller to put in the Recycle Bin. */
export function removePlaylist(library: Library, id: unknown): string[] | null {
  const index = library.playlists.findIndex(playlist => playlist.id === id);
  if (index < 0) return null;
  const [removed] = library.playlists.splice(index, 1);
  return removed.songs.map(song => song.file).filter(file => !fileInUse(library, file));
}

export function renameSong(library: Library, songId: unknown, title: unknown): ChangeError | null {
  const found = findSong(library, songId);
  if (!found) return 'not-found';
  const name = cleanTitle(title);
  if (!name) return 'empty-title';
  found.playlist.songs[found.index].title = name;
  return null;
}

export function moveSong(library: Library, songId: unknown, delta: number): boolean {
  const found = findSong(library, songId);
  if (!found) return false;
  const to = found.index + Math.sign(delta);
  if (to < 0 || to >= found.playlist.songs.length) return false;
  const [song] = found.playlist.songs.splice(found.index, 1);
  found.playlist.songs.splice(to, 0, song);
  return true;
}

/** To the end of another playlist. */
export function setSongPlaylist(library: Library, songId: unknown, playlistId: unknown): boolean {
  const found = findSong(library, songId);
  const target = findPlaylist(library, playlistId);
  if (!found || !target || target === found.playlist) return false;
  const [song] = found.playlist.songs.splice(found.index, 1);
  target.songs.push(song);
  return true;
}

/** The song goes; its file is returned for the Recycle Bin unless another entry still plays it. */
export function removeSong(library: Library, songId: unknown): string[] | null {
  const found = findSong(library, songId);
  if (!found) return null;
  const [song] = found.playlist.songs.splice(found.index, 1);
  return fileInUse(library, song.file) ? [] : [song.file];
}

const fileInUse = (library: Library, file: string) => library.playlists.some(playlist => playlist.songs.some(song => song.file === file));

// ---- Adding songs ----

export interface SongDetails {
  title?: string;
  artist?: string;
  seconds?: number;
}

export type SkipReason = 'not-audio' | 'too-large' | 'unreadable' | 'already-there' | 'no-playlist';

/**
 * Copies one audio file into songs\ and adds it to the end of a playlist. The copy keeps the
 * file's name (made unique if another song has it). The same file added to the same playlist
 * again is skipped.
 */
export function addSongFile(root: string, library: Library, playlistId: unknown, source: string, details: SongDetails = {}):
  { song: StoredSong } | { skipped: SkipReason } {
  const playlist = findPlaylist(library, playlistId);
  if (!playlist) return { skipped: 'no-playlist' };
  const ext = path.extname(source).toLowerCase();
  if (!AUDIO_TYPES.has(ext)) return { skipped: 'not-audio' };
  let size: number;
  try {
    const stat = fs.statSync(source);
    if (!stat.isFile()) return { skipped: 'unreadable' };
    size = stat.size;
  } catch {
    return { skipped: 'unreadable' };
  }
  if (size > MAX_SONG_BYTES) return { skipped: 'too-large' };
  if (size === 0) return { skipped: 'unreadable' };
  const songsDir = path.join(root, SONGS_DIR);
  // Already in this playlist: a file of the same name and size.
  const sameName = safeFileName(path.basename(source));
  if (playlist.songs.some(song => sameFile(path.join(songsDir, song.file), song.file, sameName, size))) return { skipped: 'already-there' };

  fs.mkdirSync(songsDir, { recursive: true });
  const file = freeFileName(songsDir, sameName);
  try {
    fs.copyFileSync(source, path.join(songsDir, file), fs.constants.COPYFILE_EXCL);
  } catch {
    return { skipped: 'unreadable' };
  }
  const tags = readId3(source);
  const title = cleanTitle(details.title) || cleanTitle(tags.title) || cleanTitle(titleFromFileName(file)) || 'Song';
  const artist = cleanTitle(details.artist) || cleanTitle(tags.artist);
  const seconds = Number(details.seconds) > 0 ? Math.round(Number(details.seconds)) : tags.seconds;
  const id = uniqueId(slug(`${playlist.id}-${path.parse(file).name}`) || 'song', allSongIds(library));
  const song: StoredSong = { id, title, ...(artist ? { artist } : {}), ...(seconds ? { seconds } : {}), file };
  playlist.songs.push(song);
  return { song };
}

function sameFile(stored: string, storedName: string, name: string, size: number): boolean {
  const base = (value: string) => path.parse(value).name.replace(/ \(\d+\)$/, '').toLowerCase() + path.extname(value).toLowerCase();
  if (base(storedName) !== base(name)) return false;
  try { return fs.statSync(stored).size === size; } catch { return false; }
}

/** Windows-safe, at most 120 characters, keeping the extension. */
function safeFileName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, path.extname(name)).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120 - ext.length).trim();
  return `${stem || 'song'}${ext}`;
}

/** "Song.mp3", else "Song (2).mp3", ... */
function freeFileName(dir: string, name: string): string {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let candidate = name;
  for (let n = 2; fs.existsSync(path.join(dir, candidate)); n += 1) candidate = `${stem} (${n})${ext}`;
  return candidate;
}

/**
 * What adding a folder would do: each sub-folder with songs is a playlist (and the folder itself,
 * if it holds songs directly). A playlist that is already there by id or title receives the songs
 * (the folder "krishna" fills "Shri Krishna"); others are created. Titles come from the folder's
 * own library.json when it has one (fullTitle, else title), then the file's tags, then its name.
 */
export interface FolderPlan {
  playlists: Array<{ id: string; title: string; isNew: boolean }>;
  songs: Array<{ playlistId: string; source: string; details: SongDetails }>;
  skipped: string[];
}

export function planFolderImport(library: Library, folder: string): FolderPlan {
  const given = readJsonFile(path.join(folder, 'library.json')) as { songs?: Array<Record<string, unknown>>; categories?: Array<{ id?: unknown }> } | null;
  const givenSongs = new Map<string, Record<string, unknown>>();
  for (const entry of Array.isArray(given?.songs) ? given!.songs : []) {
    if (entry && typeof entry.file === 'string') givenSongs.set(entry.file.replace(/\\/g, '/').toLowerCase(), entry);
  }
  const givenOrder = (Array.isArray(given?.categories) ? given!.categories : []).map(c => (c && typeof c.id === 'string' ? c.id : '')).filter(Boolean);

  const entries = safeReadDir(folder);
  const subfolders = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name);
  subfolders.sort((a, b) => {
    const ia = givenOrder.indexOf(a), ib = givenOrder.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const groups: Array<{ name: string; dir: string; prefix: string }> = [];
  if (entries.some(entry => entry.isFile() && AUDIO_TYPES.has(path.extname(entry.name).toLowerCase()))) {
    groups.push({ name: path.basename(folder), dir: folder, prefix: '' });
  }
  for (const name of subfolders) groups.push({ name, dir: path.join(folder, name), prefix: `${name}/` });

  const plan: FolderPlan = { playlists: [], songs: [], skipped: [] };
  const known = library.playlists.map(playlist => ({ id: playlist.id, title: playlist.title }));
  for (const group of groups) {
    const files = safeReadDir(group.dir).filter(entry => entry.isFile() && !entry.name.startsWith('.')).map(entry => entry.name);
    const audio = files.filter(name => AUDIO_TYPES.has(path.extname(name).toLowerCase()));
    plan.skipped.push(...files.filter(name => !AUDIO_TYPES.has(path.extname(name).toLowerCase()) && name.toLowerCase() !== 'library.json')
      .map(name => `${group.prefix}${name}`));
    if (audio.length === 0) continue;
    const listed = [...givenSongs.keys()].filter(key => key.startsWith(group.prefix.toLowerCase())).map(key => key.slice(group.prefix.length));
    audio.sort((a, b) => {
      const ia = listed.indexOf(a.toLowerCase()), ib = listed.indexOf(b.toLowerCase());
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
      return a.localeCompare(b, undefined, { numeric: true });
    });
    const groupSlug = slug(group.name);
    const title = cleanTitle(titleFromFolder(group.name)) || 'Songs';
    let target = known.find(playlist => (groupSlug && playlist.id === groupSlug) || playlist.title.toLowerCase() === title.toLowerCase());
    if (!target) {
      const id = uniqueId(groupSlug || 'playlist', new Set(known.map(playlist => playlist.id)));
      target = { id, title };
      known.push(target);
      plan.playlists.push({ id, title, isNew: true });
    } else if (!plan.playlists.some(playlist => playlist.id === target!.id)) {
      plan.playlists.push({ id: target.id, title: target.title, isNew: false });
    }
    for (const name of audio) {
      const entry = givenSongs.get(`${group.prefix}${name}`.toLowerCase()) || {};
      const details: SongDetails = {};
      const givenTitle = cleanTitle(entry.fullTitle) || cleanTitle(entry.title);
      if (givenTitle) details.title = givenTitle;
      const givenArtist = cleanTitle(entry.artist);
      if (givenArtist) details.artist = givenArtist;
      if (Number(entry.seconds) > 0) details.seconds = Math.round(Number(entry.seconds));
      plan.songs.push({ playlistId: target.id, source: path.join(group.dir, name), details });
    }
  }
  return plan;
}

/** Creates the plan's new playlists (the songs are then added one by one with addSongFile). */
export function applyPlanPlaylists(library: Library, plan: FolderPlan): void {
  for (const playlist of plan.playlists) {
    if (playlist.isNew && !findPlaylist(library, playlist.id) && library.playlists.length < MAX_PLAYLISTS) {
      library.playlists.push({ id: playlist.id, title: playlist.title, songs: [] });
    }
  }
}

function safeReadDir(dir: string): fs.Dirent[] {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function readJsonFile(file: string): unknown {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// ---- Serving a song to the player (musicService.ts answers gcmusic://songs/<file>) ----

/** The file a gcmusic:// address names, or null: only songs\<plain audio file> that exists. */
export function resolveSongAddress(root: string, address: string): string | null {
  let url: URL;
  try { url = new URL(address); } catch { return null; }
  if (url.hostname !== 'songs' || url.search || url.username || url.password) return null;
  let name: string;
  try { name = decodeURIComponent(url.pathname.replace(/^\//, '')); } catch { return null; }
  if (!isSongFileName(name)) return null;
  const songsDir = path.resolve(root, SONGS_DIR);
  const file = path.resolve(songsDir, name);
  if (path.dirname(file) !== songsDir) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

/** One byte range of a file of `size` bytes ("bytes=a-b", "bytes=a-", "bytes=-n"); null for none, 'invalid' when unsatisfiable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(size - 1, Number(match[2]));
  }
  if (!Number.isSafeInteger(start) || start >= size || end < start) return 'invalid';
  return { start, end };
}

export const songType = (file: string): string => AUDIO_TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream';

// ---- Titles (taken over from scripts/import-music.cjs) ----

/** "01-mere-sapnon-ki-rani.mp3" -> "Mere Sapnon Ki Rani". */
export function titleFromFileName(fileName: string): string {
  const words = path.parse(fileName).name
    .replace(/ \(\d+\)$/, '')
    .replace(/^\s*\d{1,3}\s*[-_. ]\s*/, '')
    .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.replace(/\b([a-z])/g, m => m.toUpperCase());
}

/** Folder name -> playlist title: "devotional" -> "Devotional". */
export function titleFromFolder(name: string): string {
  return name.replace(/[-_]+/g, ' ').trim().replace(/\b([a-z])/g, m => m.toUpperCase());
}

/** The TIT2 (title), TPE1 (artist) and TLEN (length) frames of an ID3v2.3/2.4 tag, if present. */
export function readId3(file: string): { title?: string; artist?: string; seconds?: number } {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(10);
    if (fs.readSync(fd, head, 0, 10, 0) < 10 || head.toString('latin1', 0, 3) !== 'ID3') return {};
    const version = head[3];
    const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    const tag = Buffer.alloc(Math.min(size, 1 << 20));
    fs.readSync(fd, tag, 0, tag.length, 10);
    const out: Record<string, string> = {};
    let at = 0;
    while (at + 10 <= tag.length) {
      const id = tag.toString('latin1', at, at + 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const frameSize = version === 4
        ? (tag[at + 4] << 21) | (tag[at + 5] << 14) | (tag[at + 6] << 7) | tag[at + 7]
        : tag.readUInt32BE(at + 4);
      const body = tag.subarray(at + 10, at + 10 + frameSize);
      at += 10 + frameSize;
      if (!['TIT2', 'TPE1', 'TLEN'].includes(id) || body.length < 2) continue;
      const encoding = body[0];
      let text: string;
      if (encoding === 1 || encoding === 2) {
        let data = body.subarray(1);
        let bigEndian = encoding === 2;
        if (data[0] === 0xfe && data[1] === 0xff) { bigEndian = true; data = data.subarray(2); }
        else if (data[0] === 0xff && data[1] === 0xfe) { bigEndian = false; data = data.subarray(2); }
        const even = Buffer.from(data.subarray(0, data.length - (data.length % 2)));
        if (bigEndian) even.swap16();
        text = even.toString('utf16le');
      } else {
        text = body.subarray(1).toString(encoding === 3 ? 'utf8' : 'latin1');
      }
      text = text.replace(/\u0000[\s\S]*$/, '').trim();
      if (text) out[id] = text;
    }
    return {
      title: out.TIT2,
      artist: out.TPE1,
      seconds: out.TLEN && Number(out.TLEN) > 0 ? Math.round(Number(out.TLEN) / 1000) : undefined,
    };
  } catch {
    return {};
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
