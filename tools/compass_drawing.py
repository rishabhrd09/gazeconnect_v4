"""Architectural 2D sheets and a furnished axonometric cutaway for Compass.

Drafting follows IS 962 / ISO 128 practice within one pen table: cut walls
heaviest, then doors and windows, then furniture, dimensions and patterns.
Feet-and-inch dimension chains with 45-degree ticks, room tags with clear
sizes, a north arrow taken from the plot's facing and a graphic scale. The
review sheet is a true-scale A3 drawing with a legend, schedules and a title
block. The cutaway orders faces exactly (BSP), lights them from one sun and
lets furniture and walls cast soft shadows on the floor.
"""
import math
import cairo
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import unary_union
from compass_architecture import parts, rect_points
from compass_standards import DOOR_HEAD, STAIR_CUT, TURNING_CIRCLE, WALL_OUTER, ft_in


def rgb(value):return tuple(int(value[i:i+2],16)/255 for i in (1,3,5))
def paint(c,color):c.set_source_rgb(*rgb(color))
def mix(a,b,t):return '#'+''.join(f'{round((x*(1-t)+y*t)*255):02X}' for x,y in zip(rgb(a),rgb(b)))
def path(c,points,close=True):
    c.new_path()
    for i,p in enumerate(points):(c.move_to if i==0 else c.line_to)(*p)
    if close:c.close_path()
def stroke(c,points,color,width=1.5,close=False):
    path(c,points,close);paint(c,color);c.set_line_width(width);c.stroke()
def text(c,x,y,value,size,color,bold=False,center=True):
    c.select_font_face('sans-serif',cairo.FONT_SLANT_NORMAL,cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size);e=c.text_extents(str(value));paint(c,color)
    c.move_to(x-e.width/2-e.x_bearing if center else x,y);c.show_text(str(value))
def polygon(c,poly,point,fill,line_color=None,width=1):
    path(c,[point(x,y) for x,y in poly.exterior.coords])
    for ring in poly.interiors:
        for i,(x,y) in enumerate(ring.coords):(c.move_to if i==0 else c.line_to)(*point(x,y))
        c.close_path()
    c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD);paint(c,fill)
    if line_color:
        c.fill_preserve();paint(c,line_color);c.set_line_width(width);c.stroke()
    else:c.fill()


def font(c, size, bold=False):
    c.select_font_face('sans-serif', cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size)


def width_of(c, value, size, bold=False):
    font(c, size, bold)
    return c.text_extents(str(value)).x_advance


def halo_text(c, x, y, value, size, color, halo, bold=False, spread=3., anchor='center'):
    """Text on a thin outline of the background, so floor patterns never cross it."""
    font(c, size, bold)
    e = c.text_extents(str(value))
    left = {'center': x - e.width / 2 - e.x_bearing, 'left': x - e.x_bearing, 'right': x - e.width - e.x_bearing}[anchor]
    c.new_path(); c.move_to(left, y); c.text_path(str(value))
    c.set_line_join(cairo.LINE_JOIN_ROUND); paint(c, halo); c.set_line_width(spread); c.stroke_preserve()
    paint(c, color); c.fill()


def dashed(c, points, color, width, dash, close=False):
    c.set_dash(dash); stroke(c, points, color, width, close); c.set_dash([])


def sheet_size(m,technical=False):
    if technical:return 2100,1485   # A3 at 5 px/mm (see draw_sheet)
    # Crop unused canvas around the real aspect ratio. Never distort X vs Y to
    # occupy a landscape viewport; gaze zoom can inspect all four corners.
    width,depth=max(m['width'],m['depth']),min(m['width'],m['depth'])
    scale=min(1390/width,790/depth)
    return math.ceil(width*scale+190), math.ceil(depth*scale+180)


def fixture_palette(palette,dark):
    bg,surface,ink,muted,edge=palette
    return {'fixture':mix(surface,muted,.22), 'linen':mix(surface,muted,.16),
            'wood':'#7E7162' if dark else '#DDCBB1', 'stair':'#8A9290' if dark else '#E4DFD3',
            'pillow':'#D6DDD9' if dark else '#FFFDF8', 'metal':'#779DA4' if dark else '#BCD4D6',
            'plant':'#5E8A63' if dark else '#A9C9A0'}


FINISH = {'master': 'wood', 'bed': 'wood', 'icu': 'wood', 'kitchen': 'small', 'bath': 'small', 'store': 'small',
          'green': 'grass', 'paved': 'stone', 'balcony': 'square'}


def floor_finish(c, poly, point, fill, edge, kind=None, contact=True, colour=None, width=.65):
    """Restrained floor pattern for the room's use, clipped to the true room."""
    pattern = FINISH.get(kind, 'tile')
    c.save()
    path(c,[point(x,y) for x,y in poly.exterior.coords])
    for ring in poly.interiors:
        for i,(x,y) in enumerate(ring.coords):(c.move_to if i==0 else c.line_to)(*point(x,y))
        c.close_path()
    c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD);c.clip()
    x1,y1,x2,y2=poly.bounds
    tone = colour or mix(fill,edge,.13)
    # A bounded pattern count also covers very large plots without huge SVGs.
    if pattern == 'grass':
        step=max(1.1,(x2-x1)/45,(y2-y1)/45)
        for i in range(int((x2-x1)/step)+1):
            for j in range(int((y2-y1)/step)+1):
                x=x1+i*step+(.45*step if j%2 else 0)+((i*7+j*3)%5)*.08*step; y=y1+j*step+((i*3+j*5)%4)*.1*step
                for dx in (-.16,0,.16):
                    stroke(c,[point(x+dx,y),point(x+dx*1.6,y+.42*step)],tone,width)
    else:
        if pattern == 'wood':
            step, run = max(.65,(y2-y1)/80,(x2-x1)/80), 5
        elif pattern == 'stone':
            step, run = max(1.5,(y2-y1)/60,(x2-x1)/60), 1.4
        else:
            size = {'small': 1., 'square': 1.5}.get(pattern, 2.)
            step, run = max(size,(y2-y1)/80,(x2-x1)/80), 1
        for row in range(int((y2-y1)/step)+1):
            y=y1+row*step
            stroke(c,[point(x1,y),point(x2,y)],tone,width)
            seg=step*run
            offset=seg*.5 if run>1 and row%2 else 0
            for col in range(int((x2-x1)/seg)+2):
                x=x1+col*seg-offset
                stroke(c,[point(x,y),point(x,min(y+step,y2))],tone,width)
    # Soft contact shading sits inside the wall; no room outline moves.
    if contact:
        for spread,alpha in ((14,.025),(8,.035),(3,.06)):
            path(c,[point(x,y) for x,y in poly.exterior.coords])
            c.set_source_rgba(.1,.15,.15,alpha);c.set_line_width(spread);c.stroke()
    c.restore()


def shaded_face(c, points, tone, strength=.08):
    path(c,points)
    ys=[p[1] for p in points]
    gradient=cairo.LinearGradient(0,min(ys),0,max(ys)+.01)
    gradient.add_color_stop_rgb(0,*rgb(mix(tone,'#FFFFFF',strength)))
    gradient.add_color_stop_rgb(1,*rgb(mix(tone,'#283A3D',strength)))
    c.set_source(gradient);c.fill_preserve()
    paint(c,mix(tone,'#283A3D',.14));c.set_line_width(.55);c.stroke()


# ---- Plan drawing, shared by the screen sheet and the A3 review sheet -------------------

