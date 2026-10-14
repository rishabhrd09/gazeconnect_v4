# Measured runs, 14 Oct 2026 (macOS only — not Windows evidence)

Machine: Apple M5 Pro, 64 GB, macOS 26.3.1. GazeConnect `fae945b`, its macOS venv (Python 3.11.15, pycairo 1.28.0,
shapely 2.1.2 / GEOS 3.13.1, ezdxf 1.4.3; OR-Tools not installed). FloorForge `be578f3`, its own `.venv`
(Python 3.11.15). Browser: Playwright 1.62.1's Chromium build 1234, headless, viewport 1366 x 768 unless noted.
House: `scripts/c1_spec.json` (40 x 60 ft, North-facing, G+1, house in rows 2-3).

## GazeConnect current pipeline (`scripts/probe_gc_c1.py`)
- Options (4 alternatives, all valid): 0.197 s. 2D screen sheets 0.082-0.099 s; A3 sheet PNG 0.093-0.096 s;
  3D cutaway 0.130-0.145 s; exterior PNG 0.314-0.348 s per angle; DXF 0.104 s; A3 PDF 0.106 s.
- Whole process for 13 outputs including imports: 2.61 s; peak RSS 128 MB (`/usr/bin/time -l`); 34 MB after import.

## Scratch plan-oblique top view (`scripts/proto_top.py`, 2400 x 1500 PNG)
- Ground 0.096 s (1,399 drawn faces), first 0.085 s (1,311); process peak 70 MB.

## FloorForge pipeline (`python -m floorforge generate`, project from `scripts/build_ff_c1.py`)
- 2.62 s wall, peak RSS 191 MB. Stages: scene 1.545 s, exports 0.465 s, sheets 0.028 s, layout 0.011 s.
- Outputs: 11 SVG sheets, drawings.pdf 63 KB, floorplans.dxf 263 KB, model.glb 870 KB, model.ifc 1.26 MB,
  scene.json 1.54 MB, preview.html 2.73 MB (viewer.js 1.14 MB inlined).
- The first layout (house in rows 2-4) was blocked by FloorForge's validator: care room below 16 m2 / 3.5 m,
  kitchen and care room without outside windows, unreachable stair hall. The layout was changed for both apps.

## FloorForge viewer (`scripts/measure_ff.mjs`, hero view, 1366 x 768)
| Backend | Quality | Ready | Frame median / max | 2400-px still | JS heap | Browser tree RSS |
|---|---|---|---|---|---|---|
| ANGLE Metal (GPU) | high | 0.59 s | 2.8 / 7.9 ms | 104 ms | 44 MB | 636 MB |
| ANGLE Metal (GPU) | performance | 0.59 s | 2.5 / 6.2 ms | 86 ms | 41 MB | 652 MB |
| SwiftShader (CPU WebGL) | performance | 18.8 s | unreliable (max 6.6 s) | 3.2 s | 35 MB | 1,527 MB |

Scene: 248 meshes, about 612,000 triangles, 152-155 textures, 265 geometries.
Idle WebGL2 page in the same browser (`scripts/baseline.mjs`): 262 MB (GPU), 334 MB (SwiftShader).
So the viewer itself adds about 374-390 MB on this GPU and about 1.19 GB with CPU WebGL.
Captures with settle waits: `floorforge_c1_viewer_captures.json` (browser tree 634-697 MB across 13 views).

macOS RSS includes shared pages and unified GPU memory; Windows private bytes will differ. None of these
figures is a Windows result.

## Look-development prototype (`scripts/lookdev.py`, house `scripts/c2_spec.json`)
Open living + dining + kitchen + stair hall, double-height living (first-floor void over r2_c3).
- Model, both floors (explicit doors, open-plan walls removed, void rules): 0.072 s.
- 2D plans: 0.06-0.08 s each. Top views (with blurred soft shadows): 0.16-0.19 s each.
- Perspective exteriors, 2400 x 1500: 0.18-0.21 s each (400-560 faces drawn after BSP splits).
- Process peak RSS 190 MB (full-resolution blur buffers; production blurs at half resolution).
