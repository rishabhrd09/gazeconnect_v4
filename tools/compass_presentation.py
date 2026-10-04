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
from shapely.geometry import box
from shapely.ops import unary_union
from compass_architecture import details, ARCHITECTURE_NOTE, parts
from compass_drawing import draw_2d, draw_3d, sheet_size
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
        for floor in FLOORS:
            if choice["compassData"].get(FLOORS[floor], {}).get("placements"):
                choice["notes"].extend(model(choice["compassData"], floor)["architecture"]["notes"])
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
        for floor in FLOORS:
            if data.get(FLOORS[floor], {}).get("placements"):
                choices[0]["notes"].extend(model(data, floor)["architecture"]["notes"])
    return {"options": choices, "scope": scope, "notes": notes,
            "requestedCount": 4, "sourceUnchanged": True}


def model(source: dict, floor: str) -> dict:
    if floor not in FLOORS:
        raise ValueError("Choose a floor that exists in this plan.")
    data = normalise(source)
    f = data.get(FLOORS[floor], {})
    if not f.get("placements"):
        raise ValueError("This floor has no rooms yet. Choose Ground floor.")
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
    result["architecture"] = details(result)
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
    import ezdxf
    from ezdxf.enums import TextEntityAlignment
    doc=ezdxf.new("R2010");doc.units=4  # millimetres, 1 ft = 304.8 mm
    for name,color in (("A-ROOM",7),("A-DOOR",3),("A-DIMS",4),("A-TEXT",7),("A-SITE",8),("A-WALL",7),("A-WIND",4),("A-STAIR",8),("A-FURN",8)):
        doc.layers.new(name,dxfattribs={"color":color})
    ms=doc.modelspace();mm=lambda p:tuple(v*304.8 for v in p)
    for room in m["rooms"]:
        for poly in room["polygons"]:
            for ring in [poly.exterior,*poly.interiors]:
                ms.add_lwpolyline([mm(p) for p in list(ring.coords)[:-1]],close=True,dxfattribs={"layer":"A-ROOM"})
        x1,y1,x2,y2=room['labelBounds'];center=mm(((x1+x2)/2,(y1+y2)/2))
        ms.add_mtext(room["room"].replace('\\','/').replace('{','(').replace('}',')')+f'\\P{room["area_sqft"]:.1f} sq ft',dxfattribs={"layer":"A-TEXT","insert":center,"char_height":150,"width":(x2-x1)*250,"attachment_point":5})
        r=room["coords"]
        for p1,p2,base,angle in [((r['x1'],r['y1']),(r['x2'],r['y1']),(r['x1'],r['y1']+.8),0),((r['x1'],r['y1']),(r['x1'],r['y2']),(r['x1']+.8,r['y1']),90)]:
            ms.add_linear_dim(base=mm(base),p1=mm(p1),p2=mm(p2),angle=angle,dxfattribs={"layer":"A-DIMS"},override={"dimtxt":120,"dimasz":75,"dimdec":0}).render()
    for poly in parts(m['architecture']['wallFootprint']):
        if poly.geom_type != 'Polygon': continue
        for ring in [poly.exterior,*poly.interiors]:
            ms.add_lwpolyline([mm(p) for p in list(ring.coords)[:-1]],close=True,dxfattribs={'layer':'A-WALL'})
    for window in m['architecture']['windows']:
        a,b=window['a'],window['b'];length=math.dist(a,b);n=(-(b[1]-a[1])/length,(b[0]-a[0])/length)
        for offset in (-.18,.18):
            ms.add_line(mm((a[0]+n[0]*offset,a[1]+n[1]*offset)),mm((b[0]+n[0]*offset,b[1]+n[1]*offset)),dxfattribs={'layer':'A-WIND'})
    for door in m['architecture']['doors']:
        ms.add_line(mm(door['a']),mm(door['leaf']),dxfattribs={'layer':'A-DOOR'})
        ms.add_lwpolyline([mm(p) for p in door['arc']],dxfattribs={'layer':'A-DOOR'})
    for fixture in m['architecture']['fixtures']:
        for item in fixture['lines']:
            ms.add_lwpolyline([mm(p) for p in item['points']],close=item['closed'],dxfattribs={'layer':'A-STAIR' if fixture['kind']=='stair' else 'A-FURN'})
    w,d=m['width'],m['depth']
    ms.add_lwpolyline([mm(p) for p in [(0,0),(w,0),(w,d),(0,d)]],close=True,dxfattribs={"layer":"A-SITE"})
    for p1,p2,base,angle in [((0,0),(w,0),(0,-3),0),((0,0),(0,d),(-3,0),90)]:
        ms.add_linear_dim(base=mm(base),p1=mm(p1),p2=mm(p2),angle=angle,dxfattribs={"layer":"A-DIMS"},override={"dimtxt":180,"dimasz":100,"dimdec":0}).render()
    ms.add_text(f'{m["floor"].upper()} FLOOR - MILLIMETRES - PRELIMINARY DESIGN',dxfattribs={"height":220,"layer":"A-TEXT"}).set_placement(mm((0,-5)),align=TextEntityAlignment.LEFT)
    ms.add_text('Proposed 229 mm outer / 152 mm inner walls, openings and fittings. Grid dimensions; verify before construction.',dxfattribs={"height":140,"layer":"A-TEXT"}).set_placement(mm((0,-6.5)))
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
            floors.append(m if floor=='first' else model(source,'first'))
        draw_exterior(ctx,floors,PALETTES[palette],angle,style)
    else:draw_2d(ctx,m,PALETTES[palette],cw,ch,view=='technical')
    text(ctx,cw/2,ch-16,'Preliminary design · dimensions and construction require professional review',16,PALETTES[palette][3])
    if fmt=='png':surface.write_to_png(stream)
    surface.finish();return stream.getvalue()
