/**
 * Music — songs from the maintainer's music folder, chosen by gaze.
 * =================================================================
 * Music -> Indian Music (Bollywood, Krishna, More) or Other (coming soon) -> a playlist, four songs
 * a page -> the player. Every page keeps the shared navigation bar (Home, Keyboard, Back, gaze on /
 * off) and has its own Back. The songs are the imported ones only (src/components/music); an empty
 * playlist says so. The audio element lives here, so leaving Music (Home, Keyboard, Urgent Needs,
 * anything) stops the music, as does Leave in the player.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GlobalNavBar } from '../components/GlobalNavBar';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { MusicChoice, MusicCompass, MusicEdge, MusicRest, type MusicGaze } from '../components/music/MusicCompass';
import { MusicPlayer, stopAudio } from '../components/music/MusicPlayer';
import {
  CATEGORIES_PER_MORE_PAGE, PRIMARY_INDIAN, SONGS_PER_PAGE, clampPage, countLabel, findCategory, formatTime,
  morePlaylists, pageCount, pageItems, pageOfSong, readLibrary, type MusicCategory,
} from '../components/music/musicLibrary';

interface MusicScreenProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  isDarkMode?: boolean;
  showHindi?: boolean;
}

/** Where a playlist's Back leads. */
type PlaylistOrigin = { name: 'indian' } | { name: 'more'; page: number };

type MusicView =
  | { name: 'landing' }
  | { name: 'other' }
  | { name: 'indian' }
  | { name: 'more'; page: number }
  | { name: 'playlist'; categoryId: string; page: number; from: PlaylistOrigin }
  | { name: 'player'; categoryId: string; index: number; from: PlaylistOrigin };

const viewKey = (view: MusicView): string => {
  switch (view.name) {
    case 'more': return `more-${view.page}`;
    case 'playlist': return `playlist-${view.categoryId}-${view.page}`;
    // Not the song: the player stays put while Previous, Next and the next song change it.
    case 'player': return `player-${view.categoryId}`;
    default: return view.name;
  }
};

const songsLabel = (category: MusicCategory) => (
  category.songs.length ? countLabel(category.songs.length, 'song', 'songs') : 'No songs yet'
);

