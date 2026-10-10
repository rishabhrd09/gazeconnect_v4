"""One offline Kokoro voice. Inference/audio never run on the gaze event loop.

A spawned worker owns the model, phonemizer and PortAudio stream. The parent
keeps only the newest pending request; generation IDs invalidate old synthesis
and playback immediately on Stop or replacement. No network or system voice.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import multiprocessing as mp
import queue
import re
import threading
import time
from pathlib import Path

from .process_lifetime import exit_with_parent

LOG = logging.getLogger(__name__)
ASSETS = Path(__file__).resolve().parents[1] / 'assets' / 'kokoro'
VOICE = 'af_heart'
MAX_TEXT = 12000
CHUNK_CHARS = 80
SAMPLE_RATE = 24000


def speech_chunks(text: str):
    """Bound inference memory, preserving every non-whitespace character."""
    text = re.sub(r'\s+', ' ', text).strip()
    while text:
        if len(text) <= CHUNK_CHARS:
            yield text
            return
        window = text[:CHUNK_CHARS + 1]
        ends = list(re.finditer(r'[.!?;:]\s', window))
        cut = ends[-1].end() if ends else window.rfind(' ')
        if cut <= 0:
            cut = CHUNK_CHARS
        yield text[:cut].strip()
        text = text[cut:].lstrip()


def verify_assets(root: Path = ASSETS):
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('voice') != VOICE or set(manifest['files']) != {'model_quantized.onnx', 'af_heart.npz'}:
        raise ValueError('Invalid local voice manifest')
    for name, spec in manifest['files'].items():
        path = root / name
        digest = hashlib.sha256()
        with path.open('rb') as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(block)
        if path.stat().st_size != spec['bytes'] or digest.hexdigest() != spec['sha256']:
            raise ValueError(f'Local voice file is incomplete or damaged: {name}')
    return manifest


def load_voice(root: Path = ASSETS):
    # These heavy imports intentionally happen only inside the worker/self-test.
    import onnxruntime as ort
    ort.disable_telemetry_events()
    from kokoro_onnx import Kokoro
    verify_assets(root)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.add_session_config_entry('session.intra_op.allow_spinning', '0')
    options.add_session_config_entry('session.inter_op.allow_spinning', '0')
    options.enable_cpu_mem_arena = False
    session = ort.InferenceSession(str(root / 'model_quantized.onnx'), options,
                                   providers=['CPUExecutionProvider'])
    return Kokoro.from_session(session, str(root / 'af_heart.npz'))


def synthesize(voice, text: str, rate: float):
    import numpy as np
    audio, sample_rate = voice.create(text, voice=VOICE, speed=rate / 150.0, lang='en-us')
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if sample_rate != SAMPLE_RATE or not len(audio) or not np.isfinite(audio).all():
        raise RuntimeError('Local voice returned invalid audio')
    if len(audio) > SAMPLE_RATE * 90:
        raise RuntimeError('Local voice exceeded the audio limit')
    return audio, sample_rate


def _worker(requests, events, generation, shutdown, root: str):
    # Do not import pyttsx3, call an OS narrator or fall back to another voice.
    try:
        import sounddevice as sd
        voice = load_voice(Path(root))
        # Warm the graph before reporting readiness, without playing anything.
        synthesize(voice, 'Hello.', 150)
        events.put(('ready', ''))
    except Exception:
        LOG.exception('Kokoro initialization failed')
        events.put(('error', 'Local voice could not start. Run setup.bat and check-windows.bat.'))
        return
    while not shutdown.is_set():
        try:
            item = requests.get(timeout=0.1)
        except queue.Empty:
            continue
        version, text, rate, volume = item
        if version != generation.value:
            continue
        try:
            for chunk in speech_chunks(text):
                if shutdown.is_set() or version != generation.value:
                    break
                events.put(('synthesizing', ''))
                audio, sample_rate = synthesize(voice, chunk, rate)
                if shutdown.is_set() or version != generation.value:
                    break
                # A cancellable callback owns playback. No calls to a native
                # audio API from the WebSocket thread; no queue of old phrases.
                offset = 0
                def play(outdata, frames, _time, _status):
                    nonlocal offset
                    outdata.fill(0)
                    if shutdown.is_set() or version != generation.value:
                        raise sd.CallbackAbort
                    count = min(frames, len(audio) - offset)
                    outdata[:count, 0] = audio[offset:offset + count] * volume
                    offset += count
                    if offset >= len(audio):
                        raise sd.CallbackStop
                with sd.OutputStream(samplerate=sample_rate, channels=1, dtype='float32',
                                     blocksize=480, callback=play) as stream:
                    events.put(('speaking', ''))
                    while stream.active and not shutdown.wait(0.02):
                        if version != generation.value:
                            stream.abort()
                            break
            events.put(('ready', ''))
        except Exception:
            LOG.exception('Kokoro speech/playback failed')
            events.put(('error', 'Speech could not play. Check your speakers, then select Speak again.'))
            # Keep the loaded voice so a newly connected output device can be
            # tried on the next explicit request; never silently change voices.


def _run_worker(target, requests, events, generation, shutdown, root: str):
    """The voice worker's entry point: it ends with the backend (services/process_lifetime.py).

    Without this, a worker left by an abruptly closed app kept the model, about
    400 MB, for days (found 10 Oct 2026)."""
    exit_with_parent()
    target(requests, events, generation, shutdown, root)


class TTSEngine:
    """Nonblocking facade; only one current and one pending utterance."""
    def __init__(self, enabled: bool = True, *, assets: Path = ASSETS, worker_target=_worker):
        self.enabled = enabled
        self.assets = assets
        self._worker_target = worker_target
        self._ctx = mp.get_context('spawn')
        self._process = None
        self._monitor = None
        self._pending = None
        self._lock = threading.Lock()
        self._closed = False
        self._rate, self._volume = 150.0, 1.0
        self._callback = None
        self._state = 'starting' if enabled else 'disabled'
        self._error = ''
        self._state_since = time.monotonic()

    @property
    def available(self):
        return bool(self.enabled and self._state in ('ready', 'speaking', 'synthesizing')
                    and self._process and self._process.is_alive())

    @property
    def is_speaking(self):
        return self._state == 'speaking'

    def status(self):
        return {'tts_available': self.available, 'tts_voice': VOICE,
                'tts_state': self._state, 'tts_error': self._error}

    def _publish(self, state, error=''):
        self._state, self._error = state, error
        self._state_since = time.monotonic()
        if self._callback:
            self._callback(self.status())

    def start(self, on_status=None):
        if on_status is not None:
            self._callback = on_status
        if not self.enabled or self._closed or (self._process and self._process.is_alive()):
            return
        # The monitor owns restart cleanup; caller never waits for a model.
        if self._monitor and self._monitor.is_alive():
            return
        self._requests = self._ctx.Queue(maxsize=1)
        self._events = self._ctx.Queue(maxsize=16)
        self._generation = self._ctx.Value('Q', 0, lock=False)
        self._shutdown = self._ctx.Event()
        self._process = self._ctx.Process(target=_run_worker,
            args=(self._worker_target, self._requests, self._events, self._generation, self._shutdown, str(self.assets)),
            name='kokoro-af-heart', daemon=True)
        self._publish('starting')
        try:
            self._process.start()
        except Exception:
            LOG.exception('Could not spawn the local voice worker')
            self._requests.close()
            self._events.close()
            self._publish('error', 'Local voice could not start. Restart GazeConnect.')
            return
        self._monitor = threading.Thread(target=self._watch, name='kokoro-status', daemon=True)
        self._monitor.start()

    def _watch(self):
        try:
            while not self._shutdown.wait(0.02):
                try:
                    while True:
                        state, error = self._events.get_nowait()
                        self._publish(state, error)
                except queue.Empty:
                    pass
                limit = 60 if self._state == 'starting' else 45
                if self._state in ('starting', 'synthesizing') and time.monotonic() - self._state_since > limit:
                    self._process.terminate()
                    self._process.join(timeout=1)
                    self._publish('error', 'Local voice took too long. Select Speak to try again.')
                    break
                if not self._process.is_alive():
                    if self._state != 'error':
                        self._publish('error', 'Local voice stopped. Select Speak to try again.')
                    break
                with self._lock:
                    if self._pending is not None:
                        try:
                            self._requests.put_nowait(self._pending)
                            self._pending = None
                        except queue.Full:
                            pass
        finally:
            self._requests.cancel_join_thread()
            self._requests.close()
            self._events.close()

    def speak(self, text: str):
        if not isinstance(text, str) or not text.strip() or not self.enabled or self._closed:
            return False
        if len(text) > MAX_TEXT:
            self.stop()
            self._publish('error', 'This message is too long. Speak it in smaller parts.')
            return False
        self.start()
        if self._volume <= 0 or not self._process or not self._process.is_alive():
            return False
        with self._lock:
            self._generation.value += 1
            self._pending = (self._generation.value, text, self._rate, self._volume)
        return True

    def stop(self):
        with self._lock:
            self._pending = None
            if hasattr(self, '_generation'):
                self._generation.value += 1

    def set_rate(self, rate):
        try:
            rate = float(rate)
            if math.isfinite(rate):
                self._rate = max(80.0, min(250.0, rate))
        except (ValueError, TypeError):
            pass

    def set_volume(self, volume):
        try:
            volume = float(volume)
            if math.isfinite(volume):
                self._volume = max(0.0, min(1.0, volume))
                if self._volume == 0:
                    self.stop()
        except (ValueError, TypeError):
            pass

    def close(self):
        if self._closed:
            return
        self._closed = True
        self.stop()
        if hasattr(self, '_shutdown'):
            self._shutdown.set()
        if self._process and self._process.pid:
            self._process.join(timeout=0.5)
            if self._process.is_alive():
                self._process.terminate()
                self._process.join(timeout=1)
        if self._monitor:
            self._monitor.join(timeout=1)
        self._publish('disabled')


def self_test():
    """Real offline inference, no speaker/device required (also frozen Windows)."""
    import numpy as np
    import sounddevice as sd
    sd.get_portaudio_version()  # Load the packaged native library, without needing speakers.
    started = time.monotonic()
    voice = load_voice()
    audio, rate = synthesize(voice, 'Hello. I would like some water, please.', 150)
    if float(np.max(np.abs(audio))) < 0.01:
        raise RuntimeError('Local voice self-test produced silence')
    return {'voice': VOICE, 'model': 'Kokoro-82M v1.0 ONNX int8',
            'audio_seconds': round(len(audio) / rate, 2),
            'load_and_synthesis_seconds': round(time.monotonic() - started, 2)}
