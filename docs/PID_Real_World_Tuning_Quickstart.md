# Side Wall PID Tuning Quickstart

Use this checklist to tune the **side-wall PID** on the real robot. The variables match the [Challenge starter code](docs.html?doc=Challenge_3) (`side_` prefix everywhere) so values you find here paste straight into Challenges 1–6.

> [!Tip]
> Tune in the simulator first to learn the workflow, then re-tune on the real robot. Real motors and sensors behave differently — expect smaller `side_Kp` and `side_Ki` values on hardware than in the simulator.

---

## 1. Safe Starting Setup

These constants come from the canonical `CONFIG_BASE` block used by every challenge:

```python
BASE_SPEED           = 160   # Forward speed (must be > 120)
TARGET_WALL_DISTANCE = 150   # mm
MAX_STEERING         = 40    # Max wheel speed difference
# Loop delay: hold_state(0.05)
# Rule: BASE_SPEED - MAX_STEERING >= 120 (motor dead zone)
```

Start every gain at **zero**:

```python
side_Kp = 0
side_Ki = 0
side_Kd = 0
side_INTEGRAL_MAX   = 0
side_previous_error = 0
side_integral       = 0
```

**Expected behaviour:** Robot drives straight and ignores the wall. Some natural drift is normal — confirm the chassis moves cleanly before adding any gain.

---

## 2. Tune In This Order

1. `side_Kp` first
2. `side_Kd` second
3. `side_Ki` last

---

## 3. Ramp Up `side_Kp` From Zero

Keep `side_Ki = 0` and `side_Kd = 0` throughout this step.

| Run | `side_Kp` | What to look for                                                       |
| --- | --------- | ---------------------------------------------------------------------- |
| 1   | **0.10**  | Robot barely reacts — drifts slowly. Expected.                         |
| 2   | **0.20**  | Gentle corrections begin.                                              |
| 3   | **0.30**  | Robot tracks the wall but may have steady offset.                      |
| 4   | **0.40**  | Good tracking. Watch for the start of zig-zag.                         |
| 5   | **0.50**  | Corrections strong; zig-zag may begin.                                 |
| 6   | **0.60+** | If no zig-zag yet, continue in `0.05` steps until oscillation appears. |

**Stop** at the first regular side-to-side zig-zag — that's your **oscillation point**. Then back off **20–30%**:

| Oscillation at | Final `side_Kp` |
| -------------- | --------------- |
| 0.50           | 0.35 – 0.40     |
| 0.60           | 0.42 – 0.48     |

Typical final `side_Kp` on the real robot: **0.30 – 0.55**.

---

## 4. Add `side_Kd` to Reduce Oscillation

1. Start `side_Kd = 0.10`
2. Increase by `0.05` per run
3. Stop when oscillation is mostly gone but response is still snappy

Typical final `side_Kd`: **0.15 – 0.45**. Default in the starter code is `0.15`.

**Expected behaviour:** Zig-zagging shrinks. Robot follows the wall smoothly with small, quick corrections only.

---

## 5. Add `side_Ki` to Remove Steady Drift

1. Start `side_Ki = 0.003`
2. Increase by `0.002` per run
3. Stop when long-run offset is removed
4. If a slow weave appears, `side_Ki` is too high — back off

Typical final `side_Ki`: **0.003 – 0.015**.

---

## 6. Set `side_INTEGRAL_MAX` Properly

Aim for an I-term contribution of about **8–16 steering units** at the clamp:

```
I_term_max = side_Ki * side_INTEGRAL_MAX
```

| `side_Ki` | Suggested `side_INTEGRAL_MAX` |
| --------- | ----------------------------- |
| 0.003     | 1200 (default)                |
| 0.008     | 1000 – 2000                   |
| 0.015     | 600 – 1100                    |

If the robot suddenly veers when re-acquiring the wall, lower `side_INTEGRAL_MAX`.

---

## 7. Symptom → Fix

| Symptom                              | Likely cause       | Fix                                                   |
| ------------------------------------ | ------------------ | ----------------------------------------------------- |
| Drifts away from wall                | `side_Kp` too low  | +0.05 to `side_Kp`                                    |
| Rapid zig-zag                        | `side_Kp` too high | -20 % from `side_Kp`                                  |
| Oscillation that won't damp          | `side_Kd` too low  | +0.05 to `side_Kd`                                    |
| Sluggish response                    | `side_Kd` too high | -0.05 from `side_Kd`                                  |
| Slow drift over long straights       | `side_Ki` too low  | +0.002 to `side_Ki`                                   |
| Slow rolling weave                   | `side_Ki` too high | -0.002 from `side_Ki`                                 |
| Big jolt after wall reappears        | Integral windup    | Lower `side_INTEGRAL_MAX`; ensure reset on `side==-1` |
| One wheel stalls during a correction | Dead-zone violated | Increase `BASE_SPEED` or reduce `MAX_STEERING`        |

---

## 8. Field Test Routine

1. Three straight-corridor passes
2. Three L-corner passes (Challenge 3 maze)
3. Three zig-zag passes (Challenge 6 maze)
4. Change **one gain at a time**; record values + behaviour after each run

---

## 9. Quick Copy/Paste Block (matches Challenge 3+ starter)

```python
BASE_SPEED           = 160
TARGET_WALL_DISTANCE = 150
MAX_STEERING         = 40

side_Kp           = 0.40
side_Kd           = 0.15
side_Ki           = 0.003
side_INTEGRAL_MAX = 1200

side_previous_error = 0
side_integral       = 0
```

These are the **simulator-tuned** values. Use them as your starting point on hardware, then re-tune `side_Kp` and `side_Kd` first.
