# PID Real-World Tuning Quickstart

Use this checklist to tune wall-follow PID on the real robot. All variables for the side controller use the `side_` prefix to avoid collisions.

## 1. Safe Starting Setup

- `BASE_SPEED = 165`
- `TARGET_WALL_DISTANCE = 150` (mm)
- Loop delay: `hold_state(0.05)`
- `MAX_STEERING = 40`
- `side_Kp = 0`
- `side_Ki = 0`
- `side_Kd = 0`
- `side_INTEGRAL_MAX = 0`
- `side_previous_error = 0`
- `side_integral = 0`
- Keep this rule true: `BASE_SPEED - MAX_STEERING >= 120`

**Expected behavior:** Robot drives straight at a safe speed. Some natural drift away from the wall is normal and expected. The robot should not turn sharply or crash, but it may slowly veer off course. This is OK for initial safety.

## 2. Starting PID Values

Leave all gains at **zero** from Step 1. You will raise them one at a time in the steps below.

- `side_Kp = 0`
- `side_Kd = 0`
- `side_Ki = 0`
- `side_INTEGRAL_MAX = 0`
- `side_previous_error = 0`
- `side_integral = 0`

**Expected behavior:** Robot drives straight and ignores the wall. This is your safe baseline — confirm the robot moves cleanly before adding any gain

**Expected behavior:** Robot drives straight and ignores the wall. This is your safe baseline — confirm the robot moves cleanly before adding any gain.

## 3. Tune In This Order

1. Tune `side_Kp` first
2. Tune `side_Kd` second
3. Tune `side_Ki` last

**ExpeRamp Up Kp From Zero

Keep `side_Ki = 0` and `side_Kd = 0` throughout this step.

| Run | `side_Kp` | What to look for |
|-----|-----------|------------------|
| 1 | **0.10** | Robot barely reacts — drifts slowly. This is expected. |
| 2 | **0.20** | Gentle corrections begin. Robot starts to follow the wall loosely. |
| 3 | **0.30** | Corrections are visible. Robot tracks the wall but may have some steady offset. |
| 4 | **0.40** | Good tracking. Watch carefully for the start of a zig-zag. |
| 5 | **0.50** | Corrections are strong. Zig-zag may begin here for some robots. |
| 6 | **0.60** | If zig-zag has not started, continue in `0.05` steps. |

**Stop** as soon as you see a regular side-to-side zig-zag. That is your **oscillation point**.

Then **back off by 20–30%**:

```
If oscillation started at 0.50 → set side_Kp = 0.35 to 0.40
If oscillation started at 0.60 → set side_Kp = 0.42 to 0.48
```

Typical final `side_Kp`: `0.30` to `0.55` (real robots tend to be lower than the simulator).

**Expected behavior at each step:**
- Low Kp (0.10–0.20): robot drifts slowly — this is normal, P is working but weak.
- Correct Kp: smooth, steady wall following with small corrections.
- Too high: rapid zig-zag — back off immediately
| 3 | **0.30** | Corrections are visible. Robot tracks the wall but may have some steady offset. |
| 4 | **0.40** | Good tracking. Watch carefully for the start of a zig-zag. |
| 5 | **0.50** | Corrections are strong. Zig-zag may begin here for some robots. |
| 6 | **0.60** | If zig-zag has not started, continue in 0.05 steps. |

**Stop** as soon as you see a regular side-to-side zig-zag. That is your **oscillation point**.

Then **back off by 20–30%**:

```
If oscillation started at 0.50 → set side_Kp = 0.35 to 0.40
If oscillation started at 0.60 → set side_Kp = 0.42 to 0.48
```

Typical final `side_Kp`: `0.30` to `0.55` (real robots tend to be lower than simulators).

**Expected behavior at each step:**
- At low Kp (0.10–0.20): robot drifts slowly — this is normal, it means P is working but weak.
- At correct Kp: smooth, steady wall following with small corrections.
- Too high: rapid zig-zag — back off immediately.

## 5. Add D to Reduce Oscillation

1. Start `side_Kd = 0.15`
2. Increase `side_Kd` by `0.05`
3. Stop when oscillation is mostly gone but response is still quick

Typical final `side_Kd`: `0.20` to `0.45`

**Expected behavior:** Robot's zig-zagging should decrease. It should follow the wall more smoothly, with less overshoot and fewer sharp corrections. Some small, quick corrections are normal.

## 6. Add I to Remove Steady Drift

1. Start `side_Ki = 0.003`
2. Increase by `0.002`
3. Stop when long-run offset is removed
4. If slow weaving starts, `side_Ki` is too high

Typical final `side_Ki`: `0.004` to `0.015`

**Expected behavior:** Robot should stop drifting away from the wall over time. If it starts to weave slowly or makes large, slow corrections, reduce `side_Ki`.

## 7. Set INTEGRAL_MAX Properly

Aim for I-term max of about `8-16` steering units.

Formula:

- `I_term_max = side_Ki * side_INTEGRAL_MAX`

Examples:

- If `side_Ki = 0.01`, use `side_INTEGRAL_MAX = 800 to 1600`
- If `side_Ki = 0.008`, use `side_INTEGRAL_MAX = 1000 to 2000`

Good default: `side_INTEGRAL_MAX = 1200`

**Expected behavior:** Robot should not suddenly veer or oscillate due to the integral term. If it does, reduce `side_INTEGRAL_MAX`.

## 8. Symptom -> Fix

Use this as your starting point. **All gains start at zero** — raise them using the steps above.

```python
BASE_SPEED = 165
TARGET_WALL_DISTANCE = 150
MAX_STEERING = 40

# Start all gains at 0. Raise side_Kp first using the ramp-up table in Step 4.
side_Kp = 0.10       # Start here — raise in 0.10 steps, then 0.05 steps near oscillation.
side_Ki = 0          # Add only after Kp and Kd are tuned.
side_Kd = 0          # Add after Kp is set.
side_INTEGRAL_MAX = 0
side_previous_error = 0
side_integral = 0
```

**Expected behavior:** Robot drives straight at first. Add `side_Kp` gradually following the ramp-up table in Step 4 until it tracks the wall smoothly

**Expected behavior:** Robot should consistently follow the wall in all test scenarios. Each change should have a clear, real-world effect.

## 10. Quick Copy/Paste Block

```python
BASE_SPEED = 165
TARGET_WALL_DISTANCE = 150
MAX_STEERING = 40

side_Kp = 0.55
side_Ki = 0.008
side_Kd = 0.25
side_INTEGRAL_MAX = 1200

side_previous_error = 0
side_integral = 0
```

**Expected behavior:** Use these values as a starting point. Robot should follow the wall reasonably well, ready for fine tuning.
