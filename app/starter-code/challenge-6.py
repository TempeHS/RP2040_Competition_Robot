# Challenge 6: Full Maze Navigation
# --------------------------------------------------------------------
# Adds lost-wall recovery so the robot can cross open junctions
# (where the side sensor briefly returns -1) without driving straight
# into the opposite wall. The full algorithm is already written for
# you. Your job is to choose ONE value:
#
#     LOST_WALL_DRIFT   the curve-toward-wall fraction (0.0–0.25)
#
# Tuning guide: docs.html?doc=PID_Real_World_Tuning_Quickstart
# (Carry forward every tuned value from Challenges 1–5.)
#
# IMPORTANT: keep LOST_WALL_DRIFT small enough that the inside wheel
# stays >= 120 (the motor dead zone). With BASE_SPEED=160, 0.25 puts
# the inside wheel exactly on the floor; higher values stall it.
#
# Goal: complete the full maze without external help.
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
side_Kp = 0.0  # ← from Challenge 3
# === BLOCK: SIDE_KP END ===

# === BLOCK: SIDE_KD START ===
side_Kd = 0.0  # ← from Challenge 3
# === BLOCK: SIDE_KD END ===

# === BLOCK: SIDE_KI START ===
side_Ki = 0.0  # ← from Challenge 3
side_INTEGRAL_MAX = 1200
# === BLOCK: SIDE_KI END ===

# === BLOCK: FRONT_CONFIG START ===
FRONT_SLOW_DISTANCE = 400
FRONT_STOP_DISTANCE = 120
FRONT_Kp = 0.5
TURN_SPEED = 180
TURN_TIME_90 = 0.0  # ← from Challenge 4
# === BLOCK: FRONT_CONFIG END ===

# === BLOCK: TURN_TIME_180 START ===
TURN_TIME_180 = 0.0  # ← from Challenge 5
# === BLOCK: TURN_TIME_180 END ===

# === BLOCK: LOST_WALL_DRIFT_FACTOR START ===
LOST_WALL_DRIFT = 0.0  # ← TUNE ME (try 0.20; max 0.25 for BASE_SPEED=160)
# === BLOCK: LOST_WALL_DRIFT_FACTOR END ===

side_previous_error = 0
side_integral = 0


# === MAIN LOOP ===
while True:
    front = my_robot.read_distance()

    if front != -1 and front < FRONT_SLOW_DISTANCE:
        if front <= FRONT_STOP_DISTANCE:
            my_robot.brake()
            hold_state(0.3)
            side_check = my_robot.read_distance_2()
            if side_check == -1 or side_check > FRONT_SLOW_DISTANCE:
                turn_duration = TURN_TIME_90
            else:
                turn_duration = TURN_TIME_180
            if my_robot.wall_sign == -1:
                my_robot.rotate_right(TURN_SPEED)
            else:
                my_robot.rotate_left(TURN_SPEED)
            hold_state(turn_duration)
            my_robot.brake()
            hold_state(0.3)
            side_integral = 0
            side_previous_error = 0
            continue
        else:
            approach_speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
            if approach_speed < 120:
                approach_speed = 120
            if approach_speed > BASE_SPEED:
                approach_speed = BASE_SPEED
            my_robot.drive(approach_speed, approach_speed)
            hold_state(0.05)
            continue

    # --- Lost-wall recovery: curve gently toward the wall when sensor blanks ---
    side = my_robot.read_distance_2()
    if side == -1:
        r = BASE_SPEED - int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
        l = BASE_SPEED + int(my_robot.wall_sign * BASE_SPEED * LOST_WALL_DRIFT)
        my_robot.drive(r, l)
        side_integral = 0
        hold_state(0.05)
        continue

    # --- Side wall-follow PID (uses the reading we already have) ---
    wall_distance = side

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
