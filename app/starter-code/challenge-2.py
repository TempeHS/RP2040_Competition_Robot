# Challenge 2: Wall Follow — PD Control
# ====================================================================
# GOAL: Add a Derivative (D) term to your Challenge 1 controller to
#       dampen the oscillations that appear when the robot starts
#       off-centre and at an angle.
#
# WHAT'S ALREADY DONE FOR YOU:
#   - All of Challenge 1 (P controller + clamp + differential drive).
#
# WHAT YOU NEED TO ADD:
#   1. A new gain  side_Kd  (start small — try 0.10).
#   2. A variable  side_previous_error  initialised to 0 BEFORE the loop.
#   3. Inside the loop:  side_derivative = error - side_previous_error
#   4. A new steering formula:
#         steering = (side_Kp * error) + (side_Kd * side_derivative)
#   5. At the END of the loop, save  side_previous_error = error
#      (forgetting this is the most common bug — the D term will read 0).
#
# READ THIS FIRST: docs/Challenge_2.md
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
side_Kp = 0.40  # Carry forward your tuned value from Challenge 1
# === BLOCK: SIDE_KP END ===

# === BLOCK: SIDE_KD START ===
side_Kd = 0.0  # TODO: pick a starting value (try 0.10, then raise in 0.05 steps)
# === BLOCK: SIDE_KD END ===

# TODO: add a `side_previous_error` variable initialised to 0 here


# === MAIN LOOP ===
while True:
    # === BLOCK: SIDE_FOLLOW_PD START ===
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE

    # TODO: calculate side_derivative = error - side_previous_error

    # TODO: replace this P-only formula with a PD formula
    steering = side_Kp * error

    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
    left_speed = BASE_SPEED + (my_robot.wall_sign * steering)

    my_robot.drive(int(right_speed), int(left_speed))

    # TODO: save side_previous_error = error  (must be LAST thing before hold_state)
    # === BLOCK: SIDE_FOLLOW_PD END ===

    hold_state(0.05)
