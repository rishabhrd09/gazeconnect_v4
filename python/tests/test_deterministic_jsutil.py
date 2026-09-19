"""ECMAScript-compatible text helpers used by the deterministic prediction port."""
import math
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

from services.deterministic_prediction.jsutil import (  # noqa: E402
    JS_WHITESPACE_CHARS,
    collapse_js_whitespace,
    compare_text,
    current_prefix,
    drop_utf16_tail,
    ends_with_js_whitespace,
    is_js_integer,
    is_js_safe_integer,
    js_number,
    js_trim,
    normalize_content_text,
    normalize_word,
    utf16_length,
    words_in,
)
from services.deterministic_prediction.personal_continuations import signature  # noqa: E402


class JavaScriptTextTests(unittest.TestCase):
    def test_whitespace_is_the_ecmascript_set(self):
        for char in '\t\n\x0b\x0c\r         　﻿':
            self.assertIn(char, JS_WHITESPACE_CHARS, repr(char))
        for char in '\x1c\x1d\x1e\x1f\x85​':
            self.assertNotIn(char, JS_WHITESPACE_CHARS, repr(char))  # Python-only whitespace, or none
        self.assertEqual(js_trim('﻿ hi \x85'), 'hi \x85')
        self.assertEqual(collapse_js_whitespace('a 　\t b'), 'a b')
        self.assertTrue(ends_with_js_whitespace('wa '))
        self.assertFalse(ends_with_js_whitespace('wa​'))

    def test_prefix_uses_end_of_input_not_end_of_line(self):
        self.assertEqual(current_prefix('i need wa\n'), '')  # Python's `$` would say 'wa'
        self.assertEqual(current_prefix('I NEED WA'), 'wa')
        self.assertEqual(current_prefix('don’'), "don'")
        self.assertEqual(current_prefix('ｉ ｎｅｅｄ ｗａ'), 'wa')  # full-width NFKC

    def test_utf16_slicing_and_ordering(self):
        self.assertEqual(utf16_length('a😊'), 3)
        self.assertEqual(drop_utf16_tail('hi 😊wa', 2), 'hi 😊')
        self.assertEqual(drop_utf16_tail('😊', 1), '\ud83d')  # JavaScript keeps the lone surrogate
        with self.assertRaises(ValueError):
            drop_utf16_tail('abc', 0)
        # JavaScript compares UTF-16 code units: an astral character sorts before U+FF45.
        self.assertEqual(compare_text('😊', 'ｅ'), -1)
        self.assertEqual(sorted(['😊', 'ｅ'], key=lambda s: s.encode('utf-16-be', 'surrogatepass')), ['😊', 'ｅ'])
        self.assertEqual(compare_text('b', 'a'), 1)
        self.assertEqual(compare_text('a', 'a'), 0)

    def test_words_and_normalisation(self):
        self.assertEqual(words_in("I Don’t know, it's 5pm"), ['i', "don't", 'know', "it's", 'pm'])
        self.assertEqual(normalize_word(' Ｗater’ '), "water'")
        self.assertEqual(normalize_content_text(' Call  Papa’s  nurse '), "Call Papa's nurse")

    def test_numbers_follow_javascript(self):
        self.assertEqual(js_number(''), 0.0)
        self.assertEqual(js_number(' 12.5 '), 12.5)
        self.assertEqual(js_number('-Infinity'), -math.inf)
        self.assertTrue(math.isnan(js_number('1,000')))
        self.assertTrue(is_js_integer(10.0))
        self.assertFalse(is_js_integer(True))
        self.assertFalse(is_js_integer(math.inf))
        self.assertFalse(is_js_safe_integer(2 ** 53))

    def test_continuation_signature_is_stable(self):
        self.assertEqual(signature(''), signature(''))
        self.assertNotEqual(signature('i need '), signature('i need  '))
        self.assertRegex(signature('i need water '), r'^\d+:\d+:\d+$')


if __name__ == '__main__':
    unittest.main()
