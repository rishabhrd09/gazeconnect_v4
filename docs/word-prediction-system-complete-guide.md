# GazeConnect Pro — Word & Sentence Prediction System
## Complete Technical Guide (v2 — March 2026)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Data Flow](#2-architecture--data-flow)
3. [Vocabulary Layer — Where Words Come From](#3-vocabulary-layer--where-words-come-from)
4. [N-Gram Language Model](#4-n-gram-language-model)
5. [Training Corpus](#5-training-corpus)
6. [Abbreviation System](#6-abbreviation-system)
7. [Word Prediction Engine — Core Algorithm](#7-word-prediction-engine--core-algorithm)
8. [Boost Factors — How Scores Are Weighted](#8-boost-factors--how-scores-are-weighted)
9. [v2 Enhancements — Recency, Bigrams, Time Boost](#9-v2-enhancements--recency-bigrams-time-boost)
10. [Sentence Prediction System](#10-sentence-prediction-system)
11. [Learning & Adaptation — How the System Gets Smarter](#11-learning--adaptation--how-the-system-gets-smarter)
12. [Persistence — What Gets Saved and Where](#12-persistence--what-gets-saved-and-where)
13. [Frontend Integration — UI Rendering](#13-frontend-integration--ui-rendering)
14. [Hindi / Devanagari Support](#14-hindi--devanagari-support)
15. [How to Manually Improve Predictions](#15-how-to-manually-improve-predictions)
16. [Performance Characteristics](#16-performance-characteristics)

---

## 1. System Overview

The prediction system helps an ALS patient communicate faster by predicting words and sentences as they type using eye-gaze. It operates across three layers:

```
Patient types via eye-gaze keyboard
         |
         v
   [Frontend: KeyboardScreen.tsx]
         | sends 'get_predictions' via WebSocket
         v
   [Backend: main.py]
         | calls predict() + sentence predict()
         v
   [Engine: word_prediction.py + sentence_prediction.py]
         | n-gram model + vocabulary boosting + recency + bigrams + time boost
         v
   Results sent back as JSON: { words: [...], sentences: [...] }
         |
         v
   [Frontend renders prediction buttons — patient dwells to select]
```

**Key design principles:**
- 100% offline — no internet required, ever
- Zero external dependencies — runs on Python stdlib only
- < 50ms for word predictions, < 100ms for sentence predictions
- Learns from every sentence the patient speaks
- Bilingual: English + Hindi (Devanagari) + Hinglish (transliterated)

---

## 2. Architecture & Data Flow

### Files Involved

| File | Role |
|---|---|
| `python/services/word_prediction.py` | Core engine — vocabulary, n-gram model, scoring, learning |
| `python/services/sentence_prediction.py` | Sentence completion — templates, history, fuzzy matching |
| `python/main.py` | WebSocket handler — orchestrates predictions, feeds learners |
| `src/hooks/useWebSocket.tsx` | Frontend WebSocket — sends requests, receives predictions |
| `src/screens/KeyboardScreen.tsx` | UI — renders prediction buttons, handles selection |
| `src/App.tsx` | Wires prediction state from WebSocket to KeyboardScreen |

### Request/Response Flow

**1. User types a character:**
```
KeyboardScreen.tsx (line ~614):
  useEffect(() => {
    if (getPredictions && text) getPredictions(text, undefined, keyboardMode);
  }, [text]);
```

**2. Frontend sends WebSocket message:**
```typescript
// useWebSocket.tsx
getPredictions: (text, length_hint, lang) =>
  send('get_predictions', { text, length_hint, lang, top_k: 12 })
```

**3. Backend receives and processes:**
```python
# main.py → _get_predictions()
predictions = self.prediction.predict(text, top_k=12)   # word predictions
spreds = self.sentence_predictor.predict(text, top_k=3)  # sentence predictions
self._send(websocket, 'predictions', {
    'words': results,
    'sentences': sentence_results,
})
```

**4. Frontend receives and renders:**
```typescript
// useWebSocket.tsx message handler
case 'predictions':
  setPredictions(data.words || []);
  setSentencePredictions(data.sentences || []);
```

**5. Patient selects a prediction (dwell or click):**
```typescript
// KeyboardScreen.tsx
handlePrediction(word)      → replaces current word prefix, calls learnWord()
handleSentenceSelect(text)  → fills entire text area, calls learnSentence()
```

**6. Learning feedback loop:**
```
handleKey('speak') → learnSentence(text) → backend
  → prediction.learn_sentence(sentence)   // updates n-grams, frequencies, recency, bigrams
  → sentence_predictor.learn(sentence)     // adds to sentence history
```

---

## 3. Vocabulary Layer — Where Words Come From

The engine uses multiple vocabulary sets, each representing a different source of words. A word can belong to multiple sets. Each set has a different boost factor.

### 3.1 CORE_VOCABULARY (~500 words)

**What:** The top 500 most-used English words (3+ letters only). Research shows 250 core words cover 78-85% of all speech.

**Categories within:**
- Pronouns & determiners: you, she, him, this, that, who, what
- Common verbs: want, need, help, feel, think, tell, give, take, call, turn, sleep, eat, drink
- Adjectives: good, bad, comfortable, uncomfortable, tired, hungry, thirsty
- Adverbs: very, really, always, never, just, also, still, already
- Prepositions: with, from, into, about, after, before, between
- Time words: today, tomorrow, yesterday, morning, evening, night, week
- People: family, mother, father, brother, sister, friend, doctor, nurse
- Body: head, back, neck, hand, leg, eye, mouth, stomach
- Health: pain, medicine, hospital, temperature, pressure, oxygen
- Food/drink: water, tea, milk, food, breakfast, lunch, dinner

**Boost factor:** `CORE_BOOST = 1.5`

### 3.2 MEDICAL_VOCABULARY (~100+ words)

**What:** ALS/MND-specific medical terminology that a patient frequently needs.

**Content:**
- ALS-specific: als, mnd, motor, neuron, paralysis, ventilator, bipap, tracheostomy
- Care terms: suction, suctioning, ambu, catheter, physiotherapy, nebulizer, feeding tube
- Symptoms: pain, numbness, tingling, cramp, spasticity, fatigue, dysphagia, drooling
- Body positions: supine, prone, lateral, upright, reclined
- Equipment: wheelchair, walker, stander, splint, brace, pulse oximeter
- Vitals: blood pressure, oxygen, saturation, heart rate, temperature

**Boost factor:** `MEDICAL_BOOST = 1.3`

### 3.3 PATIENT_VOCABULARY (~150+ words)

**What:** Words extracted from Papa's actual Tobii chat history. These are the words the patient actually uses — highest priority after abbreviations.

**Content:**
- Family names: mummy, papa, rishabh, parakh, bhawana, nilesh, akhil, anand, rahul
- Caregivers: durgesh, rajesh, sharwan, mamaji, vishnuji
- Locations: delhi, gurgaon, lucknow, kanpur, temple
- Daily items: pillow, blanket, lotion, towel, bedsheet, diaper, cream
- Patient-specific verbs: delegate, supervise, monitor, evaluate
- Emotional: worried, grateful, proud, hopeful, comfortable, uncomfortable
- Food: dalia, chai, roti, doodh, khichdi, curd, ghee, halwa

**Boost factor:** `PATIENT_BOOST = 2.0` (highest non-abbreviation boost)

### 3.4 HINDI_VOCABULARY (~50 Devanagari words)

**What:** Native Hindi words in Devanagari script. Used only when `keyboardMode === 'hindi'`.

**Examples:** पानी (water), दवाई (medicine), दर्द (pain), मदद (help), खाना (food), नींद (sleep)

**Boost factor:** `PATIENT_BOOST = 2.0` (same as patient vocab when in Hindi mode)

### 3.5 HINGLISH_VOCABULARY (~30 words)

**What:** Transliterated Hindi written in Roman script. Very common in Indian bilingual speech.

**Examples:** mummy, papa, chai, doodh, dawa, pani, roti, dal, aram, bhaiya, didi, namaste

**Boost factor:** `HINGLISH_BOOST = 1.6`

### 3.6 CULTURAL_VOCABULARY (~20 words)

**What:** Regional, religious, and cultural terms specific to the patient's context.

**Examples:** temple, mandir, pooja, aarti, prasad, diwali, holi, rakhi, bhai, bhabhi

**Boost factor:** `CULTURAL_BOOST = 1.7`

### 3.7 APP_SCREEN_VOCABULARY

**What:** Words tied to app screens — activities, people, medical, feelings screens.

**Content:** Activities (reading, walking, yoga, television), People (doctor, nurse, therapist), Feelings (happy, sad, anxious, frustrated)

### 3.8 EXPANDED_VOCABULARY

**What:** Additional commonly-used words not covered by the above categories. General English vocabulary supplement.

### 3.9 ALS_COMMUNICATION_VOCABULARY

**What:** AAC-specific communication words — yes, no, maybe, please, thank you, sorry, help, emergency, stop, wait, more, less, again, done, finished.

### 3.10 ALL_VOCABULARY (Union Set)

All vocabulary sets are merged into `ALL_VOCABULARY`:
```python
ALL_VOCABULARY = (CORE_VOCABULARY | MEDICAL_VOCABULARY | PATIENT_VOCABULARY |
                  APP_SCREEN_VOCABULARY | EXPANDED_VOCABULARY | set(ABBREVIATIONS.keys()) |
                  ALS_COMMUNICATION_VOCABULARY | HINDI_VOCABULARY)
```
Filtered to words >= 3 characters OR containing Devanagari characters (\u0900-\u097F).

This union set is seeded into the n-gram model's unigrams at startup, ensuring every known word is findable even if it hasn't appeared in the training corpus.

---

## 4. N-Gram Language Model

### What It Is

An n-gram model predicts the next word based on the previous 1-2 words. It's the statistical backbone of the prediction engine.

**File:** `word_prediction.py`, class `NGramModel` (n=3 → trigram model)

### Data Structures

```
unigrams:  Dict[str, int]              — word → count
bigrams:   Dict[(str, str), int]       — (word1, word2) → count
trigrams:  Dict[(str, str, str), int]  — (word1, word2, word3) → count

bigram_contexts:  Dict[str, Set[str]]          — word → {possible next words}
trigram_contexts: Dict[(str, str), Set[str]]   — (w1, w2) → {possible next words}
```

### Training

When a sentence is trained (e.g., "I want warm water"):
```
Unigrams: i +1, want +1, warm +1, water +1
Bigrams:  (i, want) +1, (want, warm) +1, (warm, water) +1
Trigrams: (i, want, warm) +1, (want, warm, water) +1

bigram_contexts: {i: {want}, want: {warm}, warm: {water}}
trigram_contexts: {(i, want): {warm}, (want, warm): {water}}
```

### Probability Calculation (Interpolation Smoothing)

When predicting the next word after context, the model combines trigram, bigram, and unigram probabilities with weights:

```python
# Weights: trigram=0.6, bigram=0.3, unigram=0.1
P(word | context) = 0.6 * P_trigram + 0.3 * P_bigram + 0.1 * P_unigram
```

This ensures:
- **Trigram** (2 words of context) gets the most weight — best accuracy
- **Bigram** (1 word of context) provides fallback
- **Unigram** (no context) prevents zero probabilities for new words

### Prediction

```python
predict(context, prefix, top_k=50) → List[(word, probability)]
```

1. Searches ALL words in vocabulary that start with `prefix`
2. For each candidate, computes interpolated probability given `context`
3. Returns top 50 by probability (more than needed — later stages filter and boost)

---

## 5. Training Corpus

### What It Is

A list of ~400+ carefully curated sentences that the n-gram model is trained on at startup. These sentences establish the statistical patterns the model uses for prediction.

**Location:** `word_prediction.py`, `TRAINING_CORPUS` list

### Training Weight

The corpus is trained 3 times (3x weight) to give it strong influence:
```python
for _ in range(3):
    self.ngram.train_sentences(TRAINING_CORPUS)
```

### Sections (with examples)

| Section | Count | Examples |
|---|---|---|
| Common sentence patterns | ~40 | "I want to", "Can you please", "Please help me" |
| Patient's actual chat history | ~50 | "Tell mummy to take sufficient rest", "Saliva is thick", "Ambu is needed every time" |
| Medical/care contexts | ~30 | "TT suction needed", "Nebulization twice a day", "Check oxygen level" |
| Daily life | ~30 | "Start black masala tea in morning", "Give me egg at ten morning" |
| Property/planning | ~15 | "Check exact location of sky park plot" |
| Emotional | ~20 | "I am grateful for your support", "Don't worry about me" |
| "I want to..." patterns | ~27 | "I want to sleep", "I want to eat", "I want to rest" |
| "I need to..." patterns | ~16 | "I need to rest", "I need to call" |
| "Can you..." patterns | ~15 | "Can you help me", "Can you bring me" |
| "Please..." patterns | ~18 | "Please bring me some", "Please check my" |
| "I am..." / "I feel..." | ~18 | "I am feeling better", "I feel a little pain" |
| Question patterns | ~20 | "What time is it", "Where is my phone", "When will they come" |
| Time-related | ~12 | "In the morning I want", "Last night I could not sleep" |
| Conversational | ~12 | "Tell me about your day", "We should talk about" |
| Emotional/social extended | ~20 | "Thank you for everything", "Take care of yourself" |
| **Hinglish patterns** (v2) | ~34 | "Mummy ko bulao", "Pani de do", "AC chalu karo", "Position change karo" |
| **Question completions** (v2) | ~30 | "What is for dinner today", "Where is the remote", "Who is on duty today" |
| **Emotional patterns** (v2) | ~20 | "I am feeling much better today", "You make me happy", "God bless you all" |
| **Staff/care instructions** (v2) | ~20 | "Give medicine on time", "Check oxygen level", "Turn me every two hours" |
| **Daily routines** (v2) | ~18 | "Start with tea and medicine", "Morning prayer time", "Family video call after dinner" |
| **Social & family** (v2) | ~16 | "How is everyone at home", "Tell the children I said hello" |
| **Comfort & environment** (v2) | ~16 | "Room is too cold please warm it", "Keep water bottle within reach" |
| **Food & nutrition** (v2) | ~16 | "I want something sweet", "No spicy food today", "Warm milk before sleep" |

### How the Corpus Affects Predictions

When a user types "I want", the n-gram model has seen this bigram hundreds of times in the corpus. The trigram model knows that after "I want", common next words are: "to", "warm", "cold", "medicine", "my", "black" — each with a probability proportional to how often it appeared in training.

---

## 6. Abbreviation System (Expanded in v2)

### What It Is

Instant sentence expansion from short codes. If the user types an abbreviation and it matches, the entire expansion is returned immediately with score 10.0 (highest possible priority — no other prediction can outrank it). Inspired by Google Research's SpeakFaster (Nature Communications) which proved abbreviation expansion dramatically accelerates ALS eye-gaze communication — 70-85% reduction in keystrokes.

**Location:** `word_prediction.py`, `ABBREVIATIONS` dict (built-in, ~170 entries) + `_CUSTOM_ABBREVIATIONS` dict (user-created, persisted to `patient_data/custom_abbreviations.json`)

### Categories (v2 — 170+ built-in entries)

| Category | Count | Examples |
|---|---|---|
| Greetings & Social | 18 | `gm`=Good morning, `ty`=Thank you, `gnsd`=Good night sweet dreams, `tcy`=Take care of yourself |
| Quick Responses | 8 | `idk`=I don't know, `wbf`=Everything will be fine, `iaf`=I am fine |
| Basic Needs | 16 | `iww`=I want warm water, `ins`=I need suction, `iwt`=I want black tea, `iws`=I want to sleep |
| Position & Comfort | 12 | `cpl`=Change my position to left, `pil`=Adjust my pillow, `tml`=Turn me to left side |
| Medical | 16 | `suc`=Please do suction, `bpr`=Please check my BP, `oxy`=Check oxygen level, `brp`=Breathing problem |
| Device Commands | 10 | `tvon`=Turn on the TV, `acon`=Turn on the AC, `foff`=Turn off the fan |
| Feelings & Emotions | 15 | `ilu`=I love you, `iip`=I am in pain, `imb2`=I am feeling better today |
| Family & People | 14 | `clm`=Call mummy, `tmtk`=Tell mummy to take rest, `wim`=Where is mummy |
| Staff Instructions | 6 | `gmot`=Give medicine on time, `teth`=Turn me every two hours |
| Daily Routines | 4 | `swt`=Start with tea and medicine, `tfp`=Time for physiotherapy |
| Hinglish Shortcuts | 16 | `mkb`=Mummy ko bulao, `dkt`=Dawa ka time ho gaya, `cdd`=Chai de do please |
| Hindi (Devanagari) | 4 | `nmst`=नमस्ते, `pnic`=पानी चाहिए |

### Custom Abbreviations

Users can add their own abbreviations via the Settings > Dictionary > Shortcuts tab. Custom abbreviations:
- Are persisted to `data/patient_data/custom_abbreviations.json`
- Override built-in abbreviations if the same key is used
- Can be removed individually (built-in ones cannot)
- Are checked first during prediction (priority over built-in)

### Auto-Suggest (Backend Support)

The `suggest_abbreviation()` method can generate abbreviation suggestions for frequently-spoken sentences:
- Takes first letter of each word (e.g., "Tell mummy to take rest" → "tmttr" → shortened to "tmt")
- Checks for conflicts with existing abbreviations
- Returns `{sentence, suggested_abbrev}` or `None`

### Flow

```python
# In _predict_logic(), FIRST check (before n-grams):
if prefix and prefix in ABBREVIATIONS:
    return [PredictionResult(word=ABBREVIATIONS[prefix], score=10.0, source='abbreviation')]
```

The abbreviation system can be extended at runtime:
```python
def add_custom_abbreviation(self, abbrev: str, expansion: str):
    ABBREVIATIONS[abbrev.lower()] = expansion
```

---

## 7. Word Prediction Engine — Core Algorithm

### Class: `WordPredictionEngine`

### Constants
```python
CORE_BOOST = 1.5       # General English vocabulary
PATIENT_BOOST = 2.0    # Patient's own words (highest)
RECENT_BOOST = 2.5     # Recently used words
FREQUENCY_BOOST = 1.4  # User frequency multiplier cap
MEDICAL_BOOST = 1.3    # ALS/medical terms
HINGLISH_BOOST = 1.6   # Transliterated Hindi
CULTURAL_BOOST = 1.7   # Regional/religious terms
MAX_PREDICTIONS = 12   # Maximum predictions returned
MIN_WORD_LENGTH = 3    # Only predict words >= 3 characters
```

### Initialization Flow (`__init__`)

```
1. Create NGramModel(n=3) — empty trigram model
2. Create empty user_frequencies, recent_words, custom_words
3. Create data directory and set dictionary_file path
4. Create patient_data directory
5. Initialize RecencyTracker (loads from disk)
6. Initialize PatientBigramTracker (loads from disk)
7. _initialize():
   a. Train n-gram on AAC_PHRASES (all categories)
   b. Train n-gram on TRAINING_CORPUS (3x for high weight)
   c. Seed ALL_VOCABULARY into unigrams (so every word is findable)
8. load() — restore saved user frequencies, recent words, custom words
```

### `_predict_logic()` — Step-by-Step Algorithm

This is the core scoring function. Here's every step in order:

```
Input: text="I want wa", top_k=12, lang='english'
Derived: context=('i', 'want'), prefix='wa'
```

#### Step 1: Abbreviation Check
```
If prefix matches ABBREVIATIONS dict → return immediately with score 10.0
Example: prefix='gm' → returns "Good morning" (score 10.0)
```

#### Step 2: N-Gram Predictions (Context-Aware)
```
Fetch 50 candidates from n-gram model using context + prefix
For each candidate word:
  - Skip if len(word) < 3
  - Skip if strict_length mode and len(word) != length_hint
```

#### Step 3: Language Filtering
```
If lang='hindi':
  - Skip non-Hindi words
  - Boost Hindi words × PATIENT_BOOST
If lang='english':
  - Skip Hindi words
  - Continue to vocabulary boosting
```

#### Step 4: Vocabulary Boosting (English Mode)
```
Score multipliers applied in priority order (first match wins):
  PATIENT_VOCABULARY  → score × 2.0  (source: 'patient')
  CORE_VOCABULARY     → score × 1.5  (source: 'core')
  MEDICAL_VOCABULARY  → score × 1.3  (source: 'medical')
  HINGLISH_VOCABULARY → score × 1.6  (source: 'hinglish')
  CULTURAL_VOCABULARY → score × 1.7  (source: 'cultural')
```

#### Step 5: User Frequency Boost
```
If word has been used before (user_frequencies dict):
  freq_boost = min(1.4, 1 + frequency/50)
  score × freq_boost

Example: word used 25 times → boost = 1 + 25/50 = 1.4 (capped)
Example: word used 5 times  → boost = 1 + 5/50  = 1.1
```

#### Step 6: Recent Word Boost
```
If word is in recent_words list (last 100 words used):
  recency_idx = position from end (most recent = highest)
  recency_factor = recency_idx / total_recent_words  (0.0 to 1.0)
  score × (1 + (2.5 - 1) × recency_factor)

Example: most recently used word → factor=1.0 → score × 2.5
Example: word used 50 words ago  → factor=0.5 → score × 1.75
```

#### Step 7: Recency Decay Boost (v2 — NEW)
```
Score from RecencyTracker (exponential decay, 72h half-life):
  rec = sum of exp(-0.693 × (now - timestamp) / half_life) for all usage timestamps
  If rec > 0: score × (1 + rec × 0.5)

Example: word used 1 hour ago  → rec ≈ 1.0 → score × 1.5
Example: word used 48 hours ago → rec ≈ 0.5 → score × 1.25
Example: word used 7 days ago  → rec ≈ 0.12 → score × 1.06
```

#### Step 8: Patient Bigram Boost (v2 — NEW, Highest Impact)
```
If there's context (previous word typed):
  Look up patient's own word-pair patterns:
    bg = bigrams.next_word_scores(context[-1], prefix)
    If word found in bigram data:
      score × (1 + bg[word] × 3.0)

Example: Patient has typed "warm water" 10 times and "warm milk" 2 times
  After typing "warm", prefix "wa":
    bg['water'] = 10/12 = 0.83 → score × (1 + 0.83 × 3.0) = score × 3.5
    bg['milk'] would need prefix 'm', not 'wa' — not boosted here

This is the HIGHEST IMPACT enhancement — it learns the patient's personal patterns.
```

#### Step 9: Time-of-Day Boost (v2 — NEW)
```
Based on current hour, boost contextually relevant words:

Morning (5am-11am):  ×1.8 for: breakfast, tea, chai, medicine, tablet, morning, egg,
                              milk, bath, sponging, exercise, physiotherapy, nebulizer, bp
Afternoon (11am-4pm): ×1.5 for: lunch, khana, rest, aram, sleep, nap, water, pani,
                               position, dal, rice, soup, juice
Evening (4pm-9pm):    ×1.5 for: dinner, evening, shaam, news, tv, family, call,
                               phone, visitor, snack
Night (9pm-5am):      ×1.8 for: sleep, neend, blanket, kambal, position, comfortable,
                               pillow, takiya, dark, quiet, night, pain, dard, toilet

All other words: ×1.0 (no boost)
```

#### Step 10: Prefix Matching Fallback
```
If we have fewer than top_k candidates and there's a prefix:
  Search ALL_VOCABULARY for words starting with prefix
  Score them at base level (0.05-0.15 depending on vocabulary set)
  This ensures the user always sees relevant completions
```

#### Step 11: Smart No-Prefix Suggestions
```
When the user finishes a word (types space — no prefix):
  1. Try trigram context: what words follow (context[-2], context[-1])?
  2. Try bigram context: what words follow context[-1]?
  3. Final fallback: common next words like 'please', 'want', 'need', 'the'
```

#### Step 12: Sort and Return
```
Sort all candidates by score (descending)
Return top_k results as List[PredictionResult]
Each result: { word: str, score: float, source: str }
```

### `predict_spatial()` — Spatial Keyboard Mode

Returns two rows for the spatial keyboard layout:
- **Top row:** Exact length matches only (if `length_hint` provided)
- **Bottom row:** General smart predictions (no length constraint)

```python
def predict_spatial(text, length_hint, top_k=5):
    top_row = _predict_logic(text, top_k=10, length_hint=length_hint, strict_length=True)[:5]
    bottom_row = _predict_logic(text, top_k=5, length_hint=None)
    return {"top_row": [p.word for p in top_row], "bottom_row": [p.word for p in bottom_row]}
```

---

## 8. Boost Factors — How Scores Are Weighted

### Priority Order (Cumulative Multipliers)

A single word can receive MULTIPLE boosts simultaneously. Here's how they stack:

```
Base probability from n-gram model: 0.05
  × PATIENT_BOOST (if in patient vocab): 0.05 × 2.0 = 0.10
  × freq_boost (used 20 times): 0.10 × 1.4 = 0.14
  × RECENT_BOOST (used recently): 0.14 × 2.0 = 0.28
  × recency_decay (used 2h ago): 0.28 × 1.4 = 0.39
  × bigram_boost (follows prev word): 0.39 × 3.0 = 1.17
  × time_boost (morning word at 8am): 1.17 × 1.8 = 2.11

Final score: 2.11 (vs base 0.05 → 42x boost!)
```

This ensures that a word the patient uses frequently, in a common context, at the right time of day, rises to the very top of predictions.

### Why This Design?

- **Patient vocab boost (2.0):** Papa's words matter more than generic English
- **Bigram boost (3.0 multiplier):** "What word does THIS patient type after THAT word?" is the strongest signal
- **Recent boost (2.5):** Words used in the current session are likely to be used again
- **Time boost (1.8):** Medicine at 8am, sleep at 10pm — context matters
- **Cultural boost (1.7):** Religious and cultural terms are frequently used
- **Hinglish boost (1.6):** Natural bilingual speech patterns

---

## 9. v2 Enhancements — Recency, Bigrams, Time Boost

### 9.1 RecencyTracker

**File:** `word_prediction.py`, class `RecencyTracker`

**Purpose:** Tracks WHEN each word was used, not just how many times. Words used recently get higher scores that fade over time (exponential decay).

**How it works:**
```
Storage: { word: [timestamp1, timestamp2, ...] }
Half-life: 72 hours (score halves every 3 days)
Pruning: Timestamps older than 30 days are removed

Score formula:
  score(word) = sum( e^(-0.693 × (now - t) / half_life) ) for each timestamp t

Example timeline for "water":
  Used 1h ago:   e^(-0.693 × 3600/259200) ≈ 0.998
  Used 24h ago:  e^(-0.693 × 86400/259200) ≈ 0.794
  Used 3 days ago: e^(-0.693 × 259200/259200) ≈ 0.500
  Total score: ~2.29
```

**Persistence:** `data/patient_data/recency_scores.json`

### 9.2 PatientBigramTracker

**File:** `word_prediction.py`, class `PatientBigramTracker`

**Purpose:** Learns word PAIRS from the patient's actual typing. This is the single most impactful enhancement — it learns "after word X, this patient usually types word Y."

**How it works:**
```
Storage: { prev_word: { next_word: count, ... }, ... }

Learning from "I want warm water":
  pairs['i']['want'] += 1
  pairs['want']['warm'] += 1
  pairs['warm']['water'] += 1

Scoring — next_word_scores('warm', prefix='wa'):
  candidates = { 'water': 10, 'wali': 1 }  (filtered by prefix)
  total = 11
  returns { 'water': 0.91, 'wali': 0.09 }

Applied in _predict_logic:
  score × (1 + 0.91 × 3.0) = score × 3.73
```

**Pruning:** When total pairs exceed 5000, entries with count < 2 are pruned.

**Persistence:** `data/patient_data/patient_bigrams.json`

### 9.3 Time-of-Day Boost

**File:** `word_prediction.py`, function `_time_boost()`

**Purpose:** Contextually relevant words score higher at appropriate times. Medicine-related words boost in the morning, comfort words boost at night.

**No persistence needed** — purely based on current clock time.

**Word sets:**
```
Morning (5am-11am) ×1.8:
  breakfast, tea, chai, medicine, dawa, tablet, morning, egg, milk, doodh,
  bath, sponging, exercise, physiotherapy, nebulizer, bp, sugar, dalia, roti, toast

Afternoon (11am-4pm) ×1.5:
  lunch, khana, rest, aram, sleep, nap, water, pani, position, dal, rice, soup, juice

Evening (4pm-9pm) ×1.5:
  dinner, evening, shaam, news, tv, family, call, phone, visitor, snack

Night (9pm-5am) ×1.8:
  sleep, neend, blanket, kambal, position, comfortable, pillow, takiya, dark, quiet,
  night, raat, pain, dard, toilet, goodnight, turn, cover, cold, warm, garam
```

---

## 10. Sentence Prediction System

### File: `python/services/sentence_prediction.py`

### Class: `SentencePredictor`

**Purpose:** Predicts COMPLETE SENTENCES from partial input. Shown in the bottom row of the keyboard when available.

### Three Prediction Sources (Priority Order)

#### Source 1: Patient History (score × 3.0 boost)
```
If patient has spoken "I want warm water" before:
  When they type "I wa" → matches "I want warm water" from history
  Score = (count × 0.5 + recency × 2.0) × 3.0

Higher count + more recent = higher score
```

#### Source 2: Template Bank (~180 templates)
```
20 template categories with pre-built common sentences:
  "I want"  → 12 completions (warm water, cold water, medicine, rest, ...)
  "I need"  → 8 completions (water, suction, help, medicine, ...)
  "I am"    → 13 completions (in pain, feeling better, uncomfortable, ...)
  "please"  → 13 completions (do suction, change position, call doctor, ...)
  "can you" → 6 completions
  "help"    → 5 completions (emergency)
  "tell"    → 6 completions (family)
  "call"    → 5 completions (family)
  "where"   → 6 completions (question)
  "pain"    → 5 completions (medical)
  "medicine"→ 4 completions (medical)
  "turn"    → 5 completions (comfort)
  "too"     → 5 completions (comfort)
  "good"    → 4 completions (greetings)
  "thank"   → 4 completions (greetings)
  "mummy"   → 4 completions (Hinglish family)
  "pani"    → 4 completions (Hinglish basic)
  "dawa"    → 4 completions (Hinglish medical)
  "chai"    → 4 completions (Hinglish basic)
  "mujhe"   → 4 completions (Hinglish basic)
```

Templates also get a time-of-day category boost:
- Morning: medical ×1.5, basic ×1.3, greet ×1.5
- Afternoon: basic ×1.2, comfort ×1.3
- Evening: family ×1.3, greet ×1.2
- Night: comfort ×1.5, greet ×1.3, emergency ×1.3

#### Source 3: Fuzzy Matching (score = 0.3)
```
If the last word typed matches any word INSIDE a previously spoken sentence:
  Type "pillow" → matches "Please adjust my pillow" from history
  Low score (0.3) — only used when sources 1 and 2 don't have enough matches
```

### Deduplication and Return
```
All scored results are sorted by score (descending)
Deduplicated by lowercase text
Returns top 3 results as List[SentencePrediction]
Each: { text: str, score: float, source: str }  where source = 'history'|'template'|'fuzzy'
```

### History Learning
```python
def learn(sentence):
    # If sentence already in history → increment count, update timestamp
    # Otherwise → add new entry with count=1
    # History capped at 500 entries (pruned by count + recency)
```

**Persistence:** `data/patient_data/patient_sentences.json`

---

## 11. Learning & Adaptation — How the System Gets Smarter

### What Triggers Learning

| Trigger | What's Learned | Systems Updated |
|---|---|---|
| Patient selects a word prediction | `learnWord(word)` | user_frequencies, recent_words, custom_words |
| Patient speaks a sentence (presses SPEAK) | `learnSentence(sentence)` | n-gram model, user_frequencies, recent_words, RecencyTracker, PatientBigramTracker, SentencePredictor history |
| Patient selects a sentence prediction | `learnSentence(sentence)` | Same as above |
| App starts up | `learn_from_chat_history()` | n-gram model, user_frequencies (from saved chat logs) |

### `learn_word(word)`
```
1. Increment user_frequencies[word]
2. Move word to end of recent_words list (most recent)
3. Add to custom_words set
4. Cap recent_words at 100 entries
```

### `learn_sentence(sentence)`
```
1. Extract all words from sentence
2. Call learn_word() for each word
3. Train n-gram model on the full sentence (learns word sequences)
4. RecencyTracker: record timestamp for each word
5. PatientBigramTracker: learn all word pairs in the sentence
```

### `learn_from_chat_history(chat_dir)`
```
On startup, reads chat_YYYY-MM-DD.txt files from data/chat_history/
Each file: [HH:MM:SS] message text
Newer files get higher training weight (more repetitions)
Limited to latest 5 chat files to keep training bounded
```

### Compound Effect Over Time

```
Day 1: Patient types "I want warm water" — system notes it
Day 2: Types it again — bigram scores increase, recency boosts apply
Day 7: Types "I want" — "warm" and "water" now rank much higher
Day 30: Rarely-used words fade (recency decay), frequent words dominate
```

---

## 12. Persistence — What Gets Saved and Where

### Saved Files

| File | Content | Updated When |
|---|---|---|
| `data/custom_dictionary.json` | user_frequencies, recent_words, custom_words | On save() call |
| `data/patient_data/recency_scores.json` | Word usage timestamps (last 30 days) | On save() call |
| `data/patient_data/patient_bigrams.json` | Word pair frequencies | On save() call |
| `data/patient_data/patient_sentences.json` | Spoken sentence history (max 500) | On save() call |
| `data/patient_data/custom_abbreviations.json` | User-created abbreviation shortcuts | On add/remove |

### When Saves Happen

1. **Every 60 seconds** — periodic task in `main.py` (`_periodic_tasks`)
2. **On app shutdown** — `stop()` method in `main.py`
3. **On manual word add** — `add_custom_word()` calls `save()` immediately

### File Size Estimates

- `custom_dictionary.json`: ~5-50KB (grows with usage)
- `recency_scores.json`: ~10-100KB (auto-pruned at 30 days)
- `patient_bigrams.json`: ~5-200KB (auto-pruned at 5000 pairs)
- `patient_sentences.json`: ~10-100KB (capped at 500 entries)

**Total: < 500KB** — negligible storage impact.

---

## 13. Frontend Integration — UI Rendering

### Prediction Row (Top — 5 Slots)

**Location:** `KeyboardScreen.tsx`, `Predictions` component (line ~418-556)

- Shows up to **5 word predictions** in a horizontal grid
- Each is a `GazeButton` with dwell-based selection
- Font size: `clamp(26px, 3vw, 32px)` — responsive
- Height: `82px` (nav visible) or `125px` (nav hidden)
- On selection: `handlePrediction(word)` → replaces current word prefix + adds space

### Bottom Row (Sentence Predictions or Extra Words)

**Location:** `KeyboardScreen.tsx` (line ~1188-1278)

**Condition:** Visible when sentence predictions exist (any time) OR when nav is hidden. Hidden in Hindi mode.

**When sentence predictions are available (sentencePredictions.length > 0):**
- Shows up to **2-3 sentence predictions** (+ SHOW NAV button if nav is hidden)
- Orange text color (`rgba(255, 210, 140, 0.95)`) to distinguish from word predictions
- Orange border (`rgba(255, 180, 80, 0.50)`)
- Prefix icon: history sentences get "return" symbol, templates get speech bubble
- On selection: `handleSentenceSelect(sentence)` → fills entire text area + learns

**When no sentence predictions (fallback):**
- Shows **4 extra word predictions** (predictions 6-9 from the backend) + SHOW NAV button
- Same styling as top row (white text, teal border)
- On selection: `handlePrediction(word)` → same as top row

### Hindi Mode

When `keyboardMode === 'hindi'`:
- Bottom row is hidden entirely (saves vertical space for 5-row Devanagari layout)
- Top predictions switch to `hindiPredictions` — frontend-only prefix matching against `HINDI_AAC_VOCABULARY` (68 Devanagari words)
- Backend predictions are filtered to Hindi-only vocabulary

### Prediction Row Height

```typescript
const PREDICTION_ROW_HEIGHT = navHidden ? '125px' : '82px';
```

---

## 14. Hindi / Devanagari Support

### Two Modes of Hindi

1. **`showHindi` prop:** Bilingual labels on non-keyboard screens (BasicNeeds, QuickWords, etc.)
2. **`keyboardMode === 'hindi'`:** Full Devanagari 5-row keyboard with Hindi-only predictions

### Hindi Word Prediction

- **Frontend:** `hindiPredictions` useMemo — prefix matches against `HINDI_AAC_VOCABULARY` (68 words)
- **Backend:** When `lang='hindi'` is passed, `_predict_logic()` filters to `HINDI_VOCABULARY` only
- **Regex:** All word extraction uses `[a-zA-Z\u0900-\u097F]+` to support Devanagari characters

### Smart Matra Insertion

In Hindi keyboard mode, vowels auto-convert to matra forms when typed after consonants (handled in keyboard layout logic, not prediction).

---

## 15. How to Manually Improve Predictions

### Option 1: Settings UI — Dictionary Panel (Caregiver-Friendly)

The Settings > Dictionary panel has 3 tabs that let caregivers manage predictions without touching code:

**Words Tab:**
- Add custom words via text input → instantly available in predictions
- View all learned custom words as badges
- Words get high starting weight (frequency=10, unigram=10)

**Shortcuts Tab (Abbreviations):**
- Add new abbreviation shortcuts: type shortcut code + expansion sentence
- Browse ALL shortcuts (170+ built-in + custom) with search filter
- Custom shortcuts show "custom" badge and can be removed individually
- Built-in shortcuts show "built-in" badge (cannot be removed)
- Example: add `tmr` → "Tell mummy to take rest" — patient types 3 keys instead of 30+

**Sentences Tab:**
- Add sentences manually → immediately available as sentence predictions
- View all learned sentences sorted by frequency (most-used first)
- Shows usage count for each sentence
- Added sentences start with count=5 (high priority)

### Option 2: Expand TRAINING_CORPUS (Developer)

Edit `word_prediction.py`, add sentences to the `TRAINING_CORPUS` list. The n-gram model learns word sequences from these sentences at startup.

**Best practices:**
- Add complete sentences, not just words
- Repeat important patterns (they get trained 3x already)
- Include the full context: "Give me warm water" not just "warm water"
- Add Hinglish sentences for bilingual patterns

### Option 3: Add Vocabulary Words (Developer)

Add words to the appropriate vocabulary set in `word_prediction.py`:
- `PATIENT_VOCABULARY` for patient-specific words (2.0 boost)
- `MEDICAL_VOCABULARY` for medical terms (1.3 boost)
- `HINGLISH_VOCABULARY` for transliterated Hindi (1.6 boost)
- `CULTURAL_VOCABULARY` for cultural terms (1.7 boost)

### Option 4: Add Built-in Abbreviations (Developer)

```python
# In ABBREVIATIONS dict in word_prediction.py:
'iww': 'I want warm water',
'cmp': 'Change my position',
```

These get score 10.0 — instant, highest priority. Currently 170+ built-in entries across 12 categories.

### Option 5: Add Sentence Templates (Developer)

Edit `sentence_prediction.py`, add entries to `_build_templates()`:
```python
{'p': 'your prefix', 'c': 'category', 's': [
    'Your sentence completion 1',
    'Your sentence completion 2',
]},
```

Categories: `'basic'`, `'medical'`, `'comfort'`, `'family'`, `'greet'`, `'question'`, `'emotion'`, `'emergency'`

### Option 6: Natural Usage (Automatic)

Simply using the app improves predictions. Every spoken sentence trains the n-gram model, updates bigram patterns, and adds to sentence history. The more the patient uses the app, the better it predicts.

---

## 16. Performance Characteristics

| Metric | Value | How |
|---|---|---|
| Word prediction latency | < 50ms | N-gram lookup + vocabulary boosting (all in-memory) |
| Sentence prediction latency | < 100ms | Template matching + history prefix search |
| Startup time (prediction init) | ~200ms | Train corpus (3x), seed vocabulary, load saved data |
| Memory usage | ~5-10MB | Vocabulary sets + n-gram counts in memory |
| Disk usage (patient data) | < 500KB | 4 JSON files, auto-pruned |
| Max predictions returned | 12 words + 3 sentences | Configurable via `top_k` parameter |
| Minimum word length | 3 characters | Prevents noise from 1-2 letter predictions |
| Chat history training | Latest 5 files | Bounded to prevent startup slowdown |

---

*Document last updated: March 19, 2026*
*Branch: feature/prediction_upgrade*
