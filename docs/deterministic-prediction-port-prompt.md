# Implementation prompt: deterministic prediction and ten keyboard suggestions

Copy the prompt below into the coding task that will implement this work. This document is a handoff; creating it did not change the running predictor or keyboard.

---

You are implementing a carefully measured improvement to GazeConnect Pro, an offline Windows AAC application for people with ALS/MND who use Tobii Eye Tracker 5. Improve its existing prediction system using the working deterministic GazeCompass predictor as the reference. Implement the changes, test them, and show the resulting traditional keyboard. Do not stop after writing another plan.

## Repositories and branch

Destination repository on this Mac:
`/Users/rishabh/eye_tracking_projects/latest_gaze_connect_september/gazeconnect_v4`

Reference repository, read-only:
`/Users/rishabh/eye_tracking_projects/gazecompass_new/working_gaze_compass`

Stay on the existing destination branch:
`featuring/ui-design-windows-production-refinement`

Do not create or switch branches, reset existing work, commit, push, or modify the reference project. Preserve all unrelated changes. On Windows, use this branch's actual local clone directory; do not assume the Mac paths exist.

Read AGENTS.md and inspect current Git state first. The reference inspected on 19 September 2026 had HEAD `de33a95`, plus local edits to predictionService.ts/spellTypes.ts and an untracked contextualWordModel.ts experiment. Record the exact reference commit, relevant working-tree differences and source hashes before implementation. Distinguish the established deterministic behavior from experimental work. Do not import the optional GRU challenger or its training scripts. If the reference is unavailable, perform the destination baseline work and explain which source files are missing; do not claim to have replicated an engine you cannot inspect.

## Objective and boundaries

Make word suggestions more useful after both completed words and partial prefixes, with particular attention to care requests, food, comfort, family, everyday conversation and independent expression. Use deterministic local computation, bounded memory and stable ranking. Identical draft, committed learning state, phrase data, configuration and previous-snapshot lineage must produce identical results. No network, runtime LLM, stochastic generation or wall-clock-driven ranking is needed for this task.

Provide **ten simultaneously visible word-suggestion slots on the traditional keyboard**. Do not merely request ten backend predictions and continue rendering four. Show ten distinct, valid candidates when enough eligible candidates exist; keep unused slots disabled when fewer exist. Never pad the list with duplicates, wrong-prefix words or unsafe content.

Windows 10/11 x64 remains the deployment target. Preserve the working C# Tobii bridge, DLL loading, coordinate mapping, freshness checks, gaze arbitration and device reconnection. Prediction improvements cannot establish or guarantee physical tracking accuracy or zero latency.

Keep Warm and Dark, English-only output, the shared keyboard message display, existing board names, preset content and unrelated layouts. Do not add global emergency buttons, language controls or a new settings maze. Existing care phrases and the separate Alert Mode board remain. Hindi is a separate future task.

Keep the authoritative dwell groups unchanged: Typing 500ms, Words/suggestions 1000ms, Communication 1250ms, Navigation/choices 1500ms, Deliberate actions 2000ms. Prediction slots use the actual 1000ms selection logic. Preserve separate gaze onset/cooldown safeguards.

## Read the actual reference implementation

Start with these paths relative to the reference repository, following imports to their required data:

- `src/spell/predictionService.ts`: buildPredictionSnapshot, token/context extraction, candidate supply, ranking, diversity, fusion, habit reservation, stable slots and acceptance helpers.
- `src/spell/sharedEnglishModel.ts`: lazy packed-table lookup, modified Kneser–Ney trigram evidence and grammar views.
- `src/spell/semanticModel.ts`: deterministic class-based context evidence; this is not a runtime generative model.
- `src/spell/spellTypes.ts`: request, snapshot, slot and lineage contracts.
- `src/spell/personalContinuations.ts` and `personalContinuationStore.ts`: bounded committed-use learning and edit/undo behavior; experimental adaptation defaults off.
- `src/spell/placeContext.ts`, `phraseKeywords.ts`, `communicationContentPolicy.ts` and the imported vocabulary/phrase tables.
- Vocabulary tables for reviewed AAC contexts, general English, protected care words, contractions, POS/morphology, context priors, semantic classes, fallback unigram priors and frozen distilled continuations.

Read the relevant reference tests, especially predictionRanker, predictionServiceV2, predictionContextConditioning, predictionBoundaryRanking, predictionObservedContextDisplay, predictionContentSafety, predictionReviewHardening, predictionCorroboratedPrior, ngramSupplyOrder, grammarLegality, grammarMorphologyHardening, grammarSupplyAndHabitSlot, tailReranker, sentenceBoundary, personalContinuations and personalContinuationDrift. Use their exact filenames from the repository. Also inspect ten-slot consumers/tests; some comments still describe an older six-slot maximum.

