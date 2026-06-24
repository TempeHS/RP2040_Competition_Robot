# Gyro Turn Tuning Quickstart — 90° and 180° (On-Robot)

Use this checklist to tune the **gyro turn PID** so corners and dead-end
reversals end pointing exactly down the next corridor. The turn is now
**closed-loop**: the robot reads its own rotation rate from the onboard
LSM6DS3 gyroscope and stops itself at the target angle. There is no
turn-time to guess.

The challenge code calls:

```python
my_robot.turn_90("left")    # or "right"
my_robot.turn_180("left")   # or "right"
```

Both delegate to `my_robot.turn_degrees(target_deg, direction)`, which runs a
PID loop on the **heading error** (target − degrees turned so far).

> [!Important]
> Because the controller measures the actual rotation, a tuned turn stays
> accurate as the battery drains or the floor surface changes — exactly the
> drift that the old timed turns suffered from. You normally only tune the
> gains **once**.

---

## 1. The Tunable Gains

These are attributes on the robot object. Set them right after you create
`my_robot` if you want to override the defaults:

```python
my_robot = AIDriver("left")

my_robot.turn_Kp = 6.0        # proportional gain (deg error → motor speed)
my_robot.turn_Ki = 0.0        # integral gain (usually leave at 0)
my_robot.turn_Kd = 0.4        # derivative gain (damps overshoot)
my_robot.turn_tolerance = 2.0 # deg — how close counts as "arrived"
my_robot.turn_max_speed = 200 # cap on rotation wheel speed (0–255)
my_robot.turn_timeout_ms = 4000  # safety cut-off if the turn stalls
```

| Gain              | What it does                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `turn_Kp`         | How hard the robot drives toward the target angle. Too low → never reaches; too high → overshoot/oscillation.                            |
| `turn_Kd`         | Brakes the rotation as it approaches the target. Raises damping, kills overshoot.                                                        |
| `turn_Ki`         | Removes a small steady-state offset. Rarely needed for turns — leave at `0` unless the robot **consistently** stops a few degrees short. |
| `turn_tolerance`  | Dead-band around the target. The robot stops once it is within ± this many degrees. Smaller = more precise but risks hunting.            |
| `turn_max_speed`  | Upper speed clamp during the turn. Lower it for smoother, slip-free turns.                                                               |
| `turn_timeout_ms` | If the robot can't reach the target (wheel stalled, gyro fault) it gives up after this long so the program never hangs.                  |

> [!Note]
> The turn loop also respects `MIN_MOTOR_SPEED` (120 on hardware). It can't
> drive the wheels slower than that, so the last fraction of a degree is
> absorbed by `turn_tolerance`. Don't set `turn_tolerance` below ~`1.5`.

---

## 2. Calibrate the Gyro Bias First

A stationary gyro never reads exactly zero — it has a small constant
**bias**. The library measures and subtracts this automatically in
`_calibrate_gyro_bias()` when the robot is created, **so the robot must be
perfectly still during start-up**.

1. Place the robot on the floor and let go of it.
2. Power on / run the program. Stay hands-off for the first second.
3. If turns drift consistently in one direction even with good gains, the
   bias capture was disturbed — restart with the robot held still.

Check the gyro is detected:

```python
if not my_robot.has_gyro:
    print("No IMU detected — check GP16/GP17 wiring and address 0x6A")
```

---

## 3. Tune In This Order

1. **`turn_Kp`** — get the robot to reach roughly the right angle.
2. **`turn_Kd`** — remove overshoot / oscillation.
3. **`turn_tolerance`** — tighten final accuracy.
4. **`turn_Ki`** — only if a stubborn steady-state offset remains.

This is the classic P → D → (tolerance) → I order. Do **not** start with `Ki`.

---

## 4. Tune `turn_Kp`

Set up a single 90° corner (the Challenge 4 maze is ideal) and mark where
the chassis should end up.

1. Start with `turn_Kd = 0.0` and `turn_Kp = 6.0`.
2. Run `my_robot.turn_90("right")` three times.
3. Adjust using the table:

| Symptom                                     | Adjustment                                   |
| ------------------------------------------- | -------------------------------------------- |
| Stops well short of 90° (sluggish)          | Increase `turn_Kp` (`+1.0`)                  |
| Reaches 90° but overshoots then comes back  | `turn_Kp` is about right — move to `turn_Kd` |
| Spins fast and oscillates around the target | Decrease `turn_Kp` (`-1.0`)                  |
| Wheels slip / robot skids during the spin   | Lower `turn_max_speed` (try `160`)           |

