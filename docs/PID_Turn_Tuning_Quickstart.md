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
angle turned so far. It runs in three phases, because real motors have a dead zone and the chassis
keeps rotating after the power is cut:

1. **Kick** — a short burst at `TURN_KICK_SPEED` breaks static friction, and the sign of the gyro
   during that burst is recorded, so an upside-down IMU cannot invert the loop.
2. **PID cruise** — the gains set the spin speed, clamped between `MIN_TURN_SPEED` and
   `TURN_MAX_SPEED`. Braking is **predictive**: power is cut once the angle it would coast through
   lands on the target.
3. **Settle and nudge** — the gyro keeps integrating through the coast, then any leftover error is
   closed with short pulses at `NUDGE_SPEED`.

```python
heading += gz * dt                                   # angle covered this step
if heading + (gz * TURN_COAST_TIME) >= target:       # predictive brake
    break
error = target - heading
speed = (turn_Kp * error) + (turn_Kd * (error - prev_error))
# ...clamp to MIN_TURN_SPEED..TURN_MAX_SPEED, drive the wheels in opposite directions...
```

Because it measures the **actual** rotation, a tuned turn stays accurate as the battery drains or
the floor changes. You normally tune the gains **once**.

---

## 2. The tunable gains

Three plain variables at the top of your challenge code. Start in the middle of each range:

| Gain             | Range     | What it does                                                                                                               |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `turn_Kp`        | 20 – 40   | How hard it drives toward the target angle. Too low → crawls and hits the timeout; too high → the clamp does all the work. |
| `turn_Kd`        | 0.2 – 0.8 | Brakes the spin as it approaches the target — kills overshoot.                                                             |
| `turn_tolerance` | 1.5 – 3.0 | Dead-band around the target. Stops once within ± this many degrees. Too small → wastes nudges.                             |

> The turn **mechanics** are fixed for you, not tuned: `TURN_ANGLE = 90`, the step time `TURN_DT`,
> the speed clamps (`TURN_MAX_SPEED`, `MIN_TURN_SPEED`), `TURN_COAST_TIME`, the `NUDGE_*` pulse
> settings, and `TURN_TIMEOUT_MS`. They are physics of this chassis, so leave them alone.

> The loop can't drive the wheels below `MIN_TURN_SPEED`, which is why the last few degrees are
> closed with pulses instead of by slowing down. Don't set `turn_tolerance` below ~`1.5`.

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

Start with `turn_Kd = 0.0` and `turn_Kp` in the middle of its range, then run the turn three times.

| Symptom                                    | Adjustment                                   |
| ------------------------------------------ | -------------------------------------------- |
| Crawls round, or reports a turn timeout    | Increase `turn_Kp` (`+5`)                    |
| Reaches 90° but overshoots then comes back | `turn_Kp` is about right — move to `turn_Kd` |
| Spins flat out and slams past the target   | Decrease `turn_Kp` (`-5`)                    |

Aim for a brisk approach with only small overshoot. Range: **20 – 40**.

### Step B — `turn_Kd`

With `turn_Kp` set, raise `turn_Kd` to brake the approach.

| Symptom                                 | Adjustment                                                |
| --------------------------------------- | --------------------------------------------------------- |
| Still overshoots and corrects back      | Increase `turn_Kd` (`+0.2`)                               |
| Slows too early, crawls into the target | Decrease `turn_Kd` (`-0.1`)                               |
| Jitters / buzzes near the target        | Decrease `turn_Kd`, then tighten `turn_tolerance` instead |

Range: **0.2 – 0.8**. Goal: land on 90° with no visible overshoot and no crawling.

If it consistently overshoots even with `turn_Kd` at the top of the range, the coast estimate is the
problem, not the gain — that is `TURN_COAST_TIME`, and it is a chassis constant.

### Step C — `turn_tolerance`

| Symptom                                         | Adjustment                            |
| ----------------------------------------------- | ------------------------------------- |
| Turn ends 3–4° off and that compounds in a maze | Decrease `turn_tolerance` (try `1.5`) |
| Robot hunts back and forth, never "arrives"     | Increase `turn_tolerance` (try `2.5`) |

Keep it between **1.5° and 3°**. Below `MIN_TURN_SPEED` the wheels can't fine-correct, so very tight
tolerances just burn through the nudge budget (`TURN_MAX_NUDGES`) without getting closer.

---

## 5. Which way does it turn?

`gyro_turn_pid(relative_angle_deg)` takes a **wall-relative** angle, and the sign decides the
direction using `my_robot.wall_sign`:

- **`TURN` state** (wall ahead) calls `gyro_turn_pid(TURN_ANGLE)` — spins _away_ from the wall.
- **`NIB_WALL` state** (outside corner) calls `gyro_turn_pid(-TURN_ANGLE)` — spins _toward_ the wall.

The same gains serve both — direction is just which wheel goes forward. If the turns are accurate but
the robot turns the **wrong way**, check that `AIDriver("left"/"right")` matches the wall you are
actually following.

---

## 6. Where to start

Begin in the middle of each range, then run Step A → C on your own robot:

| Gain             | Start in the middle of |
| ---------------- | ---------------------- |
| `turn_Kp`        | 20 – 40                |
| `turn_Kd`        | 0.2 – 0.8              |
| `turn_tolerance` | 1.5 – 3.0              |

Surface friction, battery charge and wheel wear all shift the right answer, so treat any number you
are given as a starting point, not a setting.
