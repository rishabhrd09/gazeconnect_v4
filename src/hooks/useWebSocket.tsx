/**
 * GazeConnect Pro - WebSocket Hook
 * =================================
 * Handles real-time communication with Python backend.
 * 
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Message handlers for all event types
 * - Target registration for dwell detection
 * - Prediction and phrase fetching
 * - TTS control
 * - Fatigue metrics
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const DEBUG_GAZE_LOGS = false;

// ============================================
// TYPES
// ============================================

export interface GazeData {
  x: number;
  y: number;
  /** Coordinate space of x/y from backend ('window' preferred) */
  coord_space?: 'window' | 'screen';
  /** Backend filter zone label (lock/fixation/free/edge/etc.) */
  backend_zone?: string;
  is_valid: boolean;
  is_fixation: boolean;
  confidence: number;
  /** Backend gaze state classifier: 'fixation' | 'saccade' | 'glissade' */
  gaze_state?: string;
  /** Gaze velocity in degrees/second */
  velocity?: number;
  /** Raw (pre-filter) normalized x */
  raw_x?: number;
  /** Raw (pre-filter) normalized y */
  raw_y?: number;
  conditioned_x?: number;
  conditioned_y?: number;
  mapped_x?: number;
  mapped_y?: number;
  kalman_x?: number;
  kalman_y?: number;
  classifier_state?: string;
  active_pipeline?: string;
  active_filter_preset?: string;
  sample_rate_hz?: number;
  calibration_applied?: boolean;
  validity_source?: string;
  /** Backend reports if filter considered gaze "on key" (for dual-pull coordination) */
  backend_on_key?: boolean;
  /** Backend magnetism pull applied this frame in pixels */
  backend_magnet_px?: number;
}

export interface DwellEvent {
  target_id: string;
  progress?: number;
  elapsed_ms?: number;
}

export interface Prediction {
  word: string;
  score: number;
  source: string;
}

export interface FatigueMetrics {
  fatigue_level: string;
  fatigue_score: number;
  blinks_per_minute: number;
  gaze_stability: number;
  session_duration_minutes: number;
  time_since_break_minutes: number;
  recommendations: string[];
}

export interface BreakReminder {
  message: string;
  seconds_until_break?: number;
}

export interface WebSocketContextValue {
  isConnected: boolean;
  isGazeEnabled: boolean;
  tobiiConnected: boolean;
  // v17.18: backend TTS health from the 'connected' handshake. When false,
  // speech must keep using browser speechSynthesis even though the socket is
  // up — otherwise a healthy connection with a dead pyttsx3 leaves the
  // patient silently mute (emergency included).
  ttsAvailable: boolean;
  currentScreen: string;

  // Connection/State Methods
  setGazeEnabled: (enabled: boolean) => void;
  setScreen: (screen: string) => void;
  setScreenSize: (width: number, height: number) => void;
  registerTargets: (targets: any[]) => void;

  // Gaze Subscription
  subscribeGaze: (callback: (data: GazeData) => void) => () => void;

  // NLP/TTS Methods
  getPredictions: (text: string, length_hint?: number, lang?: string) => void;
  getPhrases: (category?: string) => void;
  expandAbbreviation: (abbrev: string) => void;
  learnWord: (word: string) => void;
  addWord: (word: string) => void;
  learnSentence: (sentence: string) => void;
  getDictionaryData: () => void;
  getBuiltinData: () => void;
  builtinData: any;
  addAbbreviation: (abbrev: string, expansion: string) => void;
  removeAbbreviation: (abbrev: string) => void;
  addSentenceTemplate: (sentence: string) => void;
  getSentenceHistory: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  setTTSRate: (rate: number) => void;
  setTTSVolume: (volume: number) => void;

  // Health Methods
  getFatigue: () => void;
  takeBreak: () => void;
  snoozeBreak: (minutes: number) => void;
  skipBreak: () => void;
  setFilterPreset: (preset: string) => void;
  sendFilterParams: (params: { preset?: string; min_cutoff?: number; beta?: number; d_cutoff?: number }) => void;
  executeAutomation: (actionId: 'media_play_pause' | 'media_next' | 'browser_back' | 'browser_forward') => void;
  setGazeOffset: (offsetX: number, offsetY: number) => void;
  updateText: (text: string) => void;
  saveSurvey: (data: any) => void;
  loadSurvey: () => void;
  compileSurvey: (data: any) => void;
  snapshotSurvey: (data: any) => void;

