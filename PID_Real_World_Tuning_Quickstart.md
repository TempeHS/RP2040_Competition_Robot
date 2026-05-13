# PID Real-World Tuning Quickstart

Use this checklist to tune wall-follow PID on the real robot.

## 1. Safe Starting Setup

- `BASE_SPEED = 165`
- `TARGET_WALL_DISTANCE = 150` (mm)
- Loop delay: `hold_state(0.05)`
- `MAX_STEERING = 40`
- Keep this rule true: `BASE_SPEED - MAX_STEERING >= 120`

## 2. Starting PID Values

- `Kp = 0.55`
- `Kd = 0.25`
- `Ki = 0.008`
- `INTEGRAL_MAX = 1200`
- `previous_error = 0`
- `integral = 0`

## 3. Tune In This Order

1. Tune `Kp` first
2. Tune `Kd` second
3. Tune `Ki` last

## 4. P-Only Pass

1. Set `Ki = 0`, `Kd = 0`
2. Increase `Kp` by `0.05` each run
3. Stop when oscillation starts
4. Back off `Kp` by `20-30%`

Typical final `Kp`: `0.45` to `0.80`

## 5. Add D to Reduce Oscillation

1. Start `Kd = 0.15`
2. Increase `Kd` by `0.05`
3. Stop when oscillation is mostly gone but response is still quick

Typical final `Kd`: `0.20` to `0.45`

## 6. Add I to Remove Steady Drift

1. Start `Ki = 0.003`
2. Increase by `0.002`
3. Stop when long-run offset is removed
4. If slow weaving starts, `Ki` is too high

Typical final `Ki`: `0.004` to `0.015`

## 7. Set INTEGRAL_MAX Properly

Aim for I-term max of about `8-16` steering units.

Formula:

- `I_term_max = Ki * INTEGRAL_MAX`

Examples:

- If `Ki = 0.01`, use `INTEGRAL_MAX = 800 to 1600`
- If `Ki = 0.008`, use `INTEGRAL_MAX = 1000 to 2000`

Good default: `INTEGRAL_MAX = 1200`

## 8. Symptom -> Fix

- Drifts away slowly: increase `Kp` slightly, then `Ki` slightly
- Fast zig-zag: reduce `Kp` or increase `Kd`
- Slow side-to-side wave: reduce `Ki` or reduce `INTEGRAL_MAX`
- Overshoot after turns: reduce `Ki` and reduce `INTEGRAL_MAX`
- One wheel drops out: increase `BASE_SPEED` or reduce `MAX_STEERING`

## 9. Field Test Routine

1. Run 3 straight passes
2. Run 3 corner entries
3. Run 3 recovery runs from a bad start angle
4. Change only one gain at a time
5. Record values and behavior after each run

## 10. Quick Copy/Paste Block

```python
BASE_SPEED = 165
TARGET_WALL_DISTANCE = 150
MAX_STEERING = 40

Kp = 0.55
Ki = 0.008
Kd = 0.25
INTEGRAL_MAX = 1200

previous_error = 0
integral = 0
```
