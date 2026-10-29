# Literal phrase improvements — 29 October 2026

Implemented from the prediction review, with the message-display suggestion
feature and LLM work explicitly deferred. No word-ranker code, weights, model
assets, content filters, gaze processing, dwell sets or ordinary key rectangles
were changed. The existing local word engine remains the default.

Later the same day, the maintainer requested priority words on the top row.
`worker.keyboard_priority_slots` now keeps the current first five choices on
top and stabilizes positions within each row. This intentionally supersedes
the earlier whole-board slot-stability rule, while keeping scores and ranked
words unchanged. The phrase-only exact-slot baseline below predates this
additional request. The new paired replay has 61 deliberately changed slot
boards, zero changed rankings/scores, and zero row-priority violations (57
before), across the same 8,667 boards. See
`tools/prediction/reports/2026-10-29-priority-rows.json`.

## Behavior

- Literal completions match the active sentence, keep earlier sentences and
  confirmed wording/case/spacing, and remove completed phrases from the offer.
- A lone content keyword can retrieve a phrase, but the existing phrase cell
  says **Review phrase**. Selecting it opens an explicit replacement review;
  **Use phrase** applies the disclosed edit and **Keep typing** changes nothing.
  Multi-word drafts and negations never become keyword rewrites.
- Enabled configured phrases, spoken history and the existing care templates
  participate, together with 104 literal sentence starters adapted from the
  owner-reviewed GazeCompass inventory (`8078377`). No reference checkout is
  needed at runtime. Existing English-only and blocked-word rules still apply.
- Up to twelve distinct edits are returned. The existing top phrase cell prefers
  a short literal completion (six words / 42 characters), with **Add phrase**
  above it. Actual text fitting is measured after fonts load and on resize; if the full wording would be clipped, the cell opens the full chooser instead of inserting unseen text. A shorter keyword rewrite cannot displace a longer literal match.
- Longer alternatives are available through **Expand → Suggested phrases**.
  The chooser displays three full phrases per page. If no short inline choice
  fits, the phrase cell itself opens that chooser. The new control shares the
  existing expanded display's Close Display row; it reserves no new row.
- Five word slots remain above the letters and five below. Speak and Expand
  retain their ordinary positions. There is no automatic suggestion overlay
  on the message, no automatic insertion, and no automatic speech.
- In Settings → Phrases, each phrase has **Suggestion preferences**: offer while
  typing, comma-separated keywords, and preference among matching phrases.
  Full multi-word People names also get a literal call completion without entering the word-scoring inputs. These preferences affect phrase retrieval only. Saved board content and the word engine's
  configured text inputs remain unchanged. Existing Dictionary shortcuts work.

## Execution and learning

`services/phrase_prediction.py` runs in the existing single prediction worker,
behind the existing latest-only per-client gate. It receives bounded snapshots
of configuration/history. Phrase errors cannot remove a valid word board.
Caches are bounded and inputs are capped; no new model, process or dependency
was added. Windows packaging explicitly includes the new source modules, and
the frozen prediction self-test now compares word and phrase answers between
inline and spawned-worker execution.

Each edit carries `matched_text`, a UTF-16 `replacement_start` and `result_text`.
The renderer validates freshness, preserved text and prefix compatibility again.
A replacement requires explicit review. Changing targets, opening/closing the
chooser and paging use the existing navigation safeguards and timing groups.

Phrase acceptance learns only the newly accepted words, through the existing
bounded undo journal; Delete Word reverses those acceptances. Acceptance does
not create spoken-sentence history. Speak owns spoken-history learning, and the
keyboard and Zone Board no longer send a redundant second learning request.
Speaking learns once even when optional spoken-message transcript files are
disabled or cannot be written; transcript storage no longer controls learning.

## Verification and limits

The paired replay contains **8,667 word boards**, including growing-word
lineage, across fresh/configured/learned synthetic profiles and 180 sentences
from the existing shared evaluation sets. All ranked words, scores and slots
match the pre-change baseline exactly. This establishes regression protection
on those cases, not an improvement in general-language word accuracy.

On twenty synthetic configured-phrase probes (first and second sentences), the
intended phrase was available among the first four suggestions in **20/20**
versus **3/20** before. It was the inline first choice in **16/20** versus
**1/20**. These measure recall of supplied content, not unseen-message accuracy.
The underlying before/after cases are retained in the report; six additional
probes cover completed phrases, keyword edits and ordinary care completions.

