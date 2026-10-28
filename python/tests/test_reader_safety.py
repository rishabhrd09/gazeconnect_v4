"""The backend's internet readers: public addresses only, bounded sizes, linear-time HTML scans.

services/safe_fetch.py keeps the article reader, the news feeds and the quick
cards from reaching this computer or the home network (the article URL comes
from a feed, and any page can redirect), and reads bodies only up to a limit.
services/html_scan.py replaced patterns that took more than a minute on 40 KB of
malformed HTML while the gaze loop waited. A local HTTP server stands in for
the internet: these tests need no network.
"""
import asyncio
import http.server
import socket
import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import safe_fetch  # noqa: E402
from services.article_service import ARTICLE_TYPES, ArticleService  # noqa: E402
from services.html_scan import TAG, first_block, image_sources, meta_content, strip_blocks  # noqa: E402
from services.news_service import NewsService  # noqa: E402
from services.safe_fetch import RefusedAddress, check_url, fetch, is_public_address, public_session  # noqa: E402


class StandInServer:
    """An HTTP server on 127.0.0.1 that records every request it receives."""

    def __init__(self):
        self.paths = []
        owner = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                owner.paths.append(self.path)
                port = self.server.server_address[1]
                if self.path == '/hop-to-other-address':
                    self.redirect(f'http://127.0.0.2:{port}/page')
                elif self.path == '/hop-to-file':
                    self.redirect('file:///C:/Windows/win.ini')
                elif self.path.startswith('/loop/'):
                    self.redirect(f'/loop/{int(self.path.rsplit("/", 1)[1]) + 1}')
                elif self.path == '/big':
                    self.reply(b'<p>' + b'x' * (3 * 1024 * 1024) + b'</p>', 'text/html')
                elif self.path == '/png':
                    self.reply(b'\x89PNG' + b'0' * 1000, 'image/png')
                else:
                    self.reply(b'<html><body><p>hello</p></body></html>', 'text/html; charset=utf-8')

            def redirect(self, location):
                self.send_response(302)
                self.send_header('Location', location)
                self.send_header('Content-Length', '0')
                self.end_headers()

            def reply(self, body, content_type):
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def only_loopback_one(address):
    """A test policy: 127.0.0.1 stands for the public internet, every other address is local."""
    return address == '127.0.0.1'


class AddressRulesTest(unittest.TestCase):
    def test_local_addresses_are_never_public(self):
        for address in ('127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.5', '172.16.0.1', '192.168.1.1',
                        '169.254.169.254', '100.64.0.1', '224.0.0.1', '255.255.255.255', '::1', '::',
                        '::ffff:7f00:1', '::ffff:192.168.1.1', '::7f00:1', 'fc00::1', 'fd12::1', 'fe80::1%3',
                        'not-an-address'):
            with self.subTest(address=address):
                self.assertFalse(is_public_address(address))

    def test_internet_addresses_are_public(self):
        for address in ('8.8.8.8', '142.250.183.78', '2606:4700:4700::1111', '2404:6800:4009:80b::200e'):
            with self.subTest(address=address):
                self.assertTrue(is_public_address(address))

    def test_urls_that_are_refused_before_any_lookup(self):
        for url in ('file:///C:/Windows/win.ini', 'ftp://example.com/', 'javascript:alert(1)', 'http://',
                    'http://user:secret@example.com/', 'http://localhost:5050/', 'http://app.localhost/',
                    'http://127.0.0.1:8765/', 'http://[::1]/', 'http://192.168.1.1/', 'http://2130706433/',
                    'http://127.1/', 'http://[::ffff:7f00:1]:8765/'):
            with self.subTest(url=url):
                with self.assertRaises(RefusedAddress):
                    check_url(url)

    def test_internet_urls_pass_to_the_lookup(self):
        for url in ('https://timesofindia.indiatimes.com/rssfeeds/1898055.cms', 'http://example.com/a?b=1',
                    'https://8.8.8.8/'):
            with self.subTest(url=url):
                check_url(url)

    def test_the_resolver_keeps_only_public_answers(self):
        class Answers:
            def __init__(self, hosts):
                self.hosts = hosts

            async def resolve(self, host, port, family):
                return [{'hostname': host, 'host': h, 'port': port, 'family': 0, 'proto': 0, 'flags': 0}
                        for h in self.hosts]

        async def resolve(host, answers):
            resolver = safe_fetch.PublicResolver()   # aiohttp's resolver needs the running loop
            resolver._resolver = Answers(answers)
            return await resolver.resolve(host, 80)

        with self.assertRaises(RefusedAddress):      # e.g. localtest.me, or a DNS-rebound name
            asyncio.run(resolve('rebound.example', ['127.0.0.1']))
        kept = asyncio.run(resolve('mixed.example', ['192.168.1.1', '93.184.215.14']))
        self.assertEqual([answer['host'] for answer in kept], ['93.184.215.14'])


