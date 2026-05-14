# Challenge 5: Dead-End Detection (90° vs 180°)
# ====================================================================
# GOAL: After braking at a wall ahead, use the SIDE sensor to decide
#       whether you are at a corner (turn 90°) or a dead end (turn 180°).
#
# WHAT'S ALREADY DONE FOR YOU:
#   - Your full PID side-follow controller (from C3).
#   - The front-detect / approach / brake / turn / reset block from C4
#     is laid out below — but the turn duration is hard-coded to
#     TURN_TIME_90. You will REPLACE that with a runtime decision.
#
# WHAT YOU NEED TO ADD (inside the `if front <= FRONT_STOP_DISTANCE:` block):
#   1. After braking, read the side sensor:
#         side_check = my_robot.read_distance_2()
#   2. Decide the turn:
#         - If side_check == -1  OR  side_check > FRONT_SLOW_DISTANCE
#               → corridor is OPEN → use TURN_TIME_90
#         - Else (wall on the side AND wall in front)
#               → DEAD END → use TURN_TIME_180
#      Store the chosen value in a variable called `turn_duration`.
#   3. Use `turn_duration` in the hold_state call after rotating.
#
# READ THIS FIRST: docs/Challenge_5.md
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
side_Ki = 0.003
side_INTEGRAL_MAX = 1200
# === BLOCK: SIDE_KI END ===

# === BLOCK: FRONT_CONFIG START ===
FRONT_SLOW_DISTANCE = 400
FRONT_STOP_DISTANCE = 120
FRONT_Kp = 0.5
TURN_SPEED = 180
TURN_TIME_90 = 0.5  # ← use your tuned value from Challenge 4
# === BLOCK: FRONT_CONFIG END ===

# === BLOCK: TURN_TIME_180 START ===
TURN_TIME_180 = 0.0  # TODO: start with TURN_TIME_90 * 2, then fine-tune
# === BLOCK: TURN_TIME_180 END ===

side_previous_error = 0
side_integral = 0

# === MAIN LOOP ===
while True:
    # === BLOCK: FRONT_DETECT_DEADEND START ===
    front = my_robot.read_distance()

    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            my_robot.brake()
            hold_state(0.3)

            # TODO: read side sensor into  side_check
            # TODO: choose  turn_duration  based on side_check
            turn_duration = TURN_TIME_90  # placeholder — replace with your decision

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
            approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
            if approach_speed < 120:
                approach_speed = 120
            if approach_speed > BASE_SPEED:
                approach_speed = BASE_SPEED
            my_robot.drive(approach_speed, approach_speed)
            hold_state(0.05)
            continue
    # === BLOCK: FRONT_DETECT_DEADEND END ===

    # === BLOCK: SIDE_FOLLOW_PID START ===
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        side_integral = 0
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE

    side_integral = side_integral + error
    if side_integral > side_INTEGRAL_MAX:
        side_integral = side_INTEGRAL_MAX
    elif side_integral < -side_INTEGRAL_MAX:
        side_integral = -side_INTEGRAL_MAX

    side_derivative = error - side_previous_error

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
