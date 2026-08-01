"""
AIDriver MicroPython Library for RP2040
A unified 2-wheel robot library with ultrasonic sensor

Converted from Arduino C++ library by Ben Jones @ Tempe High School
Original licenses maintained: GNU GPL for code, Creative Commons for content

Dependencies: machine, time modules (built into MicroPython)

This package is split into smaller modules for maintainability:
    _messages.py  – event-log sentence builders (pure helpers)
    motor.py      – L298N single-motor driver
    ultrasonic.py – legacy HC-SR04 UltrasonicSensor fallback
    driver.py     – the AIDriver class itself

Everything a caller needs is re-exported here, so existing code such as
``from aidriver import AIDriver, hold_state`` and ``import aidriver`` /
``aidriver.DEBUG_AIDRIVER = True`` keeps working unchanged.
"""

from machine import Pin, PWM
from time import sleep as _sleep

try:
    import eventlog
except Exception:
    eventlog = None


# Global debug flag for AIDriver library. Any module in this package reads it
# live via the _d()/_explain_error() helpers below (both defined in this same
# module), so ``aidriver.DEBUG_AIDRIVER = True`` from student code affects
# every submodule without needing them to re-import the flag.
DEBUG_AIDRIVER = False


# Onboard status LED – use GPIO 25 (Raspberry Pi Pico onboard LED).
# GPIO 13 cannot be used here because it is the left-motor direction pin.
# Using PWM for heartbeat - runs entirely in hardware with zero CPU impact.
_STATUS_LED_PIN = 25
_STATUS_LED_PWM = None  # Initialized lazily in AIDriver.__init__()


# Internal state for non-blocking heartbeat timing (legacy, kept for compatibility)
_last_heartbeat_ms = 0


def _d(*args):
    """Internal debug logger for the AIDriver library.

    When DEBUG_AIDRIVER is True, messages are printed with an [AIDriver] prefix.
    This is intended for teachers or advanced students diagnosing issues.
    """
    if DEBUG_AIDRIVER:
        print("[AIDriver]", *args)


def _log_event(message):
    """Best-effort write to the event log.

    Centralised here (rather than repeated at every call site) so tests can
    monkeypatch a single ``aidriver.eventlog`` and have every submodule pick
    it up, and so a missing/broken log module never breaks student code.
    """
    if eventlog is not None:
        try:
            eventlog.log_event(message)
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

    if seconds_float == 1:
        msg = "Robot holding state for 1 second"
    else:
        msg = "Robot holding state for {:.2f} second(s)".format(seconds_float)
    _log_event(msg)

    _d("hold_state:", seconds_float, "second(s)")
    _sleep(seconds_float)


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


def _led_heartbeat_ok():
    """Legacy function - heartbeat is now automatic via PWM.

    The onboard LED now blinks automatically using hardware PWM when
    AIDriver is instantiated. This function is kept for compatibility
    but does nothing.
    """
    pass


from .motor import L298N
from .ultrasonic import UltrasonicSensor
from .driver import AIDriver
