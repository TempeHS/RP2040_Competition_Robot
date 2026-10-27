"""Robot hardware. Speeds are -100..100, distances mm, gyro deg/s clockwise."""

from machine import I2C, Pin, PWM

import config
from servo import Servo
from vl53l0x import VL53L0X
from ssd1306 import SSD1306
from veml6040 import VEML6040
from lsm6ds3 import LSM6DS3


def _pulse(stop_us, speed, reversed_):
    speed = max(-100, min(100, speed))
    if reversed_:
        speed = -speed
    if speed == 0:
        return stop_us
    offset = (
        config.SERVO_DEADBAND_US
        + abs(speed) * (config.SERVO_RANGE_US - config.SERVO_DEADBAND_US) / 100
    )
    return stop_us + offset if speed > 0 else stop_us - offset


class Robot:
    """Servos start now; each sensor starts on first use, so a test only needs its own parts."""

    def __init__(self):
        self.left = Servo(
            PWM(Pin(config.LEFT_SERVO_PIN)), dead_zone_us=config.LEFT_STOP_US
        )
        self.right = Servo(
            PWM(Pin(config.RIGHT_SERVO_PIN)), dead_zone_us=config.RIGHT_STOP_US
        )
        self.stop()
        self.buses = [
            I2C(
                0,
                sda=Pin(config.I2C0_PINS[0]),
                scl=Pin(config.I2C0_PINS[1]),
                freq=config.I2C_FREQ,
            ),
            I2C(
                1,
                sda=Pin(config.I2C1_PINS[0]),
                scl=Pin(config.I2C1_PINS[1]),
                freq=config.I2C_FREQ,
            ),
        ]
        self._devices = {}

    def _device(self, name, cls, bus):
        if name not in self._devices:
            self._devices[name] = cls(self.buses[bus])
        return self._devices[name]

    def drive(self, left, right):
        self.left.set_duty(_pulse(config.LEFT_STOP_US, left, config.LEFT_REVERSED))
        self.right.set_duty(_pulse(config.RIGHT_STOP_US, right, config.RIGHT_REVERSED))

    def stop(self):
        self.left.stop()
        self.right.stop()

    def front_mm(self):
        return self._device("front", VL53L0X, config.FRONT_TOF_BUS).read()

    def side_mm(self):
        return self._device("side", VL53L0X, config.SIDE_TOF_BUS).read()

    def gyro_dps(self):
        return config.GYRO_SIGN * self._device("gyro", LSM6DS3, config.GYRO_BUS).read()

    def colour(self):
        """Raw (red, green, blue, white) counts."""
        return self._device("colour", VEML6040, config.COLOUR_BUS).read()

    def show(self, *lines):
        """Up to 6 lines of 8 characters (4 or fewer get wider spacing)."""
        oled = self._device("oled", SSD1306, config.OLED_BUS)
        pitch = 12 if len(lines) <= 4 else 8
        oled.fill(0)
        for row, line in enumerate(lines[:6]):
            oled.text(str(line)[:8], 0, row * pitch)
        oled.show()
