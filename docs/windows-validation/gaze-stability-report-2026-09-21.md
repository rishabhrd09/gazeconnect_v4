# Gaze stability and accuracy — 21 September 2026

**Branch:** `featuring/ui-design-windows-production-refinement` · **Base commit:** `e93a71b`
**State:** committed and pushed on 22 Sep 2026, on top of `e93a71b`, at the maintainer's request.

**Read this first.** Rounds 1 and 2 (§0 onwards) are **deterministic replay**, using noise whose per-axis
spread is the one *measured on the real tracker* on 20 Sep. Round 3 (§00) adds **two real, read-only
recordings of the maintainer's live session**; they show what the tracker reported, with no ground truth
for where he was looking. **No fixation capture against known targets has been recorded**: the app has
been open whenever the tracker was in use, which keeps port 5555 busy. That capture is still 80 seconds
away (§10). Nothing here claims zero latency, perfect accuracy, or that the final state was felt by a
person: round 3's edge band and blink fix have not been used on the tracker yet, and its first attempt at
a full-screen start **broke the app on the rig** and was withdrawn (§00.3, item 3). Round 4 (§000) found
that hang's most likely real cause, a logging loop once the launching console is gone (§000.0), fixed it,
and made full screen the default. Round 5 (§0000) changes what the cursor shows: a bubble at the centre
of the target the eyes are on, moving centre to centre; round 4's "rest at the gaze" is withdrawn.

---

## 0000. Round 5 — 22 September 2026 (the cursor goes to the centre of what is looked at)

**This section supersedes the round-4 addendum that made the cursor "rest at the gaze, never at the centre"**
(`src/utils/dwellAnchor.ts`, browser v17.25). That change was a misreading of the maintainer's report and he
found it worse. His rule, condensed: *decide which card or key I am looking at first, then show the cursor at
its centre; follow a centre-to-centre path; never show the gaze wandering over the card, and never recentre
after the cursor has appeared.* His references: Tobii Experience's "Preview my gaze" (a light ring with a
clear centre) and OptiKey 3.2.5.

### 0000.1 What OptiKey 3.2.5 actually does with his settings
Read from the OptiKey source at tag v3.2.5 (commit `e1021d0`, matching his `OptikeyPro.exe` 3.2.5.0) and his
own `user.config`: **no cursor at all** (`GazeIndicatorStyle=None`: the overlay window is never created). All
feedback sits inside the key: a hover border on the key under the smoothed point, then a centred fill pie.
`TobiiEyeXProcessingLevel=Medium` opens Tobii's *fixation* stream (saccade samples never reach OptiKey), and
`GazeSmoothingLevel=2` is a distance-gated smoother that effectively freezes moves under ~60 px (half the gap
closed per sample at ~144 px). Lock-on 350 ms (any off-key sample restarts it), progress 1.25 s, banked per
key for 750 ms and resumed at once. OptiKey never moves a marker to a key's centre; the key itself is the
feedback. A bubble drawn at the centre of the decided target is the closest a visible cursor can get to that.

### 0000.2 A defect found on the way: the dwell highlight hid the target
`src/refinement.css` paints `:root[data-theme] #root > div` with the opaque page colour. The cursor's layers are
direct children of `#root`, so **the dwell highlight was an opaque box over the very key or card being
selected** (its label and icon vanished for the whole dwell) and the cursor disc was opaque too. Seen on
offscreen captures of the interface; the rule is in commit `c19bada`. It now skips `[data-cursor]` elements.

### 0000.3 Changes
1. **`src/utils/gazeFocus.ts` (new)**. `GazeFocus` decides the target from the backend's gaze *estimate*,
   never from the drawn bubble. A new target takes the focus on its second sample (`FOCUS_CONFIRM_MS` 25);
   the current one is kept while the estimate stays within 30 px of its box when another target competes,
   60 px (110 px near a screen edge) when nothing else is there, and is released after 180 ms. A locked dwell
   owns the focus; only the renderer's raw-sample lock break ends it, and then there is no hysteresis.
   `BubbleMotion` is a critically damped spring (90 % of a move in ~78 ms, then exactly at rest, no
   overshoot). `FreeAnchor` keeps the bubble still off-target unless a shift of more than 24 px lasts 90 ms.
2. **`src/components/core/GazeCursor.tsx` (v18)**. The hit test moved out of the dwell loop
   (`pickCandidate`, rules unchanged) and runs on the estimate; the dwell target *is* the focused target, so
   what is shown is what is selected. The bubble is drawn on the display clock (`drawBubble`) at the focused
   target's centre; while a new target is still being confirmed it waits where it is; with no usable gaze
   for 1 s it hides and reappears directly at its decided place. The onset is credited from the first sample
   of the focus decision, so no selection takes longer. With gaze selection off the bubble never settles on
   an ordinary control. A non-keyboard target is acquired from at most 60 px outside its box: the
   centre-based reach alone went ~125 px past a large Home card, which a centre-snapped bubble shows as a
   pull. Look: 108 px across at 1920 px (scales with the window; the Settings sizes stay), a 7 px light ring
   with a soft dark edge, clear centre, no centre dot; the dwell fills the ring in teal. Theme-neutral: the
   Warm rules for the old disc are gone. `src/utils/dwellAnchor.ts` is deleted.
3. **Embedded browser (v17.26, `electron/browser/browserGazeController.ts`)**. The same rule for the in-page
   ring: centre of the target being dwelt on, waits on a target's first frame, the gaze otherwise, and it stays
   on what was just selected during the post-click cooldown. The same look (84 px). Clicks are unchanged.
4. Settings text for Show Gaze Cursor and Gaze Cursor Size.
5. Tests. `scripts/check-gaze-safety.cjs` 45: unit tests of the focus, the spring and the free anchor; in the
   real cursor loop: first shown at the centre with nothing drawn before the target is decided, still through
   noise, centre to centre in one monotonic move with the right target selected, gaze off, hidden and back
   after a loss, no added time to select, reading across a card, after a selection. **Negative control**: 10
   of these fail on the round-4 cursor, while the 35 safety tests pass on both. `scripts/browser-cursor-replay.js`
   21: S21 rewritten and S22 new, both failing on v17.25.

### 0000.4 Replay of his two live typing recordings (not hardware evidence)
Both recordings (21 Sep 08:16 LightlyFiltered and 18:56 Unfiltered, Responsive as he uses it) were replayed
through the real backend path (`GazeConnectBackend._on_gaze_data`, targets registered) and then the real
renderer (`GazeCursor.tsx`, virtual clock, 60 Hz frames) on the keyboard screen's layout measured from the
interface at 1920x1032. What is measured is the DRAWN cursor. Values: unfiltered / lightly filtered.

| | Before round 4 (recentre after onset) | Round 4 (rest at gaze) | Round 5 (centre, decided first) |
| --- | --- | --- | --- |
| Cursor stops per minute | 131.6 / 107.5 | 162.8 / 130.8 | **86.1 / 73.4** |
| Stops under 150 ms, bottom third, /min | 29.4 / 16.0 | 36.0 / 10.9 | **7.4 / 5.8** |
| There-and-back jumps, bottom third, /min | 3.0 / 5.1 | 3.6 / 6.5 | **1.2 / 0.7** |
| A-B-A returns between targets, bottom third, /min | 4.8 / 5.1 | 3.6 / 1.5 | 2.5 / 3.6 |
| Cursor travel, px/min | 57,604 / 50,098 | 54,337 / 46,962 | **44,767 / 39,394** |
| Mean distance from the centre of the target it is on | 55.7 / 46.8 px | 78.3 / 59.5 px | **10.1 / 8.3 px** (glides included) |
| Reaching a new target's centre (real changes), median / p90 | 187/406 and 163/337 ms; 22 of 49 and 25 of 52 never centred | 38 of 49 and 39 of 52 never centred | **169/339 and 166/268 ms**; 3 of 49 and 0 of 52 not centred |
| Selections | 17 / 26 | 16 / 27 | 16 / 28 |

