"""Local voice lifecycle and cancellation, without playing patient speech."""
import pathlib
import queue
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from services.local_voice import TTSEngine, speech_chunks, MAX_TEXT, CHUNK_CHARS


def fake_worker(requests, events, generation, shutdown, root):
    # Delayed initialization and synthesis reveal stale request races.
    if shutdown.wait(0.1):
        return
    events.put(('ready', ''))
    while not shutdown.is_set():
        try:
            version, text, rate, volume = requests.get(timeout=0.05)
        except queue.Empty:
            continue
        if shutdown.wait(0.15) or version != generation.value:
            continue
        events.put(('speaking', f'{text}|{rate}|{volume}'))
        while not shutdown.wait(0.02) and version == generation.value:
            pass
        events.put(('ready', ''))


class TTSAvailableTests(unittest.TestCase):
    def make_engine(self):
        engine = TTSEngine(worker_target=fake_worker)
        events = []
        engine.start(lambda s: events.append(s.copy()))
        self.addCleanup(engine.close)
        return engine, events

    def wait_for(self, predicate, timeout=5):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if predicate():
                return
            time.sleep(0.01)
        self.fail('voice worker did not reach expected state')

    def test_disabled_engine_reports_unavailable(self):
        e = TTSEngine(enabled=False)
        e.start()
        self.assertFalse(e.available)
        self.assertFalse(e.speak('Hello'))
        self.assertEqual(e.status()['tts_state'], 'disabled')
        e.close()

    def test_ready_is_not_claimed_until_worker_ready(self):
        e, events = self.make_engine()
        self.assertFalse(e.available)
        self.assertEqual(e.status()['tts_voice'], 'af_heart')
        self.wait_for(lambda: e.available)
        self.assertTrue(any(s['tts_state'] == 'ready' for s in events))

    def test_latest_request_wins_while_warming_up(self):
        e, events = self.make_engine()
        for i in range(100):
            e.speak(f'phrase {i}')
        self.wait_for(lambda: any(s['tts_state'] == 'speaking' for s in events))
        self.assertEqual([s['tts_error'].split('|')[0] for s in events if s['tts_state'] == 'speaking'], ['phrase 99'])

    def test_stop_invalidates_synthesis_and_pending_request(self):
        e, events = self.make_engine()
        e.speak('must not play')
        time.sleep(0.07)
        e.stop()
        time.sleep(0.5)
        self.assertFalse(any(s['tts_state'] == 'speaking' for s in events))
        e.speak('new message')
        self.wait_for(lambda: e.is_speaking)
        e.stop()
        self.wait_for(lambda: not e.is_speaking)

    def test_rate_volume_and_mute(self):
        e, events = self.make_engine()
        e.set_rate(190); e.set_volume(0.4); e.speak('hello')
        self.wait_for(lambda: e.is_speaking)
        self.assertTrue(any(s['tts_error'] == 'hello|190.0|0.4' for s in events))
        e.set_volume(0)
        self.wait_for(lambda: not e.is_speaking)
        self.assertFalse(e.speak('muted'))
        e.set_rate(float('nan')); e.set_volume(float('nan'))
        self.assertEqual(e._rate,190);self.assertEqual(e._volume,0)

    def test_missing_assets_reports_error_without_other_voice(self):
        with tempfile.TemporaryDirectory() as root:
            e = TTSEngine(assets=pathlib.Path(root)); self.addCleanup(e.close)
            e.start()
            self.wait_for(lambda: e.status()['tts_state'] == 'error', 15)
            self.assertFalse(e.available)
            self.assertIn('setup.bat', e.status()['tts_error'])

    def test_real_model_stop_during_synthesis_never_plays(self):
        e = TTSEngine()
        events = []
        self.addCleanup(e.close)
        e.start(lambda s: events.append(s.copy()))
        self.wait_for(lambda: e.available or e.status()['tts_state'] == 'error', 60)
        self.assertTrue(e.available, e.status())
        e.speak('Please show me the staircase and the living room on the ground floor.')
        self.wait_for(lambda: e.status()['tts_state'] == 'synthesizing', 10)
        start = time.monotonic()
        e.stop()
        self.assertLess(time.monotonic() - start, 0.05)
        self.wait_for(lambda: e.status()['tts_state'] == 'ready', 30)
        self.assertFalse(any(s['tts_state'] == 'speaking' for s in events))

    def test_close_joins_worker_and_is_idempotent(self):
        e, _ = self.make_engine()
        e.speak('hello');e.close();e.close()
        self.assertFalse(e._process.is_alive())
        self.assertFalse(e._monitor.is_alive())
        self.assertFalse(e.speak('closed'))

    def test_limits_do_not_silently_truncate(self):
        e, _ = self.make_engine()
        self.assertFalse(e.speak('x'*(MAX_TEXT+1)))
        self.assertIn('smaller parts', e.status()['tts_error'])
        text = ('This is a full sentence. Another room is here! ' * 40).strip()
        chunks = list(speech_chunks(text))
        self.assertTrue(all(0 < len(c) <= CHUNK_CHARS for c in chunks))
        self.assertEqual(' '.join(chunks), text)
        self.assertEqual(list(speech_chunks('  ')), [])


# Plays the backend: starts the voice engine with a stand-in worker, reports the
# worker's process id, then lives until it is killed.
BACKEND_SCRIPT = '''
import sys, time
sys.path.insert(0, sys.argv[1])
from services.local_voice import TTSEngine

def lingering_worker(requests, events, generation, shutdown, root):
    events.put(('ready', ''))
    while True:
        time.sleep(1)

if __name__ == '__main__':
    engine = TTSEngine(worker_target=lingering_worker)
    engine.start()
    while not engine.available:
        time.sleep(0.02)
    print(engine._process.pid, flush=True)
    time.sleep(120)
'''


def _pid_alive(pid):
    if sys.platform == 'win32':
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        code = ctypes.c_ulong()
        kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        kernel32.CloseHandle(handle)
        return code.value == 259  # STILL_ACTIVE
    import os
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


class VoiceWorkerLifetimeTests(unittest.TestCase):
    def test_worker_exits_when_the_backend_is_killed(self):
        """The app closed abruptly ends the backend without its shutdown code: the
        voice worker, which holds the model (about 400 MB), must go with it."""
        import subprocess
        root = pathlib.Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            script = pathlib.Path(temp) / 'backend.py'
            script.write_text(BACKEND_SCRIPT, encoding='utf-8')
            backend = subprocess.Popen([sys.executable, str(script), str(root)],
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            try:
                worker_pid = int(backend.stdout.readline())
                self.assertTrue(_pid_alive(worker_pid))
            finally:
                backend.kill()  # TerminateProcess on Windows: no shutdown code runs
                backend.wait(10)
            deadline = time.monotonic() + 10
            while _pid_alive(worker_pid) and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertFalse(_pid_alive(worker_pid), 'voice worker outlived the backend')


if __name__ == '__main__':
    unittest.main(verbosity=2)
