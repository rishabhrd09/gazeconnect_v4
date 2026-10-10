import { app, BrowserView, BrowserWindow } from 'electron';

// The page's own cleanup (pause and unload its videos) is a courtesy before the
// page is destroyed; it must never keep the page on screen. executeJavaScript
// is parked while the page navigates (until the new document can run scripts)
// or while its renderer is busy, and a parked call can wait indefinitely. The
// cleanup used to be awaited BEFORE the view was detached, so a YouTube page
// caught mid-navigation stayed over the Home screen after the patient had left
// the browser (22 Sep 2026). The view is now silenced and detached first, and
// the cleanup gets this long before the page is destroyed regardless.
const PAGE_CLEANUP_TIMEOUT_MS = 400;

/** Take a view off the window at once. Safe to call for a view that is not attached. */
export function detachBrowserView(mainWindow: BrowserWindow | null, view: BrowserView): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeBrowserView(view);
    }
  } catch {
    // Ignore BrowserView detach races.
  }
}

/**
 * Every BrowserView attached to the window other than `keep`. The app shows at
 * most one page, so anything else on the window is a page nobody owns any more.
 */
export function strayBrowserViews(mainWindow: BrowserWindow | null, keep: BrowserView | null): BrowserView[] {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return [];
    return mainWindow.getBrowserViews().filter((view) => view !== keep);
  } catch {
    return [];
  }
}

/**
 * `endProcess` (10 Oct 2026) is for a page being built again (main.ts rebuildBrowserPage):
 * its renderer process is ended at once instead of being asked to close. A page stuck in its
 * own script never answers that request, and its process went on holding its memory (seen
 * in a fault-injection test: alive 2 s after its replacement, still running the stuck script).
 * The page's listeners are removed first, so ending it is not taken for a crash to recover from.
 * This returns only once the process has gone (at most END_PROCESS_WAIT_MS): a new page loaded
 * in the same session while it was still going waited for its first response for good (1 of 2
 * trials), and none did once it had gone.
 */
export async function disposeBrowserView(
  mainWindow: BrowserWindow | null,
  view: BrowserView | null,
  reason: string,
  options: { endProcess?: boolean } = {}
): Promise<void> {
  if (!view) return;

  try {
    const navPoll = (view as any)._navPoll;
    if (navPoll) clearInterval(navPoll);
    (view as any)._navPoll = null;
  } catch {
    // Ignore cleanup races.
  }

  try {
    const playbackPoll = (view as any)._playbackPoll;
    if (playbackPoll) clearInterval(playbackPoll);
    (view as any)._playbackPoll = null;
  } catch {
    // Ignore cleanup races.
  }

  try {
    (view as any)._browserViewCleanup?.();
    (view as any)._browserViewCleanup = null;
  } catch {
    // Ignore cleanup races.
  }

  // Off the screen and silent now, whatever state the page is in.
  try {
    if (!view.webContents.isDestroyed()) view.webContents.setAudioMuted(true);
  } catch {
    // Page may already be gone.
  }
  detachBrowserView(mainWindow, view);

  let endedPid = 0;
  if (options.endProcess) {
    try {
      if (!view.webContents.isDestroyed()) {
        endedPid = view.webContents.getOSProcessId();
        view.webContents.forcefullyCrashRenderer();
      }
    } catch {
      // Already gone.
    }
  }

  try {
    if (!options.endProcess && !view.webContents.isDestroyed()) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), PAGE_CLEANUP_TIMEOUT_MS);
      });
      const cleanup = view.webContents.executeJavaScript(`
        (function() {
          try {
            document.querySelectorAll('video').forEach(function(video) {
              try { video.pause(); } catch (_) {}
              try { video.src = ''; video.load(); } catch (_) {}
            });
            if (window.gcYouTubeController && window.gcYouTubeController.adSkipObserver) {
              window.gcYouTubeController.adSkipObserver.disconnect();
            }
            if (window.gcCleanup) window.gcCleanup();
          } catch (_) {}
          return true;
        })();
      `).catch(() => false);
      await Promise.race([cleanup, timeout]);
      if (timer) clearTimeout(timer);
    }
  } catch {
    // Page may already be gone.
  }

  try {
    if (!view.webContents.isDestroyed()) {
      (view.webContents as any).destroy?.();
    }
  } catch {
    // Ignore final destroy races.
  }

  if (endedPid > 0) await processGone(endedPid);

  void reason;
}

const END_PROCESS_WAIT_MS = 5000;

/** Waits until the process has left the app's process list (at most END_PROCESS_WAIT_MS), and a moment more. */
async function processGone(pid: number): Promise<void> {
  const started = Date.now();
  const alive = () => {
    try { return app.getAppMetrics().some((metric) => metric.pid === pid); } catch { return false; }
  };
  while (alive() && Date.now() - started < END_PROCESS_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
