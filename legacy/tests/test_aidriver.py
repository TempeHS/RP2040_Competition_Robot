import importlib
import sys
from types import SimpleNamespace

import pytest


def load_aidriver():
    if "aidriver" not in sys.modules:
        importlib.import_module("aidriver")
    return sys.modules["aidriver"]


def _make_robot(monkeypatch):
    module = load_aidriver()
    messages = []

    class DummyEventLog:
        def log_event(self, message):
            messages.append(message)

    monkeypatch.setattr(module, "eventlog", DummyEventLog())
    return module, module.AIDriver("right"), messages


def test_drive_forward_low_speed_logs_warning(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.drive_forward(0, 0)

    assert messages
    assert any("stopped" in msg for msg in messages)


def test_drive_forward_arc_message(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.drive_forward(200, 150)

    assert any("arc toward the right" in msg for msg in messages)


def test_drive_forward_speed_band(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.drive_forward(230, 230)

    assert any("very fast" in msg for msg in messages)


def test_rotate_left_low_speed(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.rotate_left(50)

    assert any("may not turn" in msg for msg in messages)


def test_rotate_right_normal_speed(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.rotate_right(200)

    assert any("on the spot" in msg for msg in messages)


@pytest.mark.parametrize(
    ("raw_rate", "bias", "expected_rate"),
    [(-18.5, 1.5, 20.0), (21.5, 1.5, -20.0), (1.5, 1.5, 0.0)],
    ids=["clockwise", "counter-clockwise", "stationary"],
)
def test_public_gyro_rate_is_clockwise_positive(raw_rate, bias, expected_rate):
    driver = load_aidriver().AIDriver
    robot = driver.__new__(driver)
    robot.has_gyro = True
    robot._gyro_bias_dps = bias
    robot.imu = SimpleNamespace(read_gyro_z_dps=lambda: raw_rate)

    assert robot.read_gyro_z_dps() == pytest.approx(expected_rate)
    assert robot.imu.read_gyro_z_dps() == raw_rate
    assert robot._gyro_bias_dps == bias


def test_public_gyro_rate_preserves_missing_and_failed_sensor_fallbacks():
    driver = load_aidriver().AIDriver
    robot = driver.__new__(driver)
    robot.has_gyro = False
    assert robot.read_gyro_z_dps() == 0.0

    def failed_read():
        raise OSError("IMU read failed")

    robot.has_gyro = True
    robot._gyro_bias_dps = 1.5
    robot.imu = SimpleNamespace(read_gyro_z_dps=failed_read)
    assert robot.read_gyro_z_dps() == 0.0


@pytest.mark.parametrize(
    ("rgbc", "expected_color"),
    [
        ((629, 1094, 1766, 3491), "none"),
        ((51, 59, 89, 191), "black"),
        ((365, 162, 219, 730), "red"),
        ((164, 385, 433, 981), "green"),
        ((805, 1260, 2008, 4070), "silver"),
    ],
    ids=["white-floor", "black", "red", "green", "silver"],
)
def test_recorded_colour_samples_with_measured_thresholds(rgbc, expected_color):
    driver = load_aidriver().AIDriver
    robot = driver.__new__(driver)
    robot.has_color = True
    robot.color = SimpleNamespace(read_rgbc=lambda: rgbc)
    robot.color_min_clear = 300
    robot.color_black_clear = 300
    robot.color_red_ratio = 0.40
    robot.color_green_ratio = 0.35
    robot.color_silver_clear = 3800

    assert robot.classify_color() == expected_color
