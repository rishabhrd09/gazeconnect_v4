import { app, type Session, type WebContents } from 'electron';
import * as os from 'os';

/**
 * Safety and resource limits for the embedded web pages (YouTube, Google, the
 * sites a search leads to). Added 6 Oct 2026 after an audit found the browser
 * view running in the app's own session with Electron's defaults, which grant
 * every permission request (camera, microphone, location, notifications,
 * opening other Windows programs through `openExternal`) and let pages start
 * downloads, open native dialogs and reach services on this computer.
 *
 * The pages now live in their own persistent session and get nothing beyond
 * plain reading and playback:
 * - no permissions except writing text to the clipboard;
 * - no downloads, no USB/HID/serial/Bluetooth devices;
 * - http(s) pages on the public internet only: no file:, javascript:, data:,
 *   chrome: or app-launching links, no credentials in URLs, and no request at
 *   all to this computer or the local network (the GazeConnect backend, the
 *   floor plan server, a router's admin page);
 * - a page cannot hold the patient with "Leave site?" (see main.ts).
 */
export const BROWSER_PARTITION = 'persist:gazeconnect-web';

/** Back/forward entries kept per page; older entries are dropped first. */
export const MAX_HISTORY_ENTRIES = 30;

/** The browser's disk cache is cleared at start-up once it grows past this. */
export const BROWSER_CACHE_LIMIT_BYTES = 384 * 1024 * 1024;

export type BlockedKind = 'permission' | 'download' | 'navigation' | 'popup' | 'device' | 'local-network';
export type BlockedReporter = (kind: BlockedKind, detail: string) => void;

// Writing (never reading) the clipboard is the only capability a page keeps.
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write']);

const PRIVATE_IPV4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * The IPv4 address an IPv6 address carries (IPv4-mapped ::ffff:a.b.c.d, translated
 * ::ffff:0:a.b.c.d, the old compatible ::a.b.c.d, NAT64 64:ff9b::a.b.c.d), or null.
 * The URL parser writes the last 32 bits in hex (`[::ffff:127.0.0.1]` becomes
 * `::ffff:7f00:1`), and until 10 Oct 2026 only the dotted form was recognised, so
 * `http://[::ffff:7f00:1]:8765/` reached this computer.
 */
function embeddedIpv4(host: string): string | null {
  const prefix = '(?:::ffff:(?:0:)?|::|64:ff9b::)';
  const dotted = host.match(new RegExp(`^${prefix}(\\d+\\.\\d+\\.\\d+\\.\\d+)$`));
  if (dotted) return dotted[1];
  const hex = host.match(new RegExp(`^${prefix}([0-9a-f]{1,4}):([0-9a-f]{1,4})$`));
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** True for this computer and the local network: loopback, private and link-local addresses. */
export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return PRIVATE_IPV4.some((range) => range.test(host));
  if (host.includes(':')) {
    // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), and an
    // embedded IPv4 address that is private.
    if (host === '::1' || host === '::') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;
    const embedded = embeddedIpv4(host);
    if (embedded) return PRIVATE_IPV4.some((range) => range.test(embedded));
  }
  // A bare single-label name (no dot) can only be a local machine name.
  return !host.includes('.') && !host.includes(':');
}

/** A page the embedded browser may show: http(s), a real public host, no user name or password. */
export function isAllowedPageUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    return !isLocalNetworkHost(url.hostname);
  } catch {
    return false;
  }
}

/** Requests a page may make at all (subresources included): anything except this computer and the local network. */
export function isAllowedRequestUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') {
      return !isLocalNetworkHost(url.hostname);
    }
    return true;   // data:, blob: and the like never leave the page.
  } catch {
    return false;
  }
}

/**
 * Applies every session-wide rule once. Safe to call repeatedly: later calls do nothing.
 */
export function hardenBrowserSession(ses: Session, report: BlockedReporter): void {
  const marked = ses as Session & { __gazeconnectHardened?: boolean };
  if (marked.__gazeconnectHardened) return;
  marked.__gazeconnectHardened = true;

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const allow = ALLOWED_PERMISSIONS.has(permission);
    if (!allow) {
      const external = (details as { externalURL?: string } | undefined)?.externalURL;
      report('permission', external ? `${permission} ${external.slice(0, 120)}` : permission);
    }
    callback(allow);
  });
  ses.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission));
  ses.setDevicePermissionHandler(() => false);
  ses.on('select-hid-device', (event, _details, callback) => { event.preventDefault(); report('device', 'hid'); callback(null); });
  ses.on('select-serial-port', (event, _ports, _contents, callback) => { event.preventDefault(); report('device', 'serial'); callback(''); });
  ses.on('select-usb-device', (event, _details, callback) => { event.preventDefault(); report('device', 'usb'); callback(); });
  ses.on('will-download', (event, item) => {
    event.preventDefault();
    try { item.cancel(); } catch { /* already gone */ }
    report('download', item.getFilename() || item.getURL().slice(0, 120));
  });
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allow = isAllowedRequestUrl(details.url);
    if (!allow) report('local-network', details.url.slice(0, 120));
    callback({ cancel: !allow });
  });
  // No dictionary downloads or spelling work for pages that are only read.
  try { ses.setSpellCheckerEnabled(false); } catch { /* unsupported */ }
}

/** Clears the browser's disk cache once it is larger than the limit. Never throws. */
export async function capBrowserCache(ses: Session, limitBytes = BROWSER_CACHE_LIMIT_BYTES): Promise<number | null> {
  try {
    const size = await ses.getCacheSize();
    if (size > limitBytes) await ses.clearCache();
    return size;
  } catch {
    return null;
  }
}

