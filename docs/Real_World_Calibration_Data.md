# Real-World Calibration — Measure the Robot, Match the Simulator

**Goal:** capture how the **physical** robot and the **real maze** actually behave, so the
simulator's physics can be set to match. You measure, you send the numbers back, I update
[app/js/robot-config.js](app/js/robot-config.js) and the maze geometry.

**How it works — three steps:**

1. **Part A** — measure the robot and maze with a ruler/tape. Fill in the tables.
2. **Part B** — copy each code block into `main.py`, run it, and read the numbers it **prints** in
   the REPL (or measure with a tape where noted).
3. **Part C** — copy the _Report_ table, paste in every number, and send it back.

> Run every Part B test on a **charged battery** and a **flat floor**. The robot has **no wheel
> encoders**, so for speed/distance you read a tape measure — the code just runs the motors for an
> exact time and tells you when to measure.

---

## Part A — Physical measurements (robot powered off, use a ruler/calipers)

### A1. Robot dimensions — all in millimetres

| #   | Quantity                                               | Sim value | **Your measurement** | How to measure                                  |
| --- | ------------------------------------------------------ | --------- | -------------------- | ----------------------------------------------- |
| 1   | Wheel base (front tyre ↔ rear tyre, centre-to-centre)  | ??? mm    | `135 mm`             | Tyre contact patch to tyre contact patch        |
| 1   | Wheel track (left tyre ↔ right tyre, centre-to-centre) | ???       | `100 mm`             | Tyre contact patch to tyre contact patch        |
| 2   | Body width (widest point)                              | 120 mm    | `120 mm`             | Across the chassis at its widest                |
| 3   | Body length (front ↔ back)                             | 150 mm    | `200 mm`             | Front bumper to rear bumper                     |
| 4   | Drive-wheel outer diameter                             | 65 mm     | `125 mm`             | Outer Ø of the rubber tyre                      |
| 5   | Centre → drive-axle offset                             | 75 mm     | `____ mm`            | Body centre to the line of the two drive wheels |

### A2. Sensor mounting — where each sensor sits and which way it points

| #   | Sensor           | Sim mount                             | **Your offset** | **Your direction** | How to measure                              |
| --- | ---------------- | ------------------------------------- | --------------- | ------------------ | ------------------------------------------- |
| 6   | Front ultrasonic | 75 mm ahead of centre, faces forward  | `90 mm`         | `Forward`          | Centre of chassis to the sensor face        |
| 7   | Side ultrasonic  | 60 mm from centre, faces 90° sideways | `65 mm`         | `90° (90?)`        | Is it exactly sideways, or angled fwd/back? |
| 8   | Gyro (LSM6DS3)   | at body centre                        | n/a             | yaw about vertical | Confirm it is roughly central               |

### A3. Arena & maze — overall size, then **section sizes**

Maze is constructed from sections of timber, 290mm wide 3mm thick 190mm tall so the the maze design can be any configuration using that size

> For each real maze also send the wall rectangles as `{x, y, width, height}` in mm from the
> top-left corner, plus the robot **start** (x, y, heading) and the **goal zone** (x, y, w, h).
> A dimensioned photo or sketch is fine — these become the new entries in
> [app/js/mazes.js](app/js/mazes.js).

---

## Part B — Run-and-read tests (copy each block into `main.py`)

Each block is a complete `main.py`. Flash it, open the REPL, and record what it prints (or what the
tape measure reads). All tests use **open-loop** motor commands — no PID — so we capture raw physics.

> **Two motor commands are used below, and the difference matters:**
>
> - `drive_forward(r, l)` sends the **raw PWM** you ask for (0–255). Use it for the dead-zone and
>   speed tests so nothing is clamped.
> - `drive(r, l)` is the everyday helper — it **forces any wheel below PWM 120 to 0**. Use it only
>   where noted (spins).

### B1. Sign-convention check — confirm directions match the simulator

```python
# main.py — B1: direction check
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

print("3) Gyro sign on that spin — value should be POSITIVE while spinning right:")
robot.drive(-150, 150)
for _ in range(20):
    print("gyro z =", robot.read_gyro_z_dps())
    hold_state(0.1)
robot.brake()
```

**Record:** did (1) go straight forward? did (2) spin right? was the gyro in (3) positive on a right
spin? Note any axis that is reversed.

### B2. Gyro rest bias & noise — robot must stay perfectly still

