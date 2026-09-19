# Deterministic word prediction and ten keyboard suggestions

The keyboard's word suggestions now come from a Python port of the GazeCompass
deterministic predictor, pinned at GazeCompass commit `de33a95`. The
traditional keyboard shows **ten** word slots. The previous engine (n-gram,
smart bigrams and ONNX reranker) is kept only as a rollback.

- **Default engine:** `deterministic`. It uses no network, runtime LLM, neural model, random source or wall clock. Identical inputs and slot lineage always give identical slots.
- **Rollback:** `--prediction-engine legacy`, or `GAZECONNECT_PREDICTION_ENGINE=legacy` ([Rollback](#rollback)).
- **Before/after:**
  - On the held-out AAC test set, word top-5 rises from 0.364 to 0.596.
  - Keystroke savings rise from 0.374 (4 visible legacy slots) to 0.589 (10 slots, production context).
  - [Full report](evaluation.md).

## Contents

1. [Architecture and message contract](#architecture-and-message-contract)
2. [Ten-slot keyboard](#ten-slot-keyboard)
3. [Port: mapping, assets and intentional differences](#port-mapping-assets-and-intentional-differences)
4. [Parity and determinism evidence](#parity-and-determinism-evidence)
5. [Content policy, guardrails and English-only display](#content-policy-guardrails-and-english-only-display)
6. [Learning and persistence](#learning-and-persistence)
7. [Execution and performance](#execution-and-performance)
8. [Evaluation summary](#evaluation-summary)
9. [Provenance and licences](#provenance-and-licences)
10. [Packaging and CI](#packaging-and-ci)
11. [Commands](#commands)
12. [Rollback](#rollback)
13. [Known limitations and follow-ups](#known-limitations-and-follow-ups)
14. [Remaining Windows and Tobii hardware checks](#remaining-windows-and-tobii-hardware-checks)

## Architecture and message contract

```
KeyboardScreen / Zone Board ──get_predictions──▶ main.py (asyncio, gaze loop)
                                                   │ latest-only per client, lineage
                                                   ▼
                                     WordPredictionService (service.py)
                                                   │ request = draft + state snapshot
                                                   ▼            + phrases + lineage
                                     worker process (worker.py) ─▶ DeterministicPredictionEngine (engine.py)
```

`python/services/deterministic_prediction/` has one module per concern:

| Module | Role |
|---|---|
| `engine.py` | `buildPredictionSnapshot` port: candidate supply, curated tiers, statistical features, legality/grammar penalties, tail reranker, diversity and second forms, fusion, habit slot, stable lineage slots |
| `shared_english.py` / `semantic.py` | Modified Kneser-Ney trigram view, grammar view, semantic class model |
| `jsutil.py` | ECMAScript semantics the ranking depends on: whitespace set, end-of-input `$`, UTF-16 slicing and ordering, `Number('')` |
| `policy.py` | Reference content policy, plus GazeConnect guardrails and English-only display |
| `learning.py` | Committed-use learning state, migration, undo and reset |
| `worker.py` | Pure request → response function (worker process, thread or inline) |
| `service.py` | Scheduling, lineage, household context and execution isolation |
| `facade.py` | The backend surface the legacy engine used to provide (abbreviations, Settings word list, caregiver words) |

### WebSocket messages

The existing envelope is unchanged: `type`, fields and `request_id`.

**`get_predictions`** request:

| Field | Meaning |
|---|---|
| `text` | The draft |
| `request_id` | Echoed back unchanged |
| `slot_count` | Defaults to 10; 5 gives the reference five-slot board |
| `reset_lineage` | Sent on keyboard open and navigation, so no slot positions carry over |

**`predictions`** response:

| Field | Meaning |
|---|---|
| `words` | Ranked candidates, `[{word, score, source: 'deterministic'}]`, for existing consumers |
| `word_slots` | Ten presentation slots in fixed positions; `null` marks a deliberately empty slot |
| `sentences` | Phrase suggestions, each `{text, score, source, mode, token?}`, independent of `word_slots` |
| `request_id` | Copied from the request |
| `prediction` | `{engine, text, prefix, slot_count, lineage}` |

Phrase suggestion `mode` values:
- `replace_token`: an abbreviation expansion that replaces the typed shortcut `token`.
- `complete_or_append`: a sentence that completes the draft when it starts with it, and is otherwise appended.
- `append`: a starter.

Other messages:
- **`set_prediction_context`** sends `{phrases, words}`, the household context, and is answered with `prediction_context_set` `{phrases, words}` counts. The renderer (`src/utils/predictionContext.ts`) sends it on connect and whenever the caregiver's configuration changes:
  - `phrases` (up to 2,000): enabled board phrases. The engine uses them as `phraseTexts`.
  - `words` (up to 200): People names and single-word Quick and Core Words. The engine uses them as caregiver `contentItems`.
- **`learn_word`** gains `text_before` and `text_after` (see Learning).
- **`undo_word_learning`** `{text_before, text_after}` is sent by Delete Word.
- **`reset_word_learning`** is answered with `word_learning_reset`.

On an engine error the backend still answers. It sends ten `null` slots, never the previous draft's words, together with the phrase suggestions, and logs the error.

## Ten-slot keyboard

### Layout

| Row | Contents |
|---|---|
| Top | Word slots 1–5, then the **phrase cell** (one short sentence suggestion or abbreviation expansion) |
| Letters, actions | Unchanged, including Word delete, SPACE, 123, Quick Words and the gaze toggle when navigation is hidden |
| Bottom | Word slots 6–10, then **SHOW NAV** while navigation is hidden. With navigation shown, the five slots use the full width and the global navigation bar sits below |

**Why this treatment of sentence suggestions.** The previous keyboard (`c19bada`) had four word slots. It showed the sentence suggestion only with navigation hidden, where the sentence replaced the lower row, and showed none with navigation visible. The new layout gives the phrase cell its own fixed position at the end of the top row:
- It is always reachable, with navigation hidden or shown.
- It never takes a word slot, and word slots never move to make room for it.
- It can't be confused with a word: separate styling, and wider.

Alternatives were rejected:
- Replacing slot 10 when a sentence exists would silently remove a word.
- A third suggestion row would shrink letter keys below comfortable sizes at 768 px height.
- Showing sentences only on demand would add a navigation step.

### Slot behaviour

- **Positions come from the backend.** `presentWordSlots` keeps them. A slot is `null` rather than padded; it would otherwise hold a duplicate, a multi-word item or a word that doesn't complete the typed prefix.
- **Empty slots stay in place, disabled and dimmed.** Nothing shifts.
- **Stale guard.** Slots are selectable only for the exact draft they were computed for (`prediction.text === draft`). They dim after 300 ms, so a normal round trip does not flicker.
- **Reconnects.** While the backend is disconnected, nothing is requested. On reconnect, the keyboard requests the current draft again on a fresh board, because a restarted backend has no lineage. This was verified by stopping and restarting the backend mid-word.
- **Dwell never carries over.** Each slot button is keyed `index:word`, so a changed word is a new element with fresh dwell progress, whether selected by mouse or gaze. `GazeCursor` tracks element identity and checks `isConnected`.
- **One insertion path.** Mouse, keyboard and gaze all call the same handler.
  - The handler rechecks freshness and prefix fit against the current text.
  - It inserts exactly `acceptPredictedWord(draft, word)`: replace the unfinished word, then one space.
  - The renderer's insertion is checked against the engine's on the same reference-generated cases (`insertion_contract.v1.json`).
- **Dwell timing.** Word slots and the phrase cell use the same `predictionButton` category as before (Words/suggestions, 1000 ms). Dwell groups are unchanged (500/1000/1250/1500/2000 ms) and `check:dwell-groups` passes.
- **Word label size.** Labels auto-fit using the slot's own width (`100cqw`), capped at `clamp(34px, 3.6vw, 52px)`.
- **Zone Board.** It keeps six slots. Small integration fixes:
  - backend order is preserved (no re-sort by score);
  - fallback words appear only when they complete the prefix;
  - unused cells are non-interactive placeholders;
  - punctuation is a word boundary. The previous version replaced `Hi,wa` → `water`, losing `Hi,`.

### Request storm fix (pre-existing bug)

The previous version (`c19bada`) re-requested predictions about 330 times a second while the keyboard was open, because `getPredictions` changed identity on every render. The hooks are now stable callbacks, and the keyboard requests once per distinct draft. Measured result: one request on open, none while idle, one per keystroke.

### Measured geometry

Measured in-browser on the live app with the real engine, with the draft "i need wa". Entries are the smallest width and smallest height across all interactive keyboard targets (px). Every case had 10 filled slots, no overlaps, no page scroll and no target under 80 px.

| Viewport | Theme | Nav hidden | Nav visible |
|---|---|---|---|
| 1920×1080 | Dark | 173 / 108 | 151 / 103 |
| 1920×1080 | Warm | 173 / 106 | 151 / 101 |
| 1536×864 (1920×1080 at 125 %) | Dark | 121 / 96 | 121 / 84 |
| 1366×768 | Dark | 107 / 96 | 90 / 84 |
| 1366×768 | Warm | 107 / 94 | 90 / 82 |
| 1024×768 | Dark | 95 / 96 | 90 / 84 |
| 1280×720 (below the 768 px floor) | Dark | 107 / 88 | 84 / 80 |

- **1920×1080, navigation visible:** top slots are 288×111, bottom slots 371×101 and letter keys 183×127. Previously they were 183×162; that height went to the second slot row.
- **1366×768, navigation hidden:** top slots 202×112, bottom slots 225×96, phrase cell 294×112, letter keys 128×98.
- **Previews:** Warm and Dark, both navigation states, at 1366×768, 1920×1080, 1024×768 and 1536×864 at 1.25× DPR. They were captured with headless Chrome against the running app and the real engine, delivered with this change, and not committed.

## Port: mapping, assets and intentional differences

The reference is pinned in `tools/prediction/reference_pin.json`: commit `de33a958…`, with the SHA-256 of seven sources. The runtime never reads the reference repository.

| Reference (`src/spell/…` at `de33a95`) | Destination |
|---|---|
| `predictionService.ts` (`buildPredictionSnapshot`, ranking, diversity, fusion, habit slot, `stabilizeCandidateSlots`, `acceptPredictedWord`, `currentPrefix`) | `engine.py` |
| `sharedEnglishModel.ts` | `shared_english.py` |
| `semanticModel.ts` | `semantic.py` |
| `personalContinuations.ts` | `personal_continuations.py` |
| `communicationContentPolicy.ts`, `data/vocabulary/predictionSafety.v1.ts` | `policy.py` (`ReferenceWordPolicy`), with word lists in `engine_tables` |
| `placeContext.ts` | Place tables in `engine_tables` |
| `spellTypes.ts` | Snapshot and lineage dataclasses in `engine.py` |
| Session store bounds (`boundAcceptedWords…`) | `learning.py` |
| `data/vocabulary/*` | `assets/*.v1.json` (below) |

The assets are generated by `tools/prediction/export_reference_tables.mjs`, which evaluates the pinned TypeScript and exports its tables. `--check` proves the output is byte-identical. Output goes to `python/services/deterministic_prediction/assets/`, and `manifest.json` records source and asset hashes, with no timestamps.

| Asset | Contents | Size |
|---|---|---:|
| `index.v1.json` | Lexicon index computed by the reference code: entries, lemmas, prefix buckets, bigrams, AAC bigrams, parts of speech, protected care, urgent transitions, fallback unigram | 1.55 MB |
| `context_priors.v1.json` | Dialogue-corpus successor lists (bigram/trigram) | 1.79 MB |
| `distilled_continuations.v1.json` | ImagineVille-distilled continuation rows | 4.78 MB |
| `shared_english.v1.json` | Shared English MKN trigram and grammar model, packed shards | 0.91 MB |
| `semantic.v1.json` | Semantic class model | 0.24 MB |
| `engine_tables.v1.json` | Curated tiers, ranker weights, policy lists, grammar and place tables, and all 57 numeric constants | 0.04 MB |

**Intentional differences** (`engine.DIFFERENCES`):
1. **Statistics cache key.** The cache is keyed by (context history, distilled-row key), not history alone. The reference could reuse a wh-frame distilled value for a longer clause that shares its last three words, so its answer depended on request order. The parity oracle uses a cold cache per case, so fixtures compare the order-independent result.
2. **Saved-content and governed-phrase ranking is not ported.** GazeConnect keeps its own sentence suggestions, in the phrase cell, as a separate feature.
3. **The lexicon index is loaded, not rebuilt.** The pinned reference code computes it at export time.

**Not imported:**
- The GRU challenger and its training scripts.
- The SmolLM/neural student and other experimental assets.
- The Expo/React Native app.
- Raw private messages, patient profiles and evaluation dumps.
- The reference's untracked working-tree files (for example `contextualWordModel.ts`).

**Ten-slot composition.** The reference's own ten-slot selection reorders or replaces the five-slot board for 3.0–6.6 % of drafts; the reference does not preserve the first five. GazeConnect composes ten slots as "anchored":
- slots 1–5 are exactly the five-slot board;
- slots 6–10 are the ten-slot request's remaining words, in order.

Top-10 hit rates equal the raw composition on every set, or are 0.001 higher (held-out AAC 0.687 vs 0.687; second independent 0.531 vs 0.530; see [evaluation.md](evaluation.md)). Preserving the first five costs nothing.

## Parity and determinism evidence

- **Stage-level parity** (`tools/prediction/parity.py` against the Node-bundled oracle) at `de33a95`:
  - 854 full-diagnostic cases, comparing every stage and every feature value to 1e-9 relative;
  - 54,642 position drafts;
  - 9,284 personalised comparisons (accepted words, recency, board phrases, caregiver items, continuations);
  - 2,655 lineage steps;
  - **0 mismatches** in every suite.
- **Neutrality at the later reference commit `c11e4ae`:** 10,138 comparisons, 0 mismatches.
- **Hashing and Python version:** 0 mismatches with `PYTHONHASHSEED` 0, 12345 and random, and with Python 3.14.
- **Committed fixture** (`python/tests/fixtures/deterministic_prediction/parity_v1.json`, 1.4 MB): a stratified 3,113 cases / 6,728 comparisons, replayed by the Python suite without Node or the reference. It was regenerated here with 0 mismatches.
- **Order and instance independence:** fresh engines evaluating drafts in forward and reverse order produce identical slots (`test_deterministic_engine.py`).
- **Imports:** runtime modules import no clock, random, network or model modules. A fresh worker loads no `onnxruntime`, `numpy`, `requests`, `http`, `socket` or `random` (asserted by a test).

## Content policy, guardrails and English-only display

The layers apply in order, and none relaxes a stricter one:

1. **Reference policy** (`ReferenceWordPolicy`, exact port):
   - never-suggested words are never offered;
   - clinical/safeguarding and personal-expression words are context-gated: two typed letters, one letter when locally personalised, or clinical words in a sensitive context.
2. **GazeConnect guardrails** (`python/prediction_guardrails.py`, enforced in word slots and phrase suggestions).
   - All existing coverage is kept.
   - Added with this change: the **68 lexicon inflections of already-blocked words**, bringing the list from 158 to 226 tokens. The larger lexicon made forms such as `kills`, `killer`, `died`, `idiots` and `stupidity` reachable.
   - A test fails if a blocked word gains an unblocked form in the lexicon, using the pinned lemma table plus -s/-ed/-ing/-er forms.
   - None of the 905 existing phrase, template and abbreviation texts contain the added forms.
3. **English-only display** (`english_only_policy.v1.json`, built by `tools/prediction/build_english_only_policy.py`):
   - 454 romanized Hindi/Hinglish tokens are withheld from word slots and phrase suggestions.
   - Sources: the legacy Hinglish vocabulary, Hinglish abbreviation expansions, scaffold rows and time-of-day sets.
   - Excluded from the list: the English lexicon, every word on this household's boards, and reviewed allowlists (place names, English homographs such as `pet`, `mat`, `papa`, and Indian English terms such as `paneer`, `roti`, `didi`).
   - The rule is not a blanket ASCII heuristic. Devanagari cannot reach a word slot at all, since the engine admits only a–z and apostrophes.
   - Stored history is never deleted. A withheld word can still be typed letter by letter.

### Guardrail conflicts with symptom and safeguarding language

The reference treats the words below as ordinary vocabulary, and several are clinically meaningful. GazeConnect keeps blocking them from **suggestions**; they can always be typed.

| Words blocked here, offered by the reference | Why it matters | Example the reference would complete |
|---|---|---|
| `hit`, `kick`, `kicked`, `kicking`, `punch`, `punched`, `slap`, `slapped`, `attack` | Safeguarding (reporting abuse) and medical (`heart attack`) | "she h" → `hit` |
| `depressed`, `suicide`, `suicidal`, `overwhelmed`, `tense`, `terrified`, `embarrassed` | Mood and symptom reporting | "i feel depre" → `depressed` |
| `empty`, `fat` | Symptoms ("my stomach is empty") and diet | "my stomach is " → `empty` |
| `die`, `dying`, `death`, `dead`, `shot` | Grief and end-of-life conversation, vaccinations | – |
| `supplies` | Ordinary caregiving word blocked by a household-specific rule | "we need more sup" → `supplies` |
| New inflections: `attacks`, `died`, `deaths`, `shots`, `hits`, `killer`, `fats`, and 61 more | Same trade-off, now covering every form | – |

This preserves GazeConnect's existing protection decisions. Revisiting them is a clinical and product decision for the caregiver team, not a code default. The list lives in one file, and `test_deterministic_policy.py` pins the conflict set.

## Learning and persistence

Learning comes only from committed actions:

| Action | Effect |
|---|---|
| Accepted word slot | +1 for that word, with `text_before`/`text_after` recorded for exact undo |
| Spoken message | +1 for each word |
| Quick Word, or Zone Board Space after a typed word | +1 |
| Displaying, hovering or dwell progress | Nothing |

- **Storage:** `data/patient_data/deterministic_prediction_state.v1.json` (schema 1). Saves are atomic (temporary file, then replace) and a failed save retries on the next save.
- **Bounds:** 1,000 words, counts capped at 10,000, 512 continuation events.
- **Recency:** a persisted commit sequence number, never the clock.
- **Migration:** versioned, non-destructive and one-time.
  - It reads the legacy `custom_dictionary.json` (counts and recent order) and `patient_data/recency_scores.json` (relative recency), from the data directory and the legacy engine's working-directory `./data`.
  - Legacy files are never modified, so rollback keeps its own history.
  - Source file hashes are recorded in the state file.
  - An unreadable state file is renamed `*.unreadable.json` and rebuilt.
- **Undo:** Delete Word sends `undo_word_learning`. A journal of recent acceptances removes exactly the words that were deleted, restoring previous counts and recency; a new word returns to absent.
- **Reset:** `reset_word_learning` forgets learned words and never touches legacy files.
- **Personal continuations:** ported but **off by default** (`continuations_enabled=False`), because the reference treats them as opt-in.
- **Determinism:** each request carries the state snapshot, so a result depends only on its inputs.

## Execution and performance

- **Isolation.** The engine runs in a single spawned worker process: `ProcessPoolExecutor(max_workers=1)`, with an initializer that loads and warms the tables. Prediction therefore never blocks the asyncio gaze loop and never adds GC pauses to it. `thread` and `inline` modes exist for tests and constrained fallbacks.
- **Scheduling.** Latest-only per client: at most one request computing and one waiting. Superseded requests are dropped, and a result that arrives after a newer request is discarded rather than sent.
- **Lineage.** A slot position persists only while the same unfinished word grows after an unchanged confirmed text. Any deletion, finished word, changed context, navigation (`reset_lineage`) or disconnect starts a fresh board. Only delivered snapshots enter the lineage chain.
- **Disconnects.** Lineage and in-flight work for the client are dropped, work queued behind a closed connection is not computed, and nothing is sent to a closed connection.
- **Worker crash.** A request that hits a dead worker is answered on a thread, and the next request respawns the worker (`BrokenProcessPool` recovery is tested).
- **Worker lifetime.** Electron stops the backend with a hard kill (TerminateProcess on Windows), which skips executor shutdown. Before this fix, the worker was measured surviving as an orphan. The worker now watches its parent's sentinel and exits within about 200 ms. This is tested with a real hard kill.
- **Garbage collection.** After warm-up, the worker exempts its static tables from collection (`gc.freeze()`), so full collections no longer pause a request.

### Gaze-loop contention

`tools/prediction/gaze_contention_bench.py` ran a synthetic 66 Hz task on the backend's event loop while typing sentences on a Mac with Python 3.11. Values are the task's wake-up lateness in ms.

| Keystroke interval | Idle p99 / max | Legacy inline p99 / max | Deterministic inline p99 / max | Thread p99 / max | **Process** p99 / max |
|---|---|---|---|---|---|
| 150 ms | 1.16 / 1.49 | 11.16 / 26.27 (2.64 % of frames > 5 ms) | 4.18 / 8.12 | 3.75 / 24.70 | **2.18 / 2.32** (0 % > 5 ms) |
| 500 ms | 2.18 / 3.14 | 2.20 / 15.72 | 2.15 / 7.08 | 2.16 / 7.08 | **2.15 / 2.26** |
| 50 ms | 2.22 / 2.32 | 11.49 / 22.80 (4.71 % > 5 ms) | 5.32 / 7.35 | 5.73 / 7.07 | **1.20 / 1.99** |

With Python 3.14 at 150 ms, process mode measured 1.25 / 2.30. Prediction round trips through the worker under this load were p50 4.3 ms and p99 10.1 ms.

### Runtime measurements

`tools/prediction/measure_runtime.py`, on a Mac with Python 3.11, three fresh-process runs:

| Measure | Value |
|---|---|
| Inline load, then warm-up (5 drafts) | 83 ms (load 55 ms, warm-up 19 ms) |
| Worker cold start, from `service.start()` to the first delivered answer (spawn, load, warm-up, GC freeze) | 147–153 ms |
| Warm compute (inline, 2,000 requests) | p50 0.93–0.95 ms, p95 3.3 ms, p99 3.4 ms, max 3.5 ms |
| Warm round trip through the worker (2,000 requests) | p50 1.11–1.13 ms, p95 3.4–3.5 ms, p99 3.6 ms, max 3.8–4.3 ms |
| Worker process RSS | 102–104 MB (parsed tables); the backend process is unchanged |
| Legacy engine without ONNX, for comparison | +10 MB and 27 ms init in the backend process; with onnxruntime it is larger |
| Shipped assets | 16 files, 8.91 MB raw, 2.29 MB deflated (installer estimate); code 146 KB |

In the evaluation over about 23,600 distinct drafts, per-call compute was p50 1.15 ms, p95 2.9 ms and p99 3.5 ms. It ran all three engines in one process, where full garbage collections over the parsed tables caused occasional pauses (85 ms once). The worker now exempts its static tables from collection after warm-up (`gc.freeze()`). Over 5,251 drafts, that reduced the worst call from 12.0 ms to 4.8 ms, with p50 unchanged.

In development (`python main.py`), the spawned worker re-imports `main.py`'s module-level imports; this is standard `spawn` behaviour. The frozen Windows backend does not re-import it (`multiprocessing.freeze_support()` in `backend_entry.py`).

## Evaluation summary

`python tools/prediction/evaluate.py` produced [evaluation.md](evaluation.md) and `evaluation.v1.json`, running every word of every sentence after 0, 1 and 2 typed letters. Development and held-out sets are never mixed. The legacy baseline ran through the real rollback path **without its ONNX reranker**, which was not installed on the evaluation machine.

| Set (queries) | Legacy top-5 | Deterministic top-5 | Production top-10 | Legacy KSR @4 → production @10 |
|---|---:|---:|---:|---:|
| Development evalSentences (3,888) | 0.369 | 0.622 | 0.690 | 0.429 → 0.631 |
| **Held-out** AAC test, Vertanen & Kristensson (12,556) | 0.364 | 0.608 | 0.678 | 0.374 → 0.589 |
| **Held-out** independent Tatoeba (5,590) | 0.307 | 0.590 | 0.668 | 0.354 → 0.601 |
| **Held-out** second independent (5,615) | 0.244 | 0.464 | 0.522 | 0.312 → 0.545 |
| In-domain household phrases (1,676) | 0.502 | 0.575 | 0.796 | 0.543 → 0.710 |

- **Slot quality:** prefix compatibility is 1.000 and duplicates are 0 for the new engine. Legacy was 0.993–1.000 prefix-compatible. Under-filled boards fell from 7–18 % to at most 1 %.
- **Care vocabulary** (protected care plus clinical/safeguarding targets): legacy with 4 visible slots versus production with 10.
  - Held-out AAC: 7 regressions and 118 improvements among 531 care queries.
  - In-domain: 14 regressions and 187 improvements among 534.
  - At equal 5 slots: 28 vs 86 held-out, 43 vs 165 in-domain.
  - Regression examples are listed in `evaluation.v1.json`.
- **Phrase cell** (configured phrases): top-1 is 0.118, versus 0.121 for legacy without neural continuation. "Any suggestion" rises from 0.172 to 0.196. It is unchanged in substance; see follow-ups.
- **In-domain caveat:** the production engine sees household phrases as board phrases, so its in-domain numbers measure recall of configured phrases, not generalisation.

## Provenance and licences

The licence notices ship inside the backend bundle (`…/assets/licenses/`) and are hashed in the manifest.

| Data | Source and licence | Obligations |
|---|---|---|
| Lexicon, lemmas, spoken-core tags | NGSL 1.2 and NGSL-Spoken 1.2 (Browne, Culligan, Phillips), **CC BY-SA 4.0** | Attribution and ShareAlike for the adapted *data* (not the application code) |
| Frequency counts and bigram edges | SymSpell frequency dictionaries (Wolf Garbe), **MIT** | Keep the notice |
| AAC context edges | Vertanen & Kristensson (EMNLP 2011) AAC corpus, **CC BY 4.0**. The two excluded test files (`lm_test_switch/comm`) are never read | Attribution |
| Distilled continuations and fallback unigram prior | ImagineVille Dec 2019 AAC LMs (Vertanen, Memmi, Emge, Reyal, Kristensson), **CC BY 4.0**. Frozen tables only; no model ships | Attribution, and state the changes made |
| Context priors | Taskmaster-1/2, PRESTO and MASSIVE 1.1 (CC BY 4.0) and further dialogue corpora (CC BY / MIT / CC BY 2.0 FR). Only a derived aggregate ships, with no utterances. Schema-Guided Dialogue (CC BY-SA) is excluded | Attribution per `CONTEXT_PRIORS_LICENSE.md` |
| Shared English MKN, grammar and semantic model | Exported from reviewed teaching text, 123 consented general messages from one AAC user (the repository owner's own), LLM-authored training expansion and project teaching sentences. No raw text or identifiers were exported | See below |
| Curated tiers, protected care, policy lists, Indian English overrides | GazeCompass first-party curation | – |
| WordNet | The reference records the licence, but no WordNet-derived table ships there or here | – |

**Shared English release status.**
- The exported provenance record (`licenses/sharedEnglishProvenance.v1.json`) still carries the upstream flag `releaseAllowed: false`.
- The owner (the repository author) determined on 2026-09-07 that the private messages behind it are their own, and cleared the store-release block in the reference source headers (GazeCompass commit `2173e15`).
- `classMapStatus`, whether the LLM-authored semantic class map has been human-reviewed, is **not** cleared upstream. Treat it as an open quality item, not a licence item.

**Before distribution,** the release notices file (`thirdPartyNoticesPath` in `docs/windows-release-audit.md`) must credit the sources above. This includes the ImagineVille models and the context-prior corpora, which the reference credits in its in-app notices screen.

## Packaging and CI

- **`scripts/windows/Build-Installer.ps1`** adds:
  - `--add-data` for `services/deterministic_prediction/assets` and `english_only_policy.v1.json`;
  - `--hidden-import services.deterministic_prediction.worker`.
  - The legacy ONNX assets stay bundled, so rollback works in installed builds.
- **`scripts/windows/backend_entry.py`:**
  - calls `multiprocessing.freeze_support()`, so a spawned worker re-entering the frozen exe does not start a second backend;
  - `--self-test` now also verifies the asset hashes and answers one request inline and one through a spawned worker, requiring identical slots.
- **`scripts/verify_windows_bundle.py`** verifies every prediction asset and licence file against the manifest hashes, plus the English-only policy, in `source`, `stage` and `packaged` modes. Failure-injection tests cover missing, tampered and policy-less bundles (12 tests).
- **`.github/workflows/windows-validation.yml`** runs `check-word-prediction-slots.cjs` and the Python prediction suites on the Windows runner. That runner exercises `spawn` on the target OS.

## Commands

```bash
# Python (from the repository root)
python -m unittest discover -s python/tests -p "test_deterministic_*.py"   # parity replay, contracts, policy, learning, service
python -m unittest discover -s python/tests -p "test_prediction_pipeline.py"
python scripts/windows/test_verify_windows_bundle.py
python scripts/verify_windows_bundle.py source --root .

# Frontend
npm run check:word-slots          # insertion contracts, ten-slot presentation, household context, Zone Board
npm run check:dwell-groups && npm run check:gaze-safety && npm run check:browser-gaze-safety && npm run check:browser-cursor
npm run build && npm run build:electron

# Development tooling (needs Node and, for parity, a local GazeCompass clone)
node tools/prediction/export_reference_tables.mjs --reference <clone> --check
python tools/prediction/parity.py --reference <clone> [--suite core|positions|personal|lineage] [--full-diagnostics]
python tools/prediction/parity.py --reference <clone> --write-fixture
python tools/prediction/evaluate.py --out docs/deterministic-prediction/evaluation.v1.json --markdown docs/deterministic-prediction/evaluation.md
python tools/prediction/measure_runtime.py
python tools/prediction/gaze_contention_bench.py --seconds 15 --interval-ms 150
python tools/prediction/build_english_only_policy.py --check
```

## Rollback

- **To switch:** `python main.py --prediction-engine legacy`, or set `GAZECONNECT_PREDICTION_ENGINE=legacy` for the backend process.
- **What it restores:** the previous engine, its sentence path (including neural continuation when onnxruntime is present) and its own learned files, which the new engine only ever read.
- **Frontend:** the renderer works with both engines. Without `word_slots` it falls back to the ranked list; the ten-slot filters still drop duplicates and words that don't fit the prefix.
- **Execution mode:** `--prediction-execution thread` or `inline` (or `GAZECONNECT_PREDICTION_EXECUTION`) is available if a platform cannot spawn the worker.

## Known limitations and follow-ups

- **Board phrases give only a modest lift inside word slots.** This is the reference design: the phrase-word boost is capped. For example, "breathing d" does not offer `discomfort`, although "Breathing discomfort" is a configured phrase. The reference offered saved phrases through its phrase ranking, which was not ported.
  - Recommended follow-up: offer configured board phrases in the phrase cell. Today its top-1 hit rate on configured phrases is 0.118.
- **One habit slot.** The reference reserves a single slot for the best personal or caregiver word. With the default configuration, "call pa" does not show `parakh`, because `pain`, also a configured word, takes the habit slot.
  - `parakh` appears after "call par". After one accepted use it ranks second for "call pa".
  - Other names appear after one or two letters.
- **The habit slot can repeat the word just accepted.** After accepting `water` in "i need wa", the next board ("i need water ") shows `water` in slot 5, because it is the strongest learned word. The pinned reference does exactly the same (verified against the oracle).
- **Personal continuations** are off by default. Enabling them needs a caregiver-facing control, which this change does not add.
- **Legacy baseline:** measured without the ONNX reranker, so its Windows quality may be slightly higher than reported here.
- **Worker memory:** about 100 MB for parsed tables, in a separate process. A compact in-memory table format could reduce it.
- **`npm run lint`:** the repository has no ESLint configuration, so it also fails on `c19bada`. `tsc` passes.

## Remaining Windows and Tobii hardware checks

These were not possible on the development Mac.

1. Build the installer on Windows and run `GazeConnectBackend.exe --self-test` both staged and from `win-unpacked`. Confirm that the deterministic block reports six assets and identical inline and worker slots.
2. In the installed app, confirm Task Manager shows a second `GazeConnectBackend.exe` (the prediction worker, about 100 MB) and that it exits when the app quits, crashes or is killed.
3. Measure the worker's cold start and first-keystroke latency on the target PC, both after a cold boot and after sleep/resume.
4. With Tobii Eye Tracker 5, type full sentences by gaze at 100 %, 125 % and 150 % scaling on 13″ to 27″ displays. Confirm:
   - all ten slots and the phrase cell are selectable with Words dwell (1000 ms);
   - a changed word never inherits dwell progress;
   - edge slots (1, 5, 6, 10) are reachable;
   - the "Connected" badge in the bottom-right corner does not interfere with SHOW NAV. The badge placement predates this change.
5. Record gaze-loop lateness on the Windows machine during fast typing, using `gaze_contention_bench.py` under Windows Python, and compare with the Mac table above.
6. Confirm the legacy history migration on a machine with real legacy data: the counts arrive, legacy files are unchanged, and Delete Word and reset behave as described.
7. Verify rollback (`GAZECONNECT_PREDICTION_ENGINE=legacy`) in the installed build, including the ONNX reranker.
8. Complete the release notices gate (see Provenance) before any distribution.
