"""
GazeConnect Pro - Article Reader Service
Fetches a web page asynchronously and extracts readable text for AAC-friendly reading.
"""

from __future__ import annotations

import logging
import re
import time
from html import unescape
from typing import Dict, Optional
from urllib.parse import urlparse

logger = logging.getLogger('GazeConnect.Article')

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False


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
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=12),
                headers={'User-Agent': 'GazeConnect/1.0 (ReaderView)'}
            ) as session:
                async with session.get(url, allow_redirects=True) as response:
                    if response.status != 200:
                        logger.warning("Article fetch status %s for %s", response.status, url)
                        return self._cached_or_empty(url, cached_entry)
                    html = await response.text(errors='ignore')
        except Exception as exc:
            logger.warning("Article fetch failed for %s: %s", url, exc)
            return self._cached_or_empty(url, cached_entry)

        article = self._extract_article(url, html)
        if not article.get('text'):
            return self._cached_or_empty(url, cached_entry)

        self._cache[url] = {
            'article': article,
            'fetched_at': time.time(),
        }
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

    def _extract_title(self, html: str) -> str:
        meta_patterns = [
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']',
            r'<meta[^>]+name=["\']twitter:title["\'][^>]+content=["\'](.*?)["\']',
        ]
        for pattern in meta_patterns:
            match = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
            if match:
                return unescape(match.group(1)).strip()

        title_match = re.search(r'<title[^>]*>(.*?)</title>', html, flags=re.IGNORECASE | re.DOTALL)
        if title_match:
            raw = unescape(title_match.group(1)).strip()
            return re.sub(r'\s+', ' ', raw)
        return ''

    def _pick_content_block(self, html: str) -> str:
        cleaned = re.sub(r'(?is)<script[^>]*>.*?</script>', ' ', html)
        cleaned = re.sub(r'(?is)<style[^>]*>.*?</style>', ' ', cleaned)
        cleaned = re.sub(r'(?is)<noscript[^>]*>.*?</noscript>', ' ', cleaned)
        cleaned = re.sub(r'(?is)<svg[^>]*>.*?</svg>', ' ', cleaned)

        article_match = re.search(r'(?is)<article[^>]*>(.*?)</article>', cleaned)
        if article_match:
            return article_match.group(1)

        main_match = re.search(r'(?is)<main[^>]*>(.*?)</main>', cleaned)
        if main_match:
            return main_match.group(1)

        body_match = re.search(r'(?is)<body[^>]*>(.*?)</body>', cleaned)
        if body_match:
            return body_match.group(1)
        return cleaned

    def _to_readable_text(self, block_html: str) -> str:
        normalized = re.sub(r'(?i)<br\s*/?>', '\n', block_html)
        normalized = re.sub(
            r'(?i)</(p|div|h1|h2|h3|h4|h5|h6|li|blockquote|section|article|main)>',
            '\n',
            normalized,
        )
        normalized = re.sub(r'(?is)<[^>]+>', ' ', normalized)
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
        matches = re.findall(r'(?is)<img[^>]+src=["\']([^"\']+)["\']', block_html)
        images = []
        for src in matches:
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
