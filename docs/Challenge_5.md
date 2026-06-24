# Challenge 5: Outside Corners — Adding the Nib State

In Challenge 4 every turn was at a wall **in front** of you. But walls also **end**. At an
**outside corner** (a convex corner, or the tip of a free-standing wall called a "nib") the side
wall simply disappears and the side sensor returns `-1`. If you keep running the PID, the robot
drives straight off into open space.

The state-machine answer is to add a **third state** that handles this case.

You will learn:

- How to detect that the wall you were following has **ended**.
- Why a raw "wall is gone" reading needs a **debounce** before you trust it.
- How to **wrap** an outside corner by driving past it and turning _toward_ it.

---

## Success Criteria

My robot follows the inside edge of its nib, reaches the **outside corner**, **wraps around it**,
re-acquires the wall, and stops in the **goal pocket** on the far side.

---

## Before You Begin

1. Complete [Challenge 4](docs.html?doc=Challenge_4) — carry forward all your tuned values.
2. Open the **Simulator** and select **Challenge 5**.
3. Run your Challenge 4 code here — it follows the nib up, then drives straight off the top because
   it has no state for "the wall ended."

---

## Concept 1 — The new state: `NIB_WALL`

You already have `FOLLOW_WALL` and `TURN`. Challenge 5 adds `NIB_WALL`:

| State         | What the robot does                                    |
| ------------- | ------------------------------------------------------ |
| `FOLLOW_WALL` | hold the side wall with the PID                        |
| `TURN`        | wall close ahead → spin 90° **away** from the wall     |
| `NIB_WALL`    | side wall **ended** → wrap 90° **toward** where it was |

```mermaid
stateDiagram-v2
    [*] --> FOLLOW_WALL
    FOLLOW_WALL --> TURN: front <= FRONT_STOP_DISTANCE
    FOLLOW_WALL --> NIB_WALL: side lost for NIB_CONFIRM_TIME
    TURN --> FOLLOW_WALL: turn finished
    NIB_WALL --> FOLLOW_WALL: wrap finished
```

Notice the two turns spin in **opposite** directions. `TURN` turns _away_ from a wall blocking the
front; `NIB_WALL` turns _toward_ the side the wall just left, to follow it around the corner.

---

## Concept 2 — Detecting a lost wall (and why a debounce matters)

A wall is "lost" when the side reading is far larger than the distance you follow at, or `-1`:

```python
side = my_robot.read_distance_2()
if side != -1 and side <= NIB_LOST_DISTANCE:
    nib_lost_time = 0.0          # wall still there — reset the timer
else:
    nib_lost_time += 0.05        # wall looks gone — start counting
```

**The trap:** the PID normally overshoots a little, so the side reading wobbles above and below the
target. If `NIB_LOST_DISTANCE` were the same as your follow distance, a normal wobble would look
like a lost wall and the robot would spin at random.

Two ideas fix this:

| Tunable             | Job                                                                 |
| ------------------- | ------------------------------------------------------------------- |
| `NIB_LOST_DISTANCE` | "clearly gone" distance — set **well above** `TARGET_WALL_DISTANCE` |
| `NIB_CONFIRM_TIME`  | the wall must stay lost this long (seconds) before `NIB_WALL` fires |

`NIB_LOST_DISTANCE` rejects normal overshoot; `NIB_CONFIRM_TIME` is a **debounce** that ignores a
single noisy frame. Only when the wall is _clearly_ gone _and stays_ gone does the trigger fire.

> These two are pre-set for you (`400` mm and `0.5` s) because they depend on the maze, not on your
> driving. You tune the wrap itself, below.

---

## Concept 3 — Wrapping the corner

`NIB_WALL` runs a fixed little manoeuvre — no PID, because there is no wall to steer against yet:

1. Drive forward for `NIB_FORWARD_BEFORE` seconds to clear past the corner.
2. Spin 90° **toward** the wall side (reusing your `gyro_turn_pid` from Challenge 4).
3. Drive forward for `NIB_FORWARD_AFTER` seconds to come alongside the new wall.
4. Return to `FOLLOW_WALL`, which re-locks onto the wall.

| Tunable              | Effect                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| `NIB_FORWARD_BEFORE` | too small → clips the corner; too large → swings out wide               |
| `NIB_FORWARD_AFTER`  | too small → re-acquires the wall too early/late; too large → drifts off |

---

## What you tune in this challenge

| Group        | Tunables                                                                    |
| ------------ | --------------------------------------------------------------------------- |
| Carried over | everything from Challenge 4 (`BASE_SPEED`, side PID, `FRONT_*`, gyro gains) |
| Nib wrap     | `NIB_FORWARD_BEFORE`, `NIB_FORWARD_AFTER`                                   |

> Pre-set for you: `NIB_LOST_DISTANCE`, `NIB_CONFIRM_TIME`, and the turn mechanics.

---

## Tuning guide

| Observation                                 | Fix                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Robot spins randomly while following a wall | `NIB_LOST_DISTANCE` too low for your `TARGET_WALL_DISTANCE` — leave it at the pre-set value |
| Robot clips the corner as it wraps          | Increase `NIB_FORWARD_BEFORE`                                                               |
| Robot wraps too wide and loses the new wall | Decrease `NIB_FORWARD_BEFORE`, or tune `NIB_FORWARD_AFTER`                                  |
| Robot wraps but never re-locks the wall     | Adjust `NIB_FORWARD_AFTER` so it ends up beside the wall                                    |
| Turn under/over-rotates                     | Re-check `turn_Kp` / `turn_Kd` from Challenge 4                                             |

---

## Try it

1. Open **Challenge 5** — the three states and the wrap are already written.
2. Carry forward your Challenge 4 numbers, then tune the two `NIB_FORWARD_*` times.
3. The tuned answer is in `app/answers/challenge-5.py`.

---

## What's Next

[Challenge 6](docs.html?doc=Challenge_6) puts both turn types in one maze — dead ends _and_ outside
corners — handled by the exact same three-state machine.
