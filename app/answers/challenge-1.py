# === ANSWER KEY — Challenge 1 ===
# Reference solution used by automated tests and as a teacher reference.
# Students should NOT see this file. The matching starter scaffold is in
# app/starter-code/challenge-1.py and contains TODOs for them to solve.

# Challenge 1: Wall Follow - P Control
# Follow the side wall using proportional steering only.

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False  # Set True for full motor debug (slows loop)
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

# === MAIN LOOP ===
while True:
    # === BLOCK: SIDE_FOLLOW_P START ===
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        # No valid reading - drive straight and try again
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
    # === BLOCK: SIDE_FOLLOW_P END ===

    hold_state(0.05)
