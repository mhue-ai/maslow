# Maslow 4 CNC

Reference docs, operational guides, and project files for a Maslow 4 CNC router controlled via web interface at `maslow.fortmiller`.

## Contents

| File | Description |
|---|---|
| `MASLOW_SKILLS.md` | Complete operational skills reference for remote machine control — web UI layout, commands, belt state machine, troubleshooting |
| `Maslow 4 Programming Guide - From Design to Cut.md` | Beginner's guide: design software (Inkscape/Easel/Carbide Create), CAM toolpaths, G-code upload, cutting workflow |
| `Maslow CNC Complete Reference Guide.md` | General Maslow knowledge: specs, materials, feed rates, design rules, G-code reference |
| `Maslow 4 Troubleshooting Log.md` | Session log from April 10, 2026 — belt extension debugging, Z-axis testing, diagnostic results |
| `peoplemover_sign.svg` | PeopleMover sign design (CNC cutting paths) |
| `peoplemover_preview.html` | Visual preview of PeopleMover sign with symmetry verification |

## Machine

- **Model**: Maslow 4 (horizontal sled, 4-belt system)
- **Controller**: ESP32 with FluidNC firmware v1.20
- **Router**: DeWalt DWP611
- **Cutting area**: 4' x 8'
- **Web UI**: `http://maslow.fortmiller`

## Status (April 2026)

- Z-axis: verified working
- Belt retract/extend: verified working
- Calibration: not yet completed
- First project: PeopleMover sign (design ready, awaiting calibration)
