"""
GazeConnect Pro - Ultimate Backend Server
=========================================
Complete Python backend orchestrating all services.

Components:
- WebSocket server for Electron communication
- Tobii Eye Tracker 5 integration (measured source rate)
- Elapsed-time adaptive cursor stabilization
- Renderer-owned dwell selection with a target geometry registry
- Word prediction engine
- Fatigue monitoring
- Text-to-speech
- PyAutoGUI automation
- Session logging

Architecture:
    Electron (React) <--> WebSocket <--> Python Backend <--> Tobii SDK
"""

import asyncio
import os
import socket
import sys
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
    level=logging.DEBUG if os.environ.get('GAZE_DEBUG') == '1' else logging.INFO,
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
from services.gaze_sample import GazePoint
from services.adaptive_cursor_filter import AdaptiveCursorFilter, FILTER_PROFILES, normalize_filter_preset
from services.gaze_classifier import GazeClassifier
from services.signal_conditioner import SignalConditioner, GazeValidity
from services.calibration import (
    CalibrationSession, CalibrationStorage, GazeCalibrationCorrector
)
from services.gaze_targets import TargetRegistry, GazeTarget, ButtonSize
from services.word_prediction import (
    WordPredictionEngine, AAC_PHRASES, ABBREVIATIONS
)
from services.sentence_prediction import SentencePredictor
from services.deterministic_prediction.engine import confirmed_history
from services.deterministic_prediction.facade import DeterministicPredictionFacade
from services.deterministic_prediction.jsutil import current_prefix
from services.deterministic_prediction.learning import PredictionLearningStore
from services.deterministic_prediction.policy import load_english_only_withheld
from services.deterministic_prediction.service import (
    ENGINE_VERSION as DETERMINISTIC_ENGINE_VERSION,
    EnglishOnlyText,
    WordPredictionService,
)
from prediction_guardrails import (
    contains_blocked_prediction_word,
    is_blocked_prediction_word,
    tokenize_prediction_text,
)
import threading
import queue
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

try:
    from automation.automation import get_automation
    AUTOMATION_AVAILABLE = True
except Exception as e:
    logger.warning(f"PyAutoGUI automation unavailable: {e}")
    get_automation = None
    AUTOMATION_AVAILABLE = False


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
    # Set by Electron (--parent-pid): stop when that process ends, so a killed or
    # crashed app never leaves this process holding its port. 0 = not watched.
    parent_pid: int = 0
    # Word prediction: 'deterministic' (GazeCompass port, default) or 'legacy'
    # (previous n-gram + ONNX engine, kept only as a rollback).
    prediction_engine: str = 'deterministic'
    # Where deterministic scoring runs: 'process' keeps CPU work off the gaze
    # loop; 'thread' and 'inline' exist for tests and constrained fallbacks.
    prediction_execution: str = 'process'
    # Neural sentence continuation loads onnxruntime; off unless asked for.
    enable_neural_sentence_continuation: bool = False
    # Where the one-time, read-only migration looks for legacy learned words.
    # None = the data dir plus the legacy engine's working-directory ./data.
    prediction_legacy_data_dirs: Optional[List[str]] = None

# ============================================
# PORT UTILITIES
# ============================================

class PortInUseError(RuntimeError):
    """The fixed WebSocket port is held by something else."""


