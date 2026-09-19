# Windows build, dependency and release audit

Audit date: 14 September 2026. This audit was performed on macOS against the working tree. It provides implemented build safeguards and portable checks; it does not certify an installer or Windows/Tobii runtime behavior.

## Findings and implemented changes

| Original behavior | Failure risk | Implemented behavior |
|---|---|---|
| `build-installer.bat` skipped failed/missing helper builds and fell back to framework-dependent publishing | An apparently successful installer could lack gaze support or require an unmentioned .NET installation | A missing DLL, build failure, wrong native architecture, missing runtime or missing executable fails the build |
| `start-dev.bat` killed all `electron.exe` instances and every listener on selected ports | Unrelated applications and work could be terminated | Inspect port owners and stop with a diagnostic; never terminate them |
| `--simulate` only changed batch messages | Hardware could still start in a purported mouse test | Launcher passes `GAZE_SIMULATE=1` to Electron; explicit hardware failures no longer silently change modes |
| Scripts depended on the caller's working directory | Double-click/from another directory could operate on the wrong files | Scripts resolve the checkout from their own location |
| Scripts installed into whichever Python/pip was active | Different interpreters/dependencies could be packaged | Explicit `python/.venv/Scripts/python.exe -m pip`, version/architecture checks and `pip check` |
| `npm install` changed dependency resolution | Build-to-build Node variation | `npm ci` in both setup and installer build uses the committed lock file |
| PyInstaller omitted smart bigrams, ONNX model and vocabulary | Packaged predictions silently lost functionality | Explicit static asset list and frozen model-load test |
| Packaged floor-plan service expected a Python interpreter and script absent from extraResources | Floor-plan functionality silently disappeared after installation | Separate `GazeConnectFloorplan.exe` bundle, Cairo/solver/API self-test and explicit Electron launch path |
| Python `--onefile` extracted its runtime at launch | Extra startup/disk work and temporary extraction | Separate `--onedir` backend/floor-plan bundles copied into installer resources |
| .NET 6 target | Unsupported runtime | .NET 8 x64, self-contained, no trimming/single-file; native compatibility validation still required |
| Every release directory was deleted before building | Previous installers/evidence lost on a failed build | Unique timestamp/ID release directories; only generated staging is replaced |
| Cleanup removed dependencies and releases indiscriminately | Unnecessary destructive cleanup | Generated outputs only by default; dependencies opt in; patient data and previous releases preserved; junctions refused |
| DLL refresh copied whichever files were found and claimed success | Partial/mixed input set | Complete-set PE/architecture validation before replacement, hashes reported |

Build scripts are Windows PowerShell 5.1 programs behind the original `.bat` entry points. `-ExecutionPolicy Bypass` applies only to that launched PowerShell process. No system execution policy, administrator elevation, driver installation, global package installation, DLL registration or third-party download/execute procedure is added. Standard npm/pip/.NET build tooling downloads dependencies from configured registries when needed.

## Developer workflow

Use a Windows x64 machine with a supported Node LTS, Python 3.10+ x64 with compatible dependency wheels (Python 3.12 x64 is a reasonable initial validation target), and the latest serviced .NET 8 SDK. Install Tobii Experience/drivers from Tobii and complete display setup/calibration separately.

```powershell
# Hardware development; approved local DLL inputs must already be present.
.\setup.bat
.\start-dev.bat

# Explicit mouse development; setup can omit the .NET/hardware build.
.\setup.bat -Simulate
.\start-dev.bat --simulate

# Finite build. Produces a local validation candidate, not a release approval.
.\build-installer.bat

# Existing build, only if you intentionally accept its age.
.\start-dev.bat --skip-build
```

Runtime logs are written under `tools/reports/dev-*.log`. Hardware mode fails if the helper cannot build; the launcher never pretends a fallback is a successful hardware launch. `--skip-build` intentionally uses the existing helper and should not be used for release verification.

The build stages both frozen Python services and the self-contained helper in a unique temporary directory. It verifies executables, vendor DLL architecture, the helper's `includedFrameworks`, static prediction assets and Python runtime files, then runs finite frozen self-tests. It builds frontend/Electron, stages only validated generated resources, invokes the installed `electron-builder`, verifies the actual `win-unpacked/resources` layout, reruns frozen tests there, and records installer SHA-256 values and a build manifest.

Expected packaged entry points are `resources/python/backend/GazeConnectBackend.exe`, `resources/python/floorplan/GazeConnectFloorplan.exe` and `resources/tobii-helper/TobiiGazeHelper.exe`. Each Python bundle carries its own `_internal` directory. Keep those directories intact. The frozen floor-plan entry binds to `127.0.0.1`.

The Python requirements currently use minimum-version ranges. Recording `pip freeze` makes a build auditable, **not reproducible**. A reviewed Windows dependency lock with hashes, a cached wheel/source inventory, a pinned PyInstaller version and a controlled build image are required before claiming reproducibility. Do not invent a lock from an untested macOS environment. The present scripts intentionally fail when native dependencies cannot be imported rather than installing random binary archives to conceal that problem.

