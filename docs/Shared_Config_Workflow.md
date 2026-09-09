# Shared Config Workflow

Keep one [config.py](../project/config.py) for the entire course. Replace only
the challenge program, downloaded as `main.py`. The same two files are used by
the simulator and robot; there are no separate simulator and hardware profiles.

## Start And Continue

1. Open a challenge in the simulator and select **Config** above the main editor.
2. Review **Robot Setup**, especially `WALL_SIDE` and `DISTANCE_SENSOR`. The
   baseline uses left-wall following and ToF sensors. Select `"ultrasonic"` if
   those are the sensors fitted to your robot.
3. Tune the sections named in the challenge guide, then select **Validate**.
4. Return to **Main & Simulator** and run the current program.
5. For the next challenge, load its main program. Your shared config stays put.

All sections are present from the beginning, with usable starting values.
The algorithm decides which settings are active: Challenge 1 uses P only,
Challenge 2 adds D, and Challenge 3 adds I. Zero is still valid for an unused
gain. Later geometry and physical hardware can require explicit retuning.

The starting wall gains are `side_Kp = 0.4`, `side_Kd = 0.3`,
`side_Ki = 0.001`, with `side_INTEGRAL_MAX = 50`. These pass the controlled
straight-corridor simulator progression checks. They do not guarantee a full
maze run or replace calibration on your robot.

## What Lives Where

| File                                                  | Contents                                                          | When it changes                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| [config.py](../project/config.py)                     | Purpose-based tuning, units, timing and safety budgets            | When you deliberately tune or change fitted hardware |
| [Challenge mains](../app/starter-code/challenge-1.py) | Equations, sensor decisions, states and actions                   | When changing challenge or editing an algorithm      |
| [AIDriver](../project/lib/aidriver/driver.py)         | Motor/sensor access, hardware wiring and library safety constants | When updating the library/firmware                   |

Config supports scalar assignments and arithmetic using settings defined
earlier in the file. It must not contain imports, functions, loops, I/O, or
robot construction. Main reads settings as `config.BASE_SPEED`, for example.
Validation names missing or invalid settings before the robot is constructed.
Do not add `MIN_MOTOR_SPEED` to config: the library owns the 120 PWM motor floor.

Integral history, previous error, state labels, timers, marker history and
victim counters remain in main and reset on each run. A run uses a snapshot
of config; changes apply to the next run, not to a moving robot.

The side PID uses error sums and differences **per loop**, not per second.
Changing `LOOP_DT` can therefore require gain retuning. The visible turn helper
in Challenges 4-7, Challenge 9, and the default robot main uses the same turn
gains and per-sample error difference. Do not copy these gains into the
library's separate `turn_degrees()` controller, which has different timing.
Front distance control is proportional slowdown; the turn controller uses P
and D. No unused integral terms have been added to either section.

## Saving And Resetting

- Config source, including comments and formatting, is saved locally per browser
  origin. It is independent of challenge numbers and starter versions, not an
  account-synced backup. Download a copy before clearing browser storage.
- **Reset Main** replaces only the selected main. **Reset Robot** changes only
  simulation state. Neither changes config.
- **Reset Config** requires confirmation and replaces all shared tuning with
  the baseline. Saved mains are unchanged.
- **Import Config** validates a Python file and asks before replacing tuning.
  **Download Config** preserves the current source, including unfinished edits.
- Existing saved mains remain available. Download your old main before choosing
  **Reset Main** to adopt the new template. Old embedded settings are not
  automatically extracted or rewritten; move your own values into config once.

## Transfer To The Robot

1. Use firmware built from this implementation. Older UF2 files do not contain
   the new `config_check` helper. See the [firmware build guide](Build_Custom_MicroPython_Firmware.md).
2. Download `config.py` from Config and `main.py` from the main editor.
3. Stop the robot, then transfer both files to its filesystem root. Check the
   sensor backend, wall side, battery condition and clear working area.
4. Validate on hardware at a controlled speed. On later challenges replace
   only main, unless you intentionally changed config as well.

New firmware provisions missing main/config files but does not overwrite
existing tuning. Neither editable file is frozen, so tuning does not require
a firmware rebuild. `KIT_SERVO_PIN = None` means no rescue-kit servo is fitted.

## Recovery

Ground GP2 during boot to restore the bundled main and clear the event log.
Config is preserved, even if it contains a mistake. Remove the jumper afterward.
An invalid config raises an error in main; it is not silently reset or retried
by the boot code. Stop execution in your IDE and correct the named setting.

For an explicit config reset from the MicroPython REPL:

```python
import robot_recovery
robot_recovery.restore_config()
```

This preserves the old source as `config.py.bak`, or the next numbered backup
if one already exists, and writes the bundled baseline. Restart the robot to
load it. Keep the backup until you have recovered the tuning you need.

## Current Limits

- Run uses live simulator sensor feedback. Step collects a trace with placeholder
  distance/gyro/colour readings and replays commands; it is not a second live
  physics run. Both modes load fresh config and report its errors by file.
- The simulator does not model the complete differences between ToF and
  ultrasonic hardware or prove physical turn accuracy.
- Challenges 8 and 10 retain their straight marker-corridor behavior. Challenge
  9 retains its recovery exercise. Combining them with the full maze controller
  is a separate extension, not part of this config migration.
- Challenge 10 retains student TODOs for the victim and finish branches. The
  teacher reference exercises those branches and estimates score including one
  kit bonus per request. The simulator kit method returns `False`; a score or
  request is not proof that an actuator moved.
- Goal-zone detection alone does not verify marker pauses, counts, recovery,
  or competition rules. Check the challenge's full success criteria.
