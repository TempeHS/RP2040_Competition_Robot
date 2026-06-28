"""
AIDriver MicroPython Library for RP2040
A unified 2-wheel robot library with ultrasonic sensor

Converted from Arduino C++ library by Ben Jones @ Tempe High School
Original licenses maintained: GNU GPL for code, Creative Commons for content

Dependencies: machine, time modules (built into MicroPython)
"""

from machine import Pin, PWM, time_pulse_us
from time import sleep_us, sleep_ms, sleep as _sleep, ticks_ms, ticks_diff

try:
    from machine import SoftI2C
except Exception:
    SoftI2C = None

try:
    from grove_ultrasonic import GroveUltrasonic
except Exception:
    GroveUltrasonic = None

try:
    from lsm6ds3 import LSM6DS3, _recover_i2c_bus
except Exception:
    LSM6DS3 = None
    _recover_i2c_bus = None

try:
    from tcs34725 import TCS34725
except Exception:
    TCS34725 = None

try:
    from ssd1306 import SSD1306_I2C
except Exception:
    SSD1306_I2C = None

try:
    import eventlog
except Exception:
    eventlog = None


def _speed_band(speed_value):
    """Return a human label for a motor speed using agreed classroom bands."""
    if speed_value <= 80:
        return "stopped"
    if speed_value <= 120:
        return "very slow"
    if speed_value <= 180:
        return "slow"
    if speed_value <= 220:
        return "normal"
    return "very fast"


def _describe_drive(direction, right_speed, left_speed):
    """Build an event-log sentence for forward/backward movement commands."""
    max_speed = max(right_speed, left_speed)
    if max_speed <= 80:
        return (
            f"{direction} requested with R={right_speed}, L={left_speed} – "
            "speeds are in the stopped range so the robot may not move"
        )

    band = _speed_band(max_speed)
    message = f"{direction} at {band} speed" f" (R={right_speed}, L={left_speed})"

    speed_diff = right_speed - left_speed
    if abs(speed_diff) > 20:
        arc_direction = "right" if speed_diff > 0 else "left"
        message += f"; expect an arc toward the {arc_direction}"

    return message


def _describe_rotation(direction, turn_speed):
    """Build an event-log sentence for rotate commands."""
    if turn_speed <= 80:
        return (
            f"Rotate {direction} requested with speed {turn_speed} – "
            "speed is in the stopped range so the robot may not turn"
        )

    band = _speed_band(turn_speed)
    return f"Rotate {direction} on the spot at {band} speed ({turn_speed})"


# Global debug flag for AIDriver library
DEBUG_AIDRIVER = False


# Onboard status LED – use GPIO 25 (Raspberry Pi Pico onboard LED).
# GPIO 13 cannot be used here because it is the left-motor direction pin.
# Using PWM for heartbeat - runs entirely in hardware with zero CPU impact.
_STATUS_LED_PIN = 25
_STATUS_LED_PWM = None  # Initialized lazily in AIDriver.__init__()


# Internal state for non-blocking heartbeat timing (legacy, kept for compatibility)
_last_heartbeat_ms = 0


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
    _ultrasonic_last_warn_ms = 0


def _start_pwm_heartbeat():
    """Start PWM-based heartbeat on the onboard LED.

    Uses hardware PWM at ~1Hz with 50% duty cycle - runs entirely in
    hardware with zero CPU interrupts or blocking.
    """
    global _STATUS_LED_PWM
    if _STATUS_LED_PWM is not None:
        return  # Already running

    try:
        _STATUS_LED_PWM = PWM(Pin(_STATUS_LED_PIN))
        _STATUS_LED_PWM.freq(8)  # RP2040 minimum PWM freq is ~8Hz
        _STATUS_LED_PWM.duty_u16(32768)  # 50% duty cycle
        _d("PWM heartbeat started (8Hz, hardware-driven)")
    except Exception as exc:
        _d("Failed to start PWM heartbeat:", exc)
        _STATUS_LED_PWM = None


