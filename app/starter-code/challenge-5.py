# Challenge 5: Outside Corners — Lost-Wall Recovery
# --------------------------------------------------------------------
# When the wall the robot is following ends abruptly (an outside /
# convex corner, or a free-standing "nib"), the side sensor returns
# -1. Without help the robot drives straight and loses the wall
# completely. This challenge adds a gentle curve toward where the
# wall WAS so the robot wraps around the corner.
#
# Tuning guide: docs.html?doc=PID_Real_World_Tuning_Quickstart
#
# Values to set:
#     all carried-forward C4 values
#     LOST_WALL_DRIFT   new — fraction of BASE_SPEED subtracted from
#                              the inside wheel to curve back toward
#                              the wall (range 0.0–0.30).
#
# IMPORTANT: keep LOST_WALL_DRIFT small enough that the inside wheel
# stays >= 100 (MIN_MOTOR_SPEED). With BASE_SPEED=200 a drift of 0.30
# puts the inside wheel at 140; with BASE_SPEED=140 a drift of 0.20
# puts it at 112. Anything that drops below 100 will stall the wheel.
#
# Goal: wrap around the free-standing block to reach the exit zone.
# --------------------------------------------------------------------

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

BASE_SPEED = 0
TARGET_WALL_DISTANCE = 0
MAX_STEERING = 0

side_Kp = 0.0
side_Kd = 0.0
side_Ki = 0.0
side_INTEGRAL_MAX = 0

FRONT_SLOW_DISTANCE = 0
FRONT_STOP_DISTANCE = 0
FRONT_Kp = 0.0
TURN_SPEED = 0
TURN_TIME_90 = 0.0

LOST_WALL_DRIFT = 0.0

side_previous_error = 0
side_integral = 0


while True:
    # --- Front-sensor priority: 90° corner detection (carried from C4) ---
    front = my_robot.read_distance()

    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            my_robot.brake()
            hold_state(0.3)

            if my_robot.wall_sign == -1:
                my_robot.rotate_right(TURN_SPEED)
            else:
                my_robot.rotate_left(TURN_SPEED)
            hold_state(TURN_TIME_90)

            my_robot.brake()
            hold_state(0.3)

            side_integral = 0
            side_previous_error = 0
            continue
        else:
            approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
            if approach_speed < 100:
                approach_speed = 100
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

    # --- Side wall-follow PID (carried forward from C3) ---
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