def ensure_port_available(host: str, port: int) -> None:
    """Refuse to start when the port is taken, instead of moving to another one.

    The interface always connects to the configured port (the default in
    `src/hooks/useWebSocket.tsx`), so a backend that quietly moved elsewhere
    would look healthy while the app talked to whatever still holds this one --
    usually a stale backend from an earlier launch, with its own state and no
    eye tracker. That failure is silent, which is worse than not starting.

    The probe deliberately sets no SO_REUSEADDR: on Windows that option lets a
    second socket bind a port that is already listening, which is exactly the
    situation being detected.
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((host, port))
    except OSError as exc:
        raise PortInUseError(
            f"Port {port} is already in use, so the backend did not start. "
            f"Another GazeConnect backend is the usual reason: run status-dev.bat to see "
            f"what holds it, then stop-dev.bat. ({exc})"
        ) from exc
    finally:
        probe.close()


def watch_parent_process(parent_pid: int, on_gone) -> threading.Thread:
    """Call `on_gone` once the process `parent_pid` has ended.

    Electron passes its own process id. When Electron goes away without running
    its own shutdown -- killed, crashed, or its launcher window closed -- this is
    the only notice the backend gets; without it the backend keeps its WebSocket
    port, and the next launch either refuses to start or connects to it.

    It waits on the process itself and never reads stdin. The first version
    (23 Sep 2026) waited for the stdin pipe to close instead, and on Windows a
    thread blocked reading stdin made the prediction worker fail to start
    ("Access is denied" inside multiprocessing.spawn): the keyboard showed no
    word predictions at all. python/tests/test_port_contract.py now asks a
    backend started exactly this way for predictions.

    On Windows the wait holds a handle to the process, so a reused process id
    can never be mistaken for the parent.
    """
    def wait() -> None:
        if sys.platform == 'win32':
            import _winapi
            try:
                handle = _winapi.OpenProcess(_winapi.SYNCHRONIZE, False, parent_pid)
            except OSError as exc:
                if getattr(exc, 'winerror', None) == 87:      # No such process: already gone.
                    on_gone()
                else:
                    logger.warning(f"Cannot watch the parent process {parent_pid}: {exc}")
                return
            try:
                _winapi.WaitForSingleObject(handle, _winapi.INFINITE)
            finally:
                _winapi.CloseHandle(handle)
        else:
            while True:
                try:
                    os.kill(parent_pid, 0)
                except ProcessLookupError:
                    break
                except PermissionError:
                    pass                  # Alive, owned by someone else.
                time.sleep(1.0)
        on_gone()

    thread = threading.Thread(target=wait, name='parent-process-watch', daemon=True)
    thread.start()
    return thread

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
        self._stopping = False
        self._loss_reported = False
        self._tracking_epoch = None
        self.last_status: Optional[Dict[str, Any]] = None

        # Device info (from TobiiHelper)
        self.device_name = ""
        self.serial_number = ""
        self.sampling_rate = 0  # Unknown until measured/reported

        # Callbacks
        self.on_gaze: Optional[callable] = None
        self.on_status: Optional[callable] = None
        self.on_presence: Optional[callable] = None

        # Simulation
        self._sim_task: Optional[asyncio.Task] = None

    MAX_MESSAGE_BYTES = 16384
    SILENCE_TIMEOUT_SECONDS = 0.150

    async def connect(self) -> bool:
        """Start one receiver supervisor; it recovers until explicitly stopped."""
        self._stopping = False
        if self.simulated:
            if self._sim_task is None or self._sim_task.done():
                self._sim_task = asyncio.create_task(self._simulate_gaze())
            self.is_connected = True
            return True
        if self._receive_task is not None and not self._receive_task.done():
            return self.is_connected
        connected = await self._open_connection()
        self._receive_task = asyncio.create_task(self._receive_loop())
        return connected

    async def _open_connection(self):
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.helper_host, self.helper_port,
                                        limit=self.MAX_MESSAGE_BYTES), timeout=2.0)
            self.is_connected = True
            self._loss_reported = False
            self._tracking_epoch = None
            logger.info("Connected to TobiiHelper")
            self._helper_link_changed()
            return True
        except (OSError, asyncio.TimeoutError):
            self.is_connected = False
            self._helper_link_changed()
            return False

    def _helper_link_changed(self):
        """A status from a previous helper connection says nothing about now."""
        self.last_status = None
        if self.on_status:
            self.on_status(None)

    def _report_loss(self):
        if self._loss_reported:
            return
        self._loss_reported = True
        if self.on_gaze:
            self.on_gaze(GazePoint(x=0.5, y=0.5, timestamp=time.time(),
                                  left_valid=False, right_valid=False,
                                  confidence=0.0, validity_source='transport'))

    async def _receive_loop(self):
        """Bounded framing, disconnect recovery, and a silent-source watchdog."""
        try:
            while not self._stopping:
                if not self.is_connected:
                    self._report_loss()
                    await asyncio.sleep(1.0)
                    if self._stopping or not await self._open_connection():
                        continue
                try:
                    line = await asyncio.wait_for(self._reader.readline(),
                                                  self.SILENCE_TIMEOUT_SECONDS)
                    if not line:
                        raise ConnectionError('TobiiHelper closed the connection')
                    if len(line) > self.MAX_MESSAGE_BYTES:
                        raise ValueError('TobiiHelper message exceeds protocol limit')
                    await self._process_message(line.decode('utf-8'))
                except asyncio.TimeoutError:
                    self._report_loss()
                except (OSError, ValueError, UnicodeError):
                    self._report_loss()
                    self.is_connected = False
                    if self._writer:
                        self._writer.close()
                        self._writer = None
                    self._reader = None
                    self._helper_link_changed()
        except asyncio.CancelledError:
            pass
        finally:
            self.is_connected = False
            if self._writer:
                self._writer.close()
                self._writer = None
            self._reader = None

    async def _process_message(self, message: str):
        """Process a JSON message from TobiiHelper."""
        try:
            data = json.loads(message)
            msg_type = data.get('type', '')

            if msg_type == 'gaze':
                # Keep the calibrated vendor coordinate geometry unchanged.
                # Missing/nonfinite positions never default to a valid center.
                p_x = float(data.get('x', data.get('combined_x', float('nan'))))
                p_y = float(data.get('y', data.get('combined_y', float('nan'))))
                stamp = SignalConditioner._normalize_timestamp(data.get('timestamp'))
                left = data.get('left') if isinstance(data.get('left'), dict) else {}
                right = data.get('right') if isinstance(data.get('right'), dict) else {}
                has_eyes = ('left_valid' in data or 'right_valid' in data or
                            'valid' in left or 'valid' in right)
                explicit_valid = data.get('is_valid')
                if has_eyes:
                    left_valid = data.get('left_valid', left.get('valid')) is True
                    right_valid = data.get('right_valid', right.get('valid')) is True
                    if explicit_valid is False:
                        left_valid = right_valid = False
                    source = 'reported'
                else:
                    # Interaction supplies combined gaze validity, not two eye
                    # validity values or a measured accuracy/confidence score.
                    left_valid = right_valid = explicit_valid is True
                    source = 'combined' if explicit_valid is not None else 'missing'
                confidence = float(data.get('confidence', 0.75 if explicit_valid is True else 0.0))
                if not has_eyes and math.isfinite(confidence):
                    confidence = min(confidence, 0.75)
                if not all(math.isfinite(v) for v in (p_x, p_y, stamp, confidence)):
                    left_valid = right_valid = False
                    confidence = 0.0
                point = GazePoint(x=p_x, y=p_y, timestamp=stamp,
                                  left_valid=left_valid, right_valid=right_valid,
                                  confidence=confidence, validity_source=source)
                epoch = data.get('tracking_epoch')
                if epoch is not None:
                    if (self._tracking_epoch is not None and epoch != self._tracking_epoch
                            and point.is_valid and self.on_gaze):
                        # A capacity-one source mailbox may supersede an invalid
                        # point; its epoch preserves the loss edge for selectors.
                        self.on_gaze(GazePoint(.5, .5, stamp - .000001,
                                              False, False, 0.0, 'interrupted'))
                    self._tracking_epoch = epoch
                self.last_gaze = point
                self._loss_reported = not point.is_valid
                if self.on_gaze:
                    self.on_gaze(point)

            elif msg_type == 'status':
                # Low-rate engine state from the helper (why there is or is
                # not gaze). Logged on change only: it arrives every second.
                device_name = str(data.get('device_name', '') or '')
                if device_name and device_name != self.device_name:
                    logger.info(f"Tobii device: {device_name} (S/N: {data.get('serial_number', '')})")
                self.device_name = device_name or self.device_name
                self.serial_number = data.get('serial_number', self.serial_number)
                self.sampling_rate = data.get('sampling_rate', self.sampling_rate)
                previous = (self.last_status or {}).get('stream_state')
                self.last_status = data
                if data.get('stream_state') != previous:
                    logger.info(f"[TOBII] stream_state={data.get('stream_state')} "
                                f"device={data.get('device_status')} presence={data.get('user_presence')} "
                                f"gaze={data.get('gaze_tracking')} recoveries={data.get('recoveries')}")

                if self.on_status:
                    self.on_status(data)

            elif msg_type == 'presence':
                if self.on_presence:
                    self.on_presence(data.get('is_present', True))

        except (json.JSONDecodeError, ValueError, TypeError, AttributeError):
            self._report_loss()
            logger.debug('Rejected malformed TobiiHelper message')

    def disconnect(self):
        """Cancel the supervisor, including any pending retry; close the socket."""
        self._stopping = True
        for task in (self._sim_task, self._receive_task):
            if task:
                task.cancel()
        self._sim_task = self._receive_task = None
        if self._writer:
            self._writer.close()
        self._writer = self._reader = None
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
    """Text-to-speech engine.

    All pyttsx3 work runs on a dedicated worker thread so runAndWait() no
    longer blocks the asyncio event loop — the verified #1 gaze-freeze
    source (cursor froze for the full utterance; see
    docs/EYE_TRACKING_COMPARISON.md §4.1). Verified on the real rig
    2026-06-11: pipeline ticked through a live utterance uninterrupted,
    zero stale-sample drops (docs/EYE_TRACKING_CHANGES.md, A/B results).
    The worker owns the engine (SAPI5/COM thread affinity).

    Rollback to the old synchronous behavior without a code edit:
    set GAZECONNECT_TTS_ASYNC=0 before starting the backend.
    """

    def __init__(self, enabled: bool = True):
        self.engine = None
        self.is_speaking = False
        self.enabled = enabled
        # Default ON since the 2026-06-11 on-rig A/B; '0'/'false'/'no'/'off' reverts to sync.
        self.async_mode = os.environ.get('GAZECONNECT_TTS_ASYNC', '1').strip().lower() not in ('0', 'false', 'no', 'off')
        self._queue: Optional['queue.Queue'] = None
        self._worker: Optional[threading.Thread] = None

        if not self.enabled:
            return

        if not TTS_AVAILABLE:
            return

        if self.async_mode:
            self._queue = queue.Queue()
            self._worker = threading.Thread(target=self._worker_loop, name='tts-worker', daemon=True)
            self._worker.start()
            logger.info("TTS engine: async worker mode (default; set GAZECONNECT_TTS_ASYNC=0 to revert to sync)")
            return

        logger.info("TTS engine: synchronous mode (GAZECONNECT_TTS_ASYNC=0)")

        self._init_engine()

    def _init_engine(self):
        """Initialize pyttsx3 on the calling thread (engine has thread affinity)."""
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

            self.init_failed = False
            logger.info("TTS engine initialized")
        except Exception as e:
            logger.error(f"TTS initialization error: {e}")
            self.engine = None
            self.init_failed = True

    @property
    def available(self) -> bool:
        """True when speaking can plausibly produce audio.

        Reported to clients in the 'connected' handshake so the frontend can
        fall back to browser speechSynthesis instead of going silently mute
        when the socket is healthy but TTS is not (pyttsx3 missing,
        tts_enabled=False, or engine init failure). A mid-session engine
        wedge is not detectable here — that residual risk is documented in
        docs/EYE_TRACKING_CHANGES.md.
        """
        if not self.enabled or not TTS_AVAILABLE:
            return False
        if getattr(self, 'init_failed', False):
            return False
        if self.async_mode:
            return self._queue is not None
        return self.engine is not None

    def _worker_loop(self):
        """Async mode: own the engine and process commands off the event loop."""
        self._init_engine()
        while True:
            cmd, value = self._queue.get()
            try:
                if cmd == 'speak':
                    if self.engine:
                        self.is_speaking = True
                        self.engine.say(value)
                        self.engine.runAndWait()
                    else:
                        logger.warning(f"TTS not available. Would speak: {value}")
                elif cmd == 'rate':
                    if self.engine:
                        self.engine.setProperty('rate', value)
                elif cmd == 'volume':
                    if self.engine:
                        self.engine.setProperty('volume', max(0.0, min(1.0, value)))
            except Exception as e:
                logger.error(f"TTS error: {e}")
            finally:
                self.is_speaking = False

    def speak(self, text: str):
        """Speak text."""
        if self.async_mode and self._queue is not None:
            self._queue.put(('speak', text))
            return

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
        if self.async_mode and self._queue is not None:
            # Drop queued utterances, then interrupt the current one.
            try:
                while not self._queue.empty():
                    self._queue.get_nowait()
            except Exception:
                pass
        if self.engine:
            try:
                self.engine.stop()
            except:
                pass
        self.is_speaking = False

    def set_rate(self, rate: int):
        """Set speech rate (words per minute)."""
        if self.async_mode and self._queue is not None:
            self._queue.put(('rate', rate))
            return
        if self.engine:
            self.engine.setProperty('rate', rate)

    def set_volume(self, volume: float):
        """Set volume (0.0 to 1.0)."""
        if self.async_mode and self._queue is not None:
            self._queue.put(('volume', max(0.0, min(1.0, volume))))
            return
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
    ACTIVE_PIPELINE_NAME = "adaptive_cursor_v1"
    SAMPLE_RATE_WINDOW = 120
    # Tracker noise straddles the window boundary when the user looks at an
    # edge target (the bottom keyboard row sits against the taskbar edge), so
    # one out-of-window sample is not a departure. Such samples are never
    # published or clamped; they are simply not allowed to wipe the filter and
    # target state until they persist, stray far, or follow gaze that was not
    # resting beside that edge. Shorter than every 150 ms freshness horizon.
    EDGE_NOISE_HOLD_SECONDS = 0.070
    EDGE_NOISE_MARGIN_PX = 64.0
    EDGE_NOISE_NEAR_PX = 128.0
    # Invalid gaze is never selectable, and every loss still clears the live
    # filter and target state at once. But re-seeding the cursor at a raw sample
    # after every blink or stray edge sample is the hop seen after blinks and
    # the juggling along the bottom row. So a loss of a resumable kind suspends
    # the DISPLAY state, and the next valid sample restores it if the loss was
    # this short. Losing focus, stale or reordered data never resume.
    # 1 s, the interface's own horizon (GAZE_RECOVERY_MS): it pauses a dwell
    # through a loss this long and then continues it, so the cursor continues
    # the same fixation too. At 400 ms, a dropout of 0.4-1 s (frequent near the
    # bottom of the screen, where the tracker loses the eyes for a moment)
    # re-seeded the cursor at the first, noisiest sample back: a hop while the
    # dwell itself carried on (22 Sep 2026).
    DISPLAY_RESUME_SECONDS = 1.000
    DISPLAY_RESUMABLE_LOSSES = ('blink', 'lost', 'oob', 'outside_window')
    # Maintainer decision, 21 Sep 2026 (AGENTS.md): the tracker sits under the
    # screen and is least accurate along the bottom row, where a live recording
    # showed gaze reported below the screen for 0.3-0.8 s at a time while a
    # bottom control was being looked at. Nothing selectable exists beyond the
    # glass, so gaze reported this little past a PHYSICAL screen edge is taken
    # to be at that edge. 48 CSS px is about 13 mm on the validated 23 inch
    # display, inside the tracker's own error at 60 cm. It applies only where
    # the window edge IS the screen edge (full screen; top and sides when
    # maximised). An edge that borders other UI - the taskbar, another window -
    # stays strict, and anything farther out is rejected as before.
    SCREEN_EDGE_BAND_PX = 48.0
    SCREEN_EDGE_ALIGNED_PX = 2.0
    SCREEN_EDGE_INSET_PX = 1.0

    ACTIVE_FILTER_PROFILES = FILTER_PROFILES

    def __init__(self, config: Optional[ServerConfig] = None):
        self.config = config or ServerConfig()
        self._event_loop = None
        self._shutdown = None
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

        # Single elapsed-time filter after validity + coordinate mapping.
        self.signal_conditioner = SignalConditioner()
        self.calibration_corrector = GazeCalibrationCorrector()
        self.calibration_session: Optional[CalibrationSession] = None
        self.calibration_active = False
        self.gaze_classifier = GazeClassifier()  # Diagnostics, not selection gating.
        self.cursor_filter = AdaptiveCursorFilter('balanced')
        self.active_filter_preset = 'balanced'
        self.active_pipeline_name = self.ACTIVE_PIPELINE_NAME
        self._sample_dt_history = deque(maxlen=self.SAMPLE_RATE_WINDOW)
        self._last_sample_rate_ts: Optional[float] = None
        self._measured_sample_rate_hz = 0.0
        self.target_registry = TargetRegistry()
        self.word_service: Optional[WordPredictionService] = None
        self._prediction_tasks: Set[asyncio.Task] = set()
        self._english_only = EnglishOnlyText(load_english_only_withheld())
        if self.config.prediction_engine == 'legacy':
            self.prediction = WordPredictionEngine()
        else:
            patient_dir = Path(self.config.data_dir) / 'patient_data'
            # The legacy engine was constructed without a data_dir, so its
            # history lives under the working directory's ./data. Both places
            # are read (never written) by the one-time migration.
            legacy_dirs = []
            candidates = (self.config.prediction_legacy_data_dirs
                          if self.config.prediction_legacy_data_dirs is not None
                          else [self.config.data_dir, './data'])
            for candidate in candidates:
                resolved = Path(candidate).resolve()
                if resolved not in legacy_dirs:
                    legacy_dirs.append(resolved)
            store = PredictionLearningStore(patient_dir, legacy_dirs=legacy_dirs)
            self.prediction = DeterministicPredictionFacade(
                store, Path(self.config.data_dir), legacy_dirs, self._english_only,
                enable_neural_sentence_continuation=self.config.enable_neural_sentence_continuation,
            )
            self.prediction.load()
            self.word_service = WordPredictionService(
                store,
                execution=self.config.prediction_execution,
                content_items=self.prediction.caregiver_content_items,
            )
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

        # Explicit mapping: primary-screen normalized -> native content DIP ->
        # viewport CSS coordinates. Legacy clients retain their former fallback.
        self.screen_width = 1920
        self.screen_height = 1080
        self.physical_width = 1920
        self.physical_height = 1080
        self.dpr = 1.0
        self.window_x = 0
        self.window_y = 0
        self.screen_origin_x = 0
        self.screen_origin_y = 0
        self.content_width = None
        self.content_height = None
        self.screen_units = None
        # Live hardware waits for foreground content geometry. Headless/offline
        # tests explicitly disable the Tobii service and exercise the pipeline.
        self.gaze_active = not self.config.tobii_enabled
        self._last_sample_timestamp = None
        self._last_sample_received = None
        self._tracking_lost = False
        self._last_inside_px: Optional[tuple] = None
        self._edge_outside_since: Optional[float] = None
        self._suspended_display: Optional[Dict[str, Any]] = None
        self._last_tracker_status: Optional[Dict[str, Any]] = None
        self._gaze_send_tasks = {}
        self._gaze_offset_x = 0     # Manual gaze X offset in CSS pixels (from Settings)
        self._gaze_offset_y = 0     # Manual gaze Y offset in CSS pixels (from Settings)
        self._content_chrome = 0     # v13: chrome height in CSS px (title bar + taskbar)
        self._last_gaze_payload: Optional[Dict[str, Any]] = None

        # Setup callbacks
        self._setup_callbacks()
        self._load_calibration_profile()
        self._apply_active_filter_profile(self.active_filter_preset)

    def _setup_callbacks(self):
        """Setup internal callbacks."""
        # Tobii gaze callback
        self.tobii.on_gaze = self._on_gaze_data
        self.tobii.on_status = self._on_tracker_status

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
            if profile and profile.is_valid and profile.coordinate_space == 'window_normalized_v2':
                self.calibration_corrector.load_profile(profile)
            elif profile and profile.is_valid:
                self.calibration_corrector.disable()
                logger.warning('[CALIB] Legacy correction ignored: rerun calibration after coordinate pipeline upgrade')
            else:
                logger.info("[CALIB] No valid saved profile found")
        except Exception as e:
            logger.warning(f"[CALIB] Failed to load profile: {e}")

    def _update_sample_rate(self, timestamp_s: float) -> float:
        """Estimate effective Tobii sample rate from actual incoming timestamps."""
        if self._last_sample_rate_ts is None:
            self._last_sample_rate_ts = timestamp_s
            return self._measured_sample_rate_hz

        dt = timestamp_s - self._last_sample_rate_ts
        self._last_sample_rate_ts = timestamp_s
        if 0.001 <= dt <= 0.200:
            self._sample_dt_history.append(dt)
            ordered = sorted(self._sample_dt_history)
            median_dt = ordered[len(ordered) // 2]
            if median_dt > 0:
                self._measured_sample_rate_hz = round(1.0 / median_dt, 1)
                self.gaze_classifier.configure(sample_rate_hz=self._measured_sample_rate_hz)
        return self._measured_sample_rate_hz

    def _apply_active_filter_profile(self, preset: str):
        canonical = normalize_filter_preset(preset)
        if canonical not in self.ACTIVE_FILTER_PROFILES:
            logger.warning(f"Invalid active filter preset: {preset}")
            return False
        self.active_filter_preset = canonical
        self.cursor_filter.configure(canonical)
        self._clear_gaze_target_state()
        logger.info(f"[PIPELINE] Active preset={canonical}, pipeline={self.ACTIVE_PIPELINE_NAME}")
        return True

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

    def _screen_to_window_normalized(self, x_norm: float, y_norm: float, clamp: bool = True) -> tuple:
        """
        Convert full-screen normalized gaze coordinates into window-content normalized space.
        Also applies manual gaze offset correction if configured.
        """
        if self.screen_width <= 0 or self.screen_height <= 0:
            return x_norm, y_norm
        if self.physical_width <= 0 or self.physical_height <= 0:
            return x_norm, y_norm

        css_screen_width, css_screen_height = self._css_screen_size()

        screen_x_css = x_norm * css_screen_width + self.screen_origin_x
        screen_y_css = y_norm * css_screen_height + self.screen_origin_y

        win_x = screen_x_css - self.window_x
        win_y = screen_y_css - self.window_y

        # Normalize by content area (screen_width = window.innerWidth)
        content_w = float(self.content_width or self.screen_width)
        content_h = float(self.content_height or self.screen_height)

        out_x = win_x / content_w
        out_y = win_y / content_h

        # Apply manual gaze offset correction (in normalized units, converted from px)
        offset_x = getattr(self, '_gaze_offset_x', 0)
        offset_y = getattr(self, '_gaze_offset_y', 0)
        if offset_x != 0 and content_w > 0:
            out_x += offset_x / self.screen_width
        if offset_y != 0 and content_h > 0:
            out_y += offset_y / self.screen_height

        if clamp:
            out_x = max(0.0, min(1.0, out_x))
            out_y = max(0.0, min(1.0, out_y))
        return out_x, out_y

    def _css_screen_size(self) -> tuple:
        """The tracked display's size in the CSS pixels the window geometry uses."""
        dpr_val = max(1.0, self.dpr if self.dpr else 1.0)
        css_screen_width = float(self.physical_width)
        css_screen_height = float(self.physical_height)
        width_ratio = (self.physical_width / self.screen_width) if self.screen_width else 1.0
        reports_physical_px = (
            self.screen_units != 'css' and dpr_val > 1.01 and
            abs(width_ratio - dpr_val) < 0.20
        )
        if reports_physical_px:
            css_screen_width = css_screen_width / dpr_val
            css_screen_height = css_screen_height / dpr_val
        return css_screen_width, css_screen_height

    def _geometry_payload(self) -> Dict[str, Any]:
        """The window and screen geometry in use, for diagnostic listeners."""
        css_width, css_height = self._css_screen_size()
        return {
            'content_width': float(self.content_width or self.screen_width),
            'content_height': float(self.content_height or self.screen_height),
            'screen_width': css_width, 'screen_height': css_height,
            'window_x': float(self.window_x) - float(self.screen_origin_x),
            'window_y': float(self.window_y) - float(self.screen_origin_y),
            'reported': bool(self.content_width and self.content_height),
            'edge_band_px': self.SCREEN_EDGE_BAND_PX,
        }

    def _screen_edge_band(self, x_norm, y_norm) -> Optional[tuple]:
        """Screen-normalised gaze pulled back onto a physical screen edge, or None.

        None means the sample is left exactly as the tracker reported it: it is
        on the screen, malformed, farther out than SCREEN_EDGE_BAND_PX, or past
        an edge where the window does not reach the edge of the screen.
        """
        try:
            x_norm, y_norm = float(x_norm), float(y_norm)
        except (TypeError, ValueError):
            return None
        if not (math.isfinite(x_norm) and math.isfinite(y_norm)):
            return None
        if 0.0 <= x_norm <= 1.0 and 0.0 <= y_norm <= 1.0:
            return None
        if not (self.content_width and self.content_height):
            return None  # Only with window geometry the interface reported, never a default.
        if min(self.screen_width, self.screen_height, self.physical_width, self.physical_height) <= 0:
            return None
        css_width, css_height = self._css_screen_size()
        left = float(self.window_x) - float(self.screen_origin_x)
        top = float(self.window_y) - float(self.screen_origin_y)
        right = left + float(self.content_width or self.screen_width)
        bottom = top + float(self.content_height or self.screen_height)
        aligned = self.SCREEN_EDGE_ALIGNED_PX
        banded = []
        for value, size, near_edge, far_edge in ((x_norm, css_width, left, right),
                                                 (y_norm, css_height, top, bottom)):
            position = value * size
            if position < 0.0:
                if abs(near_edge) > aligned or -position > self.SCREEN_EDGE_BAND_PX:
                    return None
                position = self.SCREEN_EDGE_INSET_PX
            elif position > size:
                if abs(far_edge - size) > aligned or position - size > self.SCREEN_EDGE_BAND_PX:
                    return None
                position = size - self.SCREEN_EDGE_INSET_PX
            banded.append(position / size)
        return banded[0], banded[1]

    def _clear_gaze_target_state(self):
        self._sticky_magnet_target = None
        self._on_key_target_id = None
        self._cursor_on_target = False
        self._on_key_last_true = 0
        if hasattr(self, '_last_magnet_raw'):
            del self._last_magnet_raw

    def _invalidate_gaze(self, reason: str, timestamp: Optional[float] = None,
                         rejected: Optional[tuple] = None):
        """A held display position is never a fresh, selectable measurement.

        `rejected` is where a well-formed sample fell outside the window, in
        window-normalised units. It is diagnostic only (how far out do edge
        losses land?) and is never a position: x, y keep the held display point.
        """
        first_loss = not self._tracking_lost
        self._tracking_lost = True
        self._last_inside_px = None
        self._edge_outside_since = None
        if reason not in self.DISPLAY_RESUMABLE_LOSSES:
            self._suspended_display = None
        elif first_loss:
            self._suspended_display = self._suspend_display_state(timestamp)
        self.cursor_filter.reset()
        self.gaze_classifier.mark_tracking_lost()
        self._clear_gaze_target_state()
        payload = dict(self._last_gaze_payload or {'x': 0.5, 'y': 0.5, 'coord_space': 'window'})
        payload.update(is_valid=False, signal_state=reason, confidence=0.0,
                       is_fixation=False, backend_on_key=False, backend_magnet_px=0.0,
                       backend_zone='free', gaze_state='unknown', classifier_state='unknown',
                       t_sent_wall_ms=round(time.time() * 1000, 1))
        # Retain the original acquisition stamp on display holds; a new send
        # timestamp must never make the previous position appear newly sampled.
        payload.pop('intent_x', None)
        payload.pop('intent_y', None)
        payload.pop('rejected_x', None)
        payload.pop('rejected_y', None)
        if rejected is not None and all(math.isfinite(value) for value in rejected):
            payload['rejected_x'], payload['rejected_y'] = round(rejected[0], 5), round(rejected[1], 5)
        self._last_gaze_payload = payload
        if first_loss:
            self._broadcast('gaze_lost', {'reason': reason})
        self._broadcast('gaze', payload)

    def _edge_sample_is_tolerated(self, x_norm: float, y_norm: float, stamp: float) -> bool:
        """True while an out-of-window sample may still be tracker noise at an edge.

        A tolerated sample changes nothing: no position is published, nothing
        is clamped onto a border control, and the filter and target state
        survive. Anything else is invalidated exactly as before.
        """
        last = self._last_inside_px
        if self._tracking_lost or last is None or not (math.isfinite(x_norm) and math.isfinite(y_norm)):
            return False
        px, py = x_norm * self.screen_width, y_norm * self.screen_height
        for value, limit, previous in ((px, self.screen_width, last[0]), (py, self.screen_height, last[1])):
            beyond = max(-value, value - limit, 0.0)
            if beyond > self.EDGE_NOISE_MARGIN_PX:
                return False
            if beyond and (previous if value < 0 else limit - previous) > self.EDGE_NOISE_NEAR_PX:
                return False  # Gaze was not resting beside this edge: a real departure.
        if self._edge_outside_since is None:
            self._edge_outside_since = stamp
        return 0 <= stamp - self._edge_outside_since <= self.EDGE_NOISE_HOLD_SECONDS

    def _suspend_display_state(self, timestamp: Optional[float]) -> Optional[Dict[str, Any]]:
        """Display-only state worth resuming after a brief loss, or None."""
        if self.cursor_filter.estimate is None:
            return None
        return {
            'since': timestamp if timestamp is not None else time.time(),
            'screen': self.current_screen,
            'preset': self.active_filter_preset,
            'filter': self.cursor_filter.snapshot(),
            'on_key_target_id': self._on_key_target_id,
            'cursor_on_target': bool(getattr(self, '_cursor_on_target', False)),
            'on_key_last_true': self._on_key_last_true,
            'sticky_magnet_target': self._sticky_magnet_target,
            'last_magnet_raw': getattr(self, '_last_magnet_raw', None),
        }

    def _resume_display_state(self, stamp: float):
        """Restore a suspended display state once, if it is still about the same thing."""
        suspended, self._suspended_display = self._suspended_display, None
        if (suspended is None or not 0 <= stamp - suspended['since'] <= self.DISPLAY_RESUME_SECONDS
                or suspended['screen'] != self.current_screen
                or suspended['preset'] != self.active_filter_preset):
            return
        detector = self.target_registry.screens.get(self.current_screen)
        targets = getattr(detector, 'targets', {}) if detector else {}
        self.cursor_filter.restore(suspended['filter'])
        target_id = suspended['on_key_target_id']
        target = targets.get(target_id) if target_id else None
        if target is not None and target.enabled:
            self._on_key_target_id = target_id
            self._cursor_on_target = suspended['cursor_on_target']
            self._on_key_last_true = suspended['on_key_last_true']
        sticky = suspended['sticky_magnet_target']
        if sticky is not None and targets.get(getattr(sticky, 'id', None)) is sticky and sticky.enabled:
            self._sticky_magnet_target = sticky
            if suspended['last_magnet_raw'] is not None:
                self._last_magnet_raw = suspended['last_magnet_raw']

    def _tracker_status_payload(self) -> Dict[str, Any]:
        """Why gaze is or is not arriving, for the interface to explain."""
        status = self.tobii.last_status or {}
        if self.config.tobii_simulated:
            state = 'simulated'
        elif not self.config.tobii_enabled:
            state = 'disabled'
        elif not self.tobii.is_connected:
            state = 'helper_unavailable'
        else:
            state = str(status.get('stream_state') or 'unknown')
        return {
            'stream_state': state,
            'device_status': status.get('device_status'),
            'user_presence': status.get('user_presence'),
            'gaze_tracking': status.get('gaze_tracking'),
            'recoveries': status.get('recoveries', 0),
            'stream_mode': status.get('stream_mode'),
        }

    def _on_tracker_status(self, _status: Optional[Dict[str, Any]]):
        payload = self._tracker_status_payload()
        # The estimator confirms a jump for one sample on the unsmoothed stream only.
        self.cursor_filter.raw_stream = payload.get('stream_mode') == 'Unfiltered'
        if payload != self._last_tracker_status:
            self._last_tracker_status = payload
            self._broadcast('tracker_status', payload)

    def _on_gaze_data(self, point: GazePoint):
        """Validate -> map -> optional calibration -> one filter -> target assistance."""
        now = time.time()
        if not self.gaze_active:
            if not self._tracking_lost:
                self._invalidate_gaze('inactive_window')
            return
        stamp = SignalConditioner._normalize_timestamp(point.timestamp)
        if not math.isfinite(stamp) or abs(now - stamp) > self.POINT_TTL_SECONDS:
            self._invalidate_gaze('stale')
            return
        if self._last_sample_timestamp is not None and stamp <= self._last_sample_timestamp:
            if self._tracking_lost and not point.is_valid:
                # A second report of a loss already in force, not reordered gaze.
                # The helper and the receiver each report 150 ms of silence; the
                # helper stamps whole milliseconds, so its report often arrives
                # second carrying the older stamp. It holds no measurement. Treated
                # as out_of_order it discarded the display state kept for the
                # blink, and the cursor hopped when the eyes reopened (four times
                # in a 100 s recording, 21 Sep 2026).
                return
            self._invalidate_gaze('out_of_order')
            return
        gap = stamp - self._last_sample_timestamp if self._last_sample_timestamp is not None else 0
        self._last_sample_timestamp = stamp
        received = time.monotonic()
        # Gaze reported just past a physical screen edge is at that edge (see
        # SCREEN_EDGE_BAND_PX). Done before validation so the conditioner's own
        # blink/loss bookkeeping sees one coherent stream.
        gaze_x, gaze_y = self._screen_edge_band(point.x, point.y) or (point.x, point.y)
        conditioned = self.signal_conditioner.process({
            'x': gaze_x, 'y': gaze_y, 'timestamp': stamp,
            'left_valid': point.left_valid, 'right_valid': point.right_valid,
            'confidence': point.confidence, 'is_valid': point.is_valid,
            'validity_source': point.validity_source,
        })
        rejected = None
        if conditioned.state == GazeValidity.OUT_OF_BOUNDS:
            # A genuine measurement that landed off the screen, beyond the edge
            # band: the same edge question as leaving the window, asked in
            # window coordinates.
            rejected = self._screen_to_window_normalized(conditioned.raw_x, conditioned.raw_y, clamp=False)
            if self._edge_sample_is_tolerated(*rejected, stamp):
                return
        if conditioned.state != GazeValidity.VALID:
            self._last_sample_received = received
            self._invalidate_gaze(conditioned.state.value, stamp, rejected)
            self.fatigue.update_gaze(conditioned.x, conditioned.y, False, stamp)
            return
        if gap > self.FRAME_GAP_HOLD_SECONDS:
            self.cursor_filter.reset()
            self.gaze_classifier.reset()
            self._clear_gaze_target_state()
        raw_x, raw_y = self._screen_to_window_normalized(conditioned.x, conditioned.y, clamp=False)
        # Looking at the title bar, the taskbar or another window must never
        # collapse onto a selectable border target. (The only clamping is the
        # narrow band past a physical screen edge, applied above.)
        if not (0 <= raw_x <= 1 and 0 <= raw_y <= 1):
            if self._edge_sample_is_tolerated(raw_x, raw_y, stamp):
                return
            self._last_sample_received = received
            self._invalidate_gaze('outside_window', stamp, (raw_x, raw_y))
            return
        # Only a published sample refreshes the stale guard, so a run of
        # tolerated edge samples is also bounded by POINT_TTL_SECONDS.
        self._last_sample_received = received
        self._edge_outside_since = None
        self._resume_display_state(stamp)
        if self.calibration_active and self.calibration_session:
            self.calibration_session.update(raw_x, raw_y, conditioned.confidence)
        calibration_applied = not self.calibration_active and self.calibration_corrector.enabled
        if calibration_applied:
            raw_x, raw_y = self.calibration_corrector.correct(raw_x, raw_y)
        self._tracking_lost = False
        measured_rate = self._update_sample_rate(stamp)
        gaze_class = self.gaze_classifier.classify(conditioned.x, conditioned.y, stamp)
        raw_px, raw_py = raw_x * self.screen_width, raw_y * self.screen_height
        self._last_inside_px = (raw_px, raw_py)
        # The hold's target identity comes from the position it stabilises.
        # Taken from the raw sample it flipped between neighbouring keys with
        # tracker noise while the displayed cursor stood still, and every flip
        # restarted the hold. The filter still releases on raw distance, so a
        # real departure moves the estimate, and with it the identity, at once.
        filtered_x, filtered_y = self.cursor_filter.update(
            raw_px, raw_py, stamp, self._on_key_target_id if self._cursor_on_target else None)
        on_key = self._update_on_key_state_impl(filtered_x, filtered_y)
        screen_x, screen_y = self._apply_magnetism(filtered_x, filtered_y)
        magnet_px = math.hypot(screen_x - filtered_x, screen_y - filtered_y)
        x = max(0.0, min(1.0, screen_x / self.screen_width))
        y = max(0.0, min(1.0, screen_y / self.screen_height))
        payload = {
            'x': x, 'y': y, 'coord_space': 'window', 'is_valid': True,
            'intent_x': raw_x, 'intent_y': raw_y,
            'is_fixation': self.cursor_filter.zone == 'lock',
            'confidence': conditioned.confidence, 'signal_state': 'valid',
            'gaze_state': self.cursor_filter.zone, 'classifier_state': gaze_class.value,
            'raw_x': point.x, 'raw_y': point.y,
            'conditioned_x': conditioned.x, 'conditioned_y': conditioned.y,
            'mapped_x': raw_x, 'mapped_y': raw_y,
            'active_pipeline': self.active_pipeline_name,
            'active_filter_preset': self.active_filter_preset,
            'sample_rate_hz': measured_rate,
            'sample_age_ms': round(max(0, now - stamp) * 1000, 2),
            'backend_zone': self.cursor_filter.zone,
            'backend_on_key': bool(on_key), 'backend_magnet_px': round(magnet_px, 3),
            'calibration_applied': calibration_applied,
            'validity_source': conditioned.validity_source,
            't_helper_ms': round(stamp * 1000, 1),
            't_sent_wall_ms': round(time.time() * 1000, 1),
        }
        self._last_gaze_payload = payload
        self._broadcast('gaze', payload)
        self.fatigue.update_gaze(x, y, True, stamp)

    @staticmethod
    def _target_contains_expanded(target: GazeTarget, px: float, py: float, expand: float) -> bool:
        half_w = max(1.0, (target.width * 0.5) * max(0.1, float(expand)))
        half_h = max(1.0, (target.height * 0.5) * max(0.1, float(expand)))
        return (
            (target.x - half_w) <= px <= (target.x + half_w) and
            (target.y - half_h) <= py <= (target.y + half_h)
        )

    def _get_on_key_expand(self, target: GazeTarget, is_exit: bool = False) -> float:
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
            detector = self.target_registry.screens.get(self.current_screen)
            if not detector or not hasattr(detector, 'targets'):
                self._cursor_on_target = False
                self._on_key_target_id = None
                return False

            enabled_targets = [t for t in detector.targets.values() if t.enabled]
            if not enabled_targets:
                self._cursor_on_target = False
                self._on_key_target_id = None
                return False

            now = time.monotonic()
            candidate: Optional[GazeTarget] = None

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

    # Shipped magnetism defaults (v15 tuning + audited gazetoggle values).
    # Keep context-aware behavior from compass, but use stronger keyboard
    # values from the accuracy branch. v15: keyboard reduced to prevent
    # wrong-key lock amplifying rightward drift (was radius=96, pull=0.56,
    # release=92 — release < capture made escape hard).
    MAGNET_CONTEXT_DEFAULTS = {
        'keyboard':   {'radius': 72.0,  'pull': 0.32, 'release': 88.0,  'capture_full': False},
        'prediction': {'radius': 112.0, 'pull': 0.48, 'release': 100.0, 'capture_full': False},
        'navigation': {'radius': 44.0,  'pull': 0.16, 'release': 64.0,  'capture_full': False},
        'gazetoggle': {'radius': 165.0, 'pull': 0.34, 'release': 185.0, 'capture_full': True},
    }
    MAGNET_DEFAULT_PARAMS = {'radius': 62.0, 'pull': 0.22, 'release': 82.0, 'capture_full': False}

    def _get_magnet_params(self):
        """Live (runtime-tunable) magnetism tables, lazily seeded from the
        shipped class defaults. Mutated only by _set_magnet_params."""
        if not hasattr(self, '_magnet_context_params'):
            self._magnet_context_params = {k: dict(v) for k, v in self.MAGNET_CONTEXT_DEFAULTS.items()}
            self._magnet_default_params = dict(self.MAGNET_DEFAULT_PARAMS)
        return self._magnet_context_params, self._magnet_default_params

    def _set_magnet_params(self, data: Dict):
        """B1-BE — runtime magnetism tuning for on-rig A/B sessions.

        WS message: {type:'set_magnet_params', context:'gazetoggle',
                     radius: 90, pull: 0.22, release: 110, capture_full: false}
        Only the NAMED context changes; omitted fields keep their current
        values; clamps keep every combination escapable (release >= radius).
        context 'default' tunes the fallback used by unlisted contexts.
        A backend restart restores the shipped defaults.
        """
        params_map, default_params = self._get_magnet_params()
        ctx = str(data.get('context', '')).strip().lower()
        if ctx in params_map:
            entry = params_map[ctx]
        elif ctx == 'default':
            entry = default_params
        else:
            logger.warning(f"[MAGNET] set_magnet_params: unknown context '{ctx}' "
                           f"(known: {sorted(params_map)} + 'default')")
            return

        def _clampf(value, lo, hi, current):
            try:
                f = float(value)
            except (TypeError, ValueError):
                return current
            return max(lo, min(hi, f)) if math.isfinite(f) else current

        if 'radius' in data:
            entry['radius'] = _clampf(data['radius'], 20.0, 300.0, entry['radius'])
        if 'pull' in data:
            entry['pull'] = _clampf(data['pull'], 0.05, 0.60, entry['pull'])
        if 'release' in data:
            entry['release'] = _clampf(data['release'], 20.0, 400.0, entry['release'])
        # Escape must always be possible: release never below the radius.
        entry['release'] = max(entry['release'], entry['radius'])
        if 'capture_full' in data:
            entry['capture_full'] = bool(data['capture_full'])
        logger.info(f"[MAGNET] {ctx} params now: {entry}")

    def _apply_magnetism(self, screen_x: float, screen_y: float) -> tuple:
        """
        v12: Sticky-target cursor magnetism â€” prevents oscillation between adjacent targets.

        KEY CHANGE from v11: Once locked onto a target, KEEP that target until the
        pre-magnetism cursor moves beyond RELEASE_RADIUS (1.5Ã— MAGNET_RADIUS).
        This prevents the rapid target-switching that made typing impossible.

        Also adds APPROACH BIAS: when the cursor is moving toward a target, increase pull.
        When moving away, decrease pull (user is intentionally leaving).
        """
        # Per-target-context magnetism params — shipped defaults live in
        # MAGNET_CONTEXT_DEFAULTS / MAGNET_DEFAULT_PARAMS (class constants);
        # the live copies are runtime-tunable via the set_magnet_params WS
        # message (B1-BE) for on-rig A/B without a restart. A restart
        # always restores the shipped values.
        CONTEXT_PARAMS, DEFAULT_PARAMS = self._get_magnet_params()

        try:
            detector = self.target_registry.screens.get(self.current_screen)
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
            # capture_full=True (shipped only for gazetoggle) captures at the
            # FULL radius instead of 0.82x — one of the audited contributors
            # to "strong magnetism near the toggle"; set_magnet_params can
            # turn it off live: {context:'gazetoggle', capture_full: false}.
            capture_full = bool(params.get('capture_full', ctx == 'gazetoggle'))
            CAPTURE_RADIUS = MAGNET_RADIUS if capture_full else MAGNET_RADIUS * 0.82

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
            self._latest_gaze_stamp = (data or {}).get('t_helper_ms') if (data or {}).get('is_valid') else None
            # v17.19 push mode: wake the broadcast loop NOW instead of
            # letting the frame wait for the next paced tick (0-15.2ms,
            # mean ~7.6ms of avoidable glass-to-glass latency per frame).
            ev = getattr(self, '_gaze_push_event', None)
            if ev is not None:
                ev.set()
            return

        # For non-gaze: send immediately
        for client in list(self.connected_clients):
            try:
                asyncio.create_task(client.send(message))
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                self.connected_clients.discard(client)

    async def _send_gaze_frame(self, client, message):
        try:
            await asyncio.wait_for(client.send(message), timeout=self.POINT_TTL_SECONDS)
        except (Exception, asyncio.CancelledError):
            self.connected_clients.discard(client)
            try:
                await asyncio.wait_for(client.close(code=1013, reason='Gaze consumer too slow'), timeout=0.2)
            except (Exception, asyncio.CancelledError):
                pass
        finally:
            self._gaze_send_tasks.pop(client, None)

    async def _gaze_broadcast_loop(self):
        """Push current data with at most one in-flight gaze send per client.

        Busy clients skip superseded samples. A blocked consumer can never
        create an unbounded task queue or delay another consumer's gaze stream.
        """
        self._gaze_push_event = asyncio.Event()
        self._latest_gaze_msg = getattr(self, '_latest_gaze_msg', None)
        try:
            while True:
                try:
                    await asyncio.wait_for(self._gaze_push_event.wait(), timeout=0.05)
                except asyncio.TimeoutError:
                    pass
                self._gaze_push_event.clear()
                if (self._last_sample_received is not None and not self._tracking_lost and
                        time.monotonic() - self._last_sample_received > self.POINT_TTL_SECONDS):
                    self._invalidate_gaze('stale')
                source_stamp = getattr(self, '_latest_gaze_stamp', None)
                if source_stamp is not None and time.time() * 1000 - source_stamp > self.POINT_TTL_SECONDS * 1000:
                    self._invalidate_gaze('stale')
                message = self._latest_gaze_msg
                self._latest_gaze_msg = None
                self._latest_gaze_stamp = None
                if not message:
                    continue
                for client in tuple(self.connected_clients):
                    if client not in self._gaze_send_tasks:
                        self._gaze_send_tasks[client] = asyncio.create_task(
                            self._send_gaze_frame(client, message))
        except asyncio.CancelledError:
            pass
        finally:
            pending = tuple(self._gaze_send_tasks.values())
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            self._gaze_push_event = None

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
                    slot_count=data.get('slot_count'),
                    reset_lineage=bool(data.get('reset_lineage', False)),
                ),
                'set_prediction_context': lambda: self._set_prediction_context(websocket, data.get('phrases', []), data.get('words', [])),
                'undo_word_learning': lambda: self._undo_word_learning(data.get('text_before'), data.get('text_after')),
                'reset_word_learning': lambda: self._reset_word_learning(websocket),
                'get_phrases': lambda: self._get_phrases(websocket, data.get('category')),
                'expand_abbreviation': lambda: self._expand_abbreviation(websocket, data.get('abbrev', '')),
                'learn_word': lambda: self._learn_word(data),
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
                # B1-BE — live magnetism tuning for on-rig A/B sessions
                # (shipped defaults are code constants; restart restores them).
                'set_magnet_params': lambda: self._set_magnet_params(data),
                'renderer_latency': lambda: self._relay_renderer_latency(websocket, data),
                'automation_execute': lambda: self._handle_automation_execute(websocket, data),
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

    RENDERER_LATENCY_MAX_FIELDS = 24

    def _relay_renderer_latency(self, sender, data: Dict):
        """Pass the interface's own timing summary on to a diagnostic listener.

        The interface measures what the backend cannot see: delivery of a gaze
        frame to it, and the time until that frame is painted. It sends a few
        percentiles every ten seconds. They go only to OTHER connected clients
        (tools/gaze_live_observer.py); with none connected nothing happens.
        Numbers only, nothing is stored, and nothing here can affect gaze.
        """
        summary = data.get('summary')
        if not isinstance(summary, dict):
            return
        clean = {}
        for key, value in summary.items():
            if len(clean) >= self.RENDERER_LATENCY_MAX_FIELDS:
                break
            if (isinstance(key, str) and 0 < len(key) <= 32 and not isinstance(value, bool)
                    and isinstance(value, (int, float)) and math.isfinite(value)):
                clean[key] = round(float(value), 1)
        if not clean:
            return
        for client in tuple(self.connected_clients):
            if client is not sender:
                self._send(client, 'renderer_latency', {'summary': clean})

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
        self.target_registry.set_screen(screen)
        self.cursor_filter.reset()
        self._broadcast('screen_changed', {'screen': screen})

    def _set_screen_size(self, data: Dict):
        """Set screen dimensions and physical screen info for coordinate remapping."""
        previous_geometry = (self.screen_width, self.screen_height, self.physical_width,
                             self.physical_height, self.window_x, self.window_y, self.dpr,
                             self.content_width, self.content_height, self.screen_units,
                             self.screen_origin_x, self.screen_origin_y)
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

        self.screen_units = data.get('screenUnits', self.screen_units)
        if 'gazeActive' in data:
            was_active = self.gaze_active
            self.gaze_active = data['gazeActive'] is True
            if not self.gaze_active and was_active:
                self._invalidate_gaze('inactive_window')
        for field, key in (('screen_origin_x', 'screenX'), ('screen_origin_y', 'screenY'),
                           ('content_width', 'contentWidth'), ('content_height', 'contentHeight')):
            if key in data:
                value = float(data[key])
                if math.isfinite(value) and (not key.startswith('content') or value > 0):
                    setattr(self, field, value)
        current_geometry = (self.screen_width, self.screen_height, self.physical_width,
                            self.physical_height, self.window_x, self.window_y, self.dpr,
                            self.content_width, self.content_height, self.screen_units,
                            self.screen_origin_x, self.screen_origin_y)
        if current_geometry == previous_geometry:
            return
        if current_geometry != previous_geometry:
            profile = self.calibration_corrector.profile
            if profile and (profile.screen_width != self.screen_width or profile.screen_height != self.screen_height):
                self.calibration_corrector.disable()
                logger.info('[CALIB] Correction disabled after content geometry changed')
            self.cursor_filter.reset()
            self._clear_gaze_target_state()

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
        for t in targets[:self.target_registry.MAX_TARGETS_PER_SCREEN]:
            if not all(math.isfinite(float(t[k])) for k in ('x', 'y', 'width', 'height')):
                continue
            if float(t['width']) <= 0 or float(t['height']) <= 0:
                continue
            target = GazeTarget(
                id=t['id'],
                x=t['x'],
                y=t['y'],
                width=t['width'],
                height=t['height'],
                size=ButtonSize(t.get('size', 'md')),
                context=t.get('context', 'navigation'),
                priority=t.get('priority', 0),
                enabled=t.get('enabled', True)
            )
            dwell_targets.append(target)

        self.target_registry.set_targets(dwell_targets)
        current_targets = self.target_registry.screens[self.current_screen].targets
        sticky = self._sticky_magnet_target
        if sticky is not None:
            replacement = current_targets.get(sticky.id)
            if replacement is None or not replacement.enabled or replacement != sticky:
                self._clear_gaze_target_state()
                self.cursor_filter.reset()
            else:
                self._sticky_magnet_target = replacement
        if self._on_key_target_id:
            active = current_targets.get(self._on_key_target_id)
            if active is None or not active.enabled:
                self._clear_gaze_target_state()
                self.cursor_filter.reset()
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
        slot_count: Optional[int] = None,
        reset_lineage: bool = False,
    ):
        """Word + sentence suggestions. Deterministic by default; legacy on rollback."""
        if self.word_service is None:
            return self._get_predictions_legacy(websocket, text, length_hint, top_k, request_id)
        text = text if isinstance(text, str) else ''
        slots = slot_count if isinstance(slot_count, int) and not isinstance(slot_count, bool) else 10
        slots = 10 if slots >= 10 else max(5, slots)
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            # No event loop (unit tests, tools): compute inline.
            result = self.word_service.predict_sync(websocket, text, slots, reset_lineage)
            self._send(websocket, 'predictions', self._deterministic_payload(text, result, request_id))
            return
        task = asyncio.create_task(self._get_predictions_deterministic(websocket, text, slots, reset_lineage, request_id))
        self._prediction_tasks.add(task)
        task.add_done_callback(self._prediction_tasks.discard)

    async def _get_predictions_deterministic(self, websocket, text: str, slots: int, reset_lineage: bool,
                                             request_id: Optional[int]):
        if websocket is not None and websocket not in self.connected_clients:
            return  # queued behind a disconnect; no lineage for a closed session
        try:
            result = await self.word_service.predict(websocket, text, slots, reset_lineage)
        except Exception as error:
            # Answer anyway: explicit empty word slots (never the previous draft's
            # words), and phrase suggestions, which do not depend on the word engine.
            logger.warning(f"Word prediction failed: {error!r}", exc_info=True)
            result = {'prefix': current_prefix(text), 'ranked': [], 'slots': [None] * slots, 'scores': {}, 'lineage': False}
        if result is None:
            return  # superseded by a newer request from this client
        if websocket is not None and websocket not in self.connected_clients:
            return  # disconnected while computing; never deliver to a new session
        self._send(websocket, 'predictions', self._deterministic_payload(text, result, request_id))

    def _deterministic_payload(self, text: str, result: Dict[str, Any], request_id: Optional[int]) -> Dict[str, Any]:
        return {
            # Ranked candidates (board order), kept for existing consumers.
            'words': [
                {'word': word, 'score': round(float(result['scores'].get(word, 0.0)), 4), 'source': 'deterministic'}
                for word in result['ranked']
            ],
            # Presentation slots: fixed positions, None = deliberately empty.
            'word_slots': result['slots'],
            'sentences': self._deterministic_sentences(text),
            'request_id': request_id,
            'prediction': {
                'engine': DETERMINISTIC_ENGINE_VERSION,
                'text': text,
                'prefix': result['prefix'],
                'slot_count': len(result['slots']),
                'lineage': bool(result.get('lineage')),
            },
        }

    def _deterministic_sentences(self, text: str) -> List[Dict[str, Any]]:
        """Phrase-level suggestions, separate from word slots, English-only.

        modes: 'replace_token' (abbreviation expansion replaces the typed
        shortcut), 'complete_or_append' (sentence completes the typed text when
        it starts with it, otherwise is appended), 'append' (starters).
        """
        suggestions: List[Dict[str, Any]] = []
        seen: Set[str] = set()

        def push(item: Dict[str, Any]) -> None:
            key = item['text'].strip().lower()
            if not key or key in seen or contains_blocked_prediction_word(item['text']):
                return
            if not self._english_only.allows(item['text']):
                return
            seen.add(key)
            suggestions.append(item)

        token_match = re.search(r'(\S+)$', text)
        if token_match and not text[-1:].isspace():
            token = token_match.group(1)
            expansion = self.prediction.expand_abbreviation(token)
            if expansion:
                push({'text': expansion, 'score': 2.0, 'source': 'abbreviation', 'mode': 'replace_token', 'token': token})
        topic_boosts = self._session_topics.get_boosts(text)
        stripped = text.strip()
        if not stripped:
            for item in self._get_starter_predictions(topic_boosts=topic_boosts, top_k=8):
                push({'text': item['word'], 'score': item['score'], 'source': item['source'], 'mode': 'append'})
        elif len(stripped) >= 2:
            for sp in self.sentence_predictor.predict(stripped, top_k=6, topic_boosts=topic_boosts):
                push({'text': sp.text, 'score': sp.score, 'source': sp.source, 'mode': 'complete_or_append'})
            if self.config.enable_neural_sentence_continuation and len(suggestions) < 3:
                words = stripped.split()
                context = ' '.join(words[:-1]) if not text.endswith(' ') and len(words) >= 2 else stripped
                if len(context.split()) >= 2:
                    continuation = self.prediction.predict_sentence_neural(context, num_words=4)
                    if continuation and len(continuation.strip()) >= 3:
                        push({'text': f"{context} {continuation}".strip(), 'score': 0.5, 'source': 'neural', 'mode': 'complete_or_append'})
        return suggestions[:4]

    def _learn_word(self, data: Dict[str, Any]) -> None:
        """A word the person explicitly accepted (prediction selected / Zone Board confirmed)."""
        word = data.get('word', '')
        if not isinstance(word, str) or not word.strip() or is_blocked_prediction_word(word.strip().lower()):
            return
        if self.word_service is None:
            self.prediction.learn_word(word)
            return
        before, after = data.get('text_before'), data.get('text_after')
        before = before if isinstance(before, str) else None
        after = after if isinstance(after, str) else None
        context = confirmed_history(before) if before is not None else None
        self.prediction.learn_word(word, before, after, context)

    def _undo_word_learning(self, text_before: Any, text_after: Any) -> None:
        if self.word_service is None or not isinstance(text_before, str) or not isinstance(text_after, str):
            return
        self.prediction.store.undo_removed_words(text_before, text_after)

    def _reset_word_learning(self, websocket) -> None:
        if self.word_service is None:
            return
        self.prediction.store.reset()
        self.prediction.store.save()
        self._send(websocket, 'word_learning_reset', {'success': True})

    def _set_prediction_context(self, websocket, phrases: Any, words: Any) -> None:
        """Household configuration from the renderer: board phrases and configured words."""
        if self.word_service is None or not isinstance(phrases, list):
            return
        counts = self.word_service.set_context(phrases, words if isinstance(words, list) else [])
        self._send(websocket, 'prediction_context_set', counts)

    def _get_predictions_legacy(
        self,
        websocket: WebSocketServerProtocol,
        text: str,
        length_hint: Optional[int] = None,
        top_k: int = 12,
        request_id: Optional[int] = None,
    ):
        """Legacy engine path (rollback): unchanged behaviour."""
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
        self._apply_active_filter_profile(preset)

    def _handle_automation_execute(self, websocket: WebSocketServerProtocol, data: Dict):
        """Safely execute a tiny allowlist of PyAutoGUI fallback actions."""
        request_id = data.get('request_id')
        action_id = str(data.get('action_id', '')).strip()
        allowed_actions = {
            'media_play_pause',
            'media_next',
            'browser_back',
            'browser_forward',
        }

        if action_id not in allowed_actions:
            self._send(websocket, 'automation_result', {
                'request_id': request_id,
                'action_id': action_id,
                'ok': False,
                'error': 'action_not_allowed',
            })
            return

        if not AUTOMATION_AVAILABLE or get_automation is None:
            self._send(websocket, 'automation_result', {
                'request_id': request_id,
                'action_id': action_id,
                'ok': False,
                'error': 'pyautogui_unavailable',
            })
            return

        try:
            ok = bool(get_automation().execute(action_id))
            self._send(websocket, 'automation_result', {
                'request_id': request_id,
                'action_id': action_id,
                'ok': ok,
                'error': None if ok else 'execution_failed_or_cooldown',
            })
        except Exception as e:
            logger.warning(f"Automation fallback failed for {action_id}: {e}")
            self._send(websocket, 'automation_result', {
                'request_id': request_id,
                'action_id': action_id,
                'ok': False,
                'error': str(e),
            })

    def _set_filter_params(self, data: Dict):
        """Set custom gaze filter parameters from frontend settings."""
        try:
            preset = data.get('preset')
            if preset:
                self._set_filter_preset(preset)
                return

            logger.warning("Direct filter coefficients are unsupported; choose a named preset")
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
            'tobii_connected': self.tobii.is_connected,
            'tracker_status': self._tracker_status_payload(),
            'geometry': self._geometry_payload(),
            # Lets the frontend route speech to browser speechSynthesis when
            # the backend voice cannot produce audio (otherwise the patient
            # would be silently mute while the connection shows healthy).
            'tts_available': self.tts.available
        })

        try:
            async for message in websocket:
                await self._handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.discard(websocket)
            if self.word_service is not None:
                self.word_service.forget_client(websocket)
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

        # Before anything is loaded or connected: the port is the contract with
        # the interface, so a held port is a refusal, not a search for another.
        if WEBSOCKETS_AVAILABLE:
            ensure_port_available(self.config.websocket_host, self.config.websocket_port)

        # Store event loop reference for thread-safe WebSocket sends
        self._event_loop = asyncio.get_running_loop()
        self._shutdown = asyncio.Event()
        if self.config.parent_pid > 0:
            watch_parent_process(self.config.parent_pid, self.request_shutdown)

        # Connect to Tobii
        if self.config.tobii_enabled:
            if await self.tobii.connect():
                logger.info("Tobii connection successful")
            else:
                logger.warning("Running without Tobii eye tracker")

        # Load saved prediction data
        data_file = Path(self.config.data_dir) / 'prediction_data.json'
        self.prediction.load()

        # Learn from saved chat history to improve predictions (legacy engine
        # only; the deterministic engine learns from committed actions).
        chat_dir = self._get_chat_history_dir()
        self.prediction.learn_from_chat_history(str(chat_dir))
        logger.info(f"Chat history folder: {chat_dir}")

        # Warm the word prediction worker before the first keystroke needs it.
        if self.word_service is not None:
            self.word_service.start()
            logger.info(f"Word prediction: {DETERMINISTIC_ENGINE_VERSION} ({self.config.prediction_execution})")

        # Enforce retention limits at startup as well.
        self._run_storage_maintenance()

        # Start WebSocket server
        if WEBSOCKETS_AVAILABLE:
            actual_port = self.config.websocket_port
            try:
                server = await websockets.serve(
                    self._websocket_handler,
                    self.config.websocket_host,
                    actual_port
                )
            except OSError as e:
                # The port was taken between the check above and this bind.
                if e.errno == 10048 or 'address already in use' in str(e).lower():
                    raise PortInUseError(
                        f"Port {actual_port} was taken while the backend was starting; "
                        f"run status-dev.bat to see what holds it. ({e})"
                    ) from e
                raise
            logger.info(f"WebSocket server started on ws://{self.config.websocket_host}:{actual_port}")

            # Start periodic tasks
            periodic = asyncio.create_task(self._periodic_tasks())

            # FIX v4.7: Start dedicated gaze broadcast loop
            gaze_loop = asyncio.create_task(self._gaze_broadcast_loop())

            # Web Hub: background news refresh (additive)
            news_refresh = asyncio.create_task(self._news_refresh_loop())

            try:
                # Runs until stopped: Ctrl+C, or the parent process ending when
                # --parent-pid is set (watch_parent_process).
                await self._shutdown.wait()
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

    def request_shutdown(self, reason: str = 'the parent process ended') -> None:
        """Ask the running server to stop. Safe to call from another thread."""
        logger.info(f"Shutting down: {reason}")
        loop, event = self._event_loop, self._shutdown
        if loop is not None and event is not None and not loop.is_closed():
            loop.call_soon_threadsafe(event.set)

    def stop(self):
        """Stop the backend."""
        logger.info("Stopping GazeConnect Pro Backend...")

        # Disconnect Tobii
        self.tobii.disconnect()

        # Save prediction data
        data_file = Path(self.config.data_dir) / 'prediction_data.json'
        self.prediction.save()
        self.sentence_predictor.save()
        if self.word_service is not None:
            self.word_service.shutdown()

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
    parser.add_argument('--parent-pid', type=int, default=0,
                        help='Stop when this process ends (Electron passes its own id)')
    # Accepted and ignored: an app compiled before the fix may still pass it, and
    # an unknown argument would stop the backend from starting at all.
    parser.add_argument('--exit-with-parent', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--data-dir', default='./data', help='Data directory')
    parser.add_argument('--survey-data-dir', default='./survey_data', help='Survey data directory')
    def env_choice(name: str, choices: tuple, default: str) -> str:
        # argparse does not validate defaults, so normalise the environment here.
        value = os.environ.get(name, '').strip().lower()
        if value and value not in choices:
            logger.warning(f"Ignoring {name}={value!r}; expected one of {', '.join(choices)}")
        return value if value in choices else default

    parser.add_argument('--prediction-engine', choices=('deterministic', 'legacy'),
                        default=env_choice('GAZECONNECT_PREDICTION_ENGINE', ('deterministic', 'legacy'), 'deterministic'),
                        help='Word prediction engine (legacy is a rollback)')
    parser.add_argument('--prediction-execution', choices=('process', 'thread', 'inline'),
                        default=env_choice('GAZECONNECT_PREDICTION_EXECUTION', ('process', 'thread', 'inline'), 'process'),
                        help='Where deterministic scoring runs')

    args = parser.parse_args()

    config = ServerConfig(
        websocket_host=args.host,
        websocket_port=args.port,
        tobii_enabled=not args.no_tobii,
        tobii_simulated=args.simulate,
        data_dir=args.data_dir,
        survey_data_dir=args.survey_data_dir,
        prediction_engine=args.prediction_engine,
        prediction_execution=args.prediction_execution,
        parent_pid=args.parent_pid,
    )

    backend = GazeConnectBackend(config)

    try:
        asyncio.run(backend.start())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except PortInUseError as exc:
        # Exit code 3: the app reports this one instead of retrying the launch.
        logger.error(str(exc))
        backend.stop()
        sys.exit(3)
    finally:
        backend.stop()

if __name__ == '__main__':
    main()

