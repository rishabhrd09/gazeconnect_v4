"""
GazeConnect Pro - PyAutoGUI Automation Module
=============================================
Enables eye-gaze control of Windows applications.

Features:
- Open applications (Chrome, Notepad, etc.)
- Control media (volume, play/pause)
- Window management
- Custom automation scripts
- Safe execution with confirmations

Usage:
    automation = GazeAutomation()
    automation.execute('open_chrome')
    automation.execute('volume_up')
"""

import time
import subprocess
import logging
from typing import Optional, Callable, Dict, List, Any
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger('GazeConnect.Automation')

# Try to import pyautogui
try:
    import pyautogui
    pyautogui.FAILSAFE = True  # Move mouse to corner to abort
    pyautogui.PAUSE = 0.1  # Small delay between actions
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    logger.warning("pyautogui not installed. Run: pip install pyautogui")
    PYAUTOGUI_AVAILABLE = False

class ActionCategory(Enum):
    """Categories of automation actions."""
    APPS = "apps"           # Open applications
    MEDIA = "media"         # Volume, play/pause
    BROWSER = "browser"     # Browser control
    WINDOW = "window"       # Window management
    SYSTEM = "system"       # System commands
    CUSTOM = "custom"       # User-defined

@dataclass
class AutomationAction:
    """Defines an automation action."""
    id: str
    name: str
    description: str
    category: ActionCategory
    icon: str  # Icon name for UI
    requires_confirmation: bool = False
    cooldown_seconds: float = 0.5