# Line widths and text sizes in sheet units: screen pixels, or millimetres on paper
# (ISO 128 / IS 962: wide 0.5, medium 0.35/0.25, narrow 0.18/0.13; text 2.5-3.5 mm).
SCREEN = dict(plot=2.0, wall=1.7, door=1.6, arc=1.05, window=1.25, glass=1.05, fine=1.05, dim=1.0, tick=1.7,
              pattern=.6, halo=3.4, name=19., size=14., area=12.5, dim_text=14., small=12., minimum=11.,
              gap=11., over=5., tier1=31., tier2=55., tick_len=4.5, text_lift=3., dash=(5., 4.))
PRINT = dict(plot=.5, wall=.5, door=.35, arc=.18, window=.25, glass=.18, fine=.18, dim=.18, tick=.35,
             pattern=.13, halo=.7, name=3.2, size=2.3, area=2.1, dim_text=2.5, small=2.0, minimum=1.6,
             gap=1.5, over=2., tier1=8., tier2=15., tick_len=1.2, text_lift=.9, dash=(1.2, .9))


class Plan:
    """One floor drawn through `point` (plan feet to sheet units, `k` units per foot)."""

    def __init__(self, c, m, palette, point, k, pen, technical=False, rotated=False):
        self.c, self.m, self.point, self.k, self.pen = c, m, point, k, pen
        self.technical, self.rotated = technical, rotated
        bg, surface, ink, muted, edge = palette
        self.palette = palette
        self.dark = not technical and sum(rgb(bg)) < 1.5
        self.bg, self.surface, self.edge = ('#FFFFFF', '#FFFFFF', '#9A9A9A') if technical else (bg, surface, edge)
        self.ink, self.muted = ('#141414', '#4A4A4A') if technical else (ink, muted)
        if technical:
            self.wall, self.wall_inner, self.wall_line = '#2A2A2A', '#6B6B6B', '#000000'
            self.line, self.fine, self.dim, self.glass = '#1E1E1E', '#5A5A5A', '#303030', '#2D6E7E'
        else:
            self.wall = mix(ink, surface, .14) if self.dark else mix(ink, '#000000', .12)
            self.wall_inner = mix(self.wall, surface, .3)
            self.wall_line = mix(self.wall, '#FFFFFF', .35) if self.dark else mix(self.wall, '#000000', .35)
            self.line = mix(ink, surface, .22)
            self.fine = mix(ink, surface, .45 if self.dark else .42)
            self.dim = muted
            self.glass = '#8FC4CE' if self.dark else '#367B8D'
        self.by_id = {r['placementId']: r for r in m['rooms']}
        arch = m['architecture']
        self.walls, self.doors, self.windows, self.fixtures = arch['walls'], arch['doors'], arch['windows'], arch['fixtures']

    # -- Helpers ---------------------------------------------------------------------------
    def pts(self, points):
        return [self.point(*p) for p in points]

    def room_fill(self, room):
        if self.technical:
            return '#F1F4EE' if room['kind'] == 'green' else '#F4F2EE' if room['outdoor'] else '#FFFFFF'
        fill = mix(self.surface, room['tone'], .13 if self.dark else .46)
        if room['outdoor']:
            fill = mix(self.surface, '#6D9770' if room['kind'] == 'green' else '#A79A84', .16 if self.dark else .2)
        return fill

    # -- Layers ----------------------------------------------------------------------------
    def floors(self):
        for room in self.m['rooms']:
            fill = self.room_fill(room)
            for poly in room['polygons']:
                polygon(self.c, poly, self.point, fill)
                tone = '#D3D3D3' if self.technical else None
                floor_finish(self.c, poly, self.point, fill, self.edge, room['kind'], not self.technical, tone, self.pen['pattern'])

    def furniture(self):
        fp = fixture_palette(self.palette, self.dark)
        for fixture in self.fixtures:
            if fixture['kind'] == 'stair':
                self.stair(fixture, fp)
                continue
            if not self.technical:
                self.c.save(); self.c.translate(2, 3)
                for patch in fixture['patches']:
                    path(self.c, self.pts(patch['points'])); self.c.set_source_rgba(.08, .12, .12, .10); self.c.fill()
                self.c.restore()
            for patch in fixture['patches']:
                path(self.c, self.pts(patch['points']))
                paint(self.c, '#FFFFFF' if self.technical else fp[patch['tone']]); self.c.fill()
            for item in fixture['lines']:
                stroke(self.c, self.pts(item['points']), self.fine, self.pen['fine'], item['closed'])

    def stair(self, fixture, fp):
        """Treads below the cut solid, above it dashed past a break line; UP or DN at the first riser."""
        c, pen = self.c, self.pen
        ground = self.m['floor'] == 'ground'
        solids = fixture['solids']
        cut = next((i for i, s in enumerate(solids) if s['height'] > STAIR_CUT + 1e-6), None) if ground else None
        fill = '#FFFFFF' if self.technical else fp['stair']
        for i, solid in enumerate(solids):
            pts = self.pts(solid['points'])
            above = cut is not None and i >= cut
            path(c, pts); paint(c, fill if not above else (mix(fill, self.surface, .5))); c.fill()
            (dashed(c, pts, self.fine, pen['fine'], pen['dash'], True) if above else stroke(c, pts, self.line, pen['fine'], True))
        walk = fixture['walk']
        end = None
        if cut is not None and cut > 0:
            shared = Polygon(solids[cut - 1]['points']).intersection(Polygon(solids[cut]['points']))
            if shared.geom_type == 'LineString' and shared.length > .01:
                (ax, ay), (bx, by) = shared.coords[0], shared.coords[-1]
                mx, my = (ax + bx) / 2, (ay + by) / 2
                ex, ey = (bx - ax) / shared.length, (by - ay) / shared.length
                tx, ty = -ey, ex
                c1 = Point(*Polygon(solids[cut]['points']).centroid.coords[0])
                if (c1.x - mx) * tx + (c1.y - my) * ty < 0:
                    tx, ty = -tx, -ty
                zig = [(ax - ex * .3 - tx * .25, ay - ey * .3 - ty * .25), (mx - ex * .25 - tx * .1, my - ey * .25 - ty * .1),
                       (mx + tx * .35, my + ty * .35), (mx + ex * .25 + tx * .1, my + ey * .25 + ty * .1),
                       (bx + ex * .3 + tx * .55, by + ey * .3 + ty * .55)]
                stroke(c, self.pts(zig), self.line, pen['door'])
                hit = LineString(walk).intersection(LineString([(ax - ex * 5, ay - ey * 5), (bx + ex * 5, by + ey * 5)]))
                if hit.geom_type == 'Point':
                    end = (hit.x, hit.y)
        route = walk if ground else list(reversed(walk))
        if end is not None:
            route = [walk[0], end]
        stroke(c, self.pts(route), self.line, pen['fine'])
        (ax, ay), (bx, by) = route[-2], route[-1]
        length = math.dist((ax, ay), (bx, by)) or 1
        ux, uy = (bx - ax) / length, (by - ay) / length
        head = [(bx - ux * .55 - uy * .35, by - uy * .55 + ux * .35), (bx, by), (bx - ux * .55 + uy * .35, by - uy * .55 - ux * .35)]
        stroke(c, self.pts(head), self.line, pen['fine'])
        sx, sy = self.point(*route[0])
        c.new_path(); c.arc(sx, sy, .16 * self.k if self.technical else max(2., .16 * self.k), 0, math.tau); paint(c, self.line); c.fill()
        label = 'UP' if ground else 'DN'
        (px, py), (qx, qy) = route[0], route[1]
        length = math.dist((px, py), (qx, qy)) or 1
        lx, ly = self.point(px - (qx - px) / length * .75, py - (qy - py) / length * .75)
        halo_text(c, lx, ly + pen['small'] * .35, label, pen['small'], self.ink, fill, True, pen['halo'] * .8)

    def wall_layers(self):
        cuts = unary_union([LineString([o['a'], o['b']]).buffer(.5, cap_style=2) for o in [*self.doors, *self.windows]])
        outer = unary_union([LineString([w['a'], w['b']]).buffer(w['thickness'] / 2, cap_style=2, join_style=2)
                             for w in self.walls if w['exterior']])
        inner = unary_union([LineString([w['a'], w['b']]).buffer(w['thickness'] / 2, cap_style=2, join_style=2)
                             for w in self.walls if not w['exterior']])
        inner = inner.difference(outer) if not outer.is_empty else inner
        for geom, fill in ((inner.difference(cuts), self.wall_inner), (outer.difference(cuts), self.wall)):
            for poly in parts(geom):
                if poly.geom_type == 'Polygon':
                    polygon(self.c, poly, self.point, fill)
        # One outline round all walls: T-junctions read as one built mass.
        self.c.set_line_join(cairo.LINE_JOIN_MITER)
        for poly in parts(self.m['architecture']['wallFootprint']):
            if poly.geom_type != 'Polygon':
                continue
            for ring in (poly.exterior, *poly.interiors):
                stroke(self.c, self.pts(list(ring.coords)), self.wall_line, self.pen['wall'] * .55, True)

    def window_symbols(self):
        c, pen = self.c, self.pen
        for w in self.windows:
            (ax, ay), (bx, by) = w['a'], w['b']
            length = math.dist(w['a'], w['b'])
            ux, uy = (bx - ax) / length, (by - ay) / length
            nx, ny = -uy, ux
            room = self.by_id.get(w['roomId'])
            mx, my = (ax + bx) / 2, (ay + by) / 2
            if room and room['shape'].covers(Point(mx + nx * .2, my + ny * .2)):
                nx, ny = -nx, -ny                        # n points out of the room
            t = WALL_OUTER / 2
            face = [((ax + nx * o, ay + ny * o), (bx + nx * o, by + ny * o)) for o in (-t, t)]
            for a, b in face:
                stroke(c, self.pts([a, b]), self.line, pen['window'])
            for x, y in ((ax, ay), (bx, by)):
                stroke(c, self.pts([(x - nx * t, y - ny * t), (x + nx * t, y + ny * t)]), self.line, pen['window'])
            glass = [((ax + nx * o, ay + ny * o), (bx + nx * o, by + ny * o)) for o in (-.06, .06)]
            for a, b in glass:
                if w['kind'] == 'ventilator':
                    dashed(c, self.pts([a, b]), self.glass, pen['glass'], pen['dash'])
                else:
                    stroke(c, self.pts([a, b]), self.glass, pen['glass'])
            if w['kind'] == 'window':
                o = t + .16
                stroke(c, self.pts([(ax - ux * .2 + nx * o, ay - uy * .2 + ny * o), (bx + ux * .2 + nx * o, by + uy * .2 + ny * o)]),
                       self.line, pen['fine'])
            if self.technical:
                tx, ty = self.point(mx + nx * 1.25, my + ny * 1.25)
                halo_text(c, tx, ty + pen['small'] * .35, w['tag'], pen['small'], self.ink, self.bg, True, pen['halo'])

    def door_symbols(self):
        c, pen = self.c, self.pen
        for door in self.doors:
            path(c, self.pts(door['leafPolygon'])); paint(c, self.surface); c.fill_preserve()
            paint(c, self.line); c.set_line_width(pen['door']); c.stroke()
            stroke(c, self.pts(door['arc']), self.fine, pen['arc'])
            (ax, ay), (bx, by) = door['a'], door['b']
            mx, my = (ax + bx) / 2, (ay + by) / 2
            nx, ny = door['normal']                         # Into the room the leaf swings into.
            if door['type'] == 'main':
                # Entry arrow outside the door, pointing in.
                o = WALL_OUTER / 2 + .35
                tip = (mx - nx * o, my - ny * o)
                back = (mx - nx * (o + 1.6), my - ny * (o + 1.6))
                ux, uy = (bx - ax) / door['width'], (by - ay) / door['width']
                tri = [tip, (back[0] + ux * .8, back[1] + uy * .8), (back[0] - ux * .8, back[1] - uy * .8)]
                path(c, self.pts(tri)); paint(c, self.ink); c.fill()
                lx, ly = self.point(mx - nx * (o + 2.6), my - ny * (o + 2.6))
                halo_text(c, lx, ly + pen['small'] * .35, 'ENTRY', pen['small'], self.ink, self.bg, True, pen['halo'])
            if self.technical:
                tx, ty = self.point(mx - nx * 1.1, my - ny * 1.1)
                halo_text(c, tx, ty + pen['small'] * .35, door['tag'], pen['small'], self.ink, self.bg, True, pen['halo'])

    def turning(self):
        for room in self.m['rooms']:
            if not room.get('turning'):
                continue
            x, y = self.point(*room['turning'])
            r = TURNING_CIRCLE / 2 * self.k
            self.c.set_dash(self.pen['dash']); self.c.new_path(); self.c.arc(x, y, r, 0, math.tau)
            paint(self.c, self.fine); self.c.set_line_width(self.pen['fine']); self.c.stroke(); self.c.set_dash([])
            halo_text(self.c, x, y + r - self.pen['small'] * .6, "Ø5'-0\" turning", self.pen['small'] * .9, self.muted,
                      self.room_fill(room), False, self.pen['halo'] * .7)

    def labels(self):
        c, pen = self.c, self.pen
        for room in self.m['rooms']:
            if self.rotated:
                bounds = max(room['labelRegions'], key=lambda r: min((r[3]-r[1])/2, r[2]-r[0])**2 * ((r[3]-r[1])*(r[2]-r[0]))**.15)
            else:
                bounds = room['labelBounds']
            x1, y1, x2, y2 = bounds
            x, y = self.point((x1 + x2) / 2, (y1 + y2) / 2)
            span_x, span_y = ((y2 - y1), (x2 - x1)) if self.rotated else ((x2 - x1), (y2 - y1))
            avail = max(pen['name'] * 2.2, span_x * self.k - pen['name'] * .6)
            height = max(pen['name'] * 1.6, span_y * self.k - pen['name'] * .3)
            name = room['room'].upper()
            clear = room.get('clear')
            if clear:
                size_line = f"{ft_in(clear[0])} × {ft_in(clear[1])}"
            elif room['outdoor'] or abs(room['shape'].area - room['shape'].envelope.area) <= .01:
                r = room['coords']
                size_line = f"{ft_in(r['x2'] - r['x1'])} × {ft_in(r['y2'] - r['y1'])}"
            else:
                size_line = ''
            area_line = f"{round(room['area_sqft']):,} sq ft"
            size = pen['name']

            def wrap(sz):
                lines, current = [], ''
                for word in name.split():
                    trial = (current + ' ' + word).strip()
                    if current and width_of(c, trial, sz, True) > avail:
                        lines.append(current); current = word
                    else:
                        current = trial
                return lines + ([current] if current else [])
            lines = wrap(size)
            while size > pen['minimum'] and (len(lines) > 2 or any(width_of(c, t, size, True) > avail for t in lines)
                                             or (len(lines) * 1.15 + 2.4) * size > height):
                size -= .5 if not self.technical else .1
                lines = wrap(size)
            small = max(pen['minimum'] * .9, min(pen['size'], size * .76))
            tiny = max(pen['minimum'] * .85, min(pen['area'], size * .68))
            show_size = size_line and width_of(c, size_line, small) <= avail + pen['name']
            block = len(lines) * size * 1.15 + (small * 1.3 if show_size else 0) + tiny * 1.25
            fill = self.room_fill(room)
            top = y - block / 2
            for i, value in enumerate(lines):
                halo_text(c, x, top + size * (i + .9) * 1.15 - size * .15, value, size, self.ink, fill, True, pen['halo'])
            cursor = top + len(lines) * size * 1.15
            if show_size:
                halo_text(c, x, cursor + small * 1.05, size_line, small, self.ink if self.technical else self.muted, fill, False, pen['halo'])
                cursor += small * 1.3
            halo_text(c, x, cursor + tiny * 1.05, area_line, tiny, self.muted, fill, False, pen['halo'])

    def chain(self, values, axis, at, tier_text=True):
        """One dimension line: ticks at every value (plan feet along `axis`), text between them."""
        c, pen = self.c, self.pen
        values = sorted(set(round(v, 4) for v in values))
        if axis == 'x':
            pos = [self.point(v, 0)[0] if not self.rotated else self.point(0, v)[0] for v in values]
        else:
            pos = [self.point(0, v)[1] if not self.rotated else self.point(v, 0)[1] for v in values]
        horizontal = axis == 'x'
        line, edge = at
        tl = pen['tick_len']
        a, b = min(pos), max(pos)
        stroke(c, [(a - tl * 1.6, line), (b + tl * 1.6, line)] if horizontal else [(line, a - tl * 1.6), (line, b + tl * 1.6)],
               self.dim, pen['dim'])
        for p in pos:
            ext = [(p, edge), (p, line + (pen['over'] if line > edge else -pen['over']))] if horizontal else \
                  [(edge, p), (line + (pen['over'] if line > edge else -pen['over']), p)]
            stroke(c, ext, self.dim, pen['dim'])
            tick = [(p - tl, line + tl), (p + tl, line - tl)] if horizontal else [(line - tl, p + tl), (line + tl, p - tl)]
            stroke(c, tick, self.ink, pen['tick'])
        for (v1, p1), (v2, p2) in zip(zip(values, pos), list(zip(values, pos))[1:]):
            label = ft_in(abs(v2 - v1))
            room = abs(p2 - p1)
            if width_of(c, label, pen['dim_text']) + 4 * tl > room and not tier_text:
                continue
            size = pen['dim_text'] if width_of(c, label, pen['dim_text']) + 4 * tl <= room else pen['dim_text'] * .8
            if horizontal:
                halo_text(c, (p1 + p2) / 2, line - pen['text_lift'], label, size, self.ink, self.bg, False, pen['halo'] * .6)
            else:
                c.save(); c.translate(line - pen['text_lift'], (p1 + p2) / 2); c.rotate(-math.pi / 2)
                halo_text(c, 0, 0, label, size, self.ink, self.bg, False, pen['halo'] * .6); c.restore()

    def chains(self, top, side, side_x):
        """Grid lines of the rooms, then the overall plot, on the top and one side."""
        m = self.m
        xs = {0., float(m['width'])} | {x for r in m['rooms'] for poly in r['polygons'] for x, _ in poly.exterior.coords}
        ys = {0., float(m['depth'])} | {y for r in m['rooms'] for poly in r['polygons'] for _, y in poly.exterior.coords}
        across, down = (ys, xs) if self.rotated else (xs, ys)
        pen = self.pen
        total_a = (0., m['depth'] if self.rotated else m['width'])
        total_d = (0., m['width'] if self.rotated else m['depth'])
        self.chain(across, 'x', (top - pen['tier1'], top - pen['gap']), False)
        self.chain(total_a, 'x', (top - pen['tier2'], top - pen['tier1'] - pen['over']))
        sign = 1 if side == 'right' else -1
        self.chain(down, 'y', (side_x + sign * pen['tier1'], side_x + sign * pen['gap']), False)
        self.chain(total_d, 'y', (side_x + sign * pen['tier2'], side_x + sign * (pen['tier1'] + pen['over'])))

    def plot_line(self):
        m = self.m
        dashed(self.c, self.pts([(0, 0), (m['width'], 0), (m['width'], m['depth']), (0, m['depth'])]),
               self.edge, self.pen['plot'] * .75, (self.pen['dash'][0] * 2.2, self.pen['dash'][1], self.pen['dash'][0] * .4, self.pen['dash'][1]), True)

    def draw(self):
        self.plot_line()
        self.floors()
        self.furniture()
        self.turning()
        self.wall_layers()
        self.window_symbols()
        self.door_symbols()
        self.labels()


