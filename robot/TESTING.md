# Robot Bring-Up: The 5 Stage Tests

Run the stages **in order**. Only move on when the current stage ends with
`SUMMARY: ... 0 failed`. Each stage re-checks the stages below it first, so a
fault you introduce later (a loose wire, a bad config edit) shows up straight away.

| Stage | Script            | Adds                                               |
| ----- | ----------------- | -------------------------------------------------- |
| 1     | `test1_servos.py` | Servos                                             |
| 2     | `test2_side.py`   | I2C buses, OLED, side ToF, side wall PID           |
| 3     | `test3_front.py`  | Front ToF, front PID                               |
| 4     | `test4_gyro.py`   | Gyro, gyro turns                                   |
| 5     | `test5_colour.py` | Colour sensor, floor reactions, full `main.py` run |

## Before You Start

1. Flash stock MicroPython for the Raspberry Pi Pico.
2. Upload the whole `robot/` folder with MicroPico (it is the sync folder).

   Or flash `firmware/robot.uf2` (built by `.devcontainer/build_firmware.sh`). It
   has `lib/` built in and writes `main.py` and `config.py` on first boot. With
   this firmware the built-in `lib/` wins over any uploaded `lib/`, so a library
   change needs a rebuild. Use stock MicroPython while you are still changing `lib/`.

3. Open the test script and **Run current file**. Answer prompts in the MicroPico terminal:
   - `>> ... [Enter]` - do what it says, then press Enter.
   - `?? ... [y/n]` - type `y` or `n` for what you saw. This records PASS/FAIL.
4. Every fix is a change in `config.py`. Upload it again, then re-run the stage.
5. Press Ctrl-C at any time to stop. The wheels always stop when a script ends.

### Wiring

| Part                                          | Pins             | Bus  |
| --------------------------------------------- | ---------------- | ---- |
| Left servo                                    | GP14             | -    |
| Right servo                                   | GP15             | -    |
| Front ToF (0x29) + OLED (0x3C)                | GP2 SDA, GP3 SCL | I2C1 |
| Side ToF (0x29) + colour (0x10) + gyro (0x6A) | GP4 SDA, GP5 SCL | I2C0 |

The Pico hardware fixes the bus numbers: GP2/GP3 can only be I2C1 and GP4/GP5 can
only be I2C0. The two ToFs both use address 0x29, so they must be on different buses.

### Equipment

- A block or stand to lift the wheels off the ground.
- A ruler.
- A long, straight wall (at least 2 m) and a corner.
- A small box or piece of card.
- Floor tiles: white (normal floor), black, silver, red and green.
- A small maze or box layout for stages 4 and 5.

---

## Stage 1 - Servos

**Run:** `test1_servos.py`. **Set-up:** wheels OFF the ground. No sensors needed.

