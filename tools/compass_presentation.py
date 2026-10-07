"""Compass-only presentation and exports, all from the same room geometry.

Inspired by FloorForge's shared drawing/model approach, without importing its
planner, walkthrough, furniture library or dependencies into the gaze runtime.
The original grid is always retained. Dimensions are preliminary, not surveyed.
"""
from __future__ import annotations

import copy
import io
import math
import cairo
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union
from compass_architecture import details, ARCHITECTURE_NOTE, parts
from compass_standards import WALL_OUTER, ft_in
from compass_drawing import draw_2d, draw_3d, draw_sheet, sheet_size
from compass_exterior import draw_exterior, STYLES
from compass_resources import validate_source
from gazeplan_engine_v5.candidates import (
    _normalise_map, _validate, _geometry_signature, generate_layout_candidates,
)

FLOORS = {"ground": "ground_floor", "first": "first_floor"}
PALETTES = {
    "warm": ("#F4F2EC", "#FFFEF9", "#253641", "#536871", "#9AAAB2"),
    "dark": ("#151B23", "#263443", "#F5F7FA", "#BECDD9", "#4E6579"),
    "midnight-navy": ("#10192B", "#243952", "#F4F7FC", "#C0CEE1", "#59728F"),
    "serene-warm": ("#F6F2E9", "#FFFDF6", "#283C35", "#56695E", "#A5AD96"),
    "serene-dark": ("#18211F", "#2D3C37", "#F5F6ED", "#C6D3C9", "#637B6D"),
    "serene-midnight-navy": ("#111B30", "#273B53", "#F4F7FC", "#C0CEE1", "#657B93"),
}
ROOM_TONES = ("#DDECE6", "#EEE2D1", "#DCE8F1", "#E8E1F0", "#E8EDDA", "#F2E1D9")


def scoped_map(source: dict, scope: str) -> dict:
    if not isinstance(source, dict) or scope not in {"ground", "all"}:
        raise ValueError("Choose Ground floor only or Both floors.")
    data = copy.deepcopy(source)
    if scope == "ground":
        ground = data.get("ground_floor")
        if not isinstance(ground, dict) or not isinstance(ground.get("placements"), list) or not ground["placements"]:
            raise ValueError("Place a room on the ground floor first.")
        data.pop("first_floor", None)
        data["plot"] = {**data.get("plot", {}), "num_floors": "Single Floor"}
        # Scope the legacy root alias too; never apply the active upper-floor
        # edits to the ground floor or mutate the stored two-floor draft.
        ground = data["ground_floor"]
        for key in ("advanced_refinements", "cell_layouts"):
            data.pop(key, None)
            if key in ground:
                data[key] = copy.deepcopy(ground[key])
        data["editor_active_floor"] = "gnd"
    return data


def normalise(source: dict) -> dict:
    validate_source(source)
    data, issues = _normalise_map(source)
    if data is None:
        raise ValueError(" ".join(issues))
    w, d = float(data["plot"]["width_ft"]), float(data["plot"]["depth_ft"])
    if not (4 <= w <= 500 and 4 <= d <= 500):
        raise ValueError("Use plot dimensions between 4 and 500 feet.")
    # Concept previews may have no access route yet, but malformed/overlapping
    # geometry must never become a drawing, 3D view or CAD export.
    for floor in FLOORS.values():
        polygons = []
        for p in data.get(floor, {}).get("placements", []):
            rects = p["geometryRects"]
            for r in rects:
                if not (0 <= r["x1"] < r["x2"] <= w and 0 <= r["y1"] < r["y2"] <= d):
                    raise ValueError("A room boundary is outside the plot.")
            poly = unary_union([box(r["x1"], r["y1"], r["x2"], r["y2"]) for r in rects])
            if any(poly.intersection(other).area > .0001 for other in polygons):
                raise ValueError("Two rooms overlap. Return to the map to correct them.")
            if abs(poly.area - p["area_sqft"]) > .01:
                raise ValueError("Room rectangles overlap within a room.")
            polygons.append(poly)
    return data