Reports:

- `tools/prediction/reports/2026-10-29-word-regression.json`
- `tools/prediction/reports/2026-10-29-phrase-quality.json`
- `tools/prediction/reports/2026-10-29-phrase-contention.json`
- `tools/prediction/reports/2026-10-29-validation.json`
- `tools/prediction/reports/2026-10-29-priority-rows.json`

Automated checks include Python phrase/pipeline/learning/worker recovery tests,
the pinned deterministic parity fixture, cross-language edit/review/stale-response
contracts, TypeScript/build, dwell/gaze safety, browser phrase actions, and a
comparison against the tracked original UI. Browser profiles/data are isolated;
speech is intercepted or disabled. The chooser and review are checked at
1366×768 and 1920×1080, Focus/Serene, all three themes and both keyboard feels.

The existing keyboard audit passed 21,456 element comparisons across 144
keyboard states. The original-versus-updated comparison passed 2,208 target
comparisons across 24 combinations, with unchanged key/message/slot rectangles,
typography and dwell attributes. Browser checks establish UI behavior, not
physical Tobii accuracy or Windows speaker playback.
The real worker-to-keyboard WebSocket check also passed all twelve
width/design/theme combinations, including insertion and reconnects.
The production gaze target picker also selects the chooser/review controls at
nine interior points per target in every combination. Long-phrase visibility,
inline overflow fallback and caregiver preference save/reload are checked.
The standalone ESLint command could not run because this checkout has no
ESLint configuration; TypeScript, both builds and the listed checks passed.

No word-scoring update was shipped merely because a newer reference exists:
the review found only fractional gains, and this task prioritizes preserving
Papa's known word suggestions. Better committed-use evidence can personalize
words over time; it is not a measured universal accuracy increase. The existing
symptom/safeguarding filter trade-offs remain an explicit future content decision.

Windows/Python 3.13 packaging, native speech and patient trials on Papa's Tobii
rig still require validation there. In particular, assess phrase reading effort,
communication time, corrections and fatigue in short sessions before calling
this a patient-level speed improvement. No installer or release was produced.

The later Mac launch repair changes the port probe only on POSIX: recently
closed connections no longer falsely block a quick restart, and a live listener
is still refused. Windows retains its existing no-reuse probe. The Electron
error gives Mac recovery instructions while keeping the Windows instructions.
All eleven port-contract tests and the Electron build passed. The Mac app was
relaunched and its real backend answered read-only prediction requests,
including the maintenance screenshot draft; no speech or tracker trial was
performed by that check.

## Reproduce

```sh
python -m unittest discover -s python/tests -p 'test_deterministic_*.py'
python -m unittest discover -s python/tests -p 'test_*prediction*.py'
npm run check:word-slots
npm run check:phrase-suggestions
npm run check:dwell-groups
npm run check:gaze-safety
npm run typecheck
npm run build
```

Browser checks require an existing Playwright installation and a running Vite
server (`PLAYWRIGHT_MODULE`, `DESIGN_QA_URL`). `npm run check:phrase-ui` accepts
`PREDICTION_BASELINE_URL` for the original checkout and writes only isolated QA
artifacts. `scripts/check-design-predictions.cjs` additionally requires an
isolated real backend via `PREDICTION_QA_WS_URL` (never patient port 8765).
`PREDICTION_PYTHON` can select the interpreter for the cross-language/UI checks.

`tools/prediction/quality_replay.py --compare <report.json> --out <new-report.json>`
compares the word fingerprint with the retained summary. To investigate a future
ranker change per case, record a full baseline on the original source with
`--record <baseline.json>` first. Do not tune on these shared evaluation sets and
then describe them as a fresh held-out test.

For the later row-priority change, compare against a full original baseline with
`--allow-row-promotion --compare <baseline.json> --out <report.json>`. This mode
requires identical ranked words/scores and checks both row memberships; it
allows the requested presentation changes. Strict default comparison still
requires identical slots too.

`tools/prediction/gaze_contention_bench.py --worker-phrases --modes idle,process`
measures synthetic 66 Hz loop scheduling with bounded maximum-sized phrase
inputs. Its desktop timings do not establish Windows/Tobii performance.
