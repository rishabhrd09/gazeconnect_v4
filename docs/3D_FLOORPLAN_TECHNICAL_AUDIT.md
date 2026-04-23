# 3D Floor Plan Integration: Technical Audit & Feasibility Report

**Project:** GazeConnect Pro (AAC Medical App)
**Date:** 2026-02-25
**Scope:** Evaluating the proposed "2D floor plan to 3D render" plan against the existing compass map system

---

## Table of Contents

1. [Executive Summary & Verdict](#1-executive-summary--verdict)
2. [What We Already Have](#2-what-we-already-have)
3. [Pipeline-by-Pipeline Feasibility Analysis](#3-pipeline-by-pipeline-feasibility-analysis)
4. [The Critical Constraint: Gaze Control](#4-the-critical-constraint-gaze-control)
5. [Recommended Implementation Path](#5-recommended-implementation-path)
6. [APIs & Libraries Required](#6-apis--libraries-required)
7. [What We Can Skip Entirely](#7-what-we-can-skip-entirely)
8. [Risk Assessment](#8-risk-assessment)
9. [Road Ahead: Phased Implementation](#9-road-ahead-phased-implementation)

---

## 1. Executive Summary & Verdict

### Is this feasible? YES - with important caveats.

The proposed plan is technically sound and well-researched. However, **not all 5 pipelines are appropriate for GazeConnect Pro**. The plan was written generically for any floor plan app - our app has unique constraints (gaze/dwell-based input, ALS patients, dark mode, no scrolling) that eliminate some options and change the priority of others.

### Verdict by Pipeline

| Pipeline | Feasibility | Recommended? | Effort | Why |
|----------|-------------|--------------|--------|-----|
| **1. Trimesh -> GLB -> R3F** | HIGH | YES (Primary) | 2-3 days | Perfect fit. We already have coords in JSON. Under 100 lines Python + 1 React component |
| **2. Blender Headless** | MEDIUM | NO (not now) | 5-7 days | Overkill. Adds 300MB+ dependency, 30s-5min render time. Save for v3.0 |
| **3. Puter.js AI Render** | MEDIUM | MAYBE (Tier 2) | 1-2 days | Zero cost but requires user Puter accounts. Not suitable for medical app primary flow |
| **4. ControlNet Local** | LOW | NO | 3-5 days | Requires 8GB+ VRAM GPU. ALS patients' machines may not have this. Produces 2D images, not interactive 3D |
| **5. Three.js Client-Side** | HIGH | YES (Alternative) | 2-3 days | Zero Python changes. Builds 3D directly from compass_map JSON in browser. Slightly less clean than Pipeline 1 |

### The Winner: Pipeline 1 (Trimesh -> GLB -> React Three Fiber)

**Why:** We already have structured room coordinates (`{x1, y1, x2, y2}` in feet) in the compass_map JSON. We already have a Python Flask server at port 5050. Adding one endpoint that extrudes rooms into 3D and exports GLB is trivial. The React Three Fiber viewer is a single component.

---

## 2. What We Already Have

### Our Existing Data Format (compass_map JSON)

This is the critical advantage the plan correctly identifies. Our data is **already parsed and structured** - we skip the hardest step entirely.

```
Existing coordinate format per room:
{
  "room": "Master Bedroom",
  "roomId": "masterBed",
  "cells": ["r2_c4"],
  "coords": { "x1": 30, "y1": 15, "x2": 40, "y2": 30 },
  "area_sqft": 150
}
```

This maps directly to Trimesh's `shapely.geometry.box(x1, y1, x2, y2)` -> `extrude_polygon()`. No parsing, no AI, no image analysis needed.

### Our Existing Rendering Pipeline

```
CompassMapScreen (React state)
  -> compileCompassPayload() -> JSON
  -> HTTP POST to Flask @ :5050
  -> PyCairo renders 2D PNG/SVG/PDF
  -> FloorPlanViewerModal displays result
```

The 3D pipeline would **parallel** this, not replace it:

```
Same compass_map JSON
  -> HTTP POST to Flask @ :5050 (new endpoint)
  -> Trimesh extrudes 3D mesh -> exports GLB
  -> New FloorPlan3DViewer component displays result
```

### Our Existing Python Libraries (relevant ones)

| Library | Already Installed | Needed for 3D |
|---------|-------------------|---------------|
| `shapely>=2.0.0` | YES | YES (polygon geometry for Trimesh) |
| `numpy>=1.24.0` | YES | YES (mesh math) |
| `flask>=3.0.0` | YES | YES (serve GLB endpoint) |
| `Pillow>=10.0.0` | YES | Optional (texture generation) |
| `trimesh` | NO | YES (must add) |

### Our Existing JS Dependencies

| Library | Installed | Needed |
|---------|-----------|--------|
| `react@18.2.0` | YES | YES |
| `three` | NO | YES (must add) |
| `@react-three/fiber` | NO | YES (must add) |
| `@react-three/drei` | NO | YES (must add) |

---

## 3. Pipeline-by-Pipeline Feasibility Analysis

### Pipeline 1: Trimesh -> GLB -> React Three Fiber

**Feasibility: HIGH (Recommended Primary)**

**What it does:** Python backend takes our compass_map room coordinates, extrudes each room as a 3D polygon (walls + floor), exports a single `.glb` file. React frontend loads and displays it with orbit controls.

**Why it fits GazeConnect:**
- We already have the exact data format Trimesh needs (`x1, y1, x2, y2` in feet)
- We already have a Flask server to add a new endpoint
- GLB files are small (typically 50-200KB for a floor plan) and cacheable
- React Three Fiber integrates cleanly with our existing React 18 setup
- Generation is sub-second (no GPU needed, pure geometry)

**What's needed:**
- Python: `pip install trimesh` (~5MB, pure Python + optional C speedups)
- JS: `npm install three @react-three/fiber @react-three/drei` (+840KB bundle)
- 1 new Flask endpoint: `/api/floorplan/3d/generate`
- 1 new React component: `FloorPlan3DViewer.tsx`

**Mapping our data to Trimesh (verified compatible):**

```python
# Our compass_map placement:
placement = {"coords": {"x1": 0, "y1": 0, "x2": 20, "y2": 15}}

# Direct Trimesh conversion:
from shapely.geometry import box
import trimesh

room_poly = box(0, 0, 20, 15)                    # Shapely polygon from our coords
walls = trimesh.creation.extrude_polygon(room_poly, height=9.0)  # 9ft walls
```

This is a 1:1 mapping. No transformation, no parsing, no AI. Pure geometry.

**Output quality:** Clean geometric 3D model with colored rooms, walls, and floor. Not photorealistic, but provides excellent spatial understanding. Interactive at 60fps in browser.

---

### Pipeline 2: Blender Headless -> Cycles Render

**Feasibility: MEDIUM (Not recommended for now)**

**What it does:** Script Blender's Python API to create room geometry, apply materials (wood floors, painted walls), add lighting, and render photorealistic images via Cycles ray-tracing.

**Why it DOESN'T fit GazeConnect right now:**
- Adds ~300MB binary dependency (Blender runtime)
- Rendering takes 30 seconds to 5 minutes PER FRAME
- Produces static 2D images (not interactive 3D)
- EEVEE (real-time renderer) requires OpenGL - doesn't work headless
- Cycles (ray-tracer) works headless but is slow
- Our installer is already ~250-300MB; this would nearly double it

**When it WOULD make sense:**
- If we add a "Premium Export" feature for sharing/printing
- If we deploy rendering to a cloud server (not on patient's machine)
- As a future v3.0 feature, not an initial integration

**Verdict:** Skip for now. Pipeline 1 gives interactive 3D immediately; photorealism can come later via Pipeline 3 or 4.

---

### Pipeline 3: Puter.js AI Render

**Feasibility: MEDIUM (Possible Tier 2 feature)**

**What it does:** Upload our floor plan PNG to Puter.js cloud, use AI models (FLUX.1 Kontext, GPT Image 1.5, etc.) to generate photorealistic interior renders. Zero developer cost - users pay from their Puter token allocation.

**Why it's interesting for GazeConnect:**
- Zero backend cost for us
- Zero API keys to manage
- 400+ AI models available
- Single `<script>` tag integration
- The Roomify tutorial proves this works end-to-end

**Why it's problematic for GazeConnect:**
- **Medical app concern:** Requiring ALS patients (or their caregivers) to create Puter accounts and manage token billing is a UX burden
- **Internet dependency:** Our app is designed to work offline (Tobii, Python backend, TTS all run locally). Puter.js requires internet
- **Output is 2D image:** Not interactive 3D - just a prettier picture
- **Unpredictable quality:** AI-generated images vary significantly between runs
- **Privacy:** Uploading home floor plans to a third-party cloud service may concern users

**How it COULD work as an optional feature:**
- "AI Render" button in the FloorPlanViewerModal (opt-in, not default)
- Only available when internet is detected
- Clear disclosure: "This sends your floor plan to Puter.js cloud for AI processing"
- Caregiver-managed feature (in settings, not primary patient UI)

**Integration effort (if we decide to add it):**

```html
<!-- Single script tag in index.html -->
<script src="https://js.puter.com/v2/"></script>
```

```typescript
// In FloorPlanViewerModal or new component
const generateAIRender = async (floorPlanImageUrl: string) => {
  const result = await puter.ai.txt2img(
    "photorealistic interior render, modern apartment, natural lighting",
    { model: "black-forest-labs/flux.1-kontext-pro", image_url: floorPlanImageUrl }
  );
  return result; // AI-generated image
};
```

**Verdict:** Feasible as an optional enhancement. NOT suitable as primary 3D solution. Add in Phase 3 if users request photorealistic renders.

---

### Pipeline 4: ControlNet / Stable Diffusion Local

**Feasibility: LOW (Not recommended)**

**Why it DOESN'T fit GazeConnect:**
- **Hardware requirement:** 8GB+ VRAM GPU minimum. ALS patients' machines are often standard laptops/desktops - we cannot assume gaming GPUs
- **Python dependency bloat:** `diffusers`, `torch`, `transformers` = 5-10GB+ of downloads
- **Produces 2D images:** Not interactive 3D
- **Top-down floor plan input produces top-down output:** ControlNet MLSD applied to a top-down floor plan generates a textured top-down view, NOT a perspective interior. To get perspective renders, you'd need to first render a perspective wireframe (which requires Pipeline 1 anyway)
- **Generation time:** 15-60 seconds per image even with GPU
- **Installer size:** Would add gigabytes to our ~300MB installer

**The only scenario where this makes sense:**
- If we deploy a cloud rendering server (not on patient's machine)
- AND combine with Pipeline 1 (render perspective wireframe -> feed to ControlNet)
- This is a v4.0+ feature at earliest

**Verdict:** Not feasible for our use case. Skip entirely.

---

### Pipeline 5: Three.js Procedural 3D (Client-Side Only)

**Feasibility: HIGH (Alternative to Pipeline 1)**

**What it does:** Build 3D rooms directly as Three.js `BoxGeometry` in React Three Fiber, without any Python backend changes. Reads compass_map JSON directly in the browser and constructs walls/floors as 3D meshes.

**Why it fits:**
- Zero Python changes (uses existing compass_map JSON as-is)
- Zero new server endpoints
- Purely additive (new React component only)
- Same JS dependencies as Pipeline 1 (`three`, `@react-three/fiber`, `@react-three/drei`)

**Why Pipeline 1 is slightly better:**
- GLB files are cacheable - generate once, load fast on subsequent views
- Server-side Trimesh can produce higher-quality geometry (proper wall thickness, boolean operations for wall-wall intersections)
- GLB includes materials, textures, and metadata in a standardized format
- Can be exported and opened in other 3D tools (Blender, SketchUp, etc.)
- Client-side Three.js procedural generation runs every time you open the viewer

**When to use Pipeline 5 instead:**
- If we want to avoid ANY Python changes
- If we want a quick prototype before investing in the Trimesh backend
- As a fallback if the Flask server is unavailable

**Verdict:** Excellent fallback. Could be Phase 1 (quick win) while Pipeline 1 is Phase 2 (production quality).

---

## 4. The Critical Constraint: Gaze Control

This is the most important consideration the plan doesn't adequately address. **GazeConnect Pro is a gaze-controlled AAC app for ALS patients.** Every interaction must work with eye-tracking dwell selection.

### Problem: Standard 3D Controls Don't Work with Gaze

| Standard 3D Control | How It Works | Gaze Compatible? |
|---------------------|-------------|------------------|
| Mouse drag to orbit | Continuous mouse movement | NO - gaze is imprecise, no "drag" |
| Scroll wheel to zoom | Wheel input | NO - no scroll wheel with gaze |
| Click to select | Single click | PARTIAL - dwell-click works but is slow |
| Keyboard WASD | Key press | NO - gaze users can't use keyboard |

### Solution: Compass-Based 3D Navigation (gaze-friendly)

Replace free camera controls with **discrete, button-based 3D navigation** using large gaze-dwell buttons:

```
+------+------+------+
| Rotate| Look | Rotate|
| Left  |  Up  | Right |
+------+------+------+
| Zoom  | 3D   | Zoom  |
|  In   | View |  Out  |
+------+------+------+
|      | Look |       |
|      | Down |       |
+------+------+------+
```

Each button is a standard GazeButton (min 80px, dwell-based) that moves the camera by a fixed increment:
- "Rotate Left/Right" = orbit camera 30 degrees
- "Look Up/Down" = tilt camera 15 degrees
- "Zoom In/Out" = move camera closer/further by 5ft

Additionally:
- **Preset views:** "Top Down", "Front View", "Walk-Through" buttons for instant camera positions
- **Auto-rotate:** Slow turntable mode (toggle on/off) for hands-free 3D overview
- **Room highlight:** Dwell on a room name in the legend to highlight it in the 3D model

### Implementation Approach

```typescript
// NOT this (requires continuous mouse input):
<OrbitControls />

// THIS (discrete gaze-friendly controls):
<GazeButton onClick={() => rotateCameraBy(30)}>Rotate Right</GazeButton>
<GazeButton onClick={() => setCameraPreset('topDown')}>Top View</GazeButton>
<GazeButton onClick={() => toggleAutoRotate()}>Auto Rotate</GazeButton>
```

---

## 5. Recommended Implementation Path

### Architecture: Additive, Non-Breaking

```
EXISTING (unchanged):
  CompassMapScreen -> Flask API -> PyCairo 2D -> FloorPlanViewerModal

NEW (added alongside):
  CompassMapScreen -> "View 3D" button -> FloorPlan3DViewer component
                  \-> Flask API -> Trimesh 3D -> GLB file -> R3F canvas
```

### New Files to Create

| File | Purpose | Size Estimate |
|------|---------|---------------|
| `tools/floorplan_3d_generator.py` | Trimesh: compass_map JSON -> GLB mesh | ~80 lines |
| `src/screens/FloorPlan3DViewer.tsx` | React Three Fiber viewer with gaze controls | ~200 lines |
| `src/components/FloorPlan3DControls.tsx` | Gaze-friendly camera control buttons | ~150 lines |

### Files to Modify (minimal changes)

| File | Change | Risk |
|------|--------|------|
| `tools/floorplan_server.py` | Add 1 new endpoint `/api/floorplan/3d/generate` | LOW |
| `src/components/FloorPlanViewerModal.tsx` | Add "View 3D" button | LOW |
| `python/requirements.txt` | Add `trimesh>=4.0.0` | LOW |
| `package.json` | Add three.js + R3F dependencies | LOW |

### New Flask Endpoint Spec

```
POST /api/floorplan/3d/generate
Content-Type: application/json

Request Body: Same compass_map JSON we already send for 2D generation

Response:
  Content-Type: model/gltf-binary
  Body: Binary GLB file

OR (alternative):
  Content-Type: application/json
  Body: { "glb_base64": "..." }  (for embedding in JSON response)
```

---

## 6. APIs & Libraries Required

### Python (pip install)

```
trimesh>=4.0.0          # Core: extrude polygons -> 3D mesh -> GLB export
                        # Dependencies: numpy (already have), shapely (already have)
                        # Size: ~5MB
                        # NOTE: For boolean operations (wall intersections),
                        # also install manifold3d: pip install manifold3d
```

That's it. One new Python package. Shapely and numpy are already installed.

### JavaScript (npm install)

```
three@^0.163.0                # Core 3D engine (~600KB minified)
@react-three/fiber@^8.0.0     # React bindings for Three.js (~40KB)
@react-three/drei@^9.0.0      # Useful helpers: Environment, useGLTF, etc. (~200KB)
@types/three                   # TypeScript types (dev dependency)
```

Total bundle impact: +840KB (~30% increase). For an Electron app bundled locally, this is negligible.

### APIs: No External APIs Needed

Pipeline 1 is entirely local:
- No cloud services
- No API keys
- No internet required
- No user accounts
- Works offline (critical for medical app reliability)

### Optional Future APIs (Phase 3+)

If we later add AI photorealistic rendering:

| Service | API | Cost | Notes |
|---------|-----|------|-------|
| Puter.js | `puter.ai.txt2img()` | Free for dev, user-pays | 30+ image models |
| Replicate | `replicate.run()` | $0.005-0.05/image | ControlNet, SDXL |
| OpenAI | `dall-e-3` | $0.04/image | Highest quality text-to-image |

None of these are needed for the initial 3D integration.

---

## 7. What We Can Skip Entirely

The plan mentions several technologies that are **irrelevant** for our use case:

| Technology | Why We Can Skip It |
|------------|--------------------|
| **HouseDiffusion** | Generates floor plans from scratch. We already HAVE floor plans |
| **CubiCasa5K / DeepFloorPlan** | Parses floor plan IMAGES into data. We already HAVE structured data |
| **SVG parsing (svgpathtools)** | Parses SVG files. We already have JSON coordinates - parsing SVG is a roundtrip |
| **PyMuPDF** | Extracts vectors from PDFs. Irrelevant - we generate PDFs, not consume them |
| **IfcOpenShell / BIM** | IFC is for professional architecture tools. Overkill for patient-facing visualization |
| **ControlNet MLSD** | Requires GPU, produces 2D, ALS machines may not have the hardware |
| **Blender headless** | 300MB dependency, minutes per render. Save for much later |
| **RPLAN dataset** | Training data for AI floor plan generation. We don't generate plans via AI |
| **Open3D** | Point cloud processing. We have clean geometry, not point clouds |
| **PyMesh** | Unmaintained. Trimesh is the better choice |

**Bottom line:** The plan's research is thorough, but ~60% of the referenced tools solve problems we don't have (parsing images, generating plans from scratch, training AI models). Our compass_map JSON means we start at the "modeling" step, skipping "parsing" entirely.

---

## 8. Risk Assessment

### Low Risk

| Risk | Mitigation |
|------|-----------|
| Three.js bundle size (+840KB) | Negligible for Electron local app |
| Trimesh Python dependency | Pure Python, minimal footprint, well-maintained |
| GLB file generation time | Sub-second for floor plan geometry |
| TypeScript integration | Three.js has excellent @types/three |

### Medium Risk

| Risk | Mitigation |
|------|-----------|
| **Gaze-friendly 3D controls** | Need custom compass-navigation buttons instead of OrbitControls. Requires careful UX design and testing with eye tracker |
| **WebGL compatibility** | Electron's Chromium supports WebGL 2.0, but some older integrated GPUs may struggle. Add fallback to 2D if WebGL unavailable |
| **Multi-cell room geometry** | Rooms spanning non-rectangular cell combinations (L-shapes from cellRects) need polygon union before extrusion. Shapely handles this but needs testing |
| **Advanced refinements** | SubCellSplits, customEdges, voidMarkers need mapping to 3D equivalents. Start without these, add incrementally |

### High Risk (if we choose wrong pipelines)

| Risk | Impact |
|------|--------|
| ControlNet requiring GPU | App crashes or hangs on machines without dedicated GPU |
| Blender binary distribution | Doubles installer size, complex cross-platform bundling |
| Puter.js in medical context | Privacy concerns, internet dependency, billing confusion |

**All high risks are avoided by choosing Pipeline 1.**

---

## 9. Road Ahead: Phased Implementation

### Phase 1: Interactive 3D Floor Plan Viewer (1-2 weeks)

**Goal:** "View 3D" button on the floor plan viewer that opens an interactive 3D model of the generated floor plan.

**Tasks:**
1. `pip install trimesh` + add to requirements.txt
2. Create `tools/floorplan_3d_generator.py`:
   - Parse compass_map JSON (reuse existing `parse()` function from v4/v5)
   - For each room: `shapely.box(x1, y1, x2, y2)` -> `trimesh.extrude_polygon(height=9)`
   - Add wall thickness (outer box - inner box = wall shell)
   - Color-code rooms using existing ROOM_LIBRARY colors
   - Export as `.glb`
3. Add Flask endpoint `/api/floorplan/3d/generate` in `floorplan_server.py`
4. `npm install three @react-three/fiber @react-three/drei`
5. Create `FloorPlan3DViewer.tsx`:
   - Load GLB with `useGLTF()`
   - Add `Environment` preset for ambient lighting
   - Add directional light + shadows
   - Implement gaze-friendly camera controls (preset views + compass buttons)
6. Add "View 3D" button in `FloorPlanViewerModal.tsx`
7. Test with eye tracker

**Deliverable:** Rotatable, zoomable 3D model of any generated floor plan, controllable via gaze.

### Phase 2: Enhanced 3D Features (2-3 weeks)

**Goal:** Richer 3D visualization with furniture, doors, windows.

**Tasks:**
1. Add door openings (subtract door-width box from walls)
2. Add window openings (subtract window-width box from walls, add glass plane)
3. Add basic furniture meshes (bed = box, table = box + legs, sofa = L-shape)
4. Add room name labels as 3D text or billboard sprites
5. Add floor texture (tile pattern for kitchen/bathroom, wood for bedrooms)
6. Add ceiling with option to hide (for top-down viewing)
7. First-person walkthrough mode (discrete movement between rooms via gaze)
8. Export GLB download button (users can open in Blender/SketchUp)

### Phase 3: AI Photorealistic Renders (optional, 1-2 weeks)

**Goal:** "Generate AI Render" button that produces a photorealistic image.

**Tasks:**
1. Integrate Puter.js as optional dependency (internet required)
2. Capture perspective screenshot from Phase 1 3D viewer
3. Send to Puter.js `txt2img()` with architectural prompt
4. Display AI render alongside 3D model
5. Add privacy disclosure and opt-in flow
6. This is entirely optional and additive

### Phase 4: Advanced Features (future)

- Multi-floor 3D (stack ground + first floor with staircase)
- VoidMarker visualization (openings between floors)
- Lighting simulation (sun position based on plot facing direction)
- AR/VR export (USDZ for iOS AR, WebXR for VR headsets)
- Blender Cycles server-side rendering for premium exports

---

## Appendix A: Referenced Repositories (Verified Useful)

| Repository | Stars | Use For | Priority |
|-----------|-------|---------|----------|
| `mikedh/trimesh` | 2900+ | Core 3D mesh library | MUST HAVE |
| `pmndrs/react-three-fiber` | 27K+ | React + Three.js integration | MUST HAVE |
| `pmndrs/drei` | 8K+ | R3F helpers (useGLTF, Environment, etc.) | MUST HAVE |
| `adrianhajdin/roomify` | 67 | Reference for Puter.js integration pattern | REFERENCE ONLY |
| `furnishup/blueprint3d` | 1800+ | Reference for 3D floor plan editor UX | REFERENCE ONLY |
| `grebtsew/FloorplanToBlender3d` | 529 | Reference for Blender pipeline (future) | FUTURE REFERENCE |

## Appendix B: Our compass_map -> 3D Mapping Reference

```
compass_map field          ->   3D equivalent
─────────────────────────────────────────────
coords.x1, y1, x2, y2     ->   Box polygon extents (feet)
area_sqft                  ->   Floor plane area
cells[]                    ->   Multi-cell room grouping
cellRects{}                ->   Per-cell sub-geometry (for L-shapes)
plot.width_ft              ->   Scene X dimension
plot.depth_ft              ->   Scene Z dimension
plot.facing                ->   Camera default orientation / sun position
advanced.customEdges       ->   Wall type (full/half/glass/none)
advanced.voidMarkers       ->   Floor cutouts (multi-story openings)
advanced.subCellSplits     ->   Room subdivision geometry
```

## Appendix C: Gaze-Friendly 3D Control Layout

```
+============================================+
|  [Top View]  [Front View]  [Walk-Through]  |   <- Preset camera buttons
+============================================+
|                                            |
|          +--------+--------+               |
|          |   /\   |  Zoom  |               |
|          | Rotate | + In   |               |
|          |  Left  |        |               |
|          +--------+--------+               |
|          |        |  Zoom  |               |
|          | Rotate | - Out  |               |
|          | Right  |        |               |
|          +--------+--------+               |
|                                            |
|        [Auto-Rotate: ON/OFF]               |   <- Turntable toggle
|                                            |
+============================================+
|  Room Legend (dwell to highlight in 3D)    |
|  [Master Bed] [Kitchen] [Living] [Bath]    |
+============================================+
```

All buttons are min 80px, work with standard GazeButton dwell timings.
Emergency nav bar remains visible at all times (GlobalNavBar at top).
