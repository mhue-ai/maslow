# Maslow 4 CNC — Complete Operational Skills Reference

This file is a comprehensive skills reference for remotely operating Mhue's Maslow 4 CNC machine via its web interface. Read this at the start of any Maslow-related session.

---

## Machine Identity

| Field | Value |
|---|---|
| Machine | Maslow 4 CNC (horizontal sled, 4-belt system) |
| Controller | ESP32 with FluidNC firmware |
| Firmware Version | v1.20 |
| Web UI Version | v1.19-64-g291dac60 (ESP3D for FluidNC) |
| Web Address | http://maslow.fortmiller |
| Router | DeWalt DWP611 |
| Cutting Area | 4' x 8' (1220 x 2440 mm) |
| Z-Axis Travel | 70 mm (2.75") via dual stepper + lead screw |
| Max XY Speed | 2,500 mm/min (100 IPM) |
| Max Z Speed | 300 mm/min (11 IPM) |
| Accuracy (center) | +/- 0.4-0.5 mm |
| Accuracy (edges) | +/- 0.5-2 mm |

---

## Web Interface Layout

The ESP3D web UI at http://maslow.fortmiller has **three tabs** across the top:

### 1. ESP3D Tab (grid icon, leftmost)
- **Dashboard** with jog controls (XYZAB axes), position readout, override/spindle controls
- **Commands console** at bottom right — text input field labeled "Send Command..."
- **SD Files** panel at bottom left
- Use this tab to send raw commands like `$X`, `$EXT`, `MINFO`, G-code, etc.

### 2. FluidNC Tab (middle)
- Firmware settings and configuration
- Machine parameters, motor settings, etc.

### 3. Maslow Tab (rightmost, Maslow logo)
- **Left panel**: Canvas with crosshair showing sled position
- **Right panel**: Jog controls with directional arrows
  - Z+/Z- buttons on the left edge (blue arrows with "Z" label)
  - XY directional arrows in the center (purple buttons)
  - Step size number in the center of jog pad (e.g., "2" for 2mm, "100" for 100mm)
- **Setup button** (gear icon, top right of jog panel) — opens the critical Setup dialog
- **Status bar** below jog panel: Play/Stop buttons, state indicator (Idle/Alarm/Home), coordinates (X, Y, Z, Xm, Ym, Zm)
- **Console output** at bottom right showing MSG:INFO messages
- **State display** at top: "State: Unknown", "State: Retracted", "State: Extending", etc.

---

## Setup Dialog (Critical for Belt Operations)

Click the **Setup** gear icon on the Maslow tab. Contains these buttons:

### Top Row (Belt Operations)
| Button | Function |
|---|---|
| **RETRACT ALL** | Pulls all 4 belts tight. Must run from Unknown state before extending. |
| **EXTEND ALL** | Puts motors in extend mode. **Requires manual pulling** — see below. |
| **APPLY TENSION** | Applies operating tension to belts (for cutting). |

### Middle Row (Operations)
| Button | Function |
|---|---|
| **FIND ANCHOR LOCATIONS** | Calibration routine — teaches machine where corners are. |
| **STOP** (orange) | Halts current operation. May trigger Alarm state. |
| **RELEASE TENSION** (green) | Loosens belt tension (opposite of Apply Tension). |

### Bottom Row (Diagnostics)
| Button | Function |
|---|---|
| **CONFIG** (purple) | Machine configuration |
| **TEST** (purple) | Runs I2C + motor/encoder diagnostic on all 4 corners |
| **SET Z-STOP** (purple) | Configures Z-axis limits |

---

## Critical Operating Procedures

### Startup Sequence
1. Navigate to http://maslow.fortmiller in browser
2. Click Maslow tab
3. Check state display at top — likely "State: Unknown" or "Alarm"
4. If in Alarm: switch to ESP3D tab, type `$X` in command input, press Enter
5. Machine should show "Idle"

### Belt State Machine (MUST FOLLOW IN ORDER)
```
Unknown → RETRACT ALL → Retracting Belts → Belts Retracted → EXTEND ALL → Extending Belts → (pull belts manually) → STOP → ready
```

**Key rule**: You CANNOT extend from Unknown state. Always RETRACT ALL first.

### How to Extend Belts
⚠️ **EXTEND ALL does NOT actively spool belt out.** The motors provide torque assist only.

1. From "State: Retracted" (or after running RETRACT ALL)
2. Click EXTEND ALL in Setup dialog
3. State changes to "Extending", fan turns on — this is correct
4. **Go to each corner and physically pull the belt outward**
5. Use a rocking motion to initiate — the motor will give way and feed belt
6. Pull desired amount of slack on each belt
7. Click STOP when done (or leave extending if still pulling)
8. Clear any Alarm with `$X` if STOP triggers one

### Z-Axis Jogging
Z-axis works independently of belts — no calibration needed.
- Z+ button: moves bit UP (away from material)
- Z- button: moves bit DOWN (plunge into material)
- Step size shown in center of jog pad (default 2mm)
- The Z- down arrow is at approximately coordinate (1022, 251) on the Maslow tab
- The Z+ up arrow is at approximately coordinate (1022, 133) on the Maslow tab

### XY Movement (REQUIRES CALIBRATION)
- XY jog commands are silently ignored if `"homed": false`
- Must complete calibration (FIND ANCHOR LOCATIONS) before XY works
- Jog command format: `$J=G91 X[dist] F[feedrate]` (send via ESP3D console)

---

## Essential Commands (Send via ESP3D Console)

| Command | Purpose |
|---|---|
| `$X` | Clear alarm state — always use after STOP or error |
| `$EXT` | Extend all belts (same as EXTEND ALL button) |
| `$RET` | Retract all belts (same as RETRACT ALL button) |
| `MINFO` | JSON status: homed, calibration, belt lengths |
| `$J=G91 Z2 F300` | Jog Z up 2mm at 300mm/min |
| `$J=G91 Z-2 F300` | Jog Z down 2mm at 300mm/min |
| `$J=G91 X10 F100` | Jog X 10mm (requires homed=true) |
| `$J=G91 Y10 F100` | Jog Y 10mm (requires homed=true) |

---

## Console Message Patterns

| Pattern | Meaning |
|---|---|
| `[MSG:INFO: ...]` | Informational firmware message |
| `<Idle\|MPos:X,Y,Z,A,B\|FS:0,0>` | Idle state with positions |
| `<Home\|MPos:...>` | Home state (after calibration) |
| `<Alarm\|MPos:...>` | Alarm state — clear with `$X` |
| `[MSG:INFO: Caution: Unlocked]` | Alarm successfully cleared |
| `[MSG:INFO: Unable to determine machine position from belt lengths]` | Normal when uncalibrated — not an error |
| `[MSG:INFO: Cannot extend the belts until they have been retracted]` | Must RETRACT ALL first |
| `[MSG:INFO: I2C Timeout: N]` | Communication issue with motor drivers (N = count) |
| `[MSG:INFO: All tests passed on ...]` | TEST diagnostic passed for that corner |
| `pulled tight with offset -X.XXX` | Belt retraction completed for that corner |

### MINFO Fields
```json
{
  "homed": false,           // true after calibration
  "calibrationInProgress": false,
  "tl": -0, "tr": -0,      // belt lengths: top-left, top-right
  "bl": -0, "br": -0,      // bottom-left, bottom-right
  "etl": ...                // extended top-left
}
```

---

## TEST Diagnostic Interpretation

Run from Setup dialog → TEST button. Healthy output:
```
Index.html Version: v1.19-64-g291dac60
[MSG:INFO: Firmware Version: v1.20]
[MSG:INFO: I2C Timeout: ]          ← empty = good, number = problem
[MSG:INFO: 10]                     ← test parameter (normal)
[MSG:INFO: All tests passed on Top Left]
[MSG:INFO: All tests passed on Top Right]
[MSG:INFO: All tests passed on Bottom Left]
[MSG:INFO: All tests passed on Bottom Right]
```

If I2C Timeout shows a number, or any corner fails: possible motor driver or wiring issue.

---

## Navigating the Web UI (Tips for Browser Automation)

- **Tab switching is unreliable** via direct coordinate clicks — use `find` tool to locate tab buttons by name ("GRBL", "Maslow", etc.) and click via ref IDs
- **Setup dialog** doesn't dismiss with Escape — click outside the dialog area
- **Timeouts are common** on screenshot/scroll actions — retry on timeout
- **Step size field** on the Maslow tab jog pad can be clicked and edited to change jog distance
- The **command input** on ESP3D tab is labeled "Send Command..." — find it with the `find` tool
- **Console scrolling**: the console area at bottom-right of the Maslow tab shows firmware output

### Key Coordinates on Maslow Tab (approximate, at 1440x804 viewport)
- Setup gear icon: (1371, 142) or (1371, 82)
- Z+ up button: (1022, 133)
- Z- down button: (1022, 251)
- Step size display: (1035, 192) area
- Console area: right side, below coordinates

### Key Coordinates on Setup Dialog (when open)
- RETRACT ALL: (516, 333)
- EXTEND ALL: (714, 333)
- APPLY TENSION: (909, 333)
- FIND ANCHOR LOCATIONS: (516, 419)
- STOP: (714, 419)
- RELEASE TENSION: (909, 419)
- CONFIG: (516, 535)
- TEST: (714, 535)
- SET Z-STOP: (909, 535)

---

## Machine Current State (as of April 10, 2026)

- **Belts**: Extended with ~6cm slack on all 4 lines (manually pulled during Extending state)
- **Calibration**: NOT calibrated (`homed: false`)
- **Z position**: 0.00 (retracted to safe height after successful plunge test)
- **XY position**: 0.00, 0.00 (uncalibrated)
- **State**: Extending (will likely revert to Unknown after power cycle)
- **What works**: Z+ (retract), Z- (plunge) — both confirmed with 2mm steps and 10mm plunge test. Belt retract (automatic), belt extend (requires manual pulling while in Extending state)
- **What doesn't work yet**: XY movement (needs calibration), G-code cutting (needs calibration)
- **Router**: DeWalt DWP611 installed

### Verified Operations (April 10, 2026)
- Z+ jog: confirmed working (2mm steps)
- Z- plunge: confirmed working (tested 2mm step, then 10mm continuous plunge to Z=-10.00, returned to Z=0.00)
- RETRACT ALL: confirmed working (all 4 belts pull tight with offsets -0.064 to -0.086)
- EXTEND ALL + manual pull: confirmed working (6cm slack achieved on all 4 belts)
- TEST diagnostic: all 4 corners passed (Top Left, Top Right, Bottom Left, Bottom Right), I2C Timeout empty
- $X alarm clear: confirmed working

### Next Steps for Future Sessions
1. **Calibration**: Run FIND ANCHOR LOCATIONS from Setup dialog
2. **Test XY**: After calibration, test X+, X-, Y+, Y- jog movements
3. **Test cuts**: Upload a simple G-code file and run a test cut
4. **Set Z-Stop**: Define Z-axis limits for safe operation
5. **First project**: PeopleMover sign (design in progress, SVG in project folder)

---

## Cutting Reference (Quick Settings)

### Feed Rates by Material

| Material | RPM | Feed (IPM) | Depth/Pass | Bit |
|---|---|---|---|---|
| Plywood 3/4" | 16-18K | 60-80 | 1/8"-1/4" | 1/4" compression |
| MDF 3/4" | 18-24K | 60-80 | 1/8"-1/4" | 1/4" compression |
| Hardwood | 12-16K | 40-60 | 1/16"-1/8" | 1/4" upcut |
| Softwood | 14-18K | 60-80 | 1/8"-1/4" | 1/4" upcut |
| Acrylic | 12-18K | 50-70 | 1/16"-1/8" | 1/4" upcut (single flute) |
| Aluminum | 8-12K | 30-50 | 0.01"-0.03" | 1/4" single-flute upcut + lube |

### First Cut Recipe (3/4" Plywood)
- Bit: 1/4" compression
- RPM: 18,000
- Feed: 60 IPM
- Depth/pass: 1/8"
- Passes for through-cut: 6-7
- Tabs: 4 per piece, 5/8" wide

### Design Rules
- Min feature size: 2x bit diameter
- Keep critical features in center 3'x6' area
- Tabs: 3-4 per closed shape, width = 2x bit diameter + 1/8"
- Edge margin: 1-2" from sheet edges minimum
- Through-cut depth: material thickness + 0.01-0.02"
- Use IJK notation (not R) for arcs in G-code

### Supported G-Code
G0 (rapid), G1 (linear cut), G2 (CW arc), G3 (CCW arc), G17 (XY plane), M03/M04 (spindle on), M05 (spindle off)

**NOT supported**: G18, G19, G40, complex canned cycles

---

## Troubleshooting Quick Reference

| Problem | Solution |
|---|---|
| Machine in Alarm state | Send `$X` via ESP3D console |
| EXTEND ALL does nothing | Must RETRACT ALL first (from Unknown state) |
| Belts don't physically move during extend | **Normal** — pull belts manually while in Extending state |
| XY jog commands ignored | Machine not calibrated — run FIND ANCHOR LOCATIONS |
| I2C Timeout in TEST | Check motor driver connections, try power cycle |
| "Unable to determine machine position" | Normal when uncalibrated — not an error |
| STOP triggers Alarm | Expected — clear with `$X` |
| Console shows no response to commands | Check you're on the right tab; try refreshing page |
| Fan on but no movement | If extending: pull belts manually. If other: check I2C. |

---

## Related Files in This Folder

| File | Contents |
|---|---|
| **MASLOW_SKILLS.md** | This file — operational reference for remote machine control |
| **Maslow 4 Programming Guide - From Design to Cut.md** | Complete beginner's guide: design software, CAM toolpaths, G-code upload, cutting workflow, first project walkthrough |
| **Maslow CNC Complete Reference Guide.md** | General Maslow knowledge: specs, materials, design rules, G-code reference |
| **Maslow 4 Troubleshooting Log.md** | Session log from April 10, 2026 with detailed troubleshooting notes |

---

*Last updated: April 10, 2026. Compiled from hands-on testing, official docs, and community forums.*
