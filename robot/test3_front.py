"""Stage 3: everything in stage 2 + front ToF + front PID."""

from time import sleep, ticks_ms, ticks_diff
import random

import config
from robot import Robot
from control import side_pid, front_pid, approach_speed, at_front_stop, follow
from testlib import step, wait, ask, record, stats, hammer, summary
import test1_servos
import test2_side
from test2_side import live


def check(robot):
    """Quick front-sensor check, run at the start of every later stage."""
    step("Front ToF: quick check")
    values = hammer("front ToF x20", robot.front_mm, 20)
    if values:
        print("front mm: mean {:.0f} sd {:.1f} min {} max {}".format(*stats(values)))


def back_off(robot):
    robot.drive(-config.BASE_SPEED, -config.BASE_SPEED)
    sleep(1.5)
    robot.stop()


def approach(robot, timeout_s=10):
    """Front PID only. Returns (closest mm, final mm, ms taken or None on timeout)."""
    pid = front_pid()
    closest = 9999
    start = ticks_ms()
    held = None
    while ticks_diff(ticks_ms(), start) < timeout_s * 1000:
        front = robot.front_mm()
        closest = min(closest, front)
        speed = approach_speed(front, pid)
        robot.drive(speed, speed)
        if at_front_stop(front):
            held = held or ticks_ms()
            if ticks_diff(ticks_ms(), held) > 500:
                robot.stop()
                return closest, front, ticks_diff(held, start)
        else:
            held = None
    robot.stop()
    return closest, robot.front_mm(), None


def torture(robot):
    step("3.1 Front ToF accuracy and noise")
    wait("Put a flat wall exactly 100 mm in FRONT. Keep still.")
    values = hammer("front ToF x300", robot.front_mm, 300)
    mean, sd, lo, hi = stats(values)
    print("mean {:.0f} sd {:.1f} min {} max {}".format(mean, sd, lo, hi))
    record(sd < 5, "front noise sd < 5 mm")
    ask("Mean within 15 mm of 100?")

    step("3.2 Bus torture: both ToFs + OLED while servos thrash")

    def thrash():
        robot.drive(random.randint(-100, 100), random.randint(-100, 100))
        robot.show("THRASH", robot.front_mm(), robot.side_mm())

    hammer("front + side + OLED + servos x300", thrash, 300)
    robot.stop()

    step("3.3 Approach a wall 3 times (front PID only)")
    wait("On the floor, facing a wall about 60 cm away.")
    for run in range(3):
        closest, final, ms = approach(robot)
        print(
            "run {}: closest {} final {} time {} ms".format(run + 1, closest, final, ms)
        )
        record(ms is not None, "approach {} settled in time".format(run + 1))
        record(
            closest >= config.FRONT_STOP_MM - 2 * config.FRONT_TOLERANCE_MM,
            "approach {} no big overshoot".format(run + 1),
        )
        back_off(robot)
        sleep(0.5)

    step("3.4 Hold distance (15 s)")
    wait("Hold a box in front of the robot and slowly move it closer and away.")
    pid = front_pid()

    def hold():
        front = robot.front_mm()
        speed = approach_speed(front, pid)
        robot.drive(speed, speed)
        return ["F {}".format(front), "sp {:.0f}".format(speed)]

    live(robot, 15, "HOLD", hold)
    ask("Robot followed the box forward AND backward without hitting it?")

    step("3.5 Follow a wall into a corner (side + front PID)")
    wait("On the floor beside a wall, about 1 m before a corner ahead.")
    side, front = side_pid(), front_pid()
    start = ticks_ms()
    while ticks_diff(ticks_ms(), start) < 15000:
        f, s, speed, steer = follow(robot, side, front)
        if at_front_stop(f) and abs(speed) < 2:
            break
    robot.stop()
    print("front {} side {}".format(robot.front_mm(), robot.side_mm()))
    ask("Followed the wall and stopped square at the corner without touching?")


if __name__ == "__main__":
    robot = Robot()
    try:
        wait("Prop the robot up so the wheels are OFF the ground.")
        test1_servos.check(robot)
        test2_side.scan(robot)
        test2_side.check(robot)
        torture(robot)
    finally:
        robot.stop()
        summary()
