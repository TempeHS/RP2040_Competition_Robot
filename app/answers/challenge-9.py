# === ANSWER KEY — Challenge 9 (teacher reference; students should NOT see this) ===
# Same as app/starter-code/challenge-9.py with tuned values filled in.

# Challenge 9: No-Go Zones — detect BLACK and recover
# Wall-follow up the left wall. The moment the colour sensor reads BLACK
# (a no-go area), run the four-step recovery, then carry on and reach the
# exit zone on the far side. Guide: docs.html?doc=Challenge_9

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

# --- Wall-follow (carry forward from Challenge 1 / 2) ---
BASE_SPEED = 200  # cruise speed
TARGET_WALL_DISTANCE = 200  # mm to hold from the side wall
MAX_STEERING = 60  # steering clamp
side_Kp = 0.25  # proportional gain
side_Kd = 0.40  # derivative gain
side_previous_error = 0

# --- BLACK no-go detection ---
# Black absorbs the sensor LED, so its clear value reads BELOW the floor
# (floor clear ~120, black ~30). Sit the threshold between them.
my_robot.color_black_clear = 60

# --- Recovery tunables ---
HEADING_Kp = 4.0  # heading-hold gain for straight reverse / forward
REVERSE_SPEED = 180  # speed to back out of the no-go area
REVERSE_DT = 0.05  # seconds per reverse step
REVERSE_CLEAR_STEPS = 6  # extra straight-back steps after leaving the black
REVERSE_MAX_STEPS = 80  # safety cap
OPEN_SPACE_DISTANCE = 400  # side reading above this = open space that way
FORWARD_SPEED = 200  # speed to drive forward looking for a wall
FORWARD_DT = 0.05  # seconds per forward step
WALL_FOUND_DISTANCE = 300  # stop when a wall is this close ahead
FORWARD_MAX_STEPS = 200  # safety cap

state = "FOLLOW_WALL"


def follow_wall():
    """STATE: wall-follow, but bail to RECOVER the instant we see BLACK."""
    global side_previous_error

    if my_robot.classify_color() == "black":
        return "RECOVER"

    side = my_robot.read_distance_2()
    if side == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        return "FOLLOW_WALL"

    error = side - TARGET_WALL_DISTANCE
    derivative = error - side_previous_error
    steering = (side_Kp * error) + (side_Kd * derivative)
    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING

    right = BASE_SPEED - (my_robot.wall_sign * steering)
    left = BASE_SPEED + (my_robot.wall_sign * steering)
    my_robot.drive(int(right), int(left))
    side_previous_error = error
    hold_state(0.05)
    return "FOLLOW_WALL"


def reverse_off_black():
    """STEP 1: reverse straight off the black, holding heading on the gyro."""
    heading = 0.0
    cleared = 0
    steps = 0
    while steps < REVERSE_MAX_STEPS:
        gz = my_robot.read_gyro_z_dps()
        heading = heading + gz * REVERSE_DT
        correction = HEADING_Kp * heading
        my_robot.drive(
            int(-REVERSE_SPEED + correction), int(-REVERSE_SPEED - correction)
        )
        hold_state(REVERSE_DT)
        steps = steps + 1
        if my_robot.classify_color() != "black":
            cleared = cleared + 1
            if cleared >= REVERSE_CLEAR_STEPS:
                break
        else:
            cleared = 0
    my_robot.brake()


def choose_open_direction():
    """STEP 2: turn TOWARD open space, away from the nearest wall."""
    side = my_robot.read_distance_2()
    sensor_on_left = my_robot.wall_sign < 0
    wall_on_sensor_side = side != -1 and side < OPEN_SPACE_DISTANCE
    if wall_on_sensor_side:
        # A wall hugs the sensor side, so open space is the OTHER way.
        return "right" if sensor_on_left else "left"
    # The sensor side is open — head that way.
    return "left" if sensor_on_left else "right"


def drive_forward_to_wall():
    """STEPS 3-4: drive straight on the gyro until a wall is found ahead."""
    heading = 0.0
    steps = 0
    while steps < FORWARD_MAX_STEPS:
        front = my_robot.read_distance()
        if front != -1 and front <= WALL_FOUND_DISTANCE:
            break  # found a wall to follow again
        gz = my_robot.read_gyro_z_dps()
        heading = heading + gz * FORWARD_DT
        correction = HEADING_Kp * heading
        my_robot.drive(int(FORWARD_SPEED + correction), int(FORWARD_SPEED - correction))
        hold_state(FORWARD_DT)
        steps = steps + 1
    my_robot.brake()


def recover():
    """STATE: the four-step no-go recovery, then hand back to FOLLOW_WALL."""
    reverse_off_black()  # 1. heading-PID reverse off the black
    turn_dir = choose_open_direction()  # 2. pick the open side
    my_robot.turn_90(turn_dir)  #    turn 90° toward open space
    drive_forward_to_wall()  # 3 + 4. heading-PID forward, find a wall
    return "FOLLOW_WALL"


while True:
    if state == "FOLLOW_WALL":
        state = follow_wall()
    elif state == "RECOVER":
        state = recover()
