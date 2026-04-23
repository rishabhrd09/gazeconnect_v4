"""
GazeConnect Pro - Quick Data Service
AAC-friendly pre-render data cards for weather, cricket, and market data.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, Optional

logger = logging.getLogger('GazeConnect.QuickData')

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False


class QuickDataService:
    """Fetches lightweight quick-data snapshots with short caching."""

    def __init__(self, cache_ttl: int = 300, city: str = 'Indore'):
        self._cache_ttl = cache_ttl
        self._city = city
        self._cache: Optional[Dict] = None
        self._cache_ts = 0.0

    async def get_snapshot(self, force_refresh: bool = False) -> Dict:
        if self._cache and not force_refresh:
            age = time.time() - self._cache_ts
            if age < self._cache_ttl:
                return {**self._cache, 'cached': True}

        if not AIOHTTP_AVAILABLE:
            logger.warning("aiohttp missing - quick data unavailable")
            return self._cache or self._empty_snapshot(cached=False)

        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10),
                headers={'User-Agent': 'GazeConnect/1.0 (QuickData)'}
            ) as session:
                weather_task = self._fetch_weather(session)
                cricket_task = self._fetch_cricket(session)
                gold_task = self._fetch_yahoo_quote(session, 'GC=F', label='Gold Futures')
                stock_task = self._fetch_india_indices(session)

                weather, cricket, gold, stocks = await asyncio.gather(
                    weather_task,
                    cricket_task,
                    gold_task,
                    stock_task,
                    return_exceptions=True,
                )

            snapshot = {
                'weather': self._safe_result(weather, 'Weather unavailable'),
                'cricket': self._safe_result(cricket, 'Cricket update unavailable'),
                'gold': self._safe_result(gold, 'Gold data unavailable'),
                'stocks': self._safe_result(stocks, 'Stock data unavailable'),
                'fetched_at': int(time.time()),
                'cached': False,
            }

            if self._has_any_live_data(snapshot):
                self._cache = snapshot
                self._cache_ts = time.time()
                return snapshot

            if self._cache:
                return {**self._cache, 'cached': True}
            return snapshot

        except Exception as exc:
            logger.warning("Quick data fetch failed: %s", exc)
            if self._cache:
                return {**self._cache, 'cached': True}
            return self._empty_snapshot(cached=False)

    def _safe_result(self, value, fallback_message: str) -> Dict:
        if isinstance(value, Exception):
            return {'ok': False, 'message': fallback_message}
        if isinstance(value, dict):
            return value
        return {'ok': False, 'message': fallback_message}

    def _has_any_live_data(self, snapshot: Dict) -> bool:
        for key in ('weather', 'cricket', 'gold', 'stocks'):
            if snapshot.get(key, {}).get('ok'):
                return True
        return False

    def _empty_snapshot(self, cached: bool) -> Dict:
        return {
            'weather': {'ok': False, 'message': 'Weather unavailable'},
            'cricket': {'ok': False, 'message': 'Cricket update unavailable'},
            'gold': {'ok': False, 'message': 'Gold data unavailable'},
            'stocks': {'ok': False, 'message': 'Stock data unavailable'},
            'fetched_at': int(time.time()),
            'cached': cached,
        }

    async def _fetch_weather(self, session) -> Dict:
        try:
            url = f"https://wttr.in/{self._city}?format=j1"
            async with session.get(url) as response:
                if response.status != 200:
                    return {'ok': False, 'message': f'Weather status {response.status}'}
                payload = await response.json(content_type=None)

            current = (payload.get('current_condition') or [{}])[0]
            return {
                'ok': True,
                'city': self._city,
                'temp_c': current.get('temp_C'),
                'feels_like_c': current.get('FeelsLikeC'),
                'condition': ((current.get('weatherDesc') or [{}])[0]).get('value', ''),
                'humidity': current.get('humidity'),
                'wind_kph': current.get('windspeedKmph'),
            }
        except Exception as exc:
            logger.debug("Weather fetch failed: %s", exc)
            return {'ok': False, 'message': 'Weather unavailable'}

    async def _fetch_cricket(self, session) -> Dict:
        try:
            url = "https://site.api.espn.com/apis/site/v2/sports/cricket/scoreboard"
            async with session.get(url) as response:
                if response.status != 200:
                    return {'ok': False, 'message': f'Cricket status {response.status}'}
                payload = await response.json(content_type=None)

            events = payload.get('events') or []
            if not events:
                return {'ok': False, 'message': 'No live matches currently'}

            event = events[0]
            competition = (event.get('competitions') or [{}])[0]
            competitors = competition.get('competitors') or []
            teams = []
            for comp in competitors[:2]:
                team = (comp.get('team') or {}).get('shortDisplayName') or (comp.get('team') or {}).get('displayName') or 'Team'
                score = comp.get('score') or ''
                teams.append(f"{team} {score}".strip())

            status_type = (competition.get('status') or {}).get('type') or {}
            status = status_type.get('description') or (competition.get('status') or {}).get('displayClock') or 'Update available'

            return {
                'ok': True,
                'match': event.get('shortName') or event.get('name') or 'Cricket Match',
                'status': status,
                'summary': ' vs '.join(teams) if teams else '',
                'venue': ((competition.get('venue') or {}).get('fullName') or ''),
            }
        except Exception as exc:
            logger.debug("Cricket fetch failed: %s", exc)
            return {'ok': False, 'message': 'Cricket update unavailable'}

    async def _fetch_india_indices(self, session) -> Dict:
        sensex, nifty = await asyncio.gather(
            self._fetch_yahoo_quote(session, '^BSESN', label='Sensex'),
            self._fetch_yahoo_quote(session, '^NSEI', label='Nifty 50'),
            return_exceptions=True,
        )

        sensex_data = self._safe_result(sensex, 'Sensex unavailable')
        nifty_data = self._safe_result(nifty, 'Nifty unavailable')
        return {
            'ok': bool(sensex_data.get('ok') or nifty_data.get('ok')),
            'sensex': sensex_data,
            'nifty': nifty_data,
        }

    async def _fetch_yahoo_quote(self, session, symbol: str, label: str) -> Dict:
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
            async with session.get(url) as response:
                if response.status != 200:
                    return {'ok': False, 'message': f'{label} status {response.status}'}
                payload = await response.json(content_type=None)

            result = ((payload.get('chart') or {}).get('result') or [None])[0]
            if not result:
                return {'ok': False, 'message': f'{label} unavailable'}

            meta = result.get('meta') or {}
            price = meta.get('regularMarketPrice')
            change = meta.get('regularMarketChange')
            change_pct = meta.get('regularMarketChangePercent')

            if price is None:
                closes = (((result.get('indicators') or {}).get('quote') or [{}])[0]).get('close') or []
                valid_closes = [c for c in closes if isinstance(c, (float, int))]
                price = valid_closes[-1] if valid_closes else None

            return {
                'ok': price is not None,
                'label': label,
                'symbol': symbol,
                'price': price,
                'change': change,
                'change_percent': change_pct,
                'currency': meta.get('currency') or '',
            }
        except Exception as exc:
            logger.debug("%s fetch failed: %s", label, exc)
            return {'ok': False, 'message': f'{label} unavailable'}
