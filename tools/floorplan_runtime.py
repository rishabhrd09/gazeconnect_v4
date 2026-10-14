"""Lifetime of the floor-plan process: it never outlives the app, and it leaves when idle.

Electron starts this process lazily, the first time a plan is opened, with
`--parent-pid <its own pid>` and `--idle-seconds 600`. Without the parent watch an
Electron that is killed or crashes leaves the server holding port 5050 and its
memory; the backend learned the same lesson (python/main.py, watch_parent_process,
whose Windows handle wait this copies: importing the backend here would load the
gaze service's dependencies). The idle exit uses its own exit code, so Electron does
not mistake it for a crash and respawn it; the next plan request starts it again.
"""
from __future__ import annotations

import os
import sys
import threading
import time

IDLE_EXIT_CODE = 75   # Electron (startFloorplanServer) treats this as "idle", not a failure.


def end_now(code: int = 0) -> None:
    """Leave at once: no shutdown handlers that could hang after the app is gone."""
    sys.stdout.flush()
    os._exit(code)


def watch_parent(parent_pid: int, on_gone=end_now) -> threading.Thread:
    """Call `on_gone` once the process `parent_pid` has ended (never reads stdin)."""
    def wait() -> None:
        if sys.platform == 'win32':
            import _winapi
            try:
                handle = _winapi.OpenProcess(_winapi.SYNCHRONIZE, False, parent_pid)
            except OSError as exc:
                if getattr(exc, 'winerror', None) == 87:      # No such process: already gone.
                    on_gone()
                else:
                    print(f'Cannot watch the parent process {parent_pid}: {exc}', flush=True)
                return
            try:
                _winapi.WaitForSingleObject(handle, _winapi.INFINITE)
            finally:
                _winapi.CloseHandle(handle)
        else:
            while True:
                try:
                    os.kill(parent_pid, 0)
                except ProcessLookupError:
                    break
                except PermissionError:
                    pass                  # Alive, owned by someone else.
                time.sleep(1.0)
        on_gone()
    thread = threading.Thread(target=wait, name='parent-watch', daemon=True)
    thread.start()
    return thread


class IdleWatch:
    """Ends the process after `seconds` without a request, never during a job."""

    def __init__(self, seconds: float, busy, on_idle=None, poll: float = 10.0):
        self.seconds, self.busy, self.poll = float(seconds), busy, poll
        self.on_idle = on_idle or (lambda: end_now(IDLE_EXIT_CODE))
        self.last = time.monotonic()
        self._lock = threading.Lock()

    def touch(self) -> None:
        with self._lock:
            self.last = time.monotonic()

    def idle_for(self) -> float:
        with self._lock:
            return time.monotonic() - self.last

    def start(self) -> threading.Thread:
        def run() -> None:
            while True:
                time.sleep(self.poll)
                if self.idle_for() >= self.seconds and not self.busy():
                    print(f'Floor-plan service idle for {int(self.seconds)} s; leaving until the next plan.', flush=True)
                    self.on_idle()
                    return
        thread = threading.Thread(target=run, name='idle-watch', daemon=True)
        thread.start()
        return thread


BELOW_NORMAL_PRIORITY_CLASS = 0x00004000


def lower_priority() -> None:
    """Drawing yields the processor to gaze: below-normal priority on Windows, nice +5 elsewhere.

    The floor-plan service only draws when the person opens a plan, and a drawing may keep one core
    busy for a second or two; the gaze processes (Tobii helper, backend, interface) keep normal
    priority, so on a busy laptop they come first. Set from inside the process, so the dev venv's
    launcher (whose interpreter is its child) cannot race it. Never fatal."""
    try:
        if sys.platform == 'win32':
            import ctypes
            kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel32.GetCurrentProcess.restype = ctypes.c_void_p
            kernel32.SetPriorityClass.argtypes = (ctypes.c_void_p, ctypes.c_uint32)
            kernel32.SetPriorityClass.restype = ctypes.c_int
            kernel32.SetPriorityClass(kernel32.GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS)
        else:
            os.nice(5)
    except Exception:
        pass


def process_memory() -> dict:
    """This process's own memory, for /api/health: private bytes on Windows, peak resident set elsewhere."""
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes

        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in ('peak_working', 'working', 'peak_paged', 'paged',
                                                     'peak_nonpaged', 'nonpaged', 'pagefile', 'peak_pagefile', 'private')]
        counters = Counters(); counters.cb = ctypes.sizeof(counters)
        query = ctypes.WinDLL('psapi', use_last_error=True).GetProcessMemoryInfo
        query.argtypes = (wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD)
        query.restype = wintypes.BOOL
        if not query(wintypes.HANDLE(-1), ctypes.byref(counters), counters.cb):
            return {}
        return {'privateMb': round(counters.private / 2**20, 1), 'peakPrivateMb': round(counters.peak_pagefile / 2**20, 1),
                'workingSetMb': round(counters.working / 2**20, 1)}
    try:
        import resource
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return {'peakResidentMb': round((peak if sys.platform == 'darwin' else peak * 1024) / 2**20, 1)}
    except Exception:
        return {}


def parse_args(argv):
    """`--parent-pid N` and `--idle-seconds N`; anything else is ignored (a frozen exe may add flags)."""
    options = {'parent_pid': None, 'idle_seconds': 0.0}
    args = list(argv)
    for flag, key, cast in (('--parent-pid', 'parent_pid', int), ('--idle-seconds', 'idle_seconds', float)):
        if flag in args:
            index = args.index(flag)
            try:
                options[key] = cast(args[index + 1])
            except (IndexError, ValueError):
                raise SystemExit(f'{flag} needs a number')
    return options
