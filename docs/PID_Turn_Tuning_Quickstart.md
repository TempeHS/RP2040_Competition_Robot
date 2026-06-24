# Gyro Turn Tuning Quickstart (On-Robot)

Use this checklist to tune the **gyro turn** so every corner ends pointing exactly down the next
corridor. The turn is **closed-loop**: your `gyro_turn_pid()` loop reads the robot's own rotation
rate from the onboard LSM6DS3 gyroscope and stops itself at the target angle. There is no turn-time
to guess.

You write and tune this turn in [Challenge 4](docs.html?doc=Challenge_4); every later challenge
reuses the **same** gains.

---

## 1. How the turn works

`gyro_turn_pid()` spins the robot on the spot and adds up the gyro reading each step to track the
angle turned so far. It keeps going until it is within `turn_tolerance` of 90°:

```python
heading = 0.0
while (TURN_ANGLE - heading) > turn_tolerance:
    gz = my_robot.read_gyro_z_dps()          # spin rate, deg/s (bias-corrected)
    heading += abs(gz) * TURN_DT             # angle covered this step
    error = TURN_ANGLE - heading
    speed = (turn_Kp * error) + (turn_Kd * (error - prev_error))
    # ...clamp speed, drive the wheels in opposite directions...
```

Because it measures the **actual** rotation, a tuned turn stays accurate as the battery drains or
the floor changes. You normally tune the gains **once**.

---

## 2. The tunable gains

These are plain variables at the top of your challenge code:

```python
turn_Kp = 6.0          # proportional gain (deg error → spin speed)
turn_Kd = 0.4          # derivative gain (damps overshoot)
turn_tolerance = 2.0   # deg — how close to 90° counts as "arrived"
```

| Gain             | What it does                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `turn_Kp`        | How hard it drives toward the target angle. Too low → never reaches; too high → overshoot/oscillation. |
| `turn_Kd`        | Brakes the spin as it approaches the target — kills overshoot.                                         |
| `turn_tolerance` | Dead-band around the target. Stops once within ± this many degrees. Too small → hunting.               |

> The turn **mechanics** are fixed for you, not tuned: `TURN_ANGLE = 90`, the step time `TURN_DT`,
> the speed clamps (`TURN_MAX_SPEED`, `MIN_TURN_SPEED`), and a safety step-cap. They are physics, so
> leave them alone.

> The loop can't drive the wheels below `MIN_TURN_SPEED` (120 on hardware), so the last fraction of
> a degree is absorbed by `turn_tolerance`. Don't set `turn_tolerance` below ~`1.5`.

---

## 3. Calibrate the gyro bias first

A stationary gyro never reads exactly zero — it has a small constant **bias**. The library measures
and subtracts it automatically when the robot is created, **so the robot must be perfectly still
during start-up**.

1. Place the robot on the floor and let go.
2. Run the program. Stay hands-off for the first second.
3. If turns drift the same way every time even with good gains, the bias capture was disturbed —
   restart with the robot held still.

Check the gyro is detected:

```python
if not my_robot.has_gyro:
    print("No IMU detected — check GP16/GP17 wiring and address 0x6A")
```

---

## 4. Tune in this order: `turn_Kp` → `turn_Kd` → `turn_tolerance`

Set up a single 90° corner (the Challenge 4 maze is ideal) and mark where the chassis should end up.

### Step A — `turn_Kp`

Start with `turn_Kd = 0.0`, `turn_Kp = 6.0`, and run the turn three times.

| Symptom                                     | Adjustment                                   |
| ------------------------------------------- | -------------------------------------------- |
| Stops well short of 90° (sluggish)          | Increase `turn_Kp` (`+1.0`)                  |
| Reaches 90° but overshoots then comes back  | `turn_Kp` is about right — move to `turn_Kd` |
| Spins fast and oscillates around the target | Decrease `turn_Kp` (`-1.0`)                  |

Aim for a brisk approach with only small overshoot. Typical range: **4.0 – 8.0**.

### Step B — `turn_Kd`

With `turn_Kp` set, raise `turn_Kd` from `0.4` to brake the approach.

| Symptom                                 | Adjustment                                                |
| --------------------------------------- | --------------------------------------------------------- |
| Still overshoots and corrects back      | Increase `turn_Kd` (`+0.2`)                               |
| Slows too early, crawls into the target | Decrease `turn_Kd` (`-0.1`)                               |
| Jitters / buzzes near the target        | Decrease `turn_Kd`, then tighten `turn_tolerance` instead |

Typical range: **0.2 – 1.0**. Goal: land on 90° with no visible overshoot and no crawling.

### Step C — `turn_tolerance`

| Symptom                                         | Adjustment                            |
| ----------------------------------------------- | ------------------------------------- |
| Turn ends 3–4° off and that compounds in a maze | Decrease `turn_tolerance` (try `1.5`) |
| Robot hunts back and forth, never "arrives"     | Increase `turn_tolerance` (try `2.5`) |

Keep it between **1.5° and 3°**. Below `MIN_TURN_SPEED` the wheels can't fine-correct, so very tight
tolerances just cause hunting.

---

## 5. Which way does it turn?

`gyro_turn_pid(turn_right)` takes a direction flag, and the state that calls it passes the right
value from `my_robot.wall_sign`:

- **`TURN` state** (wall ahead) spins _away_ from the wall.
- **`NIB_WALL` state** (outside corner) spins _toward_ the wall.

The same gains serve both — direction is just which wheel goes forward. If the turns are accurate but
the robot turns the **wrong way**, check that `AIDriver("left"/"right")` matches the wall you are
actually following.

---

## 6. Copy/paste starting gains (simulator-tuned)

```python
turn_Kp = 6.0
turn_Kd = 0.4
turn_tolerance = 2.0
```

Use these as your starting point on hardware, then re-run Step A → C if the real robot over- or
under-rotates.
