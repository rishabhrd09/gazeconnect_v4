"""Plan text drawn from glyph outlines of the bundled Atkinson Hyperlegible Next (SIL OFL 1.1).

Cairo's own text uses whatever font the computer has, so a sheet drawn on Windows and on
macOS differed. Here every letter is the same outline everywhere: PNG, PDF and SVG text is
identical and reproducible, and no font needs installing. The DXF keeps real TEXT entities.

Glyphs come from tools/assets/fonts (static instances made by scripts/build-plan-fonts.py)
through fontTools, which ezdxf already depends on. Pair kerning is read from GPOS.
"""
from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont


def _font_dir() -> Path:
    base = Path(getattr(sys, '_MEIPASS', '')) / 'compass_fonts' if getattr(sys, 'frozen', False) else None
    if base is not None and base.exists():
        return base
    return Path(__file__).resolve().parent / 'assets' / 'fonts'


class _Recorder(BasePen):
    """Glyph outline as Cairo-ready operations: quadratic TrueType curves become cubic ones."""

    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.ops = []

    def _moveTo(self, p):
        self.ops.append(('M', p))

    def _lineTo(self, p):
        self.ops.append(('L', p))

    def _curveToOne(self, p1, p2, p3):
        self.ops.append(('C', p1, p2, p3))

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        c1 = (p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1]))
        c2 = (p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1]))
        self.ops.append(('C', c1, c2, p2))

    def _closePath(self):
        self.ops.append(('Z',))

    def _endPath(self):
        self.ops.append(('Z',))


class Typeface:
    def __init__(self, path: Path):
        font = TTFont(str(path), lazy=False)
        self.upm = font['head'].unitsPerEm
        self.cmap = font.getBestCmap()
        self.advance = {name: width for name, (width, _) in font['hmtx'].metrics.items()}
        self.glyphset = font.getGlyphSet()
        self.ascent = font['hhea'].ascent / self.upm
        self.descent = -font['hhea'].descent / self.upm
        cap = getattr(font['OS/2'], 'sCapHeight', 0) or 700
        self.cap = cap / self.upm
        self.kern = _kerning(font)
        self.fallback = self.cmap.get(ord('?'), '.notdef')
        self._ops = {}

    def glyphs(self, text: str):
        return [self.cmap.get(ord(ch), self.fallback) for ch in str(text)]

    def ops(self, name):
        if name not in self._ops:
            pen = _Recorder(self.glyphset)
            self.glyphset[name].draw(pen)
            self._ops[name] = pen.ops
        return self._ops[name]

    def layout(self, text: str, size: float):
        """[(glyph, x)] and the advance width, at `size` (units per em = size)."""
        scale = size / self.upm
        names = self.glyphs(text)
        x, out = 0.0, []
        for i, name in enumerate(names):
            out.append((name, x))
            x += self.advance.get(name, self.upm // 2) * scale
            if i + 1 < len(names):
                x += self.kern.get((name, names[i + 1]), 0) * scale
        return out, x

    def width(self, text: str, size: float) -> float:
        return self.layout(text, size)[1]

    def path(self, ctx, x: float, y: float, text: str, size: float, anchor: str = 'left'):
        """Adds the outlines of `text` (baseline at y) to the current Cairo path."""
        placed, width = self.layout(text, size)
        if anchor == 'center':
            x -= width / 2
        elif anchor == 'right':
            x -= width
        scale = size / self.upm
        for name, gx in placed:
            ox = x + gx
            for op in self.ops(name):
                if op[0] == 'M':
                    ctx.move_to(ox + op[1][0] * scale, y - op[1][1] * scale)
                elif op[0] == 'L':
                    ctx.line_to(ox + op[1][0] * scale, y - op[1][1] * scale)
                elif op[0] == 'C':
                    (ax, ay), (bx, by), (cx, cy) = op[1:]
                    ctx.curve_to(ox + ax * scale, y - ay * scale, ox + bx * scale, y - by * scale, ox + cx * scale, y - cy * scale)
                else:
                    ctx.close_path()
        return width


def _kerning(font) -> dict:
    """Pair adjustments (x advance) from GPOS pair-positioning lookups, formats 1 and 2."""
    pairs = {}
    if 'GPOS' not in font:
        return pairs
    table = font['GPOS'].table
    if not table.LookupList:
        return pairs
    for lookup in table.LookupList.Lookup:
        subtables = []
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                if sub.ExtensionLookupType != 2:
                    continue
                sub = sub.ExtSubTable
            elif lookup.LookupType != 2:
                continue
            subtables.append(sub)
        for sub in subtables:
            coverage = sub.Coverage.glyphs
            if sub.Format == 1:
                for first, pairset in zip(coverage, sub.PairSet):
                    for record in pairset.PairValueRecord:
                        value = getattr(record.Value1, 'XAdvance', 0) if record.Value1 else 0
                        if value:
                            pairs.setdefault((first, record.SecondGlyph), value)
            elif sub.Format == 2:
                class1 = sub.ClassDef1.classDefs if sub.ClassDef1 else {}
                class2 = sub.ClassDef2.classDefs if sub.ClassDef2 else {}
                seconds = {}
                for glyph, cls in class2.items():
                    seconds.setdefault(cls, []).append(glyph)
                for first in coverage:
                    row = sub.Class1Record[class1.get(first, 0)]
                    for cls, record in enumerate(row.Class2Record):
                        value = getattr(record.Value1, 'XAdvance', 0) if record.Value1 else 0
                        if not value or cls == 0:
                            continue
                        for second in seconds.get(cls, []):
                            pairs.setdefault((first, second), value)
    return pairs


@lru_cache(maxsize=2)
def face(bold: bool = False) -> Typeface:
    name = 'AtkinsonHyperlegibleNext-Bold.ttf' if bold else 'AtkinsonHyperlegibleNext-Regular.ttf'
    return Typeface(_font_dir() / name)


def width(text, size, bold=False):
    return face(bold).width(text, size)


def draw(ctx, x, y, text, size, colour, bold=False, anchor='left', halo=None, spread=0.):
    """Text with its baseline at y; an optional halo (a thin outline of the background) keeps
    patterns and lines from crossing it. `colour`/`halo` are (r, g, b) or (r, g, b, a)."""
    ctx.new_path()
    face(bold).path(ctx, x, y, text, size, anchor)
    if halo is not None and spread > 0:
        ctx.set_source_rgba(*halo) if len(halo) == 4 else ctx.set_source_rgb(*halo)
        ctx.set_line_width(spread)
        ctx.set_line_join(1)                      # Round joins keep the halo smooth.
        ctx.stroke_preserve()
    ctx.set_source_rgba(*colour) if len(colour) == 4 else ctx.set_source_rgb(*colour)
    ctx.fill()


def cap_height(size, bold=False):
    return face(bold).cap * size
