# Nib vs. End-Wall Turn — State-Machine Redesign & Validation

**Date:** 2026-06-24 (updated)
**Scope:** Challenges 4–7 (gyro-turn-PID wall following + maze solving)
**Status:** Redesigned as a finite state machine. **C4 5/5, C5 5/5, C6 5/5** against the real
simulator physics. **C7 0/5** — a maze-geometry blocker, not a logic problem.

---

## 1. Summary

The original nib-vs-end-wall logic lived inline in one big loop with a `continue`-based 5-step
wrap. It worked mechanically but was hard to reason about, and the "wall lost" trigger fired
constantly because its threshold equalled the follow target (~200 mm), producing dozens of false
nib turns during ordinary PID following.

The logic has been **rebuilt as a finite state machine (FSM)**. The robot is always in exactly one
state; each pass of the main loop runs the current state, which returns the next state. Students
tune each state's parameters and the triggers that move between states.

All eight challenge files (`app/answers/challenge-{4,5,6,7}.py` and
`app/starter-code/challenge-{4,5,6,7}.py`) compile and share one canonical FSM body (tuned values
in the answers, `0`/`0.0` tunables in the starters).

---

## 2. The state machine

| State         | Meaning                              | C4  | C5/C6/C7 |
| ------------- | ------------------------------------ | --- | -------- |
| `FOLLOW_WALL` | hold the side wall with the side PID | ✅  | ✅       |
| `TURN`        | wall ahead → spin 90° **away**       | ✅  | ✅       |
| `NIB_WALL`    | outside corner → wrap 90° **toward** | —   | ✅       |

Challenge 4 is a **two-state** machine (`FOLLOW_WALL` + `TURN`, no nib). Challenges 5–7 add the
third `NIB_WALL` state. Every turn — dead-end and nib — reuses the **same** `gyro_turn_pid()`
helper written and tuned in Challenge 4.

```
        front <= FRONT_STOP_DISTANCE
  FOLLOW_WALL ───────────────────────────► TURN ──► FOLLOW_WALL
       │
       │  side lost (> NIB_LOST_DISTANCE or -1) for NIB_CONFIRM_TIME
       └───────────────────────────────────► NIB_WALL ──► FOLLOW_WALL
```

### `FOLLOW_WALL`

- Reads the front sensor. **Trigger → `TURN`:** `front != -1 and front <= FRONT_STOP_DISTANCE`.
- Reads the side sensor. **Trigger → `NIB_WALL`:** the side stays _lost_ — past
  `NIB_LOST_DISTANCE` (or `-1`) — for at least `NIB_CONFIRM_TIME` seconds (debounce).
- Otherwise runs the side PID + front speed ramp and stays in `FOLLOW_WALL`.

### `TURN` (dead end)

- Brake, settle, then a 90° gyro-PID turn **away** from the wall
  (`gyro_turn_pid(wall_sign == -1)` → left wall spins right), settle, return to `FOLLOW_WALL`.

### `NIB_WALL` (outside / convex corner)

1. Drive forward (no PID) `NIB_FORWARD_BEFORE` seconds to clear the corner.
2. 90° gyro-PID turn **toward** the wall (`gyro_turn_pid(wall_sign == 1)` → left wall spins left).
3. Drive forward (no PID) `NIB_FORWARD_AFTER` seconds to come alongside the new wall.
4. Return to `FOLLOW_WALL`.

---

## 3. The key fix: separate "lost" threshold from the follow target

The original trigger was `side == -1 or side > NIB_DISTANCE` with `NIB_DISTANCE ≈ 200` — the same
value the side PID holds. Normal PID overshoot routinely pushed the reading above 200, so the nib
turn fired constantly (≈197 spurious turns in one C5 run).

The FSM fixes this with **two independent ideas:**

- **A "clearly lost" distance well above the follow target.** `NIB_LOST_DISTANCE = 400` (vs. the
  `TARGET_WALL_DISTANCE = 200` the PID holds). Ordinary overshoot no longer looks like a missing
  wall.
- **A debounce.** The side must stay lost for `NIB_CONFIRM_TIME = 0.5 s` before `NIB_WALL` fires,
  so a single noisy frame can't trigger a turn.

Both are needed: the debounce alone is insufficient if the threshold equals the target.

### Tunable constants (answer key)

| Constant              | Answer | Starter         | Role                             |
| --------------------- | ------ | --------------- | -------------------------------- |
| `NIB_LOST_DISTANCE`   | `400`  | `400` (fixed)   | side past this = wall lost       |
| `NIB_CONFIRM_TIME`    | `0.5`  | `0.5` (fixed)   | seconds lost before nib fires    |
| `NIB_FORWARD_BEFORE`  | `0.30` | `0.0` (you set) | forward time before the nib turn |
| `NIB_FORWARD_AFTER`   | `0.45` | `0.0` (you set) | forward time after the nib turn  |
| `FRONT_STOP_DISTANCE` | `150`  | `0` (you set)   | front this close = dead end      |

---

## 4. Validation results

Pure-Node harness driving the **actual** `app/js/simulator.js` physics with the tuned answer-key
constants (5 trials per maze):

| Challenge | Maze              | Result                   | Notes                                                           |
| --------- | ----------------- | ------------------------ | --------------------------------------------------------------- |
| C4        | `corner`          | ✅ 5/5, 0 collisions     | One clean 90° dead-end turn into the goal zone                  |
| C5        | `outside_corners` | ✅ 5/5, 0 collisions     | Nib wrap now reaches the top-left pocket (≈3 nib turns)         |
| C6        | `dead_end`        | ✅ 5/5, 0 collisions     | Reached by wall-following up the left channel                   |
| C7        | `zigzag`          | ❌ 0/5, heavy collisions | Free-standing slalom islands — hostile to any hand-on-wall rule |

The separated `NIB_LOST_DISTANCE = 400` is what turned C5 from a grinding 1/5 into a clean 5/5.

---

## 5. Remaining blocker: C7 `zigzag` is a geometry problem

C7's maze is a **slalom of free-standing horizontal wall segments** (`app/js/mazes.js`,
`zigzag`), including a middle island at `y = 800` with open space on both sides. A hand-on-wall
(left-hand-rule) navigator has **no continuous surface to hold** through the slalom, so it loses
the wall and collides regardless of tuning. This has been confirmed across every tuning approach
(settle-period sweep, debounce sweep, and the FSM redesign).

This is **not** a control-logic defect — the same FSM solves C4/C5/C6 cleanly. To make C7 solvable
by the taught left-hand rule, the maze itself must change in `app/js/mazes.js`, by either:

1. Replacing the free-standing slalom with **connected, wall-huggable corridors**, or
2. Re-routing the path so a single continuous wall leads from start to the goal zone.

Any such change must be re-validated to 5/5 against the simulator physics. The challenge files
should **not** need further changes.

---

## 6. Files touched

- `app/answers/challenge-{4,5,6,7}.py` — FSM body (C4 two-state, C5–C7 three-state), tuned values
- `app/starter-code/challenge-{4,5,6,7}.py` — same FSM, tunables at `0`/`0.0`, mechanics pre-given
- (No simulator or validator changes — the FSM lives entirely in student code.)
