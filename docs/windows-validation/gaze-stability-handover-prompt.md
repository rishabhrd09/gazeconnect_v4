# Handover prompt — GazeConnect Pro gaze stability and accuracy

Paste everything below into the new session. It contains the task, the
non-negotiable constraints, the measurements already taken, the defects already
localised, and the mistakes already made so they are not repeated.

---

## 0. ROLE AND MISSION

Act as an expert eye-tracking engineer who reviews large codebases and builds
accessible Windows applications for people with ALS/MND.

Deliver an accurate, stable, calm, responsive and effortless **Tobii Eye Tracker 5**
experience on Windows 10 and Windows 11.

The user is the maintainer and is building this for his father, who has ALS. An
accidental selection costs real effort to undo. Treat unintended activation as a
safety problem, not a usability annoyance.

**Reassess the current tuning rather than assuming it is correct.** Previous
tuning was done without measuring the tracker's actual noise floor, and the
measurements in §4 show it is wrong by roughly a factor of five.

Proceed with investigation, implementation and verification. **Do not stop at a
plan.** Do not claim "zero latency" or "perfect accuracy"; measure, separate
hardware limits from application defects, and state remaining uncertainty.

---

## 1. THE USER'S ACTUAL REPORTED EXPERIENCE (primary evidence)

Verbatim, after using the app with the real tracker:

> "I was able to select gaze using my eyes and things were good enough but as I
> already told, there is still much flickering and some instability observed at
> each keyboard key — not as smooth an experience as OptiKey eye tracking.
> Also there were some kind of unstable experience of gaze, like gaze was
> juggling around different positions when trying to look at the corners or
> bottom close to the screen."

Three facts follow from this and must anchor the work:

1. **Gaze selection fundamentally works.** Do not rewrite the pipeline.
2. **Per-key flicker** during fixation on the traditional keyboard.
3. **Positional instability at screen edges/corners**, worst at the bottom.

OptiKey is the user's comparison point for smoothness. It is a reference for
*principles*, not a thing to copy.

---

## 2. REPOSITORY, BRANCH AND GROUND RULES

- Repo: `https://github.com/rishabhrd09/gazeconnect_v4.git`
- Branch: `featuring/ui-design-windows-production-refinement` — **stay on it**
- Commit validated: `e93a71b673e235bcc66c0c3cc66770a06f35b46b`
- Setup is complete; the tracker is attached.

**Do not** commit, push, reset, force-push, switch or create branches, or publish
an installer unless explicitly asked. Inspect `git status` first and preserve any
existing work.

