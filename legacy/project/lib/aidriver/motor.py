"""L298N single-motor driver used by AIDriver for each wheel."""

from machine import Pin, PWM

from . import _d


class L298N:
    """
    L298N Motor Driver class for controlling a single motor
    """

    # Direction constants
    FORWARD = 0
    BACKWARD = 1
    STOP = -1

    def __init__(self, pin_enable, pin_direction, pin_brake):
        """
        Initialize L298N motor controller

        Args:
            pin_enable: PWM pin for speed control (0-65535)
            pin_direction: Digital pin for direction control
            pin_brake: Digital pin for brake control
        """
        self._pin_enable = PWM(Pin(pin_enable))
        self._pin_enable.freq(1000)  # 1kHz PWM frequency
        self._pin_direction = Pin(pin_direction, Pin.OUT)
        self._pin_brake = Pin(pin_brake, Pin.OUT)

        self._pwm_val = 65535  # Max speed (16-bit PWM)
        self._is_moving = False
        self._can_move = True
        self._direction = self.STOP

        # Initialize pins to stopped state
        self.stop()

    def set_speed(self, speed):
        """
        Set motor speed

        Args:
            speed: Speed value 0-255 (Arduino compatible) or 0-65535 (full RP2040 range)
        """
        # Convert Arduino 0-255 range to RP2040 0-65535 range if needed
        if speed <= 255:
            self._pwm_val = int(speed * 257)  # 257 = 65535/255
        else:
            self._pwm_val = min(speed, 65535)

        _d("L298N set_speed: raw=", speed, "pwm=", self._pwm_val)

    def get_speed(self):
        """
        Get current motor speed

        Returns:
            Current speed (0 if stopped, otherwise the set PWM value)
        """
        return self._pwm_val if self._is_moving else 0

    def forward(self):
        """Move motor forward"""
        self._pin_brake.off()
        self._pin_direction.on()
        self._pin_enable.duty_u16(self._pwm_val)
        self._direction = self.FORWARD
        self._is_moving = True
        _d("L298N forward: pwm=", self._pwm_val)

    def backward(self):
        """Move motor backward"""
        self._pin_brake.off()
        self._pin_direction.off()
        self._pin_enable.duty_u16(self._pwm_val)
        self._direction = self.BACKWARD
        self._is_moving = True
        _d("L298N backward: pwm=", self._pwm_val)

    def stop(self):
        """Stop motor with brake"""
        self._pin_direction.on()
        self._pin_brake.on()
        self._pin_enable.duty_u16(65535)  # Short motor terminals for brake
        self._direction = self.STOP
        self._is_moving = False
        _d("L298N stop (brake engaged)")

    def is_moving(self):
        """Check if motor is currently moving"""
        return self._is_moving

    def get_direction(self):
        """Get current direction"""
        return self._direction
