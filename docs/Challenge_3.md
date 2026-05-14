# Challenge 3: Wall Follow — Full PID

In this challenge you will add the **Integral (I)** term to your PD controller from Challenge 2. The robot must follow a straight wall **and** navigate around an L-shaped corner. The I term corrects the steady-state drift that appears on the corner.

You will learn:

- Why PD control alone drifts around corners.
- What the **Integral** term does and why it helps.
- How to prevent **integral windup** using a clamp.

---

## Success Criteria

My robot follows the wall smoothly through the corridor, navigates around the **L corner**, and reaches the **green exit zone**.

---

## Before You Begin

1. Complete [Challenge 2](docs.html?doc=Challenge_2) — you need working PD gains (`side_Kp` and `side_Kd`).
2. Open the **Simulator** and select **Challenge 3**.
3. Run your Challenge 2 code here — the robot will follow the straight part but drift on the corner.

---

## Flowchart Of The Algorithm

```mermaid
flowchart TD
    A[Start Program] --> B[Setup Robot & Variables]
    B --> C{Control Loop}
    C --> D[Read side sensor]
    D --> E{Sensor OK?}
    E -- No --> F[Drive straight + reset side_integral]
    F --> C
    E -- Yes --> G[Calculate error]
    G --> H["Update side_integral (with clamp)"]
    H --> I[Calculate side_derivative]
    I --> J["steering = (side_Kp × error) + (side_Ki × side_integral) + (side_Kd × side_derivative)"]
    J --> K[Clamp steering to MAX_STEERING]
    K --> L["Drive: right = BASE - (wall_sign × steering), left = BASE + (wall_sign × steering)"]
    L --> M[Save side_previous_error = error]
    M --> C

    style A fill:#e1f5fe,color:#000000
    style B fill:#000000,color:#ffffff
    style C fill:#fff3e0,color:#000000
    style E fill:#fff3e0,color:#000000
    style G fill:#e8f5e8,color:#000000
    style H fill:#e8f5e8,color:#000000
    style I fill:#e8f5e8,color:#000000
    style J fill:#e8f5e8,color:#000000
    style L fill:#e8f5e8,color:#000000
```

---

## Key Concepts

### Why Does PD Control Drift on Corners?

When the robot turns around a corner, it briefly runs at a constant small error (the corner geometry keeps it slightly away from the wall). The P and D terms together produce only a small correction. Because the error is **small but persistent**, the robot never fully closes the gap — it drifts.

### What is the Integral Term?

The **Integral** accumulates all past errors over time:

```
side_integral = side_integral + error
```

- If the robot has been slightly too far from the wall for many loops → `side_integral` grows large → the I term adds a correction that eventually pushes the robot back.
- This is why the I term is useful for **slow, steady drift** — it catches errors the P term misses.

### What is Integral Windup?

If the robot loses the wall sensor (e.g. going around a wide corner), the integral can grow **very large** before the robot recovers. When the wall reappears, the huge integral produces a massive overshoot.

**Fix:** Clamp the integral between `-side_INTEGRAL_MAX` and `+side_INTEGRAL_MAX`, and reset it to 0 when the wall is lost.

### What is side_Ki?

**side_Ki** (Integral gain) controls how strongly the accumulated error affects steering:

```
steering = (side_Kp * error) + (side_Ki * side_integral) + (side_Kd * side_derivative)
```

Keep `side_Ki` very small — even 0.003 is enough. Too high causes a slow, rolling oscillation.

---

## Example Starting Values

```python
BASE_SPEED = 160
TARGET_WALL_DISTANCE = 150
MAX_STEERING = 40
side_Kp = 0.40       # Carry over from Challenge 1
side_Kd = 0.15       # Carry over from Challenge 2
side_Ki = 0.003      # Start very small
side_INTEGRAL_MAX = 1200
side_previous_error = 0
side_integral = 0
```

---

## Step 1 — Start from Your Challenge 2 Code

Copy your working PD code. You will add three things:

1. `side_Ki` and `side_INTEGRAL_MAX` in the configuration section.
2. `side_integral = 0` before the loop.
3. Integral update and clamp inside the loop.

---

## Step 2 — Add the New Variables

