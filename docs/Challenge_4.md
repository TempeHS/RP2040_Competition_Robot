# Challenge 4: Dead End Detection

In this challenge you will combine the **front sensor** with your **side PID wall following** to navigate a corridor that has a **dead end**. The robot must detect the wall ahead, stop, turn, and continue following the wall to the exit.

You will learn:

- How to use **two sensors at once** (sensor fusion).
- How to structure code with **priorities** (front wall takes priority over side following).
- How to reset PID state after a manoeuvre.

---

## Success Criteria

My robot follows the wall, **detects the dead end**, **turns**, and reaches the **green exit zone** on the other side.

---

## Before You Begin

1. Complete [Challenge 3](docs.html?doc=Challenge_3) — you need a working full PID controller.
2. Open the **Simulator** and select **Challenge 4**.
3. Run your Challenge 3 code here — the robot will crash into the dead-end wall because it only looks sideways, not forward!

---

## Flowchart Of The Algorithm

```mermaid
flowchart TD
    A[Start Program] --> B[Setup Robot & Variables]
    B --> C{Control Loop}
    C --> D[Read front sensor]
    D --> E{"Wall ahead?<br>(front < SLOW_DISTANCE)"}
    E -- Yes --> F{"Very close?<br>(front <= STOP_DISTANCE)"}
    F -- Yes --> G[Brake + Turn + Reset PID]
    G --> C
    F -- No --> H["Slow down: speed = Kp × (front - STOP)"]
    H --> C
    E -- No --> I[Read side sensor]
    I --> J{Sensor OK?}
    J -- No --> K[Drive straight + reset integral]
    K --> C
    J -- Yes --> L[PID wall follow]
    L --> C

    style A fill:#e1f5fe,color:#000000
    style B fill:#000000,color:#ffffff
    style C fill:#fff3e0,color:#000000
    style E fill:#ffcdd2,color:#000000
    style F fill:#ffcdd2,color:#000000
    style G fill:#ffcdd2,color:#000000
    style H fill:#ffe0b2,color:#000000
    style L fill:#e8f5e8,color:#000000
```

---

## Key Concepts

### Sensor Fusion

**Sensor fusion** means using data from multiple sensors to make better decisions. In this challenge:

| Sensor                         | Purpose                              | Code                         |
| ------------------------------ | ------------------------------------ | ---------------------------- |
| **Front** (`read_distance()`)  | Detect walls ahead — triggers a turn | `my_robot.read_distance()`   |
| **Side** (`read_distance_2()`) | Follow the wall — PID steering       | `my_robot.read_distance_2()` |

### Priority-Based Decisions

When you have two sensors, you need **rules about which one takes priority**:

1. **Priority 1a: Very close to wall ahead** (`front <= FRONT_STOP_DISTANCE`) → Stop and turn. This is the most urgent.
2. **Priority 1b: Approaching wall ahead** (`front < FRONT_SLOW_DISTANCE`) → Slow down proportionally. The closer the wall, the slower the robot drives.
3. **Priority 2: No wall ahead** → Use PID to follow the side wall as normal.

This is coded as a nested `if` structure:

```python
if wall_detected_ahead:
    if very_close:
        # stop and turn
    else:
        # slow down (P control on front sensor)
else:
    # PID wall follow (side sensor)
```

### P Control on the Front Sensor — Smooth Deceleration

Instead of slamming on the brakes when a wall appears ahead, you can use the same P control idea from Challenge 1 — but this time applied to the **front sensor** to control **speed** (not steering):

```
approach_speed = FRONT_Kp × (front_distance - FRONT_STOP_DISTANCE)
```

Here is what happens:

| Front distance | Calculation (Kp=0.5, stop=120mm)        | Speed           |
| -------------- | --------------------------------------- | --------------- |
| 400mm (far)    | 0.5 × (400 - 120) = 140                 | 140             |
| 300mm          | 0.5 × (300 - 120) = 90 → clamped to 120 | 120             |
| 200mm          | 0.5 × (200 - 120) = 40 → clamped to 120 | 120             |
| 120mm (stop!)  | 0.5 × (120 - 120) = 0                   | **Stop → turn** |

The robot **gradually slows down** as it approaches the wall, then stops smoothly at `FRONT_STOP_DISTANCE` and turns.

> [!Note]
> The speed is clamped to a minimum of 120 (the dead zone) so the wheels keep turning during the approach. When the distance reaches `FRONT_STOP_DISTANCE`, the robot stops and turns.

### Resetting PID After a Turn

After the robot turns, the side sensor now sees a completely different wall at a completely different distance. The integral and previous_error from before the turn are **no longer valid**. If you don't reset them, the PID will make a huge incorrect correction.

```python
integral = 0
previous_error = 0
```

Always reset these after any major manoeuvre (turn, stop, reverse).

### Tuning the Turn

The `TURN_TIME` variable controls how long the robot rotates. You need to tune this so the robot turns approximately 90 degrees:

- Too short → robot doesn't turn enough, drives into the wall.
- Too long → robot turns too far and goes backwards.

> [!Tip]
> Start with `TURN_TIME = 0.5` and adjust up or down in small increments (0.1s) until the turn looks like a right angle.

---

## Step 1 — Start from Your Challenge 3 Code

Copy your working PID code. You will add:

