"""The backend's port contract and how it stops with the app.

Three silent failures this pins down, all seen on the rig:
  * a backend that moved to another port when 8765 was held looked like a
    healthy start while the interface (which always dials the configured port)
    talked to whatever still held it -- usually a stale backend;
  * a backend that outlived Electron kept its port, so the next launch either
    refused to start or connected to that stale process;
  * the first fix for that (23 Sep 2026) read stdin in a thread, which on
    Windows made the prediction worker fail to start: the keyboard showed no
    word predictions at all, and every other check still passed. A backend
    started the way Electron starts it must therefore answer a prediction.

The subprocess tests use a port of their own and a temporary data directory, so
they never touch a running app (8765), the eye tracker helper (5555), or the
patient's data.
"""
import asyncio
import json
import os
import pathlib
import socket
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import main  # noqa: E402

VENV_PYTHON = ROOT / 'python' / '.venv' / 'Scripts' / 'python.exe'
START_TIMEOUT_S = 90      # Cold start loads the prediction engine.
STOP_TIMEOUT_S = 30
PREDICTION_TIMEOUT_S = 30  # The first request also waits for the worker to warm up.


def pick_free_port() -> int:
    """A free port from the operating system, chosen per test: never 8765 (a
    running app) or 5555 (the helper), and never reused after a backend has
    held it, which Windows keeps for a moment after the process ends."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]
    finally:
        probe.close()



def port_is_free(port: int) -> bool:
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind(('127.0.0.1', port))
        return True
    except OSError:
        return False
    finally:
        probe.close()


class EnsurePortAvailableTest(unittest.TestCase):
    def test_a_free_port_is_accepted_and_left_free(self):
        port = pick_free_port()
        main.ensure_port_available('127.0.0.1', port)
        self.assertTrue(port_is_free(port), 'the probe kept the port')

    def test_a_held_port_is_refused_by_name(self):
        port = pick_free_port()
        holder = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        holder.bind(('127.0.0.1', port))
        holder.listen(1)
        try:
            with self.assertRaises(main.PortInUseError) as caught:
                main.ensure_port_available('127.0.0.1', port)
        finally:
            holder.close()
        message = str(caught.exception)
        self.assertIn(str(port), message)
        self.assertIn('status-dev.bat', message, 'the message must say how to look')


def start_stand_in_parent():
    """A process that plays Electron: it just lives until it is killed."""
    return subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])


class WatchParentProcessTest(unittest.TestCase):
    def test_the_end_of_the_parent_calls_back_once(self):
        parent = start_stand_in_parent()
        self.addCleanup(lambda: parent.poll() is None and parent.kill())
        calls = []
        thread = main.watch_parent_process(parent.pid, lambda: calls.append('gone'))
        time.sleep(0.3)
        self.assertEqual(calls, [], 'called back while the parent was alive')
        parent.kill()
        parent.wait(timeout=10)
        thread.join(timeout=10)
        self.assertEqual(calls, ['gone'])

    def test_a_parent_that_is_already_gone_calls_back_at_once(self):
        parent = start_stand_in_parent()
        parent.kill()
        parent.wait(timeout=10)
        calls = []
        main.watch_parent_process(parent.pid, lambda: calls.append('gone')).join(timeout=10)
        self.assertEqual(calls, ['gone'])

    def test_request_shutdown_before_start_does_nothing(self):
        backend = main.GazeConnectBackend.__new__(main.GazeConnectBackend)
        backend._event_loop = None
        backend._shutdown = None
        backend.request_shutdown('test')          # Must not raise.


@unittest.skipUnless(VENV_PYTHON.exists(), 'needs the project venv')
class BackendProcessTest(unittest.TestCase):
    """Starts real backends, each on a port of its own."""

    def setUp(self):
        self.port = pick_free_port()
        # Outside the checkout: a real start writes prediction data.
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix='gazeconnect-port-test-'))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.started = []

    def tearDown(self):
        for process in self.started:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=STOP_TIMEOUT_S)

    def start_backend(self, *extra):
        # stdin piped, as Electron starts it: the prediction failure only showed then.
        process = subprocess.Popen(
            [str(VENV_PYTHON), str(ROOT / 'python' / 'main.py'),
             '--host', '127.0.0.1', '--port', str(self.port), '--simulate', '--no-tobii',
             '--data-dir', str(self.tmp), '--survey-data-dir', str(self.tmp), *extra],
            cwd=str(ROOT / 'python'), stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.started.append(process)
        return process

    def wait_for_listening(self, process):
        deadline = time.time() + START_TIMEOUT_S
        while time.time() < deadline:
            if process.poll() is not None:
                self.fail(f'backend exited early ({process.returncode}): {process.stdout.read()[-2000:]}')
            if not port_is_free(self.port):
                return
            time.sleep(0.2)
        self.fail('backend never listened')

    def test_a_second_backend_refuses_the_held_port_instead_of_moving(self):
        first = self.start_backend()
        self.wait_for_listening(first)
        second = self.start_backend()
        try:
            second.wait(timeout=START_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            self.fail('the second backend kept running on a port it does not own')
        output = second.stdout.read()
        self.assertEqual(second.returncode, 3, output[-2000:])
        self.assertIn('already in use', output)
        self.assertNotIn('Using fallback port', output)

    def ask_for_predictions(self, text):
        import websockets

        async def ask():
            async with websockets.connect(f'ws://127.0.0.1:{self.port}', max_size=None) as ws:
                await ws.send(json.dumps({'type': 'get_predictions', 'text': text, 'top_k': 12,
                                          'request_id': 1, 'slot_count': 10, 'reset_lineage': False}))
                while True:
                    message = json.loads(await asyncio.wait_for(ws.recv(), timeout=PREDICTION_TIMEOUT_S))
                    if message.get('type') == 'predictions':
                        return message
        return asyncio.run(ask())

    def test_a_backend_started_like_the_app_answers_with_word_predictions(self):
        parent = start_stand_in_parent()
        self.addCleanup(lambda: parent.poll() is None and parent.kill())
        process = self.start_backend('--parent-pid', str(parent.pid))
        self.wait_for_listening(process)
        try:
            reply = self.ask_for_predictions('i need wa')
        except asyncio.TimeoutError:
            self.fail('no prediction reply: the prediction worker did not start')
        slots = [w for w in (reply.get('word_slots') or []) if w]
        self.assertGreaterEqual(len(slots), 5, reply)
        self.assertIn('water', slots)

    def test_an_app_built_before_the_fix_still_gets_predictions(self):
        # It passes the retired --exit-with-parent; the backend must start, and predict.
        process = self.start_backend('--exit-with-parent')
        self.wait_for_listening(process)
        try:
            reply = self.ask_for_predictions('hel')
        except asyncio.TimeoutError:
            self.fail('no prediction reply with the retired flag')
        self.assertIn('help', [w for w in (reply.get('word_slots') or []) if w])

    def test_the_backend_stops_when_the_app_that_started_it_ends(self):
        parent = start_stand_in_parent()
        self.addCleanup(lambda: parent.poll() is None and parent.kill())
        process = self.start_backend('--parent-pid', str(parent.pid))
        self.wait_for_listening(process)
        parent.kill()                             # What a crashed Electron looks like.
        try:
            process.wait(timeout=STOP_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            self.fail('the backend outlived its parent and kept the port')
        deadline = time.time() + 5
        while time.time() < deadline and not port_is_free(self.port):
            time.sleep(0.1)
        self.assertTrue(port_is_free(self.port), 'the port was still held after exit')


if __name__ == '__main__':
    unittest.main()
