"""
GazeConnect Pro — News Service (Positive & Informational Focus)
Fetches RSS from reliable Indian & Global sources asynchronously.
Filters out crime, tragedy, and distressing keywords for a positive experience.
Never blocks the gaze pipeline. Never crashes.
"""

import asyncio
import re
import time
import logging
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional
from datetime import datetime, timezone

logger = logging.getLogger('GazeConnect.News')

# ─── RSS Feed Sources ─────────────────────────────────────
RSS_FEEDS = {
    'positive_india': [
        {'url': 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms', 'name': 'TOI India', 'positive_filter': True}
    ],
    'india_official': [
        {'url': 'https://pib.gov.in/RSSNewsByReleaseId.aspx', 'name': 'PIB India', 'positive_filter': False}
    ],
    'health_als': [
        {'url': 'https://pubmed.ncbi.nlm.nih.gov/rss/search/?term=ALS+amyotrophic+lateral+sclerosis&format=rss', 'name': 'PubMed ALS', 'positive_filter': False}
    ],
    'cricket': [
        {'url': 'https://feeds.feedburner.com/ndtvsports-cricket', 'name': 'NDTV Cricket', 'positive_filter': False}
    ],
    'science': [
        {'url': 'https://www.sciencedaily.com/rss/top/science.xml', 'name': 'Science Daily', 'positive_filter': False}
    ],
}

# ─── Negative News Filter ────────────────────────────────
NEGATIVE_KEYWORDS = [
    'murder', 'murdered', 'kill', 'killed', 'killing', 'rape', 'raped',
    'assault', 'assaulted', 'stabbed', 'shot dead', 'gunshot',
    'victim', 'victims', 'crime', 'criminal', 'arrested', 'arrest',
    'terror', 'terrorist', 'bomb', 'bombing', 'explosion',
    'death toll', 'dead body', 'corpse', 'massacre', 'slaughter',
    'suicide', 'self-harm', 'drowned', 'crushed',
    'crash kills', 'fatal crash', 'pile-up', 'derailed',
    'molestation', 'trafficking', 'kidnap', 'abduction', 'hostage',
    'scam', 'fraud', 'ponzi', 'money laundering',
    'riot', 'clash', 'mob violence', 'lynching', 'curfew imposed',
]

NEGATIVE_KEYWORDS_HI = {
    'hatya', 'maar', 'blast', 'danga', 'aatankwad', 'bomb', 'dacoity',
    'kidnap', 'dahshat', 'himsak', 'balatkaar', 'murder', 'loot',
}

POSITIVE_KEYWORDS = [
    'achievement', 'milestone', 'launch', 'inaugurate', 'record', 
    'award', 'develop', 'relief', 'help', 'success', 'innovation', 
    'growth', 'improve', 'build', 'discover', 'celebrate', 'honor',
    'uplift', 'empower', 'transform', 'fund', 'historic', 'first',
]


class NewsService:
    """Async news fetcher with positivity filter and caching.

    Design principles:
    - Never blocks: all I/O is async via aiohttp
    - Never crashes: every method catches exceptions and returns safe defaults
    - Never stale: 15-min cache, background refresh, stale fallback on network failure
    - Never distressing: negative keyword filter removes crime/tragedy headlines
    """

    def __init__(self, cache_ttl: int = 900, filter_negative: bool = True):
        self._cache: Dict[str, Dict] = {}
        self._cache_ttl = cache_ttl
        self._fetching = False
        self._filter_negative = filter_negative

    async def get_news(self, category: str = 'top', limit: int = 9, force_refresh: bool = False) -> List[Dict]:
        """Get filtered news items. Returns cached if fresh, fetches otherwise.

        Args:
            category: News category id.
            limit: Max items to return.
            force_refresh: If True, bypass fresh cache and fetch immediately.
        """
        try:
            cached = self._cache.get(category)
            if cached and not force_refresh and (time.time() - cached['fetched_at']) < self._cache_ttl:
                logger.debug(f"News cache hit for '{category}'")
                return cached['items'][:limit]

            items = await self._fetch_category(category)
            if items:
                self._cache[category] = {'items': items, 'fetched_at': time.time()}
                return items[:limit]

            if cached:
                logger.warning(f"Fetch failed, returning stale cache for '{category}'")
                return cached['items'][:limit]

            return []
        except Exception as e:
            logger.error(f"News service error: {e}")
            return self._cache.get(category, {}).get('items', [])[:limit]

    async def ensure_loaded(self, category: str) -> bool:
        """Load a category only if not already cached. Call on first panel visit."""
        if self._cache.get(category):
            return True
        items = await self._fetch_category(category)
        if items:
            self._cache[category] = {'items': items, 'fetched_at': time.time()}
        return bool(items)

    def get_categories(self) -> List[Dict]:
        """Return available news categories for the frontend."""
        return [
            {'id': 'positive_india', 'label': 'Good News', 'icon': '🌟'},
            {'id': 'india_official', 'label': 'India Today', 'icon': '🇮🇳'},
            {'id': 'health_als', 'label': 'ALS Research', 'icon': '🧬'},
            {'id': 'cricket', 'label': 'Cricket', 'icon': '🏏'},
            {'id': 'science', 'label': 'Science', 'icon': '🔬'},
        ]

    def is_cached(self, category: str) -> bool:
        """Check if category has cached data (for 'Cached' badge on frontend)."""
        cached = self._cache.get(category)
        return bool(cached and (time.time() - cached['fetched_at']) < self._cache_ttl)

    async def _fetch_category(self, category: str) -> List[Dict]:
        """Fetch RSS feeds for a category, parse, filter, and deduplicate."""
        feeds = RSS_FEEDS.get(category, [])
        all_items = []

        try:
            import aiohttp
        except ImportError:
            logger.warning("aiohttp not installed — news unavailable. Run: pip install aiohttp")
            return []

        async def _fetch_one_feed(session, feed_info):
            items = []
            try:
                async with session.get(feed_info['url']) as resp:
                    if resp.status == 200:
                        xml_text = await resp.text()
                        items = self._parse_rss(xml_text, feed_info['name'], feed_info.get('positive_filter', False))
                        logger.info(f"Fetched {len(items)} items from {feed_info['name']}")
                    else:
                        logger.warning(f"{feed_info['name']} returned status {resp.status}")
            except Exception as e:
                logger.warning(f"Failed to fetch {feed_info['name']}: {e}")
            return items

        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=8),
                headers={'User-Agent': 'GazeConnect/1.0'}
            ) as session:
                tasks = [_fetch_one_feed(session, feed) for feed in feeds]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for res in results:
                    if isinstance(res, list):
                        all_items.extend(res)
        except Exception as e:
            logger.error(f"Session error for category '{category}': {e}")

        filtered = self._deduplicate_and_filter(all_items)
        return filtered[:5]

    def _deduplicate_and_filter(self, items: List[Dict]) -> List[Dict]:
        """Remove duplicates and filter out negative/distressing headlines."""
        seen_titles = set()
        filtered = []

        for item in items:
            title_lower = item['title'].lower()

            title_key = title_lower[:50]
            if title_key in seen_titles:
                continue
            seen_titles.add(title_key)

            if self._filter_negative:
                if any(keyword in title_lower for keyword in NEGATIVE_KEYWORDS) or \
                   any(keyword in title_lower for keyword in NEGATIVE_KEYWORDS_HI):
                    logger.debug(f"Filtered negative headline: {item['title'][:60]}...")
                    continue

                if item.get('positive_filter', False):
                    if not any(keyword in title_lower for keyword in POSITIVE_KEYWORDS):
                        continue

            filtered.append(item)

        return filtered

    def _parse_rss(self, xml_text: str, source_name: str, positive_filter: bool = False) -> List[Dict]:
        """Parse RSS XML into structured items."""
        items = []
        try:
            root = ET.fromstring(xml_text)
            ns = {
                'media': 'http://search.yahoo.com/mrss/',
                'content': 'http://purl.org/rss/1.0/modules/content/',
            }

            for item_el in root.findall('.//item'):
                try:
                    title = self._get_text(item_el, 'title') or ''
                    if not title.strip():
                        continue

                    description = self._get_text(item_el, 'description') or ''
                    link = self._get_text(item_el, 'link') or ''
                    pub_date = self._get_text(item_el, 'pubDate') or ''

                    image_url = None
                    media = item_el.find('media:content', ns)
                    if media is not None:
                        image_url = media.get('url')
                    if not image_url:
                        media = item_el.find('media:thumbnail', ns)
                        if media is not None:
                            image_url = media.get('url')
                    if not image_url:
                        img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', description)
                        if img_match:
                            image_url = img_match.group(1)

                    clean_desc = re.sub(r'<[^>]+>', '', description)[:200].strip()

                    items.append({
                        'title': title.strip(),
                        'summary': clean_desc,
                        'source': source_name,
                        'link': link.strip(),
                        'published': pub_date.strip(),
                        'image_url': image_url,
                        'relative_time': self._relative_time(pub_date),
                        'positive_filter': positive_filter,
                    })
                except Exception as e:
                    logger.debug(f"Skipped malformed item from {source_name}: {e}")
                    continue

        except ET.ParseError as e:
            logger.warning(f"RSS parse error from {source_name}: {e}")

        return items

    def _get_text(self, element, tag: str) -> Optional[str]:
        """Safely get text from an XML element."""
        el = element.find(tag)
        return el.text if el is not None and el.text else None

    def _relative_time(self, pub_date: str) -> str:
        """Convert pub date string to relative time like '2h ago'."""
        if not pub_date:
            return 'Recent'
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(pub_date)
            now = datetime.now(timezone.utc)
            diff = now - dt
            hours = diff.total_seconds() / 3600
            if hours < 0:
                return 'Just now'
            elif hours < 1:
                return f"{max(1, int(diff.total_seconds() / 60))}m ago"
            elif hours < 24:
                return f"{int(hours)}h ago"
            elif hours < 48:
                return "Yesterday"
            else:
                return f"{int(hours / 24)}d ago"
        except Exception:
            return 'Recent'