def north_vector(facing):
    """North in plan coordinates (x along the road, y away from it) for the plot's facing."""
    return {'South': (0., 1.), 'North': (0., -1.), 'East': (1., 0.), 'West': (-1., 0.)}.get(str(facing).title())


def north_arrow(c, centre, direction, radius, ink, bg, pen):
    """A circle with a filled half-arrow and N, pointing to `direction` on the sheet."""
    if direction is None:
        return
    x, y = centre
    dx, dy = direction
    length = math.hypot(dx, dy) or 1
    dx, dy = dx / length, dy / length
    c.new_path(); c.arc(x, y, radius, 0, math.tau); paint(c, ink); c.set_line_width(pen['fine']); c.stroke()
    tip = (x + dx * radius * .95, y + dy * radius * .95)
    tail = (x - dx * radius * .7, y - dy * radius * .7)
    side = (-dy * radius * .38, dx * radius * .38)
    path(c, [tip, (tail[0] + side[0], tail[1] + side[1]), (x - dx * radius * .35, y - dy * radius * .35)]); paint(c, ink); c.fill()
    path(c, [tip, (tail[0] - side[0], tail[1] - side[1]), (x - dx * radius * .35, y - dy * radius * .35)])
    paint(c, bg); c.fill_preserve(); paint(c, ink); c.set_line_width(pen['fine']); c.stroke()
    lx, ly = x + dx * (radius + pen['small'] * .9), y + dy * (radius + pen['small'] * .9)
    halo_text(c, lx, ly + pen['small'] * .38, 'N', pen['small'] * 1.15, ink, bg, True, pen['halo'] * .6)


