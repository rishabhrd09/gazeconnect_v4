/**
 * Preload for embedded web pages (YouTube, Google and the sites a search leads
 * to). It exposes nothing to the page. Its only job is to stop a page from
 * opening a native window the patient cannot answer by eye: an alert, confirm
 * or prompt box, the print dialog, a file chooser, or a passkey/security-key
 * prompt. Any of these would sit over the app until someone used a mouse, and
 * the browsing screen would look hung.
 */
import { contextBridge, webFrame } from 'electron';

function quietPage(): void {
  const w = window as any;
  try {
    w.alert = function () { /* no native message box */ };
    w.confirm = function () { return false; };
    w.prompt = function () { return null; };
    w.print = function () { /* no print dialog */ };
  } catch { /* read-only on some pages */ }
  try {
    const credentials = navigator.credentials as any;
    if (credentials) {
      const refuse = () => Promise.reject(new DOMException('Not available in this browser', 'NotAllowedError'));
      credentials.get = refuse;
      credentials.create = refuse;
    }
  } catch { /* ignore */ }
  try {
    for (const name of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) {
      if (name in w) w[name] = () => Promise.reject(new DOMException('Not available in this browser', 'AbortError'));
    }
  } catch { /* ignore */ }
  // A click that would open the file chooser (on the input or its label) is cancelled.
  const blocksFileChooser = (target: EventTarget | null): boolean => {
    const el = target as Element | null;
    if (!el || typeof el.closest !== 'function') return false;
    if (el.closest('input[type="file"]')) return true;
    const label = el.closest('label') as HTMLLabelElement | null;
    const control = label && label.control;
    return !!control && control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file';
  };
  try {
    document.addEventListener('click', (event) => {
      if (blocksFileChooser(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  } catch { /* ignore */ }
}

try {
  // Runs synchronously in the page's own world, before any page script.
  contextBridge.executeInMainWorld({ func: quietPage });
} catch {
  webFrame.executeJavaScript(`(${quietPage.toString()})();`).catch(() => undefined);
}
