# Challenge 3: Wall Follow — Full PID
# ====================================================================
# GOAL: Add an Integral (I) term to your PD controller so the robot
#       no longer drifts away from the wall around the L-shaped corner.
#
# WHAT'S ALREADY DONE FOR YOU:
#   - Challenge 1 (P) and Challenge 2 (PD) — both blocks are pre-filled.
#
# WHAT YOU NEED TO ADD:
#   1. A new gain  side_Ki  (start very small — try 0.003).
#   2. A clamp constant  side_INTEGRAL_MAX  to prevent integral windup.
#   3. A variable  side_integral  initialised to 0 BEFORE the loop.
#   4. Inside the loop: accumulate  side_integral = side_integral + error
#      THEN clamp it between  -side_INTEGRAL_MAX  and  +side_INTEGRAL_MAX.
#   5. New steering formula:
#         steering = (side_Kp * error)
#                  + (side_Ki * side_integral)
#                  + (side_Kd * side_derivative)
#   6. RESET side_integral to 0 in the lost-wall branch
#      (otherwise it keeps growing and overshoots when the wall reappears).
#
# READ THIS FIRST: docs/Challenge_3.md
# ====================================================================

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

# === BLOCK: CONFIG_BASE START ===
BASE_SPEED = 160
TARGET_WALL_DISTANCE = 150
MAX_STEERING = 40
# === BLOCK: CONFIG_BASE END ===

# === BLOCK: SIDE_KP START ===
side_Kp = 0.40
# === BLOCK: SIDE_KP END ===

# === BLOCK: SIDE_KD START ===
side_Kd = 0.15
# === BLOCK: SIDE_KD END ===

# === BLOCK: SIDE_KI START ===
side_Ki = 0.0  # TODO: try 0.003, then raise in 0.002 steps
side_INTEGRAL_MAX = 1200  # Anti-windup clamp (do NOT change unless tuning)
# === BLOCK: SIDE_KI END ===

side_previous_error = 0
# TODO: add a `side_integral` variable initialised to 0 here


# === MAIN LOOP ===
while True:
    # === BLOCK: SIDE_FOLLOW_PID START ===
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        # TODO: reset side_integral here so windup can't build up while the
        #       wall is out of range
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE

    # TODO: update side_integral = side_integral + error
    # TODO: clamp side_integral between -side_INTEGRAL_MAX and +side_INTEGRAL_MAX

    side_derivative = error - side_previous_error

    # TODO: replace this PD formula with the full PID formula
    steering = (side_Kp * error) + (side_Kd * side_derivative)

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
