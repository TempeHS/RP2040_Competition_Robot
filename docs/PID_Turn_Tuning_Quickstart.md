# Turn Time Tuning Quickstart (90° and 180°)

Use this checklist to tune `TURN_TIME_90` and `TURN_TIME_180` on the real robot so corners and dead-end reversals end pointing exactly down the next corridor. Variables match the canonical `FRONT_CONFIG` and `TURN_TIME_180` blocks in [Challenges 4–6](docs.html?doc=Challenge_4).

> [!Important]
> A turn is **open-loop** — the robot rotates for a fixed time. Floor friction, battery voltage, and tyre wear all change how far the robot turns per second, so these times must be re-tuned on the real surface you race on.

---

## 1. Why Turns Drift

The challenge code rotates by spinning one wheel forward and the other backward at `TURN_SPEED`:

```python
if my_robot.wall_sign == -1:    # following left wall → turn right
    my_robot.rotate_right(TURN_SPEED)
else:                           # following right wall → turn left
    my_robot.rotate_left(TURN_SPEED)
hold_state(turn_duration)
```

The total angle swept depends on:

| Factor                           | Effect on angle per second              |
| -------------------------------- | --------------------------------------- |
| `TURN_SPEED`                     | linear — double speed ≈ double rate     |
| Battery voltage                  | drops as battery drains → angle shrinks |
| Floor friction (carpet vs. lino) | high friction → angle shrinks           |
| Tyre wear / dust                 | reduces grip → angle shrinks            |
| Robot weight (extra modules)     | higher inertia → angle shrinks          |

So tune `TURN_TIME_90` on the **same surface and with a fresh battery** that you will compete on.

---

## 2. Safe Starting Setup

```python
TURN_SPEED    = 180         # do not change during tuning
TURN_TIME_90  = 0.5         # seconds — starting estimate
TURN_TIME_180 = TURN_TIME_90 * 2
```

**Expected behaviour:** robot rotates roughly 90° per `0.5 s` at `TURN_SPEED = 180`. Real value will land between ~`0.35 s` and ~`0.75 s` depending on conditions.

---

## 3. Tune In This Order

1. **`TURN_SPEED`** — pick once, don't change later.
2. **`TURN_TIME_90`** — tune against a fixed corner.
3. **`TURN_TIME_180`** — tune against a dead end (do **not** assume `2 × TURN_TIME_90`).

---

## 4. Pick `TURN_SPEED` (do this once)

| `TURN_SPEED` | Behaviour                                                     |
| ------------ | ------------------------------------------------------------- |
| 120          | Slow, smooth, hard to overshoot — but easily stalls on carpet |
| **180**      | Default — balanced for most surfaces                          |
| 220          | Snappy turns, more wheel slip, harder to land 90° exactly     |
| 250+         | Spin-out risk; stop-and-correct error grows                   |

Pick a `TURN_SPEED` that **never stalls** on your race surface. Use the same value for 90° and 180° turns. Don't change it after `TURN_TIME_90` is dialled in.

---

## 5. Tune `TURN_TIME_90`

Set up a single 90° corner (Challenge 4 maze is ideal). Mark the floor where the chassis should end up after the turn.

1. Set `TURN_TIME_90 = 0.5`.
2. Run **three times**. Note the average final heading by eye (or with chalk lines).
3. Adjust in **0.05 s steps** using the table below.
4. Repeat until three consecutive runs land within ±10° of straight down the next corridor.

| Symptom after the turn                     | Adjustment                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Stops short — still angled toward old wall | `+0.05` s to `TURN_TIME_90`                                                               |
| Overshoots — angled into the new wall      | `-0.05` s to `TURN_TIME_90`                                                               |
| Lands ~90° but PID jerks immediately       | OK — make sure `side_integral = 0` and `side_previous_error = 0` are reset after the turn |
| One run short, one run long                | Battery dropping — recharge and re-test                                                   |
| Wheels slip audibly during turn            | `TURN_SPEED` too high — drop to `160`                                                     |

Typical real-robot `TURN_TIME_90`: **0.35 s – 0.70 s** at `TURN_SPEED = 180`.

> [!Tip]
> If you are tuning over many runs, write the value on a sticky note on the robot. Battery voltage drops measurably across a 10-run session — re-tune at the start of each fresh battery.

---

## 6. Tune `TURN_TIME_180`

A 180° turn is **not** always exactly twice a 90° turn. The rotation profile has acceleration, steady-state, and deceleration phases — the longer the turn, the larger the steady-state portion, so the **per-second rate is slightly higher**. Expect `TURN_TIME_180` to be **slightly less than** `2 × TURN_TIME_90`.

Set up a dead-end (Challenge 5 maze).

1. Start at `TURN_TIME_180 = TURN_TIME_90 * 2`.
2. Run three times. Note overshoot/undershoot.
3. Adjust in **0.05 s steps**.

| Symptom after the dead-end turn                                | Adjustment                                                |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| Robot still angled at the old front wall                       | `+0.05` s to `TURN_TIME_180`                              |
| Robot now angled past the open corridor                        | `-0.05` s to `TURN_TIME_180`                              |
| Always 180° in the simulator but short on hardware             | Floor has more friction — keep increasing `TURN_TIME_180` |
| Robot reverses and starts following the wall on the wrong side | Did not turn far enough — `+0.10` s and re-check          |

Typical real-robot ratio: **`TURN_TIME_180 ≈ 1.85 × TURN_TIME_90`** — tune the offset, do not hard-code `× 2`.

---

## 7. Distinguishing 90° vs 180° at Runtime

Challenge 5+ uses the side sensor **after braking** to choose which time to apply:

```python
my_robot.brake()
hold_state(0.3)
side_check = my_robot.read_distance_2()
if side_check == -1 or side_check > FRONT_SLOW_DISTANCE:
    turn_duration = TURN_TIME_90    # corridor open to the side
else:
    turn_duration = TURN_TIME_180   # walls on front AND side
```

If your tuned 90° and 180° times work in isolation but the **wrong** time is being picked at runtime, the problem is the **classification threshold**, not the turn time:

| Symptom                             | Fix                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Always picks 90° at a real dead end | Side sensor still sees the side wall — it actually IS open. Lower the side-check threshold (e.g. `> 600`)                                 |
| Always picks 180° at a corner       | Side sensor returns a real distance even though the corridor is open. Raise the threshold or use `side_check > FRONT_SLOW_DISTANCE * 1.5` |

---

## 8. Field Test Routine

1. **Five clean 90° turns** on a fresh battery — record final heading variance.
2. **Five clean 180° turns** — same surface, same battery.
3. **One full Challenge 6 run** — confirms 90° + 180° + lost-wall recovery interact correctly.
4. Re-measure if you swap battery, change surface, or add hardware to the chassis.

---

## 9. Quick Copy/Paste Block (matches Challenge 5+ starter)

```python
TURN_SPEED    = 180
TURN_TIME_90  = 0.50    # ← replace with your tuned value
TURN_TIME_180 = 0.95    # ← replace; ~1.85 × TURN_TIME_90 is typical
```

Once these are solid, the corner and dead-end blocks in Challenges 4, 5, and 6 will all behave consistently from a fresh battery start.
