"""Stage 2: servos + I2C + OLED + side ToF + side wall PID."""

from time import sleep, ticks_ms, ticks_diff
import random

import config
from robot import Robot
from control import side_pid, wall_steer, follow
from testlib import step, wait, ask, record, stats, hammer, summary
import test1_servos

NAMES = {0x29: "ToF", 0x3C: "OLED", 0x10: "colour", 0x6A: "gyro"}


def scan(robot):
    step("I2C scan")
    wanted = (
        (config.FRONT_TOF_BUS, 0x29),
        (config.OLED_BUS, 0x3C),
        (config.SIDE_TOF_BUS, 0x29),
        (config.COLOUR_BUS, 0x10),
        (config.GYRO_BUS, 0x6A),
    )
    for bus_id, bus in enumerate(robot.buses):
        found = bus.scan()
        print("I2C{}: {}".format(bus_id, [NAMES.get(a, hex(a)) for a in found]))
        for want_bus, addr in wanted:
            if want_bus == bus_id:
                record(
                    addr in found,
                    "I2C{} has {} (0x{:02X})".format(bus_id, NAMES[addr], addr),
                )


def check(robot):
    """Quick side-sensor check, run at the start of every later stage."""
    step("Side ToF + OLED: quick check")
    values = hammer("side ToF x20", robot.side_mm, 20)
    if values:
        print("side mm: mean {:.0f} sd {:.1f} min {} max {}".format(*stats(values)))
    robot.show("SIDE", values[-1] if values else "ERR")


def live(robot, seconds, label, fn):
    """Run fn() every loop for a while, showing its text on OLED/console."""
    end = ticks_ms() + seconds * 1000
    i = 0
    while ticks_diff(end, ticks_ms()) > 0:
        lines = fn()
        if i % 8 == 0:
            robot.show(label, *lines)
            print(" | ".join(str(x) for x in lines))
        i += 1
    robot.stop()


def torture(robot):
    scan(robot)

    step("2.1 OLED")
    robot.show("OLED OK", "line 2", "line 3", "12345678")
    ask("OLED shows 4 lines ending 12345678?")
    hammer("OLED 200 updates", lambda: robot.show("HAMMER", ticks_ms()), 200)

    step("2.2 Side ToF accuracy and noise")
    wait("Put a flat wall exactly 100 mm from the SIDE sensor. Keep still.")
    values = hammer("side ToF x300", robot.side_mm, 300)
    mean, sd, lo, hi = stats(values)
    print("mean {:.0f} sd {:.1f} min {} max {}".format(mean, sd, lo, hi))
    record(sd < 5, "side noise sd < 5 mm")
    ask("Mean within 15 mm of 100? (else fix the mounting or SIDE_TARGET_MM)")

    step("2.3 Range sweep (10 s): move a card from touching to 50 cm away")
    seen = []

    def sweep():
        seen.append(robot.side_mm())
        return ["S {}".format(seen[-1])]

    live(robot, 10, "SWEEP", sweep)
    print("min {} max {}".format(min(seen), max(seen)))
    record(min(seen) < 60 and max(seen) > 400, "side ToF covers 60..400 mm")

    step("2.4 Bus torture: side ToF + OLED while servos thrash")

    def thrash():
        robot.drive(random.randint(-100, 100), random.randint(-100, 100))
        robot.show("THRASH", robot.side_mm())
        return robot.side_mm()

    hammer("side ToF + OLED + servos x300", thrash, 300)
    robot.stop()

    step("2.5 Steering direction (wheels OFF the ground, 15 s)")
    wait("Wheels off the ground. Move a card near then far from the side sensor.")
    print(
        "Closer than {} mm: robot should steer AWAY from the wall.".format(
            config.SIDE_TARGET_MM
        )
    )
    print(
        "Further: steer TOWARD it. Beyond {} mm: straight.".format(config.SIDE_LOST_MM)
    )
    pid = side_pid()

    def dry():
        side = robot.side_mm()
        steer = wall_steer(side, pid)
        robot.drive(config.BASE_SPEED + steer, config.BASE_SPEED - steer)
        way = "straight" if abs(steer) < 1 else ("right" if steer > 0 else "left")
        return ["S {}".format(side), "st {:.0f}".format(steer), way]

    live(robot, 15, "DRY RUN", dry)
    ask(
        "Steered away when close, toward when far, straight with no wall? (wall on the {})".format(
            config.WALL_SIDE
        )
    )

    for title, start_mm, seconds, extra in (
        ("2.6 Follow from the target distance", config.SIDE_TARGET_MM, 6, ""),
        ("2.7 Follow from too close", 50, 6, ""),
        ("2.8 Follow from too far", 200, 6, ""),
        (
            "2.9 Disturbance",
            config.SIDE_TARGET_MM,
            10,
            " Push it toward and away from the wall while it runs.",
        ),
    ):
        step(title)
        wait(
            "On the floor, {} mm from a long straight wall, pointing along it. Catch it at the end.{}".format(
                start_mm, extra
            )
        )
        pid = side_pid()
        errors = []

        def run():
            _, side, _, steer = follow(robot, pid)
            errors.append(abs(side - config.SIDE_TARGET_MM))
            return ["S {}".format(side), "st {:.0f}".format(steer)]

        live(robot, seconds, "FOLLOW", run)
        settled = errors[len(errors) // 2 :]
        print(
            "mean |error| over the second half: {:.0f} mm".format(
                sum(settled) / len(settled)
            )
        )
        ask("Settled near the target without touching the wall or wobbling?")


if __name__ == "__main__":
    robot = Robot()
    try:
        wait("Prop the robot up so the wheels are OFF the ground.")
        test1_servos.check(robot)
        torture(robot)
    finally:
        robot.stop()
        summary()