1. Front sensor P-deceleration variables: `FRONT_SLOW_DISTANCE`, `FRONT_STOP_DISTANCE`, `FRONT_Kp`.
2. `TURN_SPEED` and `TURN_TIME` variables.
3. A front-sensor check at the **top** of the loop (before the PID code).

---

## Step 2 — Add New Configuration Variables

```python
# Front sensor P-controlled approach
FRONT_SLOW_DISTANCE = 400  # Start decelerating (mm)
FRONT_STOP_DISTANCE = 120  # Stop and turn (mm)
FRONT_Kp = 0.5             # Front deceleration gain
TURN_SPEED = 180
TURN_TIME = 0              # TODO: tune for ~90 degree turn
```

> [!Note]
> `TURN_TIME = 0` is intentionally set to zero — you **must** tune this yourself. This forces you to experiment.

---

## Step 3 — Add the Front Sensor P-Controlled Approach

At the **top** of your `while True:` loop, before the side-sensor PID code, add:

```python
while True:
    front = my_robot.read_distance()

    # Priority 1: Wall ahead — P-controlled deceleration then turn
    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            # Close enough — stop and turn
            my_robot.brake()
            hold_state(0.3)
            my_robot.rotate_left(TURN_SPEED)
            hold_state(TURN_TIME)
            my_robot.brake()
            hold_state(0.3)
            integral = 0
            previous_error = 0
            continue
        else:
            # Approaching — slow down proportionally
            approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
            if approach_speed < 120:
                approach_speed = 120
            if approach_speed > BASE_SPEED:
                approach_speed = BASE_SPEED
            my_robot.drive(approach_speed, approach_speed)
            hold_state(0.05)
            continue
```

The two `continue` keywords skip the PID code and go back to the top of the loop — the robot keeps re-reading the front sensor each cycle until it either passes the wall or stops to turn.

> [!Important]
> The `front != -1` check ensures you don't decelerate when the front sensor is in error state (returning -1).

---

## Step 4 — Keep Your PID Code

The rest of the loop is your existing Challenge 3 PID wall-following code. It only runs when there is **no wall ahead**:

```python
    # Priority 2: Side wall following with PID
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        integral = 0
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE
    # ... rest of PID code ...
```

---

## Step 5 — Tune the Approach and Turn

Run the code in the simulator and adjust:

| Observation                             | Fix                                             |
| --------------------------------------- | ----------------------------------------------- |
| Robot doesn't slow down before the wall | Increase FRONT_SLOW_DISTANCE (try 500)          |
| Robot stops too far from the wall       | Decrease FRONT_STOP_DISTANCE (try 80)           |
| Robot crashes before stopping           | Increase FRONT_STOP_DISTANCE or FRONT_Kp        |
| Robot doesn't turn enough               | Increase TURN_TIME                              |
| Robot turns too far                     | Decrease TURN_TIME                              |
| Robot jerks violently after turning     | Make sure you reset integral and previous_error |
| Robot creeps very slowly near the wall  | Increase FRONT_Kp (try 0.8) for faster approach |

---

## Complete Code

```python
# Challenge 4: Dead End Detection
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = True
my_robot = AIDriver()

BASE_SPEED = 160
TARGET_WALL_DISTANCE = 150

# Front sensor P-controlled approach
FRONT_SLOW_DISTANCE = 400
FRONT_STOP_DISTANCE = 120
FRONT_Kp = 0.5
TURN_SPEED = 180
TURN_TIME = 0              # TODO: tune for ~90 degree turn

# Side PID gains (from Challenge 3)
Kp = 0.5
Ki = 0.01
Kd = 0.3
MAX_STEERING = 40
INTEGRAL_MAX = 500

previous_error = 0
integral = 0

while True:
    front = my_robot.read_distance()

    # Priority 1: Wall ahead — P-controlled deceleration then turn
    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            my_robot.brake()
            hold_state(0.3)
            my_robot.rotate_left(TURN_SPEED)
            hold_state(TURN_TIME)
            my_robot.brake()
            hold_state(0.3)
            integral = 0
            previous_error = 0
            continue
        else:
            approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
            if approach_speed < 120:
                approach_speed = 120
            if approach_speed > BASE_SPEED:
                approach_speed = BASE_SPEED
            my_robot.drive(approach_speed, approach_speed)
            hold_state(0.05)
            continue

    # Priority 2: Side wall following with PID
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        integral = 0
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE
    integral = integral + error
    if integral > INTEGRAL_MAX:
        integral = INTEGRAL_MAX
    elif integral < -INTEGRAL_MAX:
        integral = -INTEGRAL_MAX
    derivative = error - previous_error

    steering = (Kp * error) + (Ki * integral) + (Kd * derivative)
    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right_speed = BASE_SPEED - steering
    left_speed = BASE_SPEED + steering
    my_robot.drive(int(right_speed), int(left_speed))

    previous_error = error
    hold_state(0.05)
```

---

## Debugging Tips

- Add `print("front:", front, "approach:", approach_speed)` to watch the robot decelerate.
- If the robot never slows down, check that `FRONT_SLOW_DISTANCE` is large enough for the front sensor to detect the wall in time.
- If the robot never turns, check that the front sensor is returning valid values (not -1) and that `FRONT_STOP_DISTANCE` is reachable.
- If the robot turns but then immediately turns again, `TURN_TIME` may be too short (it's still facing the wall after turning).
- If the PID oscillates badly after a turn, make sure you are resetting both `integral = 0` and `previous_error = 0`.
