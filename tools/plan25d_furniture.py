"""Rounded, pastel furniture for the furnished model view (tools/plan25d.py), one drawing per type.

Every item is drawn in its own frame, in feet: x runs along its back (0..w), y away from the back
into the room (0..d), so one drawing serves any wall; plan25d turns the frame. The look follows a
soft architectural model: rounded blocks, a lighter top edge, a thin darker rim, sage and cream
fabrics, oiled wood. Nothing is random, so an item always looks the same. Shadows are not drawn
here: plan25d casts them for every item at once from `footprint`.
"""
from __future__ import annotations

import math
from functools import lru_cache

PALETTES = {
    'light': dict(sage='#8FB3A8', seafoam='#A9C5BC', mist='#C9DCD5', cream='#F2EDE4', linen='#E9E1D3',
                  pillow='#F7F5F0', terracotta='#D98B6A', wood='#D7B48D', wood_dark='#B98F6A', white='#F4F4F1',
                  porcelain='#E7ECEB', steel='#AEBBBD', glass='#C9D6D6', screen='#2E3A3F', car='#8EB2C2',
                  car_glass='#23343A', leaf='#4E8C5A', leaf_light='#6FA36F', clay='#C9A88A', soil='#8C7A66',
                  rim='#6E6A60', lamp='#FBF3DC', signal='#7FC4A8'),
    'dark': dict(sage='#5E7F76', seafoam='#6F8F86', mist='#86A39A', cream='#B9B3A8', linen='#A79F92',
                 pillow='#CFCBC2', terracotta='#B06F55', wood='#8E7357', wood_dark='#6E5640', white='#C8CCCB',
                 porcelain='#B3BBBA', steel='#8794A0', glass='#7F9AA3', screen='#11181C', car='#5F8597',
                 car_glass='#0F1A1F', leaf='#3F7A4B', leaf_light='#559060', clay='#957C66', soil='#6A5C4E',
                 rim='#0E1215', lamp='#D9CFB0', signal='#5FA68A'),
}


@lru_cache(maxsize=512)
def rgb(colour):
    c = colour.lstrip('#')
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mix(a, b, t):
    pa, pb = rgb(a), rgb(b)
    return '#%02X%02X%02X' % tuple(round((x + (y - x) * t) * 255) for x, y in zip(pa, pb))


def rrect(c, x, y, w, h, r):
    r = max(0., min(r, w / 2, h / 2))
    c.new_sub_path()
    c.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    c.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    c.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    c.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    c.close_path()


def soft(c, x, y, w, h, r, colour, rim=.16, light=.14):
    """A rounded block: a gentle top-lit gradient and a thin darker rim, like a painted model piece."""
    import cairo
    rrect(c, x, y, w, h, r)
    g = cairo.LinearGradient(x, y, x + w * .35, y + h)
    g.add_color_stop_rgb(0, *rgb(mix(colour, '#FFFFFF', light)))
    g.add_color_stop_rgb(1, *rgb(colour))
    c.set_source(g)
    c.fill_preserve()
    c.set_source_rgba(*rgb(mix(colour, '#000000', .35)), rim)
    c.set_line_width(.045)
    c.stroke()


def flat(c, x, y, w, h, r, colour, alpha=1.):
    rrect(c, x, y, w, h, r)
    c.set_source_rgba(*rgb(colour), alpha)
    c.fill()


def line(c, x1, y1, x2, y2, colour, width=.05, alpha=1.):
    c.move_to(x1, y1)
    c.line_to(x2, y2)
    c.set_source_rgba(*rgb(colour), alpha)
    c.set_line_width(width)
    c.set_line_cap(1)
    c.stroke()


def disc(c, x, y, r, colour, alpha=1.):
    c.new_sub_path()
    c.arc(x, y, r, 0, 2 * math.pi)
    c.set_source_rgba(*rgb(colour), alpha)
    c.fill()


# ── Items ─────────────────────────────────────────────────────────────────────────────

