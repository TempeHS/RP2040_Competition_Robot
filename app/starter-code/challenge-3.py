# Challenge 3: Wall Follow — Full PID
# Add an Integral term so the robot holds the wall around the L corner.
# Carry forward C1/C2 values, then tune side_Ki. Guide: docs.html?doc=Challenge_3

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

BASE_SPEED = 0  # carry forward
TARGET_WALL_DISTANCE = 0  # carry forward
MAX_STEERING = 0  # carry forward

side_Kp = 0.0  # carry forward
side_Kd = 0.0  # carry forward
side_Ki = 0.0  # integral gain — start very small
side_INTEGRAL_MAX = 0  # anti-windup clamp

side_previous_error = 0
side_integral = 0


while True:
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        side_integral = 0  # reset so windup can't build while wall is gone
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
