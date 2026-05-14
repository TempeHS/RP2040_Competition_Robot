# Challenge 3: Wall Follow — Full PID
# --------------------------------------------------------------------
# Adds the Integral (I) term so the robot no longer drifts away from
# the wall around the L-shaped corner. The full algorithm is already
# written for you. Your job is to choose three values:
#
#     side_Kp, side_Kd   carry forward from Challenge 2
#     side_Ki            the Integral gain (start very small)
#
# Tuning guide: docs.html?doc=PID_Real_World_Tuning_Quickstart
#
# Goal: hold TARGET_WALL_DISTANCE through the corner with no drift.
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
side_Kp = 0.0  # ← TUNE ME (use your Challenge 2 result)
# === BLOCK: SIDE_KP END ===

# === BLOCK: SIDE_KD START ===
side_Kd = 0.0  # ← TUNE ME (use your Challenge 2 result)
# === BLOCK: SIDE_KD END ===

# === BLOCK: SIDE_KI START ===
side_Ki = 0.0  # ← TUNE ME (try ~0.003, raise in 0.002 steps)
side_INTEGRAL_MAX = 1200  # Anti-windup clamp — leave alone unless tuning windup
# === BLOCK: SIDE_KI END ===

side_previous_error = 0
side_integral = 0


# === MAIN LOOP ===
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
