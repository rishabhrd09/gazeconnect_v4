/**
 * MusicPanel - the songs and playlists on the Music screen (29 Oct 2026, maintainer request: every
 * family adds its own songs, names its own playlists, and the app ships no songs of its own).
 * Songs are copied from this computer into the music library (electron/music, in the Music folder);
 * playlists can be added, renamed, reordered and removed, and songs renamed, reordered, moved to
 * another playlist or removed (their files go to the Recycle Bin). Every change is saved at once.
 * Standard HTML/CSS form elements (no GazeButton): Settings is for the caregiver.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import { useDarkPalette } from '../../../contexts/ThemeContext';
import { readLibrary, type MusicLibraryState, type MusicPlaylist } from '../../music/musicLibrary';

interface MusicPanelProps {
  isDarkMode: boolean;
}

type MusicReply = {
  ok: boolean;
  folder?: string;
  playlists?: unknown;
  error?: string;
  message?: string;
  cancelled?: boolean;
  added?: number;
  skipped?: Array<{ name: string; reason: string }>;
  playlistTitle?: string;
  playlistsAdded?: string[];
};

type Editing = { kind: 'playlist' | 'song'; id: string; draft: string } | null;
type Confirming = { kind: 'playlist' | 'song'; id: string } | null;

const musicApi = () => (typeof window !== 'undefined' ? (window as any).electronAPI?.music : undefined);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Added 3 songs to Shri Krishna. Skipped notes.txt (not a song file)." */
function describeAdd(reply: MusicReply): string {
  const parts: string[] = [];
  const added = reply.added ?? 0;
  parts.push(added === 0 ? 'No songs were added.'
    : `Added ${plural(added, 'song', 'songs')}${reply.playlistTitle ? ` to ${reply.playlistTitle}` : ''}.`);
  if (reply.playlistsAdded?.length) parts.push(`New playlists: ${reply.playlistsAdded.join(', ')}.`);
  const skipped = reply.skipped ?? [];
  if (skipped.length) {
    const shown = skipped.slice(0, 4).map(item => `${item.name} (${item.reason})`).join(', ');
    parts.push(`Skipped ${shown}${skipped.length > 4 ? ` and ${skipped.length - 4} more` : ''}.`);
  }
  return parts.join(' ');
}

