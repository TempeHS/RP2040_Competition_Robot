# TEMP tuning file — Challenge 4: Corner Detection (90 deg turn)
# Scratch copy we keep iterating on. Not part of the challenge set.

from time import ticks_ms, ticks_diff

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left", "tof")

# --- FOLLOW_WALL parameters ---
BASE_SPEED = 200
TARGET_WALL_DISTANCE = 40
MAX_STEERING = 60

side_Kp = 0.4
side_Kd = 0.3
side_Ki = 0.015
side_INTEGRAL_MAX = 1100

FRONT_SLOW_DISTANCE = 150
FRONT_Kp = 1.0

# --- TURN parameters ---
turn_Kp = 30.0
turn_Kd = 0.4
turn_tolerance = 2.0

TURN_ANGLE = 90
TURN_DT = 0.02
TURN_MAX_SPEED = 240
MIN_TURN_SPEED = 190
TURN_TIMEOUT_MS = 2500  # hard stop: a 90 deg pivot takes well under 1 second
TURN_CLEAR_TIME = 0.4  # forward burst after a turn, to leave the trigger zone

TURN_KICK_SPEED = 255  # break static friction; 150 alone will not start a pivot
TURN_KICK_STEPS = 4
TURN_COAST_TIME = 0.03  # seconds the robot keeps spinning after brake()
TURN_SETTLE_STEPS = 15  # gyro samples taken while coasting, before correcting

# Correction pulses. Below MIN_TURN_SPEED the motors stall, so fine angles are
# reached with short bursts rather than by driving slower. The pulse must be
# strong enough to break static friction from a standstill, like the kick.
NUDGE_SPEED = 220
NUDGE_MS_PER_DEG = 4
NUDGE_MIN_MS = 25
NUDGE_MAX_MS = 250
TURN_MAX_NUDGES = 6

# --- Trigger threshold ---
FRONT_STOP_DISTANCE = 150

# --- Persistent state ---
state = "FOLLOW_WALL"
side_integral = 0
side_previous_error = 0
display_tick = 0


def boot_check():
    """Prove this file is running and that the gyro is alive. Halts if not."""
    gz_max = 0.0
    for _ in range(20):
        gz = abs(my_robot.read_gyro_z_dps())
        if gz > gz_max:
            gz_max = gz
        hold_state(0.01)
    print("TMP4 boot: has_gyro=", my_robot.has_gyro)
    print("TMP4 boot: has_display=", my_robot.has_display)
    print("TMP4 boot: idle |gz| max=", gz_max)
    my_robot.show_display(
        "TMP4 BOOT",
        "gyro:{}".format("OK" if my_robot.has_gyro else "NONE"),
        "oled:{}".format("OK" if my_robot.has_display else "NONE"),
        "idle gz:{}".format(int(gz_max)),
    )
    hold_state(3.0)
    if not my_robot.has_gyro:
        my_robot.brake()
        my_robot.show_display("HALTED", "NO GYRO FOUND", "check GP16/17", "wiring")
        print("TMP4: no gyro - turns are impossible, halting.")
        raise SystemExit


def _turn_is_right(relative_angle_deg):
    """Map wall-relative turn sign to a physical spin direction."""
    if my_robot.wall_sign < 0:
        return relative_angle_deg >= 0
    return relative_angle_deg < 0


def _settle(heading, last_ms, gyro_sign, samples):
    """Integrate the gyro while the robot coasts to a stop after brake()."""
    for _ in range(samples):
        hold_state(0.02)
        gz = my_robot.read_gyro_z_dps() * gyro_sign
        now = ticks_ms()
        dt = ticks_diff(now, last_ms) / 1000.0
        last_ms = now
        heading = heading + (gz * dt)
    return heading, last_ms


def _spin(turn_right, speed, reverse=False):
    """Pivot on the spot at *speed*, optionally against the turn direction."""
    if turn_right != reverse:
        my_robot.drive(-speed, speed)
    else:
        my_robot.drive(speed, -speed)


