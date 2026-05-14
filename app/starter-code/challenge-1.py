# Challenge 1: Wall Follow — P Control
# ====================================================================
# GOAL: Make the robot follow the side wall using only a Proportional
#       (P) controller. Reach the green exit zone without hitting the wall.
#
# WHAT YOU NEED TO WRITE:
#   1. Read the side sensor.
#   2. Calculate error = (sensor reading) - (target distance).
#   3. Calculate steering = side_Kp * error.
#   4. Clamp steering between -MAX_STEERING and +MAX_STEERING.
#   5. Apply differential drive using my_robot.wall_sign so it works
#      whether the wall is on the left or the right.
#
# READ THIS FIRST: docs/Challenge_1.md (open the Help dropdown).
# ====================================================================

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False  # Set True to print sensor & motor values

# Set the wall side to match the simulator scene ("left" or "right")
my_robot = AIDriver("left")

# === BLOCK: CONFIG_BASE START ===
BASE_SPEED = 160  # Forward speed (must stay > 120, the motor dead zone)
TARGET_WALL_DISTANCE = 150  # Distance to maintain from wall (mm)
MAX_STEERING = 40  # Max wheel speed difference
# Rule: BASE_SPEED - MAX_STEERING must be >= 120
# === BLOCK: CONFIG_BASE END ===

# === BLOCK: SIDE_KP START ===
side_Kp = 0.0  # TODO: pick a starting value (try 0.30, then raise in 0.05 steps)
# === BLOCK: SIDE_KP END ===


# === MAIN LOOP ===
while True:
    # === BLOCK: SIDE_FOLLOW_P START ===
    # 1. Read the SIDE sensor (hint: my_robot.read_distance_2()).
    wall_distance = None  # TODO: replace None with the sensor read

    # 2. If the sensor failed (returned -1), drive straight and try again.
    #    Hint: my_robot.drive(BASE_SPEED, BASE_SPEED), then `continue`.
    # TODO: handle the wall_distance == -1 case

    # 3. Calculate the error (positive = too far from wall).
    error = 0  # TODO

    # 4. P controller: steering = side_Kp * error
    steering = 0  # TODO

    # 5. Clamp steering between -MAX_STEERING and +MAX_STEERING.
    # TODO: clamp `steering`

    # 6. Apply differential drive using my_robot.wall_sign.
    #    right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
    #    left_speed  = BASE_SPEED + (my_robot.wall_sign * steering)
    #    Then call my_robot.drive(int(right_speed), int(left_speed)).
    # TODO: drive the robot
    # === BLOCK: SIDE_FOLLOW_P END ===

    hold_state(0.05)
