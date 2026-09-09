# Challenge 1: Wall Follow - P Control

## Purpose

Build a clean baseline wall follower using only the side sensor and a proportional controller. This challenge establishes the control-loop structure reused in later challenges.

## Shared Config Transition

1. **Keep These Settings:** Robot Setup in [config.py](../project/config.py); all sections already exist.
2. **Tune These Settings:** Driving and Wall PID: `BASE_SPEED`, target distance, steering limit and `side_Kp`.
3. **New Main Behaviour:** Proportional side-distance steering only. D and I remain inactive.
4. **Replace Main:** Use the [Challenge 1 main](../app/starter-code/challenge-1.py) as `main.py`. Keep config and tune there, not in main.

Read the [shared workflow](Shared_Config_Workflow.md) for saving, transfer and recovery. Runtime state belongs in main; table setting names below refer to config.

## Success Criteria

The robot follows a straight wall through the corridor and reaches the green exit zone without hitting the wall.

## Before You Begin

1. Complete the robot hardware setup.
2. Open the simulator and select Challenge 1.
3. Set `WALL_SIDE` and `DISTANCE_SENSOR` in config to match your robot.
4. Numeric config values start at zero. Tune this challenge's driving and wall
   P settings using the commented starting ranges, then use **Validate config.py**
   on the **config.py** tab. It checks required names, Python syntax and types,
   not values. D, I, turn, recovery and competition settings can remain zero.
   Set `LOOP_DT` for a consistent sample interval and `MIN_APPROACH_SPEED` for
   robot setup; validation does not choose these values for you.
5. Run from either editor tab. The simulator executes main even while config
   is visible; there is no need to copy tuning into the main program.

## Maze Situation

- Maze feature: straight corridor with one side wall to follow.
- Trigger condition expected in code: no state trigger yet, only continuous side control.
- New behavior introduced: side-distance proportional steering.
- Why previous baseline fails: fixed-speed straight driving drifts and cannot hold wall distance.

## What Is New In This Challenge

New: proportional steering term.

Unchanged: basic loop timing and direct motor drive.

Delta equation:

```python
error = wall_distance - config.TARGET_WALL_DISTANCE
steering = config.side_Kp * error
```

## Settings Used In This Main

| Group   | Variable               | Notes                            |
| ------- | ---------------------- | -------------------------------- |
| Reused  | `BASE_SPEED`           | Main forward speed.              |
| New     | `TARGET_WALL_DISTANCE` | Target side-wall distance in mm. |
| New     | `MAX_STEERING`         | Steering clamp.                  |
| New     | `side_Kp`              | Proportional gain.               |
| Removed | None                   | First challenge in the series.   |

## Algorithm Flow

```mermaid
flowchart TD
    A[Read side sensor] --> B{Sensor valid?}
    B -- No --> C[Drive straight at BASE_SPEED]
    C --> H[hold_state 0.05s]
    B -- Yes --> D[Compute error]
    D --> E[Compute steering P term]
    E --> F["steer(): clamp and drive"]
    F --> H
```

## Starter Code Contract

Safe to tune in shared config:

1. `BASE_SPEED`
2. `TARGET_WALL_DISTANCE`
3. `MAX_STEERING`
4. `side_Kp`

Keep these algorithm invariants when editing main:

1. Sensor validation branch for `-1`.
2. The `my_robot.steer(...)` call, which clamps the steering and applies it to
   the correct wheel for your chosen wall.
3. A consistent loop interval (`hold_state(config.LOOP_DT)`).

Optional debug edits:

1. Add print lines in the loop to inspect `error` and `steering`.

## Tunables

These are suggested starting values to enter and tune, not prefilled settings.

| Name                   | Unit      | Purpose                 | Typical start value | Symptoms when too low | Symptoms when too high          |
| ---------------------- | --------- | ----------------------- | ------------------- | --------------------- | ------------------------------- |
| `BASE_SPEED`           | PWM       | Forward speed baseline  | 200                 | Robot may stall       | Harder to control corners later |
| `TARGET_WALL_DISTANCE` | mm        | Desired side clearance  | 100                 | Too close to wall     | Too far from wall               |
| `MAX_STEERING`         | PWM delta | Max wheel speed split   | 60                  | Weak correction       | One wheel can slow too much     |
| `side_Kp`              | gain      | Error to steering scale | 0.4                 | Slow drift away       | Zig-zag oscillation             |

## Tuning Guide

1. Verify `BASE_SPEED` and `MAX_STEERING` so `BASE_SPEED - MAX_STEERING` stays above motor deadband.
2. Adjust `TARGET_WALL_DISTANCE` for safe clearance.
3. Adjust `side_Kp` until drift is controlled, then reduce slightly if oscillation starts.

## Debug Checklist

- [ ] Side sensor values are valid and not permanently `-1`.
- [ ] Steering stays inside `+/-MAX_STEERING`.
- [ ] Right and left speeds change in opposite directions when error changes sign.
- [ ] Robot reaches the green zone while maintaining wall distance.

## Common Failure Modes

| Symptom            | Root cause                     | Verification step              | Fix                              |
| ------------------ | ------------------------------ | ------------------------------ | -------------------------------- |
| Robot drifts away  | `side_Kp` too low              | Print `error`, `steering`      | Increase `side_Kp`               |
| Robot oscillates   | `side_Kp` too high             | Watch repeated over-correction | Decrease `side_Kp`               |
| Robot barely turns | `MAX_STEERING` too small       | Compare steering to clamp      | Increase `MAX_STEERING` slightly |
| Robot scrapes wall | `TARGET_WALL_DISTANCE` too low | Log measured side distance     | Increase target distance         |

## Exit Check

Pass when the Success Criteria are met in at least 3 consecutive simulator runs.

## What Is Next

Challenge 2 keeps the same wall-follow loop and adds derivative damping to reduce oscillation when starting off-center and angled.
