/**
 * The music library in the app (29 Oct 2026): where it lives, the gcmusic:// addresses the player
 * plays from, and the Settings > Music requests. musicStore.ts does the work on the files.
 *
 * The library is <Music folder>\GazeConnect Pro (Windows' own Music folder, so it is where people
 * look for songs, outlives the app and its updates, and is backed up by copying one folder). A
 * development run may point it elsewhere with GAZECONNECT_MUSIC_DIR; the installed app ignores that.
 *
 * Songs are served as gcmusic://songs/<file>, only to the interface's session (embedded web pages
 * have their own and cannot reach it), only from songs\, and with byte ranges answered as 206 so the
 * player can start at once and seek. The bytes are read by Chromium (net.fetch of the file), not by
 * the main process; a file: fetch honours a Range but reports 200 without Content-Range (probed on
 * Electron 44), so the headers are set here.
 */
import { app, dialog, ipcMain, net, protocol, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { fromMainWindow } from '../floorplanService';
import * as store from './musicStore';

export const MUSIC_SCHEME = 'gcmusic';

/** Must run before the app is ready (Electron allows one call): gcmusic:// streams like any media. */
export function registerMusicScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MUSIC_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
  ]);
}

export function musicLibraryRoot(): string {
  const override = process.env.GAZECONNECT_MUSIC_DIR;
  if (!app.isPackaged && override && path.isAbsolute(override)) return override;
  return path.join(app.getPath('music'), 'GazeConnect Pro');
}

type Reply = { ok: true; folder: string; playlists: store.ListedPlaylist[] } & Record<string, unknown>;
type Failure = { ok: false; error: string };

const SKIP_TEXT: Record<store.SkipReason, string> = {
  'not-audio': 'not a song file',
  'too-large': 'too large',
  unreadable: 'could not be read',
  'already-there': 'already in that playlist',
  'no-playlist': 'the playlist is gone',
};

const CHANGE_TEXT: Record<store.ChangeError, string> = {
  'not-found': 'It is no longer there; the list has been refreshed.',
  'empty-title': 'Type a name first.',
  'duplicate-title': 'Another playlist already has that name.',
  'too-many': `There can be at most ${store.MAX_PLAYLISTS} playlists.`,
};

const yieldToEvents = () => new Promise<void>(resolve => setImmediate(resolve));

export class MusicService {
  /** One change at a time, in the order asked. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly mainWindow: () => BrowserWindow | null) {}

  /** At ready: answer gcmusic:// for the interface's session. */
  registerProtocol(): void {
    protocol.handle(MUSIC_SCHEME, request => this.serve(request));
  }

  private async serve(request: Request): Promise<Response> {
    const file = store.resolveSongAddress(musicLibraryRoot(), request.url);
    if (!file || (request.method !== 'GET' && request.method !== 'HEAD')) return new Response(null, { status: 404 });
    let size: number;
    try { size = fs.statSync(file).size; } catch { return new Response(null, { status: 404 }); }
    const range = store.parseRange(request.headers.get('range'), size);
    const headers: Record<string, string> = { 'Content-Type': store.songType(file), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (range === 'invalid') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    const source = pathToFileURL(file).toString();
    if (!range) {
      const whole = await net.fetch(source);
      return new Response(request.method === 'HEAD' ? null : whole.body, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
    }
    const part = await net.fetch(source, { headers: { Range: `bytes=${range.start}-${range.end}` } });
    return new Response(request.method === 'HEAD' ? null : part.body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(range.end - range.start + 1) },
    });
  }