The current reference has `MAX_WORD_CANDIDATES = 5`, `MAX_WORD_SLOTS = 10`, `CURATED_RANK_SLOTS = 5` and a bounded legal shortlist. Request `slotCount: 10`; do not change five-based scoring constants to ten. Validate the intended preservation of the first five results instead of relying on comments alone.

Preserve the actual mechanisms and their gates, rather than copying a few example phrases:

1. Separate the unfinished prefix from confirmed context. Respect sentence boundaries, punctuation, case and supported apostrophe-less contraction aliases.
2. Supply candidates from indexed vocabulary and context sources before ranking; distinguish missing candidates from poor ranking.
3. Retain the reference precedence of reviewed pairs, expanded/harvested pairs, reviewed words and other curated tiers. Curated evidence takes the strongest qualifying tier rather than summing repeated boosts.
4. Avoid letting generic one-word contexts such as determiners/prepositions override stronger preceding context. Preserve modal, question-frame and copula handling, plus explicit-prefix access to intentional spellings.
5. Preserve protected care/personal/exact-spelling candidates, bounded grammar penalties and the reference's context-gated content policy. Compare that policy with GazeConnect's guardrails; keep current protection coverage and explicitly document any conflict involving necessary symptom or safeguarding language.
6. Apply the reference's restricted tail reranker only where enabled. It reorders unprotected positions at zero/one-letter prefixes; it must not displace protected entries.
7. Preserve context-prior fusion gates, morphology diversity, supported second word forms and observed-context protection. Do not sacrifice the intended completion merely to make the list look diverse.
8. Preserve eligible slot positions only while extending the same word. Reset lineage on deletion, cursor edits, new words, sentence boundaries, replacement and navigation where appropriate.

## Integrate with GazeConnect's architecture

Inspect `python/services/word_prediction.py`, `python/services/sentence_prediction.py`, `python/main.py`, `python/prediction_guardrails.py`, `src/hooks/useWebSocket.tsx`, `src/screens/KeyboardScreen.tsx`, `src/screens/SpatialKeyboardScreen.tsx`, `src/utils/zoneBoardText.ts` and the existing prediction tests.

Prefer porting the pure deterministic algorithm and data to a modular Python service behind the existing backend prediction interface. This preserves the current Electron–WebSocket–Python architecture and avoids introducing another prediction server or a runtime Node bridge. Use the TypeScript reference as an executable oracle for parity fixtures. Preserve its ordering, tie-breaks, numerical formulas and state semantics; explain any intentional deviations. If inspection demonstrates a materially better pure TypeScript worker integration, document the tradeoff before implementing it and ensure one authoritative word predictor, not two competing ranking pipelines.

Make the deterministic model the production default. The current destination initializes an ONNX neural predictor and also supports neural sentence continuation and optional Datamuse enrichment. Ensure these do not silently influence the deterministic path or initialize unnecessarily. Preserve existing sentence suggestions and abbreviations as separate features with explicit contracts; do not merge full phrases into word-only slots accidentally. Keep legacy implementation only as a clearly isolated rollback mechanism if useful. Do not delete patient learning, custom words, shortcuts or saved phrase data.

Preserve compatibility with the existing prediction message envelope, request IDs and consumers. Extend it deliberately if stable slots or lineage need metadata. Do not let a later UI sort destroy stable slot positions. Distinguish ranked candidates from presentation slots. Ordinary word completion replaces only the current partial token and adds appropriate spacing; phrase insertion, abbreviations and sentence completion retain their separate correct semantics. Test them rather than routing every kind of suggestion through one word-replacement function.

Use cached prefix/context indexes and lazy table decoding. Compute only when text or relevant committed state changes, never in gaze callbacks. Bound queues/caches and discard stale responses after edits, clear, navigation or disconnect. If computation delays the Python asyncio gaze loop, isolate it using measured, bounded execution appropriate to CPU work; do not assume an async wrapper or thread automatically removes contention.

Learn only from intentional committed actions, never from displaying candidates, hovering or dwell progress. Preserve existing patient history with a versioned, non-destructive migration and local-only persistence. Keep cold-start output reproducible and learned-state tests explicit.

Enforce English-only suggestions across every active source, including retained sentence templates, abbreviation expansions, history and fallback paths. Existing source inventory documents identified retained Hindi/Hinglish prediction entries. Avoid deleting stored personal data; enforce display policy and document migration behavior. Do not reject legitimate English names or Indian English terms through a blanket ASCII or keyword heuristic.

## Ten-slot keyboard presentation

The inspected destination uses four top suggestions and up to four lower word suggestions when navigation is hidden; lower sentence buttons can replace that row. Implement ten real word slots end to end.

Prefer five large top slots and five large lower slots using the existing suggestion areas, with only the spacing adjustments needed to fit. Keep all ten available in the normal traditional-keyboard workflow; do not require hiding navigation to discover the other five. Preserve access to existing sentence suggestions without letting them consume or silently replace these ten word slots. Choose the least disruptive accessible treatment and explain it in the result.

