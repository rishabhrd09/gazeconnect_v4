"""
DXF exporter for GazePlan v5 with AIA-style CAD layers.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

try:
    import ezdxf  # type: ignore
except Exception:  # pragma: no cover
    ezdxf = None


LAYER_SPEC = {
    "A-WALL-FULL": {"color": 7, "lineweight": 70},
    "A-WALL-PRHT": {"color": 3, "lineweight": 25},
    "A-DOOR": {"color": 2, "lineweight": 25},
    "A-DOOR-SWNG": {"color": 2, "lineweight": 15},
    "A-GLAZ": {"color": 4, "lineweight": 35},
    "A-FLOR-STRS": {"color": 2, "lineweight": 35},
    "A-ANNO-DIMS": {"color": 1, "lineweight": 18},
    "A-AREA-NAME": {"color": 4, "lineweight": 18},
    "A-FLOR-CASE": {"color": 3, "lineweight": 25},
}


def _polyline_points(points: Iterable[Tuple[float, float]]) -> List[Tuple[float, float]]:
    return [(float(x), float(y)) for x, y in points]


def export_dxf_v5(
    out_path: str,
    *,
    rooms: Iterable[Dict[str, Any]],
    walls: Dict[str, Any],
    fenestration: Dict[str, Any],
    floor_label: str = "GROUND FLOOR",
) -> str:
    if ezdxf is None:
        raise RuntimeError("ezdxf is not installed")

    doc = ezdxf.new("R2018")
    msp = doc.modelspace()

    for name, spec in LAYER_SPEC.items():
        if name not in doc.layers:
            doc.layers.add(name, dxfattribs={"color": spec["color"], "lineweight": spec["lineweight"]})

    # Walls
    for wp in walls.get("wall_polygons", []) or []:
        pts = wp.get("points") or []
        if len(pts) < 3:
            continue
        layer = "A-WALL-FULL" if wp.get("kind") == "exterior" else "A-WALL-PRHT"
        msp.add_lwpolyline(_polyline_points(pts + [pts[0]]), dxfattribs={"layer": layer, "closed": True})

    # Room labels and room boundaries.
    for r in rooms:
        x1 = float(r.get("x1", 0.0))
        y1 = float(r.get("y1", 0.0))
        x2 = float(r.get("x2", 0.0))
        y2 = float(r.get("y2", 0.0))
        rid = str(r.get("roomId", "room"))
        label = str(r.get("label") or rid).upper()
        poly = [(x1, y1), (x2, y1), (x2, y2), (x1, y2), (x1, y1)]
        msp.add_lwpolyline(poly, dxfattribs={"layer": "A-AREA-NAME"})
        cx = (x1 + x2) * 0.5
        cy = (y1 + y2) * 0.5
        msp.add_text(label, dxfattribs={"layer": "A-AREA-NAME", "height": 0.75}).set_placement((cx, cy))

    # Windows
    for w in fenestration.get("windows", []) or []:
        seg = w.get("segment")
        if not seg:
            continue
        (x1, y1), (x2, y2) = seg
        msp.add_line((x1, y1), (x2, y2), dxfattribs={"layer": "A-GLAZ"})

    # Doors and simple arcs.
    for d in fenestration.get("doors", []) or []:
        seg = d.get("segment")
        if not seg:
            continue
        (x1, y1), (x2, y2) = seg
        msp.add_line((x1, y1), (x2, y2), dxfattribs={"layer": "A-DOOR"})
        radius = max(0.5, ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5)
        msp.add_arc((x1, y1), radius=radius, start_angle=0, end_angle=90, dxfattribs={"layer": "A-DOOR-SWNG"})

    # Title note.
    msp.add_text(
        f"GAZECONNECT V5 - {floor_label}",
        dxfattribs={"layer": "A-ANNO-DIMS", "height": 1.0},
    ).set_placement((0.0, -2.0))

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(str(out))
    return str(out)

