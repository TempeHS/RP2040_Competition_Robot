"""Legacy HC-SR04 ultrasonic sensor fallback used when GroveUltrasonic is
unavailable or ``ultrasonic_mode="hcsr04"`` is forced.
"""

from machine import Pin, time_pulse_us
from time import sleep_us, sleep_ms

from . import _log_event

# Ultrasonic sensor inline warning state
_ultrasonic_fail_count = 0
_ultrasonic_warned = False  # Have we printed the initial warning?


def _ultrasonic_warn_inline(message):
    """Print a warning once, then add dots for each subsequent failure.

    This approach works in all terminals including Arduino Lab which
    doesn't support carriage return for in-place updates.
    """
    global _ultrasonic_fail_count, _ultrasonic_warned

    _ultrasonic_fail_count += 1

    # Print the initial warning (no newline)
    if not _ultrasonic_warned:
        # Use separate print to ensure message appears
        print()  # newline first to separate from previous output
        print("[AIDriver] " + message, end="")
        _ultrasonic_warned = True
    else:
        # Just add a dot for each subsequent failure
        print(".", end="")


def _ultrasonic_warn_clear():
    """End the warning line and reset the failure counter."""
    global _ultrasonic_fail_count, _ultrasonic_warned

    if _ultrasonic_warned:
        # End the line with newline
        print()  # newline

    _ultrasonic_fail_count = 0
    _ultrasonic_warned = False


class UltrasonicSensor:
    """
    HC-SR04 Ultrasonic Sensor class for distance measurement.
    """

    def __init__(self, trig_pin, echo_pin):
        """
        Initialize ultrasonic sensor.

        Args:
            trig_pin: GPIO pin for trigger signal.
            echo_pin: GPIO pin for echo signal.
        """
        self.trig_pin = Pin(trig_pin, Pin.OUT)
        self.echo_pin = Pin(echo_pin, Pin.IN)
        self.trig_pin.off()

        # Sensor configuration
        self.max_distance_mm = 2000  # Max sensor range in mm
        # Timeout: 30,000μs allows ~2x longer echo wait (500 * 2 * 30)
        self.timeout_us = 30000

        # Set only for a GENUINE wiring fault (stuck pin / invalid echo state),
        # never for a plain no-echo timeout — that's the expected result when
        # nothing is in range, not a sign the sensor is unplugged. Cleared on
        # every read that isn't a wiring fault. See read_distance()/2() in
        # AIDriver, which use this (not the -1 return value) to decide whether
        # front_ok/side_ok should report an error.
        self.last_fault = None

    def read_distance_mm(self):
        """
        Read distance from the sensor and return it in millimeters.

        Returns:
            int: Distance in millimeters, or -1 if the reading is out of range or fails.
        """
        # Pre-check: ensure echo pin is LOW (not stuck high from wiring issue)
        if self.echo_pin.value() != 0:
            self.last_fault = "stuck_high"
            _ultrasonic_warn_inline("Echo pin stuck HIGH – check wiring")
            if _ultrasonic_fail_count <= 3:
                _log_event("ultrasonic echo pin stuck high")
            return -1

        # Send a 10μs trigger pulse with 5μs stabilization
        self.trig_pin.off()
        sleep_us(5)
        self.trig_pin.on()
        sleep_us(10)
        self.trig_pin.off()

        try:
            # Measure the duration of the echo pulse (with retry on failure)
            duration = time_pulse_us(self.echo_pin, 1, self.timeout_us)

            # time_pulse_us returns -1 on timeout and -2 on invalid state
            if duration < 0:
                # Retry once after brief delay to handle transient issues
                sleep_ms(20)  # Let sensor settle
                self.trig_pin.off()
                sleep_us(5)
                self.trig_pin.on()
                sleep_us(10)
                self.trig_pin.off()
                duration = time_pulse_us(self.echo_pin, 1, self.timeout_us)

                # If still failing after retry, report error
                if duration < 0:
                    if duration == -1:
                        # Timeout means no echo returned in time. This is expected
                        # when the target is too far away or open space is ahead.
                        self.last_fault = None
                        _ultrasonic_warn_inline("No echo (out of range/open space)")
                        if _ultrasonic_fail_count <= 3:
                            _log_event("ultrasonic no echo (out of range)")
                    else:
                        self.last_fault = "invalid_echo_state"
                        _ultrasonic_warn_inline("Sensor error – check wiring")
                        # Only log to eventlog on first few failures to avoid log spam
                        if _ultrasonic_fail_count <= 3:
                            _log_event("ultrasonic invalid echo state")
                    return -1

            # Calculate distance in mm using integer math (avoids floating point)
            # Sound speed: 343.2 m/s = 0.3432 mm/μs
            # distance = (time * speed) / 2, so: time * 100 // 582
            distance_mm = duration * 100 // 582

            # Check if the reading is within the valid range (20mm to 2000mm)
            if 20 <= distance_mm <= self.max_distance_mm:
                # Clear any inline warning since we got a good reading
                self.last_fault = None
                _ultrasonic_warn_clear()
                result = int(distance_mm)

                # Log AFTER timing-sensitive measurement is complete
                _log_event("distance reading: {} mm".format(result))
                return result

            # Out of range – likely too close, too far, or pointing into open space
            self.last_fault = None
            _ultrasonic_warn_inline("Out of range ({}mm)".format(int(distance_mm)))
            # Only log to eventlog on first few failures to avoid log spam
            if _ultrasonic_fail_count <= 3:
                _log_event("ultrasonic out of range: {} mm".format(int(distance_mm)))
            return -1

        except OSError as exc:
            # This can occur if there's an issue with time_pulse_us or pin configuration
            _ultrasonic_warn_inline("OSError – check pins & power")
            # Only log to eventlog on first few failures to avoid log spam
            if _ultrasonic_fail_count <= 3:
                _log_event("ultrasonic OSError: {}".format(exc))
            return -1
