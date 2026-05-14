# === ANSWER KEY — Challenge 2 ===
# Reference solution used by automated tests and as a teacher reference.
# Students should NOT see this file. The matching starter scaffold is in
# app/starter-code/challenge-2.py and contains TODOs for them to solve.

# Challenge 2: Wall Follow - PD Control
# Add the derivative term to dampen oscillations.

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")  # ← "left" or "right" — must match your physical setup!

# === BLOCK: CONFIG_BASE START ===
BASE_SPEED = 160  # Forward speed (must be > 120)
TARGET_WALL_DISTANCE = 150  # Distance to maintain from wall (mm)
MAX_STEERING = 40  # Max wheel speed difference
# Rule: BASE_SPEED - MAX_STEERING must be >= 120 (motor dead zone)
# === BLOCK: CONFIG_BASE END ===

# === BLOCK: SIDE_KP START ===
side_Kp = 0.40  # Proportional gain — raise in 0.05 steps until zig-zag starts
# === BLOCK: SIDE_KP END ===

# === BLOCK: SIDE_KD START ===
side_Kd = 0.15  # Derivative gain — dampens oscillations
# === BLOCK: SIDE_KD END ===

side_previous_error = 0

# === MAIN LOOP ===
while True:
    # === BLOCK: SIDE_FOLLOW_PD START ===
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE

    # Derivative: how fast is the error changing?
    side_derivative = error - side_previous_error

    # PD output
    steering = (side_Kp * error) + (side_Kd * side_derivative)

    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
    left_speed = BASE_SPEED + (my_robot.wall_sign * steering)

    my_robot.drive(int(right_speed), int(left_speed))

    side_previous_error = error
    # === BLOCK: SIDE_FOLLOW_PD END ===

    hold_state(0.05)
