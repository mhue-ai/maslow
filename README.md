# Maslow CNC Studio

A browser-based design → preview → cut workflow for the [Maslow 4](https://www.maslowcnc.com/)
CNC router. Bring in a design (SVG **or** a PNG/JPG it traces for you), pick what
you're making, and the app generates Maslow-ready G-code — then previews the
toolpath in 3D and streams it to the machine over Wi-Fi.

Built to be **beginner-friendly**: you choose a material and a bit, and the app
derives the feeds, speeds, and pass depths for you. The raw machine numbers are
still there under an "Advanced" toggle for anyone who wants them.

---

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (flat config, `eslint.config.js`) |

**Stack:** React 19 · TypeScript · Vite 8 · Zustand (state) · Three.js via
`@react-three/fiber` + `drei` (3D preview) · `js-angusj-clipper` (polygon
offset / boolean ops for toolpaths).

---

## Run on a Raspberry Pi

The app is a static site that talks to the Maslow over WebSocket straight from
the browser, so a Pi just needs to **build it and serve the files** — no
backend, no database. A Pi on the same network as the machine makes a tidy
always-on controller you can open from any phone, tablet, or laptop.

```bash
git clone https://github.com/mhue-ai/maslow.git
cd maslow
bash scripts/install.sh            # or: PORT=80 bash scripts/install.sh
```

The installer (Raspberry Pi OS / Debian) is idempotent and:

1. Installs Node.js (LTS via NodeSource) if it isn't already present.
2. `npm ci` + `npm run build`.
3. Installs and starts a **systemd service** (`maslow-studio`) that serves the
   built app on boot — using `scripts/serve.mjs`, a dependency-free Node static
   server (works fully offline).

When it finishes it prints the URL, e.g. `http://<pi-ip>:8080`.

| Task | Command |
|---|---|
| Update to latest | `bash scripts/update.sh` (pull → rebuild → restart) |
| Service status | `sudo systemctl status maslow-studio` |
| Live logs | `journalctl -u maslow-studio -f` |
| Stop / start | `sudo systemctl stop\|start maslow-studio` |

**Touchscreen kiosk (optional).** To auto-open the app fullscreen on a Pi with
a display, install Chromium and launch it in kiosk mode pointed at the local
URL — e.g. add to the desktop autostart:

```
@chromium-browser --kiosk --app=http://localhost:8080
```

> The Pi scripts are written for Raspberry Pi OS (apt + systemd) and pass
> syntax + local server checks, but have **not** been validated on physical Pi
> hardware yet — review before relying on them for a machine that cuts.

---

## The workflow

The app is a guided three-stage flow shown across the top:

### 1 · Design

First choose **what you're making** — this picks the cutting strategy:

| Intent | What it does |
|---|---|
| **✂ Cut Out** | The bit follows your lines and the parts come free from the sheet. Auto-adds holding tabs on through-cuts. |
| **╱ Score** | Cuts just the outlines of the areas you mark as *relieve* (plus any island inside them); you clear the waste between by hand. |
| **◳ Carve** | Pocket-clears lowered areas — signs, trays, reliefs — with a per-shape depth set in the Shapes list. |

Then set up the cut:

- **Material** — pick a preset (plywood / MDF / hardwood / acrylic in common
  sizes) to auto-fill dimensions and community-tuned feeds & speeds, or enter
  your own.
- **Bit** — pick a router bit (½″ / ¼″ / ⅛″ / 1⁄16″). Diameter, stepover, and a
  safe depth-per-pass are derived from it.
- **Add your design** — drop an `.svg`, or a **PNG/JPG that gets traced** into
  cuttable paths (with a live threshold slider), or start from a built-in
  example (Coaster / Hanging sign / Shelf bracket).
- **Inline checks** flag the common mistakes in plain English: design bigger
  than the material, bit wider than the finest detail, or a through-cut with no
  holding tabs (one click to add them).

### 2 · Preview

A full 3D view of exactly what the machine will do — the toolpath, a rendered
view of the finished workpiece, estimated run time, and an animated simulation.
Catch mistakes here, not in the wood. You can also load an existing `.nc` /
`.gcode` file to inspect it.

### 3 · Cut

Connect to the machine over WebSocket (ESP3D / FluidNC), set zero, and run.
First time on a machine, calibrate the belts. Always start with a **Dry Run**
(bit stays up). Includes jogging, a pre-flight checklist, an always-visible
**E-STOP** (realtime feed-hold + soft-reset), and job history.

---

## Repository layout

```
src/
  App.tsx              Guided shell: stage rail + intent chooser
  store/               Zustand stores (designStore, machineStore, uiStore)
  types/               Material / tool / bit presets + shared types
  svg/                 SVG parse + normalize, image tracer, scaling, shape conversion
  gcode/               Toolpath generators + geometry
    gcodeGenerator.ts    Carve (pocket clearing + profile, Z-level scheduled)
    outlineToolpath.ts   Score (relief + island outlines, kerf offset)
    cutToolpath.ts       Cut Out (bit follows the line)
    clipperOps, profileCut, pocketClearing, islandDetection,
    depthPasses, zLevelAnalysis, boundsCheck, sledClearanceCheck, gcodeWriter
  studio/              Carve mode + SHARED design panels/viewport used by all modes
    panels/              MaterialPanel, SvgImportPanel, BitPicker, AdvancedSection,
                         DesignChecks, ToolSettingsPanel, GcodeExportPanel, examples…
    viewport/            2D SVG preview, 3D design viewport, overlays
  outline/             Score mode (OutlineMode + its panels)
  cut/                 Cut Out mode (CutMode + its panels)
  visualizer/          Preview stage — 3D toolpath + rendered workpiece + sim
  machine/             Machine Control — connection, jog, calibrate, run, firmware…
  comms/               WebSocket client + status/MINFO parsers
  components/          Onboarding tour
  utils/               File save, job history
```

> Note: `src/studio/` keeps its name for historical reasons — it now holds the
> **shared** design infrastructure used by all three modes, plus the Carve mode
> itself. See the header comment in `src/studio/FullMode.tsx`.

---

## Machine

- **Model:** Maslow 4 (horizontal sled, 4-belt system)
- **Controller:** ESP32 with FluidNC firmware
- **Router:** DeWalt DWP611
- **Cutting area:** 4' × 8' (1220 × 2440 mm)
- **Web UI:** `http://maslow.fortmiller`

---

## Safety notes

- This software drives a physical router. The machine-streaming paths (E-stop
  sequence, abort-on-disconnect, GRBL buffer accounting, jog gating) are reasoned
  against the GRBL/ESP3D protocol and verified in software, but **bench-test
  E-stop and a deliberate mid-job disconnect on your own machine before a
  production cut.**
- The image tracer is a high-contrast **silhouette** tracer (logos, clip art,
  stencils), not a photo vectorizer.
- Always preview, then dry-run, before cutting.

---

## Reference docs

Machine-operation references (about the physical Maslow and its FluidNC web UI,
not this app) live in [`docs/`](docs/):

| File | Description |
|---|---|
| [`docs/MASLOW_SKILLS.md`](docs/MASLOW_SKILLS.md) | Operational reference for remote machine control — web UI layout, commands, belt state machine, troubleshooting |
| [`docs/Maslow 4 Programming Guide - From Design to Cut.md`](docs/) | Beginner's guide: design software, CAM toolpaths, G-code upload, cutting workflow |
| [`docs/Maslow CNC Complete Reference Guide.md`](docs/) | General Maslow knowledge: specs, materials, feed rates, design rules, G-code reference |
| [`docs/Maslow 4 Troubleshooting Log.md`](docs/) | Dated session log — belt extension debugging, Z-axis testing, diagnostics |

Example/design files are in [`assets/`](assets/).
