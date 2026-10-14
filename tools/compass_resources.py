"""Bounds for the optional Compass renderer, separate from the gaze process.

One CPU job runs at a time. A request that names a `jobId` (the Compass studio's
previews and downloads) waits in one pending slot per channel, and the newest request
in a channel wins: it replaces the pending one and asks a running job of the same
channel to stop at its next checkpoint. Superseded work is never cached. Requests
without a job id keep the original contract: no waiting, 429 while anything runs.
"""
from __future__ import annotations

from collections import OrderedDict
from contextlib import contextmanager
import hashlib
import itertools
import json
import math
import threading
import time

MAX_REQUEST_BYTES = 256 * 1024
MAX_CACHE_BYTES = 16 * 1024 * 1024
MAX_CACHE_ITEMS = 12
WAIT_SECONDS = 30.0          # The longest a newer request waits for the running one to stop.
CHANNELS = ('preview', 'export')


class RendererBusy(Exception):
    pass


class JobCancelled(Exception):
    """A newer request for the same view replaced this one; nothing is returned or cached."""


class JobTimeout(Exception):
    """A stage passed its deadline; the client may try again (the result was not cached)."""


def validate_source(source):
    """Only the bounded 4x4, at most two-floor Compass contract enters Cairo."""
    if not isinstance(source, dict):
        raise ValueError('A Compass Map is required.')
    if len(json.dumps(source, allow_nan=False).encode()) > MAX_REQUEST_BYTES:
        raise ValueError('This map is too large for the Compass preview.')
    grid = source.get('grid_size', {'rows': 4, 'cols': 4})
    if grid != {'rows': 4, 'cols': 4}:
        raise ValueError('The Compass preview supports a 4 by 4 grid.')
    plot = source.get('plot', {})
    if not isinstance(plot, dict):
        raise ValueError('Valid plot dimensions are required.')
    for name in ('width_ft', 'depth_ft'):
        try:
            value = float(plot.get(name, 0))
        except (TypeError, ValueError, OverflowError):
            raise ValueError('Use plot dimensions between 4 and 500 feet.') from None
        if not math.isfinite(value) or not 4 <= value <= 500:
            raise ValueError('Use plot dimensions between 4 and 500 feet.')
    for floor in ('ground_floor', 'first_floor'):
        data = source.get(floor)
        if data is None:
            continue
        if not isinstance(data, dict) or not isinstance(data.get('placements', []), list):
            raise ValueError('Invalid floor data.')
        rooms = data.get('placements', [])
        if len(rooms) > 16:
            raise ValueError('A Compass floor can contain at most 16 rooms.')
        rectangles = 0
        for room in rooms:
            if not isinstance(room, dict) or len(str(room.get('room', ''))) > 120:
                raise ValueError('Invalid room details.')
            cells = room.get('cells', [])
            rects = room.get('geometryRects', [])
            if not isinstance(cells, list) or len(cells) > 16 or not isinstance(rects, list) or len(rects) > 16:
                raise ValueError('Room geometry exceeds the Compass grid.')
            rectangles += len(rects)
        if rectangles > 64:
            raise ValueError('This floor has too many boundary segments.')


class Job:
    _order = itertools.count()

    def __init__(self, job_id, channel, plan_hash=None, deadline_s=None):
        self.id, self.channel, self.plan_hash = job_id, channel, plan_hash
        self.cancelled = threading.Event()
        self.deadline_s = deadline_s
        self.deadline = None
        self.started = None
        self.arrival = next(Job._order)

    def describe(self):
        return {'jobId': self.id, 'channel': self.channel, 'planHash': self.plan_hash,
                'runningS': round(time.monotonic() - self.started, 2) if self.started else None}


_current = threading.local()


def checkpoint():
    """Cooperative stop between stages: raises when a newer request replaced this job or it ran late."""
    job = getattr(_current, 'job', None)
    if job is None:
        return
    if job.cancelled.is_set():
        raise JobCancelled('A newer view was requested.')
    if job.deadline is not None and time.monotonic() > job.deadline:
        raise JobTimeout('Drawing this view took too long. Please try again.')


def set_deadline(seconds):
    """Give the current stage `seconds` from now (no effect outside a job)."""
    job = getattr(_current, 'job', None)
    if job is not None:
        job.deadline = time.monotonic() + seconds


