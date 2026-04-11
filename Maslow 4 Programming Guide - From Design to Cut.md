# Maslow 4 Programming Guide: From Design to Cut

A complete beginner's guide to creating CNC sign projects on the Maslow 4. Covers the full pipeline from initial design through finished cut, with no prior CAD/CAM experience required.

---

## The Big Picture

Making something on the Maslow 4 involves four stages:

```
DESIGN → CAM → UPLOAD → CUT
(draw it)  (plan cuts)  (send to machine)  (make it)
```

Each stage uses different software, and the output of one feeds into the next. Here's what flows between them:

```
Your idea
  → Design software (Inkscape, Easel, etc.)
    → Vector file (.svg)
      → CAM software (KrabzCAM, Carbide Create, etc.)
        → G-code file (.nc)
          → Maslow 4 web interface
            → Physical cut
```

---

## Stage 1: Design (Drawing Your Project)

### Recommended Software (Ranked by Ease of Use)

#### Option A: Easel — Fastest Path for a Beginner
- **What**: Browser-based design + CAM in one tool (by Inventables)
- **Cost**: Free (account required); Pro version adds V-carving
- **URL**: https://easel.inventables.com
- **Best for**: Text signs, simple shapes, getting your first cut done today
- **Workflow**: Type text → arrange on canvas → export G-code directly
- **Limitation**: Free version lacks V-carving; less control over advanced designs

#### Option B: Inkscape + KrabzCAM — Best Long-Term Setup (Recommended)
- **What**: Inkscape = free professional vector editor; KrabzCAM = free browser-based CAM
- **Cost**: Completely free forever
- **URLs**: https://inkscape.org / https://mkrabset.github.io/pages/krabzcam/
- **Best for**: Custom artwork, logos, growing your skills over time
- **Workflow**: Design in Inkscape → export SVG → open in KrabzCAM → generate G-code
- **Learning curve**: ~2-3 hours of tutorials to get comfortable

#### Option C: Carbide Create — Best Single Professional Tool
- **What**: Desktop CAD/CAM application (by Carbide 3D)
- **Cost**: Free download with V-carving; Pro version for G-code export in v7+
- **URL**: https://carbide3d.com/carbidecreate/
- **Best for**: When you want one tool that handles everything professionally
- **Note**: Version 6 (still downloadable) has free G-code export; v7 requires Pro

#### Option D: F-Engrave — Best for V-Carved Text Only
- **What**: Specialized free V-carving tool (by Scorch Works)
- **Cost**: Free
- **Best for**: Classic engraved-look text signs — type text, set V-bit angle, export G-code
- **Workflow**: Type text → adjust parameters → export .ngc file directly

### Getting Started with Inkscape (Recommended Path)

**Install**: Download from https://inkscape.org (Windows, Mac, Linux)

**Set up your document**:
1. File → Document Properties
2. Set Display Units to **mm**
3. Set page size to match your material (e.g., 1220 x 2440 mm for a full sheet)

**Create text for a sign**:
1. Select the Text tool (press T)
2. Click on the canvas and type your message
3. Choose font and size from the toolbar
4. Position the text where you want it on your material

**Convert text to cuttable paths** (critical step):
1. Select your text
2. Path → Object to Path (Ctrl+Shift+C)
3. This converts the font outlines into vector paths the CNC can follow

**For single-line fonts** (faster cutting, simpler look):
1. Extensions → Render → Hershey Text
2. Select a font from the list, type your text
3. These fonts are actual single paths (not outlines) — cuts 50% faster

**Trace a logo or image to vectors**:
1. File → Import → select your image (PNG, JPG, etc.)
2. Select the imported image
3. Path → Trace Bitmap
4. Adjust "Brightness threshold" for detail level
5. Click OK — Inkscape creates vector paths over the image
6. Delete the original bitmap image (click it, press Delete)
7. Keep only the traced vector paths

**Export for CAM**:
1. Select All (Ctrl+A)
2. File → Save As → choose "Inkscape SVG (.svg)"
3. This SVG file goes into your CAM software next

---

## Stage 2: CAM (Creating Toolpaths)

CAM software turns your design into machine instructions. It decides how the router bit moves, how deep it cuts, and in what order.

### Understanding Toolpath Types

| Operation | What It Does | Visual Effect | Best For |
|---|---|---|---|
| **Profile** | Follows the outline of a shape | Clean cut edge, can go all the way through | Cutting sign shape out, cutting letters as separate pieces |
| **Pocket** | Clears all material inside a shape | Recessed/lowered area | Inset letters, recessed backgrounds, decorative areas |
| **V-Carve** | V-bit cuts at variable depth based on line width | Classic engraved look with sloped walls | Elegant text, fine detail, serif/script fonts |
| **Engrave** | Shallow single-line cut following a path | Thin scratched line | Decorative accents, single-line text, outlines |