  // Web Hub Methods (additive)
  getNews: (category?: string, limit?: number) => void;
  refreshNews: (category?: string, limit?: number) => void;
  getNewsCategories: () => void;
  getKnowledgeCategories: () => void;
  getKnowledgeArticles: (categoryId: string) => void;
  getKnowledgeArticle: (articleId: string) => void;
  searchKnowledge: (query: string) => void;
  fetchArticle: (url: string, force?: boolean) => void;
  getQuickSnapshot: (force?: boolean) => void;

  // Data
  predictions: Prediction[];
  sentencePredictions: Array<{text: string; score: number; source: string}>;
  phrases: string[];
  sentenceHistory: Array<{text: string; count: number}>;
  abbreviationExpansion: string | null;
  fatigueMetrics: FatigueMetrics | null;
  surveyData: Record<string, any> | null;
  surveyCompiled: any | null;
  surveyStatus: 'idle' | 'loading' | 'loaded' | 'saving' | 'compiling' | 'compiled';

  // Web Hub Data (additive)
  newsItems: any[];
  newsCategories: any[];
  newsCached: boolean;
  knowledgeCategories: any[];
  knowledgeArticles: any[];
  knowledgeArticle: any | null;
  knowledgeSearchResults: any[];
  articleData: any | null;
  quickSnapshot: any | null;

  // Legacy Callbacks (kept for backward compatibility where needed)
  onGaze?: (data: GazeData) => void;
  onDwellStart?: (event: DwellEvent) => void;
  onDwellProgress?: (event: DwellEvent) => void;
  onDwellComplete?: (event: DwellEvent) => void;
  onDwellCancel?: (event: DwellEvent) => void;
  onBreakReminder?: (reminder: BreakReminder) => void;
}

// ============================================
// CONTEXT
// ============================================

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export const useWS = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWS must be used within WebSocketProvider');
  }
  return context;
};

// ============================================
// PROVIDER
// ============================================

interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
  onGaze?: (data: GazeData) => void;
  onDwellStart?: (event: DwellEvent) => void;
  onDwellProgress?: (event: DwellEvent) => void;
  onDwellComplete?: (event: DwellEvent) => void;
  onDwellCancel?: (event: DwellEvent) => void;
  onBreakReminder?: (reminder: BreakReminder) => void;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  url = 'ws://127.0.0.1:8765',
  onGaze,
  onDwellStart,
  onDwellProgress,
  onDwellComplete,
  onDwellCancel,
  onBreakReminder,
}) => {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isGazeEnabled, setIsGazeEnabled] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('home');
  const [tobiiConnected, setTobiiConnected] = useState(false);
  // Default true: an older backend that doesn't send tts_available must not
  // demote speech to the browser fallback.
  const [ttsAvailable, setTtsAvailable] = useState(true);

  // Data state
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [sentencePredictions, setSentencePredictions] = useState<Array<{text: string; score: number; source: string}>>([]);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [sentenceHistory, setSentenceHistory] = useState<Array<{text: string; count: number}>>([]);
  const [abbreviationExpansion, setAbbreviationExpansion] = useState<string | null>(null);
  const [fatigueMetrics, setFatigueMetrics] = useState<FatigueMetrics | null>(null);

  // Survey state
  const [surveyData, setSurveyData] = useState<Record<string, any> | null>(null);
  const [surveyCompiled, setSurveyCompiled] = useState<any | null>(null);
  const [surveyStatus, setSurveyStatus] = useState<'idle' | 'loading' | 'loaded' | 'saving' | 'compiling' | 'compiled'>('idle');

  // Built-in data (on-demand for Settings)
  const [builtinData, setBuiltinData] = useState<any>(null);

  // Web Hub state (additive — no impact on gaze)
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [newsCategories, setNewsCategories] = useState<any[]>([]);
  const [newsCached, setNewsCached] = useState(false);
  const [knowledgeCategories, setKnowledgeCategories] = useState<any[]>([]);
  const [knowledgeArticles, setKnowledgeArticles] = useState<any[]>([]);
  const [knowledgeArticle, setKnowledgeArticle] = useState<any | null>(null);
  const [knowledgeSearchResults, setKnowledgeSearchResults] = useState<any[]>([]);
  const [articleData, setArticleData] = useState<any | null>(null);
  const [quickSnapshot, setQuickSnapshot] = useState<any | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const listenersRef = useRef<Set<(data: GazeData) => void>>(new Set());
  const predictionRequestIdRef = useRef(0);
  const latestPredictionRequestIdRef = useRef(0);

  // Subscribe Gaze
  const subscribeGaze = useCallback((callback: (data: GazeData) => void) => {
    listenersRef.current.add(callback);
    return () => { listenersRef.current.delete(callback); };
  }, []);

  // Send message helper
  const send = useCallback((type: string, data?: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  // FIX v4.7: Store handleMessage in a ref so it never causes reconnection
  const handleMessageRef = useRef<(event: MessageEvent) => void>(() => { });

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      const msgType = data.type;

      // Handle Gaze separately for speed
      if (msgType === 'gaze') {
        const gazeData: GazeData = {
          x: data.x,
          y: data.y,
          coord_space: data.coord_space,
          backend_zone: data.backend_zone,
          is_valid: data.is_valid,
          is_fixation: data.is_fixation,
          confidence: data.confidence,
          gaze_state: data.gaze_state,
          velocity: data.velocity,
          raw_x: data.raw_x,
          raw_y: data.raw_y,
          conditioned_x: data.conditioned_x,
          conditioned_y: data.conditioned_y,
          mapped_x: data.mapped_x,
          mapped_y: data.mapped_y,
          kalman_x: data.kalman_x,
          kalman_y: data.kalman_y,
          classifier_state: data.classifier_state,
          active_pipeline: data.active_pipeline,
          active_filter_preset: data.active_filter_preset,
          sample_rate_hz: data.sample_rate_hz,
          calibration_applied: data.calibration_applied,
          validity_source: data.validity_source,
          backend_on_key: data.backend_on_key,
          backend_magnet_px: data.backend_magnet_px,
        };

        if (DEBUG_GAZE_LOGS) {
          console.log(`[WS] gaze (${data.x?.toFixed(3)}, ${data.y?.toFixed(3)}) listeners=${listenersRef.current.size}`);
        }

        // Notify Legacy callback
        onGaze?.(gazeData);

        // CRITICAL: Notify all subscribers (this is main path to GazeCursor)
        const listenerCount = listenersRef.current.size;
        if (DEBUG_GAZE_LOGS && listenerCount === 0) {
          console.warn('[WS] No gaze listeners registered.');
        }

        listenersRef.current.forEach(cb => {
          try {
            cb(gazeData);
          } catch (e) {
            console.error('[WS] Gaze listener error:', e);
          }
        });
        return;
      }

      // v17: Broadcast gaze_lost events for blink/stale/gap detection
      if (msgType === 'gaze_lost') {
        window.dispatchEvent(new CustomEvent('gaze_lost', {
          detail: { reason: data.reason, age_ms: data.age_ms, gap_ms: data.gap_ms },
        }));
        return;
      }

      if (msgType.startsWith('calibration_')) {
        window.dispatchEvent(new CustomEvent('calibration_message', {
          detail: { type: msgType, data },
        }));
      }

      switch (msgType) {
        case 'connected':
          setIsGazeEnabled(data.gaze_enabled || false);
          setCurrentScreen(data.current_screen || 'home');
          setTobiiConnected(data.tobii_connected || false);
          // Absent field (older backend) => assume available.
          setTtsAvailable(data.tts_available !== false);
          break;

        case 'gaze_enabled':
          setIsGazeEnabled(data.enabled);
          break;

        case 'screen_changed':
          setCurrentScreen(data.screen);
          break;

        case 'dwell_start':
          onDwellStart?.({ target_id: data.target_id });
          break;

        case 'dwell_progress':
          onDwellProgress?.({
            target_id: data.target_id,
            progress: data.progress,
            elapsed_ms: data.elapsed_ms,
          });
          break;

        case 'dwell_complete':
          onDwellComplete?.({ target_id: data.target_id });
          break;

        case 'dwell_cancel':
          onDwellCancel?.({ target_id: data.target_id });
          break;

        case 'predictions':
          if (typeof data.request_id === 'number' && data.request_id < latestPredictionRequestIdRef.current) {
            break;
          }
          setPredictions(data.words || []);
          setSentencePredictions(data.sentences || []);
          break;

        case 'builtin_data':
          setBuiltinData(data);
          break;

        case 'phrases':
          setPhrases(data.phrases || []);
          break;

        case 'sentence_history':
          setSentenceHistory(data.sentences || []);
          break;

        case 'abbreviation_expansion':
          setAbbreviationExpansion(data.expansion);
          setTimeout(() => setAbbreviationExpansion(null), 100);
          break;

        case 'fatigue_metrics':
          setFatigueMetrics(data);
          break;

        case 'break_warning':
        case 'break_needed':
          onBreakReminder?.({
            message: data.message,
            seconds_until_break: data.seconds_until_break,
          });
          break;

        case 'dry_eye_reminder':
          onBreakReminder?.({ message: data.message });
          break;

        case 'survey_loaded':
          setSurveyData(data.survey_data || null);
          setSurveyStatus('loaded');
          break;

        case 'survey_saved':
          setSurveyStatus('loaded');
          break;

        case 'survey_compiled':
          setSurveyCompiled(data.compiled || null);
          setSurveyStatus('compiled');
          break;

        case 'pong':
          break;

        case 'automation_result':
          if (!data.ok) {
            console.warn('Automation fallback failed:', data.action_id, data.error);
          }
          break;

        default:
          // Web Hub message handlers (additive)
          if (msgType === 'news_data') {
            setNewsItems(data.items || []);
            setNewsCached(data.cached || false);
          } else if (msgType === 'news_categories') {
            setNewsCategories(data.categories || []);
          } else if (msgType === 'knowledge_categories') {
            setKnowledgeCategories(data.categories || []);
          } else if (msgType === 'knowledge_articles') {
            setKnowledgeArticles(data.articles || []);
          } else if (msgType === 'knowledge_article') {
            setKnowledgeArticle(data.article || null);
          } else if (msgType === 'knowledge_search') {
            setKnowledgeSearchResults(data.results || []);
          } else if (msgType === 'article_data') {
            setArticleData(data.article ? { ...data.article, url: data.url || data.article.url } : null);
          } else if (msgType === 'quick_snapshot') {
            setQuickSnapshot(data.snapshot || null);
          } else {
            console.log('Unknown message type:', data.type);
          }
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [onGaze, onDwellStart, onDwellProgress, onDwellComplete, onDwellCancel, onBreakReminder]);

  // Keep ref in sync (prevents reconnection when handler changes)
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  // Connect to WebSocket
  // FIX v4.7: Uses handleMessageRef so connect() is stable (no reconnection loops)
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        send('set_screen_size', {
          width: window.innerWidth,
          height: window.innerHeight,
          physicalWidth: window.screen.width,
          physicalHeight: window.screen.height,
          dpr: window.devicePixelRatio || 1,
          windowX: window.screenX || 0,
          windowY: window.screenY || 0,
        });
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting reconnection...');
          connect();
        }, delay);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      // FIX v4.7: Use ref indirection — handler updates without reconnecting
      wsRef.current.onmessage = (event) => {
        if (DEBUG_GAZE_LOGS) {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'gaze') {
              console.log(`[WS] gaze x=${parsed.x?.toFixed(3)} y=${parsed.y?.toFixed(3)}`);
            }
          } catch {
            // Ignore parse errors in debug logger.
          }
        }
        handleMessageRef.current(event);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, [url, send]); // NOTE: handleMessage removed from deps — uses ref instead

  useEffect(() => {
    connect();
    const syncScreenMetrics = () => {
      send('set_screen_size', {
        width: window.innerWidth,
        height: window.innerHeight,
        physicalWidth: window.screen.width,
        physicalHeight: window.screen.height,
        dpr: window.devicePixelRatio || 1,
        windowX: window.screenX || 0,
        windowY: window.screenY || 0,
      });
    };

    // FIX v4.7: Debounce resize to prevent "Screen size set to" spam
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        syncScreenMetrics();
      }, 500);
    };
    // Keep backend window offsets fresh even when window moves without resize.
    const metricsInterval = setInterval(syncScreenMetrics, 2000);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(metricsInterval);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect, send]);

  useEffect(() => {
    const interval = setInterval(() => { if (isConnected) send('ping'); }, 30000);
    return () => clearInterval(interval);
  }, [isConnected, send]);

  const value: WebSocketContextValue = {
    isConnected,
    isGazeEnabled,
    currentScreen,
    tobiiConnected,
    ttsAvailable,
    setGazeEnabled: (enabled) => send('set_gaze_enabled', { enabled }),
    setScreen: (screen) => send('set_screen', { screen }),
    setScreenSize: (width, height) => send('set_screen_size', {
      width, height,
      physicalWidth: window.screen.width,
      physicalHeight: window.screen.height,
      dpr: window.devicePixelRatio || 1,
      windowX: window.screenX || 0,
      windowY: window.screenY || 0,
    }),
    registerTargets: (targets) => send('register_targets', { targets }),
    getPredictions: (text, length_hint, lang) => {
      const requestId = predictionRequestIdRef.current + 1;
      predictionRequestIdRef.current = requestId;
      latestPredictionRequestIdRef.current = requestId;
      send('get_predictions', { text, length_hint, lang, top_k: 12, request_id: requestId });
    },
    getPhrases: (category) => send('get_phrases', { category }),
    expandAbbreviation: (abbrev) => send('expand_abbreviation', { abbrev }),
    learnWord: (word) => send('learn_word', { word }),
    addWord: (word) => send('add_word', { word }),
    learnSentence: (sentence) => send('learn_sentence', { sentence }),
    getDictionaryData: () => send('get_dictionary_data'),
    getBuiltinData: () => send('get_builtin_data'),
    builtinData,
    addAbbreviation: (abbrev, expansion) => send('add_abbreviation', { abbrev, expansion }),
    removeAbbreviation: (abbrev) => send('remove_abbreviation', { abbrev }),
    addSentenceTemplate: (sentence) => send('add_sentence_template', { sentence }),
    getSentenceHistory: () => send('get_sentence_history'),
    speak: (text) => send('speak', { text }),
    // STOP must silence every voice path: backend pyttsx3 AND any in-flight
    // browser speechSynthesis utterance (e.g. one started while the backend
    // was briefly down — previously it played to completion, unstoppable).
    stopSpeaking: () => {
      try { window.speechSynthesis?.cancel(); } catch { /* no-op */ }
      send('stop_speaking');
    },
    setTTSRate: (rate) => send('set_tts_rate', { rate }),
    setTTSVolume: (volume) => send('set_tts_volume', { volume }),
    getFatigue: () => send('get_fatigue'),
    takeBreak: () => send('take_break'),
    snoozeBreak: (minutes) => send('snooze_break', { minutes }),
    skipBreak: () => send('skip_break'),
    setFilterPreset: (preset) => send('set_filter_preset', { preset }),
    sendFilterParams: (params) => send('set_filter_params', params),
    executeAutomation: (actionId) => send('automation_execute', {
      action_id: actionId,
      request_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
    setGazeOffset: (offsetX: number, offsetY: number) => send('set_gaze_offset', { offsetX, offsetY }),
    updateText: (text) => send('update_text', { text }),
    saveSurvey: (data) => send('save_survey', { survey_data: data }),
    loadSurvey: () => { setSurveyStatus('loading'); send('load_survey'); },
    compileSurvey: (data) => { setSurveyStatus('compiling'); send('compile_survey', data); },
    snapshotSurvey: (data) => { setSurveyStatus('saving'); send('snapshot_survey', data); },
    // Web Hub methods (additive)
    getNews: (category = 'top', limit = 9) => send('get_news', { category, limit }),
    refreshNews: (category = 'top', limit = 9) => send('refresh_news', { category, limit }),
    getNewsCategories: () => send('get_news_categories'),
    getKnowledgeCategories: () => send('get_knowledge_categories'),
    getKnowledgeArticles: (categoryId) => send('get_knowledge_articles', { category_id: categoryId }),
    getKnowledgeArticle: (articleId) => send('get_knowledge_article', { article_id: articleId }),
    searchKnowledge: (query) => send('search_knowledge', { query }),
    fetchArticle: (url, force = false) => send('fetch_article', { url, force }),
    getQuickSnapshot: (force = false) => send('get_quick_snapshot', { force }),
    subscribeGaze,
    predictions,
    sentencePredictions,
    phrases,
    sentenceHistory,
    abbreviationExpansion,
    fatigueMetrics,
    surveyData,
    surveyCompiled,
    surveyStatus,
    // Web Hub data (additive)
    newsItems,
    newsCategories,
    newsCached,
    knowledgeCategories,
    knowledgeArticles,
    knowledgeArticle,
    knowledgeSearchResults,
    articleData,
    quickSnapshot,
    onGaze,
    onDwellStart,
    onDwellProgress,
    onDwellComplete,
    onDwellCancel,
    onBreakReminder,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;

