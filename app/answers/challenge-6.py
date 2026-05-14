# === ANSWER KEY — Challenge 6 ===
# Reference solution used by automated tests and as a teacher reference.
# Students should NOT see this file. The matching starter scaffold is in
# app/starter-code/challenge-6.py and contains TODOs for them to solve.

# Challenge 6: Full Maze Navigation
# This file is the CONCATENATION of every frozen block from Challenges 1-5,
# plus one new block: LOST_WALL_RECOVERY. No other edits are required.
#
# Block provenance:
#   CONFIG_BASE          -> C1
#   SIDE_KP              -> C1
#   SIDE_KD              -> C2
#   SIDE_KI              -> C3
#   FRONT_CONFIG         -> C4
#   TURN_TIME_180        -> C5
#   FRONT_DETECT_DEADEND -> C5  (frozen front-detect with corner/dead-end choice)
#   SIDE_FOLLOW_PID      -> C3  (frozen side PID controller)
#   LOST_WALL_RECOVERY   -> C6  (NEW: drift toward wall when sensor reads -1)

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")  # ← "left" or "right" — must match your physical setup!

# === BLOCK: CONFIG_BASE START ===
BASE_SPEED = 160  # Forward speed (must be > 120)
TARGET_WALL_DISTANCE = 150  # Distance to maintain from wall (mm)
MAX_STEERING = 40  # Max wheel speed difference
# Rule: BASE_SPEED - MAX_STEERING must be >= 120 (motor dead zone)
# === BLOCK: CONFIG_BASE END ===

# === BLOCK: SIDE_KP START ===
side_Kp = 0.40  # Proportional gain — raise in 0.05 steps until zig-zag starts
# === BLOCK: SIDE_KP END ===

# === BLOCK: SIDE_KD START ===
side_Kd = 0.15  # Derivative gain — dampens oscillations
# === BLOCK: SIDE_KD END ===

# === BLOCK: SIDE_KI START ===
side_Ki = 0.003  # Integral gain — start very small, raise in 0.002 steps
side_INTEGRAL_MAX = 1200  # Anti-windup clamp
# === BLOCK: SIDE_KI END ===

# === BLOCK: FRONT_CONFIG START ===
FRONT_SLOW_DISTANCE = 400  # Start decelerating (mm)
FRONT_STOP_DISTANCE = 120  # Stop and turn (mm)
FRONT_Kp = 0.5  # Front deceleration gain
TURN_SPEED = 180
TURN_TIME_90 = 0.5  # Tune for ~90 degree turn
# === BLOCK: FRONT_CONFIG END ===

# === BLOCK: TURN_TIME_180 START ===
TURN_TIME_180 = TURN_TIME_90 * 2  # Twice the 90 degree time, then fine-tune
# === BLOCK: TURN_TIME_180 END ===

# === BLOCK: LOST_WALL_DRIFT_FACTOR START ===
LOST_WALL_DRIFT = 0.4  # Curve strength when reacquiring a lost wall (0.0..1.0)
# === BLOCK: LOST_WALL_DRIFT_FACTOR END ===

side_previous_error = 0
side_integral = 0

# === MAIN LOOP ===
while True:
    # === BLOCK: FRONT_DETECT_DEADEND START ===
    # Priority 1: Wall ahead — decelerate, then choose 90 degree corner or 180 degree dead-end
    front = my_robot.read_distance()

    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            my_robot.brake()
            hold_state(0.3)
            # Check side sensor to decide corner (90 degree) vs dead end (180 degree)
            side_check = my_robot.read_distance_2()
            if side_check == -1 or side_check > FRONT_SLOW_DISTANCE:
                turn_duration = TURN_TIME_90  # corridor open to the side
            else:
                turn_duration = TURN_TIME_180  # walls on front AND side
            # Turn away from the wall you are following (wall_sign-aware)
            if my_robot.wall_sign == -1:
                my_robot.rotate_right(TURN_SPEED)
            else:
                my_robot.rotate_left(TURN_SPEED)
            hold_state(turn_duration)
            my_robot.brake()
            hold_state(0.3)
            side_integral = 0
            side_previous_error = 0
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
    # === BLOCK: FRONT_DETECT_DEADEND END ===

    # === BLOCK: LOST_WALL_RECOVERY START ===
    # Priority 2: Lost the wall — drift toward it to reacquire (NEW in C6)
    side = my_robot.read_distance_2()

    if side == -1:
        r = BASE_SPEED - int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
        l = BASE_SPEED + int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
        my_robot.drive(r, l)
        side_integral = 0
        hold_state(0.05)
        continue
    # === BLOCK: LOST_WALL_RECOVERY END ===

    # === BLOCK: SIDE_FOLLOW_PID START ===
    wall_distance = side  # use the reading we already took above

    error = wall_distance - TARGET_WALL_DISTANCE

    # Integral: accumulated error (clamped against windup)
    side_integral = side_integral + error
    if side_integral > side_INTEGRAL_MAX:
        side_integral = side_INTEGRAL_MAX
    elif side_integral < -side_INTEGRAL_MAX:
        side_integral = -side_INTEGRAL_MAX

    # Derivative
    side_derivative = error - side_previous_error

    # Full PID
    steering = (
        (side_Kp * error) + (side_Ki * side_integral) + (side_Kd * side_derivative)
    )

    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
    left_speed = BASE_SPEED + (my_robot.wall_sign * steering)

    my_robot.drive(int(right_speed), int(left_speed))

    side_previous_error = error
    # === BLOCK: SIDE_FOLLOW_PID END ===

    hold_state(0.05)