### Typical Sign Strategies

**Raised Letters (most popular)**:
- Pocket the background around the letters (removes material)
- Letters stand proud above the recessed background
- Profile cut the sign border with tabs
- Paint the recessed area a contrasting color

**Engraved Letters**:
- V-carve the text (classic elegant look)
- Or pocket the letters (more modern, bold look)
- Profile cut the border

**Cut-Through Letters**:
- Profile cut each letter all the way through (letters fall out)
- Great for signs with backlighting
- Must add tabs to each letter to hold during cutting

### KrabzCAM Step-by-Step

1. Go to https://mkrabset.github.io/pages/krabzcam/
2. Upload your SVG file from Inkscape
3. Set your material dimensions and thickness
4. Select the vector paths you want to machine
5. Choose operation type:
   - **Pocket** for recessed areas
   - **Profile (outside)** for cutting shapes out
   - **Profile (inside)** for holes
   - **Engrave** for shallow line cuts
6. Set tool parameters:
   - Bit diameter: 6.35mm (1/4") for most work
   - Feed rate: 750-1500 mm/min (30-60 IPM) for Maslow
   - Depth per pass: 3-4mm (1/8")
   - Total depth: material thickness + 0.5mm for through-cuts
7. Add tabs for any through-cuts (minimum 4, evenly spaced)
8. Click Generate → preview the toolpath
9. Export as .nc file

### Carbide Create Step-by-Step

1. Launch Carbide Create, set material size and thickness
2. Set Z-zero to "Top of material"
3. Use the Text tool to type your sign text
4. Adjust font, size, and position
5. Go to the Toolpaths tab
6. Select text → choose operation:
   - **Pocket**: select 1/4" downcut bit, set depth 6-9mm
   - **V-Carve**: select 60° V-bit (auto-calculates depth)
   - **Profile**: select 1/4" bit, set full depth + 0.5mm, add tabs
7. Set feed rate: 1500 mm/min (60 IPM) for pockets, 750 mm/min (30 IPM) for through-cuts
8. Run Simulation to preview the cut
9. Export G-code as .nc file

### Operation Order (This Matters!)

When a sign has multiple operations, cut them in this order:

1. **V-carving / engraving first** — shallowest cuts while material is fully supported
2. **Pocket operations second** — removes interior material
3. **Profile/through-cuts last** — frees the piece; do this last so earlier cuts aren't disturbed

This sequence ensures maximum material support for precision operations and leaves structural cuts for the end.

### Tab Placement for Border Cuts

- Minimum **4 tabs** evenly distributed around the sign perimeter
- Tab width: at least 2x your bit diameter (e.g., 12mm for a 1/4" bit)
- Tab height: about half the material thickness
- Place tabs on straight edges (not corners) when possible
- After cutting, trim tabs flush with a hand saw or sanding block

---

## Stage 3: Upload to Maslow 4

### Preparing Your G-Code File

Before uploading, verify your .nc file:
- **File format**: ASCII text, extension .nc, .gcode, .ngc, or .tap
- **Line endings**: CR or LF (both work; avoid CR+LF which causes duplicate responses)
- **Supported commands**: G0, G1, G2, G3, G17, M03, M04, M05
- **Not supported**: G18, G19, G40, complex canned cycles
- **Arc notation**: Use IJK (incremental center) format, not R notation

### Uploading via Web Interface

1. Open http://maslow.fortmiller in your browser
2. Click the **Maslow** tab
3. Find the **Upload GCode** button (blue, upper right area of the interface)
4. Select your .nc file from your computer
5. The file appears in the dropdown menu once uploaded

### Alternative: SD Card

If the Maslow has an SD card configured, you can copy .nc files directly to the card and they'll appear in the file dropdown.

---

## Stage 4: Cutting

### Pre-Cut Checklist

**Material setup**:
- [ ] Secure material to the spoilboard (clamps, screws, or double-sided tape)
- [ ] Verify material is flat against the spoilboard
- [ ] Install the correct router bit (match what you specified in CAM)

**Z-axis zero (critical)**:
- [ ] Use Maslow tab jog controls to lower the bit until it just touches the material surface
- [ ] Press **Define Z Home** — this sets Z=0 at the material surface
- [ ] All G-code depth measurements reference from this point
- [ ] Getting this wrong means cuts are too shallow or too deep

**XY position**:
- [ ] Jog the sled to where you want the design's origin point on your material
- [ ] Press **Define XY Home** — this positions your design on the material
- [ ] The crosshair on the canvas shows where the design will be placed

**Final verification**:
- [ ] Select your file from the dropdown
- [ ] The design preview appears on the canvas — verify it looks right
- [ ] Check that the design fits within your material boundaries
- [ ] Router is ON and at the correct RPM
- [ ] Dust collection is running (if available)
- [ ] You are wearing safety glasses and hearing protection

### Running the Cut

1. Select your .nc file from the dropdown
2. Press the **Play** button (green triangle in the status bar)
3. The machine begins cutting — **stay nearby and watch**
4. The purple dot on the canvas shows real-time sled position
5. The crosshair shows the home position for reference

### During the Cut

- **Pause**: Press the pause button if you need to check something
- **Stop**: Press the stop button (square icon) to halt the job
- **Emergency**: Use the abort button (circle with line) for immediate stop
- After stopping, you'll likely need to clear the Alarm with `$X` via the ESP3D console
- Monitor for unusual sounds (chatter = too fast, screaming = too deep, silence = bit stopped)

### After the Cut

1. Let the machine return to home position
2. Turn off the router
3. Remove material from the spoilboard
4. Cut tabs flush with a hand saw or oscillating tool
5. Sand edges smooth
6. Apply finish (paint, stain, clear coat) as desired

---

## Bits You Need for Sign Work

| Bit | Use | Cost | Priority |
|---|---|---|---|
| 1/4" downcut flat endmill | Profile cuts, pockets (clean top surface) | $10-15 | **Must have** |
| 60° V-bit | V-carved text, engraving detail | $12-18 | **Must have** for V-carving |
| 1/8" downcut flat endmill | Fine detail, tight areas | $8-12 | Nice to have |
| 1/4" compression bit | Through-cuts (clean top AND bottom) | $15-25 | Nice to have |

A starter kit with these 3-4 bits runs $40-80 and covers all sign work.

**Bit selection rule**: Downcut bits give clean top surfaces (good for signs where the top face matters). Upcut bits give clean bottom surfaces and better chip evacuation. Compression bits give clean both sides (best for through-cuts).

---

## Feed Rates and Depths for Sign Materials

### Conservative Starting Settings (Recommended for Beginners)

| Material | Feed Rate | Depth/Pass | RPM | Notes |
|---|---|---|---|---|
| Pine / Cedar | 750 mm/min (30 IPM) | 3-4mm | 16,000-18,000 | Soft, forgiving |
| Plywood 3/4" | 625-750 mm/min (25-30 IPM) | 3mm | 16,000 | Glue layers dull bits faster |
| MDF | 500-625 mm/min (20-25 IPM) | 2.5-3mm | 16,000 | Very dusty, wears bits fast |
| Hardwood (oak, maple) | 500-750 mm/min (20-30 IPM) | 1.5-2mm | 12,000-16,000 | Take light passes |

### Through-Cut Settings (More Conservative)

| Material | Feed Rate | Depth/Pass | Notes |
|---|---|---|---|
| Any wood | 500-750 mm/min (20-30 IPM) | 2.5-3mm | Less support = more conservative |
| Final pass | Reduce feed 25% | Same depth | Cleaner edge on final pass |

**Golden rule for the Maslow**: When in doubt, go slower. The Maslow's belt kinematics don't handle aggressive cuts as well as rigid gantry machines. You can always speed up after successful test cuts.

---

## Fonts That Work Well for CNC Signs

### For V-Carving (Use Outline/Serif Fonts)
- **Serif fonts** (Times New Roman, Georgia, Garamond) — the thick/thin stroke variation creates beautiful depth with V-bits
- **Script fonts** (Brush Script, Pacifico) — elegant flowing look
- **Any font with varied stroke widths** — the V-bit translates width to depth automatically

### For Profile/Pocket Cutting (Use Bold/Sans-Serif)
- **Thick sans-serif** (Arial Black, Impact, Bebas Neue) — bold, readable from distance
- **Stencil fonts** — letters have bridges so they don't fall out when cut through
- **Single-line/stick fonts** (Hershey Text in Inkscape) — fastest cutting, clean engineering look

### Stencil Fonts: Critical for Cut-Through Signs
If you're cutting letters all the way through, you MUST use a stencil font. Regular fonts have enclosed areas (the inside of O, A, D, etc.) that would fall out. Stencil fonts have small bridges connecting these islands to the surrounding material.

### Font Size Guidelines
- Minimum letter height for readability: 25mm (1") with a 1/4" bit
- For V-carving: letters can be smaller (15mm+) since the V-bit is finer
- Outdoor signs meant to be read from distance: minimum 75mm (3") letter height

---

## Common Mistakes to Avoid

### Design Mistakes
1. **Not converting text to paths** — CAM software can't read font data; always Path → Object to Path in Inkscape
2. **Using non-stencil fonts for through-cuts** — enclosed areas (O, A, D, etc.) fall out
3. **Designing too close to material edges** — Maslow accuracy drops at edges; keep 50mm+ margin

### CAM Mistakes
4. **Wrong cut direction** — "Inside" vs "Outside" profile makes your part the wrong size; always simulate first
5. **Forgetting tabs on through-cuts** — pieces shift mid-cut, ruining the work
6. **Feed rate too aggressive** — start at 30 IPM, increase only after success
7. **Not accounting for bit diameter** — a 1/4" bit removes 1/4" of material; the CAM software compensates if you set tool diameter correctly
8. **Wrong Z-zero reference** — if CAM says "top of material" but you zero on the spoilboard, all cuts are wrong depth

### Machine Setup Mistakes
9. **Skipping Z-zero setup** — always touch-off and press Define Z Home before cutting
10. **Material not secured** — loose material shifts during cutting; clamp or screw it down
11. **Wrong bit installed** — double-check the bit matches what you specified in CAM
12. **Not checking the preview** — always verify the on-screen preview matches your intent before pressing Play

### During-Cut Mistakes
13. **Leaving the machine unattended** — fire risk from a stalled bit in sawdust
14. **Not listening** — chatter means you're cutting too aggressively; change sounds mean something went wrong
15. **Panicking and hitting emergency stop** — use regular Stop first; emergency stop may lose position

---

## Your First Project: Step-by-Step "HELLO" Sign

Here's a complete walkthrough for your very first CNC sign:

### Materials Needed
- 1 piece of pine or plywood, ~300mm x 150mm x 19mm (12" x 6" x 3/4")
- 1/4" downcut flat endmill
- Clamps or screws to hold material

### Using Easel (Fastest Method)

1. Go to https://easel.inventables.com, create free account
2. Click "New Project"
3. Set material: width 300mm, height 150mm, thickness 19mm
4. Click the Text tool (T icon)
5. Click on canvas, type "HELLO"
6. Adjust font size to fill most of the material
7. Click the text, set Cut Type to "Fill" (pocket)
8. Set depth to 6mm
9. Set bit to 1/4" flat endmill
10. Click "Machine" → select "Other" → set up for GRBL
11. Export G-code → save as hello_sign.nc

### Using Inkscape + KrabzCAM

1. Open Inkscape
2. Type "HELLO" with the text tool, size ~100pt, bold sans-serif font
3. Select text → Path → Object to Path
4. File → Save As → hello.svg
5. Open https://mkrabset.github.io/pages/krabzcam/
6. Upload hello.svg
7. Select all letter paths
8. Choose "Pocket" operation
9. Set: bit diameter 6.35mm, feed rate 750 mm/min, depth per pass 3mm, total depth 6mm
10. Generate → export as hello_sign.nc

### Cutting on the Maslow

1. Secure your material to the spoilboard
2. Install the 1/4" downcut bit in the router
3. Open http://maslow.fortmiller → Maslow tab
4. Click Upload GCode → select hello_sign.nc
5. Jog Z down until the bit just touches the material surface
6. Press **Define Z Home**
7. Jog XY to center the design on your material
8. Press **Define XY Home**
9. Select hello_sign.nc from the file dropdown
10. Verify the preview looks correct
11. Turn on the router (speed dial to ~4 for 16,000 RPM on the DeWalt DWP611)
12. Press **Play**
13. Watch the cut — it should take about 10-15 minutes
14. When done, turn off the router
15. Remove material, sand edges, and admire your first CNC sign!

---

## Quick Reference Card

### Software Pipeline
```
Inkscape (free) → SVG → KrabzCAM (free) → .nc → Maslow web UI → Cut
```

### Maslow 4 Cutting Checklist
```
[ ] Material secured
[ ] Correct bit installed
[ ] Z touched off + Define Z Home pressed
[ ] XY positioned + Define XY Home pressed
[ ] File uploaded and selected
[ ] Preview verified
[ ] Router ON at correct RPM
[ ] Safety gear on
[ ] Press Play
[ ] Stay and watch
```

### Emergency Reference
- **Pause cut**: Pause button in web UI
- **Stop cut**: Stop button (square icon)
- **Emergency stop**: Abort button (circle with line)
- **Clear alarm after stop**: Send `$X` via ESP3D console
- **Fire**: Turn off router immediately, have extinguisher ready

---

*Compiled April 2026. Based on Maslow 4 documentation, FluidNC specs, community forums, and hands-on testing.*
