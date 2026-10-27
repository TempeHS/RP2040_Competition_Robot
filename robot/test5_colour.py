"""Stage 5: everything in stage 4 + colour sensor + floor reactions + full main.py run."""

from time import sleep, sleep_ms, ticks_ms, ticks_diff
import random

import config
from robot import Robot
from control import Heading, side_pid, front_pid, follow, floor_colour
from testlib import step, wait, ask, record, stats, hammer, summary
import test1_servos
import test2_side
import test3_front
import test4_gyro
import main

SURFACES = ("white", "black", "silver", "red", "green")


def check(robot):
    step("Colour: quick check")
    values = hammer("colour x20", robot.colour, 20)
    if values:
        print("last rgbw {} -> {}".format(values[-1], floor_colour(values[-1])))


def survey(robot):
    """Measure each surface; return {surface: (mean_w, red_ratio, green_ratio)}."""
    found = {}
    for surface in SURFACES:
        wait(
            "Robot on the floor with the colour sensor over {}.".format(surface.upper())
        )
        readings = []
        for _ in range(30):
            readings.append(robot.colour())
            sleep_ms(50)
        r, g, b, w = (sum(x[i] for x in readings) / len(readings) for i in range(4))
        total = (r + g + b) or 1
        w_sd = stats([x[3] for x in readings])[1]
        found[surface] = (w, r / total, g / total)
        print(
            "{}: r {:.0f} g {:.0f} b {:.0f} w {:.0f} (sd {:.0f})  red {:.2f} green {:.2f}  -> {}".format(
                surface,
                r,
                g,
                b,
                w,
                w_sd,
                r / total,
                g / total,
                floor_colour((r, g, b, w)),
            )
        )
        record(
            floor_colour((r, g, b, w)) == surface,
            "{} classified correctly".format(surface),
        )
    return found


def suggest(found):
    others = lambda name: [v for k, v in found.items() if k != name]
    print("\nSuggested config (midpoints between surfaces):")
    print(
        "BLACK_MAX_W = {:.0f}".format(
            (found["black"][0] + min(v[0] for v in others("black"))) / 2
        )
    )
    brightest_other = max(
        v[0] for k, v in found.items() if k not in ("silver", "black")
    )
    if found["silver"][0] > brightest_other:
        print(
            "SILVER_MIN_W = {:.0f}".format((found["silver"][0] + brightest_other) / 2)
        )
    else:
        print(
            "SILVER: not brighter than other surfaces - add a light or change the gain"
        )
    print(
        "RED_RATIO = {:.2f}".format(
            (found["red"][1] + max(v[1] for v in others("red"))) / 2
        )
    )
    print(
        "GREEN_RATIO = {:.2f}".format(
            (found["green"][2] + max(v[2] for v in others("green"))) / 2
        )
    )


def drive_until(robot, colours, timeout_s=15):
    """Follow the wall until the floor is one of colours. Returns the colour or None."""
    side, front = side_pid(), front_pid()
    start = ticks_ms()
    while ticks_diff(ticks_ms(), start) < timeout_s * 1000:
        colour = floor_colour(robot.colour())
        if colour in colours:
            robot.stop()
            return colour
        follow(robot, side, front)
    robot.stop()
    return None


def torture(robot):
    step("5.1 Surface survey")
    suggest(survey(robot))
    ask(
        "Every surface classified correctly? (else copy the suggestions into config.py and re-run)"
    )

    step("5.2 Colour sensor + everything else while servos thrash")

    def thrash():
        robot.drive(random.randint(-100, 100), random.randint(-100, 100))
        robot.show("THRASH", robot.front_mm(), robot.side_mm(), robot.gyro_dps())
        return robot.colour()

    wait("Wheels OFF the ground.")
    hammer("colour + gyro + ToFs + OLED + servos x300", thrash, 300)
    robot.stop()

    step("5.3 Black tile: stop, reverse, turn round (x3)")
    for run in range(3):
        wait("On the floor beside a wall with a BLACK tile about 30 cm ahead.")
        heading = Heading(robot)
        found = drive_until(robot, ("black",))
        record(found == "black", "run {} found black".format(run + 1))
        if found:
            main.escape_black(robot, heading)
    ask("Stopped on black, backed out and turned round each time?")

    step("5.4 Victims: stop and show (red then green)")
    for colour in ("red", "green"):
        wait(
            "On the floor beside a wall with a {} tile about 30 cm ahead.".format(
                colour.upper()
            )
        )
        found = drive_until(robot, (colour,))
        record(found == colour, "found " + colour)
        if found:
            main.victim(robot, found)
    ask("Stopped on each victim and showed the right colour?")

    step("5.5 Full main.py run (60 s)")
    wait("Put the robot in the test maze.")
    main.run(robot, 60)
    ask("Followed walls, turned at corners, avoided black, stopped for victims?")


if __name__ == "__main__":
    robot = Robot()
    try:
        wait("Prop the robot up so the wheels are OFF the ground.")
        test1_servos.check(robot)
        test2_side.scan(robot)
        test2_side.check(robot)
        test3_front.check(robot)
        test4_gyro.check(robot)
        check(robot)
        torture(robot)
    finally:
        robot.stop()
        summary()
