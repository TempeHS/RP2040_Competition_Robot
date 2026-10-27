"""Stage 1: servos only. No sensors needed. Wheels OFF the ground."""

import random
from time import sleep, sleep_ms, ticks_ms, ticks_diff

from robot import Robot
from testlib import step, wait, ask, record, summary


def check(robot):
    """Quick servo check, run at the start of every later stage."""
    step("Servos: quick check (wheels off the ground)")
    for label, left, right in (
        ("left forward", 40, 0),
        ("right forward", 0, 40),
        ("both backward", -40, -40),
    ):
        print(label)
        robot.drive(left, right)
        sleep(0.8)
    robot.stop()
    ask("Left fwd, right fwd, both back - all correct and now still?")


def torture(robot):
    step("1.1 Stop")
    robot.stop()
    sleep(3)
    ask("Both wheels completely still? (else trim LEFT/RIGHT_STOP_US)")

    step("1.2 Direction at speed 50")
    for label, left, right in (
        ("LEFT forward", 50, 0),
        ("LEFT backward", -50, 0),
        ("RIGHT forward", 0, 50),
        ("RIGHT backward", 0, -50),
    ):
        print(label)
        robot.drive(left, right)
        sleep(1.5)
        robot.stop()
        sleep(0.5)
    ask("Each wheel turned the named way? (else flip *_REVERSED)")

    step("1.3 Speed steps 10, 25, 50, 75, 100 (both forward)")
    for speed in (10, 25, 50, 75, 100):
        print("speed", speed)
        robot.drive(speed, speed)
        sleep(1.2)
    robot.stop()
    ask("Each step clearly faster than the last, and both wheels similar?")

    step("1.4 Deadband: speed 0, 1, 2, 5")
    for speed in (0, 1, 2, 5):
        print("speed", speed)
        robot.drive(speed, speed)
        sleep(2)
    robot.stop()
    ask("0 still, and 1, 2, 5 all creeping slowly? (else adjust SERVO_DEADBAND_US)")

    step("1.5 Reversal torture: 40 full-speed direction flips")
    for i in range(40):
        speed = 100 if i % 2 else -100
        robot.drive(speed, speed)
        sleep_ms(150)
    robot.stop()
    ask("No stall, reset or stuck wheel?")

    step("1.6 Random command torture: 2000 random commands")
    start = ticks_ms()
    for _ in range(2000):
        robot.drive(random.randint(-100, 100), random.randint(-100, 100))
        sleep_ms(2)
    robot.stop()
    print("{:.0f} commands/s".format(2000_000 / ticks_diff(ticks_ms(), start)))
    record(True, "2000 random commands without a crash")

    step("1.7 Endurance: full speed 20 s")
    robot.drive(100, 100)
    sleep(20)
    robot.stop()
    sleep(2)
    ask("Steady speed all 20 s, and wheels still now?")


if __name__ == "__main__":
    robot = Robot()
    try:
        wait("Prop the robot up so the wheels are OFF the ground.")
        torture(robot)
    finally:
        robot.stop()
        summary()
