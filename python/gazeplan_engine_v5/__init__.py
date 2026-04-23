"""
GazePlan Pro v5 package.

Additive AI layout pipeline for floor plans.
Existing v4 generation flow remains untouched.
"""

from .nbc_standards import (  # noqa: F401
    ACCESSIBILITY_CONSTRAINTS,
    NBC_2016_MINIMUMS,
    NBC_ROOM_MAPPING,
    SETBACK_DEFAULTS,
    VENTILATION_DEFAULT_CLIMATE,
    get_nbc_min_area,
    get_nbc_requirements,
    validate_feasibility,
)
from .vastu_scoring import (  # noqa: F401
    VASTU_BOOLEAN_RULES,
    VASTU_SCORES,
    VASTU_WEIGHTS,
    compute_vastu_score,
    get_vastu_zone,
    score_layout_with_booleans,
)
from .room_adjacency_graph import (  # noqa: F401
    ADJACENCY_FORBIDDEN,
    ADJACENCY_RULES,
    build_room_adjacency_graph,
    infer_root_room,
)
from .engine import GazePlanV5Engine, generate_floorplan_v5  # noqa: F401
