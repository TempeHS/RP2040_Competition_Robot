"""The AIDriver class: unified 2-wheel robot driver with sensors.

Ties together the motor driver (motor.py), the legacy ultrasonic fallback
(ultrasonic.py), and optional Grove ultrasonic / ToF / gyro / colour / OLED
peripherals into a single classroom-friendly API.
"""

from machine import Pin, PWM
from time import sleep_ms, ticks_ms, ticks_diff

try:
    from machine import SoftI2C
except Exception:
    SoftI2C = None

try:
    from grove_ultrasonic import GroveUltrasonic
except Exception:
    GroveUltrasonic = None

try:
    from vl53l0x import VL53L0X
except Exception:
    VL53L0X = None

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

from . import _d, _explain_error, _log_event, _start_pwm_heartbeat
from ._messages import _describe_drive, _describe_rotation
from .motor import L298N
from .ultrasonic import UltrasonicSensor

# Any I2C scan finding more addresses than this is a phantom (a stuck/floating
# SDA or SCL line ACKing every address), not a real device - matches the same
# cutoff used by i2c_scanner.is_real_hit().
_I2C_PHANTOM_MAX_ADDRS = 8

# Consecutive missed readings before a distance sensor is reported as absent.
# A single dropped reading is usually noise; five in a row means it's unplugged.
_SENSOR_FAIL_THRESHOLD = 5


def _i2c_prescan(i2c, expected_addr, label):
    """Scan an I2C bus and report whether ``expected_addr`` answers.

    Always prints (regardless of DEBUG_AIDRIVER) so wiring/power problems are
    visible BEFORE a sensor driver constructor runs and potentially raises a
    less helpful error.

    Returns:
        bool: True only when the expected device is present and the bus is
              not a floating-line phantom (every address ACKing).
    """
    try:
        found = i2c.scan()
    except Exception as exc:
        print("[AIDriver] {} pre-scan failed: {}".format(label, exc))
        return False

    if len(found) > _I2C_PHANTOM_MAX_ADDRS:
        print(
            "[AIDriver] {} pre-scan: {} addresses ACKed - floating bus "
            "(missing pull-ups?), ignored.".format(label, len(found))
        )
        return False

    if expected_addr in found:
        print("[AIDriver] {} pre-scan: found 0x{:02X}.".format(label, expected_addr))
        return True

    if found:
        print(
            "[AIDriver] {} pre-scan: 0x{:02X} not found (saw {}).".format(
                label,
                expected_addr,
                ", ".join("0x%02X" % a for a in found),
            )
        )
    else:
        print("[AIDriver] {} pre-scan: no ACK - check wiring/power.".format(label))
    return False


