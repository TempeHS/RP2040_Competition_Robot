"""Challenge 9. Teacher reference. Keep config.py when replacing this main program."""

from aidriver import AIDriver, hold_state, ticks_ms, ticks_diff
from config_check import validate_config
import aidriver
import config


side_previous_error = 0
state = "FOLLOW_WALL"


def _turn_is_right(relative_angle_deg):
    """Map wall-relative turn sign to a physical spin direction."""
    if my_robot.wall_sign < 0:
        return relative_angle_deg >= 0
    return relative_angle_deg < 0


def _spin(turn_right, speed, reverse=False):
    """Pivot on the spot at *speed*, optionally against the turn direction."""
    if turn_right != reverse:
        my_robot.drive(-speed, speed)
    else:
        my_robot.drive(speed, -speed)


def _settle(heading, last_ms, gyro_sign, samples):
    """Integrate the gyro while the robot coasts to a stop after braking."""
    for _ in range(samples):
        hold_state(config.TURN_DT)
        gz = my_robot.read_gyro_z_dps() * gyro_sign
        now = ticks_ms()
        dt = ticks_diff(now, last_ms) / 1000.0
        last_ms = now
        heading = heading + (gz * dt)
    return heading, last_ms


def gyro_turn_pid(relative_angle_deg):
    """Spin by a wall-relative angle using the gyro turn PID, then stop."""
    turn_right = _turn_is_right(relative_angle_deg)
    target = float(abs(relative_angle_deg))

    heading = 0.0
    last_ms = ticks_ms()

    # Phase 1 - kick through static friction, and learn which sign this IMU
    # gives for this rotation so an inverted mounting cannot flip the loop.
    _spin(turn_right, config.TURN_KICK_SPEED)
    raw_sum = 0.0
    for _ in range(config.TURN_KICK_STEPS):
        hold_state(config.TURN_DT)
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
    start_ms = last_ms
    while True:
        gz = my_robot.read_gyro_z_dps() * gyro_sign
        now = ticks_ms()
        dt = ticks_diff(now, last_ms) / 1000.0
        if dt <= 0:
            dt = 0.001
        last_ms = now
        heading = heading + (gz * dt)

        if heading + (gz * config.TURN_COAST_TIME) >= target:
            break
        if ticks_diff(now, start_ms) > config.TURN_TIMEOUT_MS:
            break

        error = target - heading
        output = (config.turn_Kp * error) + (config.turn_Kd * (error - prev_error))
        prev_error = error
        speed = int(output)
        if speed > config.TURN_MAX_SPEED:
            speed = config.TURN_MAX_SPEED
        if speed < config.MIN_TURN_SPEED:
            speed = config.MIN_TURN_SPEED
        _spin(turn_right, speed)
        hold_state(config.TURN_DT)

    my_robot.brake()

    # Phase 3 - keep integrating through the coast, then close the remaining
    # error with short pulses until it is inside tolerance.
    heading, last_ms = _settle(heading, last_ms, gyro_sign, config.TURN_SETTLE_STEPS)
    nudges = 0
    while nudges < config.TURN_MAX_NUDGES:
        error = target - heading
        if abs(error) <= config.turn_tolerance:
            break
        pulse_ms = int(config.NUDGE_MS_PER_DEG * abs(error))
        if pulse_ms < config.NUDGE_MIN_MS:
            pulse_ms = config.NUDGE_MIN_MS
        if pulse_ms > config.NUDGE_MAX_MS:
            pulse_ms = config.NUDGE_MAX_MS
        _spin(turn_right, config.NUDGE_SPEED, error < 0)
        pulse_start = ticks_ms()
        while ticks_diff(ticks_ms(), pulse_start) < pulse_ms:
            hold_state(config.NUDGE_STEP)
            gz = my_robot.read_gyro_z_dps() * gyro_sign
            now = ticks_ms()
            dt = ticks_diff(now, last_ms) / 1000.0
            last_ms = now
            heading = heading + (gz * dt)
        my_robot.brake()
        heading, last_ms = _settle(heading, last_ms, gyro_sign, config.NUDGE_SETTLE_STEPS)
        nudges = nudges + 1
    return heading