The remaining A-B-A returns were inspected sample by sample: real glances (reading the text line, then back)
or the estimate resting right on a key border for 250 ms or more. Waiting longer before switching (swept from
25 to 90 ms) did not reduce them and added up to 45 ms of lag, so the switch is on the second sample.
Hidden-cursor mode selected exactly the same items as the visible one on both recordings. There is no
recording of the Home screen, so Home cards are covered by the unit tests and the offscreen captures only.

### 0000.5 Not verified — owed on the rig
- How it feels on the tracker: the bubble on keys and cards, the bottom rows, Home cards, YouTube, with the
  cursor shown and hidden. The replay has no ground truth for where he was looking.
- Whether 25 ms / 30 px / 180 ms suit him; each is a named constant in `src/utils/gazeFocus.ts`.
- The backend is not touched by round 5: `DISPLAY_RESUME_SECONDS` and `FIXATION_GAP_S` (1 s, set earlier on
  22 Sep) stay as they are.

---

## 000. Round 4 — 22 September 2026 (web page left over Home; bottom rows still unstable)

**This section supersedes §00.3 item 3 (full screen is now the default) and adds to the rest.** The
maintainer reported, with a screenshot taken at 02:53 in a live session: (1) a YouTube page drawn over the
Home screen after leaving the browser, covering the header, the gaze toggle and the Home tiles; (2) the
middle 70 % of the screen is fine for typing, but the bottom ~20 % still shows instability and sudden
jumps, with the gaze cursor visible AND hidden; (3) occasional small jumps and lag elsewhere.

### 000.0 The app hangs when its launching console goes away (the likely cause of the 21 Sep "incident")
At 04:10 the running app (launched 02:47) was **hung**: `IsHungAppWindow` true, Electron's main UI thread
at 100 % of a core (2.95 s of CPU in 3 s; 3,108 s since launch), every other thread idle, nobody at the
tracker. Its launcher chain above `npm run electron:dev` had exited and the Vite dev server with it; the
launch log stops at 02:49:11. The JavaScript stack, read through Node's inspector from the hung process:
`uncaughtException` handler -> `console.error` -> stderr write -> EPIPE -> uncaught exception -> handler ->
... With the launcher gone, stdout/stderr are broken pipes; the next line Electron forwarded (the backend's
tracker-status lines) failed, and the handler's own logging failed the same way, forever. The main thread
never returned to its message loop: IPC unanswered, no window messages, and the renderer's request to
close the YouTube page never handled — **the page in the screenshot stayed because the main process was
hung**, and the teardown defect in 000.1 would have kept it there too.

Reproduced with the app's Electron build (a parent that starts Electron with piped output, then leaves):
old handler 2.89-3.0 s of CPU in 3 s; with `electron/stdioGuard.ts` 0.00-0.02 s, and later lines land in
`main-console-<local time>.log`. Every symptom recorded on 21 Sep (main at 100 %, `window:getBounds`
unanswered, `geometry.reported = false`, gaze dead) is this hang; full screen could not be made to hang in
the rehearsal (000.6). That attribution is the most likely one, not proven: no stack exists from 21 Sep.

### 000.1 The web page left over the Home screen — found, fixed, proven in a harness
The page in the screenshot sits exactly at the YouTube player's nav-hidden layout (x 35-1704, y 166-1015 at
1920x1032) while the header is the Home screen's (`LiveClock` shows only there): a page nobody owned.
Closing a page awaited the page's own cleanup script **before** detaching the view, with no time limit.
Electron parks `executeJavaScript` until a loading page stops loading, so a page caught mid-load stayed on
screen indefinitely. Measured with the app's own Electron build (hidden window, local page whose load
never completes):

| Close path | Page loading | Off the window at once | Still on screen after 3 s | Close finished |
| --- | --- | --- | --- | --- |
| before | yes | no | **yes** | **never** |
| now | yes | yes | no | 404 ms |