def scale_bar(c, x, y, k, marks, unit, ink, bg, pen, height):
    """Alternating blocks at `marks` (in `unit`), `k` sheet units per unit."""
    for i, (a, b) in enumerate(zip(marks, marks[1:])):
        c.rectangle(x + a * k, y, (b - a) * k, height)
        paint(c, ink if i % 2 == 0 else bg); c.fill_preserve(); paint(c, ink); c.set_line_width(pen['fine']); c.stroke()
    for value in marks:
        label = f'{value:g}'
        halo_text(c, x + value * k, y - pen['text_lift'] * 1.2, label, pen['small'] * .9, ink, bg, False, pen['halo'] * .5)
    halo_text(c, x + marks[-1] * k + pen['small'] * .6, y + height, unit, pen['small'] * .9, ink, bg, True, pen['halo'] * .5, 'left')


def clear_of(centre, span, lo, hi, avoid, gap):
    """Centre for a label of length `span` on [lo, hi] that keeps `gap` from `avoid`."""
    if avoid is None or abs(avoid - centre) >= span / 2 + gap:
        return centre
    sides = [(lo, avoid - gap), (avoid + gap, hi)]
    a, b = max(sides, key=lambda side: side[1] - side[0])
    return (a + b) / 2 if b - a >= span else centre


