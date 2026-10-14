"""CAD export of one floor as DXF R2010, in feet-and-inches and in millimetres (IMPLEMENTATION_PLAN.md §9.3).

Both files are written from the same PlanModel as every view, with the same origin and axes:
the plot's front-left corner at (0, 0), +X along the road, +Y away from it. Coordinates are
exact (the 1/8-inch lattice: inches = u / 8, millimetres = u x 3.175). Walls are one closed
LWPOLYLINE per wall solid with a SOLID hatch (SketchUp turns solid hatches into faces);
dimensions are rendered so AutoCAD accepts them. No DWG is written: that needs a licensed
converter (§9.5). The files say "preliminary concept", and nothing here establishes
compliance with any building code.
"""
from __future__ import annotations

import io
import math
from contextlib import contextmanager

import ezdxf
from ezdxf.enums import TextEntityAlignment
from shapely.geometry import LineString, box

import compass_geometry as geometry
from compass_standards import ft_in

U = geometry.U
IN = geometry.IN
LAYERS = (  # (name, ACI colour, lineweight in 1/100 mm, linetype)
    ('A-SITE', 8, 50, 'CONTINUOUS'), ('A-GRID', 9, 13, 'DASHED'), ('A-WALL', 7, 50, 'CONTINUOUS'),
    ('A-WALL-PATT', 8, 13, 'CONTINUOUS'), ('A-DOOR', 3, 35, 'CONTINUOUS'), ('A-GLAZ', 5, 25, 'CONTINUOUS'),
    ('A-STRS', 8, 25, 'CONTINUOUS'), ('A-STRS-VOID', 1, 25, 'DASHED'), ('A-COLS', 7, 35, 'CONTINUOUS'),
    ('A-AREA', 2, 13, 'CONTINUOUS'), ('A-AREA-IDEN', 7, 25, 'CONTINUOUS'), ('A-OPEN', 9, 13, 'DASHED'),
    ('A-FURN', 8, 18, 'CONTINUOUS'), ('A-ANNO-DIMS', 4, 18, 'CONTINUOUS'), ('A-ANNO-TEXT', 7, 25, 'CONTINUOUS'),
    ('A-ANNO-NRTH', 7, 25, 'CONTINUOUS'), ('A-FLOR-OTLN', 6, 25, 'CONTINUOUS'), ('A-FLOR-HRAL', 6, 25, 'CONTINUOUS'),
    ('A-FLOR-OVHD', 6, 18, 'DASHED'),
)
UNITS = {'in': {'insunits': 1, 'measurement': 0, 'lunits': 4, 'factor': 1 / IN, 'text': 6.0, 'dimlunit': 4},
         'mm': {'insunits': 4, 'measurement': 1, 'lunits': 2, 'factor': 25.4 / IN, 'text': 152.4, 'dimlunit': 2}}


@contextmanager
def _fixed_metadata():
    """Same plan, same bytes: ezdxf's fixed creation date and GUIDs while writing (§4.6)."""
    previous = ezdxf.options.write_fixed_meta_data_for_testing
    ezdxf.options.write_fixed_meta_data_for_testing = True
    try:
        yield
    finally:
        ezdxf.options.write_fixed_meta_data_for_testing = previous


def export(model, floor, unit='in') -> bytes:
    """One floor as DXF R2010 text (UTF-8); byte-identical for the same plan."""
    if unit not in UNITS:
        raise ValueError('Units are inches or millimetres.')
    with _fixed_metadata():
        return _export(model, floor, unit)