```python
side_Ki = 0.003            # Start very small — raise in 0.002 steps
side_INTEGRAL_MAX = 1200   # Anti-windup clamp

side_previous_error = 0
side_integral = 0
```

> [!Note]
> `side_INTEGRAL_MAX = 1200` means the integral can accumulate at most 1200 mm of total error before it stops growing. This prevents runaway corrections.

---

## Step 3 — Update the Integral Each Loop

Inside your loop, after calculating the error, add:

```python
    error = wall_distance - TARGET_WALL_DISTANCE

    # Integral: accumulated error — reset when wall lost (see sensor check above)
    side_integral = side_integral + error
    if side_integral > side_INTEGRAL_MAX:
        side_integral = side_INTEGRAL_MAX
    elif side_integral < -side_INTEGRAL_MAX:
        side_integral = -side_INTEGRAL_MAX
```

---

## Step 4 — Add the Full PID Formula

Replace your PD steering formula with:

```python
    side_derivative = error - side_previous_error

    steering = (side_Kp * error) + (side_Ki * side_integral) + (side_Kd * side_derivative)
```

---

## Step 5 — Reset the Integral When Wall Is Lost

In the sensor-error branch (where `wall_distance == -1`), add a reset:

```python
    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        side_integral = 0   # ← prevent windup when wall is out of range
        hold_state(0.05)
        continue
```

---

## Step 6 — Compare PD vs PID

Try running the L-corner maze with two versions:

1. **PD only**: Set `side_Ki = 0` — the robot will drift on the corner.
2. **PID**: Set `side_Ki = 0.003` — the robot should track back to the target distance.

---

## Tuning Guide

| Symptom                              | Cause                  | Fix                                         |
| ------------------------------------ | ---------------------- | ------------------------------------------- |
| Robot drifts on corner (like PD)     | side_Ki too low        | Increase side_Ki (try 0.005, 0.008)         |
| Slow rolling oscillation builds up   | side_Ki too high       | Decrease side_Ki (try 0.001, 0.002)         |
| Large overshoot after losing wall    | Integral not resetting | Check `side_integral = 0` in sensor-error branch |
| Robot overreacts after a long drift  | INTEGRAL_MAX too large | Decrease side_INTEGRAL_MAX (try 600, 800)   |

> [!Tip]
> Tune in this order: get `side_Kp` working first → add `side_Kd` to kill oscillations → add a tiny `side_Ki` to fix corner drift. Do not increase `side_Ki` aggressively.

---

## Complete Code

```python
# Challenge 3: Wall Follow — Full PID
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")  # ← "left" or "right" — must match your physical setup!

BASE_SPEED = 160
TARGET_WALL_DISTANCE = 150
side_Kp = 0.40             # Use the Kp you found in Challenge 1
side_Kd = 0.15             # Use the Kd you found in Challenge 2
side_Ki = 0.003            # Start very small — raise in 0.002 steps
MAX_STEERING = 40
side_INTEGRAL_MAX = 1200   # Anti-windup clamp

side_previous_error = 0
side_integral = 0

while True:
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        side_integral = 0  # Reset when wall lost — prevents windup
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE

    # Integral: accumulated error
    side_integral = side_integral + error
    if side_integral > side_INTEGRAL_MAX:
        side_integral = side_INTEGRAL_MAX
    elif side_integral < -side_INTEGRAL_MAX:
        side_integral = -side_INTEGRAL_MAX

    # Derivative
    side_derivative = error - side_previous_error

    # Full PID
    steering = (side_Kp * error) + (side_Ki * side_integral) + (side_Kd * side_derivative)

    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
    left_speed  = BASE_SPEED + (my_robot.wall_sign * steering)

    my_robot.drive(int(right_speed), int(left_speed))

    side_previous_error = error
    hold_state(0.05)
```

---

## Debugging Tips

- Add `print("I:", int(side_integral), "D:", int(side_derivative), "steer:", int(steering))` to watch all three terms.
- The integral column should stay near zero on straight sections and slowly grow on the corner.
- If the integral grows even on a straight section, your `side_Kp` may be too low and the robot is already slightly off-target.
- If something confusing happens, temporarily set `side_Ki = 0` to confirm the PD part is still working correctly, then re-add Ki.