def entry_point(m):
    main = next((d for d in m['architecture']['doors'] if d['type'] == 'main'), None)
    if main is None:
        return None
    (ax, ay), (bx, by) = main['a'], main['b']
    return ((ax + bx) / 2, (ay + by) / 2)


def draw_2d(c,m,palette,cw,ch,technical=False):
    if technical:
        return draw_sheet(c, m)
    bg,surface,ink,muted,edge=palette
    rotated=m['depth']>m['width']
    across,down=(m['depth'],m['width']) if rotated else (m['width'],m['depth'])
    s=min((cw-190)/across,(ch-190)/down)
    left=(cw-across*s)/2;top=84;bottom=top+down*s;right=left+across*s
    point=(lambda x,y:(left+y*s,top+x*s)) if rotated else (lambda x,y:(left+x*s,top+(m['depth']-y)*s))
    c.rectangle(left,top,across*s,down*s);paint(c,surface);c.fill()
    plan = Plan(c, m, palette, point, s, SCREEN, False, rotated)
    plan.draw()
    plan.chains(top, 'right', right)
    pen = SCREEN
    # North arrow from the plot's facing, in the free top-left corner.
    north = north_vector(m.get('facing'))
    if north:
        ox, oy = point(0, 0); nx, ny = point(north[0], north[1])
        north_arrow(c, (left - 47, top + 26), (nx - ox, ny - oy), 17, ink, bg, pen)
    road_y=bottom+25
    marks = (0, 5, 10) if 10 * s <= 260 else (0, 2, 5)
    bar = marks[-1] * s
    # Bottom-left beside a road on the left; bottom-right when the road runs along the bottom.
    scale_x = left if rotated else right - bar - 26
    scale_bar(c, scale_x, road_y + 8, s, marks, 'FT', ink, bg, pen, 6)
    entry = entry_point(m)
    road = 'FRONT / ROAD · '+str(m['facing']).upper()
    if rotated:
        stroke(c,[(left-23,top),(left-23,bottom)],edge,1)
        # The road name keeps clear of the ENTRY arrow beside the main door.
        centre=clear_of((top+bottom)/2,width_of(c,road,22,True),top,bottom,point(*entry)[1] if entry else None,70)
        c.save();c.translate(left-42,centre);c.rotate(-math.pi/2)
        text(c,0,0,road,22,ink,True);c.restore()
        text(c,cw/2,road_y+12,f"{m['floor'].title()} floor plan · front / road on the left · true proportions",21,ink,True)
    else:
        stroke(c,[(left,road_y-14),(left+across*s,road_y-14)],edge,1)
        span=width_of(c,road,23,True)
        centre=clear_of(min(cw/2,scale_x-30-span/2),span,left,scale_x-30,point(*entry)[0] if entry else None,70)
        text(c,centre,road_y+14,road,23,ink,True)
    built = sum(r['area_sqft'] for r in m['rooms'] if not r['outdoor'])
    text(c,cw/2,road_y+39,f"Built-up {round(built):,} sq ft · room sizes clear between proposed walls · dimensions in feet and inches",17,muted)


# ---- A3 review sheet (millimetres) -----------------------------------------------------

SCALES = (50, 100, 200, 500, 1000)