def gyro_turn_pid(relative_angle_deg):
    """Spin by a wall-relative angle using the gyro turn PID, then stop."""
    turn_right = _turn_is_right(relative_angle_deg)
    target = float(abs(relative_angle_deg))

    heading = 0.0
    last_ms = ticks_ms()

    # Phase 1 - kick through static friction, and learn which sign this IMU
    # gives for this rotation so an inverted mounting cannot flip the loop.
    _spin(turn_right, TURN_KICK_SPEED)
    raw_sum = 0.0
    for _ in range(TURN_KICK_STEPS):
        hold_state(TURN_DT)
        raw = my_robot.read_gyro_z_dps()
        raw_sum = raw_sum + raw
        now = ticks_ms()
        dt = ticks_diff(now, last_ms) / 1000.0
        last_ms = now
        heading = heading + (abs(raw) * dt)
    gyro_sign = -1 if raw_sum < 0 else 1

    # Phase 2 - PID cruise. Braking is predictive: cut power once the angle we
    # would coast through lands on the target.
    prev_error = target - heading
    steps = 0
    gz_peak = 0.0
    timed_out = False
    start_ms = last_ms
    while True:
        gz = my_robot.read_gyro_z_dps() * gyro_sign
        if abs(gz) > gz_peak:
            gz_peak = abs(gz)
        now = ticks_ms()
        dt = ticks_diff(now, last_ms) / 1000.0
        if dt <= 0:
            dt = 0.001
        last_ms = now
        heading = heading + (gz * dt)

        if heading + (gz * TURN_COAST_TIME) >= target:
            break
        if ticks_diff(now, start_ms) > TURN_TIMEOUT_MS:
            timed_out = True
            break

        error = target - heading
        output = (turn_Kp * error) + (turn_Kd * (error - prev_error))
        prev_error = error
        speed = int(output)
        if speed > TURN_MAX_SPEED:
            speed = TURN_MAX_SPEED
        if speed < MIN_TURN_SPEED:
            speed = MIN_TURN_SPEED
        _spin(turn_right, speed)
        hold_state(TURN_DT)
        steps = steps + 1

    my_robot.brake()

    # Phase 3 - keep integrating through the coast, then close the remaining
    # error with short pulses until it is inside tolerance.
    heading, last_ms = _settle(heading, last_ms, gyro_sign, TURN_SETTLE_STEPS)
    nudges = 0
    while nudges < TURN_MAX_NUDGES:
        error = target - heading
        if abs(error) <= turn_tolerance:
            break
        pulse_ms = int(NUDGE_MS_PER_DEG * abs(error))
        if pulse_ms < NUDGE_MIN_MS:
            pulse_ms = NUDGE_MIN_MS
        if pulse_ms > NUDGE_MAX_MS:
            pulse_ms = NUDGE_MAX_MS
        _spin(turn_right, NUDGE_SPEED, error < 0)
        pulse_start = ticks_ms()
        while ticks_diff(ticks_ms(), pulse_start) < pulse_ms:
            gz = my_robot.read_gyro_z_dps() * gyro_sign
            now = ticks_ms()
            dt = ticks_diff(now, last_ms) / 1000.0
            last_ms = now
            heading = heading + (gz * dt)
        my_robot.brake()
        heading, last_ms = _settle(heading, last_ms, gyro_sign, 10)
        nudges = nudges + 1

    print(
        "TMP4 turn: want",
        target,
        "got",
        heading,
        "steps",
        steps,
        "nudges",
        nudges,
        "sign",
        gyro_sign,
        "peak",
        gz_peak,
        "timeout",
        timed_out,
    )
    my_robot.show_display(
        "TURN {}".format("TIMEOUT" if timed_out else "DONE"),
        "want{} got{}".format(int(target), int(heading)),
        "nudge:{} sgn:{}".format(nudges, gyro_sign),
        "peak:{} n:{}".format(int(gz_peak), steps),
    )


def follow_wall():
    """STATE: hold the side wall with the side PID. Returns the next state."""
    global side_integral, side_previous_error, display_tick

    front = my_robot.read_distance()
    if front != -1 and front <= FRONT_STOP_DISTANCE:
        side_integral = 0
        side_previous_error = 0
        return "TURN"

    side = my_robot.read_distance_2()
    if side == -1:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        return "FOLLOW_WALL"

    if front != -1 and front < FRONT_SLOW_DISTANCE:
        speed = int(FRONT_Kp * (front - FRONT_STOP_DISTANCE))
        if speed < my_robot.min_approach_speed:
            speed = my_robot.min_approach_speed
        if speed > BASE_SPEED:
            speed = BASE_SPEED
    else:
        speed = BASE_SPEED

    error = side - TARGET_WALL_DISTANCE
    side_integral = side_integral + error
    if side_integral > side_INTEGRAL_MAX:
        side_integral = side_INTEGRAL_MAX
    elif side_integral < -side_INTEGRAL_MAX:
        side_integral = -side_INTEGRAL_MAX
    derivative = error - side_previous_error
    steering = (side_Kp * error) + (side_Ki * side_integral) + (side_Kd * derivative)

    # Cap steering so the slower wheel can never fall into the motor dead zone.
    steer_limit = speed - my_robot.MIN_MOTOR_SPEED
    if steer_limit < 0:
        steer_limit = 0
    if steer_limit > MAX_STEERING:
        steer_limit = MAX_STEERING
    if steering > steer_limit:
        steering = steer_limit
    elif steering < -steer_limit:
        steering = -steer_limit

    right_speed = speed - (my_robot.wall_sign * steering)
    left_speed = speed + (my_robot.wall_sign * steering)
    my_robot.drive(int(right_speed), int(left_speed))
    side_previous_error = error

    # OLED is slow I2C — refresh ~2x/sec, not every loop.
    display_tick = display_tick + 1
    if display_tick >= 10:
        display_tick = 0
        my_robot.show_display(
            "FOLLOW",
            "F:{} S:{}".format(front, side),
            "err:{} st:{}".format(int(error), int(steering)),
            "R:{} L:{}".format(int(right_speed), int(left_speed)),
        )

    hold_state(0.05)
    return "FOLLOW_WALL"


def turn():
    """STATE: wall ahead — spin 90 deg AWAY from the wall."""
    my_robot.brake()
    my_robot.clear_display()  # no I2C traffic while the gyro loop is running
    hold_state(0.3)
    gyro_turn_pid(TURN_ANGLE)
    hold_state(2.0)  # long enough to read the result off the OLED
    # Move out of the trigger zone, else FOLLOW_WALL re-fires TURN instantly.
    front = my_robot.read_distance()
    if front == -1 or front > FRONT_STOP_DISTANCE:
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(TURN_CLEAR_TIME)
        my_robot.brake()
    return "FOLLOW_WALL"


# --- Main loop ---
boot_check()
while True:
    if state == "FOLLOW_WALL":
        state = follow_wall()
    elif state == "TURN":
        state = turn()