class AIDriver:
    """
    Unified robot driver class with L298NH motor control and ultrasonic sensors.

    By default, AIDriver uses Grove single-pin ultrasonic sensors via
    GroveUltrasonic when available. The legacy HC-SR04 UltrasonicSensor class
    remains available (see ultrasonic.py) and is used as an automatic fallback.

    The L298NH requires L298N channels to be called simultaneously.
    """

    def __init__(
        self,
        wall_side,  # Required: "left" or "right" — which wall the robot follows
        distance_sensor="ultrasonic",  # "ultrasonic" (default) or "tof" (VL53L0X)
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
        tof_front_sda=29,  # GP29 (A3) — front ToF dedicated SoftI2C SDA
        tof_front_scl=28,  # GP28 (A2) — front ToF dedicated SoftI2C SCL
        tof_side_sda=6,  # GP6 (D6) — side ToF dedicated SoftI2C SDA
        tof_side_scl=5,  # GP5 (D5) — side ToF dedicated SoftI2C SCL
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
            distance_sensor: Distance backend — "ultrasonic" (default) or "tof".
                       "ultrasonic": trig_pin/trig_pin_2 drive HC-SR04/Grove
                                     ultrasonic sensors (existing behaviour).
                       "tof":        VL53L0X Time-of-Flight sensors. Each sensor
                                     runs on its own dedicated SoftI2C bus at
                                     address 0x29 with no XSHUT:
                                       front = tof_front_sda/scl (GP29/GP28 = A3/A2)
                                       side  = tof_side_sda/scl  (GP6/GP5 = D6/D5)
                                     Example:
                                         AIDriver("left", "tof")
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

        # Initialize the distance sensing backend: ultrasonic OR time-of-flight.
        # "tof" re-purposes the two ultrasonic SIG pins (trig_pin, trig_pin_2)
        # as the VL53L0X XSHUT reset lines — no other pins change.
        self.distance_sensor = str(distance_sensor).strip().lower()
        if self.distance_sensor not in ("ultrasonic", "tof"):
            self.distance_sensor = "ultrasonic"

        # Attributes exist in every mode so callers can test them safely.
        self.ultrasonic_1 = None
        self.ultrasonic_2 = None
        self.tof_1 = None
        self.tof_2 = None
        self.has_tof = False

        if self.distance_sensor == "tof":
            # ToF mode: BOTH sensors run on their own dedicated SoftI2C bus, so
            # each can stay at the VL53L0X default address 0x29 with no XSHUT.
            # Front = tof_front_sda/scl (default GP29/GP28 = A3/A2),
            # Side  = tof_side_sda/scl  (default GP6/GP5).
            self._init_tof_sensors(
                front_sda=tof_front_sda,
                front_scl=tof_front_scl,
                side_sda=tof_side_sda,
                side_scl=tof_side_scl,
            )
        else:
            self._init_ultrasonic_sensors(
                ultrasonic_mode=ultrasonic_mode,
                trig_pin=trig_pin,
                echo_pin=echo_pin,
                trig_pin_2=trig_pin_2,
                echo_pin_2=echo_pin_2,
            )

        _d("AIDriver initialized - debug logging active")

        # Live sensor-health tracking, used by system_check()/display_status():
        #   - ToF: fixed here by whether the sensor answered its I2C address
        #     (see _init_tof_sensors) - never re-evaluated on later reads, so
        #     a good sensor facing open space isn't mistaken for a fault.
        #   - Ultrasonic: front_ok/side_ok flip to False after
        #     _SENSOR_FAIL_THRESHOLD (5) consecutive -1 reads, and flip back
        #     to True on the very next good reading (see _note_sensor_result).
        self._front_fail_count = 0
        self._side_fail_count = 0
        if self.distance_sensor == "tof":
            self.front_ok = self.tof_1 is not None
            self.side_ok = self.tof_2 is not None
        else:
            self.front_ok = True
            self.side_ok = True

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
        self.turn_max_speed = 240  # clamp on turn wheel speed
        self.turn_min_speed = 190  # slowest spin that still rotates the robot
        self.turn_timeout_ms = 4000  # safety: abort a turn after this long

        # Turn mechanics measured on the reference chassis. A standing pivot
        # will not start at turn_min_speed, and the robot keeps rolling after
        # power is cut, so the loop kicks to start and brakes early to stop.
        self.turn_kick_speed = 255  # burst that breaks static friction
        self.turn_kick_ms = 80  # how long that burst lasts
        self.turn_coast_time = 0.03  # seconds of rotation after power is cut
        self.turn_settle_ms = 300  # coast measurement window before correcting

        # Correction pulses. The motors stall below MIN_MOTOR_SPEED, so the
        # last few degrees are closed with short bursts, not by driving slower.
        self.turn_nudge_speed = 220
        self.turn_nudge_ms_per_deg = 4
        self.turn_nudge_min_ms = 25
        self.turn_nudge_max_ms = 250
        self.turn_max_nudges = 6
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
                    sda=Pin(display_sda, Pin.OPEN_DRAIN, Pin.PULL_UP),
                    scl=Pin(display_scl, Pin.OPEN_DRAIN, Pin.PULL_UP),
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

        # ── Startup system check ──────────────────────────────────────────
        # Always prints a PASS/FAIL summary to serial and (if fitted) the OLED
        # so wiring problems are visible immediately, without DEBUG_AIDRIVER.
        self.system_check()

        # Start PWM-based heartbeat - runs entirely in hardware
        # with zero CPU interrupts or impact on motor control.
        _start_pwm_heartbeat()

    def _init_ultrasonic_sensors(
        self, ultrasonic_mode, trig_pin, echo_pin, trig_pin_2, echo_pin_2
    ):
        """Set up the two ultrasonic distance sensors (default backend).

        Preferred: Grove single-pin driver (SIG). Fallback: legacy HC-SR04.
        """
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

    def _init_tof_sensors(self, front_sda, front_scl, side_sda, side_scl):
        """Set up the front (and optional side) VL53L0X Time-of-Flight sensors.

        Each sensor lives on its OWN dedicated SoftI2C bus, so both can stay at
        the VL53L0X default address 0x29 with no XSHUT juggling. This matches the
        wiring confirmed by the pin-finder scan:
            Front: SDA=GP29 (A3), SCL=GP28 (A2)
            Side:  SDA=GP6 (D6),  SCL=GP5 (D5)
            Both:  VIN=3V3, GND=GND

        Args:
            front_sda/front_scl: dedicated SoftI2C pins for the front ToF
                                 (defaults GP29/GP28 = A3/A2).
            side_sda/side_scl: dedicated SoftI2C pins for the side ToF
                               (defaults GP6/GP5 = D6/D5).
        """
        if VL53L0X is None or SoftI2C is None:
            _d(
                "ToF requested but vl53l0x/SoftI2C module unavailable —",
                "distance readings will return -1.",
            )
            return

        # --- Front ToF: dedicated bus, default 0x29, no XSHUT -------------
        try:
            front_sda_pin = Pin(front_sda, Pin.OPEN_DRAIN, Pin.PULL_UP)
            front_scl_pin = Pin(front_scl, Pin.OPEN_DRAIN, Pin.PULL_UP)
            front_i2c = SoftI2C(scl=front_scl_pin, sda=front_sda_pin, freq=400_000)
            front_label = "Front ToF GP{}/GP{}".format(front_sda, front_scl)
            if _i2c_prescan(front_i2c, 0x29, front_label):
                self.tof_1 = VL53L0X(front_i2c)  # stays on default 0x29 (own bus)
                self.tof_1.start()
                _d("Front ToF OK on GP{}/GP{} @ 0x29".format(front_sda, front_scl))
            else:
                self.tof_1 = None
        except Exception as exc:
            self.tof_1 = None
            _d(
                "Front ToF init failed:",
                type(exc).__name__,
                str(exc),
                "– check GP{}/GP{} wiring and 3V3 power.".format(front_sda, front_scl),
            )

        # --- Side ToF (optional): dedicated bus, default 0x29, no XSHUT ---
        # On its own bus it can share 0x29 with the front sensor with no clash.
        # If no side sensor is fitted this fails softly and read_distance_2()
        # returns -1.
        try:
            side_sda_pin = Pin(side_sda, Pin.OPEN_DRAIN, Pin.PULL_UP)
            side_scl_pin = Pin(side_scl, Pin.OPEN_DRAIN, Pin.PULL_UP)
            side_i2c = SoftI2C(scl=side_scl_pin, sda=side_sda_pin, freq=400_000)
            side_label = "Side ToF GP{}/GP{}".format(side_sda, side_scl)
            if _i2c_prescan(side_i2c, 0x29, side_label):
                self.tof_2 = VL53L0X(side_i2c)  # stays on default 0x29 (own bus)
                self.tof_2.start()
                _d("Side ToF OK on GP{}/GP{} @ 0x29".format(side_sda, side_scl))
            else:
                self.tof_2 = None
        except Exception as exc:
            self.tof_2 = None
            _d(
                "Side ToF init failed:",
                type(exc).__name__,
                str(exc),
                "– check GP{}/GP{} wiring and 3V3 power.".format(side_sda, side_scl),
            )

        self.has_tof = self.tof_1 is not None

    def _note_sensor_result(self, which, ok):
        """Roll an ultrasonic distance-sensor read result into front_ok/side_ok.

        ToF health isn't tracked here — it's fixed at init by whether the
        VL53L0X answered its I2C address (see _init_tof_sensors). For
        ultrasonic, only flips ``*_ok`` to False after
        ``_SENSOR_FAIL_THRESHOLD`` (5) consecutive -1 reads; any good reading
        immediately clears it back to True.

        Args:
            which: "front" or "side".
            ok: True if the reading just taken was valid (not -1).
        """
        count_attr = "_front_fail_count" if which == "front" else "_side_fail_count"
        ok_attr = "front_ok" if which == "front" else "side_ok"
        if ok:
            setattr(self, count_attr, 0)
            setattr(self, ok_attr, True)
            return
        count = getattr(self, count_attr) + 1
        setattr(self, count_attr, count)
        if count >= _SENSOR_FAIL_THRESHOLD:
            setattr(self, ok_attr, False)

    def read_distance(self):
        """
        Read distance from front distance sensor 1.

        Works for both backends: ultrasonic (HC-SR04/Grove) or ToF (VL53L0X),
        selected by the ``distance_sensor`` constructor argument.

        Returns:
            Distance in millimeters, or -1 if invalid reading.
        """
        if self.distance_sensor == "tof":
            # front_ok is fixed at init by I2C address discovery, not by
            # per-read timeouts, so a good sensor facing open space never
            # gets misreported as an error.
            if self.tof_1 is None:
                return -1
            try:
                distance_mm = self.tof_1.read()
            except Exception as exc:
                _d("read_distance (ToF) error:", type(exc).__name__, str(exc))
                distance_mm = -1
            if distance_mm == -1:
                return -1
            _d("read_distance (ToF):", distance_mm, "mm")
            return int(distance_mm)

        distance_mm = self.ultrasonic_1.read_distance_mm()
        self._note_sensor_result("front", distance_mm != -1)
        if distance_mm == -1:
            # Don't print debug here - inline warning handles user feedback
            return -1
        _d("read_distance:", distance_mm, "mm")
        return int(distance_mm)

    def read_distance_2(self):
        """
        Read distance from side distance sensor 2.

        Works for both backends: ultrasonic (HC-SR04/Grove) or ToF (VL53L0X),
        selected by the ``distance_sensor`` constructor argument.

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

        if self.distance_sensor == "tof":
            # side_ok is fixed at init by I2C address discovery, not by
            # per-read timeouts — see the matching note in read_distance().
            if self.tof_2 is None:
                return -1
            try:
                distance_mm = self.tof_2.read()
            except Exception as exc:
                _d("read_distance_2 (ToF) error:", type(exc).__name__, str(exc))
                distance_mm = -1
            if distance_mm == -1:
                return -1
            _d("read_distance_2 (ToF):", distance_mm, "mm", "dt:", self.dt, "s")
            return int(distance_mm)

        distance_mm = self.ultrasonic_2.read_distance_mm()
        self._note_sensor_result("side", distance_mm != -1)
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
        _log_event("Brake applied; motors stopping")
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
        kept as a stable extension point so a control loop can invoke it
        every loop without needing to know whether housekeeping is
        currently required.
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
        _log_event(
            _describe_drive("Drive forward", right_wheel_speed, left_wheel_speed)
        )
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
        _log_event(
            _describe_drive("Drive backward", right_wheel_speed, left_wheel_speed)
        )
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
        _log_event(_describe_rotation("right", turn_speed))
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
        _log_event(_describe_rotation("left", turn_speed))
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
                        ``direction`` is given). When ``direction`` is None,
                        the sign is relative to ``wall_side`` so a positive
                        angle always turns AWAY from the wall you follow and a
                        negative angle turns TOWARD it:
                          - ``wall_side="left"``  (wall_sign=-1): +90 -> right,
                            -90 -> left.
                          - ``wall_side="right"`` (wall_sign=+1): +90 -> left,
                            -90 -> right.
            direction:  "right"/"cw" or "left"/"ccw". Overrides the sign-based
                        rule above and always means that literal direction.

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
            is_right = (target_deg >= 0) if self.wall_sign < 0 else (target_deg < 0)
        else:
            is_right = str(direction).lower()[0] == "r"

        _log_event(
            "Gyro turn {} {:.0f} deg".format("right" if is_right else "left", target)
        )

        heading = 0.0
        integral = 0.0
        last_ms = ticks_ms()

        try:
            # ── Phase 1: kick ────────────────────────────────────────────
            # A standing pivot will not start at turn_min_speed. The burst also
            # reveals which sign this IMU reports for this rotation, so an
            # inverted mounting cannot make the controller run away.
            self._spin_in_place(is_right, self.turn_kick_speed)
            raw_sum = 0.0
            kick_start = last_ms
            while ticks_diff(ticks_ms(), kick_start) < self.turn_kick_ms:
                raw = self.imu.read_gyro_z_dps() - self._gyro_bias_dps
                raw_sum += raw
                now = ticks_ms()
                dt = ticks_diff(now, last_ms) / 1000.0
                last_ms = now
                heading += abs(raw) * dt
                sleep_ms(5)
            gyro_sign = -1.0 if raw_sum < 0 else 1.0

            # ── Phase 2: PID cruise with predictive braking ──────────────
            prev_error = target - heading
            start_ms = last_ms
            while True:
                gz = (self.imu.read_gyro_z_dps() - self._gyro_bias_dps) * gyro_sign

                now = ticks_ms()
                dt = ticks_diff(now, last_ms) / 1000.0
                if dt <= 0:
                    dt = 0.001
                last_ms = now

                heading += gz * dt

                # Cut power once the angle we would coast through lands on the
                # target; brake() does not stop the robot dead.
                if heading + (gz * self.turn_coast_time) >= target:
                    break

                # Safety timeout so a wiring/stall fault cannot spin forever.
                if ticks_diff(now, start_ms) > self.turn_timeout_ms:
                    _d("turn_degrees: timeout, stopping early")
                    break

                error = target - heading
                integral += error * dt
                derivative = (error - prev_error) / dt
                prev_error = error
                output = (
                    self.turn_Kp * error
                    + self.turn_Ki * integral
                    + self.turn_Kd * derivative
                )

                speed = int(output)
                if speed < self.turn_min_speed:
                    speed = self.turn_min_speed
                if speed > self.turn_max_speed:
                    speed = self.turn_max_speed

                self._spin_in_place(is_right, speed)
                sleep_ms(5)

            self.motor_right.stop()
            self.motor_left.stop()

            # ── Phase 3: measure the coast, then correct with pulses ─────
            heading, last_ms = self._integrate_coast(
                heading, last_ms, gyro_sign, self.turn_settle_ms
            )
            nudges = 0
            while nudges < self.turn_max_nudges:
                error = target - heading
                if abs(error) <= self.turn_tolerance:
                    break
                pulse_ms = int(self.turn_nudge_ms_per_deg * abs(error))
                if pulse_ms < self.turn_nudge_min_ms:
                    pulse_ms = self.turn_nudge_min_ms
                if pulse_ms > self.turn_nudge_max_ms:
                    pulse_ms = self.turn_nudge_max_ms

                self._spin_in_place(
                    is_right if error > 0 else (not is_right),
                    self.turn_nudge_speed,
                )
                pulse_start = ticks_ms()
                while ticks_diff(ticks_ms(), pulse_start) < pulse_ms:
                    gz = (self.imu.read_gyro_z_dps() - self._gyro_bias_dps) * gyro_sign
                    now = ticks_ms()
                    dt = ticks_diff(now, last_ms) / 1000.0
                    last_ms = now
                    heading += gz * dt
                    sleep_ms(5)

                self.motor_right.stop()
                self.motor_left.stop()
                heading, last_ms = self._integrate_coast(
                    heading, last_ms, gyro_sign, self.turn_settle_ms
                )
                nudges += 1
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

    def _spin_in_place(self, is_right, speed):
        """Counter-rotate the wheels at *speed* to pivot on the spot."""
        self.motor_right.set_speed(speed)
        self.motor_left.set_speed(speed)
        if is_right:
            self.motor_right.forward()
            self.motor_left.forward()
        else:
            self.motor_right.backward()
            self.motor_left.backward()

    def _integrate_coast(self, heading, last_ms, gyro_sign, window_ms):
        """Keep integrating the gyro while the robot coasts after a stop.

        Returns the updated ``(heading, last_ms)`` so the caller knows the true
        angle reached, including the rotation that happened after power was cut.
        """
        window_start = ticks_ms()
        while ticks_diff(ticks_ms(), window_start) < window_ms:
            sleep_ms(10)
            gz = (self.imu.read_gyro_z_dps() - self._gyro_bias_dps) * gyro_sign
            now = ticks_ms()
            dt = ticks_diff(now, last_ms) / 1000.0
            last_ms = now
            heading += gz * dt
        return heading, last_ms

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
        if right_speed >= 0 and left_speed >= 0:
            direction = "forward"
        elif right_speed <= 0 and left_speed <= 0:
            direction = "backward"
        else:
            direction = "mixed"
        _log_event("drive {} R={}, L={}".format(direction, right_speed, left_speed))

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

    def system_check(self, verbose=True):
        """Check every sensor the constructor tried to set up and report it.

        Called automatically at the end of __init__, and safe to call again
        any time (e.g. right before a run) to re-check current sensor health.
        Always prints a PASS/FAIL line per subsystem to serial (regardless of
        DEBUG_AIDRIVER) and mirrors a summary on the OLED when one is fitted.

        Args:
            verbose: When True (default) print the per-subsystem report.

        Returns:
            bool: True only when every configured subsystem checks out.
        """
        # front_ok/side_ok are read-error flags, not presence flags - a False
        # here means "sensor is erroring", which may or may not mean it's
        # unplugged. has_gyro/has_color/has_display are genuine one-time
        # presence checks done at init, so they use a different fail label.
        checks = [
            ("Front sensor", self.front_ok, "ERROR"),
            ("Side sensor", self.side_ok, "ERROR"),
            ("Gyro/IMU", self.has_gyro, "MISSING"),
            ("Colour", self.has_color, "MISSING"),
            ("OLED", self.has_display, "MISSING"),
        ]
        self.system_issues = [name for name, ok, _fail in checks if not ok]
        self.system_ok = not self.system_issues

        if verbose:
            print("[AIDriver] ---- System check ----")
            for name, ok, fail_label in checks:
                print("[AIDriver] {:<12} {}".format(name, "OK" if ok else fail_label))
            if self.system_ok:
                print("[AIDriver] System check: ALL OK")
            else:
                print(
                    "[AIDriver] System check: {} issue(s) -> {}".format(
                        len(self.system_issues), ", ".join(self.system_issues)
                    )
                )

        if self.has_display:
            if self.system_ok:
                self.show_display("System Check", "All systems", "OK!", "")
            else:
                issues = ", ".join(self.system_issues)
                self.show_display("System Check", "ISSUES:", issues[:16], issues[16:32])

        return self.system_ok

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
        """Show the competition state, sensor health and colour on the OLED.

        This is the high-level call the maze controller makes every time the
        state changes. Alongside state/score/victims it always mirrors the
        live front/side sensor health (``front_ok``/``side_ok``, see
        ``system_check()``) and the current floor colour, so the OLED stays a
        useful diagnostic screen even when nothing else prints to serial.

        Args:
            state: Short state label, e.g. "SEARCH" or "AT VICTIM".
            score: Estimated running score to display.
            victims: Number of victims found so far.
        """
        f_status = "OK" if self.front_ok else "ERR"
        s_status = "OK" if self.side_ok else "ERR"
        self.show_display(
            "State:{}".format(str(state)[:9]),
            "F:{} S:{}".format(f_status, s_status),
            "Score:{}".format(int(score)),
            "V:{} C:{}".format(int(victims), self.classify_color()),
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