const scopedCSS = (c: typeof darkColors) => `
  .mp-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .mp-card {
    border: 1px solid ${c.border.main}; border-radius: 12px; padding: 14px 16px;
    background: ${c.background.secondary}; display: flex; flex-direction: column; gap: 10px;
  }
  .mp-card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .mp-card-head h3 { margin: 0; font-size: 17px; color: ${c.text.primary}; overflow-wrap: anywhere; }
  .mp-place {
    min-width: 26px; height: 26px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: ${c.text.secondary}; border: 1px solid ${c.border.main};
  }
  .mp-count { font-size: 13px; font-weight: 600; color: ${c.text.tertiary}; }
  .mp-spacer { flex: 1 1 auto; }
  .mp-note { margin: 0; font-size: 13px; line-height: 1.5; color: ${c.text.secondary}; }
  .mp-folder { font-family: Consolas, 'Courier New', monospace; font-size: 12.5px; overflow-wrap: anywhere; color: ${c.text.primary}; }
  .mp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .mp-row {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-radius: 8px; flex-wrap: wrap;
    background: ${c.background.primary}; border: 1px solid ${c.border.main};
  }
  .mp-row-number { width: 22px; flex: 0 0 auto; font-size: 12px; font-weight: 700; color: ${c.text.tertiary}; }
  .mp-row-text { flex: 1 1 220px; min-width: 0; font-size: 14px; color: ${c.text.primary}; overflow-wrap: anywhere; }
  .mp-row-sub { display: block; font-size: 12px; color: ${c.text.tertiary}; margin-top: 2px; }
  .mp-missing { font-size: 12px; font-weight: 700; color: ${c.emergency.main}; }
  .mp-icon-btn {
    width: 32px; height: 32px; flex: 0 0 auto; border-radius: 6px; border: 1px solid transparent;
    background: transparent; color: ${c.text.secondary}; cursor: pointer; font: inherit; font-size: 16px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .mp-icon-btn:hover:not(:disabled) { background: ${c.background.tertiary}; border-color: ${c.border.main}; }
  .mp-icon-btn:disabled { opacity: 0.3; cursor: default; }
  .mp-remove:hover:not(:disabled) { background: ${c.emergency.subtle}; color: ${c.emergency.main}; }
  .mp-form { display: flex; gap: 8px; flex: 1 1 260px; min-width: 0; }
  .mp-add { display: flex; gap: 8px; max-width: 640px; }
  .mp-input {
    flex: 1 1 auto; min-width: 0; padding: 8px 12px; background: ${c.background.tertiary};
    border: 1px solid ${c.border.main}; border-radius: 8px; color: ${c.text.primary}; font: inherit; font-size: 14px; outline: none;
  }
  .mp-input:focus, .mp-select:focus { border-color: ${c.accent.main}; box-shadow: 0 0 0 2px ${c.accent.main}33; }
  .mp-input::placeholder { color: ${c.text.tertiary}; }
  .mp-select {
    max-width: 180px; padding: 6px 8px; background: ${c.background.tertiary}; border: 1px solid ${c.border.main};
    border-radius: 8px; color: ${c.text.primary}; font: inherit; font-size: 13px; outline: none; cursor: pointer;
  }
  .mp-btn {
    padding: 7px 14px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    border: 1px solid ${c.border.main}; background: ${c.background.secondary}; color: ${c.text.primary}; white-space: nowrap;
  }
  .mp-btn:hover:not(:disabled) { background: ${c.background.tertiary}; }
  .mp-btn:disabled { opacity: 0.45; cursor: default; }
  .mp-btn-primary { background: ${c.accent.main}; border-color: ${c.accent.main}; color: #fff; }
  .mp-btn-primary:hover:not(:disabled) { background: ${c.accent.hover}; }
  .mp-btn-danger { background: ${c.emergency.main}; border-color: ${c.emergency.main}; color: #fff; }
  .mp-message { margin: 0; font-size: 13px; line-height: 1.5; color: ${c.accentText.gold}; }
  .mp-confirm { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; color: ${c.text.primary}; }
`;

