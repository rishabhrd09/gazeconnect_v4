"""
Stage-4 wall geometry generation for GazePlan v5.

Builds clean wall primitives from room rectangles:
- exterior walls (thicker)
- interior partitions (thinner)

When Shapely is available, wall rectangles are unary-unioned for cleaner joins.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    from shapely.geometry import MultiPolygon, Polygon  # type: ignore
    from shapely.ops import unary_union  # type: ignore
except Exception:  # pragma: no cover
    Polygon = None  # type: ignore
    MultiPolygon = None  # type: ignore
    unary_union = None  # type: ignore


Point = Tuple[float, float]
Segment = Tuple[Point, Point]


def _round_pt(p: Point, ndigits: int = 4) -> Point:
    return (round(float(p[0]), ndigits), round(float(p[1]), ndigits))


def _edge_key(a: Point, b: Point) -> Tuple[Point, Point]:
    aa = _round_pt(a)
    bb = _round_pt(b)
    return (aa, bb) if aa <= bb else (bb, aa)


def _room_edges(room: Dict[str, Any]) -> List[Segment]:
    x1 = float(room["x1"])
    y1 = float(room["y1"])
    x2 = float(room["x2"])
    y2 = float(room["y2"])
    return [
        ((x1, y1), (x2, y1)),  # south/front
        ((x2, y1), (x2, y2)),  # east/right
        ((x2, y2), (x1, y2)),  # north/rear
        ((x1, y2), (x1, y1)),  # west/left
    ]


def _segment_rect(seg: Segment, thickness_ft: float) -> List[Point]:
    (x1, y1), (x2, y2) = seg
    t = float(thickness_ft) * 0.5
    if abs(y2 - y1) < 1e-6:  # horizontal
        y_low = y1 - t
        y_high = y1 + t
        xa, xb = sorted((x1, x2))
        return [(xa, y_low), (xb, y_low), (xb, y_high), (xa, y_high)]
    # vertical
    x_low = x1 - t
    x_high = x1 + t
    ya, yb = sorted((y1, y2))
    return [(x_low, ya), (x_high, ya), (x_high, yb), (x_low, yb)]


def _poly_to_points(poly: Any) -> List[List[Point]]:
    if Polygon is None:
        return []
    polys: List[List[Point]] = []
    if isinstance(poly, Polygon):
        polys.append([(float(x), float(y)) for x, y in poly.exterior.coords[:-1]])
    elif MultiPolygon is not None and isinstance(poly, MultiPolygon):
        for p in poly.geoms:
            polys.append([(float(x), float(y)) for x, y in p.exterior.coords[:-1]])
    return polys


def build_wall_geometry(
    rooms: Iterable[Dict[str, Any]],
    *,
    ext_wall_ft: float = 0.75,
    int_wall_ft: float = 0.375,
) -> Dict[str, Any]:
    """
    Return wall geometry model:
      {
        "segments": [{"kind","a","b","thickness_ft"}],
        "wall_polygons": [{"kind","points":[...]}],
      }
    """
    room_list = list(rooms)
    edge_to_rooms: Dict[Tuple[Point, Point], List[int]] = defaultdict(list)
    edge_raw: Dict[Tuple[Point, Point], Segment] = {}

    for i, room in enumerate(room_list):
        for seg in _room_edges(room):
            key = _edge_key(seg[0], seg[1])
            edge_to_rooms[key].append(i)
            edge_raw[key] = seg

    segments: List[Dict[str, Any]] = []
    for key, owners in edge_to_rooms.items():
        seg = edge_raw[key]
        kind = "interior" if len(owners) >= 2 else "exterior"
        thickness = float(int_wall_ft if kind == "interior" else ext_wall_ft)
        segments.append({
            "kind": kind,
            "a": seg[0],
            "b": seg[1],
            "thickness_ft": thickness,
            "owners": owners,
        })

    # Build rectangular wall strips from centerline segments.
    raw_polys: List[Dict[str, Any]] = []
    for s in segments:
        points = _segment_rect((s["a"], s["b"]), s["thickness_ft"])
        raw_polys.append({"kind": s["kind"], "points": points})

    # Optional polygon union with shapely for cleaner joinery.
    if Polygon is None or unary_union is None:
        return {"segments": segments, "wall_polygons": raw_polys}

    ext = [Polygon(p["points"]) for p in raw_polys if p["kind"] == "exterior"]
    intr = [Polygon(p["points"]) for p in raw_polys if p["kind"] == "interior"]
    ext_u = unary_union(ext) if ext else None
    int_u = unary_union(intr) if intr else None

    wall_polygons: List[Dict[str, Any]] = []
    if ext_u is not None:
        for pts in _poly_to_points(ext_u):
            wall_polygons.append({"kind": "exterior", "points": pts})
    if int_u is not None:
        for pts in _poly_to_points(int_u):
            wall_polygons.append({"kind": "interior", "points": pts})

    return {"segments": segments, "wall_polygons": wall_polygons or raw_polys}

