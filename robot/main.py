"""Competition program: follow the wall, turn at front walls, react to floor colours.

Behaviours live in lib/control.py; numbers live in config.py. Extend here.
"""

from time import sleep_ms, ticks_ms, ticks_diff

import config
from robot import Robot
from control import (
    Heading,
    side_pid,
    front_pid,
    follow,
    at_front_stop,
    turn,
    floor_colour,
    WALL_SIGN,
)


def escape_black(robot, heading):
    """Black tile is a no-go: back out and turn round."""
    robot.show("BLACK")
    robot.drive(-config.REVERSE_SPEED, -config.REVERSE_SPEED)
    sleep_ms(config.REVERSE_MS)
    robot.stop()
    turn(robot, heading, 180)


def victim(robot, colour):
    robot.stop()
    robot.show("VICTIM", colour.upper())
    sleep_ms(config.VICTIM_PAUSE_MS)


def run(robot, seconds=None):
    heading = Heading(robot)
    side, front = side_pid(), front_pid()
    last_colour = "white"
    start = ticks_ms()
    loops = 0
    while seconds is None or ticks_diff(ticks_ms(), start) < seconds * 1000:
        heading.update()

        colour = floor_colour(robot.colour())
        if colour != last_colour:  # react once when entering a tile
            last_colour = colour
            if colour == "black":
                escape_black(robot, heading)
                side.reset()
                front.reset()
                continue
            if colour in ("red", "green"):
                victim(robot, colour)
                side.reset()
                front.reset()

        f, s, speed, steer = follow(robot, side, front)
        if at_front_stop(f) and abs(speed) < 2:
            turn(robot, heading, -WALL_SIGN * 90)  # turn away from the wall
            side.reset()
            front.reset()

        loops += 1
        if loops % 8 == 0:
            robot.show(
                "F {}".format(f),
                "S {}".format(s),
                "H {:.0f}".format(heading.angle),
                colour,
            )
    robot.stop()


if __name__ == "__main__":
    robot = Robot()
    try:
        run(robot)
    finally:
        robot.stop()