def options(source: dict, scope: str) -> dict:
    data = normalise(scoped_map(source, scope))
    result = generate_layout_candidates(data, max_candidates=6, timeout_seconds=8)
    choices = []
    for item in result.get("candidates", [])[:4]:
        plan = item["compass_map"]
        plan["layout_candidate_id"] = item["id"]
        choices.append({"id": item["id"], "label": item["title"], "summary": item["description"],
                        "compassData": plan, "valid": True,
                        "notes": [*item["validation"]["warnings"], ARCHITECTURE_NOTE], "changes": item["changes"]})
    for choice in choices:
        ground = None
        for floor in FLOORS:
            if choice["compassData"].get(FLOORS[floor], {}).get("placements"):
                floor_model = model(choice["compassData"], floor, ground=ground)
                ground = ground or floor_model
                choice["notes"].extend(floor_model["architecture"]["notes"])
    notes = result.get("warnings", [])
    if not choices:
        # A perfectly legitimate unfinished drawing can fail access/minimum-room
        # checks. Show it honestly as a concept, rather than hiding all output.
        validation = _validate(data)
        for floor in FLOORS.values():
            if floor in data:
                data[floor].pop("doorOpenings", None)
        notes = validation["issues"] + validation["warnings"]
        choices = [{"id": "map-" + _geometry_signature(data), "label": "My map preview",
                    "summary": "Your placed rooms, with unfilled cells left open.",
                    "compassData": data, "valid": False, "notes": [*notes, ARCHITECTURE_NOTE]}]
    if not choices[0]["valid"]:
        ground = None
        for floor in FLOORS:
            if data.get(FLOORS[floor], {}).get("placements"):
                floor_model = model(data, floor, ground=ground)
                ground = ground or floor_model
                choices[0]["notes"].extend(floor_model["architecture"]["notes"])
    return {"options": choices, "scope": scope, "notes": notes,
            "requestedCount": 4, "sourceUnchanged": True}


def model(source: dict, floor: str, align_stair: bool = True, ground: dict | None = None) -> dict:
    if floor not in FLOORS:
        raise ValueError("Choose a floor that exists in this plan.")
    data = normalise(source)
    f = data.get(FLOORS[floor], {})
    if not f.get("placements"):
        raise ValueError("This floor has no rooms yet. Choose Ground floor.")
    # Upstairs, the stair rises where it does on the ground floor whenever it fits.
    hint = None
    if floor == "first" and align_stair and data.get("ground_floor", {}).get("placements"):
        hint = (ground or model(source, "ground", False))["architecture"].get("stair")
    validation = _validate(data)
    rooms = []
    for i, p in enumerate(f["placements"]):
        poly = unary_union([box(r["x1"], r["y1"], r["x2"], r["y2"]) for r in p["geometryRects"]])
        parts = list(poly.geoms) if poly.geom_type == "MultiPolygon" else [poly]
        # Place the label in a real occupied rectangle, not an L-shape's void.
        anchor = max(p["geometryRects"], key=lambda r: (r["x2"]-r["x1"])*(r["y2"]-r["y1"]))
        if len(parts) == 1 and abs(poly.area - poly.envelope.area) < .01:
            x1,y1,x2,y2=poly.bounds
            anchor={"x1":x1,"y1":y1,"x2":x2,"y2":y2}
        rooms.append({**p, "polygons": parts, "anchor": anchor, "tone": ROOM_TONES[i % len(ROOM_TONES)]})
    result = {"width": float(data["plot"]["width_ft"]), "depth": float(data["plot"]["depth_ft"]),
            "facing": data["plot"].get("facing", "South"), "floor": floor, "rooms": rooms,
            "doors": f.get("doorOpenings", []) if validation["valid"] else [], "valid": validation["valid"]}
    result["architecture"] = details(result, hint)
    return result


def rgb(value: str):
    return tuple(int(value[i:i+2], 16) / 255 for i in (1, 3, 5))


def paint(ctx, value):
    ctx.set_source_rgb(*rgb(value))


def text(ctx, x, y, value, size, color, *, center=True, bold=False):
    ctx.select_font_face("sans-serif", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size)
    ext = ctx.text_extents(str(value))
    paint(ctx, color)
    ctx.move_to(x - ext.width / 2 - ext.x_bearing if center else x, y)
    ctx.show_text(str(value))


