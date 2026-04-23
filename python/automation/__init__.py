"""
GazeConnect Pro - Automation Module
===================================
PyAutoGUI-based Windows automation.
"""

from .automation import (
    GazeAutomation,
    AutomationAction,
    ActionCategory,
    get_automation,
)

__all__ = [
    'GazeAutomation',
    'AutomationAction',
    'ActionCategory',
    'get_automation',
]
