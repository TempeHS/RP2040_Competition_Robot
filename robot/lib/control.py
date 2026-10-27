"""Driving behaviours on top of Robot. Shared by main.py and the stage tests."""

from time import sleep_ms, ticks_ms, ticks_us, ticks_diff

import config

# Turns "toward the wall" into clockwise-positive steering.
WALL_SIGN = -1 if config.WALL_SIDE == "left" else 1


class PID:
    def __init__(self, kp, ki, kd, limit):
        self.kp, self.ki, self.kd, self.limit = kp, ki, kd, limit
        self.reset()

    def reset(self):
        self.integral = 0.0
        self.last_error = None
        self.last_us = ticks_us()

    def update(self, error):
        now = ticks_us()
        dt = ticks_diff(now, self.last_us) / 1_000_000
        self.last_us = now
        derivative = 0.0
        if self.last_error is not None and dt > 0:
            derivative = (error - self.last_error) / dt
            self.integral += error * dt
            if self.ki:
                bound = self.limit / abs(self.ki)
                self.integral = max(-bound, min(bound, self.integral))
        self.last_error = error
        out = self.kp * error + self.ki * self.integral + self.kd * derivative
        return max(-self.limit, min(self.limit, out))


class Heading:
    """Gyro heading in degrees, clockwise positive. Call update() often."""

    def __init__(self, robot):
        self.robot = robot
        total = 0.0
        for _ in range(200):
            total += robot.gyro_dps()
            sleep_ms(2)
        self.bias = total / 200
        self.reset()

    def reset(self):
        self.angle = 0.0
        self.last_us = ticks_us()

    def update(self):
        now = ticks_us()
        rate = self.robot.gyro_dps() - self.bias
        self.angle += rate * ticks_diff(now, self.last_us) / 1_000_000
        self.last_us = now
        return self.angle


def side_pid():
    return PID(config.SIDE_KP, config.SIDE_KI, config.SIDE_KD, config.SIDE_MAX_STEER)


def front_pid():
    return PID(config.FRONT_KP, 0.0, config.FRONT_KD, config.BASE_SPEED)


def wall_steer(side_mm, pid):
    """Clockwise steer that holds SIDE_TARGET_MM. 0 when there is no wall."""
    if side_mm > config.SIDE_LOST_MM:
        pid.reset()
        return 0
    return WALL_SIGN * pid.update(side_mm - config.SIDE_TARGET_MM)


def approach_speed(front_mm, pid):
    """Forward speed that settles at FRONT_STOP_MM (negative = back off)."""
    return pid.update(front_mm - config.FRONT_STOP_MM)


def at_front_stop(front_mm):
    return abs(front_mm - config.FRONT_STOP_MM) <= config.FRONT_TOLERANCE_MM


def follow(robot, side_pid_, front_pid_=None):
    """One control step: follow the wall, slowing for the front wall if front_pid_ is given.

    Returns (front, side, speed, steer)."""
    side = robot.side_mm()
    front = None
    speed = config.BASE_SPEED
    if front_pid_:
        front = robot.front_mm()
        speed = approach_speed(front, front_pid_)
    # Scale steering with speed so the robot doesn't spin on the spot when stopping.
    steer = wall_steer(side, side_pid_) * max(speed, 0) / config.BASE_SPEED
    robot.drive(speed + steer, speed - steer)
    return front, side, speed, steer


def turn(robot, heading, degrees):
    """Spin by gyro, clockwise positive. Returns the remaining error in degrees."""
    pid = PID(config.TURN_KP, 0.0, config.TURN_KD, config.TURN_MAX_SPEED)
    target = heading.update() + degrees
    start = ticks_ms()
    while ticks_diff(ticks_ms(), start) < config.TURN_TIMEOUT_MS:
        error = target - heading.update()
        if abs(error) <= config.TURN_TOLERANCE_DEG:
            break
        speed = pid.update(error)
        robot.drive(speed, -speed)
        sleep_ms(5)
    robot.stop()
    sleep_ms(100)
    return target - heading.update()


def floor_colour(rgbw):
    """Classify (r, g, b, w): "black", "silver", "red", "green" or "white"."""
    r, g, b, w = rgbw
    if w <= config.BLACK_MAX_W:
        return "black"
    if w >= config.SILVER_MIN_W:
        return "silver"
    total = (r + g + b) or 1
    if r / total >= config.RED_RATIO:
        return "red"
    if g / total >= config.GREEN_RATIO:
        return "green"
    return "white"
