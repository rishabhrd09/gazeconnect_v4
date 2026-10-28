"""
GazeConnect Pro - Article Reader Service
Fetches a web page asynchronously and extracts readable text for AAC-friendly reading.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from html import unescape
from typing import Dict, Optional
from urllib.parse import urlparse

from .html_scan import TAG, first_block, image_sources, meta_content, strip_blocks

logger = logging.getLogger('GazeConnect.Article')

try:
    from .safe_fetch import fetch as fetch_public, public_session
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False

# A news article's page is 50-700 KB (measured 28 Oct 2026); more is cut, not refused.
MAX_ARTICLE_BYTES = 2_000_000
ARTICLE_TYPES = ('text/html', 'application/xhtml+xml', 'text/plain')
MAX_CACHED_ARTICLES = 50


class ArticleService:
    """Fetches and extracts article text with cache + stale fallback."""

    def __init__(self, cache_ttl: int = 1800):
        self._cache_ttl = cache_ttl
        self._cache: Dict[str, Dict] = {}

    async def fetch(self, url: str, force_refresh: bool = False) -> Dict:
        """Fetch an article and return extracted text."""
        if not url:
            return {
                'url': '',
                'title': '',
                'source': '',
                'summary': '',
                'text': '',
                'images': [],
                'word_count': 0,
                'fallback': True,
                'cached': False,
            }

        cached_entry = self._cache.get(url)
        if cached_entry and not force_refresh:
            age = time.time() - cached_entry['fetched_at']
            if age < self._cache_ttl:
                return {**cached_entry['article'], 'cached': True}

        if not AIOHTTP_AVAILABLE:
            logger.warning("aiohttp missing - article reader unavailable")
            return self._cached_or_empty(url, cached_entry)

        try:
            # Public internet addresses only, each redirect checked, the page cut at MAX_ARTICLE_BYTES.
            async with public_session(12, headers={'User-Agent': 'GazeConnect/1.0 (ReaderView)'}) as session:
                page = await fetch_public(session, url, MAX_ARTICLE_BYTES, content_types=ARTICLE_TYPES)
            if page.status != 200 or not page.body:
                logger.warning("Article fetch status %s for %s", page.status, url)
                return self._cached_or_empty(url, cached_entry)
            html = page.body.decode(page.charset or 'utf-8', errors='ignore')
        except Exception as exc:  # refused address, network error, unknown charset
            logger.warning("Article fetch failed for %s: %s", url, exc)
            return self._cached_or_empty(url, cached_entry)

        # Off the event loop: the gaze stream keeps its pace while a large page is read.
        article = await asyncio.to_thread(self._extract_article, url, html)
        if not article.get('text'):
            return self._cached_or_empty(url, cached_entry)

        self._cache[url] = {
            'article': article,
            'fetched_at': time.time(),
        }
        while len(self._cache) > MAX_CACHED_ARTICLES:  # the oldest first; the backend runs for weeks
            self._cache.pop(next(iter(self._cache)))
        return {**article, 'cached': False}

    def _cached_or_empty(self, url: str, cached_entry: Optional[Dict]) -> Dict:
        if cached_entry:
            return {**cached_entry['article'], 'cached': True}
        parsed = urlparse(url)
        return {
            'url': url,
            'title': parsed.netloc or 'Article',
            'source': parsed.netloc,
            'summary': 'Unable to load this page right now.',
            'text': '',
            'images': [],
            'word_count': 0,
            'fallback': True,
            'cached': False,
        }

    def _extract_article(self, url: str, html: str) -> Dict:
        title = self._extract_title(html) or (urlparse(url).netloc or 'Article')

        content_html = self._pick_content_block(html)
        text = self._to_readable_text(content_html)
        if len(text) < 120:
            text = self._to_readable_text(html)

        summary = text[:320].strip()
        if len(text) > 320:
            summary = summary.rstrip() + '...'

        images = self._extract_images(content_html, base_url=url)
        word_count = len(re.findall(r'\b\w+\b', text))

        return {
            'url': url,
            'title': title.strip(),
            'source': urlparse(url).netloc,
            'summary': summary,
            'text': text,
            'images': images,
            'word_count': word_count,
            'fallback': False,
        }

    # Pages come from the internet and may be malformed on purpose, so every scan
    # below takes time proportional to the page's size (services/html_scan.py).
    def _extract_title(self, html: str) -> str:
        lower = html.lower()
        for attr, value in (('property', 'og:title'), ('name', 'twitter:title')):
            content = meta_content(html, attr, value, lower)
            if content:
                return unescape(content).strip()

        title = first_block(html, 'title', lower)
        if title is not None:
            raw = unescape(title).strip()
            return re.sub(r'\s+', ' ', raw)
        return ''

    def _pick_content_block(self, html: str) -> str:
        cleaned = html
        for name in ('script', 'style', 'noscript', 'svg'):
            cleaned = strip_blocks(cleaned, name)

        lower = cleaned.lower()
        for name in ('article', 'main', 'body'):
            block = first_block(cleaned, name, lower)
            if block is not None:
                return block
        return cleaned

    def _to_readable_text(self, block_html: str) -> str:
        normalized = re.sub(r'(?i)<br\s*/?>', '\n', block_html)
        normalized = re.sub(
            r'(?i)</(p|div|h1|h2|h3|h4|h5|h6|li|blockquote|section|article|main)>',
            '\n',
            normalized,
        )
        normalized = TAG.sub(' ', normalized)
        normalized = unescape(normalized)
        normalized = normalized.replace('\r', '\n')
        normalized = re.sub(r'[ \t]+', ' ', normalized)
        normalized = re.sub(r'\n{3,}', '\n\n', normalized)

        lines = [line.strip() for line in normalized.split('\n')]
        paragraphs = [line for line in lines if len(line) >= 60]

        if len(paragraphs) < 3:
            compact = re.sub(r'\s+', ' ', normalized).strip()
            sentences = re.split(r'(?<=[.!?])\s+', compact)
            paragraphs = [s.strip() for s in sentences if len(s.strip()) >= 50][:14]

        text = '\n\n'.join(paragraphs[:24]).strip()
        return text

    def _extract_images(self, block_html: str, base_url: str) -> list:
        images = []
        for src in image_sources(block_html):
            if not src:
                continue
            if src.startswith('//'):
                src = f'{urlparse(base_url).scheme}:{src}'
            elif src.startswith('/'):
                parsed = urlparse(base_url)
                src = f'{parsed.scheme}://{parsed.netloc}{src}'
            if src not in images:
                images.append(src)
            if len(images) >= 3:
                break
        return images
