import sys
import types
from pathlib import Path
import time as _time
import importlib.util

import pytest

# These host tests live alongside the repo (top-level tests/), while the robot
# code they exercise lives in project/ and project/lib. Make all of them
# importable: REPO_ROOT for `import project.main`, PROJECT_DIR/LIB_DIR for the
# MicroPython-style libraries, and TESTS_DIR for test-only helpers (hcsr04).
TESTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TESTS_DIR.parent
PROJECT_DIR = REPO_ROOT / "project"
LIB_DIR = PROJECT_DIR / "lib"

for _path in (REPO_ROOT, PROJECT_DIR, LIB_DIR, TESTS_DIR):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

# These files are on-robot diagnostic scripts (run from the Pico), not host
# unit tests. They share the ``test_`` prefix for historical reasons but contain
# no test functions and drive real hardware at import, so keep them out of the
# host pytest run.
collect_ignore = [
    "test_pid_steer_direction.py",
    "test_pid_sensor_noise.py",
    "hardware_full_board_test.py",
]


def _ensure_time_helpers():
    """Provide MicroPython-style helpers on CPython's time module for tests."""
    if not hasattr(_time, "sleep_ms"):

        def sleep_ms(value):
            _time.sleep(value / 1000.0)

        _time.sleep_ms = sleep_ms  # type: ignore[attr-defined]

    if not hasattr(_time, "sleep_us"):

        def sleep_us(value):
            _time.sleep(value / 1_000_000.0)

        _time.sleep_us = sleep_us  # type: ignore[attr-defined]

    if not hasattr(_time, "ticks_ms"):
        start = _time.monotonic()

        def ticks_ms():
            return int((_time.monotonic() - start) * 1000)

        def ticks_diff(current, previous):
            return current - previous

        _time.ticks_ms = ticks_ms  # type: ignore[attr-defined]
        _time.ticks_diff = ticks_diff  # type: ignore[attr-defined]


def _install_machine_stub():
    """Install a lightweight stub of the MicroPython `machine` module."""
    if "machine" in sys.modules:
        return

    module = types.ModuleType("machine")

    class Pin:
        IN = 0
        OUT = 1
        PULL_UP = 2
        PULL_DOWN = 3

        def __init__(self, pin_id, mode=None, pull=None):
            self.id = pin_id
            self.mode = mode
            self.pull = pull
            self._value = 1

        def on(self):
            self._value = 1

        def off(self):
            self._value = 0

        def toggle(self):
            self._value ^= 1

        def value(self, val=None):
            if val is None:
                return self._value
            self._value = val
            return self._value

    class PWM:
        def __init__(self, pin):
            self.pin = pin
            self.frequency = 0
            self.duty = 0

        def freq(self, value):
            self.frequency = value

        def duty_u16(self, value):
            self.duty = value

    class UART:
        def __init__(self, *args, **kwargs):
            self.buffer = bytearray()

        def feed(self, data):
            self.buffer.extend(data)

        def any(self):
            return len(self.buffer)

        def read(self, size):
            if not self.buffer:
                return None
            byte = bytes([self.buffer[0]])
            self.buffer = self.buffer[1:]
            return byte

    def time_pulse_us(pin, level, timeout=0):
        # Return a fixed duration for deterministic tests.
        return 1000

    module.Pin = Pin
    module.PWM = PWM
    module.UART = UART
    module.time_pulse_us = time_pulse_us

    sys.modules["machine"] = module


_ensure_time_helpers()
_install_machine_stub()


class StopChallenge(Exception):
    pass


@pytest.fixture
def fake_clock():
    class Clock:
        time_ms = 0
        holds = 0
        limit = 100

        def __init__(self):
            self.calls = []

        def hold_state(self, seconds):
            self.calls.append(("hold", seconds))
            self.time_ms += round(seconds * 1000)
            self.holds += 1
            if self.holds >= self.limit:
                raise StopChallenge()

        def ticks_ms(self):
            return self.time_ms & 0x3FFFFFFF

        @staticmethod
        def ticks_diff(current, previous):
            return ((current - previous + 0x20000000) & 0x3FFFFFFF) - 0x20000000

    return Clock()


@pytest.fixture
def isolated_config(monkeypatch):
    spec = importlib.util.spec_from_file_location(
        "config", PROJECT_DIR.parent / "tests/test-config.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setitem(sys.modules, "config", module)
    return module


@pytest.fixture
def recording_robot(fake_clock):
    class Robot:
        MIN_MOTOR_SPEED = 120
        calls = fake_clock.calls
        instances = []
        readings = {}
        samples = 0

        def __init__(self, wall_side, **kwargs):
            self.wall_sign = -1 if wall_side == "left" else 1
            self.min_approach_speed = kwargs.get("min_approach_speed", 130)
            self.speeds = (0, 0)
            self.calls.append(("init", wall_side, kwargs))
            self.instances.append(self)

        @classmethod
        def set_readings(cls, sensor, values):
            cls.readings[sensor] = iter(values)

        def sample(self, sensor, default):
            type(self).samples += 1
            if self.samples > 10000:
                raise StopChallenge("Sensor operation budget exhausted")
            values = self.readings.get(sensor)
            value = next(values, default) if values is not None else default
            self.calls.append((sensor, value))
            return value

        def read_distance(self):
            return self.sample("front", 1000)

        def read_distance_2(self):
            return self.sample("side", 100)

        def read_gyro_z_dps(self):
            return self.sample("gyro", (self.speeds[1] - self.speeds[0]) * 0.6)

        def classify_color(self):
            return self.sample("color", "none")

        def color_interrupt_active(self):
            return self.sample("interrupt", False)

        def color_detected(self):
            return self.color_interrupt_active()

        def read_color(self):
            return self.sample("rgba", (0, 0, 0, 0))

        def drive(self, right, left):
            self.speeds = (right, left)
            self.calls.append(("drive", right, left))

        def steer(self, base, steering, maximum=60):
            self.calls.append(("steer", base, steering, maximum))
            limit = max(0, min(maximum, base - self.MIN_MOTOR_SPEED))
            correction = max(-limit, min(limit, steering))
            self.drive(
                int(base - self.wall_sign * correction),
                int(base + self.wall_sign * correction),
            )
            return self.speeds

        def brake(self):
            self.speeds = (0, 0)
            self.calls.append(("brake",))

        def clear_display(self):
            self.calls.append(("clear_display",))

        def show_display(self, *lines, force=False):
            self.calls.append(("display", lines, force))

        def display_status(self, state, score=None, victims=None):
            self.calls.append(("status", state, score, victims))

        def deploy_rescue_kit(self):
            self.calls.append(("kit",))
            return False

        def turn_90(self, direction):
            self.calls.append(("turn_90", direction))

    return Robot


@pytest.fixture
def challenge_loader(monkeypatch, isolated_config, recording_robot, fake_clock):
    aidriver_module = types.ModuleType("aidriver")
    aidriver_module.AIDriver = recording_robot
    aidriver_module.hold_state = fake_clock.hold_state
    aidriver_module.ticks_ms = fake_clock.ticks_ms
    aidriver_module.ticks_diff = fake_clock.ticks_diff
    monkeypatch.setitem(sys.modules, "aidriver", aidriver_module)

    def load(challenge, folder="starter-code"):
        path = REPO_ROOT / "app" / folder / ("challenge-" + str(challenge) + ".py")
        if challenge == "project":
            path = PROJECT_DIR / "main.py"
        spec = importlib.util.spec_from_file_location("challenge_test", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    return load
