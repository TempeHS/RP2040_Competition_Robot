# === ANSWER KEY — Challenge 2 (teacher reference; students should NOT see this) ===
# Same as app/starter-code/challenge-2.py with tuned values filled in.

# Challenge 2: Wall Follow — PD Control
# Add a Derivative term to Challenge 1 to stop the zig-zag.
# Guide: docs.html?doc=Challenge_2

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

BASE_SPEED = 200  # carry forward from C1
TARGET_WALL_DISTANCE = 200  # carry forward from C1
MAX_STEERING = 60  # carry forward from C1

side_Kp = 0.25  # carry forward from C1
side_Kd = 0.30  # derivative gain — dampens oscillation

side_previous_error = 0


while True:
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE
    side_derivative = error - side_previous_error

    steering = (side_Kp * error) + (side_Kd * side_derivative)

    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
    left_speed = BASE_SPEED + (my_robot.wall_sign * steering)

    my_robot.drive(int(right_speed), int(left_speed))

    side_previous_error = error
    hold_state(0.05)
