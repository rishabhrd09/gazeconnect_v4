/**
 * Music: the player. Play/Pause above, Previous left, Next right, Leave below, and the NOW PLAYING
 * panel in the passive centre (title, elapsed and total time, track position, a progress bar that
 * is only a display: nothing here seeks). The audio element belongs to the Music screen, so leaving
 * Music by any route stops it.
 */
import React, { useEffect, useState } from 'react';
import { MusicChoice, MusicCompass, MusicEdge, type MusicGaze } from './MusicCompass';
import { formatTime, type MusicCategory, type MusicSong } from './musicLibrary';

/** Where a song's file is served: public/music beside the interface (dev server and built app). */
export function songUrl(song: MusicSong): string {
  return `${import.meta.env.BASE_URL}music/${song.file.split('/').map(encodeURIComponent).join('/')}`;
}

/** Stop and release the file (the element is reused for the next song). */
export function stopAudio(audio: HTMLAudioElement): void {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

const NowPlaying: React.FC<{
  audio: HTMLAudioElement; song: MusicSong; categoryTitle: string; index: number; count: number;
  status: 'playing' | 'paused' | 'finished' | 'failed';
}> = ({ audio, song, categoryTitle, index, count, status }) => {
  const [time, setTime] = useState({ elapsed: 0, total: song.seconds });
  useEffect(() => {
    const update = () => setTime({
      elapsed: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      total: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : song.seconds,
    });
    update();
    const events = ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked', 'emptied'];
    events.forEach(name => audio.addEventListener(name, update));
    return () => events.forEach(name => audio.removeEventListener(name, update));
  }, [audio, song]);
  const fraction = time.total ? Math.min(1, Math.max(0, time.elapsed / time.total)) : 0;
  const note = status === 'failed' ? 'This song could not be played.'
    : status === 'finished' ? 'Finished' : status === 'paused' ? 'Paused' : 'Playing';

  return (
    <section className="music-now" aria-label="Now playing">
      <div className="music-now-eyebrow">Now Playing <span aria-hidden="true">&middot;</span> {categoryTitle}</div>
      <h1 className="music-now-title music-serif">{song.title}</h1>
      {song.artist && <div className="music-now-artist">{song.artist}</div>}
      <div className="music-now-progress">
        <span className="music-now-time">{formatTime(time.elapsed)}</span>
        <span className="music-now-track" role="progressbar" aria-label="Song progress"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
          <span className="music-now-fill" style={{ width: `${fraction * 100}%` }} />
        </span>
        <span className="music-now-time">{formatTime(time.total)}</span>
      </div>
      <div className="music-now-meta">
        <span>Track {index + 1} of {count}</span>
        <span className={`music-now-status music-now-status--${status}`} role="status">{note}</span>
      </div>
    </section>
  );
};

interface MusicPlayerProps {
  audio: HTMLAudioElement;
  category: MusicCategory;
  index: number;
  onChangeIndex: (index: number) => void;
  onLeave: () => void;
  gaze: MusicGaze;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({ audio, category, index, onChangeIndex, onLeave, gaze }) => {
  const songs = category.songs;
  const song = songs[Math.min(Math.max(0, index), songs.length - 1)];
  const last = songs.length - 1;
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);

  // The chosen song starts at once.
  useEffect(() => {
    if (!song) return;
    setFailed(false);
    setFinished(false);
    audio.src = songUrl(song);
    audio.play().catch(() => { /* a failed file reports through 'error'; otherwise it stays paused */ });
  }, [audio, song]);

  useEffect(() => {
    const onPlay = () => { setPlaying(true); setFinished(false); };
    const onPause = () => setPlaying(false);
    const onError = () => { if (audio.getAttribute('src')) { setFailed(true); setPlaying(false); } };
    // At the end of a song the next one follows; after the last one the player stops.
    const onEnded = () => {
      if (index < last) onChangeIndex(index + 1);
      else { setPlaying(false); setFinished(true); }
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audio, index, last, onChangeIndex]);

  if (!song) return null;

  const restart = () => {
    setFinished(false);
    audio.currentTime = 0;
    audio.play().catch(() => { /* reported through 'error' */ });
  };
  const togglePlay = () => {
    if (failed) { setFailed(false); audio.load(); audio.play().catch(() => { /* reported through 'error' */ }); return; }
    if (!audio.paused) { audio.pause(); return; }
    if (finished || audio.ended) { restart(); return; }
    audio.play().catch(() => { /* reported through 'error' */ });
  };
  // Previous on the first song starts it again; Next on the last one goes back to the first.
  const previous = () => (index > 0 ? onChangeIndex(index - 1) : restart());
  const next = () => (index < last ? onChangeIndex(index + 1) : last > 0 ? onChangeIndex(0) : restart());
  const status = failed ? 'failed' : finished ? 'finished' : playing ? 'playing' : 'paused';

  return (
    <MusicCompass
      variant="wide"
      top={(
        <MusicEdge>
          <MusicChoice id="music-player-play" gaze={gaze} tone="accent" shape="edge" dwellCategory="standardButton"
            glyph={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onSelect={togglePlay} />
        </MusicEdge>
      )}
      left={<MusicChoice id="music-player-previous" gaze={gaze} tone="left" glyph="previous" label="Previous" onSelect={previous} />}
      center={<NowPlaying audio={audio} song={song} categoryTitle={category.title} index={index} count={songs.length} status={status} />}
      right={<MusicChoice id="music-player-next" gaze={gaze} tone="right" glyph="next" label="Next" onSelect={next} />}
      bottom={(
        <MusicEdge>
          <MusicChoice id="music-player-leave" gaze={gaze} tone="plain" shape="edge" dwellCategory="backSkipButton"
            glyph="stop" label="Leave" ariaLabel="Leave: stop the music and return to the songs" onSelect={onLeave} />
        </MusicEdge>
      )}
    />
  );
};
