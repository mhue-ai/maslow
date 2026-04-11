# Maslow CNC Complete Reference Guide

---

## 1. Overview

### What Is the Maslow CNC?

The Maslow CNC is an open-source, community-driven CNC router designed to cut full 4' x 8' sheets of material at a fraction of the cost of traditional CNC routers. It was created by **Bar Smith (Barbour Smith)**, who studied electrical engineering at UC Santa Cruz and began the project in 2015. The first Kickstarter launched in 2016 with help from Hannah Teagle. All designs, firmware, and documentation are available on GitHub under the MaslowCNC organization.

### Versions

**Original Maslow:**
- Vertical, wall-mounted frame with the sled hanging from two chains
- Motors mounted at the top of the frame extend/retract chains to position the router sled
- Gravity assists positioning (the sled's weight keeps it against the workpiece)
- Control: Arduino Mega 2560 + custom motor shield, USB-connected to a PC running Ground Control or WebControl

**Maslow 4 (M4):**
- Horizontal (or angled) flat-sled design sitting directly on the spoilboard
- Four belts anchored at four corners replace the two-chain system
- Motors are mounted on the sled itself (not the frame)
- Control: Custom ESP32-based PCB with built-in WiFi; web browser interface (no software install needed)
- Raised over $822,000 on Kickstarter in August 2023 with 1,486 backers

---

## 2. Key Specifications

| Specification | Original Maslow | Maslow 4 |
|---|---|---|
| Cutting Area | 4' x 8' (1220 x 2440 mm) | 4' x 8' (1220 x 2440 mm) |
| Max X/Y Speed | ~1,000 mm/min | 2,500 mm/min (100 IPM) |
| Max Z Speed | Varies by setup | 300 mm/min (11 IPM) |
| Z-Axis Travel | Depends on z-axis kit | 70 mm (2.75") |
| Accuracy (center) | +/-1-2 mm | +/-0.4 to 0.5 mm |
| Accuracy (corners) | +/-2-5 mm | +/-0.5-2 mm |
| Encoder Resolution | Varies | 8,148 counts/rev |
| Controller | Arduino Mega 2560 | ESP32 (WiFi-enabled) |
| Drive System | 2 chains + gravity | 4 belts + current feedback |
| Power | 12V DC 5A (machine) | 24V (machine), 120-240V AC |
| Frame Angle | ~15-20 deg from vertical | Horizontal to ~20 deg from vertical |

---

## 3. Hardware Components

### Router/Spindle

The machine requires a compact router (not included). Recommendations differ by version:

**For Maslow 4: DeWalt DWP611** (DeWalt 26200 in Europe) -- The only router officially guaranteed to work out of the box with the M4. This is the manufacturer's primary recommendation. The team is exploring compatibility with Makita trim routers and spindles.

**For Original Maslow: Ridgid R2401 Trim Router** -- The most commonly used option for the original Maslow. Variable speed, electronic feedback for consistent RPM, spindle lock for easy bit changes, and soft-start motor.

**Makita RT0701C** -- Popular community alternative for both versions. Slim, ergonomic design with variable speed control (10,000-30,000 RPM). Slightly lighter than the Ridgid.

**Ridgid R22002 (2 HP)** -- More powerful option recommended by MakerMade for heavier cutting. Better for hardwoods and deeper passes but adds sled weight.

### Control Electronics

**Original:** Arduino Mega 2560 + custom motor controller shield + geared DC motors with encoders. Connected via USB to PC running control software.

**Maslow 4:** Custom PCB with ESP32 microcontroller, built-in WiFi/Bluetooth, 24V motor system with current feedback sensors on belts. Connect to "Maslow" WiFi network and control via any web browser.

### Z-Axis

The original Maslow's z-axis is its weakest point. Options range from the stock bungee-cord system to aftermarket kits:

- **MakerMade Z-Axis Kit:** Aluminum/steel construction, direct replacement for router base, improved depth repeatability
- **Meticulous Z-Axis (community):** Eliminates bungee cords entirely, superior rigidity, built into Metal Maslow and M2 designs
- **3DNoodle "Rigid Lift":** 3D-printable upgrade available on Thingiverse

The Maslow 4 includes two stepper motors with lead screws for z-axis control (70 mm / 2.75" travel).

---

## 4. Limitations

### Accuracy Degrades in Corners

This is the single most important limitation to understand. On the original Maslow, chain sag at the bottom corners can reach 48 mm, translating to roughly 1 mm of positional error. The sled becomes unstable in lower corners where lateral chain tension is lowest. Even the Maslow 4 sees reduced accuracy near the edges due to belt geometry. Practical guidance: keep critical features within the center 3' x 6' area if possible.

### Speed

The Maslow is slow compared to gantry-style CNCs. Practical cutting speed is around 1,500-2,000 mm/min (60-80 IPM). Faster speeds produce rounded corners instead of sharp cuts. The z-axis is especially slow at 300 mm/min. Plan for longer cut times on complex projects.

### Material Thickness

Maximum cutting depth is limited by z-axis travel (70 mm / 2.75" on M4) and router bit length. Through-cuts on 3/4" (19 mm) material are the sweet spot. Thicker stock requires multiple passes and longer bits, which increases deflection and reduces accuracy.

### Flat Sheets Only

The sled rides on top of the workpiece surface. The Maslow cannot cut 3D forms, curved surfaces, or thick blocks. It is designed for sheet goods.

### Requires Supervision

A high-speed bit cutting flammable sawdust means fire risk if the bit stops moving but the router stays on. Never leave the machine running unattended.

### Chain/Belt Maintenance

On the original, chains stretch over time and require periodic recalibration. On the M4, belt tension is managed automatically via current feedback, but belts still wear and should be inspected regularly.

---

## 5. Recommended Settings

### Feed Rates and Speeds by Material

| Material | RPM | Feed Rate (IPM) | Depth/Pass | Notes |
|---|---|---|---|---|
| Plywood (3/4") | 16,000-18,000 | 60-80 | 1/8" to 1/4" | Good starting material |
| MDF (3/4") | 18,000-24,000 | 60-80 | 1/8" to 1/4" | Very dusty; needs dust collection |
| Hardwood | 12,000-16,000 | 40-60 | 1/16" to 1/8" | Burn marks mean feed too slow |
| Softwood | 14,000-18,000 | 60-80 | 1/8" to 1/4" | Watch for tear-out |
| Acrylic | 12,000-18,000 | 50-70 | 1/16" to 1/8" | Chip removal critical |
| Aluminum | 8,000-12,000 | 30-50 | 0.01" to 0.03" | Single-flute upcut; use lubricant |
| HDPE/Plastics | 10,000-15,000 | 50-80 | 1/8" | Monitor for melting |

**General rule:** Depth per pass should not exceed 50-100% of bit diameter. Start at 50% (e.g., 1/8" depth for a 1/4" bit) and increase only if the cut sounds clean with no chatter.

### Spindle Speed Sweet Spot

For most Maslow work at typical feed rates, 5,000 RPM produces good chip size. For dedicated through-cuts in plywood/MDF, 18,000-24,000 RPM with a 1/4" compression bit at 60-80 IPM is a reliable starting point.

### Calibration

**Original Maslow:** Run calibration whenever the frame dimensions change. The process involves the sled moving to multiple grid positions while the software builds a mathematical compensation model. More grid points = slower but more accurate. Expect to spend significant time (potentially days) achieving good calibration across the full sheet.

**Maslow 4:** Simplified calibration via the web interface. Key parameters: Calibration Grid Width/Height (sets measurement area), Grid Size (number of points), and Calibration Force (800-1000 range; controls belt tension during measurement). Add 18" to width and height of work area in calibration settings for margin.

**Post-calibration:** Jog the sled to various positions and verify smooth, accurate movement. Cut a test square and measure with calipers.

### Frame Setup

- Motor spacing and rigidity are the most critical frame factors
- Any angle from horizontal to about 20 degrees from vertical works
- Work surface must be flat (any bow in the spoilboard causes cut imperfections)
- For the original Maslow: 120" top beam, 82" front crossmembers (standard plans)

### Sled Weight

Optimal sled weight is approximately 18 lbs (8.2 kg). Adding 15 lbs to the sled reduces chain sag error by about half on the original Maslow. Too heavy increases motor load; too light reduces accuracy.

---

## 6. Recommended Tools and Bits

### Router Bits (1/4" Shank)

**Compression Bits (Best Overall):**
Clean finish on both top and bottom surfaces. Ideal for plywood, MDF, and laminated materials. Cost about 4x more than standard bits but worth it for quality. This is the recommended default bit type for Maslow work.

**Upcut Bits:**
Excellent chip evacuation, clean bottom edge. Best for solid timber, plastics, and aluminum. Can cause fuzziness on the top surface.

**Downcut Bits:**
Superior top surface smoothness but poor chip evacuation. Creates fuzziness on the bottom edge. Good for v-carving and engraving where the top surface matters most.

**Recommended Purchase:** MakerMade 3-Pack (1 upcut, 1 downcut, 1 compression) -- covers all common use cases.

### Materials Guide

**Best for Maslow:**
- Baltic Birch plywood (clean cuts, dimensionally stable, premium)
- MDF (flat, smooth, dimensionally stable, but moisture-sensitive and very dusty)
- Standard sanded plywood (economical, good for structural projects)

**Good for Maslow:**
- Acrylic (signs, displays; clean cuts with proper bits and speeds)
- HDPE/hard plastics (workable with careful feed rates)
- Softwood sheet goods

**Possible but Challenging:**
- Aluminum (slow speeds, single-flute upcut bits, lubrication required)
- Hardwoods (the Maslow is not designed for solid hardwood; keep to thin stock or veneers)

**General rule:** The Maslow can cut anything a handheld router can cut. Stick to sheet goods for best results.

### Workholding

On a vertical or angled frame, gravity pulls finished pieces away from the workpiece. Workholding strategy:

- **Tabs** are essential for any closed shape. Use 3-4 tabs minimum distributed around the perimeter. Tab width should be at least 2x bit diameter (e.g., 5/8" for a 1/4" bit). Tabs are cut by hand after CNC work is complete.
- **Screws** into the spoilboard (heads must be 1/8" below surface to avoid bit collision).
- **Combination** of tabs + screws for larger/heavier pieces.

### Dust Collection

Dust collection matters more on the Maslow than most CNCs because MDF and plywood produce enormous amounts of fine dust, and the vertical orientation makes it harder to manage.

- Sled-mounted dust collection with 2" PVC to a shop vac is the most common approach
- Plan dust collection into your initial sled/frame design to avoid hose drag affecting accuracy
- The M2 dust collection sled (from MakerMade) includes embedded PVC elbows and an acrylic collection duct

---

## 7. Programming Best Practices

### Software Stack

| Purpose | Recommended | Alternatives |
|---|---|---|
| Machine Control (Original) | WebControl | Ground Control, MakerVerse |
| Machine Control (M4) | Built-in web UI (FluidNC) | N/A |
| CAD (Parametric/3D) | Fusion 360 (free for personal) | FreeCAD, OnShape |
| CAD (2D/Artistic) | Inkscape (free) | Adobe Illustrator, CorelDRAW |
| CAM | Fusion 360 CAM | Estlcam ($59), Carbide Create ($120/yr), Kiri:Moto (free) |

**MakerCAM** was historically popular but is now deprecated (it required Adobe Flash).

### Typical Workflow: Design to Cut

1. **Design** in CAD software. Export as DXF or SVG.
2. **Import into CAM** software. Define tool diameter, cut depth, inside/outside cutting direction, and safety height.
3. **Add tabs** to all closed shapes (3-4 per piece, distributed evenly).
4. **Generate G-code** (.nc file). Verify output contains only supported commands.
5. **Set up material** on the Maslow frame. Load router bit. Verify z-zero.
6. **Upload .nc file** to WebControl (original) or the M4 web interface.
7. **Run the cut.** Monitor continuously.
8. **Finish:** Let material cool, cut tabs by hand, sand edges.

### Supported G-Code

Maslow CNC supports a limited G-code subset:

- **G0** -- Rapid positioning (non-cutting moves)
- **G1** -- Linear interpolation (cutting moves)
- **G2** -- Clockwise arc
- **G3** -- Counter-clockwise arc (with limitations; use IJK notation rather than R for arcs)
- **G17** -- XY plane selection (default; the only plane supported)
- **M03/M04** -- Spindle on (both produce the same result; Maslow cannot determine direction)
- **M05** -- Spindle off

**Not supported / will cause errors:**
- G18, G19 (other plane selections)
- G40 (tool radius compensation)
- Complex canned cycles

When configuring a Fusion 360 post-processor for Maslow, output basic G-code with XYZ movements using G0, G1, and G2 commands only. Avoid tool compensation and unsupported plane selections.

### Design Rules for the Maslow

**Minimum feature size:** Keep features larger than 2x the bit diameter. Smaller features are unreliable due to calibration variability across the work area.

**Tab design:** Width at least 2x bit diameter + 1/8" safety margin. Height doesn't need to be full material thickness; shorter tabs are easier to remove by hand.

**Toolpath strategy:** Climb milling (tool rotation in same direction as feed) generally preferred for finishing cuts. Produces better surface quality and longer tool life, though it requires the workpiece to be well-secured.

**Lead-in/lead-out:** Use arc or tangent entry/exit to reduce tool marks at corners and edges. Prevents chipping and reduces stress on the bit.

**Nesting:** Arrange multiple parts on a single sheet to minimize waste. Leave at least 1" between parts and 2-3" from sheet edges (where accuracy is worst).

**Edge safety:** The sled can fall off the edge of the workpiece if positioned too close to the perimeter. Keep all toolpaths at least 1-2" from the sheet edges, or use a sacrificial border.

**Through-cuts:** Set cut depth to material thickness + 0.01-0.02" to ensure a clean through-cut into the spoilboard. Don't cut too deep into the spoilboard (wastes bit life and creates uneven surfaces for future work).

### Common Mistakes to Avoid

1. **Skipping tabs on closed shapes.** Pieces fall during cutting and ruin the job.
2. **Generating unsupported G-code commands.** Always verify your post-processor output. G40, G18/G19 will cause failures.
3. **Ignoring calibration.** The same file run twice is repeatable, but if calibration is off, both cuts will be inaccurate.
4. **Running too fast.** Corners round off at high feed rates. Slow down for detail work.
5. **Cutting too deep per pass.** Exceeding 50-100% of bit diameter per pass causes chatter, poor surface quality, and bit breakage.
6. **Not securing cables.** Loose USB, power, or serial cables cause mid-cut disconnections.
7. **Leaving the machine unattended.** Fire risk from a stalled bit in sawdust.
8. **Designing features near sheet edges.** Accuracy drops significantly in corners and along edges.
9. **Using R-notation for arcs in G-code.** IJK (incremental center) notation is more reliable on the Maslow.
10. **Not accounting for kerf.** The bit removes material equal to its diameter. Set inside/outside cut direction in CAM to compensate. A 1/4" bit removes 1/4" of material along the toolpath.

---

## 8. Quick-Start Cheat Sheet

**First Cut Recipe (3/4" Plywood)**

- Bit: 1/4" compression, 1/4" shank
- RPM: 18,000
- Feed rate: 60 IPM (1,500 mm/min)
- Depth per pass: 1/8" (3.2 mm)
- Total passes for through-cut: 6-7
- Tabs: 4 per piece, 5/8" wide
- Safety height: 0.25" above material

**Calibration Checklist**

1. Power on machine (or connect via WiFi for M4)
2. Lower z-axis fully (no bit installed) to establish zero
3. Run calibration routine (M4: set grid size, calibration force 800-1000)
4. Verify by jogging to multiple positions across the sheet
5. Cut a test square, measure with calipers
6. Re-calibrate only if frame dimensions change

**File Format Pipeline**

Design (Fusion 360 / Inkscape) --> Export DXF or SVG --> CAM (Fusion 360 / Estlcam / Kiri:Moto) --> Generate .nc G-code --> Upload to WebControl or M4 web UI --> Cut

---

## 9. Key Resources

- Maslow CNC official site: maslowcnc.com
- Maslow community forums: forums.maslowcnc.com
- GitHub repositories: github.com/MaslowCNC
- Maslow Community Garden (community projects): maslowcommunitygarden.org
- Maslow 4 documentation: maslowcnc.github.io/Maslow_4/
- MakerMade (kits and accessories): makermade.com
- WebControl: webcontrolcnc.github.io/WebControl/

---

*Compiled from official documentation, community forums, GitHub repositories, and technical reviews. April 2026.*
