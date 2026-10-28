"""
GazeConnect Pro - Internet requests for the backend's readers (news feeds, articles, quick cards).

Every request goes to a public internet address only. The embedded browser
already refuses the patient's own computer and home network
(`electron/browser/browserSafety.ts`), but the article reader fetches pages
itself: without the same rule, a link in a news feed, or a redirect from one,
could make the backend request the router, another device at home, or the
app's own local services. Hostnames are checked after DNS resolution, inside
the connection, so a name that resolves to 127.0.0.1 (DNS rebinding included)
is refused; address literals and every redirect hop are checked before
connecting. Bodies are read only up to a size limit (after decompression), so
a huge or endless response cannot fill the memory of the process that also
runs the gaze loop. Certificates are verified as before (aiohttp's default).
"""

import ipaddress
import re
import socket
from typing import Callable, Iterable, List, NamedTuple, Optional
from urllib.parse import urljoin, urlsplit

import aiohttp
from aiohttp.abc import AbstractResolver, ResolveResult
from aiohttp.resolver import DefaultResolver

MAX_REDIRECTS = 5
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_IPV4_COMPATIBLE = ipaddress.ip_network('::/96')
_NUMERIC_HOST = re.compile(r'^[0-9.]+$')


class RefusedAddress(OSError):
    """A request to an address that is not on the public internet, refused before connecting."""


def is_public_address(address: str) -> bool:
    """True only for a global unicast address: never loopback, private, link-local,
    shared (CGNAT), multicast, reserved or unspecified, nor an IPv6 form of one."""
    try:
        ip = ipaddress.ip_address(address.split('%', 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        elif ip in _IPV4_COMPATIBLE:
            return False
    return ip.is_global and not ip.is_multicast


def check_url(url: str, address_ok: Callable[[str], bool] = is_public_address) -> None:
    """Raise RefusedAddress unless url is http(s) to a host that may be public."""
    parts = urlsplit(url)
    host = (parts.hostname or '').rstrip('.')
    if parts.scheme not in ('http', 'https') or not host:
        raise RefusedAddress(f'only http and https addresses are fetched: {url[:120]}')
    if parts.username is not None or parts.password is not None:
        raise RefusedAddress('addresses with a user name or password are not fetched')
    if host == 'localhost' or host.endswith('.localhost'):
        raise RefusedAddress(f'{host} is this computer')
    try:
        ipaddress.ip_address(host.split('%', 1)[0])
        literal = True
    except ValueError:
        # A host of digits and dots that is not a dotted quad (2130706433, 127.1)
        # is an address in an older notation, never a name.
        literal = bool(_NUMERIC_HOST.match(host))
    if literal and not address_ok(host):
        raise RefusedAddress(f'{host} is not a public internet address')


class PublicResolver(AbstractResolver):
    """Resolves as aiohttp would, then keeps only the addresses address_ok allows."""

    def __init__(self, address_ok: Callable[[str], bool] = is_public_address):
        self._resolver = DefaultResolver()
        self._address_ok = address_ok

    async def resolve(self, host: str, port: int = 0,
                      family: socket.AddressFamily = socket.AF_INET) -> List[ResolveResult]:
        results = await self._resolver.resolve(host, port, family)
        allowed = [result for result in results if self._address_ok(result['host'])]
        if not allowed:
            raise RefusedAddress(f'{host} is not a public internet address')
        return allowed

    async def close(self) -> None:
        await self._resolver.close()


def public_session(timeout_s: float, headers: Optional[dict] = None,
                   address_ok: Callable[[str], bool] = is_public_address) -> aiohttp.ClientSession:
    """A session whose connections can reach only public internet addresses."""
    connector = aiohttp.TCPConnector(resolver=PublicResolver(address_ok), limit=8)
    return aiohttp.ClientSession(connector=connector, headers=headers,
                                 timeout=aiohttp.ClientTimeout(total=timeout_s))


class Fetched(NamedTuple):
    status: int
    url: str                # after redirects
    body: bytes             # at most max_bytes; empty unless status is 200 and the type is accepted
    charset: Optional[str]
    truncated: bool


async def fetch(session: aiohttp.ClientSession, url: str, max_bytes: int,
                content_types: Optional[Iterable[str]] = None,
                address_ok: Callable[[str], bool] = is_public_address) -> Fetched:
    """GET url from a public_session, following at most MAX_REDIRECTS redirects,
    each checked before connecting. content_types, when given, are the accepted
    media types; a response that names another type has an empty body."""
    accepted = frozenset(content_types) if content_types else None
    for _ in range(MAX_REDIRECTS + 1):
        check_url(url, address_ok)
        async with session.get(url, allow_redirects=False) as response:
            location = response.headers.get('Location')
            if response.status in REDIRECT_STATUSES and location:
                url = urljoin(url, location)
                continue
            named_type = 'Content-Type' in response.headers
            if response.status != 200 or (accepted and named_type and response.content_type not in accepted):
                return Fetched(response.status, url, b'', None, False)
            chunks, size = [], 0
            async for chunk in response.content.iter_chunked(64 * 1024):
                chunks.append(chunk)
                size += len(chunk)
                if size > max_bytes:
                    break
            body = b''.join(chunks)
            return Fetched(response.status, url, body[:max_bytes], response.charset, len(body) > max_bytes)
    raise RefusedAddress(f'more than {MAX_REDIRECTS} redirects')
