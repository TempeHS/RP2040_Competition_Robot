# Challenge 2: Wall Follow — PD Control
# --------------------------------------------------------------------
# Adds a Derivative (D) term to the Challenge 1 controller to dampen
# the zig-zag oscillation. The full algorithm is already written for
# you. Your job is to choose two values:
#
#     side_Kp   carry forward your tuned Challenge 1 value
#     side_Kd   the Derivative gain
#
# Tuning guide: docs.html?doc=PID_Real_World_Tuning_Quickstart
#
# Goal: smooth, oscillation-free wall follow to the green exit zone.
# --------------------------------------------------------------------

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
side_Kp = 0.0  # ← TUNE ME (use your Challenge 1 result as a starting point)
# === BLOCK: SIDE_KP END ===

# === BLOCK: SIDE_KD START ===
side_Kd = 0.0  # ← TUNE ME (raise in 0.05 steps until oscillation stops)
# === BLOCK: SIDE_KD END ===

side_previous_error = 0


# === MAIN LOOP ===
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
