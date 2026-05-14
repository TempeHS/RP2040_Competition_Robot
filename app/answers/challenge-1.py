# === ANSWER KEY — Challenge 1 ===
# Identical to app/starter-code/challenge-1.py with the tuned values
# filled in. Used by automated tests and as a teacher reference.
# Students should NOT see this file.

# Challenge 1: Wall Follow — P Control
# --------------------------------------------------------------------
# The full algorithm is already written for you below. Every numeric
# setting starts at 0 — until you fill them in the robot will not
# move. Read the tuning guide before you pick numbers:
#
#     docs.html?doc=PID_Real_World_Tuning_Quickstart
#
# Values to set:
#     BASE_SPEED              forward speed (must stay > 120, motor dead zone)
#     TARGET_WALL_DISTANCE    distance to maintain from wall (mm)
#     MAX_STEERING            max wheel-speed difference
#                             (BASE_SPEED - MAX_STEERING must be >= 120)
#     side_Kp                 Proportional gain for steering
#
# Goal: reach the green exit zone without hitting the side wall.
# --------------------------------------------------------------------

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False  # Set True to print sensor + motor values
my_robot = AIDriver("left")  # "left" or "right" — match the simulator scene

BASE_SPEED = 160
TARGET_WALL_DISTANCE = 150
MAX_STEERING = 40

side_Kp = 0.40


while True:
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        # Sensor lost the wall — drive straight and try again next tick.
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE
    steering = side_Kp * error

    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
    left_speed = BASE_SPEED + (my_robot.wall_sign * steering)

    my_robot.drive(int(right_speed), int(left_speed))
    hold_state(0.05)