def bed(c, w, d, P):
    soft(c, 0, 0, w, .32, .1, P['wood'])                                  # headboard
    soft(c, .05, .22, w - .1, d - .27, .28, P['linen'])                     # frame and mattress
    pillows = 2 if w >= 4.4 else 1
    pw = (w - .5 - .2 * (pillows - 1)) / pillows
    for i in range(pillows):
        soft(c, .25 + i * (pw + .2), .45, pw, min(1.15, d * .17), .22, P['pillow'], light=.08)
    top = .45 + min(1.15, d * .17) + .35
    soft(c, .12, top, w - .24, d - top - .12, .26, P['sage'])                # blanket
    flat(c, .12, top, w - .24, .42, .2, P['mist'], .85)                    # its turned-down edge


def hospital_bed(c, w, d, P):
    soft(c, 0, 0, w, d, .3, P['white'], light=.06)                         # frame
    soft(c, .28, .3, w - .56, d * .26, .22, P['pillow'], light=.05)         # pillow at the head
    soft(c, .28, .3 + d * .26 + .12, w - .56, d - d * .26 - .7, .26, P['sage'])
    for x in (.1, w - .1):                                                 # side rails
        line(c, x, d * .18, x, d * .82, P['steel'], .09)


def sofa(c, w, d, P, seats=None):
    soft(c, 0, 0, w, d, .38, P['sage'])
    arm = min(.55, w * .14)
    flat(c, arm, .12, w - 2 * arm, d * .34, .2, mix(P['sage'], '#000000', .06))   # back cushions
    seats = seats or (3 if w >= 5.4 else 2 if w >= 3.6 else 1)
    sw = (w - 2 * arm - .12 * (seats - 1)) / seats
    for i in range(seats):
        soft(c, arm + i * (sw + .12), d * .36, sw, d * .58, .22, P['seafoam'], light=.12)
    if seats > 1:
        soft(c, arm + .1, d * .2, .7, .62, .14, P['terracotta'], light=.1)    # accent cushions
        soft(c, w - arm - .8, d * .2, .7, .62, .14, P['mist'], light=.1)


def armchair(c, w, d, P):
    sofa(c, w, d, P, seats=1)


def chair(c, w, d, P):
    soft(c, 0, 0, w, d, min(w, d) * .3, P['cream'], light=.08)
    flat(c, .08, .06, w - .16, d * .3, .12, mix(P['cream'], '#000000', .07))


def table(c, w, d, P, decor=True):
    soft(c, 0, 0, w, d, .22, P['wood'], light=.18)
    if decor and w > 2 and d > 1.2:
        soft(c, w * .18, d * .22, min(.9, w * .22), min(.65, d * .35), .06, P['seafoam'], light=.2)


def coffee_table(c, w, d, P):
    table(c, w, d, P)


def side_table(c, w, d, P):
    soft(c, 0, 0, w, d, .16, P['wood'], light=.16)
    disc(c, w / 2, d / 2, min(w, d) * .28, P['lamp'])
    disc(c, w / 2, d / 2, min(w, d) * .12, mix(P['lamp'], '#000000', .12))


def _at(c, x, y, w, d, angle, draw, P):
    """Draws an item of size w x d whose box (before turning) has its top-left at (x, y), turned
    by `angle` degrees about its centre (0 = its back at the top)."""
    c.save()
    c.translate(x + w / 2, y + d / 2)
    c.rotate(math.radians(angle))
    c.translate(-w / 2, -d / 2)
    draw(c, w, d, P)
    c.restore()


