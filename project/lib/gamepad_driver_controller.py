"""HM-10 BLE controller bridge for AIDriver robots."""

from time import sleep_ms, ticks_diff, ticks_ms

from aidriver import AIDriver
from hm10_controller import HM10Controller


class HM10AIDriverController:
    """Wraps an :class:`HM10Controller` to drive an :class:`AIDriver` robot."""

    def __init__(
        self,
        hm10: HM10Controller,
        driver: AIDriver,
        telemetry_enabled=True,
        telemetry_period_ms=200,
    ):
        self.hm10 = hm10
        self.driver = driver
        self.telemetry_enabled = telemetry_enabled
        self.telemetry_period_ms = telemetry_period_ms
        self._last_telemetry_read_ms = 0
        self._braked = True

    def update(self):
        """Poll BLE commands, drive the motors, and emit telemetry."""

        command_updated = self.hm10.poll()

        if self.hm10.is_stale() or self.hm10.is_brake_requested():
            if not self._braked:
                self.driver.brake()
                self._braked = True
        else:
            self._apply_motor_commands(self.hm10.left_speed, self.hm10.right_speed)
            self._braked = False

        self._maybe_send_telemetry()
        self.driver.service()

        return command_updated

    def _apply_motor_commands(self, left_speed, right_speed):
        left_speed = self._clamp_speed(left_speed)
        right_speed = self._clamp_speed(right_speed)

        self._drive_wheel(self.driver.motor_left, left_speed, is_right=False)
        self._drive_wheel(self.driver.motor_right, right_speed, is_right=True)

    @staticmethod
    def _clamp_speed(value):
        if value > 255:
            return 255
        if value < -255:
            return -255
        return value

    def _drive_wheel(self, motor, speed, *, is_right):
        if speed == 0:
            motor.stop()
            return

        motor.set_speed(abs(speed))
        if speed > 0:
            if is_right:
                motor.backward()
            else:
                motor.forward()
        else:
            if is_right:
                motor.forward()
            else:
                motor.backward()

    def _maybe_send_telemetry(self):
        if not self.telemetry_enabled:
            return

        now = ticks_ms()
        if ticks_diff(now, self._last_telemetry_read_ms) < self.telemetry_period_ms:
            return

        distance = self.driver.read_distance()
        self._last_telemetry_read_ms = now

        if distance < 0:
            return

        self.hm10.send_ultrasonic(distance)


if __name__ == "__main__":
    hm10 = HM10Controller()
    robot = AIDriver("right")  # wall_side required; direction unused in gamepad mode
    controller = HM10AIDriverController(hm10, robot)

    print("HM-10 AIDriver controller active.")
    while True:
        controller.update()
        sleep_ms(40)
