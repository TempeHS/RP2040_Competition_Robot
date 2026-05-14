# Challenge 6: Full Maze Navigation
# ====================================================================
# GOAL: Add lost-wall recovery so the robot can cross open junctions
#       (where the side sensor briefly returns -1) without driving
#       straight into the opposite wall. Combine everything from C1–C5.
#
# WHAT'S ALREADY DONE FOR YOU:
#   - All previous frozen blocks: CONFIG_BASE, SIDE_KP, SIDE_KD,
#     SIDE_KI, FRONT_CONFIG, TURN_TIME_180, FRONT_DETECT_DEADEND,
#     SIDE_FOLLOW_PID.
#
# WHAT YOU NEED TO ADD (between FRONT_DETECT_DEADEND and SIDE_FOLLOW_PID):
#   1. Read the side sensor:  side = my_robot.read_distance_2()
#   2. If side == -1  (wall lost):
#        - Drift TOWARD the wall by making the inside wheel slower and
#          the outside wheel faster, using my_robot.wall_sign:
#              r = BASE_SPEED - int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
#              l = BASE_SPEED + int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
#        - my_robot.drive(r, l)
#        - Reset side_integral = 0  (prevent windup while wall is gone)
#        - hold_state(0.05);  `continue`
#   3. If the wall IS visible, fall through to the SIDE_FOLLOW_PID block.
#      To avoid reading the sensor twice, you can pass the value you
#      already have into the PID block (see the hint in that block).
#
# IMPORTANT: keep LOST_WALL_DRIFT small enough that the inside wheel
# stays at or above 120 (the motor dead zone). With BASE_SPEED=160,
# LOST_WALL_DRIFT = 0.25 puts the inside wheel exactly on the floor.
# Higher values cause the inside wheel to stall and the robot pivots
# instead of curving smoothly.
#
# READ THIS FIRST: docs/Challenge_6.md
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
TURN_TIME_90 = 0.5
# === BLOCK: FRONT_CONFIG END ===

# === BLOCK: TURN_TIME_180 START ===
TURN_TIME_180 = TURN_TIME_90 * 2
# === BLOCK: TURN_TIME_180 END ===

# === BLOCK: LOST_WALL_DRIFT_FACTOR START ===
LOST_WALL_DRIFT = 0.0  # TODO: pick a value (0.20 is safe; max ~0.25 for BASE=160)
# === BLOCK: LOST_WALL_DRIFT_FACTOR END ===

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
            side_check = my_robot.read_distance_2()
            if side_check == -1 or side_check > FRONT_SLOW_DISTANCE:
                turn_duration = TURN_TIME_90
            else:
                turn_duration = TURN_TIME_180
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

    # === BLOCK: LOST_WALL_RECOVERY START ===
    # TODO: implement lost-wall recovery here.
    #       1. Read the side sensor into a variable called `side`.
    #       2. If side == -1, drift toward the wall using LOST_WALL_DRIFT
    #          and `continue`.
    # === BLOCK: LOST_WALL_RECOVERY END ===

    # === BLOCK: SIDE_FOLLOW_PID START ===
    # Hint: if your recovery block above already read the sensor into
    # `side`, you can avoid a second read with:  wall_distance = side
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