Aim for a `turn_Kp` that reaches the target briskly with only a small
overshoot. Typical range: **4.0 – 8.0**.

---

## 5. Tune `turn_Kd`

With `turn_Kp` set, raise `turn_Kd` to brake the approach:

1. Start at `turn_Kd = 0.4`.
2. Run three 90° turns.
3. Adjust:

| Symptom                                 | Adjustment                                                |
| --------------------------------------- | --------------------------------------------------------- |
| Still overshoots and corrects back      | Increase `turn_Kd` (`+0.2`)                               |
| Slows too early, crawls into the target | Decrease `turn_Kd` (`-0.1`)                               |
| Jitters / buzzes near the target        | Decrease `turn_Kd`, then tighten `turn_tolerance` instead |

Typical range: **0.2 – 1.0**. The goal is to land on 90° with no visible
overshoot and no crawling.

---

## 6. Tune `turn_tolerance`

`turn_tolerance` decides how close is "good enough". Once `turn_Kp` and
`turn_Kd` are solid:

| Symptom                                         | Adjustment                            |
| ----------------------------------------------- | ------------------------------------- |
| Turn ends 3–4° off and that compounds in a maze | Decrease `turn_tolerance` (try `1.5`) |
| Robot hunts back and forth, never "arrives"     | Increase `turn_tolerance` (try `2.5`) |

Keep it between **1.5° and 3°**. Below `MIN_MOTOR_SPEED` the wheels can't
fine-correct, so very tight tolerances just cause hunting.

---

## 7. `turn_Ki` (only if needed)

If, after tuning P and D, the robot **consistently** stops a couple of
degrees short in the **same** direction every time, add a tiny integral
term:

1. Set `turn_Ki = 0.001` and test.
2. Increase slowly (`0.001` steps). Stop as soon as the offset is gone.

Too much `turn_Ki` causes slow oscillation that grows over the turn — back
it off immediately if you see that.

---

## 8. 180° Turns Need No Extra Tuning

Unlike the old timed turns (which needed a separate `TURN_TIME_180` and a
`≈1.7×` rule), the gyro controller simply targets a larger angle. The same
`turn_Kp` / `turn_Kd` / `turn_tolerance` that land a clean 90° will also
land a clean 180°. Verify with:

```python
my_robot.turn_180("right")
```

If the 180° **overshoots** noticeably while the 90° is perfect, nudge
`turn_Kd` up by `0.1` — the longer turn builds more momentum.

---

## 9. Distinguishing 90° vs 180° at Runtime

Challenge 6+ uses the side sensor **after braking** to choose which turn to
call (the choice is about _which method to call_, not about timing):

```python
my_robot.brake()
hold_state(0.3)
side_check = my_robot.read_distance_2()
dead_end = not (side_check == -1 or side_check > FRONT_SLOW_DISTANCE)
turn_dir = "right" if my_robot.wall_sign == -1 else "left"
if dead_end:
    my_robot.turn_180(turn_dir)   # walls on front AND side
else:
    my_robot.turn_90(turn_dir)    # corridor open to the side
```

If the turns themselves are accurate but the **wrong** turn is chosen, the
problem is the **classification threshold**, not the PID:

| Symptom                             | Fix                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Always picks 90° at a real dead end | Side sensor still sees a side wall. Lower the side-check threshold (e.g. `> 600`).                                                 |
| Always picks 180° at a corner       | Side sensor reads a distance even though the corridor is open. Raise the threshold, e.g. `side_check > FRONT_SLOW_DISTANCE * 1.5`. |

---

## 10. Field Test Routine

1. Restart the program with the robot **held still** so the gyro bias is
   captured cleanly.
2. **Five clean 90° turns** — record final heading variance.
3. **Five clean 180° turns** — same surface.
4. **One full Challenge 7 run** — confirms 90° + 180° + lost-wall recovery
   interact correctly.
5. The gains should hold across battery levels. If they don't, re-check the
   bias calibration and that the IMU is mounted firmly to the chassis.

---

## 11. Quick Copy/Paste Block (sensible defaults)

```python
my_robot = AIDriver("left")

# Gyro turn PID — defaults that work well in the simulator
my_robot.turn_Kp = 6.0
my_robot.turn_Ki = 0.0
my_robot.turn_Kd = 0.4
my_robot.turn_tolerance = 2.0
my_robot.turn_max_speed = 200
my_robot.turn_timeout_ms = 4000
```

Once these are solid, the corner and dead-end blocks in Challenges 4, 5,
6, and 7 all turn accurately and repeatably, regardless of battery level.
