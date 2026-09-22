import * as fs from 'fs';
import * as path from 'path';

// When the terminal or launcher that started the app goes away, stdout and
// stderr become broken pipes and every console write fails (EPIPE). Unhandled,
// that failure is emitted as an 'error' on the stream, becomes an uncaught
// exception, and the uncaughtException handler's own console.error fails the
// same way, forever: Electron's main thread spun at 100 % of a core and stopped
// answering IPC and window messages. That is what the rig showed on 21 Sep
// (no geometry reported, gaze dead) and on 22 Sep 2026 (window hung, a YouTube
// page left over the Home screen because its close request was never handled;
// stack read from the hung process: uncaughtException -> console.error ->
// EPIPE write -> uncaughtException ...). With this guard a failed console
// write is a lost log line, and later lines go to a bounded file instead.

const FALLBACK_MAX_BYTES = 2 * 1024 * 1024;
let consoleBroken = false;

export function isConsoleBroken(): boolean {
  return consoleBroken;
}

// Local time, like the launcher's dev-YYYYMMDD-HHMMSS.log names.
function localStamp(date: Date, forFile: boolean): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`;
  if (forFile) return `${day}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  return `${day} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function describe(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Install once, before anything logs. `logDir` is asked for only if the
 * console breaks; return null to drop further lines.
 */
export function installStdioGuard(logDir: () => string | null): void {
  let fallbackPath: string | null = null;
  let written = 0;

  const writeFallback = (level: string, args: unknown[]) => {
    if (!fallbackPath || written >= FALLBACK_MAX_BYTES) return;
    const line = `${localStamp(new Date(), false)} [${level}] ${args.map(describe).join(' ')}\n`;
    written += Buffer.byteLength(line);
    try {
      fs.appendFileSync(fallbackPath, written >= FALLBACK_MAX_BYTES ? `${line}[log limit reached]\n` : line);
    } catch {
      fallbackPath = null;
    }
  };

  const onBroken = () => {
    if (consoleBroken) return;
    consoleBroken = true;
    try {
      const dir = logDir();
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
        fallbackPath = path.join(dir, `main-console-${localStamp(new Date(), true)}.log`);
      }
    } catch {
      fallbackPath = null;
    }
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      (console as any)[level] = (...args: unknown[]) => writeFallback(level, args);
    }
    writeFallback('warn', ['[Main] The launching console went away; further log lines are written here.']);
  };

  for (const stream of [process.stdout, process.stderr]) {
    try {
      stream?.on?.('error', onBroken);
    } catch {
      // No stream to guard (e.g. started without a console).
    }
  }

  // Report an uncaught exception at most once at a time, and never let the
  // report itself throw.
  let reporting = false;
  process.on('uncaughtException', (error) => {
    if (reporting) return;
    reporting = true;
    try {
      console.error('Uncaught exception:', error);
    } catch {
      // The console itself failed; nothing more to do.
    } finally {
      reporting = false;
    }
  });
}