function MusicScreen({ onNavigate, isDarkMode = true }: MusicScreenProps) {
  const { isGazeEnabled, lastEnabledTimestamp, signalNavigation } = useGazeControl();
  const gaze: MusicGaze = { gazeEnabled: isGazeEnabled, gazeEnabledTimestamp: lastEnabledTimestamp, isDarkMode };
  const library = useMemo(() => readLibrary(), []);
  const extras = useMemo(() => morePlaylists(library), [library]);
  const [view, setView] = useState<MusicView>({ name: 'landing' });
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

  const openPlaylist = (categoryId: string, from: PlaylistOrigin) => go({ name: 'playlist', categoryId, page: 0, from });
  const backFromPlaylist = (from: PlaylistOrigin) => go(from.name === 'indian' ? { name: 'indian' } : { name: 'more', page: from.page });

  const back = (): void => {
    switch (view.name) {
      case 'landing': onNavigate('home'); return;
      case 'other':
      case 'indian': go({ name: 'landing' }); return;
      case 'more': go(view.page > 0 ? { name: 'more', page: view.page - 1 } : { name: 'indian' }); return;
      case 'playlist': backFromPlaylist(view.from); return;
      case 'player':
        stopAudio(audio);
        go({ name: 'playlist', categoryId: view.categoryId, page: pageOfSong(view.index), from: view.from });
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
      case 'landing': {
        const indianCount = library.filter(category => category.songs.length > 0).length;
        return (
          <MusicCompass
            left={<MusicChoice id="music-landing-indian" gaze={gaze} tone="left" label="Indian Music"
              sub={indianCount ? countLabel(indianCount, 'playlist', 'playlists') : 'No songs yet'}
              onSelect={() => go({ name: 'indian' })} />}
            center={<MusicRest label="Music" />}
            right={<MusicChoice id="music-landing-other" gaze={gaze} tone="right" label="Other" sub="Coming soon"
              onSelect={() => go({ name: 'other' })} />}
            bottom={backChoice()}
          />
        );
      }

      case 'other':
        return (
          <MusicCompass
            message={(
              <div className="music-message">
                <MusicRest label="Other Music" />
                <p className="music-message-title music-serif">Coming soon</p>
              </div>
            )}
            bottom={backChoice()}
          />
        );

      case 'indian': {
        const [leftId, rightId] = PRIMARY_INDIAN.map(category => category.id);
        const left = findCategory(library, leftId)!;
        const right = findCategory(library, rightId)!;
        const names = extras.map(category => category.title);
        return (
          <MusicCompass
            top={extras.length > 0 ? (
              <MusicEdge>
                <MusicChoice id="music-indian-more" gaze={gaze} tone="accent" shape="edge" glyph="more" label="More"
                  sub={names.length <= 3 ? names.join(', ') : countLabel(names.length, 'playlist', 'playlists')}
                  onSelect={() => go({ name: 'more', page: 0 })} />
              </MusicEdge>
            ) : undefined}
            left={<MusicChoice id={`music-indian-${left.id}`} gaze={gaze} tone="left" label={left.title}
              sub={songsLabel(left)} onSelect={() => openPlaylist(left.id, { name: 'indian' })} />}
            center={<MusicRest label="Indian Music" />}
            right={<MusicChoice id={`music-indian-${right.id}`} gaze={gaze} tone="right" label={right.title}
              sub={songsLabel(right)} onSelect={() => openPlaylist(right.id, { name: 'indian' })} />}
            bottom={backChoice()}
          />
        );
      }

      case 'more': {
        const page = clampPage(view.page, extras.length, CATEGORIES_PER_MORE_PAGE);
        const shown = pageItems(extras, page, CATEGORIES_PER_MORE_PAGE);
        const hasNext = page < pageCount(extras.length, CATEGORIES_PER_MORE_PAGE) - 1;
        const choice = (category: MusicCategory | undefined, tone: 'left' | 'right') => category && (
          <MusicChoice id={`music-more-${category.id}`} gaze={gaze} tone={tone} label={category.title}
            sub={songsLabel(category)} onSelect={() => openPlaylist(category.id, { name: 'more', page })} />
        );
        return (
          <MusicCompass
            top={hasNext ? (
              <MusicEdge>
                <MusicChoice id="music-more-next" gaze={gaze} tone="accent" shape="edge" glyph="more" label="More"
                  sub={pageItems(extras, page + 1, CATEGORIES_PER_MORE_PAGE).map(category => category.title).join(', ')}
                  onSelect={() => go({ name: 'more', page: page + 1 })} />
              </MusicEdge>
            ) : undefined}
            left={choice(shown[0], 'left')}
            center={<MusicRest label="More Indian Music" />}
            right={choice(shown[1], 'right')}
            bottom={backChoice()}
          />
        );
      }

      case 'playlist': {
        const category = findCategory(library, view.categoryId) ?? { id: view.categoryId, title: 'Songs', songs: [] };
        const pages = pageCount(category.songs.length, SONGS_PER_PAGE);
        const page = clampPage(view.page, category.songs.length, SONGS_PER_PAGE);
        const songs = pageItems(category.songs, page, SONGS_PER_PAGE);
        const turn = (to: number) => go({ ...view, page: to });
        return (
          <MusicCompass
            variant="wide"
            headerRow
            top={(
              <header className="music-playlist-head">
                <h1 className="music-playlist-title music-serif">{category.title}</h1>
                {category.songs.length > 0 && (
                  <span className="music-playlist-meta">
                    Page {page + 1} of {pages} <span aria-hidden="true">&middot;</span> {countLabel(category.songs.length, 'song', 'songs')}
                  </span>
                )}
              </header>
            )}
            left={page > 0 ? (
              <MusicChoice id="music-playlist-previous-page" gaze={gaze} tone="left" glyph="chevronLeft" label="Previous Page"
                onSelect={() => turn(page - 1)} />
            ) : undefined}
            center={category.songs.length === 0 ? (
              <div className="music-empty" role="status">
                <p className="music-empty-title music-serif">No songs in {category.title} yet</p>
                <p className="music-empty-note">Add them to the music folder, then import it again.</p>
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
                      onSelect={() => go({ name: 'player', categoryId: category.id, index, from: view.from })} />
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
        const category = findCategory(library, view.categoryId);
        if (!category || category.songs.length === 0) return null;
        return (
          <MusicPlayer
            audio={audio}
            category={category}
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
