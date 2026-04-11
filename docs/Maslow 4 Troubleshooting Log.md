# Maslow 4 CNC Troubleshooting Log

## Machine Details
- **Model**: Maslow 4 CNC
- **Firmware**: FluidNC on ESP32
- **Web UI**: http://maslow.fortmiller (ESP3D for FluidNC)
- **Index.html Version**: v1.19-64-g291dac60
- **Firmware Version**: v1.20
- **Router**: DeWalt DWP611

## Session Log (April 10, 2026)

### Connection and Initial State
- Connected via web browser to http://maslow.fortmiller
- Three tabs available: ESP3D (dashboard/console), FluidNC (settings), Maslow (jog controls/setup)
- Machine started in Alarm state with Z at -58.00
- Cleared alarm with `$X` command via ESP3D console

### Z-Axis Testing (SUCCESS)
- Z+ jog: Z moved from -58.000 to -56.000 (2mm up) — confirmed working
- Z- jog: Z moved from -56.000 to -58.000 (2mm down) — confirmed working
- Z-axis uses separate stepper motors on lead screws, independent of belt system

### X/Y Movement Testing (BLOCKED)
- `$J=G91 X2 F100` and `$J=G91 A30 F100` produced no response
- Root cause: Machine not homed (`"homed": false` in MINFO)
- XY kinematics system requires calibration before belt movements can be computed
- Cannot calibrate until belts have slack (need to extend first)

### Belt Extension Troubleshooting

#### Attempt 1: EXTEND ALL from Unknown state — FAILED
- Clicked EXTEND ALL in Setup menu while state was "Unknown"
- Firmware acknowledged command but no physical belt movement
- Console revealed: `[MSG:INFO: Cannot extend the belts until they have been retracted]`
- **Lesson: Must RETRACT ALL before EXTEND ALL when starting from Unknown state**

#### Attempt 2: RETRACT ALL then EXTEND ALL — PARTIAL SUCCESS
- RETRACT ALL succeeded: all 4 belts reported "pulled tight with offset"
  - Top Right: offset -0.064
  - Bottom Left: offset -0.086
  - Bottom Right: offset -0.086
  - Top Left: offset -0.086
- State transitioned: Unknown → Retracting Belts → Belts Retracted
- EXTEND ALL triggered: State changed to "Extending", cooling fan turned on
- **But no physical belt motor movement observed**
- User confirmed: "Fan on but still no belt movement"

#### TEST Diagnostic Results
- First test (from Unknown state): showed "I2C Timeout: 1" — possible communication issue
- Second test (from proper Retracted state after alarm clear):
  - I2C Timeout: (empty) — no timeout!
  - All tests passed on Top Left
  - All tests passed on Top Right
  - All tests passed on Bottom Left
  - All tests passed on Bottom Right
- **All hardware checks pass — motors and encoders detected on all 4 corners**

#### Attempt 3: Clean sequence after alarm clear — IN PROGRESS
- Cleared alarm with `$X` (machine went to Idle)
- RETRACT ALL: All 4 belts pulled tight with offsets (-0.064 to -0.086)
- EXTEND ALL: State entered "Extending", firmware reports success
- Status indicator shows "Home" (green)
- Awaiting physical confirmation of belt movement

## Key Learnings

### Firmware State Machine
The Maslow 4 firmware has a strict state machine for belt operations:
1. **Unknown** → Must RETRACT ALL first (cannot extend from Unknown)
2. **Retracting Belts** → Automatic, pulls all belts tight
3. **Belts Retracted** → Can now EXTEND ALL
4. **Extending Belts** → Motors should spool out belt
5. **Belts Extended** → Ready for calibration

### Important Commands
- `$X` — Clear alarm state (send via ESP3D console)
- `$EXT` — Extend all belts (equivalent to EXTEND ALL button)
- `$RET` — Retract all belts (equivalent to RETRACT ALL button)
- `MINFO` — Get machine info JSON (homed status, belt lengths, calibration state)
- TEST button — Runs I2C communication test and motor/encoder test on all 4 corners

### Console Message Patterns
- `[MSG:INFO: ...]` — Informational messages from firmware
- `<Idle|MPos:X,Y,Z,A,B|FS:0,0>` — Status report (Idle state, machine positions)
- `<Home|MPos:...>` — Home state status
- `<Alarm|MPos:...>` — Alarm state

### MINFO Fields
- `"homed": false/true` — Whether kinematics are calibrated
- `"calibrationInProgress": false/true` — Active calibration
- `"tl", "tr", "bl", "br"` — Belt extension values for each corner
- `"etl"` — Extended top left value

### Tips
- The Setup menu in the Maslow tab contains all belt operation buttons
- STOP button halts current operation but may trigger Alarm state
- After STOP/Alarm, always clear with `$X` before continuing
- The cooling fan activating confirms the power board is receiving commands
- Belt retraction is fast (seconds); extension may take longer
- Z-axis works independently of belt system — good for initial testing

## RESOLVED: Belt Extension Requires Manual Pulling
**EXTEND ALL does NOT actively spool belt out on its own.** The motors provide torque assist, but you must physically pull each belt to get it to extend. The motor releases/feeds belt as you pull. Use a rocking motion to initiate extension.

This explains why:
- Firmware enters "Extending" state and reports "Succeeded" — it's ready and waiting
- Fan turns on — power board is active and providing motor power
- But nothing visibly moves — the system needs manual pull force to start feeding belt

**Procedure:** While in "State: Extending", go to each corner, grab the belt, and pull it outward. The motor will give way and feed belt. Pull desired amount of slack (~3cm for calibration prep).

**Sources:** Maslow community forums — confirmed behavior across multiple threads.

## Remaining Questions
- The "10" value shown in TEST output meaning is unclear (possibly PWM duty cycle or test parameter)

## Next Steps
1. Confirm belt physical movement during current EXTEND ALL attempt
2. If belts extend, get ~3cm of slack on all 4 lines
3. Proceed to calibration setup
4. Test X/Y movements after calibration (requires homed=true)
