"""Finite offline preview benchmark. Never connects to the gaze backend."""
import gc
import json
import platform
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'tools'), str(ROOT / 'python')]
from compass_presentation import normalise, render
from compass_resources import RenderResources, MAX_CACHE_BYTES, MAX_CACHE_ITEMS

def peak_memory_bytes():
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in ('peak_working', 'working', 'peak_paged',
                'paged', 'peak_nonpaged', 'nonpaged', 'pagefile', 'peak_pagefile')]
        counters = Counters(); counters.cb = ctypes.sizeof(counters)
        query = ctypes.WinDLL('psapi', use_last_error=True).GetProcessMemoryInfo
        query.argtypes = (wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD)
        query.restype = wintypes.BOOL
        if not query(wintypes.HANDLE(-1), ctypes.byref(counters), counters.cb):
            raise ctypes.WinError(ctypes.get_last_error())
        return counters.peak_working
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak if sys.platform == 'darwin' else peak * 1024

source = normalise(json.loads((ROOT / 'python/tests/fixtures/compass_architectural_map.json').read_text()))
cache = RenderResources()
cases = [dict(view='3d', fmt='svg', room_id=r['placementId'], angle=a)
         for r in source['ground_floor']['placements'] for a in range(4)]
cases += [dict(view='exterior', fmt='png', style=s, angle=a)
          for s in ('verandah','warm-modern','terracotta') for a in range(4)]
latencies = []; passes = []
for iteration in range(3):
    for settings in cases:
        start = time.perf_counter()
        image = cache.render(source, settings, lambda: render(source, **settings))
        latencies.append((time.perf_counter() - start) * 1000)
        assert image.startswith(b'<?xml' if settings['fmt']=='svg' else b'\x89PNG')
    gc.collect()
    peak = peak_memory_bytes()
    passes.append({'iteration':iteration+1, 'cache':cache.stats(), 'process_peak_mib':round(peak/1024**2,2)})
    assert cache.stats()['bytes'] <= MAX_CACHE_BYTES
    assert cache.stats()['items'] <= MAX_CACHE_ITEMS
cached=[]
for _ in range(20):
    start=time.perf_counter();cache.render(source,cases[-1],lambda:render(source,**cases[-1]));cached.append((time.perf_counter()-start)*1000)
result={'platform':platform.platform(),'python':platform.python_version(),'renders':len(latencies),
        'uncached_median_ms':round(statistics.median(latencies),1),'uncached_p95_ms':round(sorted(latencies)[int(.95*(len(latencies)-1))],1),
        'cached_median_ms':round(statistics.median(cached),2),'passes':passes,
        'scope':'Python on-screen image renderer (room SVG, exterior PNG), this machine only; not GPU or Tobii end-to-end latency.'}
print(json.dumps(result,indent=2))
