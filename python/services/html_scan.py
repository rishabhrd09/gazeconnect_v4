"""
GazeConnect Pro - Linear-time HTML scanning for the news and article readers.

Pages and feeds come from the internet, so their HTML may be malformed on
purpose. The readers used patterns such as `<script[^>]*>.*?</script>` and
`<meta[^>]+property=...[^>]+content=...`, whose matching time grows with the
square (or worse) of a page without closing tags: 40 KB of `<script>` took
2.5 s and 40 KB of unclosed meta tags more than a minute (measured 28 Oct
2026), and the backend's gaze loop waits for all of it. Every helper here reads
the text left to right a bounded number of times, so the time is proportional
to the page's size.
"""

import re
from typing import Iterator, Optional

MAX_TAG_CHARS = 4096                       # an opening tag longer than this is skipped
TAG_NAME_END = ' \t\r\n\f/>'
# One markup tag. `[^<>]` stops at the next '<', so a page full of unclosed
# '<' is still scanned once.
TAG = re.compile(r'<[^<>]+>')


def opening_tags(html: str, name: str, lower: Optional[str] = None) -> Iterator[str]:
    """Each complete opening `<name ...>` tag, in document order."""
    lower = html.lower() if lower is None else lower
    needle = '<' + name
    pos = 0
    while True:
        start = lower.find(needle, pos)
        if start < 0:
            return
        after = start + len(needle)
        end = lower.find('>', after)
        if end < 0:
            return
        pos = end + 1
        if after < len(lower) and lower[after] in TAG_NAME_END and end - start <= MAX_TAG_CHARS:
            yield html[start:end + 1]


def strip_blocks(html: str, name: str) -> str:
    """Replace every `<name ...> ... </name>` block with a space, as
    re.sub(r'(?is)<name[^>]*>.*?</name>', ' ', html) did; an unclosed block and
    everything after it are left as they are."""
    lower = html.lower()
    open_needle, close_needle = '<' + name, '</' + name + '>'
    parts, pos = [], 0
    while True:
        start = lower.find(open_needle, pos)
        if start < 0:
            break
        gt = lower.find('>', start + len(open_needle))
        if gt < 0:
            break
        close = lower.find(close_needle, gt + 1)
        if close < 0:
            break
        parts.append(html[pos:start])
        parts.append(' ')
        pos = close + len(close_needle)
    parts.append(html[pos:])
    return ''.join(parts)


def first_block(html: str, name: str, lower: Optional[str] = None) -> Optional[str]:
    """The inside of the first `<name ...> ... </name>` block, as
    re.search(r'(?is)<name[^>]*>(.*?)</name>', html) found it, or None."""
    lower = html.lower() if lower is None else lower
    start = lower.find('<' + name)
    if start < 0:
        return None
    gt = lower.find('>', start + len(name) + 1)
    if gt < 0:
        return None
    close = lower.find('</' + name + '>', gt + 1)
    if close < 0:
        return None
    return html[gt + 1:close]


def attribute(tag: str, name: str) -> Optional[str]:
    """A quoted attribute's value in one opening tag (at most MAX_TAG_CHARS long)."""
    match = re.search(r'(?:^|\s)' + re.escape(name) + r'\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', tag, flags=re.IGNORECASE)
    if not match:
        return None
    return match.group(1) if match.group(1) is not None else match.group(2)


def meta_content(html: str, attr: str, value: str, lower: Optional[str] = None) -> Optional[str]:
    """The content of the first `<meta attr="value" content="...">`, e.g. og:title."""
    for tag in opening_tags(html, 'meta', lower):
        found = attribute(tag, attr)
        if found is not None and found.lower() == value:
            content = attribute(tag, 'content')
            if content is not None:
                return content
    return None


def image_sources(html: str, lower: Optional[str] = None) -> Iterator[str]:
    """The src of each <img> tag that has one, in document order."""
    for tag in opening_tags(html, 'img', lower):
        src = attribute(tag, 'src')
        if src:
            yield src
