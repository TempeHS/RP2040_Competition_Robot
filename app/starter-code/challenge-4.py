# Challenge 4: Corner Detection (90° turn)
# --------------------------------------------------------------------
# Adds a front-sensor priority block that brakes, rotates 90° away
# from the wall, and resumes wall-following. The full algorithm is
# already written for you. Every numeric setting starts at 0.
#
# Tuning guides:
#     docs.html?doc=PID_Front_Distance_Tuning_Quickstart   (FRONT_*, FRONT_Kp)
#     docs.html?doc=PID_Turn_Tuning_Quickstart             (TURN_SPEED, TURN_TIME_90)
#
# Values to set:
#     all carried-forward C3 PID + base values
#     FRONT_SLOW_DISTANCE, FRONT_STOP_DISTANCE     when to slow / brake (mm)
#     FRONT_Kp                                      front-approach gain
#     TURN_SPEED                                    rotation wheel speed
#     TURN_TIME_90                                  seconds for ~90° rotation
#
# Goal: turn the L-corner at speed without clipping either wall.
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

side_previous_error = 0
side_integral = 0


while True:
    # --- Front-sensor priority: detect & turn 90° at corners ---
    front = my_robot.read_distance()

    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            my_robot.brake()
            hold_state(0.3)

            # Rotate AWAY from the wall (wall_sign tells us which side).
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
            # Approach the wall on a P-controlled deceleration ramp.
            approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
            if approach_speed < 120:
                approach_speed = 120
            if approach_speed > BASE_SPEED:
                approach_speed = BASE_SPEED
            my_robot.drive(approach_speed, approach_speed)
            hold_state(0.05)
            continue

    # --- Side wall-follow PID (carried forward from Challenge 3) ---
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
    hold_state(0.05)
