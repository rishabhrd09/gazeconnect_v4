/**
 * Music — the songs a caregiver added in Settings > Music, chosen by gaze.
 * ========================================================================
 * Music opens on the playlists, two a page (left and right; More above turns the page) -> a
 * playlist, four songs a page -> the player. Every page keeps the shared navigation bar (Home,
 * Keyboard, Back, gaze on / off) and has its own Back. Only playlists with songs that can play are
 * shown (src/components/music/musicLibrary.ts), so no title here leads nowhere; with none, the page
 * says where songs are added. The audio element lives here, so leaving Music (Home, Keyboard,
 * Urgent Needs, anything) stops the music, as does Leave in the player.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { MusicChoice, MusicCompass, MusicEdge, MusicRest, type MusicGaze } from '../components/music/MusicCompass';
import { MusicPlayer, stopAudio } from '../components/music/MusicPlayer';
import {
  PLAYLISTS_PER_PAGE, SONGS_PER_PAGE, clampPage, countLabel, formatTime, loadMusicLibrary,
  pageCount, pageItems, pageOfSong, playablePlaylists, type MusicPlaylist,
} from '../components/music/musicLibrary';

interface MusicScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

/** `from`: the page of playlists a playlist was opened from (where its Back leads). */
type MusicView =
  | { name: 'playlists'; page: number }
  | { name: 'playlist'; playlistId: string; page: number; from: number }
  | { name: 'player'; playlistId: string; index: number; from: number };

const viewKey = (view: MusicView): string => {
  switch (view.name) {
    case 'playlists': return `playlists-${view.page}`;
    case 'playlist': return `playlist-${view.playlistId}-${view.page}`;
    // Not the song: the player stays put while Previous, Next and the next song change it.
    case 'player': return `player-${view.playlistId}`;
  }
};