class FetchTest(unittest.TestCase):
    def setUp(self):
        self.server = StandInServer()
        self.addCleanup(self.server.close)
        self.base = f'http://127.0.0.1:{self.server.port}'

    def get(self, path, address_ok=only_loopback_one, **options):
        async def run():
            async with public_session(5, address_ok=address_ok) as session:
                return await fetch(session, self.base + path, address_ok=address_ok, **options)
        return asyncio.run(run())

    def test_the_real_rules_never_connect_to_this_computer(self):
        with self.assertRaises(RefusedAddress):
            self.get('/page', address_ok=is_public_address, max_bytes=1000)
        self.assertEqual(self.server.paths, [])

    def test_the_article_reader_falls_back_without_connecting(self):
        article = asyncio.run(ArticleService().fetch(self.base + '/page'))
        self.assertTrue(article['fallback'])
        self.assertEqual(self.server.paths, [])

    def test_every_redirect_hop_is_checked_before_connecting(self):
        with self.assertRaises(RefusedAddress):
            self.get('/hop-to-other-address', max_bytes=1000)
        with self.assertRaises(RefusedAddress):
            self.get('/hop-to-file', max_bytes=1000)
        self.assertEqual(self.server.paths, ['/hop-to-other-address', '/hop-to-file'])

    def test_redirects_are_limited(self):
        with self.assertRaises(RefusedAddress):
            self.get('/loop/0', max_bytes=1000)
        self.assertEqual(len(self.server.paths), safe_fetch.MAX_REDIRECTS + 1)

    def test_a_large_body_is_cut_at_the_limit(self):
        page = self.get('/big', max_bytes=1024 * 1024)
        self.assertEqual((page.status, len(page.body), page.truncated), (200, 1024 * 1024, True))

    def test_a_type_that_is_not_asked_for_is_not_read(self):
        page = self.get('/png', max_bytes=100_000, content_types=ARTICLE_TYPES)
        self.assertEqual((page.status, page.body), (200, b''))

    def test_an_allowed_page_is_read(self):
        page = self.get('/page', max_bytes=100_000, content_types=ARTICLE_TYPES)
        self.assertEqual((page.status, page.charset, page.truncated), (200, 'utf-8', False))
        self.assertIn(b'hello', page.body)


class LinearScanTest(unittest.TestCase):
    """Malformed pages of 1 MB that made the old patterns run for minutes."""
    PAGES = {
        'unclosed script tags': '<script>' * 125_000,
        'unclosed angle brackets': '<' * 1_000_000,
        'meta tags without an end': '<meta property="og:title" ' * 38_000,
        'quotes that never close': ('<meta content="' + 'x' * 3000 + '>') * 330,
        'img tags without an end': '<img src="a.jpg" ' * 58_000,
        'blocks that never close': '<article><main><body><svg><style><noscript>' * 23_000,
    }

    def test_each_takes_time_proportional_to_its_size(self):
        reader = ArticleService()
        for name, html in self.PAGES.items():
            with self.subTest(page=name):
                started = time.perf_counter()
                reader._extract_article('https://example.com/a', html)
                self.assertLess(time.perf_counter() - started, 3.0)

    def test_a_hostile_feed_is_read_quickly(self):
        item = ('<item><title>Ponds</title><link>https://example.com/1</link><description><![CDATA['
                + '<' * 20_000 + '<img src="x.jpg" ' * 1000 + ']]></description></item>')
        feed = ('<?xml version="1.0"?><rss><channel>' + item * 60 + '</channel></rss>').encode()
        started = time.perf_counter()
        items = NewsService()._parse_rss(feed, 'test')
        self.assertLess(time.perf_counter() - started, 3.0)
        self.assertEqual(len(items), 60)


class ExtractionTest(unittest.TestCase):
    PAGE = """<html><head><title>Fallback title</title>
        <meta property="og:title" content="Papa's ponds &amp; rains">
        <style>p { color: red }</style><script>var secret = "not text";</script></head>
        <body><nav>Menu</nav><article><h1>Ponds</h1>
        <p>The volunteers restored forty village ponds before the summer rains arrived this year.</p>
        <img data-src="lazy.jpg" src="/photo.jpg"><svg><text>icon</text></svg>
        <p>Children now swim where there was only dust, and the farmers have water again for wheat.</p>
        <p>The district plans to repeat the work in ninety more villages over the next two summers.</p>
        </article></body></html>"""

    def test_a_real_looking_article(self):
        article = ArticleService()._extract_article('https://news.example/ponds', self.PAGE)
        self.assertEqual(article['title'], "Papa's ponds & rains")
        self.assertEqual(article['text'].count('\n\n'), 2)
        self.assertTrue(article['text'].startswith('The volunteers restored forty village ponds'))
        for hidden in ('not text', 'color: red', 'icon', 'Menu'):
            self.assertNotIn(hidden, article['text'])
        self.assertEqual(article['images'], ['https://news.example/photo.jpg'])

    def test_the_helpers(self):
        self.assertEqual(strip_blocks('a<script x>b</script>c<script>d', 'script'), 'a c<script>d')
        self.assertEqual(first_block('<main id="m">inside</main>', 'main'), 'inside')
        self.assertIsNone(first_block('<main>never closed', 'main'))
        self.assertEqual(meta_content('<meta name="twitter:title" content=\'Hi "there"\'>', 'name', 'twitter:title'),
                         'Hi "there"')
        self.assertEqual(list(image_sources('<img src="a.png"><imgx src="b"><img alt="no source">')), ['a.png'])
        self.assertEqual(TAG.sub('', 'a<b>c</b>d<e'), 'acd<e')


if __name__ == '__main__':
    unittest.main()
