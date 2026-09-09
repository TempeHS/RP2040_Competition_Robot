# Shared Config Workflow

Keep one [config.py](../project/config.py) for the entire course. Replace only
the challenge program, downloaded as `main.py`. The same two files are used by
the simulator and robot; there are no separate simulator and hardware profiles.

## Start And Continue

1. Open a challenge and select the **config.py** tab at the top right of the editor.
2. Review **Robot Setup**, especially `WALL_SIDE` and `DISTANCE_SENSOR`. The
   initial choices use left-wall following and ToF sensors. Select `"ultrasonic"` if
   those are the sensors fitted to your robot.
3. Set the required numeric values using the comments and challenge notes, then
   select **Validate config.py** (the check-circle button). Invalid values are
   marked in config, not in main.
4. Select **Run** or **Step** with either tab open. Config stays visible if selected;
   the simulator always executes the main program with the current config.
5. For the next challenge, load its main program. Your shared config stays put.

Numeric settings start at zero. All sections are present, with suggested
starting ranges in comments rather than prefilled tuning. `WALL_SIDE`,
`DISTANCE_SENSOR`, `DEBUG_AIDRIVER`, and `KIT_SERVO_PIN` keep their string,
boolean, or optional-pin types. A fresh or reset config is intentionally not
ready to run: positive speeds, timings, distances and budgets must be filled in.
Validation checks the complete configuration, including required values in
sections a later challenge will use. It never silently supplies test values.

The algorithm decides which settings are active: Challenge 1 uses P only,
Challenge 2 adds D, and Challenge 3 adds I. Zero is still valid for an unused
gain. Later geometry and physical hardware can require explicit retuning.

The test harness uses a separate [test-config.py](../tests/test-config.py),
with the former tuned values. Passing simulator checks with that fixture does
not guarantee a full maze run or replace calibration on your robot.

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
The supplied scripts do not define their own tuning settings. Calculated
values, unit conversions and runtime variables still belong to the algorithm.
Students can add variables while extending their code; new adjustable settings
belong in config rather than duplicating existing settings in main.

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
  the zeroed student template. Saved mains are unchanged.
- **Import Config** validates a Python file and asks before replacing tuning.
  **Download Config** preserves the current source, including unfinished edits.
- Import, download, copy and reset act on the selected file tab. Validation is
  available on config only, while stopped; it does not run the main program.
- Existing saved mains remain available. Download your old main before choosing
  **Reset Main** to adopt the new template. Old embedded settings are not
  automatically extracted or rewritten; move your own values into config once.

## Transfer To The Robot

1. Use firmware built from this implementation. Older UF2 files do not contain
   the new `config_check` helper. See the [firmware build guide](Build_Custom_MicroPython_Firmware.md).
2. Download each file from its corresponding **config.py** or **main.py** tab.
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
if one already exists, and writes the bundled zeroed template. Restore or tune
the required values before running main again. Keep the backup until you have
recovered the tuning you need.

## Test Configuration

Python, Skulpt and Chromium script checks load [test-config.py](../tests/test-config.py)
as their runnable `config` module. Tests compare its variable names with the
student config, not its values. Add a setting to both files when extending the
course contract: zero in the student template, a suitable value in the fixture.
The fixture is not staged to the published site or bundled into firmware.
Separate tests verify zero-value rejection and exact student-template provisioning.

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