function MusicScreen({ onNavigate, isDarkMode = true }: MusicScreenProps) {
  const { isGazeEnabled, lastEnabledTimestamp, signalNavigation } = useGazeControl();
  const gaze: MusicGaze = { gazeEnabled: isGazeEnabled, gazeEnabledTimestamp: lastEnabledTimestamp, isDarkMode };
  // null while the list is read (a few milliseconds); then only what can play.
  const [playlists, setPlaylists] = useState<MusicPlaylist[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadMusicLibrary().then(library => { if (live) setPlaylists(playablePlaylists(library?.playlists ?? [])); });
    return () => { live = false; };
  }, []);
  const [view, setView] = useState<MusicView>({ name: 'playlists', page: 0 });
  const [audio] = useState(() => {
    const element = new Audio();
    element.preload = 'auto';
    return element;
  });
  // Leaving Music, by any route, stops the music.
  useEffect(() => () => stopAudio(audio), [audio]);

  // A new page: the same pause after a page change as everywhere else, so a look that chose on
  // the old page cannot choose on the new one.
  const go = useCallback((next: MusicView) => {
    signalNavigation();
    setView(next);
  }, [signalNavigation]);
  // Previous, Next and the end of a song change the song, not the page.
  const changeSong = useCallback((index: number) => {
    setView(current => (current.name === 'player' ? { ...current, index } : current));
  }, []);

  const list = playlists ?? [];
  const findPlaylist = (id: string) => list.find(playlist => playlist.id === id) ?? null;

  const back = (): void => {
    switch (view.name) {
      case 'playlists':
        if (view.page > 0) go({ name: 'playlists', page: view.page - 1 });
        else onNavigate('home');
        return;
      case 'playlist': go({ name: 'playlists', page: view.from }); return;
      case 'player':
        stopAudio(audio);
        go({ name: 'playlist', playlistId: view.playlistId, page: pageOfSong(view.index), from: view.from });
        return;
    }
  };

  const backChoice = (label = 'Back') => (
    <MusicEdge>
      <MusicChoice id={`music-${view.name}-back`} gaze={gaze} tone="plain" shape="edge" dwellCategory="backSkipButton"
        glyph="back" label={label} onSelect={back} />
    </MusicEdge>
  );

  const renderView = () => {
    switch (view.name) {
      case 'playlists': {
        if (playlists === null) return <MusicCompass center={<MusicRest label="Music" />} bottom={backChoice()} />;
        if (list.length === 0) {
          return (
            <MusicCompass
              message={(
                <div className="music-message" role="status">
                  <MusicRest label="Music" />
                  <p className="music-message-title music-serif">No songs yet</p>
                  <p className="music-empty-note">A caregiver can add songs in Settings, under Music.</p>
                </div>
              )}
              bottom={backChoice()}
            />
          );
        }
        const page = clampPage(view.page, list.length, PLAYLISTS_PER_PAGE);
        const shown = pageItems(list, page, PLAYLISTS_PER_PAGE);
        const hasNext = page < pageCount(list.length, PLAYLISTS_PER_PAGE) - 1;
        const choice = (playlist: MusicPlaylist | undefined, tone: 'left' | 'right') => playlist && (
          <MusicChoice id={`music-open-${playlist.id}`} gaze={gaze} tone={tone} label={playlist.title}
            sub={countLabel(playlist.songs.length, 'song', 'songs')}
            onSelect={() => go({ name: 'playlist', playlistId: playlist.id, page: 0, from: page })} />
        );
        return (
          <MusicCompass
            top={hasNext ? (
              <MusicEdge>
                <MusicChoice id="music-playlists-more" gaze={gaze} tone="accent" shape="edge" glyph="more" label="More"
                  sub={pageItems(list, page + 1, PLAYLISTS_PER_PAGE).map(playlist => playlist.title).join(', ')}
                  onSelect={() => go({ name: 'playlists', page: page + 1 })} />
              </MusicEdge>
            ) : undefined}
            left={choice(shown[0], 'left')}
            center={<MusicRest label={page === 0 ? 'Music' : 'More Music'} />}
            right={choice(shown[1], 'right')}
            bottom={backChoice()}
          />
        );
      }

      case 'playlist': {
        const playlist = findPlaylist(view.playlistId) ?? { id: view.playlistId, title: 'Songs', songs: [] };
        const pages = pageCount(playlist.songs.length, SONGS_PER_PAGE);
        const page = clampPage(view.page, playlist.songs.length, SONGS_PER_PAGE);
        const songs = pageItems(playlist.songs, page, SONGS_PER_PAGE);
        const turn = (to: number) => go({ ...view, page: to });
        return (
          <MusicCompass
            variant="wide"
            headerRow
            top={(
              <header className="music-playlist-head">
                <h1 className="music-playlist-title music-serif">{playlist.title}</h1>
                {playlist.songs.length > 0 && (
                  <span className="music-playlist-meta">
                    Page {page + 1} of {pages} <span aria-hidden="true">&middot;</span> {countLabel(playlist.songs.length, 'song', 'songs')}
                  </span>
                )}
              </header>
            )}
            left={page > 0 ? (
              <MusicChoice id="music-playlist-previous-page" gaze={gaze} tone="left" glyph="chevronLeft" label="Previous Page"
                onSelect={() => turn(page - 1)} />
            ) : undefined}
            center={playlist.songs.length === 0 ? (
              <div className="music-empty" role="status">
                <p className="music-empty-title music-serif">No songs in {playlist.title} yet</p>
                <p className="music-empty-note">A caregiver can add songs in Settings, under Music.</p>
              </div>
            ) : (
              <div className="music-songs">
                {songs.map((song, slot) => {
                  const index = page * SONGS_PER_PAGE + slot;
                  const detail = [song.artist, song.seconds ? formatTime(song.seconds) : ''].filter(Boolean).join(' · ');
                  return (
                    <MusicChoice key={song.id} id={`music-song-${song.id}`} gaze={gaze} tone="plain" shape="song"
                      dwellCategory="phraseButton" label={song.title} sub={detail || undefined}
                      ariaLabel={`Play ${song.title}`}
                      onSelect={() => go({ name: 'player', playlistId: playlist.id, index, from: view.from })} />
                  );
                })}
              </div>
            )}
            right={page < pages - 1 ? (
              <MusicChoice id="music-playlist-next-page" gaze={gaze} tone="right" glyph="chevronRight" label="Next Page"
                onSelect={() => turn(page + 1)} />
            ) : undefined}
            bottom={backChoice()}
          />
        );
      }

      case 'player': {
        const playlist = findPlaylist(view.playlistId);
        if (!playlist || playlist.songs.length === 0) return null;
        return (
          <MusicPlayer
            audio={audio}
            playlist={playlist}
            index={view.index}
            onChangeIndex={changeSong}
            onLeave={back}
            gaze={gaze}
          />
        );
      }
    }
  };

  return (
    <div id="music-view" className="music-view">
      <GlobalNavBar currentPage="music" onNavigate={onNavigate} isDarkMode={isDarkMode} onBack={back} />
      <main key={viewKey(view)} className="music-stage">
        {renderView()}
      </main>
    </div>
  );
}

export default React.memo(MusicScreen);
