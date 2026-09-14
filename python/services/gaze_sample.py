"""Hardware-neutral measurement passed from acquisition to the gaze pipeline."""
from dataclasses import dataclass
import math


@dataclass
class GazePoint:
    x: float
    y: float
    timestamp: float  # Acquisition epoch seconds; device-relative time is metadata.
    left_valid: bool = True
    right_valid: bool = True
    confidence: float = 1.0
    validity_source: str = 'reported'

    @property
    def is_valid(self) -> bool:
        return ((self.left_valid is True or self.right_valid is True)
                and all(math.isfinite(v) for v in (self.x, self.y, self.timestamp, self.confidence))
                and self.confidence > 0.5)