## Distribution rights and release gates

The six Tobii binaries are already tracked in this repository. The repository's MIT license does not grant rights to those binaries. SDK copying from an installed application or from OptiKey is not evidence of licensing. Before public GitHub hosting or sharing an installer, obtain and retain written evidence covering the actual DLL versions, public source/binary hosting, redistribution, and this AAC/assistive-use case. Also inventory all other bundled dependencies and include their required notices.

Tobii's public download and developer agreement pages distinguish development rights from distribution and data-use rights; one public SDLA explicitly discusses AAC in its definition of Medical Use. The applicable agreement for these exact legacy Interaction DLLs must be established with Tobii. This document does not assert that a current public agreement necessarily governs these old files. Sources: [Tobii software downloads](https://developer.tobii.com/software-downloads-test/), [Tobii SDLA](https://developer.tobii.com/vr/sdla/), [Tobii Eye Tracking SDK](https://developer.tobii.com/eyex-sdk-/).

The default installer build sets `distributionApproved: false` and packages a release-status notice. It remains a **local validation candidate**. A release maintainer may use `-Distribution -ApprovalFile C:\path\release-approval.json` only after reviewing the evidence. The machine-readable record must contain:

```json
{
  "distributionApproved": true,
  "vendorAgreementReference": "Reference to the actual reviewed Tobii agreement/permission",
  "windowsHardwareTestReport": "C:\\release-evidence\\windows-test-report.md",
  "thirdPartyNoticesPath": "C:\\release-evidence\\THIRD-PARTY-NOTICES.txt",
  "vendorSha256": {
    "Tobii.Interaction.Net.dll": "actual SHA-256",
    "Tobii.Interaction.Model.dll": "actual SHA-256",
    "Tobii.EyeX.Client.dll": "actual SHA-256",
    "Tobii.EyeX.Common.dll": "actual SHA-256",
    "tobii_stream_engine.dll": "actual SHA-256",
    "Tobii.Tech.NETCommon.ClrExtensions.dll": "actual SHA-256"
  }
}
```

This is a maintainer attestation, not automated legal analysis. The build verifies required references/files and matching DLL hashes; it cannot determine whether a permission or human test report is adequate. It does not sign an installer automatically. Configure signing in the approved Windows build environment, then verify publisher identity and signatures on the final installer and installed application before distribution. Check security status of Electron 28 and every dependency before a public release; packaging fixes alone do not bring an old Electron branch into support.

