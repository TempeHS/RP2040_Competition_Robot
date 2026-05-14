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

- `side_Kp = 0.55`
- `side_Kd = 0.25`
- `side_Ki = 0.008`
- `side_INTEGRAL_MAX = 1200`
- `side_previous_error = 0`
- `side_integral = 0`

**Expected behavior:** Robot should begin to follow the wall, but may still drift or gently zig-zag. It should not crash, but perfect tracking is not expected yet.

## 3. Tune In This Order

1. Tune `side_Kp` first
2. Tune `side_Kd` second
3. Tune `side_Ki` last

**Expected behavior:** Tuning in this order lets you see the effect of each gain. Robot should improve its wall following step by step.

## 4. P-Only Pass

1. Set `side_Ki = 0`, `side_Kd = 0`
2. Increase `side_Kp` by `0.05` each run
3. Stop when oscillation starts
4. Back off `side_Kp` by `20-30%`

Typical final `side_Kp`: `0.45` to `0.80`

**Expected behavior:** Robot should start to correct its drift and follow the wall, but as `side_Kp` increases, you should see a clear, regular side-to-side oscillation (zig-zag). This is a sign that P is too high. Back off when this happens.

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

- Drifts away slowly: increase `side_Kp` slightly, then `side_Ki` slightly
- Fast zig-zag: reduce `side_Kp` or increase `side_Kd`
- Slow side-to-side wave: reduce `side_Ki` or reduce `side_INTEGRAL_MAX`
- Overshoot after turns: reduce `side_Ki` and reduce `side_INTEGRAL_MAX`
- One wheel drops out: increase `BASE_SPEED` or reduce `MAX_STEERING`

**Expected behavior:** Use this table to diagnose and fix common problems. Robot should become more stable and accurate as you apply these fixes.

## 9. Field Test Routine

1. Run 3 straight passes
2. Run 3 corner entries
3. Run 3 recovery runs from a bad start angle
4. Change only one gain at a time
5. Record values and behavior after each run

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
