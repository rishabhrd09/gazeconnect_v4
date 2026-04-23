"""
Room Adjacency Graph (RAG) construction for GazePlan v5.
Phase 1 foundation module (topology extraction + rules).
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

try:
    import networkx as nx
except Exception:  # pragma: no cover
    class _SimpleGraph:
        def __init__(self) -> None:
            self.nodes: Dict[str, Dict[str, Any]] = {}
            self._edges: Dict[Tuple[str, str], Dict[str, Any]] = {}
            self.graph: Dict[str, Any] = {}

        def __contains__(self, node: str) -> bool:
            return node in self.nodes

        def add_node(self, node: str, **attrs: Any) -> None:
            self.nodes[node] = {**self.nodes.get(node, {}), **attrs}

        def add_edge(self, a: str, b: str, **attrs: Any) -> None:
            if a == b:
                return
            self.add_node(a)
            self.add_node(b)
            k = tuple(sorted((a, b)))
            self._edges[k] = {**self._edges.get(k, {}), **attrs}

        def has_edge(self, a: str, b: str) -> bool:
            return tuple(sorted((a, b))) in self._edges

        def edges(self) -> List[Tuple[str, str]]:
            return list(self._edges.keys())

        def remove_edges_from(self, pairs: Iterable[Tuple[str, str]]) -> None:
            for a, b in pairs:
                self._edges.pop(tuple(sorted((a, b))), None)

        def number_of_nodes(self) -> int:
            return len(self.nodes)

        def number_of_edges(self) -> int:
            return len(self._edges)

    class _SimpleNx:
        Graph = _SimpleGraph

    nx = _SimpleNx()  # type: ignore[assignment]


ADJACENCY_RULES: Dict[str, List[str]] = {
    "kitchen": ["dining"],
    "dining": ["kitchen", "living"],
    "living": ["dining", "drawing"],
    "masterbed": ["bathroom"],
    "bathroom": ["masterbed"],
    "commonbath": ["corridor"],
    "staircase": ["living"],
    "diningstaircase": ["living"],
    "porch": ["living", "drawing"],
    "icu": ["bathroom", "living"],
    "servant": ["kitchen", "backyard"],
    "pooja": ["kitchen", "living"],
    "wash": ["kitchen", "backyard"],
    "study": ["living"],
}


ADJACENCY_FORBIDDEN: Dict[str, List[str]] = {
    "servant": ["masterbed", "bedroom"],
    "bathroom": ["kitchen", "pooja"],
    "commonbath": ["kitchen", "pooja"],
    "store": ["pooja"],
}


_ROOM_ALIAS = {
    "masterbed": "masterbed",
    "master": "masterbed",
    "bedroom": "bedroom",
    "living": "living",
    "drawing": "drawing",
    "kitchen": "kitchen",
    "dining": "dining",
    "bathroom": "bathroom",
    "commonbath": "commonbath",
    "staircase": "staircase",
    "diningstaircase": "diningstaircase",
    "icu": "icu",
    "porch": "porch",
    "lawn": "lawn",
    "verandah": "verandah",
    "backyard": "backyard",
    "balcony": "balcony",
    "terrace": "terrace",
    "study": "study",
    "pooja": "pooja",
    "servant": "servant",
    "store": "store",
    "wash": "wash",
    "utility": "utility",
    "garage": "garage",
    "corridor": "corridor",
}


_CELL_RX = re.compile(r"r(\d+)_c(\d+)$", re.IGNORECASE)


def _norm_room(room_id: str) -> str:
    key = (room_id or "").strip().lower().replace("_", "")
    return _ROOM_ALIAS.get(key, key)


def _parse_cell(cell: str) -> Optional[Tuple[int, int]]:
    m = _CELL_RX.fullmatch(str(cell).strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def _touching(cell_a: Tuple[int, int], cell_b: Tuple[int, int]) -> bool:
    # edge adjacency only (no diagonal)
    dr = abs(cell_a[0] - cell_b[0])
    dc = abs(cell_a[1] - cell_b[1])
    return (dr == 1 and dc == 0) or (dr == 0 and dc == 1)


def infer_root_room(
    survey_data: Optional[Dict[str, Any]],
    room_ids: Iterable[str],
) -> Optional[str]:
    """Root node preference: survey center_of_life -> icu -> living -> first room."""
    room_set = {_norm_room(r) for r in room_ids}
    if not room_set:
        return None
    if isinstance(survey_data, dict):
        candidates = [
            survey_data.get("center_of_life"),
            survey_data.get("centre_of_life"),
            (survey_data.get("answers") or {}).get("center_of_life") if isinstance(survey_data.get("answers"), dict) else None,
            (survey_data.get("raw_answers") or {}).get("center_of_life") if isinstance(survey_data.get("raw_answers"), dict) else None,
        ]
        for c in candidates:
            if not c:
                continue
            rid = _norm_room(str(c))
            if rid in room_set:
                return rid
    if "icu" in room_set:
        return "icu"
    if "living" in room_set:
        return "living"
    return sorted(room_set)[0]


def _cells_by_room(placements: List[Dict[str, Any]]) -> Dict[str, Set[Tuple[int, int]]]:
    out: Dict[str, Set[Tuple[int, int]]] = defaultdict(set)
    for p in placements:
        rid = _norm_room(str(p.get("roomId", "")))
        if not rid:
            continue
        for cell in p.get("cells", []) or []:
            rc = _parse_cell(cell)
            if rc:
                out[rid].add(rc)
    return out


def _is_forbidden(a: str, b: str) -> bool:
    aa = _norm_room(a)
    bb = _norm_room(b)
    return bb in ADJACENCY_FORBIDDEN.get(aa, []) or aa in ADJACENCY_FORBIDDEN.get(bb, [])


def _adjacent_by_cells(cells_a: Set[Tuple[int, int]], cells_b: Set[Tuple[int, int]]) -> bool:
    for ca in cells_a:
        for cb in cells_b:
            if _touching(ca, cb):
                return True
    return False


def build_room_adjacency_graph(
    compass_map: Dict[str, Any],
    *,
    floor_key: str = "ground_floor",
    survey_data: Optional[Dict[str, Any]] = None,
) -> nx.Graph:
    """
    Build RAG from placement cell-neighbors + default rules.
    Node attrs: label, roomId, cell_count, root (bool)
    Edge attrs: source='topology'|'rule'
    """
    floor = compass_map.get(floor_key, {}) if isinstance(compass_map.get(floor_key), dict) else {}
    placements = floor.get("placements", []) if isinstance(floor.get("placements"), list) else []
    by_room = _cells_by_room(placements)

    g = nx.Graph()
    for rid, cells in by_room.items():
        g.add_node(
            rid,
            roomId=rid,
            label=rid,
            cell_count=len(cells),
            root=False,
        )

    room_ids = sorted(by_room.keys())

    # 1) Topology edges from shared side-neighbor cells
    for i, ra in enumerate(room_ids):
        for rb in room_ids[i + 1 :]:
            if _is_forbidden(ra, rb):
                continue
            if _adjacent_by_cells(by_room[ra], by_room[rb]):
                g.add_edge(ra, rb, source="topology")

    # 2) Rule edges (if both rooms exist)
    for a, bs in ADJACENCY_RULES.items():
        aa = _norm_room(a)
        if aa not in g:
            continue
        for b in bs:
            bb = _norm_room(b)
            if bb not in g:
                continue
            if _is_forbidden(aa, bb):
                continue
            if not g.has_edge(aa, bb):
                g.add_edge(aa, bb, source="rule")

    # 3) Remove any forbidden edges defensively
    to_remove: List[Tuple[str, str]] = []
    for a, b in g.edges():
        if _is_forbidden(a, b):
            to_remove.append((a, b))
    if to_remove:
        g.remove_edges_from(to_remove)

    # 4) Mark root
    root = infer_root_room(survey_data, list(g.nodes))
    if root and root in g:
        g.nodes[root]["root"] = True
        g.graph["root"] = root
    else:
        g.graph["root"] = None

    g.graph["floor_key"] = floor_key
    g.graph["node_count"] = g.number_of_nodes()
    g.graph["edge_count"] = g.number_of_edges()
    return g
