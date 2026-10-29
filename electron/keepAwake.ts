/**
 * Keeps the screen on while the interface is on screen (28 Oct 2026).
 *
 * Windows counts only the keyboard, mouse and touch as someone using the computer, never the
 * eyes. Without them it dims the screen, turns it off and enters Modern Standby after its
 * timeout (the maintainer's laptop: dim at 585 s and off at 600 s on mains, off at 180 s on
 * battery). In standby the eye tracker is off and Windows stops the app, so someone who uses
 * only their eyes loses it, Urgent Needs included, and cannot wake it by gaze. Tobii's own
 * "Stay awake" holds the computer awake only while the tracker sees someone: on 28 Oct every
 * idle standby came 600 s after it last did, so being out of its sight for the timeout (a head
 * turned away; whether eyes closed to rest count is not known) or the feature off is enough.
 *
 * Held while the window is shown and not minimised, on mains and on battery alike (a power cut
 * is when help may be needed most; Windows' own low-battery actions still apply). Let go when
 * the window is hidden to the notification area or minimised, and on quit. 'prevent-display-sleep'
 * is Chromium's display request (PowerSetRequest, DisplayRequired), which also keeps Modern
 * Standby away; 'prevent-app-suspension' would let the screen go dark. Closing the lid, the power
 * button and Win+L work as before.
 */
import { powerSaveBlocker, type BrowserWindow } from 'electron';

type Blocker = Pick<typeof powerSaveBlocker, 'start' | 'stop' | 'isStarted'>;
type Watched = Pick<BrowserWindow, 'on' | 'isDestroyed' | 'isVisible' | 'isMinimized'>;
/** Every change, for the health log: whether the screen is now held on, and why. */
type Log = (held: boolean, data: { why: string; error?: string }) => void;

/** How often the window is looked at again, for a change no event reported. */
export const KEEP_AWAKE_CHECK_MS = 5000;

export class KeepAwake {
  private id: number | null = null;
  private quitting = false;
  /** The last request was refused: asked again at every change, logged once until one succeeds. */
  private refused = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly log: Log,
    /** False: never held (a development run started with GAZECONNECT_KEEP_SCREEN_ON=0). */
    private readonly enabled = true,
    private readonly blocker: Blocker = powerSaveBlocker,
  ) {}

  /**
   * Follows the window from now on: held while it is shown and not minimised. A full-screen
   * window restored from minimised sends no 'restore' on Windows (Electron 44, 28 Oct 2026), only
   * 'enter-full-screen' and 'focus'; and every KEEP_AWAKE_CHECK_MS the window is looked at again,
   * so a change no event reported is put right within seconds of a timeout of minutes.
   */
  watch(win: Watched): void {
    const follow = (why: string) => this.set(!win.isDestroyed() && win.isVisible() && !win.isMinimized(), why);
    win.on('show', () => follow('show'));
    win.on('hide', () => follow('hide'));
    win.on('minimize', () => follow('minimize'));
    win.on('restore', () => follow('restore'));
    win.on('enter-full-screen', () => follow('enter-full-screen'));
    win.on('focus', () => follow('focus'));
    win.on('closed', () => {
      this.endChecks();
      this.set(false, 'closed');
    });
    this.endChecks();
    this.timer = setInterval(() => follow('check'), KEEP_AWAKE_CHECK_MS);
    follow('watch');
  }

  /** Lets go for good: the app is quitting. */
  stop(why: string): void {
    this.quitting = true;
    this.endChecks();
    this.set(false, why);
  }

  /** Whether the screen is held on now. */
  get held(): boolean {
    return this.id !== null && this.blocker.isStarted(this.id);
  }

  private endChecks(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private set(wanted: boolean, why: string): void {
    if (wanted && this.enabled && !this.quitting) {
      if (this.held) return;
      try {
        this.id = this.blocker.start('prevent-display-sleep');
        this.refused = false;
        this.log(true, { why });
      } catch (err) {
        this.id = null;   // no hold rather than no app
        if (!this.refused) this.log(false, { why, error: String(err) });
        this.refused = true;
      }
      return;
    }
    if (this.id === null) return;
    try { this.blocker.stop(this.id); } catch { /* already gone */ }
    this.id = null;
    this.log(false, { why });
  }
}