```python
# main.py — B2: gyro bias & noise (do not touch the robot)
from aidriver import AIDriver, hold_state
import time

robot = AIDriver("left")
print("Hold still... sampling for 10 s")
hold_state(1.0)

samples = []
start = time.ticks_ms()
while time.ticks_diff(time.ticks_ms(), start) < 10000:
    samples.append(robot.read_gyro_z_dps())
    time.sleep(0.05)

avg = sum(samples) / len(samples)
print("samples      :", len(samples))
print("bias  (deg/s):", avg)
print("spread(deg/s):", max(samples) - min(samples), "(", min(samples), "to", max(samples), ")")
```

**Record:** `bias` (average) and `spread` (max − min).

### B3. Motor dead-zone — the lowest PWM that actually moves the robot

```python
# main.py — B3: dead-zone sweep (raw PWM, no clamp)
from aidriver import AIDriver, hold_state

robot = AIDriver("left")

for pwm in (50, 60, 70, 80, 90, 100, 110, 120):
    print("PWM", pwm, "- watch the wheels for 1.5 s")
    robot.drive_forward(pwm, pwm)
    hold_state(1.5)
    robot.brake()
    hold_state(1.0)
print("Done. Note the lowest PWM at which the wheels actually turned.")
```

**Record:** lowest PWM that moves the robot (the dead-zone is just below it).

### B4. Speed vs PWM — drive straight for exactly 2.0 s, tape-measure the distance

Run this block once per PWM value (change `PWM` and re-flash), measuring how far the robot travels
each time. Speed = distance ÷ 2.0.

```python
# main.py — B4: timed straight run (set PWM, measure distance)
from aidriver import AIDriver, hold_state

robot = AIDriver("left")

PWM = 150            # <-- run with 120, 150, 180, 210, 255

print("Line the robot up on a start mark. Going in 3 s...")
hold_state(3.0)
print("RUN")
robot.drive_forward(PWM, PWM)
hold_state(2.0)
robot.brake()
print("STOP - measure distance travelled (mm) for PWM", PWM)
```

**Record** the distance for each PWM:

| PWM | Distance in 2.0 s (mm) | Speed = dist ÷ 2 (mm/s) |
| --- | ---------------------- | ----------------------- |
| 120 | `____`                 | `____`                  |
| 150 | `____`                 | `____`                  |
| 180 | `____`                 | `____`                  |
| 210 | `____`                 | `____`                  |
| 255 | `____`                 | `____`                  |

### B5. Spin rate & wheel base — spin for 2.0 s, compare gyro vs the floor

```python
# main.py — B5: spin-rate / wheel-base check
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
print("Now measure the ACTUAL angle turned (floor marks / protractor).")
```

**Record:** average spin rate (deg/s), the gyro-integrated angle, and the **physically measured**
angle. The gap between the last two tells us if the gyro scale or wheel base is off.

### B6. Braking distance — how far it travels after `brake()`

```python
# main.py — B6: stopping distance
from aidriver import AIDriver, hold_state

robot = AIDriver("left")
print("Line up on a start mark. Full speed then brake, in 3 s...")
hold_state(3.0)

robot.drive_forward(255, 255)
hold_state(1.5)                    # reach full speed
print("BRAKE")
robot.brake()
print("Measure: total distance from the start mark, AND mark where it finally stopped.")
```

**Record:** how far past the "BRAKE" point the robot coasted (mm), and roughly how long it took to
stop (seconds). Decel ≈ top_speed ÷ stop_time.

---

## Part C — Report table (fill in and send back)

```
ROBOT DIMENSIONS (mm)
  1 wheel base ................
  2 body width ................
  3 body length ...............
  4 wheel diameter ............
  5 centre->axle offset .......

SENSORS
  6 front offset / direction ..
  7 side  offset / angle ......
  8 gyro central? .............

DIRECTIONS (B1)
  straight forward OK? ........
  spins right OK? .............
  gyro positive on right? .....

GYRO (B2)
  bias (deg/s) ...............
  noise spread (deg/s) .......

MOTORS
  B3 dead-zone PWM (lowest move)
  B4 speed @120 / 150 / 180 / 210 / 255 (mm/s) ......... / / / /
  B5 spin rate (deg/s) .......
  B5 gyro angle vs real angle (deg) ......... /
  B6 stop distance (mm) / stop time (s) ...... /

MAZE (mm)
  9-12 arena W / D / wall thick / wall height ... / / /
  13 corridor clear width .....
  14 wall segment length ......
  15 dead-end depth ...........
  16 nib size .................
  17 corner gap width .........
  18 goal zone size ...........
  + wall rectangles {x,y,w,h}, start (x,y,heading), goal (x,y,w,h)
```

Once I have these, I set `RobotConfig` (dead-zone PWM, top speed, accel/decel, wheel base, sensor
offsets, gyro scale) and rebuild the mazes so the simulator matches your real robot and arena.