def _export(model, floor, unit):
    spec = UNITS[unit]
    f = spec['factor']
    P = lambda p: (p[0] * f, p[1] * f)
    doc = ezdxf.new('R2010', setup=False)
    doc.units = spec['insunits']
    doc.header['$INSUNITS'] = spec['insunits']
    doc.header['$MEASUREMENT'] = spec['measurement']
    doc.header['$LUNITS'] = spec['lunits']
    doc.header['$LWDISPLAY'] = 1
    doc.header['$PROJECTNAME'] = model['modelHash'][:32]
    if 'DASHED' not in doc.linetypes:
        dash = 12 * IN * f
        doc.linetypes.add('DASHED', pattern=[dash * 1.5, dash, -dash * .5], description='Dashed __ __ __')
    for name, colour, weight, linetype in LAYERS:
        doc.layers.add(name, color=colour, dxfattribs={'lineweight': weight, 'linetype': linetype})
    style = doc.dimstyles.new('COMPASS')
    text_h = spec['text']
    for key, value in {'dimtxt': text_h * .75, 'dimasz': text_h * .5, 'dimtsz': text_h * .35, 'dimexo': text_h * .4,
                       'dimexe': text_h * .5, 'dimgap': text_h * .25, 'dimtad': 1, 'dimdec': 0,
                       'dimlunit': spec['dimlunit'], 'dimclrd': 4, 'dimclre': 4}.items():
        setattr(style.dxf, key, value)
    ms = doc.modelspace()
    fl = model['floors'][floor]
    W, D = model['plot']['W'], model['plot']['D']

    def poly(points, layer, closed=True, **extra):
        return ms.add_lwpolyline([P(p) for p in points], close=closed, dxfattribs={'layer': layer, **extra})

    # Site and the Compass grid (with the half-cell lines of divided cells).
    poly([(0, 0), (W, 0), (W, D), (0, D)], 'A-SITE')
    xs = sorted({v for r in fl['regions'] for v in (r['rect'][0], r['rect'][2])} - {0, W})
    ys = sorted({v for r in fl['regions'] for v in (r['rect'][1], r['rect'][3])} - {0, D})
    for x in xs:
        poly([(x, 0), (x, D)], 'A-GRID', closed=False)
    for y in ys:
        poly([(0, y), (W, y)], 'A-GRID', closed=False)
    # Walls: openings cut, one closed polyline per solid, and its solid hatch.
    cuts = [box(*_band_box(o)) for o in fl['doors'] + fl['windows']]
    solid = fl['walls'].difference(geometry.union(cuts)) if cuts else fl['walls']
    for part in geometry.parts(solid):
        if part.geom_type != 'Polygon':
            continue
        rings = [part.exterior, *part.interiors]
        for ring in rings:
            poly(list(ring.coords)[:-1], 'A-WALL')
        hatch = ms.add_hatch(color=8, dxfattribs={'layer': 'A-WALL-PATT'})
        hatch.set_solid_fill(8)
        for i, ring in enumerate(rings):
            hatch.paths.add_polyline_path([P(p) for p in list(ring.coords)[:-1]], is_closed=True, flags=1 if i == 0 else 16)
    for parapet in fl.get('parapets', []):
        t = geometry.PARAPET_T
        at, lo, hi = parapet['at'], parapet['lo'], parapet['hi']
        band = (at, at + t) if parapet['inward'] == 'b' else (at - t, at)
        rect = (band[0], lo, band[1], hi) if parapet['orient'] == 'v' else (lo, band[0], hi, band[1])
        poly(_rect_points(rect), 'A-WALL')
    # Open-plan boundaries: no wall, a dashed line for reference.
    for run in fl['runs']:
        if run['kind'] == 'open':
            a, b = geometry._segment(run, run['lo'], run['hi'], run['at'])
            poly([a, b], 'A-OPEN', closed=False)
        elif run['kind'] == 'rail':
            a, b = geometry._segment(run, run['lo'], run['hi'], run['at'])
            poly([a, b], 'A-FLOR-HRAL', closed=False)
    # Doors: leaf and a 90-degree ARC.
    for d in fl['doors']:
        hinge, leaf, strike = d['hinge'], d['leaf'], d['strike']
        ux, uy = (strike[0] - hinge[0]) / d['width'], (strike[1] - hinge[1]) / d['width']
        t = 1.5 * IN
        poly([hinge, leaf, (leaf[0] + ux * t, leaf[1] + uy * t), (hinge[0] + ux * t, hinge[1] + uy * t)], 'A-DOOR')
        start = math.degrees(math.atan2(strike[1] - hinge[1], strike[0] - hinge[0]))
        end = math.degrees(math.atan2(leaf[1] - hinge[1], leaf[0] - hinge[0]))
        if (end - start) % 360 > 180:
            start, end = end, start
        ms.add_arc(P(hinge), d['width'] * f, start, end, dxfattribs={'layer': 'A-DOOR'})
        mid = ((d['span'][0][0] + d['span'][1][0]) / 2 - d['normal'][0] * 14 * IN,
               (d['span'][0][1] + d['span'][1][1]) / 2 - d['normal'][1] * 14 * IN)
        ms.add_text(d['tag'], height=text_h * .6, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement(
            P(mid), align=TextEntityAlignment.MIDDLE_CENTER)
    # Windows: both wall faces, jambs, glass and (windows) a sill line.
    for w in fl['windows']:
        c1, c2 = w['band']
        lo, hi = w['lo'], w['hi']
        v = w['orient'] == 'v'
        seg = (lambda a, l, h: [(a, l), (a, h)]) if v else (lambda a, l, h: [(l, a), (h, a)])
        for face in (c1, c2):
            poly(seg(face, lo, hi), 'A-GLAZ', closed=False)
        for end in (lo, hi):
            poly([(c1, end), (c2, end)] if v else [(end, c1), (end, c2)], 'A-GLAZ', closed=False)
        glass = {'linetype': 'DASHED'} if w['kind'] == 'ventilator' else {}
        poly(seg((c1 + c2) / 2, lo, hi), 'A-GLAZ', closed=False, **glass)
        outer = c1 if w['normal'][0 if v else 1] < 0 else c2
        at = outer + (-1 if outer == c1 else 1) * 14 * IN
        ms.add_text(w['tag'], height=text_h * .6, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement(
            P((at, (lo + hi) / 2) if v else ((lo + hi) / 2, at)), align=TextEntityAlignment.MIDDLE_CENTER)
    # Stair: treads, walking line and UP/DN; upstairs, the slab opening and its guard.
    stair = fl.get('stair')
    if stair:
        fixture = stair['fixture']
        for item in fixture['lines']:
            poly([(x * U, y * U) for x, y in item['points']], 'A-STRS', closed=item['closed'])
        walk = [(x * U, y * U) for x, y in fixture['walk']]
        ms.add_text('UP' if floor == 'ground' else 'DN', height=text_h * .7, dxfattribs={'layer': 'A-STRS'}).set_placement(
            P(walk[0]), align=TextEntityAlignment.MIDDLE_CENTER)
        if floor != 'ground':
            poly(_rect_points(stair['opening']), 'A-STRS-VOID')
    # Double height: the void outline upstairs, the edge of the floor above downstairs.
    for room in fl['rooms'].values():
        if room.zone == 'void':
            for part in geometry.parts(room.polygon):
                poly(list(part.exterior.coords)[:-1], 'A-FLOR-OTLN')
    for item in fl.get('overhead', []):
        for part in geometry.parts(item['polygon']):
            poly(list(part.exterior.coords)[:-1], 'A-FLOR-OVHD')
    for col in fl.get('supports', []):
        poly(_rect_points(col['rect']), 'A-COLS')
    # Furniture.
    for fixture in fl['fixtures']:
        if fixture['kind'] == 'stair':
            continue
        for item in fixture['lines']:
            poly([(x * U, y * U) for x, y in item['points']], 'A-FURN', closed=item['closed'])
    # Rooms: one closed clear outline each (the gross outline for outdoor rooms), and its name, size, area.
    for room in sorted(fl['rooms'].values(), key=lambda r: r.id):
        shape = room.clear if (room.indoor and not room.clear.is_empty) else room.polygon
        for part in geometry.parts(shape):
            if part.geom_type == 'Polygon':
                poly(list(part.exterior.coords)[:-1], 'A-AREA')
        x1, y1, x2, y2 = (v * U for v in room.label_box)
        lines = [_safe(room.label.upper())]
        clear = geometry.clear_size(room) if room.indoor else None
        if clear:
            lines.append(f'{ft_in(clear[0])} x {ft_in(clear[1])}')
        lines.append(f'{round(shape.area / U / U):,} sq ft')
        ms.add_mtext('\\P'.join(lines), dxfattribs={'layer': 'A-AREA-IDEN', 'insert': P(((x1 + x2) / 2, (y1 + y2) / 2)),
                                                     'char_height': text_h * .8, 'attachment_point': 5,
                                                     'width': max(x2 - x1, 4 * U) * f})
    # Dimension chains: grid lines then the overall plot, on the top and the left, feet-and-inch text.
    gap = 3 * U
    xs_all = [0, *xs, W]
    ys_all = [0, *ys, D]
    for a, b in zip(xs_all, xs_all[1:]):
        ms.add_linear_dim(base=P((0, D + gap)), p1=P((a, D)), p2=P((b, D)), angle=0, text=ft_in((b - a) / U),
                          dimstyle='COMPASS', dxfattribs={'layer': 'A-ANNO-DIMS'}).render()
    for a, b in zip(ys_all, ys_all[1:]):
        ms.add_linear_dim(base=P((-gap, 0)), p1=P((0, a)), p2=P((0, b)), angle=90, text=ft_in((b - a) / U),
                          dimstyle='COMPASS', dxfattribs={'layer': 'A-ANNO-DIMS'}).render()
    ms.add_linear_dim(base=P((0, D + 2 * gap)), p1=P((0, D)), p2=P((W, D)), angle=0, text=ft_in(W / U),
                      dimstyle='COMPASS', dxfattribs={'layer': 'A-ANNO-DIMS'}).render()
    ms.add_linear_dim(base=P((-2 * gap, 0)), p1=P((0, 0)), p2=P((0, D)), angle=90, text=ft_in(D / U),
                      dimstyle='COMPASS', dxfattribs={'layer': 'A-ANNO-DIMS'}).render()
    # North arrow from the facing, then the title and notes.
    nx, ny = model['plot']['north']
    cx, cy = W + 5 * U, D + 2 * gap
    r = 2 * U
    ms.add_circle(P((cx, cy)), r * f, dxfattribs={'layer': 'A-ANNO-NRTH'})
    tip = (cx + nx * r, cy + ny * r)
    tail = (cx - nx * r * .7, cy - ny * r * .7)
    side = (-ny * r * .4, nx * r * .4)
    poly([tip, (tail[0] + side[0], tail[1] + side[1]), (cx, cy), (tail[0] - side[0], tail[1] - side[1])], 'A-ANNO-NRTH')
    ms.add_text('N', height=text_h * 1.2, dxfattribs={'layer': 'A-ANNO-NRTH'}).set_placement(
        P((cx + nx * r * 1.6, cy + ny * r * 1.6)), align=TextEntityAlignment.MIDDLE_CENTER)
    unit_name = 'FEET AND INCHES (1 UNIT = 1 INCH)' if unit == 'in' else 'MILLIMETRES'
    title = f"{geometry.FLOOR_NAMES[floor].upper()} PLAN - {unit_name} - PRELIMINARY CONCEPT, NOT FOR CONSTRUCTION"
    ms.add_text(title, height=text_h * 1.2, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement(P((0, -4 * U)), align=TextEntityAlignment.LEFT)
    ms.add_text(f'Origin: front-left plot corner. +X along the road, +Y away from it. Plan reference {model["modelHash"][:16]}.',
                height=text_h * .8, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement(P((0, -6 * U)), align=TextEntityAlignment.LEFT)
    ms.add_text('Proposed 9" outer walls inside the plot line, 6" partitions centred. Chains measure grid lines. Verify before construction.',
                height=text_h * .8, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement(P((0, -7.6 * U)), align=TextEntityAlignment.LEFT)
    auditor = doc.audit()
    if auditor.has_errors:
        raise ValueError(f'The CAD file failed its own audit ({len(auditor.errors)} errors).')
    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode('utf-8')


def readme(model, floor) -> bytes:
    plot = model['plot']
    lines = [
        'GazeConnect Compass - CAD drawing of one floor',
        '=' * 46,
        '',
        f'Floor: {geometry.FLOOR_NAMES[floor]}',
        f"Plot: {ft_in(plot['W'] / U)} x {ft_in(plot['D'] / U)}, {plot['facing']}-facing, gate {plot['gate'].lower()}",
        f"Plan reference: {model['modelHash']}",
        '',
        'Two files with the same drawing:',
        '  ...-feet-inches.dxf  1 drawing unit = 1 inch ($INSUNITS 1, architectural units). Open with',
        '                       architectural units to read feet and inches.',
        '  ...-millimetres.dxf  1 drawing unit = 1 millimetre ($INSUNITS 4).',
        'Format: DXF R2010 (AutoCAD 2010 and later, DWG TrueView, SketchUp Pro import, LibreCAD).',
        'It is not a DWG file.',
        '',
        'Origin and axes: (0, 0) is the front-left corner of the plot, seen from the road. +X runs along',
        'the road to the right; +Y runs away from the road to the back. North follows the facing above.',
        '',
        'Layers: A-WALL (one closed polyline per wall solid; outer walls sit inside the plot line,',
        'partitions are centred on the grid), A-WALL-PATT (solid hatch), A-DOOR, A-GLAZ, A-STRS,',
        'A-STRS-VOID, A-COLS (proposed columns), A-AREA and A-AREA-IDEN (clear room outlines and names),',
        'A-OPEN (open-plan boundaries: no wall), A-FURN, A-ANNO-DIMS, A-ANNO-TEXT, A-ANNO-NRTH,',
        'A-GRID (Compass grid and half-cell lines), A-SITE, A-FLOR-OTLN / A-FLOR-HRAL / A-FLOR-OVHD',
        '(double height: open to below, balustrade, edge of the floor above).',
        '',
        'PRELIMINARY CONCEPT - NOT FOR CONSTRUCTION. Walls, doors, windows, stair and columns are',
        'proposals from the Compass map. They are not structurally verified and opening this file in',
        'any program does not make it checked or compliant with a building code. Verify with a licensed',
        'architect and engineer.',
        '',
    ]
    return '\r\n'.join(lines).encode('utf-8')


def _band_box(opening):
    c1, c2 = opening['band']
    lo, hi = opening['lo'], opening['hi']
    return (c1, lo, c2, hi) if opening['orient'] == 'v' else (lo, c1, hi, c2)


def _rect_points(r):
    x1, y1, x2, y2 = r
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def _safe(value):
    return str(value).replace('\\', '/').replace('{', '(').replace('}', ')')
