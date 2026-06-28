# Real-World Movement Calibration — Match the Simulator to the Robot

**Goal:** capture how the **physical** robot actually _moves_ so the simulator's drive physics can be
set to match. You run a few short tests, read a tape measure (and a couple of printed numbers), and
send the results back. I then set the movement values in
[app/js/robot-config.js](app/js/robot-config.js).

> **The robot has no wheel encoders.** Every test below uses **open-loop** motor commands (no PID) for
> a fixed time, then you read a tape measure or protractor. Run them on a **charged battery** and a
> **flat, clear floor** (≥ 3 m straight run for the speed tests).

Physical dimensions and sensor mounts are already measured and applied — this round is **movement
only**.

---

## What the simulator needs (and why)

The simulator turns a PWM command into motion with this exact model. Each test below pins down one
row of this table.

| `RobotConfig` field | What it means                                   | How the sim uses it                      | Test |
| ------------------- | ----------------------------------------------- | ---------------------------------------- | ---- |
| `maxPWM`            | Firmware PWM ceiling (**fixed at 255**)         | Top of the PWM scale                     | —    |
| `deadZonePWM`       | Highest PWM that produces **no** motion (stall) | `pwm ≤ deadZone → 0 mm/s`                | M1   |
| `topSpeed_ms`       | Steady speed at full PWM (255)                  | Linear top of the PWM→speed line         | M3   |
| `acceleration_ms2`  | How fast it speeds up from rest                 | Wheel-speed ramp **up**                  | M3   |
| `deceleration_ms2`  | How fast it slows after `brake()`               | Wheel-speed ramp **down**                | M4   |
| `wheelTrack_mm`     | Left↔right wheel spacing (**measured = 100**)   | `omega = (vL − vR) / wheelTrack`         | M5   |
| _(gyro scale)_      | deg/s reported vs deg/s actually turned         | Turn-angle integration                   | M5   |
| _(drive() clamp)_   | Lowest PWM `drive()` will pass (else forces 0)  | **Not modelled yet** — needed for parity | M2   |

The sim assumes the PWM→speed line is **straight** between `deadZonePWM` and `maxPWM`. M3 also checks
whether that assumption holds.

> **Two motor commands — the difference matters:**
>
> - `drive_forward(r, l)` sends the **raw PWM** (0–255), no clamp. Use it for M1, M3, M4.
> - `drive(r, l)` is the everyday helper — it **forces any wheel below ~120 PWM to 0**. M2 measures
>   that threshold so the sim can reproduce it.

---

## M0 — Direction sanity check (do this first)

Confirms the sim's sign conventions match the robot, otherwise every movement number is mirrored.

```python
# main.py — M0: direction check
from aidriver import AIDriver, hold_state

robot = AIDriver("left")

print("1) Should drive STRAIGHT FORWARD:")
robot.drive_forward(180, 180)
hold_state(1.0)
robot.brake()
hold_state(1.5)

print("2) Should spin RIGHT / CLOCKWISE on the spot:")
robot.drive(-150, 150)
hold_state(1.0)
robot.brake()
hold_state(1.5)

print("3) Gyro should read POSITIVE while spinning right:")
robot.drive(-150, 150)
for _ in range(20):
    print("gyro z =", robot.read_gyro_z_dps())
    hold_state(0.1)
robot.brake()
```

**Record →** did (1) go straight forward, (2) spin right, (3) read positive on a right spin? Note any
reversed axis.

---

## M1 — Dead-zone: the lowest PWM that moves the robot

```python
# main.py — M1: dead-zone sweep (raw PWM, no clamp)
from aidriver import AIDriver, hold_state

robot = AIDriver("left")

for pwm in (50, 60, 70, 80, 90, 100, 110, 120):
    print("PWM", pwm, "- watch the wheels for 1.5 s")
    robot.drive_forward(pwm, pwm)
    hold_state(1.5)
    robot.brake()
    hold_state(1.0)
print("Done. Note the LOWEST PWM at which the wheels actually turned.")
```

**Record →** lowest PWM that produced motion. `deadZonePWM` is the value **just below** it.

---

## M2 — `drive()` clamp threshold

The student code uses `drive()`, which zeroes any wheel below a cut-off. The sim needs that number.

```python
# main.py — M2: drive() clamp sweep (uses the clamped helper)
from aidriver import AIDriver, hold_state

robot = AIDriver("left")

for pwm in (90, 100, 110, 115, 120, 125, 130):
    print("drive() PWM", pwm)
    robot.drive(pwm, pwm)
    hold_state(1.5)
    robot.brake()
    hold_state(1.0)
print("Done. Note the LOWEST PWM at which drive() actually moved the robot.")
```

**Record →** lowest PWM that moved the robot via `drive()` (expected ≈ 120).

---

## M3 — Top speed, linearity, and acceleration (one set of runs)