def draw_sheet(c, m):
    """True-scale A3 landscape: plan, chains, legend, schedules, area statement, title block."""
    W, H = 420., 297.
    pen = PRINT
    ink, muted, bg = '#141414', '#4A4A4A', '#FFFFFF'
    paint(c, bg); c.rectangle(0, 0, W, H); c.fill()
    frame = (15., 10., 410., 287.)
    split = 302.
    stroke(c, rect_points(frame), ink, .7, True)
    stroke(c, [(split, frame[1]), (split, frame[3])], ink, .5)
    area = (frame[0] + 6 + pen['tier2'] + 4, frame[1] + 6 + pen['tier2'] + 4, split - 8, frame[3] - 18)
    aw, ah = area[2] - area[0], area[3] - area[1]
    for scale in SCALES:
        k = 304.8 / scale
        if m['width'] * k <= aw and m['depth'] * k <= ah:
            break
    ox = area[0] + (aw - m['width'] * k) / 2
    oy = area[1] + (ah - m['depth'] * k) / 2
    point = lambda x, y: (ox + x * k, oy + (m['depth'] - y) * k)
    plan = Plan(c, m, ('#FFFFFF', '#FFFFFF', ink, muted, '#9A9A9A'), point, k, pen, True, False)
    plan.draw()
    plan.chains(oy, 'left', ox)
    bottom = oy + m['depth'] * k
    stroke(c, [(ox, bottom + 5), (ox + m['width'] * k, bottom + 5)], muted, pen['fine'])
    road = f"FRONT / ROAD · {str(m['facing']).upper()}"
    entry = entry_point(m)
    centre = clear_of(ox + m['width'] * k / 2, width_of(c, road, 3.0, True), ox, ox + m['width'] * k,
                      point(*entry)[0] if entry else None, 9)
    halo_text(c, centre, bottom + 9.5, road, 3.0, ink, bg, True, .6)
    # -- Right column: north, scale, legend, schedules, areas, notes, title block.
    x0, x1 = split + 6, frame[2] - 6
    y = frame[1] + 6
    north = north_vector(m.get('facing'))
    if north:
        ax, ay = point(0, 0); bx, by = point(north[0], north[1])
        north_arrow(c, (x0 + 10, y + 12), (bx - ax, by - ay), 8, ink, bg, pen)
    halo_text(c, x0 + 26, y + 6, f'SCALE 1:{scale} ON A3', 3.0, ink, bg, True, .5, 'left')
    # The longest standard bar under 66 mm, in feet and in metres.
    feet = max((mk for mk in ((0, 2, 5, 10), (0, 5, 10, 20), (0, 10, 20, 50), (0, 25, 50, 100), (0, 50, 100, 200), (0, 100, 200, 500))
                if mk[-1] * k <= 66), key=lambda mk: mk[-1], default=(0, 2, 5, 10))
    scale_bar(c, x0 + 26, y + 12.5, k, feet, 'FT', ink, bg, pen, 1.6)
    metres = max((mk for mk in ((0, 1, 2, 5), (0, 2, 5, 10), (0, 5, 10, 20), (0, 10, 20, 50), (0, 25, 50, 100), (0, 50, 100, 200))
                  if mk[-1] * k * 3.28084 <= 66), key=lambda mk: mk[-1], default=(0, 1, 2, 5))
    scale_bar(c, x0 + 26, y + 20, k * 3.28084, metres, 'M', ink, bg, pen, 1.6)
    y += 28
    stroke(c, [(split, y), (frame[2], y)], ink, .35)
    # Legend.
    y += 6
    halo_text(c, x0, y, 'LEGEND', 2.8, ink, bg, True, .4, 'left'); y += 4
    legend = [('wall9', 'Proposed 9" (230 mm) outer wall'), ('wall6', 'Proposed 6" (150 mm) inner wall'),
              ('door', 'Door with swing; ENTRY arrow at the main door'), ('window', 'Window with sill'),
              ('vent', 'Ventilator above the cut plane'), ('stair', 'Stair: UP / DN from the first riser')]
    if any(r.get('turning') for r in m['rooms']):
        legend.append(('turn', "5'-0\" wheelchair turning space"))
    for kind, label in legend:
        cx, cy = x0 + 5, y + 1.5
        if kind in ('wall9', 'wall6'):
            c.rectangle(cx - 4, cy - (1.15 if kind == 'wall9' else .8), 8, 2.3 if kind == 'wall9' else 1.6)
            paint(c, '#2A2A2A' if kind == 'wall9' else '#6B6B6B'); c.fill_preserve(); paint(c, '#000000'); c.set_line_width(.18); c.stroke()
        elif kind == 'door':
            stroke(c, [(cx - 3, cy + 2), (cx - 3, cy - 2.5)], ink, .35)
            c.new_path(); c.arc_negative(cx - 3, cy + 2, 4.5, 0, -math.pi / 2); paint(c, '#5A5A5A'); c.set_line_width(.18); c.stroke()
        elif kind in ('window', 'vent'):
            for o in (-1, 1):
                stroke(c, [(cx - 4, cy + o), (cx + 4, cy + o)], ink, .25)
            (dashed if kind == 'vent' else stroke)(c, [(cx - 4, cy), (cx + 4, cy)], '#2D6E7E', .18, *((pen['dash'],) if kind == 'vent' else ()))
        elif kind == 'stair':
            for i in range(4):
                stroke(c, [(cx - 4 + i * 2, cy - 2), (cx - 4 + i * 2, cy + 2)], ink, .18)
            stroke(c, [(cx - 4, cy), (cx + 3.5, cy)], ink, .18)
            path(c, [(cx + 4.4, cy), (cx + 3, cy - .8), (cx + 3, cy + .8)]); paint(c, ink); c.fill()
        else:
            c.set_dash(pen['dash']); c.new_path(); c.arc(cx, cy, 2.4, 0, math.tau); paint(c, ink); c.set_line_width(.18); c.stroke(); c.set_dash([])
        halo_text(c, x0 + 12, y + 2.5, label, 2.2, ink, bg, False, .3, 'left')
        y += 5.2
    y += 1
    stroke(c, [(split, y), (frame[2], y)], ink, .35)
    # Door and window schedule.
    y += 6
    halo_text(c, x0, y, 'DOOR & WINDOW SCHEDULE', 2.8, ink, bg, True, .4, 'left'); y += 4.5
    doors = m['architecture']['doors']
    windows = m['architecture']['windows']
    rows = []
    for tag, label in (('D', 'Main door'), ('D1', 'Room door'), ('D2', 'Toilet door, opens out'), ('D3', 'Door to open area')):
        found = [d for d in doors if d['tag'] == tag]
        if found:
            rows.append((tag, label, f"{ft_in(found[0]['width'])} × {ft_in(DOOR_HEAD)}", len(found)))
    for tag in sorted({w['tag'] for w in windows}, key=lambda t: (t.startswith('V'), t)):
        found = [w for w in windows if w['tag'] == tag]
        label = 'Ventilator, high' if found[0]['kind'] == 'ventilator' else 'Window'
        rows.append((tag, label, f"{ft_in(found[0]['width'])} × {ft_in(found[0]['head'] - found[0]['sill'])}", len(found)))
    columns = (x0, x0 + 11, x0 + 55, x1)
    for i, title in enumerate(('TAG', 'TYPE', 'SIZE (W × H)', 'NOS.')):
        halo_text(c, columns[i] if i < 3 else columns[3], y, title, 2.0, muted, bg, True, .3, 'left' if i < 3 else 'right')
    y += 1.2
    stroke(c, [(x0, y), (x1, y)], muted, .18)
    for tag, label, size, count in rows:
        y += 4
        for i, value in enumerate((tag, label, size, str(count))):
            halo_text(c, columns[i] if i < 3 else columns[3], y, value, 2.15, ink, bg, i == 0, .3, 'left' if i < 3 else 'right')
    y += 3
    stroke(c, [(split, y), (frame[2], y)], ink, .35)
    # Area statement.
    y += 6
    halo_text(c, x0, y, 'AREA STATEMENT', 2.8, ink, bg, True, .4, 'left'); y += 4.5
    built = sum(r['area_sqft'] for r in m['rooms'] if not r['outdoor'])
    open_ = sum(r['area_sqft'] for r in m['rooms'] if r['outdoor'])
    for label, value in ((f'Plot {ft_in(m["width"])} × {ft_in(m["depth"])}', m['width'] * m['depth']),
                         (f'{m["floor"].title()} floor built-up (grid)', built), ('Open areas on this floor', open_)):
        halo_text(c, x0, y, label, 2.15, ink, bg, False, .3, 'left')
        halo_text(c, x1, y, f'{round(value):,} sq ft', 2.15, ink, bg, True, .3, 'right')
        y += 4.2
    y += 1
    stroke(c, [(split, y), (frame[2], y)], ink, .35)
    # Notes.
    y += 6
    halo_text(c, x0, y, 'NOTES', 2.8, ink, bg, True, .4, 'left'); y += 4.3
    notes = ['All dimensions in feet and inches. Chains follow the Compass map grid (wall centre lines).',
             'Room sizes are clear between the proposed walls; areas are grid areas.',
             'Doors, windows, furniture and stair are proposals. Toilet doors open outwards for assisted access.',
             'Verify setbacks, structure and services with a licensed architect and engineer.']
    for i, note in enumerate(notes, 1):
        words, line = note.split(), ''
        lines = []
        for word in words:
            trial = (line + ' ' + word).strip()
            if width_of(c, trial, 2.05) > x1 - x0 - 5 and line:
                lines.append(line); line = word
            else:
                line = trial
        lines.append(line)
        for j, value in enumerate(lines):
            halo_text(c, x0 + 4.5, y, value, 2.05, ink, bg, False, .3, 'left')
            if j == 0:
                halo_text(c, x0, y, f'{i}.', 2.05, ink, bg, True, .3, 'left')
            y += 3.3
        y += .6
    # Title block, pinned to the bottom of the column.
    tb = frame[3] - 38
    stroke(c, [(split, tb), (frame[2], tb)], ink, .5)
    halo_text(c, x0, tb + 7, 'COMPASS HOME PLAN', 4.2, ink, bg, True, .5, 'left')
    halo_text(c, x0, tb + 13.5, f"{m['floor'].upper()} FLOOR PLAN", 3.4, ink, bg, True, .5, 'left')
    halo_text(c, x0, tb + 19, f"Plot {ft_in(m['width'])} × {ft_in(m['depth'])} · {str(m['facing']).title()} facing", 2.4, ink, bg, False, .3, 'left')
    halo_text(c, x0, tb + 23.5, f"Scale 1:{scale} on A3 · drawing A-{1 if m['floor'] == 'ground' else 2}01", 2.4, ink, bg, False, .3, 'left')
    stroke(c, [(split, tb + 26.5), (frame[2], tb + 26.5)], ink, .25)
    halo_text(c, x0, tb + 31.5, 'PRELIMINARY · NOT FOR CONSTRUCTION', 2.9, ink, bg, True, .4, 'left')
    halo_text(c, x0, tb + 35.5, 'Prepared with GazeConnect Compass from the patient’s own map', 2.0, muted, bg, False, .3, 'left')