def follow_wall():
    """STATE: wall-follow, but bail to RECOVER the instant we see BLACK."""
    global side_previous_error

    if my_robot.classify_color() == "black":
        return "RECOVER"

    side = my_robot.read_distance_2()
    if side == -1:
        my_robot.drive(config.BASE_SPEED, config.BASE_SPEED)
        hold_state(config.LOOP_DT)
        return "FOLLOW_WALL"

    error = side - config.TARGET_WALL_DISTANCE
    derivative = error - side_previous_error
    steering = (config.side_Kp * error) + (config.side_Kd * derivative)
    if steering > config.MAX_STEERING:
        steering = config.MAX_STEERING
    elif steering < -config.MAX_STEERING:
        steering = -config.MAX_STEERING

    right = config.BASE_SPEED - (my_robot.wall_sign * steering)
    left = config.BASE_SPEED + (my_robot.wall_sign * steering)
    my_robot.drive(int(right), int(left))
    side_previous_error = error
    hold_state(config.LOOP_DT)
    return "FOLLOW_WALL"


def reverse_off_black():
    """STEP 1: reverse straight off the black, holding heading on the gyro."""
    heading = 0.0
    cleared = 0
    steps = 0
    while steps < config.REVERSE_MAX_STEPS:
        gz = my_robot.read_gyro_z_dps()
        heading = heading + gz * config.REVERSE_DT
        correction = config.HEADING_Kp * heading
        my_robot.drive(
            int(-config.REVERSE_SPEED + correction), int(-config.REVERSE_SPEED - correction)
        )
        hold_state(config.REVERSE_DT)
        steps = steps + 1
        if my_robot.classify_color() != "black":
            cleared = cleared + 1
            if cleared >= config.REVERSE_CLEAR_STEPS:
                break
        else:
            cleared = 0
    my_robot.brake()


def choose_open_direction():
    """STEP 2: turn TOWARD open space, away from the nearest wall."""
    side = my_robot.read_distance_2()
    sensor_on_left = my_robot.wall_sign < 0
    wall_on_sensor_side = side != -1 and side < config.OPEN_SPACE_DISTANCE
    if wall_on_sensor_side:
        # A wall hugs the sensor side, so open space is the OTHER way.
        return "right" if sensor_on_left else "left"
    # The sensor side is open — head that way.
    return "left" if sensor_on_left else "right"


def drive_forward_to_wall():
    """STEPS 3-4: drive straight on the gyro until a wall is found ahead."""
    heading = 0.0
    steps = 0
    while steps < config.FORWARD_MAX_STEPS:
        front = my_robot.read_distance()
        if front != -1 and front <= config.WALL_FOUND_DISTANCE:
            break  # found a wall to follow again
        gz = my_robot.read_gyro_z_dps()
        heading = heading + gz * config.FORWARD_DT
        correction = config.HEADING_Kp * heading
        my_robot.drive(int(config.FORWARD_SPEED + correction), int(config.FORWARD_SPEED - correction))
        hold_state(config.FORWARD_DT)
        steps = steps + 1
    my_robot.brake()


def recover():
    """STATE: the four-step no-go recovery, then hand back to FOLLOW_WALL."""
    reverse_off_black()  # 1. heading-PID reverse off the black
    turn_dir = choose_open_direction()  # 2. pick the open side
    gyro_turn_pid(config.TURN_ANGLE if (turn_dir == "right") == (my_robot.wall_sign < 0) else -config.TURN_ANGLE)  #    turn 90° toward open space
    drive_forward_to_wall()  # 3 + 4. heading-PID forward, find a wall
    return "FOLLOW_WALL"


def main():
    global my_robot, side_previous_error, state
    validate_config(config, AIDriver.MIN_MOTOR_SPEED)
    aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
    my_robot = AIDriver(
        config.WALL_SIDE,
        distance_sensor=config.DISTANCE_SENSOR,
        min_approach_speed=config.MIN_APPROACH_SPEED,
        kit_servo_pin=config.KIT_SERVO_PIN,
    )
    side_previous_error = 0
    state = "FOLLOW_WALL"
    try:
        my_robot.color_min_clear = config.color_min_clear
        my_robot.color_red_ratio = config.color_red_ratio
        my_robot.color_green_ratio = config.color_green_ratio
        my_robot.color_silver_clear = config.color_silver_clear
        my_robot.color_black_clear = config.color_black_clear
        while True:
            if state == "FOLLOW_WALL":
                state = follow_wall()
            elif state == "RECOVER":
                state = recover()
    finally:
        my_robot.brake()


if __name__ == "__main__":
    main()
