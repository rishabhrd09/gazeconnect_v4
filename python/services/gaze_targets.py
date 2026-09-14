"""Renderer-provided gaze rectangles. Selection and dwell clocks live in React.

This registry contains no selector, duration overrides, confidence acceleration,
progress banking or click callbacks. Its bounded screen maps support only cursor
assistance and target identity telemetry.
"""
from collections import OrderedDict
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List


class ButtonSize(Enum):
    XS = 'xs'
    SM = 'sm'
    MD = 'md'
    LG = 'lg'
    XL = 'xl'
    XXL = 'xxl'


@dataclass
class GazeTarget:
    id: str
    x: float
    y: float
    width: float
    height: float
    size: ButtonSize = ButtonSize.MD
    context: str = 'navigation'
    priority: int = 0
    enabled: bool = True


@dataclass
class ScreenTargets:
    targets: Dict[str, GazeTarget] = field(default_factory=dict)


class TargetRegistry:
    MAX_SCREENS = 32
    MAX_TARGETS_PER_SCREEN = 2048

    def __init__(self):
        self.current_screen = 'home'
        self.screens = OrderedDict({'home': ScreenTargets()})

    def set_screen(self, screen: str):
        self.current_screen = screen
        if screen not in self.screens:
            self.screens[screen] = ScreenTargets()
        self.screens.move_to_end(screen)
        while len(self.screens) > self.MAX_SCREENS:
            self.screens.popitem(last=False)

    def set_targets(self, targets: List[GazeTarget]):
        self.set_screen(self.current_screen)
        self.screens[self.current_screen].targets = {
            target.id: target for target in targets[:self.MAX_TARGETS_PER_SCREEN]
        }
