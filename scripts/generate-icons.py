"""Generates QUIZARD's app icon, Android adaptive icon layers, splash mark and favicon.

The mark is a geometric, chamfered "Q" in the theme's yellow with a soft glow
on the dark base color (#12, #6). Usage:

    python3 scripts/generate-icons.py <out-dir>
    for f in icon android-icon-foreground android-icon-background android-icon-monochrome splash-icon favicon; do
      rsvg-convert <out-dir>/$f.svg -o assets/images/$f.png
    done
"""
import sys
out = sys.argv[1]
Y = '#FFD200'; BG = '#1E2022'

def octagon(cx, cy, half, cut):
    l, t, r, b = cx-half, cy-half, cx+half, cy+half
    pts = [(l+cut,t),(r-cut,t),(r,t+cut),(r,b-cut),(r-cut,b),(l+cut,b),(l,b-cut),(l,t+cut)]
    return ' '.join(f'{x:.1f},{y:.1f}' for x,y in pts)

def q_mark(size, color, glow=True, scale=1.0, notch=True):
    """Geometric 'Q': chamfered octagon ring + diagonal tail with a cut end."""
    c = size/2
    half = 250*scale*size/1024
    cut = 105*scale*size/1024
    sw = 92*scale*size/1024
    # tail: parallelogram from inside the ring towards bottom-right
    t0 = c + 95*scale*size/1024
    t1 = c + 345*scale*size/1024
    w = 44*scale*size/1024
    notch_w = 26*scale*size/1024
    tail = f'{t0-w:.1f},{t0+w:.1f} {t0+w:.1f},{t0-w:.1f} {t1+w:.1f},{t1-w:.1f} {t1-w:.1f},{t1+w:.1f}'
    g = f'''
  <g{' filter="url(#glow)"' if glow else ''} transform="translate({-58*scale*size/1024:.1f} {-42*scale*size/1024:.1f})">
    <polygon points="{octagon(c, c-18*scale*size/1024, half, cut)}" fill="none" stroke="{color}" stroke-width="{sw:.1f}" stroke-linejoin="miter"/>
    {f'<polygon points="{tail}" fill="none" stroke="{BG}" stroke-width="{notch_w*2:.1f}" stroke-linejoin="miter"/>' if notch else ''}
    <polygon points="{tail}" fill="{color}"/>
  </g>'''
    return g

def defs(size):
    blur = 18*size/1024
    return f'''<defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="{blur:.1f}" result="b"/>
      <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 0.85 0 0 0  0 0 0 0 0  0 0 0 0.55 0" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="grid" width="{size/16:.1f}" height="{size/16:.1f}" patternUnits="userSpaceOnUse">
      <path d="M {size/16:.1f} 0 L 0 0 0 {size/16:.1f}" fill="none" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="{max(1,size/512):.1f}"/>
    </pattern>
  </defs>'''

def svg(size, body, bg=True, grid=True):
    back = f'<rect width="{size}" height="{size}" fill="{BG}"/>' if bg else ''
    gr = f'<rect width="{size}" height="{size}" fill="url(#grid)"/>' if (bg and grid) else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{defs(size)}{back}{gr}{body}</svg>'

files = {
  'icon.svg': svg(1024, q_mark(1024, Y)),
  # Android adaptive: content must sit in the central 66% safe zone
  'android-icon-foreground.svg': svg(512, q_mark(512, Y, scale=0.62), bg=False),
  'android-icon-background.svg': svg(512, '', grid=True),
  'android-icon-monochrome.svg': svg(432, q_mark(432, '#FFFFFF', glow=False, scale=0.62, notch=False), bg=False),
  'splash-icon.svg': svg(512, q_mark(512, Y), bg=False),
  'favicon.svg': svg(48, q_mark(48, Y, glow=False, scale=1.15), grid=False),
}
for name, content in files.items():
    open(f'{out}/{name}', 'w').write(content)
print('ok')