# ---- 3D cutaway ------------------------------------------------------------------------

def ordered_faces(faces, camera):
    """BSP ordering for orthogonal architecture, including overlapping storeys.

    Centroid depth sorting makes windows appear through large roof polygons.
    Split intersecting faces at an existing X/Y/Z plane instead. Each branch
    removes at least one coplanar face; the 4x4 input limits scene complexity.
    """
    if not faces:
        return
    planes = [sorted({points[0][axis] for points, *_ in faces
                      if all(abs(p[axis] - points[0][axis]) < 1e-7 for p in points)})
              for axis in range(3)]
    axis = max(range(3), key=lambda i: len(planes[i]))
    if not planes[axis]:
        yield from faces
        return
    plane = planes[axis][len(planes[axis]) // 2]
    low, same, high = [], [], []
    for face in faces:
        points, rest = face[0], face[1:]
        distances = [p[axis] - plane for p in points]
        if max(distances) < 1e-7 and min(distances) > -1e-7:
            same.append(face)
        elif max(distances) <= 1e-7:
            low.append(face)
        elif min(distances) >= -1e-7:
            high.append(face)
        else:
            halves = ([], [])
            for a, b in zip(points, points[1:] + points[:1]):
                da, db = a[axis] - plane, b[axis] - plane
                if da <= 1e-7:
                    halves[0].append(a)
                if da >= -1e-7:
                    halves[1].append(a)
                if da * db < 0:
                    t = da / (da - db)
                    crossing = tuple(a[i] + t * (b[i] - a[i]) for i in range(3))
                    for half in halves:
                        half.append(crossing)
            low.append((halves[0], *rest))
            high.append((halves[1], *rest))
    far, near = (low, high) if camera[axis] > 0 else (high, low)
    yield from ordered_faces(far, camera)
    yield from same
    yield from ordered_faces(near, camera)


# Toward the sun in camera space (x and y of the rotated plan, z up): from the
# left and the front, so the two visible wall faces always read differently.
SUN_VIEW = (-.15 / 1.2589, -.75 / 1.2589, 1. / 1.2589)


def face_normal(points):
    nx = ny = nz = 0.
    for (x1, y1, z1), (x2, y2, z2) in zip(points, points[1:] + points[:1]):
        nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2)
    length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.
    return nx / length, ny / length, nz / length


def lambert(colour, normal, theta):
    """Shade for a face: k = 0.60 + 0.40 max(0, n . L), the sun fixed to the camera."""
    nx, ny, nz = normal
    rx, ry = nx * math.cos(theta) - ny * math.sin(theta), nx * math.sin(theta) + ny * math.cos(theta)
    if abs(nz) > .5:
        rx, ry, nz = 0., 0., 1.                     # Tops face the sky.
    elif rx + ry > 0:
        rx, ry = -rx, -ry                           # Light the side that faces the camera.
    k = .6 + .4 * max(0., rx * SUN_VIEW[0] + ry * SUN_VIEW[1] + nz * SUN_VIEW[2])
    return mix(colour, '#1B2629', 1 - k)


def sun_offset(theta):
    """Plan offset of a shadow per foot of height, for the camera-fixed sun."""
    lx, ly, lz = SUN_VIEW
    wx, wy = lx * math.cos(-theta) - ly * math.sin(-theta), lx * math.sin(-theta) + ly * math.cos(-theta)
    return -wx / lz, -wy / lz


