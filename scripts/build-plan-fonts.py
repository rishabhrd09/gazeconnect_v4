"""Static TrueType instances of the interface font for the plan drawings (run once; output is committed).

    python/.venv/bin/python scripts/build-plan-fonts.py

Reads src/assets/fonts/atkinson-hyperlegible-next.woff2 (the variable Latin font the interface
already ships, SIL Open Font License 1.1) and writes Regular (400) and Bold (700) instances to
tools/assets/fonts/, with the licence. tools/compass_text.py draws plan text from their glyph
outlines, so PNG, PDF and SVG text is identical on Windows and macOS and needs no installed font.

WOFF2 is Brotli-compressed. When the `brotli` package is absent (it is not a project dependency),
the decompression is done by Node's built-in zlib, which every development machine has.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'assets' / 'fonts' / 'atkinson-hyperlegible-next.woff2'
LICENCE = ROOT / 'src' / 'assets' / 'fonts' / 'Atkinson-Hyperlegible-Next-LICENSE.txt'
OUT = ROOT / 'tools' / 'assets' / 'fonts'


class NodeBrotli:
    """The one call fontTools.ttLib.woff2 needs, answered by Node's zlib.brotliDecompressSync."""

    @staticmethod
    def decompress(data: bytes) -> bytes:
        script = ("const z=require('zlib');const c=[];process.stdin.on('data',d=>c.push(d));"
                  "process.stdin.on('end',()=>process.stdout.write(z.brotliDecompressSync(Buffer.concat(c))));")
        return subprocess.run(['node', '-e', script], input=data, capture_output=True, check=True).stdout


def main():
    from fontTools.ttLib import TTFont, woff2
    from fontTools.varLib import instancer
    try:
        import brotli  # noqa: F401
    except ImportError:
        woff2.brotli, woff2.haveBrotli = NodeBrotli, True
    OUT.mkdir(parents=True, exist_ok=True)
    for weight, style in ((400, 'Regular'), (700, 'Bold')):
        font = TTFont(str(SOURCE))
        font.flavor = None
        static = instancer.instantiateVariableFont(font, {'wght': weight}, updateFontNames=False)
        # Name the instance after its weight (the variable font's default names say Regular).
        family = static['name'].getDebugName(1) or 'Atkinson Hyperlegible Next'
        for name_id, value in ((2, style), (4, f'{family} {style}'), (6, f"{family.replace(' ', '')}-{style}")):
            static['name'].setName(value, name_id, 3, 1, 0x409)
            static['name'].setName(value, name_id, 1, 0, 0)
        target = OUT / f'AtkinsonHyperlegibleNext-{style}.ttf'
        static.save(str(target))
        print(f'{target.relative_to(ROOT)}: {target.stat().st_size} bytes, {len(static.getGlyphOrder())} glyphs')
    shutil.copyfile(LICENCE, OUT / 'OFL.txt')
    return 0


if __name__ == '__main__':
    sys.exit(main())
