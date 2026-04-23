"""
GazeConnect Pro - Ultimate Backend Server
=========================================
Complete Python backend orchestrating all services.

Components:
- WebSocket server for Electron communication
- Tobii Eye Tracker 5 integration (133Hz)
- One Euro Filter for gaze stabilization
- Adaptive dwell detection
- Word prediction engine
- Fatigue monitoring
- Text-to-speech
- PyAutoGUI automation
- Session logging

Architecture:
    Electron (React) <--> WebSocket <--> Python Backend <--> Tobii SDK
"""

import asyncio
import datetime
import json
import time
import math
import logging
import re
import uuid
import hashlib
from dataclasses import dataclass, asdict
from typing import Optional, Dict, List, Set, Any
from pathlib import Path
from collections import deque

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('GazeConnect')
# Suppress noisy transient handshake traces from half-open/aborted WS probes.
logging.getLogger('websockets.server').setLevel(logging.CRITICAL)
logging.getLogger('websockets.asyncio.server').setLevel(logging.CRITICAL)

# ============================================
# IMPORTS
# ============================================

try:
    import websockets
    import websockets.server
    # Use the correct import depending on websockets version
    try:
        from websockets.asyncio.server import ServerConnection as WebSocketServerProtocol
    except ImportError:
        from websockets.server import WebSocketServerProtocol
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    logger.warning("websockets not installed. Run: pip install websockets")
    WEBSOCKETS_AVAILABLE = False
    WebSocketServerProtocol = None

try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    logger.warning("pyttsx3 not installed. Run: pip install pyttsx3")
    TTS_AVAILABLE = False

# Our services
from services.one_euro_filter import (
    GazeFilter2D, FilterConfig, FilterPreset, GazePoint, FixationStabilizer,
    GravityWell, AntiRecoilFilter, AdaptiveKalmanFilter, OptiKeyGazeFilter
)
from services.gaze_classifier import GazeClassifier, GazeState, ScreenParams
from services.signal_conditioner import SignalConditioner, GazeValidity
from services.calibration import (
    CalibrationSession, CalibrationStorage, GazeCalibrationCorrector
)
from services.dwell_detector import (
    DwellManager, DwellTarget, ButtonSize, DwellState
)
from services.word_prediction import (
    WordPredictionEngine, AAC_PHRASES, ABBREVIATIONS
)
from services.sentence_prediction import SentencePredictor
from prediction_guardrails import (
    contains_blocked_prediction_word,
    is_blocked_prediction_word,
    tokenize_prediction_text,
)
import threading
from services.fatigue_monitor import (
    FatigueDetector, BreakReminderManager, DryEyeMonitor, FatigueLevel
)

# Web Hub services (additive â€” no impact on gaze pipeline)
try:
    from services.news_service import NewsService
    NEWS_AVAILABLE = True
except ImportError:
    logger.warning("news_service not available (missing aiohttp?)")
    NEWS_AVAILABLE = False
    NewsService = None

try:
    from services.knowledge_service import KnowledgeService
    KNOWLEDGE_AVAILABLE = True
except ImportError:
    logger.warning("knowledge_service not available")
    KNOWLEDGE_AVAILABLE = False
    KnowledgeService = None

try:
    from services.article_service import ArticleService
    ARTICLE_AVAILABLE = True
except ImportError:
    logger.warning("article_service not available")
    ARTICLE_AVAILABLE = False
    ArticleService = None

try:
    from services.quick_data_service import QuickDataService
    QUICK_DATA_AVAILABLE = True
except ImportError:
    logger.warning("quick_data_service not available")
    QUICK_DATA_AVAILABLE = False
    QuickDataService = None

# Datamuse API — optional, for smart online suggestions
try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False


# ============================================
# DATAMUSE CACHE — In-memory LRU with TTL
# ============================================

class DatamuseCache:
    """In-memory LRU cache for Datamuse API responses."""

    def __init__(self, max_size: int = 500, ttl_seconds: int = 3600):
        self._cache: Dict[str, Any] = {}  # word -> (timestamp, results)
        self._max_size = max_size
        self._ttl = ttl_seconds

    def get(self, word: str) -> Optional[List[Dict]]:
        entry = self._cache.get(word)
        if entry is None:
            return None
        ts, results = entry
        if time.time() - ts > self._ttl:
            del self._cache[word]
            return None
        return results

    def put(self, word: str, results: List[Dict]):
        # Evict oldest entries if at capacity
        if len(self._cache) >= self._max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][0])
            del self._cache[oldest_key]
        self._cache[word] = (time.time(), results)


class SessionTopicTracker:
    """Tracks recent conversation topics and exposes lightweight score boosts."""

    HALF_LIFE_SECONDS = 15 * 60

    def __init__(self, max_sentences: int = 8):
        self._recent_sentences: deque = deque(maxlen=max_sentences)
        self._topic_keywords = self._build_topic_keywords()

    def _normalize_topic(self, category: Optional[str]) -> Optional[str]:
        if not category:
            return None
        mapping = {
            'basic': 'basic',
            'basic_needs': 'basic',
            'medical': 'medical',
            'position': 'comfort',
            'comfort': 'comfort',
            'caregiver': 'comfort',
            'feelings': 'emotion',
            'emotion': 'emotion',
            'social': 'greet',
            'communication': 'greet',
            'greet': 'greet',
            'emergency': 'emergency',
            'family': 'family',
        }
        return mapping.get(category)

    def _build_topic_keywords(self) -> Dict[str, Set[str]]:
        topic_keywords: Dict[str, Set[str]] = {
            'basic': set(),
            'medical': set(),
            'comfort': set(),
            'family': set(),
            'emotion': set(),
            'greet': set(),
            'emergency': set(),
        }

        for category, phrases in AAC_PHRASES.items():
            normalized = self._normalize_topic(category)
            if not normalized:
                continue
            for phrase in phrases:
                topic_keywords[normalized].update(
                    re.findall(r'[a-zA-Z\u0900-\u097F]+', phrase.lower())
                )

        topic_keywords['family'].update({
            'family', 'mother', 'father', 'mom', 'dad', 'mummy', 'papa',
            'son', 'daughter', 'brother', 'sister', 'wife', 'husband',
            'bhaiya', 'didi', 'home',
        })
        topic_keywords['medical'].update({
            'pain', 'medicine', 'doctor', 'nurse', 'oxygen', 'suction',
            'breathing', 'swallowing', 'dard', 'dawai', 'bipap',
        })
        topic_keywords['comfort'].update({
            'pillow', 'blanket', 'position', 'turn', 'left', 'right',
            'bed', 'support', 'fan', 'light', 'karvat', 'aaram',
        })
        topic_keywords['basic'].update({
            'water', 'food', 'bathroom', 'toilet', 'sleep', 'rest',
            'hungry', 'thirsty', 'tea', 'pani', 'paani', 'khana', 'neend',
        })
        topic_keywords['emotion'].update({
            'happy', 'sad', 'worried', 'scared', 'frustrated',
            'hopeful', 'love', 'miss', 'khush',
        })
        topic_keywords['greet'].update({
            'hello', 'hi', 'good', 'morning', 'night', 'evening',
            'thank', 'thanks', 'please', 'namaste', 'bye',
        })
        topic_keywords['emergency'].update({
            'help', 'urgent', 'emergency', 'immediately', 'ambulance',
            'breathe', 'breathing', 'doctor', 'suction', 'jaldi', 'abhi',
        })
        return topic_keywords

    def _accumulate_topic_scores(self, text: str, scores: Dict[str, float], weight: float):
        if not text or weight <= 0:
            return
        tokens = set(re.findall(r'[a-zA-Z\u0900-\u097F]+', text.lower()))
        if not tokens:
            return
        for topic, keywords in self._topic_keywords.items():
            overlap = len(tokens & keywords)
            if overlap <= 0:
                continue
            match_strength = min(1.0, 0.45 + 0.25 * overlap)
            scores[topic] = scores.get(topic, 0.0) + (weight * match_strength)

    def record(self, sentence: str):
        text = sentence.strip()
        if len(text) < 2:
            return
        self._recent_sentences.append({
            'text': text,
            'timestamp': time.time(),
        })

    def get_boosts(self, current_text: str = '') -> Dict[str, float]:
        scores: Dict[str, float] = {}
        now = time.time()

        for idx, item in enumerate(reversed(self._recent_sentences)):
            age = max(0.0, now - float(item.get('timestamp', now)))
            recency = math.exp(-0.693 * age / self.HALF_LIFE_SECONDS)
            position_decay = 0.78 ** idx
            self._accumulate_topic_scores(
                str(item.get('text', '')),
                scores,
                recency * position_decay,
            )

        self._accumulate_topic_scores(current_text, scores, 0.65)

        if not scores:
            return {}

        top_score = max(scores.values())
        if top_score <= 0:
            return {}

        return {
            topic: round(min(1.0, score / top_score), 3)
            for topic, score in scores.items()
            if score >= max(0.35, top_score * 0.4)
        }


# ============================================
# CONFIGURATION
# ============================================

@dataclass
class ServerConfig:
    """Server configuration."""
    websocket_host: str = 'localhost'
    websocket_port: int = 8765
    tobii_enabled: bool = True
    tobii_simulated: bool = False  # For testing without hardware
    tts_enabled: bool = True
    data_dir: str = './data'
    survey_data_dir: str = './survey_data'
    log_sessions: bool = True
    survey_min_save_interval_ms: int = 4000
    survey_min_snapshot_interval_ms: int = 30000
    survey_session_file_limit: int = 120
    survey_snapshot_file_limit: int = 3
    survey_keep_sessions: int = 2
    survey_summary_write_interval_ms: int = 20000
    survey_index_write_interval_ms: int = 5000
    spoken_log_retention_days: int = 0
    spoken_log_max_files: int = 0
    retain_spoken_logs: bool = False
    keyboard_chat_keep_files: int = 5
    enable_datamuse: bool = False

# ============================================
# PORT UTILITIES
# ============================================

