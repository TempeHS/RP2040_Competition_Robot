"""Default robot main: wall PID and gyro corner turns. Keep config.py when replacing this main program."""

from aidriver import AIDriver, hold_state, ticks_ms, ticks_diff
from config_check import validate_config
import aidriver
import config

state = "FOLLOW_WALL"
side_previous_error = 0
side_integral = 0


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
        heading, last_ms = _settle(
            heading, last_ms, gyro_sign, config.NUDGE_SETTLE_STEPS
        )
        nudges = nudges + 1
    return heading


def main():
    global my_robot, state, side_previous_error, side_integral
    validate_config(config, AIDriver.MIN_MOTOR_SPEED)
    aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
    my_robot = AIDriver(
        config.WALL_SIDE,
        distance_sensor=config.DISTANCE_SENSOR,
        min_approach_speed=config.MIN_APPROACH_SPEED,
        kit_servo_pin=config.KIT_SERVO_PIN,
    )
    state = "FOLLOW_WALL"
    side_previous_error = 0
    side_integral = 0
    try:
        hold_state(config.STARTUP_PAUSE_TIME)

        while True:
            if state == "TURN":
                my_robot.show_display(
                    "TURN", "{} deg".format(config.TURN_ANGLE), "", "", force=True
                )
                my_robot.brake()
                hold_state(config.TURN_PAUSE_TIME)
                gyro_turn_pid(config.TURN_ANGLE)
                hold_state(config.TURN_PAUSE_TIME)
                state = "FOLLOW_WALL"
                continue

            front = my_robot.read_distance()

            if front != -1 and front <= config.FRONT_STOP_DISTANCE:
                side_integral = 0
                side_previous_error = 0
                state = "TURN"
                continue

            wall_distance = my_robot.read_distance_2()

            if wall_distance == -1:
                my_robot.drive(config.BASE_SPEED, config.BASE_SPEED)
                side_integral = 0  # reset so windup can't build while wall is gone
                hold_state(config.LOOP_DT)
                continue

            # Ramp the cruise speed down as the front wall approaches.
            if front != -1 and front < config.FRONT_SLOW_DISTANCE:
                speed = int(config.FRONT_Kp * (front - config.FRONT_STOP_DISTANCE))
                if speed < my_robot.min_approach_speed:
                    speed = my_robot.min_approach_speed
                if speed > config.BASE_SPEED:
                    speed = config.BASE_SPEED
            else:
                speed = config.BASE_SPEED

            error = wall_distance - config.TARGET_WALL_DISTANCE

            side_integral = side_integral + error
            if side_integral > config.side_INTEGRAL_MAX:
                side_integral = config.side_INTEGRAL_MAX
            elif side_integral < -config.side_INTEGRAL_MAX:
                side_integral = -config.side_INTEGRAL_MAX

            side_derivative = error - side_previous_error

            steering = (
                (config.side_Kp * error)
                + (config.side_Ki * side_integral)
                + (config.side_Kd * side_derivative)
            )

            right_speed, left_speed = my_robot.steer(
                speed, steering, config.MAX_STEERING
            )

            my_robot.show_display(
                "FOLLOW P",
                "S:{}".format(wall_distance),
                "e:{}".format(int(error)),
                "R{}L{}".format(int(right_speed), int(left_speed)),
            )

            side_previous_error = error
            hold_state(config.LOOP_DT)
    finally:
        my_robot.brake()


if __name__ == "__main__":
    main()
