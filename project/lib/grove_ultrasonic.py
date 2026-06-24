"""
grove_ultrasonic.py
MicroPython driver for the Seeed Grove Ultrasonic Ranger (single-pin SIG protocol).

Ported from Seeed's Ultrasonic.cpp (MIT Licence, seeed technology inc., 2012).

Protocol difference from HC-SR04
---------------------------------
HC-SR04 uses two pins: a dedicated TRIG output and a dedicated ECHO input.
The Grove Ultrasonic Ranger uses a single SIG pin that is switched between
OUTPUT (to send the trigger pulse) and INPUT (to receive the echo) each read.

Wiring
------
    Grove SIG  →  any GP pin (pass as sig_pin to constructor)
    Grove VCC  →  3.3 V or 5 V
    Grove GND  →  GND

Usage
-----
    from grove_ultrasonic import GroveUltrasonic

    sensor = GroveUltrasonic(sig_pin=16)
    distance_mm = sensor.read_distance_mm()   # returns int mm, or -1 on error

Drop-in replacement for UltrasonicSensor in aidriver.py
--------------------------------------------------------
Both classes expose the same read_distance_mm() → int interface so a
GroveUltrasonic instance can be assigned to AIDriver.ultrasonic_1 or
AIDriver.ultrasonic_2 without any other code changes:

    from grove_ultrasonic import GroveUltrasonic
    robot = AIDriver("left")
    robot.ultrasonic_2 = GroveUltrasonic(sig_pin=4)
"""

from machine import Pin, time_pulse_us
from time import sleep_us

# Maximum valid range of the Grove Ultrasonic Ranger per datasheet: 400 cm.
_MAX_DISTANCE_MM = 4000

# Compatibility range used by common HC-SR04 libraries when saturating timeouts.
_MAX_RANGE_CM_FALLBACK = 500

# Echo timeout: 38 000 µs = just over the 400 cm max-range round-trip
# (2 × 4000 mm / 0.343 mm/µs ≈ 23 324 µs).  Using 38 000 gives headroom
# without blocking too long on open-space reads.
_TIMEOUT_US = 38_000


class GroveUltrasonic:
    """Seeed Grove Ultrasonic Ranger — single-pin SIG protocol.

    Args:
        sig_pin: GPIO pin number connected to the Grove SIG line.
        max_distance_mm: Readings above this value are discarded (default 4000).
        timeout_us: Echo wait timeout in microseconds (default 38 000).
        timeout_strategy:
            "strict"   -> return -1 on timeout/error (default, safest for PID logic)
            "saturate" -> convert timeout/error to a large finite range reading
                          instead of returning -1.
    """

    def __init__(
        self,
        sig_pin,
        max_distance_mm=_MAX_DISTANCE_MM,
        timeout_us=_TIMEOUT_US,
        timeout_strategy="strict",
    ):
        self.max_distance_mm = max_distance_mm
        self.timeout_us = timeout_us
        self.timeout_strategy = str(timeout_strategy).lower()
        if self.timeout_strategy not in ("strict", "saturate"):
            self.timeout_strategy = "strict"

        # Pre-create the Pin object once so mode switches during _duration_us()
        # use only fast .init() calls — no Python object allocation on the hot path.
        # Start as input so the line is not driven until a measurement is requested.
        self._pin = Pin(sig_pin, Pin.IN, Pin.PULL_DOWN)

    def _fallback_pulse_us(self):
        """Return a large pulse width used when saturating timeout/error reads."""
        return int(_MAX_RANGE_CM_FALLBACK * 29.1)

    def _normalize_pulse_us(self, pulse_time):
        """Normalize low-level pulse result according to timeout strategy.

        time_pulse_us can return:
            >= 0  : valid pulse width in microseconds
            -1/-2 : timeout or invalid edge state
        """
        if pulse_time >= 0:
            return pulse_time
        if self.timeout_strategy == "saturate":
            return self._fallback_pulse_us()
        return -1

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _duration_us(self):
        """Send trigger pulse and return echo duration in microseconds.

        Protocol (corrected against Grove datasheet — trigger is 10 µs, not 5 µs):
            Switch to OUTPUT → LOW 5 µs → HIGH 10 µs → LOW →
            Switch to INPUT (pull-down) → time_pulse_us(HIGH, timeout)

        The pull-down when switching to input prevents residual pin capacitance
        from holding the line HIGH after the trigger ends, which would cause
        time_pulse_us to return -2 (already high) before the real echo arrives.

        Returns:
            Echo duration in µs, or -1 on timeout / error.
        """
        pin = self._pin

        # --- Trigger pulse ---
        pin.init(Pin.OUT)
        pin.off()
        sleep_us(5)  # settle LOW before trigger
        pin.on()
        sleep_us(10)  # 10 µs HIGH — Grove datasheet minimum
        pin.off()

        # --- Switch to input with pull-down immediately after trigger LOW ---
        # pull-down discharges pin capacitance so we don't mis-read a stale HIGH.
        pin.init(Pin.IN, Pin.PULL_DOWN)

        try:
            duration = time_pulse_us(pin, 1, self.timeout_us)
        except OSError as exc:
            # Some ports raise ETIMEDOUT instead of returning -1/-2.
            # Keep the same policy path as negative return codes.
            if exc.args and exc.args[0] == 110 and self.timeout_strategy == "saturate":
                return self._fallback_pulse_us()
            return -1

        return self._normalize_pulse_us(duration)

    # ------------------------------------------------------------------
    # Public API — matches UltrasonicSensor interface in aidriver.py
    # ------------------------------------------------------------------

    def read_distance_mm(self):
        """Measure distance and return it in millimetres.

        Equivalent to Ultrasonic::MeasureInMillimeters() scaled to integers.

        Formula (integer arithmetic, avoids floating point):
            distance_mm = duration_µs * 5 // 29
            (derived from: mm = µs × 0.343 mm/µs ÷ 2,
             approximated as × 5 ÷ 29  — same as the C++ source)

        Returns:
            int: Distance in mm (20–4000), or -1 if out of range or error.
        """
        duration = self._duration_us()
        if duration < 0:
            return -1

        # Ported directly from MeasureInMillimeters():
        #   RangeInMillimeters = duration * (10 / 2) / 29
        # In C++ integer division: (10/2) = 5, so: duration * 5 / 29
        distance_mm = duration * 5 // 29

        if 20 <= distance_mm <= self.max_distance_mm:
            return int(distance_mm)
        return -1

    def read_distance_cm(self):
        """Return distance in centimetres, or -1 on error.

        Equivalent to Ultrasonic::MeasureInCentimeters().
        """
        duration = self._duration_us()
        if duration < 0:
            return -1
        distance_cm = duration // 29 // 2
        if 2 <= distance_cm <= self.max_distance_mm // 10:
            return int(distance_cm)
        return -1

    def read_distance_inches(self):
        """Return distance in inches, or -1 on error.

        Equivalent to Ultrasonic::MeasureInInches().
        """
        duration = self._duration_us()
        if duration < 0:
            return -1
        distance_in = duration // 74 // 2
        if 1 <= distance_in <= self.max_distance_mm // 25:
            return int(distance_in)
        return -1