[Microsoft's support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core) lists .NET 6 as out of support since 12 November 2024 and .NET 8 support ending 10 November 2026. .NET 8 is a short-term compatibility migration. Test a supported successor before that deadline, including the legacy Tobii assemblies. Windows 10 compatibility is distinct from Microsoft's support/security lifecycle; record the exact Windows editions/builds tested and their servicing arrangements.

## Required native verification before sharing

Run on clean Windows 10 and Windows 11 x64 machines/VMs, and hardware-equipped Windows systems. The build machine is insufficient because its installed SDKs/runtimes can hide missing native dependencies.

1. Parse every PowerShell file using the Windows PowerShell parser; run setup/build from a path containing spaces and from another working directory. Verify an unsupported interpreter, missing DLL, wrong x86 DLL, failing publish and occupied port each produce a nonzero result without launching another mode, packaging stale files or stopping any unrelated process.
2. Install under a standard user with **no Node, Python or .NET installed**. Test fresh install, launch, upgrade, uninstall and reinstall. Verify user settings/patient records remain under the managed user-data location and survive the intended upgrade flow; no write should require access to Program Files.
3. Test backend startup, offline word prediction/neural model, English TTS and floor-plan PNG/PDF/SVG/DXF generation. Confirm installed resources include native Cairo, ONNX and solver dependencies. Confirm no external Python/.NET process path is used.
4. Test Tobii connected before launch and connected after launch, calibration missing/invalid, unplug/replug, service restart, sleep/resume, user leaving/returning, one-eye/partial tracking, and stale/no-data periods. Gaze selection must stop when tracking is invalid and recover deliberately.
5. Test 100/125/150/200 percent scaling, mixed-DPI displays, negative virtual desktop origins, primary-display change and window movement. Verify screen-to-client mapping and edge selection with the correct calibrated display.
6. Record gaze-to-presentation latency distributions, callback/sample age, unintended selections, recovery time, CPU/RAM growth, process handle count and reconnect behavior over a long hardware session. Never present synthetic replay results as Tobii latency/accuracy measurements.
7. Verify SHA-256 and Authenticode of final artifacts; retain toolchain/dependency manifests, required notices, vendor permissions and signed acceptance reports alongside the exact installer. Revalidate after changing runtime, SDK DLLs, hardware drivers or gaze logic.

## Verification performed in this audit

- Portable failure-injection suite: `python3 scripts/windows/test_verify_windows_bundle.py` (9 tests) passed. Covers missing/corrupt DLLs, wrong native architecture, omitted model/runtime, framework-dependent publication and packaged resource layout.
- Current DLL set and static model assets: `python3 scripts/verify_windows_bundle.py source --root .` passed. PE architecture checks do not establish vendor authenticity, transitively required DLLs or runtime compatibility.
- No PowerShell interpreter, .NET SDK or Windows runtime is available on this Mac. PowerShell execution, .NET 8 compilation, PyInstaller Windows freezing, installer generation, Authenticode verification, clean-machine testing and physical Eye Tracker 5 measurements were **not performed** here. No shareable installer is claimed by this audit.

## GitHub source validation

`.github/workflows/windows-validation.yml` runs on pull requests or manual dispatch using a Windows hosted runner. It parses the scripts using Windows PowerShell, checks vendor PE inputs, runs release-validator failure tests, publishes the self-contained helper without starting it, and builds/checks frontend and Electron code. It has read-only repository permissions, no custom secrets, no release/upload steps and no installer publishing. A green run is source/build validation on a Windows server runner; it is not a Windows 10/11 hardware or installer acceptance result. Do not upload the repository's vendor binaries to GitHub until their hosting rights are established.

The workflow uses the supported action interfaces documented by [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [setup-python](https://github.com/actions/setup-python) and [setup-dotnet](https://github.com/actions/setup-dotnet). A controlled release pipeline should pin reviewed action commit hashes as well as the build image/toolchain.

The finite parser check can also be run locally: `powershell.exe -NoProfile -File scripts/windows/Test-Scripts.ps1`. The workflow was written here but was not dispatched.

An offline `npm audit --offline --json` returned zero cached advisories across 657 dependency entries on this machine. Since it did not fetch current advisories, this is **not a clean security audit**. Obtain a current advisory report and upgrade supported runtimes before public release; no dependency security certification is inferred from that offline output.

## Follow-up: local Windows testing and Zone Board

The current revision adds `check-windows.bat` for finite source/installed runtime checks and a report under `tools/reports/`; see [local testing steps](windows-local-testing.md). The dev launcher now refuses to open Electron when Vite times out or returns an HTTP error, and shuts down its paired task when the Electron/Vite task exits. Node x64 is checked explicitly.

Installed floor-plan calls now use a main-renderer-only Electron bridge with a fixed loopback host, an endpoint allowlist, request/response size bounds and deadlines. This resolves the installed file-origin CORS mismatch without allowing arbitrary origins or URLs. Native request routing, dependency self-tests and actual exported files still need Windows acceptance.

Zone Board uses five existing alphabet groups, six suggestions, a central current-word display and a top message display. Length hints and their local word-length dictionary were removed. Full-screen requests are idempotent and existing toggle callers remain compatible. Quick Phrases keeps the existing shared-text return path.

## Follow-up: deterministic word prediction (20 September 2026)

The default word predictor is now the deterministic engine in `python/services/deterministic_prediction/`; see [its README](deterministic-prediction/README.md). The legacy n-gram/ONNX engine remains bundled as a rollback.

- **Bundle contents.** The backend bundle adds `services/deterministic_prediction/assets` (six versioned tables, `manifest.json`, `licenses/`; 8.9 MB raw) and `english_only_policy.v1.json`.
- **Verification.** `verify_windows_bundle.py` checks every table and licence file against the manifest hashes in `source`, `stage` and `packaged` modes. Failure-injection coverage rose from 9 to 12 tests.
- **Self-test.** The frozen `--self-test` now also answers one prediction inline and one through a spawned worker process, and requires identical slots.
- **A second backend process.** The predictor runs in a worker process that re-enters `GazeConnectBackend.exe`, so Task Manager shows two backend processes. `backend_entry.py` calls `multiprocessing.freeze_support()`, so the child never starts a second server. The worker exits when the backend exits, including after Electron's hard kill; before this change it was measured surviving as an orphan.
- **Notices gate.** The distribution notices file must credit the prediction data sources listed in `python/services/deterministic_prediction/assets/licenses/`:
  - NGSL 1.2 and NGSL-Spoken (CC BY-SA 4.0 data);
  - SymSpell (MIT);
  - the Vertanen & Kristensson AAC corpus and the ImagineVille AAC language models (CC BY 4.0);
  - the context-prior dialogue corpora.

  These notices ship inside the backend bundle, but a notices file that travels with the installer is still required.
- **Native verification additions.** On Windows:
  - run the deterministic self-test staged and from `win-unpacked`;
  - confirm the worker process starts and exits with the app;
  - measure worker cold start and memory (about 100 MB);
  - exercise the ten-slot keyboard by gaze at 100–150 % scaling.

  The full list is in the README's "Remaining Windows and Tobii hardware checks".
