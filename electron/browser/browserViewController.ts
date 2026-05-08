import { BrowserView, BrowserWindow } from 'electron';

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
    (view as any)._browserViewCleanup?.();
    (view as any)._browserViewCleanup = null;
  } catch {
    // Ignore cleanup races.
  }

  try {
    if (!view.webContents.isDestroyed()) {
      await view.webContents.executeJavaScript(`
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
    }
  } catch {
    // Page may already be gone.
  }

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeBrowserView(view);
    }
  } catch {
    // Ignore BrowserView detach races.
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