def dining_layout(w, d):
    """The table and the chairs of a dining set: ((x, y, w, h) table, [(x, y, w, h, turn)] chairs)."""
    ends = w >= 5.
    inset = .9 if ends else .1
    tw, th = w - 2 * inset, max(1.2, d - 1.6)
    ty = (d - th) / 2
    seats = max(1, int(tw // 2.1))
    cw = min(1.3, (tw - .35 * (seats - 1)) / seats)
    x0 = inset + (tw - seats * cw - (seats - 1) * .35) / 2
    chairs = []
    for i in range(seats):
        x = x0 + i * (cw + .35)
        chairs.append((x, ty - .7, cw, 1., 0))                             # facing the table from behind
        chairs.append((x, ty + th - .3, cw, 1., 180))                      # and from the front
    if ends:
        chairs += [(-.1, d / 2 - .65, 1., 1.3, -90), (w - .9, d / 2 - .65, 1., 1.3, 90)]
    return (inset, ty, tw, th), chairs


def dining(c, w, d, P):
    """A table with chairs along both long sides and at the ends when there is room; a plant on it."""
    (tx, ty, tw, th), chairs = dining_layout(w, d)
    for x, y, cw, ch, turn in chairs:
        _at(c, x, y, cw, ch, turn, chair, P)
    soft(c, tx, ty, tw, th, .2, P['wood'], light=.18)
    plant(c, 0, 0, P, cx=tx + tw / 2, cy=ty + th / 2, r=.32, pot=False)


def counter(c, w, d, P):
    soft(c, 0, 0, w, d, .14, P['white'], light=.05)
    line(c, .08, d - .12, w - .08, d - .12, P['steel'], .04, .6)           # front edge
    if w >= 4:
        sx = w * .28                                                        # sink
        soft(c, sx - .8, d * .2, 1.6, d * .56, .18, P['porcelain'], light=.04)
        flat(c, sx - .62, d * .28, 1.24, d * .4, .14, P['steel'], .55)
        disc(c, sx, d * .16, .07, P['steel'])
        hx = w * .72                                                        # hob
        soft(c, hx - .85, d * .18, 1.7, d * .6, .1, P['screen'], light=.08)
        for ox in (-.4, .4):
            c.new_sub_path(); c.arc(hx + ox, d * .48, .24, 0, 2 * math.pi)
            c.set_source_rgba(*rgb(P['steel']), .9); c.set_line_width(.05); c.stroke()


def wardrobe(c, w, d, P):
    soft(c, 0, 0, w, d, .1, P['wood'], light=.12)
    doors = max(2, round(w / 1.6))
    for i in range(1, doors):
        line(c, w * i / doors, .12, w * i / doors, d - .12, P['wood_dark'], .035, .8)
    for i in range(doors):
        line(c, w * (i + .5) / doors - .12, d - .2, w * (i + .5) / doors + .12, d - .2, P['wood_dark'], .06)


def tv(c, w, d, P):
    soft(c, 0, 0, w, max(.18, min(d, .3)), .06, P['screen'], rim=.3, light=.25)


def tv_unit(c, w, d, P):
    soft(c, 0, 0, w, d, .1, P['wood'], light=.14)
    soft(c, w * .12, .05, w * .76, .22, .05, P['screen'], rim=.3, light=.25)


def wc(c, w, d, P):
    soft(c, w * .15, 0, w * .7, d * .32, .14, P['white'], light=.04)       # cistern
    c.save()
    c.translate(w / 2, d * .62)
    c.scale(w * .38, d * .4)
    c.arc(0, 0, 1, 0, 2 * math.pi)
    c.restore()
    c.set_source_rgb(*rgb(P['white'])); c.fill_preserve()
    c.set_source_rgba(*rgb(P['steel']), .5); c.set_line_width(.04); c.stroke()
    c.save(); c.translate(w / 2, d * .64); c.scale(w * .24, d * .26); c.arc(0, 0, 1, 0, 2 * math.pi); c.restore()
    c.set_source_rgb(*rgb(P['glass'])); c.fill()


def basin(c, w, d, P):
    soft(c, 0, 0, w, d, .14, P['white'], light=.04)
    soft(c, w * .18, d * .25, w * .64, d * .58, .2, P['porcelain'], light=.02)
    flat(c, w * .26, d * .33, w * .48, d * .42, .16, P['glass'], .8)
    disc(c, w / 2, d * .14, .06, P['steel'])


def shower(c, w, d, P):
    soft(c, 0, 0, w, d, .08, P['porcelain'], light=.03)
    for i in range(1, int(w / .5)):
        line(c, i * .5, .05, i * .5, d - .05, '#FFFFFF', .02, .5)
    for i in range(1, int(d / .5)):
        line(c, .05, i * .5, w - .05, i * .5, '#FFFFFF', .02, .5)
    disc(c, w / 2, d / 2, .09, P['steel'])
    line(c, 0, d, w, d, P['glass'], .08, .9)                               # glass screen on the open side


def car(c, w, d, P):
    """A small car seen from above, its nose at y = 0."""
    soft(c, .1, 0, w - .2, d, w * .32, P['car'], light=.18)
    soft(c, w * .17, d * .26, w * .66, d * .48, w * .22, P['car_glass'], rim=.0, light=.1)   # cabin glass
    soft(c, w * .25, d * .36, w * .5, d * .3, w * .16, P['car'], light=.22)               # roof
    for x in (w * .2, w * .68):
        flat(c, x, .2, w * .14, .22, .06, '#FFFFFF', .95)                  # headlights
        flat(c, x, d - .4, w * .14, .2, .06, P['terracotta'], .95)         # tail lights


def plant(c, w, d, P, cx=None, cy=None, r=None, pot=True):
    cx = w / 2 if cx is None else cx
    cy = d / 2 if cy is None else cy
    r = min(w, d) * .45 if r is None else r
    if pot:
        disc(c, cx, cy, r * .55, P['clay'])
    for i in range(9):                                                     # pointed leaves around the crown
        a = i * 2 * math.pi / 9 + .35
        tip = (cx + math.cos(a) * r, cy + math.sin(a) * r)
        side = (math.cos(a + math.pi / 2) * r * .22, math.sin(a + math.pi / 2) * r * .22)
        c.move_to(cx, cy)
        c.curve_to(cx + side[0], cy + side[1], tip[0] + side[0] * .3, tip[1] + side[1] * .3, *tip)
        c.curve_to(tip[0] - side[0] * .3, tip[1] - side[1] * .3, cx - side[0], cy - side[1], cx, cy)
        c.set_source_rgb(*rgb(P['leaf'] if i % 2 else P['leaf_light']))
        c.fill()


def planter(c, w, d, P):
    soft(c, 0, 0, w, d, .2, P['clay'], light=.1)
    n = max(1, round(max(w, d) / 1.6))
    for i in range(n):
        t = (i + .5) / n
        plant(c, w, d, P, cx=w * t if w >= d else w / 2, cy=d / 2 if w >= d else d * t, r=min(w, d) * .48, pot=False)


def tree(c, w, d, P):
    import cairo
    r = min(w, d) / 2
    g = cairo.RadialGradient(w / 2 - r * .3, d / 2 - r * .3, r * .1, w / 2, d / 2, r)
    g.add_color_stop_rgb(0, *rgb(mix(P['leaf_light'], '#FFFFFF', .2)))
    g.add_color_stop_rgb(1, *rgb(P['leaf']))
    c.arc(w / 2, d / 2, r, 0, 2 * math.pi)
    c.set_source(g)
    c.fill()


def desk(c, w, d, P):
    top = min(d * .6, 2.4)
    soft(c, 0, 0, w, top, .14, P['wood'], light=.16)
    soft(c, w * .3, .18, w * .4, .16, .04, P['screen'], rim=.3, light=.25)   # monitor
    flat(c, w * .38, top * .55, w * .24, top * .16, .04, P['steel'], .9)     # keyboard
    if d - top > .9:                                                       # the chair, pulled out in front
        _at(c, w / 2 - .7, top + .2, 1.4, min(1.4, d - top - .25), 180, chair, {**P, 'cream': P['seafoam']})


def monitor(c, w, d, P):
    soft(c, 0, 0, w, d, .08, P['steel'], light=.12)
    flat(c, w * .1, d * .2, w * .8, d * .6, .05, P['screen'])
    c.move_to(w * .15, d * .5)
    for i, y in enumerate((.5, .5, .3, .7, .5, .5)):
        c.line_to(w * (.15 + .14 * i), d * y)
    c.set_source_rgb(*rgb(P['signal'])); c.set_line_width(.04); c.stroke()


def rug(c, w, d, P):
    flat(c, 0, 0, w, d, .1, P['cream'])
    rrect(c, .25, .25, w - .5, d - .5, .06)
    c.set_source_rgba(*rgb(P['terracotta']), .5); c.set_line_width(.05); c.stroke()


def mat(c, w, d, P):
    rug(c, w, d, P)
    disc(c, w / 2, d / 2, min(w, d) * .22, P['seafoam'])


def seating(c, w, d, P):
    """An outdoor set: two armchairs and a small round table between them."""
    s = min(w / 3, d)
    c.save(); armchair(c, s, s, P); c.restore()
    c.save(); c.translate(w - s, 0); armchair(c, s, s, P); c.restore()
    disc(c, w / 2, s / 2, s * .32, P['cream'])


def block(c, w, d, P):
    soft(c, 0, 0, w, d, .14, P['linen'])


DRAW = {
    'bed': bed, 'hospital_bed': hospital_bed, 'sofa': sofa, 'armchair': armchair, 'chair': chair,
    'table': table, 'coffee_table': coffee_table, 'side_table': side_table, 'dining': dining,
    'counter': counter, 'wardrobe': wardrobe, 'tv': tv, 'tv_unit': tv_unit, 'wc': wc, 'basin': basin,
    'shower': shower, 'car': car, 'plant': plant, 'planter': planter, 'tree': tree, 'desk': desk,
    'monitor': monitor, 'rug': rug, 'mat': mat, 'seating': seating, 'block': block,
}
# Items that lie flat on the floor cast no shadow; round ones cast a round one.
FLAT = {'rug', 'mat'}
ROUND = {'tree', 'plant'}


def draw(c, kind, w, d, theme='light'):
    """Draws one item in its own frame (feet). Unknown kinds are a plain rounded block."""
    DRAW.get(kind, block)(c, w, d, PALETTES[theme])


def footprint(kind, w, d):
    """The shapes that cast the item's shadow, in its own frame: ('rect', x, y, w, h, radius) or
    ('round', cx, cy, r). Only what stands up casts one: a desk's chair and top, not the floor between."""
    if kind in FLAT:
        return []
    if kind in ROUND:
        return [('round', w / 2, d / 2, min(w, d) / 2 * .9)]
    if kind == 'desk':
        top = min(d * .6, 2.4)
        shapes = [('rect', 0, 0, w, top, .14)]
        if d - top > .9:
            shapes.append(('rect', w / 2 - .7, top + .2, 1.4, min(1.4, d - top - .25), .3))
        return shapes
    if kind == 'seating':
        s = min(w / 3, d)
        return [('rect', 0, 0, s, s, .3), ('rect', w - s, 0, s, s, .3), ('round', w / 2, s / 2, s * .32)]
    if kind == 'dining':
        (tx, ty, tw, th), chairs = dining_layout(w, d)
        return [('rect', tx, ty, tw, th, .2)] + [('rect', x, y, cw, ch, .25) if turn in (0, 180) else
                                                 ('rect', x + (cw - ch) / 2, y + (ch - cw) / 2, ch, cw, .25)
                                                 for x, y, cw, ch, turn in chairs]
    if kind == 'tv':
        return [('rect', 0, 0, w, max(.18, min(d, .3)), .06)]
    return [('rect', 0, 0, w, d, .3 if kind in {'sofa', 'armchair', 'bed', 'car', 'hospital_bed'} else .14)]
