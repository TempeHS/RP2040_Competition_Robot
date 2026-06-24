# Real-World Side-Wall PID Tuning Quickstart (On-Robot)

Use this checklist to tune the **side-wall PID** on the real robot. The variables match the [Challenge starter code](docs.html?doc=Challenge_3) (`side_` prefix everywhere) so values you find here paste straight into Challenges 1–7.

> [!Tip]
> Tune in the simulator first to learn the workflow, then re-tune on the real robot. Real motors and sensors behave differently — expect smaller `side_Kp` and `side_Ki` values on hardware than in the simulator.

---

## 1. Safe Starting Setup

These constants come from the canonical `CONFIG_BASE` block used by every challenge:

```python
BASE_SPEED           = 200   # Forward speed (must be >= 100)
TARGET_WALL_DISTANCE = 200   # mm
MAX_STEERING         = 60    # Max wheel speed difference
# Loop delay: hold_state(0.05)
# Rule: BASE_SPEED - MAX_STEERING >= 100 (MIN_MOTOR_SPEED dead zone)
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
| 0.35           | 0.25 – 0.28     |
| 0.50           | 0.35 – 0.40     |
| 0.60           | 0.42 – 0.48     |

Typical final `side_Kp` on the real robot: **0.20 – 0.55**. Simulator-tuned answer key: `0.25`.

---

## 4. Add `side_Kd` to Reduce Oscillation

1. Start `side_Kd = 0.10`
2. Increase by `0.05` per run
3. Stop when oscillation is mostly gone but response is still snappy

Typical final `side_Kd`: **0.15 – 0.45**. Simulator-tuned answer key: `0.40`.

**Expected behaviour:** Zig-zagging shrinks. Robot follows the wall smoothly with small, quick corrections only.

---

## 5. Add `side_Ki` to Remove Steady Drift

1. Start `side_Ki = 0.001`
2. Increase by `0.001` per run
3. Stop when long-run offset is removed
4. If a slow weave appears, `side_Ki` is too high — back off

Typical final `side_Ki`: **0.001 – 0.015**. Simulator-tuned answer key: `0.001`.

---

## 6. Set `side_INTEGRAL_MAX` Properly

Aim for an I-term contribution of about **5–16 steering units** at the clamp:

```
I_term_max = side_Ki * side_INTEGRAL_MAX
```

| `side_Ki` | Suggested `side_INTEGRAL_MAX` |
| --------- | ----------------------------- |
| 0.001     | 50 – 200 (answer key uses 50) |
| 0.003     | 1200                          |
| 0.008     | 1000 – 2000                   |
| 0.015     | 600 – 1100                    |

If the robot suddenly veers when re-acquiring the wall, lower `side_INTEGRAL_MAX`.

---

## 7. Tune the Nib Wrap (Challenge 5+)

From Challenge 5 the robot has a dedicated `NIB_WALL` state for outside corners (where the side wall ends). When the side reading stays lost — beyond `NIB_LOST_DISTANCE`, or `-1` — for `NIB_CONFIRM_TIME` seconds, the machine drives past the corner, spins 90° toward the wall, and drives alongside the new wall. You tune the two forward times:

```python
NIB_FORWARD_BEFORE = 0.30   # seconds forward before the turn (answer-key value)
NIB_FORWARD_AFTER  = 0.45   # seconds forward after the turn  (answer-key value)
```

Tune against a single outside corner — the **Challenge 5 maze** is purpose-built for this. Run three times per value, in `0.05` s steps:

| Symptom at the outside corner                               | Adjustment                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Robot clips the corner as it starts to wrap                 | `+0.05` to `NIB_FORWARD_BEFORE`                                                               |
| Robot swings out wide and loses the next wall               | `-0.05` to `NIB_FORWARD_BEFORE`                                                               |
| Robot finishes the wrap too early / not yet beside the wall | `+0.05` to `NIB_FORWARD_AFTER`                                                                |
| Robot drifts past the new wall before re-locking            | `-0.05` to `NIB_FORWARD_AFTER`                                                                |
| Robot spins at random mid-corridor                          | `NIB_LOST_DISTANCE` is too low for your `TARGET_WALL_DISTANCE` — keep it at the pre-set `400` |

> `NIB_LOST_DISTANCE` (400 mm) and `NIB_CONFIRM_TIME` (0.5 s) are pre-set because they depend on the maze, not your driving. Leave them unless a real maze has unusually wide corridors. See [Challenge 5](docs.html?doc=Challenge_5).

Typical final wrap times on the real robot: `NIB_FORWARD_BEFORE` **0.25 – 0.40 s**, `NIB_FORWARD_AFTER` **0.35 – 0.55 s**. Simulator-tuned answer key: `0.30` and `0.45`.

---

## 8. Symptom → Fix

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

## 9. Field Test Routine

1. Three straight-corridor passes
2. Three L-corner passes (Challenge 3 maze)
3. Three outside-corner wraps (Challenge 5 maze) — confirms the nib wrap times
4. Three full-maze passes (Challenge 7 maze)
5. Change **one gain at a time**; record values + behaviour after each run

---

## 10. Quick Copy/Paste Block (matches Challenge 3+ answer key)

```python
BASE_SPEED           = 200
TARGET_WALL_DISTANCE = 200
MAX_STEERING         = 60

side_Kp           = 0.25
side_Kd           = 0.40
side_Ki           = 0.001
side_INTEGRAL_MAX = 50

side_previous_error = 0
side_integral       = 0
```

These are the **simulator-tuned** values. Use them as your starting point on hardware, then re-tune `side_Kp` and `side_Kd` first.
