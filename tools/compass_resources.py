"""Bounds for the optional Compass renderer, separate from the gaze process."""
from __future__ import annotations

from collections import OrderedDict
from contextlib import contextmanager
import hashlib
import json
import math
from threading import BoundedSemaphore, Lock

MAX_REQUEST_BYTES = 256 * 1024
MAX_CACHE_BYTES = 16 * 1024 * 1024
MAX_CACHE_ITEMS = 12


class RendererBusy(Exception):
    pass


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


class RenderResources:
    """One active CPU job, no waiting queue, byte-bounded encoded-image LRU.

    Only immutable encoded images are retained. No Cairo surface, scene, user
    project copy or GPU resource lives in this cache. It expires with service.
    """
    def __init__(self, max_bytes=MAX_CACHE_BYTES, max_items=MAX_CACHE_ITEMS):
        self.max_bytes, self.max_items = max_bytes, max_items
        self._images = OrderedDict()
        self._bytes = 0
        self._lock = Lock()
        self._job = BoundedSemaphore(1)

    @contextmanager
    def job(self):
        if not self._job.acquire(blocking=False):
            raise RendererBusy('Finishing the previous view. Please try again in a moment.')
        try:
            yield
        finally:
            self._job.release()

    def render(self, source, settings, produce):
        validate_source(source)
        key = hashlib.sha256(json.dumps([source, settings], sort_keys=True, allow_nan=False).encode()).digest()
        with self._lock:
            if key in self._images:
                self._images.move_to_end(key)
                return self._images[key]
        with self.job():
            output = produce()
        if len(output) <= self.max_bytes:
            with self._lock:
                # A concurrent identical request may have completed meanwhile.
                old = self._images.pop(key, b'')
                self._bytes -= len(old)
                while self._images and (self._bytes + len(output) > self.max_bytes or len(self._images) >= self.max_items):
                    _, removed = self._images.popitem(last=False)
                    self._bytes -= len(removed)
                self._images[key] = output
                self._bytes += len(output)
        return output

    def stats(self):
        with self._lock:
            return {'items': len(self._images), 'bytes': self._bytes}


resources = RenderResources()