def export_dxf(m):
    """Millimetre DXF with NCS-style layers, lineweights, hatched walls and feet-inch dimensions."""
    import ezdxf
    from ezdxf.enums import TextEntityAlignment
    doc=ezdxf.new("R2010");doc.units=4  # millimetres, 1 ft = 304.8 mm
    doc.header['$LWDISPLAY']=1; doc.header['$MEASUREMENT']=1
    # (name, ACI colour, lineweight in 1/100 mm): cut walls widest, then openings, then fine detail.
    for name,color,weight in (("A-ROOM",7,13),("A-DOOR",3,35),("A-DIMS",4,18),("A-TEXT",7,25),("A-SITE",8,50),
                              ("A-WALL",7,50),("A-WALL-PATT",8,13),("A-WIND",4,25),("A-GLAZ",5,18),("A-STAIR",8,25),
                              ("A-FURN",8,18),("A-ANNO",7,25)):
        doc.layers.new(name,dxfattribs={"color":color,"lineweight":weight})
    if "DASHED" not in doc.linetypes:
        doc.linetypes.add("DASHED",pattern=[12.7,6.35,-6.35],description="Dashed __ __ __")
    ms=doc.modelspace();mm=lambda p:tuple(v*304.8 for v in p)
    for room in m["rooms"]:
        for poly in room["polygons"]:
            for ring in [poly.exterior,*poly.interiors]:
                ms.add_lwpolyline([mm(p) for p in list(ring.coords)[:-1]],close=True,dxfattribs={"layer":"A-ROOM"})
        x1,y1,x2,y2=room['labelBounds'];center=mm(((x1+x2)/2,(y1+y2)/2))
        lines=[room["room"].upper().replace('\\','/').replace('{','(').replace('}',')')]
        if room.get('clear'):lines.append(f"{ft_in(room['clear'][0])} x {ft_in(room['clear'][1])}")
        lines.append(f'{room["area_sqft"]:.1f} sq ft')
        # Box as wide as the room, so the three lines never re-wrap in a viewer.
        rx1,_,rx2,_=room['shape'].bounds
        ms.add_mtext('\\P'.join(lines),dxfattribs={"layer":"A-TEXT","insert":center,"char_height":150,"width":max(x2-x1,(rx2-rx1)*.9)*304.8,"attachment_point":5})
    # Walls: outlines plus a hatch, brick (ANSI31) for 9-inch walls, solid for 6-inch partitions.
    arch=m['architecture']
    cuts=unary_union([LineString([o['a'],o['b']]).buffer(.5,cap_style=2) for o in [*arch['doors'],*arch['windows']]])
    outer=unary_union([LineString([w['a'],w['b']]).buffer(w['thickness']/2,cap_style=2,join_style=2) for w in arch['walls'] if w['exterior']])
    inner=unary_union([LineString([w['a'],w['b']]).buffer(w['thickness']/2,cap_style=2,join_style=2) for w in arch['walls'] if not w['exterior']])
    for geom,pattern in ((outer.difference(cuts),'ANSI31'),(inner.difference(outer).difference(cuts) if not outer.is_empty else inner.difference(cuts),'SOLID')):
        for poly in parts(geom):
            if poly.geom_type!='Polygon':continue
            hatch=ms.add_hatch(color=8 if pattern=='ANSI31' else 9,dxfattribs={'layer':'A-WALL-PATT'})
            if pattern=='ANSI31':hatch.set_pattern_fill('ANSI31',scale=31.5)
            else:hatch.set_solid_fill(9)
            for i,ring in enumerate([poly.exterior,*poly.interiors]):
                hatch.paths.add_polyline_path([mm(p) for p in list(ring.coords)[:-1]],is_closed=True,flags=1 if i==0 else 16)
    for poly in parts(arch['wallFootprint']):
        if poly.geom_type != 'Polygon': continue
        for ring in [poly.exterior,*poly.interiors]:
            ms.add_lwpolyline([mm(p) for p in list(ring.coords)[:-1]],close=True,dxfattribs={'layer':'A-WALL'})
    for window in arch['windows']:
        a,b=window['a'],window['b'];length=math.dist(a,b);n=(-(b[1]-a[1])/length,(b[0]-a[0])/length)
        t=WALL_OUTER/2
        for offset in (-t,t):  # The wall faces run across the opening.
            ms.add_line(mm((a[0]+n[0]*offset,a[1]+n[1]*offset)),mm((b[0]+n[0]*offset,b[1]+n[1]*offset)),dxfattribs={'layer':'A-WIND'})
        for p in (a,b):
            ms.add_lwpolyline([mm((p[0]-n[0]*t,p[1]-n[1]*t)),mm((p[0]+n[0]*t,p[1]+n[1]*t))],dxfattribs={'layer':'A-WIND'})
        glass={'layer':'A-GLAZ',**({'linetype':'DASHED'} if window['kind']=='ventilator' else {})}
        ms.add_lwpolyline([mm(a),mm(b)],dxfattribs=glass)
    for door in arch['doors']:
        hinge,leaf,strike=door['hinge'],door['leaf'],door['strike']
        ms.add_line(mm(hinge),mm(leaf),dxfattribs={'layer':'A-DOOR'})
        ms.add_lwpolyline([mm(p) for p in door['leafPolygon']],close=True,dxfattribs={'layer':'A-DOOR'})
        start=math.degrees(math.atan2(strike[1]-hinge[1],strike[0]-hinge[0]));end=math.degrees(math.atan2(leaf[1]-hinge[1],leaf[0]-hinge[0]))
        if (end-start)%360>180:start,end=end,start  # ARC runs counter-clockwise.
        ms.add_arc(mm(hinge),door['width']*304.8,start,end,dxfattribs={'layer':'A-DOOR'})
        mid=((door['a'][0]+door['b'][0])/2-door['normal'][0]*1.1,(door['a'][1]+door['b'][1])/2-door['normal'][1]*1.1)
        ms.add_text(door['tag'],dxfattribs={'height':180,'layer':'A-ANNO'}).set_placement(mm(mid),align=TextEntityAlignment.MIDDLE_CENTER)
    for window in arch['windows']:
        a,b=window['a'],window['b'];length=math.dist(a,b);n=(-(b[1]-a[1])/length,(b[0]-a[0])/length)
        room=next((r for r in m['rooms'] if r['placementId']==window['roomId']),None)
        mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
        if room and room['shape'].covers(Point(mid[0]+n[0]*.2,mid[1]+n[1]*.2)):n=(-n[0],-n[1])
        ms.add_text(window['tag'],dxfattribs={'height':180,'layer':'A-ANNO'}).set_placement(mm((mid[0]+n[0]*1.3,mid[1]+n[1]*1.3)),align=TextEntityAlignment.MIDDLE_CENTER)
    for fixture in arch['fixtures']:
        for item in fixture['lines']:
            ms.add_lwpolyline([mm(p) for p in item['points']],close=item['closed'],dxfattribs={'layer':'A-STAIR' if fixture['kind']=='stair' else 'A-FURN'})
    w,d=m['width'],m['depth']
    ms.add_lwpolyline([mm(p) for p in [(0,0),(w,0),(w,d),(0,d)]],close=True,dxfattribs={"layer":"A-SITE"})
    # Dimension chains outside the plan: map grid lines, then the overall plot (feet and inches).
    style={"dimtxt":250,"dimtsz":120,"dimexo":150,"dimexe":200,"dimtad":1,"dimgap":90,"dimdec":0,"dimclrd":4,"dimclre":4}
    xs=sorted({0.,float(w)}|{round(x,4) for r in m['rooms'] for poly in r['polygons'] for x,_ in poly.exterior.coords})
    ys=sorted({0.,float(d)}|{round(y,4) for r in m['rooms'] for poly in r['polygons'] for _,y in poly.exterior.coords})
    for a,b in zip(xs,xs[1:]):
        ms.add_linear_dim(base=mm((0,d+3)),p1=mm((a,d)),p2=mm((b,d)),angle=0,text=ft_in(b-a),dxfattribs={"layer":"A-DIMS"},override=style).render()
    for a,b in zip(ys,ys[1:]):
        ms.add_linear_dim(base=mm((-3,0)),p1=mm((0,a)),p2=mm((0,b)),angle=90,text=ft_in(b-a),dxfattribs={"layer":"A-DIMS"},override=style).render()
    for p1,p2,base,angle,value in [((0,d),(w,d),(0,d+5.5),0,w),((0,0),(0,d),(-5.5,0),90,d)]:
        ms.add_linear_dim(base=mm(base),p1=mm(p1),p2=mm(p2),angle=angle,text=ft_in(value),dxfattribs={"layer":"A-DIMS"},override=style).render()
    # North arrow from the plot's facing, then the title lines.
    north={'South':(0.,1.),'North':(0.,-1.),'East':(1.,0.),'West':(-1.,0.)}.get(str(m.get('facing')).title())
    if north:
        cx,cy=w+5,d+3
        tip=(cx+north[0]*2,cy+north[1]*2);tail=(cx-north[0]*2,cy-north[1]*2);side=(-north[1]*.8,north[0]*.8)
        ms.add_circle(mm((cx,cy)),2.4*304.8,dxfattribs={'layer':'A-ANNO'})
        ms.add_lwpolyline([mm(tip),mm((tail[0]+side[0],tail[1]+side[1])),mm((cx,cy)),mm((tail[0]-side[0],tail[1]-side[1]))],close=True,dxfattribs={'layer':'A-ANNO'})
        ms.add_text('N',dxfattribs={'height':300,'layer':'A-ANNO'}).set_placement(mm((cx+north[0]*3.2,cy+north[1]*3.2)),align=TextEntityAlignment.MIDDLE_CENTER)
    ms.add_text(f'{m["floor"].upper()} FLOOR PLAN - FEET AND INCHES (MODEL IN MILLIMETRES) - PRELIMINARY DESIGN',dxfattribs={"height":220,"layer":"A-TEXT"}).set_placement(mm((0,-5)),align=TextEntityAlignment.LEFT)
    ms.add_text('Proposed 229 mm outer / 152 mm inner walls, openings and fittings. Chains follow the map grid; room sizes are clear. Verify before construction.',dxfattribs={"height":140,"layer":"A-TEXT"}).set_placement(mm((0,-6.5)))
    stream=io.StringIO();doc.write(stream);return stream.getvalue().encode('utf-8')


