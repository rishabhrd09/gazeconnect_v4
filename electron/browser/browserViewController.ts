import { BrowserView, BrowserWindow } from 'electron';

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

export async function disposeBrowserView(
  mainWindow: BrowserWindow | null,
  view: BrowserView | null,
  reason: string
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

  try {
    if (!view.webContents.isDestroyed()) {
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

  void reason;
}
