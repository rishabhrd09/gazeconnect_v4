"""Which requests the floor-plan service answers (tools/floorplan_server.py refuse_web_pages).

Flask-CORS only decides who may read an answer. Without this lock a web page in
Chrome or Edge, or in the embedded browser, could POST a render (a text/plain
body needs no preflight) and keep the laptop drawing, and a page on a
DNS-rebound name could read the answers too.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))

from floorplan_server import app  # noqa: E402


class FloorplanWebLockTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def status(self, method='get', path='/api/health', **headers):
        return getattr(self.client, method)(path, headers=headers).status_code

    def test_the_app_tests_and_the_development_interface_are_answered(self):
        self.assertEqual(self.status(), 200)                                    # the test client: Host localhost
        self.assertEqual(self.status(Host='127.0.0.1:5050'), 200)              # electron/floorplanTransport.ts
        self.assertEqual(self.status(Host='[::1]:5050'), 200)
        for origin in ('http://localhost:5173', 'http://127.0.0.1:5181'):       # floorplanApi.ts fetch in development
            with self.subTest(origin=origin):
                self.assertEqual(self.status(Host='127.0.0.1:5050', Origin=origin, **{'Sec-Fetch-Site': 'cross-site'}), 200)
        self.assertEqual(self.status(**{'Sec-Fetch-Site': 'none'}), 200)       # the address typed into a browser

    def test_web_pages_are_refused(self):
        for origin in ('https://www.youtube.com', 'https://attacker.example', 'null', 'file://',
                       'http://localhost.attacker.example', 'https://localhost:5173'):
            with self.subTest(origin=origin):
                self.assertEqual(self.status(Host='127.0.0.1:5050', Origin=origin), 403)
        # An <img> or <script> on another site: no Origin, but the browser marks it cross-site.
        self.assertEqual(self.status(Host='127.0.0.1:5050', **{'Sec-Fetch-Site': 'cross-site'}), 403)

    def test_a_dns_rebound_name_is_refused(self):
        self.assertEqual(self.status(Host='attacker.example:5050'), 403)
        self.assertEqual(self.status(Host='127.0.0.1.nip.io:5050'), 403)

    def test_a_refused_render_never_runs(self):
        # A text/plain POST, as a form or fetch on any website can send without a preflight.
        reply = self.client.post('/api/floorplan/compass/v2/render', data='{"scope":"ground"}',
                                 headers={'Host': '127.0.0.1:5050', 'Origin': 'https://attacker.example',
                                          'Content-Type': 'text/plain'})
        self.assertEqual(reply.status_code, 403)
        self.assertEqual(reply.get_json(), {'success': False, 'error': 'Not served to web pages.'})


if __name__ == '__main__':
    unittest.main()