class GazeAutomation:
    """
    Eye-gaze automation controller.
    
    Provides safe, confirmed automation actions controllable via gaze.
    """
    
    def __init__(self):
        self.enabled = PYAUTOGUI_AVAILABLE
        self.last_action_time: Dict[str, float] = {}
        self.custom_scripts: Dict[str, Callable] = {}
        
        # Confirmation callback
        self.on_confirmation_needed: Optional[Callable[[AutomationAction], bool]] = None
        
        # Define built-in actions
        self._define_actions()
    
    def _define_actions(self):
        """Define all available actions."""
        self.actions: Dict[str, AutomationAction] = {
            # Apps
            'open_chrome': AutomationAction(
                id='open_chrome',
                name='Open Chrome',
                description='Opens Google Chrome browser',
                category=ActionCategory.APPS,
                icon='chrome'
            ),
            'open_notepad': AutomationAction(
                id='open_notepad',
                name='Open Notepad',
                description='Opens Windows Notepad',
                category=ActionCategory.APPS,
                icon='notepad'
            ),
            'open_calculator': AutomationAction(
                id='open_calculator',
                name='Open Calculator',
                description='Opens Windows Calculator',
                category=ActionCategory.APPS,
                icon='calculator'
            ),
            'open_explorer': AutomationAction(
                id='open_explorer',
                name='Open File Explorer',
                description='Opens Windows File Explorer',
                category=ActionCategory.APPS,
                icon='folder'
            ),
            
            # Media
            'volume_up': AutomationAction(
                id='volume_up',
                name='Volume Up',
                description='Increases system volume',
                category=ActionCategory.MEDIA,
                icon='volume_up'
            ),
            'volume_down': AutomationAction(
                id='volume_down',
                name='Volume Down',
                description='Decreases system volume',
                category=ActionCategory.MEDIA,
                icon='volume_down'
            ),
            'volume_mute': AutomationAction(
                id='volume_mute',
                name='Mute/Unmute',
                description='Toggles system mute',
                category=ActionCategory.MEDIA,
                icon='volume_mute'
            ),
            'media_play_pause': AutomationAction(
                id='media_play_pause',
                name='Play/Pause',
                description='Toggles media playback',
                category=ActionCategory.MEDIA,
                icon='play'
            ),
            'media_next': AutomationAction(
                id='media_next',
                name='Next Track',
                description='Plays next media track',
                category=ActionCategory.MEDIA,
                icon='skip_next'
            ),
            'media_previous': AutomationAction(
                id='media_previous',
                name='Previous Track',
                description='Plays previous media track',
                category=ActionCategory.MEDIA,
                icon='skip_previous'
            ),
            
            # Browser
            'browser_back': AutomationAction(
                id='browser_back',
                name='Go Back',
                description='Browser back button',
                category=ActionCategory.BROWSER,
                icon='arrow_back'
            ),
            'browser_forward': AutomationAction(
                id='browser_forward',
                name='Go Forward',
                description='Browser forward button',
                category=ActionCategory.BROWSER,
                icon='arrow_forward'
            ),
            'browser_refresh': AutomationAction(
                id='browser_refresh',
                name='Refresh',
                description='Refresh current page',
                category=ActionCategory.BROWSER,
                icon='refresh'
            ),
            'browser_home': AutomationAction(
                id='browser_home',
                name='Home',
                description='Go to browser home page',
                category=ActionCategory.BROWSER,
                icon='home'
            ),
            'open_youtube': AutomationAction(
                id='open_youtube',
                name='Open YouTube',
                description='Opens YouTube in browser',
                category=ActionCategory.BROWSER,
                icon='youtube'
            ),
            'open_google': AutomationAction(
                id='open_google',
                name='Open Google',
                description='Opens Google in browser',
                category=ActionCategory.BROWSER,
                icon='google'
            ),
            
            # Window
            'window_minimize': AutomationAction(
                id='window_minimize',
                name='Minimize Window',
                description='Minimizes current window',
                category=ActionCategory.WINDOW,
                icon='minimize'
            ),
            'window_maximize': AutomationAction(
                id='window_maximize',
                name='Maximize Window',
                description='Maximizes current window',
                category=ActionCategory.WINDOW,
                icon='maximize'
            ),
            'window_close': AutomationAction(
                id='window_close',
                name='Close Window',
                description='Closes current window',
                category=ActionCategory.WINDOW,
                icon='close',
                requires_confirmation=True
            ),
            'switch_window': AutomationAction(
                id='switch_window',
                name='Switch Window',
                description='Switch to next window (Alt+Tab)',
                category=ActionCategory.WINDOW,
                icon='swap'
            ),
            
            # System
            'screenshot': AutomationAction(
                id='screenshot',
                name='Take Screenshot',
                description='Takes a screenshot',
                category=ActionCategory.SYSTEM,
                icon='camera'
            ),
            'lock_screen': AutomationAction(
                id='lock_screen',
                name='Lock Screen',
                description='Locks the computer',
                category=ActionCategory.SYSTEM,
                icon='lock',
                requires_confirmation=True
            ),
        }
    
    def _check_cooldown(self, action_id: str, cooldown: float) -> bool:
        """Check if action is in cooldown period."""
        last_time = self.last_action_time.get(action_id, 0)
        if time.time() - last_time < cooldown:
            return False
        return True
    
    def _record_action(self, action_id: str):
        """Record action execution time."""
        self.last_action_time[action_id] = time.time()
    
    def execute(self, action_id: str, **kwargs) -> bool:
        """
        Execute an automation action.
        
        Args:
            action_id: ID of the action to execute
            **kwargs: Additional arguments for custom actions
            
        Returns:
            True if action was executed successfully
        """
        if not self.enabled:
            logger.warning("PyAutoGUI not available")
            return False
        
        # Get action definition
        action = self.actions.get(action_id)
        if not action:
            # Check custom scripts
            if action_id in self.custom_scripts:
                return self._execute_custom(action_id, **kwargs)
            logger.warning(f"Unknown action: {action_id}")
            return False
        
        # Check cooldown
        if not self._check_cooldown(action_id, action.cooldown_seconds):
            logger.debug(f"Action {action_id} in cooldown")
            return False
        
        # Check confirmation
        if action.requires_confirmation and self.on_confirmation_needed:
            if not self.on_confirmation_needed(action):
                logger.info(f"Action {action_id} cancelled by user")
                return False
        
        # Execute
        try:
            method = getattr(self, f'_action_{action_id}', None)
            if method:
                method(**kwargs)
                self._record_action(action_id)
                logger.info(f"Executed action: {action_id}")
                return True
            else:
                logger.warning(f"No implementation for action: {action_id}")
                return False
        except Exception as e:
            logger.error(f"Action {action_id} failed: {e}")
            return False
    
    def _execute_custom(self, script_id: str, **kwargs) -> bool:
        """Execute a custom script."""
        try:
            script = self.custom_scripts[script_id]
            script(**kwargs)
            self._record_action(script_id)
            logger.info(f"Executed custom script: {script_id}")
            return True
        except Exception as e:
            logger.error(f"Custom script {script_id} failed: {e}")
            return False
    
    def register_custom_script(self, script_id: str, script: Callable, 
                               name: str = None, description: str = None):
        """Register a custom automation script."""
        self.custom_scripts[script_id] = script
        self.actions[script_id] = AutomationAction(
            id=script_id,
            name=name or script_id,
            description=description or "Custom script",
            category=ActionCategory.CUSTOM,
            icon='code'
        )
    
    def get_actions_by_category(self, category: ActionCategory) -> List[AutomationAction]:
        """Get all actions in a category."""
        return [a for a in self.actions.values() if a.category == category]
    
    def get_all_actions(self) -> List[AutomationAction]:
        """Get all available actions."""
        return list(self.actions.values())
    
    # ========================================
    # ACTION IMPLEMENTATIONS
    # ========================================
    
    # Apps
    def _action_open_chrome(self, url: str = None):
        """Open Chrome browser."""
        if url:
            subprocess.Popen(['start', 'chrome', url], shell=True)
        else:
            subprocess.Popen(['start', 'chrome'], shell=True)
    
    def _action_open_notepad(self):
        """Open Notepad."""
        subprocess.Popen(['notepad.exe'])
    
    def _action_open_calculator(self):
        """Open Calculator."""
        subprocess.Popen(['calc.exe'])
    
    def _action_open_explorer(self):
        """Open File Explorer."""
        subprocess.Popen(['explorer.exe'])
    
    # Media
    def _action_volume_up(self):
        """Increase volume."""
        pyautogui.press('volumeup')
    
    def _action_volume_down(self):
        """Decrease volume."""
        pyautogui.press('volumedown')
    
    def _action_volume_mute(self):
        """Toggle mute."""
        pyautogui.press('volumemute')
    
    def _action_media_play_pause(self):
        """Toggle play/pause."""
        pyautogui.press('playpause')
    
    def _action_media_next(self):
        """Next track."""
        pyautogui.press('nexttrack')
    
    def _action_media_previous(self):
        """Previous track."""
        pyautogui.press('prevtrack')
    
    # Browser
    def _action_browser_back(self):
        """Browser back."""
        pyautogui.hotkey('alt', 'left')
    
    def _action_browser_forward(self):
        """Browser forward."""
        pyautogui.hotkey('alt', 'right')
    
    def _action_browser_refresh(self):
        """Refresh page."""
        pyautogui.press('f5')
    
    def _action_browser_home(self):
        """Browser home."""
        pyautogui.hotkey('alt', 'home')
    
    def _action_open_youtube(self):
        """Open YouTube."""
        self._action_open_chrome('https://www.youtube.com')
    
    def _action_open_google(self):
        """Open Google."""
        self._action_open_chrome('https://www.google.com')
    
    # Window
    def _action_window_minimize(self):
        """Minimize window."""
        pyautogui.hotkey('win', 'down')
    
    def _action_window_maximize(self):
        """Maximize window."""
        pyautogui.hotkey('win', 'up')
    
    def _action_window_close(self):
        """Close window."""
        pyautogui.hotkey('alt', 'f4')
    
    def _action_switch_window(self):
        """Switch window."""
        pyautogui.hotkey('alt', 'tab')
    
    # System
    def _action_screenshot(self):
        """Take screenshot."""
        pyautogui.hotkey('win', 'shift', 's')
    
    def _action_lock_screen(self):
        """Lock screen."""
        pyautogui.hotkey('win', 'l')
    
    # Utility methods for click automation
    def click_at(self, x: int, y: int):
        """Click at screen position."""
        if self.enabled:
            pyautogui.click(x, y)
    
    def double_click_at(self, x: int, y: int):
        """Double-click at screen position."""
        if self.enabled:
            pyautogui.doubleClick(x, y)
    
    def right_click_at(self, x: int, y: int):
        """Right-click at screen position."""
        if self.enabled:
            pyautogui.rightClick(x, y)
    
    def scroll(self, clicks: int, x: int = None, y: int = None):
        """Scroll at position."""
        if self.enabled:
            pyautogui.scroll(clicks, x, y)
    
    def type_text(self, text: str, interval: float = 0.05):
        """Type text."""
        if self.enabled:
            pyautogui.typewrite(text, interval=interval)
    
    def press_key(self, key: str):
        """Press a key."""
        if self.enabled:
            pyautogui.press(key)
    
    def hotkey(self, *keys):
        """Press hotkey combination."""
        if self.enabled:
            pyautogui.hotkey(*keys)

# Singleton instance
_automation_instance: Optional[GazeAutomation] = None

def get_automation() -> GazeAutomation:
    """Get the automation singleton."""
    global _automation_instance
    if _automation_instance is None:
        _automation_instance = GazeAutomation()
    return _automation_instance

# ============================================
# EXPORTS
# ============================================

__all__ = [
    'GazeAutomation',
    'AutomationAction',
    'ActionCategory',
    'get_automation',
]
