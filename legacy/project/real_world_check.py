"""Run one bench check on the robot, not in the simulator.

Stop any running main first, then run this file from the MicroPython editor.
Keep the robot still during startup gyro calibration.

CHECK choices:
    sensors: 20 raw front/side/colour/gyro samples; motors stay braked.
    gyro: rotate the robot once by a measured angle during a 10-second window.
    wheel: one 0.25-second pulse at config.BASE_SPEED; choose WHEEL below.
    speed_change: compare cached speeds with PWM register readings before and
        after set_motor_speeds(), then after drive() reapplies the same speeds.

For either motion check, raise both wheels clear of the bench, keep hands away,
and explicitly set ALLOW_MOTION = True. Keep the power switch within reach.
Speed-change pulses use config.BASE_SPEED then config.MIN_APPROACH_SPEED.
No tuning values or pass/fail limits are supplied by this diagnostic.
"""

from time import ticks_ms, ticks_diff

import aidriver
import config
from aidriver import AIDriver, hold_state

CHECK = "sensors"
ALLOW_MOTION = False
WHEEL = "right"


def check_sensors(robot):
    print("sample,front_mm,side_mm,red,green,blue,clear,gyro_dps")
    for sample in range(20):
        front = robot.read_distance()
        side = robot.read_distance_2()
        red, green, blue, clear = robot.read_color()
        gyro = robot.read_gyro_z_dps()
        print(sample + 1, front, side, red, green, blue, clear, round(gyro, 3), sep=",")
        hold_state(0.5)


def check_gyro(robot):
    if not robot.has_gyro:
        print("Gyro missing; angle check skipped.")
        return
    print("Rotate by hand through one measured angle now; window is 10 seconds.")
    print("elapsed_ms,gyro_dps,integrated_deg")
    previous_rate = robot.read_gyro_z_dps()
    started = ticks_ms()
    previous_time = started
    last_report = started
    angle = 0.0
    while ticks_diff(previous_time, started) < 10000:
        hold_state(0.02)
        rate = robot.read_gyro_z_dps()
        now = ticks_ms()
        angle += (previous_rate + rate) * 0.5 * ticks_diff(now, previous_time) / 1000
        previous_rate = rate
        previous_time = now
        if ticks_diff(now, last_report) >= 500:
            print(ticks_diff(now, started), round(rate, 3), round(angle, 2), sep=",")
            last_report = now
    print("Integrated angle (degrees):", round(angle, 2))
    print("Record your ruler/protractor angle and turn direction separately.")


def check_wheel(robot):
    speed = config.BASE_SPEED
    speeds = {"right": (speed, 0), "left": (0, speed), "both": (speed, speed)}
    right, left = speeds[WHEEL]
    print("Requested right/left PWM:", right, left, "; pulse: 0.25 seconds")
    try:
        robot.drive(right, left)
        hold_state(0.25)
    finally:
        robot.brake()
    print("Record which wheel moved and whether it moved forward or backward.")


def motor_snapshot(robot):
    """Read cached settings and PWM registers, not physical wheel speed."""
    return robot.get_motor_speeds(), (
        robot.motor_right._pin_enable.duty_u16(),
        robot.motor_left._pin_enable.duty_u16(),
    )


def check_speed_change(robot):
    initial = config.BASE_SPEED
    changed = config.MIN_APPROACH_SPEED
    print("Requested PWM:", initial, "then", changed, "; three 0.25-second phases")
    try:
        robot.drive(initial, initial)
        hold_state(0.25)
        before = motor_snapshot(robot)
        robot.set_motor_speeds(changed, changed)
        hold_state(0.25)
        after_set = motor_snapshot(robot)
        robot.drive(changed, changed)
        hold_state(0.25)
        after_drive = motor_snapshot(robot)
    finally:
        robot.brake()
    print("stage: cached (right,left), PWM register (right,left)")
    print("Initial drive:", before)
    print("After set_motor_speeds:", after_set)
    print("After drive reapplies:", after_drive)
    print("PWM registers are controller outputs, not wheel RPM.")


def main():
    checks = {
        "sensors": check_sensors,
        "gyro": check_gyro,
        "wheel": check_wheel,
        "speed_change": check_speed_change,
    }
    if CHECK not in checks:
        raise ValueError("Unknown CHECK: " + str(CHECK))
    if CHECK == "wheel" and WHEEL not in ("right", "left", "both"):
        raise ValueError("WHEEL must be right, left or both")
    motion = CHECK in ("wheel", "speed_change")
    if motion and ALLOW_MOTION is not True:
        print("Motion disabled. Raise the wheels, then explicitly enable ALLOW_MOTION.")
        return
    print("Check:", CHECK, "| distance backend:", config.DISTANCE_SENSOR)
    print("Keep still during startup calibration. Ctrl-C interrupts the check.")
    aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
    robot = AIDriver(config.WALL_SIDE, distance_sensor=config.DISTANCE_SENSOR)
    try:
        robot.brake()
        print("Gyro present:", robot.has_gyro, "| Colour present:", robot.has_color)
        if motion:
            print("Wheels raised; keep hands clear. Starting in 3 seconds.")
            for remaining in (3, 2, 1):
                print(remaining)
                hold_state(1)
        checks[CHECK](robot)
    finally:
        robot.brake()
    print("Check finished. Motors braked.")


if __name__ == "__main__":
    main()