def find_available_port(preferred: int, max_attempts: int = 10) -> int:
    """Find an available port starting from the preferred port."""
    import socket
    for offset in range(max_attempts):
        port = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('localhost', port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No available port found near {preferred}")

# ============================================
# TOBII INTEGRATION (via TobiiHelper .NET)
# ============================================

class TobiiReceiver:
    """
    Handles Tobii Eye Tracker 5 data reception.

    IMPORTANT: Eye Tracker 5 (consumer) requires TobiiHelper.exe (.NET)
    which connects to the device via Stream Engine SDK and sends data
    to this Python backend via TCP socket on port 5555.

    Architecture:
    TobiiHelper.exe (.NET) --[TCP:5555]--> Python Backend --[WS:8765]--> Electron

    Supports:
    - Real hardware via TobiiHelper connection
    - Simulation mode for testing without hardware
    """

    def __init__(self, simulated: bool = False, helper_host: str = '127.0.0.1', helper_port: int = 5555):
        self.simulated = simulated
        self.helper_host = helper_host
        self.helper_port = helper_port
        self.is_connected = False
        self.last_gaze: Optional[GazePoint] = None

        # Connection
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._receive_task: Optional[asyncio.Task] = None

        # Device info (from TobiiHelper)
        self.device_name = ""
        self.serial_number = ""
        self.sampling_rate = 133

        # Callbacks
        self.on_gaze: Optional[callable] = None
        self.on_status: Optional[callable] = None
        self.on_presence: Optional[callable] = None

        # Simulation
        self._sim_task: Optional[asyncio.Task] = None

    async def connect(self) -> bool:
        """Connect to TobiiHelper or start simulation."""
        if self.simulated:
            logger.info("Starting Tobii simulation mode (no hardware)")
            self.is_connected = True
            self._sim_task = asyncio.create_task(self._simulate_gaze())
            return True

        # Connect to TobiiHelper.exe via TCP
        logger.info(f"Connecting to TobiiHelper at {self.helper_host}:{self.helper_port}...")

        retry_count = 0
        max_retries = 10

        while retry_count < max_retries:
            try:
                self._reader, self._writer = await asyncio.wait_for(
                    asyncio.open_connection(self.helper_host, self.helper_port),
                    timeout=2.0
                )

                self.is_connected = True
                logger.info("Connected to TobiiHelper")

                # Start receiving data
                self._receive_task = asyncio.create_task(self._receive_loop())
                return True

            except (ConnectionRefusedError, asyncio.TimeoutError):
                retry_count += 1
                logger.warning(f"TobiiHelper not ready, retrying... ({retry_count}/{max_retries})")
                logger.info("Make sure TobiiHelper.exe is running")
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Connection error: {e}")
                retry_count += 1
                await asyncio.sleep(1)

        logger.error("Failed to connect to TobiiHelper")
        logger.info("Please ensure TobiiHelper.exe is running:")
        logger.info("  cd TobiiHelper && dotnet run")
        logger.info("Or run with --simulate for testing without hardware")
        return False

    async def _receive_loop(self):
        """Receive gaze data from TobiiHelper."""
        buffer = ""

        while self.is_connected and self._reader:
            try:
                data = await self._reader.read(4096)
                if not data:
                    logger.warning("TobiiHelper connection closed")
                    self.is_connected = False
                    break

                buffer += data.decode('utf-8')

                # Process newline-delimited JSON messages
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    if line.strip():
                        await self._process_message(line)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Receive error: {e}")
                await asyncio.sleep(0.1)

        # Attempt reconnection
        if not self.is_connected:
            asyncio.create_task(self._reconnect())

    async def _process_message(self, message: str):
        """Process a JSON message from TobiiHelper."""
        try:
            data = json.loads(message)
            msg_type = data.get('type', '')

            if msg_type == 'gaze':
                # Convert to GazePoint
                # Fix: Look for 'x'/'y' first (sent by C# helper), then fallback to 'combined_x'
                p_x = data.get('x')
                if p_x is None: p_x = data.get('combined_x', 0.5)

                p_y = data.get('y')
                if p_y is None: p_y = data.get('combined_y', 0.5)

                # Tobii Eye Tracker 5 range expansion
                # The sensor's usable tracking range is ~0.03-0.97 on each axis.
                # Even with good calibration, values at screen edges don't reach 0.0/1.0.
                # Remap [MARGIN, 1-MARGIN] â†’ [0, 1] so cursor can reach ALL screen corners.
                # 0.05 = 5% per side â€” aggressive but safe (clamped to [0,1])
                TOBII_MARGIN_X = 0.025
                TOBII_MARGIN_Y = 0.035
                p_x = max(0.0, min(1.0, (float(p_x) - TOBII_MARGIN_X) / (1.0 - 2 * TOBII_MARGIN_X)))
                p_y = max(0.0, min(1.0, (float(p_y) - TOBII_MARGIN_Y) / (1.0 - 2 * TOBII_MARGIN_Y)))

                # Fix timestamp normalization
                # TobiiHelper sends wallClockMs (milliseconds since epoch, ~1.739e12)
                # Old code divided by 1e6 (treating as microseconds) â€” made dt 1000x too small
                # This broke the One Euro Filter: dx/dt became huge -> alpha~1.0 -> no filtering
                raw_ts = data.get('timestamp', None)
                if raw_ts is not None:
                    raw_ts_f = float(raw_ts)
                    if raw_ts_f > 1e15:
                        ts_seconds = raw_ts_f / 1e9       # nanoseconds -> seconds
                    elif raw_ts_f > 1e12:
                        ts_seconds = raw_ts_f / 1e3       # milliseconds -> seconds (TobiiHelper sends this)
                    elif raw_ts_f > 1e9:
                        ts_seconds = raw_ts_f             # already seconds
                    else:
                        ts_seconds = time.time()
                else:
                    ts_seconds = time.time()

                point = GazePoint(
                    x=p_x,
                    y=p_y,
                    timestamp=ts_seconds,
                    left_valid=data.get('left_valid', data.get('left', {}).get('valid', True)),
                    right_valid=data.get('right_valid', data.get('right', {}).get('valid', True)),
                    confidence=data.get('confidence', 1.0)
                )

                self.last_gaze = point

                if self.on_gaze:
                    self.on_gaze(point)

                # Debug log every 60 frames (~0.5s)
                if not hasattr(self, '_log_counter'): self._log_counter = 0
                self._log_counter += 1
                if self._log_counter % 60 == 0:
                    logger.info(f"Gaze input: ({point.x:.3f}, {point.y:.3f})")

            elif msg_type == 'status':
                self.device_name = data.get('device_name', '')
                self.serial_number = data.get('serial_number', '')
                self.sampling_rate = data.get('sampling_rate', 133)
                logger.info(f"Tobii device: {self.device_name} (S/N: {self.serial_number})")

                if self.on_status:
                    self.on_status(data)

            elif msg_type == 'presence':
                if self.on_presence:
                    self.on_presence(data.get('is_present', True))

        except json.JSONDecodeError as e:
            logger.debug(f"Invalid JSON from TobiiHelper: {e}")
        except Exception as e:
            logger.error(f"Message processing error: {e}")

    async def _reconnect(self):
        """Attempt to reconnect to TobiiHelper."""
        logger.info("Attempting to reconnect to TobiiHelper...")
        await asyncio.sleep(2)

        if not self.simulated:
            await self.connect()

    def disconnect(self):
        """Disconnect from TobiiHelper."""
        if self._sim_task:
            self._sim_task.cancel()
            self._sim_task = None

        if self._receive_task:
            self._receive_task.cancel()
            self._receive_task = None

        if self._writer:
            try:
                self._writer.close()
            except:
                pass
            self._writer = None
            self._reader = None

        self.is_connected = False
        logger.info("Disconnected from TobiiHelper")

    async def _simulate_gaze(self):
        """
        Simulate gaze data using Mouse Position.
        This allows testing the full pipeline (dwell, prediction) without hardware.
        """
        import pyautogui

        # Fail-safe to prevent mouse lock-in (drag mouse to corner to break)
        pyautogui.FAILSAFE = False

        # Get screen size once
        screen_w, screen_h = pyautogui.size()
        logger.info(f"Simulation Mode: Using Mouse as Gaze Input ({screen_w}x{screen_h})")
        logger.info("Move your mouse to control the 'eye gaze'!")

        while True:
            try:
                # Get current mouse position
                x, y = pyautogui.position()

                # Normalize to 0.0 - 1.0 (Tobii format)
                norm_x = x / screen_w
                norm_y = y / screen_h

                # Create GazePoint
                point = GazePoint(
                    x=norm_x,
                    y=norm_y,
                    timestamp=time.time(),
                    left_valid=True,
                    right_valid=True,
                    confidence=1.0 # High confidence for mouse
                )

                self.last_gaze = point

                if self.on_gaze:
                    self.on_gaze(point)

                # 60Hz update rate is sufficient for mouse simulation
                await asyncio.sleep(1/60)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Simulation error: {e}")
                await asyncio.sleep(0.1)

# ============================================
# TEXT-TO-SPEECH
# ============================================

class TTSEngine:
    """Text-to-speech engine."""

    def __init__(self, enabled: bool = True):
        self.engine = None
        self.is_speaking = False
        self.enabled = enabled

        if not self.enabled:
            return

        if TTS_AVAILABLE:
            try:
                self.engine = pyttsx3.init()
                self.engine.setProperty('rate', 150)
                self.engine.setProperty('volume', 1.0)

                # Get available voices
                voices = self.engine.getProperty('voices')
                if voices:
                    # Prefer female voice if available
                    for voice in voices:
                        if 'female' in voice.name.lower():
                            self.engine.setProperty('voice', voice.id)
                            break

                logger.info("TTS engine initialized")
            except Exception as e:
                logger.error(f"TTS initialization error: {e}")
                self.engine = None

    def speak(self, text: str):
        """Speak text."""
        if not self.engine:
            logger.warning(f"TTS not available. Would speak: {text}")
            return

        try:
            self.is_speaking = True
            self.engine.say(text)
            self.engine.runAndWait()
            self.is_speaking = False
        except Exception as e:
            logger.error(f"TTS error: {e}")
            self.is_speaking = False

    def stop(self):
        """Stop speaking."""
        if self.engine:
            try:
                self.engine.stop()
            except:
                pass
        self.is_speaking = False

    def set_rate(self, rate: int):
        """Set speech rate (words per minute)."""
        if self.engine:
            self.engine.setProperty('rate', rate)

    def set_volume(self, volume: float):
        """Set volume (0.0 to 1.0)."""
        if self.engine:
            self.engine.setProperty('volume', max(0.0, min(1.0, volume)))

# ============================================
# SESSION LOGGER
# ============================================

class SessionLogger:
    """Logs all user activity for analysis and auto-save."""

    MAX_IN_MEMORY_ENTRIES = 2000

    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # Create session file
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        self.session_file = self.data_dir / f'session_{timestamp}.log'
        self.visible_text_file = self.data_dir / f'text_{timestamp}.txt'

        self.current_text = ""
        # Keep a bounded in-memory ring buffer; full data is still persisted to file.
        self.entries = deque(maxlen=self.MAX_IN_MEMORY_ENTRIES)

    def log(self, event_type: str, data: Any = None):
        """Log an event."""
        entry = {
            'timestamp': time.time(),
            'time_str': time.strftime('%H:%M:%S'),
            'type': event_type,
            'data': data
        }
        self.entries.append(entry)

        # Append to log file
        with open(self.session_file, 'a') as f:
            f.write(json.dumps(entry) + '\n')

    def update_text(self, text: str):
        """Update the visible text and save."""
        self.current_text = text
        with open(self.visible_text_file, 'w') as f:
            f.write(text)
        self.log('text_update', {'text': text})

    def log_selection(self, target_id: str):
        """Log a button selection."""
        self.log('selection', {'target_id': target_id})

    def log_speak(self, text: str):
        """Log TTS output."""
        self.log('speak', {'text': text})

    def log_phrase(self, phrase: str, category: str):
        """Log phrase selection."""
        self.log('phrase', {'phrase': phrase, 'category': category})

# ============================================
# MAIN APPLICATION
# ============================================

class GazeConnectBackend:
    """
    Main backend application orchestrating all services.
    """
    POINT_TTL_SECONDS = 0.150
    FRAME_GAP_HOLD_SECONDS = 0.150
    BACKEND_DWELL_ENABLED = False
    ENABLE_STALE_BLINK_DWELL_GUARD = True
    DWELL_GUARD_ALLOWED_STATES = (GazeValidity.VALID,)
    ENABLE_CLASSIFIER_SCREEN_BASIS = True
    ENABLE_DUAL_PULL_COORDINATION_SIGNAL = True
    ENABLE_ZONE_LOCK_SEMANTICS = True
    LOCK_ZONES = ('lock', 'fixation-hold', 'edge-hold')
    ENABLE_ON_KEY_TARGET_HYSTERESIS = True
    ON_KEY_HOLD_SECONDS = 0.120
    ENABLE_MAGNET_STICKY_HANDOFF = True
    MAGNET_HANDOFF_BIAS_PX = 8.0   # v15: reduced from 14 — faster key-to-key handoff on keyboard

    def __init__(self, config: Optional[ServerConfig] = None):
        self.config = config or ServerConfig()
        self._active_session_id = self._generate_session_id()
        self._session_save_seq = 0
        self._last_survey_fingerprint = ''
        self._last_snapshot_fingerprint = ''
        self._last_survey_write_at = 0.0
        self._last_snapshot_write_at = 0.0
        self._last_summary_write_at = 0.0
        self._last_index_write_at = 0.0
        self._last_survey_prune_at = 0.0
        self._last_spoken_prune_at = 0.0

        # Core services
        self.tobii = TobiiReceiver(simulated=self.config.tobii_simulated)

        # OptiKey-style pipeline (v9): Kalman â†’ 4-zone GazeFilter
        # Replaces: One Euro â†’ AntiRecoil â†’ GravityWell
        # v12: Full pipeline with state-adaptive filtering
        self.signal_conditioner = SignalConditioner()
        self.calibration_corrector = GazeCalibrationCorrector()
        self.calibration_session: Optional[CalibrationSession] = None
        self.calibration_active = False
        self.gaze_classifier = GazeClassifier()
        self.kalman_filter = AdaptiveKalmanFilter(smoothing_level=1)
        self.optikey_gaze_filter = OptiKeyGazeFilter(damping_level=0.4)

        # Legacy pipeline (kept as fallback, not used in main path)
        self.gaze_filter = GazeFilter2D(FilterConfig.from_preset(FilterPreset.BALANCED))
        self.anti_recoil = AntiRecoilFilter()
        self.gravity_well = GravityWell()
        self.RAW_MODE = False
        self.USE_OPTIKEY_PIPELINE = True  # Set False to revert to legacy pipeline
        self.dwell_manager = DwellManager()
        self.prediction = WordPredictionEngine()
        self.sentence_predictor = SentencePredictor(
            data_dir=Path(self.config.data_dir) / 'patient_data'
        )
        self._session_topics = SessionTopicTracker()
        self._last_learned_sentence = ''
        self._last_learned_sentence_at = 0.0
        self._last_prediction_save = time.time()
        self._datamuse_cache = DatamuseCache()
        self.fatigue = FatigueDetector()
        self.breaks = BreakReminderManager()
        self.dry_eye = DryEyeMonitor()
        self.tts = TTSEngine(enabled=self.config.tts_enabled)
        self.logger = SessionLogger(self.config.data_dir) if self.config.log_sessions else None

        # Web Hub services (additive â€” no impact on gaze pipeline)
        self.news = NewsService() if NEWS_AVAILABLE and NewsService else None
        self.knowledge = KnowledgeService(data_dir=self.config.data_dir) if KNOWLEDGE_AVAILABLE and KnowledgeService else None
        self.article_reader = ArticleService() if ARTICLE_AVAILABLE and ArticleService else None
        self.quick_data = QuickDataService() if QUICK_DATA_AVAILABLE and QuickDataService else None

        # State
        self.gaze_enabled = False  # v10.2b: Start OFF â€” user enables via ENABLEGAZE dwell
        self._sticky_magnet_target = None  # v12: sticky magnetism prevents oscillation
        self._on_key_last_true = 0         # v12: on_key temporal debounce timestamp
        self._on_key_target_id = None
        self.current_screen = 'home'
        self.connected_clients: Set[WebSocketServerProtocol] = set()
        self.current_text = ""

        # Screen dimensions (will be set by client)
        self.screen_width = 1920
        self.screen_height = 1080
        # v8: Physical screen info for coordinate remapping
        self.physical_width = 1920   # CSS screen width (window.screen.width)
        self.physical_height = 1080  # CSS screen height (window.screen.height)
        self.dpr = 1.0               # Device pixel ratio
        self.window_x = 0            # Window outer X on screen (CSS pixels)
        self.window_y = 0            # Window outer Y on screen (CSS pixels)
        self._gaze_offset_x = 0     # Manual gaze X offset in CSS pixels (from Settings)
        self._gaze_offset_y = 0     # Manual gaze Y offset in CSS pixels (from Settings)
        self._content_chrome = 0     # v13: chrome height in CSS px (title bar + taskbar)
        self._last_gaze_payload: Optional[Dict[str, Any]] = None

        # Setup callbacks
        self._setup_callbacks()
        self._load_calibration_profile()

    def _setup_callbacks(self):
        """Setup internal callbacks."""
        # Tobii gaze callback
        self.tobii.on_gaze = self._on_gaze_data

        # Dwell callbacks
        for screen in self.dwell_manager.detectors:
            detector = self.dwell_manager.detectors[screen]
            detector.on_dwell_start = lambda t: self._broadcast('dwell_start', {'target_id': t.id})
            detector.on_dwell_progress = lambda t, p, e: self._broadcast('dwell_progress', {
                'target_id': t.id, 'progress': p, 'elapsed_ms': e
            })
            detector.on_dwell_complete = self._on_dwell_complete
            detector.on_dwell_cancel = lambda t: self._broadcast('dwell_cancel', {'target_id': t.id})

        # Break callbacks
        self.breaks.on_warning = lambda: self._broadcast('break_warning', {
            'seconds_until_break': self.breaks.get_time_until_break()
        })
        self.breaks.on_break_needed = lambda: self._broadcast('break_needed', {
            'message': "Time for a 20-second break. Look at something 20 feet away."
        })

    def _load_calibration_profile(self):
        """Load persisted calibration profile, if present."""
        try:
            profile = CalibrationStorage.load()
            if profile and profile.is_valid:
                self.calibration_corrector.load_profile(profile)
            else:
                logger.info("[CALIB] No valid saved profile found")
        except Exception as e:
            logger.warning(f"[CALIB] Failed to load profile: {e}")

    def _start_calibration(self):
        """Start 9-point in-app calibration session."""
        if self.calibration_active:
            return

        self.calibration_session = CalibrationSession(
            screen_width=int(self.screen_width),
            screen_height=int(self.screen_height),
            num_points=9,
        )

        session = self.calibration_session

        session.on_target_show = (
            lambda index, x, y, total: self._broadcast(
                'calibration_target',
                {'index': index, 'x': x, 'y': y, 'total': total}
            )
        )
        session.on_collection_start = (
            lambda index: self._broadcast('calibration_collecting', {'index': index})
        )
        session.on_collection_progress = (
            lambda index, progress: self._broadcast(
                'calibration_progress', {'index': index, 'progress': progress}
            )
        )
        session.on_point_complete = (
            lambda index, accuracy_px: self._broadcast(
                'calibration_point_complete',
                {'index': index, 'accuracy_px': accuracy_px}
            )
        )
        session.on_validation_start = (
            lambda x, y: self._broadcast('calibration_validation', {'x': x, 'y': y})
        )

        def _on_complete(profile):
            try:
                CalibrationStorage.save(profile)
            except Exception as e:
                logger.warning(f"[CALIB] Failed to persist profile: {e}")
            self.calibration_corrector.load_profile(profile)
            self.calibration_active = False
            self._broadcast('calibration_complete', {
                'is_valid': profile.is_valid,
                'improvement_pct': profile.mean_improvement_pct,
                'validation_error_px': profile.validation_error_px,
                'pre_correction_error_px': profile.pre_correction_error_px,
                'post_correction_error_px': profile.post_correction_error_px,
                'point_results': [
                    {
                        'target': [p.target_x, p.target_y],
                        'offset': [p.offset_x, p.offset_y],
                        'accuracy_px': p.accuracy_px,
                    }
                    for p in profile.points
                ],
            })
            logger.info("[CALIB] Calibration completed and enabled")

        def _on_failed(reason):
            self.calibration_active = False
            self._broadcast('calibration_failed', {'reason': reason})
            logger.warning(f"[CALIB] Calibration failed: {reason}")

        session.on_complete = _on_complete
        session.on_failed = _on_failed

        self.calibration_active = True
        self.calibration_corrector.disable()
        session.start()
        logger.info("[CALIB] Calibration session started")

    def _cancel_calibration(self):
        """Cancel in-app calibration session."""
        if self.calibration_session:
            self.calibration_session.cancel()
        self.calibration_active = False
        self._broadcast('calibration_cancelled', {})
        self._load_calibration_profile()
        logger.info("[CALIB] Calibration session cancelled")

    def _screen_to_window_normalized(self, x_norm: float, y_norm: float) -> tuple:
        """
        Convert full-screen normalized gaze coordinates into window-content normalized space.
        Also applies manual gaze offset correction if configured.
        """
        if self.screen_width <= 0 or self.screen_height <= 0:
            return x_norm, y_norm
        if self.physical_width <= 0 or self.physical_height <= 0:
            return x_norm, y_norm

        dpr_val = max(1.0, self.dpr if self.dpr else 1.0)

        css_screen_width = float(self.physical_width)
        css_screen_height = float(self.physical_height)
        width_ratio = (self.physical_width / self.screen_width) if self.screen_width else 1.0
        reports_physical_px = (
            dpr_val > 1.01 and
            abs(width_ratio - dpr_val) < 0.20
        )
        if reports_physical_px:
            css_screen_width = css_screen_width / dpr_val
            css_screen_height = css_screen_height / dpr_val

        screen_x_css = x_norm * css_screen_width
        screen_y_css = y_norm * css_screen_height

        win_x = screen_x_css - self.window_x
        win_y = screen_y_css - self.window_y

        # Normalize by content area (screen_width = window.innerWidth)
        content_w = float(self.screen_width)
        content_h = float(self.screen_height)

        out_x = win_x / content_w
        out_y = win_y / content_h

        # Apply manual gaze offset correction (in normalized units, converted from px)
        offset_x = getattr(self, '_gaze_offset_x', 0)
        offset_y = getattr(self, '_gaze_offset_y', 0)
        if offset_x != 0 and content_w > 0:
            out_x += offset_x / content_w
        if offset_y != 0 and content_h > 0:
            out_y += offset_y / content_h

        out_x = max(0.0, min(1.0, out_x))
        out_y = max(0.0, min(1.0, out_y))
        return out_x, out_y

    def _on_gaze_data(self, point: GazePoint):
        """Primary gaze pipeline: conditioning -> calibration -> classify/filter -> magnetism."""
        t_start = time.perf_counter()
        now_wall = time.time()

        if not hasattr(self, '_pipeline_log_count'):
            self._pipeline_log_count = 0
        self._pipeline_log_count += 1

        conditioned = self.signal_conditioner.process({
            'x': point.x,
            'y': point.y,
            'timestamp': point.timestamp,
            'left_valid': point.left_valid,
            'right_valid': point.right_valid,
            'confidence': point.confidence,
            'is_valid': point.is_valid,
        })
        if conditioned is None:
            return
        t_conditioned = time.perf_counter()

        sample_age = max(0.0, now_wall - conditioned.t)
        if sample_age > self.POINT_TTL_SECONDS:
            if self._pipeline_log_count % 200 == 0:
                logger.warning(f"[POINT-TTL] Dropping stale sample age={sample_age*1000:.1f}ms")
            # v17: Notify classifier and frontend of tracking loss
            self.gaze_classifier.mark_tracking_lost()
            self._broadcast('gaze_lost', {'reason': 'stale', 'age_ms': round(sample_age * 1000, 1)})
            return

        if not hasattr(self, '_last_gaze_ts'):
            self._last_gaze_ts = conditioned.t
        gap = conditioned.t - self._last_gaze_ts
        self._last_gaze_ts = conditioned.t

        if gap > self.FRAME_GAP_HOLD_SECONDS and self._last_gaze_payload is not None:
            # v17: Notify classifier and frontend of tracking gap (likely blink)
            self.gaze_classifier.mark_tracking_lost()
            self._broadcast('gaze_lost', {'reason': 'gap', 'gap_ms': round(gap * 1000, 1)})
            self._broadcast('gaze', self._last_gaze_payload)
            if self._pipeline_log_count % 120 == 0:
                logger.info(f"[GAP-HOLD] gap={gap*1000:.1f}ms, holding last gaze frame")
            return

        work_x = conditioned.x
        work_y = conditioned.y

        if self.calibration_active and self.calibration_session:
            calib_x, calib_y = self._screen_to_window_normalized(work_x, work_y)
            self.calibration_session.update(calib_x, calib_y, point.confidence)
        t_calibrated = time.perf_counter()

        zone = 'free'
        is_locked = False
        gaze_state = 'saccade'
        kalman_x = work_x
        kalman_y = work_y
        fx = work_x
        fy = work_y
        pre_filter_on_key = getattr(self, '_cursor_on_target', False)

        if self.USE_OPTIKEY_PIPELINE:
            if self._pipeline_log_count == 1:
                logger.info("Using OptiKey-style pipeline: Classifier -> Kalman -> 4-zone filter")

            gaze_class = self.gaze_classifier.classify(work_x, work_y, conditioned.t)
            self.kalman_filter.set_gaze_state(gaze_class.value)
            t_classified = time.perf_counter()

            kalman_x, kalman_y = self.kalman_filter.update(work_x, work_y)
            fx, fy = kalman_x, kalman_y
            t_kalman = time.perf_counter()

            skip_filter = False
            if gap > 0.10 and self.optikey_gaze_filter._initialized:
                if self.optikey_gaze_filter._current_zone in ('lock', 'fixation'):
                    skip_filter = True

            if skip_filter:
                stable_x = self.optikey_gaze_filter._last_x
                stable_y = self.optikey_gaze_filter._last_y
            else:
                stable_x, stable_y = self.optikey_gaze_filter.update(
                    kalman_x, kalman_y, on_key=pre_filter_on_key
                )

            zone = self.optikey_gaze_filter._current_zone
            is_locked = zone == 'lock'
            gaze_state = zone if zone != 'free' else 'saccade'
            t_filtered = time.perf_counter()
        else:
            if self._pipeline_log_count == 1:
                logger.info("Using legacy pipeline: OneEuro -> AntiRecoil -> GravityWell")

            if self.RAW_MODE:
                filtered = GazePoint(
                    x=work_x, y=work_y, timestamp=conditioned.t,
                    left_valid=point.left_valid, right_valid=point.right_valid,
                    confidence=point.confidence
                )
            else:
                filtered = self.gaze_filter.filter(GazePoint(
                    x=work_x, y=work_y, timestamp=conditioned.t,
                    left_valid=point.left_valid, right_valid=point.right_valid,
                    confidence=point.confidence
                ))

            fx, fy = filtered.x, filtered.y
            ar_x, ar_y = self.anti_recoil.update(fx, fy)

            skip_gravity = False
            if gap > 0.10 and self.gravity_well._initialized:
                if self.gravity_well._current_zone in ('lock', 'fixation'):
                    skip_gravity = True

            if skip_gravity:
                stable_x = self.gravity_well._last_x
                stable_y = self.gravity_well._last_y
            else:
                stable_x, stable_y = self.gravity_well.update(ar_x, ar_y)

            zone = self.gravity_well._current_zone
            is_locked = zone == 'lock'
            gaze_state = zone if zone != 'free' else 'saccade'
            t_classified = t_calibrated
            t_kalman = t_calibrated
            t_filtered = time.perf_counter()

        if self.USE_OPTIKEY_PIPELINE and self.ENABLE_ZONE_LOCK_SEMANTICS:
            is_locked = zone in self.LOCK_ZONES

        stable_x, stable_y = self._screen_to_window_normalized(stable_x, stable_y)
        if (not self.calibration_active) and self.calibration_corrector.enabled:
            stable_x, stable_y = self.calibration_corrector.correct(stable_x, stable_y)
        t_mapped = time.perf_counter()

        is_valid = (
            point.left_valid or point.right_valid or
            conditioned.state in (
                GazeValidity.VALID, GazeValidity.BLINK,
                GazeValidity.OUT_OF_BOUNDS, GazeValidity.FROZEN
            )
        )

        pre_mag_x = stable_x * self.screen_width
        pre_mag_y = stable_y * self.screen_height
        screen_x = pre_mag_x
        screen_y = pre_mag_y
        backend_magnet_px = 0.0

        if is_valid and self.screen_width > 0 and self.screen_height > 0:
            screen_x, screen_y = self._apply_magnetism(screen_x, screen_y)
            backend_magnet_px = math.hypot(screen_x - pre_mag_x, screen_y - pre_mag_y)
            stable_x = max(0.0, min(1.0, screen_x / self.screen_width))
            stable_y = max(0.0, min(1.0, screen_y / self.screen_height))
        t_magnetized = time.perf_counter()

        current_on_key = pre_filter_on_key
        if is_valid and self.USE_OPTIKEY_PIPELINE:
            # v15: Use post-filter pixel coords (pre_mag_x/y) instead of pre-filter Kalman coords.
            # Kalman coords are less stable and lag behind the 4-zone filtered position,
            # causing on_key to detect the wrong key (right-biased from Kalman prediction).
            current_on_key = self._update_on_key_state_px(pre_mag_x, pre_mag_y)
        else:
            self._cursor_on_target = False
            self._on_key_target_id = None
            current_on_key = False

        payload = {
            'x': stable_x,
            'y': stable_y,
            # Explicit coordinate contract for renderer:
            # x/y are already normalized to the app window content area.
            'coord_space': 'window',
            'is_valid': is_valid,
            'is_fixation': is_locked,
            'confidence': point.confidence,
            'gaze_state': gaze_state,
            'raw_x': point.x,
            'raw_y': point.y,
            'signal_state': conditioned.state.value,
            'sample_age_ms': round(sample_age * 1000.0, 2),
            'backend_zone': zone,
        }
        if self.ENABLE_DUAL_PULL_COORDINATION_SIGNAL:
            payload['backend_on_key'] = bool(current_on_key)
            payload['backend_magnet_px'] = round(backend_magnet_px, 3)
        self._last_gaze_payload = payload
        self._broadcast('gaze', payload)
        t_sent = time.perf_counter()

        self.fatigue.update_gaze(
            stable_x, stable_y,
            is_valid,
            conditioned.t
        )

        dwell_is_valid = is_valid
        dwell_is_blink = False
        if self.ENABLE_STALE_BLINK_DWELL_GUARD:
            dwell_is_valid = (
                is_valid
                and conditioned.state in self.DWELL_GUARD_ALLOWED_STATES
                and sample_age <= self.POINT_TTL_SECONDS
            )
            # v17: Detect blink specifically — pause dwell instead of cancelling
            from services.signal_conditioner import GazeValidity
            dwell_is_blink = (
                is_valid
                and conditioned.state == GazeValidity.BLINK
            )
            if is_valid and not dwell_is_valid and self._pipeline_log_count % 200 == 0:
                logger.info(
                    f"[DWELL-GUARD] state={conditioned.state.value} "
                    f"age={sample_age*1000:.1f}ms -> dwell invalid"
                    f"{' (blink-pause)' if dwell_is_blink else ''}"
                )

        if self.BACKEND_DWELL_ENABLED:
            self.dwell_manager.update(
                screen_x, screen_y,
                point.confidence,
                is_valid=dwell_is_valid,
                is_blink=dwell_is_blink,
            )

        if self._pipeline_log_count % 266 == 1:
            pipeline_name = "OPTIKEY" if self.USE_OPTIKEY_PIPELINE else "LEGACY"
            logger.info(
                f"[{pipeline_name}] zone={zone} locked={is_locked} "
                f"raw=({point.x:.3f},{point.y:.3f}) "
                f"kalman=({fx:.3f},{fy:.3f}) "
                f"stable=({stable_x:.3f},{stable_y:.3f}) "
                f"on_key={getattr(self, '_cursor_on_target', False)}"
            )

        if self._pipeline_log_count % 266 == 0:
            logger.info(
                f"[LATENCY] conditioner={1000*(t_conditioned-t_start):.2f}ms "
                f"calib={1000*(t_calibrated-t_conditioned):.2f}ms "
                f"classifier={1000*(t_classified-t_calibrated):.2f}ms "
                f"kalman={1000*(t_kalman-t_classified):.2f}ms "
                f"filter={1000*(t_filtered-t_kalman):.2f}ms "
                f"map={1000*(t_mapped-t_filtered):.2f}ms "
                f"magnet={1000*(t_magnetized-t_mapped):.2f}ms "
                f"send={1000*(t_sent-t_magnetized):.2f}ms "
                f"total={1000*(t_sent-t_start):.2f}ms"
            )

    @staticmethod
    def _target_contains_expanded(target: DwellTarget, px: float, py: float, expand: float) -> bool:
        half_w = max(1.0, (target.width * 0.5) * max(0.1, float(expand)))
        half_h = max(1.0, (target.height * 0.5) * max(0.1, float(expand)))
        return (
            (target.x - half_w) <= px <= (target.x + half_w) and
            (target.y - half_h) <= py <= (target.y + half_h)
        )

    def _get_on_key_expand(self, target: DwellTarget, is_exit: bool = False) -> float:
        ctx = str(getattr(target, 'context', '') or '').lower()
        if ctx == 'gazetoggle':
            return 1.80 if is_exit else 1.45
        if ctx == 'keyboard':
            return 1.38 if is_exit else 1.12
        if ctx == 'prediction':
            return 1.42 if is_exit else 1.20
        if self.current_screen == 'keyboard':
            return 1.32 if is_exit else 1.08
        return 1.20 if is_exit else 0.95

    def _update_on_key_state_px(self, px: float, py: float) -> bool:
        """v15: Like _update_on_key_state but accepts post-filter PIXEL coords directly.
        Avoids the Kalman→normalize→denormalize round-trip that introduced rightward bias."""
        return self._update_on_key_state_impl(px, py)

    def _update_on_key_state(self, kalman_x: float, kalman_y: float) -> bool:
        try:
            kalman_win_x, kalman_win_y = self._screen_to_window_normalized(kalman_x, kalman_y)
            if (not self.calibration_active) and self.calibration_corrector.enabled:
                kalman_win_x, kalman_win_y = self.calibration_corrector.correct(kalman_win_x, kalman_win_y)
            kalman_px = kalman_win_x * self.screen_width
            kalman_py = kalman_win_y * self.screen_height
            return self._update_on_key_state_impl(kalman_px, kalman_py)
        except Exception:
            self._cursor_on_target = False
            self._on_key_target_id = None
            return False

    def _update_on_key_state_impl(self, kalman_px: float, kalman_py: float) -> bool:
        """Core on_key detection logic using window pixel coordinates."""
        try:
            detector = self.dwell_manager.detectors.get(self.current_screen)
            if not detector or not hasattr(detector, 'targets'):
                self._cursor_on_target = False
                self._on_key_target_id = None
                return False

            enabled_targets = [t for t in detector.targets.values() if t.enabled]
            if not enabled_targets:
                self._cursor_on_target = False
                self._on_key_target_id = None
                return False

            now = time.time()
            candidate: Optional[DwellTarget] = None

            if self.ENABLE_ON_KEY_TARGET_HYSTERESIS and self._on_key_target_id:
                sticky = detector.targets.get(self._on_key_target_id)
                if sticky and sticky.enabled:
                    exit_expand = self._get_on_key_expand(sticky, is_exit=True)
                    if self._target_contains_expanded(sticky, kalman_px, kalman_py, exit_expand):
                        candidate = sticky

            if candidate is None:
                best_dist = float('inf')
                for target in enabled_targets:
                    enter_expand = self._get_on_key_expand(target, is_exit=False)
                    if not self._target_contains_expanded(target, kalman_px, kalman_py, enter_expand):
                        continue
                    dist = math.hypot(kalman_px - target.x, kalman_py - target.y)
                    if dist < best_dist:
                        best_dist = dist
                        candidate = target

            if candidate is not None:
                self._on_key_target_id = candidate.id
                self._on_key_last_true = now
                self._cursor_on_target = True
            else:
                hold_s = max(0.0, float(self.ON_KEY_HOLD_SECONDS))
                self._cursor_on_target = (now - self._on_key_last_true) < hold_s if self._on_key_last_true else False
                if not self._cursor_on_target:
                    self._on_key_target_id = None

            return bool(self._cursor_on_target)
        except Exception:
            self._cursor_on_target = False
            self._on_key_target_id = None
            return False

    def _apply_magnetism(self, screen_x: float, screen_y: float) -> tuple:
        """
        v12: Sticky-target cursor magnetism â€” prevents oscillation between adjacent targets.

        KEY CHANGE from v11: Once locked onto a target, KEEP that target until the
        pre-magnetism cursor moves beyond RELEASE_RADIUS (1.5Ã— MAGNET_RADIUS).
        This prevents the rapid target-switching that made typing impossible.

        Also adds APPROACH BIAS: when the cursor is moving toward a target, increase pull.
        When moving away, decrease pull (user is intentionally leaving).
        """
        # Per-target-context magnetism params
        # Keep context-aware behavior from compass, but use stronger keyboard values from accuracy branch.
        # v15: Reduced keyboard magnetism to prevent wrong-key lock amplifying rightward drift.
        # Previous: radius=96, pull=0.56, release=92 — too aggressive, release < capture made escape hard.
        # Now: radius=72, pull=0.32, release=88 — weaker capture, release > capture for easier escape.
        CONTEXT_PARAMS = {
            'keyboard':   {'radius': 72, 'pull': 0.32, 'release': 88},
            'prediction': {'radius': 112, 'pull': 0.48, 'release': 100},
            'navigation': {'radius': 44, 'pull': 0.16, 'release': 64},
            'gazetoggle': {'radius': 165, 'pull': 0.34, 'release': 185},
        }
        DEFAULT_PARAMS = {'radius': 62, 'pull': 0.22, 'release': 82}

        try:
            detector = self.dwell_manager.detectors.get(self.current_screen)
            if not detector or not hasattr(detector, 'targets'):
                return screen_x, screen_y

            previous_raw = getattr(self, '_last_magnet_raw', (screen_x, screen_y))
            self._last_magnet_raw = (screen_x, screen_y)

            # --- Sticky target logic ---
            sticky_target = getattr(self, '_sticky_magnet_target', None)

            if sticky_target is not None:
                # Get context-specific params for the sticky target
                ctx = getattr(sticky_target, 'context', 'navigation')
                params = CONTEXT_PARAMS.get(ctx, DEFAULT_PARAMS)
                MAGNET_RADIUS = params['radius']
                MAX_PULL = params['pull']
                RELEASE_RADIUS = params['release']

                # Check if we should RELEASE the sticky target
                dx = screen_x - sticky_target.x
                dy = screen_y - sticky_target.y
                dist_to_sticky = math.sqrt(dx * dx + dy * dy)
                prev_dx = previous_raw[0] - sticky_target.x
                prev_dy = previous_raw[1] - sticky_target.y
                prev_dist_to_sticky = math.sqrt(prev_dx * prev_dx + prev_dy * prev_dy)
                moving_away = dist_to_sticky > prev_dist_to_sticky + 10.0

                if self.ENABLE_MAGNET_STICKY_HANDOFF:
                    alt_target = None
                    alt_dist = float('inf')
                    for target in detector.targets.values():
                        if not target.enabled or target.id == sticky_target.id:
                            continue
                        adx = screen_x - target.x
                        ady = screen_y - target.y
                        d = math.sqrt(adx * adx + ady * ady)
                        if d < alt_dist:
                            alt_dist = d
                            alt_target = target

                    if alt_target is not None:
                        prev_adx = previous_raw[0] - alt_target.x
                        prev_ady = previous_raw[1] - alt_target.y
                        prev_alt_dist = math.sqrt(prev_adx * prev_adx + prev_ady * prev_ady)
                        moving_toward_alt = alt_dist + 4.0 < prev_alt_dist
                        if moving_toward_alt and (alt_dist + self.MAGNET_HANDOFF_BIAS_PX < dist_to_sticky):
                            self._sticky_magnet_target = None
                            sticky_target = None

                if sticky_target is not None:
                    if (
                        dist_to_sticky > RELEASE_RADIUS or
                        not sticky_target.enabled or
                        (moving_away and dist_to_sticky > MAGNET_RADIUS * 0.55)
                    ):
                        # User has moved far enough away â€” release and find new target
                        self._sticky_magnet_target = None
                        sticky_target = None
                    else:
                        # Still close enough â€” KEEP pulling toward sticky target
                        normalized_dist = min(1.0, dist_to_sticky / MAGNET_RADIUS)
                        pull = MAX_PULL * (1.0 - normalized_dist) ** 2
                        if moving_away:
                            pull *= 0.35
                        new_x = screen_x + pull * (sticky_target.x - screen_x)
                        new_y = screen_y + pull * (sticky_target.y - screen_y)
                        return new_x, new_y

            # --- No sticky target: find nearest ---
            nearest_target = None
            nearest_dist = float('inf')

            for target in detector.targets.values():
                if not target.enabled:
                    continue
                dx = screen_x - target.x
                dy = screen_y - target.y
                dist = math.sqrt(dx * dx + dy * dy)
                if dist < nearest_dist:
                    nearest_dist = dist
                    nearest_target = target

            if nearest_target is None:
                return screen_x, screen_y

            # Get context-specific params for the nearest target
            ctx = getattr(nearest_target, 'context', 'navigation')
            params = CONTEXT_PARAMS.get(ctx, DEFAULT_PARAMS)
            MAGNET_RADIUS = params['radius']
            MAX_PULL = params['pull']
            CAPTURE_RADIUS = MAGNET_RADIUS if ctx == 'gazetoggle' else MAGNET_RADIUS * 0.82

            if nearest_dist > CAPTURE_RADIUS:
                return screen_x, screen_y

            # Lock onto this target as the new sticky target
            self._sticky_magnet_target = nearest_target

            # Quadratic falloff: strong at center, gentle at edge
            normalized_dist = nearest_dist / MAGNET_RADIUS
            pull = MAX_PULL * (1.0 - normalized_dist) ** 2

            new_x = screen_x + pull * (nearest_target.x - screen_x)
            new_y = screen_y + pull * (nearest_target.y - screen_y)

            return new_x, new_y

        except Exception:
            return screen_x, screen_y

    def _on_dwell_complete(self, target: DwellTarget):
        """Handle completed dwell selection."""
        if not self.BACKEND_DWELL_ENABLED:
            return

        self._broadcast('dwell_complete', {'target_id': target.id})
        self.fatigue.report_selection()

        if self.logger:
            self.logger.log_selection(target.id)

    def _broadcast(self, msg_type: str, data: Dict = None):
        """
        Broadcast message to all connected WebSocket clients.

        FIX v4.7: For gaze data, store latest and let a dedicated loop send it.
        For other messages, send immediately. This prevents 133Hz fire-and-forget
        tasks from overwhelming the event loop.
        """
        message = json.dumps({'type': msg_type, **(data or {})})

        if not self.connected_clients:
            if not hasattr(self, '_no_client_warn_count'):
                self._no_client_warn_count = 0
            self._no_client_warn_count += 1
            if self._no_client_warn_count % 300 == 1:
                logger.warning(f"No WebSocket clients connected! Cannot send {msg_type} data.")
            return

        # For gaze: store latest, let broadcast loop handle it
        if msg_type == 'gaze':
            self._latest_gaze_msg = message
            return

        # For non-gaze: send immediately
        for client in list(self.connected_clients):
            try:
                asyncio.create_task(client.send(message))
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                self.connected_clients.discard(client)

    async def _gaze_broadcast_loop(self):
        """
        Dedicated loop that sends latest gaze data at ~60Hz.
        Prevents overwhelming WebSocket with 133 fire-and-forget tasks/sec.
        """
        logger.info("Gaze broadcast loop started (~66Hz)")
        self._latest_gaze_msg = None
        send_count = 0
        last_log = time.time()

        while True:
            try:
                # v9: High-precision broadcast timing
                # asyncio.sleep(1/66) has 15.6ms resolution on Windows â†’ ~32Hz actual
                # Hybrid: sleep most of the interval, then yield rapidly for precision
                target_interval = 1/66
                if not hasattr(self, '_next_broadcast'):
                    self._next_broadcast = time.perf_counter()
                self._next_broadcast += target_interval

                now = time.perf_counter()
                wait = self._next_broadcast - now
                if wait < -0.05 or wait > 0.05:
                    # Timing drifted too far, reset
                    self._next_broadcast = now + target_interval
                    await asyncio.sleep(0)
                elif wait > 0.005:
                    await asyncio.sleep(wait - 0.003)
                    # Yield rapidly until target time (sub-ms precision)
                    while time.perf_counter() < self._next_broadcast:
                        await asyncio.sleep(0)
                else:
                    await asyncio.sleep(0)

                msg = self._latest_gaze_msg
                if not msg or not self.connected_clients:
                    continue

                self._latest_gaze_msg = None  # Consume

                # Fire-and-forget sends â€” don't block broadcast loop waiting for completion.
                # Previous await-based sends limited rate to ~30Hz on Windows due to
                # 15.6ms timer resolution + send completion time.
                dead = []
                for client in list(self.connected_clients):
                    try:
                        asyncio.create_task(client.send(msg))
                        send_count += 1
                    except Exception:
                        dead.append(client)

                for c in dead:
                    self.connected_clients.discard(c)

                now = time.time()
                if now - last_log >= 10.0:
                    rate = send_count / (now - last_log)
                    logger.info(f"Gaze broadcast: {rate:.0f} msgs/s to {len(self.connected_clients)} clients")
                    send_count = 0
                    last_log = now

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Broadcast loop error: {e}")
                await asyncio.sleep(0.1)

    async def _handle_message(self, websocket: WebSocketServerProtocol, message: str):
        """Handle incoming WebSocket message."""
        try:
            data = json.loads(message)
            msg_type = data.get('type', '')

            # Route message
            handlers = {
                'ping': lambda: self._send(websocket, 'pong'),
                'set_gaze_enabled': lambda: self._set_gaze_enabled(data.get('enabled', False)),
                'set_screen': lambda: self._set_screen(data.get('screen', 'home')),
                'set_screen_size': lambda: self._set_screen_size(data),
                'set_gaze_offset': lambda: self._set_gaze_offset(data),
                'start_calibration': self._start_calibration,
                'cancel_calibration': self._cancel_calibration,
                'register_targets': lambda: self._register_targets(data.get('targets', [])),
                'get_predictions': lambda: self._get_predictions(
                    websocket,
                    data.get('text', ''),
                    data.get('length_hint'),
                    data.get('top_k', 12),
                    data.get('request_id'),
                ),
                'get_phrases': lambda: self._get_phrases(websocket, data.get('category')),
                'expand_abbreviation': lambda: self._expand_abbreviation(websocket, data.get('abbrev', '')),
                'learn_word': lambda: self.prediction.learn_word(data.get('word', '')),
                'add_word': lambda: self._add_word(websocket, data.get('word', '')),
                'learn_sentence': lambda: self._learn_sentence(data.get('sentence', '')),
                'get_dictionary_data': lambda: self._get_dictionary_data(websocket),
                'get_builtin_data': lambda: self._get_builtin_data(websocket),
                'get_neural_model_info': lambda: self._send(websocket, 'neural_model_info', self.prediction.get_neural_model_info()),
                'add_abbreviation': lambda: self._add_abbreviation(websocket, data.get('abbrev', ''), data.get('expansion', '')),
                'remove_abbreviation': lambda: self._remove_abbreviation(websocket, data.get('abbrev', '')),
                'add_sentence_template': lambda: self._add_sentence_template(websocket, data.get('sentence', '')),
                'get_sentence_history': lambda: self._get_sentence_history(websocket),
                'speak': lambda: self._speak(data.get('text', '')),
                'stop_speaking': lambda: self.tts.stop(),
                'set_tts_rate': lambda: self.tts.set_rate(data.get('rate', 150)),
                'set_tts_volume': lambda: self.tts.set_volume(data.get('volume', 1.0)),
                'get_fatigue': lambda: self._get_fatigue(websocket),
                'take_break': lambda: self.breaks.start_break(),
                'snooze_break': lambda: self.breaks.snooze(data.get('minutes', 5)),
                'skip_break': lambda: self.breaks.skip_break(),
                'set_filter_preset': lambda: self._set_filter_preset(data.get('preset', 'balanced')),
                'set_filter_params': lambda: self._set_filter_params(data),
                'update_text': lambda: self._update_text(data.get('text', '')),
                'save_survey': lambda: self._save_survey(data.get('survey_data', {})),
                'load_survey': lambda: self._load_survey(websocket),
                'compile_survey': lambda: self._compile_survey(websocket, data),
                'snapshot_survey': lambda: self._snapshot_survey(websocket, data),
                # Web Hub handlers (additive)
                'get_news': lambda: asyncio.create_task(
                    self._handle_get_news(websocket, data.get('category', 'top'), data.get('limit', 9))
                ),
                'refresh_news': lambda: asyncio.create_task(
                    self._handle_refresh_news(websocket, data.get('category', 'top'), data.get('limit', 9))
                ),
                'get_news_categories': lambda: self._handle_news_categories(websocket),
                'get_knowledge_categories': lambda: self._handle_knowledge_categories(websocket),
                'get_knowledge_articles': lambda: self._handle_knowledge_articles(websocket, data.get('category_id', '')),
                'get_knowledge_article': lambda: self._handle_knowledge_article(websocket, data.get('article_id', '')),
                'search_knowledge': lambda: self._handle_search_knowledge(websocket, data.get('query', '')),
                'fetch_article': lambda: asyncio.create_task(
                    self._handle_fetch_article(websocket, data.get('url', ''), data.get('force', False))
                ),
                'get_quick_snapshot': lambda: asyncio.create_task(
                    self._handle_get_quick_snapshot(websocket, data.get('force', False))
                ),
            }

            handler = handlers.get(msg_type)
            if handler:
                handler()
            else:
                logger.warning(f"Unknown message type: {msg_type}")

        except json.JSONDecodeError:
            logger.error(f"Invalid JSON: {message[:100]}")
        except Exception as e:
            logger.error(f"Message handling error: {e}")

    def _send(self, websocket: WebSocketServerProtocol, msg_type: str, data: Dict = None):
        """Send message to specific client."""
        message = json.dumps({'type': msg_type, **(data or {})})
        asyncio.create_task(websocket.send(message))

    def _send_threadsafe(self, websocket: WebSocketServerProtocol, msg_type: str, data: Dict = None):
        """Send message from a background thread. Thread-safe version of _send()."""
        message = json.dumps({'type': msg_type, **(data or {})})
        try:
            future = asyncio.run_coroutine_threadsafe(websocket.send(message), self._event_loop)
            def _on_done(f):
                try:
                    f.result()
                except Exception as e:
                    logger.warning(f"[THREADSAFE-SEND] '{msg_type}' delivery failed: {e}")
            future.add_done_callback(_on_done)
        except Exception as e:
            logger.warning(f"[THREADSAFE-SEND] Failed to schedule '{msg_type}': {e}")

    def _set_gaze_enabled(self, enabled: bool):
        """Enable/disable gaze tracking."""
        self.gaze_enabled = enabled
        self._broadcast('gaze_enabled', {'enabled': enabled})
        logger.info(f"Gaze tracking {'enabled' if enabled else 'disabled'}")

    def _set_screen(self, screen: str):
        """Set current screen context."""
        # v12: Reset sticky magnetism target on screen change
        self._sticky_magnet_target = None
        self._on_key_target_id = None
        self._cursor_on_target = False
        self._on_key_last_true = 0
        self.current_screen = screen
        self.dwell_manager.set_screen(screen)
        # v11: Adapt filter parameters for screen context
        if self.USE_OPTIKEY_PIPELINE:
            self.optikey_gaze_filter.set_screen_mode(screen)
            logger.info(f"[PIPELINE] Screen={screen} lock_radius={self.optikey_gaze_filter.lock_radius:.3f} "
                        f"hysteresis={self.optikey_gaze_filter.hysteresis_multiplier:.1f}Ã—")
        self._broadcast('screen_changed', {'screen': screen})

    def _set_screen_size(self, data: Dict):
        """Set screen dimensions and physical screen info for coordinate remapping."""
        width = data.get('width')
        height = data.get('height')
        if width and height:
            self.screen_width = width
            self.screen_height = height
            if self.calibration_session:
                self.calibration_session.screen_width = int(self.screen_width)
                self.calibration_session.screen_height = int(self.screen_height)

        # v8: Physical screen info for Tobii coordinate remapping
        if data.get('physicalWidth'):
            self.physical_width = data['physicalWidth']
        if data.get('physicalHeight'):
            self.physical_height = data['physicalHeight']
        if data.get('dpr'):
            self.dpr = float(data['dpr'])
        if 'windowX' in data:
            self.window_x = data['windowX']
        if 'windowY' in data:
            self.window_y = data['windowY']

        logger.info(
            f"Screen: {self.screen_width}x{self.screen_height}, "
            f"Physical: {self.physical_width}x{self.physical_height}, "
            f"DPR: {self.dpr}, Window: ({self.window_x},{self.window_y})"
        )

        # v13: Compute content area chrome offset
        if self.physical_height > self.screen_height + 10:
            self._content_chrome = self.physical_height - self.screen_height
        else:
            self._content_chrome = 0
        logger.info(
            f"[v13 SCREEN] inner={self.screen_width}x{self.screen_height} "
            f"physical={self.physical_width}x{self.physical_height} "
            f"chrome={self._content_chrome}px"
        )

        # v12: Update classifier basis so velocity uses tracker/screen coordinate space.
        if hasattr(self, 'gaze_classifier') and width and height:
            if self.ENABLE_CLASSIFIER_SCREEN_BASIS and self.physical_width > 0 and self.physical_height > 0:
                basis_width = int(self.physical_width)
                basis_height = int(self.physical_height)
            else:
                basis_width = int(width * self.dpr) if self.dpr else int(width)
                basis_height = int(height * self.dpr) if self.dpr else int(height)

            self.gaze_classifier.update_screen_params(
                width_px=max(1, basis_width),
                height_px=max(1, basis_height)
            )

    def _set_gaze_offset(self, data: Dict):
        """Set manual gaze offset correction from Settings."""
        offset_x = data.get('offsetX', 0)
        offset_y = data.get('offsetY', 0)
        self._gaze_offset_x = float(offset_x)
        self._gaze_offset_y = float(offset_y)
        logger.info(f"[GAZE-OFFSET] Manual offset set: X={self._gaze_offset_x}px, Y={self._gaze_offset_y}px")

    def _register_targets(self, targets: List[Dict]):
        """Register dwell targets."""
        dwell_targets = []
        for t in targets:
            target = DwellTarget(
                id=t['id'],
                x=t['x'],
                y=t['y'],
                width=t['width'],
                height=t['height'],
                size=ButtonSize(t.get('size', 'md')),
                context=t.get('context', 'navigation'),
                custom_dwell_ms=t.get('custom_dwell_ms'),
                priority=t.get('priority', 0),
                enabled=t.get('enabled', True)
            )
            dwell_targets.append(target)

        self.dwell_manager.set_targets(dwell_targets)
        logger.debug(f"Registered {len(dwell_targets)} targets")

    async def _fetch_datamuse_suggestions(self, word: str) -> List[Dict]:
        """Fetch next-word suggestions from Datamuse API (free, no key needed)."""
        if not AIOHTTP_AVAILABLE:
            return []

        # Check cache first
        cached = self._datamuse_cache.get(word)
        if cached is not None:
            return cached

        try:
            url = f"https://api.datamuse.com/words?rel_bga={word}&max=10"
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=0.3)) as resp:
                    if resp.status == 200:
                        results = await resp.json()
                        self._datamuse_cache.put(word, results)
                        return results
        except Exception:
            pass
        return []

    async def _enhance_with_datamuse(
        self,
        websocket: WebSocketServerProtocol,
        text: str,
        local_results: List[Dict],
        sentence_results: List[Dict],
        request_id: Optional[int] = None,
    ):
        """Background task: fetch Datamuse suggestions and send enhanced predictions."""
        try:
            # Extract last word for API query
            import re
            words = re.findall(r'[a-zA-Z]+', text.lower())
            if not words:
                return

            last_word = words[-1]
            # Only query if we're after a space (predicting next word, not mid-word)
            if text and not text.endswith(' '):
                return

            api_results = await self._fetch_datamuse_suggestions(last_word)
            if not api_results:
                return

            # Build set of already-suggested words
            existing_words = {r['word'] for r in local_results}

            # Merge API suggestions into results
            enhanced = list(local_results)
            added = 0
            for item in api_results:
                api_word = item.get('word', '').lower()
                # Skip short words, existing words, and multi-word results
                if (len(api_word) < 3 or api_word in existing_words
                        or ' ' in api_word or is_blocked_prediction_word(api_word)):
                    continue
                enhanced.append({
                    'word': api_word,
                    'score': 0.02,
                    'source': 'datamuse',
                })
                existing_words.add(api_word)
                added += 1
                if added >= 5:
                    break

            if added > 0:
                # Re-sort: keep original order for high-score items, API items at end
                self._send(websocket, 'predictions', {
                    'words': enhanced,
                    'sentences': sentence_results,
                    'request_id': request_id,
                })
        except Exception:
            pass  # Graceful degradation — never impact local predictions

    def _sentence_next_word_candidate(self, typed: str, sentence: str) -> Optional[str]:
        typed_tokens = tokenize_prediction_text(typed)
        sentence_tokens = tokenize_prediction_text(sentence)
        if not typed_tokens or not sentence_tokens:
            return None

        typed_clean = typed.strip().lower()
        if typed.endswith(' '):
            if not sentence.lower().startswith(typed_clean):
                return None
            next_index = len(typed_tokens)
            if next_index >= len(sentence_tokens):
                return None
            return sentence_tokens[next_index]

        prefix = typed_tokens[-1]
        completed = typed_tokens[:-1]
        next_index = len(completed)
        if completed and sentence_tokens[:next_index] != completed:
            return None
        if next_index >= len(sentence_tokens):
            return None

        candidate = sentence_tokens[next_index]
        if candidate.startswith(prefix) and candidate != prefix:
            return candidate
        return None

    def _apply_sentence_word_boosts(
        self,
        text: str,
        word_results: List[Dict[str, Any]],
        sentence_results: List[Dict[str, Any]],
        top_k: int,
    ) -> List[Dict[str, Any]]:
        if not word_results or not sentence_results:
            return word_results

        next_word_boosts: Dict[str, float] = {}
        for index, item in enumerate(sentence_results[:5]):
            next_word = self._sentence_next_word_candidate(text, item.get('text', ''))
            if not next_word or is_blocked_prediction_word(next_word):
                continue
            strength = max(0.35, 1.0 - (index * 0.18))
            next_word_boosts[next_word] = max(next_word_boosts.get(next_word, 0.0), strength)

        if not next_word_boosts:
            return word_results

        max_score = max(float(item.get('score', 0.0)) for item in word_results) or 1.0
        boosted_results: List[Dict[str, Any]] = []
        seen_words: Set[str] = set()

        for item in word_results:
            word = str(item.get('word', '')).lower()
            if not word or is_blocked_prediction_word(word) or word in seen_words:
                continue
            updated = dict(item)
            if word in next_word_boosts:
                updated['score'] = float(updated.get('score', 0.0)) * (1.35 + 0.25 * next_word_boosts[word])
                if updated.get('source') in {'ngram', 'core', 'recent', 'patient_bigram'}:
                    updated['source'] = 'sentence_context'
                del next_word_boosts[word]
            boosted_results.append(updated)
            seen_words.add(word)

        for index, (word, _strength) in enumerate(sorted(next_word_boosts.items(), key=lambda item: -item[1])):
            if word in seen_words:
                continue
            boosted_results.append({
                'word': word,
                'score': max_score * max(0.78, 1.12 - (index * 0.10)),
                'source': 'sentence_context',
            })
            seen_words.add(word)

        boosted_results.sort(key=lambda item: float(item.get('score', 0.0)), reverse=True)
        return boosted_results[:top_k]

    def _get_predictions(
        self,
        websocket: WebSocketServerProtocol,
        text: str,
        length_hint: Optional[int] = None,
        top_k: int = 12,
        request_id: Optional[int] = None,
    ):
        """Get word predictions + sentence predictions in one response."""
        topic_boosts = self._session_topics.get_boosts(text)
        if not text.strip():
            results = self._get_starter_predictions(topic_boosts=topic_boosts, top_k=top_k)
            self._send(websocket, 'predictions', {
                'words': results,
                'sentences': [],
                'request_id': request_id,
            })
            return

        predictions = self.prediction.predict(
            text, top_k=top_k, topic_boosts=topic_boosts
        )
        results = [
            {'word': p.word, 'score': p.score, 'source': p.source}
            for p in predictions
            if not is_blocked_prediction_word(p.word)
        ]

        # Sentence predictions (< 100ms, local only)
        sentence_results = []
        if len(text.strip()) >= 2:
            spreds = self.sentence_predictor.predict(
                text.strip(), top_k=3, topic_boosts=topic_boosts
            )
            sentence_results = [
                {'text': sp.text, 'score': sp.score, 'source': sp.source}
                for sp in spreds
                if not contains_blocked_prediction_word(sp.text)
            ]

            # Neural sentence continuation — works mid-word too.
            # Uses completed words as context (strips partial word being typed).
            # e.g. typing "I nee" → context "I" → generates "I need suction"
            # e.g. typing "I need " → context "I need" → generates "I need to be repositioned"
            stripped = text.strip()
            words = stripped.split()
            if len(words) >= 1:
                # If mid-word (no trailing space), use all completed words as context
                if not text.endswith(' ') and len(words) >= 2:
                    neural_context = ' '.join(words[:-1])  # drop partial word
                else:
                    neural_context = stripped

                if len(neural_context.split()) >= 2 and len(sentence_results) < 3:
                    neural_cont = self.prediction.predict_sentence_neural(neural_context, num_words=4)
                    if neural_cont and len(neural_cont.strip()) >= 3:
                        full_sentence = f"{neural_context} {neural_cont}".strip()
                        is_duplicate = any(
                            sr['text'].lower() == full_sentence.lower()
                            for sr in sentence_results
                        )
                        if (
                            not is_duplicate
                            and len(sentence_results) < 3
                            and not contains_blocked_prediction_word(full_sentence)
                        ):
                            base_score = sentence_results[-1]['score'] * 0.85 if sentence_results else 1.0
                            sentence_results.append({
                                'text': full_sentence,
                                'score': base_score,
                                'source': 'neural',
                            })

        if sentence_results:
            results = self._apply_sentence_word_boosts(text, results, sentence_results, top_k)


        # If length_hint is provided, also include length-filtered predictions
        if length_hint is not None:
            try:
                length_hint = int(length_hint)
                if length_hint >= 3:
                    is_high = length_hint >= 7
                    filtered = []
                    for p in predictions:
                        if is_blocked_prediction_word(p.word):
                            continue
                        if is_high and len(p.word) >= 7:
                            filtered.append({'word': p.word, 'score': p.score, 'source': p.source})
                        elif not is_high and len(p.word) == length_hint:
                            filtered.append({'word': p.word, 'score': p.score, 'source': p.source})
                    self._send(websocket, 'predictions', {
                        'words': results,
                        'sentences': sentence_results,
                        'length_filtered': filtered[:5],
                        'length_hint': length_hint,
                        'request_id': request_id,
                    })
                    return
            except (ValueError, TypeError):
                pass

        # Send local predictions immediately (instant)
        self._send(websocket, 'predictions', {
            'words': results,
            'sentences': sentence_results,
            'request_id': request_id,
        })

        # Fire async Datamuse enhancement in background (non-blocking)
        if self.config.enable_datamuse and AIOHTTP_AVAILABLE and text.endswith(' '):
            asyncio.create_task(
                self._enhance_with_datamuse(
                    websocket, text, results, sentence_results, request_id=request_id
                )
            )

    def _get_starter_predictions(
        self,
        topic_boosts: Optional[Dict[str, float]] = None,
        top_k: int = 12,
    ) -> List[Dict[str, Any]]:
        """Curated starter phrases for the empty-text state."""
        general_defaults = ['I need', 'Please', 'Can you', 'I am', 'Help', 'Thank you']
        topic_defaults = {
            'basic': ['I need', 'I want', 'Water', 'Please', 'Can you'],
            'medical': ['I need', 'Pain', 'Medicine', 'Help', 'Please'],
            'comfort': ['Please', 'Turn me', 'Adjust', 'I am', 'Can you'],
            'family': ['Please call', 'How is', 'I miss', 'Thank you', 'Good morning'],
            'emotion': ['I am', 'I feel', 'Please', 'Thank you', 'I miss'],
            'greet': ['Good morning', 'Hello', 'Thank you', 'Good night', 'Please'],
            'emergency': ['Help', 'I need', 'Please', 'Call doctor', 'Breathing'],
        }

        starters: List[Dict[str, Any]] = []
        seen: Set[str] = set()

        def push(phrase: str, score: float, source: str):
            normalized = ' '.join(phrase.strip().split())
            if len(normalized) < 2:
                return
            key = normalized.lower()
            if key in seen:
                return
            seen.add(key)
            starters.append({
                'word': normalized,
                'score': round(score, 4),
                'source': source,
            })

        history_items = sorted(
            self.sentence_predictor.history,
            key=lambda item: (item.get('count', 0), item.get('last_used', 0)),
            reverse=True,
        )
        for idx, item in enumerate(history_items[:6]):
            sentence = str(item.get('text', '')).strip()
            tokens = re.findall(r'[a-zA-Z\u0900-\u097F]+', sentence)
            if not tokens:
                continue
            stem = ' '.join(tokens[:2]) if len(tokens) >= 2 else tokens[0]
            push(stem, 1.08 - (idx * 0.05), 'starter_history')

        primary_topic = None
        if topic_boosts:
            primary_topic = max(topic_boosts.items(), key=lambda item: item[1])[0]

        for idx, phrase in enumerate(topic_defaults.get(primary_topic, [])):
            push(phrase, 0.98 - (idx * 0.04), 'starter_topic')

        for idx, phrase in enumerate(general_defaults):
            push(phrase, 0.90 - (idx * 0.03), 'starter')

        return starters[:top_k]

    def _learn_sentence(self, sentence: str):
        """Learn from spoken sentence — feeds both word and sentence predictors."""
        if sentence:
            normalized = sentence.strip()
            if not normalized:
                return
            if contains_blocked_prediction_word(normalized):
                return
            now = time.time()
            if (
                normalized.lower() == self._last_learned_sentence
                and now - self._last_learned_sentence_at < 1.0
            ):
                return
            self._last_learned_sentence = normalized.lower()
            self._last_learned_sentence_at = now
            self.prediction.learn_sentence(normalized)
            self.sentence_predictor.learn(normalized)
            self._session_topics.record(normalized)

    def _add_word(self, websocket: WebSocketServerProtocol, word: str):
        """Add a custom word from Settings."""
        if word:
            success = self.prediction.add_custom_word(word)
            self._send(websocket, 'word_added', {'word': word, 'success': success})

    def _get_dictionary_data(self, websocket: WebSocketServerProtocol):
        """Return all dictionary data for Settings UI."""
        data = self.prediction.get_dictionary_data()
        # Add sentence history
        data['sentence_history'] = [
            {'text': item['text'], 'count': item.get('count', 1)}
            for item in sorted(self.sentence_predictor.history,
                             key=lambda x: x.get('count', 0), reverse=True)[:100]
        ]
        data['sentence_count'] = len(self.sentence_predictor.history)
        self._send(websocket, 'dictionary_data', data)

    def _get_builtin_data(self, websocket: WebSocketServerProtocol):
        """Return built-in vocabulary and sentence templates (on-demand for Settings)."""
        data = self.prediction.get_builtin_data()
        # Add sentence templates
        data['sentence_templates'] = [
            {'prefix': t['p'], 'category': t.get('c', ''), 'sentences': t['s']}
            for t in self.sentence_predictor.templates
        ]
        data['template_count'] = sum(len(t['s']) for t in self.sentence_predictor.templates)
        self._send(websocket, 'builtin_data', data)

    def _add_abbreviation(self, websocket: WebSocketServerProtocol, abbrev: str, expansion: str):
        """Add a custom abbreviation."""
        success = self.prediction.add_custom_abbreviation(abbrev, expansion)
        self._send(websocket, 'abbreviation_added', {
            'abbrev': abbrev, 'expansion': expansion, 'success': success
        })

    def _remove_abbreviation(self, websocket: WebSocketServerProtocol, abbrev: str):
        """Remove a custom abbreviation."""
        success = self.prediction.remove_custom_abbreviation(abbrev)
        self._send(websocket, 'abbreviation_removed', {'abbrev': abbrev, 'success': success})

    def _add_sentence_template(self, websocket: WebSocketServerProtocol, sentence: str):
        """Manually add a sentence to the history (as if patient spoke it 5 times)."""
        if sentence and len(sentence.strip()) >= 3:
            s = sentence.strip()
            # Add to sentence predictor history with high count
            for item in self.sentence_predictor.history:
                if item['text'].lower() == s.lower():
                    item['count'] = max(item.get('count', 0), 5)
                    self.sentence_predictor._dirty = True
                    self._send(websocket, 'sentence_added', {'sentence': s, 'success': True})
                    return
            import time as _t
            self.sentence_predictor.history.append({'text': s, 'count': 5, 'last_used': _t.time()})
            self.sentence_predictor._dirty = True
            self.sentence_predictor.save()
            self._send(websocket, 'sentence_added', {'sentence': s, 'success': True})
        else:
            self._send(websocket, 'sentence_added', {'sentence': sentence, 'success': False})

    def _get_sentence_history(self, websocket: WebSocketServerProtocol):
        """Return sentence history for Settings UI."""
        history = [
            {'text': item['text'], 'count': item.get('count', 1)}
            for item in sorted(self.sentence_predictor.history,
                             key=lambda x: x.get('count', 0), reverse=True)[:100]
        ]
        self._send(websocket, 'sentence_history', {'sentences': history})

    def _get_phrases(self, websocket: WebSocketServerProtocol, category: Optional[str]):
        """Get phrase suggestions."""
        phrases = self.prediction.get_phrase_suggestions(category)
        self._send(websocket, 'phrases', {'phrases': phrases, 'category': category})

    def _expand_abbreviation(self, websocket: WebSocketServerProtocol, abbrev: str):
        """Expand an abbreviation."""
        expansion = self.prediction.expand_abbreviation(abbrev)
        self._send(websocket, 'abbreviation_expansion', {
            'abbreviation': abbrev,
            'expansion': expansion
        })

    def _get_chat_history_dir(self) -> Path:
        """Get chat_history folder path."""
        candidates = [
            Path(self.config.data_dir) / 'chat_history',
            # In packaged mode data_dir is typically <userData>/runtime-data/data.
            Path(self.config.data_dir).resolve().parents[1] / 'chat_history',
            Path(__file__).resolve().parents[1] / 'chat_history',
        ]

        for c in candidates:
            if c.exists():
                try:
                    c.mkdir(parents=True, exist_ok=True)
                except Exception:
                    pass
                return c

        chat_dir = candidates[0]
        chat_dir.mkdir(parents=True, exist_ok=True)
        return chat_dir

    def _prune_keyboard_chat_logs(self, chat_dir: Path):
        """Keep only newest keyboard chat log files."""
        files = sorted(chat_dir.glob('chat_*.txt'), key=lambda p: p.stat().st_mtime, reverse=True)
        keep = max(0, self.config.keyboard_chat_keep_files)
        for path in files[keep:]:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass

    def _prune_spoken_logs(self, chat_dir: Path):
        """Keep spoken logs bounded by age and file count."""
        files = sorted(chat_dir.glob('spoken_*.log'), key=lambda p: p.stat().st_mtime, reverse=True)
        if not files:
            return

        if not self.config.retain_spoken_logs:
            for path in files:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass
            return

        now_dt = datetime.datetime.now()
        cutoff = now_dt - datetime.timedelta(days=max(1, self.config.spoken_log_retention_days))
        kept: List[Path] = []

        for path in files:
            try:
                ts = datetime.datetime.fromtimestamp(path.stat().st_mtime)
            except Exception:
                ts = now_dt
            if ts >= cutoff:
                kept.append(path)
                continue
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass

        if len(kept) > self.config.spoken_log_max_files:
            for path in kept[self.config.spoken_log_max_files:]:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass

    def _save_chat_message(self, text: str):
        """Save spoken message to chat_history/spoken_YYYY-MM-DD.log (separate from Electron's display saves)."""
        if not self.config.retain_spoken_logs:
            return
        try:
            chat_dir = self._get_chat_history_dir()
            now = time.time()
            if now - self._last_spoken_prune_at >= 300:
                self._prune_spoken_logs(chat_dir)
                self._last_spoken_prune_at = now

            date_str = time.strftime('%Y-%m-%d')
            time_str = time.strftime('%H:%M:%S')
            spoken_file = chat_dir / f'spoken_{date_str}.log'
            with open(spoken_file, 'a', encoding='utf-8') as f:
                f.write(f'[{time_str}] {text}\n')
            # Also learn from this message immediately for predictions
            self._learn_sentence(text)
            logger.info(f"Spoken message saved to {spoken_file}")
        except Exception as e:
            logger.error(f"Failed to save chat message: {e}")

    def _speak(self, text: str):
        """Speak text via TTS."""
        if text:
            self.tts.speak(text)
            self._save_chat_message(text)
            if self.logger:
                self.logger.log_speak(text)

    def _get_fatigue(self, websocket: WebSocketServerProtocol):
        """Get fatigue metrics."""
        stats = self.fatigue.get_stats()
        recommendations = self.fatigue.get_recommendations()
        self._send(websocket, 'fatigue_metrics', {
            **stats,
            'recommendations': recommendations
        })

    def _set_filter_preset(self, preset: str):
        try:
            """Set gaze filter preset."""
            preset_enum = FilterPreset(preset)
            config = FilterConfig.from_preset(preset_enum)
            self.gaze_filter = GazeFilter2D(config)
            logger.info(f"Gaze filter set to {preset}")
        except ValueError:
            logger.warning(f"Invalid filter preset: {preset}")

    def _set_filter_params(self, data: Dict):
        """Set custom gaze filter parameters from frontend settings."""
        try:
            preset = data.get('preset')
            if preset:
                self._set_filter_preset(preset)
                return

            # Custom params
            min_cutoff = data.get('min_cutoff')
            beta = data.get('beta')
            d_cutoff = data.get('d_cutoff')

            if min_cutoff is not None:
                self.gaze_filter.config.min_cutoff = float(min_cutoff)
                self.gaze_filter.x_filter.config.min_cutoff = float(min_cutoff)
                self.gaze_filter.y_filter.config.min_cutoff = float(min_cutoff)
            if beta is not None:
                self.gaze_filter.config.beta = float(beta)
                self.gaze_filter.x_filter.config.beta = float(beta)
                self.gaze_filter.y_filter.config.beta = float(beta)
            if d_cutoff is not None:
                self.gaze_filter.config.d_cutoff = float(d_cutoff)
                self.gaze_filter.x_filter.config.d_cutoff = float(d_cutoff)
                self.gaze_filter.y_filter.config.d_cutoff = float(d_cutoff)

            logger.info(f"Filter params updated: min_cutoff={min_cutoff}, beta={beta}")
        except Exception as e:
            logger.error(f"Failed to set filter params: {e}")

    def _update_text(self, text: str):
        """Update visible text."""
        self.current_text = text
        if self.logger:
            self.logger.update_text(text)

    def _save_survey(self, data: Dict):
        """Save survey data to a file."""
        try:
            source_hint = 'survey'
            if isinstance(data, dict):
                source_hint = str(data.get('source') or source_hint)

            normalized = self._normalize_survey_payload(data, source_hint=source_hint)
            merged = self._merge_with_current_session(normalized)
            final_payload, main_path, wrote = self._persist_survey_payload(
                merged,
                source=source_hint,
                write_snapshot=False,
            )
            if wrote and isinstance(final_payload, dict):
                logger.info(
                    f"Survey data saved to {main_path} "
                    f"(session={final_payload.get('session_id')}, seq={final_payload.get('save_seq')})"
                )
            else:
                logger.debug("Survey save skipped (unchanged or throttled)")

        except Exception as e:
            logger.error(f"Failed to save survey data: {e}")

    def _load_survey(self, websocket):
        """Load saved survey data from file."""
        try:
            filepath = Path(self.config.survey_data_dir) / 'gaze_survey_data.json'
            if filepath.exists():
                with open(filepath, 'r', encoding='utf-8') as f:
                    survey_data = json.load(f)
                same_session = (
                    isinstance(survey_data, dict)
                    and str(survey_data.get('session_id') or '') == self._active_session_id
                )
                if same_session:
                    self._send(websocket, 'survey_loaded', {'survey_data': survey_data})
                    logger.info("Survey data loaded for active session")
                else:
                    self._send(websocket, 'survey_loaded', {'survey_data': None})
                    logger.info("Ignoring previous-session survey data for fresh app session")
            else:
                self._send(websocket, 'survey_loaded', {'survey_data': None})
                logger.info("No saved survey data found")
        except Exception as e:
            logger.error(f"Failed to load survey data: {e}")
            self._send(websocket, 'survey_loaded', {'survey_data': None})

    def _compile_survey(self, websocket, data: Dict):
        """Compile survey answers into structured output."""
        try:
            survey_dir = Path(self.config.survey_data_dir)
            survey_dir.mkdir(parents=True, exist_ok=True)
            normalized = self._normalize_survey_payload(data, source_hint='compile')
            merged = self._merge_with_current_session(normalized)

            answers = merged.get('answers', {}) if isinstance(merged.get('answers'), dict) else {}
            compass_map = merged.get('compass_map') if isinstance(merged.get('compass_map'), dict) else None
            save_meta = self._next_save_meta('compile')

            compiled = {
                'meta': {
                    'timestamp': save_meta['timestamp'],
                    'version': 2,
                    'session_id': self._active_session_id,
                    'save_seq': save_meta['save_seq'],
                    'save_id': save_meta['save_id'],
                    'confidence': answers.get('confidence', 'Unknown'),
                    'has_compass_map': isinstance(compass_map, dict),
                },
                'site': {k: v for k, v in answers.items() if k.startswith('plot_') or k.startswith('road_') or k == 'second_road_direction'},
                'ground_floor': {k: v for k, v in answers.items() if k.startswith('gf_')},
                'upper_floors': {k: v for k, v in answers.items() if k.startswith('ff_')},
                'dimensions': {k: v for k, v in answers.items() if k.startswith('dim_')},
                'layout': {k: v for k, v in answers.items() if k.startswith('loc_') or k.startswith('zone_') or k.startswith('coord_')},
                'connections': {k: v for k, v in answers.items() if k.endswith('_access') or k.endswith('_into') or k == 'corridor_width_ft'},
                'preferences': {k: v for k, v in answers.items() if k in ('vastu_level', 'design_style', 'special_requests', 'final_notes')},
                'raw_answers': answers
            }

            if isinstance(compass_map, dict):
                compiled['compass_map'] = compass_map

            filepath = survey_dir / 'gaze_survey_compiled.json'
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(compiled, f, indent=2)

            # Additional explicit cumulative artifact for external python tools.
            cumulative_path = survey_dir / 'gaze_survey_cumulative.json'
            cumulative_payload = {
                'meta': compiled['meta'],
                'answers': answers,
                'compass_map': compass_map if isinstance(compass_map, dict) else None,
                'session_id': self._active_session_id,
                'save_seq': save_meta['save_seq'],
                'save_id': save_meta['save_id'],
            }
            with open(cumulative_path, 'w', encoding='utf-8') as f:
                json.dump(cumulative_payload, f, indent=2)

            # Keep session log artifacts for session-safe script selection.
            _, _, session_dir = self._survey_paths()
            session_dir.mkdir(parents=True, exist_ok=True)
            with open(session_dir / f"{save_meta['save_seq']:04d}_compiled.json", 'w', encoding='utf-8') as f:
                json.dump(compiled, f, indent=2)
            with open(session_dir / f"{save_meta['save_seq']:04d}_cumulative.json", 'w', encoding='utf-8') as f:
                json.dump(cumulative_payload, f, indent=2)

            self._send(websocket, 'survey_compiled', {'compiled': compiled})
            logger.info(f"Survey compiled and saved to {filepath} (cumulative: {cumulative_path})")
        except Exception as e:
            logger.error(f"Failed to compile survey: {e}")

    def _snapshot_survey(self, websocket, data: Dict):
        """Save a snapshot of survey progress."""
        try:
            source_hint = 'snapshot'
            if isinstance(data, dict):
                source_hint = str(data.get('source') or source_hint)

            normalized = self._normalize_survey_payload(data, source_hint=source_hint)
            merged = self._merge_with_current_session(normalized)
            _, main_path, wrote = self._persist_survey_payload(
                merged,
                source=source_hint,
                write_snapshot=True,
            )
            self._send(websocket, 'survey_saved', {'status': 'ok'})
            if wrote:
                logger.info(f"Survey snapshot saved (main: {main_path})")
            else:
                logger.debug("Survey snapshot skipped (unchanged or throttled)")
        except Exception as e:
            logger.error(f"Failed to save survey snapshot: {e}")

    # â”€â”€ Web Hub Handlers (additive â€” no impact on gaze pipeline) â”€â”€â”€â”€â”€â”€

    async def _handle_get_news(self, websocket, category: str, limit: int):
        """Fetch and send news for a category."""
        if not self.news:
            self._send(websocket, 'news_data', {'category': category, 'items': [], 'cached': False})
            return
        try:
            items = await self.news.get_news(category, limit)
            cached = self.news.is_cached(category)
            self._send(websocket, 'news_data', {
                'category': category,
                'items': items,
                'cached': cached,
                'count': len(items),
            })
        except Exception as e:
            logger.error(f"News handler error: {e}")
            self._send(websocket, 'news_data', {'category': category, 'items': [], 'cached': False})

    async def _handle_refresh_news(self, websocket, category: str, limit: int):
        """Force-refresh a category and send updated items."""
        if not self.news:
            self._send(websocket, 'news_data', {'category': category, 'items': [], 'cached': False})
            return
        try:
            items = await self.news.get_news(category, limit, force_refresh=True)
            self._send(websocket, 'news_data', {
                'category': category,
                'items': items,
                'cached': False,
                'count': len(items),
            })
        except Exception as e:
            logger.error(f"News refresh error: {e}")
            self._send(websocket, 'news_data', {'category': category, 'items': [], 'cached': False})

    def _handle_news_categories(self, websocket):
        """Send available news categories."""
        categories = self.news.get_categories() if self.news else []
        self._send(websocket, 'news_categories', {'categories': categories})

    def _handle_knowledge_categories(self, websocket):
        """Send ALS knowledge categories."""
        categories = self.knowledge.get_categories() if self.knowledge else []
        self._send(websocket, 'knowledge_categories', {'categories': categories})

    def _handle_knowledge_articles(self, websocket, category_id: str):
        """Send articles for a knowledge category."""
        articles = self.knowledge.get_articles(category_id) if self.knowledge else []
        self._send(websocket, 'knowledge_articles', {
            'category_id': category_id,
            'articles': articles,
        })

    def _handle_knowledge_article(self, websocket, article_id: str):
        """Send full article content."""
        article = self.knowledge.get_article(article_id) if self.knowledge else None
        self._send(websocket, 'knowledge_article', {
            'article_id': article_id,
            'article': article,
        })

    def _handle_search_knowledge(self, websocket, query: str):
        """Search knowledge base and return results."""
        results = self.knowledge.search(query) if self.knowledge else []
        self._send(websocket, 'knowledge_search', {
            'query': query,
            'results': results,
        })

    async def _handle_fetch_article(self, websocket, url: str, force_refresh: bool):
        """Fetch extracted article text for AAC reader view."""
        if not self.article_reader:
            self._send(websocket, 'article_data', {'url': url, 'article': None})
            return
        try:
            article = await self.article_reader.fetch(url, force_refresh=bool(force_refresh))
            self._send(websocket, 'article_data', {
                'url': url,
                'article': article,
            })
        except Exception as e:
            logger.error(f"Article fetch handler error: {e}")
            self._send(websocket, 'article_data', {'url': url, 'article': None})

    async def _handle_get_quick_snapshot(self, websocket, force_refresh: bool):
        """Fetch quick card snapshot (weather/cricket/gold/stocks)."""
        if not self.quick_data:
            self._send(websocket, 'quick_snapshot', {'snapshot': None})
            return
        try:
            snapshot = await self.quick_data.get_snapshot(force_refresh=bool(force_refresh))
            self._send(websocket, 'quick_snapshot', {'snapshot': snapshot})
        except Exception as e:
            logger.error(f"Quick snapshot handler error: {e}")
            self._send(websocket, 'quick_snapshot', {'snapshot': None})

    async def _news_refresh_loop(self):
        """Background loop: refresh news every 15 minutes."""
        while True:
            try:
                if self.news:
                    # await self.news.refresh_all()
                    pass
                await asyncio.sleep(900)  # 15 minutes
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"News refresh loop error: {e}")
                await asyncio.sleep(60)

    # â”€â”€ Session / Survey Helpers (floorplan session-safe stack) â”€â”€â”€â”€â”€â”€â”€â”€

    def _generate_session_id(self) -> str:
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"sess_{ts}_{uuid.uuid4().hex[:8]}"

    def _survey_paths(self):
        survey_dir = Path(self.config.survey_data_dir)
        sessions_root = survey_dir / 'sessions'
        session_dir = sessions_root / self._active_session_id
        return survey_dir, sessions_root, session_dir

    def _next_save_meta(self, source: str) -> Dict[str, Any]:
        self._session_save_seq += 1
        ts = datetime.datetime.now().isoformat()
        return {
            'session_id': self._active_session_id,
            'save_seq': self._session_save_seq,
            'save_id': f"{self._active_session_id}_{self._session_save_seq:04d}",
            'timestamp': ts,
            'source': source,
        }

    def _read_json(self, path: Path) -> Optional[Dict[str, Any]]:
        try:
            if path.exists():
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
        return None

    def _fingerprint_survey_payload(self, payload: Dict[str, Any]) -> str:
        """Build a stable hash for dedup checks."""
        safe_payload = json.loads(json.dumps(payload, ensure_ascii=False, default=str))
        if isinstance(safe_payload.get('compass_map'), dict):
            safe_payload['compass_map'].pop('saved_at', None)
        normalized = json.dumps(
            safe_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(',', ':'),
        )
        return hashlib.sha1(normalized.encode('utf-8')).hexdigest()

    def _prune_directory_files(self, directory: Path, max_files: int):
        if max_files <= 0 or not directory.exists():
            return
        files = sorted(
            (p for p in directory.glob('*') if p.is_file()),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for stale in files[max_files:]:
            try:
                stale.unlink(missing_ok=True)
            except Exception:
                pass

    def _clear_directory_files(self, directory: Path):
        if not directory.exists():
            return
        for p in directory.glob('*'):
            if p.is_file():
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass

    def _prune_old_sessions(self, sessions_root: Path):
        if self.config.survey_keep_sessions <= 0 or not sessions_root.exists():
            return
        session_dirs = sorted(
            (p for p in sessions_root.glob('*') if p.is_dir()),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for stale_dir in session_dirs[self.config.survey_keep_sessions:]:
            try:
                for child in stale_dir.glob('*'):
                    if child.is_file():
                        child.unlink(missing_ok=True)
                stale_dir.rmdir()
            except Exception:
                pass

    def _prune_session_index(self, survey_dir: Path, sessions_root: Path):
        index_path = survey_dir / 'session_index.json'
        index = self._read_json(index_path)
        if not isinstance(index, dict):
            return

        sessions = index.get('sessions', {})
        if not isinstance(sessions, dict):
            sessions = {}

        active_ids = {p.name for p in sessions_root.glob('*') if p.is_dir()}
        pruned_sessions = {sid: meta for sid, meta in sessions.items() if sid in active_ids}
        if pruned_sessions == sessions and index.get('latest_session_id') in pruned_sessions:
            return

        index['sessions'] = pruned_sessions
        if self._active_session_id in pruned_sessions:
            index['latest_session_id'] = self._active_session_id
        else:
            index['latest_session_id'] = next(iter(pruned_sessions.keys()), None)

        try:
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(index, f, indent=2)
        except Exception:
            pass

    def _run_storage_maintenance(self):
        """Enforce retention limits on startup and during runtime."""
        survey_dir, sessions_root, _ = self._survey_paths()
        survey_dir.mkdir(parents=True, exist_ok=True)
        sessions_root.mkdir(parents=True, exist_ok=True)

        for session_dir in sessions_root.glob('*'):
            if session_dir.is_dir():
                self._prune_directory_files(session_dir, self.config.survey_session_file_limit)

        snap_dir = survey_dir / 'survey_snapshots'
        if self.config.survey_snapshot_file_limit <= 0:
            self._clear_directory_files(snap_dir)
        else:
            self._prune_directory_files(snap_dir, self.config.survey_snapshot_file_limit)
        self._prune_old_sessions(sessions_root)
        self._prune_session_index(survey_dir, sessions_root)

        chat_dir = self._get_chat_history_dir()
        self._prune_keyboard_chat_logs(chat_dir)
        self._prune_spoken_logs(chat_dir)

    def _normalize_survey_payload(self, data: Dict, source_hint: str = 'survey') -> Dict[str, Any]:
        raw = data if isinstance(data, dict) else {}
        if isinstance(raw.get('survey_data'), dict):
            raw = raw.get('survey_data', {})

        incoming_session = str(raw.get('session_id') or '')
        same_session = (not incoming_session) or incoming_session == self._active_session_id

        answers: Dict[str, Any] = {}
        if isinstance(raw.get('answers'), dict):
            answers = dict(raw.get('answers', {}))
        elif isinstance(raw.get('raw_answers'), dict):
            answers = dict(raw.get('raw_answers', {}))
        else:
            reserved = {
                'qIndex', 'q_index', 'phase', 'timestamp', 'source',
                'session_id', 'save_seq', 'save_id', 'compass_map',
                'meta', 'survey_data',
            }
            for k, v in raw.items():
                if k in reserved:
                    continue
                answers[k] = v

        # Prevent old-session carry-over when compass save comes from stale in-memory object.
        if not same_session and str(source_hint).startswith('compass'):
            answers = {}

        payload: Dict[str, Any] = {
            'answers': answers,
            'qIndex': raw.get('qIndex', raw.get('q_index', 0)),
            'phase': raw.get('phase', ''),
            'source': str(raw.get('source') or source_hint),
        }

        compass_map = raw.get('compass_map')
        if isinstance(compass_map, dict):
            payload['compass_map'] = compass_map

        return payload

    def _merge_with_current_session(self, incoming: Dict[str, Any]) -> Dict[str, Any]:
        survey_dir, _, _ = self._survey_paths()
        main_path = survey_dir / 'gaze_survey_data.json'
        existing = self._read_json(main_path) or {}
        existing_same_session = str(existing.get('session_id') or '') == self._active_session_id
        base = existing if existing_same_session else {}

        base_answers = base.get('answers', {}) if isinstance(base.get('answers'), dict) else {}
        incoming_answers = incoming.get('answers', {}) if isinstance(incoming.get('answers'), dict) else {}
        merged_answers = {**base_answers, **incoming_answers}

        merged: Dict[str, Any] = {
            'answers': merged_answers,
            'qIndex': incoming.get('qIndex', base.get('qIndex', 0)),
            'phase': incoming.get('phase', base.get('phase', '')),
            'source': incoming.get('source', base.get('source', 'survey')),
        }

        compass_map = incoming.get('compass_map')
        if not isinstance(compass_map, dict):
            compass_map = base.get('compass_map')
        if isinstance(compass_map, dict):
            merged['compass_map'] = compass_map

        return merged

    def _persist_survey_payload(self, payload: Dict[str, Any], source: str, write_snapshot: bool = False):
        survey_dir, sessions_root, session_dir = self._survey_paths()
        survey_dir.mkdir(parents=True, exist_ok=True)
        sessions_root.mkdir(parents=True, exist_ok=True)
        session_dir.mkdir(parents=True, exist_ok=True)
        main_path = survey_dir / 'gaze_survey_data.json'

        now_ms = int(time.time() * 1000)
        fingerprint = self._fingerprint_survey_payload(payload)
        src = str(source or '').lower()
        is_manual_source = src in {'manual', 'compass-map-manual', 'survey-manual'}

        if not write_snapshot:
            if fingerprint == self._last_survey_fingerprint:
                return None, main_path, False
            if (
                not is_manual_source
                and
                self._last_survey_write_at > 0
                and (now_ms - self._last_survey_write_at) < self.config.survey_min_save_interval_ms
            ):
                return None, main_path, False
        else:
            if (
                fingerprint == self._last_snapshot_fingerprint
                and self._last_snapshot_write_at > 0
                and (now_ms - self._last_snapshot_write_at) < self.config.survey_min_snapshot_interval_ms
            ):
                return None, main_path, False

        meta = self._next_save_meta(source)
        final_payload = dict(payload)
        final_payload.update(meta)

        with open(main_path, 'w', encoding='utf-8') as f:
            json.dump(final_payload, f, indent=2)

        session_path = session_dir / f"{meta['save_seq']:04d}_{source}.json"
        with open(session_path, 'w', encoding='utf-8') as f:
            json.dump(final_payload, f, indent=2)

        if write_snapshot:
            snap_dir = survey_dir / 'survey_snapshots'
            snap_dir.mkdir(parents=True, exist_ok=True)
            if self.config.survey_snapshot_file_limit > 0:
                ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
                snap_path = snap_dir / f'snapshot_{ts}.json'
                with open(snap_path, 'w', encoding='utf-8') as f:
                    json.dump(final_payload, f, indent=2)

        # Readable summary: write on interval, not every save.
        if (
            self._last_summary_write_at <= 0
            or (now_ms - self._last_summary_write_at) >= self.config.survey_summary_write_interval_ms
            or source in {'compile', 'manual'}
        ):
            txt_path = survey_dir / 'gaze_survey_summary.txt'
            with open(txt_path, 'w', encoding='utf-8') as f:
                f.write("GAZEPLAN PRO - USER SURVEY\n")
                f.write("==========================\n\n")
                for key, value in final_payload.items():
                    f.write(f"{key}: {value}\n")
            self._last_summary_write_at = now_ms

        # Session index for external scripts: throttle writes.
        if (
            self._last_index_write_at <= 0
            or (now_ms - self._last_index_write_at) >= self.config.survey_index_write_interval_ms
            or source in {'compile'}
        ):
            index_path = survey_dir / 'session_index.json'
            index = self._read_json(index_path) or {'sessions': {}, 'latest_session_id': None}
            sessions = index.get('sessions', {})
            if not isinstance(sessions, dict):
                sessions = {}
            sessions[self._active_session_id] = {
                'last_saved_at': meta['timestamp'],
                'last_save_seq': meta['save_seq'],
                'last_source': source,
                'latest_file': str(session_path),
            }
            index['sessions'] = sessions
            index['latest_session_id'] = self._active_session_id
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(index, f, indent=2)
            self._last_index_write_at = now_ms

        self._last_survey_fingerprint = fingerprint
        self._last_survey_write_at = now_ms
        if write_snapshot:
            self._last_snapshot_fingerprint = fingerprint
            self._last_snapshot_write_at = now_ms

        if (now_ms - self._last_survey_prune_at) >= 15000:
            snap_dir = survey_dir / 'survey_snapshots'
            self._prune_directory_files(session_dir, self.config.survey_session_file_limit)
            if self.config.survey_snapshot_file_limit <= 0:
                self._clear_directory_files(snap_dir)
            else:
                self._prune_directory_files(snap_dir, self.config.survey_snapshot_file_limit)
            self._prune_old_sessions(sessions_root)
            self._prune_session_index(survey_dir, sessions_root)
            self._last_survey_prune_at = now_ms

        return final_payload, main_path, True

    async def _websocket_handler(self, websocket: WebSocketServerProtocol, *args):
        """Handle WebSocket connection."""
        self.connected_clients.add(websocket)
        logger.info(f"Client connected ({len(self.connected_clients)} total)")

        # Send initial state
        self._send(websocket, 'connected', {
            'gaze_enabled': self.gaze_enabled,
            'current_screen': self.current_screen,
            'tobii_connected': self.tobii.is_connected
        })

        try:
            async for message in websocket:
                await self._handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.discard(websocket)
            logger.info(f"Client disconnected ({len(self.connected_clients)} remaining)")

    async def _periodic_tasks(self):
        """Run periodic background tasks."""
        while True:
            try:
                # Check break reminders
                break_status = self.breaks.update()

                # Check dry eye
                blink_rate = self.fatigue.blink_detector.get_blink_rate()
                dry_eye_status = self.dry_eye.update(blink_rate)

                if dry_eye_status == 'tears_reminder':
                    self._broadcast('dry_eye_reminder', {
                        'message': 'Consider using artificial tears to keep your eyes comfortable.'
                    })

                # Log pipeline stats periodically
                if hasattr(self, 'gravity_well') and self.gravity_well._initialized:
                    logger.debug(
                        f"[GRAVITY_WELL] zone={self.gravity_well._current_zone} "
                        f"mult={self.gravity_well._current_multiplier:.3f}"
                    )

                # Periodically save prediction data (every 60s)
                if time.time() - self._last_prediction_save > 60:
                    self.prediction.save()
                    self.sentence_predictor.save()
                    self._last_prediction_save = time.time()

                await asyncio.sleep(5)  # Check every 5 seconds

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic task error: {e}")
                await asyncio.sleep(5)

    async def start(self):
        """Start the backend server."""
        logger.info("Starting GazeConnect Pro Backend...")

        # Store event loop reference for thread-safe WebSocket sends
        self._event_loop = asyncio.get_running_loop()

        # Connect to Tobii
        if self.config.tobii_enabled:
            if await self.tobii.connect():
                logger.info("Tobii connection successful")
            else:
                logger.warning("Running without Tobii eye tracker")

        # Load saved prediction data
        data_file = Path(self.config.data_dir) / 'prediction_data.json'
        self.prediction.load()

        # Learn from saved chat history to improve predictions
        chat_dir = self._get_chat_history_dir()
        self.prediction.learn_from_chat_history(str(chat_dir))
        logger.info(f"Chat history folder: {chat_dir}")

        # Enforce retention limits at startup as well.
        self._run_storage_maintenance()

        # Start WebSocket server
        if WEBSOCKETS_AVAILABLE:
            # Try preferred port, fall back if occupied
            actual_port = self.config.websocket_port
            try:
                server = await websockets.serve(
                    self._websocket_handler,
                    self.config.websocket_host,
                    actual_port
                )
            except OSError as e:
                if e.errno == 10048 or 'address already in use' in str(e).lower():
                    logger.warning(f"Port {actual_port} is in use, searching for available port...")
                    try:
                        actual_port = find_available_port(actual_port + 1)
                        server = await websockets.serve(
                            self._websocket_handler,
                            self.config.websocket_host,
                            actual_port
                        )
                        logger.info(f"Using fallback port {actual_port}")
                    except RuntimeError:
                        logger.error(f"No available ports found near {self.config.websocket_port}!")
                        logger.error("Another instance is likely already running.")
                        return
                else:
                    raise
            logger.info(f"WebSocket server started on ws://{self.config.websocket_host}:{actual_port}")

            # Start periodic tasks
            periodic = asyncio.create_task(self._periodic_tasks())

            # FIX v4.7: Start dedicated gaze broadcast loop
            gaze_loop = asyncio.create_task(self._gaze_broadcast_loop())

            # Web Hub: background news refresh (additive)
            news_refresh = asyncio.create_task(self._news_refresh_loop())

            try:
                await asyncio.Future()  # Run forever
            except asyncio.CancelledError:
                pass
            finally:
                periodic.cancel()
                gaze_loop.cancel()
                news_refresh.cancel()
                server.close()
                await server.wait_closed()
        else:
            logger.error("Cannot start server without websockets package")

    def stop(self):
        """Stop the backend."""
        logger.info("Stopping GazeConnect Pro Backend...")

        # Disconnect Tobii
        self.tobii.disconnect()

        # Save prediction data
        data_file = Path(self.config.data_dir) / 'prediction_data.json'
        self.prediction.save()
        self.sentence_predictor.save()

        logger.info("Backend stopped")

# ============================================
# MAIN ENTRY POINT
# ============================================

def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='GazeConnect Pro Backend')
    parser.add_argument('--host', default='localhost', help='WebSocket host')
    parser.add_argument('--port', type=int, default=8765, help='WebSocket port')
    parser.add_argument('--simulate', action='store_true', help='Simulate Tobii data')
    parser.add_argument('--no-tobii', action='store_true', help='Disable Tobii')
    parser.add_argument('--data-dir', default='./data', help='Data directory')
    parser.add_argument('--survey-data-dir', default='./survey_data', help='Survey data directory')

    args = parser.parse_args()

    config = ServerConfig(
        websocket_host=args.host,
        websocket_port=args.port,
        tobii_enabled=not args.no_tobii,
        tobii_simulated=args.simulate,
        data_dir=args.data_dir,
        survey_data_dir=args.survey_data_dir
    )

    backend = GazeConnectBackend(config)

    try:
        asyncio.run(backend.start())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        backend.stop()

if __name__ == '__main__':
    main()