const MusicPanel: React.FC<MusicPanelProps> = ({ isDarkMode }) => {
  const darkPalette = useDarkPalette();
  const colors = isDarkMode ? darkPalette : lightColors;
  const [api] = useState(musicApi);
  const [library, setLibrary] = useState<MusicLibraryState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);

  const take = useCallback((reply: MusicReply | null | undefined, describe?: (reply: MusicReply) => string | null): boolean => {
    if (!reply || !reply.ok) {
      setMessage(reply?.error || 'That did not work. Nothing was lost; try again.');
      return false;
    }
    setLibrary({ folder: String(reply.folder || ''), playlists: readLibrary(reply) });
    setMessage(reply.message || (describe && !reply.cancelled ? describe(reply) : null));
    return !reply.message;
  }, []);

  /** One request at a time; the page waits for it (adding many songs takes a while). */
  const run = useCallback(async (label: string, call: () => Promise<MusicReply>, describe?: (reply: MusicReply) => string | null) => {
    setBusy(label);
    setConfirming(null);
    try {
      return take(await call(), describe);
    } catch {
      return take(null);
    } finally {
      setBusy(null);
    }
  }, [take]);

  useEffect(() => {
    if (api) void run('Reading the music library...', () => api.list());
  }, [api, run]);

  if (!api) {
    return (
      <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
        Songs can be added in the GazeConnect app only (not in a web browser).
      </p>
    );
  }

  const playlists = library?.playlists ?? [];
  const disabled = busy !== null;

  const saveEdit = async () => {
    if (!editing) return;
    const ok = editing.kind === 'playlist'
      ? await run('Renaming...', () => api.renamePlaylist(editing.id, editing.draft))
      : await run('Renaming...', () => api.renameSong(editing.id, editing.draft));
    if (ok) setEditing(null);
  };

  const editField = (label: string) => editing && (
    <form className="mp-form" onSubmit={event => { event.preventDefault(); void saveEdit(); }}>
      <input className="mp-input" value={editing.draft} maxLength={80} aria-label={label} autoFocus
        onChange={event => setEditing({ ...editing, draft: event.target.value })}
        onKeyDown={event => { if (event.key === 'Escape') setEditing(null); }} />
      <button type="submit" className="mp-btn mp-btn-primary" disabled={disabled || !editing.draft.trim()}>Save</button>
      <button type="button" className="mp-btn" onClick={() => setEditing(null)}>Cancel</button>
    </form>
  );

  const renderPlaylist = (playlist: MusicPlaylist, place: number) => {
    const missing = playlist.songs.filter(song => song.missing).length;
    const renaming = editing?.kind === 'playlist' && editing.id === playlist.id;
    const removing = confirming?.kind === 'playlist' && confirming.id === playlist.id;
    return (
      <section key={playlist.id} className="mp-card" aria-label={`Playlist ${playlist.title}`}>
        <div className="mp-card-head">
          <span className="mp-place" title="Place on the Music screen">{place + 1}</span>
          {renaming ? editField(`New name for ${playlist.title}`) : (
            <>
              <h3>{playlist.title}</h3>
              <span className="mp-count">
                {plural(playlist.songs.length, 'song', 'songs')}{missing ? ` (${missing} missing)` : ''}
              </span>
            </>
          )}
          <span className="mp-spacer" />
          {!renaming && (
            <>
              <button type="button" className="mp-icon-btn" aria-label={`Move ${playlist.title} earlier`} disabled={disabled || place === 0}
                onClick={() => void run('Moving...', () => api.movePlaylist(playlist.id, -1))}>&uarr;</button>
              <button type="button" className="mp-icon-btn" aria-label={`Move ${playlist.title} later`} disabled={disabled || place === playlists.length - 1}
                onClick={() => void run('Moving...', () => api.movePlaylist(playlist.id, 1))}>&darr;</button>
              <button type="button" className="mp-btn" disabled={disabled}
                onClick={() => { setEditing({ kind: 'playlist', id: playlist.id, draft: playlist.title }); setMessage(null); }}>Rename</button>
              <button type="button" className="mp-btn mp-btn-primary" id={`music-add-songs-${playlist.id}`} disabled={disabled}
                onClick={() => void run('Adding songs... this can take a minute for many songs.', () => api.addFiles(playlist.id), describeAdd)}>
                Add songs&hellip;
              </button>
              <button type="button" className="mp-icon-btn mp-remove" aria-label={`Remove the playlist ${playlist.title}`} disabled={disabled}
                onClick={() => setConfirming({ kind: 'playlist', id: playlist.id })}>&times;</button>
            </>
          )}
        </div>

        {removing && (
          <div className="mp-confirm" role="alert">
            <span>
              Remove the playlist {playlist.title}
              {playlist.songs.length ? ` and its ${plural(playlist.songs.length, 'song', 'songs')}? The song files go to the Recycle Bin.` : '?'}
            </span>
            <button type="button" className="mp-btn mp-btn-danger"
              onClick={() => void run('Removing...', () => api.removePlaylist(playlist.id))}>Remove</button>
            <button type="button" className="mp-btn" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        )}

        {playlist.songs.length === 0 ? (
          <p className="mp-note">No songs yet. Papa does not see this playlist until it has songs.</p>
        ) : (
          <ol className="mp-list">
            {playlist.songs.map((song, index) => {
              const songRenaming = editing?.kind === 'song' && editing.id === song.id;
              const songRemoving = confirming?.kind === 'song' && confirming.id === song.id;
              return (
                <li key={song.id} className="mp-row">
                  <span className="mp-row-number">{index + 1}</span>
                  {songRenaming ? editField(`New name for ${song.title}`) : (
                    <span className="mp-row-text">
                      {song.title}
                      {(song.artist || song.missing) && (
                        <span className="mp-row-sub">
                          {song.artist}
                          {song.missing && <span className="mp-missing">{song.artist ? ' · ' : ''}File missing: Papa does not see this song</span>}
                        </span>
                      )}
                    </span>
                  )}
                  {songRemoving ? (
                    <span className="mp-confirm" role="alert">
                      <span>Remove this song? Its file goes to the Recycle Bin.</span>
                      <button type="button" className="mp-btn mp-btn-danger"
                        onClick={() => void run('Removing...', () => api.removeSong(song.id))}>Remove</button>
                      <button type="button" className="mp-btn" onClick={() => setConfirming(null)}>Cancel</button>
                    </span>
                  ) : !songRenaming && (
                    <>
                      <button type="button" className="mp-icon-btn" aria-label={`Move ${song.title} up`} disabled={disabled || index === 0}
                        onClick={() => void run('Moving...', () => api.moveSong(song.id, -1))}>&uarr;</button>
                      <button type="button" className="mp-icon-btn" aria-label={`Move ${song.title} down`} disabled={disabled || index === playlist.songs.length - 1}
                        onClick={() => void run('Moving...', () => api.moveSong(song.id, 1))}>&darr;</button>
                      {playlists.length > 1 && (
                        <select className="mp-select" aria-label={`Move ${song.title} to another playlist`} disabled={disabled} value=""
                          onChange={event => {
                            const target = event.target.value;
                            if (target) void run('Moving...', () => api.setSongPlaylist(song.id, target));
                          }}>
                          <option value="">Move to&hellip;</option>
                          {playlists.filter(other => other.id !== playlist.id).map(other => (
                            <option key={other.id} value={other.id}>{other.title}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="mp-btn" disabled={disabled}
                        onClick={() => { setEditing({ kind: 'song', id: song.id, draft: song.title }); setMessage(null); }}>Rename</button>
                      <button type="button" className="mp-icon-btn mp-remove" aria-label={`Remove ${song.title}`} disabled={disabled}
                        onClick={() => setConfirming({ kind: 'song', id: song.id })}>&times;</button>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
      <style>{scopedCSS(colors)}</style>

      <div>
        <div className="settings-panel-title" style={{ fontSize: typography.fontSize.xl, color: colors.text.primary, fontWeight: typography.fontWeight.bold }}>
          Music
        </div>
        <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, marginTop: 4, lineHeight: 1.5 }}>
          The songs Papa can play on the Music screen, in playlists. Add songs from this computer: they are copied into the
          music folder below, kept outside the app so they stay through updates. Papa sees only playlists that have songs,
          two at a time, in this order. Changes are saved straight away.
        </div>
      </div>

      <section className="mp-card" aria-label="Add songs">
        <p className="mp-note">
          Songs are kept in <span className="mp-folder">{library?.folder || '...'}</span>
        </p>
        <div className="mp-toolbar">
          <button type="button" id="music-add-folder" className="mp-btn mp-btn-primary" disabled={disabled}
            onClick={() => void run('Adding songs... this can take a minute for many songs.', () => api.addFolder(), describeAdd)}>
            Add a folder of songs&hellip;
          </button>
          <button type="button" id="music-open-folder" className="mp-btn" disabled={disabled}
            onClick={() => void run('Opening the folder...', () => api.openFolder())}>Open the music folder</button>
        </div>
        <p className="mp-note">
          Choosing a folder adds every song in it. Each folder inside it becomes a playlist of the same name, or fills the
          playlist that already has that name.
        </p>
        <form className="mp-add" onSubmit={async event => {
          event.preventDefault();
          if (await run('Adding the playlist...', () => api.createPlaylist(newTitle))) setNewTitle('');
        }}>
          <input id="music-new-playlist" className="mp-input" value={newTitle} maxLength={80} placeholder="New playlist name, for example Ghazals"
            aria-label="New playlist name" disabled={disabled} onChange={event => { setNewTitle(event.target.value); setMessage(null); }} />
          <button type="submit" className="mp-btn" disabled={disabled || !newTitle.trim()}>Add playlist</button>
        </form>
        {(busy || message) && <p className="mp-message" role="status">{busy || message}</p>}
      </section>

      {playlists.map(renderPlaylist)}
    </div>
  );
};

export default MusicPanel;