| Step            | What happens                       | Look for                              | If it fails, change                                               |
| --------------- | ---------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| 1.1 Stop        | Both servos at stop for 3 s        | Both wheels completely still          | `LEFT_STOP_US`, `RIGHT_STOP_US` (move in steps of 5)              |
| 1.2 Direction   | Each wheel forward then backward   | Each wheel turns the named way        | `LEFT_REVERSED`, `RIGHT_REVERSED`                                 |
| 1.3 Speed steps | Both wheels at 10, 25, 50, 75, 100 | Each step faster; both wheels similar | Check the servos are the same model                               |
| 1.4 Deadband    | Speeds 0, 1, 2, 5                  | 0 still; 1, 2, 5 all creep slowly     | `SERVO_DEADBAND_US` (raise if 1 doesn't move, lower if 1 is fast) |
| 1.5 Reversals   | 40 full-speed direction flips      | No stall, reset or stuck wheel        | Power supply/battery, servo wiring                                |
| 1.6 Random spam | 2000 random speed commands         | No crash; prints commands per second  | -                                                                 |
| 1.7 Endurance   | Full speed for 20 s                | Steady speed, then still              | Battery charge, servo overheating                                 |

**Pass:** wheels still at 0, both go the right way, and speed 1 moves.

| Result                    | Value |
| ------------------------- | ----- |
| `LEFT_STOP_US`            |       |
| `RIGHT_STOP_US`           |       |
| `SERVO_DEADBAND_US`       |       |
| Commands per second (1.6) |       |
| Summary (passed / failed) |       |

---

## Stage 2 - Side Sensor and Side Wall PID

**Run:** `test2_side.py`. **Set-up:** starts with wheels OFF the ground; later steps are on the floor.

First it runs the stage 1 quick check, then an **I2C scan**. Every expected device
must be listed on its bus. If one is missing, check that device's wiring before
going any further.

| Step                      | What happens                                              | Look for                                                     | If it fails, change                               |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| 2.1 OLED                  | Shows 4 test lines, then 200 rapid updates                | `12345678` on the last line; no read errors                  | OLED wiring; `OLED_BUS`                           |
| 2.2 Accuracy              | 300 reads with a wall exactly 100 mm from the side sensor | Noise sd < 5 mm; mean within 15 mm of 100                    | Sensor mounting; dirty sensor window              |
| 2.3 Range sweep           | 10 s live readout                                         | Move a card from touching to 50 cm; covers 60-400 mm         | Sensor aimed at the floor or the robot body       |
| 2.4 Bus torture           | Side ToF + OLED read while the wheels thrash              | 0 read errors                                                | Servo wires away from I2C wires; lower `I2C_FREQ` |
| 2.5 Steering direction    | Wheels off the ground; move a card near and far           | Close = steers AWAY; far = steers TOWARD; no wall = straight | `WALL_SIDE`                                       |
| 2.6 Follow on target      | On the floor, 100 mm from the wall, 6 s                   | Holds the distance                                           | `SIDE_KP`                                         |
| 2.7 Follow from too close | Starts at 50 mm                                           | Moves out to target without scraping                         | `SIDE_KP`, `SIDE_KD`                              |
| 2.8 Follow from too far   | Starts at 200 mm                                          | Moves in to target without overshooting                      | `SIDE_KD`, `SIDE_MAX_STEER`                       |
| 2.9 Disturbance           | Push it toward and away from the wall                     | Recovers each time                                           | `SIDE_KP`, `SIDE_KD`                              |

The OLED shows `S <side mm>` and `st <steer>` live during these steps. Catch the
robot at the end of each run - it has no front sensor control yet.

**Tuning the side PID:**

1. Set `SIDE_KD = 0`. Raise `SIDE_KP` until the robot holds the wall but wobbles slightly.
2. Raise `SIDE_KD` until the wobble stops.
3. Only add `SIDE_KI` (try 0.001) if it settles consistently off-target.

| Result                                                                  | Value |
| ----------------------------------------------------------------------- | ----- |
| Side mean at 100 mm (2.2)                                               |       |
| Side noise sd (2.2)                                                     |       |
| Mean error from target, second half of each run (2.6 / 2.7 / 2.8 / 2.9) |       |
| `SIDE_KP` / `SIDE_KD` / `SIDE_KI`                                       |       |
| Summary (passed / failed)                                               |       |

---

## Stage 3 - Front Sensor and Front PID

**Run:** `test3_front.py`. **Set-up:** wheels OFF the ground at the start; later steps are on the floor.

Runs the quick checks for stages 1 and 2 first.

| Step              | What happens                                                      | Look for                                                           | If it fails, change                             |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| 3.1 Accuracy      | 300 reads with a wall exactly 100 mm in front                     | Noise sd < 5 mm; mean within 15 mm of 100                          | Sensor mounting                                 |
| 3.2 Bus torture   | Both ToFs + OLED read while the wheels thrash                     | 0 read errors                                                      | Wiring; lower `I2C_FREQ`                        |
| 3.3 Approach x3   | From ~60 cm, drives at the wall and stops; backs off between runs | Settles within 10 s; closest point not far below the stop distance | `FRONT_KP` (lower if it overshoots), `FRONT_KD` |
| 3.4 Hold distance | Move a box slowly toward and away for 15 s                        | Follows forward AND backward, never touches                        | `FRONT_KP`                                      |
| 3.5 Corner        | Follows a wall into a corner                                      | Stops square, `FRONT_STOP_MM` from the wall, without touching      | `FRONT_STOP_MM`, `FRONT_TOLERANCE_MM`           |

The approach printout shows `closest`, `final` and `time` for each run.
`closest` far below `FRONT_STOP_MM` means overshoot: lower `FRONT_KP` or add `FRONT_KD`.

| Result                                    | Value |
| ----------------------------------------- | ----- |
| Front mean at 100 mm (3.1)                |       |
| Approach 1 / 2 / 3: closest, final, ms    |       |
| `FRONT_KP` / `FRONT_KD` / `FRONT_STOP_MM` |       |
| Summary (passed / failed)                 |       |

---

## Stage 4 - Gyro and Turns

**Run:** `test4_gyro.py`. **Set-up:** wheels OFF the ground at the start; later steps are on the floor.

Runs the quick checks for stages 1-3, then measures the gyro bias. **Keep the robot
completely still whenever the gyro is measuring its bias.**

| Step            | What happens                                    | Look for                           | If it fails, change                                   |
| --------------- | ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| 4.1 Noise       | 500 reads, robot still                          | sd < 1 deg/s; 0 read errors        | Gyro mounting (must be firm, not on foam)             |
| 4.2 Drift       | 10 s still                                      | Drift < 2 deg                      | Re-run; keep the table still                          |
| 4.3 Direction   | Turn the robot 90 deg clockwise BY HAND         | Reads about +90                    | `GYRO_SIGN` (flip to 1 if it reads -90)               |
| 4.4 Right x4    | Four +90 turns                                  | Faces the original direction       | `TURN_KP`, `TURN_TOLERANCE_DEG`                       |
| 4.5 Left x4     | Four -90 turns                                  | Faces the original direction       | Same                                                  |
| 4.6 Mixed       | 180, -180, 45, -45, 10, -10                     | Every error within tolerance       | `TURN_KP` (raise if small turns stall)                |
| 4.7 Torture     | 20 alternating +/-90 turns                      | Still faces the original direction | `TURN_KD` if it overshoots                            |
| 4.8 Bus torture | Gyro + ToFs + OLED read while the wheels thrash | 0 read errors                      | Gyro wiring; if errors persist, gyro on a SoftI2C bus |
| 4.9 Box run     | Follow, stop at the front wall, turn away, x4   | Four clean corners                 | Stage 2/3 tuning                                      |

Each turn prints `turn +90 -> error +0.8 deg in 950 ms`.

**Tuning the turns:**

1. Raise `TURN_KP` until turns are quick but overshoot slightly.
2. Add `TURN_KD` (try 0.02) to remove the overshoot.
3. If turns are too violent, lower `TURN_MAX_SPEED`.

| Result                                      | Value |
| ------------------------------------------- | ----- |
| Gyro bias / noise sd (4.1)                  |       |
| Drift in 10 s (4.2)                         |       |
| Hand turn reading (4.3)                     |       |
| Worst error: right / left / mixed / torture |       |
| `TURN_KP` / `TURN_KD` / `TURN_MAX_SPEED`    |       |
| Summary (passed / failed)                   |       |

---

## Stage 5 - Colour Sensor and the Full Program

**Run:** `test5_colour.py`. **Set-up:** wheels OFF the ground at the start; later steps are on the floor and in the maze.

Runs the quick checks for stages 1-4 first.

| Step            | What happens                                                       | Look for                                                         | If it fails, change                                    |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------ |
| 5.1 Survey      | Measures white, black, silver, red and green tiles (30 reads each) | Each surface classified correctly                                | Copy the printed **Suggested config** into `config.py` |
| 5.2 Bus torture | Every sensor + OLED read while the wheels thrash                   | 0 read errors                                                    | Wiring                                                 |
| 5.3 Black x3    | Follows the wall onto a black tile                                 | Stops, reverses, turns round                                     | `BLACK_MAX_W`, `REVERSE_SPEED`, `REVERSE_MS`           |
| 5.4 Victims     | Drives onto red, then green                                        | Stops and shows `VICTIM RED` / `VICTIM GREEN`                    | `RED_RATIO`, `GREEN_RATIO`, `VICTIM_PAUSE_MS`          |
| 5.5 Full run    | Runs `main.py` in the maze for 60 s                                | Follows walls, turns at corners, avoids black, stops for victims | Whichever stage the problem belongs to                 |

**Using the survey (5.1):** the survey prints suggested values, for example:

```text
BLACK_MAX_W = 140
SILVER_MIN_W = 7300
RED_RATIO = 0.48
GREEN_RATIO = 0.44
```

Copy them into `config.py`, upload it again and re-run until every surface passes. If it says
`SILVER: not brighter than other surfaces`, the sensor needs its own light -
room lighting alone isn't enough to pick out silver.

Colour readings depend on the light. Re-run the survey at the competition venue.

| Surface | r   | g   | b   | w   | Classified as |
| ------- | --- | --- | --- | --- | ------------- |
| White   |     |     |     |     |               |
| Black   |     |     |     |     |               |
| Silver  |     |     |     |     |               |
| Red     |     |     |     |     |               |
| Green   |     |     |     |     |               |

| Result                         | Value |
| ------------------------------ | ----- |
| `BLACK_MAX_W` / `SILVER_MIN_W` |       |
| `RED_RATIO` / `GREEN_RATIO`    |       |
| Black runs found (5.3)         |       |
| Victims found (5.4)            |       |
| Summary (passed / failed)      |       |

---

## After Stage 5

`main.py` is the competition program. Run it directly; it starts on power-up.
Add new behaviour there. The building blocks are in `lib/control.py` and all
the numbers are in `config.py`.

Not handled yet: **outside corners** (the wall ends and the robot should wrap
round it). With no wall, the robot drives straight.

## When Something Breaks Later

Go back to the **lowest** stage that touches the part you suspect and run it
again. Because each stage re-checks everything below it, the first FAIL in the
summary points at the cause.
