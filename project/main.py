"""Challenge 4 on real hardware: wall following + corner detection + gyro turn.

Two states. FOLLOW_WALL holds the side wall with the PID from Challenge 3 and
slows on the approach to a front wall. TURN spins 90 degrees away from it.
"""

from aidriver import AIDriver, hold_state

my_robot = AIDriver("left", "tof")

# --- FOLLOW_WALL tuning ---
BASE_SPEED = 200  # cruise speed
TARGET_WALL_DISTANCE = 100  # distance to hold from the side wall (mm)
MAX_STEERING = 60  # max wheel-speed difference

side_Kp = 0.3  # proportional gain
side_Kd = 0.5  # derivative gain
side_Ki = 0.005  # integral gain
side_INTEGRAL_MAX = 750  # anti-windup clamp

# --- Corner detection ---
FRONT_SLOW_DISTANCE = 300  # start slowing when a front wall is this close (mm)
FRONT_STOP_DISTANCE = 150  # front wall this close = corner reached -> TURN
FRONT_Kp = 1.0  # how hard to slow down on the approach

# --- TURN tuning (the library gyro turn PID; set here so you can tune it) ---
TURN_ANGLE = 90  # every corner is a 90 degree turn
my_robot.turn_Kp = 6.0  # proportional gain on heading error
my_robot.turn_Kd = 0.4  # derivative gain - damps overshoot
my_robot.turn_tolerance = 2.0  # stop within this many degrees of target

state = "FOLLOW_WALL"
side_previous_error = 0
side_integral = 0

hold_state(2.0)  # leave the boot CHECK screen up long enough to read

while True:
    if state == "TURN":
        my_robot.show_display("TURN", "{} deg".format(TURN_ANGLE), "", "", force=True)
        my_robot.brake()
        hold_state(0.3)
        my_robot.turn_degrees(TURN_ANGLE)
        hold_state(0.3)
        state = "FOLLOW_WALL"
        continue

    front = my_robot.read_distance()

    if front != -1 and front <= FRONT_STOP_DISTANCE:
        side_integral = 0
        side_previous_error = 0
        state = "TURN"
        continue

    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        side_integral = 0  # reset so windup can't build while wall is gone
        hold_state(0.05)
        continue

    # Ramp the cruise speed down as the front wall approaches.
    if front != -1 and front < FRONT_SLOW_DISTANCE:
        speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
        if speed < my_robot.min_approach_speed:
            speed = my_robot.min_approach_speed
        if speed > BASE_SPEED:
            speed = BASE_SPEED
    else:
        speed = BASE_SPEED

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

    right_speed, left_speed = my_robot.steer(speed, steering, MAX_STEERING)

    my_robot.show_display(
        "FOLLOW P",
        "S:{}".format(wall_distance),
        "e:{}".format(int(error)),
        "R{}L{}".format(int(right_speed), int(left_speed)),
    )

    side_previous_error = error
    hold_state(0.05)
