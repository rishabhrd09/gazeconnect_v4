"""
Stage-6 renderer for GazePlan v5.

Generates professional 2D plans in:
- presentation mode (colored client-facing)
- technical mode (high contrast engineering)
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

try:
    import cairo  # type: ignore
except Exception as exc:  # pragma: no cover
    raise RuntimeError("pycairo is required for renderer_v5") from exc


ROOM_COLORS = {
    "masterbed": (0.80, 0.84, 0.97),
    "bedroom": (0.85, 0.88, 0.97),
    "living": (0.72, 0.86, 0.96),
    "drawing": (0.82, 0.75, 0.94),
    "dining": (0.96, 0.90, 0.65),
    "diningstaircase": (0.88, 0.82, 0.72),
    "kitchen": (0.96, 0.81, 0.54),
    "bathroom": (0.76, 0.83, 0.89),
    "commonbath": (0.76, 0.83, 0.89),
    "staircase": (0.75, 0.67, 0.66),
    "icu": (0.95, 0.70, 0.70),
    "porch": (0.70, 0.85, 0.72),
    "lawn": (0.74, 0.88, 0.65),
    "verandah": (0.68, 0.86, 0.84),
    "backyard": (0.66, 0.82, 0.68),
    "balcony": (0.66, 0.86, 0.86),
    "terrace": (0.63, 0.84, 0.84),
    "store": (0.88, 0.88, 0.88),
}


ROOM_LABELS = {
    "masterbed": "Master Bedroom",
    "bedroom": "Bedroom",
    "living": "Living Hall",
    "drawing": "Drawing Room",
    "dining": "Dining Hall",
    "diningstaircase": "Dining Hall + Staircase",
    "kitchen": "Kitchen + Store",
    "bathroom": "Bathroom",
    "commonbath": "Common Bath",
    "staircase": "Staircase",
    "icu": "Home ICU",
    "porch": "Outer Lobby / Porch / Open Area",
    "lawn": "Lawn / Garden",
    "verandah": "Verandah",
    "backyard": "Backyard",
    "balcony": "Balcony",
    "terrace": "Terrace",
    "store": "Store",
}


class V5Renderer:
    def __init__(
        self,
        *,
        plot_w_ft: float,
        plot_d_ft: float,
        rooms: Iterable[Dict[str, Any]],
        walls: Dict[str, Any],
        fenestration: Dict[str, Any],
        facing: str = "East",
        floor_label: str = "GROUND FLOOR",
        vastu_score: float = 0.0,
        style_name: str = "presentation",
        advanced_refinements: Dict[str, Any] | None = None,
        compass_data: Dict[str, Any] | None = None,
    ) -> None:
        self.plot_w_ft = float(plot_w_ft)
        self.plot_d_ft = float(plot_d_ft)
        self.rooms = list(rooms)
        self.walls = walls or {"segments": [], "wall_polygons": []}
        self.fenestration = fenestration or {"windows": [], "doors": [], "ventilation": []}
        self.facing = facing
        self.floor_label = floor_label
        self.vastu_score = float(vastu_score)
        self.style_name = style_name
        self.advanced_refinements = advanced_refinements or {}
        self.compass_data = compass_data or {}

        self.scale = 22.0  # px per ft
        self.margin = 56.0
        self.title_h = 88.0
        self.legend_w = 260.0

        self.canvas_w = int(self.margin * 2 + self.plot_w_ft * self.scale + self.legend_w)
        self.canvas_h = int(self.margin * 2 + self.plot_d_ft * self.scale + self.title_h)

    def _to_px(self, x_ft: float, y_ft: float) -> Tuple[float, float]:
        # Screen y grows downward; map 0->top with origin at plot top.
        x = self.margin + x_ft * self.scale
        y = self.margin + (self.plot_d_ft - y_ft) * self.scale
        return x, y

    def _draw_bg(self, ctx: cairo.Context, mode: str) -> None:
        if mode == "technical":
            ctx.set_source_rgb(0.02, 0.03, 0.05)
        else:
            ctx.set_source_rgb(0.92, 0.94, 0.96)
        ctx.paint()

    def _draw_plot_frame(self, ctx: cairo.Context, mode: str) -> None:
        x, y = self._to_px(0.0, self.plot_d_ft)
        w = self.plot_w_ft * self.scale
        h = self.plot_d_ft * self.scale
        if mode == "technical":
            ctx.set_source_rgb(0.85, 0.9, 1.0)
            ctx.set_line_width(2.5)
        else:
            ctx.set_source_rgb(0.2, 0.28, 0.38)
            ctx.set_line_width(3.5)
        ctx.rectangle(x, y, w, h)
        ctx.stroke()

    def _draw_rooms(self, ctx: cairo.Context, mode: str) -> None:
        for room in self.rooms:
            rid = str(room.get("roomId", "")).strip().lower().replace("_", "")
            x1 = float(room["x1"])
            y1 = float(room["y1"])
            x2 = float(room["x2"])
            y2 = float(room["y2"])
            px1, py_top = self._to_px(x1, y2)
            px2, py_bottom = self._to_px(x2, y1)
            rw = px2 - px1
            rh = py_bottom - py_top
            if rw <= 0 or rh <= 0:
                continue

            if mode == "technical":
                ctx.set_source_rgba(0.1, 0.18, 0.25, 0.18)
            else:
                c = ROOM_COLORS.get(rid, (0.85, 0.87, 0.90))
                ctx.set_source_rgb(*c)
            ctx.rectangle(px1, py_top, rw, rh)
            ctx.fill_preserve()

            if mode == "technical":
                ctx.set_source_rgb(0.85, 0.9, 1.0)
                ctx.set_line_width(1.2)
            else:
                ctx.set_source_rgb(0.25, 0.31, 0.40)
                ctx.set_line_width(1.4)
            ctx.stroke()

            self._draw_room_label(ctx, room, px1, py_top, rw, rh, mode)

    def _draw_room_label(
        self, ctx: cairo.Context, room: Dict[str, Any], x: float, y: float, w: float, h: float, mode: str
    ) -> None:
        rid = str(room.get("roomId", "")).strip().lower().replace("_", "")
        raw_label = str(room.get("label") or room.get("room") or "").strip()
        use_raw = bool(
            raw_label
            and (
                raw_label.lower().startswith("1f")
                or any(ch.isdigit() for ch in raw_label)
                or "+" in raw_label
                or "/" in raw_label
            )
        )
        label = raw_label if use_raw else ROOM_LABELS.get(rid, (raw_label or rid).title())
        area_txt = f"{max(1.0, float(room.get('area_sqft', 0.0))):.0f} sq.ft"

        if mode == "technical":
            ctx.set_source_rgb(0.94, 0.96, 1.0)
        else:
            ctx.set_source_rgb(0.07, 0.11, 0.16)
        ctx.select_font_face("DejaVu Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        size = max(9.0, min(26.0, min(w * 0.11, h * 0.22)))
        ctx.set_font_size(size)
        te = ctx.text_extents(label)
        tx = x + (w - te.width) * 0.5 - te.x_bearing
        ty = y + h * 0.52
        ctx.move_to(tx, ty)
        ctx.show_text(label)

        ctx.select_font_face("DejaVu Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(max(8.0, size * 0.50))
        te2 = ctx.text_extents(area_txt)
        tx2 = x + (w - te2.width) * 0.5 - te2.x_bearing
        ty2 = ty + max(10.0, size * 0.72)
        ctx.move_to(tx2, ty2)
        ctx.show_text(area_txt)

    def _draw_wall_polys(self, ctx: cairo.Context, mode: str) -> None:
        wall_polys = list(self.walls.get("wall_polygons") or [])
        if not wall_polys:
            return
        for wp in wall_polys:
            pts = list(wp.get("points") or [])
            if len(pts) < 3:
                continue
            kind = str(wp.get("kind") or "interior")
            if mode == "technical":
                ctx.set_source_rgb(1.0, 1.0, 1.0 if kind == "exterior" else 0.86)
            else:
                ctx.set_source_rgb(0.23, 0.30, 0.39 if kind == "exterior" else 0.45)
            first = True
            for x_ft, y_ft in pts:
                px, py = self._to_px(float(x_ft), float(y_ft))
                if first:
                    ctx.move_to(px, py)
                    first = False
                else:
                    ctx.line_to(px, py)
            ctx.close_path()
            # Keep room fills visible; draw wall outlines instead of opaque overlays.
            if mode == "technical":
                ctx.set_line_width(2.1 if kind == "exterior" else 1.6)
            else:
                ctx.set_line_width(2.2 if kind == "exterior" else 1.5)
            ctx.stroke()

    def _draw_windows_doors(self, ctx: cairo.Context, mode: str) -> None:
        if mode == "technical":
            wcol = (0.0, 0.85, 0.9)
            dcol = (0.95, 0.85, 0.2)
        else:
            wcol = (0.86, 0.97, 1.0)
            dcol = (0.99, 0.96, 0.88)

        for w in self.fenestration.get("windows", []):
            seg = w.get("segment")
            if not seg:
                continue
            (x1, y1), (x2, y2) = seg
            p1 = self._to_px(float(x1), float(y1))
            p2 = self._to_px(float(x2), float(y2))
            ctx.set_source_rgb(*wcol)
            ctx.set_line_width(3.0)
            ctx.move_to(*p1)
            ctx.line_to(*p2)
            ctx.stroke()

        for d in self.fenestration.get("doors", []):
            seg = d.get("segment")
            if not seg:
                continue
            (x1, y1), (x2, y2) = seg
            p1 = self._to_px(float(x1), float(y1))
            p2 = self._to_px(float(x2), float(y2))
            ctx.set_source_rgb(*dcol)
            ctx.set_line_width(4.0)
            ctx.move_to(*p1)
            ctx.line_to(*p2)
            ctx.stroke()

            # Door swing arc (simple quarter arc around first point)
            cx, cy = p1
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            radius = max(8.0, math.hypot(dx, dy))
            a0 = 0.0
            a1 = math.pi / 2.0
            if abs(dy) > abs(dx):  # vertical door
                a0 = -math.pi / 2.0
                a1 = 0.0
            ctx.set_line_width(1.0)
            ctx.arc(cx, cy, radius, a0, a1)
            ctx.stroke()

    def _draw_legend(self, ctx: cairo.Context, mode: str) -> None:
        lx = self.margin + self.plot_w_ft * self.scale + 24.0
        ly = self.margin + 16.0
        if mode == "technical":
            ctx.set_source_rgb(0.9, 0.94, 1.0)
        else:
            ctx.set_source_rgb(0.08, 0.12, 0.18)
        ctx.select_font_face("DejaVu Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(13)
        ctx.move_to(lx, ly)
        ctx.show_text("ROOM LEGEND")

        rows = []
        seen = set()
        for r in self.rooms:
            rid = str(r.get("roomId", "")).strip().lower().replace("_", "")
            if rid in seen:
                continue
            seen.add(rid)
            raw_label = str(r.get("label") or r.get("room") or "").strip()
            use_raw = bool(
                raw_label
                and (
                    raw_label.lower().startswith("1f")
                    or any(ch.isdigit() for ch in raw_label)
                    or "+" in raw_label
                    or "/" in raw_label
                )
            )
            rows.append((rid, raw_label if use_raw else ROOM_LABELS.get(rid, rid.title())))
        y = ly + 16.0
        for rid, label in rows[:18]:
            c = ROOM_COLORS.get(rid, (0.7, 0.75, 0.8))
            if mode == "technical":
                ctx.set_source_rgb(0.22, 0.32, 0.46)
            else:
                ctx.set_source_rgb(*c)
            ctx.rectangle(lx, y - 9, 9, 9)
            ctx.fill()
            ctx.set_source_rgb(0.9, 0.94, 1.0) if mode == "technical" else ctx.set_source_rgb(0.10, 0.14, 0.20)
            ctx.set_font_size(10)
            ctx.move_to(lx + 14, y)
            ctx.show_text(label)
            y += 13

    def _draw_compass_and_vastu(self, ctx: cairo.Context, mode: str) -> None:
        cx = self.margin + self.plot_w_ft * self.scale + self.legend_w * 0.76
        cy = self.margin + 24.0
        r = 16.0
        ctx.set_source_rgb(0.9, 0.94, 1.0) if mode == "technical" else ctx.set_source_rgb(0.2, 0.24, 0.30)
        ctx.set_line_width(1.2)
        ctx.arc(cx, cy, r, 0, 2 * math.pi)
        ctx.stroke()
        ctx.move_to(cx, cy - r - 6)
        ctx.show_text("N")
        ctx.move_to(cx + r + 4, cy + 3)
        ctx.show_text("E")
        ctx.move_to(cx, cy + r + 12)
        ctx.show_text("S")
        ctx.move_to(cx - r - 12, cy + 3)
        ctx.show_text("W")

        badge = f"Vastu {self.vastu_score:.1f}%"
        by = self.margin + self.plot_d_ft * self.scale + 24.0
        bx = self.margin + 8.0
        if mode == "technical":
            ctx.set_source_rgb(0.1, 0.18, 0.28)
        else:
            ctx.set_source_rgb(0.2, 0.27, 0.38)
        ctx.rectangle(bx, by - 18, 120, 24)
        ctx.fill()
        ctx.set_source_rgb(0.84, 0.96, 1.0)
        ctx.set_font_size(12)
        ctx.move_to(bx + 8, by - 2)
        ctx.show_text(badge)

    def _draw_title(self, ctx: cairo.Context, mode: str) -> None:
        y0 = self.margin + self.plot_d_ft * self.scale + 40
        if mode == "technical":
            ctx.set_source_rgb(0.85, 0.92, 1.0)
        else:
            ctx.set_source_rgb(0.08, 0.13, 0.20)
        title = f"GAZECONNECT PRO - {self.floor_label} - AI FLOOR PLAN V5"
        sub = f"{self.plot_w_ft:.0f}' x {self.plot_d_ft:.0f}' - Facing {self.facing} - Style {self.style_name.upper()}"
        ctx.select_font_face("DejaVu Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(16)
        ctx.move_to(self.margin, y0)
        ctx.show_text(title)
        ctx.select_font_face("DejaVu Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(11)
        ctx.move_to(self.margin, y0 + 20)
        ctx.show_text(sub)

    def _compute_cell_rect(
        self, cell_id: str
    ) -> Tuple[float, float, float, float] | None:
        """Compute pixel rect (x, y, w, h) for a grid cell like 'r1_c2'."""
        parts = cell_id.replace("r", "").split("_c")
        if len(parts) != 2:
            return None
        try:
            row, col = int(parts[0]), int(parts[1])
        except ValueError:
            return None
        cell_w_ft = self.plot_w_ft / 4.0
        cell_h_ft = self.plot_d_ft / 4.0
        x_ft = (col - 1) * cell_w_ft
        y_ft = (4 - row) * cell_h_ft  # row 1 = top = highest y
        px, py = self._to_px(x_ft, y_ft + cell_h_ft)
        pw = cell_w_ft * self.scale
        ph = cell_h_ft * self.scale
        return (px, py, pw, ph)

    def _draw_advanced_refinements(self, ctx: cairo.Context, mode: str) -> None:
        """Render advanced refinements (splits, walls, voids, vastu, access, notes)."""
        refinements = self.advanced_refinements
        if not refinements:
            return

        # SPLITS — dashed violet line
        for split in refinements.get("subCellSplits", []):
            rect = self._compute_cell_rect(split.get("parentCell", ""))
            if not rect:
                continue
            x, y, w, h = rect
            ctx.save()
            ctx.set_source_rgba(0.55, 0.36, 0.98, 0.8)
            ctx.set_line_width(1.5)
            ctx.set_dash([4, 3])
            if split.get("splitDirection") == "vertical":
                ctx.move_to(x + w / 2, y + 4)
                ctx.line_to(x + w / 2, y + h - 4)
            else:
                ctx.move_to(x + 4, y + h / 2)
                ctx.line_to(x + w - 4, y + h / 2)
            ctx.stroke()
            ctx.restore()

        # WALL EDGES — teal for glass, green for arch
        for edge in refinements.get("customEdges", []):
            cells = edge.get("cells", [])
            if not cells:
                continue
            rect = self._compute_cell_rect(cells[0])
            if not rect:
                continue
            x, y, w, h = rect
            edge_type = edge.get("type", "full_wall")
            ctx.save()
            if edge_type == "half_wall_glass":
                ctx.set_source_rgba(0.18, 0.83, 0.75, 0.9)
                ctx.set_dash([6, 4])
                ctx.set_line_width(2.0)
            elif edge_type == "open_archway":
                ctx.set_source_rgba(0.25, 0.75, 0.35, 0.8)
                ctx.set_dash([2, 6])
                ctx.set_line_width(1.5)
            else:
                ctx.set_source_rgba(0.9, 0.9, 0.9, 0.6)
                ctx.set_dash([])
                ctx.set_line_width(2.0)
            ctx.move_to(x + w, y + 4)
            ctx.line_to(x + w, y + h - 4)
            ctx.stroke()
            ctx.restore()

        # VOIDS — X-hatch blue
        for void_marker in refinements.get("voidMarkers", []):
            rect = self._compute_cell_rect(void_marker.get("cell", ""))
            if not rect:
                continue
            x, y, w, h = rect
            ctx.save()
            ctx.set_source_rgba(0.23, 0.51, 0.96, 0.3)
            ctx.set_line_width(1.0)
            ctx.set_dash([3, 3])
            ctx.move_to(x, y)
            ctx.line_to(x + w, y + h)
            ctx.move_to(x + w, y)
            ctx.line_to(x, y + h)
            ctx.stroke()
            ctx.set_source_rgba(0.23, 0.51, 0.96, 0.9)
            ctx.set_dash([])
            ctx.set_font_size(6)
            ctx.move_to(x + 4, y + h / 2)
            ctx.show_text("OPEN TO BELOW")
            ctx.restore()

        # VASTU — red triangle top-right of cell
        for flag in refinements.get("vastuFlags", []):
            rect = self._compute_cell_rect(flag.get("cell", ""))
            if not rect:
                continue
            x, y, w, h = rect
            ctx.save()
            ctx.set_source_rgba(0.94, 0.27, 0.27, 0.9)
            ctx.move_to(x + w - 4, y + 4)
            ctx.line_to(x + w - 14, y + 4)
            ctx.line_to(x + w - 4, y + 14)
            ctx.close_path()
            ctx.fill()
            ctx.restore()

        # ACCESSIBILITY — teal circle bottom-left
        for marker in refinements.get("accessibilityMarkers", []):
            rect = self._compute_cell_rect(marker.get("cell", ""))
            if not rect:
                continue
            x, y, w, h = rect
            ctx.save()
            ctx.set_source_rgba(0.18, 0.83, 0.75, 0.9)
            ctx.arc(x + 10, y + h - 10, 6, 0, 2 * math.pi)
            ctx.fill()
            ctx.restore()

        # CAREGIVER NOTES — text legend at bottom
        notes = refinements.get("caregiverAnnotations", [])
        if notes:
            ctx.save()
            ctx.set_source_rgba(0.9, 0.8, 0.6, 1.0)
            ctx.set_font_size(7)
            drawing_bottom = self.margin + self.plot_d_ft * self.scale
            y0 = drawing_bottom + 20
            ctx.move_to(self.margin, y0)
            ctx.show_text("CAREGIVER NOTES:")
            for i, note in enumerate(notes):
                ctx.move_to(self.margin, y0 + 10 + i * 10)
                ctx.show_text(f"• {note.get('text', '')}")
            ctx.restore()

    def _render_ctx(self, ctx: cairo.Context, mode: str) -> None:
        self._draw_bg(ctx, mode)
        self._draw_rooms(ctx, mode)
        self._draw_advanced_refinements(ctx, mode)
        self._draw_wall_polys(ctx, mode)
        self._draw_windows_doors(ctx, mode)
        self._draw_plot_frame(ctx, mode)
        self._draw_legend(ctx, mode)
        self._draw_compass_and_vastu(ctx, mode)
        self._draw_title(ctx, mode)

    def render_png(self, out_path: str, mode: str = "presentation") -> str:
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, self.canvas_w, self.canvas_h)
        ctx = cairo.Context(surface)
        ctx.set_antialias(cairo.ANTIALIAS_BEST)
        self._render_ctx(ctx, mode)
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        surface.write_to_png(out_path)
        return out_path

    def render_pdf(self, out_path: str, mode: str = "presentation") -> str:
        surface = cairo.PDFSurface(out_path, self.canvas_w, self.canvas_h)
        ctx = cairo.Context(surface)
        ctx.set_antialias(cairo.ANTIALIAS_BEST)
        self._render_ctx(ctx, mode)
        surface.finish()
        return out_path

    def render_svg(self, out_path: str, mode: str = "presentation") -> str:
        surface = cairo.SVGSurface(out_path, self.canvas_w, self.canvas_h)
        ctx = cairo.Context(surface)
        ctx.set_antialias(cairo.ANTIALIAS_BEST)
        self._render_ctx(ctx, mode)
        surface.finish()
        return out_path
