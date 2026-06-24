# === ANSWER KEY — Challenge 7 ===
# Identical to app/starter-code/challenge-7.py with the tuned values
# filled in. Used by automated tests and as a teacher reference.
# Students should NOT see this file.

# Challenge 7: Full Maze Navigation
# --------------------------------------------------------------------
# Adds lost-wall recovery so the robot can cross open junctions
# (where the side sensor briefly returns -1) without driving straight
# into the opposite wall. The full algorithm is already written for
# you. Every numeric setting starts at 0.
#
# Tuning guide: docs.html?doc=PID_Real_World_Tuning_Quickstart
#
# Values to set:
#     all carried-forward C6 values
#     LOST_WALL_DRIFT   carried forward from C5 — fraction of BASE_SPEED
#                              used to curve back toward the wall when
#                              side == -1 (range 0.0–0.25).
#
# IMPORTANT: keep LOST_WALL_DRIFT small enough that the inside wheel
# stays >= 100 (MIN_MOTOR_SPEED). With BASE_SPEED=200, 0.20 puts the
# inside wheel at 160; higher values still move but crawl.
#
# Goal: complete the full maze without external help.
# --------------------------------------------------------------------

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

BASE_SPEED = 200
TARGET_WALL_DISTANCE = 200
MAX_STEERING = 60

side_Kp = 0.25
side_Kd = 0.40
side_Ki = 0.001
side_INTEGRAL_MAX = 50

FRONT_SLOW_DISTANCE = 400
FRONT_STOP_DISTANCE = 150
FRONT_Kp = 1.0

LOST_WALL_DRIFT = 0.20

side_previous_error = 0
side_integral = 0


while True:
    front = my_robot.read_distance()

    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            my_robot.brake()
            hold_state(0.3)
            side_check = my_robot.read_distance_2()
            dead_end = not (side_check == -1 or side_check > FRONT_SLOW_DISTANCE)
            turn_dir = "right" if my_robot.wall_sign == -1 else "left"
            if dead_end:
                my_robot.turn_180(turn_dir)
            else:
                my_robot.turn_90(turn_dir)
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

    # --- Lost-wall recovery: curve gently toward the wall when sensor blanks ---
    side = my_robot.read_distance_2()
    if side == -1:
        r = BASE_SPEED - int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
        l = BASE_SPEED + int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
        my_robot.drive(r, l)
        side_integral = 0
        hold_state(0.05)
        continue

    # --- Side wall-follow PID (uses the reading we already have) ---
    wall_distance = side

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
    hold_state(0.05)