Drive **straight at a fixed PWM** for a fixed time and tape-measure the distance. Do it twice per PWM
(2.0 s and 3.0 s). Differencing the two cancels the start-up ramp, giving the true steady speed; the
2.0 s run then reveals the ramp itself.

```python
# main.py — M3: timed straight run (set PWM and DURATION, re-flash each run)
from aidriver import AIDriver, hold_state

robot = AIDriver("left")

PWM = 255            # run each of: 120, 150, 180, 210, 255
DURATION = 2.0       # run each PWM at 2.0 s, then again at 3.0 s

print("Line the robot on a start mark. Going in 3 s...")
hold_state(3.0)
print("RUN  PWM", PWM, "for", DURATION, "s")
robot.drive_forward(PWM, PWM)
hold_state(DURATION)
robot.brake()
print("STOP - measure distance from the start mark (mm).")
```

**Record →** distance for each PWM at both durations:

| PWM | dist @2.0 s (mm) | dist @3.0 s (mm) |
| --- | ---------------- | ---------------- |
| 120 | `____`           | `____`           |
| 150 | `____`           | `____`           |
| 180 | `____`           | `____`           |
| 210 | `____`           | `____`           |
| 255 | `____`           | `____`           |

From these I compute, per PWM:

- **Steady speed** = `(dist@3.0 − dist@2.0) / 1.0 s` (mm/s). The 255 row gives **`topSpeed_ms`**.
- **Linearity**: do the five steady speeds fall on a straight line up from the dead-zone? (Tells me
  if the linear PWM→speed model is good enough.)
- **Acceleration** (from the 255 row): `t_accel = 2 × (V_top × 2.0 − dist@2.0) / V_top`, then
  **`acceleration_ms2` = V_top / t_accel**.

> Only the 2.0 s + 3.0 s pair at **PWM 255** is essential. The other PWMs are just for the linearity
> check — skip them if short on time.

---

## M4 — Deceleration: coast distance after `brake()`

```python
# main.py — M4: stopping distance from full speed
from aidriver import AIDriver, hold_state

robot = AIDriver("left")
print("Line up on a start mark. Full speed then brake, in 3 s...")
hold_state(3.0)

robot.drive_forward(255, 255)
hold_state(1.5)                    # reach full speed
print("BRAKE")
robot.brake()
print("Mark where it finally stops. Measure distance from the BRAKE point (mm).")
```

**Record →** coast distance past the BRAKE point (mm). I compute
**`deceleration_ms2` = V_top² / (2 × coast_distance)**.

---

## M5 — Turn rate + gyro scale (validates wheel track and turning)

```python
# main.py — M5: spin-rate / gyro check
from aidriver import AIDriver, hold_state
import time

robot = AIDriver("left")
print("Mark the robot's starting heading on the floor. Spinning in 3 s...")
hold_state(3.0)

heading = 0.0
samples = []
start = time.ticks_ms()
last = start
robot.drive(-150, 150)              # spin right / clockwise
while time.ticks_diff(time.ticks_ms(), start) < 2000:
    now = time.ticks_ms()
    dt = time.ticks_diff(now, last) / 1000.0
    last = now
    gz = robot.read_gyro_z_dps()
    heading += gz * dt
    samples.append(gz)
    time.sleep(0.02)
robot.brake()

print("avg spin rate (deg/s)      :", sum(samples) / len(samples))
print("gyro-integrated angle (deg):", heading)
print("Now measure the ACTUAL angle turned on the floor (protractor / marks).")
```

**Record →** average spin rate (deg/s), the gyro-integrated angle, and the **physically measured**
floor angle. The gap between the last two is the gyro-scale / wheel-track correction.

---

## Report — fill in and send back

```
DIRECTIONS (M0)
  straight forward OK? ............
  spins right (clockwise) OK? .....
  gyro positive on right spin? ....

DEAD-ZONE
  M1 raw dead-zone PWM (lowest move) ...
  M2 drive() clamp PWM (lowest move) ...

SPEED CURVE (M3)  distance in mm
  PWM 120 :  @2.0s ____   @3.0s ____
  PWM 150 :  @2.0s ____   @3.0s ____
  PWM 180 :  @2.0s ____   @3.0s ____
  PWM 210 :  @2.0s ____   @3.0s ____
  PWM 255 :  @2.0s ____   @3.0s ____   <- required (top speed + accel)

BRAKING (M4)
  coast distance past brake point (mm) ...

TURN (M5)
  avg spin rate (deg/s) ...........
  gyro-integrated angle (deg) .....
  measured floor angle (deg) ......
```

From this I set `deadZonePWM`, `topSpeed_ms`, `acceleration_ms2`, `deceleration_ms2`, the `drive()`
clamp, and the gyro/turn scale so the simulator matches your real robot.
