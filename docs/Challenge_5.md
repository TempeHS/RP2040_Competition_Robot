# Challenge 5 — Outside Corners (Lost-Wall Recovery)

> Carry forward all your tuned values from Challenge 4. The new
> behaviour is a single extra clause: what to do when the side sensor
> blanks out.

## What's new

In Challenges 1–4 the wall is always **there**. The PID just steers the
robot a fixed distance from a continuous surface. The moment that
surface ends — at an **outside corner** (also called a convex corner)
or at a free-standing wall ("nib") — the side sensor returns `-1`
("nothing in range"). With no error signal the PID drives perfectly
straight … and the robot leaves the wall behind.

Challenge 5 introduces **lost-wall recovery**: when the side sensor
returns `-1`, gently slow the wheel **on the wall side** so the robot
curls back toward where the wall used to be. Done right, the robot
wraps around the corner and re-acquires the wall on the other side.

## The maze

Two free-standing nibs, mirror-symmetric about the centre of the arena.
You spawn dead-centre, heading north. Your wall is the **inside edge of
your nib** (left edge for `AIDriver("right")`, right edge for
`AIDriver("left")`). Follow it up, wrap the top corner, and reach the
goal pocket behind the nib.

## What to tune

| Constant          | Job                                                                              |
| ----------------- | -------------------------------------------------------------------------------- |
| `LOST_WALL_DRIFT` | Fraction of `BASE_SPEED` subtracted from the **inside** wheel when `side == -1`. |

Range: `0.0` (no recovery — robot drives straight off into open space)
through about `0.30` (very tight curl). A good starting point with
`BASE_SPEED = 200` is `0.20`.

> **Stall warning:** keep the inside wheel speed `>= MIN_MOTOR_SPEED`
> (100). With `BASE_SPEED = 200` and `LOST_WALL_DRIFT = 0.30` the inside
> wheel runs at `200 - 60 = 140` ✅. With `BASE_SPEED = 140` and
> `LOST_WALL_DRIFT = 0.30` it would be `140 - 42 = 98` ❌ — the wheel
> stalls and the robot pivots in place.

## Pseudocode

```
loop forever:
    handle front-wall stop / 90° turn (carry-forward from C4)

    side = read_distance_2()
    if side == -1:           # OUTSIDE CORNER — wall ended
        slow_inside_wheel_by(BASE_SPEED * LOST_WALL_DRIFT)
        reset side_integral  # PID will re-lock cleanly when wall returns
        continue

    run side-PID exactly as in C4
```

## Common mistakes

- **Curling too hard.** A drift over `0.30` makes the robot pivot
  instead of curving. It will spin past the corner and lose the wall on
  the other side.
- **Curling the wrong way.** Use `wall_sign` to scale the drift —
  hard-coding "slow the left wheel" only works for one `AIDriver` mode.
- **Forgetting `MIN_MOTOR_SPEED`.** If the inside wheel falls below 100
  it will stall and the robot will rotate in place rather than curve.
- **Not resetting `side_integral`.** If you let the integrator keep
  ticking while `side == -1`, the PID will overshoot wildly the moment
  the wall reappears.

## Success

Wrap the top corner of your nib and stop inside the goal pocket on the
far side. Both `AIDriver("left")` and `AIDriver("right")` should solve
the mirrored maze with the same code.
