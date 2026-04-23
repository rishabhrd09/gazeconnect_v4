# GazeConnect Pro — Complete Prediction System Explained

**Written in simple language for anyone to understand.**
**Last updated: March 2025**

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [System 1: Word Prediction](#2-system-1-word-prediction)
3. [System 2: Sentence Prediction](#3-system-2-sentence-prediction)
4. [How Both Work Together](#4-how-both-work-together)
5. [Every Algorithm Explained with Examples](#5-every-algorithm-explained-with-examples)
6. [The Complete Scoring Pipeline (Step by Step)](#6-the-complete-scoring-pipeline-step-by-step)
7. [How the System Learns](#7-how-the-system-learns)
8. [Vocabulary & Data Sets](#8-vocabulary--data-sets)
9. [Performance Summary](#9-performance-summary)

---

## 1. The Big Picture

GazeConnect has **two prediction systems** that work side by side. Think of them like two helpers, each with a different job:

```
Patient types: "I want wat..."
                    |
        +-----------+-----------+
        |                       |
   HELPER 1                 HELPER 2
  Word Pred               Sentence
   (5-10ms)                (10-50ms)
        |                       |
   "water"              "I want
   "watch"               water
   "wait"                please"
   "warm"
   "waste"
```

| Helper | What It Does | Speed | Where It Shows |
|--------|-------------|-------|----------------|
| **Word Prediction** | Completes the word you're typing | 5-10ms (instant) | Top prediction bar (5 buttons) |
| **Sentence Prediction** | Suggests full sentences | 10-50ms (instant) | Bottom row (2-3 suggestions) |

**They never conflict** because they show up in different places on screen and serve different purposes.

---

## 2. System 1: Word Prediction

### What It Does
When you type letters, it predicts which **word** you're trying to type and shows 5 options.

### Simple Example
```
You type: "I want med"
System shows: [medicine] [medical] [meditation] [media] [medium]

You type: "Please ch"
System shows: [change] [check] [channel] [charge] [child]
```

### How It Works (Simple Version)

The word prediction system uses **multiple techniques layered on top of each other**, like a funnel. Each technique adds intelligence:

```
Step 1: "What letters did they type?"     → prefix = "med"
Step 2: "What words start with med?"      → medicine, medical, medium, media...
Step 3: "What did they type BEFORE med?"  → context = "I want"
Step 4: "After 'I want', which is most likely?" → medicine ranks highest
Step 5: "Is this Papa's word?"            → medicine gets bonus (he uses it daily)
Step 6: "Was it used recently?"           → medicine gets another bonus
Step 7: "Is it morning?"                  → medicine gets time-of-day bonus
Step 8: Show top 5 results
```

### The Algorithms Used

Here is every technique the word prediction system uses:

#### 2.1 — Abbreviation Expansion (Instant Shortcut)

**What:** Short codes that instantly expand to full phrases. Checked first, highest priority.

**Example:**
```
You type: "gm"   → instantly becomes: "Good morning"
You type: "inw"  → instantly becomes: "I want water"
You type: "suc"  → instantly becomes: "Please do suction"
You type: "mkb"  → instantly becomes: "Mummy ko bulao"
```

**Why it matters:** For an ALS patient using eye-gaze, typing 3 letters instead of 15 saves enormous effort. We have 100+ built-in abbreviations covering greetings, medical needs, positions, feelings, family calls, and Hinglish shortcuts. Patients can also add their own custom abbreviations.

**How it works:** Simple dictionary lookup. When the typed text matches an abbreviation key, the expansion is returned immediately with a score of 10.0 (highest possible). No other predictions are even computed.

---

#### 2.2 — Prefix Trie (Fast Word Finder)

**What:** A tree-shaped data structure that finds all words starting with the typed letters, almost instantly.

**The problem it solves:** We have 3,000+ words in our vocabulary. Without the Trie, every single keystroke would scan all 3,000 words asking "does this word start with 'wa'?" That's slow and wasteful.

**How a Trie works (simple explanation):**

Imagine a tree where each branch is a letter:
```
         (root)
        /   |   \
       w    p    m
      /     |     \
     a      a      e
    /|\     |      |
   t l i    p      d
  /|   |    |      |
 e c   t   a      i
 |  |       |      |
 r  h      (पापा)  c
(water)(watch)(wait)  i
                    n
                    e
                   (medicine)
```

When you type "wa", the system walks down `w → a` and instantly finds all words below that point: water, watch, wait, walk, wall, warm, want. It doesn't need to check "medicine" or "papa" at all.

**Example:**
```
You type: "wa"  → Trie walks 2 nodes  → finds: water, want, warm, watch, walk, wall, wait
You type: "wat" → Trie walks 3 nodes  → finds: water, watch
You type: "पा"  → Trie walks 2 nodes  → finds: पानी, पापा (works with Hindi too!)
```

**Speed improvement:** Instead of checking 3,000 words (old way), we walk 2-3 tree nodes. That's roughly **750x faster**.

---

#### 2.3 — N-Gram Language Model (Context Awareness)

**What:** Predicts the next word based on the 1-2 words typed before it. "N-gram" means "a sequence of N words."

**The idea:** Some word combinations appear together far more often than others. "I want **water**" is much more common than "I want **elephant**". The N-gram model learns these patterns.

**Three levels of context:**

```
Unigram (1 word):   How common is "water" by itself?
                    → water appears 50 times in training data
                    → elephant appears 0 times
                    → water wins

Bigram (2 words):   How often does "water" follow "want"?
                    → "want water" appears 12 times
                    → "want medicine" appears 8 times
                    → water wins after "want"

Trigram (3 words):  How often does "water" follow "I want"?
                    → "I want water" appears 10 times
                    → "I want medicine" appears 6 times
                    → water wins after "I want"
```

**How scores are combined:**
```
Final score = (15% × unigram score) + (35% × bigram score) + (50% × trigram score)
```

The trigram (3-word context) has the most weight (50%) because it's the most specific and accurate predictor. If you typed "I want", the system heavily relies on what usually comes after "I want" in its training data.

**Smoothing:** What if the system has never seen "I want pizza"? Without smoothing, it would give "pizza" a zero score. Laplace smoothing adds a tiny count (+1) to every possible word, so unseen combinations still get a small chance instead of zero. This prevents the system from being overconfident.

---

#### 2.4 — Vocabulary Boosting (Priority System)

**What:** Not all words are equal. A patient's own words matter more than random English words. The system multiplies scores based on which vocabulary set a word belongs to.

**Boost factors:**
```
Patient Vocabulary  → 2.0x  (Papa's actual words: "mummy", "suction", "karvat")
Recent Words        → 2.5x  (words used in last few hours)
Cultural Vocabulary → 1.7x  (regional terms: "mandir", "prasad", "aarti")
Hinglish Vocabulary → 1.6x  (Hindi in English letters: "kya", "jaldi", "ghar")
Core Vocabulary     → 1.5x  (top 500 common English words)
Frequency Boost     → 1.4x  (words this patient types often)
Medical Vocabulary  → 1.3x  (ALS terms: "ventilator", "nebulizer", "bipap")
```

**Example:**
```
Patient types: "I want su"

"sugar"   = n-gram score 0.02 × CORE_BOOST 1.5     = 0.030
"suction" = n-gram score 0.02 × PATIENT_BOOST 2.0  = 0.040  ← wins!
"surface" = n-gram score 0.02 × (no boost) 1.0     = 0.020

"suction" wins because it's in Papa's personal vocabulary.
```

---

#### 2.5 — Recency Tracker (Time-Decay Memory)

**What:** Words used recently get a boost that fades over time. If Papa said "suction" 1 hour ago, it ranks higher than if he said it 3 days ago.

**How it works:** Every time a word is used, the current timestamp is recorded. The boost is calculated using exponential decay:

```
Boost = e^(-0.693 × hours_since_use / 72)

Used 1 hour ago:   boost = 0.99  (almost full strength)
Used 12 hours ago:  boost = 0.94  (still strong)
Used 72 hours ago:  boost = 0.50  (half strength — this is the "half-life")
Used 1 week ago:    boost = 0.13  (fading)
Used 30 days ago:   pruned from memory
```

**The half-life is 72 hours (3 days).** This means a word's recency boost drops to half-strength after 3 days of not being used.

**Example:**
```
Papa said "blanket" 2 hours ago at bedtime.
Now it's morning. He types "bl..."

"blanket" gets recency boost = 0.98 (very recent)
"blue" gets recency boost = 0.0 (never used recently)

"blanket" ranks higher even though "blue" is a more common English word.
```

---

#### 2.6 — Patient Bigram Tracker (Word Pair Learning)

**What:** Learns which words Papa commonly puts together. This is the **single biggest accuracy improvement** in the whole system.

**How it works:** Every time Papa speaks a sentence, the system records every pair of consecutive words:

```
Papa says: "Tell mummy to take rest"

Learned pairs:
  "tell"  → "mummy"  (count: 1)
  "mummy" → "to"     (count: 1)
  "to"    → "take"   (count: 1)
  "take"  → "rest"   (count: 1)

After Papa says similar things 5 more times:
  "tell"  → "mummy"  (count: 6)   ← strong pattern!
```

**Now when Papa types "tell m...":**
```
Without bigrams: "make", "me", "more", "much", "my" (generic top words)
With bigrams:    "mummy" (count 6), then "me", "make"...
                 → "mummy" gets up to 4x boost from bigram score
```

**The boost formula:**
```
bigram_boost = 1.0 + (bigram_probability × 3.0)

If "mummy" has probability 0.8 after "tell":
  boost = 1.0 + (0.8 × 3.0) = 3.4x

This is multiplicative on top of all other boosts!
```

**Why this is the biggest win:** Generic prediction treats "tell me" and "tell mummy" equally. But for THIS patient, "tell mummy" is 6x more frequent. The bigram tracker captures this personal pattern. Over time, the system becomes highly personalized.

**Storage:** Saved to `patient_data/patient_bigrams.json`. Pruned when pairs exceed 5,000 (keeps only pairs with count >= 2).

---

#### 2.7 — Time-of-Day Boost

**What:** Certain words are more relevant at certain times. "Breakfast" is more useful at 7 AM than at 10 PM. "Blanket" is more useful at night.

**Time slots and boosted words:**
```
Morning (5 AM - 11 AM)  → 1.8x boost:
  breakfast, tea, chai, medicine, dawa, tablet, egg, milk, bath,
  exercise, physiotherapy, nebulizer, bp, sugar
  Hindi: चाय, दूध, दवा, सुबह, अंडा, व्यायाम, नाश्ता, शुभप्रभात

Afternoon (11 AM - 4 PM) → 1.5x boost:
  lunch, khana, rest, aram, sleep, nap, water, pani, position,
  dal, rice, soup, juice
  Hindi: खाना, दाल, चावल, आराम, पानी, दोपहर

Evening (4 PM - 9 PM)   → 1.5x boost:
  dinner, evening, shaam, news, tv, family, call, phone, visitor, snack
  Hindi: शाम, टीवी, फोन, परिवार

Night (9 PM - 5 AM)     → 1.8x boost:
  sleep, neend, blanket, kambal, position, pillow, pain, toilet,
  turn, cover, cold, warm, night
  Hindi: नींद, कंबल, तकिया, रात, दर्द, शुभरात्रि
```

**Example:**
```
It's 7:30 AM. Papa types "cha..."

"chai"    = base score 0.03 × HINGLISH_BOOST 1.6 × MORNING_BOOST 1.8 = 0.086
"change"  = base score 0.03 × CORE_BOOST 1.5     × (no time boost) 1.0 = 0.045
"channel" = base score 0.03 × (no boost) 1.0     × (no time boost) 1.0 = 0.030

"chai" wins because it's morning time!
```

---

#### 2.8 — Edit Distance / Fuzzy Matching (Typo Tolerance)

**What:** When the patient's eye-gaze drifts and they type "watee" instead of "water", this catches the typo and still suggests the right word.

**The problem:** Eye-gaze typing is imprecise. The patient looks at the 'e' key but their gaze is slightly off, hitting the adjacent key. Without fuzzy matching, typing "watee" returns zero predictions — the patient has to delete and retype, which is exhausting with eye control.

**How Levenshtein Edit Distance works:**

It counts the minimum number of single-character operations (insert, delete, or substitute) needed to transform one word into another:

```
"watee" → "water"  = 1 operation (substitute 'e' with 'r')     ← CLOSE MATCH
"positon" → "position" = 1 operation (insert 'i')              ← CLOSE MATCH
"hello" → "hello"  = 0 operations (identical)                   ← EXACT MATCH
"cat" → "dog"      = 3 operations (substitute c→d, a→o, t→g)  ← TOO DIFFERENT
```

**When it triggers:**
- Only when exact prefix matching found fewer than 5 results
- Only when the prefix is 4 or more characters long (shorter prefixes create too many false matches)
- Only allows distance of 1 (single typo)

**Why the 4-character minimum matters:**
```
Prefix "wa" with fuzzy matching → "we", "was", "war", "way", "wan" (too many false matches!)
Prefix "wate" with fuzzy matching → "water", "waste" (useful and focused!)
```

Most gaze-typing errors happen in the middle of a word (characters 3-6), not at the very beginning. The 4-character threshold catches exactly these errors.

**Speed optimization:** Before computing edit distance (which is expensive), the system first filters by word length. A 5-letter prefix can't reasonably match a 2-letter or 10-letter word, so it only checks words within ±2 characters of the prefix length. This eliminates ~90% of candidates instantly.

**Example:**
```
Papa types: "watee" (gaze drifted on last letter)

Exact prefix search for "watee": → 0 results (no word starts with "watee")
Fuzzy search activates (prefix is 5 chars, >= 4 threshold):
  Check "water": distance = 1 (e→r) ✓
  Check "waste": distance = 2 (t→s, e→t) ✗ too far
  Check "watch": distance = 2 ✗ too far

Result: [water] shown with source = 'fuzzy', lower confidence score (0.03-0.08)
Papa doesn't have to delete and retype!
```

---

#### 2.9 — Vocabulary Fallback & Context Fallback

**What:** When all the smart algorithms above still don't produce enough predictions, the system falls back to simpler methods:

**Vocabulary Fallback** (if fewer than 5 predictions after n-gram + trie):
```
Scan ALL_VOCABULARY (3000+ words) for any word starting with the prefix.
Give it a low base score:
  Patient word:  0.15
  Core word:     0.10
  Medical word:  0.08
  Other word:    0.05
```

**Context Fallback** (if no prefix is being typed — user just finished a word):
```
Look at what words typically follow the last 1-2 words:
  User typed "I want " (space at end, no prefix)
  Trigram lookup: what follows "I want"? → water, help, sleep, medicine, to
  Bigram lookup:  what follows "want"?  → same + more options
```

**Ultimate Fallback** (if nothing else works):
```
English: show ['please', 'want', 'need', 'the', 'help', 'thank', 'can', 'will']
Hindi:   show ['है', 'नहीं', 'हाँ', 'मुझे', 'आप', 'क्या', 'चाहिए']
```

This guarantees the patient always sees something useful, even with an empty text box.

---

## 3. System 2: Sentence Prediction

### What It Does
Suggests complete sentences based on what the patient has started typing. Shows 0-3 sentence suggestions.

### Simple Example
```
You type: "I want"
System shows:
  🔁 "I want water please"           (from history — you said this yesterday)
  💬 "I want to change position"     (from template bank)
  💬 "I want to sleep"               (from template bank)
```

### How It Works

The sentence predictor has **4 matching tiers**, checked in order of priority:

#### Tier 1 — Patient History (Highest Priority)

**What:** Sentences the patient has actually spoken before. Most personal and relevant.

**How:** Every time the patient speaks a sentence (presses SPEAK), it's saved with a usage count and timestamp. When predicting, the system checks if the currently typed text is the beginning of any saved sentence.

```
Saved history:
  "I want water please"        (count: 12, last used: 2 hours ago)
  "I want to change position"  (count: 8, last used: 5 hours ago)
  "I want to sleep now"        (count: 3, last used: 2 days ago)

Patient types: "I want"  → all three match (they start with "I want")

Scoring formula:
  score = (count × 0.3 + recency × 1.0) × coverage_boost

  "I want water please":
    count factor   = 12 × 0.3 = 3.6
    recency factor = e^(-0.693 × 2hrs / 48hrs) = 0.97  (48-hour half-life)
    coverage       = len("I want") / (len("I want water please") × 0.5) = 0.55
    coverage_boost = 1.0 + (3.0 - 1.0) × 0.55 = 2.1
    SCORE = (3.6 + 0.97) × 2.1 = 9.6  ← HIGHEST

  "I want to sleep now":
    count factor   = 3 × 0.3 = 0.9
    recency factor = e^(-0.693 × 48hrs / 48hrs) = 0.50  (exactly at half-life)
    coverage_boost = 2.1
    SCORE = (0.9 + 0.50) × 2.1 = 2.9  ← lowest
```

**Coverage boost explained:** The more of the sentence you've typed, the more confident the system is that you want that specific sentence. Typing "I" matching "I want water" gets a low coverage boost. Typing "I want wat" matching "I want water" gets a high coverage boost.

**History limit:** Maximum 500 sentences stored. When it exceeds 500, the least-used and oldest sentences are pruned.

---

#### Tier 2 — Template Matching (Medium Priority)

**What:** A bank of 170+ pre-written sentence templates organized by category (medical, comfort, greetings, etc.).

**Template structure:**
```
Prefix: "i want"  → Category: "basic"
  Sentences: ["I want water", "I want to sleep", "I want to eat", ...]

Prefix: "pain"    → Category: "medical"
  Sentences: ["Pain in my legs", "Pain has increased", "Pain medicine needed"]

Prefix: "मुझे"   → Category: "hindi_basic"
  Sentences: ["मुझे पानी चाहिए", "मुझे दर्द हो रहा है", "मुझे भूख लगी है"]
```

**Two matching modes:**
```
Exact match:   You typed "i want to" → matches prefix "i want" (you typed MORE than prefix)
               Score: 1.0 × time_boost

Partial match: You typed "i wa" → prefix "i want" starts with "i wa"
               Score: 0.8 × time_boost (lower confidence — partial match)
```

**Time-of-day boost for templates:**
```
Morning:   medical templates × 1.5, basic needs × 1.3, greetings × 1.5
Afternoon: basic needs × 1.2, comfort × 1.3
Evening:   family templates × 1.3, greetings × 1.2
Night:     comfort templates × 1.5, greetings × 1.3, emergency × 1.3
```

---

#### Tier 3 — Keyword Matching (Weak Priority)

**What:** If prefix matching doesn't find enough results, the system looks for the last word you typed *anywhere* inside sentences.

```
You type: "someone blanket"

No sentence starts with "someone blanket", but...
Keyword "blanket" found INSIDE:
  "Give me blanket"         → score: 0.6
  "Remove the blanket"      → score: 0.6
  "Blanket is too heavy"    → score: 0.6

These are still useful suggestions even though the prefix doesn't match!
```

**Only triggers when:** The last word is 3+ characters AND fewer than 6 results found so far.

---

#### Tier 4 — Fuzzy Matching (Last Resort)

**What:** Searches patient history for any sentence containing the last typed word, even if it doesn't start with it.

```
You type: "need medicine"

Fuzzy search for "medicine" in history:
  "Give me medicine on time"       (count: 4)  → score: 0.3
  "Medicine is making me drowsy"   (count: 2)  → score: 0.3

Only considers sentences used at least 2 times (filters out one-time entries).
```

---

## 4. How Both Work Together

### The Complete Flow (One Keystroke)

Here's exactly what happens when Papa types the letter "r" making his text "I want wate r":

```
TIME    EVENT
─────────────────────────────────────────────────────────────
 0ms    Papa's eye dwells on "r" key → character added
        Text is now: "I want water "

 1ms    Frontend sends WebSocket message:
        { type: "get_predictions", text: "I want water " }

 5ms    Python backend receives message, calls _get_predictions()

        ┌─── WORD PREDICTION (synchronous) ──────────────────
        │ 1. Extract prefix: "" (space at end = no prefix)
        │ 2. Extract context: ("want", "water")
        │ 3. No prefix → skip Trie, use context fallback
        │ 4. Trigram: what follows "want water"? → "please", "now"
        │ 5. Bigram: what follows "water"? → "please", "bottle"
        │ 6. Apply boosts: patient vocab, recency, time-of-day
        │ 7. Return: [please, now, bottle, and, is]
        └──── Done in ~8ms ──────────────────────────────────

        ┌─── SENTENCE PREDICTION (synchronous) ─────────────
        │ 1. Check history: any sentence starting with "I want water"?
        │    → "I want water please" (count: 12) ✓
        │    → "I want water bottle" (count: 3) ✓
        │ 2. Check templates: prefix "i want" matches basic needs
        │ 3. Score and rank
        │ 4. Return: ["I want water please", "I want water bottle"]
        └──── Done in ~30ms ─────────────────────────────────

15ms    Backend sends predictions to frontend:
        { words: [...], sentences: [...] }

20ms    Frontend displays word predictions:
        [please] [now] [bottle] [and] [is]

25ms    Frontend displays sentence predictions (bottom row):
        🔁 "I want water please"
        🔁 "I want water bottle"
```

### What the Patient Sees

```
┌─────────────────────────────────────────────────────────────┐
│  [please]  [now]  [bottle]  [and]  [is]                    │  ← Word predictions
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  I want water |                                             │  ← Display box
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 🔁 I want water please    │ 🔁 I want water bottle         │  ← Sentence predictions
└─────────────────────────────────────────────────────────────┘
```

**Two zones, two systems, zero conflict.**

---

## 5. Every Algorithm Explained with Examples

Here is a complete reference of every algorithm and technique used across all three prediction systems:

### Algorithm 1: Prefix Trie
| | |
|---|---|
| **Used in** | Word Prediction |
| **Purpose** | Fast word lookup by prefix |
| **Speed** | O(k) where k = prefix length (2-8 characters typically) |
| **Example** | Type "med" → walks 3 nodes → finds: medicine, medical, medium, media, meditation |
| **Built** | Once at startup (~22ms for 3000+ words) |
| **Updated** | When new words are learned |

### Algorithm 2: N-Gram Model (Unigram + Bigram + Trigram)
| | |
|---|---|
| **Used in** | Word Prediction |
| **Purpose** | Context-aware word probability |
| **Speed** | O(1) dictionary lookups |
| **Example** | Context "I want" → P("water") = 50% weight from trigram "I want water" + 35% from bigram "want water" + 15% from unigram "water" |
| **Trained on** | 450+ sentence patterns (English + Hindi), trained 3x each |

### Algorithm 3: Interpolated Probability with Laplace Smoothing
| | |
|---|---|
| **Used in** | Word Prediction (inside N-Gram Model) |
| **Purpose** | Combine unigram/bigram/trigram scores + handle unseen words |
| **Formula** | P = 0.15 × P_unigram + 0.35 × P_bigram + 0.50 × P_trigram |
| **Smoothing** | Laplace: P(word) = (count + 1) / (total + vocab_size) |
| **Example** | "pizza" never seen after "I want" → still gets small non-zero probability |

### Algorithm 4: Exponential Time-Decay (Recency Tracking)
| | |
|---|---|
| **Used in** | Word Prediction, Sentence Prediction |
| **Purpose** | Boost recently used words/sentences, fade over time |
| **Half-life** | 72 hours (word prediction), 48 hours (sentence prediction) |
| **Formula** | boost = e^(-0.693 × hours_elapsed / half_life_hours) |
| **Example** | Word used 1hr ago → boost 0.99. Word used 3 days ago → boost 0.50 |

### Algorithm 5: Patient Bigram Learning
| | |
|---|---|
| **Used in** | Word Prediction |
| **Purpose** | Learn personal word pairs from patient's actual typing |
| **Boost** | Up to 4.0x (formula: 1.0 + probability × 3.0) |
| **Example** | Papa always says "tell mummy" → after "tell", "mummy" gets massive boost |
| **Storage** | patient_bigrams.json, pruned at 5000+ entries |
| **Impact** | Biggest single accuracy improvement in the system |

### Algorithm 6: Levenshtein Edit Distance
| | |
|---|---|
| **Used in** | Word Prediction (fuzzy fallback) |
| **Purpose** | Measure similarity between typed word and vocabulary words |
| **Operations** | Insert, Delete, Substitute (each costs 1) |
| **Complexity** | O(m × n) time, O(min(m,n)) space |
| **Example** | "watee" vs "water" = distance 1 (substitute e→r) |

### Algorithm 7: Fuzzy Word Matching
| | |
|---|---|
| **Used in** | Word Prediction (when exact prefix fails) |
| **Trigger** | Prefix ≥ 4 characters AND fewer than 5 exact matches found |
| **Max distance** | 1 (single typo only) |
| **Optimization** | Only checks words within ±2 characters of prefix length |
| **Example** | "positon" → finds "position" (distance 1, insert 'i') |

### Algorithm 8: Time-of-Day Contextual Boost
| | |
|---|---|
| **Used in** | Word Prediction, Sentence Prediction |
| **Purpose** | Boost contextually relevant words by time |
| **Boost values** | Morning/Night: 1.8x, Afternoon/Evening: 1.5x |
| **Example** | 7 AM: "medicine" → 1.8x boost. 10 PM: "blanket" → 1.8x boost |

### Algorithm 9: Coverage-Weighted History Scoring
| | |
|---|---|
| **Used in** | Sentence Prediction |
| **Purpose** | Higher confidence when more of the sentence is typed |
| **Formula** | coverage = typed_length / (sentence_length × 0.5), boost = 1.0 + 2.0 × coverage |
| **Example** | Typing "I" matching "I want water" → low boost. Typing "I want wat" → high boost |

### Algorithm 10: Multi-Tier Sentence Matching
| | |
|---|---|
| **Used in** | Sentence Prediction |
| **Tiers** | History (highest) → Templates → Keywords → Fuzzy (lowest) |
| **Scores** | History: up to 10+, Templates: 0.8-1.0, Keywords: 0.5-0.6, Fuzzy: 0.3 |
| **Example** | "I want" → History match "I want water please" (score 9.6) beats Template "I want to sleep" (score 1.0) |

### Algorithm 11: Abbreviation Expansion
| | |
|---|---|
| **Used in** | Word Prediction (highest priority, checked first) |
| **Purpose** | Instant phrase shortcuts for common needs |
| **Count** | 100+ built-in + unlimited custom abbreviations |
| **Example** | "inw" → "I want water" (score 10.0, bypasses all other prediction) |

### Algorithm 12: Multiplicative Vocabulary Boosting
| | |
|---|---|
| **Used in** | Word Prediction |
| **Purpose** | Prioritize relevant vocabulary categories |
| **Factors** | Patient 2.0x, Recent 2.5x, Cultural 1.7x, Hinglish 1.6x, Core 1.5x, Frequency 1.4x, Medical 1.3x |
| **Stacking** | All boosts multiply together. A recent patient medical word could get 2.0 × 2.5 × 1.3 = 6.5x total boost |

---

## 6. The Complete Scoring Pipeline (Step by Step)

Here is the exact order of operations inside `_predict_logic()`, the core function that runs on every keystroke:

```
INPUT: text = "I want med", top_k = 5, lang = "english"

STEP 1: Extract context and prefix
  ├── context = ("want",)           ← last 1-2 completed words
  └── prefix = "med"                ← word currently being typed

STEP 2: Check abbreviations  [Score: 10.0]
  ├── Is "med" in abbreviation dictionary? → NO
  └── Continue to next step

STEP 3: Trie prefix lookup  [O(3) — walks 3 nodes: m→e→d]
  └── Returns: medicine, medical, medium, media, meditation, medal, ...
      (up to 50 candidates)

STEP 4: N-gram scoring  [Base score: 0.001 - 1.0]
  For each candidate:
  ├── "medicine": P(medicine | context="want") = 0.04
  ├── "medical":  P(medical | context="want")  = 0.01
  ├── "medium":   P(medium | context="want")   = 0.005
  └── ... etc

STEP 5: Language filtering
  ├── lang = "english" → skip any Hindi (Devanagari) words
  └── All candidates are English → none filtered

STEP 6: Vocabulary boosting  [Multiplicative]
  ├── "medicine": in PATIENT_VOCABULARY → score × 2.0 = 0.08
  ├── "medical":  in MEDICAL_VOCABULARY → score × 1.3 = 0.013
  ├── "medium":   in CORE_VOCABULARY    → score × 1.5 = 0.0075
  └── "media":    in EVERYDAY_VOCAB     → score × 1.0 = 0.005

STEP 7: User frequency boost  [Up to 1.4x]
  ├── "medicine": used 25 times → boost = min(1.4, 1 + 25/50) = 1.4
  │   score = 0.08 × 1.4 = 0.112
  └── others: rarely used → boost ≈ 1.0

STEP 8: Recent words boost  [Up to 2.5x]
  ├── "medicine": in recent_words at position 3/100
  │   recency_factor = (100-3)/100 = 0.97
  │   boost = 1 + (2.5-1) × 0.97 = 2.455
  │   score = 0.112 × 2.455 = 0.275
  └── others: not in recent → boost = 1.0

STEP 9: Recency decay boost  [Exponential, 72hr half-life]
  ├── "medicine": used 4 hours ago → decay = 0.96
  │   score = 0.275 × (1.0 + 0.96 × 0.5) = 0.275 × 1.48 = 0.407
  └── others: not used recently → boost = 1.0

STEP 10: Patient bigram boost  [Up to 4.0x]
  ├── context[-1] = "want"
  │   bigrams["want"] = {"water": 0.6, "medicine": 0.2, "help": 0.1, ...}
  │   "medicine": boost = 1.0 + 0.2 × 3.0 = 1.6
  │   score = 0.407 × 1.6 = 0.651
  └── "medical": not in bigrams after "want" → boost = 1.0

STEP 11: Time-of-day boost  [1.0 - 1.8x]
  ├── Current time: 8:00 AM (morning)
  │   "medicine" is in _MORNING set → boost = 1.8
  │   score = 0.651 × 1.8 = 1.172
  └── "medium": not in any time set → boost = 1.0

STEP 12: Vocabulary fallback  [If < 5 candidates]
  └── Already have 6+ candidates → skip

STEP 13: Fuzzy fallback  [If < 5 candidates AND prefix ≥ 4 chars]
  └── prefix "med" is only 3 chars → skip (threshold is 4)

STEP 14: Sort and return top 5
  ┌─────────────┬────────┬─────────────────┐
  │ Word        │ Score  │ Source          │
  ├─────────────┼────────┼─────────────────┤
  │ medicine    │ 1.172  │ patient_bigram  │
  │ medical     │ 0.013  │ medical         │
  │ meditation  │ 0.009  │ core            │
  │ medium      │ 0.008  │ core            │
  │ media       │ 0.005  │ ngram           │
  └─────────────┴────────┴─────────────────┘

OUTPUT: [medicine, medical, meditation, medium, media]
```

**Notice how "medicine" started at 0.04 and ended at 1.172 — a 29x amplification** through stacking patient boost, frequency, recency, bigram learning, and time-of-day. This is why the system is so accurate for the patient's actual needs.

---

## 7. How the System Learns

### When the Patient Speaks a Sentence

When Papa presses the SPEAK button, the spoken text triggers learning across all systems:

```
Papa speaks: "Tell mummy to give medicine on time"

WORD PREDICTION LEARNS:
  ├── learn_word("tell")     → frequency["tell"] += 1, added to recent_words
  ├── learn_word("mummy")    → frequency["mummy"] += 1, added to recent_words
  ├── learn_word("give")     → frequency["give"] += 1
  ├── learn_word("medicine") → frequency["medicine"] += 1
  ├── learn_word("time")     → frequency["time"] += 1
  ├── Each new word inserted into Trie (if not already there)
  ├── N-gram trained: unigrams, bigrams, trigrams updated
  ├── Recency: timestamps recorded for all words
  └── Bigrams learned:
        "tell" → "mummy"    (count +1)
        "mummy" → "to"      (count +1)
        "to" → "give"       (count +1)
        "give" → "medicine"  (count +1)
        "medicine" → "on"    (count +1)
        "on" → "time"       (count +1)

SENTENCE PREDICTION LEARNS:
  ├── Checks history: is this sentence already stored?
  │   YES → count += 1, last_used = now
  │   NO  → add new entry: {text, count: 1, last_used: now}
  └── Marks dirty flag → saved to disk on next save()
```

### When the Patient Selects a Word Prediction

```
Papa sees [medicine] in prediction bar → dwells on it

WORD PREDICTION LEARNS:
  ├── user_frequencies["medicine"] += 1
  ├── Added to recent_words list
  └── Added to custom_words set
```

### When a Custom Word is Added (Settings)

```
Caregiver adds "glycopyrrolate" in Settings

WORD PREDICTION:
  ├── custom_words.add("glycopyrrolate")
  ├── user_frequencies["glycopyrrolate"] = 10  (high starting weight)
  ├── ngram.unigrams["glycopyrrolate"] = 10
  ├── Inserted into Trie
  ├── Added to front of recent_words
  └── Saved to disk immediately
```

### Data Persistence (What's Saved to Disk)

```
data/
├── custom_dictionary.json          ← user frequencies, recent words, custom words
└── patient_data/
    ├── recency_scores.json         ← word timestamps (72-hour decay)
    ├── patient_bigrams.json        ← learned word pairs
    ├── patient_sentences.json      ← sentence history (500 max)
    └── custom_abbreviations.json   ← custom abbreviation mappings
```

All data survives app restarts. The prediction system loads everything at startup.

---

## 8. Vocabulary & Data Sets

### Size Summary

| Set | Count | Language | Examples |
|-----|-------|----------|----------|
| Core Vocabulary | ~500 | English | you, want, need, please, good, help |
| Medical Vocabulary | ~150 | English | suction, ventilator, nebulizer, tracheostomy, bipap |
| Patient Vocabulary | ~350 | Mixed | mummy, rishabh, nilesh, suction, karvat, sponging |
| App Screen Vocabulary | ~100 | English | emergency, keyboard, channel, switch, devotional |
| Expanded Vocabulary | ~400 | English | accept, appear, beautiful, business, decide |
| Everyday Vocabulary | ~500 | English | email, laptop, phone, weather, emoji, shopping |
| ALS Communication | ~200 | English | calibrate, dwell, comfortable, urgent, caregiver |
| Hindi Vocabulary | ~250 | Devanagari | नमस्ते, दवा, पानी, सक्शन, दर्द, मम्मी |
| Hinglish Vocabulary | ~50 | Romanized Hindi | kya, baat, hai, jaldi, ghar, badhai |
| Cultural Vocabulary | ~20 | Mixed | indore, bhopal, hanumanji, mandir, prasad |
| **ALL_VOCABULARY** | **~3,000+** | **Mixed** | **(union of all above, filtered ≥3 letters)** |

### Training Data

| Dataset | Size | Trained | Content |
|---------|------|---------|---------|
| AAC Phrases | 130+ phrases | 1x | 10 categories: emergency, medical, comfort, feelings... |
| English Training Corpus | ~300 sentences | 3x (high weight) | Patient chat history, common patterns, daily routines |
| Hindi Training Corpus | ~150 sentences | 3x (high weight) | Basic needs, medical, family, emergency in Devanagari |
| Abbreviations | 100+ | Instant lookup | Shortcuts for greetings, medical needs, commands, Hindi |
| Sentence Templates | 170+ groups | Instant lookup | Organized by prefix and category with time-of-day boosts |

---

## 9. Performance Summary

### Speed per Keystroke

| System | Time | Blocking? | Notes |
|--------|------|-----------|-------|
| Word Prediction | 5-10ms | Yes (but instant) | Trie lookup + scoring |
| Sentence Prediction | 10-50ms | Yes (but instant) | History + template search |
| **Total visible latency** | **15-60ms** | | Patient sees predictions in <60ms |

### Memory Usage

| Component | RAM | Notes |
|-----------|-----|-------|
| Trie + N-Gram Model | ~10 MB | 3000+ words, trigram tables |
| Sentence Predictor | ~1 MB | 500 history + 170 templates |
| **Total** | **~11 MB** | Lightweight, no heavy dependencies |

### Algorithm Complexity

| Algorithm | Time Complexity | When It Runs |
|-----------|----------------|--------------|
| Trie prefix search | O(k), k = prefix length | Every keystroke |
| N-gram probability | O(1) dictionary lookup | Every keystroke |
| Vocabulary boosting | O(1) set membership | Every keystroke |
| Recency decay | O(t), t = timestamps per word | Every keystroke |
| Bigram lookup | O(1) dictionary lookup | Every keystroke |
| Time-of-day boost | O(1) set membership | Every keystroke |
| Edit distance (fuzzy) | O(m×n) per word pair | Only when exact match fails + prefix ≥ 4 chars |
| Sentence history search | O(500) max | Every keystroke |
| Template matching | O(170) groups | Every keystroke |

### What Makes It Fast

1. **Trie** eliminates 99% of vocabulary on every keystroke (O(k) vs O(3000))
2. **All boosts are O(1)** — dictionary/set lookups, no computation
3. **Fuzzy matching only triggers when needed** — not on every keystroke
4. **Sentence history capped at 500** — prevents unbounded growth

---

*This document covers every algorithm, technique, data structure, and scoring mechanism used in GazeConnect Pro's prediction system. The system is designed for an ALS patient using eye-gaze control, where every millisecond and every accurate prediction reduces physical effort and improves quality of life.*
