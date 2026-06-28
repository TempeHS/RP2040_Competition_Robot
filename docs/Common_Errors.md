# Common Error Messages – AIDriver RP2040

This appendix lists common error messages you may see while working through the AIDriver challenges, what they mean in plain English, and how to fix them.

Use it as a quick reference when something goes wrong.

---

## 1. `NameError: name 'driver' is not defined`

**Example message:**

```text
NameError: name 'driver' is not defined
```

**What it means (plain English):**  
Python can’t find a variable or name called `driver`.

**Likely causes:**

- You created your robot with a different name (e.g. `my_robot = AIDriver("left")`) but later used `driver`.
- You mis-typed the name (e.g. `my_robt` vs `my_robot`).

**How to fix:**

1. Find where you created the robot (usually near the top of `main.py`).
2. Use exactly the **same name** everywhere you refer to it.
3. A simple pattern is:

   ```python
   my_robot = AIDriver("left")
   my_robot.drive_forward(200, 200)
   ```

---

## 2. `AttributeError: 'AIDriver' object has no attribute 'backward'`

**Example message:**

```text
AttributeError: 'AIDriver' object has no attribute 'backward'
```

**What it means:**  
The `AIDriver` class does not have a function called `backward`.

**Likely causes:**

- You used a name from a flowchart or from another language instead of the actual library function.
- You wrote:

  ```python
  my_robot.backward(200, 200)
  ```

  instead of:

  ```python
  my_robot.drive_backward(200, 200)
  ```

**How to fix:**

- Use the correct function names from the AIDriver library:
  - `drive_forward(right_speed, left_speed)`
  - `drive_backward(right_speed, left_speed)`
  - `rotate_left(turn_speed)`
  - `rotate_right(turn_speed)`
  - `brake()`
  - `read_distance()`

---

## 3. `SyntaxError: invalid syntax` (missing colon)

**Example message:**

```text
  File "main.py", line 12
    while driver.read_distance() == -1
                                      ^
SyntaxError: invalid syntax
```

**What it means:**  
Python expected a `:` or some other symbol at the end of the line.

**Likely causes:**

- You forgot the colon (`:`) at the end of a `while`, `if`, `for`, or `def` line.

**How to fix:**

- Check the line the error points to (e.g. `line 12`) and make sure it ends with a colon:

  ```python
  while driver.read_distance() == -1:
      print("Robot too close")
  ```

---

## 4. `IndentationError: unexpected indent` / code not indented

**Example messages:**

```text
IndentationError: unexpected indent
```

or

```text
IndentationError: expected an indented block
```

**What it means:**  
Python is confused by how far your lines are indented.

**Likely causes:**

- Code inside a `while`, `if`, `for`, or `def` is not indented at all.
- Some lines inside the same block are indented differently.

**How to fix:**

- For a `while` loop, the body should be indented, for example:

  ```python
  while True:
      my_robot.drive_forward(200, 200)
      sleep(0.1)
  ```

- Make sure all lines inside the block start with the same number of spaces.

---

## 5. `ImportError: no module named 'aidriver'`

**Example message:**

```text
ImportError: no module named 'aidriver'
```

**What it means:**  
Python cannot find the `aidriver` library file.

**Likely causes:**

- `aidriver.py` is not in the `lib/` folder on the board.
- The file is mis-named (e.g. `AiDriver.py`, `aidriver (1).py`).

**How to fix:**

1. In the Arduino MicroPython Lab file view, make sure there is a `lib` folder.
2. Inside `lib`, check there is a file named **exactly** `aidriver.py`.
3. Use:

   ```python
   from aidriver import AIDriver
   ```

   at the top of your `main.py`.

---

## 6. Robot “does nothing” (no movement, no errors)

**What it looks like:**

- Program runs, no error is shown, but the robot does not move.

**Likely causes:**

- You never call a movement function inside your loop.
- Your loop is empty or only has `sleep()` statements.
- Speeds set too low (e.g. below ~120).

**How to fix:**

- Make sure your `while True:` loop contains commands like:

  ```python
  while True:
      my_robot.drive_forward(200, 200)
      sleep(0.1)
  ```

- Use speed values around `200` for reliable motion.

---

## 7. Robot freezes or keeps rebooting

**What it looks like:**

- The board disconnects, restarts, or stops responding while the program is running.

**Likely causes:**

- An infinite loop with **no `sleep()`** call (CPU never gets a break).
- Very tight loops that spam the console with prints.

**How to fix:**

- Always include a small delay in your main loop, for example:

  ```python
  while True:
      # your logic here
      sleep(0.05)  # 50 ms pause
  ```

- Reduce the number of `print()` calls inside fast loops.

---

## 8. Ultrasonic sensor always reads -1

**What it looks like:**

- `my_robot.read_distance()` returns `-1` every time.

**Likely causes:**

- Sensor is too close (< 20 mm) or too far (> 2000 mm) from any object.
- Sensor is pointing into open space.
- Wiring issue on TRIG/ECHO pins.

**How to fix:**

