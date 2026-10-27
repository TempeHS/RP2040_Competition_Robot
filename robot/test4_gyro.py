"""Stage 4: everything in stage 3 + gyro + gyro turns."""

from time import sleep, sleep_ms, ticks_ms, ticks_diff
import random

import config
from robot import Robot
from control import Heading, side_pid, front_pid, follow, at_front_stop, turn, WALL_SIGN
from testlib import step, wait, ask, record, stats, hammer, summary
import test1_servos
import test2_side
import test3_front


def check(robot):
    """Quick gyro check, run at the start of every later stage. Returns a Heading."""
    step("Gyro: quick check (keep still)")
    heading = Heading(robot)
    print("bias {:.2f} deg/s".format(heading.bias))
    record(abs(heading.bias) < 10, "gyro bias < 10 deg/s")
    return heading


def turns(robot, heading, angles):
    worst = 0
    for angle in angles:
        start = ticks_ms()
        error = turn(robot, heading, angle)
        worst = max(worst, abs(error))
        print(
            "turn {:+} -> error {:+.1f} deg in {} ms".format(
                angle, error, ticks_diff(ticks_ms(), start)
            )
        )
        sleep(0.3)
    record(
        worst <= config.TURN_TOLERANCE_DEG + 1,
        "worst turn error {:.1f} deg".format(worst),
    )


def torture(robot):
    step("4.1 Gyro noise (keep still)")
    wait("Robot still on the floor.")
    values = hammer("gyro x500", robot.gyro_dps, 500)
    mean, sd, lo, hi = stats(values)
    print("mean {:.2f} sd {:.2f} min {:.2f} max {:.2f} deg/s".format(mean, sd, lo, hi))
    record(sd < 1, "gyro noise sd < 1 deg/s")

    step("4.2 Drift over 10 s (keep still)")
    heading = Heading(robot)
    end = ticks_ms() + 10000
    while ticks_diff(end, ticks_ms()) > 0:
        heading.update()
        sleep_ms(10)
    print("drift {:.2f} deg".format(heading.angle))
    record(abs(heading.angle) < 2, "drift < 2 deg in 10 s")

    step("4.3 Direction: turn the robot 90 deg CLOCKWISE by hand within 5 s")
    wait("Ready to rotate by hand.")
    heading.reset()
    end = ticks_ms() + 5000
    while ticks_diff(end, ticks_ms()) > 0:
        heading.update()
        sleep_ms(10)
    print("measured {:.1f} deg".format(heading.angle))
    record(75 < heading.angle < 105, "hand turn reads +90 (else flip GYRO_SIGN)")

    step("4.4 Four right turns")
    wait("On the floor with space around. Note which way it faces.")
    heading.reset()
    turns(robot, heading, (90, 90, 90, 90))
    ask("Facing the original direction again?")

    step("4.5 Four left turns")
    turns(robot, heading, (-90, -90, -90, -90))
    ask("Facing the original direction again?")

    step("4.6 Mixed: 180, -180, 45, -45, 10, -10")
    turns(robot, heading, (180, -180, 45, -45, 10, -10))

    step("4.7 Torture: 20 alternating +/-90 turns")
    turns(robot, heading, [90 if i % 2 else -90 for i in range(20)])
    print("total heading after all turns {:.1f} deg".format(heading.update()))
    ask("Still facing the original direction?")

    step("4.8 Gyro + both ToFs + OLED while servos thrash")

    def thrash():
        robot.drive(random.randint(-100, 100), random.randint(-100, 100))
        robot.show("THRASH", robot.front_mm(), robot.side_mm())
        return robot.gyro_dps()

    wait("Wheels OFF the ground.")
    hammer("gyro + ToFs + OLED + servos x300", thrash, 300)
    robot.stop()

    step("4.9 Box run: follow, stop at the front wall, turn away, x4")
    wait("On the floor inside a box/corner layout, beside a wall.")
    heading = Heading(robot)
    side, front = side_pid(), front_pid()
    corners = 0
    start = ticks_ms()
    while corners < 4 and ticks_diff(ticks_ms(), start) < 60000:
        f, s, speed, steer = follow(robot, side, front)
        heading.update()
        if at_front_stop(f) and abs(speed) < 2:
            error = turn(robot, heading, -WALL_SIGN * 90)
            corners += 1
            print("corner {} turn error {:+.1f}".format(corners, error))
            side.reset()
            front.reset()
    robot.stop()
    ask("Four clean corners without touching a wall?")


if __name__ == "__main__":
    robot = Robot()
    try:
        wait("Prop the robot up so the wheels are OFF the ground.")
        test1_servos.check(robot)
        test2_side.scan(robot)
        test2_side.check(robot)
        test3_front.check(robot)
        check(robot)
        torture(robot)
    finally:
        robot.stop()
        summary()