def render(source, floor="ground", view="2d", fmt="png", theme="warm", angle=0, room_id=None, style="verandah"):
    if view not in {"2d","3d","exterior","technical"} or fmt not in {"png","pdf","svg","dxf"} or theme not in PALETTES:
        raise ValueError("Unsupported plan view, format or theme.")
    if type(angle) is not int or angle not in range(4):raise ValueError("Choose one of the four views.")
    if style not in STYLES:raise ValueError('Choose an available exterior style.')
    if room_id is not None and (not isinstance(room_id,str) or view!='3d' or fmt not in {'png','svg'}):
        raise ValueError('Room views are available as 3D images.')
    if view=='exterior' and fmt not in {'png','svg'}:
        raise ValueError('Exterior views are available as images; PDF and CAD describe a floor.')
    m=model(source,floor)
    if room_id is not None and not any(r['placementId']==room_id for r in m['rooms']):
        raise ValueError('Choose a room on the selected floor.')
    if fmt=='dxf':return export_dxf(m)
    stream=io.BytesIO()
    if view=='technical':
        # A true-scale A3 landscape sheet drawn in millimetres (1:50 to 1:1000).
        factor=72/25.4 if fmt=='pdf' else 5
        if fmt=='pdf':
            surface=cairo.PDFSurface(stream,420*factor,297*factor)
            surface.set_metadata(cairo.PDFMetadata.TITLE,f'Compass home plan - {floor} floor')
            surface.set_metadata(cairo.PDFMetadata.CREATOR,'GazeConnect Compass')
        elif fmt=='svg':surface=cairo.SVGSurface(stream,420*factor,297*factor)
        else:surface=cairo.ImageSurface(cairo.FORMAT_ARGB32,420*factor,297*factor)
        ctx=cairo.Context(surface);ctx.scale(factor,factor)
        draw_sheet(ctx,m)
        if fmt=='png':surface.write_to_png(stream)
        surface.finish();return stream.getvalue()
    cw,ch=(1600,1000) if view in {'3d','exterior'} else sheet_size(m,view=='technical')
    if fmt=='pdf':
        surface=cairo.PDFSurface(stream,841.89,1190.55)
    elif fmt=='svg':surface=cairo.SVGSurface(stream,cw,ch)
    else:surface=cairo.ImageSurface(cairo.FORMAT_ARGB32,int(cw*1.5),int(ch*1.5))
    ctx=cairo.Context(surface)
    factor=841.89/cw if fmt=='pdf' else 1 if fmt=='svg' else 1.5
    ctx.scale(factor,factor)
    if fmt=='pdf':ctx.translate(0,(1190.55/factor-ch)/2)
    palette='warm' if view=='technical' else theme
    paint(ctx, '#FFFFFF' if view=='technical' else PALETTES[palette][0]);ctx.paint()
    if view=='3d':draw_3d(ctx,m,PALETTES[palette],angle,room_id)
    elif view=='exterior':
        floors=[m if floor=='ground' else model(source,'ground')]
        if source.get('first_floor',{}).get('placements'):
            floors.append(m if floor=='first' else model(source,'first',ground=floors[0]))
        draw_exterior(ctx,floors,PALETTES[palette],angle,style)
    else:draw_2d(ctx,m,PALETTES[palette],cw,ch,view=='technical')
    text(ctx,cw/2,ch-16,'Preliminary design · dimensions and construction require professional review',16,PALETTES[palette][3])
    if fmt=='png':surface.write_to_png(stream)
    surface.finish();return stream.getvalue()
