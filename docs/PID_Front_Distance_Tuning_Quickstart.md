# PID Front Distance Tuning Quickstart

Use this checklist to tune the front distance PID on the real robot to ensure it comes to a safe stop. All variables for the front controller use the `front_` prefix to avoid collisions.

## 1. Safe Starting Setup

- `BASE_SPEED = 165`
- `TARGET_DISTANCE = 200` (mm)
- Loop delay: `hold_state(0.05)`
- `MAX_BRAKE = 50`
- Keep this rule true: `BASE_SPEED - MAX_BRAKE >= 120`

**Expected behavior:** Robot drives forward at a safe speed and can stop before hitting an obstacle. It should not skid or stop too late.

## 2. Starting PID Values

- `front_Kp = 0.6`
- `front_Kd = 0.3`
- `front_Ki = 0.01`
- `front_INTEGRAL_MAX = 1000`
- `front_previous_error = 0`
- `front_integral = 0`

**Expected behavior:** Robot should slow down and stop near the target distance, but may not be perfectly accurate yet.

## 3. Tune In This Order

1. Tune `front_Kp` first
2. Tune `front_Kd` second
3. Tune `front_Ki` last

**Expected behavior:** Tuning in this order helps you see the effect of each gain clearly. Robot should stop more accurately as you tune each gain.

## 4. P-Only Pass

1. Set `front_Ki = 0`, `front_Kd = 0`
2. Increase `front_Kp` by `0.05` each run
3. Stop when oscillation starts
4. Back off `front_Kp` by `20-30%`

Typical final `front_Kp`: `0.5` to `0.9`

**Expected behavior:** Robot should stop closer to the target, but may start to overshoot or oscillate if `front_Kp` is too high.

## 5. Add D to Reduce Oscillation

1. Start `front_Kd = 0.2`
2. Increase `front_Kd` by `0.05`
3. Stop when oscillation is mostly gone but response is still quick

Typical final `front_Kd`: `0.25` to `0.5`

**Expected behavior:** Robot's stopping should become smoother, with less overshoot or bouncing near the stop point.

## 6. Add I to Remove Steady Drift

1. Start `front_Ki = 0.005`
2. Increase by `0.002`
3. Stop when long-run offset is removed
4. If slow weaving starts, `front_Ki` is too high

Typical final `front_Ki`: `0.005` to `0.02`

**Expected behavior:** Robot should stop at the correct distance every time. If it starts to weave or creep, reduce `front_Ki`.

## 7. Set INTEGRAL_MAX Properly

Aim for I-term max of about `8-16` brake units.

Formula:

- `I_term_max = front_Ki * front_INTEGRAL_MAX`

Examples:

- If `front_Ki = 0.01`, use `front_INTEGRAL_MAX = 800 to 1600`
- If `front_Ki = 0.008`, use `front_INTEGRAL_MAX = 1000 to 2000`

Good default: `front_INTEGRAL_MAX = 1000`

**Expected behavior:** Robot should not suddenly brake too hard or oscillate due to the integral term. If it does, reduce `front_INTEGRAL_MAX`.

## 8. Symptom -> Fix

- Stops too far: increase `front_Kp` slightly, then `front_Ki` slightly
- Stops too quickly: reduce `front_Kp` or increase `front_Kd`
- Slow oscillation near stop: reduce `front_Ki` or reduce `front_INTEGRAL_MAX`
- Overshoot before stopping: reduce `front_Ki` and reduce `front_INTEGRAL_MAX`
- Inconsistent stopping: increase `BASE_SPEED` or reduce `MAX_BRAKE`

**Expected behavior:** Use this table to diagnose and fix common problems. Robot should stop smoothly and consistently as you apply these fixes.

## 9. Field Test Routine

1. Run 3 straight stopping passes
2. Run 3 stopping passes from a curve
3. Run 3 recovery runs from a high speed
4. Change only one gain at a time
5. Record values and behavior after each run

**Expected behavior:** Robot should stop reliably in all test scenarios. Each change should have a clear effect.

## 10. Quick Copy/Paste Block

```python
BASE_SPEED = 165
TARGET_DISTANCE = 200
MAX_BRAKE = 50

front_Kp = 0.6
front_Ki = 0.01
front_Kd = 0.3
front_INTEGRAL_MAX = 1000

front_previous_error = 0
front_integral = 0
```

**Expected behavior:** Use these values as a starting point. Robot should stop near the target distance, ready for fine tuning.
