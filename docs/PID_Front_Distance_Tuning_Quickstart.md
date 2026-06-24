# Real-World Front-Sensor P-Controller Tuning Quickstart (On-Robot)

Use this checklist to tune the **front-sensor P-controlled deceleration** that triggers a corner or dead-end turn. Variables match the canonical `FRONT_CONFIG` block in [Challenges 4–6](docs.html?doc=Challenge_4).

> [!Note]
> The front controller is **P-only** (not full PID). The robot needs a **smooth, predictable stop** at a fixed distance — not a tracking loop — so a single proportional gain on `(front − FRONT_STOP_DISTANCE)` is enough.

---

## 1. Safe Starting Setup

```python
BASE_SPEED          = 200   # from CONFIG_BASE
FRONT_SLOW_DISTANCE = 400   # mm — start decelerating
FRONT_STOP_DISTANCE = 150   # mm — stop and turn
FRONT_Kp            = 1.0   # deceleration gain
```

Rule: **`approach_speed` is always clamped to `[120, BASE_SPEED]`** so the wheels never enter the motor dead-zone.

**Expected behaviour:** Robot drives at `BASE_SPEED` until `front < 400 mm`, then decelerates linearly toward `FRONT_STOP_DISTANCE`, then brakes and triggers a turn.

---

## 2. The Approach Formula

```python
approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
if approach_speed < 120:        approach_speed = 120
if approach_speed > BASE_SPEED: approach_speed = BASE_SPEED
my_robot.drive(approach_speed, approach_speed)
```

| `front` | `1.0 × (front − 150)` | After clamp                    |
| ------- | --------------------- | ------------------------------ |
| 400 mm  | 250                   | **200** (clamped to BASE)      |
| 300 mm  | 150                   | **150**                        |
| 200 mm  | 50                    | **120** (clamped to dead-zone) |
| 150 mm  | 0                     | **stop → turn**                |

The clamp keeps the chassis crawling at the dead-zone speed all the way to the stop point.

---

## 3. Tune In This Order

1. `FRONT_STOP_DISTANCE` (where you want to stop)
2. `FRONT_SLOW_DISTANCE` (when to begin decelerating)
3. `FRONT_Kp` (how aggressively to decelerate)

---

## 4. Set `FRONT_STOP_DISTANCE`

Place the robot ~300 mm from a wall, run the code, and measure where it brakes.

| Stops too far from wall | → Decrease `FRONT_STOP_DISTANCE` (try `120`)           |
| ----------------------- | ------------------------------------------------------ |
| Touches the wall        | → Increase `FRONT_STOP_DISTANCE` (try `180`)           |
| Inconsistent stop       | → Sensor noise — average 3 readings before the compare |

Typical real-robot value: **120 – 180 mm**. Simulator-tuned answer key: `150 mm`.

---

## 5. Set `FRONT_SLOW_DISTANCE`

This is **how early** the robot starts slowing down. It must be far enough to give the deceleration ramp time to act before the wall.

| Robot crashes before stopping        | → Increase `FRONT_SLOW_DISTANCE` (try `500`)                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Robot crawls for a long time         | → Decrease `FRONT_SLOW_DISTANCE` (try `300`)                                       |
| Brakes once then accelerates briefly | → Sensor flicker — increase `FRONT_SLOW_DISTANCE` so the early brake stays latched |

Typical real-robot value: **350 – 500 mm**. Default in the starter: `400 mm`.

> [!Important]
> `FRONT_SLOW_DISTANCE` is also the **threshold for the side-sensor check** in the dead-end decision (Challenge 6+). If you raise it, also re-check that corners are still classified as 90° not 180°.

---

## 6. Set `FRONT_Kp`

`FRONT_Kp` controls how steeply speed drops with distance.

1. Start `FRONT_Kp = 0.5`
2. Increase by `0.1` per run

| Symptom                                     | Cause               | Fix                                    |
| ------------------------------------------- | ------------------- | -------------------------------------- |
| Robot crawls almost all the way (boring)    | `FRONT_Kp` low      | +0.1 (try 0.7, 0.9, 1.0)               |
| Robot brakes hard then re-accelerates       | `FRONT_Kp` high     | -0.1                                   |
| Robot reaches stop point too fast and skids | `FRONT_Kp` high     | -0.1 or increase `FRONT_STOP_DISTANCE` |
| Robot never reaches the dead-zone clamp     | `FRONT_Kp` very low | +0.2 or shorten `FRONT_SLOW_DISTANCE`  |

Typical real-robot value: **0.4 – 1.0**. Simulator-tuned answer key: `1.0`.

---

## 7. Field Test Routine

1. Three head-on stops (wall directly ahead).
2. Three approaches at a shallow angle.
3. Three approaches after a recent corner turn (still recovering wall).
4. Change **one variable at a time**; log distance at brake, distance at stop, and overshoot.

---

## 8. Quick Copy/Paste Block (matches Challenge 4+ answer key)

```python
FRONT_SLOW_DISTANCE = 400   # mm — start decelerating
FRONT_STOP_DISTANCE = 150   # mm — stop and turn
FRONT_Kp            = 1.0   # deceleration gain
```

When this is solid, move on to the [Turn Tuning Quickstart](pid-tuning.html#turnGuide) to dial in the gyro turn gains (`turn_Kp`, `turn_Kd`) used by `turn_90` and `turn_180`.