1. Place an object 10–50 cm in front of the sensor.
2. Check the wiring matches the assembly instructions.
3. Turn on AIDriver debug and watch the messages:

   ```python
   import aidriver
   from aidriver import AIDriver

   aidriver.DEBUG_AIDRIVER = True
   robot = AIDriver("left")
   ```

4. Run a simple distance test loop and see what the debug messages say.

---

---

## 9. Robot steers the wrong way during PID wall following

**What it looks like:**

- The robot drifts toward the wall when it should correct away, or vice versa.
- The robot spins or veers immediately when PID starts.

**How to diagnose:**

Upload and run the steering direction test from your Pico:

```
tests/test_pid_steer_direction.py
```

Place the robot on the floor with space to move. The test drives the robot in two short bursts and tells you which way the nose **should** turn. Watch the robot:

| Step | What the test does | Robot nose should |
| ---- | ------------------ | ----------------- |
| 1    | Right wheel faster | turn **LEFT**     |
| 2    | Left wheel faster  | turn **RIGHT**    |

**How to fix:**

If either step goes the **opposite** way, swap the correction sign in your PID loop:

```python
# WRONG (if robot steers backwards):
my_robot.drive(BASE_SPEED + correction, BASE_SPEED - correction)

# FIX:
my_robot.drive(BASE_SPEED - correction, BASE_SPEED + correction)
```

---

## 10. Robot is erratic or jerky during PID wall following

**What it looks like:**

- The robot zigzags wildly even with low Kp values.
- The motors seem to pulse or stutter constantly.
- The robot moves erratically even when almost at the target distance.

**Likely cause:**

The raw HC-SR04 ultrasonic sensor can jump ±20–50 mm between readings even when the robot is completely still. This noise feeds straight into the PID correction, causing the motors to jerk every loop.

**How to diagnose:**

Upload and run the sensor noise diagnostic from your Pico:

```
tests/test_pid_sensor_noise.py
```

Keep the robot **still** beside a wall while it runs. It prints 20 readings and tells you:

- The **spread** (max − min) of the raw readings
- What correction swing that produces at your Kp

| Spread   | Diagnosis                                       | Fix                                     |
| -------- | ----------------------------------------------- | --------------------------------------- |
| > 30 mm  | High noise — the main cause of erratic movement | Average 3 readings per loop (see below) |
| 15–30 mm | Moderate noise                                  | Average 2 readings, reduce Kp to ≤ 0.4  |
| < 15 mm  | Sensor is clean                                 | Reduce Kp by 30%                        |

**How to fix (averaging sensor readings):**

Replace the single sensor read in your loop with this:

```python
# Instead of:
wall_distance = my_robot.read_distance_2()

# Use this averaged version:
r1 = my_robot.read_distance_2()
r2 = my_robot.read_distance_2()
r3 = my_robot.read_distance_2()
valid = [r for r in (r1, r2, r3) if r != -1]
if not valid:
    my_robot.drive(BASE_SPEED, BASE_SPEED)
    continue
wall_distance = sum(valid) // len(valid)
```

---

## 11. OLED display stays blank (nothing shows on screen)

**What it looks like:**

- You call `my_robot.display_status(...)` or `my_robot.show_display(...)` but the OLED never lights up.
- No error is raised — the robot otherwise runs normally.

**Likely cause:**

The OLED methods are **deliberately silent** when no panel is detected. On boot, `AIDriver`
tries to start the SSD1306; if it is not found, `has_display` stays `False` and every display call
becomes a no-op so your program never crashes. The usual cause is wiring or the wrong address.

**How to fix:**

1. Check the OLED is on the shared I²C bus: **GP16 (SDA)** and **GP17 (SCL)**, plus 3V3 and GND.
2. Confirm the address is **`0x3C`** (a few panels use `0x3D` — pass `display_addr=0x3D` to `AIDriver`).
3. Verify it was found: `print(my_robot.has_display)` should print `True`.
4. Keep each line to **16 characters** — longer text is clipped, so a "blank" line may just be spaces.

> In the **simulator** the OLED always works — the panel appears in the top-right of the arena and
> shows your text. If it shows there but not on hardware, the problem is wiring or the address.

---

## 12. Rescue kit never deploys

**What it looks like:**

- `my_robot.deploy_rescue_kit()` returns `False` and the servo never moves.

**Likely cause:**

The kit servo is **unwired by default**. Until you tell `AIDriver` which pin the servo is on, the
call is a logged no-op (`has_kit` is `False`).

**How to fix:**

1. Wire the servo signal to a free GP pin and pass it in: `AIDriver("left", kit_servo_pin=10)`.
2. Confirm it was set up: `print(my_robot.has_kit)` should print `True`.
3. In the simulator the servo is not modelled, so `deploy_rescue_kit()` always returns `False` — that
   is expected; test the drop on the real robot.

---

If you see an error that is not listed here, try to:

1. Read the **first line** of the error message.
2. Note the **type** (e.g. `NameError`, `SyntaxError`, `AttributeError`).
3. Use that as a keyword to search in your docs or ask for help.
