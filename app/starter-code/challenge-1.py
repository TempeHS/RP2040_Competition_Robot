# Challenge 1: Wall Follow — P Control
# --------------------------------------------------------------------
# The full algorithm is already written for you below. Your job is to
# choose ONE value:
#
#     side_Kp   the Proportional gain for steering
#
# Read the tuning guide before you pick a number:
#     docs.html?doc=PID_Real_World_Tuning_Quickstart
#
# Goal: reach the green exit zone without hitting the side wall.
# --------------------------------------------------------------------

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False  # Set True to print sensor + motor values
my_robot = AIDriver("left")  # "left" or "right" — match the simulator scene

# === BLOCK: CONFIG_BASE START ===
BASE_SPEED = 160  # Forward speed (must stay > 120, the motor dead zone)
TARGET_WALL_DISTANCE = 150  # Distance to maintain from wall (mm)
MAX_STEERING = 40  # Max wheel-speed difference
# === BLOCK: CONFIG_BASE END ===

# === BLOCK: SIDE_KP START ===
side_Kp = 0.0  # ← TUNE ME (see PID_Real_World_Tuning_Quickstart)
# === BLOCK: SIDE_KP END ===


# === MAIN LOOP ===
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