  registerIpc(): void {
    const handle = (channel: string, work: (...args: any[]) => Promise<Reply | Failure> | Reply | Failure) => {
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (!fromMainWindow(event, this.mainWindow())) throw new Error('Music requests are only available to the main app.');
        const run = this.queue.then(() => work(...args)).catch((err: unknown): Failure => {
          console.error(`[Music] ${channel} failed:`, err);
          return { ok: false, error: 'That did not work. Nothing was lost; try again.' };
        });
        this.queue = run;
        return run;
      });
    };

    handle('music:list', () => this.reply());

    handle('music:add-files', async (playlistId: unknown) => {
      const root = musicLibraryRoot();
      const library = store.loadLibrary(root);
      const playlist = library.playlists.find(p => p.id === playlistId);
      if (!playlist) return this.reply({ message: CHANGE_TEXT['not-found'] });
      const win = this.mainWindow();
      const options: Electron.OpenDialogOptions = {
        title: `Add songs to ${playlist.title}`,
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Songs', extensions: [...store.AUDIO_TYPES.keys()].map(ext => ext.slice(1)) }],
      };
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      if (picked.canceled || picked.filePaths.length === 0) return this.reply({ cancelled: true });
      const result = await this.addAll(root, library, picked.filePaths.map(source => ({ playlistId: playlist.id, source, details: {} })));
      return this.reply({ ...result, playlistTitle: playlist.title });
    });

    handle('music:add-folder', async () => {
      const root = musicLibraryRoot();
      const library = store.loadLibrary(root);
      const win = this.mainWindow();
      const options: Electron.OpenDialogOptions = {
        title: 'Add a folder of songs (each folder inside it becomes a playlist)',
        properties: ['openDirectory'],
      };
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      if (picked.canceled || picked.filePaths.length === 0) return this.reply({ cancelled: true });
      const plan = store.planFolderImport(library, picked.filePaths[0]);
      store.applyPlanPlaylists(library, plan);
      const result = await this.addAll(root, library, plan.songs);
      return this.reply({
        ...result,
        skipped: [...plan.skipped.map(name => ({ name, reason: SKIP_TEXT['not-audio'] })), ...result.skipped],
        playlistsAdded: plan.playlists.filter(p => p.isNew).map(p => p.title),
      });
    });

    handle('music:create-playlist', (title: unknown) => this.change(library => {
      const made = store.createPlaylist(library, title);
      return 'error' in made ? made.error : null;
    }));
    handle('music:rename-playlist', (id: unknown, title: unknown) => this.change(library => store.renamePlaylist(library, id, title)));
    handle('music:move-playlist', (id: unknown, delta: unknown) => this.change(library => (store.movePlaylist(library, id, Number(delta)) ? null : 'not-found')));
    handle('music:remove-playlist', (id: unknown) => this.change(library => {
      const files = store.removePlaylist(library, id);
      return files ? { files } : 'not-found';
    }));
    handle('music:rename-song', (songId: unknown, title: unknown) => this.change(library => store.renameSong(library, songId, title)));
    handle('music:move-song', (songId: unknown, delta: unknown) => this.change(library => (store.moveSong(library, songId, Number(delta)) ? null : 'not-found')));
    handle('music:set-song-playlist', (songId: unknown, playlistId: unknown) => this.change(library => (
      store.setSongPlaylist(library, songId, playlistId) ? null : 'not-found')));
    handle('music:remove-song', (songId: unknown) => this.change(library => {
      const files = store.removeSong(library, songId);
      return files ? { files } : 'not-found';
    }));

    handle('music:open-folder', async () => {
      const root = musicLibraryRoot();
      fs.mkdirSync(path.join(root, store.SONGS_DIR), { recursive: true });
      const problem = await shell.openPath(root);
      return this.reply(problem ? { message: `The folder could not be opened: ${problem}` } : {});
    });
  }

  private reply(extra: Record<string, unknown> = {}): Reply {
    const root = musicLibraryRoot();
    return { ok: true, folder: root, playlists: store.listLibrary(root), ...extra };
  }

  /**
   * A change to the list. `apply` returns null (done), a ChangeError (nothing saved, said why), or
   * the files that left the library, which go to the Recycle Bin (a mistake can be undone there).
   */
  private async change(apply: (library: store.Library) => store.ChangeError | null | { files: string[] }): Promise<Reply> {
    const root = musicLibraryRoot();
    const library = store.loadLibrary(root);
    const outcome = apply(library);
    if (typeof outcome === 'string') return this.reply({ message: CHANGE_TEXT[outcome] });
    store.saveLibrary(root, library);
    let kept = 0;
    for (const file of outcome?.files ?? []) {
      const target = path.join(root, store.SONGS_DIR, file);
      if (!store.isSongFileName(file) || !fs.existsSync(target)) continue;
      try { await shell.trashItem(target); } catch { kept += 1; }
    }
    return this.reply(kept ? { message: `${kept} file${kept === 1 ? ' was' : 's were'} left in the songs folder.` } : {});
  }

  /** Copies one song at a time, saving as it goes, with the event loop running between songs. */
  private async addAll(root: string, library: store.Library, items: store.FolderPlan['songs']) {
    const skipped: Array<{ name: string; reason: string }> = [];
    let added = 0;
    store.saveLibrary(root, library);
    for (const item of items) {
      const result = store.addSongFile(root, library, item.playlistId, item.source, item.details);
      if ('song' in result) {
        added += 1;
        store.saveLibrary(root, library);
      } else {
        skipped.push({ name: path.basename(item.source), reason: SKIP_TEXT[result.skipped] });
      }
      await yieldToEvents();
    }
    return { added, skipped };
  }
}