/** Drops the oldest back/forward entries past `max`. Returns how many were removed. */
export function pruneNavigationHistory(contents: WebContents, max = MAX_HISTORY_ENTRIES): number {
  let removed = 0;
  try {
    const history = contents.navigationHistory;
    while (history.length() > max && removed < 200) {
      // The active entry cannot be removed; it is never the oldest once the list is long.
      const index = history.getActiveIndex() === 0 ? 1 : 0;
      if (!history.removeEntryAtIndex(index)) break;
      removed += 1;
    }
  } catch {
    // Page closing.
  }
  return removed;
}

/** Private memory of the page's renderer process in MB (working set where private bytes are unavailable). */
export function rendererMemoryMb(contents: WebContents): number | null {
  try {
    const pid = contents.getOSProcessId();
    const metric = app.getAppMetrics().find((m) => m.pid === pid);
    if (!metric) return null;
    const kb = metric.memory.privateBytes ?? metric.memory.workingSetSize;
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

const clampMb = (value: number, low: number, high: number) => Math.round(Math.max(low, Math.min(high, value)));

/**
 * How much memory one page may use before it is refreshed. A YouTube page uses
 * about 230-535 MB (measured 6 and 10 Oct 2026); `soft` refreshes it at the next
 * change of video, `hard` at once. Scaled to the computer. Until 10 Oct 2026 the
 * floors were 750 / 1100 MB, more than a YouTube page ever uses, so on a 4 GB laptop,
 * the one that needs it, the page was never refreshed at all.
 */
export function browserMemoryBudgetMb(totalBytes = os.totalmem()): { soft: number; hard: number } {
  const totalMb = totalBytes / (1024 * 1024);
  return { soft: clampMb(totalMb * 0.09, 450, 1400), hard: clampMb(totalMb * 0.15, 750, 2400) };
}

/**
 * The computer's available memory (Windows "Available": free and standby pages) below
 * which it is short (`low`) or about to page the app's own processes to disk (`critical`).
 * On the maintainer's 8 GB laptop a whole-app freeze while watching YouTube came with
 * 160-540 MB available and up to 8,000 pages a second read back from disk (10 Oct 2026).
 */
export function systemMemoryLimitsMb(totalBytes = os.totalmem()): { low: number; critical: number } {
  const totalMb = totalBytes / (1024 * 1024);
  return { low: clampMb(totalMb * 0.07, 400, 800), critical: clampMb(totalMb * 0.035, 250, 400) };
}

/**
 * A freshly built YouTube page playing a video measured 350-550 MB (10 Oct 2026), so a new
 * page frees little unless the old one is larger. On a computer short of memory the page is
 * built again at the next change of video from this size (in a 15-minute soak on the 8 GB
 * laptop at 400 MB this came once in four minutes; each is a full page load).
 */
export const MIN_NEXT_VIDEO_REBUILD_MB = 450;
/** And during a video (an interruption) only from this size, or 80 % of its budget if more. */
export const MIN_NOW_REBUILD_MB = 450;

export type BrowserMemoryAction = 'none' | 'next-video' | 'now';

/**
 * What to do about memory, from the page's own use and the whole computer's. A refresh
 * builds the page again in a new process (main.ts rebuildBrowserPage), which returns all
 * of the old page's memory; `next-video` waits for the next change of video, when a new
 * page costs the person nothing, `now` is for a large page on a computer about to stall.
 */
export function browserMemoryAction(
  pageMb: number | null, availableMb: number | null, totalBytes = os.totalmem(),
): { action: BrowserMemoryAction; reason: string } {
  if (pageMb === null) return { action: 'none', reason: '' };
  const budget = browserMemoryBudgetMb(totalBytes);
  const system = systemMemoryLimitsMb(totalBytes);
  if (pageMb >= budget.hard) return { action: 'now', reason: `page ${pageMb} MB` };
  if (availableMb !== null && availableMb < system.critical &&
      pageMb >= Math.max(MIN_NOW_REBUILD_MB, Math.round(budget.soft * 0.8))) {
    return { action: 'now', reason: `computer ${availableMb} MB available` };
  }
  if (pageMb >= budget.soft) return { action: 'next-video', reason: `page ${pageMb} MB` };
  if (availableMb !== null && availableMb < system.low && pageMb >= MIN_NEXT_VIDEO_REBUILD_MB) {
    return { action: 'next-video', reason: `computer ${availableMb} MB available` };
  }
  return { action: 'none', reason: '' };
}

/** Records recent automatic recoveries so a page that keeps failing is closed instead of restarted forever. */
export class RecoveryBudget {
  private readonly times: number[] = [];

  constructor(private readonly limit = 3, private readonly windowMs = 10 * 60 * 1000) {}

  take(now = Date.now()): boolean {
    while (this.times.length && now - this.times[0] > this.windowMs) this.times.shift();
    if (this.times.length >= this.limit) return false;
    this.times.push(now);
    return true;
  }
}

/** Longest a command may wait on the page's script (a YouTube control, a scroll) before it is given up. */
export const PAGE_SCRIPT_TIMEOUT_MS = 5000;

/**
 * Resolves with `work`, or rejects with `page_script_timeout` once `ms` have passed, so a
 * page that stops responding cannot hold a control (and every press after it) forever.
 * The page itself is recovered separately ('unresponsive' in main.ts).
 */
export function withPageTimeout<T>(work: Promise<T>, ms = PAGE_SCRIPT_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('page_script_timeout')), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}