def heartbeat(period_ms=1000):
    """Adjust the PWM heartbeat frequency.

    With PWM-based heartbeat, this adjusts the blink rate.
    The LED blinks automatically in hardware - no need to call this
    from a loop. Use it only if you want to change the blink speed.

    Args:
        period_ms: Blink period in milliseconds (default 1000 = 1Hz)
    """
    if _STATUS_LED_PWM is None:
        return

    try:
        # Convert period to frequency (Hz)
        freq = max(1, 1000 // period_ms)
        _STATUS_LED_PWM.freq(freq)
    except Exception:
        pass


def _explain_error(exc):
    """Internal helper to add student-friendly hints for common exceptions.

    This is automatically used around key AIDriver methods when DEBUG_AIDRIVER
    is True. It never changes the actual exception behaviour; it only prints
    extra guidance before the normal traceback.
    """

    if not DEBUG_AIDRIVER:
        return

    msg = str(exc)
    print("[AIDriver] Extra help for error:")

    # NameError hints – usually missing or mis-typed my_robot / AIDriver
    if isinstance(exc, NameError):
        if "my_robot" in msg:
            print(" - You are using 'my_robot' but have not created it.")
            print("   Make sure you have 'my_robot = AIDriver(\"left\")' near the top.")
            print('   Use "right" if your wall is on the right side.')
        elif "AIDriver" in msg:
            print(" - Python cannot find 'AIDriver'.")
            print("   Check you wrote 'from aidriver import AIDriver' exactly.")
        else:
            print(" - A name in your code does not exist.")
            print("   Check for spelling differences from the example code.")

    # AttributeError hints – often wrong method name on AIDriver
    elif isinstance(exc, AttributeError):
        if "AIDriver" in msg or "object has no attribute" in msg:
            print(" - You likely called a method that is not in AIDriver.")
            print("   Valid AIDriver methods include:")
            print("     drive_forward, drive_backward, rotate_left,")
            print("     rotate_right, brake, read_distance")
            print("   Compare your code with the challenge notes.")

    # ImportError hints – aidriver not found
    elif isinstance(exc, ImportError):
        if "aidriver" in msg:
            print(" - Python cannot import 'aidriver'.")
            print("   Ensure 'aidriver.py' is in the 'lib/' folder ")
            print("   in the Arduino MicroPython Lab workspace.")

    # ValueError hints – often wrong speed ranges, etc.
    elif isinstance(exc, ValueError):
        print(" - A value passed into a function is not acceptable.")
        print("   Check speed values are between 0 and 255,")
        print("   and that distances or times are sensible.")

    else:
        print(" -", type(exc).__name__, msg)

    print("[AIDriver] See 'Common_Errors.md' for more examples.")


def _d(*args):
    """Internal debug logger for the AIDriver library.

    When DEBUG_AIDRIVER is True, messages are printed with an [AIDriver] prefix.
    This is intended for teachers or advanced students diagnosing issues.
    """
    if DEBUG_AIDRIVER:
        print("[AIDriver]", *args)


def hold_state(seconds):
    """Pause the robot while recording the pause in the event log.

    This is a classroom-friendly helper that replaces raw ``sleep(seconds)``.

    Example usage in ``main.py``::

        from aidriver import AIDriver, hold_state

        my_robot = AIDriver("left")  # or AIDriver("right")

        my_robot.drive_forward(200, 200)
        hold_state(1)  # robot keeps doing the same thing for 1 second
        my_robot.brake()

    The helper uses the built-in time.sleep under the hood, so timing
    behaviour is the same as calling ``sleep(seconds)`` directly.
    """

    try:
        seconds_float = float(seconds)
    except (TypeError, ValueError):
        # Fall back to 0 seconds if a bad value is passed; let MicroPython
        # handle any deeper issues rather than raising here.
        seconds_float = 0

    if eventlog is not None:
        try:
            if seconds_float == 1:
                msg = "Robot holding state for 1 second"
            else:
                msg = "Robot holding state for {:.2f} second(s)".format(seconds_float)
            eventlog.log_event(msg)
        except Exception:
            # Never let logging break student programs.
            pass

    _d("hold_state:", seconds_float, "second(s)")
    _sleep(seconds_float)


def _led_heartbeat_ok():
    """Legacy function - heartbeat is now automatic via PWM.

    The onboard LED now blinks automatically using hardware PWM when
    AIDriver is instantiated. This function is kept for compatibility
    but does nothing.
    """
    pass


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

    def read_distance_mm(self):
        """
        Read distance from the sensor and return it in millimeters.

        Returns:
            int: Distance in millimeters, or -1 if the reading is out of range or fails.
        """
        # Pre-check: ensure echo pin is LOW (not stuck high from wiring issue)
        if self.echo_pin.value() != 0:
            _ultrasonic_warn_inline("Echo pin stuck HIGH – check wiring")
            if _ultrasonic_fail_count <= 3 and eventlog is not None:
                try:
                    eventlog.log_event("ultrasonic echo pin stuck high")
                except Exception:
                    pass
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
                        _ultrasonic_warn_inline("No echo (out of range/open space)")
                        if _ultrasonic_fail_count <= 3 and eventlog is not None:
                            try:
                                eventlog.log_event("ultrasonic no echo (out of range)")
                            except Exception:
                                pass
                    else:
                        _ultrasonic_warn_inline("Sensor error – check wiring")
                        # Only log to eventlog on first few failures to avoid log spam
                        if _ultrasonic_fail_count <= 3 and eventlog is not None:
                            try:
                                eventlog.log_event("ultrasonic invalid echo state")
                            except Exception:
                                pass
                    return -1

            # Calculate distance in mm using integer math (avoids floating point)
            # Sound speed: 343.2 m/s = 0.3432 mm/μs
            # distance = (time * speed) / 2, so: time * 100 // 582
            distance_mm = duration * 100 // 582

            # Check if the reading is within the valid range (20mm to 2000mm)
            if 20 <= distance_mm <= self.max_distance_mm:
                # Clear any inline warning since we got a good reading
                _ultrasonic_warn_clear()
                result = int(distance_mm)

                # Log AFTER timing-sensitive measurement is complete
                if eventlog is not None:
                    try:
                        eventlog.log_event("distance reading: {} mm".format(result))
                    except Exception:
                        pass
                return result

            # Out of range – likely too close, too far, or pointing into open space
            _ultrasonic_warn_inline("Out of range ({}mm)".format(int(distance_mm)))
            # Only log to eventlog on first few failures to avoid log spam
            if _ultrasonic_fail_count <= 3 and eventlog is not None:
                try:
                    eventlog.log_event(
                        "ultrasonic out of range: {} mm".format(int(distance_mm))
                    )
                except Exception:
                    pass
            return -1

        except OSError as exc:
            # This can occur if there's an issue with time_pulse_us or pin configuration
            _ultrasonic_warn_inline("OSError – check pins & power")
            # Only log to eventlog on first few failures to avoid log spam
            if _ultrasonic_fail_count <= 3 and eventlog is not None:
                try:
                    eventlog.log_event("ultrasonic OSError: {}".format(exc))
                except Exception:
                    pass
            return -1


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


class AIDriver:
    """
    Unified robot driver class with L298NH motor control and ultrasonic sensors.

    By default, AIDriver uses Grove single-pin ultrasonic sensors via
    GroveUltrasonic when available. The legacy HC-SR04 UltrasonicSensor class
    remains in this file and is used as an automatic fallback.

    The L298NH requires L298N channels to be called simultaneously.
    """

    def __init__(
        self,
        wall_side,  # Required: "left" or "right" — which wall the robot follows
        min_approach_speed=130,  # Floor PWM for the front-approach ramp
        right_speed_pin=3,  # GP3 (PWM capable)
        left_speed_pin=11,  # GP11 (PWM capable)
        right_dir_pin=12,  # GP12
        right_brake_pin=9,  # GP9
        left_dir_pin=13,  # GP13
        left_brake_pin=8,  # GP8
        trig_pin=6,  # GP6 (front sensor)
        echo_pin=7,  # GP7 (front sensor, legacy HC-SR04 fallback)
        trig_pin_2=4,  # GP4 (second sensor)
        echo_pin_2=5,  # GP5 (second sensor, legacy HC-SR04 fallback)
        ultrasonic_mode="auto",  # "auto" (default), "grove", or "hcsr04"
        imu_sda=16,  # GP16 — IMU I2C SDA (SoftI2C)
        imu_scl=17,  # GP17 — IMU I2C SCL (SoftI2C)
        imu_addr=0x6A,  # LSM6DS3 I2C address (0x6A or 0x6B)
        imu_freq=50_000,  # SoftI2C bus frequency (Hz)
        color_sda=16,  # GP16 — colour sensor shares the IMU SoftI2C bus
        color_scl=17,  # GP17 — colour sensor shares the IMU SoftI2C bus
        color_addr=0x29,  # TCS34725 fixed I2C address
        color_int_pin=7,  # GP7 — TCS34725 active-low interrupt line
        color_pause_time=2.0,  # seconds to pause when a marker colour is seen
        display_sda=16,  # GP16 — OLED shares the IMU/colour SoftI2C bus
        display_scl=17,  # GP17 — OLED shares the IMU/colour SoftI2C bus
        display_addr=0x3C,  # SSD1306 I2C address (0x3C or 0x3D)
        display_width=128,  # OLED pixel width
        display_height=64,  # OLED pixel height (use 32 for 128x32 panels)
        display_freq=400_000,  # OLED SoftI2C bus frequency (Hz)
        kit_servo_pin=None,  # GP for the rescue-kit servo (None = not wired yet)
    ):
        """Initialize RP2040 based AIDriver differential drive robot.

        Args:
            wall_side: Which wall to follow — "left" or "right" (default "right").
                       Sets self.wall_sign = 1 for right, -1 for left.
                       Use in PID loops: right_speed = BASE - (wall_sign * steering)
                                         left_speed  = BASE + (wall_sign * steering)
            right_speed_pin: PWM pin for right motor speed (default GP3)
            left_speed_pin: PWM pin for left motor speed (default GP11)
            right_dir_pin: Digital pin for right motor direction (default GP12)
            right_brake_pin: Digital pin for right motor brake (default GP9)
            left_dir_pin: Digital pin for left motor direction (default GP13)
            left_brake_pin: Digital pin for left motor brake (default GP8)
            trig_pin: Ultrasonic sensor 1 SIG pin for Grove mode (default GP6).
                      In legacy HC-SR04 fallback mode this is TRIG pin.
            echo_pin: Ultrasonic sensor 1 ECHO pin for legacy HC-SR04 fallback.
            trig_pin_2: Ultrasonic sensor 2 SIG pin for Grove mode (default GP4).
                        In legacy HC-SR04 fallback mode this is TRIG pin.
            echo_pin_2: Ultrasonic sensor 2 ECHO pin for legacy HC-SR04 fallback.
            ultrasonic_mode: Sensor backend mode:
                "auto"   -> use GroveUltrasonic when available, else HC-SR04 fallback
                "grove"  -> force GroveUltrasonic (raises if unavailable)
                "hcsr04" -> force legacy HC-SR04 UltrasonicSensor
            imu_sda: LSM6DS3 gyro I2C SDA pin (default GP16). The IMU runs on a
                     bit-banged SoftI2C bus that does not clash with the motor or
                     ultrasonic pins, so its position on the chassis is free.
            imu_scl: LSM6DS3 gyro I2C SCL pin (default GP17).
            imu_addr: LSM6DS3 I2C address — 0x6A or 0x6B (default 0x6A).
            imu_freq: SoftI2C bus frequency in Hz (default 50_000).
        """
        # wall_sign: 1 = right wall, -1 = left wall
        # Used in the unified steering formula so direction is always correct.
        self.wall_sign = -1 if str(wall_side).upper() == "LEFT" else 1

        # Floor PWM applied while ramping toward a front wall so the robot keeps
        # creeping instead of stalling below the motor dead zone.
        self.min_approach_speed = min_approach_speed

        # Library-side preflight: log pin config and attempt a quick sensor ping
        _d(
            "Initialising AIDriver with pins:",
            "R_EN=",
            right_speed_pin,
            "L_EN=",
            left_speed_pin,
            "R_DIR=",
            right_dir_pin,
            "R_BRK=",
            right_brake_pin,
            "L_DIR=",
            left_dir_pin,
            "L_BRK=",
            left_brake_pin,
            "SIG_1/TRIG_1=",
            trig_pin,
            "ECHO_1=",
            echo_pin,
            "SIG_2/TRIG_2=",
            trig_pin_2,
            "ECHO_2=",
            echo_pin_2,
        )

        # Initialize motor controllers
        self.motor_right = L298N(right_speed_pin, right_dir_pin, right_brake_pin)
        self.motor_left = L298N(left_speed_pin, left_dir_pin, left_brake_pin)

        # Initialize ultrasonic sensors.
        # Preferred: Grove single-pin driver (SIG). Fallback: legacy HC-SR04.
        mode = str(ultrasonic_mode).strip().lower()
        if mode not in ("auto", "grove", "hcsr04"):
            mode = "auto"

        if mode == "grove" and GroveUltrasonic is None:
            raise ImportError(
                "ultrasonic_mode='grove' requested but grove_ultrasonic module is unavailable"
            )

        use_grove = (mode == "grove") or (
            mode == "auto" and GroveUltrasonic is not None
        )

        if use_grove:
            self.ultrasonic_1 = GroveUltrasonic(sig_pin=trig_pin)
            self.ultrasonic_2 = GroveUltrasonic(sig_pin=trig_pin_2)
            _d("Ultrasonic mode: GroveUltrasonic (single-pin SIG)")
        else:
            self.ultrasonic_1 = UltrasonicSensor(trig_pin, echo_pin)
            self.ultrasonic_2 = UltrasonicSensor(trig_pin_2, echo_pin_2)
            _d("Ultrasonic mode: UltrasonicSensor (legacy HC-SR04 fallback)")

        # Silent hardware sanity ping for sensor 1 (only visible if DEBUG_AIDRIVER is True)
        try:
            d = self.ultrasonic_1.read_distance_mm()
            if d == -1:
                _d(
                    "Ultrasonic 1 preflight: reading -1. Check wiring, aim at object 2–200cm.",
                )
        except Exception as exc:
            _d(
                "Ultrasonic 1 preflight error:",
                type(exc).__name__,
                str(exc),
                "– check SIG_1/TRIG_1 and ECHO_1 wiring plus sensor power.",
            )

        # Silent hardware sanity ping for sensor 2
        try:
            d = self.ultrasonic_2.read_distance_mm()
            if d == -1:
                _d(
                    "Ultrasonic 2 preflight: reading -1. Check wiring, aim at object 2–200cm.",
                )
        except Exception as exc:
            _d(
                "Ultrasonic 2 preflight error:",
                type(exc).__name__,
                str(exc),
                "– check SIG_2/TRIG_2 and ECHO_2 wiring plus sensor power.",
            )

        _d("AIDriver initialized - debug logging active")

        # Δt tracking for the side sensor PID loop.
        # self.dt is updated every call to read_distance_2() and holds the
        # elapsed seconds since the previous call.  Student PID code can
        # divide by self.dt to make gains time-invariant:
        #   side_derivative = (error - side_previous_error) / my_robot.dt
        #   side_integral   += error * my_robot.dt
        # Default 0.05 s matches the hold_state(0.05) used in the challenges.
        self.dt = 0.05
        self._last_side_read_ms = ticks_ms()

        # Rotation ramp state — used by rotate_right/left (ramp-up) and
        # brake() (ramp-down) to produce a trapezoidal speed profile without
        # any change to the public interface.
        self._is_rotating = False
        self._last_rotate_speed = 0
        self._last_rotate_is_right = True

        # ── Gyro (LSM6DS3) for closed-loop turns ──────────────────────────
        # Turns are NO LONGER timed/open-loop. turn_90()/turn_180()/
        # turn_degrees() run a PID loop on the integrated gyro angle so a 90°
        # turn is 90° regardless of battery, friction, or tyre wear.
        #
        # Gain defaults — override per robot after construction, e.g.:
        #     my_robot.turn_Kp = 4.5
        # Output of the PID is a wheel-speed magnitude in the 0–255 range.
        self.turn_Kp = 6.0  # proportional gain (deg-error → speed)
        self.turn_Ki = 0.0  # integral gain (usually 0 for turns)
        self.turn_Kd = 0.4  # derivative gain (damps overshoot)
        self.turn_tolerance = 2.0  # deg — stop when |error| within this band
        self.turn_max_speed = 200  # clamp on turn wheel speed
        self.turn_timeout_ms = 4000  # safety: abort a turn after this long
        self._gyro_bias_dps = 0.0  # measured stationary yaw-rate offset

        self.imu = None
        self.has_gyro = False
        if LSM6DS3 is not None:
            try:
                if _recover_i2c_bus is not None:
                    _recover_i2c_bus(imu_sda, imu_scl)
                self.imu = LSM6DS3(
                    sda=imu_sda,
                    scl=imu_scl,
                    freq=imu_freq,
                    address=imu_addr,
                    use_soft=True,
                    gyro_range=1000,
                    gyro_rate=416,
                )
                self.imu.begin()
                self.has_gyro = True
                _d("IMU OK on GP{}/GP{} @ 0x{:02X}".format(imu_sda, imu_scl, imu_addr))
                self._calibrate_gyro_bias()
            except Exception as exc:
                self.imu = None
                self.has_gyro = False
                _d(
                    "IMU init failed:",
                    type(exc).__name__,
                    str(exc),
                    "– gyro turns unavailable. Check GP{}/GP{} wiring and address.".format(
                        imu_sda, imu_scl
                    ),
                )

        # ── Colour sensor (TCS34725) for ground marker detection ──────────
        # Faces the floor and detects red / green / reflective-silver markers.
        # Shares the gyro's SoftI2C bus (different address) and raises an
        # interrupt on GP7 when it rolls onto a bright marker, so the robot
        # reacts immediately instead of polling.
        #
        # Classification is threshold based so students can TUNE it. Defaults
        # are deliberately permissive; the colour challenge has the student set
        # these per their floor and lighting:
        #   my_robot.color_red_ratio = 0.5
        self.color_pause_time = color_pause_time  # seconds to pause on a marker
        self.color_black_clear = 0  # below this clear value → "black" (no-go); 0 = off
        self.color_min_clear = 0  # below this clear value → "none" (floor)
        self.color_red_ratio = 0.0  # red fraction of R+G+B to call it "red"
        self.color_green_ratio = 0.0  # green fraction of R+G+B to call it "green"
        self.color_silver_clear = 0  # clear above this + balanced RGB → "silver"

        self.color = None
        self.has_color = False
        self._color_flag = False  # set by the INT handler, cleared on read
        self._color_int = None
        if TCS34725 is not None:
            try:
                self.color = TCS34725(
                    sda=color_sda,
                    scl=color_scl,
                    address=color_addr,
                    freq=imu_freq,
                )
                self.color.begin()
                # Fire the interrupt whenever the clear channel leaves the
                # "dark floor" band. low=0 disables the low-side trip; a small
                # high threshold means any bright marker asserts INT.
                self.color.set_persistence(1)
                self.color.set_interrupt_thresholds(0, 100)
                self.color.enable_interrupt(True)
                self.color.clear_interrupt()

                self._color_int = Pin(color_int_pin, Pin.IN, Pin.PULL_UP)
                self._color_int.irq(
                    handler=self._on_color_int,
                    trigger=Pin.IRQ_FALLING,
                )
                self.has_color = True
                _d(
                    "Colour sensor OK on GP{}/GP{} @ 0x{:02X}, INT=GP{}".format(
                        color_sda, color_scl, color_addr, color_int_pin
                    )
                )
            except Exception as exc:
                self.color = None
                self.has_color = False
                _d(
                    "Colour sensor init failed:",
                    type(exc).__name__,
                    str(exc),
                    "– colour detection unavailable. Check GP{}/GP{} wiring.".format(
                        color_sda, color_scl
                    ),
                )

        # ── OLED status display (SSD1306) ─────────────────────────────────
        # Optional 128x64 (or 128x32) OLED on the shared SoftI2C bus. Used to
        # communicate the competition state and running score to handlers and
        # judges. Graceful-degradation: if the panel is not wired the driver is
        # never constructed and every display_* method becomes a silent no-op,
        # so the same program runs with or without the screen attached.
        self._display_lines = ["", "", "", ""]  # last text pushed (any mode)
        self.display = None
        self.has_display = False
        if SSD1306_I2C is not None and SoftI2C is not None:
            try:
                if _recover_i2c_bus is not None:
                    _recover_i2c_bus(display_sda, display_scl)
                _disp_i2c = SoftI2C(
                    sda=Pin(display_sda),
                    scl=Pin(display_scl),
                    freq=display_freq,
                )
                self.display = SSD1306_I2C(
                    display_width,
                    display_height,
                    _disp_i2c,
                    addr=display_addr,
                )
                self.has_display = True
                _d(
                    "OLED OK on GP{}/GP{} @ 0x{:02X} ({}x{})".format(
                        display_sda,
                        display_scl,
                        display_addr,
                        display_width,
                        display_height,
                    )
                )
            except Exception as exc:
                self.display = None
                self.has_display = False
                _d(
                    "OLED init failed:",
                    type(exc).__name__,
                    str(exc),
                    "– status display unavailable. Check GP{}/GP{} @ 0x{:02X}.".format(
                        display_sda, display_scl, display_addr
                    ),
                )

        # ── Rescue-kit deployment servo ───────────────────────────────────
        # Optional servo that drops a survival kit on a HARMED (red) victim
        # tile for the +10 bonus. Hardware is still on the way, so this stays
        # unwired by default (kit_servo_pin=None) and deploy_rescue_kit() is a
        # logged no-op until the pin is supplied. Same graceful pattern as the
        # display so competition code can call it today without breaking.
        self._kit_servo = None
        self.has_kit = False
        self.kit_deploy_count = 0
        if kit_servo_pin is not None:
            try:
                self._kit_servo = PWM(Pin(kit_servo_pin))
                self._kit_servo.freq(50)  # standard hobby-servo frame rate
                self._kit_servo_pin = kit_servo_pin
                self.has_kit = True
                _d("Rescue-kit servo ready on GP{}".format(kit_servo_pin))
            except Exception as exc:
                self._kit_servo = None
                self.has_kit = False
                _d(
                    "Rescue-kit servo init failed:",
                    type(exc).__name__,
                    str(exc),
                    "– kit deployment unavailable. Check GP{}.".format(kit_servo_pin),
                )

        # Start PWM-based heartbeat - runs entirely in hardware
        # with zero CPU interrupts or impact on motor control.
        _start_pwm_heartbeat()

    def read_distance(self):
        """
        Read distance from ultrasonic sensor 1 (front sensor).

        Returns:
            Distance in millimeters, or -1 if invalid reading.
        """
        distance_mm = self.ultrasonic_1.read_distance_mm()
        if distance_mm == -1:
            # Don't print debug here - inline warning handles user feedback
            return -1
        _d("read_distance:", distance_mm, "mm")
        return int(distance_mm)

    def read_distance_2(self):
        """
        Read distance from ultrasonic sensor 2 (second sensor on GP4/GP5).

        Also updates self.dt with the elapsed seconds since the previous call.
        Use this in PID derivative and integral terms to compensate for variable
        loop timing caused by sensor retries or other blocking calls::

            side_derivative = (error - side_previous_error) / my_robot.dt
            side_integral  += error * my_robot.dt

        Returns:
            Distance in millimeters, or -1 if invalid reading.
        """
        # Timestamp BEFORE the hardware read so dt reflects the true loop period
        # regardless of whether the sensor needs its 20 ms retry this iteration.
        now = ticks_ms()
        elapsed = ticks_diff(now, self._last_side_read_ms)
        # Guard against zero (first call) and negative wrap-around.
        self.dt = max(elapsed, 1) / 1000.0
        self._last_side_read_ms = now

        distance_mm = self.ultrasonic_2.read_distance_mm()
        if distance_mm == -1:
            # Don't print debug here - inline warning handles user feedback
            return -1
        _d("read_distance_2:", distance_mm, "mm", "dt:", self.dt, "s")
        return int(distance_mm)

    def brake(self):
        """Stop both motors.

        When called after ``rotate_right`` or ``rotate_left`` this method
        automatically ramps the speed down over ``ROTATE_RAMP_MS`` milliseconds
        before applying the hard stop, eliminating inertia-driven overshoot that
        would otherwise make timed turns inconsistent.
        """
        _d("AIDriver.brake()")
        if self._is_rotating:
            # Controlled ramp-down to absorb rotational inertia.
            speed = self._last_rotate_speed
            is_right = self._last_rotate_is_right
            self._is_rotating = False  # clear before any early return
            steps = max(self.ROTATE_RAMP_MS // 10, 1)
            speed_range = speed - self.MIN_MOTOR_SPEED
            for i in range(steps):
                t = (steps - i - 1) / steps  # 1 → 0
                s = self.MIN_MOTOR_SPEED + int(speed_range * t)
                self.motor_right.set_speed(s)
                self.motor_left.set_speed(s)
                if is_right:
                    self.motor_right.forward()
                    self.motor_left.forward()
                else:
                    self.motor_right.backward()
                    self.motor_left.backward()
                sleep_ms(10)
            _d("AIDriver.brake(): rotation ramp-down complete")
        if eventlog is not None:
            try:
                eventlog.log_event("Brake applied; motors stopping")
            except Exception:
                pass
        try:
            self.motor_right.stop()
            self.motor_left.stop()
        except Exception as exc:
            _explain_error(exc)
            raise

    def service(self):
        """Background housekeeping hook (currently a no-op).

        The onboard LED heartbeat is driven entirely by hardware PWM
        (see ``_start_pwm_heartbeat`` called from ``__init__``), so no
        per-loop work is required to keep it blinking. This method is
        kept as a stable extension point so callers such as the gamepad
        controller can invoke it every loop without needing to know
        whether housekeeping is currently required.
        """
        return

    def drive_forward(self, right_wheel_speed, left_wheel_speed):
        """
        Drive robot forward

        Args:
            right_wheel_speed: Speed for right wheel (0-255)
            left_wheel_speed: Speed for left wheel (0-255)
        """
        _d("AIDriver.drive_forward: R=", right_wheel_speed, "L=", left_wheel_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(
                    _describe_drive(
                        "Drive forward", right_wheel_speed, left_wheel_speed
                    )
                )
            except Exception:
                pass
        try:
            self.motor_right.set_speed(right_wheel_speed)
            self.motor_left.set_speed(left_wheel_speed)
            self.motor_right.backward()
            self.motor_left.forward()
        except Exception as exc:
            _explain_error(exc)
            raise

    def drive_backward(self, right_wheel_speed, left_wheel_speed):
        """
        Drive robot backward

        Args:
            right_wheel_speed: Speed for right wheel (0-255)
            left_wheel_speed: Speed for left wheel (0-255)
        """
        _d("AIDriver.drive_backward: R=", right_wheel_speed, "L=", left_wheel_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(
                    _describe_drive(
                        "Drive backward", right_wheel_speed, left_wheel_speed
                    )
                )
            except Exception:
                pass
        try:
            self.motor_right.set_speed(right_wheel_speed)
            self.motor_left.set_speed(left_wheel_speed)
            self.motor_right.forward()
            self.motor_left.backward()
        except Exception as exc:
            _explain_error(exc)
            raise

    def rotate_right(self, turn_speed):
        """
        Rotate robot right (clockwise)

        Args:
            turn_speed: Speed for rotation (0-255)
        """
        _d("AIDriver.rotate_right: speed=", turn_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(_describe_rotation("right", turn_speed))
            except Exception:
                pass
        try:
            # Ramp up from MIN_MOTOR_SPEED to turn_speed over ROTATE_RAMP_MS.
            # This makes spin-up time deterministic regardless of battery
            # voltage, giving a smooth, repeatable rotation.
            steps = max(self.ROTATE_RAMP_MS // 10, 1)
            speed_range = turn_speed - self.MIN_MOTOR_SPEED
            for i in range(steps):
                t = (i + 1) / steps
                s = self.MIN_MOTOR_SPEED + int(speed_range * t)
                self.motor_right.set_speed(s)
                self.motor_left.set_speed(s)
                self.motor_right.forward()
                self.motor_left.forward()
                sleep_ms(10)
            self.motor_right.set_speed(turn_speed)
            self.motor_left.set_speed(turn_speed)
            self.motor_right.forward()
            self.motor_left.forward()
            self._is_rotating = True
            self._last_rotate_speed = turn_speed
            self._last_rotate_is_right = True
        except Exception as exc:
            _explain_error(exc)
            raise

    def rotate_left(self, turn_speed):
        """
        Rotate robot left (counter-clockwise)

        Args:
            turn_speed: Speed for rotation (0-255)
        """
        _d("AIDriver.rotate_left: speed=", turn_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(_describe_rotation("left", turn_speed))
            except Exception:
                pass
        try:
            steps = max(self.ROTATE_RAMP_MS // 10, 1)
            speed_range = turn_speed - self.MIN_MOTOR_SPEED
            for i in range(steps):
                t = (i + 1) / steps
                s = self.MIN_MOTOR_SPEED + int(speed_range * t)
                self.motor_right.set_speed(s)
                self.motor_left.set_speed(s)
                self.motor_right.backward()
                self.motor_left.backward()
                sleep_ms(10)
            self.motor_right.set_speed(turn_speed)
            self.motor_left.set_speed(turn_speed)
            self.motor_right.backward()
            self.motor_left.backward()
            self._is_rotating = True
            self._last_rotate_speed = turn_speed
            self._last_rotate_is_right = False
        except Exception as exc:
            _explain_error(exc)
            raise

    # ── Gyro-PID closed-loop turns ────────────────────────────────────────
    def _calibrate_gyro_bias(self, samples=100, delay_ms=5):
        """Measure and store the stationary gyro-Z bias (deg/s).

        Even at rest the gyro reports a small non-zero rate. Left uncorrected
        that bias integrates into a large false angle, so it is subtracted
        from every reading during a turn. Keep the robot still while this runs
        (it is called once automatically from __init__).
        """
        if not self.has_gyro:
            return 0.0
        total = 0.0
        n = 0
        for _ in range(samples):
            try:
                total += self.imu.read_gyro_z_dps()
                n += 1
            except Exception:
                pass
            sleep_ms(delay_ms)
        self._gyro_bias_dps = (total / n) if n else 0.0
        _d("Gyro Z bias = {:+.3f} deg/s".format(self._gyro_bias_dps))
        return self._gyro_bias_dps

    def turn_degrees(self, target_deg, direction=None):
        """Rotate on the spot by *target_deg* using a gyro-PID closed loop.

        The integrated gyro angle is driven to ``target_deg`` with a PID
        controller, so the turn is accurate regardless of battery voltage,
        floor friction, or tyre wear — unlike the old timed turns.

        Args:
            target_deg: Magnitude of the turn in degrees (always positive when
                        ``direction`` is given; a negative value with no
                        ``direction`` means turn left/counter-clockwise).
            direction:  "right"/"cw" or "left"/"ccw". If None, the sign of
                        ``target_deg`` chooses (positive = right).

        Returns:
            float: Actual degrees turned (for debugging / logging).

        Raises:
            RuntimeError: if no gyro is available.
        """
        if not self.has_gyro:
            raise RuntimeError(
                "turn_degrees needs the LSM6DS3 gyro, but none was initialised. "
                "Check the IMU wiring (GP16/GP17) and address."
            )

        target = abs(target_deg)
        if direction is None:
            is_right = target_deg >= 0
        else:
            is_right = str(direction).lower()[0] == "r"

        if eventlog is not None:
            try:
                eventlog.log_event(
                    "Gyro turn {} {:.0f} deg".format(
                        "right" if is_right else "left", target
                    )
                )
            except Exception:
                pass

        heading = 0.0
        integral = 0.0
        prev_error = target
        settle = 0
        last_ms = ticks_ms()
        start_ms = last_ms

        try:
            while True:
                gz = self.imu.read_gyro_z_dps() - self._gyro_bias_dps

                now = ticks_ms()
                dt = ticks_diff(now, last_ms) / 1000.0
                if dt <= 0:
                    dt = 0.001
                last_ms = now

                heading += abs(gz) * dt
                error = target - heading

                # Stop once we have settled inside the tolerance band.
                if abs(error) <= self.turn_tolerance:
                    settle += 1
                    if settle >= 2:
                        break
                else:
                    settle = 0

                # Safety timeout so a wiring/stall fault cannot spin forever.
                if ticks_diff(now, start_ms) > self.turn_timeout_ms:
                    _d("turn_degrees: timeout, stopping early")
                    break

                # PID → wheel-speed magnitude.
                integral += error * dt
                derivative = (error - prev_error) / dt
                prev_error = error
                output = (
                    self.turn_Kp * error
                    + self.turn_Ki * integral
                    + self.turn_Kd * derivative
                )

                speed = int(output)
                if speed < self.MIN_MOTOR_SPEED:
                    speed = self.MIN_MOTOR_SPEED
                if speed > self.turn_max_speed:
                    speed = self.turn_max_speed

                self.motor_right.set_speed(speed)
                self.motor_left.set_speed(speed)
                if is_right:
                    self.motor_right.forward()
                    self.motor_left.forward()
                else:
                    self.motor_right.backward()
                    self.motor_left.backward()

                sleep_ms(5)
        except Exception as exc:
            _explain_error(exc)
            raise
        finally:
            # Hard stop — the loop drove the motors directly, so clear state.
            self._is_rotating = False
            self.motor_right.stop()
            self.motor_left.stop()

        _d("turn_degrees: target={:.0f} actual={:.1f} deg".format(target, heading))
        return heading

    def turn_90(self, direction):
        """Turn 90° in *direction* ("left" or "right") using the gyro PID."""
        return self.turn_degrees(90, direction)

    def turn_180(self, direction):
        """Turn 180° in *direction* ("left" or "right") using the gyro PID."""
        return self.turn_degrees(180, direction)

    def read_gyro_z_dps(self):
        """Return the bias-corrected gyro Z yaw rate in deg/s.

        Mirrors the simulator API so the same learner code runs on both. A
        positive value is a clockwise/right rotation. Returns 0.0 when no gyro
        is available rather than raising, so polling code degrades gracefully.
        """
        if not self.has_gyro:
            return 0.0
        try:
            return self.imu.read_gyro_z_dps() - self._gyro_bias_dps
        except Exception:
            return 0.0

    # ── Colour sensor (TCS34725) ──────────────────────────────────────────
    def _on_color_int(self, pin):
        """Pin IRQ handler — runs when the colour sensor INT line drops.

        Kept tiny (just sets a flag) as required for MicroPython interrupt
        handlers. The flag is consumed and the device latch is cleared in
        ``color_detected()`` from normal (non-interrupt) code.
        """
        self._color_flag = True

    def read_color(self):
        """Return the raw (red, green, blue, clear) colour-sensor counts.

        Each value is a 16-bit channel count. ``clear`` is overall brightness.
        Returns ``(0, 0, 0, 0)`` when no colour sensor is available so polling
        code degrades gracefully instead of raising.
        """
        if not self.has_color:
            return (0, 0, 0, 0)
        try:
            rgbc = self.color.read_rgbc()
            _d("read_color: r={} g={} b={} c={}".format(*rgbc))
            return rgbc
        except Exception as exc:
            _d("read_color error:", type(exc).__name__, str(exc))
            return (0, 0, 0, 0)

    def classify_color(self):
        """Classify the floor under the sensor as a marker colour.

        Uses the student-tunable thresholds (``color_min_clear``,
        ``color_red_ratio``, ``color_green_ratio``, ``color_silver_clear``) so
        the same logic runs in the simulator and on the robot.

        Returns one of ``"black"``, ``"red"``, ``"green"``, ``"silver"`` or
        ``"none"``.  ``"black"`` marks a no-go area: black absorbs the LED so the
        clear channel reads *below* the plain floor.  Black is checked first and
        is disabled while ``color_black_clear`` is 0.
        """
        r, g, b, c = self.read_color()

        # Darker than the floor → BLACK no-go area (absorbs the sensor LED).
        if self.color_black_clear > 0 and c < self.color_black_clear:
            return "black"

        # Too dark / nothing bright under the sensor → plain floor.
        if c < self.color_min_clear:
            return "none"

        total = r + g + b
        if total <= 0:
            return "none"

        red_fraction = r / total
        green_fraction = g / total

        # Reflective silver/white: very bright AND roughly balanced channels
        # (no single colour dominates).
        if (
            c >= self.color_silver_clear
            and red_fraction < self.color_red_ratio
            and green_fraction < self.color_green_ratio
        ):
            return "silver"
        if red_fraction >= self.color_red_ratio:
            return "red"
        if green_fraction >= self.color_green_ratio:
            return "green"
        return "none"

    def color_detected(self):
        """Return True if the colour interrupt has fired since the last call.

        The TCS34725 asserts its INT line when the robot rolls onto a bright
        marker; the IRQ handler sets a flag that this method consumes (and then
        clears the device latch so the next marker can fire). Pair it with
        ``classify_color()`` to decide which colour was seen.
        """
        if not self.has_color:
            return False
        flag = self._color_flag
        self._color_flag = False
        if flag:
            try:
                self.color.clear_interrupt()
            except Exception:
                pass
        return flag

    def clear_color_interrupt(self):
        """Manually clear a latched colour interrupt (rarely needed)."""
        self._color_flag = False
        if self.has_color:
            try:
                self.color.clear_interrupt()
            except Exception:
                pass

    # Minimum reliable motor speed - motors stutter below this due to undervoltage.
    # 120 is the empirically measured dead-zone threshold for the L298N at typical
    # operating voltages. DO NOT lower this: values 100-119 pass the guard but
    # produce erratic behaviour (stall, stutter) that corrupts PID corrections.
    MIN_MOTOR_SPEED = 120

    # Duration (ms) of the acceleration/deceleration ramp applied inside
    # rotate_right() and rotate_left() (ramp-up) and brake() after a rotation
    # (ramp-down).  80 ms = 8 × 10 ms steps.  Increase for heavier robots or
    # lower supply voltages; decrease if turns feel sluggish to start.
    ROTATE_RAMP_MS = 80

    def drive(self, right_speed, left_speed):
        """
        Drive robot with signed speeds for PID control.

        This is a convenience method for control loops where positive speeds
        mean forward and negative speeds mean backward. It handles the
        direction logic and motor dead zone internally.

        Dead Zone Handling:
            Motors don't work reliably below speed 120. This method applies:
            - If |speed| < MIN_MOTOR_SPEED: that wheel stops (speed too low)
            - If |speed| >= MIN_MOTOR_SPEED: wheel drives at requested speed

        Args:
            right_speed: Speed for right wheel (-255 to 255)
                         Positive = forward, Negative = backward
            left_speed: Speed for left wheel (-255 to 255)
                        Positive = forward, Negative = backward

        Example for PID control::

            # Simple - just call drive with signed speeds
            my_robot.drive(speed, speed)

            # For wall following with differential steering:
            my_robot.drive(BASE_SPEED + correction, BASE_SPEED - correction)
        """
        # Clamp speeds to valid range
        right_speed = max(-255, min(255, int(right_speed)))
        left_speed = max(-255, min(255, int(left_speed)))

        # Apply dead zone: speeds below MIN_MOTOR_SPEED don't work reliably
        if abs(right_speed) < self.MIN_MOTOR_SPEED:
            right_speed = 0
        if abs(left_speed) < self.MIN_MOTOR_SPEED:
            left_speed = 0

        _d("AIDriver.drive: R=", right_speed, "L=", left_speed)

        # If both speeds are zero, brake
        if right_speed == 0 and left_speed == 0:
            self.brake()
            return

        # Handle right motor
        if right_speed > 0:
            self.motor_right.set_speed(right_speed)
            self.motor_right.backward()  # backward() = forward motion for right wheel
        elif right_speed < 0:
            self.motor_right.set_speed(abs(right_speed))
            self.motor_right.forward()  # forward() = backward motion for right wheel
        else:
            self.motor_right.stop()

        # Handle left motor
        if left_speed > 0:
            self.motor_left.set_speed(left_speed)
            self.motor_left.forward()  # forward() = forward motion for left wheel
        elif left_speed < 0:
            self.motor_left.set_speed(abs(left_speed))
            self.motor_left.backward()  # backward() = backward motion for left wheel
        else:
            self.motor_left.stop()

        # Log the movement
        if eventlog is not None:
            try:
                if right_speed >= 0 and left_speed >= 0:
                    direction = "forward"
                elif right_speed <= 0 and left_speed <= 0:
                    direction = "backward"
                else:
                    direction = "mixed"
                eventlog.log_event(
                    "drive {} R={}, L={}".format(direction, right_speed, left_speed)
                )
            except Exception:
                pass

    def set_motor_speeds(self, right_speed, left_speed):
        """
        Set individual motor speeds without changing direction

        Args:
            right_speed: Speed for right motor (0-255)
            left_speed: Speed for left motor (0-255)
        """
        _d("AIDriver.set_motor_speeds: R=", right_speed, "L=", left_speed)
        try:
            self.motor_right.set_speed(right_speed)
            self.motor_left.set_speed(left_speed)
        except Exception as exc:
            _explain_error(exc)
            raise

    def get_motor_speeds(self):
        """
        Get current motor speeds

        Returns:
            Tuple of (right_speed, left_speed)
        """
        speeds = (self.motor_right.get_speed(), self.motor_left.get_speed())
        _d("AIDriver.get_motor_speeds:", speeds)
        return speeds

    def is_moving(self):
        """
        Check if robot is moving

        Returns:
            True if either motor is moving
        """
        moving = self.motor_right.is_moving() or self.motor_left.is_moving()
        _d("AIDriver.is_moving:", moving)
        return moving

    # ── OLED status display ───────────────────────────────────────────────
    # All four methods are safe to call whether or not the OLED is attached.
    # When self.has_display is False they only cache the text (so unit tests
    # and the simulator can still inspect what *would* have been shown) and
    # return without touching any hardware.

    def show_display(self, line1="", line2="", line3="", line4=""):
        """Show up to four text lines on the OLED.

        Caches the lines on self._display_lines regardless of hardware so the
        last-shown text can be inspected. No-op on hardware if no OLED.

        Args:
            line1..line4: Strings to render top-to-bottom (extra text clipped).
        """
        lines = [str(line1), str(line2), str(line3), str(line4)]
        self._display_lines = lines
        _d("AIDriver.show_display:", lines)
        if not self.has_display or self.display is None:
            return
        try:
            self.display.fill(0)
            row = 0
            for text in lines:
                if text:
                    self.display.text(text[:16], 0, row)
                row += 16
            self.display.show()
        except Exception as exc:
            _d("show_display failed:", type(exc).__name__, str(exc))

    def display_status(self, state, score=0, victims=0):
        """Show the competition state and running score on the OLED.

        This is the high-level call the maze controller makes every time the
        state changes so handlers and judges can read what the robot is doing.

        Args:
            state: Short state label, e.g. "SEARCH" or "AT VICTIM".
            score: Estimated running score to display.
            victims: Number of victims found so far.
        """
        self.show_display(
            "THS RescueMaze",
            "State:{}".format(str(state)[:9]),
            "Score:{}".format(int(score)),
            "Victims:{}".format(int(victims)),
        )

    def clear_display(self):
        """Blank the OLED. No-op when no panel is attached."""
        self._display_lines = ["", "", "", ""]
        _d("AIDriver.clear_display")
        if not self.has_display or self.display is None:
            return
        try:
            self.display.fill(0)
            self.display.show()
        except Exception as exc:
            _d("clear_display failed:", type(exc).__name__, str(exc))

    def deploy_rescue_kit(self):
        """Drop one survival kit on a harmed-victim tile (+10 bonus).

        The servo hardware is not fitted yet, so by default this only logs the
        request and increments the deploy counter. Once kit_servo_pin is wired
        it sweeps the servo to release a kit and returns it to the rest angle.

        Returns:
            True if a kit servo actually actuated, False if it was a no-op.
        """
        self.kit_deploy_count += 1
        _d("AIDriver.deploy_rescue_kit #", self.kit_deploy_count)
        if not self.has_kit or self._kit_servo is None:
            return False
        try:
            # 50 Hz frame = 20 ms period; duty_u16 full scale = 65535.
            # ~1.0 ms pulse (rest) and ~2.0 ms pulse (release).
            self._kit_servo.duty_u16(6553)  # ~2.0 ms — release
            sleep_ms(400)
            self._kit_servo.duty_u16(3277)  # ~1.0 ms — rest
            sleep_ms(200)
            return True
        except Exception as exc:
            _d("deploy_rescue_kit failed:", type(exc).__name__, str(exc))
            return False