def draw_3d(c,m,palette,angle,room_id=None):
    bg,surface,ink,muted,edge=palette;dark=sum(rgb(bg))<1.5
    rooms=m['rooms']
    focus=next((r for r in rooms if r['placementId']==room_id),None) if room_id else None
    if room_id and focus is None:
        raise ValueError('Choose a room on the selected floor.')
    if focus: rooms=[focus]
    x1,y1,x2,y2=focus['shape'].bounds if focus else (0,0,m['width'],m['depth'])
    theta=angle*math.pi/2
    def project(x,y,z=0):
        x,y=x-(x1+x2)/2,y-(y1+y2)/2
        x,y=x*math.cos(theta)-y*math.sin(theta),x*math.sin(theta)+y*math.cos(theta)
        return ((x-y)*.866,-(x+y)*.5-z)
    corners=[project(x,y,z) for x in (x1,x2) for y in (y1,y2) for z in (-.6,8.5)]
    minx,miny=min(p[0] for p in corners),min(p[1] for p in corners)
    maxx,maxy=max(p[0] for p in corners),max(p[1] for p in corners)
    s=min(1440/(maxx-minx),790/(maxy-miny))
    def point(x,y,z=0):
        xx,yy=project(x,y,z);return (800+(xx-(minx+maxx)/2)*s,440+(yy-(miny+maxy)/2)*s)
    camera=(-math.cos(theta)-math.sin(theta), math.sin(theta)-math.cos(theta), 1.)
    wall_tone='#A4B2B0' if dark else '#F1EEE4'
    cap=mix(ink,surface,.14) if dark else mix(ink,'#000000',.12)   # Cut walls show the plan's poché.
    # Plot slab: plain paths, so only room floors pass through polygon().
    slab=[]
    def prism(points,z,height,tone,top=None):
        for a,b in zip(points,points[1:]+points[:1]):
            slab.append(([(a[0],a[1],z),(b[0],b[1],z),(b[0],b[1],z+height),(a[0],a[1],z+height)],tone,True))
        slab.append(([(p[0],p[1],z+height) for p in points],top or tone,top is None))
    base_rects=[(r['x1'],r['y1'],r['x2'],r['y2']) for r in focus['geometryRects']] if focus else [(0,0,m['width'],m['depth'])]
    for rect in base_rects:
        prism(rect_points(rect),-.6,.6,'#607476' if dark else '#CACFC7')
    for points,tone,lit in ordered_faces(slab,camera):
        path(c,[point(*p) for p in points]);paint(c,lambert(tone,face_normal(points),theta) if lit else tone);c.fill_preserve()
        c.set_line_width(.8);c.stroke()
    floor_union=unary_union([poly for room in rooms for poly in room['polygons']])
    for room in rooms:
        fill=mix(surface,room['tone'],.3 if dark else .55)
        if room['outdoor']:fill=mix(surface,'#719975' if room['kind']=='green' else '#B5A88F',.5)
        for poly in room['polygons']:
            polygon(c,poly,point,fill,edge,.6)
            floor_finish(c,poly,point,fill,edge,room['kind'])
    # Solids: furniture, stair and walls, cut at their presentation heights.
    solids=[]
    fp=fixture_palette(palette,dark)
    for fixture in m['architecture']['fixtures']:
        if focus and fixture['roomId']!=room_id: continue
        for obj in fixture['solids']:
            z,height=obj['z'],obj['height']
            if fixture['kind']=='stair':
                # Treads and landing as slabs, so both flights and the space below read.
                thick=min(height,.5);z,height=z+height-thick,thick
            solids.append((obj['points'],z,height,fp[obj['tone']],None))
    walls=m['architecture']['walls']; openings=[('door',o) for o in m['architecture']['doors']]+[('window',o) for o in m['architecture']['windows']]
    def wall_height(wall):
        a,b=wall['a'],wall['b']
        middle=((a[0]+b[0])/2,(a[1]+b[1])/2)
        # Rear exterior walls remain at full height; near walls are cut down to
        # reveal the plan. Internal walls still have volume and a visible cap.
        outside=wall['exterior'] or bool(focus)
        return 8.5 if outside and project(*middle)[1]<-1 else 1.25 if outside else 2.5
    for wall in walls:
        if focus and focus['shape'].boundary.intersection(LineString([wall['a'],wall['b']])).length<.01: continue
        a,b=wall['a'],wall['b'];length=math.dist(a,b);dx,dy=(b[0]-a[0])/length,(b[1]-a[1])/length
        height=wall_height(wall)
        intervals=[0.,length];cuts=[];edge_line=LineString([a,b])
        for kind,o in openings:
            opening=LineString([o['a'],o['b']]);overlap=edge_line.intersection(opening)
            if overlap.length<.01:continue
            lo,hi=sorted((edge_line.project(Point(o['a'])),edge_line.project(Point(o['b']))))
            lo,hi=max(0.,lo),min(length,hi);intervals.extend([lo,hi]);cuts.append((lo,hi,kind,o))
        intervals=sorted(set(intervals));t=wall['thickness']/2
        for lo,hi in zip(intervals,intervals[1:]):
            hit=next(((kind,o) for x,y,kind,o in cuts if x-.001<=(lo+hi)/2<=y+.001),None)
            kind=hit[0] if hit else None
            if kind=='window':
                spans=[(0.,min(height,hit[1]['sill'])),(hit[1]['head'],height)]
            elif kind=='door':
                spans=[(DOOR_HEAD,height)]
            else:
                spans=[(0.,height)]
            pa=(a[0]+dx*lo,a[1]+dy*lo);pb=(a[0]+dx*hi,a[1]+dy*hi)
            pts=[(pa[0]-dy*t,pa[1]+dx*t),(pb[0]-dy*t,pb[1]+dx*t),(pb[0]+dy*t,pb[1]-dx*t),(pa[0]+dy*t,pa[1]-dx*t)]
            for z,top in spans:
                if top>z:solids.append((pts,z,top-z,wall_tone,cap if top>=height-1e-6 else None))
            if kind=='window' and height>hit[1]['sill']:
                # Glass is recessed into the same opening and capped by a sill.
                thin=[(pa[0]-dy*.04,pa[1]+dx*.04),(pb[0]-dy*.04,pb[1]+dx*.04),(pb[0]+dy*.04,pb[1]-dx*.04),(pa[0]+dy*.04,pa[1]-dx*.04)]
                solids.append((thin,hit[1]['sill'],min(hit[1]['head'],height)-hit[1]['sill'],'#709EA7' if dark else '#B1CFD0',None))
                solids.append((pts,hit[1]['sill']-.05,.15,'#B5C4C1' if dark else '#FDFBF2',None))
    # Door leaves stand open in their rooms, cut with the wall they belong to.
    for door in m['architecture']['doors']:
        if focus and room_id not in (door['fromPlacementId'],door['toPlacementId']): continue
        host=next((w for w in walls if LineString([w['a'],w['b']]).distance(LineString([door['a'],door['b']]))<.01),None)
        if host is None: continue
        solids.append((door['leafPolygon'],0.,min(DOOR_HEAD,wall_height(host)),'#8E7358' if dark else '#B89A78',None))
    # Soft shadows on the floor from everything standing on it.
    ox,oy=sun_offset(theta)
    shadows=[]
    for pts,z,height,tone,_ in solids:
        top=z+height
        if top<=.05: continue
        hull=MultiPoint([*pts,*[(x+ox*top,y+oy*top) for x,y in pts]]).convex_hull
        if hull.geom_type=='Polygon':shadows.append(hull)
    shade=unary_union(shadows).intersection(floor_union) if shadows else None
    if shade is not None:
        for poly in parts(shade):
            if poly.geom_type!='Polygon': continue
            path(c,[point(x,y,.01) for x,y in poly.exterior.coords])
            for ring in poly.interiors:
                for i,(x,y) in enumerate(ring.coords):(c.move_to if i==0 else c.line_to)(*point(x,y,.01))
                c.close_path()
            c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD);c.set_source_rgba(.08,.12,.14,.13 if not dark else .22);c.fill()
    faces=[]
    for pts,z,height,tone,top in solids:
        for a,b in zip(pts,pts[1:]+pts[:1]):
            faces.append(([(a[0],a[1],z),(b[0],b[1],z),(b[0],b[1],z+height),(a[0],a[1],z+height)],tone,True))
        faces.append(([(p[0],p[1],z+height) for p in pts],top or tone,top is None))
    for points,tone,lit in ordered_faces(faces,camera):
        shade_tone=lambert(tone,face_normal(points),theta) if lit else tone
        path(c,[point(*p) for p in points]);paint(c,shade_tone);c.fill_preserve()
        paint(c,mix(shade_tone,'#1B2629',.22));c.set_line_width(.6);c.stroke()
    # Room labels occupy the same clear region used in 2D. Names stay readable
    # rather than forcing people to decode an unexplained set of numbers.
    label_boxes=[]
    for index,room in enumerate(rooms,1):
        if focus: continue  # The large room title is outside its furnishings.
        a,b,e,d=room['labelBounds'];x,y=point((a+e)/2,(b+d)/2,.15)
        rx1,ry1,rx2,ry2=room['shape'].bounds
        available=max(110,min(300,max(rx2-rx1,ry2-ry1)*s*.9))
        name=room['room'];size=24 if len(m['rooms'])<9 else 21
        c.select_font_face('sans-serif',cairo.FONT_SLANT_NORMAL,cairo.FONT_WEIGHT_BOLD);c.set_font_size(size)
        words=[];current=''
        for word in name.split():
            trial=(current+' '+word).strip()
            if current and c.text_extents(trial).width>available:words.append(current);current=word
            else:current=trial
        if current:words.append(current)
        if len(words)>3:words=[str(index)]
        labelw=max(c.text_extents(t).width for t in words)+18;labelh=len(words)*size*1.15+8
        original=(x,y)
        candidates=[(x,y)]
        for step in range(1,18):
            candidates.extend([(x,y+step*(labelh+8)),(x,y-step*(labelh+8)),(x+step*30,y),(x-step*30,y)])
        for xx,yy in candidates:
            label_box=(xx-labelw/2-5,yy-labelh/2-4,xx+labelw/2+5,yy+labelh/2+4)
            if label_box[0]<24 or label_box[2]>1576 or label_box[1]<30 or label_box[3]>865: continue
            if not any(label_box[0]<r[2] and label_box[2]>r[0] and label_box[1]<r[3] and label_box[3]>r[1] for r in label_boxes):
                x,y=xx,yy;label_boxes.append(label_box);break
        if math.dist(original,(x,y))>1:stroke(c,[original,(x,y)],muted,1.2)
        c.rectangle(x-labelw/2,y-labelh/2,labelw,labelh);paint(c,surface);c.fill_preserve()
        paint(c,mix(surface,ink,.25));c.set_line_width(1);c.stroke()
        for i,value in enumerate(words):text(c,x,y-labelh/2+size+2+i*size*1.15,value,size,ink,True)
    text(c,800,908,focus['room'] if focus else 'ARCHITECTURAL CUTAWAY · '+m['floor'].upper()+' FLOOR',32 if focus else 27,ink,True)
    text(c,800,945,'Room view · roof removed · proposed furnishings' if focus else 'Roof removed · front walls lowered · proposed furnishings and stair arrangement',21,muted)
