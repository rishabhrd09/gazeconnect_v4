"""JavaScript-compatible text helpers for the deterministic prediction port.

The reference engine is TypeScript. A few ECMAScript behaviours differ from
Python's defaults and silently change results on edge-case input, so they are
reproduced here explicitly instead of relying on `str.strip`, `re` `\\s` or `$`:

* `String.prototype.trim` and the regex class `\\s` use the ECMAScript
  WhiteSpace + LineTerminator set (it includes U+FEFF and excludes the C0
  separators U+001C-U+001F and U+0085 that Python treats as whitespace).
* A regex `$` without the `m` flag only matches at the very end of the input;
  Python's `$` also matches before a final newline, so `\\Z` is used.
* `String.prototype.slice` counts UTF-16 code units. Dropping the typed prefix
  from a draft that contains astral characters must remove the same units.
"""
from __future__ import annotations

import math
import re
import unicodedata
from typing import List

# ECMAScript WhiteSpace (TAB VT FF SP NBSP ZWNBSP USP) + LineTerminator (LF CR LS PS).
JS_WHITESPACE_CHARS = (
    '\t\n\x0b\x0c\r   '
    + ''.join(chr(code) for code in range(0x2000, 0x200B))
    + '    　﻿'
)
JS_WS = '[' + re.escape(JS_WHITESPACE_CHARS) + ']'

_WORD_TOKENS = re.compile(r"[a-z]+(?:'[a-z]+)?")
_TRAILING_PREFIX = re.compile(r"([A-Za-z']+)\Z")
_WHITESPACE_RUN = re.compile(JS_WS + '+')


def js_trim(text: str) -> str:
    return text.strip(JS_WHITESPACE_CHARS)


def js_trim_end(text: str) -> str:
    return text.rstrip(JS_WHITESPACE_CHARS)


def collapse_js_whitespace(text: str) -> str:
    """`text.replace(/\\s+/g, ' ')`."""
    return _WHITESPACE_RUN.sub(' ', text)


def ends_with_js_whitespace(text: str) -> bool:
    """`/\\s$/.test(text)`."""
    return bool(text) and text[-1] in JS_WHITESPACE_CHARS


def utf16_length(text: str) -> int:
    if text.isascii():
        return len(text)
    return len(text.encode('utf-16-le', 'surrogatepass')) // 2


def drop_utf16_tail(text: str, units: int) -> str:
    """`text.slice(0, -units)` for units > 0, counting UTF-16 code units."""
    if units <= 0:
        raise ValueError('drop_utf16_tail requires a positive unit count')
    if text.isascii():
        return text[:-units]
    encoded = text.encode('utf-16-le', 'surrogatepass')
    return encoded[:max(0, len(encoded) - 2 * units)].decode('utf-16-le', 'surrogatepass')


def utf16_key(text: str) -> bytes:
    """Sort key reproducing JavaScript's `<` on strings (UTF-16 code-unit order)."""
    return text.encode('utf-16-be', 'surrogatepass')


def compare_text(a: str, b: str) -> int:
    if a == b:
        return 0
    return -1 if utf16_key(a) < utf16_key(b) else 1


def normalize_word(word: str) -> str:
    """`word.normalize('NFKC').trim().toLowerCase().replace(/\\u2019/g, "'")`."""
    if word.isascii():
        return js_trim(word).lower()
    return js_trim(unicodedata.normalize('NFKC', word)).lower().replace('’', "'")


def normalize_content_text(text: str) -> str:
    """`text.normalize('NFKC').trim().replace(/’/g, "'").replace(/\\s+/g, ' ')`."""
    normalized = unicodedata.normalize('NFKC', text) if not text.isascii() else text
    return collapse_js_whitespace(js_trim(normalized).replace('’', "'"))


def current_prefix(draft: str) -> str:
    """The unfinished word at the end of the draft, normalised (apostrophes included)."""
    normalized = draft if draft.isascii() else unicodedata.normalize('NFKC', draft).replace('’', "'")
    match = _TRAILING_PREFIX.search(normalized)
    return normalize_word(match.group(1)) if match else ''


def words_in(text: str) -> List[str]:
    """`text.toLowerCase().replace(/’/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) ?? []`."""
    return _WORD_TOKENS.findall(text.lower().replace('’', "'"))


def js_number(text: str) -> float:
    """`Number(text)` for the decimal strings the packed tables contain."""
    stripped = js_trim(text)
    if stripped == '':
        return 0.0
    try:
        if stripped in ('Infinity', '+Infinity'):
            return math.inf
        if stripped == '-Infinity':
            return -math.inf
        if not re.fullmatch(r'[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?', stripped):
            return math.nan
        return float(stripped)
    except ValueError:
        return math.nan


def is_js_integer(value) -> bool:
    """`Number.isInteger(value)` (bools are not numbers in JavaScript)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value) and float(value).is_integer()


def is_js_finite_number(value) -> bool:
    """`Number.isFinite(value)`."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def is_js_safe_integer(value) -> bool:
    return is_js_integer(value) and abs(value) <= 9007199254740991