Read before doing anything: `AGENTS.md` (authoritative), `README.md`,
`docs/windows-local-testing.md`, `docs/optikey-gaze-reference-review.md`,
`docs/eye-tracking-engineering-audit-2026-09-14.md`, and
`docs/windows-validation/windows-hardware-validation-2026-09-20.md` (the previous
session's full report).

> **Note:** `CLAUDE.md` is stale and contradicts `AGENTS.md` — it still claims
> Hindi bilingual UI, always-accessible emergency buttons and user-adjustable
> 1400–4000 ms dwell, and says .NET 6.0. **`AGENTS.md` wins.** Do not act on
> `CLAUDE.md`.

### Non-negotiable constraints

- Preserve existing screen names, phrases, board content, spatial layout and navigation.
- Warm and Dark themes only. English-only UI; no Hindi, no language toggles.
- No global emergency buttons. Keep existing care phrases and the separate Alert Mode board.
- Primary gaze targets stay at least **80 CSS pixels**. Main screens must fit the
  viewport without scrolling. Preserve the tested 1920×1080 layout and 1366×768.
- Preserve ten traditional-keyboard word slots plus the separate phrase cell, and
  Zone Board's five alphabet groups and six suggestions.
- Preserve shared message content across traditional keyboard, Zone Board and Quick Phrases.
- **Exactly these five selection durations** (`src/config/dwellTimeConfig.ts`):
  Typing 500 ms · Words/suggestions 1000 ms · Communication 1250 ms ·
  Navigation/choices 1500 ms · Deliberate actions 2000 ms.
- Onset, cooldown and tracking-loss safeguards stay **separate** from those durations.
- No per-button timing sliders, multipliers or repeat-key acceleration.
- **Do not shorten dwell to disguise transport or rendering latency.**
- **Do not remove validity checks, fixation safeguards or filtering** merely to
  make movement look faster.
- Do not change vendor DLLs or drivers speculatively.
- No cloud services, LLM/neural predictor, new network dependencies, or unrelated redesign.
- Do not silently fall back to the legacy prediction engine to mask a defect.

---

## 3. VERIFIED ENVIRONMENT (measured, do not re-derive)

| Item | Value |
| --- | --- |
| OS | Windows 11 Home Single Language, 10.0.26200 (build 26200), x64 |
| CPU / RAM | Intel i5-1135G7, 4C/8T · **7.7 GB RAM, only ~1 GB free** |
| Disk free | C: ~12 GB, D: ~9.5 GB |
| Display | **Single** 1920×1080 @ 60 Hz, Intel Iris Xe, **100 % scaling** |
| PowerShell | 5.1.26100.9444 (Desktop) |
| Node / npm | v24.13.0 x64 / 11.6.2 (repo baseline is Node 22) |
| Python | **PATH `python` is 3.9.5 — below the 3.10 floor.** venv uses 3.12.6 x64 |
| .NET SDK | 8.0.425 (installed during the previous session; 6.0.428 also present) |
| Tobii software | Tobii Experience 4.183.0.30025 |
| Tobii services | `Tobii Service`, `TobiiGeneric`, `TobiiIS5LEYETRACKER5` |
| Tracker | `USB\VID_2104&PID_0313`, Tobii AB, WinUSB driver 2.5.0.5602 |
| Ports | backend 8765 · helper TCP 5555 · Vite 5173 · floor-plan 5050 (lazy) |

**`setup.bat` needs Python 3.10+ but PATH resolves to 3.9.5.** Run it as:

```powershell
$env:PATH = "C:\Users\ABC\AppData\Local\Programs\Python\Python312;C:\Users\ABC\AppData\Local\Programs\Python\Python312\Scripts;$env:PATH"; .\setup.bat
```

`start-dev.bat` does **not** need this — it uses the venv interpreter directly.

Single display at 100 % scaling means **125 %/150 % and multi-monitor cannot be
tested here.** Do not claim otherwise.

---

## 4. MEASUREMENTS ALREADY TAKEN ON THE REAL TRACKER

Calibrated session, 1920×1080, 100 % scaling. Six-point harness; first 1.2 s per
point discarded as saccade/settle; 93 valid samples per point.

### 4.1 Accuracy

| Point | Error (px) | Euclidean (px) | Sample spread σ (px) |
| --- | --- | ---: | --- |
| Centre | (−10.3, −12.7) | **16.4** | (5.6, **12.9**) |
| Centre (repeat) | (−15.0, −21.4) | **26.1** | (4.9, 12.1) |
| Top-left | (−39.0, −35.5) | 52.8 | (14.1, 9.4) |
| Top-right | (−24.4, +26.9) | 36.3 | (10.6, 17.5) |
| Bottom-right | (+37.9, −13.4) | 40.2 | (10.3, 8.3) |
| Bottom-left | (−106.5, −19.7) | **108.3** | (17.6, 9.3) |

Median error **38.2 px**, worst **108.3 px** (bottom-left). Centre accuracy is
repeatable. **Effective rate 33 Hz**, 100 % valid while looking at the screen.

**At both bottom corners some samples fell outside the normalised 0–1 range**
(bottom-left median x was `−0.0242`). This is the key to symptom 3 — see §5.2.

### 4.2 Tracking loss, unplug, reconnect (all verified working)

- No eyes → helper emits `is_valid:false`, `confidence:0.0`,
  `validity_source:"timeout"` after a 150 ms silence timeout, increments
  `tracking_epoch`, and never re-emits a stale queued measurement.
- Physical cable unplug → helper process survived, emitted invalid samples only,
  **never a stale valid sample**.
- Physical replug → gaze recovered in **≈3 s** with no restart of helper, backend
  or app. Per-second timeline: `x..V..VV.VVVVVVVVVVVV...`
- No silent switch to mouse gaze; simulation only via explicit `--simulate`.

### 4.3 Prediction round-trip (loopback WebSocket, `perf_counter`)

Cold **9.1 ms**; warm n=120 → min 5.7, median **15.2**, p95 34.2, p99 37.2, max 39.5 ms.
Measured with ~1.2 GB RAM free, so treat as an upper bound. A 4-request burst
produced exactly **one** reply, for the last request (stale suppression works).
Engine `gazecompass-de33a95-port-1` is active by default; worker is a separate process.

> Note: an earlier attempt using the asyncio loop clock was discarded — Windows
> quantised it to ~15.6 ms. Use `time.perf_counter()`.

---

## 5. DEFECTS ALREADY LOCALISED — START HERE

These are evidence-backed and map directly onto the user's two symptoms.
Reproduce each before changing it, then make the smallest suitable correction.

### 5.1 Key flicker — lock thresholds sit below the noise floor (HIGH)

`python/services/adaptive_cursor_filter.py`

```
FILTER_PROFILES = {
  'responsive': CursorProfile(30,  8,  1.5, 4,  90),
  'balanced':   CursorProfile(55, 12,  2.5, 6, 120),
  'stable':     CursorProfile(85, 16,  3.5, 8, 150),
  'gentle':     CursorProfile(115,20,  4.5,10, 180),
}   # settle_ms, travel_ms, hold_px, release_px, settle_before_hold_ms
```

Balanced uses `hold_px = 2.5` and `release_px = 6`. **Measured vertical jitter at
screen centre is σ = 12.9 px.**

Consequence, traced through `update()`:
- `distance` (new raw sample vs current filtered point) exceeds `hold_px = 2.5`
  on most samples → `_stable_since` resets → `zone` returns to `'free'` and the
  120 ms settle window never completes.
- On the rare occasion `lock` is reached, σ > `release_px = 6` breaks it immediately.
- Result: a bistable `free ↔ lock` oscillation. `zone` is published as
  `backend_zone`/`gaze_state`, and `is_fixation = (zone == 'lock')` drives cursor
  rendering — **so the cursor's visual state flickers continuously during fixation.**

Also quantify: `alpha = 1 − exp(−dt/tau)`; at 33 Hz (`dt = 30 ms`) with
`tau = settle_ms = 55 ms`, `alpha ≈ 0.42`, so filtered σ ≈ 0.51 × raw σ ≈ 6.6 px
still visible. During fixation `travel = clamp((distance − 12)/68) ≈ 0`, so `tau`
never benefits from the travel blend.

The thresholds appear tuned for a much cleaner signal than an ET5 produces.
Re-derive them **from the measured noise distribution**, not by feel.

### 5.2 Corner/bottom juggling — filter reset storms at the window boundary (HIGH)

`python/main.py:1234-1237`

```python
if not (0 <= raw_x <= 1 and 0 <= raw_y <= 1):
    self._invalidate_gaze('outside_window', stamp)
    return
```

and `_invalidate_gaze()` (`main.py:1190-1196`) calls **`self.cursor_filter.reset()`**
and **`self._clear_gaze_target_state()`** (which drops `_sticky_magnet_target`,
`_on_key_target_id`, `_cursor_on_target`).

Near edges the raw signal straddles the boundary (§4.1: bottom-left median
x = −0.0242). So the stream alternates valid → `outside_window` → valid, and
**every single stray sample wipes the filter state and the target lock.** That is
a hard per-sample binary test applied to a signal with ±30–100 px noise exactly
where noise is worst — producing the observed positional juggling.

The rejection itself is correct and must be kept (looking at the title bar or
off-screen must never collapse onto a selectable border control). What is missing
is **hysteresis/debounce** on the transition — conceptually the same idea the
helper already uses for its 150 ms silence timeout. A single out-of-window sample
should not destroy accumulated filter and target state.

### 5.3 Lock target derived from raw coordinates while the cursor is filtered (MEDIUM)

`python/main.py:1247-1250`

```python
on_key = self._update_on_key_state_impl(raw_px, raw_py)        # RAW, pre-filter
filtered_x, filtered_y = self.cursor_filter.update(raw_px, raw_py, stamp,
                                                   self._on_key_target_id if on_key else None)
screen_x, screen_y = self._apply_magnetism(filtered_x, filtered_y)
```

The filter's lock identity comes from the **noisy raw** position while the cursor
it stabilises is **filtered**. Near a key boundary the `target_id` can flip with
raw noise even when the filtered cursor is visually stationary — and a
`target_id` change forces `zone = 'free'` and resets `_stable_since`. This is a
second, independent flicker source that compounds §5.1.

### 5.4 Helper cannot recover a dead vendor stream (HIGH — hit during the session)

`tobii-helper/TobiiGazeHelper/Program.cs:41-43` creates the `Host` and
`GazePointDataStream` **once** at startup, with no watchdog and no
re-initialisation. Combined with the `silenceReported` latch
(`Program.cs:136-145`), a stream that never delivers produces **exactly one**
timeout heartbeat and then permanent silence, with **no error surfaced anywhere**.

This actually happened: after a physical unplug/replug, the device, all three
Tobii services, `Tobii.EyeX.Engine`, `Tobii.EyeX.Interaction` and our helper all
reported healthy, the backend reported `tobii_connected: true` — and the stream
delivered **zero samples across 12 s, 20 s, 40 s and 60 s observation windows**.
Restarting the helper process alone did not recover it.

OptiKey checks engine availability when its first point subscriber arrives. A
watchdog ("Host initialised but no sample ever arrived / no sample for N seconds
→ tear down and re-create the Host, and surface the state to the UI") is the
obvious missing piece. **An AAC user must not be left with a silently dead
tracker and no indication why.**

### 5.5 Magnetism parameters unvalidated against measured error (MEDIUM)

`python/main.py:1374-1380`

```
keyboard   radius 72.0  pull 0.32  release 88.0
prediction radius 112.0 pull 0.48  release 100.0
navigation radius 44.0  pull 0.16  release 64.0
gazetoggle radius 165.0 pull 0.34  release 185.0
default    radius 62.0  pull 0.22  release 82.0
```

Note `prediction` has `release (100) < radius (112)`, which is inconsistent with
the sticky-release design used elsewhere — check whether that is deliberate.
Evaluate whether magnetism is masking the coordinate error in §4.1 and making
neighbouring controls harder to select, especially on the ten prediction slots.

### 5.6 Gaze offset normalised inconsistently (LOW, verify)

`python/main.py:1157-1165`: `out_x` is normalised by `content_w`, but the manual
offset is added as `offset_x / self.screen_width`. If `content_width` differs from
`screen_width`, the offset is scaled wrongly. Confirm whether these are always
equal in practice.

### 5.7 A safety branch is unreachable in production (LOW, documentation risk)

`src/utils/gazeSafety.ts` `isUsableGaze()` rejects `x < 0 || x > 1`, but the
backend guarantees in-range values (`main.py:1252-1253` clamps after the §5.2
rejection). The real off-screen rejection happens earlier, in the backend. The
frontend test suite exercises this branch by constructing samples directly, so it
**passes without proving anything about the production path**. Keep the guard
(defence in depth) but do not treat that test as evidence of off-screen safety.

---

## 6. ALREADY VALIDATED — DO NOT REDO

All of this passed on this machine at commit `e93a71b`. Re-run only what your
changes could plausibly affect.

| Check | Result |
| --- | --- |
| `.\setup.bat` (full, incl. .NET 8 helper build) | PASS |
| `.\check-windows.bat` and `-Simulate` | PASS |
| `npm run build` / `build:electron` / `typecheck` | PASS (Vite large-chunk warning present) |
| `npm run check:word-slots` | PASS — 76 + 18 |
| `npm run check:dwell-groups` | PASS — 11 |
| `npm run check:gaze-safety` | PASS — 10 |
| `npm run check:browser-gaze-safety` | PASS — 24, 10,000 busy frames dropped |
| `npm run check:browser-cursor` | PASS — 19/19 |
| `test_deterministic_*.py` | PASS — 62, real worker processes |
| `test_gaze_transport.py` | PASS — 16 |
| `test_pipeline_mapping.py` | PASS — 9 |
| `test_adaptive_cursor_filter.py` | PASS — 6 |
| `scripts/windows -p "test_*.py"` | PASS — 12 |
| `test_tts_available.py` + audible SAPI5 speech | PASS — 3 English voices |
| `verify_windows_bundle.py source` | PASS |
| UI geometry, 1920×1080 + 1366×768, Warm + Dark | PASS — no target < 80 px, no overlap, no clipping, no scrolling |

Known failing / outstanding, already reported — **do not conceal, do not "fix"
by accident**:

- `npm run lint` → **exit 2, no ESLint configuration exists.** Pre-existing.
- Vite large-chunk warning (`index-*.js` ≈ 739 kB). Pre-existing.
- **`build-installer.bat` was never completed.** It reached `npm ci` → source
  bundle verify → full frozen backend under Task Scheduler before the session's
  process limits cut it. The floor-plan freeze runs fine in isolation. Needs one
  uninterrupted 15–25 min run.

Also unchanged by the whole branch (`c19bada..e93a71b`), so not suspects:
`src/config/dwellTimeConfig.ts`, `src/utils/design.ts`, `src/warmmode.css`,
`src/refinement.css`, `electron/`, `tobii-helper/`.

---

## 7. WRONG HYPOTHESES ALREADY TESTED — DO NOT REPEAT

1. **"Off-screen gaze is clamped onto selectable controls."** False.
   `main.py:1234-1237` rejects it *before* any clamp. The clamp at 1252 only
   guards small magnetism overshoot on already-validated samples. The real
   problem is the *reset storm* that rejection causes (§5.2).
2. **"The documented fresh-profile word order is wrong."**
   False. `docs/windows-local-testing.md:54` is correct. With a genuinely empty
   draft and reset learning, `i need wa` reproduces exactly: top
   `water wasn't warm want wait`, bottom `was walk watch wake way`, phrase
   `I need water`. Intermediate disagreement was a **slot-lineage** effect from a
   contaminated draft. **Clear the message fully before comparing.**
3. **"The managed Tobii DLLs are the wrong architecture."** False. AnyCPU managed
   assemblies legitimately carry an I386 PE header.
   `scripts/verify_windows_bundle.py` encodes the correct rule and is authoritative.
4. **"`gaze_enabled` gates the backend gaze broadcast."** False. It is only a flag
   (`main.py:946`, `1765`, `3226`); processing and broadcast are not gated by it.

---

## 8. RULES OF ENGAGEMENT — OPERATIONAL HAZARDS

These cost the previous session real time and disrupted the user. Respect them.

1. **The helper serves exactly ONE TCP client** (`Program.cs:118-130`) — a new
   connection *disposes the previous one*. Attaching a diagnostic client to port
   5555 **displaces the running backend**, and the two then fight. For raw-stream
   capture, stop the app first and run the helper standalone.
2. **Never probe or kill processes during a live user session.** The previous
   session killed the helper mid-test to check respawn behaviour and disrupted
   the user's evaluation. Ask first, always.
3. The backend broadcasts gaze to **all** WebSocket clients on 8765
   (`_gaze_broadcast_loop`), so a second read-only observer is safe *when the user
   is not mid-task* — but it proves nothing if nobody is looking at the screen.
   Zero samples usually means "no eyes on screen", not "broken".
4. **Long builds get killed** when launched from an agent session. Windows Task
   Scheduler survives; foreground calls may be capped (10 min in the previous
   harness). Budget for this.
5. **Memory is tight (~1 GB free of 7.7 GB).** Two PyInstaller passes plus
   electron-builder are slow. Close other apps before building.
6. Keep `GAZE_DEBUG` **off** by default. Redirect runtime output to files under
   `tools/reports/` and inspect bounded tails or filtered summaries. **Never
   stream continuous gaze logs into the conversation.** Diagnostic buffers must
   be bounded and off by default.
7. Do not retain private spoken messages or raw gaze recordings unnecessarily,
   and do not upload diagnostics anywhere.
8. Do not kill unrelated processes to free ports, disable Windows security, or
   install/replace drivers. `Assert-FreePorts` already reports an occupied port's
   owning PID without killing it — keep that behaviour.
9. **A tracker unplug/replug may leave the vendor stack in a state where no
   application receives gaze**, with everything reporting healthy. If that
   happens, stop diagnosing the app and recover the vendor stack (reconnect,
   re-calibrate in Tobii Experience, restart Tobii services, or reboot).

---

## 9. THE WORK

### 9.1 Trace the real pipeline

Document every boundary from Tobii SDK callback → C# helper → TCP 5555 → Python
backend → WebSocket 8765 → Electron/React → hit-testing → dwell activation, plus
the separate native-browser path (BrowserView/webContents positioning, page zoom,
injected gaze handling).

For each boundary record: coordinate units and origin; which display/window they
refer to; timestamp and sequence information; validity/confidence handling;
buffering, scheduling and thread/process ownership; filtering or calibration
applied; and which component owns selection.

Confirm actual Tobii gaze is active. **Mouse simulation must never be presented
as hardware verification.**

### 9.2 Prove coordinate mapping

Trace conversions between normalised tracker coordinates → physical display
pixels → Windows DIPs → Electron window content coordinates → renderer CSS
pixels → embedded browser viewport coordinates. Derive them from the SDK contract
and actual runtime geometry; do not assume `devicePixelRatio` describes every
boundary.

Check for: scaling applied twice or omitted; wrong display origin; window
frame/title-bar offsets; BrowserView bounds omitted; stale geometry after resize
or move; wrong zoom handling; multi-monitor offsets including negative origins;
mixed-DPI displays; wrong calibration order or calibration applied twice; invalid
or off-screen samples reaching selectable controls.

Use **synthetic coordinate replay** to verify the mathematics independently of
human fixation, then real fixation to assess the hardware path. **Keep the two
sets of results clearly separate.**

Do not compensate for a mapping bug with a global offset or stronger snapping.

### 9.3 Measure latency and sample freshness

Baseline before changing behaviour. Use bounded, opt-in instrumentation for: SDK
callback arrival, helper send, backend receive/process, frontend receive, cursor
update scheduling, target acquisition, dwell activation.

Use **monotonic clocks**; do not subtract timestamps across clock domains unless
the relationship is established. Report median, p95, p99, worst, sample count,
duration and concurrent workload. State explicitly which measurements exclude
sensor latency and display presentation.

Inspect for: growing queues, obsolete samples being processed, unbounded buffers,
out-of-order/duplicate samples, busy-looping, blocking I/O, excessive logging,
React re-rendering on every gaze sample, repeated DOM measurement, multiple
cursor/filter/selection owners, and prediction/browser work delaying gaze handling.

Prefer fresh data over a backlog — but **never drop an invalidity event in a way
that lets a dwell continue.**

### 9.4 Verify selection safety

Test that: a stable intended fixation produces exactly one activation; looking
away does not complete the old target; blinks follow the documented pause/resume
policy; prolonged loss cancels selection; stale/invalid/non-finite/reordered
samples cannot activate; a screen change cancels the previous screen's pending
dwell; a word suggestion changing under gaze cannot inherit the previous word's
dwell; hidden/disabled/covered/removed controls cannot activate; frontend and
native browser cannot both fire the same action; gaze pause takes effect
promptly; background/minimised behaviour follows policy; reconnection cannot
trigger a saved or partly completed action; genuine stationary gaze is not
mistaken for a frozen tracker merely because coordinates repeat; and hardware
tracking loss never silently enables mouse-hover selection.

### 9.5 Evaluate filtering and target acquisition

Review before modifying. Measure the trade-off between fixation jitter,
movement/settling delay, overshoot, adjacent-target switching, unintended
activations, and the ability to *leave* a selected target.

Check whether smoothing is applied more than once across SDK, helper, backend and
renderer. **Note the SDK stream is already `GazePointDataMode.LightlyFiltered`**
(`Program.cs:42`) — vendor filtering plus `adaptive_cursor_filter` plus magnetism
is three stages; establish whether they conflict.

Change **one variable at a time**, compare against the *same* replay traces and
real tasks, and keep rollback trivial.

Do not let strong snapping hide coordinate error or make neighbouring controls
hard to select.

### 9.6 Refine the four smoothing modes

Review **Balanced, Responsive, Steady and Gentle**
(`FILTER_PROFILES` keys are `balanced`, `responsive`, `stable`, `gentle`).

- Balanced must be a sensible default for a first-time user.
- The other three must be **clearly differentiated** for individual needs.
- Modes change **movement response and stability only** — never selection durations.
- Do not claim one mode suits everyone.
- Onset, cooldown and tracking safeguards stay separate.
- No per-button sliders, multipliers or repeat-key acceleration.

Explain, per mode, who it is for and what measurable behaviour changes.

### 9.7 Test under real workloads

Compare idle gaze against: traditional keyboard typing with ten active prediction
slots; Zone Board navigation and letter selection; Quick Phrases and
communication boards; home-design survey and map-cell selection; native browsing
and YouTube playback; rapid screen transitions; backend or tracker reconnect.

Track CPU, memory growth, queue depth, dropped/stale samples and timing over a
sustained session. Keep the existing process-based deterministic predictor — do
not replace it or weaken prediction to make gaze benchmarks look better.

### 9.8 Implement focused fixes with regressions

For each confirmed problem: reproduce → identify the exact layer → add a
meaningful regression check → make the smallest suitable correction → re-run the
relevant baseline → verify other paths still work.

Inspect existing tests before inventing replacements; prefer deterministic replay
for geometry, timing and tracking-loss cases. If a defect is caused by hardware
placement, calibration or driver behaviour, **report the evidence rather than
bending application mathematics to hide it.**

---

## 10. MEASUREMENT PROTOCOL (learned the hard way)

1. **Record once, tune offline.** Capture raw helper samples during a scripted
   fixation sequence, save them, and replay them through the pipeline offline.
   This makes tuning deterministic and repeatable and avoids repeated physical
   sessions. The repo already has `python/tests/gaze_synthetic_traces.py`,
   `python/tests/gaze_trace_replay.py` and
   `python/tests/fixtures/synthetic_gaze_trace.csv` — use them.
2. **Stop the app before capturing raw helper data** (one-client limit, §8.1).
3. Discard the first ~1.2 s of each fixation (saccade + settle).
4. Report jitter as **σ per axis**, not just mean error — the vertical/horizontal
   asymmetry (12.9 vs 5.6 px at centre) matters for threshold design.
5. Use `time.perf_counter()`, never the asyncio loop clock on Windows.
6. When you need the user, give **one short, specific physical task** ("fixate
   target 3 for five seconds", "unplug and replug the tracker") and say exactly
   what observation you need. Never claim physical accuracy was tested without
   actual fixation evidence.

---

## 11. CURRENT BLOCKING ISSUE

At handover, **the Tobii stream was delivering zero samples** while every process
and service reported healthy (see §5.4). Likely vendor-stack state following a
physical unplug/replug.

**Before any gaze work, restore tracking and prove it:** reconnect and/or
re-calibrate in Tobii Experience, restart the Tobii services or reboot if needed,
then confirm a non-zero sample rate. Then fix §5.4 so this state is detected and
recovered automatically instead of failing silently.

A clean restart of the app:

```powershell
.\start-dev.bat
```

---

## 12. DELIVERABLE

A concise report tied to the tested commit and working-tree changes, containing:

1. A diagram or table of the **verified** coordinate transformations.
2. Confirmed defects and fixes, with `file:line` references.
3. **Before/after** latency and stability measurements — including fixation jitter
   at centre and at each corner, so the §4.1 numbers can be compared directly.
4. Selection-safety test results.
5. **Real Tobii observations versus synthetic replay, clearly separated.**
6. Mode-by-mode explanation of Balanced / Responsive / Steady / Gentle.
7. A source-backed OptiKey comparison — active runtime behaviour only, separated
   from unused code, optional settings and comments. Implement principles
   independently; **do not copy or translate OptiKey source.**
   (`docs/optikey-gaze-reference-review.md` already documents its key-identity
   selection, 250 ms lock-on and banked partial dwell — build on it, verify it.)
8. Tested Windows version, scaling, display configuration, driver/runtime versions.
9. Remaining hardware and Windows 10 validation still required — specifically
   intended-target accuracy, unintended activations, selection effort,
   lock-release time, latency and long-session stability.
10. Exact reproduction commands and report locations (`tools/reports/`).
11. `git status` and any changes still needing the user's review.

Finish with an **evidence-based** assessment of whether the application is ready
for a supervised real-user trial. Preserve what already works. Improve measured
reliability rather than chasing a claim of zero latency.
