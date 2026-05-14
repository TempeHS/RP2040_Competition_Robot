# Challenge 4: Corner Detection (90° turn)
# ====================================================================
# GOAL: Use the FRONT sensor to detect a wall ahead, brake, turn 90°
#       away from your wall, and then continue PID wall-following.
#
# WHAT'S ALREADY DONE FOR YOU:
#   - Your full PID side-follow controller from Challenge 3.
#
# WHAT YOU NEED TO ADD (at the TOP of the loop, BEFORE the PID block):
#   1. Read the front sensor:  front = my_robot.read_distance()
#   2. If front is valid and  front < FRONT_SLOW_DISTANCE:
#        a. If  front <= FRONT_STOP_DISTANCE:
#               - brake, hold 0.3s
#               - turn AWAY from your wall:
#                     if my_robot.wall_sign == -1: rotate_right(TURN_SPEED)
#                     else:                         rotate_left(TURN_SPEED)
#               - hold for TURN_TIME_90 seconds
#               - brake, hold 0.3s
#               - RESET side_integral = 0  AND  side_previous_error = 0
#               - `continue`
#        b. Else (still approaching):
#               - approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
#               - clamp approach_speed between 120 and BASE_SPEED
#               - my_robot.drive(approach_speed, approach_speed)
#               - hold_state(0.05); `continue`
#
# READ THIS FIRST: docs/Challenge_4.md
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
FRONT_SLOW_DISTANCE = 400  # Start decelerating (mm)
FRONT_STOP_DISTANCE = 120  # Stop and turn (mm)
FRONT_Kp = 0.5  # Front deceleration gain
TURN_SPEED = 180
TURN_TIME_90 = 0.0  # TODO: tune for ~90° turn (try 0.5s, adjust 0.05s steps)
# === BLOCK: FRONT_CONFIG END ===

side_previous_error = 0
side_integral = 0

# === MAIN LOOP ===
while True:
    # === BLOCK: FRONT_DETECT_90 START ===
    # TODO: implement the front-detect priority block here.
    # See the steps at the top of this file. When there is no wall
    # ahead, fall through to the side-follow PID below.
    # === BLOCK: FRONT_DETECT_90 END ===

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