class RenderResources:
    """One active CPU job, a latest-wins pending slot per channel, byte-bounded encoded-image LRU.

    Only immutable encoded images are retained. No Cairo surface, scene, user
    project copy or GPU resource lives in this cache. It expires with service.
    """
    def __init__(self, max_bytes=MAX_CACHE_BYTES, max_items=MAX_CACHE_ITEMS):
        self.max_bytes, self.max_items = max_bytes, max_items
        self._images = OrderedDict()
        self._bytes = 0
        self._lock = threading.Lock()
        self._cond = threading.Condition()
        self._running = None
        self._pending = {}
        self.completed = 0
        self.superseded = 0

    def busy(self):
        with self._cond:
            return self._running is not None or bool(self._pending)

    @contextmanager
    def job(self):
        """The original contract: run now or raise RendererBusy (429); never wait."""
        with self._cond:
            if self._running is not None or self._pending:
                raise RendererBusy('Finishing the previous view. Please try again in a moment.')
            job = self._running = Job(None, 'legacy')
            job.started = time.monotonic()
        try:
            yield job
        finally:
            with self._cond:
                self._running = None
                self._cond.notify_all()

    @contextmanager
    def latest(self, job_id, channel='preview', plan_hash=None, deadline_s=None, wait_s=WAIT_SECONDS):
        """Run when the worker is free; the newest request in `channel` wins."""
        if channel not in CHANNELS:
            raise ValueError('Unknown job channel.')
        job = Job(str(job_id), channel, plan_hash, deadline_s)
        give_up = time.monotonic() + wait_s
        with self._cond:
            older = self._pending.get(channel)
            if older is not None:
                older.cancelled.set()
                self.superseded += 1
            self._pending[channel] = job
            if self._running is not None and self._running.channel == channel:
                self._running.cancelled.set()
            self._cond.notify_all()
            while True:
                if job.cancelled.is_set():
                    if self._pending.get(channel) is job:
                        del self._pending[channel]
                    raise JobCancelled('A newer view was requested.')
                first = min(self._pending.values(), key=lambda j: j.arrival)
                if self._running is None and first is job:
                    break
                remaining = give_up - time.monotonic()
                if remaining <= 0:
                    if self._pending.get(channel) is job:
                        del self._pending[channel]
                    raise RendererBusy('Finishing the previous view. Please try again in a moment.')
                self._cond.wait(min(remaining, 1.0))
            del self._pending[channel]
            self._running = job
            job.started = time.monotonic()
            if deadline_s:
                job.deadline = job.started + deadline_s
        _current.job = job
        try:
            yield job
            if job.cancelled.is_set():    # Replaced while finishing: still returns nothing.
                raise JobCancelled('A newer view was requested.')
            self.completed += 1
        finally:
            _current.job = None
            with self._cond:
                self._running = None
                self._cond.notify_all()

    def _key(self, source, settings):
        return hashlib.sha256(json.dumps([source, settings], sort_keys=True, allow_nan=False).encode()).digest()

    def cached(self, source, settings):
        key = self._key(source, settings)
        with self._lock:
            if key in self._images:
                self._images.move_to_end(key)
                return self._images[key]
        return None

    def store(self, source, settings, output):
        if len(output) > self.max_bytes:
            return
        key = self._key(source, settings)
        with self._lock:
            # A concurrent identical request may have completed meanwhile.
            old = self._images.pop(key, b'')
            self._bytes -= len(old)
            while self._images and (self._bytes + len(output) > self.max_bytes or len(self._images) >= self.max_items):
                _, removed = self._images.popitem(last=False)
                self._bytes -= len(removed)
            self._images[key] = output
            self._bytes += len(output)

    def render(self, source, settings, produce):
        validate_source(source)
        hit = self.cached(source, settings)
        if hit is not None:
            return hit
        with self.job():
            output = produce()
        self.store(source, settings, output)
        return output

    def render_latest(self, source, settings, produce, *, job_id, channel='preview', plan_hash=None, deadline_s=None):
        """Cached bytes at once; otherwise run as the newest job of its channel and cache only finished work."""
        hit = self.cached(source, settings)
        if hit is not None:
            return hit
        with self.latest(job_id, channel, plan_hash, deadline_s):
            output = produce()
        self.store(source, settings, output)
        return output

    def stats(self):
        with self._lock:
            return {'items': len(self._images), 'bytes': self._bytes}

    def state(self):
        with self._cond:
            running = self._running.describe() if self._running is not None else None
            pending = [j.describe() for j in sorted(self._pending.values(), key=lambda j: j.arrival)]
        return {'running': running, 'pending': pending, 'completed': self.completed,
                'superseded': self.superseded, 'cache': self.stats()}


resources = RenderResources()
