# GazeConnect Pro — Gaze Accuracy & Word Prediction Guide

> **Audience:** Developers, testers, and anyone wanting to understand how the eye-tracking cursor stays stable and how word predictions are generated.

---

## Table of Contents

1. [Part 1 — Gaze Cursor Accuracy](#part-1--gaze-cursor-accuracy)
2. [Part 2 — Keyboard Word Prediction](#part-2--keyboard-word-prediction)
3. [Part 3 — How They Work Together](#part-3--how-they-work-together)
4. [Part 4 — Recent Changes (v15–v17)](#part-4--recent-changes-v15v17)

---

## Part 1 — Gaze Cursor Accuracy

### The Problem

Eye trackers (like the Tobii ET5) report raw gaze coordinates at ~133 Hz. These raw coordinates are **noisy** — even when a person stares at a single point, the reported position jitters by 30–80 pixels due to:

- **Micro-tremors** — involuntary tiny eye movements (~0.5° visual angle)
- **Tracker noise** — hardware measurement imprecision
- **Blinks & frame drops** — Tobii frequently drops frames (120–244ms gaps)
- **Distance effects** — noise is amplified at greater screen distances (~600mm)
- **ALS motor impairment** — tremors are significantly worse for ALS patients

Without filtering, the cursor would vibrate constantly, making it impossible to select keyboard keys.

### The Solution: A Multi-Layer Filter Pipeline

GazeConnect solves this with **10 sequential filtering/selection layers** spanning backend and frontend. Each layer does one specific job:

```
Raw Tobii Data (LightlyFiltered mode, ~133 Hz)
    │
    ▼
┌─────────────────────────────────┐
│  Layer 1: One Euro Filter       │  → Removes high-frequency noise
│  (one_euro_filter.py)           │     while preserving fast movements
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 2: Adaptive Kalman       │  → State-aware smoothing:
│  (one_euro_filter.py)           │     fixation=4200, saccade=200
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 3: Anti-Recoil           │  → Dampens overshoot after fast
│  (one_euro_filter.py)           │     eye movements (saccades)
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 4: OptiKey 4-Zone Filter │  → LOCK/KEY/FIXATION/FREE zones
│  (one_euro_filter.py)           │     with context-aware magnetism
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 5: Backend Magnetism     │  → Sticky target pull toward
│  (main.py)                      │     registered UI element centers
└─────────────────────────────────┘
    │
    ▼
  ─── WebSocket to frontend ───
    │
    ▼
┌─────────────────────────────────┐
│  Layer 6: 3-Sample Pre-Smooth   │  → OptiKey-style weighted average
│  (GazeCursor.tsx)               │     (0.45/0.30/0.25) before EMA
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 7: Velocity-Adaptive EMA │  → Smooth tracking with fixation
│  (GazeCursor.tsx)               │     alpha 0.38 (keyboard) / 0.45
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 8: Semantic Snapping     │  → Context-aware pull toward
│  (gazeSnapping.ts)              │     gaze-enabled buttons
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 9: Nearest-Center Select │  → OptiKey Rect.Contains: select
│  (GazeCursor.tsx)               │     element by closest center, not
│                                 │     point-in-rect hit test
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Layer 10: Snap-to-Center Lock  │  → On dwell start, cursor jumps
│  (GazeCursor.tsx)               │     to element center + highlight
│                                 │     rect border appears
└─────────────────────────────────┘
    │
    ▼
  Stable cursor + visual highlight ✓
```

### Key Files and What They Do

| File | Location | Role |
|------|----------|------|
| `one_euro_filter.py` | `python/services/` | Backend: All core filter layers (One Euro, Kalman, Anti-Recoil, OptiKey 4-Zone) |
| `main.py` | `python/` | Backend: WebSocket handler, coordinate mapping, sticky magnetism, on-key detection |
| `GazeCursor.tsx` | `src/components/core/` | Frontend: 3-sample pre-smoothing, EMA, nearest-center selection, snap-to-center lock, visual highlight, overlay-aware hit testing |
| `gazeSnapping.ts` | `src/utils/` | Frontend: Context-aware semantic snapping (keyboard/prediction/toggle/general) |
| `hitZoneExpansion.ts` | `src/utils/` | Frontend: Center-weighted keyboard hit zone expansion (35px snap margin) |
| `GazeButton.tsx` | `src/components/core/` | Frontend: Dwell timing per category, onset delay, data-gaze attributes |
| `dwellTimeConfig.ts` | `src/config/` | Frontend: ALS stage presets that control filter aggressiveness and dwell times |
| `Program.cs` | `tobii-helper/` | C# bridge: Tobii ET5 LightlyFiltered mode, TCP stream to Python |

### How Each Layer Works

#### Layer 1: One Euro Filter (`OneEuroFilter` class)
- **What:** A low-pass filter that adapts its cutoff frequency based on how fast the signal is changing.
- **Why:** During fixation (slow movement), it smooths aggressively. During saccades (fast eye jumps), it lets the signal through quickly.
- **Key parameter:** `min_cutoff` (lower = smoother) and `beta` (higher = faster response to speed changes).

#### Layer 2: Adaptive Kalman Filter (`AdaptiveKalmanFilter` class)
- **What:** A Kalman filter ported from OptiKey v3.2.5 that adapts its measurement noise based on the classified gaze state.
- **How state affects smoothing:**
  - **Fixation** → `measurement_noise = 4200` → very heavy smoothing, cursor barely moves
  - **Saccade** → `measurement_noise = 200` → light smoothing, cursor follows the eye quickly
  - **Glissade** (settling after saccade) → `measurement_noise = 1200` → moderate smoothing
- **Key insight:** OptiKey operates in pixel space (0–1920). We convert normalized coords internally.

#### Layer 3: Anti-Recoil Filter (`AntiRecoilFilter` class)
- **What:** A 3-point weighted moving average that prevents cursor bounce after saccades.
- **How:** Uses adaptive weights — during large movements, it favors the current sample (75%/15%/10%). During small fixation tremor, it averages more evenly (45%/30%/25%).

#### Layer 4: OptiKey 4-Zone Adaptive Filter (backend, `one_euro_filter.py`)
- **What:** Ported from OptiKey v3.2.5. Four concentric zones around the current target with different damping:
  - **LOCK zone** — multiplier = 0, cursor completely frozen (like OptiKey's `Rect.Contains`)
  - **KEY zone** — very low multiplier, gentle drift allowed
  - **FIXATION zone** — moderate multiplier with averaged samples
  - **FREE zone** — full tracking speed
- **Context-aware:** Keyboard screen uses tighter radii (`lock_radius=0.020`, ~38px) than other screens.
- **Key parameters:** `hysteresis_multiplier=1.7` (keyboard), `_MIN_LOCK_DURATION=80ms`

#### Layer 5: Backend Sticky Magnetism (`main.py`)
- **What:** Backend pulls the filtered cursor toward registered UI target centers.
- **Context parameters (per screen type):**
  - `keyboard`: radius 72px, pull 0.32, release 88px
  - `prediction`: radius 112px, pull 0.48, release 100px
  - `navigation`: radius 44px, pull 0.16, release 64px
  - `gazetoggle`: radius 165px, pull 0.34, release 185px
- **Handoff bias:** 8px nudge toward new target during adjacent-target transitions.

#### Layer 6: 3-Sample Pre-Smoothing (`GazeCursor.tsx`)
- **What:** OptiKey's `SmoothWhenChangingGazeTarget` — a 3-sample weighted average applied to raw gaze data **before** the EMA smoother. Active on ALL screens.
- **Weights:** Current=0.45, Previous=0.30, Two-ago=0.25
- **Why:** Reduces single-sample jitter spikes that cause false target switches.

#### Layer 7: Velocity-Adaptive EMA (`GazeCursor.tsx`)
- **What:** Exponential Moving Average with alpha that adapts to cursor velocity.
- **Key alphas:** Keyboard fixation=0.38, other screens fixation=0.45, noise threshold=0.18
- **Saccade bypass:** Raw movements >34px skip smoothing entirely for instant response.

#### Layer 8: Semantic Snapping (`computeSnap()` in `gazeSnapping.ts`)
- **What:** Frontend-side magnetic attraction toward gaze-enabled buttons during fixation only.
- **Context-specific parameters:**
  - General buttons: radius 120px, max strength 0.22
  - Keyboard keys: radius 90px, max strength 0.10 (reduced to avoid dual-pull with backend)
  - Prediction bar: radius 138px, max strength 0.20
  - Gaze toggle: radius 220px, max strength 0.36
- **Edge multiplier:** Edge buttons get 1.15× larger snap radius.
- **Safety:** Only active during fixation state — saccades disable snapping instantly.

#### Layer 9: Nearest-Center Selection (`GazeCursor.tsx`)
- **What:** OptiKey-inspired element selection — picks the UI element whose **center** is closest to the gaze point, rather than whichever element the cursor pixel happens to be inside.
- **Keyboard:** Uses `findBestKeyboardKey()` with 35px expanded hit zones (`hitZoneExpansion.ts`).
- **Other screens:** Uses snap targets with distance-based scoring + priority bonus.
- **Overlay awareness (v17):** Detects high-z-index overlays (e.g., QuickWords modal) and filters out hidden elements behind them, ensuring overlay buttons are gaze-selectable.

#### Layer 10: Snap-to-Center + Visual Highlight (`GazeCursor.tsx`)
- **What:** When dwell begins on an element, the cursor **jumps to the element's center** and a **rectangular highlight border** appears around it.
- **Lock threshold:** 0.10 (10% dwell progress) — cursor freezes within ~100ms, matching OptiKey's instant-lock behavior.
- **Visual feedback:** Teal/accent-colored border with glow effect, opacity tied to dwell progress.
- **Why this matters:** Provides the psychological stability of knowing exactly which element is being selected — eliminates the "drift during dwell" problem.

### ALS Stage → Filter Preset Mapping

Users select an ALS stage in Settings. Each stage configures both **dwell times** (how long to look to select) and **filter aggressiveness** (how much the cursor is stabilized):

| ALS Stage | Filter Preset | Behavior |
|-----------|---------------|----------|
| Caregiver | `responsive` | Minimal smoothing, fast cursor |
| Early ALS | `balanced` | Moderate smoothing |
| Mid ALS | `als_early` | Enhanced stability |
| Late ALS | `als_late` | Maximum stability, cursor barely moves during fixation |

---

## Part 2 — Keyboard Word & Sentence Prediction

### The Concept

When a user types on the keyboard using eye gaze, each letter takes 1–2 seconds to select (dwell time). Word prediction dramatically reduces input effort:

- Without prediction: `H-E-L-L-O` = 5 key selections (~6 seconds)
- With prediction: `H-E` → select "HELLO" from predictions = 3 selections (~4 seconds)
- With frequent words: just `H` → "HELLO" appears = 2 selections (~2.5 seconds)
- With sentence prediction: `I wa` → select "I want warm water" = 4 selections (~5 seconds, saves ~15 seconds)

World-class AAC software like **OptiKey** and **Tobii Dynavox** achieve 50–70% keystroke savings through smart prediction.

### How GazeConnect's Prediction Works (v3)

```
User types "I want wa"
      |
      v
+------------------------------+
|  1. Abbreviation Check       |  "gm" → "Good morning" (instant)
|     (ABBREVIATIONS dict)     |
+------------------------------+
      |
      v
+------------------------------+
|  2. N-Gram Context Scoring   |  Previous words affect ranking:
|     (NGramModel.predict())   |  "I want" + "wa" → "water" ↑↑↑
|     + Smart Bigrams (v3)     |  1,339 pre-computed word pairs
+------------------------------+
      |
      v
+------------------------------+
|  3. Blocked Words Filter (v3)|  110 harmful/inappropriate words
|     (prediction_guardrails)  |  never appear as suggestions
+------------------------------+
      |
      v
+------------------------------+
|  4. Vocabulary Boosts        |  Patient words get priority:
|     (PATIENT/CORE/MEDICAL)   |  PATIENT ×2.0, CORE ×1.5
+------------------------------+
      |
      v
+------------------------------+
|  5. User Frequency Boost     |  Words used often get boosted:
|     (user_frequencies dict)  |  "mummy" used 50× → score × 1.4
+------------------------------+
      |
      v
+------------------------------+
|  6. Recency Decay Boost (v2) |  Recent words score higher:
|     (RecencyTracker)         |  used 1h ago → ×1.5, fades over 72h
+------------------------------+
      |
      v
+------------------------------+
|  7. Patient Bigram Boost (v2)|  Personal word-pair patterns:
|     (PatientBigramTracker)   |  "warm"→"water" 10× → score ×3.5
+------------------------------+
      |
      v
+------------------------------+
|  8. Time-of-Day Boost (v2)   |  Morning: "chai" ×1.8
|     (_time_boost function)   |  Night: "blanket" ×1.8
+------------------------------+
      |
      v
+------------------------------+
|  9. CIFG-LSTM Neural Fusion  |  1.9MB neural model reranks results:
|     (PredictionFusion)       |  N-gram 75% + Neural 25% blended
+------------------------------+
      |
      v
  Top 12 word predictions + 3 sentence predictions
      |
      v (background, non-blocking)
+------------------------------+
| 10. Datamuse API (v3)        |  If WiFi: enriches with 1-5 extra
|     (optional, 300ms timeout)|  words from crowd-sourced data
+------------------------------+
```

### Key Files and What They Do

| File | Location | Role |
|------|----------|------|
| `word_prediction.py` | `python/services/` | Core engine: vocabulary, n-gram model, smart bigrams, neural fusion, scoring, RecencyTracker, PatientBigramTracker, time boost |
| `sentence_prediction.py` | `python/services/` | Sentence completion: template bank (180 templates), patient history, fuzzy matching |
| `prediction_guardrails.py` | `python/` | Blocked words filter (110 words): violent, harmful, inappropriate words never surface as predictions |
| `smart_bigrams.json` | `python/data/` | Pre-computed 1,339 word-pair frequencies from curated AAC corpus (36KB) |
| `generate_smart_bigrams.py` | `python/scripts/` | Generator script for smart_bigrams.json (run once to rebuild) |
| `gazeconnect_lm_quantized.onnx` | `python/ml/trained_models/` | CIFG-LSTM neural model (1.9MB, 661 vocab, 512 hidden) for semantic reranking |
| `inference.py` | `python/ml/` | ONNX Runtime neural predictor with 30ms hard timeout |
| `fusion.py` | `python/ml/` | PredictionFusion: blends n-gram (75%) + neural (25%) predictions dynamically |
| `KeyboardScreen.tsx` | `src/screens/` | UI: word prediction bar (5 slots), sentence prediction row (2 slots), selection handling |
| `useWebSocket.tsx` | `src/hooks/` | WebSocket: sends `get_predictions`, receives `{words, sentences}` |
| `main.py` | `python/` | WebSocket handler: orchestrates predictions, Datamuse API, feeds learning |

### The Vocabulary System

The prediction engine draws from **9 merged vocabulary sets** — together forming ~3500+ unique words:

| Vocabulary Set | Boost | Purpose | Example Words |
|---|---|---|---|
| `PATIENT_VOCABULARY` | ×2.0 | Real words from this patient's chat history | mummy, papa, rishabh, karvat |
| `CULTURAL_VOCABULARY` | ×1.7 | Regional/religious terms | indore, hanumanji, chalisa |
| `HINGLISH_VOCABULARY` | ×1.6 | Transliterated Hindi words | kya, hai, achha, jaldi |
| `CORE_VOCABULARY` | ×1.5 | Top 500 English words | you, want, need, happy |
| `MEDICAL_VOCABULARY` | ×1.3 | ALS/MND-specific medical terms | suction, ventilator, tracheostomy |
| `APP_SCREEN_VOCABULARY` | ×1.0 | Words from activity/medical/feelings screens | urgent, alarm, frustrated |
| `EXPANDED_VOCABULARY` | ×1.0 | Common English words filling gaps | believe, information, quality |
| `EVERYDAY_VOCABULARY` | ×1.0 | Daily life: tech, weather, food, emotions | internet, chocolate, overwhelmed |
| `ALS_COMMUNICATION_VOCABULARY` | ×1.0 | AAC-specific: decisions, care, urgency | calibrate, disagree, thermometer |

All words shorter than 3 characters are filtered out (`MIN_WORD_LENGTH = 3`).

### The N-Gram Model

The n-gram model predicts the next word based on the **previous 1–2 words** (context):

- **Unigram** — word frequency alone: P("help") = how often "help" appears overall
- **Bigram** — previous word: P("help" | "need") = how often "help" follows "need"
- **Trigram** — previous 2 words: P("help" | "I need") = how often "help" follows "I need"

The final score uses **interpolation smoothing** to blend all three:

```
Score = 0.1 * P(unigram) + 0.3 * P(bigram) + 0.6 * P(trigram)
```

Trigrams are weighted 6x more than unigrams because context matters most.

### Training Sources

The n-gram model is trained on five sources:

1. **AAC phrase bank** (`AAC_PHRASES` in `word_prediction.py`) — categorized phrases for greetings, needs, medical, daily activities.

2. **Built-in training corpus** (`TRAINING_CORPUS` in `word_prediction.py`) — ~400+ carefully crafted sentences covering greetings, needs, medical requests, daily activities, emotional expressions, Hinglish patterns, question completions, staff/care instructions, daily routines, family/social, comfort/environment, and food/nutrition.

3. **Smart Bigrams (v3)** (`python/data/smart_bigrams.json`) — 1,339 pre-computed word-pair frequencies from 6,300 weighted sentences across 11 categories: core conversational (weight 10x), questions (8x), daily needs (8x), family/social (7x), medical/care (6x), emotions (5x), general English (5x), short phrases (6x), time/scheduling (4x), and high-frequency bigram boosters (3x). Loaded at startup, merged additively into the n-gram model. This is the single biggest quality improvement — transforms vocabulary from ~700 training sentences to knowledge of common English word sequences.

4. **CIFG-LSTM Neural Model** (`python/ml/trained_models/gazeconnect_lm_quantized.onnx`) — A 1.9MB quantized neural language model trained on 5,623 AAC sentences. Fused with n-gram predictions via PredictionFusion (75% n-gram / 25% neural, dynamic weighting). Adds ~10-15% prediction quality improvement by semantically reranking results.

5. **Chat history files** (`learn_from_chat_history()`) — On startup, the engine reads the **latest 5 chat log files** from `chat_history/chat_YYYY-MM-DD.txt` and trains the n-gram model on them. Newer files get higher weight (recency-weighted). This is how the system adapts to the user **between sessions**.

### v2 Enhancements (March 2026)

**RecencyTracker** — Tracks WHEN each word was used with exponential decay (72h half-life). Words used recently score higher, fading over time. Persisted to `data/patient_data/recency_scores.json`.

**PatientBigramTracker** — Learns word PAIRS from the patient's typing. If the patient types "warm water" 10 times, after typing "warm" the word "water" gets a massive ×3.5 boost. This is the highest-impact enhancement. Persisted to `data/patient_data/patient_bigrams.json`.

**Time-of-Day Boost** — Morning words (chai, medicine, breakfast) boost ×1.8 at 5am-11am. Night words (sleep, blanket, pain) boost ×1.8 at 9pm-5am. No persistence needed.

**Sentence Prediction** — A separate `SentencePredictor` engine that completes entire sentences from partial input. Sources: patient's spoken history (highest priority), 180 pre-built templates across 20 categories, and fuzzy substring matching. Shown in the bottom row of the keyboard (up to 2 sentences). Persisted to `data/patient_data/patient_sentences.json`.

### v3 Enhancements (March 2026)

**Smart Bigrams Database** — Pre-computed 1,339 word-pair frequencies from a curated corpus of 6,300 weighted sentences across 11 AAC communication categories. Loaded at startup (~50ms), merged additively into the n-gram model. This increased bigram coverage by 46% (2,068 to 3,022 pairs) and frequency confidence by 145% (8,470 to 20,740 total counts). The single biggest quality improvement — "I want " now correctly suggests "drink", "eat", "some" instead of only words from the original 700 training sentences.

**CIFG-LSTM Neural Language Model** — A custom-built 1.9MB quantized ONNX model (Coupled Input-Forget Gate LSTM, 512 hidden units, 661 vocab). Trained on 5,623 AAC sentences. Fused with n-gram results via PredictionFusion with dynamic weighting (n-gram 30-70%, neural 30-70% depending on n-gram confidence). Adds ~10-15% prediction quality improvement by semantic reranking. Hard 30ms timeout — never blocks UI.

**Datamuse API Integration** — When WiFi is available, fetches smart next-word suggestions from the free Datamuse API (no API key, 100K requests/day). Local predictions are sent instantly, Datamuse results arrive 100-300ms later as a non-blocking background enhancement. If offline, zero degradation. Results cached in-memory (500 entries, 1hr TTL). API words get low score (0.02) so patient-learned words always rank higher.

**Blocked Words Filter** — 110 violent, harmful, and inappropriate words are permanently blocked from ever appearing as suggestions. Includes: profanity, violent actions (dead, death, die, kill, shoot, weapon), harmful mental health words for ALS patients (helpless, hopeless, worthless, burden, lazy), body-shaming terms, and other inappropriate content. Enforced via `prediction_guardrails.py` at 20+ filter points across the entire codebase. Words like pain, sad, worried, scared, tired, hate, fight, guilty, nervous, stressed, suspicious, upset, troubled remain available — patients need these to express real feelings.

**Performance (v3 measured):**

| Metric | Value |
|--------|-------|
| Startup time | 1,180ms (smart bigrams adds ~50ms) |
| Prediction latency (mean) | 13.5ms |
| Prediction latency (P95) | 31.4ms |
| Process memory | ~50 MB |
| Neural model timeout | 30ms hard cap |
| Datamuse API timeout | 300ms (background, non-blocking) |
| Blocked words | 110 words, zero violations in testing |
| Gaze pipeline impact | Zero — prediction runs in WebSocket message handler, completely isolated from 66Hz gaze broadcast loop |

### Data Persistence (Prediction System)

| File | Content | Max Size |
|---|---|---|
| `data/custom_dictionary.json` | User word frequencies, recent words, custom words | ~50KB |
| `data/patient_data/recency_scores.json` | Word usage timestamps (30-day prune) | ~100KB |
| `data/patient_data/patient_bigrams.json` | Word pair frequencies (5000-pair prune) | ~200KB |
| `data/patient_data/patient_sentences.json` | Spoken sentence history (500-entry cap) | ~100KB |
| `python/data/smart_bigrams.json` | Pre-computed word-pair frequencies (read-only, ships with app) | 36KB |
| `python/ml/trained_models/gazeconnect_lm_quantized.onnx` | CIFG-LSTM neural model (read-only, ships with app) | 1.9MB |

Patient data saved every 60 seconds + on app shutdown. Total patient data < 500KB.
Smart bigrams + neural model are read-only static files shipped with the installer (~2MB total).

### Auto-Spacing and Smart Punctuation

When a user selects a predicted word:

1. **Auto-space** — A space is automatically appended: `"I need" + select "help"` → `"I need help "`
2. **Smart punctuation** — If the next key pressed is `. , ? ! ; :`, the trailing space is automatically removed: `"help " + "."` → `"help."`

This matches the behavior of OptiKey and Tobii Dynavox.

---

## Part 3 — How They Work Together

The gaze cursor and word prediction systems interact at the **keyboard screen**:

```
    +------------------------------------------+
    |           KeyboardScreen.tsx              |
    |                                          |
    |  +----------------------------------+    |
    |  |   Text Display Area              |    |
    |  |   "I need hel|"                  |    |
    |  +----------------------------------+    |
    |                                          |
    |  +----------------------------------+    |
    |  |   Prediction Bar (5 word slots)  |    |
    |  |  [help] [hello] [held] [helmet]  |    |
    |  +----------------------------------+    |
    |                                          |
    |  +----------------------------------+    |
    |  |   QWERTY Keyboard Grid           |    |
    |  |   Each key is a gaze-button      |    |<-- Snap Hysteresis
    |  |   with dwell circle animation    |    |    keeps cursor on key
    |  +----------------------------------+    |
    |                                          |
    |  +----------------------------------+    |
    |  |   Bottom Row (v2)                |    |
    |  |   Sentence predictions OR extra  |    |
    |  |   word predictions + SHOW NAV    |    |
    |  +----------------------------------+    |
    |                                          |
    +------------------------------------------+
                    (WebSocket)
    +------------------------------------------+
    |           Python Backend (main.py)       |
    |                                          |
    |   Raw Gaze -> Filter Pipeline -> Stable  |
    |                                          |
    |   "hel" -> WordPredictionEngine ->       |
    |            [help, hello, held, ...]      |
    |   "I need" -> SentencePredictor ->       |
    |            ["I need water", ...]         |
    +------------------------------------------+
```

**Data flow for typing one word:**

1. Tobii sends raw gaze at 133 Hz -> Python filters it -> sends stable `(x, y)` to frontend
2. Frontend applies snap hysteresis -> cursor sticks to key "H"
3. Dwell circle completes -> "H" appended to text
4. Frontend sends `get_predictions("H")` -> backend returns up to 12 words + 3 sentence predictions
5. User looks at "E", "L" -> predictions narrow to "help", "hello", etc.
6. User looks at prediction "help" -> dwell selects it
7. Frontend: replaces "hel" with "help " (auto-space)
8. Backend: `learn_word("help")` increments user frequency, updates recency tracker

**Data flow for sentence prediction:**

1. User types "I want" -> frontend sends `get_predictions("I want")`
2. Backend: word predictions + SentencePredictor returns ["I want warm water", "I want medicine", ...]
3. Bottom row shows sentence predictions (orange text) instead of extra word predictions
4. User dwells on "I want warm water" -> entire text area filled
5. Backend: `learn_sentence("I want warm water")` updates n-gram model, bigrams, recency, and sentence history

---

## Part 4 — Recent Changes (v15–v17)

### v15 Changes

#### Snap Hysteresis (`gazeSnapping.ts`)
Added context-aware snap radii and strengths. Keyboard keys get reduced snap (90px/0.10) to avoid dual-pull with backend magnetism. General buttons get 120px/0.22. Gaze toggle gets 220px/0.36.

#### Fixation Smoothing (`one_euro_filter.py`)
Increased Adaptive Kalman measurement noise: Fixation 3500→4200, Glissade 1000→1200. Saccade unchanged at 200.

#### Smart Punctuation (`KeyboardScreen.tsx`)
When typing `. , ? ! ; :`, if text ends with a trailing space (from auto-spacing after prediction), the space is removed first.

#### Vocabulary Expansion (`word_prediction.py`)
Added ~400 new words across `EVERYDAY_VOCABULARY` and `ALS_COMMUNICATION_VOCABULARY`.

#### ALS Stage → Filter Preset Linking
Each ALS stage now includes a `filterPreset` field syncing both dwell times and filter aggressiveness.

### v16 Changes — OptiKey-Grade Accuracy

#### Nearest-Center Selection (PRIMARY algorithm change)
**Before:** `document.elementsFromPoint()` — whichever element the cursor pixel is inside gets selected. At button edges, this frequently selects the wrong adjacent key.

**After:** Select the element whose **center** is closest to the gaze point (OptiKey's `Rect.Contains` approach). For keyboard keys, uses `findBestKeyboardKey()` with 35px expanded hit zones. For all other screens, uses snap targets with distance scoring.

#### 3-Sample Pre-Smoothing (all screens)
Added OptiKey's `SmoothWhenChangingGazeTarget` — a 3-sample weighted average (0.45/0.30/0.25) applied before the EMA smoother. Previously keyboard-only, now active on all screens.

#### Snap-to-Center Lock + Visual Highlight
When dwell starts, cursor jumps to the element center and a rectangular highlight border appears. Lock threshold lowered from 0.50 to 0.10 — cursor freezes within ~100ms (was ~500ms).

#### Tobii LightlyFiltered Mode
Changed from unfiltered to `GazePointDataMode.LightlyFiltered` in C# bridge for built-in Tobii noise reduction.

#### Backend Magnetism Tuning
- Keyboard magnetism reduced: radius 72px, pull 0.32 (was higher, caused rightward drift)
- Handoff bias reduced: 8px (from 14px)
- On-key detection fixed to use post-filter pixel coords (was using pre-filter Kalman coords)

#### Double-Offset Bug Fix
Manual gaze offset was applied in BOTH backend (`_screen_to_window_normalized`) AND frontend (`handleGaze`). Setting -35px offset resulted in -70px effective shift. Fixed by removing frontend application.

#### Screen-Specific Gaze Improvements
- `FeelingScreen.tsx` and `PeopleScreen.tsx`: Added `data-gaze="true"` and `data-gaze-context="phraseButton"` to custom buttons (were invisible to snap target collection).
- `GazeButton.tsx`: Mapped `dwellCategory="quickWord"` to `'quickfire'` context (was unmapped, fell through to 'navigation' timing).

### v17 Changes — Overlay Awareness + Web Browsing

#### QuickWords Overlay Gaze Fix (`GazeCursor.tsx`)
**Bug:** When the QuickWords overlay opens on the keyboard screen, overlay buttons were invisible to gaze selection. The keyboard-specific hit zone collector only queries `data-gaze-context="keyboard"`, but overlay buttons use `"quickfire"`.

**Fix:** Added overlay detection — checks if a high-z-index element (z >= 20) exists at the gaze point. When detected:
1. Skips keyboard-specific path, falls through to snap targets
2. Filters snap targets by visibility (`document.elementFromPoint` at each target center)
3. Hidden elements behind the overlay are excluded
4. Gaze toggle buttons remain accessible regardless of overlay

#### Web Browsing Gaze Improvements (`WebBrowsingScreen.tsx`)
- **Cursor update rate:** 80ms (12fps) → 33ms (30fps) for smoother BrowserView cursor tracking
- **"Click Here" button:** Added to YouTube, QuickSearch, Social, and News panels (was only in WhatsApp)
- **Edge-scroll indicators:** Added teal gradient overlays to YouTube, Social, and News panels (was only in QuickSearch)
- **BrowserView dwell:** 1000ms dwell-click inside web content (injected via Electron main process)

---

### v17.x sub-series (May 2026) — visual anchor, lock-break gating, telemetry, Bayesian browser

The v17 base above stabilized overlay and web browsing. The v17.x sub-series that followed (driven by clinical use with the patient and frame-by-frame screen-recording analysis) addressed deeper failure modes rooted in **hardware noise floor** of the Tobii ET5 and a **cursor/hit-test position mismatch** that had been latent in the codebase. For a comprehensive end-to-end pipeline reference incorporating all of these, see [`eye-tracking-pipeline-textbook.html`](./eye-tracking-pipeline-textbook.html).

#### v17.3 — R2 visual anchor (`GazeCursor.tsx`)
Decouples *perceived accuracy* from *selection accuracy*. Once dwell onset commits, the cursor (`posRef`) is forced to the dwell target's bounding-rect centre on every frame. The user sees the cursor sit at the target centre even though the underlying gaze (with 10–20 px hardware noise) wobbles around it. Selection logic still reads raw gaze for lock-break and target-change detection.

Plus a complementary **onset preview anchor**: during the 250 ms onset phase, the cursor is interpolated toward the candidate's centre with pull strength ramping 0 → 0.30 between 100 ms and 250 ms of stable gaze. The cursor visibly homes in on a key *during onset* instead of jittering on the edge.

Reference: BayesGaze (Xu et al., Graphics Interface 2021); Apple US11,789,528 (visual confirmation cue separate from raw gaze position).

#### v17.6 — Visual continuity layer (`GazeCursor.tsx`, `electron/browser/browserGazeController.ts`)
SavedDwell already preserved *logical* dwell progress when gaze briefly left a target. But the *visual* dwell ring used to reset to 0 % and start over, creating a "loop" sensation. Option A keeps the ring and highlight visible at their last value during the existing 1000 ms grace; only when grace expires (or a different button takes focus) are the visuals cleared. Browser-side equivalent uses a 600 ms grace on the `.dwelling` CSS class.

New ref: `savedDwellExpiryRef`. New script: `gcBlockDwell(durationMs)` in the BrowserView IIFE.

#### v17.7 — Anchored hit test post-onset (Option B) (`GazeCursor.tsx`)
Once a dwell target is committed, the multi-point hit test runs against `posRef` (the R2-anchored cursor position) instead of raw gaze. R2 keeps `posRef` at target centre, so the hit test always finds the target. Eliminates the "cursor visible on K but selection logic thinks gaze is off K" failure mode.

#### v17.8 — Onset-phase sticky + keyboard margin 55 (`GazeCursor.tsx`, `hitZoneExpansion.ts`)
Three related fixes shipped together:
1. `KEYBOARD_SNAP_MARGIN` raised 35 → 55 px (`hitZoneExpansion.ts`). Fixes the edge-key loop on A, Z, P, ?, where raw-gaze noise routinely exceeded 35 px outside the rect.
2. Snap-targets-nearest-center now runs as a *fallback* even on keyboard screen, so non-keyboard buttons (Word, Quick Phrases, Show Nav, prediction-strip phrases) get the same generous nearest-center treatment as keyboard keys.
3. Sticky tolerance extended to also cover the onset phase, not just post-dwell. Edge-aware: 60 px standard / 100 px for buttons within 80 px of viewport edge.

#### v17.9 — Unified hit test on `posRef` (`GazeCursor.tsx`)
Removed the v18 special case that used `lastRawPointRef` (raw gaze) for keyboard hit testing. Hit test now uses `posRef` on *all* screens. Cursor render position and selection point are literally the same. What you see is what you select.

Sticky tolerance widened slightly to absorb Tobii frame drops (110 px edge / 50 px standard during dwell; 130 px / 80 px during onset).

#### v17.10 — Lock-break gated by target rect (`GazeCursor.tsx`)
**The single most important fix in the series, isolated by Claude AI's frame-by-frame video analysis.** Pre-v17.10 lock-break used a single condition:

```ts
if (distFromLock > LOCK_BREAK_DISTANCE) { abort dwell; }   // 80 px
```

Tobii ET5 routinely produces 50–80 px raw-gaze noise during legitimate fixation (especially at screen edges where `EDGE_MODE` disables backend smoothing). A single noisy sample at 81 px from `lockPos` aborted dwells at ~90 % progress without firing the click. The patient called this "the 90 % abort."

The fix requires *both* conditions:

```ts
let shouldBreakLock = distFromLock > LOCK_BREAK_DISTANCE;
if (shouldBreakLock && dwellTargetRef.current?.isConnected) {
  const tRect = dwellTargetRef.current.getBoundingClientRect();
  const LOCK_RECT_TOLERANCE = 45;
  const insideTargetRect = (
    rawX >= tRect.left - LOCK_RECT_TOLERANCE
    && rawX <= tRect.right + LOCK_RECT_TOLERANCE
    && rawY >= tRect.top - LOCK_RECT_TOLERANCE
    && rawY <= tRect.bottom + LOCK_RECT_TOLERANCE
  );
  if (insideTargetRect) shouldBreakLock = false;
}
```

Lock only breaks when raw gaze is *both* >80 px from `lockPos` *and* outside the dwell target's rect + 45 px tolerance. Verified by post-fix recording: the L-key 90 % abort and the 15-second Chest/Nebulization loop both resolve.

#### v17 — R1 audit recommendation: Telemetry (`src/utils/gazeTelemetry.ts`)
New module. Records every dwell-click with target id, rect, raw-gaze residual (gaze − centre), and timing. 250-event ring buffer. Aggregates (median residual, MAD, drift vector, per-context breakdown) exposed via `window.__gazeTelemetry.snapshot()` in DevTools. BrowserView equivalent via `window.__gcTelemetry`.

Provides objective accuracy numbers for tuning future iterations without subjective guesswork. Audit's R1 was the highest-priority "do first before further tuning" recommendation.

#### v17 — R8 audit recommendation: Bayesian YouTube card posterior (`electron/browser/browserGazeController.ts`)
Replaces nearest-distance YouTube card resolution with a Gaussian-likelihood posterior temporally smoothed across frames:

```
L_i      = exp(-d_i² / (2σ²))         per-card likelihood
P_new_i  = α · L_i + (1-α) · P_old_i  temporal smoothing
commit when max(P) >= commitThreshold
```

Defaults: σ = 46 px, α = 0.32, commit threshold 0.45, expanded candidate zone 1.55× the regular hit radius. A single noisy frame cannot flip the winning card.

#### v17 — Asymmetric snap/unsnap on YouTube targets (Tobii US10,890,967 pattern)
Card snap-in 130 px, unsnap (hold) 230 px. Skip-ad snap-in 140 px, unsnap 250 px. Once a target is committed the dwell tolerates wider drift before reset, preventing boundary flicker.

#### v17.15 — Stable embedded-browser cursor
`electron/browser/browserGazeController.ts` now uses candidate epochs, thumbnail/title snap rects, stable-winner gating, onset movement cancellation, and BrowserView telemetry for YouTube card selection. This is the current baseline for recommendation clicks and should not be retuned without telemetry.

#### v17.16 — Embedded-browser video safety
The BrowserView cursor suppresses dwell inside the active video rect while playback is running, so looking at a YouTube video does not accidentally toggle play/pause. Playback state flows through `webview:playbackState` into `useGazeBrowser.ts`. True browser fullscreen is auto-exited; the visible side-dock **Full Screen** button only maximizes the YouTube player inside the BrowserView so app controls remain visible. Quick Search now has large paginated app-owned link targets for gaze selection.

#### v17 — Auto-enable gaze on direct-work screens
`AlertModeScreen.tsx`, `WebBrowsingScreen.tsx`, and `CompassMapScreen.tsx` force-enable gaze on mount, respecting Mouse-Only Mode. Compass Map also opens with nav hidden so room placement can begin immediately.

#### Audit recommendations: status

| ID | Recommendation | Status |
|----|----------------|--------|
| R1 | Session telemetry | **Shipped** v17 series |
| R2 | Visual anchor decoupling | **Shipped** v17.3 |
| R3 | Remove 3-tap MA | Deferred — risks reintroducing jitter |
| R4 | Full Bayesian over keyboard | Deferred — high regression risk |
| R5 | Adaptive classifier thresholds | Deferred — needs R1 data first |
| R6 | Continuous self-calibration | Roadmap (Apple US11,789,528 pattern) |
| R7 | Cascading dwell (Mott CHI'17) | Roadmap — opt-in typing mode |
| R8 | Bayesian YouTube card posterior | **Shipped** v17.4 |
| R9 | Hardware tier evaluation | Deferred — separate decision |
| R10 | Late-stage ALS preset | Roadmap |
