# === ANSWER KEY — Challenge 2 ===
# Identical to app/starter-code/challenge-2.py with the tuned values
# filled in. Used by automated tests and as a teacher reference.
# Students should NOT see this file.

# Challenge 2: Wall Follow — PD Control
# --------------------------------------------------------------------
# Adds a Derivative (D) term to the Challenge 1 controller to dampen
# the zig-zag oscillation. The full algorithm is already written for
# you. Every numeric setting starts at 0.
#
# Tuning guide: docs.html?doc=PID_Real_World_Tuning_Quickstart
#
# Values to set:
#     BASE_SPEED, TARGET_WALL_DISTANCE, MAX_STEERING   (carry forward C1)
#     side_Kp                                          (carry forward C1)
#     side_Kd                                          new — Derivative gain
#
# Goal: smooth, oscillation-free wall follow to the green exit zone.
# --------------------------------------------------------------------

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

BASE_SPEED = 150
TARGET_WALL_DISTANCE = 200
MAX_STEERING = 40

side_Kp = 0.25
side_Kd = 0.20

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

    side_previous_error = error  # MUST be the last update before hold_state
    hold_state(0.05)
