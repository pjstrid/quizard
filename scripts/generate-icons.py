"""Generates QUIZARD's app icon, Android adaptive icon layers, splash mark and favicon.

The mark is the "Q" from Orbitron Black – the same font as the QUIZARD logo
inside the app – in the theme's yellow with a soft glow on the dark base
color (#12, #6, #7). Usage (needs fontTools: `pip install fonttools`):

    python3 scripts/generate-icons.py <out-dir>
    for f in icon android-icon-foreground android-icon-background android-icon-monochrome splash-icon favicon; do
      rsvg-convert <out-dir>/$f.svg -o assets/images/$f.png
    done
"""
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

out = sys.argv[1]
Y = '#FFD200'
BG = '#1E2022'
FONT = 'node_modules/@expo-google-fonts/orbitron/900Black/Orbitron_900Black.ttf'

font = TTFont(FONT)
glyphs = font.getGlyphSet()
q = glyphs[font.getBestCmap()[ord('Q')]]
bounds = BoundsPen(glyphs)
q.draw(bounds)
x0, y0, x1, y1 = bounds.bounds


def q_path(size, scale):
    """SVG path of the Q, `scale` × the canvas wide, centered (font units have y up)."""
    s = size * scale / (x1 - x0)
    w, h = (x1 - x0) * s, (y1 - y0) * s
    left, top = (size - w) / 2, (size - h) / 2
    pen = SVGPathPen(glyphs)
    # Scale, flip y and move into place.
    q.draw(TransformPen(pen, (s, 0, 0, -s, left - x0 * s, top + y1 * s)))
    return pen.getCommands()


def q_mark(size, color, glow=True, scale=0.56):
    effect = ' filter="url(#glow)"' if glow else ''
    return f'<path d="{q_path(size, scale)}" fill="{color}"{effect}/>'


def defs(size):
    blur = 18 * size / 1024
    return f'''<defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="{blur:.1f}" result="b"/>
      <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 0.85 0 0 0  0 0 0 0 0  0 0 0 0.55 0" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="grid" width="{size/16:.1f}" height="{size/16:.1f}" patternUnits="userSpaceOnUse">
      <path d="M {size/16:.1f} 0 L 0 0 0 {size/16:.1f}" fill="none" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="{max(1, size/512):.1f}"/>
    </pattern>
  </defs>'''


def svg(size, body, bg=True, grid=True):
    back = f'<rect width="{size}" height="{size}" fill="{BG}"/>' if bg else ''
    gr = f'<rect width="{size}" height="{size}" fill="url(#grid)"/>' if (bg and grid) else ''
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
        f'{defs(size)}{back}{gr}{body}</svg>'
    )


files = {
    'icon.svg': svg(1024, q_mark(1024, Y)),
    # Android adaptive: content must sit in the central 66% safe zone.
    'android-icon-foreground.svg': svg(512, q_mark(512, Y, scale=0.38), bg=False),
    'android-icon-background.svg': svg(512, '', grid=True),
    'android-icon-monochrome.svg': svg(432, q_mark(432, '#FFFFFF', glow=False, scale=0.38), bg=False),
    'splash-icon.svg': svg(512, q_mark(512, Y, scale=0.6), bg=False),
    'favicon.svg': svg(48, q_mark(48, Y, glow=False, scale=0.8), grid=False),
}
for name, content in files.items():
    with open(f'{out}/{name}', 'w') as f:
        f.write(content)
print('ok')
