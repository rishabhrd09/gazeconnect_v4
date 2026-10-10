"""A spawned worker process must never outlive the backend that started it.

Electron ends the backend with a hard kill (TerminateProcess on Windows), and when
Electron itself is closed abruptly (its console window closed, Task Manager, a crash)
the venv launcher's job object ends only the backend: a multiprocessing worker
silently breaks away from that job and stays alive. A Kokoro voice worker left that
way held about 400 MB for two days on the maintainer's 8 GB laptop (10 Oct 2026),
memory the next session's YouTube page then lacked. The pool's or queue's pipes do
not tell the worker, because the worker holds both of their ends; the parent's
process handle does, on every platform.
"""
from __future__ import annotations

import multiprocessing
import os
import sys
import threading

_WATCHING = False


def end_this_process() -> None:
    """Ends at once, without running shutdown code or DLL unload routines.

    A worker with an audio stream or ONNX Runtime loaded must not be able to hang in
    its own exit after the backend is gone."""
    if sys.platform == 'win32':
        import _winapi
        _winapi.TerminateProcess(_winapi.GetCurrentProcess(), 0)
    os._exit(0)


def exit_with_parent() -> None:
    """In a spawned worker, ends this process as soon as its parent has ended.

    Does nothing in a process that was not started by multiprocessing, and starts
    only one watch however often it is called."""
    global _WATCHING
    parent = multiprocessing.parent_process()
    if parent is None or _WATCHING:
        return
    _WATCHING = True

    def watch() -> None:
        parent.join()
        end_this_process()

    threading.Thread(target=watch, name='parent-watch', daemon=True).start()
