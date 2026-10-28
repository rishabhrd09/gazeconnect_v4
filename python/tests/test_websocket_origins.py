"""Which pages may open the backend's WebSocket (python/main.py allowed_origins).

Browsers apply no CORS to WebSockets: without an Origin check any web page open
in Chrome or Edge could dial ws://127.0.0.1:8765, make the app speak, change
its screens and settings, and read everything it broadcasts. The backend here
is started the way test_port_contract.py starts one (a port of its own, a
temporary data directory, simulated gaze), so these tests never touch a running
app (8765), the eye tracker helper (5555) or the patient's data.
"""
import asyncio
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

import main  # noqa: E402

VENV_PYTHON = ROOT / 'python' / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
START_TIMEOUT_S = 90  # Cold start loads the prediction engine.
STOP_TIMEOUT_S = 30
VITE_PORT = 5181      # Not 5173: the launcher moves the interface server when 5173 is taken.


def pick_free_port() -> int:
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


class AllowedOriginsTest(unittest.TestCase):
    def setUp(self):
        environment = mock.patch.dict(os.environ)
        environment.start()
        self.addCleanup(environment.stop)
        os.environ.pop('GAZECONNECT_VITE_PORT', None)

    def test_the_interface_tools_and_the_default_development_server(self):
        self.assertEqual(main.allowed_origins(),
                         [None, 'file://', 'http://localhost:5173', 'http://127.0.0.1:5173'])

    def test_the_development_server_on_the_port_the_launcher_chose(self):
        os.environ['GAZECONNECT_VITE_PORT'] = '5176'
        self.assertEqual(main.allowed_origins()[2:], ['http://localhost:5176', 'http://127.0.0.1:5176'])

    def test_a_malformed_port_falls_back_to_the_default(self):
        os.environ['GAZECONNECT_VITE_PORT'] = 'abc'
        self.assertIn('http://localhost:5173', main.allowed_origins())

    def test_null_is_never_accepted(self):
        # Sandboxed frames and data: pages on any website send it.
        self.assertNotIn('null', main.allowed_origins())


class BackendOriginTest(unittest.TestCase):
    """One real backend, dialled with each kind of Origin in turn."""

    @classmethod
    def setUpClass(cls):
        cls.port = pick_free_port()
        cls.tmp = tempfile.mkdtemp(prefix='gazeconnect-origins-')
        cls.log = open(os.path.join(cls.tmp, 'backend.log'), 'w+', encoding='utf-8', errors='replace')
        cls.process = subprocess.Popen(
            [str(VENV_PYTHON), str(ROOT / 'python' / 'main.py'),
             '--host', '127.0.0.1', '--port', str(cls.port), '--simulate', '--no-tobii',
             '--data-dir', cls.tmp, '--survey-data-dir', cls.tmp],
            cwd=str(ROOT / 'python'), env=dict(os.environ, GAZECONNECT_VITE_PORT=str(VITE_PORT)),
            stdin=subprocess.PIPE, stdout=cls.log, stderr=subprocess.STDOUT)
        deadline = time.time() + START_TIMEOUT_S
        while port_is_free(cls.port):
            if cls.process.poll() is not None or time.time() > deadline:
                cls.log.seek(0)
                tail = cls.log.read()[-2000:]
                cls.tearDownClass()
                raise RuntimeError(f'backend did not start listening: {tail}')
            time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        if cls.process.poll() is None:
            cls.process.kill()
            cls.process.wait(timeout=STOP_TIMEOUT_S)
        cls.log.close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def first_reply(self, origin):
        """'connected' when the backend lets a client sending this Origin in, else the HTTP status."""
        import websockets

        async def dial():
            extra = {} if origin is None else {'origin': origin}
            try:
                async with websockets.connect(f'ws://127.0.0.1:{self.port}', open_timeout=20, **extra) as ws:
                    while True:
                        message = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
                        if message.get('type') == 'connected':
                            return 'connected'
            except websockets.exceptions.InvalidStatus as refused:
                return refused.response.status_code
        return asyncio.run(dial())

    def test_the_interface_and_local_tools_get_in(self):
        for origin in (None, 'file://', f'http://localhost:{VITE_PORT}', f'http://127.0.0.1:{VITE_PORT}'):
            with self.subTest(origin=origin):
                self.assertEqual(self.first_reply(origin), 'connected')

    def test_every_other_page_is_refused(self):
        for origin in ('https://www.youtube.com', 'https://attacker.example', 'null',
                       'http://localhost:5173',  # a development server on a port the launcher did not choose
                       'http://localhost', 'file://attacker', 'chrome-extension://abcdefghijklmnop'):
            with self.subTest(origin=origin):
                self.assertEqual(self.first_reply(origin), 403)

    def test_a_refused_page_does_not_keep_the_interface_out(self):
        self.assertEqual(self.first_reply('https://attacker.example'), 403)
        self.assertEqual(self.first_reply('file://'), 'connected')


if __name__ == '__main__':
    unittest.main()