Other gaps closed at the same time: a close arriving while an open was still waiting could not stop that
open (a page could come back after the user had left); a failing old open closed its successor; an
`ERR_ABORTED` first load (a site redirecting by script) closed a live page; an interface reload (Ctrl+R,
the error screen's Reload, a development reload) or renderer crash left the page behind; Alert Mode's Home
and a Quick Search page had no close on the way out.

### 000.2 The bottom rows: the window never reached the screen edge
The backend's geometry handshake shows the live window **maximised at 1920x1032** (48 px taskbar); the
21 Sep recordings were the same size (re-analysed at 1032, not the 1040 assumed in §00). So the 48 px
screen-edge band never applied at the bottom. Timeline of the unfiltered recording: on the bottom row the
tracker reports gaze 0-50 px below the window edge for 0.15-0.8 s at a time; one sweep along the bottom row
(about 50 s into the 18:56 recording) froze the cursor for 300 ms at its last in-window position, and it
then caught up in one hop.
Validity in the bottom third was 90.9 %: 138 samples in the taskbar strip, 40 below the screen. Full
screen turns the first group into ordinary in-window samples and the second into band samples up to 48 px.

### 000.3 One raw sample broke a locked selection (renderer)
`GazeCursor` left a locked selection on a **single** raw (`intent`) sample more than 80 px away and outside
the target + 45 px. The backend estimator never sees that decision. On the unfiltered recording the raw
stream flashes somewhere and straight back (>= 30 px out, back within 20 px inside 350 ms) **120.7 times a
minute in the bottom third** (24.0 middle, 7.2 top). Each flash that broke a lock flipped the cursor from
locked to unlocked for a frame and was resumed from saved progress, or started a neighbour's onset, with
the roaming cursor shown or hidden. Now a look-away must persist 45 ms of tracker time (third sample at
33 Hz); from the first away sample the ring stops filling, so waiting cannot complete a selection the user
is looking away from.

### 000.4 Presets on the maintainer's own recording (unfiltered stream, displayed cursor)
| Preset | There-and-back jumps/min top / mid / bottom | Behind raw on real moves, median / p90 | Shimmer mid / bottom, px |
| --- | --- | --- | --- |
| Responsive (his current choice) | 0.0 / 1.8 / **9.6** | 0 / 30 ms | 4.2 / 5.4 |
| Balanced (default) | 0.0 / 1.8 / 6.0 | 0 / 0 ms | 3.2 / 4.2 |
| Steady | 0.6 / 1.2 / 4.2 | 0 / 0 ms | 2.7 / 3.6 |
| Gentle | 0.6 / 0.6 / 2.4 | 30 / 31 ms | 2.4 / 3.3 |

Only 9 real eye movements >= 110 px in that recording, so the latency column is thin. On it, Balanced is no
slower than Responsive and shows about a third fewer jumps at the bottom. Not changed: the choice of mode is
the maintainer's.

### 000.5 Changes
1. `electron/browser/browserViewController.ts:11,73` — mute and detach first; the page cleanup gets at most
   400 ms; then the page is destroyed. `strayBrowserViews` (`:28`) finds pages nobody owns.
2. `electron/main.ts:82,342,1576,2254` — request tickets for open/close/reset; `closeActiveBrowserView` also
   removes stray pages and does nothing when nothing is shown; open cancels itself when overtaken, keeps a
   live page on `ERR_ABORTED`, never closes its successor; `setBounds` validates and skips unchanged bounds.
   `:1243` — an interface reload or renderer crash closes the page.
3. `src/hooks/useGazeBrowser.ts:100,105` — the page closes whenever the screen that owns it unmounts; an
   open that resolves after a close is not shown as open (a `replace` close, the previous page making way
   for the one being opened, does not count). `src/App.tsx:174` — off the web screen (and on every fresh
   interface load) any page is closed. New check: `node scripts/check-browser-page-lifecycle.cjs`.
4. **Full screen by default** — `electron/main.ts:1082,1091`: requested 400 ms after the window is visible
   and opaque, never on a hidden or transparent one. `GAZECONNECT_START_FULLSCREEN=0` = maximised as before.
5. `src/components/core/GazeCursor.tsx:81,548,1381` + flag `lockBreakConfirm` (`src/utils/gazeFlags.ts:126`,
   default on; rollback `window.__gazeFlags.set('lockBreakConfirm', false)`).
6. `electron/stdioGuard.ts` (new), installed at the top of `electron/main.ts`: error listeners on stdout
   and stderr, the only `uncaughtException` handler (re-entry safe), log lines moved to a bounded 2 MB file
   once the console is gone (dev: `tools\reports\main-console-*.log`).

### 000.6 Verified this round
- Teardown harness (table in 000.1), Electron 28 on the rig, hidden window.
- Full-screen start-up rehearsal on the rig: the app's window options, splash hand-off and 20 s fallback
  (the path today's launch took: "ready-to-show timeout - forcing window visible"). All three paths,
  including the 21 Sep incident sequence, reached 1920x1080 full screen with IPC answering in 0.6-0.8 ms
  median (max 45 ms) and returned to maximised 1920x1032. **The hang of 21 Sep did not reproduce**, so its
  cause is not established; the rehearsal is not the real app.
- `check-gaze-safety` 23/23 (new: one/two-sample flash keeps the lock; a look-away holds the ring from the
  first sample and cancels; the flag restores the old behaviour); negative controls: the old cursor fails
  the flash test, and the new cursor without the ring pause fails the look-away test. `tsc` (interface and
  Electron), `check:dwell-groups` 15, `check:word-slots` 76+18, `check-browser-gaze-safety` 24,
  `browser-cursor-replay` 19/19, `check-browser-page-lifecycle` 4/4 (the pre-round-4 hook fails "closed
  while opening"; a first draft of this round's fix failed "replacing one page with another").

- **The real app on the rig** (maintainer's go-ahead; hung session closed with `stop-dev.bat`, then
  `start-dev.bat --simulate --quiet`, 04:03): it came up through the 20 s ready-to-show fallback again,
  logged `[Window] Entering full screen`, and the interface reported `inner=1920x1080 chrome=0px`; the
  main process was responsive (19 % of a core while settling). With the launcher then killed under it,
  the main process stayed at 0 % and responsive, `main-console-20260922-040511.log` appeared and received
  later lines. Driving the interface from the main process (inspector on the test instance only): a
  YouTube watch page open (1 view at 36,174 1848x890), then **Home -> 0 pages after 1.2 s**; a page open,
  then **interface reload -> 0 pages after 1.5 s**; a page open, then **Alert Mode -> 0 pages**, the alert
  board unobstructed. `stop-dev.bat` exited 0 ("GazeConnect stopped.") after a fix to
  `Stop-ProjectProcesses` (`scripts/windows/Common.ps1`): a process already ended by an earlier tree-kill
  made taskkill's "not found" an error under Windows PowerShell 5.1, so the script reported failure.

### 000.7 Not verified — owed on the rig
- A session **with the tracker** in full screen: how the bottom rows feel, cursor shown and hidden.
- In development the Vite server dies with the launcher, so after a lost terminal the interface cannot
  be reloaded until the app is restarted (the app itself keeps running).
- How the bottom rows feel in full screen, cursor shown and hidden; `edges.accepted_in_screen_edge_band`
  and `edges.rejected_px_past_the_window_edge` in the next observer recording.
- The interface's own latency (`renderer_latency_ms`): the renderer reports it only while gaze is flowing,
  and no one was at the tracker during this round.
- The browser ghost-commit fix (§7) is still parked in worktree `modest-hopper-3ba8eb`: its commit gate
  refuses a click when something else is drawn at the click point, and YouTube's hover previews are not
  suppressed in the app, so it could refuse ordinary card selections. It needs the on-rig check first.

---

## 00. Round 3 — measured on the tracker, in live use

**This section supersedes the mode table in §0.1, the "no real data" caveat above, and the counts in §0.8.**

The maintainer's verdict on round 2: "many things have improved", but the cursor still trails the eyes even
in Responsive, and the cursor is still unstable along the bottom of the screen. This round stopped tuning
against a noise model and recorded the real thing: two 100-second, read-only recordings of his own live
session (`tools/gaze_live_observer.py`, a listener on the backend's broadcast that never sends a message and
never touches port 5555). One with Tobii's `LightlyFiltered` stream (08:16), one `Unfiltered` (18:56).
**There is still no ground truth in them**: they show what the tracker reported, not where he was looking.

### 00.1 Where the lag is (and is not)
| Stage | Measured | Source |
| --- | --- | --- |
| Tracker sample interval | 30.0 ms median, 32 ms p95 (33.3 Hz), both streams | recordings |
| Helper callback -> backend broadcast | 0.3 ms median, 1.3 ms p95 | recordings |
| Displayed cursor behind the raw stream on a real eye movement (>= 110 px) | **0 ms median**, 0-30 ms p90 in Responsive/Balanced | replay of the recordings through the shipped filter |
| Raw stream itself crossing to the new fixation, `LightlyFiltered` | **91 ms median, 241 ms p90** (n = 32) | recording 08:16 |
| Same, `Unfiltered` | **62 ms median, 182 ms p90** (n = 9) | recording 18:56 |
| Interface: frame delivery and time to paint | **not yet measured** (now reported, §00.5) | - |

The backend adds nothing measurable. The vendor's smoothing cost about a sample (30 ms) at the median and
two at p90, and the maintainer judged the unfiltered stream "slightly faster" on the tracker, so **the
helper now requests the unfiltered stream by default** (`Program.cs:43`, rollback
`GAZE_HELPER_STREAM=lightly_filtered`). What remains is outside the application: a 33 Hz stream means a
new fixation is first *reported* 0-30 ms after the eye lands and confirmed one sample later, plus the
tracker's own processing and the display. I do not have a number for the tracker's internal latency and do
not claim one.

### 00.2 What the bottom of the screen really does
- **Gaze reported outside the window while a bottom control is looked at.** 23 edge losses in 100 s
  (16 `outside_window`, 7 `oob`), median 361 ms, p90 546 ms, max 786 ms. 74 % began within 40 px of the
  window's bottom edge. Validity: bottom third 90.9 %, middle third 99.9 %. The bottom row of controls sits
  25-90 px from the edge of a maximised window, and the 40 px under it belongs to the taskbar. The 70 ms
  edge tolerance of round 1 cannot bridge half a second, and should not: past that it is a real absence.
- **Short sideways excursions**: 11 and 20 per recording, typically ~60 px for 2-7 samples, mostly in the
  bottom third (consistent with one eye dropping out at a steep angle; the SDK stream has no per-eye flag
  to confirm it). The unfiltered stream also carries single-sample glitches (one of 629 px).
- **A blink was reported twice, and the second report wiped the display state** (pre-existing race, exposed
  by round 2's display continuity). The helper and the backend's receiver each report 150 ms of silence; the
  helper stamps whole milliseconds, so its report often arrives second with the *older* stamp and was
  classed `out_of_order`, a loss that never resumes. Four times in 100 s the cursor was re-seeded after a
  blink that should have resumed.

### 00.3 Changes
1. **Filter v3** (`python/services/adaptive_cursor_filter.py:60`): the jump distance is a fixed target
   pitch (100-110 px; floor 5 sigma-hat, cap 150 px) instead of a multiple of estimated noise, smaller
   sustained shifts *glide* (90-220 ms) instead of hopping, the outlier clip relaxes as samples agree, and
   on the unfiltered stream every mode waits one sample (25 ms) before following a jump
   (`RAW_STREAM_CONFIRM_MS`, `:93`). The 14 Sep filter is still available verbatim
   (`GAZECONNECT_CURSOR_TUNING=legacy`), parity exact.
2. **Unfiltered stream by default** (`tobii-helper/TobiiGazeHelper/Program.cs:43,91`), reported in
   `status.stream_mode`; the backend switches the one-sample confirmation on from that field.
3. **Full screen — attempted as the default, broke the app, withdrawn.** My first version called
   `setFullScreen(true)` on the still hidden, transparent window during the splash. On the rig (launch
   19:52) Electron's main process then ran at 100 % of a core, IPC stopped answering, the interface never
   reported its geometry (`geometry.reported = false` in the backend handshake) and **gaze did not work at
   all**. No automated check covers Electron window behaviour, and I had not run it. The window now starts
   maximised exactly as before (`electron/main.ts` `presentMainWindow`); full screen at start is opt-in
   (`GAZECONNECT_START_FULLSCREEN=1`) and is only requested once the window is visible and focused, the
   state in which the right-click menu and the Zone Board request it. **Unverified on the rig.** Until it
   is, the bottom edge of the maximised window still borders the taskbar, so the edge band (next item)
   helps the top and sides only, and the bottom-row losses of §00.2 remain unless full screen is switched
   on by hand (right-click → Full Screen Mode).
4. **Screen-edge band** (`python/main.py:911`, `_screen_edge_band` `:1244`, applied `:1445`). Maintainer
   decision, recorded in `AGENTS.md`, that amends "off-screen gaze is never mapped onto a border control":
   gaze reported at most 48 CSS px (about 13 mm on this display, inside the tracker's error at 60 cm) past
   a **physical screen edge that is also the window edge** is taken to be 1 px inside that edge. Farther
   out, or past an edge that borders other UI (the taskbar of a maximised window, a window that stops short
   of the screen), it is rejected exactly as before. It needs geometry the interface reported, never a
   default. Known consequence: resting the eyes on the bezel within ~13 mm of the screen can count as
   looking at the edge control beside it; the gaze toggle is the rest position.
5. **A second report of the same loss is ignored** (`python/main.py:1429`): an *invalid* sample with an
   older stamp, while tracking is already lost, carries no measurement to be out of order. Reordered valid
   gaze, and an invalid old-stamped sample while tracking is live, are still refused.
6. **Lock after 50 ms on a target** (`src/components/core/GazeCursor.tsx:70`), so the ring starts sooner
   without shortening any dwell time.
7. **Diagnostics, all bounded**: a rejected sample's position travels with the invalid frame
   (`rejected_x/y`, never a position anyone acts on), the handshake carries the window geometry, and the
   interface sends its own timing percentiles every 10 s, relayed only to a listening observer (§00.5).

### 00.4 The recordings replayed through the 14 Sep filter and the shipped one
"Behind raw" = how much later than the raw stream the displayed cursor reaches a new fixation. "False
hops" = displayed moves over 35 px while the gaze did not really move (per minute, middle / bottom third).
"Calm" = frame-to-frame RMS motion of the displayed cursor during a fixation, px, top / middle / bottom.

| Recording, mode | Behind raw, median / p90 | Excursion drag, median px | Calm T / M / B | False hops/min M / B |
| --- | --- | --- | --- | --- |
| LightlyFiltered, 14 Sep Responsive | 0 / 0 ms | 47 | 7.0 / 6.2 / 10.5 | 9.1 / 35.9 |
| LightlyFiltered, 14 Sep Balanced | 0 / 0 | 40 | 6.3 / 4.5 / 8.0 | 0 / 28.9 |
| LightlyFiltered, **now Responsive** | 0 / 30 | 24 | 7.3 / 3.3 / 4.8 | 0 / **1.4** |
| LightlyFiltered, **now Balanced** | 0 / 0 | 20 | 6.1 / 2.7 / 3.5 | 0 / **4.1** |
| LightlyFiltered, now Steady / Gentle | 30 / 32 · 60 / 63 | 16 · 14 | 5.2 / 2.2 / 2.9 · 5.0 / 2.2 / 2.6 | 0 / 2.7 · 0 / 2.7 |
| Unfiltered, 14 Sep Responsive | 0 / 0 | 85 | 8.8 / 8.9 / 15.3 | 126.7 / **184.6** |
| Unfiltered, 14 Sep Balanced | 0 / 0 | 75 | 5.8 / 6.0 / 10.1 | 80.0 / 121.5 |
| Unfiltered, **now Responsive** | 0 / 30 | 20 | 3.7 / 3.7 / 5.5 | 5.8 / **3.1** |
| Unfiltered, **now Balanced** | 0 / 0 | 14 | 2.6 / 3.1 / 4.4 | 0 / **2.1** |
| Unfiltered, now Steady / Gentle | 0 / 0 · 30 / 31 | 10 · 8 | 2.0 / 2.6 / 3.8 · 2.2 / 2.1 / 3.4 | 0 / 2.1 · 0 / 2.1 |

So the unfiltered stream is only usable with the new estimator (the 14 Sep filter would hop 185 times a
minute on it), and with it the cursor is calmer than it was on the vendor-smoothed stream while arriving
with the raw stream. The edge band, full screen and the double-report fix are **not** in this table: the
recordings do not contain the positions of the rejected samples (they do from now on), so those three are
covered by replay tests (`python/tests/test_gaze_edge_stability.py`, 30 tests) and await the maintainer's
next session.

### 00.5 What is still unmeasured
- **The interface's share of the lag.** The renderer writes the cursor transform inside the WebSocket
  handler, not on a timer, so its floor is one display frame; whether it holds that on this memory-tight
  machine in development mode is unknown. It now reports `ws`, `e2e` and `paint` percentiles and render-loop
  stalls (`src/utils/gazeTelemetry.ts` `getLatencyReport`), which the next observer recording captures as
  `renderer_latency_ms`.
- **How far out the rejected edge samples fall** (is 48 px enough, or too much?): the next recording reports
  it as `edges.rejected_px_past_the_window_edge` and `edges.accepted_in_screen_edge_band`.
- **Accuracy.** Nothing here measures where he was looking. The 80-second fixation capture
  (`tools/gaze_fixation_capture.py`, app closed) is still the only way to separate tracker bias at the bottom
  of the screen from noise, and it has still not been run.

---

## 0. Round 2 — after the maintainer used round 1 on the tracker

**This section supersedes §4.1, the numbers in §5, the mode table in §6 and the counts in §11.**

The maintainer's verdict on round 1: the cursor lagged behind the eyes in every mode ("not instant going
of gaze at correct button"); the space bar and the strip below it still juggled; the dwell times were too
fast; the mouse did not behave in gaze mode; Settings scrolled with a delay. No capture was recorded, so
the noise model's temporal correlation and spike rate are still assumptions.

### 0.1 The lag was mine, and a retune would not have fixed it
Round 1's hold followed the fixation with one slow time constant and confirmed every release for a
sample. Measured: a 30-50 px corrective eye movement took 350-450 ms to show (Balanced), every move cost
an extra 30 ms, and the hold engaged only after 120 ms of a faster low pass, so the cursor *crept* the
last 15-25 px towards a key. I had reported that as an acceptable trade. It was not.

`python/services/adaptive_cursor_filter.py` is now a **fixation mean** on a target (the 14 Sep low pass is
kept verbatim off a target and as the A/B reference; parity with HEAD is exact: 26,848 samples, 0.0 px,
identical zones):
- a sample beyond the jump threshold is a new fixation and is **shown on that sample**. If the next sample
  returns to the interrupted fixation, the jump is undone and that fixation resumes with everything it
  had averaged (probation 75 ms);
- within a fixation the gain falls 1, 1/2, 1/3 ... down to an averaging window, so there is calm without
  creep; several samples agreeing that the eye settled somewhere new, closer than a jump, restart the mean
  there; one wild sample's influence is capped;
- thresholds are multiples of a **running estimate of the tracker's own noise** (winsorized, not censored
  — the censored version fed back and collapsed), capped at 76 px, under the 80 px target pitch. The same
  mode therefore suits a quiet centre, a noisy corner and different users;
- Steady and Gentle confirm a jump for 25 / 40 ms first: isolated excursions never show, at that cost.

Production module, synthetic replay, measured sigma, 33 Hz, rho 0.6 (motion = frame-to-frame RMS, px):

| Mode | Motion C / TR / BL: 14 Sep -> now | 1.5x noisier, C / TR | Same-target step arrives (ms): 150 / 80 / 60 / 40 / 30 px |
| --- | --- | --- | --- |
| Responsive | 8.0 / 12.2 / 11.9 -> **3.1 / 4.7 / 4.4** | 12.8 / 20.1 -> 4.9 / 7.6 | **0 / 0 / 0** / 152 / 182 |
| Balanced | 5.5 / 8.6 / 8.3 -> **2.2 / 3.2 / 3.1** | 9.1 / 14.9 -> 3.6 / 6.0 | **0 / 0 / 0** / 227 / 242 |
| Steady | 4.0 / 6.4 / 6.2 -> **1.6 / 2.3 / 2.2** | 6.8 / 11.5 -> 2.4 / 3.6 | 30 / 30 / 45 / 333 / 364 |
| Gentle | 3.2 / 5.1 / 4.9 -> **1.2 / 1.7 / 1.7** | 5.4 / 9.5 -> 2.2 / 2.8 | 61 / 61 / 318 / 409 / 500 |

Round 1 for comparison, Balanced: motion 1.5 / 2.2 / 2.3, steps 30 / 30 / 61 / 348 / 379 ms. **What is
still slower than the 14 Sep filter:** corrections under ~45 px (227 vs 61 ms at 40 px in Balanced). That
is close to a statistical floor, not a tuning choice: telling a 30 px shift from sigma ~13 px correlated
noise at 3 sigma needs ~200 ms of samples; the old filter "followed" them quickly only because it followed
the noise as well. **Cost of showing jumps at once:** an isolated spike is visible for one frame in
Responsive and Balanced (with 1 % spikes of 110 px, as visible as on 14 Sep). Steady hides them for 30 ms.
False restarts at measured noise: ~0 per minute; at 1.5x noise ~4.5 per minute in Balanced.

### 0.2 The space bar typed letters (pre-existing, HIGH, a wrong-key hazard)
`findBestKeyboardKey` chose, among keys whose bounds inflated by 55 px contained the gaze, the key with the
nearest **centre**. The space bar is 613 px wide at 1920x1040; measured on the live DOM, **23.3 % of the
points inside it were given to another key** (C 9.3 %, B 6.8 %, N 5.2 %, V 2.0 % — its whole upper band).
The cursor was then pinned to that letter's centre, the 45 px lock tolerance often kept it there, and
noise flipped the winner between neighbours: the juggling, and a way to type a letter while looking at
space. Now the key that **contains** the point wins, then the nearest rectangle **edge**; centre distance
only breaks ties (`src/utils/hitZoneExpansion.ts`; the same rule for non-keyboard targets in
`GazeCursor`). New rule: 0.0 % misattributed; equal-sized keys unchanged (0 % -> 0 %). Live check: gaze on
the bar's upper-left corner region typed spaces, and the only highlight ever shown was the bar's own.

A dwell also pinned the cursor to the target's **centre**, up to ~300 px from the gaze on the space bar,
and threw it back afterwards. Along any axis longer than 240 px the cursor now rests under the gaze, taken
once per dwell (`src/utils/dwellAnchor.ts`). Ordinary keys still pin to their centre.

### 0.3 Blinks and edge dropouts re-seeded the cursor (HIGH)
Every invalid sample reset the filter, so the first sample after each blink or stray edge sample was
displayed raw: a hop. Every loss still clears the live filter and target state at once and is never
selectable (two existing tests encode that and pass unmodified). But a *resumable* loss (`blink`, `lost`,
`oob`, `outside_window`) now **suspends** the display state, and the next valid sample **restores** it if the
loss lasted <= 400 ms, the screen and mode are unchanged, and the target still exists
(`python/main.py` `_suspend_display_state` / `_resume_display_state`). Focus loss, stale and reordered data
never resume. Hop after a 180 ms blink with a 29 px-off first sample: 29+ px -> under 10 px.

### 0.4 One intention pressed a key twice (pre-existing, HIGH)
Reproduced live: gaze dwelling on G, one mouse click on G -> `gg`. A caregiver clicking a control is
usually looking at it, so a dwell was running on the control under the mouse and nothing cancelled it.
`GazeCursor` now treats a trusted `pointerdown` as the owner of the interaction (the dwell is abandoned and
the normal cooldown starts) and swallows a trusted click on a control that gaze pressed within 500 ms.
Gaze presses are programmatic (`isTrusted: false`) and unaffected. Live after the fix: one click -> one `g`.
Mouse clicks themselves were never blocked in gaze mode (verified: `th t` typed by mouse with gaze ON).

### 0.5 Three dwell timing sets (maintainer decision; supersedes "exactly five durations")
Novices typically use 500-1000 ms; Majaranta, Ahola and Spakov (CHI 2009) measured a mean of 876 ms in
the first session and ~500 ms after an hour; OptiKey defaults to 1250 ms after a 250 ms lock-on.

| Group | Quick (the original) | **Balanced (default)** | Relaxed |
| --- | ---: | ---: | ---: |
| Typing | 500 | **900** | 1300 |
| Words & suggestions | 1000 | **1300** | 1700 |
| Communication | 1250 | **1600** | 2000 |
| Navigation & choices | 1500 | **1900** | 2400 |
| Deliberate actions | 2000 | **2500** | 3000 |

Three complete tables, one chosen in Settings -> Selection Speed; no sliders, multipliers or repeat
acceleration. Onset (250 ms) and cooldown are unchanged and additional. The embedded browser's two literal
whitelists are now the union of the sets, its fallback is 1900 ms, and `check:dwell-groups` fails if they
drift. Verified live: DOM attributes and the guide follow the set at once; a Relaxed dwell on the space bar
fired at 1531 ms (250 + 1300).

### 0.6 Gaze Offset X / Y: removed
They were wired (renderer -> `set_gaze_offset` -> backend). They were not useful: the measured error points
up-left at the centre, down-right at the bottom-right and 106 px left at the bottom-left, so one global
shift only moved the fault, and the screen-bounds rejection ran before the offset, leaving a strip along
the opposite edge unreachable. Saved offsets are normalized to 0 so none keeps acting invisibly.

### 0.7 Settings scroll and mouse lag: not reproduced
Settings is a plain native scroll container. With gaze streaming at 33 Hz on that screen: 0.027 ms of
handler time per gaze frame, **no long task over 50 ms** in 5 s, a 30 ms timer held 30.0 median / 32.3 max,
and wheel scroll moved the panel at once. During the maintainer's test two other agent sessions were
running builds and replay checks on this 4-core machine with under 1 GB of RAM free, which is the likelier
cause. Retest with nothing else running before treating it as an app defect.

### 0.8 Verified this round
Quick Words round trip (Keyboard -> Quick Words -> "Water" -> choose phrase -> Keyboard, draft kept and
phrase appended); Show Gaze Cursor OFF (cursor opacity 0, element kept for the dwell ring); the tracker
notice on screen. Python **152** pass (edge stability 17, filter 19, mapping 9, transport 16, prediction
pipeline 17, deterministic 62, Windows scripts 12). JS: gaze-safety **17**, dwell-groups **15**,
browser-gaze-safety 24, browser-cursor 19/19, word-slots 76 + 18, English-only, food content, dev startup
7, floor-plan transport 10, TTS routing. `typecheck`, `build:electron`, `build` pass (large-chunk warning
remains, 743 kB). **Method limit:** the embedded preview pane runs `requestAnimationFrame` at 0 fps unless
painting, so dwell *timing* there needed a timer shim; timing claims rest on the virtual-clock harness.
**Still not done on the tracker:** everything in this section.

---

## 1. What was wrong, in one paragraph

The cursor filter's "hold" was tuned on a synthetic 2 px / 133 Hz signal. The real Eye Tracker 5
delivers ~33 Hz with a 5–18 px spread per axis. With a 2.5 px hold radius the hold is **never entered**
(0 % in every mode, at every screen position), so the cursor mirrored the jitter for the whole fixation:
40–80 px of wander, 5–13 px of motion *every frame*, on a 70 px cursor. At the screen edges, two
per-sample boundary tests wiped the filter and target state on every stray sample, so the display
degenerated to raw samples interleaved with freezes. And when the tracker could not see the user, the
helper sent one `timeout` and went permanently silent, with nothing in the interface saying why.

## 2. Two findings that correct the handover

| Handover claim | What the evidence shows |
| --- | --- |
| §5.1 "bistable free ↔ lock oscillation" | The hold is never reached at all: **0.0 % locked** in all four modes at all five positions (`test_previous_hold_thresholds_never_engage_under_measured_noise`). There is no oscillation; the published zone flickers only between `settling` and `travel`. Same cause, different mechanism. |
| §5.4/§11 "vendor stream dead while everything reports healthy" | Probing the engine directly showed `Connected`, device `Tracking`, screen `0,0 1920x1080` (527×296 mm) — and **`UserPresence = NotPresent`, `GazeNotTracked`**. The tracker saw no eyes. The 20 Sep session had no presence information, so it could not tell a wedged vendor stack from a tracker re-seated after the replug. The *app* defect is confirmed and identical either way: permanent silence with no explanation. Reproduced: 0 valid samples in 8 s, exactly one `timeout` line. |
| §5.6 offset "scaled wrongly" | **Not a bug.** The offset is CSS px; `out_x` is a fraction that both backend (`main.py:1246`) and renderer multiply by `innerWidth`. Dividing by `screen_width` is correct; dividing by `content_w` would be wrong under zoom. |

## 3. Verified coordinate transformations (static trace, file:line)

| # | Stage | In | Operation | Out | Where |
| --- | --- | --- | --- | --- | --- |
| 1 | Helper | Physical px, primary screen | `x / GetSystemMetrics(0)` after `SetProcessDpiAwarenessContext(-4)`; no clamp | Fraction of primary display, may be <0 or >1 | `Program.cs` `OnGazeData` |
| 2 | Conditioner | Fraction | Valid only if `0 ≤ x,y ≤ 1`, else `OUT_OF_BOUNDS` | Fraction | `signal_conditioner.py:73` |
| 3 | Screen → desktop DIP | Fraction | `x * css_screen_width + screen_origin_x` (dpr ignored because renderer sends `screenUnits:'css'`) | DIP | `main.py` `_screen_to_window_normalized` |
| 4 | → content-relative | DIP | `− window_x`, `/ content_w` | Content fraction | same |
| 5 | Manual offset | CSS px | `+ offset / screen_width` (once, backend only) | Fraction | same |
| 6 | Window test | Fraction | outside `[0,1]` → invalid (now with edge tolerance, §4.2) | — | `main.py:1305-1335` |
| 7 | → px, filter, identity, magnet | CSS px | `* screen_width`; one filter; identity from the estimate; bounded pull | CSS px | `main.py:1342-1352` |
| 8 | Wire | CSS px | `/ screen_width`, clamp; `intent_x/y` = unfiltered mapped | Viewport fraction | `main.py` payload |
| 9 | Renderer | Fraction | `* window.innerWidth`; `alpha = 1` for `adaptive_cursor_v1` (no second smoother) | CSS px | `GazeCursor.tsx` `handleGaze` |
| 10 | Browser view | Host CSS px | `− view bounds` once (renderer), `/ zoom` in, `* zoom` out | Page CSS px | `useGazeBrowser.ts`, `electron/main.ts` |

Geometry is polled every 250 ms and on resize/focus, so window moves and display changes are stale for
at most ~250 ms. The window is frameless and maximised to the work area: **content is 1920×1040 on the
1080 display**, so the bottom keyboard row sits against a window boundary (this matters in §4.2).
No scale or offset is applied twice. DPR is consistently omitted (everything is DIP/CSS). Unverified at
runtime: 125 %/150 % scaling, multi-monitor, main-window zoom ≠ 1 (the browser-view mapping assumes 1).

## 4. Confirmed defects and fixes

### 4.1 Key flicker — hold thresholds below the noise floor (HIGH) · `python/services/adaptive_cursor_filter.py`
One variable changed: **the hold**. Settle/travel time constants, the 12→80 px travel ramp and
`settle_before_hold_ms` are the 14 Sep values, asserted equal in a test.
- Hold/release radii re-derived from the measured spread (`:44`): Balanced holds within 30 px
  (≈2.3σ of the noisier axis at centre) and releases beyond 44 px (≈3.4σ). Every mode releases below
  64 px, under the 80 px minimum target pitch, so a move to a neighbour always escapes.
- A hold now **follows the fixation slowly** (`_hold`, `:149`) instead of freezing where it began, so it
  converges on the fixation centre and small corrections still arrive.
- **One far sample no longer ends a hold** (`:129`): release needs the sample to stay far for
  `release_confirm_ms` — elapsed time, not a sample count (one extra sample at 33 Hz).
- The previous numbers are kept as `LEGACY_FILTER_PROFILES` (`:54`). Fed those, the new code reproduces
  the old filter **exactly** (max difference 0.0 px, identical zones across 40 traces).
  `GAZECONNECT_CURSOR_TUNING=legacy` selects them at runtime: an on-rig A/B or rollback with no rebuild.

### 4.2 Corner/bottom juggling — reset storms at two boundaries (HIGH) · `python/main.py`
There are **two** per-sample tests, not one: the conditioner's out-of-*screen* check and the
out-of-*window* check. Both called `_invalidate_gaze`, wiping the filter and target state. They now share
`_edge_sample_is_tolerated` (`:1236`). The rejection itself is unchanged: a tolerated sample is **never
published and never clamped onto a border control**; it simply may not destroy state. It is tolerated
only if all hold: the stream is live; it is ≤ 64 px beyond the edge; the last accepted gaze was resting
within 128 px of *that* edge (a glance from mid-screen to the taskbar is still invalidated at once); and
the run has lasted ≤ 70 ms. Tolerated samples do not refresh the stale guard, so the existing 150 ms rule
bounds the mechanism independently. Side effect removed: stray edge samples were also being fed to the
fatigue monitor as invalid, i.e. counted toward blinks.

### 4.3 Hold identity taken from raw coordinates (MEDIUM) · `main.py:1348-1350`
The filter is updated first, then target identity is taken from the **new estimate**. Order matters: my
first attempt (identity before the update) delayed `backend_on_key` release by a sample and failed an
existing test, which encodes the right principle. Now a confirmed departure moves the estimate and the
identity together, while a lone spike the filter ignores cannot flip identity either.

### 4.4 Helper silent on a dead/absent stream (HIGH) · `tobii-helper/TobiiGazeHelper/Program.cs`
The helper subscribes to the engine's own state and sends a `status` line on change and at 1 Hz
(`BuildStatus` `:303`, `DeriveStreamState` `:284`), so silence is never indistinguishable from a dead
helper. Recovery is deliberately narrow: **only** "engine says gaze is tracked for 3 s, yet no sample"
(`StreamIsStalled` `:221`) re-creates the `Host`, with 6/12/24/30 s backoff, then exits code 3 so
Electron's supervisor starts a clean process. Nobody looking is normal and is never "repaired" — the
handover's literal "no sample for N seconds → re-create" would thrash the vendor stack every time the
user looked away. `Host` disposal runs off-thread and outside the lock, so a wedged engine cannot hang
recovery. Backend forwards `tracker_status` on change and in the handshake (`main.py:1257-1280`, `:3330`);
the renderer shows a display-only notice after the state has persisted (`TrackerStatusNotice.tsx`).
Previously `tobiiConnected` was exported by the WebSocket hook and read by nothing.

### 4.5 Magnetism (MEDIUM) — evaluated, not changed
Pull is `p·(1−d/R)²·d`, maximal at `d = R/3`: the largest possible displacement is **3.4 px** keyboard,
**8.0 px** prediction, 1.0 px navigation, 8.3 px gaze toggle. It cannot mask a 38 px median error or reach
a neighbour. `prediction` has release 100 < radius 112, which contradicts the runtime clamp's stated
invariant but is inert: capture happens at 0.82·R = 91.8 px, inside the release radius, and the pull at
that distance is ≈1 px.

### 4.6 `isUsableGaze` off-screen branch (LOW) — unchanged
Still unreachable in production and still worth keeping. Off-screen safety is now evidenced on the
production path by `test_gaze_edge_stability.py`, not by that renderer unit test.

## 5. Before / after (synthetic replay, measured σ, 33 Hz, ρ = 0.6)

Steady fixation, **Balanced** (the default). σ and peak-to-peak in px; "motion" is frame-to-frame RMS,
which is what reads as flicker. Raw σ is the input and is, by construction, the same before and after.

| Position | Raw σ (x, y) | Cursor σ before → after | Peak-to-peak before → after | Motion before → after | Held before → after |
| --- | --- | --- | --- | --- | --- |
| Centre | 5.3, 13.1 | (3.9, 10.0) → (2.3, 6.6) | 54 → 29 | 5.6 → **1.4** | 0 % → 100 % |
| Top-left | 14.0, 10.2 | (10.9, 7.9) → (5.2, 4.5) | 49 → 25 | 6.9 → **1.9** | 0 % → 100 % |
| Top-right | 10.3, 20.5 | (7.6, 17.1) → (4.4, 9.1) | 81 → 44 | 8.9 → **2.3** | 0 % → 100 % |
| Bottom-right | 10.4, 7.9 | (7.8, 5.4) → (4.1, 2.6) | 41 → 19 | 5.4 → **1.4** | 0 % → 100 % |
| Bottom-left | 17.3, 9.2 | (13.1, 7.4) → (7.3, 4.3) | 65 → 41 | 8.4 → **3.0** | 0 % → 98 % |

With 1 % single-sample spikes of 110 px, the old cursor's peak-to-peak reaches 125–182 px at the four
positions a spike landed on; the new one stays within 30 px everywhere. Bottom-row key, apparent gaze 12 px inside the window edge: resets **2.93/s → 0.43/s**,
held **60 % → 93 %**, motion **4.9 → 2.4 px**.

**The cost, stated plainly.** With target identity unchanged (the hardest case), a move to a neighbouring
key (120–150 px) arrives one sample later: 30 ms in Responsive/Balanced/Steady, 61 ms in Gentle. The
smallest possible move, 80 px, takes 30 ms (91 ms in Gentle). A small shift *inside* the
release radius is followed slowly in the calmer modes: a 50 px correction arrives in ~61 / 76 / 545 /
758 ms (Responsive / Balanced / Steady / Gentle). That is the calm-versus-agility trade and the reason
four modes exist.

**Latency.** Backend processing per sample, 49 registered keys, `perf_counter`, n = 5800:
before median 66 µs, p95 125, p99 210; after median 65 µs, p95 124, p99 241 (0.2 % of a 30 ms
interval; machine had 0.8 GB free). This excludes sensor latency, helper→backend transport, WebSocket,
rendering and display. End-to-end was **not** measured this session.

## 6. The four modes

All four change movement response only. None changes a selection duration, onset, cooldown or a
tracking-loss safeguard. Numbers: hold / release radius, hold time constant, release confirmation.

| Mode | Values | Measured (worst of 60 fixations) | Who it is for |
| --- | --- | --- | --- |
| **Responsive** | 26 / 38 px, 160 ms, 25 ms | motion ≤ 7.0 px, held ≥ 93.5 %, ≤ 0.5 breaks/s | Steady eyes, good calibration, wants the cursor to follow small corrections at once. Most visible shimmer. |
| **Balanced** (default) | 30 / 44 px, 260 ms, 25 ms | motion ≤ 4.6 px, held ≥ 94 %, ≤ 0.34 breaks/s | A first-time user. Calm on a key, 30 ms to a neighbour, 76 ms for a 50 px correction. |
| **Steady** | 36 / 52 px, 400 ms, 25 ms | motion ≤ 2.8 px, held ≥ 97 % | More tremor or a noisier setup (glasses, reclined, off-centre). Small corrections take ~0.5 s. |
| **Gentle** | 42 / 60 px, 560 ms, 40 ms | motion ≤ 1.1 px, held 100 % | The calmest picture. Tolerates two-sample excursions (blink edges). Neighbour in 61 ms; small corrections ~0.75 s. |

No mode suits everyone. These are engineering starting values derived from **one operator's one session
on one machine**; Papa's noise may be larger. Compare modes with the same person, display and task.

## 7. Selection safety

| Requirement | Evidence |
| --- | --- |
| Stable fixation → exactly one activation; invalid/stale/non-finite/reordered cannot activate; renderer stall cannot complete a dwell; long loss needs fresh dwell; disabled target cannot commit | `npm run check:gaze-safety` — **12 pass** (10 existing + 2 new), at 768 and 1080 px |
| Hiding the roaming cursor changes no selection rule | 2 new checks above (same onset, dwell, loss, stall, disabled behaviour with `showGazeCursor:false`) |
| Off-screen / off-window gaze never reaches a control; never clamped to a border; sustained outside invalidated within 70 ms + one sample; far or unexpected departures invalidated at once; a lost stream is never revived | `test_gaze_edge_stability.py` — **11 pass** |
| Departure releases backend target identity on that sample | existing `test_on_key_releases_after_short_hold_when_leaving_target` |
| Browser path: one owner per request, stale rejection, cancel before mouse-down | `check:browser-gaze-safety` 24 pass; `check:browser-cursor` 19/19 |
| Five fixed durations untouched | `check:dwell-groups` 11 pass; `dwellTimeConfig.ts` not modified |

Not tested this session (need a person and the live app): look-away on hardware, blink policy on hardware,
word changing under gaze, screen-change cancellation, reconnect not triggering an action, prolonged real
use. **New finding, not fixed (browser path, from the static trace):** when the in-page hit-test returns
null, a `sticky_resume` request is synthesised from the stale target rect and the commit guard accepts
it, so a target removed or covered mid-dwell can yield a native click on whatever now occupies that
point (`electron/browser/browserGazeController.ts` ~1716-1735, 2059-2060). Worth its own change with a
replay scenario.

## 8. Real Tobii observations vs synthetic replay

| Real hardware, this session | Synthetic / static |
| --- | --- |
| Engine state with nobody present: `Connected / Tracking / NotPresent / GazeNotTracked`; tracked screen 1920×1080, 527×296 mm | Everything in §5 and §6 |
| Old helper: 0 valid samples in 8 s, one `timeout`, then silence (§5.4 reproduced) | Edge-tolerance and identity results |
| New helper compiles 0 warnings / 0 errors; a draft of it ran in the operator's live session (§9) | Coordinate table (§3) |
| **Corrected helper, 7 s on the tracker (05:56, app closed):** first `status` 61 ms after connect, then a 1 Hz heartbeat (999–1023 ms); `stream_state = no_user`; `recoveries = 0` (absence is not treated as a fault); engine tracked-screen bounds `[0,0,1920,1080]` equal the helper's 1920×1080 normalisation basis | — |
| **Not obtained:** fixation jitter, accuracy, end-to-end latency, stalled-stream recovery, the on-screen notice, the hidden-cursor option | — |

The noise model's spread is real (20 Sep). Its temporal correlation (ρ) and spike rate are **assumed**;
results are shown for ρ = 0 and 0.6 and with/without spikes, and the capture will replace the assumption.

## 9. Operational incident worth knowing

`start-dev.bat` rebuilds the helper before launching. The operator started the app seconds after my
first draft of `Program.cs` was saved, so that session ran the **draft** helper (verified: the live DLL
contained the new `stream_state` field). Its gaze path is the original logic; it additionally sent status
lines that the then-unmodified backend logged. No harm found, but it is the reason every later edit was
applied atomically and compile-checked, and why `src/` was touched last. Also caught before use: my
capture tool probed port 5555 by *connecting*, which would have displaced the live backend (the helper
serves one client). It now checks by binding; verified against the running app without disturbing it.

## 10. What you need to do, in order

1. **Quit the app fully**, then start it again with `.\start-dev.bat` (this rebuilds the helper).
   Closing the window only hides GazeConnect to the system tray (`electron/main.ts:1218`); the backend and
   helper keep ports 8765/5555, and the launcher then refuses with "Port 8765 is already in use". Use the
   tray icon → **Quit**, or the in-app **Exit App**.
   Look for the amber notice top-right when you look away for 4 s or unplug the tracker.
2. **Settings → Gaze Control → Show Gaze Cursor → OFF.** The roaming circle disappears; the highlight and
   the dwell ring still appear on the item you look at. The embedded web browser keeps its own pointer,
   because arbitrary web pages have no per-item highlight.
3. **Record once** (app closed, ~80 s, follow the dots):
   `python\.venv\Scripts\python.exe tools\gaze_fixation_capture.py`
4. **Hardware before/after on your own eyes:**
   `python\.venv\Scripts\python.exe python\tests\gaze_filter_bench.py tools\reports\gaze-capture-<stamp>.csv`
   It prints measured σ, lag-1 correlation and the BEFORE/AFTER table per mode.
5. A/B on the rig without rebuilding: `set GAZECONNECT_CURSOR_TUNING=legacy` then `.\start-dev.bat`.
6. Stalled-stream recovery on hardware (app closed, look at the screen): run the helper with
   `--test-stall-first-host`; expect `Stalled stream` then `Host #3 created` then `Gaze samples resumed`.

Re-run what changed: `python\.venv\Scripts\python.exe -m unittest discover -s python\tests -p "test_gaze_edge_stability.py"`
(and `test_adaptive_cursor_filter.py`, `test_pipeline_mapping.py`, `test_gaze_transport.py`), `npm run check:gaze-safety`.

## 11. Verification run and working tree

Python: edge stability 11, cursor filter 15, pipeline mapping 9, gaze transport 16, prediction pipeline 17,
deterministic prediction 62, Windows scripts 12 — **all pass**. JS: gaze-safety 12, dwell-groups 11,
browser-gaze-safety 24, browser-cursor 19/19, word-slots 76 + 18 — **all pass**. `typecheck`,
`build:electron`, `build` pass (Vite large-chunk warning still present, 741 kB). `npm run lint` still has
no ESLint configuration (pre-existing, not addressed). Installer still never built.

Working tree after round 2 (nothing committed).
Modified: `AGENTS.md`, `README.md`, `docs/windows-local-testing.md`, `electron/main.ts`,
`electron/browser/browserGazeController.ts`, `python/main.py`, `python/services/adaptive_cursor_filter.py`,
`python/tests/test_adaptive_cursor_filter.py`, `scripts/browser-cursor-replay.js`,
`scripts/check-dwell-groups.cjs`, `scripts/check-gaze-safety.cjs`, `src/components/GlobalNavBar.tsx`,
`src/components/QuickFires.tsx`, `src/components/core/GazeCursor.tsx`,
`src/components/settings/panels/AppSettingsPanel.tsx`, `src/config/dwellTimeConfig.ts`,
`src/contexts/DwellTimeContext.tsx`, `src/hooks/useWebSocket.tsx`, `src/services/CustomizationService.ts`,
`src/services/defaultCustomization.ts`, `src/types/customization.ts`, `src/utils/hitZoneExpansion.ts`,
`tobii-helper/README.md`, `tobii-helper/TobiiGazeHelper/Program.cs`.
New: `python/tests/gaze_filter_bench.py`, `python/tests/test_gaze_edge_stability.py`,
`src/components/core/TrackerStatusNotice.tsx`, `src/utils/dwellAnchor.ts`, `tools/gaze_fixation_capture.py`,
this report, and a `gaze-ui` entry in `.claude/launch.json` (a UI-only preview on port 5188).
Not mine: `src/index.css`, `src/refinement.css` and `src/utils/design.ts` also show as modified. A separate,
concurrent session is re-theming colours in this checkout; this work did not touch them.
Untouched by this work: themes, screens, board content, spatial layout, vendor DLLs. The two `electron/` edits are the
embedded browser's accepted-duration list and its fallback only; the separate session's sticky-ghost fix
to `browserGazeController.ts` lives in its own worktree and touches a different region of that file.

Tested on: Windows 11 Home 10.0.26200 x64, i5-1135G7, 7.7 GB (0.8 GB free), single 1920×1080 @ 100 %,
Tobii Experience 4.183.0.30025, ET5 `VID_2104&PID_0313`, WinUSB 2.5.0.5602, .NET SDK 8.0.425,
Python 3.12.6, Node 24.13.0. **No Windows 10, no other scaling, no second monitor.**

## 12. OptiKey comparison

The OptiKey 3.2.5 checkout reviewed on 14 Sep is not on this machine, so **nothing about OptiKey was
re-verified against source here**; this builds on `docs/optikey-gaze-reference-review.md`. The most
likely reason it feels smoother is one that review already records: by default OptiKey consumes the
vendor's **fixation** stream, a point that barely moves during a fixation, whereas GazeConnect consumes
the lightly filtered *gaze point* stream and until now added almost no damping. The new hold reaches the
same end independently — an estimate that converges on the fixation centre — while keeping the raw
stream for exit, which OptiKey's fixation stream does not offer. GazeConnect already had the other
principles (key-identity dwell, 250 ms onset, banked partial progress); its filter is elapsed-time based
where OptiKey's Kalman is per-sample. Trying the vendor fixation stream is a reasonable later experiment.
No OptiKey code was read, copied or translated in this session.

## 13. Is it ready for a supervised real-user trial?

**Not yet — and the gap is small and specific.** The changes are narrow, reversible at runtime, and
covered by 142 Python and 160 JS checks with nothing weakened. But the central claim, that the cursor is
now calm on *your* tracker, rests on replay with two assumed noise properties, and the helper's new code
has not yet run to completion against the tracker. Before a trial: (1) the 80-second capture and the
hardware before/after; (2) ten minutes of your own typing in Balanced, watching specifically for a
*wrong key being held* near key boundaries — a calm cursor is only better if it is calm on the right
key; (3) confirm the notice and the hidden-cursor option behave as described. Then a supervised trial is
reasonable, starting in Balanced, with Steady as the first thing to try if the picture is still busy.
Bottom-left accuracy (108 px error, median sample off-screen on 20 Sep) is a tracker/mounting limit that
no filter should hide: recalibrate, and check the tracker's position, before judging that corner.