Keep message display, letters, Space, Delete, Speak, Home, Zone Board, Quick Phrases, gaze toggle and fullscreen access usable. No overlapping controls or main-screen scrolling. Do not shrink targets to squeeze in ten columns. Every primary gaze target must remain at least 80 CSS pixels in each dimension; use responsive sizing and verify actual bounds at 1366×768 and 1920×1080, plus 1024×768 where supported and Windows display scaling. Check both themes and navigation/fullscreen states. If a compact configuration cannot fit, provide an explicit accessible layout adjustment rather than hiding required controls.

Changing a word under an active dwell must cancel/re-arm that target or retain the exact immutable word being selected. Never carry accumulated dwell time to a different candidate in the same slot. Mouse, keyboard and gaze selection must insert the same displayed value exactly once. Keep the Zone Board's six-slot presentation unless a small integration fix is needed; it should benefit from the same improved word backend without an unrelated redesign.

## Data provenance and packaging

Inspect data manifests, generators and notices before transferring tables. Some reference headers retain an old `release_allowed=false` warning but also contain a later owner release-clearance note dated 2026-09-07; inspected shared n-gram/semantic metadata says `releaseAllowed: true`. Reconcile and record the actual artifact-specific provenance rather than treating either isolated comment as definitive for every dataset. Preserve existing valid authorization; do not create an unnecessary approval loop.

Frozen distilled continuation tables cite ImagineVille and CC BY 4.0; carry required attribution and notices. Check the other imported vocabulary/corpus licenses individually. Copy only the runtime dependencies needed for parity. Do not copy raw private messages, patient profiles, evaluation dumps, the Expo/React Native app or experimental GRU assets. Keep generated tables reproducible and record source hashes/version metadata. If a particular artifact lacks sufficient provenance, continue with cleared assets and explicitly state the resulting parity limitation.

Include required assets in the Windows Python bundle and clean installed build. Runtime prediction must not depend on the reference folder, a Mac path, a training repository, network downloads or development tooling. Measure cold initialization, warm latency, memory and bundle-size changes before calling it lightweight.

## Verification and acceptance

Capture the destination baseline before editing and run a reference oracle against the exact pinned deterministic snapshot. Keep development examples separate from a held-out evaluation set; never train on the held-out prompts merely to pass them.

Test both zero-letter next-word prediction and one/two/three-letter completion, including:

- `i need wa`, `i am hu`, `check o`, `my back is hu`, `turn me `, `give me `.
- `have you se`, `i am waiting for your cal`, `i think i'll take a na`, `please stop mo`.
- `she can `, `may i `, `where are you `, `can ` and a sentence boundary after a previous care request.
- Care, food/diet, ordinary conversation, names, contractions, unseen prefixes and genuine unknown words; mixed punctuation, edits, deletion and restored drafts.

Use reference-derived expected results for parity, not guesses about what these examples should rank. Compare candidate supply, ranking, final slots and accepted text for five-slot and ten-slot requests. Report any mismatch with its first divergent stage. Same input/state must match across repeated runs and Python hash seeds. Include learned-state reset/undo cases and ensure learning does not swamp context.

Report top-1/top-5/top-10 recall, mean reciprocal rank, prefix compatibility, duplicate rate, coverage/underfilled slots, care-phrase regressions and keystroke or selection savings on the same frozen cases before/after. Separate phrase predictions from word predictions and report dataset sizes. Preserve the protected care regression suite and investigate material top-1/top-5 regressions rather than hiding them behind aggregate top-10 gains. Do not quote the reference project's benchmark percentages as measurements of this port.

Measure cold and warm p50/p95/p99 latency, startup time, cache/memory bounds and concurrency behavior during synthetic gaze traffic. Test stale/out-of-order responses and disconnect/reconnect without silently accepting old words. Timing measurements on a Mac are not Windows/Tobii hardware validation.

Run the relevant prediction tests, frontend/Electron builds, `npm run check:dwell-groups`, `npm run check:gaze-safety`, `npm run check:browser-gaze-safety` and `npm run check:browser-cursor`. Add focused tests for new ranking/integration behavior and ten-slot geometry. Run finite Windows script/bundle checks on Windows; record what remains untested if working on macOS. Never launch continuous gaze logging in the task: redirect runtime logs to files and inspect bounded excerpts.

## Deliverables

1. Implemented deterministic predictor, versioned runtime data and production wiring on the existing branch.
2. Ten visible, accessible traditional-keyboard word slots with Warm/Dark previews and verified selection behavior.
3. A concise source-to-destination mapping and provenance record, including excluded experimental components and intentional differences.
4. Reproducible parity fixtures, meaningful regression tests and a before/after evaluation report with limitations.
5. Windows packaging updates only where required, plus exact local test commands and a brief list of remaining hardware checks.

Work autonomously within this scope. Preserve the current application's strengths. Explain what is measured, what is changed, and what is still uncertain; do not promise perfect prediction or zero latency. Leave changes reviewable and do not commit or push unless asked.
